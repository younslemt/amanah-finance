import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { JourneySteps } from '@/components/finance/journey';
import { getHouseholdData, getSnapshot, todayInBrussels } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate } from '@/lib/format';
import { amountToCents } from '@/lib/validation';
import { describeGoalChange } from '@/lib/goal-changes';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { loadGoalChanges, type GoalChangeRow } from '@/lib/supabase/goals';
import { allocationHistory, goalJourney, isReligiousGoal, simulateGoalPace } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { allocateToGoal, setGoalLifecycle, updateGoal } from '../../actions';

export const metadata: Metadata = { title: 'Projet' };

const tone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;

function parseMonthly(raw: string | undefined): number | null {
  if (!raw) return null;
  try { const c = amountToCents(raw); return c >= 0 && c <= 100_000_000 ? c : null; } catch { return null; }
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
  if (editable) changes = await loadGoalChanges(await requireOnboardedSession(), goal.id);
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
