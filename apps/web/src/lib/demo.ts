import { categorize, type CategoryInfo, type CategorizationRule, type Transaction } from '@amanah/engines';
import {
  DEMO_ACCOUNTS, DEMO_ALLOCATIONS, DEMO_AS_OF, DEMO_ASSETS, DEMO_GOALS, DEMO_LIABILITIES,
  DEMO_PRICES, DEMO_TRANSACTIONS,
} from '@amanah/banking';
import { accountsToAssets, type HouseholdData } from './snapshot.ts';

/** Miroir des catégories système de la migration 0005 (utilisé en mode démo). */
export const SYSTEM_CATEGORIES: CategoryInfo[] = [
  { slug: 'salaire', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'allocations_familiales', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'autres_revenus', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'interets', kind: 'income', isEssential: false, isInterest: true },
  { slug: 'logement', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'energie', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'alimentation', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'transport', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'sante', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'telecom', kind: 'expense', isEssential: true, isInterest: false },
  { slug: 'restaurants', kind: 'expense', isEssential: false, isInterest: false },
  { slug: 'dons', kind: 'expense', isEssential: false, isInterest: false },
  { slug: 'divers', kind: 'expense', isEssential: false, isInterest: false },
  { slug: 'epargne', kind: 'transfer', isEssential: false, isInterest: false },
  { slug: 'virement_interne', kind: 'transfer', isEssential: false, isInterest: false },
];

export const DEMO_RULES: CategorizationRule[] = [
  { pattern: 'INTERET', categorySlug: 'interets', direction: 'credit', priority: 10 },
  { pattern: 'PRIME DE FIDELITE', categorySlug: 'interets', direction: 'credit', priority: 10 },
  { pattern: 'SALAIRE', categorySlug: 'salaire', direction: 'credit', priority: 20 },
  { pattern: 'FAMIRIS', categorySlug: 'allocations_familiales', direction: 'credit', priority: 20 },
  { pattern: 'VERSEMENT DEPUIS COMPTE COURANT', categorySlug: 'virement_interne', direction: 'credit', priority: 15 },
  { pattern: 'VERS EPARGNE', categorySlug: 'epargne', direction: 'debit', priority: 15 },
  { pattern: 'LOYER', categorySlug: 'logement', direction: 'debit', priority: 50 },
  { pattern: 'ENGIE', categorySlug: 'energie', direction: 'debit', priority: 50 },
  { pattern: 'PROXIMUS', categorySlug: 'telecom', direction: 'debit', priority: 50 },
  { pattern: 'STIB', categorySlug: 'transport', direction: 'debit', priority: 50 },
  { pattern: 'DELHAIZE', categorySlug: 'alimentation', direction: 'debit', priority: 50 },
  { pattern: 'COLRUYT', categorySlug: 'alimentation', direction: 'debit', priority: 50 },
  { pattern: 'ALDI', categorySlug: 'alimentation', direction: 'debit', priority: 50 },
  { pattern: 'LIDL', categorySlug: 'alimentation', direction: 'debit', priority: 50 },
  { pattern: 'PHARMACIE', categorySlug: 'sante', direction: 'debit', priority: 50 },
  { pattern: 'RESTAURANT', categorySlug: 'restaurants', direction: 'debit', priority: 60 },
  { pattern: 'DON ', categorySlug: 'dons', direction: 'debit', priority: 60 },
];

export function getDemoHousehold(): HouseholdData {
  const transactions: Transaction[] = DEMO_TRANSACTIONS.map((t, i) => ({
    id: `demo-tx-${i}`,
    accountId: t.accountExternalId,
    bookedOn: t.bookedOn,
    amountCents: t.amountCents,
    currency: t.currency,
    description: t.description,
    counterpartyName: t.counterpartyName,
    categorySlug: categorize(t, DEMO_RULES).categorySlug,
  }));

  const accounts = DEMO_ACCOUNTS.map((a) => ({ id: a.externalId, name: a.name, type: a.type, balanceCents: a.balanceCents ?? 0, ibanLast4: a.ibanLast4 }));
  return {
    asOf: DEMO_AS_OF,
    accounts,
    transactions,
    categories: SYSTEM_CATEGORIES,
    budget: [
      { categorySlug: 'alimentation', limitCents: 45_000 },
      { categorySlug: 'restaurants', limitCents: 6_000 },
      { categorySlug: 'logement', limitCents: 105_000 },
      { categorySlug: 'energie', limitCents: 15_000 },
      { categorySlug: 'transport', limitCents: 5_000 },
    ],
    goals: DEMO_GOALS,
    allocations: DEMO_ALLOCATIONS,
    assets: [...accountsToAssets(accounts), ...DEMO_ASSETS],
    liabilities: DEMO_LIABILITIES,
    prices: DEMO_PRICES,
    zakat: {
      hawlStart: '2025-11-20',
      options: {
        nisabBasis: 'silver', yearBasis: 'lunar', personalJewelry: 'exclude',
        longTermInvestments: { mode: 'full_market_value' }, lockedPensions: 'exclude', debts: 'due_12_months',
      },
    },
    emergencyFundMonths: 3,
  };
}
