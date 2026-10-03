import type { ReactNode } from 'react';

export function Card({ children, tone = 'default', className = '' }: { children: ReactNode; tone?: 'default' | 'amber' | 'red' | 'dashed'; className?: string }) {
  const border = tone === 'amber' ? 'border-amber' : tone === 'red' ? 'border-red' : tone === 'dashed' ? 'border-dashed border-line-strong' : 'border-line';
  return <div className={`bg-white border-[1.5px] ${border} rounded-2xl p-3 ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'muted' }) {
  const cls = { green: 'text-green bg-green-soft', amber: 'text-amber bg-amber-soft', red: 'text-red bg-red-soft', muted: 'text-muted bg-[#ECEAE3]' }[tone];
  return <span className={`inline-block text-[11px] font-extrabold px-2 py-1 rounded-full whitespace-nowrap ${cls}`}>{children}</span>;
}

export function Pill({ children, onClick, active = false, type = 'button', disabled = false }: { children: ReactNode; onClick?: () => void; active?: boolean; type?: 'button' | 'submit'; disabled?: boolean }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`text-xs font-bold px-3 py-2 rounded-full border-[1.5px] min-h-[36px] whitespace-nowrap shrink-0 disabled:opacity-50 ${active ? 'bg-ink text-white border-ink' : 'bg-white border-line-strong'}`}>
      {children}
    </button>
  );
}

export function Primary({ children, onClick, disabled = false, tone = 'green', type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'green' | 'ink' | 'muted'; type?: 'button' | 'submit' }) {
  const cls = tone === 'green' ? 'bg-green text-white' : tone === 'ink' ? 'bg-ink text-white' : 'bg-[#ECEAE3] text-muted';
  return <button type={type} onClick={onClick} disabled={disabled} className={`w-full h-13 rounded-2xl font-extrabold text-[15px] disabled:opacity-60 ${cls}`}>{children}</button>;
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex justify-between items-baseline">
        <h2 className="text-[15px] font-extrabold m-0">{title}</h2>
        {aside && <span className="text-xs font-semibold text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'amber' | 'red' | 'green' }) {
  const cls = { muted: 'bg-white border-line text-ink', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', green: 'bg-green-soft text-green' }[tone];
  return <div className={`text-xs font-semibold rounded-xl px-3 py-2 border-[1.5px] border-transparent ${cls}`}>{children}</div>;
}

export function Spinner() {
  return <div className="text-sm font-semibold text-muted py-6 text-center">Loading…</div>;
}

export function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
