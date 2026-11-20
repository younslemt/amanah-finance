import type { MonthAnalysis } from '@amanah/engines';
import { formatCents, formatMonth } from '@/lib/format';

const shortMonth = (key: string) => new Intl.DateTimeFormat('fr-BE', { month: 'short', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));

/**
 * Revenus et dépenses par mois (barres) et solde (repère). SVG rendu côté serveur,
 * doublé d'un tableau équivalent pour les lecteurs d'écran et la consultation précise.
 */
export function IncomeExpenseChart({ months, title = 'Revenus et dépenses' }: { months: readonly MonthAnalysis[]; title?: string }) {
  if (months.length === 0) return null;
  const W = 640, H = 220, padL = 8, padR = 8, padT = 12, padB = 28;
  const max = Math.max(1, ...months.flatMap((m) => [m.totalIncomeCents, m.totalExpenseCents]));
  const slot = (W - padL - padR) / months.length;
  const bar = Math.min(28, slot / 3);
  const y = (v: number) => padT + (H - padT - padB) * (1 - Math.max(0, v) / max);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title} sur ${months.length} mois`}>
        <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="var(--color-line)" />
        {months.map((m, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={m.month}>
              <rect x={cx - bar - 2} y={y(m.totalIncomeCents)} width={bar} height={H - padB - y(m.totalIncomeCents)} rx="3" fill="var(--color-primary-700)" />
              <rect x={cx + 2} y={y(m.totalExpenseCents)} width={bar} height={H - padB - y(m.totalExpenseCents)} rx="3" fill="var(--color-accent-500)" />
              <text x={cx} y={H - 9} textAnchor="middle" fontSize="12" fill="var(--color-ink-muted)">{shortMonth(m.month)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-primary-700" />Revenus (hors intérêts)</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-accent-500" />Dépenses (remboursements déduits)</span>
      </figcaption>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-primary-700">Voir le tableau</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm" data-testid="tableau-evolution">
            <caption className="sr-only">{title}</caption>
            <thead><tr className="border-b border-line text-left text-ink-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">Mois</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Revenus</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">Dépenses</th>
              <th scope="col" className="py-1.5 text-right font-medium">Solde</th>
            </tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-b border-line/60">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">{formatMonth(m.month)}</th>
                  <td className="tabular py-1.5 pr-3 text-right">{formatCents(m.totalIncomeCents, { round: true })}</td>
                  <td className="tabular py-1.5 pr-3 text-right">{formatCents(m.totalExpenseCents, { round: true })}</td>
                  <td className={`tabular py-1.5 text-right ${m.netCents < 0 ? 'text-critical' : ''}`}>{formatCents(m.netCents, { round: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Barre de répartition horizontale (par exemple : charges fixes, variables, épargne). */
export function SplitBar({ parts, label }: { parts: ReadonlyArray<{ label: string; cents: number; tone: 'primary' | 'accent' | 'mist' | 'critical' }>; label: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.cents), 0) || 1;
  const bg = { primary: 'bg-primary-700', accent: 'bg-accent-500', mist: 'bg-primary-100', critical: 'bg-critical' } as const;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-mist" role="img" aria-label={label}>
        {parts.filter((p) => p.cents > 0).map((p) => <span key={p.label} className={bg[p.tone]} style={{ width: `${(Math.max(0, p.cents) * 100) / total}%` }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-sm ${bg[p.tone]}`} />{p.label} · <span className="tabular">{formatCents(p.cents, { round: true })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
