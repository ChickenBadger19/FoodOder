import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server.js';

process.env.NODE_ENV = 'test';

describe('end-to-end: ask -> plan -> propose -> approve -> delivered', () => {
  const { app, store } = buildApp({ dbFile: ':memory:' });
  beforeAll(async () => { await app.ready(); });
  afterAll(async () => { await app.close(); });

  const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const res = await app.inject({ method, url, payload: body });
    return { status: res.statusCode, body: res.json() };
  };

  it('parses an ask into a saved recipe and a list item', async () => {
    const { status, body } = await json('POST', '/api/ask', { text: 'lasagne for 6 on friday, and we need bleach' });
    expect(status).toBe(200);
    expect(body.results[0]).toMatchObject({ kind: 'recipe', via: 'saved', servings: 6, day: 'friday' });
    expect(body.results[0].recipe.id).toBe('lasagne');
    expect(body.results[1]).toMatchObject({ kind: 'list', added: { itemId: 'bleach' }, merged: true });
  });

  it('previews the recipe with gluten-free swaps for Sam', async () => {
    const { body } = await json('POST', '/api/recipes/lasagne/preview', { servings: 6, eaterIds: ['jeff', 'alex', 'sam'] });
    expect(body.constraints).toEqual([{ allergen: 'gluten', strictness: 'strict' }]);
    const sheets = body.lines.find((l: any) => l.swappedFrom === 'lasagne sheets');
    expect(sheets.itemId).toBe('gf-lasagne-sheets');
    expect(sheets.qty).toBe(18);
    const stock = body.lines.find((l: any) => l.itemId === 'gf-beef-stock');
    expect(stock.swappedFrom).toBe('beef stock cube');
    const mince = body.lines.find((l: any) => l.itemId === 'beef-mince');
    expect(mince.qty).toBe(750);
  });

  let planId: string;
  it('adds the cook list entry', async () => {
    const { body } = await json('POST', '/api/plans', { recipeId: 'lasagne', servings: 6, day: 'friday' });
    planId = body.id;
    expect(body.eaterIds).toContain('sam');
  });

  let orderId: string;
  it('proposes a draft with a blocked line for the GF stock cube and extras from the running list', async () => {
    const { status, body } = await json('POST', '/api/orders/propose', {});
    expect(status).toBe(200);
    orderId = body.id;
    const d = body.draft;
    expect(d.eaters).toEqual(['Jeff', 'Alex', 'Sam']);
    expect(d.constraintsSummary).toEqual(['gluten-free (strict)']);

    const mince = d.lines.find((l: any) => l.itemId === 'beef-mince');
    expect(mince.chosen.product.id).toBe('m1');           // "your usual"
    expect(mince.qty).toBe(2);                             // 750 g -> 2 x 500 g
    expect(mince.chosen.reasons).toContain('your usual');

    const sheets = d.lines.find((l: any) => l.itemId === 'gf-lasagne-sheets');
    expect(sheets.chosen.product.id).toBe('p2');
    expect(sheets.chosen.dietary.kind).toBe('verified');

    const stockCube = d.lines.find((l: any) => l.itemId === 'gf-beef-stock');
    expect(stockCube.blocked).toBe(true);
    expect(stockCube.chosen).toBeNull();

    // Tomatoes are in stock (1200 g >= 1200 g needed at 6 portions), so no line.
    expect(d.lines.find((l: any) => l.itemId === 'chopped-tomatoes')).toBeUndefined();
    // Milk: 900 ml needed, 300 ml approx in stock -> partial.
    const milk = d.lines.find((l: any) => l.itemId === 'milk');
    expect(milk.haveLabel).toBe('have 300 ml');
    expect(milk.anyApprox).toBe(true);

    const extras = d.lines.filter((l: any) => l.section === 'extras');
    expect(extras.map((l: any) => l.itemId).sort()).toEqual(['bin-bags', 'bleach']);
    expect(extras.find((l: any) => l.itemId === 'bleach').chosen.product.id).toBe('h1');

    expect(d.blockers).toBe(1);
    expect(d.handoffList).toContain('Beef Mince');
  });

  it('refuses approval while a line blocks, then approves after "I have it"', async () => {
    const refused = await json('POST', `/api/orders/${orderId}/approve`, {});
    expect(refused.status).toBe(422);
    expect(refused.body.blockers).toEqual(['gluten-free beef stock cube']);

    const patched = await json('PATCH', `/api/orders/${orderId}/lines/gf-beef-stock`, { haveIt: true });
    expect(patched.body.draft.blockers).toBe(0);

    const ok = await json('POST', `/api/orders/${orderId}/approve`, {});
    expect(ok.status).toBe(200);
    expect(ok.body.pushed).toBeGreaterThan(3);
    // Preference learned from approval
    expect(store.prefs().find(p => p.itemId === 'gf-lasagne-sheets')?.productId).toBe('p2');
    // Running list items marked ordered
    expect(store.listItems().filter(l => l.status === 'open')).toHaveLength(0);
  });

  it('moves delivered lines into stock and deducts when cooked', async () => {
    const before = store.stock().length;
    const { body } = await json('POST', `/api/orders/${orderId}/delivered`, {});
    expect(body.added.length).toBeGreaterThan(3);
    expect(store.stock().length).toBe(before + body.added.length);
    const gf = store.stock().find(s => s.itemId === 'gf-lasagne-sheets');
    expect(gf?.freeFrom).toEqual(['gluten']);

    const cooked = await json('POST', `/api/plans/${planId}/cooked`, {});
    expect(cooked.status).toBe(200);
    const mince = store.stock().filter(s => s.itemId === 'beef-mince').reduce((n, s) => n + s.qty, 0);
    expect(mince).toBe(250); // bought 1000 g, cooked 750 g
  });

  it('handles "out of" and stock adds via ask', async () => {
    const { body } = await json('POST', '/api/ask', { text: "we're out of milk and we have 3 onions" });
    expect(body.results[0]).toMatchObject({ kind: 'out_of', item: 'whole milk' });
    expect(store.stock().some(s => s.itemId === 'milk')).toBe(false);
    expect(body.results[1]).toMatchObject({ kind: 'stock_add', stock: { itemId: 'onion', qty: 3 } });
  });
});
