import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildApp, type BuildOptions } from '../src/server.js';
import type { Store } from '@foodify/app';

process.env.NODE_ENV = 'test';

describe('first run and onboarding', () => {
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let store: Store;
  let close: () => void;
  beforeAll(async () => { ({ app, store, close } = await buildApp({ dbFile: ':memory:' } satisfies BuildOptions)); });
  afterAll(() => close());
  const json = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown) => {
    const res = await app.request(url, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  it('starts with catalogue and recipes but no household, and is not onboarded', async () => {
    const { body } = await json('GET', '/api/state');
    expect(body.onboarded).toBe(false);
    expect(body.members).toEqual([]);
    expect(body.recipes.length).toBeGreaterThan(0);
    expect(body.items.length).toBeGreaterThan(40);
  });

  it('onboards a household with ages, allergies and diets', async () => {
    const { status, body } = await json('POST', '/api/household/onboard', {
      members: [
        { name: 'Jeff', age: 42, eatsByDefault: true, constraints: [] },
        { name: 'Priya', age: 40, eatsByDefault: true, constraints: [{ kind: 'nut_free', strictness: 'strict' }, { kind: 'pescatarian', strictness: 'avoid' }] },
        { name: 'Mo', age: 3, eatsByDefault: true, constraints: [{ kind: 'dairy_free', strictness: 'avoid' }] },
      ],
      meIndex: 0,
      settings: { ownBrandOk: false, alwaysAskCategories: ['meat', 'fish'], retailer: 'sainsburys' },
    });
    expect(status).toBe(200);
    expect(body.meMemberId).toBe('jeff');
    expect(body.defaultServings).toBe(3); // 1 + 1 + 0.5 -> 3
    const state = await json('GET', '/api/state');
    expect(state.body.onboarded).toBe(true);
    expect(state.body.household).toMatchObject({ defaultServings: 3, ownBrandOk: false });
    expect((await store.members()).find(m => m.id === 'priya')?.constraints.map(c => c.kind)).toEqual(['nut_free', 'pescatarian']);
    expect((await store.members()).find(m => m.id === 'mo')?.age).toBe(3);
  });

  it('uses the new household in asks: "just me and mo" sizes portions by age', async () => {
    const { body } = await json('POST', '/api/ask', { text: 'jacket potatoes for sunday just me and mo' });
    expect(body.results[0]).toMatchObject({ eaterIds: ['jeff', 'mo'], servings: 2, via: 'saved' });
  });

  it('applies pescatarian and nut-free rules at recipe preview', async () => {
    const { body } = await json('POST', '/api/recipes/lasagne/preview', { servings: 3, eaterIds: ['jeff', 'priya', 'mo'] });
    const kinds = body.constraints.map((c: any) => c.allergen).sort();
    expect(kinds).toEqual(['dairy', 'meat', 'nuts', 'peanuts']);
    const mince = body.lines.find((l: any) => l.itemId === 'beef-mince');
    expect(mince.swapReason).toMatch(/contains meat/);
  });
});

describe('HTTP Basic auth', () => {
  // sha256 of "admin:secret"
  const auth = { user: 'admin', sha256: '' };
  let app: Awaited<ReturnType<typeof buildApp>>['app'];
  let close: () => void;
  beforeAll(async () => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('admin:secret'));
    auth.sha256 = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    ({ app, close } = await buildApp({ dbFile: ':memory:', demo: true, auth } satisfies BuildOptions));
  });
  afterAll(() => close());

  it('refuses the app and API without credentials, keeps the health check open', async () => {
    expect((await app.request('/api/state')).status).toBe(401);
    expect((await app.request('/')).status).toBe(401);
    expect((await app.request('/api/health')).status).toBe(200);
    const bad = await app.request('/api/state', { headers: { authorization: 'Basic ' + btoa('admin:wrong') } });
    expect(bad.status).toBe(401);
    const ok = await app.request('/api/state', { headers: { authorization: 'Basic ' + btoa('admin:secret') } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).members.length).toBe(3);
  });
});
