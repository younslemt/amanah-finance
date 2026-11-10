/**
 * Conversion des lignes Supabase (schéma des migrations 0001 à 0007) vers les
 * structures des moteurs. Fonctions pures : testées sans base ni réseau.
 */
import type {
  CategoryInfo, Goal, GoalAllocation, MetalPrice, Transaction, ZakatAsset, ZakatLiability, ZakatOptions,
} from '@amanah/engines';
import type { HouseholdAccount, HouseholdData } from './snapshot.ts';

// --- Lignes de la base (sous-ensemble des colonnes lues) ----------------------
export interface AccountRow { id: string; name: string; type: string; currency: string; iban_last4: string | null; opening_balance_cents: number | string; archived: boolean }
export interface TransactionRow { id: string; account_id: string; booked_on: string; amount_cents: number | string; currency: string; description: string; counterparty_name: string | null; category_slug: string | null; is_interest: boolean }
export interface CategoryRow { slug: string; kind: 'income' | 'expense' | 'transfer'; is_essential: boolean; is_interest: boolean; household_id: string | null; label?: string | null }
export interface BudgetRow { category_slug: string; limit_cents: number | string; month: string }
export interface GoalRow { id: string; kind: Goal['kind']; name: string; target_cents: number | string; target_date: string; status: string; monthly_capacity_cents?: number | string | null }
export interface AllocationRow { goal_id: string; amount_cents: number | string; allocated_on: string }
export interface AssetRow { id: string; kind: ZakatAsset['kind']; name: string; value_cents: number | string; weight_mg: number | string | null; purity_permille: number | null; is_accessible: boolean; receivable_likely: boolean | null; account_id: string | null; details: Record<string, unknown> | null }
export interface LiabilityRow { id: string; name: string; outstanding_cents: number | string; due_12m_cents: number | string }
export interface PriceRow { symbol: 'XAU' | 'XAG'; price_per_g_cents: number | string; as_of: string }
export interface ZakatSettingsRow { nisab_basis: 'gold' | 'silver' | null; year_basis: 'lunar' | 'solar'; hawl_date: string | null; options: Record<string, unknown> | null }

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
    balanceCents: fromDb?.has(a.id) ? toCents(fromDb.get(a.id)) : toCents(a.opening_balance_cents) + (sums.get(a.id) ?? 0),
  }));
}

/** Préférences Zakat : seules des valeurs connues sont acceptées, sinon le moteur reste « à déterminer ». */
export function zakatOptionsFrom(row: ZakatSettingsRow | null): { options: ZakatOptions; hawlStart?: string } {
  const o = (row?.options ?? {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const ratio = typeof o.long_term_ratio === 'number' && o.long_term_ratio >= 0 && o.long_term_ratio <= 1 ? o.long_term_ratio : null;
  return {
    hawlStart: row?.hawl_date ?? undefined,
    options: {
      nisabBasis: row?.nisab_basis ?? null,
      yearBasis: row?.year_basis ?? 'lunar',
      personalJewelry: pick(o.personal_jewelry, ['include', 'exclude'] as const, 'exclude'),
      longTermInvestments: o.long_term_investments === 'custom_ratio' && ratio !== null ? { mode: 'custom_ratio', ratio } : { mode: 'full_market_value' },
      lockedPensions: pick(o.locked_pensions, ['exclude', 'include'] as const, 'exclude'),
      debts: pick(o.debts, ['due_12_months', 'none', 'all'] as const, 'due_12_months'),
    },
  };
}

function latestPrice(rows: PriceRow[], symbol: 'XAU' | 'XAG'): MetalPrice | null {
  const r = rows.filter((p) => p.symbol === symbol).sort((a, b) => (a.as_of < b.as_of ? 1 : -1))[0];
  return r ? { pricePerGramCents: toCents(r.price_per_g_cents), asOf: r.as_of } : null;
}

export function mapHouseholdRows(rows: HouseholdRows): HouseholdData {
  const accounts = accountBalances(rows.accounts, rows.transactions, rows.accountBalances);
  const month = `${rows.asOf.slice(0, 7)}-01`;

  // Catégories du foyer prioritaires sur les catégories système de même code
  const cats = new Map<string, CategoryInfo>();
  for (const c of [...rows.categories].sort((a, b) => (a.household_id === null ? -1 : 1) - (b.household_id === null ? -1 : 1))) {
    cats.set(c.slug, { slug: c.slug, kind: c.kind, isEssential: c.is_essential, isInterest: c.is_interest, label: c.label ?? undefined });
  }

  const transactions: Transaction[] = rows.transactions.map((t) => ({
    id: t.id, accountId: t.account_id, bookedOn: t.booked_on, amountCents: toCents(t.amount_cents),
    currency: t.currency as Transaction['currency'], description: t.description,
    counterpartyName: t.counterparty_name ?? undefined, categorySlug: t.category_slug ?? undefined, isInterest: t.is_interest,
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

  const zakat = zakatOptionsFrom(rows.zakatSettings);
  return {
    asOf: rows.asOf,
    accounts,
    transactions,
    categories: [...cats.values()],
    budget: rows.budgets.filter((b) => b.month === month).map((b) => ({ categorySlug: b.category_slug, limitCents: toCents(b.limit_cents) })),
    goals: rows.goals.filter((g) => g.status !== 'archived').map((g) => ({
      id: g.id, kind: g.kind, name: g.name, targetCents: toCents(g.target_cents), targetDate: g.target_date,
      monthlyCapacityCents: g.monthly_capacity_cents === null || g.monthly_capacity_cents === undefined ? undefined : toCents(g.monthly_capacity_cents),
    })),
    allocations: rows.allocations.map((a) => ({ goalId: a.goal_id, amountCents: toCents(a.amount_cents), allocatedOn: a.allocated_on })) as GoalAllocation[],
    assets: [...accountAssets, ...manualAssets],
    liabilities: rows.liabilities.map((l): ZakatLiability => ({ id: l.id, label: l.name, outstandingCents: toCents(l.outstanding_cents), due12mCents: toCents(l.due_12m_cents) })),
    prices: { gold: latestPrice(rows.prices, 'XAU'), silver: latestPrice(rows.prices, 'XAG') },
    zakat,
    emergencyFundMonths: 3,
  };
}
