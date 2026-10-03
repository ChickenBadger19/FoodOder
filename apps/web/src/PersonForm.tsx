import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
import type { Item, Member } from './api';

export type Draft = Omit<Member, 'id'> & { id?: string };

const ALLERGENS: { kind: string; label: string; note?: string }[] = [
  { kind: 'gluten_free', label: 'Gluten / wheat', note: 'coeliac disease or intolerance' },
  { kind: 'dairy_free', label: 'Milk / dairy' },
  { kind: 'nut_free', label: 'Nuts & peanuts' },
  { kind: 'egg_free', label: 'Egg' },
  { kind: 'soy_free', label: 'Soya' },
  { kind: 'fish_free', label: 'Fish' },
  { kind: 'shellfish_free', label: 'Shellfish' },
  { kind: 'sesame_free', label: 'Sesame' },
];
const DIETS = [
  { kind: '', label: 'No diet' },
  { kind: 'vegetarian', label: 'Vegetarian' },
  { kind: 'pescatarian', label: 'Pescatarian' },
  { kind: 'vegan', label: 'Vegan' },
];
const STRICTNESS = [
  { value: 'strict', label: 'Allergy / coeliac', note: 'hard block, excludes "may contain"' },
  { value: 'avoid', label: 'Intolerance', note: 'avoids, allows labelled products' },
  { value: 'preference', label: 'Prefers to avoid', note: 'only reorders choices' },
];

export function emptyDraft(): Draft {
  return { name: '', age: null, eatsByDefault: true, constraints: [] };
}

/** One person's profile: name, age, allergies with strictness, diet, dislikes. Used in onboarding and Household. */
export function PersonForm({ value, onChange, items, isMe = false }: { value: Draft; onChange: (d: Draft) => void; items: Item[]; isMe?: boolean }) {
  const [dislikeText, setDislikeText] = useState('');
  const allergies = value.constraints.filter(c => ALLERGENS.some(a => a.kind === c.kind));
  const diet = value.constraints.find(c => DIETS.some(d => d.kind && d.kind === c.kind))?.kind ?? '';
  const dislikes = value.constraints.filter(c => c.kind === 'dislike');

  const set = (patch: Partial<Draft>) => onChange({ ...value, ...patch });
  const toggleAllergy = (kind: string, on: boolean) => {
    const rest = value.constraints.filter(c => c.kind !== kind);
    set({ constraints: on ? [...rest, { kind, strictness: 'strict' }] : rest });
  };
  const setStrictness = (kind: string, strictness: string) => set({ constraints: value.constraints.map(c => c.kind === kind ? { ...c, strictness } : c) });
  const setDiet = (kind: string) => {
    const rest = value.constraints.filter(c => !DIETS.some(d => d.kind && d.kind === c.kind));
    set({ constraints: kind ? [...rest, { kind, strictness: 'avoid' }] : rest });
  };
  const addDislike = () => {
    const q = dislikeText.trim().toLowerCase();
    if (!q) return;
    const item = items.find(i => i.name === q) ?? items.find(i => i.name.includes(q));
    if (!item) return;
    if (!dislikes.some(d => d.itemId === item.id)) set({ constraints: [...value.constraints, { kind: 'dislike', strictness: 'preference', itemId: item.id }] });
    setDislikeText('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${value.id ?? 'new'}`}>{isMe ? 'Your name' : 'Name'}</Label>
          <Input id={`name-${value.id ?? 'new'}`} value={value.name} onChange={e => set({ name: e.target.value })} placeholder={isMe ? 'e.g. Jeff' : 'e.g. Sam'} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`age-${value.id ?? 'new'}`}>Age</Label>
          <Input id={`age-${value.id ?? 'new'}`} type="number" inputMode="numeric" min={0} max={120} value={value.age ?? ''} onChange={e => set({ age: e.target.value === '' ? null : Number(e.target.value) })} placeholder="yrs" />
        </div>
      </div>
      {value.age !== null && value.age !== undefined && value.age < 12 && (
        <div className="text-xs font-semibold text-muted-foreground">Children get smaller portions automatically ({value.age < 2 ? 'a quarter' : value.age < 5 ? 'half' : 'three quarters'} of an adult).</div>
      )}

      <div className="flex flex-col gap-2">
        <Label>Allergies and intolerances</Label>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {ALLERGENS.map(a => {
            const on = allergies.some(c => c.kind === a.kind);
            return (
              <label key={a.kind} className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                <Checkbox checked={on} onCheckedChange={v => toggleAllergy(a.kind, v === true)} aria-label={a.label} />
                {a.label}
              </label>
            );
          })}
        </div>
        {allergies.map(c => (
          <div key={c.kind} className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
            <span className="text-xs font-bold flex-1">{ALLERGENS.find(a => a.kind === c.kind)?.label}</span>
            <Select value={c.strictness} onValueChange={v => setStrictness(c.kind, v)}>
              <SelectTrigger size="sm" className="w-[180px] bg-card" aria-label={`How strict for ${ALLERGENS.find(a => a.kind === c.kind)?.label}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STRICTNESS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        {allergies.length > 0 && <div className="text-[11px] font-semibold text-muted-foreground">{STRICTNESS.map(s => `${s.label}: ${s.note}`).join(' · ')}</div>}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Diet</Label>
        <ToggleGroup type="single" value={diet} onValueChange={v => setDiet(v ?? '')} variant="soft">
          {DIETS.map(d => <ToggleGroupItem key={d.kind || 'none'} value={d.kind} aria-label={d.label}>{d.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`dislike-${value.id ?? 'new'}`}>Dislikes (optional)</Label>
        <div className="flex gap-2">
          <Input id={`dislike-${value.id ?? 'new'}`} value={dislikeText} onChange={e => setDislikeText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDislike(); } }} placeholder="coriander, mushrooms…" className="h-10 text-sm" />
          <button type="button" onClick={addDislike} className="text-xs font-bold px-3 rounded-xl border border-input bg-card">Add</button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {dislikes.map(d => (
            <Badge key={d.itemId} variant="muted">
              {items.find(i => i.id === d.itemId)?.name ?? d.itemId}
              <button type="button" aria-label="Remove" onClick={() => set({ constraints: value.constraints.filter(c => c !== d) })} className="ml-1">×</button>
            </Badge>
          ))}
        </div>
      </div>

      {!isMe && (
        <label className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span>Eats here by default</span>
          <Switch checked={value.eatsByDefault} onCheckedChange={v => set({ eatsByDefault: v })} />
        </label>
      )}
    </div>
  );
}

export function summarise(m: Draft): string {
  const parts: string[] = [];
  const allergy = m.constraints.filter(c => ALLERGENS.some(a => a.kind === c.kind)).map(c => `${ALLERGENS.find(a => a.kind === c.kind)!.label.toLowerCase()} (${STRICTNESS.find(s => s.value === c.strictness)?.label.toLowerCase()})`);
  const diet = m.constraints.find(c => DIETS.some(d => d.kind && d.kind === c.kind));
  if (diet) parts.push(DIETS.find(d => d.kind === diet.kind)!.label.toLowerCase());
  parts.push(...allergy);
  return parts.length ? parts.join(' · ') : 'no restrictions';
}
