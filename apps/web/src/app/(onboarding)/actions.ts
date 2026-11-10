'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireSession } from '@/lib/supabase/session';
import { documentHash, LEGAL_DOCUMENTS, type LegalKind } from '@/lib/legal/documents';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { fieldErrorsOf, formDataToObject, profileSchema } from '@/lib/validation';

const DEMO = formError('Fonction désactivée en mode démonstration.');

/** Enregistre l'acceptation des trois documents (chacun doit être coché). */
export async function acceptConsents(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const unchecked = LEGAL_DOCUMENTS.filter((d) => fd.get(`consent_${d.kind}`) !== 'yes');
  if (unchecked.length) {
    return formError('Chaque case doit être cochée pour utiliser l’application.',
      Object.fromEntries(unchecked.map((d) => [`consent_${d.kind}`, `À cocher : ${d.title}.`])));
  }
  const rows = await Promise.all(LEGAL_DOCUMENTS.map(async (d) => ({
    user_id: ctx.userId, kind: d.kind, granted: true, document_version: d.version,
    document_hash: await documentHash(d), collected_via: 'web',
  })));
  const { error } = await ctx.supabase.from('consents').insert(rows);
  if (error) { console.error('[consents] insert', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  redirect('/bienvenue/profil');
}

/** Retrait d'un consentement : nouvelle ligne « refusé », l'historique est conservé. */
export async function withdrawConsent(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const kind = String(fd.get('kind')) as LegalKind;
  const doc = LEGAL_DOCUMENTS.find((d) => d.kind === kind);
  if (!doc) return formError('Document inconnu.');
  const { error } = await ctx.supabase.from('consents').insert({ user_id: ctx.userId, kind, granted: false, document_version: doc.version, collected_via: 'web' });
  if (error) { console.error('[consents] withdraw', error.code); return formError('Retrait impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  redirect('/bienvenue/consentements');
}

/** Profil : prénom ou pseudonyme, nom et région du foyer. */
export async function saveProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const parsed = profileSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const [p, h] = await Promise.all([
    ctx.supabase.from('profiles').update({ display_name: parsed.data.displayName, profile_completed_at: new Date().toISOString() }).eq('id', ctx.userId),
    ctx.supabase.from('households').update({ name: parsed.data.householdName, region: parsed.data.region }).eq('id', ctx.householdId),
  ]);
  if (p.error || h.error) { console.error('[profile] update', p.error?.code, h.error?.code); return formError('Enregistrement impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  if (fd.get('from') === 'onboarding') redirect('/dashboard');
  return formOk('Profil enregistré.');
}

/** Suppression définitive du compte et de toutes les données (RGPD, art. 17). */
export async function deleteAccount(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  if (fd.get('confirmation') !== 'SUPPRIMER') {
    return formError('Pour confirmer, saisissez SUPPRIMER en majuscules.', { confirmation: 'Saisissez SUPPRIMER pour confirmer.' });
  }
  const ctx = await requireSession();
  const { error } = await ctx.supabase.rpc('delete_my_account');
  if (error) { console.error('[account] delete', error.code); return formError('Suppression impossible. Réessayez ou contactez le support.'); }
  await ctx.supabase.auth.signOut().catch(() => undefined);
  redirect('/connexion?message=account_deleted');
}
