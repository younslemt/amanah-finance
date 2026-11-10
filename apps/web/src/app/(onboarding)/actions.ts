'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireSession } from '@/lib/supabase/session';
import { APP_DOCUMENTS, documentHash, LEGAL_DOCUMENTS, RELIGIOUS_DOCUMENT, type LegalKind } from '@/lib/legal/documents';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { fieldErrorsOf, formDataToObject, profileSchema } from '@/lib/validation';

const DEMO = formError('Fonction désactivée en mode démonstration.');

/** Enregistre l'acceptation des documents exigés pour l'application (chacun doit être coché). */
export async function acceptConsents(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const unchecked = APP_DOCUMENTS.filter((d) => fd.get(`consent_${d.kind}`) !== 'yes');
  if (unchecked.length) {
    return formError('Chaque case doit être cochée pour utiliser l’application.',
      Object.fromEntries(unchecked.map((d) => [`consent_${d.kind}`, `À cocher : ${d.title}.`])));
  }
  const rows = await Promise.all(APP_DOCUMENTS.map(async (d) => ({
    user_id: ctx.userId, kind: d.kind, granted: true, document_version: d.version,
    document_hash: await documentHash(d), collected_via: 'web',
  })));
  const { error } = await ctx.supabase.from('consents').insert(rows);
  if (error) { console.error('[consents] insert', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  redirect(ctx.profileCompleted ? '/dashboard' : '/bienvenue/profil');
}

/** Retrait d'un consentement : nouvelle ligne « refusé », l'historique est conservé. */
export async function withdrawConsent(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const kind = String(fd.get('kind')) as LegalKind;
  const doc = LEGAL_DOCUMENTS.find((d) => d.kind === kind);
  if (!doc) return formError('Document inconnu.');
  if (kind === 'special_category') return withdrawReligiousConsent(_prev, fd);
  const { error } = await ctx.supabase.from('consents').insert({ user_id: ctx.userId, kind, granted: false, document_version: doc.version, collected_via: 'web' });
  if (error) { console.error('[consents] withdraw', error.code); return formError('Retrait impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  redirect('/bienvenue/consentements');
}

/** Active les fonctions de finance islamique : consentement explicite article 9, preuve du texte. */
export async function activateReligiousFeatures(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  if (fd.get('consent_special_category') !== 'yes') {
    return formError('Cochez la case pour donner votre consentement explicite.', { consent_special_category: 'Consentement explicite requis.' });
  }
  const { error } = await ctx.supabase.from('consents').insert({
    user_id: ctx.userId, kind: 'special_category', granted: true, document_version: RELIGIOUS_DOCUMENT.version,
    document_hash: await documentHash(RELIGIOUS_DOCUMENT), collected_via: 'web',
  });
  if (error) { console.error('[consents] religious', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  const next = String(fd.get('next') ?? '');
  redirect(/^\/(goals|zakat|purification|finance-islamique)$/.test(next) ? next : '/finance-islamique');
}

/**
 * Retrait du consentement article 9 : seules les fonctions religieuses sont fermées.
 * L'utilisateur conserve ses données (inaccessibles) ou les fait effacer, dans la même transaction.
 */
export async function withdrawReligiousConsent(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const choice = fd.get('data');
  if (choice !== 'keep' && choice !== 'erase') {
    return formError('Indiquez ce que deviennent vos données de finance islamique.', { data: 'Choisissez « conserver » ou « effacer ».' });
  }
  const { error } = await ctx.supabase.rpc('withdraw_religious_consent', {
    p_document_version: RELIGIOUS_DOCUMENT.version, p_erase: choice === 'erase',
  });
  if (error) { console.error('[consents] withdraw religious', error.code); return formError('Retrait impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  redirect(`/finance-islamique?retrait=${choice}`);
}

/** Partage de ses données de finance islamique avec les autres membres du foyer (désactivé par défaut). */
export async function saveReligiousSharing(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  if (!ctx.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique.');
  const share = fd.get('share') === 'yes';
  const { error } = await ctx.supabase.from('religious_preferences')
    .upsert({ user_id: ctx.userId, share_with_household: share }, { onConflict: 'user_id' });
  if (error) { console.error('[prefs] sharing', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  return formOk(share ? 'Vos données sont partagées avec les membres du foyer qui ont donné ce consentement.' : 'Vos données de finance islamique restent privées.');
}

/** Profil : prénom ou pseudonyme, nom et région du foyer. */
export async function saveProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const ctx = await requireSession();
  const parsed = profileSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  // Profil et foyer dans UNE transaction ; le nom du foyer n'est modifié que par son propriétaire
  const { error } = await ctx.supabase.rpc('save_profile', {
    p_household_id: ctx.householdId, p_display_name: parsed.data.displayName,
    p_household_name: parsed.data.householdName, p_region: parsed.data.region,
  });
  if (error) { console.error('[profile] save', error.code); return formError('Enregistrement impossible. Réessayez.'); }
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
