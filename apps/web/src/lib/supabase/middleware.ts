import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '../env.ts';
import { ACCESS_COOKIE, accessTokenValid, demoAccessAllowed, demoAccessConfig, demoAccessRequired, type DemoAccessConfig } from '../demo-access.ts';

const PUBLIC_PATHS = ['/connexion', '/inscription', '/mot-de-passe-oublie', '/auth/callback', '/auth/signout', '/hors-ligne'];
const GUEST_ONLY = ['/connexion', '/inscription', '/mot-de-passe-oublie'];

/** Rafraîchit la session et protège les écrans de l'application (mode live uniquement). */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isDemoMode) {
    // Démonstration privée : accès contrôlé PAR LE SERVEUR. Sur un hébergement (build Netlify ou
    // DEMO_ACCESS_REQUIRED=true), l'absence de mot de passe valide ferme tout : jamais d'accès ouvert.
    const noStore = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
    let cfg: DemoAccessConfig | null = null;
    try { cfg = demoAccessConfig(process.env); } catch { cfg = null; }
    const required = demoAccessRequired(process.env, process.env.AMANAH_HOSTED_BUILD === 'true');
    if (!cfg && (required || process.env.DEMO_ACCESS_PASSWORD)) {
      return new NextResponse('Démonstration indisponible : protection d’accès non configurée.', { status: 503, headers: noStore });
    }
    if (cfg && !pathname.startsWith('/acces')) {
      const ok = demoAccessAllowed(request.headers.get('authorization'), cfg)
        || await accessTokenValid(request.cookies.get(ACCESS_COOKIE)?.value, cfg, Math.floor(Date.now() / 1000));
      if (!ok) {
        // Navigation d'un navigateur : page de saisie du mot de passe ; autre requête : 401, sans contenu
        if (request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')) {
          const url = request.nextUrl.clone();
          url.pathname = '/acces';
          url.search = '';
          url.searchParams.set('suite', `${pathname}${request.nextUrl.search}`);
          return NextResponse.redirect(url, { headers: noStore });
        }
        return new NextResponse('Accès réservé : démonstration privée.', { status: 401, headers: noStore });
      }
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
