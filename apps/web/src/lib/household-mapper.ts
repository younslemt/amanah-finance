/**
 * Conversion des lignes Supabase (schéma des migrations 0001 à 0007) vers les
 * structures des moteurs. Fonctions pures : testées sans base ni réseau.
 */
import { selectMetalPrice, type AnalysisCategory, type Goal, type GoalAllocation, type PriceEntry, type Transaction, type ZakatAsset, type ZakatChoices, type ZakatLiability } from '@amanah/engines';
import type { HouseholdAccount, HouseholdData } from './snapshot.ts';

// --- Lignes de la base (sous-ensemble des colonnes lues) ----------------------
export interface AccountRow { id: string; name: string; type: string; currency: string; iban_last4: string | null; opening_balance_cents: number | string; archived: boolean; counts_as_reserve?: boolean | null }
export interface TransactionRow { id: string; account_id: string; booked_on: string; amount_cents: number | string; currency: string; description: string; counterparty_name: string | null; category_slug: string | null; is_interest: boolean; counterparty_iban_last4?: string | null }
export interface CategoryRow { slug: string; kind: 'income' | 'expense' | 'transfer'; is_essential: boolean; is_interest: boolean; household_id: string | null; label?: string | null; default_nature?: 'fixed' | 'variable' | null }
export interface BudgetRow { category_slug: string; limit_cents: number | string; month: string }
export interface GoalRow {
  id: string; kind: Goal['kind']; name: string; target_cents: number | string; target_date: string; status: string;
  monthly_capacity_cents?: number | string | null; priority?: number | null; realized_on?: string | null;
  plan_confirmed_on?: string | null; strategy_monthly_cents?: number | string | null; strategy_chosen_on?: string | null;
  template_id?: string | null; occurrence_year?: number | null; previous_goal_id?: string | null;
}
export interface AllocationRow { goal_id: string; amount_cents: number | string; allocated_on: string; source?: 'initial' | 'manual' | null }
export interface AssetRow { id: string; kind: ZakatAsset['kind']; name: string; value_cents: number | string; weight_mg: number | string | null; purity_permille: number | null; is_accessible: boolean; receivable_likely: boolean | null; account_id: string | null; details: Record<string, unknown> | null }
export interface LiabilityRow { id: string; name: string; outstanding_cents: number | string; due_12m_cents: number | string }
export interface PriceRow { symbol: 'XAU' | 'XAG'; price_per_g_cents: number | string; as_of: string; source?: string | null }
export interface ZakatSettingsRow { nisab_basis: 'gold' | 'silver' | null; year_basis: 'lunar' | 'solar' | null; hawl_date: string | null; options: Record<string, unknown> | null }

export interface HouseholdRows {
  asOf: string;
  accounts: AccountRow[];
  transactions: TransactionRow[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
  goals: GoalRow[];
  allocations: AllocationRow[];
  assets: AssetRow[];
  liabilities: LiabilityRow[];
  prices: PriceRow[];
  zakatSettings: ZakatSettingsRow | null;
  /** Soldes calculés par la base (vue account_balances). Prioritaires sur le recalcul local. */
  accountBalances?: ReadonlyMap<string, number | string>;
}

/** PostgREST renvoie les bigint en chaîne au-delà de 2^53 : conversion contrôlée, jamais en flottant. */
export function toCents(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isSafeInteger(n)) throw new RangeError(`montant hors des entiers exacts : ${v}`);
  return n;
}

const LIQUID = new Set(['current', 'savings', 'regulated_savings', 'cash']);

/** Les soldes de comptes sont la source de vérité pour les liquidités bancaires (pas de double saisie). */
export function accountBalances(accounts: AccountRow[], txs: Array<Pick<TransactionRow, 'account_id' | 'amount_cents'>>, fromDb?: ReadonlyMap<string, number | string>): HouseholdAccount[] {
  const sums = new Map<string, number>();
  for (const t of txs) sums.set(t.account_id, (sums.get(t.account_id) ?? 0) + toCents(t.amount_cents));
  return accounts.filter((a) => !a.archived).map((a) => ({
    id: a.id, name: a.name, type: a.type, ibanLast4: a.iban_last4 ?? undefined,
    ...(a.counts_as_reserve !== undefined ? { countsAsReserve: a.counts_as_reserve } : {}),
    balanceCents: fromDb?.has(a.id) ? toCents(fromDb.get(a.id)) : toCents(a.opening_balance_cents) + (sums.get(a.id) ?? 0),
  }));
}

/**
 * Choix Zakat de la personne. Aucune valeur n'est supposée : une option absente ou
 * inconnue reste « non choisie » (null) et le calcul la demande si elle compte.
 */
export function zakatChoicesFrom(row: ZakatSettingsRow | null): ZakatChoices {
  const o = (row?.options ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (allowed.includes(v as T) ? (v as T) : null);
  const per100k = typeof o.long_term_ratio_per100k === 'number' && Number.isInteger(o.long_term_ratio_per100k) && o.long_term_ratio_per100k >= 0 && o.long_term_ratio_per100k <= 100_000
    ? o.long_term_ratio_per100k
    : typeof o.long_term_ratio === 'number' && o.long_term_ratio >= 0 && o.long_term_ratio <= 1 ? Math.round(o.long_term_ratio * 100_000) : null;
  return {
    nisabBasis: row?.nisab_basis ?? null,
    yearBasis: row?.year_basis ?? null,
    hawlStart: row?.hawl_date ?? null,
    personalJewelry: pick(o.personal_jewelry, ['include', 'exclude'] as const),
    longTermInvestments: pick(o.long_term_investments, ['full_market_value', 'custom_ratio'] as const),
    longTermRatioPer100k: per100k,
    lockedPensions: pick(o.locked_pensions, ['exclude', 'include'] as const),
    debts: pick(o.debts, ['due_12_months', 'none', 'all'] as const),
    excludedSourceIds: Array.isArray(o.excluded_source_ids) ? o.excluded_source_ids.filter((x): x is string => typeof x === 'string').slice(0, 500) : [],
  };
}

export function priceEntriesFrom(rows: readonly PriceRow[]): PriceEntry[] {
  return rows.map((r) => ({ symbol: r.symbol, pricePerGramCents: toCents(r.price_per_g_cents), asOf: r.as_of, source: r.source?.trim() || 'Source non précisée' }));
}

export function mapHouseholdRows(rows: HouseholdRows): HouseholdData {
  const accounts = accountBalances(rows.accounts, rows.transactions, rows.accountBalances);
  const month = `${rows.asOf.slice(0, 7)}-01`;

  // Catégories du foyer prioritaires sur les catégories système de même code
  const cats = new Map<string, AnalysisCategory>();
  for (const c of [...rows.categories].sort((a, b) => (a.household_id === null ? -1 : 1) - (b.household_id === null ? -1 : 1))) {
    cats.set(c.slug, { slug: c.slug, kind: c.kind, isEssential: c.is_essential, isInterest: c.is_interest, label: c.label ?? undefined, defaultNature: c.default_nature ?? undefined });
  }

  const transactions: Transaction[] = rows.transactions.map((t) => ({
    id: t.id, accountId: t.account_id, bookedOn: t.booked_on, amountCents: toCents(t.amount_cents),
    currency: t.currency as Transaction['currency'], description: t.description,
    counterpartyName: t.counterparty_name ?? undefined, categorySlug: t.category_slug ?? undefined, isInterest: t.is_interest,
    ...(t.counterparty_iban_last4 ? { counterpartyIbanLast4: t.counterparty_iban_last4 } : {}),
  }));

  const accountAssets: ZakatAsset[] = accounts
    .filter((a) => LIQUID.has(a.type) && a.balanceCents > 0)
    .map((a) => ({ id: `account:${a.id}`, kind: a.type === 'cash' ? 'cash' : 'bank_balance', label: a.name, valueCents: a.balanceCents }));

  const manualAssets: ZakatAsset[] = rows.assets
    .filter((a) => !(a.kind === 'bank_balance' && a.account_id)) // évite le double comptage avec le solde du compte
    .map((a) => {
      const metal = a.details && (a.details.metal === 'gold' || a.details.metal === 'silver') ? (a.details.metal as 'gold' | 'silver') : undefined;
      const heldFor = a.details && (a.details.held_for === 'trading' || a.details.held_for === 'long_term') ? (a.details.held_for as 'trading' | 'long_term') : undefined;
      const weight = a.weight_mg === null ? undefined : toCents(a.weight_mg);
      return {
        id: a.id, kind: a.kind, label: a.name,
        valueCents: weight !== undefined ? undefined : toCents(a.value_cents),
        weightMg: weight, purityPermille: a.purity_permille ?? undefined, metal, heldFor,
        isAccessible: a.is_accessible, receivableLikely: a.receivable_likely ?? undefined,
      };
    });

  const priceEntries = priceEntriesFrom(rows.prices);
  return {
    asOf: rows.asOf,
    accounts,
    transactions,
    categories: [...cats.values()],
    budget: rows.budgets.filter((b) => b.month === month).map((b) => ({ categorySlug: b.category_slug, limitCents: toCents(b.limit_cents) })),
    budgetHistory: rows.budgets.map((b) => ({ month: b.month.slice(0, 7), categorySlug: b.category_slug, limitCents: toCents(b.limit_cents) })),
    // Les projets archivés restent lus (consultation et historique) ; les moteurs les écartent de la planification
    goals: rows.goals.map(mapGoalRow),
    allocations: rows.allocations.map((a) => ({
      goalId: a.goal_id, amountCents: toCents(a.amount_cents), allocatedOn: a.allocated_on, ...(a.source ? { source: a.source } : {}),
    })) as GoalAllocation[],
    assets: [...accountAssets, ...manualAssets],
    liabilities: rows.liabilities.map((l): ZakatLiability => ({ id: l.id, label: l.name, outstandingCents: toCents(l.outstanding_cents), due12mCents: toCents(l.due_12m_cents) })),
    prices: { gold: selectMetalPrice(priceEntries, 'XAU', rows.asOf), silver: selectMetalPrice(priceEntries, 'XAG', rows.asOf) },
    priceEntries,
    zakat: { choices: zakatChoicesFrom(rows.zakatSettings) },
    emergencyFundMonths: 3,
  };
}

/** Projet de la base vers le modèle commun (décisions du parcours comprises). */
export function mapGoalRow(g: GoalRow): Goal {
  const strategy = g.strategy_monthly_cents !== null && g.strategy_monthly_cents !== undefined && g.strategy_chosen_on
    ? { strategy: { monthlyCents: toCents(g.strategy_monthly_cents), chosenOn: g.strategy_chosen_on } } : {};
  return {
    id: g.id, kind: g.kind, name: g.name, targetCents: toCents(g.target_cents), targetDate: g.target_date,
    monthlyCapacityCents: g.monthly_capacity_cents === null || g.monthly_capacity_cents === undefined ? undefined : toCents(g.monthly_capacity_cents),
    lifecycle: (['active', 'paused', 'achieved', 'archived'] as const).find((x) => x === g.status) ?? 'active',
    ...(g.realized_on ? { realizedOn: g.realized_on } : {}),
    ...(g.priority ? { priority: g.priority } : {}),
    ...(g.plan_confirmed_on ? { planConfirmedOn: g.plan_confirmed_on } : {}),
    ...strategy,
    ...(g.template_id ? { templateId: g.template_id } : {}),
    ...(g.occurrence_year ? { occurrence: g.occurrence_year } : {}),
    ...(g.previous_goal_id ? { previousGoalId: g.previous_goal_id } : {}),
  };
}
