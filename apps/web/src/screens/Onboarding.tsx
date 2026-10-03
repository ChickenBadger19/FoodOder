import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { api, notifyChanged, type Item } from '../api';
import { PersonForm, emptyDraft, summarise, type Draft } from '../PersonForm';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Label } from '@/components/ui/label';
import { Notice, Spinner } from '../ui';

const RETAILERS = [
  { id: 'tesco', label: 'Tesco' }, { id: 'sainsburys', label: "Sainsbury's" }, { id: 'asda', label: 'Asda' },
  { id: 'ocado', label: 'Ocado' }, { id: 'morrisons', label: 'Morrisons' }, { id: 'waitrose', label: 'Waitrose' },
];

type Step = 'you' | 'people' | 'defaults' | 'done';
const STEPS: Step[] = ['you', 'people', 'defaults', 'done'];

export function Onboarding() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[] | null>(null);
  const [step, setStep] = useState<Step>('you');
  const [me, setMe] = useState<Draft>(emptyDraft());
  const [others, setOthers] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [ownBrandOk, setOwnBrandOk] = useState(true);
  const [alwaysAsk, setAlwaysAsk] = useState<string[]>(['meat']);
  const [retailer, setRetailer] = useState('tesco');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ defaultServings: number } | null>(null);

  useEffect(() => { api.state().then(s => setItems(s.items)).catch(e => setError(e.message)); }, []);
  if (!items) return <Spinner />;

  const idx = STEPS.indexOf(step);
  const canNext = step === 'you' ? me.name.trim().length > 0 : step === 'people' ? others.every(o => o.name.trim()) : true;

  async function finish() {
    setBusy(true); setError(null);
    try {
      const r = await api.onboard({ members: [me, ...others], meIndex: 0, settings: { ownBrandOk, alwaysAskCategories: alwaysAsk, retailer } });
      setResult(r);
      notifyChanged();
      setStep('done');
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4 pt-4 pb-6 min-h-full">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xl font-extrabold tracking-tight">FoodOder</div>
          <span className="text-xs font-semibold text-muted-foreground">Step {Math.min(idx + 1, 3)} of 3</span>
        </div>
        <Progress value={Math.min(idx + 1, 3) / 3 * 100} aria-label="Set-up progress" />
      </header>

      {step === 'you' && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight m-0">Let's set up your kitchen</h1>
            <p className="text-sm font-semibold text-muted-foreground mt-2">Start with you. Allergies and diets you add here are enforced on every meal you eat, and shown on the basket before anything is ordered.</p>
          </div>
          <Card>
            <PersonForm value={me} onChange={setMe} items={items} isMe />
          </Card>
        </>
      )}

      {step === 'people' && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight m-0">Who else eats here?</h1>
            <p className="text-sm font-semibold text-muted-foreground mt-2">Each person carries their own rules. Portions size themselves from ages, and a meal only applies someone's rules if they are eating it.</p>
          </div>
          {others.length === 0 && editing === null && (
            <Card className="border-dashed bg-card/60 shadow-none">
              <CardHeader>
                <CardTitle>Just you for now</CardTitle>
                <CardDescription>You can add people later from the Household screen.</CardDescription>
              </CardHeader>
            </Card>
          )}
          {others.map((o, i) => editing === i ? (
            <Card key={i} className="border-warning">
              <PersonForm value={o} onChange={d => setOthers(os => os.map((x, j) => j === i ? d : x))} items={items} />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => setEditing(null)} disabled={!o.name.trim()}>Done</Button>
                <Button variant="outline" size="icon" aria-label="Remove person" onClick={() => { setOthers(os => os.filter((_, j) => j !== i)); setEditing(null); }}><Trash2Icon /></Button>
              </div>
            </Card>
          ) : (
            <Card key={i}>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-foreground text-background flex items-center justify-center font-extrabold">{o.name[0]?.toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{o.name}{o.age !== null && o.age !== undefined ? `, ${o.age}` : ''}</div>
                  <div className="text-xs font-semibold text-muted-foreground">{summarise(o)}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEditing(i)}>Edit</Button>
              </div>
            </Card>
          ))}
          {editing === null && (
            <Button variant="outline" onClick={() => { setOthers(os => [...os, emptyDraft()]); setEditing(others.length); }}><PlusIcon /> Add a person</Button>
          )}
        </>
      )}

      {step === 'defaults' && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight m-0">How you shop</h1>
            <p className="text-sm font-semibold text-muted-foreground mt-2">These only steer choices. You approve every basket before it goes anywhere.</p>
          </div>
          <Card>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>Where do you usually shop?</Label>
                <ToggleGroup type="single" value={retailer} onValueChange={v => v && setRetailer(v)} variant="soft">
                  {RETAILERS.map(r => <ToggleGroupItem key={r.id} value={r.id}>{r.label}</ToggleGroupItem>)}
                </ToggleGroup>
                <div className="text-[11px] font-semibold text-muted-foreground">The prototype uses a mock catalogue; the real connector comes next.</div>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                <span>Own-brand products are fine</span>
                <Switch checked={ownBrandOk} onCheckedChange={setOwnBrandOk} />
              </label>
              <div className="flex flex-col gap-2">
                <Label>Always let me choose the exact product for</Label>
                <ToggleGroup type="multiple" value={alwaysAsk} onValueChange={setAlwaysAsk}>
                  <ToggleGroupItem value="meat">Meat</ToggleGroupItem>
                  <ToggleGroupItem value="fish">Fish</ToggleGroupItem>
                  <ToggleGroupItem value="dairy">Dairy</ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          </Card>
        </>
      )}

      {step === 'done' && (
        <>
          <div>
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight m-0">You're set, {me.name}.</h1>
            <p className="text-sm font-semibold text-muted-foreground mt-2">
              {1 + others.length} {others.length ? 'people' : 'person'} · cooking for {result?.defaultServings ?? 1} by default · {[me, ...others].filter(m => m.constraints.some(c => c.kind !== 'dislike')).length} with dietary rules.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Three things to try</CardTitle>
              <CardDescription>Tap the examples on the next screen, or just type.</CardDescription>
            </CardHeader>
            <ul className="text-sm font-semibold flex flex-col gap-1.5 m-0 pl-5">
              <li>"lasagne for friday" and see who's eating and what gets swapped</li>
              <li>"we need bleach" and watch it land on the running list</li>
              <li>Stock → Import from orders to fill the cupboard in one tap</li>
            </ul>
          </Card>
        </>
      )}

      {error && <Notice tone="red">{error}</Notice>}

      <div className="mt-auto flex gap-2 pt-2">
        {idx > 0 && step !== 'done' && <Button variant="outline" size="icon" className="size-13 rounded-2xl" aria-label="Back" onClick={() => setStep(STEPS[idx - 1]!)}><ArrowLeftIcon /></Button>}
        {step === 'you' && <Button size="lg" onClick={() => setStep('people')} disabled={!canNext}>Next <ArrowRightIcon /></Button>}
        {step === 'people' && <Button size="lg" onClick={() => setStep('defaults')} disabled={!canNext || editing !== null}>Next <ArrowRightIcon /></Button>}
        {step === 'defaults' && <Button size="lg" onClick={finish} disabled={busy}>Finish set-up</Button>}
        {step === 'done' && <Button size="lg" onClick={() => nav('/')}>Start cooking</Button>}
      </div>
    </div>
  );
}
