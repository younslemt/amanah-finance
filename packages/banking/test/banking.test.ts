import { describe, expect, it } from 'vitest';
import { calculateZakat, detectInterest, planGoal, summarizeMonth } from '@amanah/engines';
import {
  DEMO_ACCOUNTS, DEMO_ALLOCATIONS, DEMO_AS_OF, DEMO_ASSETS, DEMO_GOALS, DEMO_LIABILITIES, DEMO_PRICES,
  DEMO_TRANSACTIONS, DemoProvider, getProvider, normalizeForImport, previewCsvImport,
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
