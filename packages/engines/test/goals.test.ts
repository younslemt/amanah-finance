import { describe, expect, it } from 'vitest';
import {
  allocationHistory, goalJourney, isPlannable, isReligiousGoal, planGoal, simulateGoalPace, GENERAL_GOAL_KINDS, RELIGIOUS_GOAL_KINDS,
  type Goal, type GoalAllocation,
} from '../src/index.ts';

// Projets fictifs
const etudes: Goal = { id: 'g1', kind: 'children_education', name: 'Études fictives', targetCents: 1_200_000, targetDate: '2028-11-20', monthlyCapacityCents: 30_000 };
const allocs: GoalAllocation[] = [
  { goalId: 'g1', amountCents: 200_000, allocatedOn: '2026-01-10' },
  { goalId: 'g1', amountCents: 30_000, allocatedOn: '2026-10-05' },
  { goalId: 'g1', amountCents: -10_000, allocatedOn: '2026-10-05' },
  { goalId: 'autre', amountCents: 99_999, allocatedOn: '2026-10-01' },
];
const asOf = '2026-11-20';

describe('projets universels', () => {
  it('catégories générales accessibles à tous, catégories religieuses protégées', () => {
    expect(GENERAL_GOAL_KINDS).toEqual(['children_education', 'real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal']);
    expect(RELIGIOUS_GOAL_KINDS).toContain('hajj');
    expect(isReligiousGoal('omra')).toBe(true);
    expect(isReligiousGoal('retirement')).toBe(false);
  });

  it('historique des affectations : ordre chronologique, retraits compris, solde virtuel', () => {
    expect(allocationHistory(allocs, 'g1')).toEqual([
      { allocatedOn: '2026-01-10', amountCents: 200_000, balanceCents: 200_000 },
      { allocatedOn: '2026-10-05', amountCents: 30_000, balanceCents: 230_000 },
      { allocatedOn: '2026-10-05', amountCents: -10_000, balanceCents: 220_000 },
    ]);
  });

  it('parcours Créer → Planifier → Simuler → Suivre → Réaliser, sans rien supposer', () => {
    const noPlan = { ...etudes, monthlyCapacityCents: undefined };
    expect(goalJourney(noPlan, planGoal(noPlan, [], asOf), 0).current).toBe('plan');
    const planned = planGoal(etudes, [], asOf);
    expect(goalJourney(etudes, planned, 0)).toMatchObject({ current: 'follow', done: { create: true, plan: true, simulate: true, follow: false } });
    const zero = { ...etudes, monthlyCapacityCents: 0 };
    expect(goalJourney(zero, planGoal(zero, [], asOf), 0).current).toBe('simulate'); // rythme nul : aucune date estimable
    expect(goalJourney(etudes, planGoal(etudes, allocs, asOf), 3).current).toBe('realize');
    const realized = { ...etudes, lifecycle: 'achieved' as const, realizedOn: '2026-11-19' };
    expect(goalJourney(realized, planGoal(realized, allocs, asOf), 3).done.realize).toBe(true);
  });

  it('simulation d’un rythme : aucune écriture, date estimée recalculée, rythme invalide refusé', () => {
    const plan = planGoal(etudes, allocs, asOf);
    const faster = simulateGoalPace(etudes, allocs, asOf, 60_000);
    expect(plan.remainingCents).toBe(980_000);
    expect(faster.projectedMonthsAtCurrentPace).toBe(17);
    expect(faster.projectedCompletionDate).toBe('2028-04-20');
    expect(plan.projectedMonthsAtCurrentPace).toBe(33);
    expect(simulateGoalPace(etudes, allocs, asOf, 0).projectedCompletionDate).toBeNull();
    expect(() => simulateGoalPace(etudes, allocs, asOf, -1)).toThrow();
  });

  it('modification d’un objectif : l’historique des affectations est conservé', () => {
    const edited = { ...etudes, targetCents: 1_500_000, targetDate: '2029-09-01' };
    expect(planGoal(edited, allocs, asOf).savedCents).toBe(planGoal(etudes, allocs, asOf).savedCents);
  });

  it('seuls les projets actifs participent à la planification', () => {
    expect(isPlannable(etudes)).toBe(true);
    expect(isPlannable({ ...etudes, lifecycle: 'paused' })).toBe(false);
    expect(isPlannable({ ...etudes, lifecycle: 'achieved' })).toBe(false);
  });
});
