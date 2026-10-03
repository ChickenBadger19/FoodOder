/**
 * Merge the generated catalogue files into packages/app/src/data/catalogue.json (items) and
 * packages/retailers/src/data/products.json (mock retailer products), applying aliasOf entries to the
 * hand-written items by writing packages/app/src/data/aliases.json.
 *
 *   pnpm --filter @foodify/app exec tsx scripts/build-catalogue.mts <dir-with-json>
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Item, Product, Unit } from '@foodify/core';
import { normaliseName, resolveItem } from '@foodify/core';
import { ITEMS } from '../src/seed.js';

const dir = process.argv[2]!;
const UNITS = new Set<Unit>(['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'count', 'sheet', 'clove', 'slice', 'tin', 'pack', 'bunch', 'handful', 'pinch']);
const ALLERGENS = new Set(['gluten', 'dairy', 'nuts', 'peanuts', 'egg', 'soy', 'fish', 'shellfish', 'sesame', 'meat', 'animal']);
const DIETARY = new Set(['gluten_free', 'dairy_free', 'nut_free', 'vegetarian', 'vegan']);

type RawProduct = { name: string; price: number; packQty: number; packUnit: string; packCount?: number | null; dietary?: string[]; allergens?: string[]; mayContain?: string[]; ownBrand?: boolean; brand?: string | null };
type RawItem = { id: string; name: string; aliases?: string[]; category?: string; defaultUnit: string; allergens?: string[]; isStaple?: boolean; unitWeightG?: number | null; densityGPerMl?: number | null; products?: RawProduct[] };
type RawAlias = { aliasOf: string; aliases: string[] };

const items = new Map<string, Item>();
const aliases: Record<string, string[]> = {};
const products: Omit<Product, 'retailer'>[] = [];
const problems: string[] = [];
const existingIds = new Set(ITEMS.map(i => i.id));
const seenNames = new Map<string, string>();
for (const i of ITEMS) { seenNames.set(normaliseName(i.name), i.id); for (const a of i.aliases) seenNames.set(normaliseName(a), i.id); }
let pn = 0;

for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  let arr: (RawItem | RawAlias)[];
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { problems.push(`${f}: invalid JSON ${(e as Error).message}`); continue; }
  for (const e of arr) {
    if ('aliasOf' in e) {
      if (!existingIds.has(e.aliasOf) && !items.has(e.aliasOf)) { problems.push(`${f}: aliasOf unknown item ${e.aliasOf}`); continue; }
      const target = items.get(e.aliasOf);
      for (const a of e.aliases ?? []) {
        const n = normaliseName(a);
        if (seenNames.has(n)) continue;
        seenNames.set(n, e.aliasOf);
        if (target) target.aliases.push(a); else (aliases[e.aliasOf] ??= []).push(a);
      }
      continue;
    }
    const r = e as RawItem;
    const id = String(r.id ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!id || !r.name) { problems.push(`${f}: bad item ${JSON.stringify(r).slice(0, 60)}`); continue; }
    if (existingIds.has(id) || items.has(id)) { problems.push(`${f}: duplicate id ${id} (merged as aliases)`); const t = items.get(id); const names = [r.name, ...(r.aliases ?? [])]; for (const a of names) { const n = normaliseName(a); if (!seenNames.has(n)) { seenNames.set(n, id); if (t) t.aliases.push(a); else (aliases[id] ??= []).push(a); } } continue; }
    const dup = seenNames.get(normaliseName(r.name));
    if (dup) { problems.push(`${f}: "${r.name}" already names ${dup}; its aliases were merged`); const t = items.get(dup); for (const a of r.aliases ?? []) { const n = normaliseName(a); if (!seenNames.has(n)) { seenNames.set(n, dup); if (t) t.aliases.push(a); else (aliases[dup] ??= []).push(a); } } continue; }
    const unit = UNITS.has(r.defaultUnit as Unit) ? (r.defaultUnit as Unit) : 'g';
    const item: Item = {
      id, name: r.name.trim().toLowerCase(),
      aliases: [], category: (['food', 'household', 'toiletries', 'pet'].includes(r.category ?? '') ? r.category : 'food') as Item['category'],
      defaultUnit: unit,
      allergens: (r.allergens ?? []).filter(a => ALLERGENS.has(a)) as Item['allergens'],
      isStaple: !!r.isStaple,
    };
    if (r.unitWeightG) item.unitWeightG = r.unitWeightG;
    if (r.densityGPerMl) item.densityGPerMl = r.densityGPerMl;
    seenNames.set(normaliseName(item.name), id);
    for (const a of r.aliases ?? []) { const n = normaliseName(a); if (!seenNames.has(n) && n !== normaliseName(item.name)) { seenNames.set(n, id); item.aliases.push(a); } }
    items.set(id, item);
    for (const p of r.products ?? []) {
      if (!p?.name || !(p.price > 0) || !(p.packQty > 0) || !UNITS.has(p.packUnit as Unit)) { problems.push(`${f}: bad product for ${id}`); continue; }
      const prod: Omit<Product, 'retailer'> = {
        id: `g${++pn}`, name: p.name, price: Math.round(p.price * 100) / 100, packQty: p.packQty, packUnit: p.packUnit as Unit,
        dietary: (p.dietary ?? []).filter(d => DIETARY.has(d)) as Product['dietary'],
        allergens: (p.allergens ?? []).filter(a => ALLERGENS.has(a)) as Product['allergens'],
        mayContain: (p.mayContain ?? []).filter(a => ALLERGENS.has(a)) as Product['allergens'],
        inStock: true, ownBrand: p.ownBrand !== false,
      };
      if (p.packCount && p.packCount > 1) prod.packCount = p.packCount;
      if (p.brand) prod.brand = p.brand;
      products.push(prod);
    }
  }
}

// Fold items whose own name already resolves to another item ("head broccoli" -> broccoli) into that item as aliases.
const folded = new Set<string>();
for (const it of [...items.values()]) {
  const all = [...ITEMS, ...[...items.values()].filter(x => !folded.has(x.id))];
  const hit = resolveItem(it.name, all);
  if (hit && hit.id !== it.id) {
    folded.add(it.id); items.delete(it.id);
    const target = items.get(hit.id);
    for (const a of [it.name, ...it.aliases]) { if (target) { if (!target.aliases.includes(a) && normaliseName(a) !== normaliseName(target.name)) target.aliases.push(a); } else (aliases[hit.id] ??= []).push(a); }
    problems.push(`folded ${it.id} into ${hit.id}`);
  }
}
const out = [...items.values()].sort((a, b) => a.id.localeCompare(b.id));
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.writeFileSync(path.join(root, 'src/data/catalogue.json'), JSON.stringify(out));
fs.writeFileSync(path.join(root, 'src/data/aliases.json'), JSON.stringify(aliases));
const retailersData = path.resolve(root, '../retailers/src/data');
fs.mkdirSync(retailersData, { recursive: true });
fs.writeFileSync(path.join(retailersData, 'products.json'), JSON.stringify(products));
console.log(`items ${out.length}; aliases for existing items ${Object.values(aliases).flat().length}; products ${products.length}; problems ${problems.length}`);
if (problems.length) console.log('  ' + problems.slice(0, 30).join('\n  '));
