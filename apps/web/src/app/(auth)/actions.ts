'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SITE_URL, isDemoMode } from '@/lib/env';
import { buildAuthCallbackUrl, classifyAuthError, safeRedirectPath } from '@/lib/redirect';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { fieldErrorsOf, formDataToObject, newPasswordSchema, resetRequestSchema, signInSchema, signUpSchema } from '@/lib/validation';

const DEMO = formError('Fonction désactivée en mode démonstration : aucune donnée réelle n’est utilisée.');
const TEMPORARY = 'Le service est momentanément indisponible. Réessayez dans un instant.';
const RATE_LIMITED = 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';

async function callbackUrl(next: string): Promise<string | null> {
  return buildAuthCallbackUrl(SITE_URL, (await headers()).get('origin'), next);
}

/** Inscription : e-mail + mot de passe ; l'adresse doit être confirmée par le lien reçu. */
export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const parsed = signUpSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const emailRedirectTo = await callbackUrl('/bienvenue/consentements');
  if (!emailRedirectTo) return formError('Configuration incomplète (URL du site). Contactez le support.');
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { emailRedirectTo } });
    const kind = classifyAuthError(error);
    if (kind === 'rate_limited') return formError(RATE_LIMITED);
    if (kind === 'weak_password') return formError('Ce mot de passe est trop faible. Choisissez-en un plus long.');
    if (kind === 'invalid_email') return formError('Adresse e-mail invalide.');
    if (kind) { console.error('[auth] signUp', error?.status, error?.code); return formError(TEMPORARY); }
  } catch { return formError(TEMPORARY); }
  // Message identique que l'adresse soit déjà inscrite ou non (pas d'énumération des comptes)
  return formOk('Presque terminé : ouvrez le lien de confirmation envoyé à votre adresse e-mail pour activer votre compte.');
}

/** Connexion par e-mail et mot de passe. */
export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const raw = formDataToObject(fd);
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    const kind = classifyAuthError(error);
    if (kind === 'invalid_credentials') return formError('Adresse e-mail ou mot de passe incorrect.');
    if (kind === 'email_not_confirmed') return formError('Votre adresse e-mail n’est pas encore confirmée. Ouvrez le lien reçu par e-mail.');
    if (kind === 'rate_limited') return formError(RATE_LIMITED);
    if (kind) { console.error('[auth] signIn', error?.status, error?.code); return formError(TEMPORARY); }
  } catch { return formError(TEMPORARY); }
  redirect(safeRedirectPath(raw.next));
}

/** Demande de réinitialisation : réponse identique que le compte existe ou non. */
export async function requestPasswordReset(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const parsed = resetRequestSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const redirectTo = await callbackUrl('/reinitialiser');
  if (!redirectTo) return formError('Configuration incomplète (URL du site). Contactez le support.');
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });
    if (classifyAuthError(error) === 'rate_limited') return formError(RATE_LIMITED);
    if (error) console.error('[auth] resetPasswordForEmail', error.status, error.code);
  } catch { return formError(TEMPORARY); }
  return formOk('Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être envoyé.');
}

/** Nouveau mot de passe, après ouverture du lien de réinitialisation (session de récupération). */
export async function updatePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return DEMO;
  const parsed = newPasswordSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return formError('Le lien de réinitialisation a expiré. Demandez-en un nouveau.');
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  const kind = classifyAuthError(error);
  if (kind === 'weak_password') return formError('Ce mot de passe est trop faible. Choisissez-en un plus long.');
  if (error) {
    if (error.code === 'same_password') return formError('Choisissez un mot de passe différent de l’ancien.');
    console.error('[auth] updateUser', error.status, error.code);
    return formError(TEMPORARY);
  }
  await supabase.auth.signOut();
  redirect('/connexion?message=password_updated');
}
