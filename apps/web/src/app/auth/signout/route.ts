import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Déconnexion en POST uniquement (pas de déconnexion par simple lien). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Même en cas d'erreur réseau, les cookies locaux sont supprimés par le client Supabase.
  }
  return NextResponse.redirect(new URL('/connexion', request.url), { status: 303 });
}
