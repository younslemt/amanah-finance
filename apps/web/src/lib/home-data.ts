import 'server-only';
import { cache } from 'react';
import { isDemoMode } from './env.ts';
import { religiousAccess } from './supabase/session.ts';
import { loadDonations } from './supabase/contributions.ts';
import { readDemoState } from './goals/demo-repository.ts';
import { loadPlanning } from './planning-data.ts';
import { DEMO_CALCS, DEMO_CONTRIBUTIONS, DEMO_USER } from './demo-donations.ts';
import { addDays } from '@amanah/engines';
import { buildHomeView, type HomeView, type ZakatRecords } from './home-view.ts';

/**
 * Accueil : charge les sources existantes puis construit le modèle de vue côté serveur.
 * Les calculs et contributions de Zakat ne sont chargés QU'AVEC le consentement religieux ;
 * la RLS de la base l'impose aussi (données article 9).
 */
export const loadHomeView = cache(async (): Promise<{ view: HomeView; displayName: string | null; canWrite: boolean }> => {
  const { enabled: religious, ctx } = await religiousAccess();
  const { s, data, calendar, suggestions } = await loadPlanning();

  let layoutPreference: unknown = null;
  let zakatRecords: ZakatRecords | null = null;
  if (isDemoMode) {
    layoutPreference = (await readDemoState()).state.planning.homeLayout;
    if (religious) zakatRecords = { userId: DEMO_USER, calculations: DEMO_CALCS, contributions: DEMO_CONTRIBUTIONS };
  } else if (ctx) {
    layoutPreference = ctx.homeLayout;
    if (religious) {
      const d = await loadDonations(ctx, addDays(s.asOf, -3 * 366));
      zakatRecords = { userId: ctx.userId, calculations: d.calculations, contributions: d.contributions };
    }
  }

  const view = buildHomeView({ religiousEnabled: religious, layoutPreference, snapshot: s, data, calendar, suggestions, zakatRecords });
  return { view, displayName: isDemoMode ? null : ctx?.displayName ?? null, canWrite: isDemoMode ? true : Boolean(ctx?.canWrite) };
});
