import { describe, expect, it } from 'vitest';
import { MockRetailer, renderHandoffList, HANDOFF_NOTES } from '../src/index.js';

describe('MockRetailer', () => {
  const r = new MockRetailer();
  it('searches by words and keeps a basket', async () => {
    const hits = await r.search('beef mince');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0]!.name).toMatch(/Beef Mince/);
    await r.basketAdd([{ productId: hits[0]!.id, qty: 2 }]);
    await r.basketAdd([{ productId: hits[0]!.id, qty: 1 }]);
    expect(r.basketContents()).toEqual([{ productId: hits[0]!.id, qty: 3 }]);
  });
  it('has order history for inventory bootstrap', async () => {
    const orders = await r.orders();
    expect(orders[0]!.lines.length).toBeGreaterThan(0);
  });
});

describe('handoff', () => {
  it('renders a paste list', () => {
    expect(renderHandoffList([{ name: 'Beef Mince 500g', qty: 2 }, { name: 'bleach' }])).toBe('2 x Beef Mince 500g\nbleach');
  });
  it('builds retailer search links', () => {
    expect(HANDOFF_NOTES.tesco.search('whole milk')).toBe('https://www.tesco.com/groceries/en-GB/search?query=whole%20milk');
  });
});
