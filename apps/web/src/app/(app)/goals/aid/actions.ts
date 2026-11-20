'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { estimateEidAlAdha } from '@amanah/engines';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { eidBudgetSchema, eidDateSchema, eidSchema, fieldErrorsOf, formDataToObject } from '@/lib/validation';

/** Aïd al-Adha : projet religieux (consentement article 9, imposé par la RLS). Aucun paiement. */
async function religiousContext(): Promise<SessionContext | FormState> {
  if (isDemoMode) return formError('Fonction désactivée en mode démonstration.');
  const ctx = await requireOnboardedSession();
  if (!ctx.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  if (!ctx.canWrite) return formError('Votre rôle dans ce foyer ne permet que la lecture.');
  return ctx;
}
const isState = (v: SessionContext | FormState): v is FormState => 'status' in v;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

/** Création, ou reconduction contrôlée (Aïd précédent réalisé, une seule fois : imposé par la base). */
export async function createEidGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = eidSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.targetDate <= today()) return formError('Vérifiez les informations saisies.', { targetDate: 'La date de l’Aïd doit être dans le futur.' });
  // Estimation conservée pour traçabilité ; la date retenue reste celle saisie par l'utilisateur
  const estimate = estimateEidAlAdha(d.civilYear)[0]?.date ?? null;
  const { data, error } = await ctx.supabase.rpc('create_eid_goal', {
    p_household_id: ctx.householdId, p_name: d.name ?? `Aïd al-Adha ${d.civilYear}`, p_civil_year: d.civilYear,
    p_sacrifice_cents: d.sacrifice, p_extra_costs_cents: d.extras, p_organization_cents: d.organization, p_family_contribution_cents: d.family,
    p_target_date: d.targetDate, p_date_status: d.dateStatus, p_date_source: d.dateSource, p_estimated_date: estimate,
    p_monthly_capacity_cents: d.monthlyCapacity, p_initial_cents: d.available, p_allocated_on: today(), p_previous_goal_id: d.previousGoalId,
  });
  if (error) {
    console.error('[aid] create', error.code);
    return formError(error.code === '23505'
      ? `Un projet Aïd existe déjà pour ${d.civilYear}, ou cet Aïd a déjà été reconduit.`
      : d.previousGoalId ? 'Reconduction refusée : l’Aïd précédent doit être réalisé et de l’année civile précédente.' : 'Enregistrement impossible.');
  }
  revalidatePath('/', 'layout');
  redirect(`/goals/${String(data)}`);
}

/** Date saisie ou confirmée (avec sa source) ; la base journalise chaque changement. */
export async function updateEidDate(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = eidDateSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { data: plan } = await ctx.supabase.from('eid_plans').select('civil_year').eq('goal_id', d.goalId).eq('owner_id', ctx.userId).maybeSingle();
  if (!plan) return formError('Projet introuvable.');
  if (!d.targetDate.startsWith(`${plan.civil_year}-`)) return formError('Vérifiez les informations saisies.', { targetDate: 'La date doit tomber dans l’année civile du projet.' });
  const g = await ctx.supabase.from('goals').update({ target_date: d.targetDate }).eq('id', d.goalId).eq('owner_id', ctx.userId);
  if (g.error) { console.error('[aid] date', g.error.code); return formError('Enregistrement impossible.'); }
  const p = await ctx.supabase.from('eid_plans').update({ date_status: d.dateStatus, date_source: d.dateSource }).eq('goal_id', d.goalId).eq('owner_id', ctx.userId);
  if (p.error) { console.error('[aid] date status', p.error.code); return formError('Enregistrement impossible.'); }
  revalidatePath('/', 'layout');
  return formOk(d.dateStatus === 'confirmed' ? 'Date enregistrée comme confirmée par vous, avec sa source.' : 'Date enregistrée (non confirmée).');
}

export async function updateEidBudget(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await religiousContext(); if (isState(ctx)) return ctx;
  const parsed = eidBudgetSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { error, count } = await ctx.supabase.from('eid_plans').update({
    sacrifice_cents: d.sacrifice, extra_costs_cents: d.extras, organization_cents: d.organization, family_contribution_cents: d.family,
  }, { count: 'exact' }).eq('goal_id', d.goalId).eq('owner_id', ctx.userId);
  if (error) { console.error('[aid] budget', error.code); return formError('Enregistrement impossible.'); }
  if (count !== 1) return formError('Projet introuvable.');
  revalidatePath('/', 'layout');
  return formOk('Budget mis à jour : le montant à mettre de côté est recalculé, les affectations sont conservées.');
}
