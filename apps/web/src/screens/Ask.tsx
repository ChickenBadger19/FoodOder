import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, CHANGED, dateLabel, dayName, notifyChanged, type State } from '../api';
import { AskBox } from '../AskBox';
import { Badge, Card, Notice, Pill, Primary, Section, Spinner, titleCase } from '../ui';

export function Ask() {
  const nav = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => api.state().then(setState).catch(e => setError(e.message));
  useEffect(() => { reload(); window.addEventListener(CHANGED, reload); return () => window.removeEventListener(CHANGED, reload); }, []);

  async function buildBasket() {
    setBusy(true);
    try { const o = await api.propose(); nav(`/basket/${o.id}`); } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  if (!state) return <Spinner />;
  const retailer = state.retailers[0];
  const recipeName = (id: string) => state.recipes.find(r => r.id === id)?.name ?? id;
  const member = (id: string) => state.members.find(m => m.id === id);
  const plans = [...state.plans].sort((a, b) => (a.date ?? '9') < (b.date ?? '9') ? -1 : 1);

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

      <AskBox state={state} onResolved={results => {
        const recipes = results.filter(x => x.kind === 'recipe');
        if (recipes.length === 1 && recipes[0].recipe && results.length === 1) {
          const r = recipes[0];
          nav(`/recipe/${r.recipe.id}?servings=${r.servings}&day=${r.day ?? ''}&date=${r.date ?? ''}&slot=${r.slot ?? 'dinner'}&eaters=${(r.eaterIds ?? []).join(',')}`);
        }
      }} />

      {error && <Notice tone="red">{error}</Notice>}

      <Section title="Coming up" aside={<Link to="/week" className="text-green font-bold">plan the week</Link>}>
        {plans.length === 0 && <Card tone="dashed"><div className="text-sm font-semibold text-muted">Nothing planned. Ask above, or <Link to="/week" className="text-green font-bold">plan the week</Link>.</div></Card>}
        {plans.map(p => {
          const eaters = p.eaterIds.map(member).filter(Boolean);
          const rules = eaters.some(m => m!.constraints.some(c => c.kind !== 'dislike'));
          return (
            <Card key={p.id}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-bold">{recipeName(p.recipeId)}</div>
                  <div className="text-xs font-semibold text-muted">
                    {p.date ? `${dayName(p.date)} ${dateLabel(p.date)}` : 'Unscheduled'}{p.slot !== 'dinner' ? ` ${p.slot}` : ''} · {p.servings} portions · {eaters.map(m => m!.name).join(', ')}{rules ? ' · rules apply' : ''}
                  </div>
                </div>
                <Pill onClick={async () => { await api.cooked(p.id); notifyChanged(); }}>Cooked</Pill>
                <button aria-label="Remove" onClick={async () => { await api.deletePlan(p.id); notifyChanged(); }} className="w-9 h-9 rounded-full text-muted">×</button>
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
      <div className="text-xs font-semibold text-muted text-center">{titleCase('nothing is ordered until you approve the basket')}</div>
    </div>
  );
}
