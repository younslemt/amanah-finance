import 'server-only';
import { detectInterest, type PurificationBasis } from '@amanah/engines';
import type { SessionContext } from './session.ts';
import type { PurificationRow } from '../purification-review.ts';

export async function loadPurification(ctx: SessionContext) {
  const [items, prefs, gifts] = await Promise.all([
    ctx.supabase.from('purification_items')
      .select('id, owner_id, transaction_id, source_kind, credited_cents, gross_cents, withholding_tax_cents, basis, amount_to_purify_cents, status, occurred_on, detection_reason, contribution_id, transactions(description)')
      .eq('household_id', ctx.householdId).order('occurred_on', { ascending: false }).limit(500),
    ctx.supabase.from('religious_preferences').select('purification_basis').eq('user_id', ctx.userId).maybeSingle(),
    ctx.supabase.from('contributions').select('id, amount_cents, paid_on, beneficiary_label, owner_id')
      .eq('household_id', ctx.householdId).eq('kind', 'purification').order('paid_on', { ascending: false }).limit(50),
  ]);
  if (items.error) throw items.error;
  if (gifts.error) throw gifts.error;
  return {
    rows: (items.data ?? []) as unknown as PurificationRow[],
    basis: ((prefs.data?.purification_basis as PurificationBasis | null) ?? null),
    gifts: (gifts.data ?? []) as Array<{ id: string; amount_cents: number | string; paid_on: string; beneficiary_label: string | null; owner_id: string }>,
  };
}

/**
 * Détection sur les opérations déjà enregistrées (saisie manuelle, imports antérieurs
 * au consentement) : moteur detectInterest, puis UNE insertion ; les opérations déjà
 * suivies sont ignorées par la base (unicité de transaction_id).
 */
export async function detectFromTransactions(ctx: SessionContext, since: string): Promise<number> {
  const PAGE = 1000;
  const txs: Array<{ id: string; booked_on: string; amount_cents: number | string; description: string; category_slug: string | null; is_interest: boolean }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.supabase.from('transactions')
      .select('id, booked_on, amount_cents, description, category_slug, is_interest')
      .eq('household_id', ctx.householdId).gt('amount_cents', 0).gte('booked_on', since).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    txs.push(...((data ?? []) as typeof txs));
    if (!data || data.length < PAGE) break;
  }
  const candidates = detectInterest(txs.map((t) => ({
    id: t.id, accountId: '', bookedOn: t.booked_on, amountCents: Number(t.amount_cents), currency: 'EUR',
    description: t.description, categorySlug: t.category_slug ?? undefined, isInterest: t.is_interest,
  })));
  if (candidates.length === 0) return 0;
  const { data, error } = await ctx.supabase.from('purification_items').upsert(candidates.map((c) => ({
    household_id: ctx.householdId, transaction_id: c.transactionId, source_kind: c.sourceKind,
    credited_cents: c.creditedCents, occurred_on: c.bookedOn, detection_reason: c.reason.slice(0, 120),
  })), { onConflict: 'transaction_id', ignoreDuplicates: true }).select('id');
  if (error) throw error;
  return (data ?? []).length;
}
