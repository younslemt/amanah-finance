import type { Metadata } from 'next';
import { Card, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { RecommendationCard } from '@/components/finance/recommendation-card';
import { getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { RECOMMENDATION_NOTICE } from '@/lib/recommendation-text';
import { resetRecommendationFeedback } from './actions';

export const metadata: Metadata = { title: 'Mes recommandations' };

export default async function RecommendationsPage() {
  const s = await getSnapshot();
  const recos = s.recommendations;
  return (
    <>
      <PageHeader title="Mes recommandations" subtitle="Classées par urgence, puis par impact sur votre budget" />
      <Notice>{RECOMMENDATION_NOTICE}</Notice>
      <div className="mt-4 space-y-3" data-testid="liste-recommandations">
        {recos.length === 0 ? (
          <Card><p className="text-ink-muted">Aucune recommandation pour le moment : vos données ne révèlent pas de point d’amélioration significatif.</p></Card>
        ) : recos.map((r) => <RecommendationCard key={r.fingerprint} r={r} interactive={!isDemoMode} />)}
      </div>
      {!isDemoMode ? (
        <Card className="mt-6">
          <p className="mb-3 text-sm text-ink-muted">Une recommandation écartée réapparaît si votre situation change sensiblement ; une recommandation reportée revient après un mois.</p>
          <ActionForm action={resetRecommendationFeedback} submitLabel="Réafficher toutes les recommandations" variant="quiet" testId="form-reset-reco" />
        </Card>
      ) : null}
    </>
  );
}
