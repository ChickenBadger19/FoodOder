import {
  activeConstraints, aggregateNeeds, applySubstitutions, computeShortfall, formatQty, mergeActive, rankProducts, scaleRecipe, resolveItem,
  type ActiveConstraints, type IngredientLine,
  type Item, type MatchContext, type Member, type Product, type RankedProduct, type Shortfall, type Unit,
} from '@foododer/core';
import type { Retailer } from '@foododer/retailers';
import { renderHandoffList } from '@foododer/retailers';
import type { Store, Plan, ListItem } from '../store.js';

export interface OrderLine {
  key: string;
  section: 'recipe' | 'extras';
  itemId: string | null;
  itemName: string;
  needQty: number;
  needUnit: Unit;
  needLabel: string;
  haveLabel: string | null;
  anyApprox: boolean;
  forRecipes: string[];
  chosen: RankedProduct | null;
  alternatives: RankedProduct[];
  qty: number;
  lineTotal: number;
  /** User decisions */
  haveIt: boolean;
  removed: boolean;
  blocked: boolean;
  blockReason: string | null;
  note: string | null;
}

export interface DraftOrder {
  retailer: string;
  retailerName: string;
  eaters: string[];
  constraintsSummary: string[];
  lines: OrderLine[];
  subtotal: number;
  deliveryFee: number;
  minimumOrder: number;
  meetsMinimum: boolean;
  total: number;
  blockers: number;
  handoffList: string;
  planIds: string[];
}

function sumTotals(d: DraftOrder) {
  const live = d.lines.filter(l => !l.removed && !l.haveIt && l.chosen);
  d.subtotal = Math.round(live.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
  d.meetsMinimum = d.subtotal >= d.minimumOrder;
  d.total = Math.round((d.subtotal + d.deliveryFee) * 100) / 100;
  d.blockers = d.lines.filter(l => !l.removed && !l.haveIt && l.blocked).length;
  d.handoffList = renderHandoffList(d.lines.filter(l => !l.removed && !l.haveIt).map(l => ({ name: l.chosen ? l.chosen.product.name : l.itemName, qty: l.qty })));
}

export async function proposeOrder(store: Store, retailer: Retailer, planIds?: string[]): Promise<DraftOrder> {
  const items = await store.items();
  const members = await store.members();
  const subs = await store.substitutions();
  const prefs = await store.prefs();
  const household = await store.setting('household', { defaultServings: 4, ownBrandOk: true, alwaysAskCategories: ['meat'] as string[] });
  const plans = (await store.plans()).filter(p => p.status === 'planned' && (!planIds || planIds.includes(p.id)));
  const recipesById = new Map((await store.recipes()).map(r => [r.id, r]));

  // Everyone who eats at any planned meal contributes their constraints to the shop.
  const eaterIds = new Set(plans.flatMap(p => p.eaterIds));
  const eaters: Member[] = members.filter(m => eaterIds.has(m.id));
  const active = activeConstraints(eaters);

  // Constraints follow the meal, not the whole shop: Sam's gluten rule applies to the meals Sam eats.
  const lineActive = new Map<IngredientLine, ActiveConstraints>();
  const scaled = plans.map(plan => {
    const recipe = recipesById.get(plan.recipeId)!;
    const planEaters = members.filter(m => plan.eaterIds.includes(m.id));
    const planActive = activeConstraints(planEaters);
    const s = scaleRecipe(recipe, plan.servings);
    const lines = applySubstitutions(s.lines, items, subs, planActive);
    for (const l of lines) lineActive.set(l, planActive);
    return { ...s, lines };
  });

  const needs = aggregateNeeds(scaled, items);
  const activeFor = (need: { from: { line: IngredientLine }[] }) => mergeActive(need.from.map(f => lineActive.get(f.line)).filter((a): a is ActiveConstraints => !!a));
  const shortfalls = computeShortfall(needs, await store.stock(), items, activeFor);

  const boughtBefore = new Set<string>();
  for (const o of await retailer.orders()) for (const l of o.lines) boughtBefore.add(l.product.id);
  const ctx = { active, prefs, ownBrandOk: household.ownBrandOk, boughtBefore };

  const lines: OrderLine[] = [];
  for (const sf of shortfalls) {
    if (sf.status === 'in_stock' || sf.status === 'staple') continue;
    const item = sf.item;
    const name = item?.name ?? sf.need.itemName;
    const needActive = activeFor(sf.need);
    const candidates = await searchCandidates(retailer, name, item);
    const ranked = item ? rankProducts(candidates, item, sf.buyQty, sf.unit, { ...ctx, active: needActive }) : [];
    const chosen = ranked.find(r => !r.blocked && !r.weak) ?? null;
    const anyBlocked = ranked.some(r => r.blocked);
    const blocked = !chosen && anyBlocked;
    const blockReason = blocked ? `No verified ${[...needActive.allergens.keys()].join('/')}-free option found at ${retailer.displayName}.` : null;
    const weakOnly = !chosen && !anyBlocked && ranked.length > 0;
    lines.push({
      key: item?.id ?? `name:${name}`,
      section: 'recipe',
      itemId: item?.id ?? null,
      itemName: name,
      needQty: sf.buyQty,
      needUnit: sf.unit,
      needLabel: `need ${formatQty(Math.round(sf.buyQty * 100) / 100, sf.unit)}`,
      haveLabel: sf.haveQty > 0 ? `have ${formatQty(Math.round(sf.haveQty * 100) / 100, sf.unit)}` : null,
      anyApprox: sf.anyApprox,
      forRecipes: [...new Set(sf.need.from.map(f => f.recipeName))],
      chosen,
      alternatives: ranked.filter(r => r !== chosen).slice(0, 5),
      qty: chosen?.plan.packs ?? 1,
      lineTotal: chosen?.lineTotal ?? 0,
      haveIt: false,
      removed: false,
      blocked,
      blockReason,
      note: sf.status === 'unknown_item' ? 'Not in your catalogue yet; matched by name only.'
        : weakOnly ? 'No confident match; pick one of the alternatives or it goes on the paste list by name.'
        : ranked.length === 0 ? 'No product found; will go on the paste list by name.'
        : (item && household.alwaysAskCategories.some(c => item.allergens.includes(c as any)) ? 'You asked to always check this category.' : null),
    });
  }

  // Running list -> extras
  for (const li of (await store.listItems()).filter(l => l.status === 'open')) {
    lines.push(await buildExtrasLine(store, retailer, li, ctx));
  }

  const draft: DraftOrder = {
    retailer: retailer.id,
    retailerName: retailer.displayName,
    eaters: eaters.map(e => e.name),
    constraintsSummary: [...active.allergens].map(([a, s]) => `${a}-free (${s})`),
    lines,
    subtotal: 0,
    deliveryFee: retailer.deliveryFee,
    minimumOrder: retailer.minimumOrder,
    meetsMinimum: false,
    total: 0,
    blockers: 0,
    handoffList: '',
    planIds: plans.map(p => p.id),
  };
  sumTotals(draft);
  return draft;
}

/** Item used for ranking when the running-list text matches nothing in the catalogue yet. */
function adhocItem(text: string): Item {
  return { id: `adhoc:${text.trim().toLowerCase()}`, name: text.trim().toLowerCase(), aliases: [], category: 'household', defaultUnit: 'count', allergens: [], isStaple: false };
}

/** Words in what was said that aren't in the matched item's name ("medium" in "medium freezer bags") steer the product choice. */
function hintWords(text: string, item: Item | null): string[] {
  const itemWords = new Set((item ? [item.name, ...item.aliases] : []).flatMap(n => n.toLowerCase().split(/\s+/)));
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !itemWords.has(w) && !['some', 'the', 'more', 'pack', 'packs'].includes(w));
}

export async function buildExtrasLine(store: Store, retailer: Retailer, li: ListItem, ctx: MatchContext): Promise<OrderLine> {
  const items = await store.items();
  const known = li.itemId ? (await store.item(li.itemId)) ?? null : resolveItem(li.text, items);
  const item = known ?? adhocItem(li.text);
  const candidates = await searchCandidates(retailer, known ? known.name : li.text, known);
  if (known) for (const p of await retailer.search(li.text, 8)) if (!candidates.some(c => c.id === p.id)) candidates.push(p);
  const ranked = rankProducts(candidates, item, li.qty ?? 1, item.defaultUnit === 'count' ? 'count' : item.defaultUnit, { ...ctx, active: activeConstraints([]), preferWords: hintWords(li.text, known) });
  const chosen = ranked.find(r => !r.weak) ?? null;
  const qty = li.qty ?? 1;
  return {
    key: `list:${li.id}`,
    section: 'extras',
    itemId: item.id,
    itemName: known ? known.name : li.text,
    needQty: qty,
    needUnit: 'count',
    needLabel: li.addedVia === 'out_of' ? 'you said you were out' : `"${li.text}"`,
    haveLabel: null,
    anyApprox: false,
    forRecipes: [],
    chosen,
    alternatives: ranked.filter(r => r !== chosen).slice(0, 5),
    qty,
    lineTotal: chosen ? Math.round(chosen.product.price * qty * 100) / 100 : 0,
    haveIt: false,
    removed: false,
    blocked: false,
    blockReason: null,
    note: chosen ? (known ? null : 'New item: it will be remembered once you approve.') : 'No product found; will go on the paste list by name.',
  };
}

/** Add a running-list item to an existing draft (chat while the basket is open). */
export async function appendListLine(store: Store, retailer: Retailer, draft: DraftOrder, li: ListItem): Promise<DraftOrder> {
  const prefs = await store.prefs();
  const household = await store.setting('household', { ownBrandOk: true });
  const boughtBefore = new Set<string>();
  for (const o of await retailer.orders()) for (const l of o.lines) boughtBefore.add(l.product.id);
  const line = await buildExtrasLine(store, retailer, li, { active: activeConstraints([]), prefs, ownBrandOk: household.ownBrandOk, boughtBefore });
  const idx = draft.lines.findIndex(l => l.key === line.key);
  if (idx >= 0) draft.lines[idx] = line; else draft.lines.push(line);
  sumTotals(draft);
  return draft;
}

/** After approval, items that were ad hoc become real catalogue entries so next time they match instantly. */
export async function promoteAdhocItems(store: Store, draft: DraftOrder): Promise<void> {
  for (const l of draft.lines) {
    if (!l.itemId?.startsWith('adhoc:') || !l.chosen || l.removed) continue;
    const name = l.itemId.slice('adhoc:'.length);
    const id = name.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!(await store.item(id))) {
      await store.upsertItem({ id, name, aliases: [], category: 'household', defaultUnit: 'count', allergens: [], isStaple: false });
    }
    l.itemId = id;
  }
}

async function searchCandidates(retailer: Retailer, name: string, item: Item | null): Promise<Product[]> {
  const queries = [name, ...(item?.aliases.slice(0, 2) ?? [])];
  const seen = new Map<string, Product>();
  for (const q of queries) {
    for (const p of await retailer.search(q, 8)) seen.set(p.id, p);
  }
  return [...seen.values()];
}

export function applyLineChange(draft: DraftOrder, key: string, change: { productId?: string; qty?: number; haveIt?: boolean; removed?: boolean }): DraftOrder {
  const line = draft.lines.find(l => l.key === key);
  if (!line) return draft;
  if (change.productId) {
    const pick = [line.chosen, ...line.alternatives].find(r => r?.product.id === change.productId) ?? null;
    if (pick) {
      line.alternatives = [line.chosen, ...line.alternatives].filter((r): r is RankedProduct => !!r && r !== pick);
      line.chosen = pick;
      line.qty = pick.plan.packs;
      line.blocked = pick.blocked;
      line.blockReason = pick.blocked ? `${pick.product.name} ${pick.reasons.join(', ')}` : null;
    }
  }
  if (typeof change.qty === 'number') line.qty = Math.max(1, Math.round(change.qty));
  if (typeof change.haveIt === 'boolean') line.haveIt = change.haveIt;
  if (typeof change.removed === 'boolean') line.removed = change.removed;
  line.lineTotal = line.chosen ? Math.round(line.chosen.product.price * line.qty * 100) / 100 : 0;
  sumTotals(draft);
  return draft;
}

