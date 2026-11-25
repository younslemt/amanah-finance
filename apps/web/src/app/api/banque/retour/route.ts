import { NextResponse, type NextRequest } from 'next/server';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { STATE_COOKIE, completeConnection } from '@/lib/banking/bank-sync';

/**
 * Retour de la banque (Enable Banking redirige ici avec `code` et `state`, ou `error`).
 * Contrôles côté serveur : session de l'application, jeton anti-CSRF (cookie + empreinte en base,
 * usage unique), droit d'accès au connecteur. Rien de reçu n'est journalisé.
 */
export async function GET(request: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/comptes/banque?${q}`, request.url), 303);
    res.cookies.set(STATE_COOKIE, '', { path: '/api/banque', maxAge: 0 });
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer');
    return res;
  };
  if (isDemoMode) return back('resultat=indisponible');
  const ctx = await requireOnboardedSession();
  const p = request.nextUrl.searchParams;
  const r = await completeConnection(ctx, {
    code: p.get('code') ?? undefined, state: p.get('state') ?? undefined, error: p.get('error') ?? undefined,
  }, request.cookies.get(STATE_COOKIE)?.value);
  return r.ok ? back(`resultat=connecte&importees=${r.imported}`) : back(`resultat=echec&motif=${r.code}`);
}
