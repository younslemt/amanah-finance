'use server';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { detectFromTransactions } from '@/lib/supabase/purification';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { planReview, type PurificationRow } from '@/lib/purification-review';
import {
  fieldErrorsOf, formDataToObject, purificationBasisSchema, purificationRecordSchema, purificationReviewSchema,
} from '@/lib/validation';

/**
 * Purification : réservée aux personnes ayant un consentement article 9 en vigueur
 * (vérifié ici pour le message, imposé par la RLS). Aucun paiement n'est exécuté.
 */
async function religiousContext(): Promise<SessionContext | FormState> {
  if (isDemoMode) return formError('Fonction désactivée en mode démonstration.');
  const ctx = await requireOnboardedSession();
  if (!ctx.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  if (!ctx.canWrite) return formError('Votre rôle dans ce foyer ne permet que la lecture.');
  return ctx;
}
const isState = (v: SessionContext | FormState): v is FormState => 'status' in v;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
const done = (m: string) => { revalidatePath('/', 'layout'); return formOk(m); };

export async function detectPurification(_p: FormState, _fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const [y] = today().split('-').map(Number);
  const created = await detectFromTransactions(ctx, `${y - 2}-01-01`).catch((e: { code?: string }) => { console.error('[purification] detect', e.code); return -1; });
  if (created < 0) return formError('Détection impossible. Réessayez.');
  return done(created === 0 ? 'Aucun nouveau revenu d’intérêt détecté.' : `${created} revenu(s) d’intérêts détecté(s) : à examiner.`);
}

export async function reviewPurification(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = purificationReviewSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const [{ data: row }, { data: prefs }] = await Promise.all([
    ctx.supabase.from('purification_items').select('id, owner_id, status, credited_cents, gross_cents, withholding_tax_cents, transaction_id, source_kind, basis, amount_to_purify_cents, occurred_on, detection_reason, contribution_id')
      .eq('id', d.id).eq('household_id', ctx.householdId).maybeSingle(),
    ctx.supabase.from('religious_preferences').select('purification_basis').eq('user_id', ctx.userId).maybeSingle(),
  ]);
  if (!row || (row as PurificationRow).owner_id !== ctx.userId) return formError('Élément introuvable.');
  const plan = planReview(row as PurificationRow, d.decision, { gross: d.gross, withholding: d.withholding }, prefs?.purification_basis ?? null);
  if (!plan.ok) return formError(plan.message);
  const { error, count } = await ctx.supabase.from('purification_items').update(plan.update, { count: 'exact' })
    .eq('id', d.id).eq('status', (row as PurificationRow).status);  // refusé si l'élément a changé entre-temps
  if (error) { console.error('[purification] review', error.code); return formError('Enregistrement impossible : montants ou décision refusés.'); }
  if (count !== 1) return formError('L’élément a été modifié entre-temps : rechargez la page.');
  const msg = { confirm: 'Élément confirmé.', reject: 'Élément écarté : ce n’est pas un intérêt.', restore: 'Élément remis à examiner.', unconfirm: 'Confirmation annulée.' }[d.decision];
  return done(plan.update.status === 'confirmed' && plan.update.amount_to_purify_cents === null ? `${msg} Montant à déterminer : choisissez une méthodologie${d.gross === null && d.withholding === null ? ' ou indiquez le brut' : ''}.` : msg);
}

export async function setPurificationMethod(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = purificationBasisSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Choisissez une méthodologie.', fieldErrorsOf(parsed.error));
  const { data, error } = await ctx.supabase.rpc('set_purification_basis', { p_basis: parsed.data.basis });
  if (error) { console.error('[purification] basis', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  return done(`Méthodologie enregistrée${Number(data) > 0 ? ` et appliquée à ${data} élément(s) confirmé(s)` : ''}.`);
}

export async function recordPurification(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = purificationRecordSchema.safeParse({
    itemIds: fd.getAll('itemIds').map(String), paidOn: String(fd.get('paidOn') ?? ''), beneficiary: String(fd.get('beneficiary') ?? ''),
  });
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  if (parsed.data.paidOn > today()) return formError('Vérifiez les informations saisies.', { paidOn: 'La date ne peut pas être dans le futur.' });
  // Contribution et éléments « purifiés » dans UNE transaction ; aucun paiement n'est exécuté
  const { error } = await ctx.supabase.rpc('record_purification', {
    p_household_id: ctx.householdId, p_item_ids: parsed.data.itemIds, p_paid_on: parsed.data.paidOn, p_beneficiary_label: parsed.data.beneficiary,
  });
  if (error) {
    console.error('[purification] record', error.code);
    return formError('Enregistrement refusé : seuls des éléments confirmés, au montant déterminé, peuvent être marqués purifiés.');
  }
  return done('Purification enregistrée. Aucun paiement n’a été effectué par l’application.');
}
