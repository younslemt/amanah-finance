import 'server-only';
import type { SessionContext } from './session.ts';

export interface GoalChangeRow { id: string; changed_at: string; changes: Record<string, { from: unknown; to: unknown }> }

/** Historique des modifications d'un projet (lisible comme le projet lui-même : RLS). */
export async function loadGoalChanges(ctx: SessionContext, goalId: string): Promise<GoalChangeRow[]> {
  const { data, error } = await ctx.supabase.from('goal_changes').select('id, changed_at, changes')
    .eq('household_id', ctx.householdId).eq('goal_id', goalId).order('changed_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as GoalChangeRow[];
}

/** Plans Aïd de la personne connectée (article 9 : vides sans consentement). */
export async function loadEidPlans(ctx: SessionContext): Promise<import('../eid-view.ts').EidPlanRow[]> {
  const { data, error } = await ctx.supabase.from('eid_plans')
    .select('goal_id, owner_id, civil_year, sacrifice_cents, extra_costs_cents, organization_cents, family_contribution_cents, date_status, date_source, estimated_date, previous_goal_id')
    .eq('household_id', ctx.householdId).order('civil_year', { ascending: false });
  if (error) throw error;
  return (data ?? []) as import('../eid-view.ts').EidPlanRow[];
}
