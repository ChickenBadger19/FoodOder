import type { IngredientLine, Item, Unit } from './types.js';

const UNIT_ALIASES: Record<string, Unit> = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup',
  sheet: 'sheet', sheets: 'sheet',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  tin: 'tin', tins: 'tin', can: 'tin', cans: 'tin',
  pack: 'pack', packs: 'pack', packet: 'pack', packets: 'pack',
  bunch: 'bunch', bunches: 'bunch',
  handful: 'handful', handfuls: 'handful',
  pinch: 'pinch', pinches: 'pinch',
};

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

function parseNumber(token: string): number | null {
  const t = token.trim();
  if (t in FRACTIONS) return FRACTIONS[t]!;
  const mixed = t.match(/^(\d+)\s*(?:and\s*)?(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const mixedUni = t.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/);
  if (mixedUni) return Number(mixedUni[1]) + FRACTIONS[mixedUni[2]!]!;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const NUM = String.raw`(?:\d+\s*(?:and\s*)?\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])`;
const LEADING_QTY = new RegExp(`^(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*`, 'i');
const MULTIPACK = new RegExp(`^(${NUM})\\s*[x×]\\s*(${NUM})\\s*([a-z]+)\\b`, 'i');

/**
 * Parse a free-text ingredient line into quantity / unit / item name / prep.
 * Deterministic and dependency-free; an LLM can be used as a fallback for lines this gets wrong.
 */
export function parseIngredient(rawInput: string): IngredientLine {
  const raw = rawInput.trim();
  let text = raw.toLowerCase().replace(/\s+/g, ' ');
  let optional = false;
  let scaling: IngredientLine['scaling'] = 'linear';

  if (/\(optional\)|\boptional\b/.test(text)) {
    optional = true;
    text = text.replace(/\(optional\)|,?\s*optional/g, '').trim();
  }
  // Drop other parenthetical notes but keep a weight hint like "(400g)" for later.
  const parenWeight = text.match(/\((\d+(?:\.\d+)?)\s*(g|kg|ml|l)\)/);
  text = text.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();

  if (/\bto taste\b|\bfor seasoning\b|\bto season\b/.test(text)) {
    scaling = 'to_taste';
    text = text.replace(/,?\s*(to taste|for seasoning|to season)/g, '').trim();
  }

  // "a pinch of", "a handful of", "a splash of"
  text = text.replace(/^(a|an)\s+(pinch|handful|splash|dash|few|little)\s+of\s+/, (_m, _a, w) => {
    if (w === 'pinch' || w === 'splash' || w === 'dash' || w === 'little') scaling = 'to_taste';
    return w === 'handful' ? '1 handful ' : '';
  });
  text = text.replace(/^(a|an)\s+/, '1 ');
  text = text.replace(/^(juice|zest) of\s+/, '');

  let qty: number | null = null;
  let unit: Unit | null = null;
  let rest = text;

  const multi = text.match(MULTIPACK);
  if (multi && UNIT_ALIASES[multi[3]!.toLowerCase()]) {
    const n = parseNumber(multi[1]!);
    const each = parseNumber(multi[2]!);
    const u = UNIT_ALIASES[multi[3]!.toLowerCase()]!;
    if (n !== null && each !== null) {
      qty = n * each;
      unit = u;
      rest = text.slice(multi[0].length).trim();
      // "2 x 400g tins chopped tomatoes" -> skip the container word
      rest = rest.replace(/^(tins?|cans?|packs?|packets?|jars?|bottles?)\s+(of\s+)?/, '');
    }
  }

  if (qty === null) {
    const m = text.match(LEADING_QTY);
    if (m) {
      const a = parseNumber(m[1]!);
      const b = m[2] ? parseNumber(m[2]) : null;
      qty = b !== null && a !== null ? Math.max(a, b) : a;
      rest = text.slice(m[0].length).trim();
      const unitMatch = rest.match(/^([a-z]+)\.?\s*/);
      if (unitMatch && UNIT_ALIASES[unitMatch[1]!]) {
        unit = UNIT_ALIASES[unitMatch[1]!]!;
        rest = rest.slice(unitMatch[0].length).trim();
        rest = rest.replace(/^of\s+/, '');
      } else {
        unit = 'count';
      }
    }
  }

  // Container word after a number: "1 tin chopped tomatoes (400g)" -> use weight hint.
  if (unit === 'tin' && parenWeight) {
    const w = Number(parenWeight[1]);
    const wu = parenWeight[2] as Unit;
    if (qty !== null) { qty = qty * w; unit = wu; }
  }

  // Split prep from name on the first comma.
  let prep: string | undefined;
  const commaIdx = rest.indexOf(',');
  if (commaIdx >= 0) {
    prep = rest.slice(commaIdx + 1).trim() || undefined;
    rest = rest.slice(0, commaIdx).trim();
  }
  // Trailing prep phrases without a comma: "onions finely chopped"
  const prepMatch = rest.match(/\s+(finely |roughly |thinly )?(chopped|diced|sliced|minced|grated|crushed|peeled|beaten|melted|softened|torn|halved|quartered|shredded|cubed)\b.*$/);
  if (prepMatch) {
    prep = prep ?? rest.slice(prepMatch.index! + 1).trim();
    rest = rest.slice(0, prepMatch.index).trim();
  }
  rest = rest.replace(/^(of|fresh|large|small|medium|ripe|big)\s+/, '').trim();

  if (scaling === 'to_taste' && qty === null) unit = null;
  if (rest === 'salt and pepper' || rest === 'salt & pepper' || rest === 'seasoning') scaling = 'to_taste';

  return { raw, itemId: null, itemName: rest, qty, unit, prep, scaling, optional };
}

/** Find the catalogue item for an ingredient name using names and aliases; tolerant of plurals. */
const MODIFIERS = new Set(['fresh', 'large', 'small', 'medium', 'big', 'ripe', 'organic', 'free', 'range', 'british', 'extra', 'virgin', 'some', 'more', 'new', 'good', 'nice']);

export function resolveItem(name: string, items: Item[]): Item | null {
  const n = normaliseName(name).replace(/^(?:tins?|cans?|packs?|packets?|jars?|bottles?|bags?|boxes|box|bunch(?:es)?|handfuls?|cloves?|sticks?|stalks?|slices?|rashers?|fillets?|sprigs?|heads?|knobs?|sheets?|pieces?) (?:of )?(?=[a-z])/, '');
  if (!n) return null;
  const candidates = [n, n.replace(/ies$/, 'y'), n.replace(/es$/, ''), n.replace(/s$/, '')];
  for (const c of candidates) {
    for (const item of items) {
      if (normaliseName(item.name) === c) return item;
      if (item.aliases.some(a => normaliseName(a) === c)) return item;
    }
  }
  // Fallback: an item whose name is contained in the text, longest first, as long as the matched words
  // outnumber the unexplained ones ("medium freezer bags" -> freezer bags; "dishwasher salt" is NOT salt).
  const textWords = n.split(' ').filter(w => !MODIFIERS.has(w));
  const sorted = [...items].sort((a, b) => b.name.length - a.name.length);
  for (const item of sorted) {
    for (const w of [item.name, ...item.aliases].map(normaliseName)) {
      if (w.length <= 3 || !(` ${n} `).includes(` ${w} `)) continue;
      const matched = w.split(' ').length;
      const extra = textWords.length - textWords.filter(t => w.split(' ').includes(t)).length;
      if (matched > extra) return item;
    }
  }
  return null;
}

export function normaliseName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function resolveLines(lines: IngredientLine[], items: Item[]): IngredientLine[] {
  return lines.map(l => {
    const item = resolveItem(l.itemName, items);
    return { ...l, itemId: item?.id ?? null, itemName: item?.name ?? l.itemName };
  });
}
