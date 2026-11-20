import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateZakat, detectInterest, planGoal, summarizeMonth } from '@amanah/engines';
import {
  DEMO_ACCOUNTS, DEMO_ALLOCATIONS, DEMO_AS_OF, DEMO_ASSETS, DEMO_GOALS, DEMO_LIABILITIES, DEMO_PRICES,
  DEMO_TRANSACTIONS, DemoProvider, IMPORT_LIMITS, decodeCsvBytes, detectCsvProfile, getProvider, normalizeForImport, previewCsvImport, toImportPayload,
} from '../src/index.ts';

const rules = [
  { pattern: 'SALAIRE', categorySlug: 'salaire', direction: 'credit' as const, priority: 20 },
  { pattern: 'LOYER', categorySlug: 'logement', direction: 'debit' as const, priority: 50 },
];

describe('DemoProvider', () => {
  it('respecte le contrat BankingProvider', async () => {
    const p = getProvider('demo');
    expect(p.id).toBe('demo');
    const grant = await p.completeConsent({ state: 'x' });
    const accounts = await p.fetchAccounts(grant);
    expect(accounts).toHaveLength(2);
    const txs = await p.fetchTransactions(grant, 'demo-current', '2026-10-01');
    expect(txs.length).toBeGreaterThan(10);
    expect(txs.every((t) => t.bookedOn >= '2026-10-01' && t.bookedOn <= DEMO_AS_OF)).toBe(true);
  });

  it('fournit un jeu de données cohérent avec les moteurs', () => {
    const z = calculateZakat({
      asOf: DEMO_AS_OF, currency: 'EUR', hawlStart: '2025-11-20', prices: DEMO_PRICES,
      assets: [...DEMO_ACCOUNTS.map((a) => ({ id: a.externalId, kind: 'bank_balance' as const, label: a.name, valueCents: a.balanceCents ?? 0 })), ...DEMO_ASSETS],
      liabilities: DEMO_LIABILITIES,
      options: { nisabBasis: 'silver', yearBasis: 'lunar', personalJewelry: 'exclude', longTermInvestments: { mode: 'full_market_value' }, lockedPensions: 'exclude', debts: 'due_12_months' },
    });
    expect(z.status).toBe('due');
    expect(z.dueCents).toBeGreaterThan(0);
    expect(detectInterest(DEMO_TRANSACTIONS.map((t, i) => ({ ...t, id: String(i), accountId: t.accountExternalId }))).length).toBe(2);
    const hajj = planGoal(DEMO_GOALS[0], DEMO_ALLOCATIONS, DEMO_AS_OF);
    expect(hajj.savedCents).toBe(500_000);
    expect(DEMO_ACCOUNTS[0].balanceCents).toBe(412_650);
    const oct = summarizeMonth('2026-10', DEMO_TRANSACTIONS.map((t, i) => ({ ...t, id: String(i), accountId: t.accountExternalId })), []);
    expect(oct.incomeCents).toBeGreaterThan(0);
  });

  it('n’expose aucun identifiant bancaire', async () => {
    const grant = await new DemoProvider().completeConsent({ state: 'x' });
    expect(Object.keys(grant).sort()).toEqual(['consentRef', 'expiresAt', 'provider', 'secretRef']);
  });
});

describe('pipeline d’import', () => {
  const csv = 'Date;Montant;Libellé\n01/10/2026;2.500,00;Salaire octobre\n02/10/2026;-950,00;Loyer\n02/10/2026;-3,50;Café\n02/10/2026;-3,50;Café\n';

  it('catégorise et distingue deux opérations identiques le même jour', () => {
    const p = previewCsvImport(csv, 'generic_be', rules);
    expect(p.errors).toEqual([]);
    expect(p.toInsert.map((t) => t.categorySlug)).toEqual(['salaire', 'logement', 'divers', 'divers']);
    expect(new Set(p.toInsert.map((t) => t.dedupeHash)).size).toBe(4);
  });

  it('ne réimporte pas un fichier déjà importé', () => {
    const first = previewCsvImport(csv, 'generic_be', rules);
    const again = previewCsvImport(csv, 'generic_be', rules, new Set(first.toInsert.map((t) => t.dedupeHash)));
    expect(again.toInsert).toHaveLength(0);
    expect(again.duplicates).toHaveLength(4);
  });

  it('produit la même empreinte pour une opération venue d’une autre source', () => {
    const fromCsv = previewCsvImport(csv, 'generic_be', rules).toInsert[1];
    const fromApi = normalizeForImport([{ bookedOn: '2026-10-02', amountCents: -95_000, currency: 'EUR', description: 'LOYER' }], rules, new Set()).toInsert[0];
    expect(fromApi.dedupeHash).toBe(fromCsv.dedupeHash);
  });
});

describe('import CSV (Sprint 2)', () => {
  const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
  const systemRules = [
    { pattern: 'INTERET', categorySlug: 'interets', direction: 'credit' as const, priority: 10 },
    { pattern: 'PRIME DE FIDELITE', categorySlug: 'interets', direction: 'credit' as const, priority: 10 },
    { pattern: 'SALAIRE', categorySlug: 'salaire', direction: 'credit' as const, priority: 20 },
    { pattern: 'LOYER', categorySlug: 'logement', priority: 20 },
  ];

  it('lit le relevé fictif générique : lignes, erreur par ligne, catégories, intérêts', () => {
    const p = previewCsvImport(fixture('releve-fictif-generique-be.csv'), 'generic_be', systemRules);
    expect(p.toInsert).toHaveLength(8);
    expect(p.errors).toHaveLength(1);
    expect(p.errors[0].line).toBe(10);
    expect(p.toInsert.map((t) => t.categorySlug).slice(0, 2)).toEqual(['salaire', 'logement']);
    const interest = p.toInsert.filter((t) => t.interest);
    expect(interest.map((t) => [t.amountCents, t.interest!.kind])).toEqual([[1234, 'bank_interest'], [456, 'loyalty_bonus']]);
    expect(p.toInsert.find((t) => t.amountCents === 265_000)!.counterpartyIbanLast4).toBe('1111');
  });

  it('ne marque jamais un débit comme intérêt', () => {
    const p = previewCsvImport('Date;Montant;Libellé\n01/10/2026;-5,00;INTERETS DEBITEURS\n', 'generic_be', systemRules);
    expect(p.toInsert[0].interest).toBeNull();
  });

  it('lit le relevé fictif à colonnes Débit et Crédit', () => {
    const p = previewCsvImport(fixture('releve-fictif-debit-credit-be.csv'), 'split_debit_credit_be', systemRules);
    expect(p.errors).toEqual([]);
    expect(p.toInsert.map((t) => t.amountCents)).toEqual([265_000, -7_120, 987]);
    expect(p.toInsert[2].interest?.kind).toBe('bank_interest');
  });

  it('reconnaît le profil d’après l’en-tête', () => {
    expect(detectCsvProfile(fixture('releve-fictif-generique-be.csv'))).toBe('generic_be');
    expect(detectCsvProfile(fixture('releve-fictif-debit-credit-be.csv'))).toBe('split_debit_credit_be');
    expect(detectCsvProfile('a;b;c\n1;2;3')).toBeNull();
  });

  it('décode UTF-8, puis Windows-1252 pour les exports belges anciens', () => {
    expect(decodeCsvBytes(new TextEncoder().encode('﻿Libellé'))).toBe('Libellé');
    expect(decodeCsvBytes(new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]))).toBe('Libellé');
  });

  it('produit le format attendu par la fonction SQL, identique pour CSV et PSD2', () => {
    const p = previewCsvImport(fixture('releve-fictif-generique-be.csv'), 'generic_be', systemRules);
    const rows = toImportPayload(p.toInsert);
    expect(Object.keys(rows[0]).sort()).toEqual(['amount_cents', 'booked_on', 'category_slug', 'counterparty_iban_last4', 'counterparty_name',
      'currency', 'dedupe_hash', 'description', 'external_id', 'interest_kind', 'interest_reason', 'is_interest']);
    expect(rows.filter((r) => r.is_interest)).toHaveLength(2);
    const api = toImportPayload(normalizeForImport([{ bookedOn: '2026-10-31', amountCents: 1234, currency: 'EUR', description: 'INTERETS CREDITEURS COMPTE EPARGNE' }], systemRules, new Set()).toInsert);
    expect(api[0].dedupe_hash).toBe(rows.find((r) => r.amount_cents === 1234)!.dedupe_hash);
  });

  it('limite la taille des fichiers et le nombre de lignes', () => {
    expect(IMPORT_LIMITS.maxBytes).toBe(524_288);
    expect(IMPORT_LIMITS.maxRows).toBe(5000);
  });
});
