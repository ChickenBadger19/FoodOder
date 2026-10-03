/**
 * Assemble the recipe library: read the generated JSON files, validate every line through the real
 * ingredient parser, dedupe, and report ingredient names that don't resolve to the catalogue.
 *
 *   pnpm --filter @foodify/app exec tsx scripts/build-recipes.mts <dir-with-json> [--write]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseIngredient, resolveItem, normaliseName, type Item } from '@foodify/core';
import { ALL_ITEMS } from '../src/seed.js';

const dir = process.argv[2]!;
const write = process.argv.includes('--write');
const items: Item[] = ALL_ITEMS;

interface Raw { id: string; name: string; servings: number; tags?: string[]; minutes?: number; ingredients: string[]; steps: string[] }
const all: Raw[] = [];
const problems: string[] = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  let arr: Raw[];
  try { arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { problems.push(`${f}: invalid JSON: ${(e as Error).message}`); continue; }
  if (!Array.isArray(arr)) { problems.push(`${f}: not an array`); continue; }
  for (const r of arr) {
    const where = `${f} ${r?.id ?? '?'}`;
    if (!r || typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.ingredients) || !Array.isArray(r.steps)) { problems.push(`${where}: missing fields`); continue; }
    if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > 40) { problems.push(`${where}: bad servings ${r.servings}`); continue; }
    if (r.ingredients.length < 3 || r.steps.length < 2) { problems.push(`${where}: too few ingredients/steps`); continue; }
    r.id = r.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    all.push(r);
  }
}

// Dedupe by id, then by normalised name.
const byId = new Map<string, Raw>();
const seenNames = new Set<string>();
let dupes = 0;
for (const r of all) {
  const n = normaliseName(r.name);
  if (byId.has(r.id) || seenNames.has(n)) { dupes++; continue; }
  byId.set(r.id, r); seenNames.add(n);
}
const recipes = [...byId.values()];

// Parse and resolve every line.
let lines = 0, resolved = 0, noQty = 0;
const unresolved = new Map<string, number>();
const unitless = new Map<string, number>();
for (const r of recipes) {
  for (const raw of r.ingredients) {
    lines++;
    const l = parseIngredient(raw);
    const item = resolveItem(l.itemName, items);
    if (item) resolved++; else unresolved.set(normaliseName(l.itemName), (unresolved.get(normaliseName(l.itemName)) ?? 0) + 1);
    if (l.qty === null && l.scaling !== 'to_taste') { noQty++; unitless.set(raw, (unitless.get(raw) ?? 0) + 1); }
  }
}
const top = [...unresolved.entries()].sort((a, b) => b[1] - a[1]);
console.log(`recipes ${recipes.length} (dropped ${dupes} duplicates, ${problems.length} invalid)`);
console.log(`lines ${lines}; resolved ${resolved} (${(100 * resolved / lines).toFixed(1)}%); unresolved names ${top.length}; lines without a quantity ${noQty}`);
if (problems.length) console.log('problems:\n  ' + problems.slice(0, 40).join('\n  '));
fs.writeFileSync(path.join(dir, '_unresolved.txt'), top.map(([n, c]) => `${c}\t${n}`).join('\n'));
fs.writeFileSync(path.join(dir, '_noqty.txt'), [...unitless.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${c}\t${n}`).join('\n'));
if (write) {
  const out = recipes.map(r => ({ id: r.id, name: r.name, servings: r.servings, tags: r.tags ?? [], minutes: r.minutes ?? null, ingredients: r.ingredients, steps: r.steps }));
  const dest = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/recipes.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`wrote ${out.length} recipes to ${dest} (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
}
