import type { Metadata } from 'next';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { religiousAccess } from '@/lib/supabase/session';
import { ReligiousGate } from '@/components/religious-gate';
import { formatCents, formatDate } from '@/lib/format';
import { interpolate } from '@/lib/i18n';
import { addMonths } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { allocateToGoal, createHajjGoal } from '../actions';

export const metadata: Metadata = { title: fr.goals.title };

const tone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;
const paceLabel = { declared: 'Capacité mensuelle déclarée', observed: 'Rythme observé sur 3 mois', none: 'Rythme' } as const;

export default async function GoalsPage() {
  const { enabled: religious } = await religiousAccess();
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
            <p className="mt-1 text-right text-xs text-ink-muted" data-testid="progression">{Math.round(plan.progressPermille / 10)} %</p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Stat label={t.saved} value={formatCents(plan.savedCents)} />
              <Stat label={t.target} value={formatCents(goal.targetCents)} />
              <Stat label={t.monthly} value={formatCents(plan.monthlyRequiredCents)} />
              <Stat label={t.deadline} value={formatDate(goal.targetDate)} hint={interpolate(t.months, { count: plan.monthsLeft })} />
              {goal.monthlyCapacityCents !== undefined ? <Stat label={paceLabel.declared} value={formatCents(goal.monthlyCapacityCents)} /> : null}
              <Stat label="Atteinte estimée" value={plan.projectedCompletionDate ? formatDate(plan.projectedCompletionDate) : fr.common.toDetermine}
                hint={plan.paceSource === 'none' ? 'Indiquez une capacité mensuelle' : paceLabel[plan.paceSource]} />
            </div>
            {!isDemoMode ? (
              <details className="mt-4 rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">Affecter ou retirer un montant</summary>
                <ActionForm action={allocateToGoal} submitLabel="Valider" className="mt-3" testId="form-allocation">
                  <input type="hidden" name="goalId" value={goal.id} />
                  <SelectField label="Mouvement" name="direction" defaultValue="add">
                    <option value="add">Affecter à l’objectif</option>
                    <option value="remove">Retirer de l’objectif</option>
                  </SelectField>
                  <Field label="Montant (€)" name="amount" inputMode="decimal" required />
                </ActionForm>
              </details>
            ) : null}
          </Card>
        ))}
      </div>

      {!isDemoMode && !religious ? <div className="mt-4"><ReligiousGate feature="Objectif Hajj" next="/goals" /></div> : null}
      {!isDemoMode && religious ? (
        <Card className="mt-4">
          <CardTitle>Nouvel objectif Hajj</CardTitle>
          <p className="mb-3 text-xs text-ink-muted">Objectif personnel : privé dans un foyer partagé, sauf si vous choisissez de partager vos données de finance islamique.</p>
          <ActionForm action={createHajjGoal} submitLabel="Créer l’objectif" testId="form-hajj" className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom de l’objectif" name="name" defaultValue="Hajj" required maxLength={120} />
            <Field label="Montant cible (€)" name="target" inputMode="decimal" required hint="Estimation de votre budget total." />
            <Field label="Épargne déjà disponible (€)" name="available" inputMode="decimal" defaultValue="0" />
            <Field label="Date souhaitée" name="targetDate" type="date" required defaultValue={addMonths(s.asOf, 24)} />
            <Field label="Capacité d’épargne mensuelle (€)" name="monthlyCapacity" inputMode="decimal" required />
          </ActionForm>
        </Card>
      ) : null}
    </>
  );
}
