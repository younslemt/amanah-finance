import { describe, expect, it } from 'vitest';
import { calculateZakat, prepareZakat } from '@amanah/engines';
import { donationsModel, STATUS_LABEL, type ContributionRow } from './contributions-view.ts';
import { DEMO_CALCS, DEMO_CONTRIBUTIONS, DEMO_DEBITS, DEMO_FITR, DEMO_USER } from './demo-donations.ts';
import { zakatHistory, type CalculationRow } from './zakat-view.ts';
import { contributionSchema, fitrSchema, metalPriceSchema, zakatSettingsSchema } from './validation.ts';

// Données fictives
const me = 'u-me';
const other = 'u-other';
const row = (id: string, kind: ContributionRow['kind'], amount: number, paidOn: string, extra: Partial<ContributionRow> = {}): ContributionRow =>
  ({ id, owner_id: me, kind, amount_cents: String(amount), paid_on: paidOn, beneficiary_label: 'Association fictive', ...extra });

describe('dons : modèle d’affichage', () => {
  const m = donationsModel({
    userId: me,
    contributions: [
      row('c1', 'sadaqah', 5_000, '2026-10-03'),
      row('c1', 'sadaqah', 5_000, '2026-10-03'), // chargé deux fois : compté une fois
      row('p1', 'purification', 800, '2026-11-02'),
      row('z1', 'zakat', 25_000, '2026-11-19', { zakat_calculation_id: 'calc', transaction_id: 't-z' }),
      row('x1', 'sadaqah', 9_999, '2026-10-01', { owner_id: other }),
    ],
    fitr: [{ id: 'f', owner_id: me, civil_year: 2026, persons: 4, amount_per_person_cents: 1_000, due_cents: '4000' as unknown as number, amount_source: 'Source fictive' }],
    calculations: [{ id: 'calc', owner_id: me, as_of: '2026-11-15', status: 'due', zakat_due_cents: '30000' }],
    debits: [{ id: 't-don', booked_on: '2026-10-05', amount_cents: '-5000', description: 'VIREMENT ASSOCIATION FICTIVE' }],
  });

  it('totaux de la personne, purification comptée une fois, dons partagés exclus des totaux', () => {
    expect(m.years[0]!.totalCents).toBe(5_000 + 800 + 25_000);
    expect(m.years[0]!.bankMatchedCents).toBe(25_000);
    expect(m.years[0]!.confirmedCents).toBe(0);
    expect(m.views).toHaveLength(4);
    expect(m.views.find((v) => v.id === 'x1')!.mine).toBe(false);
  });
  it('libellés : un rapprochement n’est jamais présenté comme une vérification', () => {
    expect(STATUS_LABEL).toEqual({ declared: 'Déclaré', bank_matched: 'Rapproché avec une opération bancaire', confirmed: 'Confirmé' });
    expect(m.views.find((v) => v.id === 'z1')!.allocation).not.toBeNull();
  });
  it('statut « confirmé » réservé : seulement si la base le porte', () => {
    const c = donationsModel({ userId: me, fitr: [], calculations: [], debits: [],
      contributions: [row('k', 'zakat', 100, '2026-11-01', { transaction_id: 't', confirmation_source: 'partner', confirmed_on: '2026-11-03' })] });
    expect(c.views[0]!.status).toBe('confirmed');
    expect(c.years[0]!.confirmedCents).toBe(100);
  });
  it('purification : affichée, jamais modifiable depuis les dons', () => {
    const p = m.views.find((v) => v.id === 'p1')!;
    expect(p.fromPurification).toBe(true);
    expect(p.editable).toBe(false);
  });
  it('affectation et suivi dû / payé / reste', () => {
    expect(m.views.find((v) => v.id === 'z1')!.allocation).toBe('calcul de Zakat du 15/11/2026');
    expect(m.zakat[0]).toMatchObject({ dueCents: 30_000, paidCents: 25_000, remainingCents: 5_000, asOf: '2026-11-15' });
    expect(m.fitr[0]).toMatchObject({ dueCents: 4_000, paidCents: 0, remainingCents: 4_000, civilYear: 2026, hijriYear: null });
    expect(m.views.find((v) => v.id === 'z1')!.status).toBe('bank_matched');
    expect(m.views.find((v) => v.id === 'c1')!.status).toBe('declared');
  });
  it('rapprochement proposé seulement pour un don déclaré de la personne', () => {
    expect(m.views.find((v) => v.id === 'c1')!.candidates.map((c) => c.transactionId)).toEqual(['t-don']);
    expect(m.views.find((v) => v.id === 'z1')!.candidates).toEqual([]);
    expect(m.views.find((v) => v.id === 'x1')!.candidates).toEqual([]);
  });
  it('démonstration : données fictives cohérentes', () => {
    const d = donationsModel({ userId: DEMO_USER, contributions: DEMO_CONTRIBUTIONS, fitr: DEMO_FITR, calculations: DEMO_CALCS, debits: DEMO_DEBITS });
    expect(d.years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(d.fitr[0]!.remainingCents).toBe(0);
    expect(d.zakat[0]!.remainingCents).toBe(23_000);
  });
});

describe('dons : validation des saisies', () => {
  const base = { kind: 'sadaqah', amount: '50,00', paidOn: '2026-10-03', beneficiary: 'Association fictive' };
  it('purification refusée à la saisie (elle naît du parcours de purification)', () => {
    expect(contributionSchema.safeParse({ ...base, kind: 'purification' }).success).toBe(false);
  });
  it('affectation réservée au type correspondant', () => {
    const calc = '00000000-0000-4000-8000-000000000001';
    expect(contributionSchema.safeParse({ ...base, zakatCalculationId: calc }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, kind: 'zakat', zakatCalculationId: calc }).success).toBe(true);
    expect(contributionSchema.safeParse({ ...base, kind: 'zakat', zakatCalculationId: '' }).success).toBe(true);
  });
  it('Zakat al-Fitr et prix : source obligatoire', () => {
    expect(fitrSchema.safeParse({ civilYear: '2026', persons: '4', amountPerPerson: '10', source: '' }).success).toBe(false);
    expect(fitrSchema.safeParse({ civilYear: '2026', persons: '4', amountPerPerson: '10', source: 'Mosquée fictive' }).success).toBe(true);
    expect(fitrSchema.safeParse({ civilYear: '1447', persons: '4', amountPerPerson: '10', source: 'Mosquée fictive' }).success).toBe(false); // une année hégirienne n'est pas une année civile
    expect(metalPriceSchema.safeParse({ symbol: 'XAU', pricePerGram: '110,00', asOf: '2026-11-18', source: '' }).success).toBe(false);
  });
  it('réglages : rien n’est choisi par défaut, part requise pour le ratio', () => {
    const empty = zakatSettingsSchema.safeParse({ nisabBasis: '', yearBasis: '', hawlStart: '', personalJewelry: '', longTermInvestments: '', longTermRatioPercent: '', lockedPensions: '', debts: '', excluded: [] });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.yearBasis).toBeNull();
    expect(zakatSettingsSchema.safeParse({ excluded: [] }).success).toBe(true); // boutons radio non cochés : champs absents
    expect(zakatSettingsSchema.safeParse({ longTermInvestments: 'custom_ratio', longTermRatioPercent: '', excluded: [] }).success).toBe(false);
    const ok = zakatSettingsSchema.safeParse({ yearBasis: 'lunar', longTermInvestments: 'custom_ratio', longTermRatioPercent: '30', excluded: ['account:00000000-0000-4000-8000-000000000001'] });
    expect(ok.success).toBe(true);
  });
});

describe('Zakat : historique reproductible', () => {
  const input = prepareZakat({
    asOf: '2026-11-20', currency: 'EUR',
    choices: { nisabBasis: 'silver', yearBasis: 'lunar', hawlStart: '2025-11-01' },
    assets: [{ id: 'a1', kind: 'bank_balance', label: 'Compte fictif', valueCents: 1_000_000 }], liabilities: [],
    prices: { silver: { pricePerGramCents: 130, asOf: '2026-11-18' } },
  }).input!;
  const result = calculateZakat(input);
  const calc = (id: string, asOf: string, due: number, net: number, extra: Partial<CalculationRow> = {}): CalculationRow => ({
    id, owner_id: me, as_of: asOf, status: 'due', zakat_due_cents: due, zakatable_cents: net, nisab_cents: 77_350,
    engine_version: '0.1.0', ruleset_id: 'amanah-zakat', ruleset_version: '1.0.0', created_at: `${asOf}T10:00:00Z`,
    inputs: { engineInput: input, notApplicable: [], excludedSourceIds: [], priceSources: { gold: null, silver: 'Cotation fictive' } },
    result: JSON.parse(JSON.stringify(result)), ...extra,
  });
  it('recalcul identique, écart avec le calcul précédent, calcul ancien non vérifiable', () => {
    const h = zakatHistory([
      calc('old', '2025-11-20', 20_000, 800_000, { inputs: { fictif: true } }),
      calc('new', '2026-11-20', result.dueCents, result.netZakatableCents),
      calc('autre', '2026-11-20', 1, 1, { owner_id: other }),
    ], me, [{ id: 'new', dueCents: result.dueCents, paidCents: 10_000, bankMatchedPaidCents: 0, confirmedPaidCents: 0, remainingCents: result.dueCents - 10_000, excessCents: 0, contributionIds: ['z'] }]);
    expect(h.map((e) => e.id)).toEqual(['new', 'old']);
    expect(h[0]!.replay).toEqual({ reproducible: true, engineVersionMatches: true, differences: [] });
    expect(h[0]!.change).toEqual({ netCents: result.netZakatableCents - 800_000, dueCents: result.dueCents - 20_000, previousAsOf: '2025-11-20' });
    expect(h[0]!.settlement!.paidCents).toBe(10_000);
    expect(h[1]!.replay.reproducible).toBeNull();
  });
  it('résultat altéré détecté au recalcul', () => {
    const [e] = zakatHistory([calc('x', '2026-11-20', 1, 1, { result: { ...result, netZakatableCents: 1 } })], me);
    expect(e!.replay).toMatchObject({ reproducible: false, differences: ['netZakatableCents'] });
  });
});
