'use server';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import {
  accountSchema, allocationSchema, budgetSchema, categorySchema, customCategorySlug, fieldErrorsOf,
  formDataToObject, hajjGoalSchema, idSchema, transactionSchema,
} from '@/lib/validation';

/**
 * Écritures financières. Règles communes :
 *  - jamais en démonstration ;
 *  - session et parcours d'accueil exigés ;
 *  - le foyer vient de la session, jamais du formulaire ;
 *  - la RLS et les clés composites de la base refusent toute référence à un autre foyer.
 */
async function writableContext(): Promise<SessionContext | FormState> {
  if (isDemoMode) return formError('Saisie désactivée en mode démonstration.');
  const ctx = await requireOnboardedSession();
  if (!ctx.canWrite) return formError('Votre rôle dans ce foyer ne permet que la lecture.');
  return ctx;
}
const isState = (v: SessionContext | FormState): v is FormState => 'status' in v;
const FAILED = 'Enregistrement impossible. Vérifiez les informations ou réessayez.';
const done = (message: string) => { revalidatePath('/', 'layout'); return formOk(message); };
function dbError(where: string, error: { code?: string; message?: string }): FormState {
  console.error(`[finance] ${where}`, error.code);
  if (error.code === '23514' || error.code === '23503') return formError('Données refusées : elles ne correspondent pas à votre foyer ou sont incohérentes.');
  if (error.code === '23505') return formError('Cet élément existe déjà.');
  return formError(FAILED);
}

export async function createAccount(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = accountSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const { error } = await ctx.supabase.from('accounts').insert({
    household_id: ctx.householdId, name: parsed.data.name, type: parsed.data.type,
    opening_balance_cents: parsed.data.openingBalance, is_interest_bearing: parsed.data.type === 'regulated_savings',
  });
  return error ? dbError('account', error) : done('Compte ajouté.');
}

export async function createTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = transactionSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { error } = await ctx.supabase.from('transactions').insert({
    household_id: ctx.householdId, account_id: d.accountId, booked_on: d.bookedOn, amount_cents: d.amountCents,
    description: d.description, category_slug: d.categorySlug, category_source: 'user', source: 'manual',
    is_interest: d.categorySlug === 'interets', dedupe_hash: `manual:${crypto.randomUUID()}`,
  });
  return error ? dbError('transaction', error) : done(d.direction === 'income' ? 'Revenu enregistré.' : 'Dépense enregistrée.');
}

export async function deleteTransaction(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = idSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Élément invalide.');
  const { error, count } = await ctx.supabase.from('transactions').delete({ count: 'exact' })
    .eq('id', parsed.data.id).eq('household_id', ctx.householdId);
  if (error) return dbError('transaction delete', error);
  return count === 1 ? done('Opération supprimée.') : formError('Opération introuvable.');
}

export async function createCategory(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = categorySchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const { error } = await ctx.supabase.from('categories').insert({
    household_id: ctx.householdId, slug: customCategorySlug(parsed.data.label), label: parsed.data.label, kind: parsed.data.kind,
  });
  return error ? dbError('category', error) : done('Catégorie ajoutée.');
}

export async function saveBudget(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = budgetSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const { error } = await ctx.supabase.from('budgets').upsert({
    household_id: ctx.householdId, month: `${parsed.data.month}-01`, category_slug: parsed.data.categorySlug, limit_cents: parsed.data.limit,
  }, { onConflict: 'household_id,month,category_slug' });
  return error ? dbError('budget', error) : done('Budget enregistré.');
}

export async function createHajjGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  if (!ctx.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  const parsed = hajjGoalSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  if (d.targetDate <= today) return formError('Vérifiez les informations saisies.', { targetDate: 'La date souhaitée doit être dans le futur.' });
  if (d.available > d.target) return formError('Vérifiez les informations saisies.', { available: 'L’épargne disponible dépasse le montant cible.' });
  // Objectif et épargne initiale dans UNE transaction (fonction SQL) : jamais d'objectif à moitié enregistré
  const { error } = await ctx.supabase.rpc('create_goal_with_allocation', {
    p_household_id: ctx.householdId, p_kind: 'hajj', p_name: d.name, p_target_cents: d.target, p_target_date: d.targetDate,
    p_monthly_capacity_cents: d.monthlyCapacity, p_initial_cents: d.available, p_allocated_on: today,
  });
  return error ? dbError('goal', error) : done('Objectif Hajj créé.');
}

export async function allocateToGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = allocationSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  const amount = parsed.data.direction === 'remove' ? -parsed.data.amount : parsed.data.amount;
  const { error } = await ctx.supabase.from('goal_allocations').insert({
    household_id: ctx.householdId, goal_id: parsed.data.goalId, amount_cents: amount, allocated_on: today,
  });
  return error ? dbError('allocation', error) : done(amount > 0 ? 'Montant affecté à l’objectif.' : 'Montant retiré de l’objectif.');
}
