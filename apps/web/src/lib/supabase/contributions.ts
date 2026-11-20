import 'server-only';
import type { SessionContext } from './session.ts';
import type { CalcSummaryRow, ContributionRow, DebitRow, FitrRow } from '../contributions-view.ts';

/**
 * Dons, Zakat al-Fitr et calculs de Zakat lisibles par la personne (RLS article 9 :
 * les siens, et ceux qu'un membre du foyer a choisi de partager), plus les débits
 * bancaires récents qui peuvent servir de preuve. Aucune donnée n'est écrite ici.
 */
export async function loadDonations(ctx: SessionContext, since: string) {
  const [contributions, fitr, calcs, debits] = await Promise.all([
    ctx.supabase.from('contributions')
      .select('id, owner_id, kind, amount_cents, paid_on, beneficiary_label, note, transaction_id, zakat_calculation_id, zakat_fitr_id, confirmation_source, confirmed_on')
      .eq('household_id', ctx.householdId).order('paid_on', { ascending: false }).limit(2000),
    ctx.supabase.from('zakat_fitr_obligations')
      .select('id, owner_id, civil_year, hijri_year, hijri_year_status, persons, amount_per_person_cents, due_cents, amount_source')
      .eq('household_id', ctx.householdId).order('civil_year', { ascending: false }).limit(100),
    ctx.supabase.from('zakat_calculations')
      .select('id, owner_id, as_of, status, zakat_due_cents')
      .eq('household_id', ctx.householdId).order('as_of', { ascending: false }).limit(100),
    ctx.supabase.from('transactions')
      .select('id, booked_on, amount_cents, description')
      .eq('household_id', ctx.householdId).lt('amount_cents', 0).gte('booked_on', since).order('booked_on', { ascending: false }).limit(3000),
  ]);
  for (const r of [contributions, fitr, calcs, debits]) if (r.error) throw r.error;
  return {
    contributions: (contributions.data ?? []) as ContributionRow[],
    fitr: (fitr.data ?? []) as FitrRow[],
    calculations: (calcs.data ?? []) as CalcSummaryRow[],
    debits: (debits.data ?? []) as DebitRow[],
  };
}
