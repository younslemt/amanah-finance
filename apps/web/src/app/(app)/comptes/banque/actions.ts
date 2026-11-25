'use server';
import { cookies, headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { STATE_COOKIE, STATE_MAX_AGE_S, canUseBanking, deleteConnectionData, revokeConnection, startConnection, syncConnection } from '@/lib/banking/bank-sync';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function allowed() {
  if (isDemoMode) return formError('Aucune connexion bancaire en démonstration.');
  const ctx = await requireOnboardedSession();
  if (!canUseBanking(ctx)) return formError('La connexion bancaire n’est pas ouverte pour votre compte.');
  return ctx;
}

/** Redirection vers la banque choisie (accès en lecture seule, révocable). */
export async function connectBank(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await allowed(); if ('status' in ctx) return ctx;
  const institutionId = String(fd.get('institutionId') ?? '');
  if (!/^(BE|FR|LU|NL):.{1,120}$/.test(institutionId)) return formError('Choisissez votre banque.', { institutionId: 'Choisissez votre banque.' });
  if (fd.get('accord') !== 'yes') return formError('Confirmez votre accord.', { accord: 'Votre accord explicite est nécessaire.' });
  let target: string;
  try {
    const r = await startConnection(ctx, institutionId);
    const https = (await headers()).get('x-forwarded-proto') === 'https';
    (await cookies()).set(STATE_COOKIE, r.cookie, { httpOnly: true, secure: https, sameSite: 'lax', path: '/api/banque', maxAge: STATE_MAX_AGE_S });
    target = r.redirectUrl;
  } catch {
    return formError('La banque n’a pas pu être contactée : réessayez dans quelques minutes.');
  }
  // Navigation effectuée par le navigateur (voir FormState.redirectTo)
  return { status: 'ok', message: 'Redirection vers votre banque…', redirectTo: target };
}

export async function syncBank(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await allowed(); if ('status' in ctx) return ctx;
  const id = String(fd.get('connectionId') ?? '');
  if (!uuid.test(id)) return formError('Connexion inconnue.');
  const r = await syncConnection(ctx, id);
  revalidatePath('/', 'layout');
  return r.ok ? formOk(`Synchronisation terminée : ${r.imported} nouvelle(s) opération(s), ${r.duplicates} déjà connue(s).`) : formError(r.message);
}

export async function revokeBank(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await allowed(); if ('status' in ctx) return ctx;
  const id = String(fd.get('connectionId') ?? '');
  if (!uuid.test(id)) return formError('Connexion inconnue.');
  const r = await revokeConnection(ctx, id);
  revalidatePath('/', 'layout');
  return r.ok ? formOk(r.message) : formError(r.message);
}

export async function deleteBankData(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await allowed(); if ('status' in ctx) return ctx;
  const id = String(fd.get('connectionId') ?? '');
  if (!uuid.test(id)) return formError('Connexion inconnue.');
  if (fd.get('confirmation') !== 'SUPPRIMER') return formError('Tapez SUPPRIMER pour confirmer.', { confirmation: 'Tapez SUPPRIMER pour confirmer.' });
  const r = await deleteConnectionData(ctx, id);
  revalidatePath('/', 'layout');
  return r.ok ? formOk(r.message) : formError(r.message);
}
