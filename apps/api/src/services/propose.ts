import {
  activeConstraints, aggregateNeeds, applySubstitutions, computeShortfall, formatQty, rankProducts, scaleRecipe, resolveItem,
  type Item, type Member, type Product, type RankedProduct, type Shortfall, type Unit,
} from '@foododer/core';
import type { Retailer } from '@foododer/retailers';
import { renderHandoffList } from '@foododer/retailers';
import type { Store, Plan } from '../db/index.js';

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
  const items = store.items();
  const members = store.members();
  const subs = store.substitutions();
  const prefs = store.prefs();
  const household = store.setting('household', { defaultServings: 4, ownBrandOk: true, alwaysAskCategories: ['meat'] as string[] });
  const plans = store.plans().filter(p => p.status === 'planned' && (!planIds || planIds.includes(p.id)));

  // Everyone who eats at any planned meal contributes their constraints to the shop.
  const eaterIds = new Set(plans.flatMap(p => p.eaterIds));
  const eaters: Member[] = members.filter(m => eaterIds.has(m.id));
  const active = activeConstraints(eaters);

  const scaled = plans.map(plan => {
    const recipe = store.recipe(plan.recipeId)!;
    const planEaters = members.filter(m => plan.eaterIds.includes(m.id));
    const planActive = activeConstraints(planEaters);
    const s = scaleRecipe(recipe, plan.servings);
    return { ...s, lines: applySubstitutions(s.lines, items, subs, planActive) };
  });

  const needs = aggregateNeeds(scaled, items);
  const shortfalls = computeShortfall(needs, store.stock(), items, active);

  const boughtBefore = new Set<string>();
  for (const o of await retailer.orders()) for (const l of o.lines) boughtBefore.add(l.product.id);
  const ctx = { active, prefs, ownBrandOk: household.ownBrandOk, boughtBefore };

  const lines: OrderLine[] = [];
  for (const sf of shortfalls) {
    if (sf.status === 'in_stock' || sf.status === 'staple') continue;
    const item = sf.item;
    const name = item?.name ?? sf.need.itemName;
    const candidates = await searchCandidates(retailer, name, item);
    const ranked = item ? rankProducts(candidates, item, sf.buyQty, sf.unit, ctx) : [];
    const chosen = ranked.find(r => !r.blocked && !r.weak) ?? null;
    const anyBlocked = ranked.some(r => r.blocked);
    const blocked = !chosen && anyBlocked;
    const blockReason = blocked ? `No verified ${[...active.allergens.keys()].join('/')}-free option found at ${retailer.displayName}.` : null;
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
  for (const li of store.listItems().filter(l => l.status === 'open')) {
    const item = li.itemId ? store.item(li.itemId) ?? null : resolveItem(li.text, items);
    const name = item?.name ?? li.text;
    const candidates = await searchCandidates(retailer, name, item);
    const ranked = item ? rankProducts(candidates, item, li.qty ?? 1, item.defaultUnit === 'count' ? 'count' : item.defaultUnit, { ...ctx, active: activeConstraints([]) }) : [];
    const chosen = ranked.find(r => !r.weak) ?? null;
    lines.push({
      key: `list:${li.id}`,
      section: 'extras',
      itemId: item?.id ?? null,
      itemName: name,
      needQty: li.qty ?? 1,
      needUnit: 'count',
      needLabel: li.addedVia === 'out_of' ? 'you said you were out' : `"${li.text}"`,
      haveLabel: null,
      anyApprox: false,
      forRecipes: [],
      chosen,
      alternatives: ranked.slice(1, 5),
      qty: li.qty ?? 1,
      lineTotal: chosen ? Math.round(chosen.product.price * (li.qty ?? 1) * 100) / 100 : 0,
      haveIt: false,
      removed: false,
      blocked: false,
      blockReason: null,
      note: chosen ? null : 'No product found; will go on the paste list by name.',
    });
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

export function planLabel(p: Plan, store: Store): string {
  return `${store.recipe(p.recipeId)?.name ?? p.recipeId} for ${p.servings}${p.day ? ` on ${p.day}` : ''}`;
}
