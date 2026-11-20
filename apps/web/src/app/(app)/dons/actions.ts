'use server';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { contributionLinkSchema, contributionSchema, fieldErrorsOf, formDataToObject, idSchema } from '@/lib/validation';

/**
 * Dons et Sadaqah : données article 9 (consentement vérifié ici pour le message,
 * imposé par la RLS). Aucun paiement n'est exécuté ; aucun justificatif n'est stocké.
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

export async function createContribution(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = contributionSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.paidOn > today()) return formError('Vérifiez les informations saisies.', { paidOn: 'La date ne peut pas être dans le futur.' });
  const { error } = await ctx.supabase.from('contributions').insert({
    household_id: ctx.householdId, kind: d.kind, amount_cents: d.amount, paid_on: d.paidOn,
    beneficiary_label: d.beneficiary, note: d.note,
    zakat_calculation_id: d.zakatCalculationId ?? null, zakat_fitr_id: d.zakatFitrId ?? null,
  });
  if (error) { console.error('[dons] create', error.code); return formError('Enregistrement refusé : vérifiez le type, la date et l’affectation.'); }
  return done('Don enregistré comme déclaré. Aucun paiement n’a été effectué par l’application.');
}

export async function deleteContribution(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = idSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Don invalide.');
  // Purifications exclues : elles se gèrent dans le parcours de purification
  const { error, count } = await ctx.supabase.from('contributions').delete({ count: 'exact' })
    .eq('id', parsed.data.id).eq('household_id', ctx.householdId).eq('owner_id', ctx.userId).neq('kind', 'purification');
  if (error) { console.error('[dons] delete', error.code); return formError('Suppression impossible.'); }
  if (count !== 1) return formError('Don introuvable ou non modifiable ici.');
  return done('Don supprimé.');
}

/**
 * Rapprochement avec une opération bancaire importée : le don passe de « déclaré » à « rapproché ».
 * Ce n'est ni une preuve de paiement définitive ni une preuve de réception par le bénéficiaire.
 */
export async function linkContribution(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = contributionLinkSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Sélection invalide.');
  const { error, count } = await ctx.supabase.from('contributions').update({ transaction_id: parsed.data.transactionId }, { count: 'exact' })
    .eq('id', parsed.data.id).eq('household_id', ctx.householdId).eq('owner_id', ctx.userId);
  if (error) { console.error('[dons] link', error.code); return formError('Rapprochement refusé : un débit du même montant, à 10 jours au plus, non déjà utilisé, est requis.'); }
  if (count !== 1) return formError('Don introuvable.');
  return done(parsed.data.transactionId ? 'Don rapproché avec l’opération bancaire sélectionnée (indice de paiement, pas une confirmation de réception).' : 'Rapprochement retiré : le don redevient déclaré.');
}
