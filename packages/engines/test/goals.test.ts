import { describe, expect, it } from 'vitest';
import {
  allocationHistory, compareScenarios, defaultScenarioMonthlies, goalJourney, isPlannable, isReligiousGoal, planGoal, simulateGoalPace, GENERAL_GOAL_KINDS, RELIGIOUS_GOAL_KINDS,
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

  it('parcours : une étape n’est franchie que par une action de l’utilisateur, jamais par un calcul', () => {
    // Capacité connue et date calculable : ni « Planifier » ni « Simuler » ne sont pour autant validés
    const created = goalJourney(etudes, planGoal(etudes, [], asOf), []);
    expect(created.done).toEqual({ create: true, plan: false, simulate: false, follow: false, realize: false });
    expect(created.next).toEqual({ step: 'plan', action: 'confirm_plan' });
    expect(created.status).toMatchObject({ create: 'done', plan: 'available', simulate: 'available', follow: 'available', realize: 'available' });
    // L'épargne déclarée à la création n'est pas un suivi
    const initial: GoalAllocation[] = [{ goalId: 'g1', amountCents: 200_000, allocatedOn: asOf, source: 'initial' }];
    expect(goalJourney(etudes, planGoal(etudes, initial, asOf), initial).done.follow).toBe(false);
    // Parcours non linéaire : simuler avant de planifier est possible et reconnu
    const simulatedFirst = { ...etudes, strategy: { monthlyCents: 40_000, chosenOn: asOf } };
    const j1 = goalJourney(simulatedFirst, planGoal(simulatedFirst, [], asOf), []);
    expect(j1.done.simulate).toBe(true);
    expect(j1.next?.action).toBe('confirm_plan');
    const all = { ...simulatedFirst, planConfirmedOn: asOf };
    expect(goalJourney(all, planGoal(all, [], asOf), []).next).toEqual({ step: 'follow', action: 'record_allocation' });
    expect(goalJourney(all, planGoal(all, allocs, asOf), allocs).next).toEqual({ step: 'follow', action: 'keep_saving' });
  });

  it('parcours : cible atteinte, réalisation, pause et archive', () => {
    const full = { ...etudes, targetCents: 100_000 };
    const ready = goalJourney(full, planGoal(full, allocs, asOf), allocs);
    expect(ready.readyToRealize).toBe(true);
    expect(ready.next).toEqual({ step: 'realize', action: 'declare_realized' });
    const realized = { ...etudes, lifecycle: 'achieved' as const, realizedOn: '2026-11-19' };
    const r = goalJourney(realized, planGoal(realized, allocs, asOf), allocs);
    expect(r.done.realize).toBe(true);
    expect(r.next?.action).toBe('explore_solutions');
    expect(r.status.plan).toBe('locked');
    const paused = { ...etudes, lifecycle: 'paused' as const };
    expect(goalJourney(paused, planGoal(paused, [], asOf), []).next?.action).toBe('resume');
    const archived = { ...etudes, lifecycle: 'archived' as const };
    expect(goalJourney(archived, planGoal(archived, [], asOf), []).next).toBe(null);
  });

  it('comparaison de scénarios : Aïd 480 €, 120 € disponibles, 30 / 60 / 90 € par mois', () => {
    const aid: Goal = { id: 'aid', kind: 'eid_al_adha', name: 'Aïd fictif', targetCents: 48_000, targetDate: '2027-05-20' };
    const a: GoalAllocation[] = [{ goalId: 'aid', amountCents: 12_000, allocatedOn: asOf, source: 'initial' }];
    const c = compareScenarios(aid, a, asOf, [3_000, 6_000, 9_000], 7_000);
    expect(c.remainingCents).toBe(36_000);
    expect(c.monthsLeft).toBe(6);
    expect(c.monthlyRequiredCents).toBe(6_000);
    expect(c.scenarios.map((x) => [x.months, x.gapMonths, x.meetsDeadline, x.exceedsAvailable])).toEqual([
      [12, 6, false, false], [6, 0, true, false], [4, -2, true, true],
    ]);
    expect(c.scenarios[0]!.completionDate).toBe('2027-11-20');
    expect(compareScenarios(aid, a, asOf, [0], null).scenarios[0]).toMatchObject({ months: null, meetsDeadline: null, exceedsAvailable: null });
    expect(defaultScenarioMonthlies(6_000)).toEqual([3_000, 6_000, 9_000]);
    expect(defaultScenarioMonthlies(0)).toEqual([]);
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
