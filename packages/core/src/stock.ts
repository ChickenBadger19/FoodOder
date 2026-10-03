import type { IngredientLine, Item, StockItem, Unit } from './types.js';
import type { ActiveConstraints } from './diet.js';
import { convert, toBase } from './units.js';
import type { ScaledRecipe } from './scale.js';

export interface Need {
  itemId: string;
  itemName: string;
  qty: number;
  unit: Unit;
  /** Lines contributing to this need, with the recipe they came from. */
  from: { recipeName: string; line: IngredientLine }[];
  toTaste: boolean;
}

/** Sum ingredient lines across recipes per item, in a base unit. Unresolved items are kept by name. */
export function aggregateNeeds(scaled: ScaledRecipe[], items: Item[]): Need[] {
  const byId = new Map(items.map(i => [i.id, i]));
  const needs = new Map<string, Need>();
  for (const s of scaled) {
    for (const line of s.lines) {
      const key = line.itemId ?? `name:${line.itemName}`;
      const item = line.itemId ? byId.get(line.itemId) : undefined;
      const existing = needs.get(key);
      const unitPref: Unit = item?.defaultUnit ?? line.unit ?? 'count';
      if (line.qty === null || line.unit === null) {
        const n = existing ?? { itemId: key, itemName: line.itemName, qty: 0, unit: unitPref, from: [], toTaste: true };
        n.from.push({ recipeName: s.recipe.name, line });
        needs.set(key, n);
        continue;
      }
      const target = existing?.unit ?? toBase(1, unitPref).unit;
      let q = convert(line.qty, line.unit, target, item);
      let unit = target;
      if (q === null) {
        // Can't convert; keep the line's own base unit if nothing is there yet.
        if (!existing) { const b = toBase(line.qty, line.unit); q = b.qty; unit = b.unit; }
        else { q = 0; }
      }
      if (!existing) {
        needs.set(key, { itemId: key, itemName: line.itemName, qty: q!, unit, from: [{ recipeName: s.recipe.name, line }], toTaste: false });
      } else {
        existing.qty += q!;
        existing.toTaste = false;
        existing.from.push({ recipeName: s.recipe.name, line });
      }
    }
  }
  return [...needs.values()];
}

export type ShortfallStatus = 'in_stock' | 'partial' | 'buy' | 'staple' | 'unknown_item';

export interface Shortfall {
  need: Need;
  item: Item | null;
  haveQty: number;
  buyQty: number;
  unit: Unit;
  status: ShortfallStatus;
  /** Stock entries that count towards this need. */
  covering: StockItem[];
  /** Stock entries that exist but were ignored because they violate an active strict constraint. */
  ignored: StockItem[];
  anyApprox: boolean;
}

/**
 * Subtract what is in stock from what is needed.
 * A stock item only covers a need if it does not violate an active constraint (e.g. ordinary pasta
 * does not cover a gluten-free pasta need when a strict gluten-free eater is present).
 */
export function computeShortfall(needs: Need[], stock: StockItem[], items: Item[], active: ActiveConstraints): Shortfall[] {
  const byId = new Map(items.map(i => [i.id, i]));
  return needs.map(need => {
    const item = byId.get(need.itemId) ?? null;
    if (!item) {
      return { need, item: null, haveQty: 0, buyQty: need.qty, unit: need.unit, status: 'unknown_item', covering: [], ignored: [], anyApprox: false };
    }
    const entries = stock.filter(s => s.itemId === item.id);
    const covering: StockItem[] = [];
    const ignored: StockItem[] = [];
    let have = 0;
    let anyApprox = false;
    for (const s of entries) {
      const violated = item.allergens.filter(a => active.allergens.has(a) && !s.freeFrom.includes(a));
      const blocks = violated.some(a => active.allergens.get(a) === 'strict' || active.allergens.get(a) === 'avoid');
      if (blocks) { ignored.push(s); continue; }
      const q = convert(s.qty, s.unit, need.unit, item);
      if (q === null) { ignored.push(s); continue; }
      have += q;
      covering.push(s);
      if (s.confidence === 'approx') anyApprox = true;
    }
    if (need.toTaste || item.isStaple) {
      const explicitlyOut = entries.length > 0 && have <= 0;
      return { need, item, haveQty: have, buyQty: explicitlyOut ? 1 : 0, unit: need.unit, status: explicitlyOut ? 'buy' : 'staple', covering, ignored, anyApprox };
    }
    const buy = Math.max(0, need.qty - have);
    const status: ShortfallStatus = buy <= 0 ? 'in_stock' : have > 0 ? 'partial' : 'buy';
    return { need, item, haveQty: have, buyQty: buy, unit: need.unit, status, covering, ignored, anyApprox };
  });
}

/** Deduct a cooked recipe's lines from stock. Returns the updated stock list (does not persist). */
export function deductCooked(lines: IngredientLine[], stock: StockItem[], items: Item[]): { stock: StockItem[]; changes: { stockId: string; before: number; after: number }[] } {
  const byId = new Map(items.map(i => [i.id, i]));
  const next = stock.map(s => ({ ...s }));
  const changes: { stockId: string; before: number; after: number }[] = [];
  for (const line of lines) {
    if (!line.itemId || line.qty === null || line.unit === null) continue;
    const item = byId.get(line.itemId);
    if (!item || item.isStaple) continue;
    let remaining = line.qty;
    // Use opened/approx items first, then oldest.
    const entries = next.filter(s => s.itemId === item.id).sort((a, b) => (a.confidence === 'approx' ? -1 : 1) - (b.confidence === 'approx' ? -1 : 1));
    for (const s of entries) {
      if (remaining <= 0) break;
      const q = convert(remaining, line.unit, s.unit, item);
      if (q === null) continue;
      const before = s.qty;
      const take = Math.min(s.qty, q);
      s.qty = Math.max(0, s.qty - take);
      s.confidence = s.qty > 0 ? 'approx' : s.confidence;
      remaining -= convert(take, s.unit, line.unit, item) ?? take;
      changes.push({ stockId: s.id, before, after: s.qty });
    }
  }
  return { stock: next.filter(s => s.qty > 0), changes };
}
