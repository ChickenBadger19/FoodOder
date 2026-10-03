# FoodOder — Project Plan

A personal PWA where you say which recipes you want to cook, and it:

1. finds (or generates) the recipe and scales it to the number of portions you want,
2. works out which ingredients you already have in stock,
3. builds a Tesco basket for the rest,
4. **stops and asks you to approve** the basket before anything is sent to Tesco,
5. keeps your inventory up to date from what you cook and what you buy.

This document covers: what already exists, the architecture, how each hard
problem will be solved, the data model, the delivery phases, risks, and the
decisions still open.

---

## 1. Prior art — does this already exist?

Short answer: pieces of it exist, but nothing does the whole loop
(persistent inventory → arbitrary recipe by name → scaling → Tesco basket
with an approval gate) under your own control.

| Product | What it does | What it lacks for us |
|---|---|---|
| **Tesco's in-app AI assistant** (colleague trial Apr 2026, customer rollout "later this year") | Chat for recipe ideas, builds a basket from them, uses your purchase history, claims to account for leftovers | Lives inside the Tesco app; no inventory you own or control; no scaling by portions; you can't bring your own recipes. This is the biggest "do we need this?" risk — see §8. |
| **Mealia** (UK, iOS + Firefox extension) | Weekly meal plan → Tesco/Asda basket, budget-led; lets you remove items you already have | Picks recipes for you rather than you naming them; no persistent pantry, you tick items off each time |
| **Basket List** (UK) | Pick recipes → categorised list → push to Tesco basket | Same gaps: no inventory, recipe catalogue is theirs |
| **BBC Good Food "shoppable recipes"** (Whisk / Samsung Food widget) | Add a recipe's ingredients to a Tesco basket from the recipe page | One recipe at a time, no stock check, no scaling against what you have |
| **Paprika 3** | Recipe manager with pantry; greys out list items you have | No ordering integration, pantry is manual |
| **Samsung Food (ex-Whisk), Mealime, Plan to Eat, AnyList** | Meal planning + shopping lists, some pantry | US-centric retail links, weak or no UK supermarket ordering, no stock-aware ordering |
| **open-supermarkets** (`open-supermarkets` on npm, MIT, ~115 stars, active) | CLI / MCP / Node library: Tesco search, basket add/remove, slots, dry-run checkout | Infrastructure, not an app. Exactly the Tesco layer we need and don't want to write from scratch. |
| **tesco-grocery-mcp** (Sep 2026) | MCP server wrapping Tesco's internal APIs: search, basket, slots | Same as above; needs a bearer token + customer UUID copied from a live session |

**Conclusion:** build it. Reuse `open-supermarkets` (or copy its Tesco
provider) for the retailer layer and spend our effort on inventory, recipe
scaling, product matching and the approval flow — which is where none of the
above compete.

Sources: [The Grocer – Tesco AI assistant](https://www.thegrocer.co.uk/news/tesco-launches-meal-planning-basket-building-in-app-ai-assistant/717474.article),
[Retail Gazette – 280k colleague trial](https://www.retailgazette.co.uk/blog/2026/04/tesco-trials-ai-shopping-assistant-with-280000-colleagues-ahead-of-customer-rollout/),
[Mealia](https://www.mealia.co.uk/), [Basket List](https://www.basketlist.co.uk/),
[BBC Good Food × Tesco](https://internetretailing.net/bbc-recipe-site-links-to-tesco-online-basket-10099/),
[open-supermarkets](https://github.com/abracadabra50/uk-grocery-cli),
[tesco-grocery-mcp](https://lobehub.com/mcp/gavinalattard-tesco-grocery-mcp),
[FoodiePrep 2026 meal-planner review](https://www.foodieprep.ai/blog/meal-planning-apps-with-builtin-grocery-lists-a-2026-sidebyside-review).

---

## 2. The hard constraint: there is no official Tesco API

Tesco shut its public developer API years ago. Every working integration
today uses one of:

- **Tesco's internal GraphQL endpoint** (`https://xapi.tesco.com/`) with the
  cookies/headers of a logged-in browser session. Operations include
  `SearchProducts`, `Basket`, `AddToBasket`, `GetOrders`. This is what
  `open-supermarkets` and `tesco-grocery-mcp` do.
- **Browser automation** (Playwright) for the bits GraphQL doesn't cover well:
  delivery slots and checkout.
- **Tesco's own "multi-search"** page, where you paste a list of items and it
  finds products for each — a manual but zero-risk fallback.

Consequences for the design:

- Tesco calls **cannot run in the browser/PWA** (CORS, httpOnly cookies, Akamai
  bot protection). They must run from a server-side component.
- Logging in programmatically is flaky (Akamai, email OTP). The reliable path
  is: you log in to tesco.com in your own browser, export the cookies, and
  the app imports them. Sessions last roughly 7–12 days, so there is a
  "reconnect Tesco" chore about once a week. We'll make that a one-tap flow.
- It is unofficial and can break without notice. Build the retailer layer
  behind an interface so a breakage is contained, and keep the
  "copy list → paste into Tesco multi-search" fallback working forever.
- Terms-of-service note: this is personal automation of your own account, the
  same category as the open-source tools above, but it is not sanctioned by
  Tesco. Keep volumes low (we'll make a few dozen requests per order, not
  thousands).

**We never place the order.** The app pushes items into your Tesco basket;
you complete slot booking and payment in Tesco's own app/site. That gives you
two approval gates: the one in our app, and Tesco's checkout.

---

## 3. Architecture

Monorepo, TypeScript end to end, one deployable backend plus a PWA.

```
foododer/
├── apps/
│   ├── web/        # PWA: React + Vite + vite-plugin-pwa, Tailwind. Installable on phone.
│   └── api/        # Fastify server. Owns DB, Tesco session, LLM calls. Serves the PWA in prod.
├── packages/
│   ├── core/       # Pure logic, no I/O: ingredient parsing, unit conversion, scaling,
│   │               # inventory subtraction, product ranking. Heavily unit-tested.
│   ├── recipes/    # Recipe acquisition: URL import (schema.org JSON-LD), LLM generation.
│   ├── tesco/      # Retailer adapter behind a `Retailer` interface (search, basket, orders).
│   └── db/         # Drizzle schema + migrations.
└── PLAN.md
```

**Why this split**

- `core` being pure means scaling/matching bugs are reproducible in tests
  without Tesco or an LLM in the loop.
- `tesco` behind a `Retailer` interface means Sainsbury's/Ocado later is an
  adapter, and a Tesco breakage doesn't take the whole app down.
- One backend process is enough: this is single-household software.

**Stack decisions (made, not debated)**

| Concern | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + `vite-plugin-pwa` + Tailwind | Mature PWA tooling, offline shell, camera access for barcode scanning |
| Backend | Node 22 + Fastify + TypeScript | Same language as the Tesco libraries we reuse; Playwright needs Node anyway |
| Database | SQLite via Drizzle ORM for the MVP | Zero ops, single user. Drizzle lets us move to Postgres (e.g. Supabase) without rewriting queries if it ever goes multi-user |
| Tesco layer | `open-supermarkets` as a dependency, wrapped; fork its Tesco provider if we need to patch | MIT, maintained, already handles session import + GraphQL + batching |
| LLM | Anthropic API, Claude. A cheaper model for routine structured extraction, a stronger one for recipe generation and the chat interface | Structured-output prompts for ingredient parsing, recipe generation, product disambiguation and the natural-language ordering interface |
| Recipe import | schema.org `Recipe` JSON-LD parser (own, small) | Covers BBC Good Food, Jamie Oliver, Delicious, NYT, most blogs |
| Barcodes | Open Food Facts lookup from the PWA camera | Free, good UK coverage |
| Hosting | Single container (Fly.io / Railway / a home server) with a persistent volume for SQLite + Tesco session | Needs to run Node + Playwright; Cloudflare Workers can't |
| Auth | Single-user passphrase → session cookie, plus the PWA pinned to HTTPS | It's your pantry, not a SaaS |

---

## 4. Core flows

### 4.1 "I want to make X"

```
you: "lasagne for 6 and a thai green curry for 4 on friday"
         │
         ▼
 ┌─ Recipe resolver ───────────────────────────────────────────┐
 │ 1. Match against your saved recipes (fuzzy on name)          │
 │ 2. Else: LLM generates a UK-units recipe in our JSON schema  │
 │    OR you paste a URL and we import the JSON-LD               │
 │ 3. You confirm the recipe + portions                          │
 └──────────────────────────────────────────────────────────────┘
         │  Recipe + target servings
         ▼
 ┌─ Scaler (core) ──────────────────────────────────────────────┐
 │ qty × (target / base servings), unit-aware, non-linear        │
 │ items ("to taste", oil for frying) flagged not scaled         │
 └──────────────────────────────────────────────────────────────┘
         │  Scaled ingredient lines
         ▼
 ┌─ Aggregator + inventory check (core) ────────────────────────┐
 │ Merge same canonical ingredient across recipes                │
 │ Subtract what's in stock (converted to common unit)           │
 │ Staples (salt, oil, …) assumed present unless flagged low     │
 └──────────────────────────────────────────────────────────────┘
         │  Shortfall list: ingredient, qty needed
         ▼
 ┌─ Product matcher (tesco + core + LLM) ───────────────────────┐
 │ Preferred product for this ingredient if you've bought before │
 │ Else search Tesco, rank by name match / pack size fit /       │
 │ price per unit / your favourites; LLM breaks ties             │
 │ Pack-size maths: need 750 g mince → 2 × 500 g packs           │
 └──────────────────────────────────────────────────────────────┘
         │  Proposed basket with prices
         ▼
 ┌─ APPROVAL SCREEN (you) ──────────────────────────────────────┐
 │ Per line: swap product, change qty, "I have this", remove     │
 │ Totals. Nothing has touched Tesco yet.                        │
 │ [Approve → add to Tesco basket]   [Copy as list]              │
 └──────────────────────────────────────────────────────────────┘
         │  Approved
         ▼
 Push to Tesco basket  →  you open Tesco, pick slot, pay
         │
         ▼
 Order appears in Tesco order history → app marks items "incoming"
 → on delivery day (or when you tap "delivered") they move into inventory
```

### 4.2 Keeping inventory honest

Inventory drifts unless adding and removing stock is nearly free. Four ways in,
three ways out:

**In**
- Tesco order history import (biggest win: every past order's lines become
  inventory with product, pack size, date). Run on first connect and after
  each delivery.
- Barcode scan from the PWA camera → Open Food Facts → canonical ingredient.
- "Quick add" with voice/typing: "2 onions, half a bag of rice".
- Manual edit.

**Out**
- "I cooked lasagne (6)" → deducts the scaled recipe quantities.
- "Used up" / "half left" buttons on an item.
- Expiry-based nudges: "chicken thighs bought 5 days ago — still there?"

Quantities are stored as a number + unit, with a confidence flag
(`exact` for a sealed pack, `approx` for an opened one). Approximate items
count as present for the stock check but are shown with a "check this" badge
on the approval screen.

### 4.3 Recipe acquisition — three sources, one schema

Everything is normalised into one recipe JSON before scaling:

```jsonc
{
  "name": "Lasagne",
  "servings": 4,
  "source": { "type": "url" | "llm" | "manual", "ref": "https://…" },
  "ingredients": [
    {
      "raw": "500g beef mince",
      "ingredient": "beef mince",        // canonical, links to ingredient catalogue
      "qty": 500, "unit": "g",
      "prep": null,                      // "finely chopped"
      "scaling": "linear" | "fixed" | "to_taste",
      "optional": false
    }
  ],
  "steps": ["…"]
}
```

1. **URL import** — fetch page, read schema.org `Recipe` JSON-LD, parse each
   ingredient line into qty/unit/ingredient (rule-based parser first, LLM
   fallback for messy lines). Most reliable and the user's recipe is exactly
   what they asked for.
2. **Name only** — LLM generates a recipe in the schema above, in UK metric
   units and UK ingredient names. Always shown for confirmation before use;
   saved so the next time it's deterministic.
3. **Manual** — type/paste a recipe; parser does the rest.

Optional later: Spoonacular/Edamam for search-by-name with nutrition. Not
needed for the MVP; the LLM path covers it.

### 4.4 Scaling rules (in `core`, unit-tested)

- Linear scale by `target / base` servings.
- Unit normalisation: tsp/tbsp/cup/ml/l, g/kg, counts. Conversion table +
  density table for the ~50 ingredients where volume↔weight matters
  (flour, sugar, rice, butter…).
- `fixed` ingredients don't scale (1 bay leaf is 1 bay leaf up to a point;
  LLM/parser tags these). `to_taste` never scales and is never ordered unless
  out of stock.
- Rounding to sensible kitchen amounts (no "347 g onion": round counts to
  whole, grams to 5/10/25 depending on magnitude).
- Purchase rounding is separate and happens in the matcher (pack sizes).

### 4.5 Ingredient ↔ product matching

This is where most of the "it bought the wrong thing" pain lives, so it learns:

- `ingredient_product_preferences` table: once you approve a product for an
  ingredient, it's the default next time (per ingredient, with a "always ask"
  flag for things like meat where you care about cut/pack).
- Candidate ranking: text similarity on product name, pack size vs required
  quantity (prefer smallest total overshoot), price per unit, "you've bought
  this before" boost, in-stock filter.
- LLM is asked only to pick among the top ~5 candidates given the recipe
  context ("beef mince for lasagne" → 5% fat vs 20% fat), never to invent a
  product id.
- Substitutes: if nothing matches, suggest the nearest ingredient and flag it
  on the approval screen.

---

## 5. Data model (Drizzle / SQLite)

```
ingredients            canonical names + aliases + default unit + category + is_staple
recipes                name, servings, source, steps, created_from
recipe_ingredients     recipe_id, ingredient_id, qty, unit, prep, scaling, optional, raw
inventory_items        ingredient_id, qty, unit, confidence, location, bought_at, expires_at,
                       tesco_product_id?, barcode?
tesco_products         cached product cards: id, name, price, pack qty/unit, image, last_seen
ingredient_product_prefs ingredient_id → tesco_product_id, always_ask
plans                  "cook list" for a date range: recipe_id, target_servings, status
orders                 proposed basket: status (draft → approved → pushed → ordered → delivered),
                       lines (ingredient, needed qty, product, qty, price), approved_at
inventory_events       append-only ledger: +/- qty, reason (order, cooked, scan, manual, expired)
settings               household size default, staples list, Tesco session metadata (not cookies)
```

Tesco cookies live in a separate encrypted file on the volume, never in the DB
dump and never in git.

---

## 6. API surface (Fastify)

```
POST /recipes/resolve        { query | url | servings } → candidate recipe(s) for confirmation
POST /recipes                save confirmed recipe
POST /plans                  add recipe + servings to the current cook list
POST /plans/:id/propose      run scale → aggregate → stock check → match → draft order
GET  /orders/:id             draft basket for the approval screen
PATCH /orders/:id/lines/:n   swap product / change qty / mark "have it"
POST /orders/:id/approve     push lines to Tesco basket; returns Tesco basket link
POST /orders/:id/delivered   move lines into inventory
GET/POST /inventory          list / quick add; POST /inventory/scan { barcode }
POST /inventory/cooked       { recipe_id, servings } → deduct
POST /tesco/session          import cookies (from the one-tap helper)
GET  /tesco/status           connected? expires when?
POST /tesco/sync-orders      import order history into inventory
POST /chat                   natural-language entry point that calls the above
```

The PWA is a thin client over these; the chat endpoint is what lets you type
"lasagne for 6 friday" and get straight to the approval screen.

---

## 7. Delivery phases

Each phase is useful on its own and can ship.

**Phase 0 — Scaffold (½ day)**
pnpm workspace, TS configs, Fastify hello, Vite PWA shell installable on your
phone, SQLite + Drizzle migrations, CI running tests + typecheck.

**Phase 1 — Recipes + inventory, no Tesco (Tesco-free value)**
- Ingredient catalogue seeded with ~300 common UK ingredients + aliases.
- Recipe import from URL and by name (LLM), confirm screen, save.
- Scaler + aggregator + stock check in `core` with tests.
- Inventory list, quick add, cooked-deduction.
- Output: a shortfall list you can copy and paste into Tesco's multi-search.
  *You can already use the app for every shop at this point.*

**Phase 2 — Tesco read-only**
- Cookie import flow (bookmarklet/extension or paste), session status + expiry
  warning in the PWA.
- Product search + cached product cards; pack-size parsing.
- Order history import → inventory bootstrap. This is the moment the
  inventory becomes real without a week of manual entry.

**Phase 3 — Basket push with approval**
- Product matcher + preferences table.
- Approval screen (swap, qty, "have it", totals).
- Approve → add to Tesco basket → deep link to Tesco checkout.
- Order detection via order history → "incoming" → "delivered" → inventory.

**Phase 4 — Conversational entry**
- `/chat` with tool-use over the API: "make X for N on <day>", "what can I
  cook with what I have", "add 2 onions".
- Multi-recipe plans for a week; de-duplicates across recipes.

**Phase 5 — Inventory quality of life**
- Barcode scanning via camera + Open Food Facts.
- Expiry nudges, "check this" badges, staples auto-reorder suggestion.
- Push notifications (PWA) when the Tesco session is about to expire.

Phases 1–3 are the MVP. Estimate for a focused build: Phase 0–1 one to two
weeks of evenings, Phase 2–3 similar, with Tesco breakage the main unknown.

---

## 8. Risks and how we handle them

| Risk | Likelihood | Mitigation |
|---|---|---|
| Tesco changes xapi / tightens Akamai; integration breaks | High over a year | Retailer interface; rely on a maintained OSS adapter; multi-search paste fallback never removed; Phase 1 works without Tesco at all |
| Weekly cookie re-import is annoying enough that you stop using it | Medium | One-tap import helper (bookmarklet or tiny extension that POSTs cookies to the API); expiry warning push; try Playwright auto-login as a best-effort refresh |
| Tesco's own AI assistant makes this redundant when it launches to customers | Medium | Our moat is the inventory you control, your own recipes, scaling, and the approval screen. If Tesco's pantry feature turns out excellent, Phase 1–2 (inventory + recipes) still stands and we could even push to Tesco's assistant as the "retailer" |
| Wrong product matched (fat content, pack size, own-brand vs branded) | Certain early on | Approval screen is mandatory; preferences learn from every approval; "always ask" per ingredient |
| Inventory drifts from reality | High unless cheap to maintain | Order-history import, cooked-deduction, approx/exact confidence, "check this" badges rather than silent trust |
| Ingredient parsing errors (e.g. "1 can chopped tomatoes (400g)") | Medium | Rule parser + LLM fallback + confirmation screen; every parse failure logged to improve the parser |
| LLM invents a non-existent product or hallucinated quantities | Low with structured outputs | LLM only chooses among real candidates; recipe generation always confirmed by you |
| Account safety (automation on your Tesco account) | Low volume, personal use | Keep request volume tiny, never automate payment, never store password |

---

## 9. Decisions still open (your call)

1. **Where does the backend run?** A home machine/Pi (private, free, needs
   port-forward or Tailscale for the phone) vs a small cloud box (simpler
   from the phone, your Tesco cookies live off-site). Recommendation: cloud
   box for the MVP, encrypted session file, revisit if it bothers you.
2. **Tesco cookie import UX:** bookmarklet (works in Safari/Chrome mobile,
   limited to non-httpOnly cookies — may be insufficient), desktop browser
   extension (most reliable), or paste the cookie JSON (works today, clunky).
   Needs a quick spike in Phase 2 to see which cookies Tesco actually
   requires.
3. **Recipe-by-name default:** LLM-generated recipe vs web search for a
   recipe URL then import. Recommendation: LLM for speed, with "use this URL
   instead" always available.
4. **Household defaults:** default portions, dietary constraints, brands you
   always/never want (own-brand ok? organic?). These seed the matcher.
5. **Staples list:** which ingredients are assumed always present (salt,
   pepper, oil, flour, stock cubes…)? Can start with a sensible default and
   edit.

---

## 10. Immediate next steps

1. Agree the open decisions above (or accept the recommendations).
2. Phase 0 scaffold on this branch.
3. Spike (one evening): import a real Tesco cookie export via
   `open-supermarkets`, run a product search and an order-history fetch, and
   record which cookies/headers were actually needed. This de-risks Phase 2–3
   before we invest in Phase 1.
