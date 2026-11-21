import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup, SelectField } from '@/components/forms/fields';
import { JourneyPanel } from '@/components/finance/journey';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { formatCents, formatDate } from '@/lib/format';
import { amountToCents } from '@/lib/validation';
import { describeGoalChange } from '@/lib/goal-changes';
import { readGoalRepository } from '@/lib/goals';
import { centsToInput, eidPlanFrom, type EidPlanRow } from '@/lib/eid-view';
import { updateEidBudget, updateEidDate } from '../aid/actions';
import {
  allocationHistory, capacityForGoal, compareScenarios, defaultScenarioMonthlies, eidBudget, eidDateLabel, goalJourney, isReligiousGoal, renewalCheck,
} from '@amanah/engines';
import { fr } from '@/messages/fr';
import { allocateToGoal, chooseStrategy, setGoalLifecycle, updateGoal } from '../../actions';

export const metadata: Metadata = { title: 'Projet' };

const tone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;
const SOURCE = { declared: 'déclarée par vous', estimated: 'estimée d’après vos opérations', unknown: 'inconnue' } as const;
type ScenarioQuery = { s1?: string; s2?: string; s3?: string; cree?: string };

/** Mensualités saisies pour la comparaison (3 au plus) ; illisibles = ignorées et signalées. */
function parseScenarios(q: ScenarioQuery): { values: number[]; invalid: boolean } {
  const raw = [q.s1, q.s2, q.s3].filter((v): v is string => v !== undefined && v.trim() !== '');
  const values: number[] = [];
  let invalid = false;
  for (const r of raw) {
    try { const c = amountToCents(r); if (c >= 0 && c <= 100_000_000) values.push(c); else invalid = true; } catch { invalid = true; }
  }
  return { values, invalid };
}
const months = (n: number) => `${n} mois`;

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
      <p className="-mt-1 mb-3 text-xs text-ink-muted">Définir ses dépenses, ajuster le budget, simuler les mensualités, suivre, réaliser, puis préparer l’année suivante.</p>
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
          {/* Source saisie par la personne : texte libre, renvoyé à la ligne (jamais dans un badge, qui ne se coupe pas sur mobile) */}
          <p className="mt-1 break-words text-sm">
            <Badge tone={label === 'confirmed_by_user' ? 'positive' : 'warning'}>{label === 'confirmed_by_user' ? 'Confirmée par vous' : 'Saisie, non confirmée'}</Badge>
            {label === 'confirmed_by_user' ? <span className="ml-1"> — source : {plan.dateSource}</span> : null}
          </p>
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

export default async function GoalPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ScenarioQuery> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const [s, data, repo] = await Promise.all([getSnapshot(), getHouseholdData(), readGoalRepository()]);
  const entry = s.goals.find((g) => g.goal.id === id);
  if (!entry) notFound();
  const { goal, plan } = entry;
  const t = fr.goals;
  const history = allocationHistory(data.allocations, goal.id);
  const journey = goalJourney(goal, plan, data.allocations);
  const lifecycle = goal.lifecycle ?? 'active';
  const active = lifecycle === 'active';
  const [changes, eidPlans] = await Promise.all([repo.history(goal.id), goal.kind === 'eid_al_adha' ? repo.eidPlans() : Promise.resolve([] as EidPlanRow[])]);
  const eidRow = eidPlans.find((p) => p.goal_id === goal.id);
  const today = repo.today();

  // Simuler : capacité vue de ce projet (jamais comptée deux fois) et scénarios comparés
  const cap = capacityForGoal(s.savingsPlan, goal.id);
  const asked = parseScenarios(q);
  const monthlies = asked.values.length ? asked.values : defaultScenarioMonthlies(plan.monthlyRequiredCents);
  const comparison = compareScenarios(goal, data.allocations, s.asOf, monthlies, cap.availableCents);
  const maxMonths = Math.max(1, plan.monthsLeft, ...comparison.scenarios.map((x) => x.months ?? 0));
  const virtualTotal = s.goals.filter((g) => g.goal.lifecycle !== 'archived').reduce((x, g) => x + g.plan.savedCents, 0);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
      <PageHeader title={goal.name} subtitle={`${t.kind[goal.kind]}${isReligiousGoal(goal.kind) ? ' · projet privé (finance islamique)' : ' · projet du foyer'}`} />
      {q.cree ? <p role="status" className="mb-3 rounded-lg bg-primary-50 p-3 text-sm text-primary-900" data-testid="projet-cree">Projet créé. Il apparaît dans vos projets, votre plan d’épargne et votre tableau de bord. Prochaine étape : {journey.next ? t.action[journey.next.action].toLowerCase() : 'aucune'}.</p> : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone={!active ? 'neutral' : tone[plan.status]}>{!active ? t.lifecycle[lifecycle] : t.status[plan.status]}</Badge>
        {goal.priority ? <Badge>Priorité {goal.priority}</Badge> : null}
      </div>
      <JourneyPanel goalId={goal.id} journey={journey} />

      <Card className="mt-4">
        <span id="projet" />
        <Progress permille={plan.progressPermille} label={goal.name} />
        <p className="mt-1 text-right text-xs text-ink-muted">{Math.round(plan.progressPermille / 10)} %</p>
        <div className="mt-2 grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="plan-projet">
          <Stat label={t.target} value={formatCents(goal.targetCents)} />
          <Stat label="Disponible (mis de côté)" value={formatCents(plan.savedCents)} hint="Épargne virtuelle" />
          <Stat label="Reste à financer" value={formatCents(plan.remainingCents)} />
          <Stat label="Date souhaitée" value={formatDate(goal.targetDate)} hint={plan.monthsLeft > 0 ? `dans ${months(plan.monthsLeft)}` : 'échéance passée'} />
          <Stat label="Effort mensuel nécessaire" value={formatCents(plan.monthlyRequiredCents)} />
          <Stat label="Mensualité prévue" value={goal.monthlyCapacityCents === undefined ? fr.common.toDetermine : formatCents(goal.monthlyCapacityCents)} hint={goal.strategy ? `Stratégie retenue le ${formatDate(goal.strategy.chosenOn)}` : undefined} />
          <Stat label="Capacité encore libre" value={cap.availableCents === null ? fr.common.toDetermine : formatCents(cap.availableCents)} hint="après vos autres projets" />
          <Stat label="Atteinte estimée" value={plan.projectedCompletionDate ? formatDate(plan.projectedCompletionDate) : fr.common.toDetermine} />
        </div>
      </Card>

      {eidRow ? <EidSection row={eidRow} goalDate={goal.targetDate} realized={lifecycle === 'achieved'} plans={eidPlans} editable /> : null}

      <Card className="mt-4">
        <span id="planifier" className="block scroll-mt-20" />
        <CardTitle>2. Planifier {journey.done.plan ? <Badge tone="positive">Plan validé le {formatDate(goal.planConfirmedOn!)}</Badge> : null}</CardTitle>
        <p className="-mt-1 mb-3 text-sm text-ink-muted">{t.stepHelp.plan} Ajustez si besoin, puis validez : c’est votre engagement, pas un calcul automatique.</p>
        {active ? (
          <ActionForm action={updateGoal} submitLabel={journey.done.plan ? 'Mettre à jour et valider mon plan' : 'Valider mon plan'} testId="form-planifier" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={goal.id} />
            <input type="hidden" name="confirm" value="yes" />
            <Field label="Nom du projet" name="name" defaultValue={goal.name} maxLength={120} required />
            {goal.kind === 'eid_al_adha'
              ? <><input type="hidden" name="target" value={centsToInput(goal.targetCents)} /><p className="self-end text-sm text-ink-muted">Montant cible : {formatCents(goal.targetCents)} (calculé depuis le budget de l’Aïd).</p></>
              : <Field label="Montant cible (€)" name="target" inputMode="decimal" defaultValue={centsToInput(goal.targetCents)} required />}
            {goal.kind === 'eid_al_adha'
              ? <input type="hidden" name="targetDate" value={goal.targetDate} />
              : <Field label="Date souhaitée" name="targetDate" type="date" defaultValue={goal.targetDate} required />}
            <Field label="Mensualité prévue (€)" name="monthlyCapacity" inputMode="decimal" defaultValue={goal.monthlyCapacityCents === undefined ? '' : centsToInput(goal.monthlyCapacityCents)} required
              hint={`Nécessaire pour tenir la date : ${formatCents(plan.monthlyRequiredCents)} par mois.`} />
            <SelectField label="Priorité" name="priority" defaultValue={String(goal.priority ?? 3)}>
              {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>{p === 1 ? '1 (la plus haute)' : p === 5 ? '5 (la plus basse)' : String(p)}</option>)}
            </SelectField>
          </ActionForm>
        ) : <p className="text-sm text-ink-muted">Projet {t.lifecycle[lifecycle].toLowerCase()} : reprenez-le pour modifier son plan.</p>}
        <p className="mt-2 text-xs text-ink-muted">La catégorie ne change pas. Modifier le plan ne touche jamais aux montants déjà mis de côté. <Link href="/budget/plan-epargne" className="underline">Voir la répartition entre tous mes projets</Link>.</p>
      </Card>

      <Card className="mt-4">
        <span id="simuler" className="block scroll-mt-20" />
        <CardTitle>3. Simuler {journey.done.simulate ? <Badge tone="positive">Stratégie : {formatCents(goal.strategy!.monthlyCents)} / mois</Badge> : null}</CardTitle>
        <p className="-mt-1 mb-3 text-sm text-ink-muted">{t.stepHelp.simulate} Une simulation n’est jamais une économie réalisée.</p>
        <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-mist p-3 text-sm md:grid-cols-3" data-testid="capacite-projet">
          <div><dt className="text-ink-muted">Capacité d’épargne</dt><dd className="font-medium">{cap.capacityCents === null ? fr.common.toDetermine : formatCents(cap.capacityCents)} <span className="text-xs font-normal text-ink-muted">({SOURCE[cap.capacitySource]})</span></dd></div>
          <div><dt className="text-ink-muted">Capacité estimée (analyse)</dt><dd className="font-medium">{s.analysis.capacity.estimatedCents === null ? fr.common.toDetermine : formatCents(s.analysis.capacity.estimatedCents)}</dd></div>
          <div><dt className="text-ink-muted">Déjà engagée par vos autres projets</dt><dd className="font-medium">{formatCents(cap.engagedByOthersCents)}</dd></div>
          <div><dt className="text-ink-muted">Disponible pour ce projet</dt><dd className="font-medium">{cap.availableCents === null ? fr.common.toDetermine : formatCents(cap.availableCents)}</dd></div>
          <div><dt className="text-ink-muted">Épargne virtuelle de ce projet</dt><dd className="font-medium">{formatCents(plan.savedCents)}</dd></div>
          <div><dt className="text-ink-muted">Argent réellement détenu (comptes)</dt><dd className="font-medium">{formatCents(s.totalBalanceCents)} <span className="text-xs font-normal text-ink-muted">dont {formatCents(virtualTotal)} affectés virtuellement</span></dd></div>
        </dl>
        <form method="get" action={`/goals/${goal.id}#simuler`} className="flex flex-wrap items-end gap-3" data-testid="form-simuler">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-28"><Field label={`Scénario ${i + 1} (€/mois)`} name={`s${i + 1}`} inputMode="decimal" defaultValue={monthlies[i] !== undefined ? centsToInput(monthlies[i]!) : ''} /></div>
          ))}
          <button type="submit" className="rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium hover:bg-mist">Comparer</button>
        </form>
        {asked.invalid ? <p role="alert" className="mt-2 text-sm text-critical">Un montant est illisible (exemple : 150,00) : il a été ignoré.</p> : null}
        {comparison.scenarios.length === 0 ? <p className="mt-3 text-sm text-ink-muted">Rien à financer : la cible est déjà atteinte.</p> : (
          <ul className="mt-4 space-y-3" data-testid="resultat-simulation">
            {comparison.scenarios.map((x) => (
              <li key={x.monthlyCents} className="rounded-lg border border-line p-3" data-testid="scenario">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{formatCents(x.monthlyCents)} par mois</p>
                  <p className="text-sm">{x.completionDate ? <>Atteinte le <strong>{formatDate(x.completionDate)}</strong> ({months(x.months!)})</> : 'Aucune date estimable (mensualité nulle)'}</p>
                </div>
                {x.months !== null ? (
                  <div aria-hidden="true" className="relative mt-2 h-2 rounded-full bg-mist">
                    <div className={`h-2 rounded-full ${x.meetsDeadline ? 'bg-primary-700' : 'bg-warning'}`} style={{ width: `${Math.min(100, Math.round((x.months / maxMonths) * 100))}%` }} />
                    <div className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${Math.min(100, Math.round((Math.max(0, plan.monthsLeft) / maxMonths) * 100))}%` }} title="Échéance souhaitée" />
                  </div>
                ) : null}
                <p className="mt-2 text-sm text-ink-muted">
                  {x.gapMonths === null ? '' : x.gapMonths < 0 ? `${months(-x.gapMonths)} d’avance sur l’échéance. ` : x.gapMonths === 0 ? 'Pile à l’échéance. ' : `${months(x.gapMonths)} de retard sur l’échéance. `}
                  {x.exceedsAvailable === null ? 'Capacité d’épargne inconnue : compatibilité non vérifiable.' : x.exceedsAvailable ? `Dépasse la capacité encore libre (${formatCents(cap.availableCents ?? 0)}) : il faudrait réduire un autre projet.` : 'Compatible avec votre capacité encore libre.'}
                </p>
                {active ? (
                  <ActionForm action={chooseStrategy} submitLabel={goal.strategy?.monthlyCents === x.monthlyCents ? 'Stratégie retenue ✓' : 'Retenir ce scénario'} variant="quiet" testId="retenir-scenario" className="mt-2">
                    <input type="hidden" name="goalId" value={goal.id} />
                    <input type="hidden" name="monthly" value={x.monthlyCents} />
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-muted">Repère vertical : échéance souhaitée. Simulation seulement : rien n’est enregistré tant que vous ne retenez pas un scénario.</p>
      </Card>

      <Card className="mt-4">
        <span id="suivre" className="block scroll-mt-20" />
        <CardTitle>4. Suivre</CardTitle>
        {active ? (
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
        <span id="realiser" className="block scroll-mt-20" />
        <CardTitle>5. Réaliser</CardTitle>
        {active ? (
          <>
            {journey.readyToRealize ? <Notice className="mb-3">Cible atteinte : vous pouvez déclarer le projet réalisé.</Notice> : <p className="mb-3 text-sm text-ink-muted">{t.stepHelp.realize} Vous pouvez aussi le déclarer réalisé avant d’atteindre la cible, si le projet s’est concrétisé autrement.</p>}
            <div className="flex flex-wrap items-end gap-3">
              <ActionForm action={setGoalLifecycle} submitLabel="Marquer comme réalisé" testId="form-realiser" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="id" value={goal.id} />
                <input type="hidden" name="action" value="achieve" />
                <Field label="Date de réalisation" name="realizedOn" type="date" max={today} defaultValue={today} />
              </ActionForm>
              <ActionForm action={setGoalLifecycle} submitLabel="Mettre en pause" variant="quiet" testId="form-pause"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="action" value="pause" /></ActionForm>
              <ActionForm action={setGoalLifecycle} submitLabel="Archiver" variant="quiet" testId="form-archiver"><input type="hidden" name="id" value={goal.id} /><input type="hidden" name="action" value="archive" /></ActionForm>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm" data-testid="etat-projet">{lifecycle === 'achieved' ? `Réalisé le ${formatDate(goal.realizedOn ?? today)}.` : lifecycle === 'archived' ? 'Projet archivé : il ne compte plus dans la planification ; son historique est conservé.' : 'Projet en pause : il ne compte pas dans la planification.'}</p>
            <ActionForm action={setGoalLifecycle} submitLabel={lifecycle === 'achieved' ? 'Rouvrir le projet' : lifecycle === 'archived' ? 'Restaurer le projet' : 'Reprendre le projet'} variant="quiet" testId="form-rouvrir">
              <input type="hidden" name="id" value={goal.id} /><input type="hidden" name="action" value={lifecycle === 'achieved' ? 'reopen' : 'resume'} />
            </ActionForm>
          </div>
        )}
        {lifecycle === 'achieved' || journey.readyToRealize ? (
          <p className="mt-3 text-sm"><Link href={`/goals/${goal.id}/solutions`} className="font-medium text-primary-800 underline" data-testid="lien-solutions">{t.action.explore_solutions} →</Link></p>
        ) : null}
      </Card>

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
      <Notice className="mt-4">{t.virtualNotice}</Notice>
    </>
  );
}
