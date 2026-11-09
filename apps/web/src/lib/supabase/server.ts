import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isDemoMode } from '../env.ts';

/**
 * Client Supabase côté serveur : la session vient des cookies HttpOnly, la RLS s'applique.
 * Interdit en mode démo : aucune donnée réelle ne peut être lue ou écrite depuis la démo.
 */
export async function createSupabaseServerClient() {
  if (isDemoMode) throw new Error('Client Supabase indisponible en mode démo');
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appel depuis un Server Component : le middleware rafraîchit la session.
        }
      },
    },
  });
}
