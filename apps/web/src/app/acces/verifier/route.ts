import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, ACCESS_MAX_AGE_S, demoAccessConfig, demoPasswordMatches, safeNextPath, signAccessToken } from '@/lib/demo-access';
import { isDemoMode } from '@/lib/env';

/**
 * Vérification du mot de passe de la démonstration privée (POST du formulaire /acces).
 * Rien n'est journalisé ; un échec est ralenti pour freiner les essais en série.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNextPath(String(form.get('suite') ?? ''));
  const back = (q: string) => NextResponse.redirect(new URL(`/acces?${q}&suite=${encodeURIComponent(next)}`, request.url), 303);
  let cfg = null;
  try { cfg = demoAccessConfig(process.env); } catch { cfg = null; }
  if (!isDemoMode || !cfg) return back('erreur=configuration');
  if (!demoPasswordMatches(String(form.get('motdepasse') ?? ''), cfg)) {
    await new Promise((r) => setTimeout(r, 800));
    return back('erreur=motdepasse');
  }
  const res = NextResponse.redirect(new URL(next, request.url), 303);
  const https = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  res.cookies.set(ACCESS_COOKIE, await signAccessToken(cfg, Math.floor(Date.now() / 1000)), {
    httpOnly: true, secure: https, sameSite: 'lax', path: '/', maxAge: ACCESS_MAX_AGE_S,
  });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
