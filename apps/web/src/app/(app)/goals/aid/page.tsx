import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { todayInBrussels } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { religiousAccess } from '@/lib/supabase/session';
import { loadEidPlans } from '@/lib/supabase/goals';
import { centsToInput, eidPlanFrom } from '@/lib/eid-view';
import { estimateEidAlAdha, renewalProposal } from '@amanah/engines';
import { createEidGoal } from './actions';

export const metadata: Metadata = { title: 'Préparer mon Aïd' };
const TITLE = 'Préparer mon Aïd';

export default async function AidPage({ searchParams }: { searchParams: Promise<{ suite?: string }> }) {
  const { suite } = await searchParams;
  if (isDemoMode) {
    return (<><PageHeader title={TITLE} /><Notice>Démonstration : création désactivée. Ouvrez le projet « Aïd al-Adha » de démonstration depuis Projets.</Notice>
      <p className="mt-3"><Link href="/goals" className="text-primary-800 underline">← Projets</Link></p></>);
  }
  const { enabled, ctx } = await religiousAccess();
  if (!enabled || !ctx) return (<><PageHeader title={TITLE} /><ReligiousGate feature={TITLE} next="/goals" /></>);
  const today = todayInBrussels();
  const plans = await loadEidPlans(ctx);
  const prev = suite ? plans.find((p) => p.goal_id === suite) : undefined;
  const proposal = prev ? renewalProposal(eidPlanFrom(prev, `${prev.civil_year}-01-01`)) : null;
  const thisYear = Number(today.slice(0, 4));
  const civilYear = proposal?.civilYear ?? (estimateEidAlAdha(thisYear).some((e) => e.date > today) ? thisYear : thisYear + 1);
  const estimates = estimateEidAlAdha(civilYear);
  const b = proposal?.budget;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
      <PageHeader title={TITLE} subtitle={proposal ? `Reconduction pour l’année civile ${civilYear} : budget de l’an dernier repris, à ajuster. Rien n’est reporté de l’année précédente.` : 'Planifiez les dépenses de l’Aïd al-Adha de votre famille.'} />
      <Notice tone="warning">Estimation indicative : la date de l’Aïd dépend de l’observation du croissant et de l’autorité que vous suivez. La date retenue est celle que vous saisissez ; elle n’est « confirmée » que si vous le précisez, avec sa source.</Notice>
      <Card className="mt-4">
        <CardTitle>{proposal ? 'Aïd de l’année suivante' : 'Nouveau projet Aïd'}</CardTitle>
        <ActionForm action={createEidGoal} submitLabel={proposal ? 'Créer l’Aïd de l’année suivante' : 'Créer mon projet Aïd'} testId="form-aid" className="space-y-4">
          {prev ? <input type="hidden" name="previousGoalId" value={prev.goal_id} /> : null}
          <input type="hidden" name="civilYear" value={civilYear} />
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-primary-900">1. Budget (année civile {civilYear})</legend>
            <Field label="Sacrifice ou quote-part (€)" name="sacrifice" inputMode="decimal" defaultValue={b ? centsToInput(b.sacrificeCents) : ''} />
            <Field label="Frais complémentaires (€)" name="extras" inputMode="decimal" defaultValue={b ? centsToInput(b.extraCostsCents) : ''} hint="Transport, découpe, repas…" />
            <Field label="Contribution à un organisme (€)" name="organization" inputMode="decimal" defaultValue={b ? centsToInput(b.organizationCents) : ''} hint="Sacrifice délégué ou don, si vous le prévoyez." />
            <Field label="Contributions familiales annoncées (€)" name="family" inputMode="decimal" defaultValue={b ? centsToInput(b.familyContributionCents) : ''} hint="Montants apportés par d’autres membres de la famille." />
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-primary-900">2. Date</legend>
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
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-semibold text-primary-900">3. Épargne</legend>
            <Field label="Épargne déjà disponible (€)" name="available" inputMode="decimal" defaultValue="0" hint={proposal ? 'Rien n’est repris de l’année précédente.' : undefined} />
            <Field label="Effort d’épargne mensuel (€)" name="monthlyCapacity" inputMode="decimal" required />
          </fieldset>
        </ActionForm>
      </Card>
    </>
  );
}
