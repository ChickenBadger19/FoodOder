# Design direction: how a studio would do this, and what we're changing

## Why the current UI reads as "AI-made"

Honest list, because each item is fixable:

1. **Component defaults with a colour swapped.** Every element is a rounded card with a hairline
   border; every control is a pill. That is the shadcn/Tailwind default grammar and it is
   everywhere now, so it reads as template, not product.
2. **One weight of everything.** Almost all text is bold or extra-bold. Without contrast there is
   no hierarchy, so the eye has nowhere to go.
3. **Green because food.** Chard green is a cliché for groceries and it collides with Asda and
   Waitrose. A studio would run the palette against every competitor's brand before choosing.
4. **Card soup.** Lists of identical cards with badges inside badges. Real products use rows,
   rules, white space and type size to organise, and reserve "cards" for things that are actually
   objects (a product, a meal).
5. **No idea behind it.** There is no creative concept the visual language expresses. Agencies
   call this the "organising idea"; without one, every choice is arbitrary, and arbitrary looks
   generated.

## How a top studio would run it (with an agency like Saatchi & Saatchi)

The agency owns the brand idea; the product studio owns the experience. Both work from one brief.

1. **Brief and insight.** Who is this for and what is the single truth. Ours: *households where
   one person's food can hurt them.* The shop is an act of care, done under time pressure, with
   zero tolerance for a wrong product. Everything downstream serves that.
2. **Organising idea.** One line the whole product expresses. Proposal: **"Knows your kitchen."**
   It knows who eats, what's in the cupboard, what's safe. The UI should feel like a trusted
   shopkeeper who remembers you, not a chatbot.
3. **Naming and voice.** "FoodOder" is a working title. The agency would test names; the voice
   would be plain, warm, a little dry, never cute. Copy decks come before screens.
4. **Visual territories.** Two or three distinct art directions, each a coherent world (type,
   colour, layout grammar, photography or illustration policy, motion), presented as a few key
   screens and a mood board. The client picks one; the studio then builds the system.
5. **Design system, then screens.** Type scale, spacing, colour roles, components *derived from
   the territory*, not from a library. Component libraries are used underneath for accessibility
   and behaviour (Radix is fine) and skinned until invisible.
6. **Test early, with the right people.** Five households with a coeliac or allergy, task-based
   sessions on a phone: "plan Friday, Sam is not eating", "we're out of milk", "approve the shop".
   Measure completion, errors, and whether they trust the dietary block. Iterate weekly.
7. **Craft pass.** Micro-copy, empty states, loading, error states, haptics, motion curves, icons
   drawn to one grid, dark mode as a first-class theme. This is where "finished" comes from.

## The three territories (on the canvas, artboards 8 to 10)

| | A · Deli Counter | B · Enamel | C · Pantry Editorial |
|---|---|---|---|
| World | Butcher's paper, stamped labels, receipts, the British high-street grocer | Flat enamel signage, confident colour blocks, modern utility | Food magazine, serif headlines, hairlines, warm neutrals |
| Ground | Paper #F1E9DA | Chalk #F6F4EE | Linen #FBF8F2 |
| Ink | #17150F | #101418 | #1A1A1A |
| Brand colour | Brick #A8432A | Teal #0F5C63 | Tomato #C8321F |
| Accent | Mustard #B9860F (text), #E3B23C (fills) | Mustard #E3B23C | Olive #5E6B3A |
| Display type | Bricolage Grotesque (wide, 800) | Schibsted Grotesk 700 | Instrument Serif |
| Body type | Instrument Sans | Schibsted Grotesk | Instrument Sans |
| Layout grammar | Rows with dotted leaders, hairline rules, squared blocks, radius 4 | Colour-block headers, borderless white panels, radius 12 | Numbered lists, generous margins, italic emphasis, radius 2 |
| Labels | Uppercase micro-labels, letterspaced, hairline border | Solid chips in accent on white | Small caps in ink |
| Competitor clash | None of the big six use brick + paper | Nobody owns teal in UK grocery | Tomato is near Tesco red; manage with warmth and serif |
| Feels like | A good independent shop that knows you | A confident utility that gets out of the way | A weekend cookbook |

**Recommendation: A, Deli Counter.** It is the most distinctive, it carries the "knows your
kitchen" idea literally (your shop keeps a tab for you), it is warm without being twee, and the
receipt-and-label grammar maps naturally onto lists, quantities, prices and the approval step.
B is the safe second choice if the brand needs to feel more "fintech-trustworthy". C is lovely but
leans towards content, and this product is a tool.

## Revision after the colour research (October 2026)

The cream/paper ground of Territory A was replaced following a five-stream evidence review
(`docs/colour-research.md`). Short version: no study shows cream beats white on a phone; cream
costs contrast on every mid-tone, flattens the white-card lift, skews the red/amber/green status hues
and is now a recognised template look. The type and layout grammar of Territory A stay; the colour
system is now:

- Page #FCF9FB (near-white, brand-tinted below visibility), cards pure white, ink #221A20.
- One brand colour: deep plum #752B69, chosen by elimination against the UK grocer hue map and
  because it stays distinguishable from the block red for red-green colour-blind users.
- Semantic states separated by lightness and shape, not hue: block #A70511 is the only dark solid in
  the system and red appears nowhere else; caution is amber #FDBE45 with dark text; safe is always
  a pale container #DCF8EA, never a solid. Every state carries an icon, a border in its text colour,
  and the word.
- A dietary block is never a disabled button: it stays fully readable and tapping it says exactly
  what is blocked and why.

## What changed in the app (Deli Counter, as first applied)

- Type: Bricolage Grotesque for headlines and section titles, Instrument Sans for everything else,
  three weights only (400, 600, 800). Body text is regular weight; bold is reserved for names and
  numbers.
- Colour: paper ground, ink text, brick as the single brand colour (primary actions, active nav),
  mustard for dietary flags, deep red only for hard stops. No green.
- Shape: radius 4 to 8 instead of pills; squared primary blocks; hairline rules in ink at 15%.
- Lists: rows separated by rules, not stacked cards. Cards only for products in the basket.
- Labels: uppercase micro-labels with letterspacing instead of coloured pills.
- Nav: text labels under icons, active state as a brick rule above the item.

Tokens are in `apps/web/src/index.css`; swapping to territory B or C is a tokens-and-fonts change
plus the label and card variants.

## How to test it (the product, and with people)

Run it locally (README), or `docker build -t foododer . && docker run -p 8787:8787 foododer`, then
open http://localhost:8787 on a phone on the same network and "Add to Home Screen".

For user testing, recruit five households with at least one allergy or coeliac member. Give each
the same four tasks on their own phone, watch, do not help:

1. Set yourselves up (the first-run flow). Note where they hesitate on strictness wording.
2. "Plan Friday's dinner, [allergic person] is not eating." Watch whether they find who's eating.
3. "Tell it you're out of milk." Do they find chat, and do they believe it did something?
4. Approve the basket. Do they read the dietary badges, and do they trust the block?

Score completion, time, errors, and one question at the end: "Would you let it order for you?"
