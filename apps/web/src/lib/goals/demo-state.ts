/**
 * État de la démonstration interactive : modèle, validation, données de départ et
 * opérations. Fonctions pures (aucun cookie, aucun React) : testées seules.
 *
 * Les règles reproduisent celles de la base réelle pour que la démonstration ne montre
 * rien que le mode réel refuserait :
 * - historique en ajout seul, mêmes champs que goal_changes (trigger log_goal_change) ;
 * - épargne initiale marquée « initial » ; retrait limité au montant mis de côté ;
 * - Aïd : une année civile par projet, reconduction après réalisation seulement, une
 *   seule fois, depuis l'année précédente (eid_plan_guard) ; montants jamais repris.
 * Données FICTIVES uniquement.
 */
import { z } from 'zod';
import { DEMO_ALLOCATIONS, DEMO_AS_OF, DEMO_GOALS } from '@amanah/banking';
import { DEFAULT_PLANNING_PREFERENCES, addDays, addMonths, eidBudget, templateById, type Goal, type GoalAllocation, type GoalKind, type PlanningPreferences, SNOOZE_DAYS } from '@amanah/engines';
import { DEMO_AID_ALLOCATIONS, DEMO_AID_GOAL, DEMO_AID_PLAN } from '../demo-eid.ts';
import type { EidBudgetFields, GoalChangeRow, GoalPatch, LifecycleAction, NewEidInput, NewGoalInput, PlanLineInput } from './repository.ts';

/**
 * Version du format. v2 : projets issus d'un modèle (suggestion), projets annuels, préférences,
 * décisions et calendrier familial. Un état v1 est mis à niveau à la lecture, sans perte.
 */
export const DEMO_STATE_VERSION = 2;
/** Limites de la démonstration (taille du stockage dans le navigateur). */
export const DEMO_LIMITS = { goals: 30, allocations: 300, changes: 300, eidPlans: 10, decisions: 100, events: 30 } as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().min(0).max(100_000_000_00);
const id = z.string().regex(/^[a-z0-9-]{3,40}$/);
const KINDS = ['hajj', 'omra', 'eid_al_adha', 'religious_other', 'children_education', 'real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal'] as const;

const goalFields = {
  id, kind: z.enum(KINDS), name: z.string().min(1).max(120),
  targetCents: cents.min(1), targetDate: date, monthlyCapacityCents: cents.nullable(),
  priority: z.number().int().min(1).max(5), status: z.enum(['active', 'paused', 'achieved', 'archived']),
  realizedOn: date.nullable(), createdOn: date, planConfirmedOn: date.nullable(),
  strategyMonthlyCents: cents.nullable(), strategyChosenOn: date.nullable(),
};
const goalRules = <T extends z.ZodType<{ status: string; realizedOn: string | null; strategyMonthlyCents: number | null; strategyChosenOn: string | null }>>(sch: T) =>
  sch.refine((g) => (g.status === 'achieved') === (g.realizedOn !== null)).refine((g) => (g.strategyMonthlyCents === null) === (g.strategyChosenOn === null));
const goalSchemaV1 = goalRules(z.object(goalFields));
const templateId = z.string().regex(/^[a-z0-9-]{2,40}$/);
const goalSchema = goalRules(z.object({
  ...goalFields,
  templateId: templateId.nullable(), occurrence: z.number().int().min(2000).max(2100).nullable(), previousGoalId: id.nullable(),
}));
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
const planningSchema = z.object({
  prefs: z.object({
    groups: z.array(z.enum(['religious', 'family', 'finance', 'wealth'])).max(4),
    hasChildren: z.boolean().nullable(), hasVehicle: z.boolean().nullable(),
    interests: z.array(templateId).max(30),
    schoolCalendar: z.enum(['be-fwb', 'be-vl', 'custom']),
    customSchool: z.object({ start: monthDay, holidays: monthDay }).nullable(),
    confirmations: z.array(z.object({ type: z.enum(['ramadan', 'eid_al_fitr']), year: z.number().int().min(2000).max(2100), date, source: z.string().min(3).max(200) })).max(20),
    // Dates scolaires corrigées par la personne (absentes des états antérieurs)
    schoolOverrides: z.array(z.object({ kind: z.enum(['start', 'holidays']), year: z.number().int().min(2000).max(2100), date, source: z.string().min(3).max(200) })).max(20).default([]),
  }),
  decisions: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]{2,40}(:[0-9]{4})?$/), status: z.enum(['snoozed', 'dismissed']), until: date.optional() })).max(DEMO_LIMITS.decisions),
  // Visibilité et classification explicites (états antérieurs : événement personnel, non religieux)
  events: z.array(z.object({
    id, label: z.string().min(2).max(80), date, yearly: z.boolean(),
    visibility: z.enum(['private', 'household']).default('private'), religious: z.boolean().default(false),
  }).refine((e) => !e.religious || e.visibility === 'private')).max(DEMO_LIMITS.events),
  /** Date de référence simulée (null : DEMO_AS_OF, tests déterministes). */
  simulationDate: date.nullable().default(null),
});

const allocationSchema = z.object({
  goalId: id, amountCents: z.number().int().min(-100_000_000_00).max(100_000_000_00).refine((v) => v !== 0),
  allocatedOn: date, source: z.enum(['initial', 'manual']),
});
const changeSchema = z.object({
  id: z.number().int().min(1), goalId: id, at: z.string().max(40),
  changes: z.record(z.string().max(40), z.object({ from: z.unknown(), to: z.unknown() })),
});
const eidSchema = z.object({
  goal_id: id, owner_id: z.literal('demo-user'), civil_year: z.number().int().min(2000).max(2100),
  sacrifice_cents: cents, extra_costs_cents: cents, organization_cents: cents, family_contribution_cents: cents,
  date_status: z.enum(['entered', 'confirmed']), date_source: z.string().max(200).nullable(), estimated_date: date.nullable(), previous_goal_id: id.nullable(),
});

const stateFields = {
  seq: z.number().int().min(0).max(1_000_000),
  allocations: z.array(allocationSchema).max(DEMO_LIMITS.allocations + 20),
  changes: z.array(changeSchema).max(DEMO_LIMITS.changes + 20),
  eidPlans: z.array(eidSchema).max(DEMO_LIMITS.eidPlans),
  declaredCapacityCents: cents.nullable(),
};
const demoStateV1Schema = z.object({ v: z.literal(1), ...stateFields, goals: z.array(goalSchemaV1).max(DEMO_LIMITS.goals + 5) });

export const demoStateSchema = z.object({
  v: z.literal(DEMO_STATE_VERSION),
  ...stateFields,
  goals: z.array(goalSchema).max(DEMO_LIMITS.goals + 5),
  planning: planningSchema,
}).superRefine((s, ctx) => {
  // Cohérence des références : une donnée orpheline signale un contenu altéré
  const ids = new Set(s.goals.map((g) => g.id));
  if (ids.size !== s.goals.length) ctx.addIssue({ code: 'custom', message: 'identifiants en double' });
  if (s.allocations.some((a) => !ids.has(a.goalId)) || s.changes.some((c) => !ids.has(c.goalId))) ctx.addIssue({ code: 'custom', message: 'référence inconnue' });
  const eidGoals = new Set(s.goals.filter((g) => g.kind === 'eid_al_adha').map((g) => g.id));
  if (s.eidPlans.some((p) => !eidGoals.has(p.goal_id))) ctx.addIssue({ code: 'custom', message: 'plan Aïd orphelin' });
  if (s.goals.some((g) => g.previousGoalId !== null && !ids.has(g.previousGoalId))) ctx.addIssue({ code: 'custom', message: 'occurrence précédente inconnue' });
});

export type DemoState = z.infer<typeof demoStateSchema>;
export type DemoGoal = DemoState['goals'][number];
export type DemoAllocation = DemoState['allocations'][number];

/** Validation d'un contenu lu dans le navigateur : null s'il est illisible ou altéré. */
export function parseDemoState(raw: unknown): DemoState | null {
  const r = demoStateSchema.safeParse(raw);
  if (r.success) return r.data;
  // Mise à niveau d'un état v1 : projets et historique conservés, préférences de départ
  const v1 = demoStateV1Schema.safeParse(raw);
  if (!v1.success) return null;
  const up = demoStateSchema.safeParse({
    ...v1.data, v: DEMO_STATE_VERSION,
    goals: v1.data.goals.map((g) => ({ ...g, templateId: null, occurrence: null, previousGoalId: null })),
    planning: initialPlanning(),
  });
  return up.success ? up.data : null;
}

/** Préférences fictives de départ : déclarées pour la démonstration (enfants, véhicule). */
export function initialPlanning(): DemoState['planning'] {
  return {
    prefs: { ...DEFAULT_PLANNING_PREFERENCES, hasChildren: true, hasVehicle: true, interests: ['entretien-automobile'] },
    decisions: [],
    events: [{ id: 'evt-assurance', label: 'Assurance habitation (fictive)', date: '2027-03-15', yearly: true, visibility: 'household', religious: false }],
    simulationDate: null,
  };
}

/** Point de départ : les données fictives existantes (projets, affectations, Aïd, capacité). */
export function initialDemoState(): DemoState {
  const seedGoals: Goal[] = [...DEMO_GOALS, DEMO_AID_GOAL];
  const seedAllocations: GoalAllocation[] = [...DEMO_ALLOCATIONS, ...DEMO_AID_ALLOCATIONS];
  const first = new Map<string, number>();
  seedAllocations.forEach((a, i) => { if (!first.has(a.goalId)) first.set(a.goalId, i); });
  return {
    v: DEMO_STATE_VERSION,
    seq: 0,
    goals: seedGoals.map((g) => ({
      id: g.id, kind: g.kind, name: g.name, targetCents: g.targetCents, targetDate: g.targetDate,
      monthlyCapacityCents: g.monthlyCapacityCents ?? null, priority: g.priority ?? 3, status: 'active',
      realizedOn: null, createdOn: seedAllocations[first.get(g.id) ?? -1]?.allocatedOn ?? DEMO_AS_OF,
      planConfirmedOn: null, strategyMonthlyCents: null, strategyChosenOn: null,
      templateId: null, occurrence: null, previousGoalId: null,
    })),
    // La première affectation de chaque projet fictif est son épargne de départ
    allocations: seedAllocations.map((a, i) => ({ goalId: a.goalId, amountCents: a.amountCents, allocatedOn: a.allocatedOn, source: first.get(a.goalId) === i ? 'initial' : 'manual' })),
    changes: [],
    eidPlans: [{
      ...DEMO_AID_PLAN, owner_id: 'demo-user' as const,
      sacrifice_cents: Number(DEMO_AID_PLAN.sacrifice_cents), extra_costs_cents: Number(DEMO_AID_PLAN.extra_costs_cents),
      organization_cents: Number(DEMO_AID_PLAN.organization_cents), family_contribution_cents: Number(DEMO_AID_PLAN.family_contribution_cents),
    }],
    declaredCapacityCents: 50_000,
    planning: initialPlanning(),
  };
}

/** Vers le modèle commun des moteurs. */
export function toEngineGoal(g: DemoGoal): Goal {
  return {
    id: g.id, kind: g.kind as GoalKind, name: g.name, targetCents: g.targetCents, targetDate: g.targetDate,
    ...(g.monthlyCapacityCents === null ? {} : { monthlyCapacityCents: g.monthlyCapacityCents }),
    lifecycle: g.status, priority: g.priority,
    ...(g.realizedOn ? { realizedOn: g.realizedOn } : {}),
    ...(g.planConfirmedOn ? { planConfirmedOn: g.planConfirmedOn } : {}),
    ...(g.strategyMonthlyCents !== null && g.strategyChosenOn ? { strategy: { monthlyCents: g.strategyMonthlyCents, chosenOn: g.strategyChosenOn } } : {}),
    ...(g.templateId ? { templateId: g.templateId } : {}),
    ...(g.occurrence !== null ? { occurrence: g.occurrence } : {}),
    ...(g.previousGoalId ? { previousGoalId: g.previousGoalId } : {}),
  };
}
export const toEngineAllocations = (s: DemoState): GoalAllocation[] =>
  s.allocations.map((a) => ({ goalId: a.goalId, amountCents: a.amountCents, allocatedOn: a.allocatedOn, source: a.source }));

export function demoHistory(s: DemoState, goalId: string): GoalChangeRow[] {
  return s.changes.filter((c) => c.goalId === goalId).sort((a, b) => b.id - a.id)
    .map((c) => ({ id: `demo-change-${c.id}`, changed_at: c.at, changes: c.changes as GoalChangeRow['changes'] }));
}

// ---------------------------------------------------------------------------
// Opérations : chacune renvoie un nouvel état (jamais de mutation) ou une erreur.
// ---------------------------------------------------------------------------
export type OpResult<T = undefined> = { ok: true; state: DemoState; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };
const err = (error: string, fieldErrors?: Record<string, string>): OpResult<never> => ({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) });
const done = <T>(state: DemoState, value: T): OpResult<T> => ({ ok: true, state, value });

const GOAL_LOG: Array<[keyof DemoGoal, string]> = [
  ['name', 'name'], ['targetCents', 'target_cents'], ['targetDate', 'target_date'], ['monthlyCapacityCents', 'monthly_capacity_cents'],
  ['priority', 'priority'], ['status', 'status'], ['realizedOn', 'realized_on'], ['planConfirmedOn', 'plan_confirmed_on'],
  ['strategyMonthlyCents', 'strategy_monthly_cents'], ['strategyChosenOn', 'strategy_chosen_on'],
];

/** Remplace un projet et journalise les champs modifiés (comme le trigger log_goal_change). */
function replaceGoal(s: DemoState, next: DemoGoal, at: string, extra: Record<string, { from: unknown; to: unknown }> = {}): DemoState {
  const prev = s.goals.find((g) => g.id === next.id)!;
  const diff: Record<string, { from: unknown; to: unknown }> = { ...extra };
  for (const [k, col] of GOAL_LOG) if (prev[k] !== next[k]) diff[col] = { from: prev[k], to: next[k] };
  const changes = Object.keys(diff).length === 0 ? s.changes : [...s.changes, { id: s.seq + 1, goalId: next.id, at, changes: diff }];
  return { ...s, seq: Object.keys(diff).length === 0 ? s.seq : s.seq + 1, goals: s.goals.map((g) => (g.id === next.id ? next : g)), changes };
}

const savedOf = (s: DemoState, goalId: string) => s.allocations.filter((a) => a.goalId === goalId).reduce((t, a) => t + a.amountCents, 0);
const findGoal = (s: DemoState, goalId: string) => s.goals.find((g) => g.id === goalId);
const NOT_FOUND = 'Projet introuvable.';

function withinLimits(s: DemoState): OpResult<never> | null {
  if (s.goals.length > DEMO_LIMITS.goals) return err(`Démonstration limitée à ${DEMO_LIMITS.goals} projets : archivez-en ou réinitialisez la démonstration.`);
  if (s.allocations.length > DEMO_LIMITS.allocations || s.changes.length > DEMO_LIMITS.changes) return err('Limite de la démonstration atteinte : réinitialisez-la pour continuer.');
  return null;
}

type NewGoalBase = Omit<DemoGoal, 'id' | 'priority' | 'status' | 'realizedOn' | 'planConfirmedOn' | 'strategyMonthlyCents' | 'strategyChosenOn' | 'templateId' | 'occurrence' | 'previousGoalId'>
  & Partial<Pick<DemoGoal, 'templateId' | 'occurrence' | 'previousGoalId'>>;
function newGoal(s: DemoState, base: NewGoalBase): { state: DemoState; goal: DemoGoal } {
  const goal: DemoGoal = {
    templateId: null, occurrence: null, previousGoalId: null, ...base,
    id: `demo-${s.seq + 1}`, priority: 3, status: 'active', realizedOn: null, planConfirmedOn: null, strategyMonthlyCents: null, strategyChosenOn: null,
  };
  return { state: { ...s, seq: s.seq + 1, goals: [...s.goals, goal] }, goal };
}

export function opCreateGoal(s: DemoState, input: NewGoalInput, today: string): OpResult<{ id: string }> {
  if (input.initialCents > input.targetCents) return err('Vérifiez les informations saisies.', { available: 'L’épargne disponible dépasse le montant cible.' });
  if (input.templateId && !templateById(input.templateId)?.available) return err('Modèle de projet inconnu.');
  // Reconduction d'un projet annuel : mêmes règles que la base (goal_template_guard)
  if (input.previousGoalId) {
    const prev = findGoal(s, input.previousGoalId);
    if (!prev || prev.status !== 'achieved' || prev.templateId !== (input.templateId ?? null) || prev.occurrence === null || input.occurrence !== prev.occurrence + 1) {
      return err('Reconduction refusée : l’occurrence précédente doit être réalisée, du même modèle, et l’année suivante.');
    }
    if (s.goals.some((g) => g.previousGoalId === input.previousGoalId)) return err('Ce projet a déjà été reconduit pour l’année suivante.');
  }
  const { state, goal } = newGoal(s, {
    kind: input.kind, name: input.name, targetCents: input.targetCents, targetDate: input.targetDate,
    monthlyCapacityCents: input.monthlyCapacityCents, createdOn: today,
    templateId: input.templateId ?? null, occurrence: input.occurrence ?? null, previousGoalId: input.previousGoalId ?? null,
  });
  const next = input.initialCents > 0
    ? { ...state, allocations: [...state.allocations, { goalId: goal.id, amountCents: input.initialCents, allocatedOn: today, source: 'initial' as const }] }
    : state;
  return withinLimits(next) ?? done(next, { id: goal.id });
}

export function opUpdateGoal(s: DemoState, goalId: string, patch: GoalPatch, today: string, confirmPlan: boolean): OpResult {
  const g = findGoal(s, goalId);
  if (!g) return err(NOT_FOUND);
  // La catégorie et les affectations ne changent jamais
  const next: DemoGoal = {
    ...g, name: patch.name, targetCents: patch.targetCents, targetDate: patch.targetDate,
    monthlyCapacityCents: patch.monthlyCapacityCents, priority: patch.priority,
    ...(confirmPlan ? { planConfirmedOn: today } : {}),
  };
  if (g.kind === 'eid_al_adha' && next.targetCents !== g.targetCents) return err('Le montant d’un Aïd se modifie par son budget (sacrifice, frais, contributions).');
  const state = replaceGoal(s, next, `${today}T12:00:00Z`);
  return withinLimits(state) ?? done(state, undefined);
}

export function opChooseStrategy(s: DemoState, goalId: string, monthlyCents: number, today: string): OpResult {
  const g = findGoal(s, goalId);
  if (!g) return err(NOT_FOUND);
  if (g.status !== 'active') return err('Projet en pause, archivé ou réalisé : reprenez-le avant de choisir une stratégie.');
  const state = replaceGoal(s, { ...g, monthlyCapacityCents: monthlyCents, strategyMonthlyCents: monthlyCents, strategyChosenOn: today }, `${today}T12:00:00Z`);
  return withinLimits(state) ?? done(state, undefined);
}

export function opAddAllocation(s: DemoState, goalId: string, amountCents: number, today: string): OpResult {
  const g = findGoal(s, goalId);
  if (!g) return err(NOT_FOUND);
  if (g.status !== 'active') return err('Projet en pause, archivé ou réalisé : aucune affectation possible.');
  if (amountCents === 0) return err('Montant nul.');
  if (amountCents < 0 && savedOf(s, goalId) + amountCents < 0) return err('Retrait impossible : il dépasse le montant mis de côté pour ce projet.', { amount: 'Montant supérieur à l’épargne du projet.' });
  const state = { ...s, allocations: [...s.allocations, { goalId, amountCents, allocatedOn: today, source: 'manual' as const }] };
  return withinLimits(state) ?? done(state, undefined);
}

export function opSavePlan(s: DemoState, lines: PlanLineInput[], today: string): OpResult {
  let state = s;
  for (const l of lines) {
    const g = findGoal(state, l.goalId);
    if (!g) return err(NOT_FOUND);
    state = replaceGoal(state, { ...g, monthlyCapacityCents: l.monthlyCents, priority: l.priority }, `${today}T12:00:00Z`);
  }
  return withinLimits(state) ?? done(state, undefined);
}

export function opSetLifecycle(s: DemoState, goalId: string, action: LifecycleAction, realizedOn: string | null, today: string): OpResult {
  const g = findGoal(s, goalId);
  if (!g) return err(NOT_FOUND);
  if (action === 'achieve' && (!realizedOn || realizedOn > today)) return err('Vérifiez les informations saisies.', { realizedOn: 'La date de réalisation ne peut pas être dans le futur.' });
  const status = { achieve: 'achieved', reopen: 'active', pause: 'paused', resume: 'active', archive: 'archived' }[action] as DemoGoal['status'];
  const state = replaceGoal(s, { ...g, status, realizedOn: action === 'achieve' ? realizedOn : null }, `${today}T12:00:00Z`);
  return withinLimits(state) ?? done(state, undefined);
}

export function opSetDeclaredCapacity(s: DemoState, centsValue: number | null): OpResult {
  return done({ ...s, declaredCapacityCents: centsValue }, undefined);
}

const toSave = (b: EidBudgetFields) => eidBudget({
  sacrificeCents: b.sacrificeCents, extraCostsCents: b.extraCostsCents, organizationCents: b.organizationCents, familyContributionCents: b.familyContributionCents,
}).toSaveCents;

export function opCreateEid(s: DemoState, input: NewEidInput, today: string): OpResult<{ id: string }> {
  const amount = toSave(input);
  if (amount <= 0) return err('Vérifiez les informations saisies.', { family: 'Les contributions familiales couvrent tout le budget : rien à mettre de côté.' });
  if (input.initialCents > amount) return err('Vérifiez les informations saisies.', { available: 'L’épargne disponible dépasse le montant à mettre de côté.' });
  // Une seule année civile par projet Aïd (contrainte unique de la base)
  if (s.eidPlans.some((p) => p.civil_year === input.civilYear)) return err(`Un projet Aïd existe déjà pour ${input.civilYear}, ou cet Aïd a déjà été reconduit.`);
  if (input.previousGoalId) {
    const prevPlan = s.eidPlans.find((p) => p.goal_id === input.previousGoalId);
    const prevGoal = findGoal(s, input.previousGoalId);
    if (!prevPlan || !prevGoal || prevGoal.status !== 'achieved' || prevPlan.civil_year !== input.civilYear - 1) {
      return err('Reconduction refusée : l’Aïd précédent doit être réalisé et de l’année civile précédente.');
    }
    if (s.eidPlans.some((p) => p.previous_goal_id === input.previousGoalId)) return err(`Un projet Aïd existe déjà pour ${input.civilYear}, ou cet Aïd a déjà été reconduit.`);
  }
  const { state, goal } = newGoal(s, {
    kind: 'eid_al_adha', name: input.name, targetCents: amount, targetDate: input.targetDate,
    monthlyCapacityCents: input.monthlyCapacityCents, createdOn: today,
  });
  const plan: DemoState['eidPlans'][number] = {
    goal_id: goal.id, owner_id: 'demo-user', civil_year: input.civilYear,
    sacrifice_cents: input.sacrificeCents, extra_costs_cents: input.extraCostsCents, organization_cents: input.organizationCents,
    family_contribution_cents: input.familyContributionCents, date_status: input.dateStatus,
    date_source: input.dateSource?.trim() || null, estimated_date: input.estimatedDate, previous_goal_id: input.previousGoalId,
  };
  const next: DemoState = {
    ...state,
    eidPlans: [...state.eidPlans, plan],
    allocations: input.initialCents > 0 ? [...state.allocations, { goalId: goal.id, amountCents: input.initialCents, allocatedOn: today, source: 'initial' }] : state.allocations,
  };
  if (next.eidPlans.length > DEMO_LIMITS.eidPlans) return err('Limite de la démonstration atteinte : réinitialisez-la pour continuer.');
  return withinLimits(next) ?? done(next, { id: goal.id });
}

export function opUpdateEidDate(s: DemoState, goalId: string, d: string, status: 'entered' | 'confirmed', source: string | null, today: string): OpResult {
  const plan = s.eidPlans.find((p) => p.goal_id === goalId);
  const g = findGoal(s, goalId);
  if (!plan || !g) return err(NOT_FOUND);
  if (!d.startsWith(`${plan.civil_year}-`)) return err('Vérifiez les informations saisies.', { targetDate: 'La date doit tomber dans l’année civile du projet.' });
  // Jamais « confirmée » sans source (contrainte de la base)
  if (status === 'confirmed' && !(source && source.trim().length >= 3)) return err('Vérifiez les informations saisies.', { dateSource: 'Une date confirmée doit indiquer sa source (mosquée, autorité suivie…).' });
  const nextPlan = { ...plan, date_status: status, date_source: source?.trim() || null };
  const extra: Record<string, { from: unknown; to: unknown }> = {};
  if (plan.date_status !== nextPlan.date_status) extra.date_status = { from: plan.date_status, to: nextPlan.date_status };
  if (plan.date_source !== nextPlan.date_source) extra.date_source = { from: plan.date_source, to: nextPlan.date_source };
  const state = replaceGoal({ ...s, eidPlans: s.eidPlans.map((p) => (p.goal_id === goalId ? nextPlan : p)) }, { ...g, targetDate: d }, `${today}T12:00:00Z`, extra);
  return withinLimits(state) ?? done(state, undefined);
}

export function opUpdateEidBudget(s: DemoState, goalId: string, b: EidBudgetFields, today: string): OpResult {
  const plan = s.eidPlans.find((p) => p.goal_id === goalId);
  const g = findGoal(s, goalId);
  if (!plan || !g) return err(NOT_FOUND);
  const amount = toSave(b);
  if (amount <= 0) return err('Vérifiez les informations saisies.', { family: 'Les contributions familiales couvrent tout le budget : rien à mettre de côté.' });
  const nextPlan = { ...plan, sacrifice_cents: b.sacrificeCents, extra_costs_cents: b.extraCostsCents, organization_cents: b.organizationCents, family_contribution_cents: b.familyContributionCents };
  const extra: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of ['sacrifice_cents', 'extra_costs_cents', 'organization_cents', 'family_contribution_cents'] as const) {
    if (Number(plan[k]) !== Number(nextPlan[k])) extra[k] = { from: Number(plan[k]), to: Number(nextPlan[k]) };
  }
  // Le montant à mettre de côté suit le budget (comme eid_sync_target) ; les affectations restent
  const state = replaceGoal({ ...s, eidPlans: s.eidPlans.map((p) => (p.goal_id === goalId ? nextPlan : p)) }, { ...g, targetCents: amount }, `${today}T12:00:00Z`, extra);
  return withinLimits(state) ?? done(state, undefined);
}

// ---------------------------------------------------------------------------
// Suggestions, préférences et calendrier familial
// ---------------------------------------------------------------------------
export function opSavePlanningPreferences(s: DemoState, prefs: PlanningPreferences): OpResult {
  return done({ ...s, planning: { ...s.planning, prefs } }, undefined);
}

/** Reporter : 30 jours (cette occurrence) ; ne plus proposer : le modèle entier ; rétablir : les deux. */
export function opDecideSuggestion(s: DemoState, suggestionId: string, decision: 'snooze' | 'dismiss' | 'restore', today: string): OpResult {
  const templateId = suggestionId.split(':')[0]!;
  if (!templateById(templateId)) return err('Suggestion inconnue.');
  const others = s.planning.decisions.filter((d) => d.id !== suggestionId && d.id !== templateId);
  const add = decision === 'snooze' ? [{ id: suggestionId, status: 'snoozed' as const, until: addDays(today, SNOOZE_DAYS) }]
    : decision === 'dismiss' ? [{ id: templateId, status: 'dismissed' as const }] : [];
  const decisions = [...others, ...add];
  if (decisions.length > DEMO_LIMITS.decisions) return err('Limite de la démonstration atteinte : réinitialisez-la pour continuer.');
  return done({ ...s, planning: { ...s.planning, decisions } }, undefined);
}

export function opAddCalendarEvent(
  s: DemoState,
  e: { label: string; date: string; yearly: boolean; visibility?: 'private' | 'household'; religious?: boolean },
): OpResult {
  if (s.planning.events.length >= DEMO_LIMITS.events) return err(`Démonstration limitée à ${DEMO_LIMITS.events} échéances personnalisées.`);
  // Un événement religieux reste toujours privé (même règle que la base réelle)
  const religious = e.religious === true;
  const event = { id: `evt-${s.seq + 1}`, label: e.label, date: e.date, yearly: e.yearly, visibility: religious ? 'private' as const : e.visibility ?? 'private', religious };
  return done({ ...s, seq: s.seq + 1, planning: { ...s.planning, events: [...s.planning.events, event] } }, undefined);
}

export function opRemoveCalendarEvent(s: DemoState, eventId: string): OpResult {
  if (!s.planning.events.some((e) => e.id === eventId)) return err('Échéance introuvable.');
  return done({ ...s, planning: { ...s.planning, events: s.planning.events.filter((e) => e.id !== eventId) } }, undefined);
}

// ---------------------------------------------------------------------------
// Date de référence de la démonstration
// ---------------------------------------------------------------------------
/** Horizon de simulation : de DEMO_AS_OF à 24 mois plus tard. */
export const SIMULATION_MAX = addMonths(DEMO_AS_OF, 24);

/** Date du jour de la démonstration : la date simulée choisie, sinon DEMO_AS_OF. */
export const demoAsOf = (s: DemoState): string => s.planning.simulationDate ?? DEMO_AS_OF;

/** Choisir une date de référence (null : revenir à DEMO_AS_OF). Les projets ne sont pas modifiés. */
export function opSetSimulationDate(s: DemoState, d: string | null): OpResult {
  if (d !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < DEMO_AS_OF || d > SIMULATION_MAX)) {
    return err(`Choisissez une date entre le ${DEMO_AS_OF} et le ${SIMULATION_MAX}.`);
  }
  return done({ ...s, planning: { ...s.planning, simulationDate: d === DEMO_AS_OF ? null : d } }, undefined);
}
