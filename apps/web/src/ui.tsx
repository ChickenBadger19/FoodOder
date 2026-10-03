import type { ReactNode } from 'react';
import { Card as ShadCard } from '@/components/ui/card';
import { Badge as ShadBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Thin app-level wrappers over the shadcn primitives so screens read as product language
 * (tone, pill, primary) while the styling lives in components/ui.
 */

export function Card({ children, tone = 'default', className = '' }: { children: ReactNode; tone?: 'default' | 'amber' | 'red' | 'dashed'; className?: string }) {
  return (
    <ShadCard className={cn(
      tone === 'amber' && 'border-caution-text',
      tone === 'red' && 'border-block-text',
      tone === 'dashed' && 'border-dashed bg-transparent',
      className,
    )}>
      {children}
    </ShadCard>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'muted' }) {
  const variant = { green: 'success', amber: 'warning', red: 'destructive', muted: 'muted' }[tone] as 'success' | 'warning' | 'destructive' | 'muted';
  return <ShadBadge variant={variant}>{children}</ShadBadge>;
}

export function Pill({ children, onClick, active = false, type = 'button', disabled = false, tone = 'default' }: { children: ReactNode; onClick?: () => void; active?: boolean; type?: 'button' | 'submit'; disabled?: boolean; tone?: 'default' | 'amber' }) {
  return (
    <Button type={type} onClick={onClick} disabled={disabled} size="sm" variant={active ? (tone === 'amber' ? 'default' : 'ink') : 'outline'} className={cn(active && tone === 'amber' && 'bg-caution text-foreground border-caution-text hover:bg-caution/90')}>
      {children}
    </Button>
  );
}

export function Primary({ children, onClick, disabled = false, tone = 'green', type = 'button' }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'green' | 'ink' | 'muted'; type?: 'button' | 'submit' }) {
  return <Button type={type} onClick={onClick} disabled={disabled} size="lg" variant={tone === 'green' ? 'default' : tone === 'ink' ? 'ink' : 'secondary'}>{children}</Button>;
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex justify-between items-baseline rule pb-1.5">
        <h2 className="font-display text-lg font-extrabold tracking-tight m-0">{title}</h2>
        {aside && <span className="label-micro text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function Notice({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'amber' | 'red' | 'green' }) {
  const cls = {
    muted: 'bg-card border-border text-foreground',
    amber: 'bg-caution-container border-caution-text text-caution-text',
    red: 'bg-block-container border-block-text text-block-text',
    green: 'bg-safe-container border-safe-text text-safe-text',
  }[tone];
  return <div className={cn('text-xs font-medium rounded-md px-3 py-2 border', cls)}>{children}</div>;
}

export function Spinner() {
  return <div className="text-sm font-semibold text-muted-foreground py-6 text-center">Loading…</div>;
}

export function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
