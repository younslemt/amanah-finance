import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate } from '@/lib/format';
import { religiousAccess } from '@/lib/supabase/session';
import { loadDonations } from '@/lib/supabase/contributions';
import { donationsModel, KIND_LABEL, STATUS_LABEL, type DonationsModel } from '@/lib/contributions-view';
import { DEMO_CALCS, DEMO_CONTRIBUTIONS, DEMO_DEBITS, DEMO_FITR, DEMO_USER } from '@/lib/demo-donations';
import { CONTRIBUTION_KINDS } from '@amanah/engines';
import { createContribution, deleteContribution, linkContribution } from './actions';

export const metadata: Metadata = { title: 'Dons et Sadaqah' };

const TITLE = 'Dons et Sadaqah';
const INTRO = 'Zakat, Zakat al-Fitr, Sadaqah, purification et autres dons : historique, bénéficiaires, totaux et affectations.';

function Summary({ m }: { m: DonationsModel }) {
  const [current, ...older] = m.years;
  if (!current) return <Card className="mt-4"><p className="text-sm text-ink-muted">Aucun don enregistré pour l’instant.</p></Card>;
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="synthese-dons">
        <Card><Stat label={`Total ${current.year}`} value={formatCents(current.totalCents)} hint={`${current.count} don(s)`} /></Card>
        <Card><Stat label="Déclaré par vous" value={formatCents(current.declaredCents)} hint="Saisi, sans preuve bancaire" /></Card>
        <Card><Stat label="Rapproché avec une opération bancaire" value={formatCents(current.bankMatchedCents)} hint="Débit importé compatible : pas une confirmation de réception" /></Card>
        <Card><Stat label="Dont purification" value={formatCents(current.byKind.purification.totalCents)} hint="Comptée une seule fois" /></Card>
      </div>
      <Card className="mt-4">
        <CardTitle>Totaux par année et par type</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="totaux-annuels">
            <caption className="sr-only">Totaux des dons par année et par type</caption>
            <thead className="text-left text-ink-muted">
              <tr><th scope="col" className="pb-2 font-normal">Type</th>
                {[current, ...older].map((y) => <th key={y.year} scope="col" className="pb-2 text-right font-normal">{y.year}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CONTRIBUTION_KINDS.filter((k) => m.years.some((y) => y.byKind[k].count > 0)).map((k) => (
                <tr key={k}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">{KIND_LABEL[k]}</th>
                  {m.years.map((y) => <td key={y.year} className="tabular py-2 text-right">{y.byKind[k].count ? formatCents(y.byKind[k].totalCents) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line"><th scope="row" className="pt-2 text-left font-medium">Total</th>
                {m.years.map((y) => <td key={y.year} className="tabular pt-2 text-right font-semibold">{formatCents(y.totalCents)}</td>)}</tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

function Obligations({ m }: { m: DonationsModel }) {
  if (!m.zakat.length && !m.fitr.length) return null;
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Card>
        <CardTitle action={<Link href="/zakat" className="text-sm text-primary-800 underline-offset-4 hover:underline">Zakat</Link>}>Zakat patrimoniale : dû, payé, reste</CardTitle>
        {m.zakat.length ? (
          <ul className="divide-y divide-line text-sm" data-testid="suivi-zakat">
            {m.zakat.map((s) => (
              <li key={s.id} className="py-2">
                <p className="font-medium">Calcul du {formatDate(s.asOf)}</p>
                <p className="text-ink-muted">Dû {formatCents(s.dueCents)} · payé {formatCents(s.paidCents)} (dont rapproché {formatCents(s.bankMatchedPaidCents)}) · reste <span className="font-medium text-ink">{formatCents(s.remainingCents)}</span>{s.excessCents ? ` · au-delà du dû ${formatCents(s.excessCents)}` : ''}</p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">Aucun calcul de Zakat enregistré.</p>}
      </Card>
      <Card>
        <CardTitle action={<Link href="/zakat/al-fitr" className="text-sm text-primary-800 underline-offset-4 hover:underline">Zakat al-Fitr</Link>}>Zakat al-Fitr : dû, payé, reste</CardTitle>
        {m.fitr.length ? (
          <ul className="divide-y divide-line text-sm" data-testid="suivi-fitr">
            {m.fitr.map((s) => (
              <li key={s.id} className="py-2">
                <p className="font-medium">Année civile {s.civilYear} · {s.persons} personne(s) × {formatCents(s.amountPerPersonCents)}</p>
                <p className="text-ink-muted">Dû {formatCents(s.dueCents)} · payé {formatCents(s.paidCents)} · reste <span className="font-medium text-ink">{formatCents(s.remainingCents)}</span></p>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-ink-muted">Aucune Zakat al-Fitr enregistrée.</p>}
      </Card>
    </div>
  );
}

function History({ m, interactive }: { m: DonationsModel; interactive: boolean }) {
  return (
    <Card className="mt-4">
      <CardTitle>Historique</CardTitle>
      {m.views.length === 0 ? <p className="text-sm text-ink-muted">Aucun don.</p> : (
        <ul className="divide-y divide-line" data-testid="historique-dons">
          {m.views.map((v) => (
            <li key={v.id} className="py-3" data-testid="don">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium"><span className="tabular">{formatCents(v.amountCents)}</span> · {v.kindLabel} · {v.beneficiary}</p>
                  <p className="text-sm text-ink-muted">{formatDate(v.paidOn)}{v.allocation ? ` · affecté à : ${v.allocation}` : ''}{v.mine ? '' : ' · partagé par un membre du foyer'}{v.note ? ` · ${v.note}` : ''}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.fromPurification ? <Badge tone="neutral">Parcours de purification</Badge> : null}
                  <Badge tone={v.status === 'confirmed' ? 'positive' : v.status === 'bank_matched' ? 'neutral' : 'warning'}>{STATUS_LABEL[v.status]}</Badge>
                </div>
              </div>
              {interactive && v.mine ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {v.status === 'declared' && v.candidates.map((c) => (
                    <ActionForm key={c.transactionId} action={linkContribution} variant="quiet" testId="form-rapprocher-don"
                      submitLabel={`Rapprocher de « ${c.description} » du ${formatDate(c.bookedOn)}`}>
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="transactionId" value={c.transactionId} />
                    </ActionForm>
                  ))}
                  {v.status === 'bank_matched' ? (
                    <ActionForm action={linkContribution} variant="quiet" submitLabel="Retirer le rapprochement" testId="form-retirer-rapprochement">
                      <input type="hidden" name="id" value={v.id} />
                      <input type="hidden" name="transactionId" value="" />
                    </ActionForm>
                  ) : null}
                  {v.editable ? (
                    <ActionForm action={deleteContribution} variant="quiet" submitLabel="Supprimer" testId="form-supprimer-don">
                      <input type="hidden" name="id" value={v.id} />
                    </ActionForm>
                  ) : null}
                </div>
              ) : null}
              {v.fromPurification ? <p className="mt-1 text-xs text-ink-muted">Enregistrée depuis la <Link href="/purification" className="underline">purification</Link> : elle n’est ni ressaisie ni modifiable ici.</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NewContribution({ m, today, calcs, fitr }: { m: DonationsModel; today: string; calcs: DonationsModel['zakat']; fitr: DonationsModel['fitr'] }) {
  return (
    <Card className="mt-4">
      <CardTitle>Déclarer un don</CardTitle>
      <p className="mb-3 text-sm text-ink-muted">Un don déclaré n’est pas un paiement : l’application n’effectue aucun paiement. Une purification s’enregistre depuis la page <Link href="/purification" className="underline">Purification</Link>.</p>
      <ActionForm action={createContribution} submitLabel="Enregistrer le don" testId="form-don" className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Type" name="kind" defaultValue="">
          <option value="" disabled>Choisir…</option>
          {(['sadaqah', 'zakat', 'zakat_al_fitr', 'waqf', 'other'] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </SelectField>
        <Field label="Montant (€)" name="amount" inputMode="decimal" required />
        <Field label="Date du don" name="paidOn" type="date" max={today} defaultValue={today} required />
        <Field label="Bénéficiaire" name="beneficiary" list="beneficiaires" maxLength={120} required />
        <datalist id="beneficiaires">{m.beneficiaries.map((b) => <option key={b.label} value={b.label} />)}</datalist>
        <Field label="Note (facultative)" name="note" maxLength={300} />
        {calcs.length ? (
          <SelectField label="Affecter à un calcul de Zakat (Zakat seulement)" name="zakatCalculationId" defaultValue="">
            <option value="">Aucune affectation</option>
            {calcs.map((c) => <option key={c.id} value={c.id}>Calcul du {formatDate(c.asOf)} — reste {formatCents(c.remainingCents)}</option>)}
          </SelectField>
        ) : null}
        {fitr.length ? (
          <SelectField label="Affecter à une Zakat al-Fitr (Zakat al-Fitr seulement)" name="zakatFitrId" defaultValue="">
            <option value="">Aucune affectation</option>
            {fitr.map((f) => <option key={f.id} value={f.id}>Zakat al-Fitr, année civile {f.civilYear} — reste {formatCents(f.remainingCents)}</option>)}
          </SelectField>
        ) : null}
      </ActionForm>
    </Card>
  );
}

function Notices() {
  return (
    <div className="space-y-3">
      <Notice>« Déclaré » : saisi par vous. « Rapproché avec une opération bancaire » : associé par vous à un débit du même montant, à 10 jours au plus, dans un relevé importé. C’est un indice de paiement, pas une preuve définitive ni une confirmation de réception par le bénéficiaire. Un statut « Confirmé », fondé sur une preuve supplémentaire ou un partenaire fiable, est prévu ultérieurement. Aucun paiement n’est effectué et aucun justificatif n’est conservé par l’application.</Notice>
      <Notice tone="warning">Montants indicatifs : ni fatwa ni certification. Les obligations (Zakat, Zakat al-Fitr) relèvent de votre choix ou d’un avis religieux qualifié.</Notice>
    </div>
  );
}

export default async function DonsPage() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  if (isDemoMode) {
    const m = donationsModel({ userId: DEMO_USER, contributions: DEMO_CONTRIBUTIONS, fitr: DEMO_FITR, calculations: DEMO_CALCS, debits: DEMO_DEBITS });
    return (
      <>
        <PageHeader title={TITLE} subtitle={INTRO} />
        <Notice className="mb-3">Démonstration : données fictives, aucune saisie possible.</Notice>
        <Notices />
        <Summary m={m} />
        <Obligations m={m} />
        <History m={m} interactive={false} />
      </>
    );
  }
  const { enabled, ctx } = await religiousAccess();
  if (!enabled || !ctx) return (<><PageHeader title={TITLE} subtitle={INTRO} /><ReligiousGate feature={TITLE} next="/dons" /></>);
  const since = `${Number(today.slice(0, 4)) - 2}-01-01`;
  const m = donationsModel({ userId: ctx.userId, ...(await loadDonations(ctx, since)) });
  return (
    <>
      <PageHeader title={TITLE} subtitle={INTRO} />
      <Notices />
      <Summary m={m} />
      <Obligations m={m} />
      {ctx.canWrite ? <NewContribution m={m} today={today} calcs={m.zakat.filter((z) => z.dueCents > 0)} fitr={m.fitr} /> : null}
      <History m={m} interactive={ctx.canWrite} />
    </>
  );
}
