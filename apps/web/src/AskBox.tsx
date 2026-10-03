import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, notifyChanged, type State } from './api';
import { Card, Notice, Pill, Section, titleCase } from './ui';

/** The shared "say what you need" box: used on the home screen and in the chat sheet on every other screen. */
export function AskBox({ state, placeholder, initial = '', autoFocus = false, onResolved, compact = false }: {
  state: State;
  placeholder?: string;
  initial?: string;
  autoFocus?: boolean;
  /** Called after a successful ask with the results; return true to indicate the caller handled navigation. */
  onResolved?: (results: any[]) => void;
  compact?: boolean;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await api.ask(text);
      setResults(r.results);
      setText('');
      notifyChanged();
      onResolved?.(r.results);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  const recipeLink = (r: any, id: string) => `/recipe/${id}?servings=${r.servings}&day=${r.day ?? ''}&date=${r.date ?? ''}&slot=${r.slot ?? 'dinner'}&eaters=${(r.eaterIds ?? []).join(',')}`;

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        {!compact && <label htmlFor="ask" className="text-[13px] font-semibold text-muted">Recipe, portions, day, who's eating, or something you need</label>}
        <div className="flex gap-2">
          <input id="ask" value={text} onChange={e => setText(e.target.value)} autoFocus={autoFocus} placeholder={placeholder ?? 'lasagne for 6 on friday without sam, and we need bleach'}
            className="flex-1 min-w-0 text-[15px] px-3.5 py-3.5 rounded-2xl border-[1.5px] border-line-strong bg-white" />
          <button type="submit" disabled={busy} aria-label="Send" className="w-13 rounded-2xl bg-green text-white flex items-center justify-center disabled:opacity-60">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        {!compact && (
          <div className="flex gap-2 flex-wrap">
            <Pill onClick={() => setText('thai green curry for 4 on saturday')}>Try: curry for 4</Pill>
            <Pill onClick={() => setText('lasagne on friday without sam')}>Try: without Sam</Pill>
            <Pill onClick={() => setText('we need medium freezer bags')}>Try: freezer bags</Pill>
          </div>
        )}
        {!compact && !state.llm && <Notice>Recipes by name come from your saved recipes. Set <code>ANTHROPIC_API_KEY</code> on the server to generate new ones.</Notice>}
      </form>

      {error && <Notice tone="red">{error}</Notice>}

      {results && results.length > 0 && (
        <Section title="Understood as" aside={<button className="text-green font-bold" onClick={() => setResults(null)}>clear</button>}>
          {results.map((r, i) => (
            <Card key={i}>
              {r.kind === 'recipe' && r.recipe && (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{r.recipe.name}</div>
                    <div className="text-xs font-semibold text-muted">
                      {r.servings} portions{r.day ? ` · ${titleCase(r.day)}` : ''}{r.slot && r.slot !== 'dinner' ? ` ${r.slot}` : ''} · {r.eaters?.join(', ')} · {r.via === 'llm' ? 'generated, please check' : 'saved recipe'}
                    </div>
                  </div>
                  <Link to={recipeLink(r, r.recipe.id)} className="text-xs font-bold px-3 py-2 rounded-full bg-ink text-white whitespace-nowrap">Review</Link>
                </div>
              )}
              {r.kind === 'recipe' && !r.recipe && r.candidates?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-bold">Which "{r.query}"?</div>
                  <div className="flex gap-2 flex-wrap">{r.candidates.map((c: any) => <Link key={c.id} to={recipeLink(r, c.id)} className="text-xs font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong bg-white">{c.name}</Link>)}</div>
                </div>
              )}
              {r.kind === 'recipe' && !r.recipe && !r.candidates?.length && (
                <div className="text-sm font-semibold text-amber">No recipe called "{r.query}" yet. Paste one on the Household screen or enable recipe generation.</div>
              )}
              {r.kind === 'list' && (
                <div className="text-sm font-semibold">
                  Added <b>{r.added.text}</b> to the running list{r.merged ? ' (was already on it)' : ''}
                  {r.addedToDrafts?.length ? <> and to your open basket draft (<Link to={`/basket/${r.addedToDrafts[0]}`} className="text-green">see it</Link>)</> : ''}.
                </div>
              )}
              {r.kind === 'out_of' && <div className="text-sm font-semibold">Marked <b>{r.item}</b> as out of stock and added it to the list{r.addedToDrafts?.length ? ' and your open basket' : ''}.</div>}
              {r.kind === 'stock_add' && (r.stock ? <div className="text-sm font-semibold">Added {r.stock.qty} {r.stock.unit === 'count' ? '' : r.stock.unit} <b>{r.stock.itemId}</b> to stock.</div> : <div className="text-sm font-semibold text-amber">{r.error}</div>)}
            </Card>
          ))}
        </Section>
      )}
    </div>
  );
}
