import 'server-only';
import { cache } from 'react';
import { isDemoMode } from './env.ts';
import { requireOnboardedSession } from './supabase/session.ts';
import { readDemoState } from './goals/demo-repository.ts';
import { demoAsOf } from './goals/demo-state.ts';
import { availableQuickActions, type QuickAction } from './quick-actions.ts';
import { avatarInitial, mainNavigation, profileMenu, type NavItem, type ProfileMenu } from './navigation.ts';

export interface ShellModel {
  demo: boolean;
  demoDate: string | null;
  displayName: string | null;
  initial: string | null;
  nav: NavItem[];
  quickActions: QuickAction[];
  profile: ProfileMenu;
}

/**
 * Coque de l'application (lot 3) : navigation, actions rapides et menu profil, résolus CÔTÉ
 * SERVEUR à partir de la session. Aucune donnée personnelle religieuse n'y figure : seulement
 * le libellé de l'entrée (selon le consentement) et la disponibilité des actions.
 *
 * Mode réel : deux comptages légers, soumis à la RLS (les projets religieux ne sont pas
 * visibles sans consentement, donc ne rendent pas « Mettre de côté » disponible).
 */
export const loadShell = cache(async (): Promise<ShellModel> => {
  if (isDemoMode) {
    const { state } = await readDemoState();
    return {
      demo: true, demoDate: demoAsOf(state), displayName: null, initial: null,
      nav: mainNavigation({ religiousEnabled: true }),
      quickActions: availableQuickActions({
        mode: 'demo', canWrite: true, religiousEnabled: true, hasAccount: true,
        hasActiveGoal: state.goals.some((g) => g.status === 'active'),
      }),
      profile: profileMenu({ mode: 'demo', canWrite: true }),
    };
  }

  const ctx = await requireOnboardedSession();
  const [accounts, goals] = await Promise.all([
    ctx.supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('household_id', ctx.householdId).eq('archived', false),
    ctx.supabase.from('goals').select('id', { count: 'exact', head: true }).eq('household_id', ctx.householdId).eq('status', 'active'),
  ]);
  if (accounts.error) throw accounts.error;
  if (goals.error) throw goals.error;
  return {
    demo: false, demoDate: null, displayName: ctx.displayName, initial: avatarInitial(ctx.displayName),
    nav: mainNavigation({ religiousEnabled: ctx.religiousEnabled }),
    quickActions: availableQuickActions({
      mode: 'real', canWrite: ctx.canWrite, religiousEnabled: ctx.religiousEnabled,
      hasAccount: (accounts.count ?? 0) > 0, hasActiveGoal: (goals.count ?? 0) > 0,
    }),
    profile: profileMenu({ mode: 'real', canWrite: ctx.canWrite }),
  };
});
