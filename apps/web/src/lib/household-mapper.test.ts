import { describe, expect, it } from 'vitest';
import { accountBalances, mapHouseholdRows, toCents, zakatOptionsFrom, type HouseholdRows } from './household-mapper.ts';
import { buildSnapshot } from './snapshot.ts';

// Lignes FICTIVES, au format renvoyé par Supabase (bigint parfois en chaîne)
const rows: HouseholdRows = {
  asOf: '2026-11-09',
  accounts: [
    { id: 'acc-1', name: 'Compte courant', type: 'current', currency: 'EUR', iban_last4: '0001', opening_balance_cents: '100000', archived: false },
    { id: 'acc-2', name: 'Ancien compte', type: 'current', currency: 'EUR', iban_last4: null, opening_balance_cents: 5000, archived: true },
  ],
  transactions: [
    { id: 't1', account_id: 'acc-1', booked_on: '2026-10-01', amount_cents: '250000', currency: 'EUR', description: 'SALAIRE', counterparty_name: null, category_slug: 'salaire', is_interest: false },
    { id: 't2', account_id: 'acc-1', booked_on: '2026-10-02', amount_cents: -80000, currency: 'EUR', description: 'LOYER', counterparty_name: null, category_slug: 'logement', is_interest: false },
  ],
  categories: [
    { slug: 'salaire', kind: 'income', is_essential: false, is_interest: false, household_id: null },
    { slug: 'logement', kind: 'expense', is_essential: true, is_interest: false, household_id: null },
    { slug: 'logement', kind: 'expense', is_essential: false, is_interest: false, household_id: 'h1' },
    { slug: 'perso-voyages', kind: 'expense', is_essential: false, is_interest: false, household_id: 'h1', label: 'Voyages' },
  ],
  budgets: [{ category_slug: 'logement', limit_cents: 80000, month: '2026-11-01' }, { category_slug: 'logement', limit_cents: 1, month: '2026-10-01' }],
  goals: [{ id: 'g1', kind: 'hajj', name: 'Hajj', target_cents: '800000', target_date: '2028-06-01', status: 'active', monthly_capacity_cents: '40000' }],
  allocations: [{ goal_id: 'g1', amount_cents: 10000, allocated_on: '2026-10-15' }],
  assets: [
    { id: 'as1', kind: 'bank_balance', name: 'Doublon du compte', value_cents: 270000, weight_mg: null, purity_permille: null, is_accessible: true, receivable_likely: null, account_id: 'acc-1', details: {} },
    { id: 'as2', kind: 'jewelry_personal', name: 'Bijoux', value_cents: 0, weight_mg: '20000', purity_permille: 750, is_accessible: true, receivable_likely: null, account_id: null, details: { metal: 'gold' } },
  ],
  liabilities: [{ id: 'l1', name: 'Prêt', outstanding_cents: '50000', due_12m_cents: 20000 }],
  prices: [
    { symbol: 'XAG', price_per_g_cents: 120, as_of: '2026-10-01' },
    { symbol: 'XAG', price_per_g_cents: 130, as_of: '2026-11-06' },
  ],
  zakatSettings: null,
};

describe('conversion des lignes Supabase', () => {
  const data = mapHouseholdRows(rows);
  it('convertit les bigint sans flottant et refuse l’imprécision', () => {
    expect(toCents('123')).toBe(123);
    expect(() => toCents('9007199254740993')).toThrow();
    expect(() => toCents(1.5)).toThrow();
  });
  it('calcule les soldes à partir des transactions et ignore les comptes archivés', () => {
    expect(accountBalances(rows.accounts, rows.transactions)).toEqual([{ id: 'acc-1', name: 'Compte courant', type: 'current', ibanLast4: '0001', balanceCents: 270_000 }]);
  });
  it('utilise les soldes calculés par la base quand ils sont fournis', () => {
    const d = mapHouseholdRows({ ...rows, transactions: [], accountBalances: new Map([['acc-1', '99000']]) });
    expect(d.accounts[0].balanceCents).toBe(99_000);
  });
  it('n’ajoute pas un actif bancaire déjà représenté par un compte', () => {
    expect(data.assets.map((a) => a.id)).toEqual(['account:acc-1', 'as2']);
  });
  it('privilégie les catégories du foyer et le budget du mois courant', () => {
    expect(data.categories.find((c) => c.slug === 'logement')!.isEssential).toBe(false);
    expect(data.budget).toEqual([{ categorySlug: 'logement', limitCents: 80_000 }]);
  });
  it('retient le prix le plus récent et laisse un prix absent à null', () => {
    expect(data.prices.silver).toEqual({ pricePerGramCents: 130, asOf: '2026-11-06' });
    expect(data.prices.gold).toBe(null);
  });
  it('sans réglages Zakat, ne choisit pas la base du nisab', () => {
    expect(data.zakat.options.nisabBasis).toBe(null);
    expect(buildSnapshot(data).zakat.status).toBe('to_determine');
  });
  it('n’accepte que des options Zakat connues', () => {
    const z = zakatOptionsFrom({ nisab_basis: 'silver', year_basis: 'lunar', hawl_date: '2025-11-01', options: { debts: 'everything', long_term_investments: 'custom_ratio', long_term_ratio: 7 } });
    expect(z.options.debts).toBe('due_12_months');
    expect(z.options.longTermInvestments).toEqual({ mode: 'full_market_value' });
    expect(z.hawlStart).toBe('2025-11-01');
  });
});

describe('Sprint 1 : catégories personnelles et capacité d’épargne', () => {
  const data = mapHouseholdRows(rows);
  it('conserve le libellé des catégories personnelles', () => {
    expect(data.categories.find((c) => c.slug === 'perso-voyages')!.label).toBe('Voyages');
  });
  it('transmet la capacité mensuelle déclarée au moteur', () => {
    expect(data.goals[0].monthlyCapacityCents).toBe(40_000);
    expect(buildSnapshot(data).goals[0].plan.paceSource).toBe('declared');
  });
});
