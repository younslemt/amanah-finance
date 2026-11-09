'use server';
import { z } from 'zod';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SITE_URL, isDemoMode } from '@/lib/env';
import { buildAuthCallbackUrl, classifyAuthError } from '@/lib/redirect';

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(254), next: z.string().max(200).optional() });

export type SignInState = {
  status: 'idle' | 'sent' | 'error';
  error?: 'invalid_email' | 'rate_limited' | 'temporary' | 'demo' | 'config';
};

/**
 * Connexion par lien magique.
 * - Réponse identique que le compte existe ou non (pas d'énumération).
 * - Les erreurs techniques sont journalisées côté serveur, jamais affichées en détail.
 */
export async function signInWithEmail(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (isDemoMode) return { status: 'error', error: 'demo' };
  const parsed = schema.safeParse({ email: formData.get('email'), next: formData.get('next') ?? undefined });
  if (!parsed.success) return { status: 'error', error: 'invalid_email' };

  const redirectTo = buildAuthCallbackUrl(SITE_URL, (await headers()).get('origin'), parsed.data.next);
  if (!redirectTo) return { status: 'error', error: 'config' };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
    });
    const kind = classifyAuthError(error);
    if (kind === 'rate_limited' || kind === 'invalid_email') return { status: 'error', error: kind };
    if (kind === 'temporary') {
      console.error('[auth] signInWithOtp', error?.status, error?.code);
      return { status: 'error', error: 'temporary' };
    }
  } catch (e) {
    console.error('[auth] signInWithOtp exception', e instanceof Error ? e.name : 'unknown');
    return { status: 'error', error: 'temporary' };
  }
  return { status: 'sent' };
}
