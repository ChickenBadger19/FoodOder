import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type State } from '../api';
import { Badge, Card, Notice, Pill, Primary, Section, Spinner, titleCase } from '../ui';

export function Ask() {
  const nav = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => api.state().then(setState).catch(e => setError(e.message));
  useEffect(() => { reload(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await api.ask(text);
      setResults(r.results);
      setText('');
      await reload();
      // If exactly one recipe resolved and nothing else, go straight to it.
      const recipes = r.results.filter(x => x.kind === 'recipe');
      if (recipes.length === 1 && recipes[0].recipe && r.results.length === 1) {
        nav(`/recipe/${recipes[0].recipe.id}?servings=${recipes[0].servings}&day=${recipes[0].day ?? ''}`);
      }
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  async function buildBasket() {
    setBusy(true);
    try { const o = await api.propose(); nav(`/basket/${o.id}`); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  if (!state) return <Spinner />;
  const retailer = state.retailers[0];
  const recipeName = (id: string) => state.recipes.find(r => r.id === id)?.name ?? id;
  const member = (id: string) => state.members.find(m => m.id === id);

  return (
    <div className="flex flex-col gap-4 pt-3">
      <header className="flex items-center justify-between">
        <div className="text-xl font-extrabold tracking-tight">FoodOder</div>
        {retailer && (
          <Link to="/household" className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full ${retailer.session.connected ? 'text-green bg-green-soft' : 'text-red bg-red-soft'}`}>
            <span className={`w-2 h-2 rounded-full ${retailer.session.connected ? 'bg-green' : 'bg-red'}`} />
            {retailer.name}{retailer.session.expiresAt ? ` · ${Math.max(0, Math.round((new Date(retailer.session.expiresAt).getTime() - Date.now()) / 864e5))} days` : ''}
          </Link>
        )}
      </header>

      <h1 className="text-3xl font-extrabold leading-tight tracking-tight m-0">What are we cooking?</h1>

      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <label htmlFor="ask" className="text-[13px] font-semibold text-muted">Recipe, portions, day, or something you need</label>
        <div className="flex gap-2">
          <input id="ask" value={text} onChange={e => setText(e.target.value)} placeholder="lasagne for 6 on friday, and we need bleach"
            className="flex-1 min-w-0 text-[15px] px-3.5 py-3.5 rounded-2xl border-[1.5px] border-line-strong bg-white" />
          <button type="submit" disabled={busy} aria-label="Send" className="w-13 rounded-2xl bg-green text-white flex items-center justify-center disabled:opacity-60">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill onClick={() => setText('thai green curry for 4 on saturday')}>Try: curry for 4</Pill>
          <Pill onClick={() => setText("we're out of milk")}>Try: out of milk</Pill>
          <Pill onClick={() => setText('add bin bags')}>Try: add bin bags</Pill>
        </div>
        {!state.llm && <Notice>Recipes by name come from your saved recipes. Set <code>ANTHROPIC_API_KEY</code> on the server to generate new ones.</Notice>}
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
                    <div className="text-xs font-semibold text-muted">{r.servings} portions{r.day ? ` · ${titleCase(r.day)}` : ''} · {r.via === 'llm' ? 'generated, please check' : 'saved recipe'}</div>
                  </div>
                  <Link to={`/recipe/${r.recipe.id}?servings=${r.servings}&day=${r.day ?? ''}`} className="text-xs font-bold px-3 py-2 rounded-full bg-ink text-white">Review</Link>
                </div>
              )}
              {r.kind === 'recipe' && !r.recipe && r.candidates?.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="text-sm font-bold">Which "{r.query}"?</div>
                  <div className="flex gap-2 flex-wrap">{r.candidates.map((c: any) => <Link key={c.id} to={`/recipe/${c.id}?servings=${r.servings}&day=${r.day ?? ''}`} className="text-xs font-bold px-3 py-2 rounded-full border-[1.5px] border-line-strong bg-white">{c.name}</Link>)}</div>
                </div>
              )}
              {r.kind === 'recipe' && !r.recipe && !r.candidates?.length && (
                <div className="text-sm font-semibold text-amber">No recipe called "{r.query}" yet. Paste one on the Household screen or enable recipe generation.</div>
              )}
              {r.kind === 'list' && <div className="text-sm font-semibold">Added <b>{r.added.text}</b> to the running list{r.merged ? ' (was already on it)' : ''}.</div>}
              {r.kind === 'out_of' && <div className="text-sm font-semibold">Marked <b>{r.item}</b> as out of stock and added it to the list.</div>}
              {r.kind === 'stock_add' && (r.stock ? <div className="text-sm font-semibold">Added {r.stock.qty} {r.stock.unit === 'count' ? '' : r.stock.unit} <b>{r.stock.itemId}</b> to stock.</div> : <div className="text-sm font-semibold text-amber">{r.error}</div>)}
            </Card>
          ))}
        </Section>
      )}

      <Section title="This week's cook list" aside={`${state.plans.length} meal${state.plans.length === 1 ? '' : 's'}`}>
        {state.plans.length === 0 && <Card tone="dashed"><div className="text-sm font-semibold text-muted">Nothing planned. Ask for a recipe above.</div></Card>}
        {state.plans.map(p => {
          const eaters = p.eaterIds.map(member).filter(Boolean);
          const gf = eaters.some(m => m!.constraints.some(c => c.kind !== 'dislike'));
          return (
            <Card key={p.id}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{recipeName(p.recipeId)}</div>
                  <div className="text-xs font-semibold text-muted">{p.day ? `${titleCase(p.day)} · ` : ''}{p.servings} portions · {eaters.map(m => m!.name).join(', ')}{gf ? ' (dietary rules apply)' : ''}</div>
                </div>
                <Pill onClick={async () => { await api.cooked(p.id); reload(); }}>Cooked</Pill>
                <button aria-label="Remove" onClick={async () => { await api.deletePlan(p.id); reload(); }} className="w-9 h-9 rounded-full text-muted">×</button>
              </div>
            </Card>
          );
        })}
      </Section>

      <Section title="Running list" aside={<Link to="/basket" className="text-green font-bold">edit in basket</Link>}>
        <div className="flex gap-2 flex-wrap">
          {state.list.length === 0 && <span className="text-sm font-semibold text-muted">Empty. Say "we need …" above.</span>}
          {state.list.map(l => <Badge key={l.id} tone={l.addedVia === 'out_of' ? 'amber' : 'muted'}>{l.qty ? `${l.qty} × ` : ''}{l.text}{l.addedVia === 'out_of' ? ' · out' : ''}</Badge>)}
        </div>
      </Section>

      <Primary tone="ink" onClick={buildBasket} disabled={busy || (state.plans.length === 0 && state.list.length === 0)}>
        Build this week's basket
      </Primary>
    </div>
  );
}
