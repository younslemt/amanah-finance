import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { DataSync } from '@/components/pwa/data-sync';
import { loadShell } from '@/lib/shell-data';

/**
 * Toutes les pages de l'application : en mode réel, session ET parcours d'accueil
 * (consentements en vigueur, profil complété) sont exigés côté serveur (`loadShell`).
 * Navigation, actions rapides et menu profil sont résolus ici, côté serveur.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const shell = await loadShell();
  return <AppShell shell={shell}>{children}<DataSync /></AppShell>;
}
