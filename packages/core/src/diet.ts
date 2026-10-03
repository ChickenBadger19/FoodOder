import type { AllergenTag, Constraint, ConstraintKind, IngredientLine, Item, Member, Product, Strictness } from './types.js';

export const CONSTRAINT_ALLERGENS: Record<Exclude<ConstraintKind, 'dislike'>, AllergenTag[]> = {
  gluten_free: ['gluten'],
  dairy_free: ['dairy'],
  nut_free: ['nuts', 'peanuts'],
  egg_free: ['egg'],
  soy_free: ['soy'],
  fish_free: ['fish'],
  shellfish_free: ['shellfish'],
  sesame_free: ['sesame'],
  vegetarian: ['meat', 'fish', 'shellfish'],
  pescatarian: ['meat'],
  vegan: ['meat', 'fish', 'shellfish', 'dairy', 'egg', 'animal'],
};

const STRICT_ORDER: Strictness[] = ['preference', 'avoid', 'strict'];

export function stricter(a: Strictness, b: Strictness): Strictness {
  return STRICT_ORDER.indexOf(a) >= STRICT_ORDER.indexOf(b) ? a : b;
}

/** Allergens that must be avoided for the people eating, with the strongest strictness requested. */
export type ActiveConstraints = {
  allergens: Map<AllergenTag, Strictness>;
  dislikes: Map<string, { strictness: Strictness; who: string[] }>;
  who: string[];
};

export function activeConstraints(eaters: Member[]): ActiveConstraints {
  const allergens = new Map<AllergenTag, Strictness>();
  const dislikes = new Map<string, { strictness: Strictness; who: string[] }>();
  for (const m of eaters) {
    for (const c of m.constraints) {
      if (c.kind === 'dislike') {
        if (!c.itemId) continue;
        const cur = dislikes.get(c.itemId);
        dislikes.set(c.itemId, { strictness: cur ? stricter(cur.strictness, c.strictness) : c.strictness, who: [...(cur?.who ?? []), m.name] });
        continue;
      }
      for (const tag of CONSTRAINT_ALLERGENS[c.kind]) {
        const cur = allergens.get(tag);
        allergens.set(tag, cur ? stricter(cur, c.strictness) : c.strictness);
      }
    }
  }
  return { allergens, dislikes, who: eaters.map(m => m.name) };
}

/** Combine constraints from several meals: strictest wins per allergen, dislikes union. */
export function mergeActive(list: ActiveConstraints[]): ActiveConstraints {
  const allergens = new Map<AllergenTag, Strictness>();
  const dislikes = new Map<string, { strictness: Strictness; who: string[] }>();
  const who = new Set<string>();
  for (const a of list) {
    for (const [tag, s] of a.allergens) { const cur = allergens.get(tag); allergens.set(tag, cur ? stricter(cur, s) : s); }
    for (const [id, d] of a.dislikes) { const cur = dislikes.get(id); dislikes.set(id, { strictness: cur ? stricter(cur.strictness, d.strictness) : d.strictness, who: [...new Set([...(cur?.who ?? []), ...d.who])] }); }
    for (const w of a.who) who.add(w);
  }
  return { allergens, dislikes, who: [...who] };
}

export function itemViolations(item: Item, active: ActiveConstraints): AllergenTag[] {
  return item.allergens.filter(a => active.allergens.has(a));
}

export interface Substitution {
  itemId: string;
  /** Which allergen this substitution removes. */
  allergen: AllergenTag;
  substituteItemId: string;
}

/** Swap offending ingredient lines for their substitutes, marking what changed. */
export function applySubstitutions(
  lines: IngredientLine[],
  items: Item[],
  subs: Substitution[],
  active: ActiveConstraints,
): IngredientLine[] {
  const byId = new Map(items.map(i => [i.id, i]));
  return lines.map(line => {
    if (!line.itemId) return line;
    const item = byId.get(line.itemId);
    if (!item) return line;
    const violations = itemViolations(item, active);
    if (violations.length === 0) {
      const dislike = active.dislikes.get(item.id);
      if (dislike) return { ...line, swapReason: `${dislike.who.join(', ')} dislike${dislike.who.length === 1 ? 's' : ''} ${item.name}` };
      return line;
    }
    for (const v of violations) {
      const sub = subs.find(s => s.itemId === item.id && s.allergen === v);
      if (sub) {
        const to = byId.get(sub.substituteItemId);
        if (to && itemViolations(to, active).length === 0) {
          return { ...line, itemId: to.id, itemName: to.name, swappedFrom: item.name, swapReason: `${v}-free for ${active.who.join(', ')}` };
        }
      }
    }
    return { ...line, swapReason: `contains ${violations.join(', ')}; no ${violations[0]}-free swap in the catalogue yet` };
  });
}

export type ProductDietaryStatus =
  | { kind: 'ok' }                               // no active constraint touches this product
  | { kind: 'verified'; allergen: AllergenTag }   // product carries a free-from claim
  | { kind: 'naturally_free'; allergen: AllergenTag } // item itself never contains it and product has no allergen/may-contain
  | { kind: 'may_contain'; allergen: AllergenTag; blocks: boolean }
  | { kind: 'contains'; allergen: AllergenTag; blocks: boolean }
  | { kind: 'unverified'; allergen: AllergenTag; blocks: boolean };

const CLAIM_FOR: Partial<Record<AllergenTag, Product['dietary'][number]>> = {
  gluten: 'gluten_free', dairy: 'dairy_free', nuts: 'nut_free', peanuts: 'nut_free', meat: 'vegetarian', fish: 'vegetarian', shellfish: 'vegetarian', egg: 'vegan', animal: 'vegan',
  // soy / sesame have no common "free from" claim on UK labels: products are judged on allergen lists only.
};

/** Evaluate a product against the active constraints for the item it would fulfil. */
export function productDietaryStatus(product: Product, item: Item, active: ActiveConstraints): ProductDietaryStatus {
  for (const [allergen, strictness] of active.allergens) {
    const relevant = item.allergens.includes(allergen) || product.allergens.includes(allergen) || product.mayContain.includes(allergen);
    const blocks = strictness === 'strict';
    if (product.allergens.includes(allergen)) return { kind: 'contains', allergen, blocks };
    const claim = CLAIM_FOR[allergen];
    const verified = claim ? product.dietary.includes(claim) : false;
    if (product.mayContain.includes(allergen)) {
      // Strict excludes may-contain even with a claim; avoid tolerates it with a claim.
      if (verified && strictness !== 'strict') return { kind: 'verified', allergen };
      return { kind: 'may_contain', allergen, blocks };
    }
    if (verified) return { kind: 'verified', allergen };
    if (!relevant) return { kind: 'naturally_free', allergen };
    // The item category normally contains this allergen but the product makes no claim.
    return { kind: 'unverified', allergen, blocks };
  }
  return { kind: 'ok' };
}

export function constraintLabel(c: Constraint, items?: Item[]): string {
  if (c.kind === 'dislike') {
    const name = items?.find(i => i.id === c.itemId)?.name ?? 'something';
    return `dislikes ${name}`;
  }
  return c.kind.replace('_', '-');
}
