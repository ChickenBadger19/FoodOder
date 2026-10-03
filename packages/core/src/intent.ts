/**
 * Turn "lasagne for 6 on friday, and we need bleach" into structured intents.
 * Rule-based so it works offline; an LLM can refine ambiguous asks later.
 */
export interface RecipeIntent { kind: 'recipe'; query: string; servings: number | null; day: string | null; }
export interface ListIntent { kind: 'list'; item: string; qty: number | null; }
export interface OutOfIntent { kind: 'out_of'; item: string; }
export interface StockAddIntent { kind: 'stock_add'; item: string; qty: number | null; }
export type Intent = RecipeIntent | ListIntent | OutOfIntent | StockAddIntent;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'tomorrow', 'tonight', 'today', 'weekend'];

function splitClauses(text: string): string[] {
  return text
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
    let clause = clause0.replace(/^(we|i|we'll|let's|lets|can you|could you|please)\s+/, '').trim();

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

    // Recipe: "<name> for N [on <day>]"
    let servings: number | null = null;
    let day: string | null = null;
    let query = clause.replace(/^(make|cook|do|have|i want to make|i'd like|i want|let's make|lets make|making|cooking)\s+/, '');
    const forN = query.match(/\bfor\s+(\d+)(?:\s+(?:people|persons|of us|portions|servings))?\b/);
    if (forN) { servings = Number(forN[1]); query = query.replace(forN[0], ' '); }
    const dayM = query.match(new RegExp(`\\b(?:on|for)?\\s*(${DAYS.join('|')})\\b`));
    if (dayM) { day = dayM[1]!; query = query.replace(dayM[0], ' '); }
    query = query.replace(/\b(a|an|some|the)\s+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query) continue;
    // bare "6" at the start of a clause: "6 of the curry"
    if (day) lastDay = day;
    intents.push({ kind: 'recipe', query, servings, day: day ?? lastDay });
  }
  return intents;
}
