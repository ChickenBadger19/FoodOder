import { useEffect, useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { api, notifyChanged, type Member, type State } from '../api';
import { PersonForm, emptyDraft, summarise, type Draft } from '../PersonForm';
import { Badge, Card, Notice, Pill, Section, Spinner } from '../ui';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

export function HouseholdScreen() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const reload = () => api.state().then(setState).catch(e => setError(e.message));
  useEffect(() => { reload(); }, []);
  if (!state) return <Spinner />;

  async function save(d: Draft) {
    try {
      const id = d.id ?? d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      await api.saveMember({ id, name: d.name, age: d.age ?? null, eatsByDefault: d.eatsByDefault, constraints: d.constraints } as Member);
      setEditing(null);
      notifyChanged();
      reload();
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="flex flex-col gap-4 pt-3">
      <header className="font-extrabold">Household</header>
      {error && <Notice tone="red">{error}</Notice>}

      <Section title="People" aside={<Button variant="link" size="sm" className="h-auto p-0" onClick={() => setEditing(emptyDraft())}><PlusIcon /> Add person</Button>}>
        {state.members.map(m => {
          const rules = m.constraints.some(c => c.kind !== 'dislike');
          const isMe = m.id === state.meMemberId;
          return (
            <Card key={m.id} tone={rules ? 'amber' : 'default'}>
              <div className="flex items-center gap-3">
                <div className={`size-10 rounded-full flex items-center justify-center font-extrabold ${rules ? 'bg-caution-container text-caution-text border border-caution-text' : 'bg-primary-container text-primary-on-container'}`}>{m.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{m.name}{m.age !== null && m.age !== undefined ? `, ${m.age}` : ''}{isMe ? ' · you' : ''}</div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    {summarise(m)}
                    {m.constraints.filter(c => c.kind === 'dislike').length ? ` · dislikes ${m.constraints.filter(c => c.kind === 'dislike').map(c => state.items.find(i => i.id === c.itemId)?.name ?? '?').join(', ')}` : ''}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing({ ...m })}>Edit</Button>
              </div>
              <label className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span>Eats here by default</span>
                <Switch checked={m.eatsByDefault} onCheckedChange={v => save({ ...m, eatsByDefault: v })} aria-label={`${m.name} eats by default`} />
              </label>
            </Card>
          );
        })}
      </Section>

      <Dialog open={editing !== null} onOpenChange={o => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? `Edit ${editing.name}` : 'Add a person'}</DialogTitle>
            <DialogDescription>Allergies here are enforced on every meal this person eats.</DialogDescription>
          </DialogHeader>
          {editing && <PersonForm value={editing} onChange={setEditing} items={state.items} isMe={editing.id === state.meMemberId} />}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => editing && save(editing)} disabled={!editing?.name.trim()}>Save</Button>
            {editing?.id && state.members.length > 1 && editing.id !== state.meMemberId && (
              <Button variant="destructive" onClick={async () => { await api.deleteMember(editing.id!); setEditing(null); reload(); }}>Remove</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Section title="Retailers">
        {state.retailers.map(r => (
          <Card key={r.id}>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">{r.name}</div>
                <div className="text-xs font-semibold text-muted-foreground">{r.session.connected ? `Connected${r.session.expiresAt ? ` · session expires ${new Date(r.session.expiresAt).toLocaleDateString()}` : ''}` : 'Not connected'} · {r.modes.join(', ')}</div>
                {r.session.note && <div className="text-[11px] font-semibold text-muted-foreground">{r.session.note}</div>}
              </div>
              <span className={`size-2.5 rounded-full ${r.session.connected ? 'bg-primary' : 'bg-destructive'}`} />
            </div>
          </Card>
        ))}
        <Card tone="dashed">
          <div className="text-sm font-bold">Tesco, Sainsbury's, Ocado…</div>
          <div className="text-xs font-semibold text-muted-foreground">Real retailer connectors are the next phase. Until then the basket screen can always copy a list to paste into any supermarket's multi-search.</div>
        </Card>
      </Section>

      <Section title="Defaults">
        <Card>
          <div className="flex flex-col divide-y divide-border">
            <div className="flex justify-between items-center min-h-12 text-sm font-semibold">
              <span>Default portions</span>
              <div className="flex items-center gap-2">
                <Pill onClick={() => api.saveSettings({ ...state.household, defaultServings: Math.max(1, state.household.defaultServings - 1) }).then(reload)}>−</Pill>
                <b>{state.household.defaultServings}</b>
                <Pill onClick={() => api.saveSettings({ ...state.household, defaultServings: state.household.defaultServings + 1 }).then(reload)}>+</Pill>
              </div>
            </div>
            <label className="flex justify-between items-center min-h-12 text-sm font-semibold">
              <span>Own-brand OK</span>
              <Switch checked={state.household.ownBrandOk} onCheckedChange={v => api.saveSettings({ ...state.household, ownBrandOk: v }).then(reload)} />
            </label>
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
