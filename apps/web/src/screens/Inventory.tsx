import { useEffect, useState, type FormEvent } from 'react';
import { api, CHANGED, type StockRow } from '../api';
import { Badge, Card, Notice, Pill, Section, Spinner, titleCase } from '../ui';

const LOCATIONS = ['fridge', 'freezer', 'cupboard', 'household'] as const;

export function InventoryScreen() {
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = () => api.inventory().then(setRows).catch(e => setError(e.message));
  useEffect(() => { reload(); window.addEventListener(CHANGED, reload); return () => window.removeEventListener(CHANGED, reload); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setError(null);
    try { await api.addStock(text); setText(''); reload(); } catch (err: any) { setError(err.message); }
  }

  if (!rows) return <Spinner />;
  const shown = rows.filter(r => filter === 'all' || r.location === filter);
  const byLoc = LOCATIONS.map(loc => ({ loc, rows: shown.filter(r => r.location === loc) })).filter(g => g.rows.length);
  const soon = rows.filter(r => r.expiresAt && new Date(r.expiresAt).getTime() - Date.now() < 2 * 864e5);
  const approx = rows.filter(r => r.confidence === 'approx').length;

  return (
    <div className="flex flex-col gap-3.5 pt-3">
      <header className="flex items-center justify-between">
        <div className="font-extrabold">Pantry</div>
        <button onClick={async () => { const r = await api.syncOrders('mock'); setInfo(`${r.added.length} line${r.added.length === 1 ? '' : 's'} imported from order history`); reload(); }} className="text-xs font-bold text-primary px-2 py-2">Import from orders</button>
      </header>

      <form onSubmit={add} className="flex flex-col gap-1.5">
        <label htmlFor="quick" className="text-xs font-bold text-muted-foreground">Quick add or update</label>
        <div className="flex gap-2">
          <input id="quick" value={text} onChange={e => setText(e.target.value)} placeholder="2 onions, 500g pasta, 1 bleach" className="flex-1 min-w-0 text-sm px-3.5 py-3 rounded-2xl border-[1.5px] border-input bg-card" />
          <button type="submit" className="w-13 rounded-2xl bg-foreground text-white text-xl font-extrabold">+</button>
        </div>
      </form>
      {error && <Notice tone="red">{error}</Notice>}
      {info && <Notice tone="green">{info}</Notice>}

      <div className="flex gap-2 overflow-x-auto pb-0.5">
        <Pill active={filter === 'all'} onClick={() => setFilter('all')}>All · {rows.length}</Pill>
        {LOCATIONS.map(l => <Pill key={l} active={filter === l} onClick={() => setFilter(l)}>{titleCase(l)} · {rows.filter(r => r.location === l).length}</Pill>)}
      </div>

      {(soon.length > 0 || approx > 0) && (
        <Notice tone="amber">
          {soon.length > 0 && <>{soon.map(r => r.item?.name ?? r.itemId).join(', ')} {soon.length === 1 ? 'needs' : 'need'} using soon. </>}
          {approx > 0 && <>{approx} item{approx === 1 ? '' : 's'} are approximate and will be flagged on the approval screen.</>}
        </Notice>
      )}

      {byLoc.map(g => (
        <Section key={g.loc} title={titleCase(g.loc)}>
          {g.rows.map(r => {
            const name = r.item?.name ?? r.itemId;
            const expSoon = r.expiresAt && new Date(r.expiresAt).getTime() - Date.now() < 2 * 864e5;
            const hasGluten = r.item?.allergens.includes('gluten') && !r.freeFrom.includes('gluten');
            const isFreeFromVariant = /gluten-free|free from/i.test(name) || (r.item?.allergens.includes('gluten') && r.freeFrom.includes('gluten'));
            return (
              <Card key={r.id}>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="text-sm font-bold">{titleCase(name)}</div>
                    <div className={`text-xs font-semibold ${expSoon ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {r.confidence === 'approx' ? '~' : ''}{Number.isInteger(r.qty) ? r.qty : r.qty.toFixed(1)} {r.unit === 'count' ? '' : r.unit}
                      {r.note ? ` · ${r.note}` : ''}{expSoon ? ' · use soon' : r.boughtAt ? ` · ${Math.round((Date.now() - new Date(r.boughtAt).getTime()) / 864e5)} days ago` : ''}
                    </div>
                    <div className="flex gap-1.5">
                      {hasGluten && <Badge tone="amber">contains gluten</Badge>}
                      {isFreeFromVariant && <Badge tone="green">gluten-free</Badge>}
                    </div>
                  </div>
                  <Badge tone={r.confidence === 'exact' ? 'green' : 'amber'}>{r.confidence}</Badge>
                  <div className="flex gap-1">
                    <Pill onClick={async () => { await api.patchStock(r.id, { qty: r.qty / 2, confidence: 'approx' }); reload(); }}>½</Pill>
                    <Pill onClick={async () => { await api.deleteStock(r.id); reload(); }}>Used</Pill>
                  </div>
                </div>
              </Card>
            );
          })}
        </Section>
      ))}
      {byLoc.length === 0 && <Card tone="dashed"><div className="text-sm font-semibold text-muted-foreground">Your pantry is empty. Add items above or import from order history.</div></Card>}
    </div>
  );
}
