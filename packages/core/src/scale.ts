import type { IngredientLine, Recipe } from './types.js';
import { roundKitchen } from './units.js';

export interface ScaledRecipe {
  recipe: Recipe;
  targetServings: number;
  factor: number;
  lines: IngredientLine[];
}

export function scaleLine(line: IngredientLine, factor: number): IngredientLine {
  if (line.qty === null || line.unit === null) return { ...line };
  if (line.scaling === 'to_taste') return { ...line };
  if (line.scaling === 'fixed') return { ...line };
  const scaled = line.qty * factor;
  return { ...line, qty: roundKitchen(scaled, line.unit) };
}

export function scaleRecipe(recipe: Recipe, targetServings: number): ScaledRecipe {
  const base = recipe.servings > 0 ? recipe.servings : 1;
  const factor = targetServings / base;
  return {
    recipe,
    targetServings,
    factor,
    lines: recipe.ingredients.map(l => scaleLine(l, factor)),
  };
}
