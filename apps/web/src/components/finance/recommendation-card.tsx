import Link from 'next/link';
import type { Recommendation } from '@amanah/engines';
import { Badge } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { ACTION_LABEL, dataLine, findingText, impactText, proposalText, RULE_TITLE, SEVERITY_LABEL } from '@/lib/recommendation-text';
import { setRecommendationFeedback } from '@/app/(app)/recommandations/actions';

const tone = { critical: 'critical', high: 'warning', medium: 'neutral', info: 'neutral' } as const;

/** Constat, données utilisées, proposition, impact simulé, action facultative. */
export function RecommendationCard({ r, interactive, compact = false }: { r: Recommendation; interactive: boolean; compact?: boolean }) {
  const impact = impactText(r);
  return (
    <article className="rounded-xl border border-line bg-paper p-4" data-testid="recommandation" data-rule={r.ruleId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium text-primary-900">{RULE_TITLE[r.ruleId]}</h3>
        <Badge tone={tone[r.severity]}>{SEVERITY_LABEL[r.severity]}</Badge>
      </div>
      <p className="mt-2 text-sm">{findingText(r)}</p>
      <p className="mt-2 text-sm"><span className="font-medium">Proposition : </span>{proposalText(r)}</p>
      {impact ? <p className="mt-1 text-sm text-ink-muted" data-testid="impact"><span className="font-medium text-ink">Impact : </span>{impact}</p> : null}
      {compact ? null : (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-primary-700">Pourquoi ? Les données utilisées</summary>
          <dl className="mt-2 grid gap-1.5" data-testid="donnees-utilisees">
            {r.data.map((d, i) => {
              const l = dataLine(d);
              return (
                <div key={i} className="flex flex-wrap justify-between gap-x-3 border-b border-line/60 pb-1">
                  <dt className="text-ink-muted">{l.label}</dt>
                  <dd className="tabular font-medium">{l.value} <span className="text-xs font-normal text-ink-muted">· {l.source}</span></dd>
                </div>
              );
            })}
          </dl>
        </details>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {r.action ? (
          <Link href={r.action.href} className="rounded-lg bg-primary-800 px-3 py-2 text-sm font-medium text-ivory hover:bg-primary-700">{ACTION_LABEL[r.action.code] ?? 'Voir'}</Link>
        ) : null}
        {interactive && r.ruleId !== 'R0' && !compact ? (
          <>
            {(['done', 'snoozed', 'dismissed'] as const).map((status) => (
              <ActionForm key={status} action={setRecommendationFeedback} variant="quiet" testId={`reco-${status}`}
                submitLabel={{ done: 'C’est fait', snoozed: 'Me le rappeler dans un mois', dismissed: 'Écarter' }[status]}>
                <input type="hidden" name="fingerprint" value={r.fingerprint} />
                <input type="hidden" name="status" value={status} />
              </ActionForm>
            ))}
          </>
        ) : null}
      </div>
    </article>
  );
}
