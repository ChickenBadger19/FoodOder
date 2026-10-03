import { describe, expect, it } from 'vitest';
import { activeConstraints, applySubstitutions, productDietaryStatus } from '../src/diet.js';
import { aggregateNeeds, computeShortfall, deductCooked } from '../src/stock.js';
import { packsNeeded, rankProducts } from '../src/match.js';
import { scaleRecipe } from '../src/scale.js';
import type { Item, Member, Product, Recipe, StockItem } from '../src/types.js';

const items: Item[] = [
  { id: 'pasta', name: 'lasagne sheets', aliases: [], category: 'food', defaultUnit: 'g', allergens: ['gluten'], isStaple: false, unitWeightG: 14 },
  { id: 'gf-pasta', name: 'gluten-free lasagne sheets', aliases: [], category: 'food', defaultUnit: 'g', allergens: [], isStaple: false, unitWeightG: 14 },
  { id: 'mince', name: 'beef mince', aliases: [], category: 'food', defaultUnit: 'g', allergens: ['meat'], isStaple: false },
  { id: 'onion', name: 'onion', aliases: ['onions'], category: 'food', defaultUnit: 'count', allergens: [], isStaple: false, unitWeightG: 150 },
  { id: 'salt', name: 'salt', aliases: [], category: 'food', defaultUnit: 'g', allergens: [], isStaple: true },
  { id: 'stock', name: 'beef stock cube', aliases: [], category: 'food', defaultUnit: 'count', allergens: ['gluten', 'meat'], isStaple: false },
  { id: 'bleach', name: 'bleach', aliases: [], category: 'household', defaultUnit: 'ml', allergens: [], isStaple: false },
];

const sam: Member = { id: 'sam', name: 'Sam', eatsByDefault: true, constraints: [{ kind: 'gluten_free', strictness: 'strict' }] };
const jeff: Member = { id: 'jeff', name: 'Jeff', eatsByDefault: true, constraints: [] };

const lasagne: Recipe = {
  id: 'lasagne', name: 'Lasagne', servings: 4, source: { type: 'seed' }, steps: [],
  ingredients: [
    { raw: '500g beef mince', itemId: 'mince', itemName: 'beef mince', qty: 500, unit: 'g', scaling: 'linear' },
    { raw: '12 lasagne sheets', itemId: 'pasta', itemName: 'lasagne sheets', qty: 12, unit: 'count', scaling: 'linear' },
    { raw: '1 onion', itemId: 'onion', itemName: 'onion', qty: 1, unit: 'count', scaling: 'linear' },
    { raw: '1 beef stock cube', itemId: 'stock', itemName: 'beef stock cube', qty: 1, unit: 'count', scaling: 'fixed' },
    { raw: 'salt', itemId: 'salt', itemName: 'salt', qty: null, unit: null, scaling: 'to_taste' },
  ],
};

describe('dietary constraints', () => {
  it('collects the strictest constraint per allergen for the people eating', () => {
    const a = activeConstraints([jeff, sam]);
    expect(a.allergens.get('gluten')).toBe('strict');
    expect(activeConstraints([jeff]).allergens.size).toBe(0);
  });

  it('swaps offending lines when a substitute exists and flags when not', () => {
    const a = activeConstraints([sam]);
    const lines = applySubstitutions(lasagne.ingredients, items, [{ itemId: 'pasta', allergen: 'gluten', substituteItemId: 'gf-pasta' }], a);
    expect(lines[1]).toMatchObject({ itemId: 'gf-pasta', swappedFrom: 'lasagne sheets' });
    expect(lines[3]!.swapReason).toContain('no substitute');
    expect(lines[0]!.swappedFrom).toBeUndefined();
  });
});

describe('stock check', () => {
  it('aggregates across recipes in base units and subtracts stock', () => {
    const a = activeConstraints([jeff]);
    const scaled = [scaleRecipe(lasagne, 6), scaleRecipe(lasagne, 2)];
    const needs = aggregateNeeds(scaled, items);
    const mince = needs.find(n => n.itemId === 'mince')!;
    expect(mince.qty).toBe(1000);
    expect(mince.unit).toBe('g');
    const stock: StockItem[] = [
      { id: 's1', itemId: 'mince', qty: 400, unit: 'g', confidence: 'exact', location: 'fridge', freeFrom: [] },
      { id: 's2', itemId: 'onion', qty: 5, unit: 'count', confidence: 'approx', location: 'cupboard', freeFrom: [] },
    ];
    const sf = computeShortfall(needs, stock, items, a);
    const m = sf.find(s => s.item?.id === 'mince')!;
    expect(m.status).toBe('partial');
    expect(m.buyQty).toBe(600);
    const o = sf.find(s => s.item?.id === 'onion')!;
    expect(o.status).toBe('in_stock');
    expect(o.anyApprox).toBe(true);
    expect(sf.find(s => s.item?.id === 'salt')!.status).toBe('staple');
  });

  it('ignores stock that violates a strict constraint', () => {
    const a = activeConstraints([sam]);
    const lines = applySubstitutions(lasagne.ingredients, items, [{ itemId: 'pasta', allergen: 'gluten', substituteItemId: 'gf-pasta' }], a);
    const needs = aggregateNeeds([{ recipe: lasagne, targetServings: 4, factor: 1, lines }], items);
    const stock: StockItem[] = [
      { id: 's1', itemId: 'gf-pasta', qty: 100, unit: 'g', confidence: 'exact', location: 'cupboard', freeFrom: ['gluten'] },
      { id: 's2', itemId: 'pasta', qty: 500, unit: 'g', confidence: 'exact', location: 'cupboard', freeFrom: [] },
    ];
    const sf = computeShortfall(needs, stock, items, a);
    const gf = sf.find(s => s.item?.id === 'gf-pasta')!;
    // 12 sheets * 14 g = 168 g needed, 100 g GF in stock -> buy 68 g; the ordinary pasta is not for this need anyway.
    expect(gf.status).toBe('partial');
    expect(Math.round(gf.buyQty)).toBe(68);
  });

  it('treats a tiny shortfall as in stock', () => {
    const a = activeConstraints([jeff]);
    const needs = aggregateNeeds([scaleRecipe(lasagne, 4)], items);
    const stock: StockItem[] = [{ id: 's1', itemId: 'mince', qty: 490, unit: 'g', confidence: 'approx', location: 'fridge', freeFrom: [] }];
    const sf = computeShortfall(needs, stock, items, a);
    expect(sf.find(s => s.item?.id === 'mince')).toMatchObject({ status: 'in_stock', buyQty: 0 });
    const strict = computeShortfall(needs, stock, items, a, { tolerance: 0 });
    expect(strict.find(s => s.item?.id === 'mince')).toMatchObject({ status: 'partial', buyQty: 10 });
  });

  it('deducts cooked quantities from stock', () => {
    const stock: StockItem[] = [
      { id: 's1', itemId: 'mince', qty: 1000, unit: 'g', confidence: 'exact', location: 'fridge', freeFrom: [] },
      { id: 's2', itemId: 'onion', qty: 1, unit: 'count', confidence: 'exact', location: 'cupboard', freeFrom: [] },
    ];
    const { stock: after } = deductCooked(scaleRecipe(lasagne, 4).lines, stock, items);
    expect(after.find(s => s.id === 's1')).toMatchObject({ qty: 500, confidence: 'approx' });
    expect(after.find(s => s.id === 's2')).toBeUndefined();
  });
});

describe('product matching', () => {
  const mince500: Product = { retailer: 'mock', id: 'p1', name: 'Beef Mince 5% Fat 500g', price: 3.5, packQty: 500, packUnit: 'g', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true };
  const mince750: Product = { retailer: 'mock', id: 'p2', name: 'Beef Mince 20% Fat 750g', price: 4.0, packQty: 750, packUnit: 'g', dietary: [], allergens: [], mayContain: [], inStock: true, ownBrand: true };
  const gfSheets: Product = { retailer: 'mock', id: 'p3', name: 'Free From Lasagne Sheets 250g', price: 2.25, packQty: 250, packUnit: 'g', dietary: ['gluten_free'], allergens: [], mayContain: [], inStock: true, ownBrand: true };
  const sheets: Product = { retailer: 'mock', id: 'p4', name: 'Lasagne Sheets 500g', price: 1.1, packQty: 500, packUnit: 'g', dietary: [], allergens: ['gluten'], mayContain: [], inStock: true, ownBrand: true };
  const stockCube: Product = { retailer: 'mock', id: 'p5', name: 'Beef Stock Cubes 12 pack', price: 1.5, packQty: 12, packUnit: 'count', dietary: [], allergens: [], mayContain: ['gluten'], inStock: true };

  it('computes packs with overshoot', () => {
    expect(packsNeeded(mince500, 750, 'g', items[2]!)).toMatchObject({ packs: 2, totalQty: 1000, overshoot: 250 });
    expect(packsNeeded(mince750, 750, 'g', items[2]!)).toMatchObject({ packs: 1, overshoot: 0 });
  });

  it('prefers the usual product over a cheaper exact fit', () => {
    const ctx = { active: activeConstraints([jeff]), prefs: [{ itemId: 'mince', retailer: 'mock', productId: 'p1', alwaysAsk: false }], ownBrandOk: true, boughtBefore: new Set<string>() };
    const ranked = rankProducts([mince500, mince750], items[2]!, 750, 'g', ctx);
    expect(ranked[0]!.product.id).toBe('p1');
    expect(ranked[0]!.reasons).toContain('your usual');
  });

  it('blocks gluten products for a strict gluten-free eater and verifies free-from claims', () => {
    const ctx = { active: activeConstraints([sam]), prefs: [], ownBrandOk: true, boughtBefore: new Set<string>() };
    const ranked = rankProducts([sheets, gfSheets], items[1]!, 168, 'g', ctx);
    expect(ranked[0]!.product.id).toBe('p3');
    expect(ranked[0]!.dietary.kind).toBe('verified');
    expect(ranked[1]!.blocked).toBe(true);
    const status = productDietaryStatus(stockCube, items[5]!, ctx.active);
    expect(status).toMatchObject({ kind: 'may_contain', blocks: true });
  });

  it('marks a different variety as a weak match that is never auto-chosen', () => {
    const gfChicken: Product = { retailer: 'mock', id: 'p6', name: 'Free From Chicken Stock Cubes 8 Pack', price: 1.2, packQty: 8, packUnit: 'count', dietary: ['gluten_free'], allergens: [], mayContain: [], inStock: true };
    const gfBeefItem: Item = { id: 'gf-stock', name: 'gluten-free beef stock cube', aliases: [], category: 'food', defaultUnit: 'count', allergens: ['meat'], isStaple: false };
    const ctx = { active: activeConstraints([sam]), prefs: [], ownBrandOk: true, boughtBefore: new Set<string>() };
    const ranked = rankProducts([stockCube, gfChicken], gfBeefItem, 1, 'count', ctx);
    const chicken = ranked.find(r => r.product.id === 'p6')!;
    expect(chicken.weak).toBe(true);
    expect(chicken.blocked).toBe(false);
    expect(ranked.find(r => r.product.id === 'p5')!.blocked).toBe(true);
    expect(ranked.find(r => !r.weak && !r.blocked)).toBeUndefined();
  });

  it('only avoids, not blocks, at "avoid" strictness', () => {
    const avoid: Member = { ...sam, constraints: [{ kind: 'gluten_free', strictness: 'avoid' }] };
    const status = productDietaryStatus(stockCube, items[5]!, activeConstraints([avoid]));
    expect(status).toMatchObject({ kind: 'may_contain', blocks: false });
  });
});
