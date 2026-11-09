import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { isDemoMode } from './env.ts';
import { getDemoHousehold } from './demo.ts';
import { buildSnapshot, type HouseholdSnapshot, type HouseholdData } from './snapshot.ts';
import { loadHouseholdData, NotAuthenticatedError } from './supabase/household.ts';

/** Date du jour à Bruxelles (les moteurs reçoivent la date, ils ne lisent pas l'horloge). */
export function todayInBrussels(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
}

/**
 * Point d'entrée unique des écrans.
 * - démo : données fictives, jamais de Supabase.
 * - live : données de l'utilisateur connecté, jamais de données fictives.
 */
export const getHouseholdData = cache(async (): Promise<HouseholdData> => {
  if (isDemoMode) return getDemoHousehold();
  try {
    return await loadHouseholdData(todayInBrussels());
  } catch (e) {
    if (e instanceof NotAuthenticatedError) redirect('/connexion');
    throw e;
  }
});

/** Mis en cache le temps d'une requête : plusieurs composants d'une page partagent le même calcul. */
export const getSnapshot = cache(async (): Promise<HouseholdSnapshot> => buildSnapshot(await getHouseholdData()));
