import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildApp, type BuildOptions } from '../src/server.js';
import type { Store } from '@foodify/app';
import { dateForDay, weekRange } from '@foodify/app';

process.env.NODE_ENV = 'test';

describe('dates', () => {
  it('resolves spoken days to the next matching date', () => {
    const wed = new Date(2026, 9, 7); // Wednesday 7 Oct 2026
    expect(dateForDay('friday', wed)).toBe('2026-10-09');
    expect(dateForDay('wednesday', wed)).toBe('2026-10-07');
    expect(dateForDay('tuesday', wed)).toBe('2026-10-13');
    expect(dateForDay('tomorrow', wed)).toBe('2026-10-08');
    expect(dateForDay('weekend', wed)).toBe('2026-10-10');
    expect(dateForDay(null, wed)).toBeNull();
    expect(weekRange(wed, 1)).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });
});

describe('week planning and chat-anywhere', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let store: Store;
  let close: () => void;
  beforeAll(async () => { ({ app, store, close } = await buildApp({ dbFile: ':memory:', demo: true } satisfies BuildOptions)); });
  afterAll(() => close());
  const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const res = await app.request(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  it('resolves who is eating from the ask', async () => {
    const { body } = await json('POST', '/api/ask', { text: 'lasagne on friday without sam' });
    const r = body.results[0];
    expect(r.eaterIds).toEqual(['jeff', 'alex']);
    expect(r.servings).toBe(2);
    expect(r.slot).toBe('dinner');
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const two = await json('POST', '/api/ask', { text: 'pancakes for breakfast on sunday just me and alex' });
    expect(two.body.results[0]).toMatchObject({ eaterIds: ['jeff', 'alex'], slot: 'breakfast', via: 'saved' });
    // Several pancake recipes exist, so it asks which rather than guessing.
    expect(two.body.results[0].candidates.map((c: any) => c.name)).toContain('Scotch pancakes');
  });

  it('plans meals on dates with per-meal eaters and lists them by week', async () => {
    const dinner = await json('POST', '/api/plans', { recipeId: 'lasagne', servings: 2, day: 'friday', eaterIds: ['jeff', 'alex'] });
    expect(dinner.body.date).toBe(dateForDay('friday'));
    expect(dinner.body.slot).toBe('dinner');
    // Sam gets something else the same evening.
    const sams = await json('POST', '/api/plans', { recipeId: 'jacket-potatoes-beans', servings: 1, day: 'friday', eaterIds: ['sam'] });
    expect(sams.status).toBe(200);
    const week = await json('GET', '/api/plans/week?weeks=2');
    expect(week.body.plans.map((p: any) => p.recipeId).sort()).toEqual(['jacket-potatoes-beans', 'lasagne']);

    const moved = await json('PATCH', `/api/plans/${sams.body.id}`, { eaterIds: ['sam', 'alex'], servings: 2, slot: 'lunch' });
    expect(moved.body).toMatchObject({ eaterIds: ['sam', 'alex'], servings: 2, slot: 'lunch' });
  });

  it('applies constraints per meal: no GF swaps when Sam is not eating', async () => {
    const { body } = await json('POST', '/api/orders/propose', {});
    const d = body.draft;
    // Lasagne is for Jeff and Alex only, so ordinary lasagne sheets are fine; jacket potatoes (Sam) has no gluten anyway.
    expect(d.lines.find((l: any) => l.itemId === 'gf-lasagne-sheets')).toBeUndefined();
    expect(d.lines.find((l: any) => l.itemId === 'lasagne-sheets')).toBeDefined();
    expect(d.blockers).toBe(0);
  });

  it('adds a chat item to the open draft, with the size you said', async () => {
    const proposed = await json('POST', '/api/orders/propose', {});
    const before = proposed.body.draft.lines.length;
    const { body } = await json('POST', '/api/ask', { text: 'oh we need medium freezer bags' });
    expect(body.results[0]).toMatchObject({ kind: 'list', added: { itemId: 'freezer-bags' } });
    expect(body.results[0].addedToDrafts).toContain(proposed.body.id);
    const after = await json('GET', `/api/orders/${proposed.body.id}`);
    const line = after.body.draft.lines.find((l: any) => l.itemId === 'freezer-bags');
    expect(after.body.draft.lines.length).toBe(before + 1);
    expect(line.chosen.product.name).toBe('Freezer Bags Medium 40 Pack');
    expect(line.chosen.reasons).toContain('"medium" as you said');
  });

  it('learns a brand-new item once a product is approved for it', async () => {
    const { body } = await json('POST', '/api/ask', { text: 'we need dishwasher salt' });
    expect(body.results[0].added.itemId).toBeNull();
    const o = await json('POST', '/api/orders/propose', {});
    const line = o.body.draft.lines.find((l: any) => l.itemName === 'dishwasher salt');
    expect(line.itemId).toBe('adhoc:dishwasher salt');
    expect(line.chosen.product.name).toBe('Dishwasher Salt 2kg');
    expect(line.note).toMatch(/remembered/);
    const ok = await json('POST', `/api/orders/${o.body.id}/approve`, {});
    expect(ok.status).toBe(200);
    expect((await store.item('dishwasher-salt'))?.name).toBe('dishwasher salt');
    expect((await store.prefs()).find(p => p.itemId === 'dishwasher-salt')?.productId).toBe('h10');
  });
});
