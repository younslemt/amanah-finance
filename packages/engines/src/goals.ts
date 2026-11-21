import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import { addMonths, monthsBetween, type IsoDate } from './dates.ts';

/** religious_other : autre projet religieux (Ramadan, Aïd al-Fitr…) — protégé comme Hajj, Omra et Aïd (article 9). */
export type GoalKind = 'hajj' | 'omra' | 'eid_al_adha' | 'religious_other' | 'children_education' | 'real_estate' | 'retirement' | 'family_savings' | 'emergency_fund' | 'personal';

/** Projets propres à une personne et protégés (consentement article 9). */
export const RELIGIOUS_GOAL_KINDS: readonly GoalKind[] = ['hajj', 'omra', 'eid_al_adha', 'religious_other'];
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
  /** « Planifier » : date à laquelle l'utilisateur a validé son plan d'épargne. */
  planConfirmedOn?: IsoDate;
  /** « Simuler » : stratégie retenue après comparaison de scénarios (mensualité et date du choix). */
  strategy?: { monthlyCents: Cents; chosenOn: IsoDate };
  /** Modèle du catalogue à l'origine du projet (suggestion acceptée), et occurrence annuelle. */
  templateId?: string;
  occurrence?: number;
  /** Projet annuel reconduit : occurrence précédente (jamais fusionnée avec celle-ci). */
  previousGoalId?: string;
}

export interface GoalAllocation {
  goalId: string;
  amountCents: Cents; // négatif = retrait de l'enveloppe virtuelle
  allocatedOn: IsoDate;
  /** initial = épargne déclarée à la création (ce n'est pas un suivi) ; manual (défaut) = affectation enregistrée. */
  source?: 'initial' | 'manual';
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

/**
 * État d'une étape :
 * - done : action réellement effectuée par l'utilisateur ;
 * - available : action possible maintenant (le parcours n'est pas linéaire : on peut revenir) ;
 * - locked : rien à faire tant que le projet est en pause, archivé ou réalisé.
 */
export type JourneyStepStatus = 'done' | 'available' | 'locked';

/** Prochaine action conseillée (une seule à la fois). */
export type JourneyAction =
  | 'confirm_plan' | 'compare_scenarios' | 'record_allocation' | 'keep_saving'
  | 'declare_realized' | 'resume' | 'explore_solutions';

export interface Journey {
  /** Étape mise en avant : celle de l'action conseillée (ou « réaliser » une fois le projet clos). */
  current: JourneyStep;
  done: Record<JourneyStep, boolean>;
  status: Record<JourneyStep, JourneyStepStatus>;
  /** Étape recommandée (null : rien à recommander, par exemple un projet archivé sans reprise conseillée). */
  recommended: JourneyStep | null;
  next: { step: JourneyStep; action: JourneyAction } | null;
  /** Cible atteinte (épargne virtuelle ≥ montant cible) : la clôture peut être proposée. */
  readyToRealize: boolean;
}

/**
 * Étapes franchies = décisions identifiables de l'utilisateur, jamais déduites d'un calcul :
 * - planifier = plan d'épargne validé (planConfirmedOn) ;
 * - simuler = stratégie retenue après comparaison (strategy) ;
 * - suivre = au moins une affectation enregistrée APRÈS la création (l'épargne initiale ne compte pas) ;
 * - réaliser = projet déclaré réalisé.
 * Le parcours n'impose aucun ordre : chaque étape reste disponible tant que le projet est actif.
 */
export function goalJourney(goal: Goal, plan: GoalPlan, allocations: readonly GoalAllocation[]): Journey {
  const lifecycle = goal.lifecycle ?? 'active';
  const done: Record<JourneyStep, boolean> = {
    create: true,
    plan: goal.planConfirmedOn !== undefined,
    simulate: goal.strategy !== undefined,
    follow: allocations.some((a) => a.goalId === goal.id && (a.source ?? 'manual') === 'manual'),
    realize: lifecycle === 'achieved',
  };
  const active = lifecycle === 'active';
  const status = Object.fromEntries(JOURNEY_STEPS.map((s) => [s, done[s] ? 'done' : active ? 'available' : 'locked'])) as Record<JourneyStep, JourneyStepStatus>;
  const readyToRealize = plan.remainingCents === 0;

  let next: Journey['next'];
  if (lifecycle === 'achieved') next = { step: 'realize', action: 'explore_solutions' };
  else if (!active) next = lifecycle === 'paused' ? { step: 'follow', action: 'resume' } : null;
  else if (readyToRealize) next = { step: 'realize', action: 'declare_realized' };
  else if (!done.plan) next = { step: 'plan', action: 'confirm_plan' };
  else if (!done.simulate) next = { step: 'simulate', action: 'compare_scenarios' };
  else if (!done.follow) next = { step: 'follow', action: 'record_allocation' };
  else next = { step: 'follow', action: 'keep_saving' };

  const recommended = next?.step ?? null;
  const current = recommended ?? (JOURNEY_STEPS.find((s) => !done[s]) ?? 'realize');
  return { current, done, status, recommended, next, readyToRealize };
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

/** Projet visible dans la liste principale (les projets archivés sont regroupés à part). */
export const isArchived = (g: Goal): boolean => g.lifecycle === 'archived';

// ---------------------------------------------------------------------------
// Comparaison de scénarios (« Simuler ») : plusieurs mensualités, sans rien enregistrer
// ---------------------------------------------------------------------------
export interface ScenarioResult {
  monthlyCents: Cents;
  /** Mois nécessaires pour atteindre la cible (null : mensualité nulle, aucune date estimable). */
  months: number | null;
  completionDate: IsoDate | null;
  /** Écart en mois avec l'échéance souhaitée : négatif = en avance, positif = en retard. */
  gapMonths: number | null;
  meetsDeadline: boolean | null;
  /** La mensualité dépasse la capacité encore disponible pour ce projet (null : capacité inconnue). */
  exceedsAvailable: boolean | null;
}

export interface ScenarioComparison {
  remainingCents: Cents;
  monthsLeft: number;
  monthlyRequiredCents: Cents;
  scenarios: ScenarioResult[];
}

/**
 * Compare des mensualités pour un projet. availableCents = capacité non engagée par les AUTRES
 * projets (voir capacityForGoal) : une même capacité n'est jamais comptée deux fois.
 * Résultat purement indicatif : aucune simulation n'est une épargne réalisée.
 */
export function compareScenarios(goal: Goal, allocations: readonly GoalAllocation[], asOf: IsoDate, monthlies: readonly Cents[], availableCents: Cents | null): ScenarioComparison {
  const base = planGoal({ ...goal, monthlyCapacityCents: undefined }, allocations, asOf);
  const scenarios = monthlies.map((m): ScenarioResult => {
    const p = simulateGoalPace(goal, allocations, asOf, m);
    const months = p.projectedMonthsAtCurrentPace;
    const gap = months === null ? null : months - Math.max(0, base.monthsLeft);
    return {
      monthlyCents: m, months, completionDate: p.projectedCompletionDate, gapMonths: gap,
      meetsDeadline: gap === null ? null : gap <= 0,
      exceedsAvailable: availableCents === null ? null : m > availableCents,
    };
  });
  return { remainingCents: base.remainingCents, monthsLeft: base.monthsLeft, monthlyRequiredCents: base.monthlyRequiredCents, scenarios };
}

/** Trois mensualités de départ : la moitié, le nécessaire et une fois et demie (arrondis à l'euro supérieur). */
export function defaultScenarioMonthlies(requiredCents: Cents): Cents[] {
  if (requiredCents <= 0) return [];
  const up = (c: number) => Math.max(100, Math.ceil(c / 100) * 100);
  return [...new Set([up(requiredCents / 2), up(requiredCents), up(requiredCents * 1.5)])];
}
