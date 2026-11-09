import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import { monthsBetween, type IsoDate } from './dates.ts';

export type GoalKind = 'hajj' | 'omra' | 'children_education' | 'real_estate' | 'retirement' | 'family_savings' | 'emergency_fund' | 'personal';

export interface Goal {
  id: string;
  kind: GoalKind;
  name: string;
  targetCents: Cents;
  targetDate: IsoDate;
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
}

/**
 * Plan d'un objectif financé par enveloppe virtuelle.
 * Aucune somme n'est déplacée : l'allocation est une affectation déclarative.
 * @param monthlyPaceCents rythme d'épargne mensuel prévu ou observé (facultatif)
 */
export function planGoal(goal: Goal, allocations: readonly GoalAllocation[], asOf: IsoDate, monthlyPaceCents?: Cents): GoalPlan {
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
