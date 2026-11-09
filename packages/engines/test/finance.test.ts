import { describe, expect, it } from 'vitest';
import {
  applyRatePer100k, canTransition, categorize, computeNetWorth, dedupeHash, detectInterest, divRoundHalfEven,
  metalValueCents, monthsBetween, observedMonthlyPace, parseAmountToCents, planEmergencyFund, planGoal,
  purificationAmount, resolveInterestAmounts, summarizeMonth, summarizePurification,
  type CategoryInfo, type CategorizationRule, type Transaction,
} from '../src/index.ts';

const tx = (id: string, bookedOn: string, amountCents: number, description: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, accountId: 'acc', bookedOn, amountCents, currency: 'EUR', description, ...extra,
});

describe('money', () => {
  it('arrondit au pair le plus proche', () => {
    expect(divRoundHalfEven(25, 10)).toBe(2);
    expect(divRoundHalfEven(35, 10)).toBe(4);
    expect(divRoundHalfEven(-25, 10)).toBe(-2);
    expect(divRoundHalfEven(26, 10)).toBe(3);
  });
  it('applique un taux sans flottant', () => {
    expect(applyRatePer100k(100_000, 2_500)).toBe(2_500);
  });
  it('lit les montants belges', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123_456);
    expect(parseAmountToCents('-12,5')).toBe(-1_250);
    expect(parseAmountToCents('1 234,00 €')).toBe(123_400);
    expect(parseAmountToCents('99.90', '.')).toBe(9_990);
    expect(() => parseAmountToCents('12,345')).toThrow();
  });
  it('valorise un métal', () => {
    expect(metalValueCents(1_000, 1000, 11_000)).toBe(11_000);
  });
});

describe('dates', () => {
  it('compte les mois entiers restants', () => {
    expect(monthsBetween('2026-11-09', '2028-06-01')).toBe(18);
    expect(monthsBetween('2026-11-09', '2026-12-09')).toBe(1);
    expect(monthsBetween('2026-11-09', '2026-10-01')).toBe(0);
  });
});

const rules: CategorizationRule[] = [
  { pattern: 'INTERET', categorySlug: 'interets', direction: 'credit', priority: 10 },
  { pattern: 'SALAIRE', categorySlug: 'salaire', direction: 'credit', priority: 20 },
  { pattern: 'DELHAIZE', categorySlug: 'alimentation', direction: 'debit', priority: 50 },
  { pattern: 'LOYER', categorySlug: 'logement', direction: 'debit', priority: 50 },
];

describe('catégorisation', () => {
  it('reconnaît les libellés accentués et la direction', () => {
    expect(categorize({ amountCents: 1_234, description: 'Intérêt de base 2026' }, rules).categorySlug).toBe('interets');
    expect(categorize({ amountCents: -4_200, description: 'Paiement Bancontact DELHAIZE IXELLES' }, rules).categorySlug).toBe('alimentation');
    expect(categorize({ amountCents: -4_200, description: 'Inconnu' }, rules).categorySlug).toBe('divers');
    expect(categorize({ amountCents: 4_200, description: 'Inconnu' }, rules).categorySlug).toBe('autres_revenus');
  });
  it('produit une empreinte stable de dédoublonnage', () => {
    const a = dedupeHash({ bookedOn: '2026-10-01', amountCents: -100, description: 'Café  Léon' });
    const b = dedupeHash({ bookedOn: '2026-10-01', amountCents: -100, description: 'CAFE LEON' });
    expect(a).toBe(b);
    expect(dedupeHash({ bookedOn: '2026-10-01', amountCents: -100, description: 'CAFE LEON' }, 1)).not.toBe(a);
  });
});

const categories: CategoryInfo[] = [
  { slug: 'salaire', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'interets', kind: 'income', isEssential: false, isInterest: true },
  { slug: 'logement', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'alimentation', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'restaurants', kind: 'expense', isEssential: false, isInterest: false },
  { slug: 'epargne', kind: 'transfer', isEssential: false, isInterest: false },
];

describe('budget', () => {
  const txs = [
    tx('1', '2026-10-01', 300_000, 'SALAIRE', { categorySlug: 'salaire' }),
    tx('2', '2026-10-31', 1_234, 'INTERET', { categorySlug: 'interets' }),
    tx('3', '2026-10-02', -95_000, 'LOYER', { categorySlug: 'logement' }),
    tx('4', '2026-10-10', -42_000, 'DELHAIZE', { categorySlug: 'alimentation' }),
    tx('5', '2026-10-12', -8_000, 'RESTO', { categorySlug: 'restaurants' }),
    tx('6', '2026-10-03', -50_000, 'VERS EPARGNE', { categorySlug: 'epargne' }),
    tx('7', '2026-09-30', -9_999, 'HORS MOIS', { categorySlug: 'alimentation' }),
  ];
  const s = summarizeMonth('2026-10', txs, categories, [
    { categorySlug: 'alimentation', limitCents: 45_000 },
    { categorySlug: 'restaurants', limitCents: 5_000 },
    { categorySlug: 'logement', limitCents: 95_000 },
  ]);
  it('sépare revenus, intérêts, dépenses et virements', () => {
    expect(s.incomeCents).toBe(300_000);
    expect(s.interestIncomeCents).toBe(1_234);
    expect(s.expenseCents).toBe(145_000);
    expect(s.netCents).toBe(155_000);
    expect(s.savingsRatePermille).toBe(517);
    expect(s.essentialExpenseCents).toBe(137_000);
  });
  it('signale les budgets proches ou dépassés', () => {
    const st = Object.fromEntries(s.categories.map((c) => [c.categorySlug, c.status]));
    expect(st).toMatchObject({ alimentation: 'warning', restaurants: 'over', logement: 'warning' });
  });
  it('traite un remboursement comme une baisse de dépense, pas comme un revenu', () => {
    const r = summarizeMonth('2026-10', [
      tx('a', '2026-10-01', 300_000, 'SALAIRE', { categorySlug: 'salaire' }),
      tx('b', '2026-10-05', -10_000, 'DELHAIZE', { categorySlug: 'alimentation' }),
      tx('c', '2026-10-07', 2_500, 'REMBOURSEMENT DELHAIZE', { categorySlug: 'alimentation' }),
    ], categories);
    expect(r.incomeCents).toBe(300_000);
    expect(r.expenseCents).toBe(7_500);
    expect(r.refundCents).toBe(2_500);
    expect(r.categories.find((c) => c.categorySlug === 'alimentation')!.spentCents).toBe(7_500);
  });
  it('n’additionne jamais deux devises', () => {
    const r = summarizeMonth('2026-10', [
      tx('a', '2026-10-01', -10_000, 'DELHAIZE', { categorySlug: 'alimentation' }),
      { ...tx('b', '2026-10-02', -50_000, 'HOTEL MAKKAH', { categorySlug: 'divers' }), currency: 'USD' },
    ], categories);
    expect(r.expenseCents).toBe(10_000);
    expect(r.skippedForeignCurrencyCount).toBe(1);
  });
  it('dimensionne la réserve de précaution', () => {
    const p = planEmergencyFund(137_000, 3, 200_000);
    expect(p.targetCents).toBe(411_000);
    expect(p.gapCents).toBe(211_000);
    expect(p.coveragePermille).toBe(487);
    expect(p.monthsCovered).toBe(1.5);
  });
});

describe('objectifs', () => {
  const hajj = { id: 'g1', kind: 'hajj' as const, name: 'Hajj 2028', targetCents: 800_000, targetDate: '2028-06-01' };
  const allocations = [
    { goalId: 'g1', amountCents: 120_000, allocatedOn: '2026-09-01' },
    { goalId: 'g1', amountCents: 30_000, allocatedOn: '2026-10-01' },
    { goalId: 'g1', amountCents: 99_000, allocatedOn: '2027-01-01' }, // future : ignorée
    { goalId: 'autre', amountCents: 500_000, allocatedOn: '2026-01-01' },
  ];
  it('calcule l’épargne mensuelle requise et le retard', () => {
    const p = planGoal(hajj, allocations, '2026-11-09', 30_000);
    expect(p.savedCents).toBe(150_000);
    expect(p.remainingCents).toBe(650_000);
    expect(p.monthsLeft).toBe(18);
    expect(p.monthlyRequiredCents).toBe(36_112);
    expect(p.progressPermille).toBe(188);
    expect(p.status).toBe('behind');
    expect(p.projectedMonthsAtCurrentPace).toBe(22);
  });
  it('ne déclare pas un objectif « en bonne voie » sans rythme connu', () => {
    expect(planGoal(hajj, allocations, '2026-11-09').status).toBe('to_determine');
  });
  it('mesure le rythme observé sur trois mois', () => {
    expect(observedMonthlyPace(allocations, 'g1', '2026-11-09')).toBe(50_000); // 150 000 / 3
    expect(observedMonthlyPace(allocations, 'g1', '2027-06-01')).toBe(undefined);
    expect(() => planGoal({ ...hajj, targetCents: 0 }, allocations, '2026-11-09')).toThrow();
  });
  it('reconnaît un objectif atteint ou dépassé dans le temps', () => {
    expect(planGoal({ ...hajj, targetCents: 100_000 }, allocations, '2026-11-09').status).toBe('achieved');
    expect(planGoal({ ...hajj, targetDate: '2026-10-01' }, allocations, '2026-11-09').status).toBe('overdue');
    expect(planGoal({ ...hajj, targetDate: '2026-11-30' }, allocations, '2026-11-09').monthlyRequiredCents).toBe(650_000);
  });
});

describe('purification', () => {
  const txs = [
    tx('t1', '2026-10-31', 1_234, 'Intérêt de base compte épargne'),
    tx('t2', '2026-10-31', 567, 'PRIME DE FIDÉLITÉ'),
    tx('t3', '2026-10-31', 890, 'BASISRENTE spaarrekening'),
    tx('t4', '2026-10-15', 300_000, 'SALAIRE'),
    tx('t5', '2026-10-15', -2_000, 'Intérêts débiteurs'), // débit : non concerné
    tx('t6', '2026-10-20', 50_000, 'Remboursement désintéressé'), // faux positif évité
    tx('t7', '2026-10-21', 99, 'Divers', { categorySlug: 'interets' }),
  ];
  it('détecte les intérêts créditeurs en français et en néerlandais', () => {
    const c = detectInterest(txs);
    expect(c.map((x) => x.transactionId)).toEqual(['t1', 't2', 't3', 't7']);
    expect(c.find((x) => x.transactionId === 't2')!.sourceKind).toBe('loyalty_bonus');
    expect(c[0].creditedCents).toBe(1_234);
  });
  it('ignore les éléments déjà suivis', () => {
    expect(detectInterest(txs, new Set(['t1'])).map((x) => x.transactionId)).not.toContain('t1');
  });
  it('distingue brut, précompte et net crédité', () => {
    expect(resolveInterestAmounts({ creditedCents: 7_000, withholdingTaxCents: 3_000 })).toEqual({ creditedCents: 7_000, grossCents: 10_000, withholdingTaxCents: 3_000, consistent: true });
    expect(resolveInterestAmounts({ creditedCents: 7_000, grossCents: 10_000 }).withholdingTaxCents).toBe(3_000);
    expect(resolveInterestAmounts({ creditedCents: 7_000, grossCents: 10_000, withholdingTaxCents: 2_000 }).consistent).toBe(false);
    expect(resolveInterestAmounts({ creditedCents: 7_000 }).grossCents).toBe(null);
  });
  it('n’impose aucune base de purification', () => {
    const r = purificationAmount({ creditedCents: 7_000, withholdingTaxCents: 3_000 }, null);
    expect(r.status).toBe('to_determine');
    expect(r.reason).toBe('basis_not_chosen');
    expect(r.amountCents).toBe(null);
  });
  it('calcule selon la base choisie, ou attend le brut s’il est inconnu', () => {
    expect(purificationAmount({ creditedCents: 7_000, withholdingTaxCents: 3_000 }, 'gross').amountCents).toBe(10_000);
    expect(purificationAmount({ creditedCents: 7_000, withholdingTaxCents: 3_000 }, 'net_credited').amountCents).toBe(7_000);
    const unknown = purificationAmount({ creditedCents: 7_000 }, 'gross');
    expect(unknown.status).toBe('to_determine');
    expect(unknown.reason).toBe('gross_unknown');
    expect(purificationAmount({ creditedCents: 7_000, grossCents: 10_000, withholdingTaxCents: 1 }, 'gross').reason).toBe('inconsistent_amounts');
  });
  it('totalise par statut sans confondre montant connu et montant déterminé', () => {
    const s = summarizePurification([
      { id: '1', creditedCents: 100, amountToPurifyCents: null, status: 'detected' },
      { id: '2', creditedCents: 200, amountToPurifyCents: 250, status: 'confirmed' },
      { id: '3', creditedCents: 300, amountToPurifyCents: 300, status: 'purified' },
      { id: '4', creditedCents: 400, amountToPurifyCents: null, status: 'rejected' },
      { id: '5', creditedCents: 500, amountToPurifyCents: null, status: 'confirmed' },
    ]);
    expect(s).toEqual({ detectedCreditedCents: 100, toPurifyCents: 250, toDetermineCount: 1, toDetermineCreditedCents: 500, purifiedCents: 300, rejectedCreditedCents: 400 });
  });
  it('verrouille les éléments purifiés et exige un montant déterminé', () => {
    expect(canTransition('purified', 'detected')).toBe(false);
    expect(canTransition('detected', 'confirmed')).toBe(true);
    expect(canTransition('confirmed', 'purified', false)).toBe(false);
  });
});

describe('patrimoine', () => {
  const prices = { gold: { pricePerGramCents: 11_000, asOf: '2026-11-08' }, silver: { pricePerGramCents: 130, asOf: '2026-11-08' } };
  it('compte tous les actifs, résidence et épargne bloquée comprises', () => {
    const w = computeNetWorth([
      { id: 'a', kind: 'bank_balance', label: 'Compte', valueCents: 100_000 },
      { id: 'b', kind: 'real_estate_residence', label: 'Maison', valueCents: 25_000_000 },
      { id: 'c', kind: 'pension', label: 'Pension', valueCents: 1_000_000, isAccessible: false },
      { id: 'd', kind: 'gold', label: 'Or', weightMg: 10_000, purityPermille: 1000 },
    ], [{ id: 'l', label: 'Hypothèque', outstandingCents: 15_000_000, due12mCents: 900_000 }], prices, '2026-11-09');
    expect(w.assetsCents).toBe(26_210_000);
    expect(w.netWorthCents).toBe(11_210_000);
    expect(w.status).toBe('complete');
  });
  it('signale un actif impossible à valoriser au lieu de le compter pour zéro', () => {
    const w = computeNetWorth([{ id: 'd', kind: 'gold', label: 'Or', weightMg: 10_000 }], [], { gold: null }, '2026-11-09');
    expect(w.status).toBe('partial');
    expect(w.unvaluedAssetIds).toEqual(['d']);
  });
});
