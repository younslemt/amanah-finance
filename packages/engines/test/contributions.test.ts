import { describe, expect, it } from 'vitest';
import {
  allocationError, beneficiaryHistory, calculateZakat, canonicalJson, fitrSettlements, matchCandidates, prepareZakat,
  replayZakat, requiredZakatChoices, selectMetalPrice, summarizeContributions, uniqueContributions, statusOf,
  zakatAlFitrDue, zakatSettlements, type Contribution, type ZakatAsset, type ZakatChoices, type ZakatLiability,
} from '../src/index.ts';

// Données exclusivement fictives
const c = (id: string, kind: Contribution['kind'], amountCents: number, paidOn: string, extra: Partial<Contribution> = {}): Contribution =>
  ({ id, kind, amountCents, paidOn, ...extra });

describe('contributions : totaux sans double comptage', () => {
  const list = [
    c('z1', 'zakat', 50_000, '2026-03-10', { zakatCalculationId: 'calc1', transactionId: 't1', beneficiary: 'Association fictive A' }),
    c('s1', 'sadaqah', 2_000, '2026-04-01', { beneficiary: 'association fictive a' }),
    c('p1', 'purification', 1_234, '2026-05-02', { beneficiary: 'Organisme fictif B' }),
    c('f1', 'zakat_al_fitr', 3_000, '2026-03-28', { zakatFitrId: 'fitr2026' }),
    c('o1', 'other', 10_000, '2025-12-20'),
  ];

  it('chaque contribution est comptée une fois, même chargée par deux vues (dons et purification)', () => {
    const twice = [...list, list[2]!];
    expect(uniqueContributions(twice)).toHaveLength(5);
    const [y2026] = summarizeContributions(twice);
    expect(y2026!.year).toBe(2026);
    expect(y2026!.totalCents).toBe(50_000 + 2_000 + 1_234 + 3_000);
    expect(y2026!.byKind.purification.totalCents).toBe(1_234);
    expect(y2026!.byKind.purification.count).toBe(1);
  });

  it('totaux annuels par type : déclaré, rapproché et confirmé séparés', () => {
    const [y2026, y2025] = summarizeContributions(list);
    expect(y2026!.bankMatchedCents).toBe(50_000);
    expect(y2026!.confirmedCents).toBe(0);
    expect(y2026!.declaredCents).toBe(2_000 + 1_234 + 3_000);
    expect(y2026!.bankMatchedCents + y2026!.declaredCents).toBe(y2026!.totalCents);
    expect(y2026!.byKind.zakat).toEqual({ totalCents: 50_000, declaredCents: 0, bankMatchedCents: 50_000, confirmedCents: 0, count: 1 });
    expect(y2025!.year).toBe(2025);
    expect(y2025!.byKind.other.totalCents).toBe(10_000);
    expect(y2025!.byKind.sadaqah.count).toBe(0);
  });

  it('déclaré, puis rapproché (jamais « confirmé » par un simple rapprochement)', () => {
    expect(statusOf(list[0]!)).toBe('bank_matched');
    expect(statusOf(list[1]!)).toBe('declared');
    // Statut réservé : seule une confirmation explicite (partenaire, preuve) le donne
    const confirmed = { ...list[0]!, confirmation: { source: 'partner' as const, confirmedOn: '2026-03-15' } };
    expect(statusOf(confirmed)).toBe('confirmed');
    const [y] = summarizeContributions([confirmed]);
    expect(y).toMatchObject({ confirmedCents: 50_000, bankMatchedCents: 0, declaredCents: 0 });
  });

  it('affectations réservées au type correspondant', () => {
    expect(allocationError({ kind: 'zakat', zakatCalculationId: 'x' })).toBeNull();
    expect(allocationError({ kind: 'sadaqah', zakatCalculationId: 'x' })).toBe('zakat_calculation_requires_zakat');
    expect(allocationError({ kind: 'zakat', zakatFitrId: 'x' })).toBe('zakat_fitr_requires_zakat_al_fitr');
    expect(allocationError({ kind: 'zakat_al_fitr', zakatFitrId: 'x' })).toBeNull();
  });

  it('Zakat due, payée, reste et excédent par calcul ; seules les Zakat affectées comptent', () => {
    const extra = [...list, c('z2', 'zakat', 30_000, '2026-06-01', { zakatCalculationId: 'calc1' }), c('s2', 'sadaqah', 99_999, '2026-06-02', { zakatCalculationId: 'calc1' })];
    const [s1, s2] = zakatSettlements([{ id: 'calc1', dueCents: 100_000 }, { id: 'calc2', dueCents: 0 }], extra);
    expect(s1).toEqual({ id: 'calc1', dueCents: 100_000, paidCents: 80_000, bankMatchedPaidCents: 50_000, confirmedPaidCents: 0, remainingCents: 20_000, excessCents: 0, contributionIds: ['z1', 'z2'] });
    expect(s2!.paidCents).toBe(0);
    const [over] = zakatSettlements([{ id: 'calc1', dueCents: 60_000 }], extra);
    expect(over!.remainingCents).toBe(0);
    expect(over!.excessCents).toBe(20_000);
  });

  it('Zakat al-Fitr suivie séparément de la Zakat patrimoniale', () => {
    const [f] = fitrSettlements([{ id: 'fitr2026', dueCents: 4_500 }], list);
    expect(f).toMatchObject({ dueCents: 4_500, paidCents: 3_000, remainingCents: 1_500, contributionIds: ['f1'] });
    const [z] = zakatSettlements([{ id: 'calc1', dueCents: 50_000 }], list);
    expect(z!.contributionIds).toEqual(['z1']);
  });

  it('rapprochement bancaire : débit du même montant, ±10 jours, non déjà rapproché, le plus proche d’abord', () => {
    const debits = [
      { id: 'd1', bookedOn: '2026-04-05', amountCents: -2_000, description: 'VIREMENT ASSOCIATION FICTIVE' },
      { id: 'd2', bookedOn: '2026-04-02', amountCents: -2_000, description: 'DON FICTIF' },
      { id: 'd3', bookedOn: '2026-04-20', amountCents: -2_000, description: 'TROP TARD' },
      { id: 'd4', bookedOn: '2026-04-01', amountCents: 2_000, description: 'CREDIT, PAS UN DON' },
      { id: 'd5', bookedOn: '2026-04-01', amountCents: -2_001, description: 'MONTANT DIFFERENT' },
      { id: 'd6', bookedOn: '2026-04-01', amountCents: -2_000, description: 'DEJA RAPPROCHE' },
    ];
    const m = matchCandidates(list[1]!, debits, new Set(['d6']));
    expect(m.map((x) => x.transactionId)).toEqual(['d2', 'd1']);
    expect(m[0]!.distanceDays).toBe(1);
  });

  it('historique des bénéficiaires, libellés regroupés sans tenir compte de la casse', () => {
    const h = beneficiaryHistory(list);
    expect(h.map((b) => b.label)).toEqual(['Organisme fictif B', 'association fictive a']);
    expect(h[1]).toMatchObject({ totalCents: 52_000, count: 2, lastPaidOn: '2026-04-01' });
  });
});

describe('Zakat personnalisée : choix explicites, préparation, reproductibilité', () => {
  const assets: ZakatAsset[] = [
    { id: 'a1', kind: 'bank_balance', label: 'Compte fictif', valueCents: 1_200_000 },
    { id: 'a2', kind: 'jewelry_personal', label: 'Bijoux fictifs', weightMg: 30_000, purityPermille: 750, metal: 'gold' },
    { id: 'a3', kind: 'stocks_funds', label: 'Fonds fictif', valueCents: 1_000_000, heldFor: 'long_term' },
    { id: 'a4', kind: 'pension', label: 'Pension fictive', valueCents: 500_000, isAccessible: false },
  ];
  const liabilities: ZakatLiability[] = [{ id: 'l1', label: 'Prêt fictif', outstandingCents: 300_000, due12mCents: 120_000 }];
  const prices = { gold: { pricePerGramCents: 11_000, asOf: '2026-11-15' }, silver: { pricePerGramCents: 130, asOf: '2026-11-15' } };
  const all: ZakatChoices = {
    nisabBasis: 'silver', yearBasis: 'lunar', hawlStart: '2025-11-01', personalJewelry: 'exclude',
    longTermInvestments: 'custom_ratio', longTermRatioPer100k: 30_000, lockedPensions: 'exclude', debts: 'due_12_months',
  };
  const prep = (choices: ZakatChoices, a = assets, l = liabilities) =>
    prepareZakat({ asOf: '2026-11-20', currency: 'EUR', choices, assets: a, liabilities: l, prices });

  it('seules les options qui changent le résultat sont demandées', () => {
    expect(requiredZakatChoices([assets[0]!], [])).toEqual(['yearBasis']);
    expect(requiredZakatChoices(assets, liabilities)).toEqual(['yearBasis', 'personalJewelry', 'longTermInvestments', 'lockedPensions', 'debts']);
    expect(requiredZakatChoices([{ ...assets[2]!, heldFor: 'trading' }], [])).toEqual(['yearBasis']);
  });

  it('aucune valeur par défaut : un choix manquant bloque le calcul et est listé', () => {
    const p = prep({ nisabBasis: 'silver', hawlStart: '2025-11-01' });
    expect(p.input).toBeNull();
    expect(p.missing).toEqual(['yearBasis', 'personalJewelry', 'longTermInvestments', 'lockedPensions', 'debts']);
    const ratioMissing = prep({ ...all, longTermRatioPer100k: null });
    expect(ratioMissing.missing).toEqual(['longTermInvestments']);
    expect(prep({ ...all, longTermRatioPer100k: 100_001 }).missing).toEqual(['longTermInvestments']);
  });

  it('nisab et Hawl non choisis : le moteur conclut « à déterminer », sans supposer', () => {
    const p = prep({ ...all, nisabBasis: null, hawlStart: null });
    const r = calculateZakat(p.input!);
    expect(r.status).toBe('to_determine');
    expect(r.pendingReasons).toContain('nisab_basis_not_chosen');
    expect(r.pendingReasons).toContain('hawl_start_unknown');
    expect(r.dueCents).toBe(0);
  });

  it('options choisies appliquées ; options sans objet signalées', () => {
    const p = prep(all);
    expect(p.missing).toEqual([]);
    expect(p.notApplicable).toEqual([]);
    const r = calculateZakat(p.input!);
    const line = (id: string) => r.lines.find((l) => l.sourceId === id)!;
    expect(line('a2').rule).toBe('excluded_jewelry_option');
    expect(line('a3').includedCents).toBe(300_000);
    expect(line('a4').rule).toBe('excluded_locked_pension');
    expect(line('l1').includedCents).toBe(-120_000);
    expect(r.netZakatableCents).toBe(1_200_000 + 300_000 - 120_000);
    expect(r.status).toBe('due');
    expect(r.dueCents).toBe(34_500);

    const simple = prep({ yearBasis: 'solar', nisabBasis: 'silver', hawlStart: '2025-11-01' }, [assets[0]!], []);
    expect(simple.notApplicable).toEqual(['personalJewelry', 'longTermInvestments', 'lockedPensions', 'debts']);
    expect(calculateZakat(simple.input!).ratePer100k).toBe(2_577);
  });

  it('biens et dettes exclus par la personne : retirés du calcul et tracés', () => {
    const p = prep({ ...all, excludedSourceIds: ['a1', 'l1', 'inconnu'] });
    expect(p.excludedSourceIds).toEqual(['a1', 'l1']);
    expect(p.input!.assets.map((a) => a.id)).toEqual(['a2', 'a3', 'a4']);
    expect(p.input!.liabilities).toEqual([]);
    expect(p.missing).toEqual([]); // plus de dette retenue : le choix « dettes » devient sans objet
    expect(p.notApplicable).toContain('debts');
  });

  it('prix des métaux : saisie la plus récente non future, source conservée, fraîcheur contrôlée', () => {
    const entries = [
      { symbol: 'XAU' as const, pricePerGramCents: 10_900, asOf: '2026-11-01', source: 'Cotation fictive A' },
      { symbol: 'XAU' as const, pricePerGramCents: 11_000, asOf: '2026-11-18', source: 'Cotation fictive B' },
      { symbol: 'XAU' as const, pricePerGramCents: 12_000, asOf: '2026-11-25', source: 'Date future' },
      { symbol: 'XAG' as const, pricePerGramCents: 130, asOf: '2026-11-05', source: 'Cotation fictive C' },
    ];
    expect(selectMetalPrice(entries, 'XAU', '2026-11-20')).toEqual({ pricePerGramCents: 11_000, asOf: '2026-11-18', source: 'Cotation fictive B', status: 'ok' });
    expect(selectMetalPrice(entries, 'XAG', '2026-11-20')!.status).toBe('stale');
    expect(selectMetalPrice([], 'XAG', '2026-11-20')).toBeNull();
  });

  it('un calcul enregistré se refait à l’identique, y compris après passage par JSON réordonné', () => {
    const input = prep(all).input!;
    const stored = calculateZakat(input);
    const reordered = JSON.parse(canonicalJson(stored).replace(/^\{/, '{')) as typeof stored;
    const viaJson = JSON.parse(JSON.stringify(input)) as typeof input;
    expect(replayZakat(viaJson, reordered)).toEqual({ reproducible: true, engineVersionMatches: true, differences: [] });
    const tampered = { ...stored, dueCents: stored.dueCents + 1 };
    expect(replayZakat(input, tampered)).toEqual({ reproducible: false, engineVersionMatches: true, differences: ['dueCents'] });
  });

  it('Zakat al-Fitr : personnes × montant choisi, sans valeur par défaut', () => {
    expect(zakatAlFitrDue(3, 1_000)).toBe(3_000);
    expect(() => zakatAlFitrDue(0, 1_000)).toThrow();
    expect(() => zakatAlFitrDue(2, 0)).toThrow();
    expect(() => zakatAlFitrDue(2.5, 1_000)).toThrow();
  });
});
