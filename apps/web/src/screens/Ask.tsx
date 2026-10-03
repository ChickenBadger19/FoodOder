import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { api, CHANGED, dateLabel, dayName, notifyChanged, type State } from '../api';
import { AskBox } from '../AskBox';
import { Badge, Notice, Section, Spinner } from '../ui';
import { Button } from '@/components/ui/button';

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
  const toShop = plans.length;

  return (
    <div className="flex flex-col gap-6 pt-4 min-h-full">
      <header className="flex items-center justify-between">
        <div className="font-display label-micro text-[12px] tracking-[0.18em] font-extrabold">Foodify</div>
        {retailer && (
          <Link to="/household" className={`label-micro px-2 py-1.5 rounded-[3px] border ${retailer.session.connected ? 'border-foreground/35 text-foreground' : 'border-destructive text-destructive'}`}>
            {retailer.name}{retailer.session.expiresAt ? ` · ${Math.max(0, Math.round((new Date(retailer.session.expiresAt).getTime() - Date.now()) / 864e5))} days` : ''}
          </Link>
        )}
      </header>

      <h1 className="text-[40px] leading-[0.98] tracking-[-0.02em] font-extrabold m-0">What are we{' '}<br />cooking?</h1>

      <AskBox state={state} onResolved={results => {
        const recipes = results.filter(x => x.kind === 'recipe');
        if (recipes.length === 1 && recipes[0].recipe && results.length === 1) {
          const r = recipes[0];
          nav(`/recipe/${r.recipe.id}?servings=${r.servings}&day=${r.day ?? ''}&date=${r.date ?? ''}&slot=${r.slot ?? 'dinner'}&eaters=${(r.eaterIds ?? []).join(',')}`);
        }
      }} />

      {error && <Notice tone="red">{error}</Notice>}

      <Section title="This week" aside={<Link to="/week" className="text-primary">{toShop ? `${toShop} meal${toShop === 1 ? '' : 's'} · plan` : 'plan the week'}</Link>}>
        {plans.length === 0 && <p className="m-0 text-[15px] text-muted-foreground">Nothing planned yet. Ask above, or <Link to="/week" className="text-primary font-semibold">plan the week</Link>.</p>}
        <div className="flex flex-col">
          {plans.map(p => {
            const eaters = p.eaterIds.map(member).filter(Boolean);
            const everyone = state.members.filter(m => m.eatsByDefault).every(m => p.eaterIds.includes(m.id));
            const rules = eaters.some(m => m!.constraints.some(c => c.kind !== 'dislike'));
            return (
              <div key={p.id} className="grid grid-cols-[48px_1fr_auto] gap-3 items-center py-3 row-dotted">
                <span className="font-display label-micro text-[12px] font-extrabold text-primary">{p.date ? dayName(p.date, 'short') : '—'}</span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[16px] font-semibold leading-tight">{recipeName(p.recipeId)}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {p.date ? dateLabel(p.date) : 'unscheduled'}{p.slot !== 'dinner' ? ` ${p.slot}` : ''} · {p.servings} · {everyone ? 'everyone' : eaters.map(m => m!.name).join(', ')}{rules ? ' · rules apply' : ''}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={async () => { await api.cooked(p.id); notifyChanged(); }}>Cooked</Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={async () => { await api.deletePlan(p.id); notifyChanged(); }}>×</Button>
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Also need" aside={<Link to="/basket" className="text-primary">edit</Link>}>
        {state.list.length === 0 ? (
          <p className="m-0 text-[15px] text-muted-foreground">Nothing extra. Say "we need …" above.</p>
        ) : (
          <p className="m-0 text-[15px] leading-relaxed">
            {state.list.map((l, i) => (
              <span key={l.id}>
                {i > 0 && (i === state.list.length - 1 ? ' and ' : ', ')}
                <span className={l.addedVia === 'out_of' ? 'text-warning font-semibold' : ''}>{l.qty ? `${l.qty} × ` : ''}{l.text}{l.addedVia === 'out_of' ? ' (out)' : ''}</span>
              </span>
            ))}.
          </p>
        )}
      </Section>

      <div className="mt-auto flex flex-col gap-2 pb-2">
        <Button size="lg" onClick={buildBasket} disabled={busy || (state.plans.length === 0 && state.list.length === 0)} className="justify-between">
          <span>Build this week's basket</span>
          <ArrowRightIcon />
        </Button>
        <div className="label-micro text-muted-foreground text-center">Nothing is ordered until you approve it</div>
      </div>
      <div className="hidden"><Badge>keep</Badge></div>
    </div>
  );
}
