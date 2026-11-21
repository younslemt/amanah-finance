'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { writeGoalRepository, type GoalRepository } from '@/lib/goals';
import { resetDemoState, setDemoSimulationDate } from '@/lib/goals/demo-repository';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { annualRenewalCheck, GOAL_TEMPLATES, isReligiousGoal, isReligiousTemplate, templateById } from '@amanah/engines';
import {
  accountSchema, allocationSchema, budgetSchema, categorySchema, customCategorySlug, fieldErrorsOf,
  declaredCapacitySchema, formDataToObject, goalLifecycleSchema, goalSchema, goalUpdateSchema, idSchema, savingsPlanSchema, strategySchema, transactionSchema,
  calendarEventIdSchema, calendarEventSchema, planningPreferencesSchema, religiousDateConfirmationSchema, suggestionDecisionSchema,
  schoolDateOverrideSchema, schoolDateResetSchema, simulationDateSchema,
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
  family_savings: 'Épargne familiale', emergency_fund: 'Réserve de précaution', personal: 'Projet personnel', religious_other: 'Projet religieux',
};

// --- Projets : toutes les écritures passent par le dépôt (démonstration ou Supabase) ----
/** Dépôt d'écriture, ou état d'erreur (rôle en lecture seule). */
async function goals(): Promise<GoalRepository | FormState> {
  const r = await writeGoalRepository();
  return 'error' in r ? formError(r.error) : r;
}
const isRepoError = (v: GoalRepository | FormState): v is FormState => 'status' in v;
const fromRepo = (r: { ok: false; error: string; fieldErrors?: Record<string, string> }) => formError(r.error, r.fieldErrors);

/**
 * Création d'un projet, de toute catégorie (plusieurs projets d'une même catégorie possibles).
 * Projets généraux : communs au foyer, sans consentement religieux. Hajj et Omra : consentement
 * article 9 en mode réel (vérifié ici, imposé par la RLS). Ouvre ensuite la fiche du projet.
 */
export async function createGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = goalSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (isReligiousGoal(d.kind) && !repo.religiousEnabled) return formError('Les projets religieux (Hajj, Omra, Ramadan…) demandent d’activer les fonctions de finance islamique (consentement explicite).');
  if (d.targetDate <= repo.today()) return formError('Vérifiez les informations saisies.', { targetDate: 'La date souhaitée doit être dans le futur.' });
  // Suggestion acceptée : le modèle doit exister et être disponible (rien n'est imposé : tout reste modifiable)
  const template = d.templateId ? templateById(d.templateId) : undefined;
  if (d.templateId && (!template || !template.available || template.kind === 'eid_flow')) return formError('Modèle de projet inconnu.');
  let occurrence = template?.recurrence === 'yearly' ? (d.occurrence ?? Number(repo.today().slice(0, 4))) : null;
  // Reconduction d'un projet annuel : décidée par la personne, une seule fois, depuis une occurrence réalisée
  if (d.previousGoalId) {
    const all = await repo.listGoals();
    const prev = all.find((g) => g.id === d.previousGoalId);
    const check = prev ? annualRenewalCheck(prev, all) : null;
    if (!check?.allowed || check.template.id !== d.templateId) return formError('Reconduction refusée : l’occurrence précédente doit être réalisée, du même modèle, et pas encore reconduite.');
    occurrence = check.occurrence;
  }
  const r = await repo.create({
    kind: d.kind, name: d.name ?? KIND_LABEL[d.kind]!, targetCents: d.target, targetDate: d.targetDate,
    monthlyCapacityCents: d.monthlyCapacity, initialCents: d.available,
    templateId: template?.id ?? null, occurrence, previousGoalId: d.previousGoalId,
  });
  if (!r.ok) return fromRepo(r);
  revalidatePath('/', 'layout');
  redirect(`/goals/${r.value.id}?cree=1`);
}

/**
 * Modification du plan d'un projet : la catégorie et les affectations ne changent pas ;
 * l'historique garde l'avant / après. « Valider mon plan » marque l'étape Planifier.
 */
export async function updateGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = goalUpdateSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const r = await repo.update(d.id, { name: d.name, targetCents: d.target, targetDate: d.targetDate, monthlyCapacityCents: d.monthlyCapacity, priority: d.priority }, { confirmPlan: d.confirm });
  if (!r.ok) return fromRepo(r);
  return done(d.confirm ? 'Plan validé. L’historique des affectations est conservé.' : 'Projet mis à jour. L’historique des affectations est conservé.');
}

/** « Simuler » : la personne retient un scénario ; il devient la mensualité prévue du projet. */
export async function chooseStrategy(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = strategySchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Scénario invalide.');
  const r = await repo.chooseStrategy(parsed.data.goalId, parsed.data.monthly);
  if (!r.ok) return fromRepo(r);
  return done('Stratégie retenue : elle devient la mensualité prévue du projet. Rien n’est versé ni dépensé.');
}

/** Réaliser, rouvrir, mettre en pause, reprendre ou archiver : rien n'est effacé. */
export async function setGoalLifecycle(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = goalLifecycleSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.realizedOn && d.realizedOn > repo.today()) return formError('Vérifiez les informations saisies.', { realizedOn: 'La date de réalisation ne peut pas être dans le futur.' });
  const r = await repo.setLifecycle(d.id, d.action, d.realizedOn);
  if (!r.ok) return fromRepo(r);
  const msg = { achieve: 'Projet marqué comme réalisé.', reopen: 'Projet rouvert.', pause: 'Projet mis en pause : il sort de la planification.', resume: 'Projet repris.', archive: 'Projet archivé : son historique est conservé.' }[d.action];
  return done(msg);
}

/**
 * Plan d'épargne : montant mensuel prévu et priorité de chaque projet. Rien n'est versé ni
 * dépensé ; chaque changement de projet est journalisé.
 */
export async function saveSavingsPlan(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = savingsPlanSchema.safeParse({
    goalIds: fd.getAll('goalId').map(String), monthly: fd.getAll('monthly').map(String), priority: fd.getAll('priority').map(String),
  });
  if (!parsed.success) return formError('Vérifiez les montants et les priorités.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const r = await repo.savePlan(d.goalIds.map((goalId, i) => ({ goalId, monthlyCents: d.monthly[i]!, priority: d.priority[i]! })));
  if (!r.ok) return fromRepo(r);
  return done('Plan d’épargne enregistré. Aucune somme n’est déplacée : ce sont des mises de côté prévues.');
}

export async function saveDeclaredCapacity(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = declaredCapacitySchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez le montant.', fieldErrorsOf(parsed.error));
  const r = await repo.setDeclaredCapacity(parsed.data.capacity);
  if (!r.ok) return fromRepo(r);
  return done(parsed.data.capacity === null ? 'Capacité déclarée retirée : l’estimation de l’analyse est utilisée.' : 'Capacité d’épargne mensuelle enregistrée.');
}

/** Affectation virtuelle (ajout ou retrait) : ni une dépense, ni un virement. */
export async function allocateToGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = allocationSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const amount = parsed.data.direction === 'remove' ? -parsed.data.amount : parsed.data.amount;
  const r = await repo.addAllocation(parsed.data.goalId, amount);
  if (!r.ok) return fromRepo(r);
  return done(amount > 0 ? 'Montant affecté à l’objectif.' : 'Montant retiré de l’objectif.');
}

/** Démonstration : retour aux données fictives de départ (mode réel : sans objet). */
export async function resetDemo(_p: FormState, _fd: FormData): Promise<FormState> {
  if (!isDemoMode) return formError('Réinitialisation réservée au mode démonstration.');
  await resetDemoState();
  return done('Démonstration réinitialisée : les données fictives de départ sont rétablies.');
}

/** Démonstration : simuler une autre date du jour ; toutes les échéances sont recalculées. */
export async function setSimulationDate(_p: FormState, fd: FormData): Promise<FormState> {
  if (!isDemoMode) return formError('Simulation de date réservée au mode démonstration.');
  const parsed = simulationDateSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Date invalide.', fieldErrorsOf(parsed.error));
  const r = await setDemoSimulationDate(parsed.data.date);
  if (!r.ok) return fromRepo(r);
  return done(parsed.data.date ? `Démonstration simulée au ${parsed.data.date} : échéances, suggestions et budget recalculés.` : 'Date de départ de la démonstration rétablie.');
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

// --- Suggestions de projets, préférences et calendrier familial --------------------
const RELIGIOUS_TEMPLATE_IDS = GOAL_TEMPLATES.filter(isReligiousTemplate).map((t) => t.id);

/**
 * Préférences déclarées. Sans fonctions religieuses activées, rien de religieux n'est conservé
 * (aucune préférence ne doit révéler une pratique sans consentement explicite).
 */
export async function savePlanningPreferences(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = planningPreferencesSchema.safeParse({
    groups: fd.getAll('groups').map(String), interests: fd.getAll('interests').map(String),
    hasChildren: fd.get('hasChildren') ?? 'unknown', hasVehicle: fd.get('hasVehicle') ?? 'unknown',
    schoolCalendar: fd.get('schoolCalendar'), schoolStart: fd.get('schoolStart') ?? undefined, schoolHolidays: fd.get('schoolHolidays') ?? undefined,
  });
  if (!parsed.success) return formError('Vérifiez vos préférences.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const current = (await repo.planning()).prefs;
  const r = await repo.savePlanningPreferences({
    groups: repo.religiousEnabled ? d.groups : d.groups.filter((g) => g !== 'religious'),
    interests: d.interests.filter((i) => templateById(i)?.available && (repo.religiousEnabled || !RELIGIOUS_TEMPLATE_IDS.includes(i))),
    hasChildren: d.hasChildren, hasVehicle: d.hasVehicle, schoolCalendar: d.schoolCalendar,
    customSchool: d.schoolCalendar === 'custom' && d.schoolStart && d.schoolHolidays ? { start: d.schoolStart, holidays: d.schoolHolidays } : null,
    confirmations: repo.religiousEnabled ? current.confirmations : [],
    // Les dates scolaires corrigées par la personne sont conservées : jamais écrasées
    schoolOverrides: current.schoolOverrides ?? [],
  });
  if (!r.ok) return fromRepo(r);
  return done('Préférences enregistrées : les suggestions et le calendrier sont recalculés.');
}

/** « Me le rappeler plus tard » (30 jours), « Ne plus me le proposer », ou rétablir. */
export async function decideSuggestion(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = suggestionDecisionSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Suggestion invalide.');
  const { suggestionId, decision } = parsed.data;
  if (RELIGIOUS_TEMPLATE_IDS.includes(suggestionId.split(':')[0]!) && !repo.religiousEnabled) return formError('Suggestion indisponible.');
  const r = await repo.decideSuggestion(suggestionId, decision);
  if (!r.ok) return fromRepo(r);
  return done({ snooze: 'Suggestion reportée de 30 jours.', dismiss: 'Cette suggestion ne vous sera plus proposée (rétablissable dans les préférences).', restore: 'Suggestion rétablie.' }[decision]);
}

export async function addCalendarEvent(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = calendarEventSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez l’échéance.', fieldErrorsOf(parsed.error));
  if (parsed.data.religious && !repo.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  const r = await repo.addCalendarEvent(parsed.data);
  if (!r.ok) return fromRepo(r);
  return done(parsed.data.religious ? 'Événement religieux ajouté : visible par vous seul.'
    : parsed.data.visibility === 'household' ? 'Échéance partagée avec votre foyer. Une date n’engage aucune dépense.'
      : 'Échéance personnelle ajoutée : visible par vous seul. Une date n’engage aucune dépense.');
}

/** Date scolaire corrigée ou confirmée : elle prime sur le calendrier officiel et sur l'approximation. */
export async function correctSchoolDate(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = schoolDateOverrideSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez la date et sa source.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const prefs = (await repo.planning()).prefs;
  const others = (prefs.schoolOverrides ?? []).filter((o) => !(o.kind === d.kind && o.year === d.year));
  const r = await repo.savePlanningPreferences({ ...prefs, schoolOverrides: [...others, { kind: d.kind, year: d.year, date: d.date, source: d.source }].slice(-20) });
  if (!r.ok) return fromRepo(r);
  return done('Date corrigée : elle ne sera plus recalculée automatiquement.');
}

export async function resetSchoolDate(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = schoolDateResetSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Date invalide.');
  const prefs = (await repo.planning()).prefs;
  const r = await repo.savePlanningPreferences({ ...prefs, schoolOverrides: (prefs.schoolOverrides ?? []).filter((o) => !(o.kind === parsed.data.kind && o.year === parsed.data.year)) });
  if (!r.ok) return fromRepo(r);
  return done('Correction retirée : la date suit à nouveau le calendrier choisi (indicatif).');
}

export async function removeCalendarEvent(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  const parsed = calendarEventIdSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Échéance invalide.');
  const r = await repo.removeCalendarEvent(parsed.data.id);
  if (!r.ok) return fromRepo(r);
  return done('Échéance retirée du calendrier.');
}

/** Date religieuse confirmée par la personne, avec sa source (jamais déduite ni « officielle »). */
export async function confirmReligiousDate(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await goals(); if (isRepoError(repo)) return repo;
  if (!repo.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  const parsed = religiousDateConfirmationSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez la date et sa source.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const prefs = (await repo.planning()).prefs;
  const r = await repo.savePlanningPreferences({
    ...prefs, confirmations: [...prefs.confirmations.filter((c) => !(c.type === d.type && c.year === d.year)), { type: d.type, year: d.year, date: d.date, source: d.source }].slice(-20),
  });
  if (!r.ok) return fromRepo(r);
  return done('Date confirmée par vous, avec sa source.');
}
