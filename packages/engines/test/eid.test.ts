import { describe, expect, it } from 'vitest';
import { eidBudget, eidDateLabel, estimateEidAlAdha, isReligiousGoal, renewalCheck, renewalProposal, type EidPlan } from '../src/index.ts';

// Budgets fictifs
const budget = { sacrificeCents: 35_000, extraCostsCents: 5_000, organizationCents: 0, familyContributionCents: 10_000 };

describe('Aïd al-Adha', () => {
  it('projet religieux protégé (article 9)', () => {
    expect(isReligiousGoal('eid_al_adha')).toBe(true);
  });

  it('budget : coût total, part de la famille, montant à mettre de côté', () => {
    expect(eidBudget(budget)).toEqual({ totalCostCents: 40_000, toSaveCents: 30_000, familyShareCents: 10_000 });
    expect(eidBudget({ ...budget, sacrificeCents: 0, organizationCents: 25_000, familyContributionCents: 0 })).toMatchObject({ totalCostCents: 30_000, toSaveCents: 30_000 });
    expect(() => eidBudget({ ...budget, familyContributionCents: 40_000 })).toThrow();
    expect(() => eidBudget({ sacrificeCents: 0, extraCostsCents: 0, organizationCents: 0, familyContributionCents: 0 })).toThrow();
    expect(() => eidBudget({ ...budget, extraCostsCents: -1 })).toThrow();
  });

  it('estimation tabulaire : toujours une estimation, proche des dates observées', () => {
    const [e] = estimateEidAlAdha(2026);
    expect(e).toEqual({ hijriYear: 1447, date: '2026-05-27', method: 'tabular', isEstimate: true });
    // Dates annoncées par l'Arabie saoudite (2024 : 16 juin ; 2025 : 6 juin) : l'estimation peut différer d'un jour
    expect(estimateEidAlAdha(2024)[0]!.date).toBe('2024-06-17');
    expect(estimateEidAlAdha(2025)[0]!.date).toBe('2025-06-07');
    // Certaines années civiles comptent deux Aïd
    expect(estimateEidAlAdha(2039).map((x) => x.hijriYear)).toEqual([1460, 1461]);
    expect(() => estimateEidAlAdha(1999)).toThrow();
  });

  it('date : « confirmée » seulement si l’utilisateur l’a confirmée avec une source', () => {
    expect(eidDateLabel({ dateStatus: 'entered' })).toBe('entered_unconfirmed');
    expect(eidDateLabel({ dateStatus: 'confirmed', dateSource: ' ' })).toBe('entered_unconfirmed');
    expect(eidDateLabel({ dateStatus: 'confirmed', dateSource: 'Mosquée fictive' })).toBe('confirmed_by_user');
  });

  it('reconduction : après réalisation, une seule fois, sans doublon d’année', () => {
    const p2026 = { goalId: 'a26', civilYear: 2026 };
    expect(renewalCheck(p2026, false, [p2026])).toEqual({ allowed: false, reason: 'not_realized' });
    expect(renewalCheck(p2026, true, [p2026])).toEqual({ allowed: true, nextCivilYear: 2027 });
    expect(renewalCheck(p2026, true, [p2026, { goalId: 'a27', civilYear: 2027, previousGoalId: 'a26' }])).toEqual({ allowed: false, reason: 'already_renewed' });
    expect(renewalCheck(p2026, true, [p2026, { goalId: 'x27', civilYear: 2027 }])).toEqual({ allowed: false, reason: 'next_year_exists' });
  });

  it('proposition de l’année suivante : budget repris, aucun montant reporté', () => {
    const plan: EidPlan = { goalId: 'a26', civilYear: 2026, budget, date: '2026-05-27', dateStatus: 'confirmed', dateSource: 'Mosquée fictive' };
    const next = renewalProposal(plan);
    expect(next).toMatchObject({ civilYear: 2027, budget, initialCents: 0 });
    expect(next.estimates[0]!.date).toBe('2027-05-17');
    next.budget.sacrificeCents = 1;
    expect(plan.budget.sacrificeCents).toBe(35_000); // copie indépendante
  });
});
