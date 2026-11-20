'use server';
import { revalidatePath } from 'next/cache';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { isReligiousGoal } from '@amanah/engines';
import {
  accountSchema, allocationSchema, budgetSchema, categorySchema, customCategorySlug, fieldErrorsOf,
  formDataToObject, goalLifecycleSchema, goalSchema, goalUpdateSchema, idSchema, transactionSchema,
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

const KIND_LABEL: Record<string, string> = {
  hajj: 'Hajj', omra: 'Omra', children_education: 'Études des enfants', real_estate: 'Achat immobilier', retirement: 'Retraite',
  family_savings: 'Épargne familiale', emergency_fund: 'Réserve d’urgence', personal: 'Projet personnel',
};
const brusselsToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

/**
 * Création d'un projet, de toute catégorie. Projets généraux : communs au foyer, sans
 * consentement religieux. Hajj et Omra : consentement article 9 (vérifié ici, imposé par la RLS).
 */
export async function createGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = goalSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (isReligiousGoal(d.kind) && !ctx.religiousEnabled) return formError('Les projets Hajj et Omra demandent d’activer les fonctions de finance islamique (consentement explicite).');
  const today = brusselsToday();
  if (d.targetDate <= today) return formError('Vérifiez les informations saisies.', { targetDate: 'La date souhaitée doit être dans le futur.' });
  // Projet et épargne initiale dans UNE transaction (fonction SQL) : jamais de projet à moitié enregistré
  const { error } = await ctx.supabase.rpc('create_goal_with_allocation', {
    p_household_id: ctx.householdId, p_kind: d.kind, p_name: d.name ?? KIND_LABEL[d.kind], p_target_cents: d.target, p_target_date: d.targetDate,
    p_monthly_capacity_cents: d.monthlyCapacity, p_initial_cents: d.available, p_allocated_on: today,
  });
  return error ? dbError('goal', error) : done(`Objectif ${KIND_LABEL[d.kind]} créé : « ${d.name ?? KIND_LABEL[d.kind]} ».`);
}

/** Modification d'un projet : la catégorie et les affectations ne changent pas ; la base journalise l'avant / après. */
export async function updateGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = goalUpdateSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { error, count } = await ctx.supabase.from('goals').update({
    name: d.name, target_cents: d.target, target_date: d.targetDate, monthly_capacity_cents: d.monthlyCapacity, priority: d.priority,
  }, { count: 'exact' }).eq('id', d.id).eq('household_id', ctx.householdId);
  if (error) return dbError('goal update', error);
  if (count !== 1) return formError('Projet introuvable ou non modifiable.');
  return done('Projet mis à jour. L’historique des affectations est conservé.');
}

/** Réaliser, rouvrir, mettre en pause, reprendre ou archiver : rien n'est effacé. */
export async function setGoalLifecycle(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const parsed = goalLifecycleSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.realizedOn && d.realizedOn > brusselsToday()) return formError('Vérifiez les informations saisies.', { realizedOn: 'La date de réalisation ne peut pas être dans le futur.' });
  const update = {
    achieve: { status: 'achieved', realized_on: d.realizedOn },
    reopen: { status: 'active', realized_on: null },
    pause: { status: 'paused', realized_on: null },
    resume: { status: 'active', realized_on: null },
    archive: { status: 'archived', realized_on: null },
  }[d.action];
  const { error, count } = await ctx.supabase.from('goals').update(update, { count: 'exact' }).eq('id', d.id).eq('household_id', ctx.householdId);
  if (error) return dbError('goal lifecycle', error);
  if (count !== 1) return formError('Projet introuvable ou non modifiable.');
  const msg = { achieve: 'Projet marqué comme réalisé.', reopen: 'Projet rouvert.', pause: 'Projet mis en pause : il sort de la planification.', resume: 'Projet repris.', archive: 'Projet archivé : son historique est conservé.' }[d.action];
  return done(msg);
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

// --- Sprint 3 : choix du foyer pour l'analyse ------------------------------------
/** « Ce n'est pas une dépense récurrente » : la série n'est plus détectée pour ce foyer. */
export async function markNotRecurring(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const key = String(fd.get('seriesKey') ?? '');
  if (key.length < 3 || key.length > 120) return formError('Série invalide.');
  const { error } = await ctx.supabase.from('recurring_feedback')
    .upsert({ household_id: ctx.householdId, series_key: key }, { onConflict: 'household_id,series_key', ignoreDuplicates: true });
  if (error) return dbError('recurring feedback', error);
  return done('Cette opération ne sera plus considérée comme récurrente.');
}

/** Nature fixe ou variable d'une catégorie pour ce foyer (« default » : nature du référentiel). */
export async function saveCategoryNature(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const slug = String(fd.get('categorySlug') ?? '');
  const nature = String(fd.get('nature') ?? '');
  if (!/^[a-z0-9_-]{2,60}$/.test(slug) || !['fixed', 'variable', 'default'].includes(nature)) return formError('Choix invalide.');
  const { error } = nature === 'default'
    ? await ctx.supabase.from('household_category_settings').delete().eq('household_id', ctx.householdId).eq('category_slug', slug)
    : await ctx.supabase.from('household_category_settings')
      .upsert({ household_id: ctx.householdId, category_slug: slug, nature }, { onConflict: 'household_id,category_slug' });
  if (error) return dbError('category nature', error);
  return done('Nature de la catégorie enregistrée.');
}

/** Compte retenu (ou non) pour la réserve de précaution. */
export async function setAccountReserve(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const id = String(fd.get('accountId') ?? '');
  const value = fd.get('reserve');
  if (!/^[0-9a-f-]{36}$/i.test(id) || (value !== 'yes' && value !== 'no')) return formError('Choix invalide.');
  const { error } = await ctx.supabase.from('accounts').update({ counts_as_reserve: value === 'yes' }).eq('id', id).eq('household_id', ctx.householdId);
  if (error) return dbError('account reserve', error);
  return done(value === 'yes' ? 'Compte compté dans votre réserve de précaution.' : 'Compte retiré de votre réserve de précaution.');
}

/** Rapprochement de virement : confirmé (virement entre comptes) ou rejeté (opérations distinctes). */
export async function decideTransfer(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writableContext(); if (isState(ctx)) return ctx;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const debitId = String(fd.get('debitId') ?? ''), creditId = String(fd.get('creditId') ?? '');
  const verdict = fd.get('verdict');
  if (!uuid.test(debitId) || !uuid.test(creditId) || (verdict !== 'confirmed' && verdict !== 'rejected')) return formError('Décision invalide.');
  const { error } = await ctx.supabase.from('transfer_decisions')
    .upsert({ household_id: ctx.householdId, debit_id: debitId, credit_id: creditId, verdict }, { onConflict: 'household_id,debit_id,credit_id' });
  if (error) return dbError('transfer decision', error);
  return done(verdict === 'confirmed' ? 'Virement entre vos comptes confirmé : il n’est plus compté comme revenu ni comme dépense.' : 'Opérations distinctes : elles restent comptées normalement.');
}
