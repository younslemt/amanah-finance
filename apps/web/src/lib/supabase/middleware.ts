import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '../env.ts';

const PUBLIC_PATHS = ['/connexion', '/auth/callback', '/auth/signout'];

/** Rafraîchit la session et protège les écrans de l'application (mode live uniquement). */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDemoMode) {
    // La démo n'a pas d'authentification : les routes d'auth renvoient vers l'accueil.
    if (pathname.startsWith('/auth/')) return NextResponse.redirect(new URL('/dashboard', request.url));
    return NextResponse.next({ request });
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
  if (userId && pathname === '/connexion') return NextResponse.redirect(new URL('/dashboard', request.url));
  return response;
}
