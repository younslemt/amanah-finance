import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { getSnapshot } from '@/lib/data';
import { formatCents, formatMonth, formatPermille } from '@/lib/format';
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
  const s = await getSnapshot();
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

  return (
    <>
      <PageHeader title={greeting} subtitle={fr.app.tagline} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><Stat label={t.balance} value={formatCents(s.totalBalanceCents)} /></Card>
        <Card><Stat label={t.netWorth} value={formatCents(s.wealth.netWorthCents)} hint={s.wealth.status === 'partial' ? t.partialWealth : undefined} /></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle action={<SeeAll href="/budget" />}>{t.thisMonth} · {formatMonth(current.month)}</CardTitle>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={t.income} value={formatCents(current.incomeCents, { round: true })} tone="positive" />
            <Stat label={t.expenses} value={formatCents(current.expenseCents, { round: true })} />
            <Stat label={t.savingsRate} value={current.savingsRatePermille === null ? '—' : formatPermille(current.savingsRatePermille)} />
          </div>
        </Card>

        <Card>
          <CardTitle>{t.emergencyFund}</CardTitle>
          <p className="tabular text-2xl font-semibold">{formatCents(s.emergencyFund.currentCents, { round: true })}</p>
          <p className="mb-3 text-xs text-ink-muted">{interpolate(t.emergencyTarget, { months: 3 })} · {formatCents(s.emergencyFund.targetCents, { round: true })}</p>
          <Progress permille={s.emergencyFund.coveragePermille} label={t.emergencyFund} tone="accent" />
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle action={<SeeAll href="/goals" />}>{t.goals}</CardTitle>
        {s.goals.length === 0 ? <p className="text-ink-muted">{fr.common.empty}</p> : (
          <ul className="grid gap-5 md:grid-cols-3">
            {s.goals.map(({ goal, plan }) => (
              <li key={goal.id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">{goal.name}</span>
                  <Badge tone={goalTone[plan.status]}>{fr.goals.status[plan.status]}</Badge>
                </div>
                <Progress permille={plan.progressPermille} label={goal.name} />
                <p className="tabular mt-2 text-sm text-ink-muted">
                  {formatCents(plan.savedCents, { round: true })} / {formatCents(goal.targetCents, { round: true })} · {formatCents(plan.monthlyRequiredCents, { round: true })}{t.perMonth}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
    </>
  );
}
