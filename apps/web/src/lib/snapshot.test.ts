import { describe, expect, it } from 'vitest';
import { getDemoHousehold } from './demo.ts';
import { buildSnapshot, previousMonthKeys, type HouseholdData } from './snapshot.ts';
import { formatCents } from './format.ts';

describe('vue d’ensemble du foyer de démonstration', () => {
  const snap = buildSnapshot(getDemoHousehold());

  it('calcule les mois précédents', () => {
    expect(previousMonthKeys('2026-01-15', 2)).toEqual(['2025-12', '2025-11']);
  });

  it('agrège soldes, budget et réserve', () => {
    expect(snap.totalBalanceCents).toBe(1_597_650);
    expect(snap.previousMonths[0].month).toBe('2026-10');
    expect(snap.previousMonths[0].incomeCents).toBe(357_400);
    expect(snap.previousMonths[0].interestIncomeCents).toBe(612);
    expect(snap.emergencyFund.targetCents).toBeGreaterThan(0);
  });

  it('expose les objectifs avec un rythme observé', () => {
    const hajj = snap.goals.find((g) => g.goal.kind === 'hajj')!;
    expect(hajj.plan.savedCents).toBe(500_000);
    expect(hajj.plan.status).toBe('behind'); // 500 €/mois observés, 529,42 € requis
    const etudes = snap.goals.find((g) => g.goal.kind === 'children_education')!;
    expect(etudes.plan.status).toBe('to_determine'); // aucune allocation récente
  });

  it('ne compte pas deux fois les soldes de comptes', () => {
    const accountLines = snap.zakat.lines.filter((l) => l.kind === 'bank_balance');
    expect(accountLines.map((l) => l.sourceId)).toEqual(['account:demo-current', 'account:demo-savings']);
    // Patrimoine : comptes + espèces + or + bijoux + pension − dette
    expect(snap.wealth.status).toBe('complete');
    expect(snap.wealth.netWorthCents).toBe(1_597_650 + 40_000 + 156_853 + 346_500 + 1_860_000 - 300_000);
  });

  it('produit une Zakat explicable et des intérêts détectés', () => {
    expect(snap.zakat.status).toBe('due');
    expect(snap.zakat.lines.length).toBe(7);
    expect(snap.purification.detectedCreditedCents).toBe(2_457);
  });

  it('formate les montants en fr-BE', () => {
    expect(formatCents(123_456).replace(/\s/g, ' ')).toBe('1 234,56 €');
  });
});

describe('foyer vide (nouvel utilisateur)', () => {
  const empty: HouseholdData = {
    asOf: '2026-11-09', accounts: [], transactions: [], categories: [], budget: [], goals: [], allocations: [],
    assets: [], liabilities: [], prices: { gold: null, silver: null },
    zakat: { options: { nisabBasis: null, yearBasis: 'lunar', personalJewelry: 'exclude', longTermInvestments: { mode: 'full_market_value' }, lockedPensions: 'exclude', debts: 'due_12_months' } },
    emergencyFundMonths: 3,
  };
  const snap = buildSnapshot(empty);
  it('s’affiche sans erreur et ne conclut rien', () => {
    expect(snap.isEmpty).toBe(true);
    expect(snap.zakat.status).toBe('to_determine');
    expect(snap.zakat.dueCents).toBe(0);
    expect(snap.wealth.netWorthCents).toBe(0);
    expect(snap.goals).toEqual([]);
  });
});
