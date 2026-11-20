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
