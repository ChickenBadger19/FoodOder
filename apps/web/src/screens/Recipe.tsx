import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, dateLabel, dayName, notifyChanged, type Preview, type Slot, type State } from '../api';
import { Badge, Card, Notice, Primary, Section, Spinner, titleCase } from '../ui';

export function RecipeScreen() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [servings, setServings] = useState(Number(params.get('servings')) || 4);
  const [day] = useState<string | null>(params.get('day') || null);
  const [date] = useState<string | null>(params.get('date') || null);
  const [slot] = useState<Slot>((params.get('slot') as Slot) || 'dinner');
  const [eaterIds, setEaterIds] = useState<string[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.state().then(s => {
      setState(s);
      const fromUrl = (params.get('eaters') || '').split(',').filter(Boolean).filter(id => s.members.some(m => m.id === id));
      setEaterIds(fromUrl.length ? fromUrl : s.members.filter(m => m.eatsByDefault).map(m => m.id));
    });
  }, []);
  useEffect(() => {
    if (!id || !eaterIds) return;
    api.preview(id, servings, eaterIds).then(setPreview).catch(e => setError(e.message));
  }, [id, servings, eaterIds]);

  if (!state || !eaterIds || !preview) return error ? <Notice tone="red">{error}</Notice> : <Spinner />;

  const toBuy = preview.lines.filter(l => !l.staple && l.scaling !== 'to_taste' && (l.qty ?? 0) > l.haveQty).length;
  const swaps = preview.lines.filter(l => l.swappedFrom).length;
  const unresolved = preview.lines.filter(l => l.swapReason?.includes('no substitute'));
  const constrained = state.members.filter(m => eaterIds.includes(m.id) && m.constraints.some(c => c.kind !== 'dislike'));

  async function addToPlan() {
    try { await api.addPlan(id!, servings, day, eaterIds!, date ?? undefined, slot); notifyChanged(); nav(date ? '/week' : '/'); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="flex flex-col gap-3.5 pt-3">
      <header className="flex items-center gap-3">
        <Link to="/" aria-label="Back" className="w-11 h-11 flex items-center justify-center rounded-xl"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></Link>
        <div className="font-extrabold">Confirm recipe</div>
      </header>

      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight m-0">{preview.recipe.name}</h1>
        <div className="text-xs font-semibold text-muted-foreground">{preview.recipe.source.type === 'llm' ? 'Generated recipe, check it' : preview.recipe.source.type === 'seed' ? 'Saved recipe' : titleCase(preview.recipe.source.type)} · originally serves {preview.recipe.servings}{date ? ` · ${dayName(date)} ${dateLabel(date)}${slot !== 'dinner' ? ` ${slot}` : ''}` : day ? ` · cooking ${titleCase(day)}` : ''}</div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Card>
          <div className="text-xs font-bold text-muted-foreground mb-2">Portions</div>
          <div className="flex items-center justify-between">
            <button aria-label="Fewer" onClick={() => setServings(s => Math.max(1, s - 1))} className="w-11 h-11 rounded-xl border-[1.5px] border-input bg-background text-xl font-bold">−</button>
            <div className="text-2xl font-extrabold">{servings}</div>
            <button aria-label="More" onClick={() => setServings(s => s + 1)} className="w-11 h-11 rounded-xl border-[1.5px] border-input bg-background text-xl font-bold">+</button>
          </div>
        </Card>
        <Card>
          <div className="text-xs font-bold text-muted-foreground mb-2">Shortfall</div>
          <div className="text-2xl font-extrabold">{toBuy} <span className="text-sm font-bold text-muted-foreground">to buy</span></div>
        </Card>
      </div>

      <Card>
        <div className="text-xs font-bold text-muted-foreground mb-2">Who's eating</div>
        <div className="flex gap-2 flex-wrap">
          {state.members.map(m => {
            const on = eaterIds.includes(m.id);
            const hasRule = m.constraints.some(c => c.kind !== 'dislike');
            return (
              <label key={m.id} className={`flex items-center gap-1.5 text-[13px] font-bold px-3 py-2 rounded-full cursor-pointer ${on ? (hasRule ? 'bg-warning text-white' : 'bg-foreground text-white') : 'bg-card border-[1.5px] border-input'}`}>
                <input type="checkbox" checked={on} onChange={e => setEaterIds(ids => e.target.checked ? [...ids!, m.id] : ids!.filter(x => x !== m.id))} className="m-0" />
                {m.name}{hasRule ? ` · ${m.constraints.filter(c => c.kind !== 'dislike').map(c => c.kind === 'gluten_free' ? 'GF' : c.kind.replace('_free', '-free')).join(', ')}` : ''}
              </label>
            );
          })}
        </div>
        {constrained.length > 0 && (
          <div className="mt-2">
            <Notice tone="amber">{constrained.map(m => m.name).join(', ')}: {preview.constraints.map(c => `${c.allergen}-free (${c.strictness})`).join(', ')}. {swaps} ingredient{swaps === 1 ? '' : 's'} swapped below.</Notice>
          </div>
        )}
        {unresolved.length > 0 && <div className="mt-2"><Notice tone="red">No substitute known for {unresolved.map(l => l.itemName).join(', ')}. It will be checked at basket stage.</Notice></div>}
      </Card>

      <Section title={`Ingredients · scaled to ${servings}`}>
        {preview.lines.map((l, i) => {
          const need = l.qty ?? 0;
          const status = l.staple ? 'staple' : l.scaling === 'to_taste' ? 'staple' : l.haveQty >= need && need > 0 ? 'have' : l.haveQty > 0 ? 'partial' : 'buy';
          return (
            <Card key={i} tone={l.swappedFrom ? 'amber' : 'default'}>
              <div className="flex items-center gap-2.5">
                <div className="w-20 shrink-0 text-sm font-extrabold">{l.label || 'to taste'}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{l.itemName}{l.prep ? <span className="text-muted-foreground">, {l.prep}</span> : ''}{l.optional ? <span className="text-muted-foreground"> (optional)</span> : ''}</div>
                  {l.swappedFrom && <div className="text-[11px] font-semibold text-warning">swapped from {l.swappedFrom}</div>}
                  {l.swapReason && !l.swappedFrom && <div className="text-[11px] font-semibold text-destructive">{l.swapReason}</div>}
                  {!l.itemId && <div className="text-[11px] font-semibold text-muted-foreground">not in catalogue yet</div>}
                </div>
                {status === 'staple' && <Badge>staple</Badge>}
                {status === 'have' && <Badge tone="green">have{l.haveApprox ? ' ~' : ''}</Badge>}
                {status === 'partial' && <Badge tone="amber">have some</Badge>}
                {status === 'buy' && <Badge tone="amber">buy</Badge>}
              </div>
            </Card>
          );
        })}
        <button onClick={() => setShowSteps(s => !s)} className="text-[13px] font-bold text-primary text-left py-1">{showSteps ? 'Hide' : 'Show'} method ({preview.recipe.steps.length} steps)</button>
        {showSteps && <ol className="text-sm font-medium flex flex-col gap-2 pl-5 m-0">{preview.recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      </Section>

      {error && <Notice tone="red">{error}</Notice>}
      <div className="sticky bottom-0 bg-background pt-2 pb-1 flex flex-col gap-1.5">
        <Primary onClick={addToPlan}>{date ? `Plan for ${dayName(date)}` : 'Add to cook list'}</Primary>
        <div className="text-center text-xs font-semibold text-muted-foreground">Nothing is ordered yet</div>
      </div>
    </div>
  );
}
