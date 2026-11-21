import { describe, expect, it } from 'vitest';
import { analyzeFinances, buildSavingsPlan, capacityForGoal, planGoal, recommend, type Goal, type GoalAllocation } from '../src/index.ts';

// Famille fictive : capacité d'épargne de 500 €/mois
const asOf = '2026-11-20';
const g = (id: string, kind: Goal['kind'], target: number, date: string, monthly: number, priority: number): Goal =>
  ({ id, kind, name: id, targetCents: target, targetDate: date, monthlyCapacityCents: monthly, priority });
const goals = [
  g('aid', 'eid_al_adha', 33_000, '2027-05-17', 5_000, 2),
  g('hajj', 'hajj', 900_000, '2031-05-01', 15_000, 3),
  g('etudes', 'children_education', 1_200_000, '2036-09-01', 10_000, 4),
  g('reserve', 'emergency_fund', 600_000, '2028-11-01', 10_000, 1),
];
const allocations: GoalAllocation[] = [{ goalId: 'aid', amountCents: 10_000, allocatedOn: '2026-10-15' }];
const withPlans = (list: Goal[]) => list.map((goal) => ({ goal, plan: planGoal(goal, allocations, asOf) }));

describe('plan d’épargne des projets', () => {
  it('exemple : 500 € de capacité, 400 € affectés, 100 € libres, aucun déséquilibre', () => {
    const p = buildSavingsPlan({ asOf, estimatedCapacityCents: 50_000, declaredCapacityCents: null, goals: withPlans(goals), allocations });
    expect(p).toMatchObject({ capacityCents: 50_000, capacitySource: 'estimated', assignedCents: 40_000, freeCents: 10_000, overcommittedCents: 0 });
    expect(p.lines.map((l) => l.goalId)).toEqual(['reserve', 'aid', 'hajj', 'etudes']); // priorité, puis échéance
    expect(p.lines.every((l) => l.fundedCents === l.plannedCents)).toBe(true);
    expect(p.lines.reduce((s, l) => s + l.fundedCents, 0)).toBeLessThanOrEqual(50_000);
  });

  it('capacité déclarée prioritaire sur l’estimation ; capacité inconnue : plan sans conclusion', () => {
    expect(buildSavingsPlan({ asOf, estimatedCapacityCents: 50_000, declaredCapacityCents: 45_000, goals: withPlans(goals), allocations })).toMatchObject({ capacitySource: 'declared', freeCents: 5_000 });
    const unknown = buildSavingsPlan({ asOf, estimatedCapacityCents: null, declaredCapacityCents: null, goals: withPlans(goals), allocations });
    expect(unknown).toMatchObject({ capacitySource: 'unknown', freeCents: null, overcommittedCents: 0 });
  });

  it('dépassement de capacité : aucune double allocation, les derniers projets sont sous-financés et retardés', () => {
    const p = buildSavingsPlan({ asOf, estimatedCapacityCents: 30_000, declaredCapacityCents: null, goals: withPlans(goals), allocations });
    expect(p.overcommittedCents).toBe(10_000);
    expect(p.lines.reduce((s, l) => s + l.fundedCents, 0)).toBe(30_000);
    const hajj = p.lines.find((l) => l.goalId === 'hajj')!;
    const etudes = p.lines.find((l) => l.goalId === 'etudes')!;
    expect(hajj).toMatchObject({ plannedCents: 15_000, fundedCents: 15_000 });
    expect(etudes).toMatchObject({ plannedCents: 10_000, fundedCents: 0, fundedDate: null, status: 'underfunded' });
    expect(p.imbalance).toMatchObject({ overcommitted: true, underfundedGoals: 1 });
  });

  it('capacité vue d’un projet : engagée par les autres projets, disponible pour celui-ci, jamais comptée deux fois', () => {
    const p = buildSavingsPlan({ asOf, estimatedCapacityCents: 50_000, declaredCapacityCents: null, goals: withPlans(goals), allocations });
    // Aïd : les autres projets engagent 150 + 100 + 100 = 350 € ; 150 € restent pour lui (dont ses 50 € prévus)
    expect(capacityForGoal(p, 'aid')).toEqual({ capacityCents: 50_000, capacitySource: 'estimated', engagedByOthersCents: 35_000, availableCents: 15_000 });
    const tight = buildSavingsPlan({ asOf, estimatedCapacityCents: 30_000, declaredCapacityCents: null, goals: withPlans(goals), allocations });
    expect(capacityForGoal(tight, 'etudes').availableCents).toBe(0); // les autres dépassent déjà la capacité
    const unknown = buildSavingsPlan({ asOf, estimatedCapacityCents: null, declaredCapacityCents: null, goals: withPlans(goals), allocations });
    expect(capacityForGoal(unknown, 'aid').availableCents).toBe(null);
    // Un nouveau projet sans ligne : toute la capacité non engagée lui est disponible
    expect(capacityForGoal(p, 'nouveau')).toMatchObject({ engagedByOthersCents: 40_000, availableCents: 10_000 });
  });

  it('modifier les priorités change qui est servi en premier', () => {
    const reordered = goals.map((x) => (x.id === 'etudes' ? { ...x, priority: 1 } : x.id === 'reserve' ? { ...x, priority: 5 } : x));
    const p = buildSavingsPlan({ asOf, estimatedCapacityCents: 30_000, declaredCapacityCents: null, goals: withPlans(reordered), allocations });
    expect(p.lines.find((l) => l.goalId === 'etudes')!.fundedCents).toBe(10_000);
    expect(p.lines.find((l) => l.goalId === 'reserve')!.status).toBe('underfunded');
  });

  it('incidence sur les dates : retard estimé au montant prévu insuffisant', () => {
    const tight = [g('voyage', 'personal', 600_000, '2027-11-20', 10_000, 1)]; // 12 mois, 500 € nécessaires
    const p = buildSavingsPlan({ asOf, estimatedCapacityCents: 50_000, declaredCapacityCents: null, goals: withPlans(tight), allocations });
    expect(p.lines[0]).toMatchObject({ status: 'late', delayMonths: 48, plannedDate: '2031-11-20' });
  });

  it('projets en pause ou réalisés : hors plan', () => {
    const p = buildSavingsPlan({ asOf, estimatedCapacityCents: 50_000, declaredCapacityCents: null,
      goals: withPlans([{ ...goals[0]!, lifecycle: 'paused' }, { ...goals[1]!, lifecycle: 'achieved', realizedOn: '2026-11-01' }, goals[2]!]), allocations });
    expect(p.lines.map((l) => l.goalId)).toEqual(['etudes']);
  });
});

describe('R7 — objectif en retard', () => {
  const insufficient = analyzeFinances({ asOf, transactions: [], categories: [] });
  const late = g('voyage', 'personal', 600_000, '2027-11-20', 10_000, 1);
  const rec = (list: Goal[], pace?: number) => recommend({ analysis: insufficient, asOf, allocations,
    goals: list.map((goal) => ({ goal, plan: planGoal(goal, allocations, asOf, pace), paceCents: pace })) });

  it('retard expliqué : données, effort supplémentaire, scénarios ; même sans historique bancaire', () => {
    const r = rec([late]);
    expect(r.map((x) => x.ruleId)).toEqual(['R0', 'R7']);
    const r7 = r[1]!;
    expect(r7.finding).toEqual({ code: 'goal_late', params: { goalName: 'voyage', targetDate: '2027-11-20', projectedDate: '2031-11-20', delayMonths: 48, overdue: 0, remainingCents: 600_000 } });
    expect(r7.proposal.params).toMatchObject({ extraMonthlyCents: 40_000, newMonthlyCents: 50_000, laterDate: '2031-11-20', reachableCents: 120_000, correctedDate: '2027-11-20' });
    expect(r7.data.map((d) => d.code)).toEqual(['goal_target', 'goal_saved', 'goal_pace', 'goal_required', 'goal_months_left']);
    expect(r7.data.find((d) => d.code === 'goal_pace')!.source).toBe('goal_declared_pace');
    expect(r7.impact).toBeNull();
    expect(r7.action).toEqual({ code: 'open_goal', href: '/goals/voyage' });
  });

  it('aucune date promise sans rythme ; rien pour un projet à l’heure, en pause ou au rythme inconnu', () => {
    const zero = rec([{ ...late, monthlyCapacityCents: 0 }])[1]!;
    expect(zero.finding.params.projectedDate).toBe('');
    expect(zero.proposal.params.laterDate).toBe('');
    expect(rec([{ ...late, monthlyCapacityCents: 60_000 }]).map((x) => x.ruleId)).toEqual(['R0']);
    expect(rec([{ ...late, lifecycle: 'paused' }]).map((x) => x.ruleId)).toEqual(['R0']);
    expect(rec([{ ...late, monthlyCapacityCents: undefined }]).map((x) => x.ruleId)).toEqual(['R0']);
  });

  it('échéance dépassée : priorité plus haute', () => {
    const overdue = rec([{ ...late, targetDate: '2026-10-01' }])[1]!;
    expect(overdue.severity).toBe('high');
    expect(overdue.finding.params.overdue).toBe(1);
  });
});
