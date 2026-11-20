import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import { addMonths, monthsBetween, type IsoDate } from './dates.ts';

export type GoalKind = 'hajj' | 'omra' | 'eid_al_adha' | 'children_education' | 'real_estate' | 'retirement' | 'family_savings' | 'emergency_fund' | 'personal';

/** Projets propres à une personne et protégés (consentement article 9). */
export const RELIGIOUS_GOAL_KINDS: readonly GoalKind[] = ['hajj', 'omra', 'eid_al_adha'];
export const GENERAL_GOAL_KINDS: readonly GoalKind[] = ['children_education', 'real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal'];
export const isReligiousGoal = (kind: GoalKind): boolean => RELIGIOUS_GOAL_KINDS.includes(kind);

/** Cycle de vie choisi par l'utilisateur (indépendant du statut calculé du plan). */
export type GoalLifecycle = 'active' | 'paused' | 'achieved' | 'archived';

export interface Goal {
  id: string;
  kind: GoalKind;
  name: string;
  targetCents: Cents;
  targetDate: IsoDate;
  /** Capacité d'épargne mensuelle déclarée par l'utilisateur (facultative). */
  monthlyCapacityCents?: number;
  /** Cycle de vie ; absent = actif. */
  lifecycle?: GoalLifecycle;
  /** Date de réalisation déclarée par l'utilisateur (« Réaliser »). */
  realizedOn?: IsoDate;
  /** Priorité 1 (la plus haute) à 5. */
  priority?: number;
}

export interface GoalAllocation {
  goalId: string;
  amountCents: Cents; // négatif = retrait de l'enveloppe virtuelle
  allocatedOn: IsoDate;
}

export interface GoalPlan {
  goalId: string;
  savedCents: Cents;
  remainingCents: Cents;
  progressPermille: number;
  monthsLeft: number;
  /** Épargne mensuelle nécessaire pour atteindre la cible à la date prévue (arrondie au centime supérieur). */
  monthlyRequiredCents: Cents;
  /** to_determine : aucun rythme d'épargne connu, on ne peut pas dire si l'objectif est en bonne voie. */
  status: 'achieved' | 'on_track' | 'behind' | 'overdue' | 'to_determine';
  /** Date estimée d'atteinte au rythme moyen observé, si calculable. */
  projectedMonthsAtCurrentPace: number | null;
  /** Date estimée d'atteinte de la cible à ce rythme (null si rythme inconnu ou nul). */
  projectedCompletionDate: IsoDate | null;
  /** Rythme utilisé pour le statut : capacité déclarée, rythme observé, ou aucun. */
  paceSource: 'declared' | 'observed' | 'none';
}

/**
 * Plan d'un objectif financé par enveloppe virtuelle.
 * Aucune somme n'est déplacée : l'allocation est une affectation déclarative.
 * @param monthlyPaceCents rythme d'épargne mensuel prévu ou observé (facultatif)
 */
export function planGoal(goal: Goal, allocations: readonly GoalAllocation[], asOf: IsoDate, observedPaceCents?: Cents): GoalPlan {
  // La capacité déclarée prime sur le rythme observé : c'est l'engagement de l'utilisateur.
  const declared = goal.monthlyCapacityCents;
  if (declared !== undefined && (!Number.isInteger(declared) || declared < 0)) throw new RangeError('capacité mensuelle invalide');
  const monthlyPaceCents = declared ?? observedPaceCents;
  const paceSource: GoalPlan['paceSource'] = declared !== undefined ? 'declared' : observedPaceCents !== undefined ? 'observed' : 'none';
  if (!Number.isInteger(goal.targetCents) || goal.targetCents <= 0) throw new RangeError('montant cible invalide');
  const saved = Math.max(0, allocations.filter((a) => a.goalId === goal.id && a.allocatedOn <= asOf).reduce((s, a) => s + a.amountCents, 0));
  const remaining = Math.max(0, goal.targetCents - saved);
  const monthsLeft = monthsBetween(asOf, goal.targetDate);
  const progress = Math.min(1000, divRoundHalfEven(saved * 1000, goal.targetCents));

  let monthlyRequired = 0;
  if (remaining > 0) monthlyRequired = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;

  let status: GoalPlan['status'];
  if (remaining === 0) status = 'achieved';
  else if (goal.targetDate < asOf) status = 'overdue';
  else if (monthlyPaceCents === undefined) status = 'to_determine';
  else if (monthlyPaceCents < monthlyRequired) status = 'behind';
  else status = 'on_track';

  const projected = remaining === 0 ? 0 : monthlyPaceCents && monthlyPaceCents > 0 ? Math.ceil(remaining / monthlyPaceCents) : null;

  return {
    goalId: goal.id,
    savedCents: saved,
    remainingCents: remaining,
    progressPermille: progress,
    monthsLeft,
    monthlyRequiredCents: monthlyRequired,
    status,
    projectedMonthsAtCurrentPace: projected,
    projectedCompletionDate: projected === null ? null : addMonths(asOf, projected),
    paceSource,
  };
}

/**
 * Rythme mensuel observé : moyenne des allocations nettes des N derniers mois.
 * Renvoie undefined s'il n'existe aucune allocation sur la période (rythme inconnu,
 * et non « zéro » : un objectif tout juste créé n'est pas « en retard »).
 */
export function observedMonthlyPace(allocations: readonly GoalAllocation[], goalId: string, asOf: IsoDate, months = 3): Cents | undefined {
  const [y, m, d] = asOf.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
  const inWindow = allocations.filter((a) => a.goalId === goalId && a.allocatedOn > start && a.allocatedOn <= asOf);
  if (inWindow.length === 0) return undefined;
  const total = inWindow.reduce((s, a) => s + a.amountCents, 0);
  return Math.max(0, Math.floor(total / months));
}

// ---------------------------------------------------------------------------
// Parcours d'un projet : Créer → Planifier → Simuler → Suivre → Réaliser
// ---------------------------------------------------------------------------
export type JourneyStep = 'create' | 'plan' | 'simulate' | 'follow' | 'realize';
export const JOURNEY_STEPS: readonly JourneyStep[] = ['create', 'plan', 'simulate', 'follow', 'realize'];

export interface Journey {
  /** Étape à laquelle se trouve le projet (la prochaine action utile). */
  current: JourneyStep;
  done: Record<JourneyStep, boolean>;
}

/**
 * Étapes franchies, sans rien supposer :
 * - planifier = cible, date ET capacité mensuelle connues ;
 * - simuler = un rythme permet d'estimer une date d'atteinte ;
 * - suivre = au moins une affectation enregistrée ;
 * - réaliser = l'utilisateur a déclaré le projet réalisé.
 */
export function goalJourney(goal: Goal, plan: GoalPlan, allocationCount: number): Journey {
  const done: Record<JourneyStep, boolean> = {
    create: true,
    plan: goal.monthlyCapacityCents !== undefined,
    simulate: plan.projectedCompletionDate !== null,
    follow: allocationCount > 0,
    realize: goal.lifecycle === 'achieved',
  };
  const current = JOURNEY_STEPS.find((s) => !done[s]) ?? 'realize';
  return { current, done };
}

/** « Et si j'épargnais X par mois ? » : plan recalculé avec ce rythme, sans rien enregistrer. */
export function simulateGoalPace(goal: Goal, allocations: readonly GoalAllocation[], asOf: IsoDate, monthlyCents: Cents): GoalPlan {
  if (!Number.isInteger(monthlyCents) || monthlyCents < 0) throw new RangeError('rythme simulé invalide');
  return planGoal({ ...goal, monthlyCapacityCents: monthlyCents }, allocations, asOf);
}

export interface AllocationLine { allocatedOn: IsoDate; amountCents: Cents; balanceCents: Cents }

/** Historique des affectations d'un projet, du plus ancien au plus récent, avec le solde virtuel. */
export function allocationHistory(allocations: readonly GoalAllocation[], goalId: string): AllocationLine[] {
  let balance = 0;
  return allocations
    .filter((a) => a.goalId === goalId)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => (x.a.allocatedOn < y.a.allocatedOn ? -1 : x.a.allocatedOn > y.a.allocatedOn ? 1 : x.i - y.i))
    .map(({ a }) => { balance += a.amountCents; return { allocatedOn: a.allocatedOn, amountCents: a.amountCents, balanceCents: balance }; });
}

/** Le projet participe-t-il encore à la planification (capacité, répartition, recommandations) ? */
export const isPlannable = (g: Goal): boolean => (g.lifecycle ?? 'active') === 'active';
