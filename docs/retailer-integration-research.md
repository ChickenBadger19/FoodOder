# How can an app get items into a UK supermarket basket? (research, 3 Oct 2026)

Two research passes: one per retailer, one across the "shoppable recipe" intermediaries that sit
between recipe apps and supermarkets. Many retailer and trade-press sites were unreachable from the
research environment, so some facts come from search snippets and are marked as such.

## The short version

1. **No UK grocer offers a public, self-serve API to search products or write to a basket.** Tesco had
   one in 2009 and a product-data API (Tesco Labs) until about 2018; the developer portal no longer
   resolves in DNS. Nothing replaced it anywhere.
2. **What exists instead is retailer-procured, not developer-procured.** Northfork (Sainsbury's) and
   Samsung Food / Whisk (Tesco, Asda, Ocado, Waitrose, Sainsbury's as of 2021) are contracted by the
   retailer. A third-party app rides on them only if the retailer and the vendor agree.
3. **Every UK consumer app doing recipe-to-basket today uses the user's own retailer session.** Mealia
   ships a browser extension with permissions on tesco.com and asda.com. Cherrypick and Remy don't
   publish their mechanism. These apps pair that with affiliate agreements for revenue.
4. **Retailers are actively hostile to third-party automation at the login step.** Retail Week tested
   ChatGPT's agent mode: Sainsbury's and Morrisons let it complete a shop; Tesco and Asda blocked it at
   authentication. Tesco uses Akamai, Asda Cloudflare, Ocado AWS WAF (blocks checkout), Co-op Imperva.
5. **The sanctioned surfaces that always work are humble:** every big retailer has a multi-search or
   shopping-list feature where a user pastes a list, and every one has stable search and product URLs.
   Amazon is the outlier with an official add-to-cart URL (Associates programme), which also covers
   Morrisons, Co-op and Iceland "on Amazon".
6. **Tesco's own in-app AI assistant** (Tomoro AI / OpenAI, colleague trial from April 2026, customer
   rollout "later this year") has no public launch news as of early October 2026. Tesco also signed a
   three-year Mistral AI deal. All first-party; no sign of opening basket access to third-party agents.

## What this means for Foodify

Design the retailer layer as **four hand-off tiers per retailer**, and pick the best available one at
runtime. The core (inventory, recipes, scaling, dietary rules, approval) never knows which tier is used.

| Tier | Mechanism | Legitimacy | Fragility | Where it works today |
|---|---|---|---|---|
| **list** | Paste-ready text for the retailer's multi-search / shopping list | Fully sanctioned | None | Tesco, Sainsbury's, Ocado, Waitrose (multi-search); Asda, Morrisons (app lists) |
| **links** | Per-line deep links to retailer search / product pages, optionally affiliate-tagged | Sanctioned | Low; URL shapes change occasionally | All retailers; Amazon can add to cart by URL |
| **session** | Add to the user's live basket using their own logged-in session (browser extension, or a self-hosted agent with imported cookies) | Grey: user-initiated, user-authenticated, but against ToS and bot defences | High; Tesco/Asda block automated login; Ocado blocks checkout | Tesco (xapi GraphQL via cookies), Sainsbury's (password login), Ocado (basket only), Asda (AsdaBot, real-browser login) |
| **partner** | Official retailer or intermediary API | Sanctioned, contractual | Low | Only via Northfork (Sainsbury's) or Samsung Food (status unverified), by agreement |

Implications already reflected in the prototype:

- `packages/retailers` declares a `modes` list per retailer and a `Retailer` interface; the mock
  implements `list`, `links` and `session`. The approval screen always offers "copy as list".
- The session tier should run **client-side in the user's browser** (a companion extension, as Mealia
  does) or on the user's own box, never on a shared server holding other people's sessions.
- The pitch to retailers (below) is for the **partner** tier.

## Per-retailer state of play

| Retailer | Official API | Partner route | List import on site/app | Deep links | Unofficial clients | Bot defence |
|---|---|---|---|---|---|---|
| **Tesco** | None (Tesco Labs dead; Mirakl API is for marketplace sellers) | Samsung Food integrated store; BBC Good Food via Foodity (legacy); own AI assistant (2026) | Multi-search box; app shopping list | `/groceries/en-GB/search?query=…`, `/groceries/en-GB/products/<id>` | Basketeer (GraphQL `xapi.tesco.com`, Playwright login), uk-grocery-cli (cookie import), jbeshir MCP, Sally extension | Akamai |
| **Sainsbury's** | None | Northfork (current); Whisk (2021); Lollipop bespoke deal (2022) | Multi-search; re-add past order; app lists | `/gol-ui/SearchResults/<q>`, `/gol-ui/product/<slug>` | uk-grocery-cli (email + password), sainsburys-cli, Turbo Trolley extension | Allowed ChatGPT agent through |
| **Asda** | None; moving to Ocado Smart Platform in 2027 | Samsung Food integrated store | App shopping lists → trolley | `asda.com/groceries/search/<q>`, `groceries.asda.com/product/<slug>/<id>` | AsdaBot (real-browser login, cookies; also a Claude Code plugin) | Cloudflare |
| **Morrisons** | None (internal Apigee; Instaleap B2B fulfilment) | Sold via Amazon, Deliveroo, Uber Eats, Just Eat | Shopping Lists; favourites | `groceries.morrisons.com/products/<slug>/<id>`; search URL unverified | Scrapers only | Allowed ChatGPT agent through |
| **Ocado** | None (OSP is B2B) | Samsung Food; Guardian Feast QR add-all links (bespoke) | Multi-search; Shopping Lists | `/search?q=…`, `/products/<slug>/<id>` | uk-grocery-cli (password; AWS WAF blocks checkout) | AWS WAF |
| **Waitrose** | None | Samsung Food | Multi-search (documented in help) | `/ecom/products/<slug>/<id>`; search URL robots-blocked | stale npm `mywaitrose`, jbeshir MCP | Unknown |
| **Iceland** | None | Iceland on Amazon | Bonus Club app list | `/search?q=…` (inferred) | Scrapers only | Akamai |
| **Co-op** | None (Deliveroo Express white-label) | Deliveroo, Uber Eats, Amazon | None documented | Postcode-gated | Scrapers only | Imperva |
| **Amazon Fresh UK** | Associates add-to-cart URL (official), PA-API 5 (search), Alexa List Skill API | Morrisons, Co-op, Iceland "on Amazon" | Alexa list | `/gp/aws/cart/add.html?ASIN.1=…`, `/dp/<ASIN>` | n/a | n/a |

Known-unknowns: current Samsung Food UK retailer roster; whether Northfork's Sainsbury's integration is
open to independent apps; Morrisons/Iceland/Co-op search URL parameters; any named developer or partner
contact at any of the nine retailers (none found).

## The intermediaries

| Platform | Developer surface | UK retailers | Writes to basket? | Exposes product search and prices? | Access | Status |
|---|---|---|---|---|---|---|
| Samsung Food / Whisk | API + Shopping List SDK (docs still indexed) | Tesco, Asda, Ocado, Waitrose, Sainsbury's (2021) | Yes, list → retailer basket | Not found | Partner contact | No shutdown notice, but no UK retail news since 2021; Samsung chose Instacart for its 2025 fridge integration. Treat as unverified. |
| Northfork (Stockholm) | API + widgets + interstitial page | Sainsbury's | Yes, in-retailer cart build | Not documented | Sales-led | Active (2025 announcements) |
| Pepesto | REST API + MCP + hosted checkout | Tesco, Sainsbury's, Waitrose, Asda, Morrisons | Matched cart + checkout in Pepesto app | **Yes** (live prices, promos) | Self-serve, pay-as-you-go | Active, but it is an agent driving retailer sites; it transfers the ToS risk, it does not remove it |
| Mealia | None (consumer app + browser extension) | Tesco, Asda, Sainsbury's, Morrisons | Yes, via extension in the user's session | n/a | n/a | Active; claims affiliate agreements |
| Basket List | None | None (list only) | No | n/a | n/a | Active |
| Cherrypick, Remy | None | Tesco, Sainsbury's (+ Asda, Morrisons, M&S for Remy) | Yes, mechanism unpublished | n/a | n/a | Active |
| Instacart Developer Platform | REST (recipe page, shopping-list page) + MCP | None (US/CA) | Creates an Instacart page | No | Self-serve keys | The model of what a sanctioned API looks like |
| Kroger Public API | REST, OAuth | None (US) | Yes (cart add; no read/checkout) | Yes | Self-serve | The other model |
| Chicory, Jow, MikMak | Publisher button / consumer app / brand SaaS | US only / none / brands only | — | — | — | Not relevant to a UK consumer app |

## Why UK grocers keep the basket closed (industry commentary)

- Each grocer runs its own delivery business and does not want to create its own competition.
- Historic reluctance to expose data rivals could use to price-match.
- Since about 2022 the money is in retail media (Tesco Media & Insight, Nectar360). Basket and
  loyalty data are the monetised asset, so the basket surface stays first-party, and retailers are now
  building their own AI assistants rather than letting third-party agents own the session.
- Partner programmes in practice are affiliate links, retailer-selected shoppable-recipe vendors under
  retailer contracts, and bespoke publisher deals (Guardian × Ocado).

## Pitch angle for retailers

What a retailer gets from partnering rather than blocking:

- **Incremental basket, not substitution.** Foodify sends a complete, de-duplicated, dietary-safe
  basket the shopper has already approved, including household extras. Higher basket value, fewer
  abandoned "I'll do it later" lists.
- **Fewer wrong-product returns and complaints.** Free-from matching uses the retailer's own allergen
  data, with a hard block for strict coeliac households.
- **Retention they cannot build alone.** The household's inventory, recipes and dietary profile live
  outside any one retailer's app, so the retailer that integrates best wins the weekly shop. For a
  challenger (Sainsbury's, Ocado, Waitrose) that is a reason to say yes before Tesco's assistant lands.
- **Low ask.** The integration needed is the one they already give Northfork or Whisk: an authenticated
  "add these product ids to this customer's basket" call, plus product search with allergen attributes.
  No checkout, no payment, no order history required for the first version.

## Sources

Retailers: ITPro and Marketing Week (Tesco 2009 API), The Grocer (Tesco Labs, Tesco AI assistant),
nicklansley.com (Tesco NextGen API), github.com/tobyandrews1985/basketeer, github.com/abracadabra50/uk-grocery-cli,
github.com/MarkDunne/AsdaBot, pypi.org/project/asdabot, BusinessWire (Whisk + Sainsbury's, Jan 2021),
Retail Gazette and Sifted (Lollipop + Sainsbury's), Grocery Gazette (Asda → Ocado platform, May 2026),
Instacart press (Caper at Morrisons), Retail Tech Innovation Hub (Morrisons + Instaleap), Ocado Group
newsroom, Campaign and Media Week Awards (Guardian Feast × Ocado), waitrose.com help (multi-search),
Apify scraper READMEs (bot-protection notes), aboutamazon.co.uk (Iceland on Amazon), Retail Gazette
(Co-op + Deliveroo/Uber Eats), Amazon Associates add-to-cart documentation.

Intermediaries: docs.whisk.com, samsungfood.com/partners, Samsung Newsroom (Instacart, Jan 2025),
northfork.ai (blog and solutions pages), retail-optimiser.de (Coles + Northfork), Chicory WordPress
plugin page, mikmak.com retailer partnerships, docs.instacart.com (Developer Platform), developer.kroger.com
(via pypi kroger-cart), mealia.co.uk, addons.mozilla.org (Mealia extension permissions), startups.co.uk
(Mealia Startups 100), The Grocer (Cherrypick, Remy), pepesto.com, Retail Week (ChatGPT agent test),
retailtechnology.co.uk (Tesco agentic commerce), Nordic APIs and Quora (why no supermarket APIs).
