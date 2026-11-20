import type { DataCoverage } from '@amanah/engines';
import { Badge } from '@/components/ui';
import { COVERAGE_LABEL, coverageIssueText } from '@/lib/coverage-text';

/** Indique ce que les calculs couvrent réellement : mois complets, comptes et périodes manquants. */
export function CoverageNotice({ coverage, accountName, compact = false }: {
  coverage: DataCoverage; accountName: (id: string) => string; compact?: boolean;
}) {
  const tone = coverage.status === 'complete' ? 'positive' : 'warning';
  return (
    <div className="text-sm" data-testid="couverture" data-status={coverage.status}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{COVERAGE_LABEL[coverage.status]}</Badge>
        <span className="text-ink-muted">{coverage.completeMonths.length} mois complet(s) utilisé(s){coverage.incompleteMonths.length ? `, ${coverage.incompleteMonths.length} exclu(s)` : ''}</span>
      </div>
      {coverage.issues.length && !compact ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-muted" data-testid="couverture-manques">
          {coverage.issues.slice(0, 6).map((i, k) => <li key={k}>{coverageIssueText(i, accountName)}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
