import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from './server.ts';
import { missingConsents, type ConsentRecord } from '../legal/documents.ts';
import { nextOnboardingStep } from '../onboarding.ts';
import { isDemoMode } from '../env.ts';

/**
 * Contexte de l'utilisateur connecté, résolu côté serveur à chaque requête.
 * Le foyer est TOUJOURS déduit de la session, jamais d'un champ envoyé par le navigateur.
 */
export interface SessionContext {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string;
  email: string | null;
  householdId: string;
  canWrite: boolean;
  isOwner: boolean;
  displayName: string | null;
  profileCompleted: boolean;
  consents: ConsentRecord[];
}

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  if (isDemoMode) return null; // aucune session ni aucun appel Supabase en démonstration
  const supabase = await createSupabaseServerClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) return null;

  const [membership, profile, consents] = await Promise.all([
    supabase.from('household_members').select('household_id, role').eq('user_id', auth.user.id)
      .order('joined_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('profiles').select('display_name, profile_completed_at').eq('id', auth.user.id).maybeSingle(),
    supabase.from('consents').select('kind, granted, document_version, recorded_at').eq('user_id', auth.user.id),
  ]);
  if (membership.error) throw membership.error;
  if (!membership.data) throw new Error('Aucun foyer associé au compte');

  return {
    supabase,
    userId: auth.user.id,
    email: auth.user.email ?? null,
    householdId: membership.data.household_id as string,
    canWrite: membership.data.role === 'owner' || membership.data.role === 'member',
    isOwner: membership.data.role === 'owner',
    displayName: (profile.data?.display_name as string | null) ?? null,
    profileCompleted: Boolean(profile.data?.profile_completed_at),
    consents: (consents.data ?? []) as ConsentRecord[],
  };
});

/** Exige une session ; sinon redirige vers la connexion. */
export async function requireSession(): Promise<SessionContext> {
  if (isDemoMode) redirect('/dashboard'); // les écrans de compte n'existent pas en démonstration
  const ctx = await getSessionContext();
  if (!ctx) redirect('/connexion');
  return ctx;
}

/** Exige une session ET un parcours d'accueil terminé (consentements, profil). */
export async function requireOnboardedSession(): Promise<SessionContext> {
  const ctx = await requireSession();
  const step = nextOnboardingStep({ missingConsents: missingConsents(ctx.consents), profileCompleted: ctx.profileCompleted });
  if (step) redirect(step);
  return ctx;
}
