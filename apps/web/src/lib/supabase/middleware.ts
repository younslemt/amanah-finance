import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '../env.ts';
import { demoAccessAllowed, demoAccessConfig } from '../demo-access.ts';

const PUBLIC_PATHS = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/auth/callback', '/auth/signout', '/hors-ligne'];
const GUEST_ONLY = ['/connexion', '/inscription', '/mot-de-passe-oublie'];

/** Rafraîchit la session et protège les écrans de l'application (mode live uniquement). */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDemoMode) {
    // Démonstration privée : accès protégé par le serveur dès que DEMO_ACCESS_PASSWORD est défini
    if (!demoAccessAllowed(request.headers.get('authorization'), demoAccessConfig(process.env))) {
      return new NextResponse('Accès réservé : démonstration privée.', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Amanah Finance - demonstration privee", charset="UTF-8"', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
      });
    }
    // La démo n'a pas de comptes utilisateurs : les routes d'auth renvoient vers l'accueil.
    if (pathname.startsWith('/auth/')) return NextResponse.redirect(new URL('/dashboard', request.url));
    const res = NextResponse.next({ request });
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() valide le jeton auprès de Supabase (ne pas se fier à getSession côté serveur).
  // Une panne réseau ne doit pas ouvrir l'accès : en cas d'erreur, l'utilisateur est traité comme non connecté.
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    userId = error ? null : data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (!userId && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    url.search = '';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (userId && GUEST_ONLY.includes(pathname)) return NextResponse.redirect(new URL('/dashboard', request.url));
  return response;
}
