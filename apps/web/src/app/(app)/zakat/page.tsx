import type { Metadata } from 'next';
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { getSnapshot } from '@/lib/data';
import { formatCents, formatDate } from '@/lib/format';
import { interpolate } from '@/lib/i18n';
import { fr } from '@/messages/fr';

export const metadata: Metadata = { title: fr.zakat.title };

const statusTone = { to_determine: 'warning', below_nisab: 'neutral', hawl_incomplete: 'neutral', due: 'positive' } as const;

export default async function ZakatPage() {
  const { zakat: z } = await getSnapshot();
  const t = fr.zakat;
  const rate = `${(z.ratePer100k / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 3 })} %`;
  const nisabLabel = interpolate(t.nisab, { basis: z.nisabBasis ? t.basis[z.nisabBasis] : fr.common.toDetermine });
  const amountLabel = z.status === 'due' ? t.estimated : t.indicative;
  const amountValue = z.status === 'to_determine' ? fr.common.toDetermine : formatCents(z.status === 'due' ? z.dueCents : z.estimatedZakatCents);

  return (
    <>
      <PageHeader title={t.title} subtitle={`${t.ruleset} ${z.rulesetId} ${z.rulesetVersion} · ${formatDate(z.asOf)}`} />
      <Notice tone="warning">{t.disclaimer}</Notice>

      <Card className="mt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Badge tone={statusTone[z.status]}>{t.status[z.status]}</Badge>
          <span className="text-sm text-ink-muted">{t.rate} {rate}</span>
        </div>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          <Stat label={t.gross} value={formatCents(z.grossZakatableCents, { round: true })} />
          <Stat label={t.debts} value={`− ${formatCents(z.deductibleDebtsCents, { round: true })}`} />
          <Stat label={nisabLabel} value={z.nisabCents === null ? t.unknownNisab : formatCents(z.nisabCents, { round: true })} />
          <Stat label={amountLabel} value={amountValue} tone={z.status === 'due' ? 'positive' : 'default'} />
        </div>
        {z.status === 'to_determine' && z.pendingReasons.length > 0 ? (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-sm font-medium">{t.pendingTitle}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
              {z.pendingReasons.map((r) => <li key={r}>{t.pending[r]}</li>)}
            </ul>
          </div>
        ) : null}
      </Card>

      {z.warnings.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {z.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`}><Notice tone="warning">{interpolate(t.warnings[w.code], w.params)}</Notice></li>
          ))}
        </ul>
      ) : null}

      <Card className="mt-4">
        <CardTitle>{t.lines}</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{t.lines}</caption>
            <thead className="text-left text-ink-muted">
              <tr><th scope="col" className="pb-2 font-normal">Élément</th><th scope="col" className="pb-2 font-normal">Règle</th><th scope="col" className="pb-2 text-right font-normal">{t.value}</th><th scope="col" className="pb-2 text-right font-normal">{t.included}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {z.lines.map((l) => (
                <tr key={l.sourceId}>
                  <th scope="row" className="py-3 pr-3 text-left font-medium">{l.label}</th>
                  <td className="py-3 pr-3 text-ink-muted">{t.rules[l.rule]}<span className="block text-xs">{l.references.join(' · ')}</span></td>
                  <td className="tabular py-3 text-right">{formatCents(l.valueCents)}</td>
                  <td className="tabular py-3 text-right font-medium">{formatCents(l.includedCents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line"><th scope="row" colSpan={3} className="pt-3 text-left font-medium">{t.net}</th><td className="tabular pt-3 text-right font-semibold">{formatCents(z.netZakatableCents)}</td></tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
