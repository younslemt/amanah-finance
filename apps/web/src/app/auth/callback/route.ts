import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/redirect';

/** Échange le code du lien magique contre une session (cookies HttpOnly). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const fail = (code: string) => NextResponse.redirect(new URL(`/connexion?erreur=${code}`, request.url));

  // Supabase renvoie error_code=otp_expired lorsqu'un lien a expiré ou a déjà servi
  const providerError = params.get('error_code') ?? params.get('error');
  if (providerError) return fail(providerError === 'otp_expired' ? 'link_expired' : 'link_invalid');

  const code = params.get('code');
  if (!code) return fail('link_invalid');

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.code === 'otp_expired' || error.code === 'flow_state_expired' ? 'link_expired' : 'session_failed');
  } catch {
    return fail('session_failed');
  }
  return NextResponse.redirect(new URL(safeRedirectPath(params.get('next')), request.url));
}
