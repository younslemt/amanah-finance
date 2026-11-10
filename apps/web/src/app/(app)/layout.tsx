import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';

/**
 * Toutes les pages de l'application : en mode réel, session ET parcours d'accueil
 * (consentements en vigueur, profil complété) sont exigés côté serveur.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const displayName = isDemoMode ? null : (await requireOnboardedSession()).displayName;
  return <AppShell demo={isDemoMode} displayName={displayName}>{children}</AppShell>;
}
