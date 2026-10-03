import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  activeConstraints, deductCooked, parseAsk, parseIngredient, resolveItem, resolveLines, scaleRecipe, applySubstitutions, formatQty,
  type Member, type Recipe, type StockItem,
} from '@foododer/core';
import { MockRetailer, type Retailer } from '@foododer/retailers';
import { Store, newId, type Plan, type ListItem } from './db/index.js';
import { seed } from './seed.js';
import { applyLineChange, appendListLine, promoteAdhocItems, proposeOrder, type DraftOrder } from './services/propose.js';
import { dateForDay, weekRange } from './services/dates.js';
import { generateRecipe, llmAvailable } from './llm.js';

const DB_FILE = process.env.FOODODER_DB ?? 'data/foododer.sqlite';
const PORT = Number(process.env.PORT ?? 8787);

export function buildApp(opts: { dbFile?: string; retailer?: Retailer } = {}) {
  const store = new Store(opts.dbFile ?? DB_FILE);
  if (store.isEmpty()) seed(store);
  const retailer: Retailer = opts.retailer ?? new MockRetailer('Tesco (mock)');
  const retailers = new Map<string, Retailer>([[retailer.id, retailer]]);

  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  app.register(cors, { origin: true });

  const webDist = path.resolve(process.cwd(), '../web/dist');
  if (fs.existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  /** Add to the running list, merging with an open line for the same item instead of duplicating it. */
  function addToList(text: string, itemId: string | null, qty: number | null, addedVia: 'chat' | 'manual' | 'low_stock' | 'out_of') {
    const norm = text.trim().toLowerCase();
    const existing = store.listItems().find(l => l.status === 'open' && ((itemId && l.itemId === itemId) || l.text.trim().toLowerCase() === norm));
    if (existing) {
      const merged = { ...existing, qty: qty !== null || existing.qty !== null ? (qty ?? 0) + (existing.qty ?? 0) || null : null, addedVia: addedVia === 'out_of' ? addedVia : existing.addedVia };
      store.upsertListItem(merged);
      return { item: merged, merged: true };
    }
    const li = { id: newId('li_'), text, itemId, qty, addedVia, status: 'open' as const, createdAt: new Date().toISOString() };
    store.upsertListItem(li);
    return { item: li, merged: false };
  }

  const currentRetailer = () => retailers.get(store.setting('retailer', retailer.id)) ?? retailer;

  // ---------- bootstrap
  app.get('/api/state', async () => {
    const r = currentRetailer();
    return {
      members: store.members(),
      items: store.items(),
      plans: store.plans().filter(p => p.status === 'planned'),
      recipes: store.recipes().map(r => ({ id: r.id, name: r.name, servings: r.servings, source: r.source })),
      list: store.listItems().filter(l => l.status === 'open'),
      retailers: [{ id: r.id, name: r.displayName, modes: r.modes, session: await r.session() }],
      household: store.setting('household', { defaultServings: 4, ownBrandOk: true, alwaysAskCategories: ['meat'] }),
      meMemberId: store.setting<string | null>('meMemberId', null) ?? store.members()[0]?.id ?? null,
      llm: llmAvailable(),
    };
  });

  // ---------- ask: natural-language entry point
  app.post('/api/ask', async (req, reply) => {
    const body = z.object({ text: z.string().min(1) }).parse(req.body);
    const intents = parseAsk(body.text);
    const items = store.items();
    const members = store.members();
    const household = store.setting('household', { defaultServings: 4 });
    const results: unknown[] = [];
    for (const intent of intents) {
      if (intent.kind === 'list') {
        const item = resolveItem(intent.item, items);
        const { item: li, merged } = addToList(intent.item, item?.id ?? null, intent.qty, 'chat');
        const draftIds = await addLineToOpenDrafts(li);
        results.push({ kind: 'list', added: li, merged, addedToDrafts: draftIds });
      } else if (intent.kind === 'out_of') {
        const item = resolveItem(intent.item, items);
        if (item) for (const s of store.stock().filter(s => s.itemId === item.id)) store.deleteStock(s.id);
        const { item: li } = addToList(intent.item, item?.id ?? null, null, 'out_of');
        const draftIds = await addLineToOpenDrafts(li);
        results.push({ kind: 'out_of', item: item?.name ?? intent.item, added: li, addedToDrafts: draftIds });
      } else if (intent.kind === 'stock_add') {
        const item = resolveItem(intent.item, items);
        if (!item) { results.push({ kind: 'stock_add', error: `Don't know "${intent.item}" yet` }); continue; }
        const s: StockItem = { id: newId('st_'), itemId: item.id, qty: intent.qty ?? 1, unit: item.defaultUnit, confidence: 'approx', location: item.category === 'food' ? 'cupboard' : 'household', freeFrom: [], boughtAt: new Date().toISOString() };
        store.upsertStock(s);
        results.push({ kind: 'stock_add', stock: s });
      } else {
        const eaterIds = resolveEaters(intent.only, intent.except, members);
        const eaters = members.filter(m => eaterIds.includes(m.id));
        const servings = intent.servings ?? (intent.only.length || intent.except.length ? Math.max(1, eaters.length) : household.defaultServings);
        const resolved = await resolveRecipe(intent.query, servings, eaters);
        results.push({ kind: 'recipe', query: intent.query, servings, day: intent.day, date: dateForDay(intent.day), slot: intent.slot ?? 'dinner', eaterIds, eaters: eaters.map(m => m.name), ...resolved });
      }
    }
    return reply.send({ intents, results });
  });

  /** "just me and alex" / "without sam" -> member ids. "me" is the household's own member (setting `meMemberId`, else the first). */
  function resolveEaters(only: string[], except: string[], members: Member[]): string[] {
    const meId = store.setting<string | null>('meMemberId', null) ?? members[0]?.id ?? null;
    const find = (n: string) => n === 'me' || n === 'myself' || n === 'i' ? meId : members.find(m => m.name.toLowerCase() === n || m.id === n)?.id ?? null;
    let ids = only.length ? only.map(find).filter((x): x is string => !!x) : members.filter(m => m.eatsByDefault).map(m => m.id);
    if (only.length && ids.length === 0) ids = members.filter(m => m.eatsByDefault).map(m => m.id);
    const ex = new Set(except.map(find).filter(Boolean));
    return ids.filter(id => !ex.has(id));
  }

  /** A list item said in chat should appear on any basket that is still a draft, without a rebuild. */
  async function addLineToOpenDrafts(li: ListItem): Promise<string[]> {
    const ids: string[] = [];
    for (const rec of store.orders().filter(o => o.status === 'draft')) {
      const draft = drafts.get(rec.id) ?? (rec.payload as DraftOrder);
      await appendListLine(store, currentRetailer(), draft, li);
      drafts.set(rec.id, draft);
      store.upsertOrder({ ...rec, payload: draft });
      ids.push(rec.id);
    }
    return ids;
  }

  async function resolveRecipe(query: string, servings: number, eaters: Member[]): Promise<{ recipe: Recipe | null; candidates: { id: string; name: string }[]; via: 'saved' | 'llm' | 'none' }> {
    const q = query.toLowerCase();
    const recipes = store.recipes();
    const exact = recipes.find(r => r.name.toLowerCase() === q);
    const fuzzy = recipes.filter(r => r.name.toLowerCase().includes(q) || q.includes(r.name.toLowerCase()) || q.split(' ').every(w => r.name.toLowerCase().includes(w)));
    if (exact) return { recipe: exact, candidates: [], via: 'saved' };
    if (fuzzy.length === 1) return { recipe: fuzzy[0]!, candidates: [], via: 'saved' };
    if (fuzzy.length > 1) return { recipe: null, candidates: fuzzy.map(r => ({ id: r.id, name: r.name })), via: 'saved' };
    const active = activeConstraints(eaters);
    const notes = [...active.allergens].map(([a, s]) => `${a}-free (${s}) for ${active.who.join(', ')}`);
    const generated = await generateRecipe(query, servings, notes, store.items());
    if (generated) { store.upsertRecipe(generated); return { recipe: generated, candidates: [], via: 'llm' }; }
    return { recipe: null, candidates: [], via: 'none' };
  }

  // ---------- recipes
  app.get('/api/recipes', async () => store.recipes());
  app.get('/api/recipes/:id', async (req, reply) => {
    const r = store.recipe((req.params as any).id);
    return r ?? reply.code(404).send({ error: 'not found' });
  });
  app.post('/api/recipes/resolve', async (req) => {
    const body = z.object({ query: z.string(), servings: z.number().int().positive().optional() }).parse(req.body);
    const household = store.setting('household', { defaultServings: 4 });
    return resolveRecipe(body.query, body.servings ?? household.defaultServings, store.members().filter(m => m.eatsByDefault));
  });
  app.post('/api/recipes', async (req) => {
    const body = z.object({ name: z.string(), servings: z.number().int().positive(), ingredients: z.array(z.string()), steps: z.array(z.string()).default([]) }).parse(req.body);
    const id = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + newId();
    const recipe: Recipe = { id, name: body.name, servings: body.servings, source: { type: 'manual' }, ingredients: resolveLines(body.ingredients.map(parseIngredient), store.items()), steps: body.steps };
    store.upsertRecipe(recipe);
    return recipe;
  });
  /** Preview a recipe scaled and with dietary swaps applied for a given set of eaters. */
  app.post('/api/recipes/:id/preview', async (req, reply) => {
    const r = store.recipe((req.params as any).id);
    if (!r) return reply.code(404).send({ error: 'not found' });
    const body = z.object({ servings: z.number().int().positive(), eaterIds: z.array(z.string()) }).parse(req.body);
    const items = store.items();
    const eaters = store.members().filter(m => body.eaterIds.includes(m.id));
    const active = activeConstraints(eaters);
    const scaled = scaleRecipe(r, body.servings);
    const lines = applySubstitutions(scaled.lines, items, store.substitutions(), active);
    const stock = store.stock();
    return {
      recipe: r,
      servings: body.servings,
      constraints: [...active.allergens].map(([a, s]) => ({ allergen: a, strictness: s })),
      lines: lines.map(l => {
        const item = l.itemId ? items.find(i => i.id === l.itemId) : undefined;
        const have = item ? stock.filter(s => s.itemId === item.id && !item.allergens.some(a => active.allergens.has(a) && !s.freeFrom.includes(a))) : [];
        const haveQty = have.reduce((n, s) => n + (s.unit === l.unit ? s.qty : 0), 0);
        return { ...l, label: formatQty(l.qty, l.unit), staple: item?.isStaple ?? false, haveQty, haveApprox: have.some(s => s.confidence === 'approx'), haveUnit: have[0]?.unit ?? null };
      }),
    };
  });

  // ---------- plans (cook list)
  app.get('/api/plans', async (req) => {
    const q = z.object({ from: z.string().optional(), to: z.string().optional(), all: z.string().optional() }).parse(req.query ?? {});
    const plans = store.plans().filter(p => q.all ? true : p.status === 'planned');
    if (!q.from && !q.to) return plans;
    return plans.filter(p => p.date && (!q.from || p.date >= q.from) && (!q.to || p.date <= q.to));
  });
  app.get('/api/plans/week', async (req) => {
    const q = z.object({ weeks: z.coerce.number().int().min(1).max(4).default(2) }).parse(req.query ?? {});
    const { start, end } = weekRange(new Date(), q.weeks);
    const plans = store.plans().filter(p => p.status !== 'cancelled' && p.date && p.date >= start && p.date <= end);
    const unscheduled = store.plans().filter(p => p.status === 'planned' && !p.date);
    return { start, end, plans, unscheduled };
  });
  app.post('/api/plans', async (req, reply) => {
    const body = z.object({
      recipeId: z.string(), servings: z.number().int().positive(),
      day: z.string().nullable().default(null), date: z.string().nullable().optional(),
      slot: z.enum(['breakfast', 'lunch', 'dinner']).default('dinner'), eaterIds: z.array(z.string()).optional(),
    }).parse(req.body);
    if (!store.recipe(body.recipeId)) return reply.code(404).send({ error: 'recipe not found' });
    const eaterIds = body.eaterIds ?? store.members().filter(m => m.eatsByDefault).map(m => m.id);
    const date = body.date === undefined ? dateForDay(body.day) : body.date;
    const plan: Plan = { id: newId('pl_'), recipeId: body.recipeId, servings: body.servings, day: body.day, date, slot: body.slot, eaterIds, status: 'planned', createdAt: new Date().toISOString() };
    store.upsertPlan(plan);
    return plan;
  });
  app.patch('/api/plans/:id', async (req, reply) => {
    const plan = store.plan((req.params as any).id);
    if (!plan) return reply.code(404).send({ error: 'not found' });
    const body = z.object({ servings: z.number().int().positive().optional(), date: z.string().nullable().optional(), slot: z.enum(['breakfast', 'lunch', 'dinner']).optional(), eaterIds: z.array(z.string()).optional() }).parse(req.body);
    const next: Plan = { ...plan, ...body };
    store.upsertPlan(next);
    return next;
  });
  app.delete('/api/plans/:id', async (req) => { store.deletePlan((req.params as any).id); return { ok: true }; });
  app.post('/api/plans/:id/cooked', async (req, reply) => {
    const plan = store.plan((req.params as any).id);
    if (!plan) return reply.code(404).send({ error: 'not found' });
    const recipe = store.recipe(plan.recipeId)!;
    const items = store.items();
    const eaters = store.members().filter(m => plan.eaterIds.includes(m.id));
    const lines = applySubstitutions(scaleRecipe(recipe, plan.servings).lines, items, store.substitutions(), activeConstraints(eaters));
    const { stock, changes } = deductCooked(lines, store.stock(), items);
    store.replaceStock(stock);
    for (const c of changes) store.addEvent({ id: newId('ev_'), stockId: c.stockId, itemId: '', delta: c.after - c.before, unit: '', reason: `cooked ${recipe.name}`, at: new Date().toISOString() });
    store.upsertPlan({ ...plan, status: 'cooked' });
    return { ok: true, changes };
  });

  // ---------- orders
  let drafts = new Map<string, DraftOrder>();
  app.post('/api/orders/propose', async (req) => {
    const body = z.object({ planIds: z.array(z.string()).optional() }).parse(req.body ?? {});
    const draft = await proposeOrder(store, currentRetailer(), body.planIds);
    const id = newId('ord_');
    drafts.set(id, draft);
    store.upsertOrder({ id, retailer: draft.retailer, status: 'draft', payload: draft, createdAt: new Date().toISOString(), approvedAt: null });
    return { id, draft };
  });
  app.get('/api/orders/:id', async (req, reply) => {
    const id = (req.params as any).id;
    const rec = store.order(id);
    if (!rec) return reply.code(404).send({ error: 'not found' });
    return { id, status: rec.status, draft: drafts.get(id) ?? (rec.payload as DraftOrder) };
  });
  app.patch('/api/orders/:id/lines/:key', async (req, reply) => {
    const { id, key } = req.params as any;
    const rec = store.order(id);
    if (!rec || rec.status !== 'draft') return reply.code(409).send({ error: 'order is not a draft' });
    const draft = drafts.get(id) ?? (rec.payload as DraftOrder);
    const body = z.object({ productId: z.string().optional(), qty: z.number().optional(), haveIt: z.boolean().optional(), removed: z.boolean().optional() }).parse(req.body);
    applyLineChange(draft, decodeURIComponent(key), body);
    drafts.set(id, draft);
    store.upsertOrder({ ...rec, payload: draft });
    return { id, status: rec.status, draft };
  });
  app.post('/api/orders/:id/approve', async (req, reply) => {
    const id = (req.params as any).id;
    const rec = store.order(id);
    if (!rec || rec.status !== 'draft') return reply.code(409).send({ error: 'order is not a draft' });
    const draft = drafts.get(id) ?? (rec.payload as DraftOrder);
    const body = z.object({ override: z.boolean().default(false) }).parse(req.body ?? {});
    const live = draft.lines.filter(l => !l.removed && !l.haveIt);
    if (draft.blockers > 0 && !body.override) return reply.code(422).send({ error: `${draft.blockers} line(s) still block approval`, blockers: live.filter(l => l.blocked).map(l => l.itemName) });
    const r = currentRetailer();
    const pushable = live.filter(l => l.chosen);
    const result = await r.basketAdd(pushable.map(l => ({ productId: l.chosen!.product.id, qty: l.qty })));
    // Items we had never seen ("medium freezer bags") join the catalogue now that a product was approved for them.
    promoteAdhocItems(store, draft);
    // Learn preferences from what was approved.
    for (const l of pushable) if (l.itemId) store.upsertPref({ itemId: l.itemId, retailer: r.id, productId: l.chosen!.product.id, alwaysAsk: false });
    for (const l of draft.lines.filter(l => l.section === 'extras' && !l.removed)) {
      const liId = l.key.replace('list:', '');
      const li = store.listItems().find(x => x.id === liId);
      if (li) store.upsertListItem({ ...li, status: 'ordered' });
    }
    store.upsertOrder({ ...rec, status: 'pushed', payload: draft, approvedAt: new Date().toISOString() });
    return { ok: true, pushed: result.added, basketUrl: result.basketUrl, notPushed: live.filter(l => !l.chosen).map(l => l.itemName) };
  });
  /** Mark delivered: move pushed lines into stock. */
  app.post('/api/orders/:id/delivered', async (req, reply) => {
    const id = (req.params as any).id;
    const rec = store.order(id);
    if (!rec || rec.status !== 'pushed') return reply.code(409).send({ error: 'order has not been pushed' });
    const draft = drafts.get(id) ?? (rec.payload as DraftOrder);
    const added: StockItem[] = [];
    for (const l of draft.lines.filter(l => !l.removed && !l.haveIt && l.chosen && l.itemId)) {
      const p = l.chosen!.product;
      const item = store.item(l.itemId!)!;
      const freeFrom = p.dietary.includes('gluten_free') ? ['gluten' as const] : [];
      const s: StockItem = { id: newId('st_'), itemId: item.id, qty: p.packQty * (p.packCount ?? 1) * l.qty, unit: p.packUnit, confidence: 'exact', location: item.category === 'food' ? 'cupboard' : 'household', freeFrom, boughtAt: new Date().toISOString(), note: p.name };
      store.upsertStock(s);
      added.push(s);
    }
    store.upsertOrder({ ...rec, status: 'delivered' });
    return { ok: true, added };
  });
  app.get('/api/orders', async () => store.orders().map(o => ({ id: o.id, retailer: o.retailer, status: o.status, createdAt: o.createdAt, total: (o.payload as DraftOrder).total })));

  // ---------- inventory
  app.get('/api/inventory', async () => {
    const items = store.items();
    return store.stock().map(s => ({ ...s, item: items.find(i => i.id === s.itemId) ?? null }));
  });
  app.post('/api/inventory', async (req, reply) => {
    const body = z.object({ text: z.string().optional(), itemId: z.string().optional(), qty: z.number().optional(), unit: z.string().optional(), location: z.enum(['fridge', 'freezer', 'cupboard', 'household']).optional(), confidence: z.enum(['exact', 'approx']).optional() }).parse(req.body);
    const items = store.items();
    let item = body.itemId ? store.item(body.itemId) : undefined;
    let qty = body.qty;
    let unit = body.unit as StockItem['unit'] | undefined;
    if (!item && body.text) {
      const parsed = parseIngredient(body.text);
      item = resolveItem(parsed.itemName, items) ?? undefined;
      qty = qty ?? parsed.qty ?? 1;
      unit = unit ?? parsed.unit ?? item?.defaultUnit;
    }
    if (!item) return reply.code(422).send({ error: `Could not match "${body.text ?? body.itemId}" to a known item` });
    const s: StockItem = { id: newId('st_'), itemId: item.id, qty: qty ?? 1, unit: unit ?? item.defaultUnit, confidence: body.confidence ?? 'approx', location: body.location ?? (item.category === 'food' ? 'cupboard' : 'household'), freeFrom: [], boughtAt: new Date().toISOString() };
    store.upsertStock(s);
    return { ...s, item };
  });
  app.patch('/api/inventory/:id', async (req, reply) => {
    const s = store.stock().find(x => x.id === (req.params as any).id);
    if (!s) return reply.code(404).send({ error: 'not found' });
    const body = z.object({ qty: z.number().optional(), confidence: z.enum(['exact', 'approx']).optional(), location: z.enum(['fridge', 'freezer', 'cupboard', 'household']).optional() }).parse(req.body);
    const next = { ...s, ...body };
    if (next.qty <= 0) store.deleteStock(s.id); else store.upsertStock(next);
    return next;
  });
  app.delete('/api/inventory/:id', async (req) => { store.deleteStock((req.params as any).id); return { ok: true }; });
  /** Bootstrap stock from retailer order history. */
  app.post('/api/retailers/:id/sync-orders', async () => {
    const r = currentRetailer();
    const items = store.items();
    const added: StockItem[] = [];
    for (const o of await r.orders()) {
      for (const l of o.lines) {
        const item = resolveItem(l.product.name.replace(/\d+\s*(g|kg|ml|l|pints?|pack)\b.*$/i, ''), items);
        if (!item) continue;
        if (store.stock().some(s => s.note === l.product.name)) continue;
        const s: StockItem = { id: newId('st_'), itemId: item.id, qty: l.product.packQty * (l.product.packCount ?? 1) * l.qty, unit: l.product.packUnit, confidence: 'approx', location: item.category === 'food' ? 'cupboard' : 'household', freeFrom: l.product.dietary.includes('gluten_free') ? ['gluten'] : [], boughtAt: o.placedAt, note: l.product.name };
        store.upsertStock(s);
        added.push(s);
      }
    }
    return { added };
  });

  // ---------- running list
  app.get('/api/list', async () => store.listItems().filter(l => l.status === 'open'));
  app.post('/api/list', async (req) => {
    const body = z.object({ text: z.string().min(1), qty: z.number().optional() }).parse(req.body);
    const item = resolveItem(body.text, store.items());
    return addToList(body.text, item?.id ?? null, body.qty ?? null, 'manual').item;
  });
  app.delete('/api/list/:id', async (req) => { store.deleteListItem((req.params as any).id); return { ok: true }; });

  // ---------- household
  app.get('/api/household', async () => ({ members: store.members(), settings: store.setting('household', {}) }));
  app.put('/api/household/members/:id', async (req) => {
    const body = z.object({ name: z.string(), eatsByDefault: z.boolean(), constraints: z.array(z.object({ kind: z.enum(['gluten_free', 'dairy_free', 'nut_free', 'egg_free', 'vegetarian', 'vegan', 'dislike']), strictness: z.enum(['preference', 'avoid', 'strict']), itemId: z.string().optional() })) }).parse(req.body);
    const m: Member = { id: (req.params as any).id, ...body };
    store.upsertMember(m);
    return m;
  });
  app.delete('/api/household/members/:id', async (req) => { store.deleteMember((req.params as any).id); return { ok: true }; });
  app.put('/api/household/settings', async (req) => {
    const body = z.object({ defaultServings: z.number().int().positive(), ownBrandOk: z.boolean(), alwaysAskCategories: z.array(z.string()), meMemberId: z.string().nullable().optional() }).parse(req.body);
    const { meMemberId, ...rest } = body;
    store.setSetting('household', rest);
    if (meMemberId !== undefined) store.setSetting('meMemberId', meMemberId);
    return body;
  });

  // ---------- retailers
  app.get('/api/retailers', async () => Promise.all([...retailers.values()].map(async r => ({ id: r.id, name: r.displayName, modes: r.modes, deliveryFee: r.deliveryFee, minimumOrder: r.minimumOrder, session: await r.session() }))));
  app.get('/api/retailers/:id/search', async (req) => currentRetailer().search(String((req.query as any).q ?? ''), 10));

  return { app, store, retailer };
}

const isMain = process.argv[1] && /server\.ts$/.test(process.argv[1]);
if (isMain) {
  const { app } = buildApp();
  app.listen({ port: PORT, host: '0.0.0.0' }).then(() => console.log(`FoodOder API on http://localhost:${PORT}`));
}
