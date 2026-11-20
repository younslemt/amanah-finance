import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { formatCents, formatMonth } from '@/lib/format';
import { IncomeExpenseChart } from '@/components/finance/charts';
import { RecommendationCard } from '@/components/finance/recommendation-card';
import { nextActions } from '@/lib/next-actions';
import { RECOMMENDATION_NOTICE } from '@/lib/recommendation-text';
import { CoverageNotice } from '@/components/finance/coverage-notice';
import { interpolate } from '@/lib/i18n';
import { fr } from '@/messages/fr';
import { isDemoMode } from '@/lib/env';
import { religiousAccess } from '@/lib/supabase/session';

export const metadata: Metadata = { title: fr.nav.dashboard };

const goalTone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;
const zakatTone = { to_determine: 'warning', below_nisab: 'neutral', hawl_incomplete: 'neutral', due: 'positive' } as const;

function SeeAll({ href }: { href: string }) {
  return <Link href={href} className="text-sm text-primary-700 underline-offset-4 hover:underline">{fr.dashboard.seeAll}</Link>;
}

export default async function DashboardPage() {
  const { enabled: religious, ctx } = await religiousAccess();
  const [s, data] = await Promise.all([getSnapshot(), getHouseholdData()]);
  const accountName = (id: string) => data.accounts.find((x) => x.id === id)?.name ?? 'Compte';
  const displayName = isDemoMode ? null : ctx?.displayName ?? null;
  const t = fr.dashboard;
  const greeting = displayName ? `${t.greeting}, ${displayName}` : t.greeting;
  const current = s.month; // mois en cours : les saisies apparaissent immédiatement

  if (s.isEmpty) {
    return (
      <>
        <PageHeader title={greeting} subtitle={fr.app.tagline} />
        <Card>
          <h2 className="text-xl text-primary-900">{t.emptyTitle}</h2>
          <p className="mt-2 text-ink-muted">{t.emptyBody}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            <li><Link href="/comptes" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">1. Ajouter un compte</Link></li>
            <li><Link href="/budget" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">2. Saisir revenus et dépenses</Link></li>
            <li><Link href="/import" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">3. Importer un relevé CSV</Link></li>
          </ul>
        </Card>
      </>
    );
  }

  const a = s.analysis;
  const cap = a.capacity;
  const enough = a.reliability !== 'insufficient';
  const recos = s.recommendations.slice(0, 3);
  const actions = nextActions({ recommendations: s.recommendations, religious, purification: religious ? s.purification.summary : null });
  const synthesis = !enough
    ? `Nous disposons de ${a.monthsWithData} mois complet(s) d’opérations : importez au moins 3 mois pour obtenir une analyse chiffrée.`
    : cap.observedCents! >= 0
      ? `Sur vos ${a.monthsWithData} derniers mois complets, il vous reste en général ${formatCents(cap.observedCents!, { round: true })} par mois après vos dépenses.`
      : `Sur vos ${a.monthsWithData} derniers mois complets, vos dépenses dépassent vos revenus d’environ ${formatCents(-cap.observedCents!, { round: true })} par mois.`;

  return (
    <>
      <PageHeader title={greeting} subtitle={fr.app.tagline} />

      {/* 1. Situation financière */}
      <section aria-labelledby="situation" className="rounded-2xl bg-primary-900 p-5 text-ivory md:p-6" data-testid="ma-situation">
        <h2 id="situation" className="text-sm font-medium uppercase tracking-wide text-primary-100">Ma situation financière</h2>
        <p className="mt-2 max-w-3xl text-lg leading-snug md:text-xl" data-testid="synthese">{synthesis}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div><dt className="text-xs text-primary-100">{t.balance}</dt><dd className="tabular mt-1 text-xl font-semibold md:text-2xl">{formatCents(s.totalBalanceCents)}</dd></div>
          <div><dt className="text-xs text-primary-100">{t.netWorth}</dt><dd className="tabular mt-1 text-xl font-semibold md:text-2xl">{formatCents(s.wealth.netWorthCents, { round: true })}</dd>
            {s.wealth.status === 'partial' ? <dd className="text-xs text-primary-100">{t.partialWealth}</dd> : null}</div>
          <div><dt className="text-xs text-primary-100">{t.income} · {formatMonth(current.month)}</dt><dd className="tabular mt-1 text-xl font-semibold md:text-2xl">{formatCents(current.incomeCents, { round: true })}</dd></div>
          <div><dt className="text-xs text-primary-100">{t.expenses} · {formatMonth(current.month)}</dt><dd className="tabular mt-1 text-xl font-semibold md:text-2xl">{formatCents(current.expenseCents, { round: true })}</dd></div>
        </dl>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* 2. Évolution */}
        <Card className="lg:col-span-3">
          <CardTitle action={<SeeAll href="/budget#evolution" />}>Évolution des revenus et dépenses</CardTitle>
          {a.months.length ? <IncomeExpenseChart months={a.months} /> : <p className="text-sm text-ink-muted">Aucun mois complet pour le moment.</p>}
        </Card>

        {/* 3. Capacité d'épargne */}
        <Card className="lg:col-span-2">
          <CardTitle action={<SeeAll href="/budget/optimiser" />}>Capacité d’épargne</CardTitle>
          {!enough ? (
            <div className="space-y-2 text-sm" data-testid="capacite-insuffisante">
              <p className="text-ink-muted">Données insuffisantes : 3 mois complets sont nécessaires.</p>
              {a.months.length ? <CoverageNotice coverage={a.coverage} accountName={accountName} /> : null}
            </div>
          ) : (
            <div className="space-y-3" data-testid="capacite">
              <CoverageNotice compact coverage={a.coverage} accountName={accountName} />
              <Stat label="Estimée (revenus réguliers − charges)" value={formatCents(cap.estimatedCents!, { round: true })} tone={cap.estimatedCents! < 0 ? 'critical' : 'positive'} hint="hors dépenses et revenus exceptionnels" />
              <Stat label="Observée (solde réel médian)" value={formatCents(cap.observedCents!, { round: true })} hint={`sur ${a.monthsWithData} mois`} />
              {a.reserve ? (
                <div>
                  <p className="mb-1 text-sm">{t.emergencyFund} : {String(a.reserve.monthsCovered).replace('.', ',')} mois couverts sur {a.reserve.months}</p>
                  <Progress permille={a.reserve.coveragePermille} label={t.emergencyFund} tone="accent" />
                </div>
              ) : null}
              <Link href="/budget/optimiser" className="inline-block rounded-lg bg-primary-800 px-4 py-2 text-sm font-medium text-ivory hover:bg-primary-700">Optimiser mon budget</Link>
            </div>
          )}
        </Card>
      </div>

      {/* 4. Recommandations prioritaires */}
      <section aria-labelledby="mes-recommandations" className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="mes-recommandations" className="text-lg text-primary-900">Mes recommandations</h2>
          <SeeAll href="/recommandations" />
        </div>
        {recos.length === 0 ? <Card><p className="text-sm text-ink-muted">Aucun point d’amélioration significatif pour le moment.</p></Card> : (
          <div className="grid gap-3 md:grid-cols-3" data-testid="recommandations-prioritaires">
            {recos.map((r) => <RecommendationCard key={r.fingerprint} r={r} interactive={false} compact />)}
          </div>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        {/* 5. Objectifs financiers */}
        <Card className="lg:col-span-3">
          <CardTitle action={<SeeAll href="/goals" />}>Mes projets</CardTitle>
          {s.goals.length === 0 ? <p className="text-ink-muted">{fr.common.empty}</p> : (
            <ul className="space-y-4">
              {s.goals.map(({ goal, plan }) => (
                <li key={goal.id}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-medium">{goal.name}</span>
                    <Badge tone={goalTone[plan.status]}>{fr.goals.status[plan.status]}</Badge>
                  </div>
                  <Progress permille={plan.progressPermille} label={goal.name} />
                  <p className="tabular mt-1 text-sm text-ink-muted">
                    {formatCents(plan.savedCents, { round: true })} / {formatCents(goal.targetCents, { round: true })} · {formatCents(plan.monthlyRequiredCents, { round: true })}{t.perMonth}
                    {plan.projectedCompletionDate ? ` · atteint vers ${formatMonth(plan.projectedCompletionDate.slice(0, 7))}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 6. Prochaines actions */}
        <Card className="lg:col-span-2">
          <CardTitle>Mes prochaines actions</CardTitle>
          {actions.length === 0 ? <p className="text-sm text-ink-muted">Rien d’urgent : continuez ainsi.</p> : (
            <ol className="space-y-2" data-testid="prochaines-actions">
              {actions.map((x, i) => (
                <li key={x.href}>
                  <Link href={x.href} className="flex items-start gap-3 rounded-lg border border-line p-3 hover:bg-mist">
                    <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-semibold text-ink">{i + 1}</span>
                    <span className="text-sm"><span className="font-medium text-primary-800">{x.label}</span><span className="block text-ink-muted">{x.detail}</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {religious ? (<>
      <div className="mt-4 grid gap-4 sm:grid-cols-2" data-testid="dashboard-finance-islamique">
        <Card>
          <CardTitle action={<SeeAll href="/zakat" />}>{t.zakat}</CardTitle>
          <div className="mb-2"><Badge tone={zakatTone[s.zakat.status]}>{fr.zakat.status[s.zakat.status]}</Badge></div>
          <Stat label={s.zakat.status === 'due' ? fr.zakat.estimated : fr.zakat.indicative}
            value={s.zakat.status === 'to_determine' ? fr.common.toDetermine : formatCents(s.zakat.status === 'due' ? s.zakat.dueCents : 0)} />
        </Card>
        <Card>
          <CardTitle action={<SeeAll href="/purification" />}>{t.purification}</CardTitle>
          {s.purification.summary ? (
            <Stat label="À purifier (montants déterminés)" value={formatCents(s.purification.summary.toPurifyCents)}
              hint={`${formatCents(s.purification.summary.detectedCreditedCents)} à examiner · ${formatCents(s.purification.summary.purifiedCents)} purifié`} />
          ) : <Stat label={interpolate(t.purificationHint, { count: s.purification.candidates.length })} value={formatCents(s.purification.detectedCreditedCents)} />}
        </Card>
      </div>

      <div className="mt-6"><Notice>{fr.zakat.disclaimer}</Notice></div>
      </>) : (
        <Card className="mt-4">
          <CardTitle>Finance islamique</CardTitle>
          <p className="text-sm text-ink-muted">Zakat, purification des intérêts et objectif Hajj sont facultatifs et demandent un consentement distinct.</p>
          <Link href="/finance-islamique" className="mt-3 inline-block text-sm font-medium text-primary-700 underline-offset-4 hover:underline">Activer ces fonctions</Link>
        </Card>
      )}
      <p className="mt-6 text-xs text-ink-muted">{RECOMMENDATION_NOTICE}</p>
    </>
  );
}
