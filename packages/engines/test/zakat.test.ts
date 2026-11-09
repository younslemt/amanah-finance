import { describe, expect, it } from 'vitest';
import { calculateZakat, type ZakatInput, type ZakatOptions } from '../src/index.ts';

// Prix fictifs de test : or 110 €/g, argent 1,30 €/g
const prices = {
  gold: { pricePerGramCents: 11_000, asOf: '2026-11-08' },
  silver: { pricePerGramCents: 130, asOf: '2026-11-08' },
};

const defaults: ZakatOptions = {
  nisabBasis: 'silver',
  yearBasis: 'lunar',
  personalJewelry: 'exclude',
  longTermInvestments: { mode: 'full_market_value' },
  lockedPensions: 'exclude',
  debts: 'due_12_months',
};

function input(overrides: Partial<ZakatInput> = {}, options: Partial<ZakatOptions> = {}): ZakatInput {
  return {
    asOf: '2026-11-09',
    currency: 'EUR',
    hawlStart: '2025-11-20', // exactement 354 jours
    prices,
    assets: [
      { id: 'a1', kind: 'bank_balance', label: 'Compte courant', valueCents: 1_200_000 },
      { id: 'a2', kind: 'cash', label: 'Espèces', valueCents: 50_000 },
      { id: 'a3', kind: 'gold', label: 'Lingotin 18 carats', weightMg: 20_000, purityPermille: 750 },
      { id: 'a4', kind: 'jewelry_personal', label: 'Bijoux portés', weightMg: 30_000, purityPermille: 750, metal: 'gold' },
      { id: 'a5', kind: 'stocks_funds', label: 'ETF long terme', valueCents: 1_000_000, heldFor: 'long_term' },
      { id: 'a6', kind: 'pension', label: 'Épargne-pension', valueCents: 2_000_000, isAccessible: false },
      { id: 'a7', kind: 'real_estate_residence', label: 'Résidence principale', valueCents: 30_000_000 },
      { id: 'a8', kind: 'receivable', label: 'Prêt à un frère', valueCents: 100_000, receivableLikely: true },
    ],
    liabilities: [{ id: 'l1', label: 'Crédit hypothécaire', outstandingCents: 15_000_000, due12mCents: 1_200_000 }],
    options: { ...defaults, ...options },
    ...overrides,
  };
}

describe('calculateZakat — référentiel amanah-zakat 1.0.0', () => {
  it('calcule l’assiette, le nisab et la Zakat avec les options par défaut', () => {
    const r = calculateZakat(input());
    expect(r.grossZakatableCents).toBe(2_515_000);
    expect(r.deductibleDebtsCents).toBe(1_200_000);
    expect(r.netZakatableCents).toBe(1_315_000);
    expect(r.nisabCents).toBe(77_350); // 595 g × 1,30 €
    expect(r.status).toBe('due');
    expect(r.estimatedZakatCents).toBe(32_875); // 2,5 %
    expect(r.dueCents).toBe(32_875);
  });

  it('valorise l’or au poids de métal fin', () => {
    const line = calculateZakat(input()).lines.find((l) => l.sourceId === 'a3')!;
    expect(line.includedCents).toBe(165_000); // 20 g × 0,75 × 110 €
    expect(line.rule).toBe('included_metal_weight');
  });

  it('explique chaque exclusion avec une règle et une référence', () => {
    const lines = calculateZakat(input()).lines;
    const byId = Object.fromEntries(lines.map((l) => [l.sourceId, l]));
    expect(byId.a4.rule).toBe('excluded_jewelry_option');
    expect(byId.a4.references).toContain('fiqh-majority');
    expect(byId.a6.rule).toBe('excluded_locked_pension');
    expect(byId.a7.rule).toBe('excluded_personal_use');
    expect(byId.l1.rule).toBe('debt_due_12_months');
    expect(byId.l1.includedCents).toBe(-1_200_000);
  });

  it('inclut les bijoux selon l’option hanafite, avec arrondi bancaire', () => {
    const r = calculateZakat(input({}, { personalJewelry: 'include' }));
    expect(r.netZakatableCents).toBe(1_562_500);
    expect(r.estimatedZakatCents).toBe(39_062); // 39 062,5 arrondi au pair
    expect(r.lines.find((l) => l.sourceId === 'a4')!.references).toContain('fiqh-hanafi');
  });

  it('applique 2,577 % en année solaire', () => {
    expect(calculateZakat(input({}, { yearBasis: 'solar' })).estimatedZakatCents).toBe(33_888);
  });

  it('applique un ratio aux placements long terme si l’utilisateur le choisit', () => {
    const r = calculateZakat(input({}, { longTermInvestments: { mode: 'custom_ratio', ratio: 0.3 } }));
    expect(r.lines.find((l) => l.sourceId === 'a5')!.includedCents).toBe(300_000);
    expect(r.estimatedZakatCents).toBe(15_375);
  });

  it('plafonne les dettes à l’assiette et passe sous le nisab', () => {
    const r = calculateZakat(input({}, { debts: 'all' }));
    expect(r.deductibleDebtsCents).toBe(2_515_000);
    expect(r.netZakatableCents).toBe(0);
    expect(r.status).toBe('below_nisab');
    expect(r.dueCents).toBe(0);
    expect(r.warnings.map((w) => w.code)).toContain('debts_capped');
  });

  it('utilise le nisab or lorsqu’il est choisi', () => {
    const r = calculateZakat(input({}, { nisabBasis: 'gold' }));
    expect(r.nisabCents).toBe(935_000); // 85 g × 110 €
    expect(r.status).toBe('due');
  });

  it('ne déclare rien d’exigible avant la fin du Hawl, mais donne l’estimation', () => {
    const r = calculateZakat(input({ hawlStart: '2026-06-01' }));
    expect(r.status).toBe('hawl_incomplete');
    expect(r.dueCents).toBe(0);
    expect(r.estimatedZakatCents).toBe(32_875);
  });

  it('signale un prix ancien et un référentiel non approuvé', () => {
    const r = calculateZakat(input({ prices: { ...prices, silver: { pricePerGramCents: 130, asOf: '2026-10-01' } } }));
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('price_stale');
    expect(codes).toContain('ruleset_not_approved');
  });

  it('reste « à déterminer » si la date de début du Hawl est inconnue', () => {
    const r = calculateZakat(input({ hawlStart: undefined }));
    expect(r.status).toBe('to_determine');
    expect(r.dueCents).toBe(0);
    expect(r.isAboveNisab).toBe(true);
    expect(r.pendingReasons).toEqual(['hawl_start_unknown']);
    expect(r.estimatedZakatCents).toBe(32_875); // indicatif seulement
  });

  it('reste « à déterminer » si la base du nisab n’est pas choisie', () => {
    const r = calculateZakat(input({}, { nisabBasis: null }));
    expect(r.status).toBe('to_determine');
    expect(r.nisabCents).toBe(null);
    expect(r.pendingReasons).toContain('nisab_basis_not_chosen');
  });

  it('ne conclut pas avec un prix du nisab trop ancien', () => {
    const r = calculateZakat(input({ prices: { ...prices, silver: { pricePerGramCents: 130, asOf: '2026-10-01' } } }));
    expect(r.status).toBe('to_determine');
    expect(r.pendingReasons).toContain('nisab_price_unavailable');
  });

  it('suspend l’évaluation de l’or si son prix manque', () => {
    const r = calculateZakat(input({ prices: { silver: prices.silver, gold: null } }));
    const gold = r.lines.find((l) => l.sourceId === 'a3')!;
    expect(gold.rule).toBe('pending_metal_price');
    expect(gold.includedCents).toBe(0);
    expect(r.status).toBe('to_determine');
    expect(r.pendingReasons).toContain('valuation_price_unavailable');
  });

  it('ne suppose pas qu’une créance sera remboursée', () => {
    const assets = input().assets.map((a) => (a.id === 'a8' ? { ...a, receivableLikely: undefined } : a));
    const r = calculateZakat(input({ assets }));
    expect(r.lines.find((l) => l.sourceId === 'a8')!.rule).toBe('pending_uncertain_receivable');
    expect(r.uncertainCents).toBe(100_000);
    expect(r.status).toBe('to_determine');
    expect(r.pendingReasons).toEqual(['uncertain_receivables']);
  });

  it('conclut « sous le nisab » même sans Hawl connu quand c’est établi', () => {
    const r = calculateZakat({ ...input({ hawlStart: undefined }), assets: [{ id: 'c', kind: 'cash', label: 'Espèces', valueCents: 50_000 }], liabilities: [] });
    expect(r.status).toBe('below_nisab');
    expect(r.isAboveNisab).toBe(false);
    expect(r.pendingReasons).toEqual([]);
  });

  it('reste « à déterminer » si des éléments incertains peuvent franchir le nisab', () => {
    const r = calculateZakat({ ...input(), liabilities: [], assets: [
      { id: 'c', kind: 'cash', label: 'Espèces', valueCents: 50_000 },
      { id: 'r', kind: 'receivable', label: 'Prêt', valueCents: 40_000 },
    ] });
    expect(r.status).toBe('to_determine');
    expect(r.pendingReasons).toContain('uncertain_receivables');
  });

  it('refuse une date de Hawl dans le futur', () => {
    const r = calculateZakat(input({ hawlStart: '2027-01-01' }));
    expect(r.status).toBe('to_determine');
    expect(r.pendingReasons).toContain('hawl_start_invalid');
  });

  it('n’est pas bloquée par l’or de bijoux exclus par option', () => {
    const r = calculateZakat({ ...input({ prices: { silver: prices.silver, gold: null } }),
      assets: [{ id: 'j', kind: 'jewelry_personal', label: 'Bijoux', weightMg: 30_000, metal: 'gold' }, { id: 'c', kind: 'cash', label: 'Espèces', valueCents: 1_000_000 }], liabilities: [] });
    expect(r.status).toBe('due');
  });

  it('refuse un montant non entier', () => {
    expect(() => calculateZakat(input({ assets: [{ id: 'x', kind: 'cash', label: 'x', valueCents: 10.5 }] }))).toThrow();
  });

  it('est déterministe : mêmes entrées, même résultat', () => {
    expect(calculateZakat(input())).toEqual(calculateZakat(input()));
  });
});
