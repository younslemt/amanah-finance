import 'server-only';
import { createSupabaseServerClient } from './server.ts';
import { mapHouseholdRows, type HouseholdRows } from '../household-mapper.ts';
import type { HouseholdData } from '../snapshot.ts';

/**
 * Chargement des données du foyer de l'utilisateur connecté (mode live).
 * Toutes les requêtes passent par la RLS avec la session de l'utilisateur :
 * aucune clé service_role n'est utilisée ici.
 * Préparé au Sprint 0.1, branché aux écrans de saisie au Sprint 1.
 */
export class NotAuthenticatedError extends Error {
  constructor() { super('Utilisateur non connecté'); this.name = 'NotAuthenticatedError'; }
}

const HISTORY_MONTHS = 6;

export async function loadHouseholdData(asOf: string): Promise<HouseholdData> {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new NotAuthenticatedError();

  const { data: membership, error: mErr } = await supabase
    .from('household_members').select('household_id, role').eq('user_id', auth.user.id)
    .order('joined_at', { ascending: true }).limit(1).maybeSingle();
  if (mErr) throw mErr;
  if (!membership) throw new Error('Aucun foyer associé au compte');
  const hid = membership.household_id as string;

  const [y, m] = asOf.split('-').map(Number);
  const since = new Date(Date.UTC(y, m - 1 - HISTORY_MONTHS, 1)).toISOString().slice(0, 10);

  // L'API REST plafonne chaque réponse (1 000 lignes par défaut) : lecture paginée
  const PAGE = 1000;
  const recentTransactions: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from('transactions')
      .select('id, account_id, booked_on, amount_cents, currency, description, counterparty_name, category_slug, is_interest')
      .eq('household_id', hid).gte('booked_on', since).order('booked_on', { ascending: false }).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    recentTransactions.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const q = await Promise.all([
    supabase.from('accounts').select('id, name, type, currency, iban_last4, opening_balance_cents, archived').eq('household_id', hid),
    supabase.from('account_balances').select('account_id, balance_cents').eq('household_id', hid),
    supabase.from('categories').select('slug, kind, is_essential, is_interest, household_id'),
    supabase.from('budgets').select('category_slug, limit_cents, month').eq('household_id', hid).gte('month', since),
    supabase.from('goals').select('id, kind, name, target_cents, target_date, status').eq('household_id', hid),
    supabase.from('goal_allocations').select('goal_id, amount_cents, allocated_on').eq('household_id', hid),
    supabase.from('assets').select('id, kind, name, value_cents, weight_mg, purity_permille, is_accessible, receivable_likely, account_id, details').eq('household_id', hid),
    supabase.from('liabilities').select('id, name, outstanding_cents, due_12m_cents').eq('household_id', hid),
    supabase.from('market_prices').select('symbol, price_per_g_cents, as_of').eq('currency', 'EUR').order('as_of', { ascending: false }).limit(20),
    supabase.from('zakat_settings').select('nisab_basis, year_basis, hawl_date, options').eq('household_id', hid).maybeSingle(),
  ]);
  const failed = q.find((r) => r.error);
  if (failed?.error) throw failed.error;

  const balances = new Map(((q[1].data ?? []) as Array<{ account_id: string; balance_cents: number | string }>).map((b) => [b.account_id, b.balance_cents]));
  const data = mapHouseholdRows({
    asOf,
    accounts: (q[0].data ?? []) as HouseholdRows['accounts'],
    transactions: recentTransactions as HouseholdRows['transactions'],
    categories: (q[2].data ?? []) as HouseholdRows['categories'],
    budgets: (q[3].data ?? []) as HouseholdRows['budgets'],
    goals: (q[4].data ?? []) as HouseholdRows['goals'],
    allocations: (q[5].data ?? []) as HouseholdRows['allocations'],
    assets: (q[6].data ?? []) as HouseholdRows['assets'],
    liabilities: (q[7].data ?? []) as HouseholdRows['liabilities'],
    prices: (q[8].data ?? []) as HouseholdRows['prices'],
    zakatSettings: (q[9].data ?? null) as HouseholdRows['zakatSettings'],
    accountBalances: balances,
  });
  return data;
}
