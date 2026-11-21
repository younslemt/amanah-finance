import 'server-only';
import { isDemoMode } from '../env.ts';
import { requireOnboardedSession } from '../supabase/session.ts';
import { demoGoalRepository, readDemoState } from './demo-repository.ts';
import { demoAsOf } from './demo-state.ts';
import { supabaseGoalRepository } from './supabase-repository.ts';
import type { GoalRepository } from './repository.ts';

/**
 * Seul point de choix du stockage. Démonstration : jamais de Supabase ; mode réel : jamais
 * de données de démonstration (le cookie de démonstration y est ignoré).
 */
export async function readGoalRepository(): Promise<GoalRepository> {
  return isDemoMode ? demoGoalRepository(demoAsOf((await readDemoState()).state)) : supabaseGoalRepository(await requireOnboardedSession());
}

/** Écriture : en mode réel, le rôle doit permettre l'écriture (le foyer vient de la session). */
export async function writeGoalRepository(): Promise<GoalRepository | { error: string }> {
  if (isDemoMode) return demoGoalRepository(demoAsOf((await readDemoState()).state));
  const ctx = await requireOnboardedSession();
  if (!ctx.canWrite) return { error: 'Votre rôle dans ce foyer ne permet que la lecture.' };
  return supabaseGoalRepository(ctx);
}

export type { GoalRepository } from './repository.ts';
