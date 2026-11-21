/**
 * Plan d'épargne des projets (Sprint 5, lot 5.3).
 *
 * - Une mise de côté vers un projet est VIRTUELLE : ce n'est ni une dépense, ni un virement.
 *   Le plan ne modifie donc jamais l'analyse des dépenses ; il répartit une capacité.
 * - Répartition globale sans double allocation (même principe que allocateShortfalls,
 *   Sprint 3) : les projets sont servis par priorité puis par échéance, et la somme
 *   financée ne dépasse jamais la capacité.
 * - Capacité : celle déclarée par le foyer si elle existe, sinon l'estimation de l'analyse ;
 *   inconnue sinon (le plan est alors montré sans conclusion sur l'équilibre).
 */
import type { Cents } from './money.ts';
import type { IsoDate } from './dates.ts';
import { isPlannable, simulateGoalPace, type Goal, type GoalAllocation, type GoalPlan } from './goals.ts';

export interface SavingsPlanLine {
  goalId: string;
  priority: number;
  /** Montant mensuel prévu par l'utilisateur pour ce projet. */
  plannedCents: Cents;
  /** Part réellement couverte par la capacité, après les projets prioritaires. */
  fundedCents: Cents;
  /** Mensualité nécessaire pour tenir la date souhaitée. */
  requiredCents: Cents;
  targetDate: IsoDate;
  /** Atteinte estimée au montant prévu, puis au montant couvert (null si rythme nul). */
  plannedDate: IsoDate | null;
  fundedDate: IsoDate | null;
  /** Mois de retard par rapport à la date souhaitée, au montant couvert (0 = à l'heure, null = non estimable). */
  delayMonths: number | null;
  status: 'on_track' | 'late' | 'underfunded' | 'unplanned';
}

export interface SavingsPlan {
  capacityCents: Cents | null;
  capacitySource: 'declared' | 'estimated' | 'unknown';
  /** Somme des montants mensuels prévus. */
  assignedCents: Cents;
  /** Capacité restant libre (négative si le plan dépasse la capacité), null si capacité inconnue. */
  freeCents: Cents | null;
  /** Dépassement de capacité (0 si équilibré). */
  overcommittedCents: Cents;
  lines: SavingsPlanLine[];
  imbalance: { overcommitted: boolean; lateGoals: number; underfundedGoals: number };
}

export function buildSavingsPlan(input: {
  asOf: IsoDate;
  estimatedCapacityCents: Cents | null;
  declaredCapacityCents: Cents | null;
  goals: ReadonlyArray<{ goal: Goal; plan: GoalPlan }>;
  allocations: readonly GoalAllocation[];
}): SavingsPlan {
  const capacity = input.declaredCapacityCents ?? input.estimatedCapacityCents;
  const source: SavingsPlan['capacitySource'] = input.declaredCapacityCents !== null ? 'declared' : input.estimatedCapacityCents !== null ? 'estimated' : 'unknown';
  const active = input.goals.filter(({ goal, plan }) => isPlannable(goal) && plan.remainingCents > 0)
    .sort((a, b) => (a.goal.priority ?? 3) - (b.goal.priority ?? 3)
      || (a.goal.targetDate < b.goal.targetDate ? -1 : a.goal.targetDate > b.goal.targetDate ? 1 : 0)
      || (a.goal.id < b.goal.id ? -1 : 1));
  let left = capacity === null ? Number.POSITIVE_INFINITY : Math.max(0, capacity);
  const lines = active.map(({ goal, plan }): SavingsPlanLine => {
    const planned = goal.monthlyCapacityCents ?? 0;
    const funded = Math.min(planned, left);
    if (Number.isFinite(left)) left -= funded;
    const atPlanned = simulateGoalPace(goal, input.allocations, input.asOf, planned);
    const atFunded = funded === planned ? atPlanned : simulateGoalPace(goal, input.allocations, input.asOf, funded);
    const delay = atFunded.projectedMonthsAtCurrentPace === null ? null : Math.max(0, atFunded.projectedMonthsAtCurrentPace - Math.max(0, plan.monthsLeft));
    const status: SavingsPlanLine['status'] = planned === 0 ? 'unplanned' : funded < planned ? 'underfunded' : delay !== null && delay > 0 ? 'late' : 'on_track';
    return {
      goalId: goal.id, priority: goal.priority ?? 3, plannedCents: planned, fundedCents: funded, requiredCents: plan.monthlyRequiredCents,
      targetDate: goal.targetDate, plannedDate: atPlanned.projectedCompletionDate, fundedDate: atFunded.projectedCompletionDate,
      delayMonths: delay, status,
    };
  });
  const assigned = lines.reduce((s, l) => s + l.plannedCents, 0);
  const free = capacity === null ? null : capacity - assigned;
  const over = free !== null && free < 0 ? -free : 0;
  return {
    capacityCents: capacity, capacitySource: source, assignedCents: assigned, freeCents: free, overcommittedCents: over, lines,
    imbalance: { overcommitted: over > 0, lateGoals: lines.filter((l) => l.status === 'late').length, underfundedGoals: lines.filter((l) => l.status === 'underfunded').length },
  };
}

/** Capacité vue depuis un projet : ce que les AUTRES projets engagent déjà, et ce qui reste disponible. */
export interface GoalCapacity {
  capacityCents: Cents | null;
  capacitySource: SavingsPlan['capacitySource'];
  /** Mensualités prévues pour les autres projets actifs (capacité déjà engagée). */
  engagedByOthersCents: Cents;
  /** Capacité encore libre pour ce projet (0 si les autres projets dépassent déjà la capacité). */
  availableCents: Cents | null;
}

export function capacityForGoal(plan: SavingsPlan, goalId: string): GoalCapacity {
  const engaged = plan.lines.filter((l) => l.goalId !== goalId).reduce((s, l) => s + l.plannedCents, 0);
  return {
    capacityCents: plan.capacityCents, capacitySource: plan.capacitySource, engagedByOthersCents: engaged,
    availableCents: plan.capacityCents === null ? null : Math.max(0, plan.capacityCents - engaged),
  };
}
