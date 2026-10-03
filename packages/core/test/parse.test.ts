import { describe, expect, it } from 'vitest';
import { parseIngredient, resolveItem } from '../src/parse.js';
import type { Item } from '../src/types.js';

describe('parseIngredient', () => {
  it('parses weight + name', () => {
    const l = parseIngredient('500g beef mince');
    expect(l).toMatchObject({ qty: 500, unit: 'g', itemName: 'beef mince', scaling: 'linear' });
  });

  it('parses counts and prep after a comma', () => {
    const l = parseIngredient('2 onions, finely chopped');
    expect(l).toMatchObject({ qty: 2, unit: 'count', itemName: 'onions', prep: 'finely chopped' });
  });

  it('parses multipacks into total weight', () => {
    const l = parseIngredient('2 x 400g tins chopped tomatoes');
    expect(l).toMatchObject({ qty: 800, unit: 'g', itemName: 'chopped tomatoes' });
  });

  it('uses a bracketed weight for tins', () => {
    const l = parseIngredient('1 tin chopped tomatoes (400g)');
    expect(l).toMatchObject({ qty: 400, unit: 'g', itemName: 'chopped tomatoes' });
  });

  it('handles spoons and "of"', () => {
    expect(parseIngredient('1 tbsp of olive oil')).toMatchObject({ qty: 1, unit: 'tbsp', itemName: 'olive oil' });
    expect(parseIngredient('2 tsp ground cumin')).toMatchObject({ qty: 2, unit: 'tsp', itemName: 'ground cumin' });
  });

  it('handles fractions and ranges', () => {
    expect(parseIngredient('½ tsp salt')).toMatchObject({ qty: 0.5, unit: 'tsp' });
    expect(parseIngredient('1 1/2 cups rice')).toMatchObject({ qty: 1.5, unit: 'cup' });
    expect(parseIngredient('1-2 red chillies')).toMatchObject({ qty: 2, unit: 'count', itemName: 'red chillies' });
  });

  it('marks to-taste lines', () => {
    const l = parseIngredient('salt and pepper, to taste');
    expect(l.scaling).toBe('to_taste');
    expect(l.qty).toBeNull();
    expect(parseIngredient('a pinch of nutmeg')).toMatchObject({ scaling: 'to_taste', itemName: 'nutmeg' });
  });

  it('marks optional lines', () => {
    expect(parseIngredient('1 handful fresh basil (optional)')).toMatchObject({ optional: true, qty: 1, unit: 'handful', itemName: 'basil' });
  });

  it('handles sheets and cloves', () => {
    expect(parseIngredient('9 lasagne sheets')).toMatchObject({ qty: 9, unit: 'count', itemName: 'lasagne sheets' });
    expect(parseIngredient('3 cloves garlic, crushed')).toMatchObject({ qty: 3, unit: 'clove', itemName: 'garlic', prep: 'crushed' });
  });

  it('handles "juice of"', () => {
    expect(parseIngredient('juice of 1 lemon')).toMatchObject({ qty: 1, unit: 'count', itemName: 'lemon' });
  });
});

describe('resolveItem', () => {
  const items: Item[] = [
    { id: 'onion', name: 'onion', aliases: ['onions', 'brown onion'], category: 'food', defaultUnit: 'count', allergens: [], isStaple: false },
    { id: 'beef-mince', name: 'beef mince', aliases: ['minced beef'], category: 'food', defaultUnit: 'g', allergens: ['meat'], isStaple: false },
    { id: 'chopped-tomatoes', name: 'chopped tomatoes', aliases: ['tinned tomatoes'], category: 'food', defaultUnit: 'g', allergens: [], isStaple: false },
    { id: 'tomato', name: 'tomato', aliases: ['tomatoes'], category: 'food', defaultUnit: 'count', allergens: [], isStaple: false },
  ];
  it('matches plurals and aliases', () => {
    expect(resolveItem('onions', items)?.id).toBe('onion');
    expect(resolveItem('minced beef', items)?.id).toBe('beef-mince');
  });
  it('prefers the longest contained name', () => {
    expect(resolveItem('tins of chopped tomatoes', items)?.id).toBe('chopped-tomatoes');
  });
  it('returns null for unknowns', () => {
    expect(resolveItem('dragon fruit', items)).toBeNull();
  });
});
