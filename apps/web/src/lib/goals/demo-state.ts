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
import { eidBudget, type Goal, type GoalAllocation, type GoalKind } from '@amanah/engines';
import { DEMO_AID_ALLOCATIONS, DEMO_AID_GOAL, DEMO_AID_PLAN } from '../demo-eid.ts';
import type { EidBudgetFields, GoalChangeRow, GoalPatch, LifecycleAction, NewEidInput, NewGoalInput, PlanLineInput } from './repository.ts';

export const DEMO_STATE_VERSION = 1;
/** Limites de la démonstration (taille du stockage dans le navigateur). */
export const DEMO_LIMITS = { goals: 30, allocations: 300, changes: 300, eidPlans: 10 } as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().min(0).max(100_000_000_00);
const id = z.string().regex(/^[a-z0-9-]{3,40}$/);
const KINDS = ['hajj', 'omra', 'eid_al_adha', 'children_education', 'real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal'] as const;

const goalSchema = z.object({
  id, kind: z.enum(KINDS), name: z.string().min(1).max(120),
  targetCents: cents.min(1), targetDate: date, monthlyCapacityCents: cents.nullable(),
  priority: z.number().int().min(1).max(5), status: z.enum(['active', 'paused', 'achieved', 'archived']),
  realizedOn: date.nullable(), createdOn: date, planConfirmedOn: date.nullable(),
  strategyMonthlyCents: cents.nullable(), strategyChosenOn: date.nullable(),
}).refine((g) => (g.status === 'achieved') === (g.realizedOn !== null)).refine((g) => (g.strategyMonthlyCents === null) === (g.strategyChosenOn === null));

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

export const demoStateSchema = z.object({
  v: z.literal(DEMO_STATE_VERSION),
  seq: z.number().int().min(0).max(1_000_000),
  goals: z.array(goalSchema).max(DEMO_LIMITS.goals + 5),
  allocations: z.array(allocationSchema).max(DEMO_LIMITS.allocations + 20),
  changes: z.array(changeSchema).max(DEMO_LIMITS.changes + 20),
  eidPlans: z.array(eidSchema).max(DEMO_LIMITS.eidPlans),
  declaredCapacityCents: cents.nullable(),
}).superRefine((s, ctx) => {
  // Cohérence des références : une donnée orpheline signale un contenu altéré
  const ids = new Set(s.goals.map((g) => g.id));
  if (ids.size !== s.goals.length) ctx.addIssue({ code: 'custom', message: 'identifiants en double' });
  if (s.allocations.some((a) => !ids.has(a.goalId)) || s.changes.some((c) => !ids.has(c.goalId))) ctx.addIssue({ code: 'custom', message: 'référence inconnue' });
  const eidGoals = new Set(s.goals.filter((g) => g.kind === 'eid_al_adha').map((g) => g.id));
  if (s.eidPlans.some((p) => !eidGoals.has(p.goal_id))) ctx.addIssue({ code: 'custom', message: 'plan Aïd orphelin' });
});

export type DemoState = z.infer<typeof demoStateSchema>;
export type DemoGoal = DemoState['goals'][number];
export type DemoAllocation = DemoState['allocations'][number];

/** Validation d'un contenu lu dans le navigateur : null s'il est illisible ou altéré. */
export function parseDemoState(raw: unknown): DemoState | null {
  const r = demoStateSchema.safeParse(raw);
  return r.success ? r.data : null;
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

function newGoal(s: DemoState, base: Omit<DemoGoal, 'id' | 'priority' | 'status' | 'realizedOn' | 'planConfirmedOn' | 'strategyMonthlyCents' | 'strategyChosenOn'>): { state: DemoState; goal: DemoGoal } {
  const goal: DemoGoal = { ...base, id: `demo-${s.seq + 1}`, priority: 3, status: 'active', realizedOn: null, planConfirmedOn: null, strategyMonthlyCents: null, strategyChosenOn: null };
  return { state: { ...s, seq: s.seq + 1, goals: [...s.goals, goal] }, goal };
}

export function opCreateGoal(s: DemoState, input: NewGoalInput, today: string): OpResult<{ id: string }> {
  if (input.initialCents > input.targetCents) return err('Vérifiez les informations saisies.', { available: 'L’épargne disponible dépasse le montant cible.' });
  const { state, goal } = newGoal(s, {
    kind: input.kind, name: input.name, targetCents: input.targetCents, targetDate: input.targetDate,
    monthlyCapacityCents: input.monthlyCapacityCents, createdOn: today,
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
