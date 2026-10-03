import { describe, expect, it } from 'vitest';
import { convert, roundKitchen, toBase } from '../src/units.js';
import { scaleRecipe } from '../src/scale.js';
import type { Recipe } from '../src/types.js';

describe('units', () => {
  it('converts within a dimension', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500);
    expect(convert(2, 'tbsp', 'ml')).toBe(30);
    expect(convert(500, 'ml', 'l')).toBe(0.5);
  });
  it('crosses dimensions with item data', () => {
    expect(convert(1, 'cup', 'g', { densityGPerMl: 0.6 })).toBe(150);
    expect(convert(3, 'count', 'g', { unitWeightG: 150 })).toBe(450);
    expect(convert(300, 'g', 'count', { unitWeightG: 150 })).toBe(2);
  });
  it('refuses impossible conversions', () => {
    expect(convert(1, 'cup', 'g')).toBeNull();
    expect(convert(1, 'sheet', 'clove')).toBeNull();
  });
  it('reduces to base units', () => {
    expect(toBase(2, 'kg')).toEqual({ qty: 2000, unit: 'g' });
    expect(toBase(3, 'sheet')).toEqual({ qty: 3, unit: 'sheet' });
  });
  it('rounds to kitchen amounts', () => {
    expect(roundKitchen(347, 'g')).toBe(350);
    expect(roundKitchen(1.333, 'count')).toBe(1.5);
    expect(roundKitchen(0.9, 'tsp')).toBe(1);
    expect(roundKitchen(1125, 'ml')).toBe(1125);
  });
});

describe('scaleRecipe', () => {
  const recipe: Recipe = {
    id: 'r', name: 'Test', servings: 4, source: { type: 'manual' }, steps: [],
    ingredients: [
      { raw: '500g mince', itemId: 'mince', itemName: 'beef mince', qty: 500, unit: 'g', scaling: 'linear' },
      { raw: '1 bay leaf', itemId: 'bay', itemName: 'bay leaf', qty: 1, unit: 'count', scaling: 'fixed' },
      { raw: 'salt', itemId: 'salt', itemName: 'salt', qty: null, unit: null, scaling: 'to_taste' },
      { raw: '2 onions', itemId: 'onion', itemName: 'onion', qty: 2, unit: 'count', scaling: 'linear' },
    ],
  };
  it('scales linear lines and leaves fixed / to-taste alone', () => {
    const s = scaleRecipe(recipe, 6);
    expect(s.factor).toBe(1.5);
    expect(s.lines[0]!.qty).toBe(750);
    expect(s.lines[1]!.qty).toBe(1);
    expect(s.lines[2]!.qty).toBeNull();
    expect(s.lines[3]!.qty).toBe(3);
  });
  it('rounds scaled counts to halves', () => {
    const s = scaleRecipe(recipe, 5);
    expect(s.lines[3]!.qty).toBe(2.5);
  });
});
