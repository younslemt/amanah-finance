import type { Metadata } from 'next';
import Link from 'next/link';
import { categoryMedian, trackScenario, type Adjustment, type ScenarioBaseline } from '@amanah/engines';
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { SplitBar } from '@/components/finance/charts';
import { CoverageNotice } from '@/components/finance/coverage-notice';
import { ScenarioBuilder } from '@/components/finance/scenario-builder';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { categoryLabel } from '@/lib/labels';
import { formatCents, formatDate, formatMonth } from '@/lib/format';
import { isPlannable, observedMonthlyPace } from '@amanah/engines';
import { requireOnboardedSession } from '@/lib/supabase/session';

export const metadata: Metadata = { title: 'Optimiser mon budget' };

const RELIABILITY = { insufficient: 'Données insuffisantes', low: 'Fiabilité faible (3 mois)', medium: 'Fiabilité moyenne', high: 'Fiabilité élevée (6 mois)' } as const;

export default async function OptimizePage({ searchParams }: { searchParams: Promise<{ categorie?: string; enregistre?: string; applique?: string }> }) {
  const q = await searchParams;
  const [s, data] = await Promise.all([getSnapshot(), getHouseholdData()]);
  const a = s.analysis;
  const cap = a.capacity;
  // Postes candidats : catégories de dépense, par dépense médiane décroissante
  const expenseSlugs = new Set(data.categories.filter((c) => c.kind === 'expense').map((c) => c.slug));
  const slugs = [...new Set(a.months.flatMap((m) => Object.keys(m.categories)))].filter((x) => expenseSlugs.has(x) || x === 'divers');
  const candidates = slugs.map((slug) => ({
    slug, label: categoryLabel(slug, data.categories), medianCents: categoryMedian(a, slug),
    nature: (data.natureOverrides?.[slug] ?? data.categories.find((c) => c.slug === slug)?.defaultNature ?? 'variable') as 'fixed' | 'variable',
  })).filter((c) => c.medianCents > 0).sort((x, y) => y.medianCents - x.medianCents);
  const goals = s.goals.filter(({ goal }) => isPlannable(goal)).map(({ goal }) => ({
    goal, allocations: data.allocations.filter((al) => al.goalId === goal.id), observedPaceCents: observedMonthlyPace(data.allocations, goal.id, data.asOf),
  }));
  const { buckets: _omit, ...clientAnalysis } = a;

  let scenarios: Array<{ id: string; name: string; created_at: string; applied_month: string | null; adjustments: Adjustment[]; baseline: ScenarioBaseline }> = [];
  if (!isDemoMode) {
    const ctx = await requireOnboardedSession();
    const { data: rows } = await ctx.supabase.from('budget_scenarios').select('id, name, created_at, applied_month, adjustments, baseline')
      .eq('household_id', ctx.householdId).order('created_at', { ascending: false }).limit(10);
    scenarios = (rows ?? []) as typeof scenarios;
  }

  return (
    <>
      <PageHeader title="Optimiser mon budget" subtitle="Analyser, identifier, simuler, décider, suivre" />
      {q.applique ? <Notice className="mb-4">Scénario enregistré et appliqué à vos plafonds du mois. Vos opérations n’ont pas été modifiées.</Notice> : null}
      {q.enregistre ? <Notice className="mb-4">Scénario enregistré. Retrouvez son suivi plus bas.</Notice> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>1. Analyser</CardTitle>
          <Badge tone={a.reliability === 'insufficient' ? 'warning' : 'neutral'}>{RELIABILITY[a.reliability]}</Badge>
        </div>
        <div className="mb-3"><CoverageNotice coverage={a.coverage} accountName={(id) => data.accounts.find((x) => x.id === id)?.name ?? 'Compte'} /></div>
        {a.reliability === 'insufficient' ? (
          <p className="text-sm">Nous disposons de {a.monthsWithData} mois complet(s). Il en faut au moins 3 pour chiffrer votre capacité d’épargne et simuler des économies. <Link href="/import" className="font-medium text-primary-700 underline">Importer un relevé</Link></p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="analyse-situation">
              <Stat label="Revenus réguliers" value={formatCents(cap.regularIncomeCents!, { round: true })} hint="médiane mensuelle" />
              <Stat label="Charges fixes" value={formatCents(cap.fixedExpenseCents!, { round: true })} />
              <Stat label="Dépenses variables" value={formatCents(cap.variableExpenseCents!, { round: true })} hint="hors exceptionnelles" />
              <Stat label="Capacité d’épargne estimée" value={formatCents(cap.estimatedCents!, { round: true })} tone={cap.estimatedCents! < 0 ? 'critical' : 'positive'} />
            </div>
            <div className="mt-4">
              <SplitBar label="Répartition des revenus réguliers" parts={[
                { label: 'Charges fixes', cents: cap.fixedExpenseCents!, tone: 'primary' },
                { label: 'Dépenses variables', cents: cap.variableExpenseCents!, tone: 'accent' },
                { label: cap.estimatedCents! >= 0 ? 'Capacité d’épargne' : 'Déficit', cents: Math.abs(cap.estimatedCents!), tone: cap.estimatedCents! >= 0 ? 'mist' : 'critical' },
              ]} />
            </div>
            <p className="mt-3 text-xs text-ink-muted">Médianes sur {a.monthsWithData} mois complets ({formatMonth(a.coverage.completeMonths[0])} à {formatMonth(a.coverage.completeMonths[a.coverage.completeMonths.length - 1])}). Virements entre vos comptes, intérêts et remboursements ne sont jamais comptés comme revenus ; les dépenses exceptionnelles sont exclues de la capacité estimée.</p>
          </>
        )}
      </Card>

      <div className="mt-4">
        <ScenarioBuilder analysis={clientAnalysis} goals={goals} candidates={candidates} initialCategory={q.categorie} demo={isDemoMode} />
      </div>

      <Card className="mt-4">
        <h2 id="suivi" className="mb-3 text-lg text-primary-900">5. Suivre</h2>
        {isDemoMode ? <p className="text-sm text-ink-muted">Le suivi des scénarios enregistrés est disponible en mode réel.</p>
          : scenarios.length === 0 ? <p className="text-sm text-ink-muted">Aucun scénario enregistré.</p> : (
            <ul className="space-y-4" data-testid="scenarios-suivis">
              {scenarios.map((sc) => {
                const tr = trackScenario(a, sc.adjustments, sc.baseline);
                return (
                  <li key={sc.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{sc.name}</p>
                      <Badge tone={sc.applied_month ? 'positive' : 'neutral'}>{sc.applied_month ? `Appliqué (${formatMonth(sc.applied_month.slice(0, 7))})` : 'Enregistré'}</Badge>
                    </div>
                    <p className="text-sm text-ink-muted">Le {formatDate(sc.created_at.slice(0, 10))} · économie simulée {formatCents(sc.baseline.potentialMonthlyCents)} / mois</p>
                    {tr.months.length === 0 ? <p className="mt-2 text-sm">Suivi disponible après le premier mois complet.</p> : (
                      <ul className="mt-2 text-sm">
                        {tr.lines.map((l) => (
                          <li key={l.categorySlug} className="flex flex-wrap justify-between gap-2">
                            <span>{categoryLabel(l.categorySlug, data.categories)} : cible {formatCents(l.targetCents, { round: true })}, réel {l.actualCents === null ? '—' : formatCents(l.actualCents, { round: true })}</span>
                            <Badge tone={l.onTrack ? 'positive' : 'warning'}>{l.onTrack ? 'Objectif tenu' : 'Au-dessus de la cible'}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </>
  );
}
