/**
 * Vue d'ensemble du foyer : assemble les résultats des moteurs pour l'interface.
 * Fonction pure, sans React ni Supabase : testable seule et réutilisable en natif.
 */
import {
  calculateZakat, computeNetWorth, detectInterest, observedMonthlyPace, planEmergencyFund, planGoal, summarizeMonth,
  type CategoryInfo, type Goal, type GoalAllocation, type GoalPlan, type MetalPrice, type MonthSummary,
  summarizePurification, type PurificationCandidate, type PurificationItem, type PurificationSummary, type Transaction, type WealthSummary, type ZakatAsset, type ZakatLiability,
  type ZakatOptions, type ZakatResult,
} from '@amanah/engines';

export interface HouseholdAccount { id: string; name: string; type: string; balanceCents: number; ibanLast4?: string }

export interface HouseholdData {
  asOf: string;
  accounts: HouseholdAccount[];
  transactions: Transaction[];
  categories: CategoryInfo[];
  budget: Array<{ categorySlug: string; limitCents: number }>;
  goals: Goal[];
  allocations: GoalAllocation[];
  /** Tous les actifs, y compris les soldes de comptes (voir accountsToAssets). */
  assets: ZakatAsset[];
  liabilities: ZakatLiability[];
  prices: { gold: MetalPrice | null; silver: MetalPrice | null };
  zakat: { options: ZakatOptions; hawlStart?: string };
  emergencyFundMonths: 3 | 6;
  /** Mode réel : éléments de purification visibles (consentement article 9) ; absent en démonstration. */
  purificationItems?: PurificationItem[];
}

export interface HouseholdSnapshot {
  asOf: string;
  isEmpty: boolean;
  totalBalanceCents: number;
  wealth: WealthSummary;
  month: MonthSummary;
  previousMonths: MonthSummary[];
  emergencyFund: ReturnType<typeof planEmergencyFund>;
  goals: Array<{ goal: Goal; plan: GoalPlan }>;
  zakat: ZakatResult;
  purification: { candidates: PurificationCandidate[]; detectedCreditedCents: number; summary: PurificationSummary | null };
}

const LIQUID = new Set(['current', 'savings', 'regulated_savings', 'cash']);

/** Les soldes de comptes liquides deviennent des actifs : une seule source de vérité, pas de double saisie. */
export function accountsToAssets(accounts: HouseholdAccount[]): ZakatAsset[] {
  return accounts
    .filter((a) => LIQUID.has(a.type) && a.balanceCents > 0)
    .map((a) => ({ id: `account:${a.id}`, kind: a.type === 'cash' ? 'cash' : 'bank_balance', label: a.name, valueCents: a.balanceCents }));
}

export function previousMonthKeys(asOf: string, count: number): string[] {
  const [y, m] = asOf.split('-').map(Number);
  const keys: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

export function buildSnapshot(data: HouseholdData): HouseholdSnapshot {
  const currentMonth = data.asOf.slice(0, 7);
  const month = summarizeMonth(currentMonth, data.transactions, data.categories, data.budget);
  const previousMonths = previousMonthKeys(data.asOf, 3).map((k) => summarizeMonth(k, data.transactions, data.categories, data.budget));

  // Dépenses essentielles moyennes sur les mois disponibles
  const complete = previousMonths.filter((m) => m.expenseCents > 0);
  const avgEssential = complete.length ? Math.round(complete.reduce((s, m) => s + m.essentialExpenseCents, 0) / complete.length) : 0;
  const totalBalance = data.accounts.filter((a) => LIQUID.has(a.type)).reduce((s, a) => s + a.balanceCents, 0);

  // Rythme observé sur 3 mois ; sans historique, le statut reste « à déterminer »
  const goals = data.goals.map((goal) => ({
    goal,
    plan: planGoal(goal, data.allocations, data.asOf, observedMonthlyPace(data.allocations, goal.id, data.asOf)),
  }));
  // Les sommes affectées aux objectifs restent sur les comptes : la réserve = liquidités non affectées
  const allocated = goals.reduce((s, g) => s + g.plan.savedCents, 0);
  const emergencyFund = planEmergencyFund(avgEssential, data.emergencyFundMonths, Math.max(0, totalBalance - allocated));

  const zakat = calculateZakat({
    asOf: data.asOf,
    currency: 'EUR',
    hawlStart: data.zakat.hawlStart,
    prices: data.prices,
    assets: data.assets,
    liabilities: data.liabilities,
    options: data.zakat.options,
  });

  const candidates = detectInterest(data.transactions);

  return {
    asOf: data.asOf,
    isEmpty: data.accounts.length === 0 && data.transactions.length === 0 && data.goals.length === 0 && data.assets.length === 0,
    totalBalanceCents: totalBalance,
    wealth: computeNetWorth(data.assets, data.liabilities, data.prices, data.asOf),
    month,
    previousMonths,
    emergencyFund,
    goals,
    zakat,
    purification: { candidates, detectedCreditedCents: candidates.reduce((s, c) => s + c.creditedCents, 0), summary: data.purificationItems ? summarizePurification(data.purificationItems) : null },
  };
}
