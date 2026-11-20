import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup, SelectField } from '@/components/forms/fields';
import { JourneySteps } from '@/components/finance/journey';
import { getHouseholdData, getSnapshot, todayInBrussels } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate } from '@/lib/format';
import { amountToCents } from '@/lib/validation';
import { describeGoalChange } from '@/lib/goal-changes';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { loadEidPlans, loadGoalChanges, type GoalChangeRow } from '@/lib/supabase/goals';
import { centsToInput, eidPlanFrom, type EidPlanRow } from '@/lib/eid-view';
import { DEMO_AID_PLAN } from '@/lib/demo-eid';
import { updateEidBudget, updateEidDate } from '../aid/actions';
import { allocationHistory, eidBudget, eidDateLabel, goalJourney, isReligiousGoal, renewalCheck, simulateGoalPace } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { allocateToGoal, setGoalLifecycle, updateGoal } from '../../actions';

export const metadata: Metadata = { title: 'Projet' };

const tone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;

function parseMonthly(raw: string | undefined): number | null {
  if (!raw) return null;
  try { const c = amountToCents(raw); return c >= 0 && c <= 100_000_000 ? c : null; } catch { return null; }
}

function EidSection({ row, goalDate, realized, plans, editable }: { row: EidPlanRow; goalDate: string; realized: boolean; plans: EidPlanRow[]; editable: boolean }) {
  const plan = eidPlanFrom(row, goalDate);
  const b = eidBudget(plan.budget);
  const label = eidDateLabel(plan);
  const renewal = renewalCheck(plan, realized, plans.map((p) => ({ goalId: p.goal_id, civilYear: p.civil_year, ...(p.previous_goal_id ? { previousGoalId: p.previous_goal_id } : {}) })));
  const next = plans.find((p) => p.previous_goal_id === row.goal_id);
  const blocked = { not_realized: 'Disponible après la réalisation de cet Aïd.', already_renewed: 'Cet Aïd a déjà été reconduit.', next_year_exists: `Un projet Aïd existe déjà pour ${plan.civilYear + 1}.` } as const;
  return (
    <Card className="mt-4">
      <CardTitle>Aïd al-Adha — année civile {plan.civilYear}</CardTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <div data-testid="budget-aid">
          <p className="mb-2 text-sm font-semibold text-primary-900">Budget</p>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-ink-muted">Sacrifice ou quote-part</dt><dd className="tabular text-right">{formatCents(plan.budget.sacrificeCents)}</dd>
            <dt className="text-ink-muted">Frais complémentaires</dt><dd className="tabular text-right">{formatCents(plan.budget.extraCostsCents)}</dd>
            <dt className="text-ink-muted">Contribution à un organisme</dt><dd className="tabular text-right">{formatCents(plan.budget.organizationCents)}</dd>
            <dt className="font-medium">Coût total</dt><dd className="tabular text-right font-medium">{formatCents(b.totalCostCents)}</dd>
            <dt className="text-ink-muted">Contributions familiales</dt><dd className="tabular text-right">− {formatCents(b.familyShareCents)}</dd>
            <dt className="font-semibold">À mettre de côté</dt><dd className="tabular text-right font-semibold">{formatCents(b.toSaveCents)}</dd>
          </dl>
        </div>
        <div data-testid="date-aid">
          <p className="mb-2 text-sm font-semibold text-primary-900">Date</p>
          <p className="text-sm">Date retenue : <strong>{formatDate(goalDate)}</strong></p>
          <p className="mt-1"><Badge tone={label === 'confirmed_by_user' ? 'positive' : 'warning'}>{label === 'confirmed_by_user' ? `Confirmée par vous — source : ${plan.dateSource}` : 'Saisie, non confirmée'}</Badge></p>
          {plan.estimatedDate ? <p className="mt-2 text-xs text-ink-muted">Estimation indicative au moment de la saisie (calendrier tabulaire, non officielle) : {formatDate(plan.estimatedDate)}.</p> : null}
        </div>
      </div>
      {editable ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Modifier ou confirmer la date</summary>
            <ActionForm action={updateEidDate} submitLabel="Enregistrer la date" testId="form-aid-date" className="mt-3">
              <input type="hidden" name="goalId" value={row.goal_id} />
              <Field label="Date de l’Aïd retenue" name="targetDate" type="date" min={`${plan.civilYear}-01-01`} max={`${plan.civilYear}-12-31`} defaultValue={goalDate} required />
              <RadioGroup name="dateStatus" legend="Cette date est-elle confirmée ?" defaultValue={plan.dateStatus} options={[
                { value: 'entered', label: 'Non, à confirmer plus tard' }, { value: 'confirmed', label: 'Oui, confirmée par une source que j’indique' }]} />
              <Field label="Source de la date (si confirmée)" name="dateSource" maxLength={200} defaultValue={plan.dateSource ?? ''} />
            </ActionForm>
          </details>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer text-sm font-medium">Modifier le budget</summary>
            <ActionForm action={updateEidBudget} submitLabel="Enregistrer le budget" testId="form-aid-budget" className="mt-3 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="goalId" value={row.goal_id} />
              <Field label="Sacrifice ou quote-part (€)" name="sacrifice" inputMode="decimal" defaultValue={centsToInput(plan.budget.sacrificeCents)} />
              <Field label="Frais complémentaires (€)" name="extras" inputMode="decimal" defaultValue={centsToInput(plan.budget.extraCostsCents)} />
              <Field label="Contribution à un organisme (€)" name="organization" inputMode="decimal" defaultValue={centsToInput(plan.budget.organizationCents)} />
              <Field label="Contributions familiales annoncées (€)" name="family" inputMode="decimal" defaultValue={centsToInput(plan.budget.familyContributionCents)} />
            </ActionForm>
          </details>
        </div>
      ) : null}
      <div className="mt-4 border-t border-line pt-3 text-sm" data-testid="reconduction-aid">
        <p className="font-medium">Année suivante</p>
        {next ? <p className="text-ink-muted">Reconduit : <Link href={`/goals/${next.goal_id}`} className="text-primary-800 underline">Aïd {next.civil_year}</Link>.</p>
          : renewal.allowed ? (editable ? <Link href={`/goals/aid?suite=${row.goal_id}`} className="mt-1 inline-block rounded-lg bg-primary-800 px-4 py-2.5 font-medium text-ivory hover:bg-primary-700" data-testid="lien-reconduire">Préparer l’Aïd {renewal.nextCivilYear}</Link> : <p className="text-ink-muted">Reconduction possible pour {renewal.nextCivilYear}.</p>)
          : <p className="text-ink-muted">{blocked[renewal.reason]}</p>}
        <p className="mt-1 text-xs text-ink-muted">Chaque année est un projet distinct : aucun montant n’est repris ni fusionné.</p>
      </div>
    </Card>
  );
}

export default async function GoalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mensuel?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const [s, data] = await Promise.all([getSnapshot(), getHouseholdData()]);
  const entry = s.goals.find((g) => g.goal.id === id);
  if (!entry) notFound();
  const { goal, plan } = entry;
  const t = fr.goals;
  const history = allocationHistory(data.allocations, goal.id);
  const journey = goalJourney(goal, plan, history.length);
  const lifecycle = goal.lifecycle ?? 'active';
  const monthly = parseMonthly(q.mensuel);
  const sim = monthly === null ? null : simulateGoalPace(goal, data.allocations, s.asOf, monthly);
  const editable = !isDemoMode;
  let changes: GoalChangeRow[] = [];
  let eidPlans: EidPlanRow[] = goal.kind === 'eid_al_adha' && isDemoMode ? [DEMO_AID_PLAN] : [];
  if (editable) {
    const ctx = await requireOnboardedSession();
    [changes, eidPlans] = await Promise.all([loadGoalChanges(ctx, goal.id), goal.kind === 'eid_al_adha' ? loadEidPlans(ctx) : Promise.resolve([])]);
  }
  const eidRow = eidPlans.find((p) => p.goal_id === goal.id);
  const today = todayInBrussels();

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
      <PageHeader title={goal.name} subtitle={`${t.kind[goal.kind]}${isReligiousGoal(goal.kind) ? ' · projet privé (finance islamique)' : ' · projet du foyer'}`} />
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={lifecycle !== 'active' ? 'neutral' : tone[plan.status]}>{lifecycle !== 'active' ? t.lifecycle[lifecycle] : t.status[plan.status]}</Badge>
        <JourneySteps journey={journey} />
      </div>

      <Card className="mt-4">
        <Progress permille={plan.progressPermille} label={goal.name} />
        <p className="mt-1 text-right text-xs text-ink-muted">{Math.round(plan.progressPermille / 10)} %</p>
        <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="plan-projet">
          <Stat label="Disponible (mis de côté)" value={formatCents(plan.savedCents)} />
          <Stat label={t.target} value={formatCents(goal.targetCents)} hint={`Reste ${formatCents(plan.remainingCents)}`} />
          <Stat label="Capacité mensuelle" value={goal.monthlyCapacityCents === undefined ? fr.common.toDetermine : formatCents(goal.monthlyCapacityCents)} hint={`Nécessaire : ${formatCents(plan.monthlyRequiredCents)} / mois`} />
          <Stat label="Atteinte estimée" value={plan.projectedCompletionDate ? formatDate(plan.projectedCompletionDate) : fr.common.toDetermine} hint={`Souhaitée : ${formatDate(goal.targetDate)}`} />
        </div>
      </Card>

      {eidRow ? <EidSection row={eidRow} goalDate={goal.targetDate} realized={lifecycle === 'achieved'} plans={eidPlans} editable={editable} /> : null}

      <Card className="mt-4">
        <CardTitle>2. Planifier</CardTitle>
        {editable ? (
          <ActionForm action={updateGoal} submitLabel="Enregistrer le plan" testId="form-planifier" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={goal.id} />
            <Field label="Nom du projet" name="name" defaultValue={goal.name} maxLength={120} required />
            <Field label="Montant cible (€)" name="target" inputMode="decimal" defaultValue={(goal.targetCents / 100).toFixed(2).replace('.', ',')} required />
            <Field label="Date souhaitée" name="targetDate" type="date" defaultValue={goal.targetDate} required />
            <Field label="Capacité d’épargne mensuelle (€)" name="monthlyCapacity" inputMode="decimal" defaultValue={goal.monthlyCapacityCents === undefined ? '' : (goal.monthlyCapacityCents / 100).toFixed(2).replace('.', ',')} required />
            <SelectField label="Priorité" name="priority" defaultValue={String(goal.priority ?? 3)}>
              {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{p === 1 ? '1 (la plus haute)' : p === 5 ? '5 (la plus basse)' : String(p)}</option>)}
            </SelectField>
          </ActionForm>
        ) : <p className="text-sm text-ink-muted">Démonstration : modification désactivée.</p>}
        <p className="mt-2 text-xs text-ink-muted">La catégorie ne change pas. Modifier le plan ne touche jamais aux montants déjà mis de côté.</p>
      </Card>

      <Card className="mt-4">
        <CardTitle>3. Simuler</CardTitle>
        <form method="get" className="flex flex-wrap items-end gap-3" data-testid="form-simuler">
          <Field label="Et si j’épargnais par mois (€)" name="mensuel" inputMode="decimal" defaultValue={q.mensuel ?? ''} />
          <button type="submit" className="rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium hover:bg-mist">Simuler</button>
        </form>
        {q.mensuel !== undefined && sim === null ? <p role="alert" className="mt-2 text-sm text-critical">Montant illisible (exemple : 150,00).</p> : null}
        {sim ? (
          <div className="mt-3 rounded-lg bg-mist p-3 text-sm" data-testid="resultat-simulation">
            <p>À {formatCents(monthly!)} par mois : {sim.projectedCompletionDate ? <>atteinte estimée le <strong>{formatDate(sim.projectedCompletionDate)}</strong> ({sim.projectedMonthsAtCurrentPace} mois)</> : 'aucune date estimable (rythme nul).'}</p>
            <p className="text-ink-muted">{sim.status === 'on_track' || sim.status === 'achieved' ? 'Compatible avec la date souhaitée.' : sim.status === 'behind' ? `Insuffisant pour la date souhaitée : il faudrait ${formatCents(sim.monthlyRequiredCents)} par mois.` : sim.status === 'overdue' ? 'La date souhaitée est dépassée.' : ''} Simulation seulement : rien n’est enregistré.</p>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4">
        <CardTitle>4. Suivre</CardTitle>
        {editable && lifecycle === 'active' ? (
          <ActionForm action={allocateToGoal} submitLabel="Valider" testId="form-allocation" className="mb-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="goalId" value={goal.id} />
            <SelectField label="Mouvement" name="direction" defaultValue="add">
              <option value="add">Mettre de côté pour ce projet</option>
              <option value="remove">Retirer de ce projet</option>
            </SelectField>
            <Field label="Montant (€)" name="amount" inputMode="decimal" required />
          </ActionForm>
        ) : null}
        <p className="mb-2 text-xs text-ink-muted">Une mise de côté est virtuelle : l’argent reste sur vos comptes, ce n’est ni une dépense ni un virement.</p>
        {history.length === 0 ? <p className="text-sm text-ink-muted">Aucune affectation.</p> : (
          <table className="w-full text-sm" data-testid="historique-affectations">
            <caption className="sr-only">Historique des affectations</caption>
            <thead className="text-left text-ink-muted"><tr><th scope="col" className="pb-1 font-normal">Date</th><th scope="col" className="pb-1 text-right font-normal">Mouvement</th><th scope="col" className="pb-1 text-right font-normal">Total</th></tr></thead>
            <tbody className="divide-y divide-line">
              {[...history].reverse().map((h, i) => (
                <tr key={`${h.allocatedOn}-${i}`}><td className="py-1.5">{formatDate(h.allocatedOn)}</td><td className="tabular py-1.5 text-right">{h.amountCents > 0 ? '+' : '−'} {formatCents(Math.abs(h.amountCents))}</td><td className="tabular py-1.5 text-right">{formatCents(h.balanceCents)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>5. Réaliser</CardTitle>
        {!editable ? <p className="text-sm text-ink-muted">Démonstration : actions désactivées.</p> : lifecycle === 'active' ? (
          <div className="flex flex-wrap items-end gap-3">
            <ActionForm action={setGoalLifecycle} submitLabel="Marquer comme réalisé" testId="form-realiser" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={goal.id} />
              <input type="hidden" name="action" value="achieve" />
              <Field label="Date de réalisation" name="realizedOn" type="date" max={today} defaultValue={today} />
            </ActionForm>
            <ActionForm action={setGoalLifecycle} submitLabel="Mettre en pause" variant="quiet"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="action" value="pause" /></ActionForm>
            <ActionForm action={setGoalLifecycle} submitLabel="Archiver" variant="quiet"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="action" value="archive" /></ActionForm>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">{lifecycle === 'achieved' ? `Réalisé le ${formatDate(goal.realizedOn ?? today)}.` : 'Projet en pause : il ne compte pas dans la planification.'}</p>
            <ActionForm action={setGoalLifecycle} submitLabel={lifecycle === 'achieved' ? 'Rouvrir le projet' : 'Reprendre le projet'} variant="quiet" testId="form-rouvrir">
              <input type="hidden" name="id" value={goal.id} /><input type="hidden" name="action" value={lifecycle === 'achieved' ? 'reopen' : 'resume'} />
            </ActionForm>
          </div>
        )}
      </Card>

      {editable ? (
        <Card className="mt-4">
          <CardTitle>Historique des modifications</CardTitle>
          {changes.length === 0 ? <p className="text-sm text-ink-muted">Aucune modification depuis la création.</p> : (
            <ul className="divide-y divide-line text-sm" data-testid="historique-modifications">
              {changes.map((c) => (
                <li key={c.id} className="py-2"><p className="text-ink-muted">{formatDate(c.changed_at.slice(0, 10))}</p>
                  <ul className="list-disc pl-5">{describeGoalChange(c.changes, formatCents).map((l) => <li key={l}>{l}</li>)}</ul></li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      <Notice className="mt-4">{t.virtualNotice}</Notice>
    </>
  );
}
