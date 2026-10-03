import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z, ZodError } from 'zod';
import {
  activeConstraints, deductCooked, parseAsk, parseIngredient, resolveItem, resolveLines, scaleRecipe, applySubstitutions, formatQty, servingsFor,
  CONSTRAINT_KINDS, type Member, type Recipe, type StockItem,
} from '@foodify/core';
import { MockRetailer, type Retailer } from '@foodify/retailers';
import { Store, newId, type Plan, type ListItem } from './store.js';
import { seed } from './seed.js';
import { applyLineChange, appendListLine, promoteAdhocItems, proposeOrder, type DraftOrder } from './services/propose.js';
import { dateForDay, weekRange } from './services/dates.js';
import { generateRecipe, llmAvailable } from './llm.js';

export interface AppOptions {
  store: Store;
  retailer?: Retailer;
  /** Anthropic API key for recipe generation. Optional: without it, only saved recipes resolve by name. */
  anthropicApiKey?: string;
}

/** Create tables and seed the catalogue (and the demo household when asked) if the database is empty. */
export async function prepareStore(store: Store, opts: { demo?: boolean } = {}): Promise<void> {
  await store.init();
  if (await store.isEmpty()) await seed(store, { demo: opts.demo });
}

/**
 * The Foodify API as a Hono app. Runtime-neutral: the host (Node or Cloudflare Workers) supplies the
 * database driver and serves the PWA's static files; everything under /api lives here.
 */
export function createApp({ store, retailer: retailerOpt, anthropicApiKey }: AppOptions) {
  const retailer: Retailer = retailerOpt ?? new MockRetailer('Tesco (mock)');
  const retailers = new Map<string, Retailer>([[retailer.id, retailer]]);
  const app = new Hono();
  app.use('/api/*', cors());
  app.onError((err, c) => {
    if (err instanceof ZodError) return c.json({ error: 'invalid request', issues: err.issues }, 400);
    console.error(err);
    return c.json({ error: err.message ?? 'internal error' }, 500);
  });

  const currentRetailer = async () => retailers.get(await store.setting('retailer', retailer.id)) ?? retailer;
  const householdDefaults = { defaultServings: 4, ownBrandOk: true, alwaysAskCategories: ['meat'] as string[] };

  /** Add to the running list, merging with an open line for the same item instead of duplicating it. */
  async function addToList(text: string, itemId: string | null, qty: number | null, addedVia: ListItem['addedVia']) {
    const norm = text.trim().toLowerCase();
    const existing = (await store.listItems()).find(l => l.status === 'open' && ((itemId && l.itemId === itemId) || l.text.trim().toLowerCase() === norm));
    if (existing) {
      const merged = { ...existing, qty: qty !== null || existing.qty !== null ? (qty ?? 0) + (existing.qty ?? 0) || null : null, addedVia: addedVia === 'out_of' ? addedVia : existing.addedVia };
      await store.upsertListItem(merged);
      return { item: merged, merged: true };
    }
    const li: ListItem = { id: newId('li_'), text, itemId, qty, addedVia, status: 'open', createdAt: new Date().toISOString() };
    await store.upsertListItem(li);
    return { item: li, merged: false };
  }

  /** "just me and alex" / "without sam" -> member ids. "me" is the household's own member (setting `meMemberId`, else the first). */
  async function resolveEaters(only: string[], except: string[], members: Member[]): Promise<string[]> {
    const meId = (await store.setting<string | null>('meMemberId', null)) ?? members[0]?.id ?? null;
    const find = (n: string) => n === 'me' || n === 'myself' || n === 'i' ? meId : members.find(m => m.name.toLowerCase() === n || m.id === n)?.id ?? null;
    let ids = only.length ? only.map(find).filter((x): x is string => !!x) : members.filter(m => m.eatsByDefault).map(m => m.id);
    if (only.length && ids.length === 0) ids = members.filter(m => m.eatsByDefault).map(m => m.id);
    const ex = new Set(except.map(find).filter(Boolean));
    return ids.filter(id => !ex.has(id));
  }

  /** A list item said in chat should appear on any basket that is still a draft, without a rebuild. */
  async function addLineToOpenDrafts(li: ListItem): Promise<string[]> {
    const ids: string[] = [];
    for (const rec of (await store.orders()).filter(o => o.status === 'draft')) {
      const draft = rec.payload as DraftOrder;
      await appendListLine(store, await currentRetailer(), draft, li);
      await store.upsertOrder({ ...rec, payload: draft });
      ids.push(rec.id);
    }
    return ids;
  }

  async function resolveRecipe(query: string, servings: number, eaters: Member[]): Promise<{ recipe: Recipe | null; candidates: { id: string; name: string }[]; via: 'saved' | 'llm' | 'none' }> {
    const q = query.toLowerCase();
    const recipes = await store.recipes();
    const exact = recipes.find(r => r.name.toLowerCase() === q);
    const fuzzy = recipes.filter(r => r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase()) || q.split(' ').every(w => r.name.toLowerCase().includes(w)));
    if (exact) return { recipe: exact, candidates: [], via: 'saved' };
    if (fuzzy.length === 1) return { recipe: fuzzy[0]!, candidates: [], via: 'saved' };
    if (fuzzy.length > 1) return { recipe: null, candidates: fuzzy.map(r => ({ id: r.id, name: r.name })), via: 'saved' };
    const active = activeConstraints(eaters);
    const notes = [...active.allergens].map(([a, s]) => `${a}-free (${s}) for ${active.who.join(', ')}`);
    const generated = await generateRecipe(query, servings, notes, await store.items(), anthropicApiKey);
    if (generated) { await store.upsertRecipe(generated); return { recipe: generated, candidates: [], via: 'llm' }; }
    return { recipe: null, candidates: [], via: 'none' };
  }

  // ---------- bootstrap
  app.get('/api/state', async c => {
    const r = await currentRetailer();
    const members = await store.members();
    return c.json({
      members,
      items: await store.items(),
      plans: (await store.plans()).filter(p => p.status === 'planned'),
      recipes: (await store.recipes()).map(r => ({ id: r.id, name: r.name, servings: r.servings, source: r.source })),
      list: (await store.listItems()).filter(l => l.status === 'open'),
      retailers: [{ id: r.id, name: r.displayName, modes: r.modes, session: await r.session() }],
      household: await store.setting('household', householdDefaults),
      meMemberId: (await store.setting<string | null>('meMemberId', null)) ?? members[0]?.id ?? null,
      onboarded: await store.setting<boolean>('onboarded', members.length > 0),
      llm: llmAvailable(anthropicApiKey),
    });
  });

  // ---------- ask: natural-language entry point
  app.post('/api/ask', async c => {
    const body = z.object({ text: z.string().min(1) }).parse(await c.req.json());
    const intents = parseAsk(body.text);
    const items = await store.items();
    const members = await store.members();
    const household = await store.setting('household', householdDefaults);
    const results: unknown[] = [];
    for (const intent of intents) {
      if (intent.kind === 'list') {
        const item = resolveItem(intent.item, items);
        const { item: li, merged } = await addToList(intent.item, item?.id ?? null, intent.qty, 'chat');
        const draftIds = await addLineToOpenDrafts(li);
        results.push({ kind: 'list', added: li, merged, addedToDrafts: draftIds });
      } else if (intent.kind === 'out_of') {
        const item = resolveItem(intent.item, items);
        if (item) for (const s of (await store.stock()).filter(s => s.itemId === item.id)) await store.deleteStock(s.id);
        const { item: li } = await addToList(intent.item, item?.id ?? null, null, 'out_of');
        const draftIds = await addLineToOpenDrafts(li);
        results.push({ kind: 'out_of', item: item?.name ?? intent.item, added: li, addedToDrafts: draftIds });
      } else if (intent.kind === 'stock_add') {
        const item = resolveItem(intent.item, items);
        if (!item) { results.push({ kind: 'stock_add', error: `Don't know "${intent.item}" yet` }); continue; }
        const s: StockItem = { id: newId('st_'), itemId: item.id, qty: intent.qty ?? 1, unit: item.defaultUnit, confidence: 'approx', location: item.category === 'food' ? 'cupboard' : 'household', freeFrom: [], boughtAt: new Date().toISOString() };
        await store.upsertStock(s);
        results.push({ kind: 'stock_add', stock: s });
      } else {
        const eaterIds = await resolveEaters(intent.only, intent.except, members);
        const eaters = members.filter(m => eaterIds.includes(m.id));
        const servings = intent.servings ?? (intent.only.length || intent.except.length ? servingsFor(eaters) : household.defaultServings);
        const resolved = await resolveRecipe(intent.query, servings, eaters);
        results.push({ kind: 'recipe', query: intent.query, servings, day: intent.day, date: dateForDay(intent.day), slot: intent.slot ?? 'dinner', eaterIds, eaters: eaters.map(m => m.name), ...resolved });
      }
    }
    return c.json({ intents, results });
  });

  // ---------- recipes
  app.get('/api/recipes', async c => c.json(await store.recipes()));
  app.get('/api/recipes/:id', async c => {
    const r = await store.recipe(c.req.param('id'));
    return r ? c.json(r) : c.json({ error: 'not found' }, 404);
  });
  app.post('/api/recipes/resolve', async c => {
    const body = z.object({ query: z.string(), servings: z.number().int().positive().optional() }).parse(await c.req.json());
    const household = await store.setting('household', householdDefaults);
    return c.json(await resolveRecipe(body.query, body.servings ?? household.defaultServings, (await store.members()).filter(m => m.eatsByDefault)));
  });
  app.post('/api/recipes', async c => {
    const body = z.object({ name: z.string(), servings: z.number().int().positive(), ingredients: z.array(z.string()), steps: z.array(z.string()).default([]) }).parse(await c.req.json());
    const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + newId();
    const recipe: Recipe = { id, name: body.name, servings: body.servings, source: { type: 'manual' }, ingredients: resolveLines(body.ingredients.map(parseIngredient), await store.items()), steps: body.steps };
    await store.upsertRecipe(recipe);
    return c.json(recipe);
  });
  /** Preview a recipe scaled and with dietary swaps applied for a given set of eaters. */
  app.post('/api/recipes/:id/preview', async c => {
    const r = await store.recipe(c.req.param('id'));
    if (!r) return c.json({ error: 'not found' }, 404);
    const body = z.object({ servings: z.number().int().positive(), eaterIds: z.array(z.string()) }).parse(await c.req.json());
    const items = await store.items();
    const eaters = (await store.members()).filter(m => body.eaterIds.includes(m.id));
    const active = activeConstraints(eaters);
    const scaled = scaleRecipe(r, body.servings);
    const lines = applySubstitutions(scaled.lines, items, await store.substitutions(), active);
    const stock = await store.stock();
    return c.json({
      recipe: r,
      servings: body.servings,
      constraints: [...active.allergens].map(([a, s]) => ({ allergen: a, strictness: s })),
      lines: lines.map(l => {
        const item = l.itemId ? items.find(i => i.id === l.itemId) : undefined;
        const have = item ? stock.filter(s => s.itemId === item.id && !item.allergens.some(a => active.allergens.has(a) && !s.freeFrom.includes(a))) : [];
        const haveQty = have.reduce((n, s) => n + (s.unit === l.unit ? s.qty : 0), 0);
        return { ...l, label: formatQty(l.qty, l.unit), staple: item?.isStaple ?? false, haveQty, haveApprox: have.some(s => s.confidence === 'approx'), haveUnit: have[0]?.unit ?? null };
      }),
    });
  });

  // ---------- plans (cook list)
  app.get('/api/plans', async c => {
    const q = z.object({ from: z.string().optional(), to: z.string().optional(), all: z.string().optional() }).parse(c.req.query());
    const plans = (await store.plans()).filter(p => q.all ? true : p.status === 'planned');
    if (!q.from && !q.to) return c.json(plans);
    return c.json(plans.filter(p => p.date && (!q.from || p.date >= q.from) && (!q.to || p.date <= q.to)));
  });
  app.get('/api/plans/week', async c => {
    const q = z.object({ weeks: z.coerce.number().int().min(1).max(4).default(2) }).parse(c.req.query());
    const { start, end } = weekRange(new Date(), q.weeks);
    const all = await store.plans();
    const plans = all.filter(p => p.status !== 'cancelled' && p.date && p.date >= start && p.date <= end);
    const unscheduled = all.filter(p => p.status === 'planned' && !p.date);
    return c.json({ start, end, plans, unscheduled });
  });
  app.post('/api/plans', async c => {
    const body = z.object({
      recipeId: z.string(), servings: z.number().int().positive(),
      day: z.string().nullable().default(null), date: z.string().nullable().optional(),
      slot: z.enum(['breakfast', 'lunch', 'dinner']).default('dinner'), eaterIds: z.array(z.string()).optional(),
    }).parse(await c.req.json());
    if (!(await store.recipe(body.recipeId))) return c.json({ error: 'recipe not found' }, 404);
    const eaterIds = body.eaterIds ?? (await store.members()).filter(m => m.eatsByDefault).map(m => m.id);
    const date = body.date === undefined ? dateForDay(body.day) : body.date;
    const plan: Plan = { id: newId('pl_'), recipeId: body.recipeId, servings: body.servings, day: body.day, date, slot: body.slot, eaterIds, status: 'planned', createdAt: new Date().toISOString() };
    await store.upsertPlan(plan);
    return c.json(plan);
  });
  app.patch('/api/plans/:id', async c => {
    const plan = await store.plan(c.req.param('id'));
    if (!plan) return c.json({ error: 'not found' }, 404);
    const body = z.object({ servings: z.number().int().positive().optional(), date: z.string().nullable().optional(), slot: z.enum(['breakfast', 'lunch', 'dinner']).optional(), eaterIds: z.array(z.string()).optional() }).parse(await c.req.json());
    const next: Plan = { ...plan, ...body };
    await store.upsertPlan(next);
    return c.json(next);
  });
  app.delete('/api/plans/:id', async c => { await store.deletePlan(c.req.param('id')); return c.json({ ok: true }); });
  app.post('/api/plans/:id/cooked', async c => {
    const plan = await store.plan(c.req.param('id'));
    if (!plan) return c.json({ error: 'not found' }, 404);
    const recipe = (await store.recipe(plan.recipeId))!;
    const items = await store.items();
    const eaters = (await store.members()).filter(m => plan.eaterIds.includes(m.id));
    const lines = applySubstitutions(scaleRecipe(recipe, plan.servings).lines, items, await store.substitutions(), activeConstraints(eaters));
    const { stock, changes } = deductCooked(lines, await store.stock(), items);
    await store.replaceStock(stock);
    for (const ch of changes) await store.addEvent({ id: newId('ev_'), stockId: ch.stockId, itemId: '', delta: ch.after - ch.before, unit: '', reason: `cooked ${recipe.name}`, at: new Date().toISOString() });
    await store.upsertPlan({ ...plan, status: 'cooked' });
    return c.json({ ok: true, changes });
  });

  // ---------- orders (drafts are persisted on every change, so any isolate can continue them)
  app.post('/api/orders/propose', async c => {
    const body = z.object({ planIds: z.array(z.string()).optional() }).parse((await c.req.json().catch(() => ({}))) ?? {});
    const draft = await proposeOrder(store, await currentRetailer(), body.planIds);
    const id = newId('ord_');
    await store.upsertOrder({ id, retailer: draft.retailer, status: 'draft', payload: draft, createdAt: new Date().toISOString(), approvedAt: null });
    return c.json({ id, draft });
  });
  app.get('/api/orders', async c => c.json((await store.orders()).map(o => ({ id: o.id, retailer: o.retailer, status: o.status, createdAt: o.createdAt, total: (o.payload as DraftOrder).total }))));
  app.get('/api/orders/:id', async c => {
    const rec = await store.order(c.req.param('id'));
    if (!rec) return c.json({ error: 'not found' }, 404);
    return c.json({ id: rec.id, status: rec.status, draft: rec.payload as DraftOrder });
  });
  app.patch('/api/orders/:id/lines/:key', async c => {
    const rec = await store.order(c.req.param('id'));
    if (!rec || rec.status !== 'draft') return c.json({ error: 'order is not a draft' }, 409);
    const draft = rec.payload as DraftOrder;
    const body = z.object({ productId: z.string().optional(), qty: z.number().optional(), haveIt: z.boolean().optional(), removed: z.boolean().optional() }).parse(await c.req.json());
    applyLineChange(draft, decodeURIComponent(c.req.param('key')), body);
    await store.upsertOrder({ ...rec, payload: draft });
    return c.json({ id: rec.id, status: rec.status, draft });
  });
  app.post('/api/orders/:id/approve', async c => {
    const rec = await store.order(c.req.param('id'));
    if (!rec || rec.status !== 'draft') return c.json({ error: 'order is not a draft' }, 409);
    const draft = rec.payload as DraftOrder;
    const body = z.object({ override: z.boolean().default(false) }).parse((await c.req.json().catch(() => ({}))) ?? {});
    const live = draft.lines.filter(l => !l.removed && !l.haveIt);
    if (draft.blockers > 0 && !body.override) return c.json({ error: `${draft.blockers} line(s) still block approval`, blockers: live.filter(l => l.blocked).map(l => l.itemName) }, 422);
    const r = await currentRetailer();
    const pushable = live.filter(l => l.chosen);
    const result = await r.basketAdd(pushable.map(l => ({ productId: l.chosen!.product.id, qty: l.qty })));
    // Items we had never seen ("medium freezer bags") join the catalogue now that a product was approved for them.
    await promoteAdhocItems(store, draft);
    // Learn preferences from what was approved.
    for (const l of pushable) if (l.itemId) await store.upsertPref({ itemId: l.itemId, retailer: r.id, productId: l.chosen!.product.id, alwaysAsk: false });
    const listItems = await store.listItems();
    for (const l of draft.lines.filter(l => l.section === 'extras' && !l.removed)) {
      const li = listItems.find(x => x.id === l.key.replace('list:', ''));
      if (li) await store.upsertListItem({ ...li, status: 'ordered' });
    }
    await store.upsertOrder({ ...rec, status: 'pushed', payload: draft, approvedAt: new Date().toISOString() });
    return c.json({ ok: true, pushed: result.added, basketUrl: result.basketUrl, notPushed: live.filter(l => !l.chosen).map(l => l.itemName) });
  });
  /** Mark delivered: move pushed lines into the pantry. */
  app.post('/api/orders/:id/delivered', async c => {
    const rec = await store.order(c.req.param('id'));
    if (!rec || rec.status !== 'pushed') return c.json({ error: 'order has not been pushed' }, 409);
    const draft = rec.payload as DraftOrder;
    const added: StockItem[] = [];
    for (const l of draft.lines.filter(l => !l.removed && !l.haveIt && l.chosen && l.itemId)) {
      const p = l.chosen!.product;
      const item = (await store.item(l.itemId!))!;
      const freeFrom = p.dietary.includes('gluten_free') ? ['gluten' as const] : [];
      const s: StockItem = { id: newId('st_'), itemId: item.id, qty: p.packQty * (p.packCount ?? 1) * l.qty, unit: p.packUnit, confidence: 'exact', location: item.category === 'food' ? 'cupboard' : 'household', freeFrom, boughtAt: new Date().toISOString(), note: p.name };
      await store.upsertStock(s);
      added.push(s);
    }
    await store.upsertOrder({ ...rec, status: 'delivered' });
    return c.json({ ok: true, added });
  });

  // ---------- pantry (inventory)
  app.get('/api/inventory', async c => {
    const items = await store.items();
    return c.json((await store.stock()).map(s => ({ ...s, item: items.find(i => i.id === s.itemId) ?? null })));
  });
  app.post('/api/inventory', async c => {
    const body = z.object({ text: z.string().optional(), itemId: z.string().optional(), qty: z.number().optional(), unit: z.string().optional(), location: z.enum(['fridge', 'freezer', 'cupboard', 'household']).optional(), confidence: z.enum(['exact', 'approx']).optional() }).parse(await c.req.json());
    const items = await store.items();
    let item = body.itemId ? await store.item(body.itemId) : undefined;
    let qty = body.qty;
    let unit = body.unit as StockItem['unit'] | undefined;
    if (!item && body.text) {
      const parsed = parseIngredient(body.text);
      item = resolveItem(parsed.itemName, items) ?? undefined;
      qty = qty ?? parsed.qty ?? 1;
      unit = unit ?? parsed.unit ?? item?.defaultUnit;
    }
    if (!item) return c.json({ error: `Could not match "${body.text ?? body.itemId}" to a known item` }, 422);
    const s: StockItem = { id: newId('st_'), itemId: item.id, qty: qty ?? 1, unit: unit ?? item.defaultUnit, confidence: body.confidence ?? 'approx', location: body.location ?? (item.category === 'food' ? 'cupboard' : 'household'), freeFrom: [], boughtAt: new Date().toISOString() };
    await store.upsertStock(s);
    return c.json({ ...s, item });
  });
  app.patch('/api/inventory/:id', async c => {
    const s = (await store.stock()).find(x => x.id === c.req.param('id'));
    if (!s) return c.json({ error: 'not found' }, 404);
    const body = z.object({ qty: z.number().optional(), confidence: z.enum(['exact', 'approx']).optional(), location: z.enum(['fridge', 'freezer', 'cupboard', 'household']).optional() }).parse(await c.req.json());
    const next = { ...s, ...body };
    if (next.qty <= 0) await store.deleteStock(s.id); else await store.upsertStock(next);
    return c.json(next);
  });
  app.delete('/api/inventory/:id', async c => { await store.deleteStock(c.req.param('id')); return c.json({ ok: true }); });
  /** Bootstrap the pantry from retailer order history. */
  app.post('/api/retailers/:id/sync-orders', async c => {
    const r = await currentRetailer();
    const items = await store.items();
    const existing = await store.stock();
    const added: StockItem[] = [];
    for (const o of await r.orders()) {
      for (const l of o.lines) {
        const item = resolveItem(l.product.name.replace(/\d+\s*(g|kg|ml|l|pints?|pack)\b.*$/i, ''), items);
        if (!item) continue;
        if (existing.some(s => s.note === l.product.name) || added.some(s => s.note === l.product.name)) continue;
        const s: StockItem = { id: newId('st_'), itemId: item.id, qty: l.product.packQty * (l.product.packCount ?? 1) * l.qty, unit: l.product.packUnit, confidence: 'approx', location: item.category === 'food' ? 'cupboard' : 'household', freeFrom: l.product.dietary.includes('gluten_free') ? ['gluten'] : [], boughtAt: o.placedAt, note: l.product.name };
        await store.upsertStock(s);
        added.push(s);
      }
    }
    return c.json({ added });
  });

  // ---------- running list
  app.get('/api/list', async c => c.json((await store.listItems()).filter(l => l.status === 'open')));
  app.post('/api/list', async c => {
    const body = z.object({ text: z.string().min(1), qty: z.number().optional() }).parse(await c.req.json());
    const item = resolveItem(body.text, await store.items());
    return c.json((await addToList(body.text, item?.id ?? null, body.qty ?? null, 'manual')).item);
  });
  app.delete('/api/list/:id', async c => { await store.deleteListItem(c.req.param('id')); return c.json({ ok: true }); });

  // ---------- household
  const constraintSchema = z.object({ kind: z.enum(CONSTRAINT_KINDS as [string, ...string[]]), strictness: z.enum(['preference', 'avoid', 'strict']), itemId: z.string().optional() });
  const memberSchema = z.object({ name: z.string().min(1), age: z.number().int().min(0).max(120).nullable().optional(), eatsByDefault: z.boolean().default(true), constraints: z.array(constraintSchema).default([]) });
  const memberId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || newId('m_');

  app.get('/api/household', async c => c.json({ members: await store.members(), settings: await store.setting('household', {}) }));
  app.put('/api/household/members/:id', async c => {
    const body = memberSchema.parse(await c.req.json());
    const m: Member = { id: c.req.param('id'), ...body, constraints: body.constraints as Member['constraints'] };
    await store.upsertMember(m);
    return c.json(m);
  });
  /** First-run set-up: who lives here, their ages, allergies and diets, and the household defaults. */
  app.post('/api/household/onboard', async c => {
    const body = z.object({
      members: z.array(memberSchema).min(1),
      meIndex: z.number().int().min(0).default(0),
      settings: z.object({ defaultServings: z.number().int().positive().optional(), ownBrandOk: z.boolean().default(true), alwaysAskCategories: z.array(z.string()).default(['meat']), retailer: z.string().optional() }).optional(),
    }).parse(await c.req.json());
    const settings = body.settings ?? { defaultServings: undefined, ownBrandOk: true, alwaysAskCategories: ['meat'], retailer: undefined };
    for (const m of await store.members()) await store.deleteMember(m.id);
    const ids: string[] = [];
    for (const m of body.members) {
      let id = memberId(m.name);
      while (ids.includes(id)) id = `${id}-${ids.length}`;
      ids.push(id);
      await store.upsertMember({ id, name: m.name, age: m.age ?? null, eatsByDefault: m.eatsByDefault, constraints: m.constraints as Member['constraints'] });
    }
    const members = await store.members();
    const defaultServings = settings.defaultServings ?? servingsFor(members.filter(m => m.eatsByDefault));
    await store.setSetting('household', { defaultServings, ownBrandOk: settings.ownBrandOk, alwaysAskCategories: settings.alwaysAskCategories });
    await store.setSetting('meMemberId', ids[body.meIndex] ?? ids[0]);
    if (settings.retailer) await store.setSetting('retailerPreference', settings.retailer);
    await store.setSetting('onboarded', true);
    return c.json({ members, meMemberId: ids[body.meIndex] ?? ids[0], defaultServings });
  });
  app.delete('/api/household/members/:id', async c => { await store.deleteMember(c.req.param('id')); return c.json({ ok: true }); });
  app.put('/api/household/settings', async c => {
    const body = z.object({ defaultServings: z.number().int().positive(), ownBrandOk: z.boolean(), alwaysAskCategories: z.array(z.string()), meMemberId: z.string().nullable().optional() }).parse(await c.req.json());
    const { meMemberId, ...rest } = body;
    await store.setSetting('household', rest);
    if (meMemberId !== undefined) await store.setSetting('meMemberId', meMemberId);
    return c.json(body);
  });

  // ---------- retailers
  app.get('/api/retailers', async c => c.json(await Promise.all([...retailers.values()].map(async r => ({ id: r.id, name: r.displayName, modes: r.modes, deliveryFee: r.deliveryFee, minimumOrder: r.minimumOrder, session: await r.session() })))));
  app.get('/api/retailers/:id/search', async c => c.json(await (await currentRetailer()).search(c.req.query('q') ?? '', 10)));

  app.all('/api/*', c => c.json({ error: 'not found' }, 404));

  return app;
}
