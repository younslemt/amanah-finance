import { describe, expect, it } from 'vitest';
import {
  analyzeFinances, applyAdjustments, completeMonthsBefore, detectInternalTransfers, matchInternalTransfers, planGoal, proposeAllocation, recommend,
  scenarioBaseline, scenarioBudgetLines, seriesKey, simulateScenario, trackScenario,
  type AnalysisCategory, type AnalysisInput, type Goal, type Transaction,
} from '../src/index.ts';

/** Foyer FICTIF : 6 mois complets (mai à octobre 2026), analysé le 10 novembre 2026. */
const CATS: AnalysisCategory[] = [
  { slug: 'salaire', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'autres_revenus', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'interets', kind: 'income', isEssential: false, isInterest: true },
  { slug: 'logement', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'fixed' },
  { slug: 'energie', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'fixed' },
  { slug: 'telecom', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'fixed' },
  { slug: 'alimentation', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'variable' },
  { slug: 'loisirs', kind: 'expense', isEssential: false, isInterest: false, defaultNature: 'variable' },
  { slug: 'restaurants', kind: 'expense', isEssential: false, isInterest: false, defaultNature: 'variable' },
  { slug: 'divers', kind: 'expense', isEssential: false, isInterest: false, defaultNature: 'variable' },
  { slug: 'epargne', kind: 'transfer', isEssential: false, isInterest: false },
];
const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
let seq = 0;
const t = (bookedOn: string, amountCents: number, description: string, categorySlug?: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`, accountId: 'courant', bookedOn, amountCents, currency: 'EUR', description, counterpartyName: description, categorySlug, ...extra,
});

function household(opts: { salary?: number; resto?: (i: number) => number } = {}): Transaction[] {
  seq = 0;
  const out: Transaction[] = [];
  MONTHS.forEach((m, i) => {
    out.push(
      t(`${m}-01`, opts.salary ?? 300_000, 'EMPLOYEUR FICTIF SA', 'salaire'),
      t(`${m}-02`, -100_000, 'PROPRIETAIRE FICTIF', 'logement'),
      t(`${m}-05`, -12_000, 'ENERGIE FICTIVE', 'energie'),
      t(`${m}-06`, -4_500, 'TELECOM FICTIF', 'telecom'),
      t(`${m}-10`, -1_599, 'STREAMING FICTIF', 'loisirs'),
      t(`${m}-08`, -9_000, 'SUPERMARCHE A', 'alimentation'),
      t(`${m}-15`, -8_000, 'SUPERMARCHE B', 'alimentation'),
      t(`${m}-22`, -9_500, 'SUPERMARCHE C', 'alimentation'),
      t(`${m}-18`, -(opts.resto ? opts.resto(i) : 3_000 + i * 1_000), 'RESTAURANT FICTIF', 'restaurants'),
    );
  });
  out.push(
    t('2026-05-20', -89_900, 'MAGASIN TELEVISEUR', 'divers'),                                     // dépense exceptionnelle
    t('2026-06-25', -50_000, 'VERS COMPTE EPARGNE'),                                               // virement interne…
    t('2026-06-26', 50_000, 'DEPUIS COMPTE COURANT', undefined, { accountId: 'epargne' }),        // …et sa contrepartie
    t('2026-07-12', 4_000, 'SUPERMARCHE A REMBOURSEMENT', 'alimentation'),                         // remboursement
    t('2026-08-15', 25_000, 'REMBOURSEMENT IMPOTS', 'autres_revenus'),                             // revenu exceptionnel
    t('2026-10-31', 1_234, 'INTERETS CREDITEURS', 'interets', { isInterest: true, accountId: 'epargne' }),
    t('2026-09-03', -2_000, 'ACHAT EN DOLLARS', 'divers', { currency: 'USD' }),
    t('2026-11-03', -7_000, 'MOIS EN COURS', 'restaurants'),                                       // hors fenêtre
  );
  return out;
}

const base = (over: Partial<AnalysisInput> = {}): AnalysisInput => ({
  asOf: '2026-11-10', transactions: household(), categories: CATS,
  accounts: [{ id: 'courant', type: 'current', balanceCents: 500_000 }, { id: 'epargne', type: 'savings', balanceCents: 300_000 }],
  ...over,
});

describe('Financial Analysis Engine — compartiments', () => {
  const a = analyzeFinances(base());
  const txs = household();
  const bucketOf = (desc: string) => a.buckets[txs.find((x) => x.description === desc)!.id];

  it('analyse les 6 mois complets, sans le mois en cours', () => {
    expect(completeMonthsBefore('2026-11-10', 6)).toEqual(MONTHS);
    expect(a.months.map((m) => m.month)).toEqual(MONTHS);
    expect(a.reliability).toBe('high');
  });
  it('range chaque opération dans un seul compartiment (aucun double comptage)', () => {
    expect(bucketOf('VERS COMPTE EPARGNE')).toBe('transfer');
    expect(bucketOf('DEPUIS COMPTE COURANT')).toBe('transfer');
    expect(bucketOf('SUPERMARCHE A REMBOURSEMENT')).toBe('refund');
    expect(bucketOf('REMBOURSEMENT IMPOTS')).toBe('exceptional_income');
    expect(bucketOf('INTERETS CREDITEURS')).toBe('interest');
    expect(bucketOf('MAGASIN TELEVISEUR')).toBe('exceptional_expense');
    expect(bucketOf('ACHAT EN DOLLARS')).toBe('skipped_currency');
    expect(a.skippedForeignCurrency).toBe(1);
    // Contrôle de bouclage : la somme des compartiments par mois = somme des opérations retenues
    for (const m of a.months) {
      const retained = txs.filter((x) => x.bookedOn.startsWith(m.month) && x.currency === 'EUR'
        && !['transfer', 'interest'].includes(a.buckets[x.id]));
      const sum = retained.reduce((s, x) => s + x.amountCents, 0);
      expect(m.netCents, m.month).toBe(sum);
    }
  });
  it('sépare revenus réguliers et exceptionnels, charges fixes et variables', () => {
    const aug = a.months.find((m) => m.month === '2026-08')!;
    expect(aug.regularIncomeCents).toBe(300_000);
    expect(aug.exceptionalIncomeCents).toBe(25_000);
    expect(aug.fixedExpenseCents).toBe(118_099); // loyer + énergie + télécom + abonnement
    const jul = a.months.find((m) => m.month === '2026-07')!;
    expect(jul.refundCents).toBe(4_000);
    expect(jul.variableExpenseCents).toBe(26_500 + 5_000 - 4_000);
    expect(jul.categories.alimentation).toBe(22_500);
    expect(a.months[0].exceptionalExpenseCents).toBe(89_900);
    expect(a.months[1].transferCents).toBe(100_000);
  });
  it('les dépenses essentielles sont un attribut, pas un compartiment', () => {
    const aug = a.months.find((m) => m.month === '2026-08')!;
    expect(aug.essentialExpenseCents).toBe(100_000 + 12_000 + 4_500 + 26_500);
    expect(aug.essentialExpenseCents).toBeLessThanOrEqual(aug.totalExpenseCents);
  });
});

describe('Financial Analysis Engine — récurrences', () => {
  const a = analyzeFinances(base());
  it('détecte abonnements, charges fixes et revenus récurrents avec la prochaine échéance', () => {
    const streaming = a.recurring.find((s) => s.label === 'STREAMING FICTIF')!;
    expect(streaming).toMatchObject({ kind: 'subscription', cadence: 'monthly', occurrences: 6, monthlyEquivalentCents: 1_599, active: true, lastDate: '2026-10-10' });
    expect(streaming.nextExpectedDate).toBe('2026-11-10');
    expect(a.recurring.find((s) => s.label === 'TELECOM FICTIF')!.kind).toBe('subscription');
    expect(a.recurring.find((s) => s.label === 'PROPRIETAIRE FICTIF')!.kind).toBe('fixed_charge');
    expect(a.recurring.find((s) => s.label === 'EMPLOYEUR FICTIF SA')!.kind).toBe('income');
  });
  it('ne prend jamais une dépense isolée ou de montant irrégulier pour une récurrence', () => {
    expect(a.recurring.some((s) => s.label === 'MAGASIN TELEVISEUR')).toBe(false);
    expect(a.recurring.some((s) => s.label === 'RESTAURANT FICTIF')).toBe(false); // montants qui varient de plus de 10 %
  });
  it('détecte une cadence annuelle', () => {
    const txs = [t('2024-03-15', -12_000, 'ASSURANCE FICTIVE', 'loisirs'), t('2025-03-14', -12_500, 'ASSURANCE FICTIVE', 'loisirs'), t('2026-03-16', -12_400, 'ASSURANCE FICTIVE', 'loisirs')];
    const r = analyzeFinances({ ...base(), transactions: [...household(), ...txs], months: 36 });
    const s = r.recurring.find((x) => x.label === 'ASSURANCE FICTIVE')!;
    expect(s).toMatchObject({ cadence: 'yearly', monthlyEquivalentCents: 1_033 });
  });
  it('respecte le choix « ce n’est pas une dépense récurrente »', () => {
    const key = seriesKey({ description: 'STREAMING FICTIF', counterpartyName: 'STREAMING FICTIF', amountCents: -1 });
    const r = analyzeFinances(base({ notRecurring: new Set([key]) }));
    expect(r.recurring.some((s) => s.key === key)).toBe(false);
  });
  it('ne prend pour virement que des opérations neutres, proches et concordantes', () => {
    const ids = detectInternalTransfers([
      t('2026-06-01', -10_000, 'VERS COMPTE EPARGNE'), t('2026-06-02', 10_000, 'DEPUIS COMPTE COURANT', undefined, { accountId: 'epargne' }),
      t('2026-06-01', -20_000, 'VERS COMPTE EPARGNE'), t('2026-06-09', 20_000, 'DEPUIS COMPTE COURANT', undefined, { accountId: 'epargne' }), // trop tard
      t('2026-06-01', -30_000, 'VERS COMPTE EPARGNE'), t('2026-06-01', 30_000, 'DEPUIS COMPTE COURANT'),                                 // même compte
    ], new Map(CATS.map((c) => [c.slug, c])));
    expect(ids.size).toBe(2);
  });
});

describe('Financial Analysis Engine — virements internes', () => {
  const cats = new Map(CATS.map((c) => [c.slug, c]));
  const accounts = [{ id: 'courant', type: 'current', balanceCents: 0, ibanLast4: '1111' }, { id: 'epargne', type: 'savings', balanceCents: 0, ibanLast4: '2222' }];
  it('confirme un vrai virement : libellés de virement des deux côtés', () => {
    const [m] = matchInternalTransfers([t('2026-06-25', -50_000, 'VERS COMPTE EPARGNE'), t('2026-06-26', 50_000, 'DEPUIS COMPTE COURANT', undefined, { accountId: 'epargne' })], cats);
    expect(m).toMatchObject({ status: 'confirmed', score: 2, reasons: ['transfer_label'] });
  });
  it('confirme un vrai virement : IBAN de la contrepartie = compte du foyer', () => {
    const [m] = matchInternalTransfers([
      t('2026-06-25', -50_000, 'VIREMENT', undefined, { counterpartyIbanLast4: '2222', counterpartyName: undefined }),
      t('2026-06-25', 50_000, 'VIREMENT', undefined, { accountId: 'epargne', counterpartyName: undefined }),
    ], cats, accounts);
    expect(m.status).toBe('confirmed');
    expect(m.reasons).toEqual(['iban_match', 'same_day']);
  });
  it('confirme un virement catégorisé comme transfert', () => {
    const [m] = matchInternalTransfers([t('2026-06-25', -50_000, 'ORDRE PERMANENT', 'epargne'), t('2026-06-27', 50_000, 'VERSEMENT RECU', undefined, { accountId: 'epargne' })], cats);
    expect(m).toMatchObject({ status: 'confirmed', reasons: ['transfer_category'] });
  });
  it('montant identique sans preuve : incertain, et les opérations restent comptées', () => {
    const txs = [...household(), t('2026-08-12', -7_500, 'ACHAT EN LIGNE FICTIF'), t('2026-08-13', 7_500, 'VIREMENT DE MARIE FICTIVE', undefined, { accountId: 'epargne' })];
    const a = analyzeFinances(base({ transactions: txs }));
    const m = a.transfers.find((x) => x.amountCents === 7_500)!;
    expect(m.status).toBe('uncertain');
    expect(a.buckets[m.debitId]).not.toBe('transfer');
    expect(a.buckets[m.creditId]).toBe('exceptional_income');
  });
  it('n’apparie jamais une dépense reconnue, un salaire, un remboursement ou des intérêts', () => {
    const m = matchInternalTransfers([
      t('2026-06-02', -95_000, 'LOYER', 'logement'), t('2026-06-02', 95_000, 'VIREMENT', undefined, { accountId: 'epargne' }),
      t('2026-06-01', -280_000, 'VIREMENT', undefined), t('2026-06-01', 280_000, 'SALAIRE', 'salaire', { accountId: 'epargne' }),
      t('2026-06-03', -4_000, 'VIREMENT', undefined), t('2026-06-03', 4_000, 'REMBOURSEMENT', 'alimentation', { accountId: 'epargne' }),
      t('2026-06-30', -1_234, 'VIREMENT', undefined), t('2026-06-30', 1_234, 'INTERETS', 'interets', { accountId: 'epargne', isInterest: true }),
    ], cats);
    expect(m).toEqual([]);
  });
  it('plusieurs appariements possibles : incertain (ambigu)', () => {
    const m = matchInternalTransfers([
      t('2026-06-25', -10_000, 'VERS COMPTE EPARGNE'),
      t('2026-06-25', 10_000, 'DEPUIS COMPTE COURANT', undefined, { accountId: 'epargne' }),
      t('2026-06-26', 10_000, 'DEPUIS COMPTE COURANT', undefined, { accountId: 'livret' }),
    ], cats);
    expect(m).toHaveLength(1);
    expect(m[0].status).toBe('uncertain');
    expect(m[0].reasons).toContain('ambiguous');
  });
  it('respecte la décision de l’utilisateur (confirmé ou rejeté)', () => {
    const txs = [t('2026-08-12', -7_500, 'ACHAT EN LIGNE FICTIF'), t('2026-08-13', 7_500, 'VIREMENT DE MARIE FICTIVE', undefined, { accountId: 'epargne' })];
    const key = `${txs[0].id}|${txs[1].id}`;
    expect(matchInternalTransfers(txs, cats, [], new Map([[key, 'confirmed' as const]]))[0]).toMatchObject({ status: 'confirmed', reasons: ['user_confirmed'] });
    expect(matchInternalTransfers(txs, cats, [], new Map([[key, 'rejected' as const]]))).toEqual([]);
  });
});

describe('Financial Analysis Engine — couverture des données', () => {
  it('historique complet : couverture complète', () => {
    const a = analyzeFinances(base());
    expect(a.coverage).toMatchObject({ status: 'complete', incompleteMonths: [], issues: [] });
    expect(a.coverage.completeMonths).toEqual(MONTHS);
  });
  it('un mois sans aucune opération sur le compte courant est exclu des calculs', () => {
    const a = analyzeFinances(base({ transactions: household().filter((x) => !(x.bookedOn.startsWith('2026-07') && x.accountId === 'courant')) }));
    expect(a.coverage.incompleteMonths).toEqual(['2026-07']);
    expect(a.coverage.status).toBe('partial');
    expect(a.coverage.issues[0]).toMatchObject({ code: 'month_gap', accountId: 'courant', month: '2026-07' });
    expect(a.monthsWithData).toBe(5);
    expect(a.capacity.monthsUsed).toBe(5);
    expect(a.months.find((m) => m.month === '2026-07')!.complete).toBe(false);
  });
  it('un relevé arrêté en milieu de mois rend ce mois incomplet', () => {
    const a = analyzeFinances(base({ transactions: household().filter((x) => x.bookedOn < '2026-10-12' || x.accountId !== 'courant') }));
    expect(a.coverage.incompleteMonths).toEqual(['2026-10']);
    expect(a.coverage.issues.map((i) => i.code)).toEqual(['statement_stops_early']);
  });
  it('signale un compte courant sans opérations ou commencé plus tard, sans inventer de manque', () => {
    const a = analyzeFinances(base({ accounts: [
      { id: 'courant', type: 'current', balanceCents: 500_000 }, { id: 'carte', type: 'credit_card', balanceCents: -20_000 },
      { id: 'epargne', type: 'savings', balanceCents: 300_000 },
    ] }));
    expect(a.coverage.status).toBe('partial');
    expect(a.coverage.issues).toEqual([{ code: 'account_without_transactions', accountId: 'carte' }]);
    expect(a.coverage.incompleteMonths).toEqual([]);
    const later = analyzeFinances(base({ transactions: [...household(), t('2026-09-05', -3_000, 'ACHAT CARTE', 'divers', { accountId: 'carte' }), t('2026-10-30', -2_000, 'ACHAT CARTE', 'divers', { accountId: 'carte' })],
      accounts: [{ id: 'courant', type: 'current', balanceCents: 0 }, { id: 'carte', type: 'credit_card', balanceCents: 0 }] }));
    expect(later.coverage.issues).toContainEqual({ code: 'account_starts_later', accountId: 'carte', month: '2026-09' });
  });
  it('moins de 3 mois complets : couverture insuffisante, aucun chiffre', () => {
    const a = analyzeFinances(base({ transactions: household().filter((x) => x.bookedOn < '2026-06-01' || x.bookedOn >= '2026-10-01') }));
    expect(a.coverage.status).toBe('insufficient');
    expect(a.capacity.estimatedCents).toBeNull();
  });
});

describe('Financial Analysis Engine — capacité d’épargne, budgets, réserve', () => {
  const a = analyzeFinances(base({ budgets: [{ month: '2026-08', categorySlug: 'alimentation', limitCents: 25_000 }] }));
  it('calcule capacités observée et estimée avec leur méthode', () => {
    expect(a.capacity).toEqual({
      observedCents: 149_901, estimatedCents: 150_401, regularIncomeCents: 300_000,
      fixedExpenseCents: 118_099, variableExpenseCents: 31_500, monthsUsed: 6, reliability: 'high',
    });
  });
  it('ne chiffre rien avec moins de 3 mois complets', () => {
    const r = analyzeFinances({ ...base(), transactions: household().filter((x) => x.bookedOn >= '2026-09-01') });
    expect(r.monthsWithData).toBe(2);
    expect(r.reliability).toBe('insufficient');
    expect(r.capacity.observedCents).toBeNull();
    expect(r.capacity.estimatedCents).toBeNull();
    expect(r.reserve).toBeNull();
  });
  it('n’invente pas de mois sans données (premier mois partiel exclu)', () => {
    const r = analyzeFinances({ ...base(), transactions: household().filter((x) => x.bookedOn >= '2026-07-10') });
    expect(r.months[0].month).toBe('2026-08');
  });
  it('repère un dépassement répété, budget reconduit d’un mois à l’autre', () => {
    const v = a.variance.find((x) => x.categorySlug === 'alimentation')!;
    expect(v).toMatchObject({ overMonths: 3, repeated: true, averageOverrunCents: 1_500, limitCents: 25_000 });
  });
  it('évalue la réserve sur les comptes d’épargne et les dépenses essentielles médianes', () => {
    expect(a.reserve).toMatchObject({ avgEssentialMonthlyCents: 143_000, targetCents: 429_000, currentCents: 300_000, gapCents: 129_000, accountIds: ['epargne'] });
    const r = analyzeFinances(base({ accounts: [{ id: 'courant', type: 'current', balanceCents: 500_000, countsAsReserve: true }] }));
    expect(r.reserve!.currentCents).toBe(500_000);
  });
  it('respecte la nature choisie par le foyer', () => {
    const r = analyzeFinances(base({ natureOverrides: { restaurants: 'fixed' } }));
    expect(r.months[0].fixedExpenseCents).toBe(118_099 + 3_000);
  });
});

describe('Budget Optimization Engine', () => {
  const a = analyzeFinances(base());
  const goal: Goal = { id: 'g1', kind: 'personal', name: 'Projet fictif', targetCents: 1_000_000, targetDate: '2030-01-01', monthlyCapacityCents: 50_000 };

  it('simule −50 €/mois : situation, amélioration, impacts mensuel et annuel', () => {
    const s = simulateScenario(a, [{ type: 'total', monthlyCents: 5_000 }], [{ goal, allocations: [] }]);
    expect(s.available).toBe(true);
    expect(s.current.capacityCents).toBe(150_401);
    expect(s.potentialMonthlyCents).toBe(5_000);
    expect(s.potentialAnnualCents).toBe(60_000);
    expect(s.after.capacityCents).toBe(155_401);
    // Capacité réellement disponible : estimée − déjà engagée sur les objectifs
    expect(s.capacity).toEqual({ estimatedCents: 150_401, committedCents: 50_000, availableCents: 100_401, availableAfterCents: 105_401 });
    // Simulation individuelle : alternative exclusive
    const g = s.individual[0];
    expect(g.exclusive).toBe(true);
    expect(g.before.projectedMonthsAtCurrentPace).toBe(20);
    expect(g.after.projectedMonthsAtCurrentPace).toBe(19);
    expect(s.reserve).toEqual({ gapCents: 129_000, monthsToTargetBefore: 2, monthsToTargetAfter: 2 });
  });
  it('répartition globale : jamais de double allocation entre objectifs', () => {
    const goals: Goal[] = [
      { id: 'a', kind: 'personal', name: 'A', targetCents: 3_000_000, targetDate: '2027-11-01' },
      { id: 'b', kind: 'children_education', name: 'B', targetCents: 3_000_000, targetDate: '2027-12-01' },
      { id: 'c', kind: 'real_estate', name: 'C', targetCents: 3_000_000, targetDate: '2028-01-01' },
    ];
    const s = simulateScenario(a, [{ type: 'total', monthlyCents: 20_000 }], goals.map((goal) => ({ goal, allocations: [] })));
    const sumBefore = s.allocation.lines.reduce((t, l) => t + l.extraBeforeCents, 0);
    const sumAfter = s.allocation.lines.reduce((t, l) => t + l.extraAfterCents, 0);
    expect(sumBefore).toBeLessThanOrEqual(Math.max(0, s.capacity.availableCents!));
    expect(sumAfter).toBeLessThanOrEqual(Math.max(0, s.capacity.availableAfterCents!));
    expect(sumAfter - sumBefore).toBeLessThanOrEqual(s.potentialMonthlyCents);
    expect(sumAfter + s.allocation.unallocatedAfterCents).toBe(s.capacity.availableAfterCents);
    // Les besoins dépassent la capacité : tout est affecté, à l'objectif le plus proche d'abord
    expect(s.allocation.unallocatedAfterCents).toBe(0);
    expect(s.allocation.lines[0].extraAfterCents).toBeGreaterThan(s.allocation.lines[2].extraAfterCents);
    // Les simulations individuelles, elles, ne s'additionnent pas : chacune reçoit toute l'économie
    expect(s.individual.every((g) => g.paceAfterCents - g.paceBeforeCents === s.potentialMonthlyCents)).toBe(true);
  });
  it('capacité déjà engagée : rien à répartir, l’économie reste disponible', () => {
    const big: Goal = { id: 'g', kind: 'personal', name: 'G', targetCents: 100_000, targetDate: '2030-01-01', monthlyCapacityCents: 200_000 };
    const s = simulateScenario(a, [{ type: 'total', monthlyCents: 5_000 }], [{ goal: big, allocations: [] }]);
    expect(s.capacity.availableCents).toBe(-49_599);
    expect(s.allocation.allocatedBeforeCents).toBe(0);
    expect(s.allocation.allocatedAfterCents).toBe(0);
    expect(s.reserve!.monthsToTargetBefore).toBeNull(); // aucune capacité disponible pour la réserve
  });
  it('ne modifie aucune donnée d’entrée', () => {
    const input = base();
    const frozen = JSON.stringify(input.transactions);
    simulateScenario(analyzeFinances(input), [{ type: 'total', monthlyCents: 5_000 }], []);
    expect(JSON.stringify(input.transactions)).toBe(frozen);
  });
  it('plafonne et évite le double comptage (résiliation + réduction de la même catégorie)', () => {
    const streaming = a.recurring.find((x) => x.label === 'STREAMING FICTIF')!;
    const applied = applyAdjustments(a, [
      { type: 'category', categorySlug: 'loisirs', monthlyCents: 5_000 },
      { type: 'cancel_recurring', seriesKey: streaming.key },
    ]);
    expect(applied[1].monthlyCents).toBe(1_599);
    expect(applied[0]).toMatchObject({ monthlyCents: 0, capped: true }); // plus rien à économiser dans la catégorie
    const big = applyAdjustments(a, [{ type: 'total', monthlyCents: 10_000_000 }]);
    expect(big[0]).toMatchObject({ monthlyCents: 31_500, capped: true });
  });
  it('refuse de simuler sans données suffisantes', () => {
    const r = analyzeFinances({ ...base(), transactions: household().filter((x) => x.bookedOn >= '2026-09-01') });
    expect(simulateScenario(r, [{ type: 'total', monthlyCents: 5_000 }])).toMatchObject({ available: false, reason: 'insufficient_data', potentialMonthlyCents: 0 });
  });
  it('propose une réallocation : objectifs en retard d’abord, puis par échéance', () => {
    const g2: Goal = { id: 'g2', kind: 'children_education', name: 'Études', targetCents: 120_000, targetDate: '2027-06-01' };
    const g3: Goal = { id: 'g3', kind: 'real_estate', name: 'Apport', targetCents: 600_000, targetDate: '2026-12-01' };
    const plans = [g2, g3].map((g) => ({ goal: g, plan: planGoal(g, [], '2026-11-10', 0) }));
    const p = proposeAllocation(100_000, plans);
    expect(p.lines.map((l) => l.goalId)).toEqual(['g3', 'g2']);
    expect(p.lines[0].proposedCents).toBe(100_000);
    expect(p.unallocatedCents).toBe(0);
  });
  it('suit un scénario enregistré face aux dépenses réelles', () => {
    const adj = [{ type: 'category' as const, categorySlug: 'restaurants', monthlyCents: 2_000 }];
    const baseline = scenarioBaseline(analyzeFinances({ ...base(), asOf: '2026-08-10' }), adj, '2026-08-10');
    expect(baseline.categories.restaurants).toBe(4_000);
    const track = trackScenario(a, adj, baseline);
    expect(track.months).toEqual(['2026-09', '2026-10']);
    expect(track.lines[0]).toMatchObject({ baselineCents: 4_000, targetCents: 2_000, actualCents: 7_500, onTrack: false });
  });
});

describe('Recommendation Engine', () => {
  const goal: Goal = { id: 'g1', kind: 'personal', name: 'Projet fictif', targetCents: 1_000_000, targetDate: '2030-01-01', monthlyCapacityCents: 50_000 };
  const plan = (a: ReturnType<typeof analyzeFinances>) => [{ goal, plan: planGoal(goal, [], a.asOf) }];

  it('sans données suffisantes : une seule indication, jamais chiffrée', () => {
    const a = analyzeFinances({ ...base(), transactions: household().filter((x) => x.bookedOn >= '2026-09-01') });
    const r = recommend({ analysis: a, goals: [] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ ruleId: 'R0', impact: null });
  });
  it('produit R2, R3, R4 et R6 justifiés par les données, hiérarchisés', () => {
    const a = analyzeFinances(base({ budgets: [{ month: '2026-08', categorySlug: 'alimentation', limitCents: 25_000 }] }));
    const r = recommend({ analysis: a, goals: plan(a) });
    expect(r.map((x) => x.ruleId)).toEqual(['R3', 'R4', 'R2', 'R6']);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    for (const x of r) {
      expect(x.data.length).toBeGreaterThan(0);
      expect(x.finding.code).toBeTruthy();
      expect(x.proposal.code).toBeTruthy();
    }
    const r2 = r.find((x) => x.ruleId === 'R2')!;
    expect(r2.impact).toEqual({ monthlyCents: 10_750, annualCents: 129_000, params: { gapCents: 129_000 } });
    const r4 = r.find((x) => x.ruleId === 'R4')!;
    expect(r4.finding.params).toMatchObject({ freeCents: 100_401, committedCents: 50_000 });
    const r6 = r.find((x) => x.ruleId === 'R6')!;
    expect(r6.impact).toMatchObject({ monthlyCents: 6_099, params: { kind: 'upper_bound' } });
  });
  it('R1 : dépenses supérieures aux revenus, priorité critique', () => {
    const a = analyzeFinances(base({ transactions: household({ salary: 140_000 }) }));
    const r = recommend({ analysis: a, goals: [] });
    expect(r[0]).toMatchObject({ ruleId: 'R1', severity: 'critical' });
    expect(r[0].impact!.monthlyCents).toBe(-a.capacity.observedCents!);
    expect(r.some((x) => x.ruleId === 'R4')).toBe(false); // pas de capacité à affecter
  });
  it('R5 : concentration excessive d’une catégorie non essentielle', () => {
    const a = analyzeFinances(base({ transactions: household({ resto: (i) => 60_000 + i * 7_000 }) }));
    const r5 = recommend({ analysis: a, goals: [] }).find((x) => x.ruleId === 'R5')!;
    expect(r5.subject).toBe('restaurants');
    expect(r5.impact!.monthlyCents).toBe(7_750); // 10 % de la médiane (77 500)
  });
  it('une recommandation écartée ne revient pas tant que la situation ne change pas', () => {
    const a = analyzeFinances(base());
    const first = recommend({ analysis: a, goals: plan(a) });
    const hidden = new Set([first[0].fingerprint]);
    expect(recommend({ analysis: a, goals: plan(a) }, ).map((x) => x.fingerprint)).toContain(first[0].fingerprint);
    expect(recommend({ analysis: a, goals: plan(a), hidden }).map((x) => x.fingerprint)).not.toContain(first[0].fingerprint);
  });
  it('n’utilise aucun objectif qui ne lui est pas fourni (objectifs religieux sans consentement)', () => {
    const a = analyzeFinances(base());
    const hajj: Goal = { id: 'h', kind: 'hajj', name: 'Hajj', targetCents: 900_000, targetDate: '2028-01-01', monthlyCapacityCents: 40_000 };
    const without = recommend({ analysis: a, goals: [] }).find((x) => x.ruleId === 'R4')!;
    const withHajj = recommend({ analysis: a, goals: [{ goal: hajj, plan: planGoal(hajj, [], a.asOf) }] }).find((x) => x.ruleId === 'R4')!;
    expect(without.finding.params.committedCents).toBe(0);
    expect(withHajj.finding.params.committedCents).toBe(40_000);
    expect(JSON.stringify(without)).not.toContain('hajj');
  });
});

describe('Recommendation Engine — pertinence', () => {
  it('ignore un dépassement minime (pas de recommandation artificielle)', () => {
    const a = analyzeFinances(base({ budgets: [{ month: '2026-08', categorySlug: 'alimentation', limitCents: 26_000 }] }));
    expect(a.variance[0].repeated).toBe(true);
    expect(recommend({ analysis: a, goals: [] }).some((x) => x.ruleId === 'R3')).toBe(false); // 5 € de dépassement
  });
  it('compte le rythme d’affectation observé comme un engagement', () => {
    const a = analyzeFinances(base());
    const g: Goal = { id: 'g', kind: 'personal', name: 'x', targetCents: 10_000_000, targetDate: '2040-01-01' };
    const r4 = recommend({ analysis: a, goals: [{ goal: g, plan: planGoal(g, [], a.asOf), paceCents: 120_000 }] }).find((x) => x.ruleId === 'R4')!;
    expect(r4.finding.params.committedCents).toBe(120_000);
  });
});

describe('Budget Optimization Engine — décision', () => {
  it('traduit un scénario en plafonds par catégorie (jamais pour une réduction globale)', () => {
    const a = analyzeFinances(base());
    const streaming = a.recurring.find((x) => x.label === 'STREAMING FICTIF')!;
    const lines = scenarioBudgetLines(a, [
      { type: 'category', categorySlug: 'restaurants', monthlyCents: 1_550 },
      { type: 'cancel_recurring', seriesKey: streaming.key },
      { type: 'total', monthlyCents: 5_000 },
    ]);
    expect(lines).toEqual([
      { categorySlug: 'loisirs', medianCents: 1_599, limitCents: 0 },
      { categorySlug: 'restaurants', medianCents: 5_500, limitCents: 4_000 },
    ]);
  });
});
