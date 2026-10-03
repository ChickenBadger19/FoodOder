import type { Dimension, Item, Unit } from './types.js';

const MASS_G: Record<string, number> = { g: 1, kg: 1000 };
const VOLUME_ML: Record<string, number> = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 250 };
const COUNT_UNITS: Unit[] = ['count', 'sheet', 'clove', 'slice', 'tin', 'pack', 'bunch', 'handful', 'pinch'];

export const ALL_UNITS: Unit[] = [...(Object.keys(MASS_G) as Unit[]), ...(Object.keys(VOLUME_ML) as Unit[]), ...COUNT_UNITS];

export function dimension(unit: Unit): Dimension {
  if (unit in MASS_G) return 'mass';
  if (unit in VOLUME_ML) return 'volume';
  return 'count';
}

export type BaseUnit = 'g' | 'ml' | 'count';

/** Reduce to g / ml / count. Count-like units other than 'count' keep their identity in `unit`. */
export function toBase(qty: number, unit: Unit): { qty: number; unit: Unit } {
  const d = dimension(unit);
  if (d === 'mass') return { qty: qty * MASS_G[unit]!, unit: 'g' };
  if (d === 'volume') return { qty: qty * VOLUME_ML[unit]!, unit: 'ml' };
  return { qty, unit };
}

/**
 * Convert between units, using the item's density / unit weight when crossing dimensions.
 * Returns null when no conversion is possible.
 */
export function convert(qty: number, from: Unit, to: Unit, item?: Pick<Item, 'densityGPerMl' | 'unitWeightG'>): number | null {
  if (from === to) return qty;
  const df = dimension(from);
  const dt = dimension(to);

  const fromBase = toBase(qty, from);

  // Same dimension.
  if (df === dt) {
    if (df === 'mass') return fromBase.qty / MASS_G[to]!;
    if (df === 'volume') return fromBase.qty / VOLUME_ML[to]!;
    // count-like to count-like: only identical units or 'count' are interchangeable
    if (from === 'count' || to === 'count') return qty;
    return null;
  }

  // Cross-dimension via item data.
  let grams: number | null = null;
  if (df === 'mass') grams = fromBase.qty;
  else if (df === 'volume' && item?.densityGPerMl) grams = fromBase.qty * item.densityGPerMl;
  else if (df === 'count' && item?.unitWeightG && (from === 'count')) grams = qty * item.unitWeightG;
  if (grams === null) return null;

  if (dt === 'mass') return grams / MASS_G[to]!;
  if (dt === 'volume' && item?.densityGPerMl) return grams / item.densityGPerMl / VOLUME_ML[to]!;
  if (dt === 'count' && item?.unitWeightG && to === 'count') return grams / item.unitWeightG;
  return null;
}

export function isCountUnit(unit: Unit): boolean {
  return COUNT_UNITS.includes(unit);
}

/** Round to a sensible kitchen amount for display. */
export function roundKitchen(qty: number, unit: Unit): number {
  const d = dimension(unit);
  if (d === 'count') {
    if (unit === 'count' || unit === 'clove' || unit === 'sheet' || unit === 'slice' || unit === 'tin' || unit === 'pack') {
      return Math.max(0.5, Math.round(qty * 2) / 2);
    }
    return Math.max(1, Math.round(qty));
  }
  if (unit === 'tsp' || unit === 'tbsp') return Math.max(0.25, Math.round(qty * 4) / 4);
  if (unit === 'cup') return Math.max(0.25, Math.round(qty * 4) / 4);
  if (unit === 'kg' || unit === 'l') return Math.round(qty * 100) / 100;
  // g / ml
  if (qty < 20) return Math.max(1, Math.round(qty));
  if (qty < 100) return Math.round(qty / 5) * 5;
  if (qty < 1000) return Math.round(qty / 10) * 10;
  return Math.round(qty / 25) * 25;
}

export function formatQty(qty: number | null, unit: Unit | null): string {
  if (qty === null) return '';
  const q = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
  if (!unit || unit === 'count') return q;
  if (unit === 'g' || unit === 'kg' || unit === 'ml' || unit === 'l') return `${q} ${unit}`;
  const plural = qty !== 1 && ['sheet', 'clove', 'slice', 'tin', 'pack', 'bunch', 'handful', 'pinch'].includes(unit);
  return `${q} ${unit}${plural ? 's' : ''}`;
}
