import 'server-only';
import type { SessionContext } from '../supabase/session.ts';
import { loadEidPlans, loadGoalChanges } from '../supabase/goals.ts';
import { GOAL_COLUMNS } from '../supabase/household.ts';
import { mapGoalRow, type GoalRow } from '../household-mapper.ts';
import { fail, ok, type GoalRepository, type RepoResult } from './repository.ts';

/**
 * Dépôt réel : Supabase / PostgreSQL avec la session de l'utilisateur (jamais de clé
 * service_role). La sécurité reste dans la base : RLS par foyer, article 9 pour les projets
 * religieux (owner_id, goal_writable), fonctions SQL atomiques, historique écrit par trigger.
 * Ce dépôt ne fait que reprendre les écritures existantes, sans en retirer aucun contrôle.
 */
const FAILED = 'Enregistrement impossible. Vérifiez les informations ou réessayez.';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = 'Projet introuvable ou non modifiable.';
const brusselsToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

function dbError(where: string, error: { code?: string; message?: string }): RepoResult<never> {
  console.error(`[goals] ${where}`, error.code);
  if (error.code === '23514' || error.code === '23503') return fail('Données refusées : elles ne correspondent pas à votre foyer ou sont incohérentes.');
  if (error.code === '23505') return fail('Cet élément existe déjà.');
  return fail(FAILED);
}

export function supabaseGoalRepository(ctx: SessionContext): GoalRepository {
  const db = ctx.supabase;
  const hid = ctx.householdId;
  /** Une modification qui ne touche aucune ligne (RLS, autre foyer, autre personne) est un refus. */
  const updated = (where: string, r: { error: { code?: string } | null; count: number | null }): RepoResult =>
    r.error ? dbError(where, r.error) : r.count === 1 ? ok(undefined) : fail(NOT_FOUND);

  return {
    mode: 'live',
    religiousEnabled: ctx.religiousEnabled,
    today: brusselsToday,

    async listGoals() {
      const { data, error } = await db.from('goals').select(GOAL_COLUMNS).eq('household_id', hid).order('created_at');
      if (error) throw error;
      return ((data ?? []) as GoalRow[]).map(mapGoalRow);
    },
    async getGoal(id) {
      if (!UUID.test(id)) return null;
      const { data, error } = await db.from('goals').select(GOAL_COLUMNS).eq('household_id', hid).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapGoalRow(data as GoalRow) : null;
    },
    history: (goalId) => (UUID.test(goalId) ? loadGoalChanges(ctx, goalId) : Promise.resolve([])),
    eidPlans: () => loadEidPlans(ctx),

    async create(input) {
      // Projet et épargne initiale dans UNE transaction (fonction SQL) : jamais de projet à moitié enregistré
      const { data, error } = await db.rpc('create_goal_with_allocation', {
        p_household_id: hid, p_kind: input.kind, p_name: input.name, p_target_cents: input.targetCents, p_target_date: input.targetDate,
        p_monthly_capacity_cents: input.monthlyCapacityCents, p_initial_cents: input.initialCents, p_allocated_on: brusselsToday(),
      });
      return error ? dbError('goal', error) : ok({ id: String(data) });
    },
    async update(id, p, opts) {
      if (!UUID.test(id)) return fail(NOT_FOUND);
      const r = await db.from('goals').update({
        name: p.name, target_cents: p.targetCents, target_date: p.targetDate, monthly_capacity_cents: p.monthlyCapacityCents, priority: p.priority,
        ...(opts?.confirmPlan ? { plan_confirmed_on: brusselsToday() } : {}),
      }, { count: 'exact' }).eq('id', id).eq('household_id', hid);
      return updated('goal update', r);
    },
    async chooseStrategy(id, monthlyCents) {
      if (!UUID.test(id)) return fail(NOT_FOUND);
      const r = await db.from('goals').update({
        monthly_capacity_cents: monthlyCents, strategy_monthly_cents: monthlyCents, strategy_chosen_on: brusselsToday(),
      }, { count: 'exact' }).eq('id', id).eq('household_id', hid).eq('status', 'active');
      return updated('goal strategy', r);
    },
    async addAllocation(goalId, amountCents) {
      if (!UUID.test(goalId)) return fail(NOT_FOUND);
      const { error } = await db.from('goal_allocations').insert({
        household_id: hid, goal_id: goalId, amount_cents: amountCents, allocated_on: brusselsToday(), source: 'manual',
      });
      return error ? dbError('allocation', error) : ok(undefined);
    },
    async savePlan(lines) {
      for (const l of lines) {
        if (!UUID.test(l.goalId)) return fail(NOT_FOUND);
        // RLS : un projet religieux d'une autre personne n'est ni visible ni modifiable
        const { error } = await db.from('goals').update({ monthly_capacity_cents: l.monthlyCents, priority: l.priority }).eq('id', l.goalId).eq('household_id', hid);
        if (error) return dbError('savings plan', error);
      }
      return ok(undefined);
    },
    async setLifecycle(id, action, realizedOn) {
      if (!UUID.test(id)) return fail(NOT_FOUND);
      const update = {
        achieve: { status: 'achieved', realized_on: realizedOn },
        reopen: { status: 'active', realized_on: null },
        pause: { status: 'paused', realized_on: null },
        resume: { status: 'active', realized_on: null },
        archive: { status: 'archived', realized_on: null },
      }[action];
      return updated('goal lifecycle', await db.from('goals').update(update, { count: 'exact' }).eq('id', id).eq('household_id', hid));
    },
    async setDeclaredCapacity(cents) {
      const { error } = await db.from('household_savings_settings').upsert({
        household_id: hid, declared_capacity_cents: cents, updated_at: new Date().toISOString(),
      }, { onConflict: 'household_id' });
      return error ? dbError('declared capacity', error) : ok(undefined);
    },

    async createEid(input) {
      if (input.previousGoalId && !UUID.test(input.previousGoalId)) return fail('Aïd précédent invalide.');
      const { data, error } = await db.rpc('create_eid_goal', {
        p_household_id: hid, p_name: input.name, p_civil_year: input.civilYear,
        p_sacrifice_cents: input.sacrificeCents, p_extra_costs_cents: input.extraCostsCents, p_organization_cents: input.organizationCents,
        p_family_contribution_cents: input.familyContributionCents, p_target_date: input.targetDate, p_date_status: input.dateStatus,
        p_date_source: input.dateSource, p_estimated_date: input.estimatedDate, p_monthly_capacity_cents: input.monthlyCapacityCents,
        p_initial_cents: input.initialCents, p_allocated_on: brusselsToday(), p_previous_goal_id: input.previousGoalId,
      });
      if (error) {
        console.error('[aid] create', error.code);
        return fail(error.code === '23505'
          ? `Un projet Aïd existe déjà pour ${input.civilYear}, ou cet Aïd a déjà été reconduit.`
          : input.previousGoalId ? 'Reconduction refusée : l’Aïd précédent doit être réalisé et de l’année civile précédente.' : 'Enregistrement impossible.');
      }
      return ok({ id: String(data) });
    },
    async updateEidDate(goalId, date, status, source) {
      if (!UUID.test(goalId)) return fail('Projet introuvable.');
      const { data: plan } = await db.from('eid_plans').select('civil_year').eq('goal_id', goalId).eq('owner_id', ctx.userId).maybeSingle();
      if (!plan) return fail('Projet introuvable.');
      if (!date.startsWith(`${plan.civil_year}-`)) return fail('Vérifiez les informations saisies.', { targetDate: 'La date doit tomber dans l’année civile du projet.' });
      const g = await db.from('goals').update({ target_date: date }).eq('id', goalId).eq('owner_id', ctx.userId);
      if (g.error) { console.error('[aid] date', g.error.code); return fail('Enregistrement impossible.'); }
      const p = await db.from('eid_plans').update({ date_status: status, date_source: source }).eq('goal_id', goalId).eq('owner_id', ctx.userId);
      if (p.error) { console.error('[aid] date status', p.error.code); return fail('Enregistrement impossible.'); }
      return ok(undefined);
    },
    async updateEidBudget(goalId, b) {
      if (!UUID.test(goalId)) return fail('Projet introuvable.');
      const { error, count } = await db.from('eid_plans').update({
        sacrifice_cents: b.sacrificeCents, extra_costs_cents: b.extraCostsCents, organization_cents: b.organizationCents, family_contribution_cents: b.familyContributionCents,
      }, { count: 'exact' }).eq('goal_id', goalId).eq('owner_id', ctx.userId);
      if (error) { console.error('[aid] budget', error.code); return fail('Enregistrement impossible.'); }
      return count === 1 ? ok(undefined) : fail('Projet introuvable.');
    },
  };
}
