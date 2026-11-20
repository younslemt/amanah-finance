import type { Metadata } from 'next';
import { FormStep } from '@/components/ui/form-step';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { JourneySteps } from '@/components/finance/journey';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { religiousAccess } from '@/lib/supabase/session';
import { ReligiousGate } from '@/components/religious-gate';
import { formatCents, formatDate } from '@/lib/format';
import { addMonths, GENERAL_GOAL_KINDS, goalJourney, isReligiousGoal, RELIGIOUS_GOAL_KINDS } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { createGoal } from '../actions';

export const metadata: Metadata = { title: fr.goals.title };

const goalTone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;

export default async function GoalsPage() {
  const { enabled: religious } = await religiousAccess();
  const [s, data] = await Promise.all([getSnapshot(), getHouseholdData()]);
  const t = fr.goals;
  const count = (id: string) => data.allocations.filter((a) => a.goalId === id).length;
  const kinds = [...GENERAL_GOAL_KINDS, ...(religious || isDemoMode ? RELIGIOUS_GOAL_KINDS.filter((k) => k !== 'eid_al_adha') : [])];
  return (
    <>
      <PageHeader title={t.title} subtitle="Créer, planifier, simuler, suivre, réaliser : vos projets pas à pas." />
      <Notice>{t.virtualNotice} Affecter un montant à un projet n’est ni une dépense ni un virement.</Notice>
      {s.goals.length === 0 ? <Card className="mt-4"><p className="text-ink-muted">Aucun projet pour l’instant : créez le premier ci-dessous.</p></Card> : null}
      <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="liste-projets">
        {s.goals.map(({ goal, plan }) => (
          <Card key={goal.id} as="article">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-accent-600">{t.kind[goal.kind]}{isReligiousGoal(goal.kind) ? ' · privé' : ''}</p>
                <h2 className="text-xl text-primary-900">{goal.name}</h2>
              </div>
              <Badge tone={goal.lifecycle && goal.lifecycle !== 'active' ? 'neutral' : goalTone[plan.status]}>
                {goal.lifecycle && goal.lifecycle !== 'active' ? t.lifecycle[goal.lifecycle] : t.status[plan.status]}
              </Badge>
            </div>
            <JourneySteps journey={goalJourney(goal, plan, count(goal.id))} compact />
            <div className="mt-3"><Progress permille={plan.progressPermille} label={goal.name} /></div>
            <p className="mt-1 text-right text-xs text-ink-muted" data-testid="progression">{Math.round(plan.progressPermille / 10)} %</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stat label={t.saved} value={formatCents(plan.savedCents)} />
              <Stat label={t.target} value={formatCents(goal.targetCents)} />
              <Stat label="Date souhaitée" value={formatDate(goal.targetDate)} />
              <Stat label="Atteinte estimée" value={plan.projectedCompletionDate ? formatDate(plan.projectedCompletionDate) : fr.common.toDetermine}
                hint={plan.paceSource === 'none' ? 'Indiquez une capacité mensuelle' : plan.paceSource === 'declared' ? `Au rythme de ${formatCents(goal.monthlyCapacityCents ?? 0)} / mois` : 'Rythme observé sur 3 mois'} />
            </div>
            <Link href={`/goals/${goal.id}`} className="mt-4 inline-block rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary-800 hover:bg-mist" data-testid="lien-projet">
              Ouvrir le projet
            </Link>
          </Card>
        ))}
      </div>

      {religious && !isDemoMode ? (
        <Card className="mt-4">
          <CardTitle>Préparer mon Aïd</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">Sacrifice ou quote-part, frais, contributions familiales, date : un projet par année civile, reconductible chaque année.</p>
          <Link href="/goals/aid" className="inline-block rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory hover:bg-primary-700" data-testid="lien-preparer-aid">Préparer mon Aïd</Link>
        </Card>
      ) : null}

      {!isDemoMode ? (
        <Card className="mt-4">
          <CardTitle>Nouveau projet</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">Étape 1 sur 5 : créer. Vous planifierez, simulerez et suivrez ensuite depuis la fiche du projet.</p>
          <ActionForm action={createGoal} submitLabel="Créer l’objectif" testId="form-objectif" className="grid gap-3 sm:grid-cols-2">
            <FormStep step={1} total={3} title="Le projet">
              <SelectField label="Catégorie" name="kind" defaultValue="" required>
                <option value="" disabled>Choisir…</option>
                {kinds.map((k) => <option key={k} value={k}>{t.kind[k]}{isReligiousGoal(k) ? ' (privé)' : ''}</option>)}
              </SelectField>
              <Field label="Nom du projet (facultatif)" name="name" maxLength={120} hint="Par défaut : le nom de la catégorie." />
            </FormStep>
            <FormStep step={2} total={3} title="Montant et échéance">
              <Field label="Montant cible (€)" name="target" inputMode="decimal" required hint="Estimation du budget total." />
              <Field label="Date souhaitée" name="targetDate" type="date" required defaultValue={addMonths(s.asOf, 24)} />
            </FormStep>
            <FormStep step={3} total={3} title="Épargne">
              <Field label="Épargne déjà disponible (€)" name="available" inputMode="decimal" defaultValue="0" />
              <Field label="Capacité d’épargne mensuelle (€)" name="monthlyCapacity" inputMode="decimal" required />
            </FormStep>
          </ActionForm>
        </Card>
      ) : null}

      {!isDemoMode && !religious ? (
        <div className="mt-4" data-testid="projets-religieux-fermes">
          <ReligiousGate feature="Projets Hajj, Omra et Aïd al-Adha" next="/goals" />
        </div>
      ) : null}
    </>
  );
}
