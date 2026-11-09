import type { Metadata } from 'next';
import { Badge, Card, PageHeader, Progress } from '@/components/ui';
import { getSnapshot } from '@/lib/data';
import { formatCents, formatMonth } from '@/lib/format';
import { fr } from '@/messages/fr';

export const metadata: Metadata = { title: fr.budget.title };

export default async function BudgetPage() {
  const s = await getSnapshot();
  const month = s.previousMonths[0];
  const tone = { no_budget: 'neutral', ok: 'positive', warning: 'warning', over: 'critical' } as const;
  const bar = { no_budget: 'primary', ok: 'primary', warning: 'warning', over: 'critical' } as const;

  return (
    <>
      <PageHeader title={fr.budget.title} subtitle={formatMonth(month.month)} />
      <Card>
        <ul className="divide-y divide-line">
          {month.categories.map((c) => (
            <li key={c.categorySlug} className="py-4 first:pt-0 last:pb-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-medium">{fr.categories[c.categorySlug] ?? c.categorySlug}</span>
                <Badge tone={tone[c.status]}>{fr.budget.status[c.status]}</Badge>
              </div>
              {c.limitCents !== null ? (
                <Progress permille={c.limitCents > 0 ? Math.round((c.spentCents * 1000) / c.limitCents) : 1000} label={fr.categories[c.categorySlug] ?? c.categorySlug} tone={bar[c.status]} />
              ) : null}
              <p className="tabular mt-2 text-sm text-ink-muted">
                {fr.budget.spent} {formatCents(c.spentCents)}{c.limitCents !== null ? ` · ${fr.budget.limit} ${formatCents(c.limitCents)}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
