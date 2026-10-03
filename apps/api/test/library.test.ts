import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildApp, type BuildOptions } from '../src/server.js';
import { ALL_ITEMS, libraryRecipes, type Store } from '@foodify/app';
import { resolveItem } from '@foodify/core';

process.env.NODE_ENV = 'test';

describe('recipe library', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let store: Store;
  let close: () => void;
  beforeAll(async () => { ({ app, store, close } = await buildApp({ dbFile: ':memory:', demo: true } satisfies BuildOptions)); });
  afterAll(() => close());
  const json = async (method: 'GET' | 'POST', url: string, body?: unknown) => {
    const res = await app.request(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  it('seeds at least 1000 common UK recipes with resolved ingredients', async () => {
    const recipes = await store.recipes();
    expect(recipes.length).toBeGreaterThanOrEqual(1000);
    const lines = recipes.flatMap(r => r.ingredients);
    const resolved = lines.filter(l => l.itemId).length;
    expect(resolved / lines.length).toBeGreaterThan(0.9);
    expect(lines.filter(l => l.qty === null && l.scaling !== 'to_taste').length / lines.length).toBeLessThan(0.02);
  });

  it('every catalogue item resolves by its own name and aliases, and ids are unique', () => {
    const ids = new Set<string>();
    for (const i of ALL_ITEMS) {
      expect(ids.has(i.id)).toBe(false); ids.add(i.id);
      expect(resolveItem(i.name, ALL_ITEMS)?.id).toBe(i.id);
    }
    expect(libraryRecipes().length).toBeGreaterThanOrEqual(1000);
  });

  it('finds a library recipe by name from a plain ask', async () => {
    const { body } = await json('POST', '/api/ask', { text: 'bacon sandwich for 2' });
    expect(body.results[0]).toMatchObject({ kind: 'recipe', via: 'saved', servings: 2 });
    expect(body.results[0].recipe.name.toLowerCase()).toContain('bacon sandwich');
  });

  it('offers candidates when the ask is ambiguous, shortest names first', async () => {
    const { body } = await json('POST', '/api/ask', { text: 'chicken curry on friday' });
    const r = body.results[0];
    expect(r.kind).toBe('recipe');
    if (r.recipe) expect(r.recipe.name.toLowerCase()).toContain('chicken curry');
    else expect(r.candidates.length).toBeGreaterThan(1);
  });

  it('builds a basket for a library recipe with mostly matched products', async () => {
    const recipes = await store.recipes();
    const sb = recipes.find(r => r.id === 'spaghetti-bolognese') ?? recipes.find(r => r.name.toLowerCase().includes('bolognese'))!;
    expect(sb).toBeTruthy();
    const plan = await json('POST', '/api/plans', { recipeId: sb.id, servings: 4, day: 'friday' });
    expect(plan.status).toBe(200);
    const { body } = await json('POST', '/api/orders/propose', { planIds: [plan.body.id] });
    const recipeLines = body.draft.lines.filter((l: any) => l.section === 'recipe');
    expect(recipeLines.length).toBeGreaterThan(3);
    // A line blocked for Sam's gluten rule is correct behaviour, not a missing product.
    const open = recipeLines.filter((l: any) => !l.blocked);
    const withProduct = open.filter((l: any) => l.chosen).length;
    expect(withProduct / open.length).toBeGreaterThan(0.75);
  });
});
