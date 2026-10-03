import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { addDays, api, CHANGED, dateLabel, dayName, isoToday, notifyChanged, type Plan, type Slot, type State } from '../api';
import { Badge, Card, Notice, Pill, Primary, Spinner, titleCase } from '../ui';

const SLOTS: Slot[] = ['breakfast', 'lunch', 'dinner'];

export function WeekScreen() {
  const nav = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [week, setWeek] = useState<{ start: string; end: string; plans: Plan[]; unscheduled: Plan[] } | null>(null);
  const [adding, setAdding] = useState<{ date: string; slot: Slot } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => Promise.all([api.state(), api.week(2)]).then(([s, w]) => { setState(s); setWeek(w); }).catch(e => setError(e.message));
  useEffect(() => { reload(); window.addEventListener(CHANGED, reload); return () => window.removeEventListener(CHANGED, reload); }, []);

  if (!state || !week) return error ? <Notice tone="red">{error}</Notice> : <Spinner />;

  const today = isoToday();
  const days: string[] = [];
  for (let d = week.start; d <= week.end; d = addDays(d, 1)) days.push(d);
  const recipeName = (id: string) => state.recipes.find(r => r.id === id)?.name ?? id;
  const member = (id: string) => state.members.find(m => m.id === id);
  const toShop = week.plans.filter(p => p.status === 'planned').length;

  async function change(p: Plan, patch: Partial<Plan>) {
    try { await api.patchPlan(p.id, patch); notifyChanged(); } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <header className="flex items-center justify-between">
        <div className="font-extrabold">This week &amp; next</div>
        <span className="text-xs font-semibold text-muted">{toShop} meal{toShop === 1 ? '' : 's'} planned</span>
      </header>
      {error && <Notice tone="red">{error}</Notice>}

      {week.unscheduled.length > 0 && (
        <Card tone="dashed">
          <div className="text-xs font-bold text-muted mb-1">Not on a day yet</div>
          {week.unscheduled.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-2 py-1">
              <span className="text-sm font-bold">{recipeName(p.recipeId)} · {p.servings}</span>
              <Pill onClick={() => change(p, { date: today })}>Put on today</Pill>
            </div>
          ))}
        </Card>
      )}

      {days.map(date => {
        const plans = week.plans.filter(p => p.date === date);
        const isToday = date === today;
        const past = date < today;
        return (
          <section key={date} className={`flex flex-col gap-2 ${past ? 'opacity-60' : ''}`}>
            <div className="flex items-baseline justify-between">
              <h2 className={`m-0 text-[15px] font-extrabold ${isToday ? 'text-green' : ''}`}>{dayName(date)}{isToday ? ' · today' : ''}</h2>
              <span className="text-xs font-semibold text-muted">{dateLabel(date)}</span>
            </div>
            {plans.length === 0 && !adding && (
              <button onClick={() => setAdding({ date, slot: 'dinner' })} className="text-left text-sm font-semibold text-muted border-[1.5px] border-dashed border-line-strong rounded-2xl px-3 py-3 bg-white/60">+ Add a meal</button>
            )}
            {plans.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot)).map(p => {
              const eaters = p.eaterIds.map(member).filter(Boolean);
              const everyone = state.members.filter(m => m.eatsByDefault).every(m => p.eaterIds.includes(m.id));
              return (
                <Card key={p.id} tone={p.status === 'cooked' ? 'dashed' : 'default'} className={p.status === 'cooked' ? 'opacity-60' : ''}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold">{recipeName(p.recipeId)}{p.status === 'cooked' ? ' · cooked' : ''}</div>
                      <div className="text-xs font-semibold text-muted">{titleCase(p.slot)} · {p.servings} portions · {everyone ? 'everyone' : eaters.map(m => m!.name).join(', ') || 'nobody?'}</div>
                    </div>
                    {p.status === 'planned' && <Pill onClick={async () => { await api.cooked(p.id); notifyChanged(); }}>Cooked</Pill>}
                    <button aria-label="Remove" onClick={async () => { await api.deletePlan(p.id); notifyChanged(); }} className="w-9 h-9 rounded-full text-muted">×</button>
                  </div>
                  {p.status === 'planned' && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {state.members.map(m => {
                        const on = p.eaterIds.includes(m.id);
                        const rule = m.constraints.some(c => c.kind !== 'dislike');
                        return (
                          <button key={m.id} onClick={() => change(p, { eaterIds: on ? p.eaterIds.filter(x => x !== m.id) : [...p.eaterIds, m.id] })}
                            className={`text-[11px] font-extrabold px-2.5 py-1.5 rounded-full border-[1.5px] ${on ? (rule ? 'bg-amber text-white border-amber' : 'bg-ink text-white border-ink') : 'bg-white border-line-strong text-muted'}`}>
                            {m.name}{rule && on ? ' · rules' : ''}
                          </button>
                        );
                      })}
                      <span className="flex-1" />
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        <Pill onClick={() => change(p, { servings: Math.max(1, p.servings - 1) })}>−</Pill>
                        <span className="text-xs font-bold">{p.servings}</span>
                        <Pill onClick={() => change(p, { servings: p.servings + 1 })}>+</Pill>
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
            {plans.length > 0 && !adding && (
              <button onClick={() => setAdding({ date, slot: 'dinner' })} className="text-left text-xs font-bold text-green px-1">+ Another meal (e.g. something different for one person)</button>
            )}
            {adding?.date === date && (
              <AddMeal state={state} date={date} slot={adding.slot} onClose={() => setAdding(null)} onAsk={() => nav('/')} />
            )}
          </section>
        );
      })}

      <Primary tone="ink" onClick={async () => { const o = await api.propose(); nav(`/basket/${o.id}`); }} disabled={toShop === 0 && state.list.length === 0}>Build the basket for these meals</Primary>
      <div className="text-center text-xs font-semibold text-muted">Or <Link to="/" className="text-green font-bold">ask</Link> for something: "pancakes for breakfast sunday just me and alex".</div>
    </div>
  );
}

function AddMeal({ state, date, slot: initialSlot, onClose, onAsk }: { state: State; date: string; slot: Slot; onClose: () => void; onAsk: () => void }) {
  const [recipeId, setRecipeId] = useState(state.recipes[0]?.id ?? '');
  const [slot, setSlot] = useState<Slot>(initialSlot);
  const [servings, setServings] = useState(state.household.defaultServings);
  const [eaterIds, setEaterIds] = useState(state.members.filter(m => m.eatsByDefault).map(m => m.id));
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!recipeId) return;
    setBusy(true);
    try { await api.addPlan(recipeId, servings, dayName(date).toLowerCase(), eaterIds, date, slot); notifyChanged(); onClose(); } finally { setBusy(false); }
  }

  return (
    <Card tone="amber">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold">Add to {dayName(date)}</div>
          <button onClick={onClose} aria-label="Cancel" className="w-9 h-9 rounded-full text-muted text-xl">×</button>
        </div>
        <label className="text-xs font-bold text-muted" htmlFor="recipe">Saved recipe</label>
        <select id="recipe" value={recipeId} onChange={e => setRecipeId(e.target.value)} className="text-sm font-semibold px-3 py-3 rounded-xl border-[1.5px] border-line-strong bg-white">
          {state.recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="flex gap-1.5">{SLOTS.map(s => <Pill key={s} active={slot === s} onClick={() => setSlot(s)}>{titleCase(s)}</Pill>)}</div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted">Portions</span>
          <Pill onClick={() => setServings(s => Math.max(1, s - 1))}>−</Pill><b className="text-sm">{servings}</b><Pill onClick={() => setServings(s => s + 1)}>+</Pill>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {state.members.map(m => {
            const on = eaterIds.includes(m.id);
            return <Pill key={m.id} active={on} onClick={() => setEaterIds(ids => on ? ids.filter(x => x !== m.id) : [...ids, m.id])}>{m.name}</Pill>;
          })}
        </div>
        <div className="flex gap-2">
          <div className="flex-1"><Primary onClick={add} disabled={busy || !recipeId}>Add meal</Primary></div>
          <Pill onClick={onAsk}>Ask for a new one</Pill>
        </div>
        {eaterIds.some(id => state.members.find(m => m.id === id)?.constraints.some(c => c.kind !== 'dislike')) && <Badge tone="amber">dietary rules will apply to this meal</Badge>}
      </div>
    </Card>
  );
}
