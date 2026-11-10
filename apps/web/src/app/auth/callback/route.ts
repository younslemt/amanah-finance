import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/redirect';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'recovery', 'email', 'email_change', 'invite', 'magiclink'];

/**
 * Retour des liens envoyés par e-mail (confirmation d'inscription, réinitialisation).
 * Deux formats acceptés : `code` (flux PKCE par défaut) ou `token_hash` + `type`.
 * La session est posée en cookies HttpOnly ; la destination est filtrée par liste blanche.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fail = (code: string) => NextResponse.redirect(new URL(`/connexion?erreur=${code}`, request.url));

  // Supabase renvoie error_code=otp_expired lorsqu'un lien a expiré ou a déjà servi
  const providerError = params.get('error_code') ?? params.get('error');
  if (providerError) return fail(providerError === 'otp_expired' ? 'link_expired' : 'link_invalid');

  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  if (!code && !(tokenHash && type && OTP_TYPES.includes(type))) return fail('link_invalid');

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: type! });
    if (error) return fail(error.code === 'otp_expired' || error.code === 'flow_state_expired' ? 'link_expired' : 'session_failed');
  } catch {
    return fail('session_failed');
  }
  const next = type === 'recovery' ? '/reinitialiser' : safeRedirectPath(params.get('next'));
  return NextResponse.redirect(new URL(next, request.url));
}
