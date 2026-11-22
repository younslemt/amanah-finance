import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { MAX_CHUNKS, decodeDemoState, encodeDemoState, toChunks } from './demo-codec.ts';
import {
  demoHistory, initialDemoState, opAddAllocation, opChooseStrategy, opCreateEid, opCreateGoal, opSavePlan, opSetDeclaredCapacity,
  opSetLifecycle, opUpdateEidBudget, opUpdateEidDate, opUpdateGoal, toEngineGoal, type DemoState, type OpResult,
  opAddCalendarEvent, opDecideSuggestion, opRemoveCalendarEvent, opSavePlanningPreferences, opSetHomeLayout, opSetSimulationDate,
} from './demo-state.ts';
import { fail, ok, type GoalRepository, type RepoResult } from './repository.ts';

/**
 * Dépôt de démonstration : l'état fictif vit dans le navigateur de la personne (cookie
 * compressé, validé, versionné), jamais dans une base ni sur le serveur. Chaque écran le
 * relit à chaque requête : projets, plan d'épargne, tableau de bord et recommandations
 * partagent donc exactement le même état, sans écart d'affichage ni d'hydratation.
 */
const NAME = 'amanah_demo';
const MAX_AGE = 60 * 60 * 24 * 30;
export type DemoStorageStatus = 'initial' | 'saved' | 'corrupted' | 'outdated';

/** État courant (lu une fois par requête). Contenu illisible : données de départ, signalé à l'écran. */
export const readDemoState = cache(async (): Promise<{ state: DemoState; status: DemoStorageStatus }> => {
  const jar = await cookies();
  const raw = Array.from({ length: MAX_CHUNKS }, (_, i) => jar.get(`${NAME}_${i}`)?.value ?? '').join('');
  const decoded = decodeDemoState(raw);
  if (decoded.status === 'ok') return { state: decoded.state, status: 'saved' };
  return { state: initialDemoState(), status: decoded.status === 'empty' ? 'initial' : decoded.status };
});

async function writeDemoState(s: DemoState): Promise<RepoResult> {
  const chunks = toChunks(encodeDemoState(s));
  if (!chunks) return fail('Limite de stockage de la démonstration atteinte : archivez des projets ou réinitialisez la démonstration.');
  const jar = await cookies();
  // HTTPS : cookie « Secure » ; en local (http://localhost ou adresse du réseau), non
  const secure = (await headers()).get('x-forwarded-proto') === 'https';
  for (let i = 0; i < MAX_CHUNKS; i++) {
    if (i < chunks.length) jar.set(`${NAME}_${i}`, chunks[i]!, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: MAX_AGE });
    else jar.delete(`${NAME}_${i}`);
  }
  return ok(undefined);
}

export async function resetDemoState(): Promise<void> {
  const jar = await cookies();
  for (let i = 0; i < MAX_CHUNKS; i++) jar.delete(`${NAME}_${i}`);
}

async function apply<T>(op: (s: DemoState) => OpResult<T>): Promise<RepoResult<T>> {
  const { state } = await readDemoState();
  const r = op(state);
  if (!r.ok) return fail(r.error, r.fieldErrors);
  const w = await writeDemoState(r.state);
  return w.ok ? ok(r.value) : w;
}

/** Préférence d'affichage de l'accueil (démonstration). */
export const setDemoHomeLayout = (layout: 'islamic_first' | 'classic') => apply((s) => opSetHomeLayout(s, layout));

/** Choisir la date de référence simulée de la démonstration (null : date de départ). */
export const setDemoSimulationDate = (d: string | null) => apply((s) => opSetSimulationDate(s, d));

/** asOf : date de référence de la démonstration (demoAsOf de l'état courant). */
export function demoGoalRepository(asOf: string): GoalRepository {
  const today = () => asOf;
  return {
    mode: 'demo',
    religiousEnabled: true,
    today,
    listGoals: async () => (await readDemoState()).state.goals.map(toEngineGoal),
    getGoal: async (id) => { const g = (await readDemoState()).state.goals.find((x) => x.id === id); return g ? toEngineGoal(g) : null; },
    history: async (goalId) => demoHistory((await readDemoState()).state, goalId),
    eidPlans: async () => [...(await readDemoState()).state.eidPlans].sort((a, b) => b.civil_year - a.civil_year),
    create: (input) => apply((s) => opCreateGoal(s, input, today())),
    update: (id, patch, opts) => apply((s) => opUpdateGoal(s, id, patch, today(), opts?.confirmPlan ?? false)),
    chooseStrategy: (id, m) => apply((s) => opChooseStrategy(s, id, m, today())),
    addAllocation: (goalId, amount) => apply((s) => opAddAllocation(s, goalId, amount, today())),
    savePlan: (lines) => apply((s) => opSavePlan(s, lines, today())),
    setLifecycle: (id, action, realizedOn) => apply((s) => opSetLifecycle(s, id, action, realizedOn, today())),
    setDeclaredCapacity: (c) => apply((s) => opSetDeclaredCapacity(s, c)),
    createEid: (input) => apply((s) => opCreateEid(s, input, today())),
    updateEidDate: (goalId, d, status, source) => apply((s) => opUpdateEidDate(s, goalId, d, status, source, today())),
    updateEidBudget: (goalId, b) => apply((s) => opUpdateEidBudget(s, goalId, b, today())),
    planning: async () => {
      const p = (await readDemoState()).state.planning;
      return { prefs: p.prefs, decisions: p.decisions, events: p.events.map((e) => ({ ...e, mine: true })) };
    },
    savePlanningPreferences: (prefs) => apply((s) => opSavePlanningPreferences(s, prefs)),
    decideSuggestion: (id, decision) => apply((s) => opDecideSuggestion(s, id, decision, today())),
    addCalendarEvent: (e) => apply((s) => opAddCalendarEvent(s, e)),
    removeCalendarEvent: (id) => apply((s) => opRemoveCalendarEvent(s, id)),
  };
}

