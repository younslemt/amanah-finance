import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { DataSync } from '@/components/pwa/data-sync';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { readDemoState } from '@/lib/goals/demo-repository';
import { demoAsOf } from '@/lib/goals/demo-state';

/**
 * Toutes les pages de l'application : en mode réel, session ET parcours d'accueil
 * (consentements en vigueur, profil complété) sont exigés côté serveur.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const displayName = isDemoMode ? null : (await requireOnboardedSession()).displayName;
  // Démonstration : date de référence (simulée ou de départ), affichée dans le bandeau
  const demoDate = isDemoMode ? demoAsOf((await readDemoState()).state) : null;
  return <AppShell demo={isDemoMode} demoDate={demoDate} displayName={displayName}>{children}<DataSync /></AppShell>;
}
