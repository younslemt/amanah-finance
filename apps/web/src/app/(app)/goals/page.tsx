import type { Metadata } from 'next';
import { Badge, Card, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { getSnapshot } from '@/lib/data';
import { formatCents, formatDate } from '@/lib/format';
import { interpolate } from '@/lib/i18n';
import { fr } from '@/messages/fr';

export const metadata: Metadata = { title: fr.goals.title };

const tone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;

export default async function GoalsPage() {
  const s = await getSnapshot();
  const t = fr.goals;
  return (
    <>
      <PageHeader title={t.title} />
      <Notice>{t.virtualNotice}</Notice>
      {s.goals.length === 0 ? <Card className="mt-4"><p className="text-ink-muted">{fr.common.empty}</p></Card> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {s.goals.map(({ goal, plan }) => (
          <Card key={goal.id} as="article">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-accent-600">{t.kind[goal.kind]}</p>
                <h2 className="text-xl text-primary-900">{goal.name}</h2>
              </div>
              <Badge tone={tone[plan.status]}>{t.status[plan.status]}</Badge>
            </div>
            <Progress permille={plan.progressPermille} label={goal.name} />
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Stat label={t.saved} value={formatCents(plan.savedCents, { round: true })} />
              <Stat label={t.target} value={formatCents(goal.targetCents, { round: true })} />
              <Stat label={t.monthly} value={formatCents(plan.monthlyRequiredCents)} />
              <Stat label={t.deadline} value={formatDate(goal.targetDate)} hint={interpolate(t.months, { count: plan.monthsLeft })} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
