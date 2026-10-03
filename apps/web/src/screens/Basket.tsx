import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, gbp, type Order, type OrderLine, type Ranked } from '../api';
import { Badge, Card, Notice, Pill, Primary, Section, Spinner } from '../ui';

function DietaryBadge({ r }: { r: Ranked }) {
  const d = r.dietary;
  if (d.kind === 'verified') return <Badge tone="green">{d.allergen}-free · label</Badge>;
  if (d.kind === 'naturally_free') return <Badge tone="green">naturally {d.allergen}-free</Badge>;
  if (d.kind === 'may_contain') return <Badge tone={d.blocks ? 'red' : 'amber'}>may contain {d.allergen}</Badge>;
  if (d.kind === 'contains') return <Badge tone="red">contains {d.allergen}</Badge>;
  if (d.kind === 'unverified') return <Badge tone={d.blocks ? 'red' : 'amber'}>{d.allergen}-free unverified</Badge>;
  return null;
}

function Line({ line, orderId, onChange, locked }: { line: OrderLine; orderId: string; onChange: (o: Order) => void; locked: boolean }) {
  const [picking, setPicking] = useState(false);
  const patch = (change: Record<string, unknown>) => api.patchLine(orderId, line.key, change).then(onChange);
  const c = line.chosen;
  const tone = line.removed ? 'dashed' : line.haveIt ? 'dashed' : line.blocked ? 'red' : 'default';
  return (
    <Card tone={tone} className={line.removed || line.haveIt ? 'opacity-60' : ''}>
      <div className="flex gap-2.5 items-start">
        <div className="w-12 h-12 rounded-xl bg-[#ECEAE3] shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="text-sm font-bold">{c ? c.product.name : line.itemName}</div>
          <div className="text-xs font-semibold text-muted">
            {line.needLabel}{line.haveLabel ? ` · ${line.haveLabel}${line.anyApprox ? ' (approx)' : ''}` : ''}
            {c ? ` → ${line.qty} × ${c.product.packQty}${c.product.packUnit === 'count' ? '' : ' ' + c.product.packUnit}${c.product.packCount ? ` ×${c.product.packCount}` : ''}` : ''}
            {c && c.plan.overshoot > 0 ? ` (${Math.round(c.plan.overshoot)}${line.needUnit === 'count' ? '' : ' ' + line.needUnit} over)` : ''}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {c?.reasons.filter(r => r === 'your usual' || r === 'bought before').map(r => <Badge key={r}>{r}</Badge>)}
            {c && <DietaryBadge r={c} />}
            {line.forRecipes.length > 0 && <Badge>{line.forRecipes.join(' · ')}</Badge>}
            {line.blocked && <Badge tone="red">blocks approval</Badge>}
            {line.haveIt && <Badge tone="green">you have it</Badge>}
          </div>
          {line.blockReason && !line.haveIt && <div className="text-xs font-semibold text-red">{line.blockReason}</div>}
          {line.note && <div className="text-xs font-semibold text-muted">{line.note}</div>}
        </div>
        <div className="text-sm font-extrabold whitespace-nowrap">{c && !line.haveIt && !line.removed ? gbp(line.lineTotal) : ''}</div>
      </div>
      {!locked && (
        <div className="flex gap-2 flex-wrap mt-2">
          {line.alternatives.length > 0 && <Pill onClick={() => setPicking(p => !p)} active={picking}>{line.blocked ? 'Pick manually' : 'Swap'}</Pill>}
          {c && <Pill onClick={() => patch({ qty: line.qty - 1 })} disabled={line.qty <= 1}>−</Pill>}
          {c && <span className="text-xs font-bold self-center">Qty {line.qty}</span>}
          {c && <Pill onClick={() => patch({ qty: line.qty + 1 })}>+</Pill>}
          <Pill onClick={() => patch({ haveIt: !line.haveIt })} active={line.haveIt}>I have it</Pill>
          <Pill onClick={() => patch({ removed: !line.removed })} active={line.removed}>{line.removed ? 'Restore' : 'Remove'}</Pill>
        </div>
      )}
      {picking && (
        <div className="flex flex-col gap-1.5 mt-2 border-t-[1.5px] border-line pt-2">
          {line.alternatives.map(a => (
            <button key={a.product.id} onClick={() => { patch({ productId: a.product.id }); setPicking(false); }} className="flex items-center gap-2 text-left px-2 py-2 rounded-xl hover:bg-ground">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{a.product.name}</div>
                <div className="text-[11px] font-semibold text-muted">{a.plan.packs} pack{a.plan.packs === 1 ? '' : 's'} · {a.reasons.join(', ') || 'no notes'}</div>
              </div>
              <DietaryBadge r={a} />
              <div className="text-sm font-extrabold">{gbp(a.lineTotal)}</div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

export function BasketScreen() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushed, setPushed] = useState<{ pushed: number; basketUrl: string; notPushed: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setError(null);
    if (id) api.order(id).then(setOrder).catch(e => setError(e.message));
    else api.propose().then(o => nav(`/basket/${o.id}`, { replace: true })).catch(e => setError(e.message));
  }, [id]);

  if (error && !order) return <div className="pt-3"><Notice tone="red">{error}</Notice><Link to="/" className="text-green font-bold text-sm block mt-2">Back</Link></div>;
  if (!order) return <Spinner />;
  const d = order.draft;
  const locked = order.status !== 'draft';
  const recipeLines = d.lines.filter(l => l.section === 'recipe');
  const extras = d.lines.filter(l => l.section === 'extras');

  async function approve(override = false) {
    setBusy(true); setError(null);
    try { const r = await api.approve(order!.id, override); setPushed(r); setOrder(await api.order(order!.id)); }
    catch (e: any) { setError(e.data?.blockers ? `Resolve first: ${e.data.blockers.join(', ')}` : e.message); }
    finally { setBusy(false); }
  }

  async function copyList() {
    try { await navigator.clipboard.writeText(d.handoffList); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="flex flex-col gap-3.5 pt-3">
      <header className="flex items-center justify-between">
        <div className="font-extrabold">{locked ? 'Basket sent' : 'Approve basket'}</div>
        <button onClick={async () => { setBusy(true); const o = await api.propose(); nav(`/basket/${o.id}`); setBusy(false); }} className="text-xs font-bold text-green px-2 py-2">Rebuild</button>
      </header>

      {!locked && <Notice>Draft only. Nothing is in your {d.retailerName} basket until you approve.</Notice>}
      {d.eaters.length > 0 && <div className="text-xs font-semibold text-muted">Eating: {d.eaters.join(', ')}{d.constraintsSummary.length ? ` · ${d.constraintsSummary.join(', ')}` : ''}</div>}

      {pushed && (
        <Notice tone="green">
          {pushed.pushed} line{pushed.pushed === 1 ? '' : 's'} added to your {d.retailerName} basket. Finish slot and payment there: <a href={pushed.basketUrl} className="underline">open basket</a>.
          {pushed.notPushed.length > 0 && <> Not matched, add by hand: {pushed.notPushed.join(', ')}.</>}
        </Notice>
      )}
      {order.status === 'pushed' && (
        <Primary tone="ink" onClick={async () => { await api.delivered(order.id); setOrder(await api.order(order.id)); }}>Mark delivered → move into stock</Primary>
      )}
      {order.status === 'delivered' && <Notice tone="green">Delivered and added to stock.</Notice>}

      <Section title={recipeLines.length ? `For ${[...new Set(recipeLines.flatMap(l => l.forRecipes))].join(' · ')}` : 'Recipe items'} aside={`${recipeLines.length} lines`}>
        {recipeLines.length === 0 && <Card tone="dashed"><div className="text-sm font-semibold text-muted">Everything for the cook list is in stock.</div></Card>}
        {recipeLines.map(l => <Line key={l.key} line={l} orderId={order.id} onChange={setOrder} locked={locked} />)}
      </Section>

      <Section title="Household & extras" aside="from your running list">
        {extras.length === 0 && <Card tone="dashed"><div className="text-sm font-semibold text-muted">Nothing on the running list.</div></Card>}
        {extras.map(l => <Line key={l.key} line={l} orderId={order.id} onChange={setOrder} locked={locked} />)}
      </Section>

      {error && <Notice tone="red">{error}</Notice>}

      <div className="sticky bottom-0 bg-ground pt-2 pb-1 flex flex-col gap-2 border-t-[1.5px] border-line">
        <div className="flex justify-between text-[13px] font-bold text-muted">
          <span>{d.lines.filter(l => !l.removed && !l.haveIt && l.chosen).length} items · delivery {gbp(d.deliveryFee)} · min {gbp(d.minimumOrder)} {d.meetsMinimum ? '✓' : '✗'}</span>
          <span className="text-ink text-[15px] font-extrabold">{gbp(d.total)}</span>
        </div>
        {!locked && (
          <div className="flex gap-2">
            <div className="flex-1">
              <Primary onClick={() => approve(false)} disabled={busy || d.blockers > 0} tone={d.blockers > 0 ? 'muted' : 'green'}>
                {d.blockers > 0 ? `Add to ${d.retailerName} · resolve ${d.blockers} first` : `Add to ${d.retailerName} basket`}
              </Primary>
            </div>
            <button onClick={copyList} aria-label="Copy as a plain list" className="w-13 h-13 rounded-2xl border-[1.5px] border-line-strong flex items-center justify-center bg-white">
              {copied ? <span className="text-[11px] font-extrabold text-green">Copied</span> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></svg>}
            </button>
          </div>
        )}
        {!locked && d.blockers > 0 && <button onClick={() => approve(true)} className="text-xs font-bold text-red">Approve anyway (override dietary block)</button>}
      </div>
    </div>
  );
}
