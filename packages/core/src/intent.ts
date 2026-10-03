/**
 * Turn "lasagne for 6 on friday, and we need bleach" into structured intents.
 * Rule-based so it works offline; an LLM can refine ambiguous asks later.
 */
export interface RecipeIntent {
  kind: 'recipe';
  query: string;
  servings: number | null;
  day: string | null;
  slot: 'breakfast' | 'lunch' | 'dinner' | null;
  /** Names mentioned as the only eaters ("just me and Alex"). Resolved to members by the caller. */
  only: string[];
  /** Names excluded ("without Sam", "everyone except Sam"). */
  except: string[];
}
export interface ListIntent { kind: 'list'; item: string; qty: number | null; }
export interface OutOfIntent { kind: 'out_of'; item: string; }
export interface StockAddIntent { kind: 'stock_add'; item: string; qty: number | null; }
export type Intent = RecipeIntent | ListIntent | OutOfIntent | StockAddIntent;

export const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'tomorrow', 'tonight', 'today', 'weekend'];
const SLOTS = ['breakfast', 'lunch', 'dinner', 'tea', 'supper'] as const;

function splitNames(s: string): string[] {
  return s.split(/\s*(?:,|&|\band\b|\+)\s*/).map(n => n.trim()).filter(Boolean);
}

/** Pull "just X and Y" / "without Z" / "everyone except Z" out of a recipe clause. */
export function extractEaters(text: string): { rest: string; only: string[]; except: string[] } {
  let rest = text;
  const only: string[] = [];
  const except: string[] = [];
  const exc = rest.match(/\b(?:everyone |all )?(?:except|without|but not|minus|not for)\s+((?:[a-z]+)(?:\s*(?:,|&|and|\+)\s*[a-z]+)*)\b/);
  if (exc) { except.push(...splitNames(exc[1]!)); rest = rest.replace(exc[0], ' '); }
  const just = rest.match(/\b(?:just|only)\s+(?:for\s+)?((?:[a-z]+)(?:\s*(?:,|&|and|\+)\s*[a-z]+)*)\b/);
  if (just) { only.push(...splitNames(just[1]!)); rest = rest.replace(just[0], ' '); }
  else {
    const forNames = rest.match(/\bfor\s+((?:[a-z]+)(?:\s*(?:,|&|and|\+)\s*[a-z]+)*)\s*(?:only)?$/);
    if (forNames && !/^\d/.test(forNames[1]!) && !DAYS.includes(forNames[1]!) && !/^(dinner|lunch|breakfast|tea|supper|everyone|all|us)$/.test(forNames[1]!)) {
      only.push(...splitNames(forNames[1]!)); rest = rest.replace(forNames[0], ' ');
    }
  }
  return { rest: rest.replace(/\s+/g, ' ').trim(), only: only.map(n => n.replace(/^me$/, 'me')), except };
}

const NOT_A_NAME = new Set([...DAYS, ...SLOTS, 'we', 'i', 'you', 'everyone', 'all', 'us', 'the', 'a', 'an', 'some', 'more', 'it', 'them', 'that', 'this', 'need', 'add']);

/** "just me and alex" must survive clause splitting: join names after eater keywords with "&". */
function protectNameLists(text: string): string {
  let prev = '';
  let out = text;
  while (out !== prev) {
    prev = out;
    out = out.replace(/\b((?:just|only|except|without|but not|minus|not for|for)\s+(?:[a-z]+\s*(?:&|,)\s*)*[a-z]+)\s+and\s+([a-z]+)\b/g, (m, head: string, next: string) => {
      const first = head.split(/\s+/).slice(1).join(' ').split(/\s*(?:&|,)\s*/).pop() ?? '';
      if (NOT_A_NAME.has(first) || NOT_A_NAME.has(next) || /^\d/.test(first)) return m;
      return `${head} & ${next}`;
    });
  }
  return out;
}

function splitClauses(text: string): string[] {
  return protectNameLists(text)
    .replace(/\s+/g, ' ')
    .split(/\s*(?:,|;|\band also\b|\balso\b|\band then\b|\bthen\b|\band\b|\bplus\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function stripQty(s: string): { item: string; qty: number | null } {
  const m = s.match(/^(\d+)\s*(?:x\s*)?(.+)$/);
  if (m) return { item: m[2]!.trim(), qty: Number(m[1]) };
  const some = s.match(/^(?:some|a|an|the)\s+(.+)$/);
  if (some) return { item: some[1]!.trim(), qty: null };
  return { item: s.trim(), qty: null };
}

export function parseAsk(text: string): Intent[] {
  const intents: Intent[] = [];
  let lastDay: string | null = null;
  for (const clause0 of splitClauses(text.toLowerCase())) {
    let clause = clause0.replace(/^(?:(?:oh|hey|hi|um|so|ok|okay|right|also|and)\s+)+/, '').replace(/^(we|i|we'll|let's|lets|can you|could you|please)\s+/, '').trim();
    const last = intents[intents.length - 1];

    const out = clause.match(/^(?:we're|we are|i'm|i am|were|are)?\s*(?:out of|run out of|ran out of|finished|used up|no more)\s+(.+)$/);
    if (out) { intents.push({ kind: 'out_of', item: stripQty(out[1]!).item }); continue; }

    const need = clause.match(/^(?:need|needs|want|add|buy|get|pick up|grab|order)\s+(?:some\s+|more\s+)?(.+)$/);
    if (need) {
      const rest = need[1]!.replace(/^(to the list|to list|to basket)\s*/, '').replace(/\s+(to the list|to list|to the basket|to basket)$/, '');
      // "need lasagne for 6" is a recipe ask, not a list item
      if (!/\bfor \d+\b/.test(rest) && !DAYS.some(d => rest.includes(d))) {
        const { item, qty } = stripQty(rest);
        intents.push({ kind: 'list', item, qty });
        continue;
      }
      clause = rest;
    }

    const have = clause.match(/^(?:we have|i have|got|have|bought|just bought|put away)\s+(.+)$/);
    if (have) { const { item, qty } = stripQty(have[1]!); intents.push({ kind: 'stock_add', item, qty }); continue; }

    // "we need bleach, some kitchen roll and 2 sponges": bare clauses after a list item are more list items.
    const looksLikeRecipe = /\bfor \d+\b/.test(clause) || DAYS.some(d => new RegExp(`\\b${d}\\b`).test(clause)) || SLOTS.some(sl => new RegExp(`\\b${sl}\\b`).test(clause)) || /^(plan|make|cook|making|cooking)\b/.test(clause);
    if (last && (last.kind === 'list' || last.kind === 'out_of') && !looksLikeRecipe) {
      const { item, qty } = stripQty(clause);
      intents.push({ kind: 'list', item, qty });
      continue;
    }

    // Recipe: "<name> for N [on <day>] [for lunch] [just X and Y | without Z]"
    let servings: number | null = null;
    let day: string | null = null;
    let slot: RecipeIntent['slot'] = null;
    let query = clause.replace(/^(plan|make|cook|do|have|i want to make|i'd like|i want|let's make|lets make|making|cooking)\s+/, '');
    const forN = query.match(/\bfor\s+(\d+)(?:\s+(?:people|persons|of us|portions|servings))?\b/);
    if (forN) { servings = Number(forN[1]); query = query.replace(forN[0], ' '); }
    const dayM = query.match(new RegExp(`\\b(?:on|for)?\\s*(${DAYS.join('|')})\\b`));
    if (dayM) { day = dayM[1]!; query = query.replace(dayM[0], ' '); }
    const slotM = query.match(new RegExp(`\\b(?:for|at)?\\s*(${SLOTS.join('|')})\\b`));
    if (slotM) { const w = slotM[1]!; slot = w === 'breakfast' ? 'breakfast' : w === 'lunch' ? 'lunch' : 'dinner'; query = query.replace(slotM[0], ' '); }
    const eaters = extractEaters(query);
    query = eaters.rest.replace(/\b(a|an|some|the)\s+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query) continue;
    if (day) lastDay = day;
    intents.push({ kind: 'recipe', query, servings, day: day ?? lastDay, slot, only: eaters.only, except: eaters.except });
  }
  return intents;
}
