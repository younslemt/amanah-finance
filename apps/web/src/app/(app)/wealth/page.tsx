import type { Metadata } from 'next';
import { Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { formatCents } from '@/lib/format';
import { fr } from '@/messages/fr';

export const metadata: Metadata = { title: fr.wealth.title };

export default async function WealthPage() {
  const [data, s] = await Promise.all([getHouseholdData(), getSnapshot()]);
  const t = fr.wealth;
  const w = s.wealth;
  const unvalued = data.assets.filter((a) => w.unvaluedAssetIds.includes(a.id));
  return (
    <>
      <PageHeader title={t.title} />
      <Card><Stat label={t.net} value={formatCents(w.netWorthCents)} hint={w.status === 'partial' ? t.partial : undefined} /></Card>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>{t.assets} · {formatCents(w.assetsCents, { round: true })}</CardTitle>
          {w.byKind.length === 0 && unvalued.length === 0 ? <p className="text-ink-muted">{fr.common.empty}</p> : (
            <ul className="divide-y divide-line">
              {w.byKind.map((k) => (
                <li key={k.kind} className="flex justify-between gap-3 py-3"><span>{t.kinds[k.kind] ?? k.kind}</span><span className="tabular">{formatCents(k.valueCents)}</span></li>
              ))}
              {unvalued.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-3"><span>{a.label}</span><span className="text-sm text-warning">{t.unvalued}</span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardTitle>{t.liabilities} · {formatCents(w.liabilitiesCents, { round: true })}</CardTitle>
          {data.liabilities.length === 0 ? <p className="text-ink-muted">{fr.common.empty}</p> : (
            <ul className="divide-y divide-line">
              {data.liabilities.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 py-3"><span>{l.label}</span><span className="tabular">{formatCents(l.outstandingCents)}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="mt-4"><Notice>{t.soon}</Notice></div>
    </>
  );
}
