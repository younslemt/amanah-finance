import { formatCents } from '@/lib/format';
import type { ZakatLine, ZakatStatusView } from '@/lib/zakat-status';
import { MethodBadge } from './method-badge';

/**
 * Les notions de la Zakat, toujours distinctes ; montant restant sans déduire la provision.
 * `lines` permet de n'afficher que les lignes qui ont une source (provision virtuelle masquée
 * tant qu'aucune donnée ne l'alimente).
 */
export function ZakatStatusList({ view, lines = view.lines, title = 'Zakat', headingLevel }: { view: ZakatStatusView; lines?: readonly ZakatLine[]; title?: string | null; headingLevel?: 3 }) {
  const hasProvision = lines.some((l) => l.kind === 'provision');
  return (
    <div data-testid="zakat-statuts" className="space-y-3">
      {title === null ? null : (
        <div className="flex items-center justify-between gap-2">
          {headingLevel === 3 ? <h3 className="font-sans text-base font-semibold">{title}</h3> : <p className="font-semibold">{title}</p>}
          <MethodBadge methodId="M-01, M-02" />
        </div>
      )}
      <dl className="divide-y divide-mist text-sm">
        {lines.map((l) => (
          <div key={l.kind} className="flex justify-between gap-3 py-2" data-testid="zakat-ligne" data-kind={l.kind}>
            <dt className={l.subsetOfDeclared ? 'pl-4' : ''}>
              <span className="font-medium">{l.label}</span>
              <span className="block text-xs text-ink-muted">{l.hint}</span>
            </dt>
            <dd className="tabular whitespace-nowrap font-semibold">{l.cents === null ? (l.kind === 'estimated' ? 'à compléter' : 'non renseignée') : formatCents(l.cents)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-primary-50 p-3" data-testid="zakat-reste" data-complete={view.complete ? 'yes' : 'no'}>
        <span className="text-sm font-semibold text-primary-700">{view.remainingLabel}</span>
        {view.remainingCents === null
          ? <span className="text-sm text-ink-muted">Non déterminé tant que le calcul est incomplet</span>
          : <span className="tabular text-2xl font-semibold text-primary-900">{formatCents(view.remainingCents)}</span>}
      </div>
      {view.excessCents !== null && view.excessCents > 0 ? <p className="text-xs text-ink-muted">Contributions au-delà du montant estimé : {formatCents(view.excessCents)}.</p> : null}
      <p className="text-xs text-ink-muted">
        {view.complete ? 'Montant estimé moins les contributions que vous avez déclarées : ce n’est pas un montant établi. ' : ''}
        {hasProvision ? 'La provision prépare un paiement, elle n’en est pas un : elle n’est jamais déduite. ' : ''}
        Chaque contribution n’est comptée qu’une fois.
      </p>
    </div>
  );
}
