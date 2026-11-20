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
      .select('id, account_id, booked_on, amount_cents, currency, description, counterparty_name, counterparty_iban_last4, category_slug, is_interest')
      .eq('household_id', hid).gte('booked_on', since).order('booked_on', { ascending: false }).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    recentTransactions.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const q = await Promise.all([
    supabase.from('accounts').select('id, name, type, currency, iban_last4, opening_balance_cents, archived, counts_as_reserve').eq('household_id', hid),
    supabase.from('account_balances').select('account_id, balance_cents').eq('household_id', hid),
    supabase.from('categories').select('slug, kind, is_essential, is_interest, household_id, label, default_nature'),
    supabase.from('budgets').select('category_slug, limit_cents, month').eq('household_id', hid).gte('month', since),
    supabase.from('goals').select('id, kind, name, target_cents, target_date, status, monthly_capacity_cents').eq('household_id', hid).order('created_at'),
    supabase.from('goal_allocations').select('goal_id, amount_cents, allocated_on').eq('household_id', hid),
    supabase.from('assets').select('id, kind, name, value_cents, weight_mg, purity_permille, is_accessible, receivable_likely, account_id, details').eq('household_id', hid),
    supabase.from('liabilities').select('id, name, outstanding_cents, due_12m_cents').eq('household_id', hid),
    supabase.from('market_prices').select('symbol, price_per_g_cents, as_of, source').eq('currency', 'EUR').order('as_of', { ascending: false }).limit(20),
    // Réglages Zakat : ceux de la personne connectée (migration 0011), visibles seulement avec le consentement article 9
    supabase.from('zakat_settings').select('nisab_basis, year_basis, hawl_date, options').eq('household_id', hid).eq('owner_id', auth.user.id).maybeSingle(),
    supabase.from('purification_items').select('id, credited_cents, amount_to_purify_cents, status').eq('household_id', hid).limit(2000),
    // Sprint 3 : choix du foyer et décisions personnelles sur les recommandations
    supabase.from('household_category_settings').select('category_slug, nature').eq('household_id', hid),
    supabase.from('recurring_feedback').select('series_key').eq('household_id', hid),
    supabase.from('recommendation_feedback').select('fingerprint, status, snooze_until').eq('household_id', hid).eq('user_id', auth.user.id),
    supabase.from('transfer_decisions').select('debit_id, credit_id, verdict').eq('household_id', hid),
    // Sprint 4 : prix des métaux saisis par la personne (article 9 : vides sans consentement)
    supabase.from('zakat_metal_prices').select('symbol, price_per_g_cents, as_of, source').eq('household_id', hid).eq('owner_id', auth.user.id)
      .order('as_of', { ascending: false }).limit(40),
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
    prices: [...((q[15].data ?? []) as HouseholdRows['prices']), ...((q[8].data ?? []) as HouseholdRows['prices'])],
    zakatSettings: (q[9].data ?? null) as HouseholdRows['zakatSettings'],
    accountBalances: balances,
  });
  type ItemRow = { id: string; credited_cents: number | string; amount_to_purify_cents: number | string | null; status: 'detected' | 'confirmed' | 'rejected' | 'purified' };
  data.purificationItems = ((q[10].data ?? []) as ItemRow[]).map((r) => ({
    id: r.id, creditedCents: Number(r.credited_cents), status: r.status,
    amountToPurifyCents: r.amount_to_purify_cents === null ? null : Number(r.amount_to_purify_cents),
  }));
  data.natureOverrides = Object.fromEntries(((q[11].data ?? []) as Array<{ category_slug: string; nature: 'fixed' | 'variable' }>).map((r) => [r.category_slug, r.nature]));
  data.notRecurring = ((q[12].data ?? []) as Array<{ series_key: string }>).map((r) => r.series_key);
  data.transferDecisions = ((q[14].data ?? []) as Array<{ debit_id: string; credit_id: string; verdict: 'confirmed' | 'rejected' }>)
    .map((r) => [`${r.debit_id}|${r.credit_id}`, r.verdict] as [string, 'confirmed' | 'rejected']);
  // Une recommandation reportée réapparaît à la date choisie
  data.hiddenRecommendations = ((q[13].data ?? []) as Array<{ fingerprint: string; status: string; snooze_until: string | null }>)
    .filter((r) => r.status !== 'snoozed' || (r.snooze_until !== null && r.snooze_until > asOf)).map((r) => r.fingerprint);
  return data;
}
