import type { ReactNode } from 'react';

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'article' | 'div' }) {
  return <Tag className={cn('rounded-[var(--radius-card)] border border-line bg-paper p-5 shadow-[var(--shadow-card)]', className)}>{children}</Tag>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-medium text-primary-900">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'positive' | 'critical' }) {
  return (
    <div>
      <p className="text-sm text-ink-muted">{label}</p>
      <p className={cn('tabular mt-1 text-2xl font-semibold', tone === 'positive' && 'text-positive', tone === 'critical' && 'text-critical', tone === 'default' && 'text-ink')}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Progress({ permille, label, tone = 'primary' }: { permille: number; label: string; tone?: 'primary' | 'accent' | 'warning' | 'critical' }) {
  const pct = Math.max(0, Math.min(100, permille / 10));
  const color = { primary: 'bg-primary-700', accent: 'bg-accent-500', warning: 'bg-warning', critical: 'bg-critical' }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2 w-full overflow-hidden rounded-full bg-mist">
      <div className={cn('h-full rounded-full transition-[width]', color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-mist text-ink-muted',
  positive: 'bg-primary-50 text-primary-700',
  warning: 'bg-accent-100 text-warning',
  critical: 'bg-[#f6e4e1] text-critical',
} as const;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', badgeTones[tone])}>{children}</span>;
}

/** Avertissement de nature réglementaire ou religieuse : toujours visible, jamais en petit gris illisible. */
export function Notice({ children, tone = 'info', className }: { children: ReactNode; tone?: 'info' | 'warning'; className?: string }) {
  return (
    <div role="note" className={cn('rounded-xl border px-4 py-3 text-sm leading-relaxed', className, tone === 'info' ? 'border-primary-100 bg-primary-50 text-primary-900' : 'border-accent-100 bg-accent-100/60 text-ink')}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl text-primary-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-ink-muted">{subtitle}</p> : null}
    </header>
  );
}

/** Marque : étoile à huit branches originale. Couleurs issues de src/config/brand.ts. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="8" y="8" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="8" width="16" height="16" rx="2" fill="none" stroke="var(--color-accent-500)" strokeWidth="2" transform="rotate(45 16 16)" />
      <circle cx="16" cy="16" r="2.5" fill="var(--color-accent-500)" />
    </svg>
  );
}
