/** Units we understand. Mass and volume convert between themselves; count-like units are opaque. */
export type Unit =
  | 'g' | 'kg'
  | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup'
  | 'count' | 'sheet' | 'clove' | 'slice' | 'tin' | 'pack' | 'bunch' | 'handful' | 'pinch';

export type Dimension = 'mass' | 'volume' | 'count';

export type AllergenTag =
  | 'gluten' | 'dairy' | 'nuts' | 'peanuts' | 'egg' | 'soy' | 'fish' | 'shellfish' | 'sesame'
  | 'meat' | 'animal';

export type ConstraintKind =
  | 'gluten_free' | 'dairy_free' | 'nut_free' | 'egg_free' | 'vegetarian' | 'vegan' | 'dislike';

export type Strictness = 'preference' | 'avoid' | 'strict';

export type ItemCategory = 'food' | 'household' | 'toiletries' | 'pet';

/** A canonical thing you can have in stock or buy: "beef mince", "bleach". */
export interface Item {
  id: string;
  name: string;
  aliases: string[];
  category: ItemCategory;
  defaultUnit: Unit;
  allergens: AllergenTag[];
  isStaple: boolean;
  /** For volume <-> mass conversion (water = 1). */
  densityGPerMl?: number;
  /** Typical weight of one "count" of this item, for count <-> mass. */
  unitWeightG?: number;
}

export type Scaling = 'linear' | 'fixed' | 'to_taste';

export interface IngredientLine {
  raw: string;
  itemId: string | null;
  itemName: string;
  qty: number | null;
  unit: Unit | null;
  prep?: string;
  scaling: Scaling;
  optional?: boolean;
  /** Set by dietary substitution: the itemName this line was swapped from. */
  swappedFrom?: string;
  swapReason?: string;
}

export interface Recipe {
  id: string;
  name: string;
  servings: number;
  source: { type: 'url' | 'llm' | 'manual' | 'seed'; ref?: string };
  ingredients: IngredientLine[];
  steps: string[];
}

export interface Constraint {
  kind: ConstraintKind;
  strictness: Strictness;
  /** For 'dislike': the item disliked. */
  itemId?: string;
}

export interface Member {
  id: string;
  name: string;
  eatsByDefault: boolean;
  constraints: Constraint[];
}

export type StockLocation = 'fridge' | 'freezer' | 'cupboard' | 'household';

export interface StockItem {
  id: string;
  itemId: string;
  qty: number;
  unit: Unit;
  confidence: 'exact' | 'approx';
  location: StockLocation;
  /** Allergens this specific stock item is verified free from (e.g. a GF pasta). */
  freeFrom: AllergenTag[];
  boughtAt?: string;
  expiresAt?: string;
  note?: string;
}

export type DietaryClaim = 'gluten_free' | 'dairy_free' | 'nut_free' | 'vegetarian' | 'vegan';

/** A retailer product card, normalised across retailers. */
export interface Product {
  retailer: string;
  id: string;
  name: string;
  /** GBP */
  price: number;
  packQty: number;
  packUnit: Unit;
  /** Multipack count, e.g. 4 x 400g tins -> packCount 4, packQty 400, packUnit g. */
  packCount?: number;
  dietary: DietaryClaim[];
  allergens: AllergenTag[];
  mayContain: AllergenTag[];
  inStock: boolean;
  brand?: string;
  ownBrand?: boolean;
  imageUrl?: string;
}

export interface ProductPreference {
  itemId: string;
  retailer: string;
  productId: string;
  alwaysAsk: boolean;
}
