import 'server-only';
import type { SessionContext } from './session.ts';
import type { CalculationRow } from '../zakat-view.ts';
import type { ContributionRow, FitrRow } from '../contributions-view.ts';

export interface AssetListRow { id: string; kind: string; name: string; value_cents: number | string; weight_mg: number | string | null; purity_permille: number | null; account_id: string | null; details: Record<string, unknown> | null }
export interface LiabilityListRow { id: string; kind: string; name: string; outstanding_cents: number | string; due_12m_cents: number | string }
export interface MyPriceRow { id: string; symbol: 'XAU' | 'XAG'; price_per_g_cents: number | string; as_of: string; source: string }

/** Données de gestion de la page Zakat : biens et dettes du foyer, prix et calculs de la personne. */
export async function loadZakatPage(ctx: SessionContext) {
  const [assets, liabilities, prices, calcs, payments] = await Promise.all([
    ctx.supabase.from('assets').select('id, kind, name, value_cents, weight_mg, purity_permille, account_id, details').eq('household_id', ctx.householdId).order('created_at'),
    ctx.supabase.from('liabilities').select('id, kind, name, outstanding_cents, due_12m_cents').eq('household_id', ctx.householdId).order('created_at'),
    ctx.supabase.from('zakat_metal_prices').select('id, symbol, price_per_g_cents, as_of, source')
      .eq('household_id', ctx.householdId).eq('owner_id', ctx.userId).order('as_of', { ascending: false }).limit(40),
    ctx.supabase.from('zakat_calculations')
      .select('id, owner_id, as_of, status, zakat_due_cents, zakatable_cents, nisab_cents, engine_version, ruleset_id, ruleset_version, inputs, result, created_at')
      .eq('household_id', ctx.householdId).eq('owner_id', ctx.userId).order('as_of', { ascending: false }).limit(30),
    ctx.supabase.from('contributions').select('id, owner_id, kind, amount_cents, paid_on, beneficiary_label, transaction_id, zakat_calculation_id, confirmation_source, confirmed_on')
      .eq('household_id', ctx.householdId).eq('owner_id', ctx.userId).eq('kind', 'zakat').limit(1000),
  ]);
  for (const r of [assets, liabilities, prices, calcs, payments]) if (r.error) throw r.error;
  return {
    assets: (assets.data ?? []) as AssetListRow[],
    liabilities: (liabilities.data ?? []) as LiabilityListRow[],
    prices: (prices.data ?? []) as MyPriceRow[],
    calculations: (calcs.data ?? []) as CalculationRow[],
    payments: (payments.data ?? []) as ContributionRow[],
  };
}

export async function loadFitr(ctx: SessionContext) {
  const [fitr, payments] = await Promise.all([
    ctx.supabase.from('zakat_fitr_obligations').select('id, owner_id, civil_year, hijri_year, hijri_year_status, persons, amount_per_person_cents, due_cents, amount_source')
      .eq('household_id', ctx.householdId).eq('owner_id', ctx.userId).order('civil_year', { ascending: false }),
    ctx.supabase.from('contributions').select('id, owner_id, kind, amount_cents, paid_on, beneficiary_label, transaction_id, zakat_fitr_id, confirmation_source, confirmed_on')
      .eq('household_id', ctx.householdId).eq('owner_id', ctx.userId).eq('kind', 'zakat_al_fitr').limit(1000),
  ]);
  for (const r of [fitr, payments]) if (r.error) throw r.error;
  return { fitr: (fitr.data ?? []) as FitrRow[], payments: (payments.data ?? []) as ContributionRow[] };
}
