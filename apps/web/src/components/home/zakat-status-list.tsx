import { formatCents } from '@/lib/format';
import type { ZakatStatusView } from '@/lib/zakat-status';
import { MethodBadge } from './method-badge';

/** Les cinq notions de la Zakat, toujours distinctes ; reste à verser sans déduire la provision. */
export function ZakatStatusList({ view, title = 'Zakat' }: { view: ZakatStatusView; title?: string }) {
  return (
    <div data-testid="zakat-statuts" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{title}</p>
        <MethodBadge methodId="M-01, M-02" />
      </div>
      <dl className="divide-y divide-mist text-sm">
        {view.lines.map((l) => (
          <div key={l.kind} className="flex justify-between gap-3 py-2" data-testid="zakat-ligne" data-kind={l.kind}>
            <dt className={l.subsetOfDeclared ? 'pl-4' : ''}>
              <span className="font-medium">{l.label}</span>
              <span className="block text-xs text-ink-muted">{l.hint}</span>
            </dt>
            <dd className="tabular whitespace-nowrap font-semibold">{l.cents === null ? 'non renseignée' : formatCents(l.cents)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between rounded-xl bg-primary-50 p-3" data-testid="zakat-reste">
        <span className="text-sm font-semibold text-primary-700">Reste estimé à verser</span>
        <span className="tabular text-2xl font-semibold text-primary-900">{formatCents(view.remainingCents)}</span>
      </div>
      {view.excessCents > 0 ? <p className="text-xs text-ink-muted">Contributions au-delà du montant estimé : {formatCents(view.excessCents)}.</p> : null}
      <p className="text-xs text-ink-muted">La provision prépare un paiement, elle n’en est pas un : elle n’est jamais déduite. Chaque contribution n’est comptée qu’une fois.</p>
    </div>
  );
}
