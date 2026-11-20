import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { isDemoMode } from '@/lib/env';
import { formatCents } from '@/lib/format';
import { religiousAccess } from '@/lib/supabase/session';
import { loadFitr } from '@/lib/supabase/zakat';
import { donationsModel, type DonationsModel } from '@/lib/contributions-view';
import { DEMO_CONTRIBUTIONS, DEMO_FITR, DEMO_USER } from '@/lib/demo-donations';
import { createFitr, deleteFitr } from '../actions';

export const metadata: Metadata = { title: 'Zakat al-Fitr' };
const TITLE = 'Zakat al-Fitr';
const INTRO = 'Due en fin de Ramadan pour chaque personne à charge. Suivie séparément de la Zakat patrimoniale.';

function List({ fitr, interactive }: { fitr: DonationsModel['fitr']; interactive: boolean }) {
  if (!fitr.length) return <Card className="mt-4"><p className="text-sm text-ink-muted">Aucune Zakat al-Fitr enregistrée.</p></Card>;
  return (
    <ul className="mt-4 space-y-4" data-testid="liste-fitr">
      {fitr.map((f) => (
        <li key={f.id}>
          <Card>
            <CardTitle>Zakat al-Fitr {f.year}</CardTitle>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Personnes" value={String(f.persons)} />
              <Stat label="Par personne" value={formatCents(f.amountPerPersonCents)} />
              <Stat label="Dû" value={formatCents(f.dueCents)} />
              <Stat label="Reste" value={formatCents(f.remainingCents)} tone={f.remainingCents === 0 ? 'positive' : 'default'} hint={`Payé ${formatCents(f.paidCents)}, dont vérifié ${formatCents(f.verifiedPaidCents)}`} />
            </div>
            <p className="mt-3 text-sm text-ink-muted">Montant par personne choisi par vous, source : {f.source}.</p>
            {interactive ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/dons" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-mist">Déclarer un paiement</Link>
                <ActionForm action={deleteFitr} variant="quiet" submitLabel="Supprimer"><input type="hidden" name="id" value={f.id} /></ActionForm>
              </div>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

const Notices = () => (
  <div className="space-y-3">
    <Notice>Le montant par personne n’est jamais fixé par l’application : indiquez celui que vous suivez (mosquée, organisme, avis religieux) et sa source. Les paiements se déclarent dans <Link href="/dons" className="underline">Dons et Sadaqah</Link>, affectés à l’année concernée.</Notice>
    <Notice tone="warning">Estimation indicative : ni fatwa ni certification. Aucun paiement n’est effectué par l’application.</Notice>
  </div>
);

export default async function FitrPage() {
  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric' }).format(new Date()));
  if (isDemoMode) {
    const m = donationsModel({ userId: DEMO_USER, contributions: DEMO_CONTRIBUTIONS, fitr: DEMO_FITR, calculations: [], debits: [] });
    return (<><PageHeader title={TITLE} subtitle={INTRO} /><Notice className="mb-3">Démonstration : données fictives.</Notice><Notices /><List fitr={m.fitr} interactive={false} /></>);
  }
  const { enabled, ctx } = await religiousAccess();
  if (!enabled || !ctx) return (<><PageHeader title={TITLE} subtitle={INTRO} /><ReligiousGate feature={TITLE} next="/zakat/al-fitr" /></>);
  const { fitr, payments } = await loadFitr(ctx);
  const m = donationsModel({ userId: ctx.userId, contributions: payments, fitr, calculations: [], debits: [] });
  return (
    <>
      <PageHeader title={TITLE} subtitle={INTRO} />
      <Notices />
      {ctx.canWrite ? (
        <Card className="mt-4">
          <CardTitle>Enregistrer la Zakat al-Fitr d’une année</CardTitle>
          <ActionForm action={createFitr} submitLabel="Enregistrer" testId="form-fitr" className="grid gap-3 sm:grid-cols-2">
            <Field label="Année" name="year" inputMode="numeric" defaultValue={String(year)} required />
            <Field label="Nombre de personnes" name="persons" inputMode="numeric" required />
            <Field label="Montant par personne (€)" name="amountPerPerson" inputMode="decimal" required />
            <Field label="Source du montant" name="source" maxLength={200} required hint="Par exemple : montant communiqué par votre mosquée." />
          </ActionForm>
        </Card>
      ) : null}
      <List fitr={m.fitr} interactive={ctx.canWrite} />
    </>
  );
}
