import type { Item, Product, ProductPreference, Unit } from './types.js';
import { convert } from './units.js';
import { productDietaryStatus, type ActiveConstraints, type ProductDietaryStatus } from './diet.js';
import { normaliseName } from './parse.js';

export interface PackPlan {
  packs: number;
  totalQty: number;
  unit: Unit;
  overshoot: number;
}

/** How many of this product cover the quantity needed. Null when units cannot be reconciled. */
export function packsNeeded(product: Product, needQty: number, needUnit: Unit, item: Item): PackPlan | null {
  const perPack = product.packQty * (product.packCount ?? 1);
  let perPackInNeed = convert(perPack, product.packUnit, needUnit, item);
  // Spoonfuls of something sold by weight with no known density: treat it as water-like rather than giving up.
  if ((perPackInNeed === null || perPackInNeed <= 0) && !item.densityGPerMl) perPackInNeed = convert(perPack, product.packUnit, needUnit, { ...item, densityGPerMl: 1 });
  if (perPackInNeed === null || perPackInNeed <= 0) {
    if (needUnit === 'count' || needUnit === 'tin' || needUnit === 'pack') {
      if (product.packUnit === 'count' || product.packUnit === 'tin' || product.packUnit === 'pack') {
        // Counted need, counted product: one per item needed.
        const packs = Math.max(1, Math.ceil(needQty / (product.packCount ?? 1)));
        return { packs, totalQty: packs * (product.packCount ?? 1), unit: needUnit, overshoot: packs * (product.packCount ?? 1) - needQty };
      }
      // "2 carrots" against a 1kg bag: one bag covers it.
      return { packs: 1, totalQty: needQty, unit: needUnit, overshoot: 0 };
    }
    // A handful, bunch, clove or slice of something sold by weight or count: one pack covers it.
    if (['handful', 'bunch', 'clove', 'slice', 'sheet', 'pinch', 'cup', 'tsp', 'tbsp'].includes(needUnit)) {
      return { packs: 1, totalQty: needQty, unit: needUnit, overshoot: 0 };
    }
    return null;
  }
  const packs = Math.max(1, Math.ceil(needQty / perPackInNeed - 1e-9));
  const total = packs * perPackInNeed;
  return { packs, totalQty: total, unit: needUnit, overshoot: total - needQty };
}

export interface MatchContext {
  active: ActiveConstraints;
  prefs: ProductPreference[];
  ownBrandOk: boolean;
  /** Product ids bought before (from order history). */
  boughtBefore: Set<string>;
  /** Extra words from what the user said ("medium") that should steer between otherwise equal products. */
  preferWords?: string[];
}

export interface RankedProduct {
  product: Product;
  plan: PackPlan;
  lineTotal: number;
  score: number;
  dietary: ProductDietaryStatus;
  blocked: boolean;
  /** Name match is partial: likely a different variety. Never auto-chosen. */
  weak: boolean;
  reasons: string[];
}

/** Words that don't distinguish one product from another. */
const GENERIC = new Set(['fresh', 'large', 'small', 'medium', 'dried', 'ground', 'whole', 'pack', 'tin', 'free', 'from', 'gluten', 'gf', 'british', 'loose', 'organic']);
const stem = (w: string) => w.replace(/ies$/, 'y').replace(/(es|s)$/, '');

/**
 * Fraction of the item's distinguishing words found in the product name, best over the item's aliases.
 * 1 = every distinguishing word present. Below 1 the match is "weak": the product may be a different
 * variety (chicken stock for a beef stock need) and must not be chosen automatically.
 */
export function nameScore(names: string[], productName: string): number {
  const have = normaliseName(productName).split(' ').map(stem).filter(Boolean);
  let best = 0;
  for (const name of names) {
    const want = normaliseName(name).split(' ').map(stem).filter(w => w.length >= 3 && !GENERIC.has(w));
    if (want.length === 0) continue;
    const hits = want.filter(w => have.some(h => h === w || (w.length >= 4 && (h.includes(w) || w.includes(h))))).length;
    best = Math.max(best, hits / want.length);
  }
  return best;
}

/**
 * Rank candidate products for one ingredient need.
 * Hard rule: a product that violates a strict constraint is marked blocked and sorted last.
 */
export function rankProducts(candidates: Product[], item: Item, needQty: number, needUnit: Unit, ctx: MatchContext): RankedProduct[] {
  const pref = ctx.prefs.find(p => p.itemId === item.id);
  const out: RankedProduct[] = [];
  for (const product of candidates) {
    if (!product.inStock) continue;
    const plan = packsNeeded(product, needQty, needUnit, item);
    if (!plan) continue;
    const dietary = productDietaryStatus(product, item, ctx.active);
    const blocked = 'blocks' in dietary && dietary.blocks;
    const reasons: string[] = [];
    let score = 0;

    const ns = nameScore([item.name, ...item.aliases], product.name);
    if (ns === 0) continue;
    score += ns * 40;
    const weak = ns < 1;
    if (weak) reasons.push('partial name match');

    if (pref && pref.productId === product.id && pref.retailer === product.retailer) { score += 100; reasons.push('your usual'); }
    else if (ctx.boughtBefore.has(product.id)) { score += 25; reasons.push('bought before'); }

    // Prefer the smallest overshoot relative to need.
    const overshootRatio = needQty > 0 ? plan.overshoot / needQty : 0;
    score -= Math.min(30, overshootRatio * 20);

    const lineTotal = Math.round(plan.packs * product.price * 100) / 100;
    // Cheaper is better, scaled gently so it never beats a preference.
    score -= lineTotal;

    if (product.ownBrand && !ctx.ownBrandOk) score -= 15;

    if (ctx.preferWords?.length) {
      const pn = normaliseName(product.name);
      for (const w of ctx.preferWords) if (pn.includes(w)) { score += 15; reasons.push(`"${w}" as you said`); }
    }

    if (dietary.kind === 'verified') { score += 10; reasons.push(`${dietary.allergen}-free (label)`); }
    if (dietary.kind === 'naturally_free') reasons.push(`naturally ${dietary.allergen}-free`);
    if (dietary.kind === 'may_contain') { score -= 20; reasons.push(`may contain ${dietary.allergen}`); }
    if (dietary.kind === 'contains') { score -= 60; reasons.push(`contains ${dietary.allergen}`); }
    if (dietary.kind === 'unverified') { score -= 30; reasons.push(`${dietary.allergen}-free not verified`); }
    if (blocked) score -= 1000;

    out.push({ product, plan, lineTotal, score, dietary, blocked, weak, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}
