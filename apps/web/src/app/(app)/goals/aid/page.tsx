import type { Metadata } from 'next';
import { FormStep } from '@/components/ui/form-step';
import Link from 'next/link';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { formatDate } from '@/lib/format';
import { religiousAccess } from '@/lib/supabase/session';
import { readGoalRepository } from '@/lib/goals';
import { centsToInput, eidPlanFrom } from '@/lib/eid-view';
import { estimateEidAlAdha, renewalProposal } from '@amanah/engines';
import { createEidGoal } from './actions';

export const metadata: Metadata = { title: 'Préparer mon Aïd' };
const TITLE = 'Préparer mon Aïd';

export default async function AidPage({ searchParams }: { searchParams: Promise<{ suite?: string; annee?: string }> }) {
  const { suite, annee } = await searchParams;
  const { enabled } = await religiousAccess();
  if (!enabled) return (<><PageHeader title={TITLE} /><ReligiousGate feature={TITLE} next="/goals" /></>);
  const repo = await readGoalRepository();
  const today = repo.today();
  const plans = await repo.eidPlans();
  const prev = suite ? plans.find((p) => p.goal_id === suite) : undefined;
  const proposal = prev ? renewalProposal(eidPlanFrom(prev, `${prev.civil_year}-01-01`)) : null;
  // Années proposées : les deux prochains Aïd à venir sans projet existant (une année civile par projet)
  const thisYear = Number(today.slice(0, 4));
  const firstYear = estimateEidAlAdha(thisYear).some((e) => e.date > today) ? thisYear : thisYear + 1;
  const taken = new Set(plans.map((p) => p.civil_year));
  const freeYears = [firstYear, firstYear + 1, firstYear + 2].filter((y) => !taken.has(y)).slice(0, 2);
  const wanted = Number(annee);
  const civilYear = proposal?.civilYear ?? (freeYears.includes(wanted) ? wanted : freeYears[0]);
  const existing = plans.filter((p) => p.civil_year >= firstYear);
  if (civilYear === undefined) {
    return (<><PageHeader title={TITLE} /><Notice>Vous avez déjà un projet Aïd pour les prochaines années. Ouvrez-le depuis vos projets ; l’année suivante se prépare depuis un Aïd réalisé.</Notice>
      <p className="mt-3"><Link href="/goals" className="text-primary-800 underline">← Projets</Link></p></>);
  }
  const estimates = estimateEidAlAdha(civilYear);
  const b = proposal?.budget;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
      <PageHeader title={TITLE} subtitle={proposal ? `Reconduction pour l’année civile ${civilYear} : budget de l’an dernier repris, à ajuster. Rien n’est reporté de l’année précédente.` : 'Planifiez les dépenses de l’Aïd al-Adha de votre famille.'} />
      <Notice tone="warning">Estimation indicative : la date de l’Aïd dépend de l’observation du croissant et de l’autorité que vous suivez. La date retenue est celle que vous saisissez ; elle n’est « confirmée » que si vous le précisez, avec sa source.</Notice>
      {!proposal && existing.length > 0 ? (
        <p className="mt-3 text-sm">Déjà prévu : {existing.map((p) => <Link key={p.goal_id} href={`/goals/${p.goal_id}`} className="mr-2 text-primary-800 underline">Aïd {p.civil_year}</Link>)}</p>
      ) : null}
      {!proposal && freeYears.length > 1 ? (
        <nav aria-label="Année civile" className="mt-3 flex gap-2 text-sm" data-testid="annees-aid">
          {freeYears.map((y) => <Link key={y} href={`/goals/aid?annee=${y}`} aria-current={y === civilYear ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 ${y === civilYear ? 'border-primary-700 bg-primary-50 font-medium' : 'border-line'}`}>Aïd {y}</Link>)}
        </nav>
      ) : null}
      <Card className="mt-4">
        <CardTitle>{proposal ? 'Aïd de l’année suivante' : `Nouveau projet Aïd ${civilYear}`}</CardTitle>
        <ActionForm action={createEidGoal} submitLabel={proposal ? 'Créer l’Aïd de l’année suivante' : 'Créer mon projet Aïd'} testId="form-aid" className="grid gap-4 sm:grid-cols-2" wizard>
          {prev ? <input type="hidden" name="previousGoalId" value={prev.goal_id} /> : null}
          <input type="hidden" name="civilYear" value={civilYear} />
          <FormStep step={1} total={3} title={`Budget (année civile ${civilYear})`}>
            
            <Field label="Sacrifice ou quote-part (€)" name="sacrifice" inputMode="decimal" defaultValue={b ? centsToInput(b.sacrificeCents) : ''} />
            <Field label="Frais complémentaires (€)" name="extras" inputMode="decimal" defaultValue={b ? centsToInput(b.extraCostsCents) : ''} hint="Transport, découpe, repas…" />
            <Field label="Contribution à un organisme (€)" name="organization" inputMode="decimal" defaultValue={b ? centsToInput(b.organizationCents) : ''} hint="Sacrifice délégué ou don, si vous le prévoyez." />
            <Field label="Contributions familiales annoncées (€)" name="family" inputMode="decimal" defaultValue={b ? centsToInput(b.familyContributionCents) : ''} hint="Montants apportés par d’autres membres de la famille." />
          </FormStep>
          <FormStep step={2} total={3} title="Date">
            
            <div>
              <Field label="Date de l’Aïd retenue" name="targetDate" type="date" min={`${civilYear}-01-01`} max={`${civilYear}-12-31`} defaultValue={estimates[0]?.date ?? ''} required />
              <p className="mt-1 text-xs text-ink-muted" data-testid="estimation-aid">
                Estimation (calendrier hégirien tabulaire, non officielle) : {estimates.length ? estimates.map((e) => `${formatDate(e.date)} (${e.hijriYear} H.)`).join(' ou ') : 'aucune'}.
              </p>
            </div>
            <RadioGroup name="dateStatus" legend="Cette date est-elle confirmée ?" defaultValue="entered" options={[
              { value: 'entered', label: 'Non, à confirmer plus tard' },
              { value: 'confirmed', label: 'Oui, confirmée par une source que j’indique' },
            ]} />
            <Field label="Source de la date (si confirmée)" name="dateSource" maxLength={200} hint="Par exemple : annonce de votre mosquée." />
          </FormStep>
          <FormStep step={3} total={3} title="Épargne">
            
            <Field label="Épargne déjà disponible (€)" name="available" inputMode="decimal" defaultValue="0" hint={proposal ? 'Rien n’est repris de l’année précédente.' : undefined} />
            <Field label="Effort d’épargne mensuel (€)" name="monthlyCapacity" inputMode="decimal" required />
          </FormStep>
        </ActionForm>
      </Card>
    </>
  );
}
