import { parseIngredient, resolveLines, type Item, type Member, type Recipe, type StockItem, type Substitution } from '@foododer/core';
import { Store, newId } from './db/index.js';

type I = Omit<Item, 'aliases' | 'category' | 'allergens' | 'isStaple'> & Partial<Pick<Item, 'aliases' | 'category' | 'allergens' | 'isStaple'>>;
const food = (i: I): Item => ({ aliases: [], category: 'food', allergens: [], isStaple: false, ...i });
const house = (i: I): Item => ({ aliases: [], category: 'household', allergens: [], isStaple: false, ...i });

export const ITEMS: Item[] = [
  // Meat & fish
  food({ id: 'beef-mince', name: 'beef mince', aliases: ['minced beef', 'mince'], defaultUnit: 'g', allergens: ['meat'] }),
  food({ id: 'chicken-thigh', name: 'chicken thighs', aliases: ['chicken thigh fillets', 'chicken thigh'], defaultUnit: 'g', allergens: ['meat'], unitWeightG: 120 }),
  food({ id: 'chicken-breast', name: 'chicken breast', aliases: ['chicken breasts', 'chicken breast fillets'], defaultUnit: 'g', allergens: ['meat'], unitWeightG: 160 }),
  // Pasta & grains
  food({ id: 'lasagne-sheets', name: 'lasagne sheets', aliases: ['lasagne sheet', 'lasagna sheets', 'dried lasagne sheets'], defaultUnit: 'g', allergens: ['gluten'], unitWeightG: 14 }),
  food({ id: 'gf-lasagne-sheets', name: 'gluten-free lasagne sheets', aliases: ['free from lasagne sheets', 'gf lasagne sheets'], defaultUnit: 'g', unitWeightG: 14 }),
  food({ id: 'pasta', name: 'pasta', aliases: ['penne', 'fusilli', 'spaghetti', 'dried pasta'], defaultUnit: 'g', allergens: ['gluten'] }),
  food({ id: 'gf-pasta', name: 'gluten-free pasta', aliases: ['free from pasta', 'gf pasta', 'gf fusilli'], defaultUnit: 'g' }),
  food({ id: 'rice', name: 'basmati rice', aliases: ['rice', 'jasmine rice', 'long grain rice'], defaultUnit: 'g', densityGPerMl: 0.85 }),
  food({ id: 'plain-flour', name: 'plain flour', aliases: ['flour'], defaultUnit: 'g', allergens: ['gluten'], densityGPerMl: 0.55, isStaple: true }),
  food({ id: 'gf-flour', name: 'gluten-free plain flour', aliases: ['free from flour', 'gf flour'], defaultUnit: 'g', densityGPerMl: 0.55 }),
  // Tinned & jars
  food({ id: 'chopped-tomatoes', name: 'chopped tomatoes', aliases: ['tinned tomatoes', 'canned tomatoes', 'tin of chopped tomatoes'], defaultUnit: 'g' }),
  food({ id: 'tomato-puree', name: 'tomato puree', aliases: ['tomato paste'], defaultUnit: 'g', isStaple: true }),
  food({ id: 'coconut-milk', name: 'coconut milk', aliases: ['tin of coconut milk'], defaultUnit: 'ml' }),
  food({ id: 'green-curry-paste', name: 'thai green curry paste', aliases: ['green curry paste'], defaultUnit: 'g', allergens: ['shellfish'] }),
  food({ id: 'baked-beans', name: 'baked beans', aliases: ['beans', 'tin of baked beans'], defaultUnit: 'g' }),
  food({ id: 'beef-stock', name: 'beef stock cube', aliases: ['beef stock cubes', 'beef stock'], defaultUnit: 'count', allergens: ['gluten', 'meat'] }),
  food({ id: 'gf-beef-stock', name: 'gluten-free beef stock cube', aliases: ['free from beef stock', 'gf beef stock'], defaultUnit: 'count', allergens: ['meat'] }),
  food({ id: 'chicken-stock', name: 'chicken stock cube', aliases: ['chicken stock cubes', 'chicken stock'], defaultUnit: 'count', allergens: ['gluten', 'meat'] }),
  food({ id: 'gf-chicken-stock', name: 'gluten-free chicken stock cube', aliases: ['free from chicken stock'], defaultUnit: 'count', allergens: ['meat'] }),
  food({ id: 'fish-sauce', name: 'fish sauce', aliases: [], defaultUnit: 'ml', allergens: ['fish'], isStaple: true }),
  food({ id: 'soy-sauce', name: 'soy sauce', aliases: ['light soy sauce', 'dark soy sauce'], defaultUnit: 'ml', allergens: ['gluten', 'soy'], isStaple: true }),
  food({ id: 'tamari', name: 'tamari', aliases: ['gluten-free soy sauce'], defaultUnit: 'ml', allergens: ['soy'] }),
  // Dairy
  food({ id: 'milk', name: 'whole milk', aliases: ['milk', 'semi-skimmed milk'], defaultUnit: 'ml', allergens: ['dairy'], densityGPerMl: 1.03 }),
  food({ id: 'cheddar', name: 'cheddar', aliases: ['cheddar cheese', 'mature cheddar', 'grated cheddar'], defaultUnit: 'g', allergens: ['dairy'] }),
  food({ id: 'parmesan', name: 'parmesan', aliases: ['parmesan cheese', 'grated parmesan'], defaultUnit: 'g', allergens: ['dairy'] }),
  food({ id: 'butter', name: 'butter', aliases: ['salted butter', 'unsalted butter'], defaultUnit: 'g', allergens: ['dairy'], isStaple: true }),
  // Veg & fruit
  food({ id: 'onion', name: 'onion', aliases: ['onions', 'brown onion', 'brown onions', 'large onion'], defaultUnit: 'count', unitWeightG: 150 }),
  food({ id: 'garlic', name: 'garlic', aliases: ['garlic cloves', 'clove of garlic', 'garlic clove'], defaultUnit: 'clove', unitWeightG: 5 }),
  food({ id: 'carrot', name: 'carrot', aliases: ['carrots'], defaultUnit: 'count', unitWeightG: 80 }),
  food({ id: 'celery', name: 'celery', aliases: ['celery sticks', 'celery stick', 'sticks of celery'], defaultUnit: 'count', unitWeightG: 40 }),
  food({ id: 'baking-potato', name: 'baking potatoes', aliases: ['baking potato', 'jacket potatoes', 'jacket potato', 'large potatoes'], defaultUnit: 'count', unitWeightG: 300 }),
  food({ id: 'lime', name: 'lime', aliases: ['limes'], defaultUnit: 'count', unitWeightG: 60 }),
  food({ id: 'green-beans', name: 'green beans', aliases: ['fine beans'], defaultUnit: 'g' }),
  food({ id: 'coriander', name: 'coriander', aliases: ['fresh coriander', 'coriander leaves'], defaultUnit: 'g' }),
  food({ id: 'basil', name: 'basil', aliases: ['fresh basil', 'basil leaves'], defaultUnit: 'g' }),
  food({ id: 'red-chilli', name: 'red chilli', aliases: ['red chillies', 'chilli', 'chillies'], defaultUnit: 'count', unitWeightG: 15 }),
  // Staples
  food({ id: 'olive-oil', name: 'olive oil', aliases: ['oil', 'extra virgin olive oil', 'vegetable oil'], defaultUnit: 'ml', isStaple: true, densityGPerMl: 0.92 }),
  food({ id: 'salt', name: 'salt', aliases: ['sea salt', 'salt and pepper', 'salt & pepper'], defaultUnit: 'g', isStaple: true }),
  food({ id: 'pepper', name: 'black pepper', aliases: ['pepper', 'ground black pepper'], defaultUnit: 'g', isStaple: true }),
  food({ id: 'brown-sugar', name: 'brown sugar', aliases: ['soft brown sugar', 'sugar', 'palm sugar'], defaultUnit: 'g', isStaple: true }),
  food({ id: 'nutmeg', name: 'nutmeg', aliases: ['ground nutmeg'], defaultUnit: 'g', isStaple: true }),
  food({ id: 'oregano', name: 'dried oregano', aliases: ['oregano', 'mixed herbs'], defaultUnit: 'g', isStaple: true }),
  food({ id: 'bay-leaf', name: 'bay leaf', aliases: ['bay leaves'], defaultUnit: 'count', isStaple: true }),
  // Household
  house({ id: 'bleach', name: 'bleach', aliases: ['thick bleach'], defaultUnit: 'ml' }),
  house({ id: 'bin-bags', name: 'bin bags', aliases: ['bin liners', 'bin liner'], defaultUnit: 'count' }),
  house({ id: 'loo-roll', name: 'toilet roll', aliases: ['loo roll', 'toilet paper', 'toilet tissue'], defaultUnit: 'count' }),
  house({ id: 'washing-up-liquid', name: 'washing up liquid', aliases: ['washing-up liquid', 'fairy liquid'], defaultUnit: 'ml' }),
  house({ id: 'freezer-bags', name: 'freezer bags', aliases: ['food bags', 'sandwich bags', 'zip bags'], defaultUnit: 'count' }),
  house({ id: 'kitchen-roll', name: 'kitchen roll', aliases: ['kitchen towel', 'paper towels'], defaultUnit: 'count' }),
  house({ id: 'cling-film', name: 'cling film', aliases: ['clingfilm'], defaultUnit: 'count' }),
  house({ id: 'foil', name: 'kitchen foil', aliases: ['foil', 'tin foil', 'aluminium foil'], defaultUnit: 'count' }),
  house({ id: 'dishwasher-tablets', name: 'dishwasher tablets', aliases: ['dishwasher tabs'], defaultUnit: 'count' }),
  house({ id: 'sponges', name: 'sponges', aliases: ['sponge scourers', 'scourers'], defaultUnit: 'count' }),
];

export const SUBSTITUTIONS: Substitution[] = [
  { itemId: 'lasagne-sheets', allergen: 'gluten', substituteItemId: 'gf-lasagne-sheets' },
  { itemId: 'pasta', allergen: 'gluten', substituteItemId: 'gf-pasta' },
  { itemId: 'plain-flour', allergen: 'gluten', substituteItemId: 'gf-flour' },
  { itemId: 'beef-stock', allergen: 'gluten', substituteItemId: 'gf-beef-stock' },
  { itemId: 'chicken-stock', allergen: 'gluten', substituteItemId: 'gf-chicken-stock' },
  { itemId: 'soy-sauce', allergen: 'gluten', substituteItemId: 'tamari' },
];

function recipe(id: string, name: string, servings: number, lines: string[], steps: string[], fixed: string[] = []): Recipe {
  const ingredients = resolveLines(lines.map(parseIngredient), ITEMS).map(l => fixed.includes(l.itemId ?? '') ? { ...l, scaling: 'fixed' as const } : l);
  return { id, name, servings, source: { type: 'seed' }, ingredients, steps };
}

export const RECIPES: Recipe[] = [
  recipe('lasagne', 'Lasagne', 4, [
    '500g beef mince', '1 onion, finely chopped', '2 cloves garlic, crushed', '1 carrot, finely diced', '1 celery stick, finely diced',
    '2 x 400g tins chopped tomatoes', '2 tbsp tomato puree', '1 beef stock cube', '1 tsp dried oregano', '1 bay leaf',
    '12 lasagne sheets', '50g butter', '50g plain flour', '600ml whole milk', '100g cheddar, grated', '30g parmesan, grated',
    'a pinch of nutmeg', '1 tbsp olive oil', 'salt and pepper, to taste',
  ], [
    'Soften the onion, carrot and celery in the oil, add garlic, then brown the mince.',
    'Add tomatoes, puree, stock cube, oregano and bay leaf. Simmer 30 minutes.',
    'Make the white sauce: melt butter, stir in flour, whisk in milk, season with nutmeg.',
    'Layer ragu, sheets and white sauce; top with cheese. Bake at 190C for 40 minutes.',
  ], ['bay-leaf', 'beef-stock']),
  recipe('thai-green-curry', 'Thai green curry', 4, [
    '600g chicken thighs, sliced', '4 tbsp thai green curry paste', '400ml coconut milk', '150g green beans', '1 tbsp fish sauce',
    '1 tsp brown sugar', 'juice of 1 lime', '1 handful fresh coriander', '300g basmati rice', '1 tbsp olive oil', '1 red chilli, sliced (optional)',
  ], [
    'Fry the paste in oil for a minute, add chicken and coat.',
    'Add coconut milk, simmer 12 minutes, add beans for the last 4.',
    'Season with fish sauce, sugar and lime. Serve with rice and coriander.',
  ]),
  recipe('jacket-potatoes-beans', 'Jacket potatoes & beans', 4, [
    '4 baking potatoes', '2 x 415g tins baked beans', '100g cheddar, grated', '1 tbsp olive oil', 'salt, to taste',
  ], [
    'Rub potatoes with oil and salt, bake at 200C for 75 minutes.',
    'Heat the beans, split the potatoes, top with beans and cheese.',
  ]),
];

export const MEMBERS: Member[] = [
  { id: 'jeff', name: 'Jeff', eatsByDefault: true, constraints: [] },
  { id: 'alex', name: 'Alex', eatsByDefault: true, constraints: [{ kind: 'dislike', strictness: 'preference', itemId: 'coriander' }] },
  { id: 'sam', name: 'Sam', eatsByDefault: true, constraints: [{ kind: 'gluten_free', strictness: 'strict' }] },
];

const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

export const STOCK: StockItem[] = [
  { id: 'st1', itemId: 'chopped-tomatoes', qty: 1200, unit: 'g', confidence: 'exact', location: 'cupboard', freeFrom: ['gluten'], boughtAt: daysAgo(12) },
  { id: 'st2', itemId: 'cheddar', qty: 200, unit: 'g', confidence: 'approx', location: 'fridge', freeFrom: ['gluten'], boughtAt: daysAgo(6) },
  { id: 'st3', itemId: 'chicken-thigh', qty: 1000, unit: 'g', confidence: 'exact', location: 'fridge', freeFrom: ['gluten'], boughtAt: daysAgo(5), expiresAt: daysAgo(-1) },
  { id: 'st4', itemId: 'milk', qty: 300, unit: 'ml', confidence: 'approx', location: 'fridge', freeFrom: ['gluten'] },
  { id: 'st5', itemId: 'pasta', qty: 500, unit: 'g', confidence: 'exact', location: 'cupboard', freeFrom: [] },
  { id: 'st6', itemId: 'gf-pasta', qty: 250, unit: 'g', confidence: 'approx', location: 'cupboard', freeFrom: ['gluten'] },
  { id: 'st7', itemId: 'rice', qty: 1500, unit: 'g', confidence: 'approx', location: 'cupboard', freeFrom: ['gluten'] },
  { id: 'st8', itemId: 'onion', qty: 4, unit: 'count', confidence: 'approx', location: 'cupboard', freeFrom: ['gluten'] },
  { id: 'st9', itemId: 'garlic', qty: 8, unit: 'clove', confidence: 'approx', location: 'cupboard', freeFrom: ['gluten'] },
  { id: 'st10', itemId: 'baking-potato', qty: 4, unit: 'count', confidence: 'exact', location: 'cupboard', freeFrom: ['gluten'] },
  { id: 'st11', itemId: 'baked-beans', qty: 830, unit: 'g', confidence: 'exact', location: 'cupboard', freeFrom: ['gluten'] },
  { id: 'st12', itemId: 'carrot', qty: 6, unit: 'count', confidence: 'approx', location: 'fridge', freeFrom: ['gluten'] },
  { id: 'st13', itemId: 'loo-roll', qty: 2, unit: 'count', confidence: 'exact', location: 'household', freeFrom: [], boughtAt: daysAgo(23) },
];

export function seed(store: Store) {
  for (const i of ITEMS) store.upsertItem(i);
  for (const s of SUBSTITUTIONS) store.upsertSubstitution(s);
  for (const r of RECIPES) store.upsertRecipe(r);
  for (const m of MEMBERS) store.upsertMember(m);
  for (const s of STOCK) store.upsertStock(s);
  store.upsertListItem({ id: newId('li_'), text: 'bleach', itemId: 'bleach', qty: null, addedVia: 'chat', status: 'open', createdAt: new Date().toISOString() });
  store.upsertListItem({ id: newId('li_'), text: 'bin bags', itemId: 'bin-bags', qty: null, addedVia: 'manual', status: 'open', createdAt: new Date().toISOString() });
  store.upsertPref({ itemId: 'beef-mince', retailer: 'mock', productId: 'm1', alwaysAsk: false });
  store.upsertPref({ itemId: 'bleach', retailer: 'mock', productId: 'h1', alwaysAsk: false });
  store.setSetting('household', { defaultServings: 4, ownBrandOk: true, alwaysAskCategories: ['meat'] });
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  const file = process.env.FOODODER_DB ?? 'data/foododer.sqlite';
  const store = new Store(file);
  seed(store);
  console.log(`Seeded ${file}: ${ITEMS.length} items, ${RECIPES.length} recipes, ${MEMBERS.length} people, ${STOCK.length} stock lines.`);
}
