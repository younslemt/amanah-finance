import { categorize, type AnalysisCategory, type CategorizationRule, type Transaction } from '@amanah/engines';
import {
  DEMO_ACCOUNTS, DEMO_AS_OF, DEMO_ASSETS, DEMO_LIABILITIES,
  DEMO_PRICES, DEMO_TRANSACTIONS,
} from '@amanah/banking';
import { accountsToAssets, type HouseholdData } from './snapshot.ts';
import { initialDemoState, toEngineAllocations, toEngineGoal, type DemoState } from './goals/demo-state.ts';

/** Miroir des catégories système de la migration 0005 (utilisé en mode démo). */
export const SYSTEM_CATEGORIES: AnalysisCategory[] = [
  { slug: 'salaire', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'allocations_familiales', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'autres_revenus', kind: 'income', isEssential: false, isInterest: false },
  { slug: 'interets', kind: 'income', isEssential: false, isInterest: true },
  { slug: 'logement', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'fixed' },
  { slug: 'energie', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'fixed' },
  { slug: 'alimentation', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'variable' },
  { slug: 'transport', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'variable' },
  { slug: 'sante', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'variable' },
  { slug: 'telecom', kind: 'expense', isEssential: true, isInterest: false, defaultNature: 'fixed' },
  { slug: 'restaurants', kind: 'expense', isEssential: false, isInterest: false, defaultNature: 'variable' },
  { slug: 'dons', kind: 'expense', isEssential: false, isInterest: false, defaultNature: 'variable' },
  { slug: 'divers', kind: 'expense', isEssential: false, isInterest: false, defaultNature: 'variable' },
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

/**
 * Foyer fictif. Les projets, affectations et capacité déclarée viennent de l'état de la
 * démonstration interactive (données de départ si la personne n'a encore rien modifié).
 */
export function getDemoHousehold(state: DemoState = initialDemoState()): HouseholdData {
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
    // Plafonds fixés en août 2026 et reconduits (dépassements répétés visibles en démonstration)
    budgetHistory: [
      { month: '2026-08', categorySlug: 'alimentation', limitCents: 45_000 },
      { month: '2026-08', categorySlug: 'restaurants', limitCents: 4_000 },
      { month: '2026-08', categorySlug: 'logement', limitCents: 105_000 },
      { month: '2026-08', categorySlug: 'energie', limitCents: 15_000 },
      { month: '2026-08', categorySlug: 'transport', limitCents: 5_000 },
    ],
    goals: state.goals.map(toEngineGoal),
    allocations: toEngineAllocations(state),
    assets: [...accountsToAssets(accounts), ...DEMO_ASSETS],
    liabilities: DEMO_LIABILITIES,
    prices: DEMO_PRICES,
    priceEntries: [
      { symbol: 'XAU', ...DEMO_PRICES.gold, source: 'Prix fictif de démonstration' },
      { symbol: 'XAG', ...DEMO_PRICES.silver, source: 'Prix fictif de démonstration' },
    ],
    // Choix fictifs d'une personne de démonstration (aucun n'est une valeur par défaut de l'application)
    zakat: {
      choices: {
        nisabBasis: 'silver', yearBasis: 'lunar', hawlStart: '2025-11-20', personalJewelry: 'exclude',
        longTermInvestments: 'full_market_value', lockedPensions: 'exclude', debts: 'due_12_months', excludedSourceIds: [],
      },
    },
    // Capacité d'épargne déclarée fictive (plan des projets)
    declaredSavingsCapacityCents: state.declaredCapacityCents,
    emergencyFundMonths: 3,
  };
}
