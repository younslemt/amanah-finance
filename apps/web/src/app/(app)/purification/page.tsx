import type { Metadata } from 'next';
import { Badge, Card, Notice, PageHeader, Stat } from '@/components/ui';
import { getSnapshot } from '@/lib/data';
import { formatCents, formatDate } from '@/lib/format';
import { fr } from '@/messages/fr';
import { purificationAmount } from '@amanah/engines';

export const metadata: Metadata = { title: fr.purification.title };

export default async function PurificationPage() {
  const { purification: p } = await getSnapshot();
  const t = fr.purification;
  return (
    <>
      <PageHeader title={t.title} subtitle={t.intro} />
      <div className="space-y-3">
        <Notice>{t.distinct}</Notice>
        <Notice tone="warning">{t.basisNotice}</Notice>
      </div>
      <Card className="mt-4"><Stat label={t.pending} value={formatCents(p.detectedCreditedCents)} /></Card>
      <Card className="mt-4">
        {p.candidates.length === 0 ? <p className="text-ink-muted">{t.empty}</p> : (
          <ul className="divide-y divide-line">
            {p.candidates.map((c) => {
              // Relevé bancaire : seul le net crédité est connu ; base non choisie → à déterminer
              const amount = purificationAmount({ creditedCents: c.creditedCents }, null);
              return (
                <li key={c.transactionId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{t.source[c.sourceKind]}</p>
                      <p className="text-sm text-ink-muted">{formatDate(c.bookedOn)}</p>
                    </div>
                    {/* Sprint 3 : saisie du brut ou du précompte, choix de la base, confirmation */}
                    <Badge tone="warning">À confirmer</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-ink-muted">{t.credited}</dt><dd className="tabular font-semibold">{formatCents(amount.amounts.creditedCents)}</dd></div>
                    <div><dt className="text-ink-muted">{t.withholding}</dt><dd className="tabular">{amount.amounts.withholdingTaxCents === null ? t.unknown : formatCents(amount.amounts.withholdingTaxCents)}</dd></div>
                    <div><dt className="text-ink-muted">{t.gross}</dt><dd className="tabular">{amount.amounts.grossCents === null ? t.unknown : formatCents(amount.amounts.grossCents)}</dd></div>
                    <div><dt className="text-ink-muted">{t.toPurify}</dt><dd className="font-medium">{amount.amountCents === null ? fr.common.toDetermine : formatCents(amount.amountCents)}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
