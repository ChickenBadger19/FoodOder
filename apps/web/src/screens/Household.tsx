import { useEffect, useState } from 'react';
import { api, type Member, type State } from '../api';
import { Badge, Card, Notice, Pill, Section, Spinner } from '../ui';

const KINDS = ['gluten_free', 'dairy_free', 'nut_free', 'egg_free', 'vegetarian', 'vegan'] as const;
const LEVELS = ['preference', 'avoid', 'strict'] as const;
const label = (k: string) => k.replace('_free', '-free').replace('_', ' ');

export function HouseholdScreen() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = () => api.state().then(setState).catch(e => setError(e.message));
  useEffect(() => { reload(); }, []);
  if (!state) return <Spinner />;

  async function save(m: Member) { try { await api.saveMember(m); reload(); } catch (e: any) { setError(e.message); } }

  function toggleKind(m: Member, kind: string) {
    const has = m.constraints.find(c => c.kind === kind);
    const constraints = has ? m.constraints.filter(c => c.kind !== kind) : [...m.constraints, { kind, strictness: 'strict' }];
    save({ ...m, constraints });
  }
  function setLevel(m: Member, kind: string, strictness: string) {
    save({ ...m, constraints: m.constraints.map(c => c.kind === kind ? { ...c, strictness } : c) });
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <header className="font-extrabold">Household</header>
      {error && <Notice tone="red">{error}</Notice>}

      <Section title="People" aside={<button className="text-green font-bold" onClick={() => { const name = prompt('Name?'); if (name) save({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, eatsByDefault: true, constraints: [] }); }}>Add person</button>}>
        {state.members.map(m => {
          const rules = m.constraints.filter(c => c.kind !== 'dislike');
          const dislikes = m.constraints.filter(c => c.kind === 'dislike');
          return (
            <Card key={m.id} tone={rules.length ? 'amber' : 'default'}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full text-white flex items-center justify-center font-extrabold ${rules.length ? 'bg-amber' : 'bg-ink'}`}>{m.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{m.name}</div>
                  <div className="text-xs font-semibold text-muted">
                    {rules.length ? rules.map(c => `${label(c.kind)} (${c.strictness})`).join(', ') : 'No constraints'}
                    {dislikes.length ? ` · dislikes ${dislikes.map(c => state.items.find(i => i.id === c.itemId)?.name ?? '?').join(', ')}` : ''}
                    {m.eatsByDefault ? ' · eats by default' : ' · not by default'}
                  </div>
                </div>
                <Pill onClick={() => save({ ...m, eatsByDefault: !m.eatsByDefault })} active={m.eatsByDefault}>Default</Pill>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                {KINDS.map(k => <Pill key={k} active={!!m.constraints.find(c => c.kind === k)} onClick={() => toggleKind(m, k)}>{label(k)}</Pill>)}
              </div>
              {rules.map(c => (
                <div key={c.kind} className="mt-2">
                  <div className="text-xs font-bold text-muted mb-1">{label(c.kind)} strictness</div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {LEVELS.map(l => <button key={l} onClick={() => setLevel(m, c.kind, l)} className={`h-10 rounded-xl text-xs font-bold border-[1.5px] ${c.strictness === l ? 'bg-amber text-white border-amber' : 'bg-white border-line-strong'}`}>{l}</button>)}
                  </div>
                  <div className="text-[11px] font-semibold text-muted mt-1">Strict also excludes "may contain" and blocks approval on unverified lines. Avoid prefers free-from but allows a labelled product with a warning. Preference only reorders.</div>
                </div>
              ))}
              {state.members.length > 1 && <button onClick={async () => { await api.deleteMember(m.id); reload(); }} className="text-[11px] font-bold text-red mt-2">Remove {m.name}</button>}
            </Card>
          );
        })}
      </Section>

      <Section title="Retailers">
        {state.retailers.map(r => (
          <Card key={r.id}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{r.name}</div>
                <div className="text-xs font-semibold text-muted">{r.session.connected ? `Connected${r.session.expiresAt ? ` · session expires ${new Date(r.session.expiresAt).toLocaleDateString()}` : ''}` : 'Not connected'} · {r.modes.join(', ')}</div>
                {r.session.note && <div className="text-[11px] font-semibold text-muted">{r.session.note}</div>}
              </div>
              <span className={`w-2.5 h-2.5 rounded-full ${r.session.connected ? 'bg-green' : 'bg-red'}`} />
            </div>
          </Card>
        ))}
        <Card tone="dashed">
          <div className="text-sm font-bold">Tesco, Sainsbury's, Ocado…</div>
          <div className="text-xs font-semibold text-muted">Real retailer connectors are the next phase. Until then the basket screen can always copy a list to paste into any supermarket's multi-search.</div>
        </Card>
      </Section>

      <Section title="Defaults">
        <Card>
          <div className="flex flex-col divide-y divide-line">
            <div className="flex justify-between items-center min-h-12 text-sm font-semibold">
              <span>Default portions</span>
              <div className="flex items-center gap-2">
                <Pill onClick={() => api.saveSettings({ ...state.household, defaultServings: Math.max(1, state.household.defaultServings - 1) }).then(reload)}>−</Pill>
                <b>{state.household.defaultServings}</b>
                <Pill onClick={() => api.saveSettings({ ...state.household, defaultServings: state.household.defaultServings + 1 }).then(reload)}>+</Pill>
              </div>
            </div>
            <div className="flex justify-between items-center min-h-12 text-sm font-semibold">
              <span>Own-brand OK</span>
              <Pill active={state.household.ownBrandOk} onClick={() => api.saveSettings({ ...state.household, ownBrandOk: !state.household.ownBrandOk }).then(reload)}>{state.household.ownBrandOk ? 'Yes' : 'No'}</Pill>
            </div>
            <div className="flex justify-between items-center min-h-12 text-sm font-semibold">
              <span>Staples assumed in stock</span>
              <Badge>{state.items.filter(i => i.isStaple).length} items</Badge>
            </div>
          </div>
        </Card>
      </Section>
    </div>
  );
}
