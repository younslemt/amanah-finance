import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot.ts';
import { getDemoHousehold } from './demo.ts';
import {
  DEMO_LIMITS, initialDemoState, opAddAllocation, opChooseStrategy, opCreateEid, opCreateGoal, opSavePlan, opSetDeclaredCapacity,
  opSetLifecycle, opUpdateEidBudget, opUpdateEidDate, opUpdateGoal, parseDemoState, demoHistory, type DemoState, type OpResult,
} from './goals/demo-state.ts';
import { decodeDemoState, encodeDemoState, toChunks } from './goals/demo-codec.ts';
import { goalJourney, planGoal } from '@amanah/engines';

const today = '2026-11-09'; // date fictive des données de démonstration
const must = <T,>(r: OpResult<T>): { state: DemoState; value: T } => { if (!r.ok) throw new Error(r.error); return r; };
const travel = { kind: 'personal' as const, name: 'Voyage', targetCents: 300_000, targetDate: '2028-06-01', monthlyCapacityCents: 10_000, initialCents: 50_000 };

describe('démonstration interactive : projets sans base de données', () => {
  it('création de plusieurs projets, y compris de même catégorie, visibles sur tous les écrans', () => {
    let s = initialDemoState();
    const before = s.goals.length;
    const a = must(opCreateGoal(s, travel, today)); s = a.state;
    const b = must(opCreateGoal(s, { ...travel, name: 'Mariage', targetCents: 800_000, initialCents: 0 }, today)); s = b.state;
    const c = must(opCreateGoal(s, { ...travel, kind: 'real_estate', name: 'Achat immobilier', targetCents: 4_000_000, monthlyCapacityCents: 30_000, initialCents: 0 }, today)); s = c.state;
    expect(s.goals).toHaveLength(before + 3);
    expect(new Set([a.value.id, b.value.id, c.value.id]).size).toBe(3);
    // Même état pour le tableau de bord, le plan d'épargne et les recommandations
    const snap = buildSnapshot(getDemoHousehold(s));
    for (const n of ['Voyage', 'Mariage', 'Achat immobilier']) expect(snap.goals.map((g) => g.goal.name)).toContain(n);
    for (const id of [a.value.id, b.value.id, c.value.id]) expect(snap.savingsPlan.lines.map((l) => l.goalId)).toContain(id);
    expect(snap.goals.find((g) => g.goal.id === a.value.id)!.plan.savedCents).toBe(50_000);
  });

  it('épargne initiale : marquée « initial », ne vaut pas « Suivre » ; une mise de côté, si', () => {
    let s = must(opCreateGoal(initialDemoState(), travel, today)).state;
    const id = s.goals.at(-1)!.id;
    const goal = () => getDemoHousehold(s).goals.find((g) => g.id === id)!;
    const journey = () => { const h = getDemoHousehold(s); return goalJourney(goal(), planGoal(goal(), h.allocations, h.asOf), h.allocations); };
    expect(journey().done).toMatchObject({ create: true, plan: false, simulate: false, follow: false });
    s = must(opUpdateGoal(s, id, { name: 'Voyage au Japon', targetCents: 320_000, targetDate: '2028-06-01', monthlyCapacityCents: 12_000, priority: 2 }, today, true)).state;
    s = must(opChooseStrategy(s, id, 15_000, today)).state;
    s = must(opAddAllocation(s, id, 15_000, today)).state;
    expect(journey().done).toEqual({ create: true, plan: true, simulate: true, follow: true, realize: false });
    expect(goal()).toMatchObject({ name: 'Voyage au Japon', monthlyCapacityCents: 15_000, priority: 2, strategy: { monthlyCents: 15_000, chosenOn: today } });
  });

  it('modification sans perte d’historique ; retrait borné ; réalisation, pause, archive', () => {
    let s = must(opCreateGoal(initialDemoState(), travel, today)).state;
    const id = s.goals.at(-1)!.id;
    s = must(opUpdateGoal(s, id, { name: 'Voyage', targetCents: 350_000, targetDate: '2028-06-01', monthlyCapacityCents: 10_000, priority: 3 }, today, false)).state;
    expect(s.allocations.filter((a) => a.goalId === id).reduce((t, a) => t + a.amountCents, 0)).toBe(50_000);
    expect(demoHistory(s, id)[0]!.changes).toEqual({ target_cents: { from: 300_000, to: 350_000 } });
    expect(opAddAllocation(s, id, -60_000, today).ok).toBe(false); // plus que l'épargne du projet
    s = must(opAddAllocation(s, id, -20_000, today)).state;
    expect(opSetLifecycle(s, id, 'achieve', '2027-01-01', today).ok).toBe(false); // date future
    s = must(opSetLifecycle(s, id, 'pause', null, today)).state;
    expect(opAddAllocation(s, id, 1_000, today).ok).toBe(false); // en pause : rien à affecter
    expect(buildSnapshot(getDemoHousehold(s)).savingsPlan.lines.some((l) => l.goalId === id)).toBe(false);
    s = must(opSetLifecycle(s, id, 'resume', null, today)).state;
    s = must(opSetLifecycle(s, id, 'achieve', today, today)).state;
    s = must(opSetLifecycle(s, id, 'reopen', null, today)).state;
    s = must(opSetLifecycle(s, id, 'archive', null, today)).state;
    expect(demoHistory(s, id).map((c) => Object.keys(c.changes).sort().join(','))).toContain('realized_on,status');
    expect(demoHistory(s, id).length).toBe(6); // rien n'est effacé
  });

  it('plan d’épargne : priorités modifiées, capacité jamais affectée deux fois', () => {
    let s = initialDemoState();
    s = must(opSetDeclaredCapacity(s, 30_000)).state;
    s = must(opCreateGoal(s, { ...travel, monthlyCapacityCents: 20_000 }, today)).state;
    const a = s.goals.at(-1)!.id;
    s = must(opCreateGoal(s, { ...travel, name: 'Véhicule', monthlyCapacityCents: 20_000, initialCents: 0 }, today)).state;
    const b = s.goals.at(-1)!.id;
    s = must(opSavePlan(s, [{ goalId: a, monthlyCents: 20_000, priority: 2 }, { goalId: b, monthlyCents: 20_000, priority: 1 }], today)).state;
    const plan = buildSnapshot(getDemoHousehold(s)).savingsPlan;
    expect(plan.capacityCents).toBe(30_000);
    expect(plan.lines.reduce((t, l) => t + l.fundedCents, 0)).toBeLessThanOrEqual(30_000);
    expect(plan.lines.find((l) => l.goalId === b)!.fundedCents).toBe(20_000); // priorité 1 servie d'abord
    expect(plan.lines.find((l) => l.goalId === a)!.fundedCents).toBe(10_000);
    expect(plan.overcommittedCents).toBeGreaterThan(0);
  });

  it('Aïd : une année civile par projet, date confirmée avec source, reconduction unique après réalisation', () => {
    let s = initialDemoState(); // contient l'Aïd 2027 fictif (« goal-aid »)
    const eid = { name: 'Aïd 2027 bis', civilYear: 2027, sacrificeCents: 30_000, extraCostsCents: 6_000, organizationCents: 0, familyContributionCents: 0,
      targetDate: '2027-05-17', dateStatus: 'entered' as const, dateSource: null, estimatedDate: '2027-05-17', monthlyCapacityCents: 5_000, initialCents: 0, previousGoalId: null };
    expect(opCreateEid(s, eid, today).ok).toBe(false); // 2027 existe déjà
    const renewal = { ...eid, name: 'Aïd 2028', civilYear: 2028, targetDate: '2028-05-05', estimatedDate: '2028-05-05', previousGoalId: 'goal-aid' };
    expect(opCreateEid(s, renewal, today).ok).toBe(false); // l'Aïd 2027 n'est pas réalisé
    expect(opUpdateEidDate(s, 'goal-aid', '2027-05-16', 'confirmed', null, today).ok).toBe(false); // confirmée sans source
    expect(opUpdateEidDate(s, 'goal-aid', '2028-05-16', 'entered', null, today).ok).toBe(false); // hors année civile
    s = must(opUpdateEidDate(s, 'goal-aid', '2027-05-16', 'confirmed', 'Annonce fictive', today)).state;
    s = must(opUpdateEidBudget(s, 'goal-aid', { sacrificeCents: 36_000, extraCostsCents: 8_000, organizationCents: 0, familyContributionCents: 10_000 }, today)).state;
    expect(s.goals.find((g) => g.id === 'goal-aid')!.targetCents).toBe(34_000); // montant recalculé, affectations conservées
    s = must(opSetLifecycle(s, 'goal-aid', 'achieve', today, today)).state;
    const r = must(opCreateEid(s, renewal, today)); s = r.state;
    expect(s.allocations.some((a) => a.goalId === r.value.id)).toBe(false); // aucun montant repris
    expect(opCreateEid(s, { ...renewal, civilYear: 2029, targetDate: '2029-04-24' }, today).ok).toBe(false); // reconduit une seule fois
    expect(demoHistory(s, 'goal-aid').some((c) => 'date_status' in c.changes)).toBe(true);
  });

  it('stockage : versionné, compressé, validé ; contenu altéré ou trop volumineux refusé', () => {
    const s = must(opCreateGoal(initialDemoState(), travel, today)).state;
    const encoded = encodeDemoState(s);
    expect(encoded.startsWith('v1.')).toBe(true);
    expect(decodeDemoState(encoded)).toEqual({ state: s, status: 'ok' });
    expect(decodeDemoState(null).status).toBe('empty');
    expect(decodeDemoState('v0.abc').status).toBe('outdated');
    expect(decodeDemoState('v1.!!pas-du-deflate!!').status).toBe('corrupted');
    expect(decodeDemoState('nimporte quoi').status).toBe('corrupted');
    // JSON valide mais altéré : montant négatif, référence orpheline, version inconnue
    expect(parseDemoState({ ...s, goals: [{ ...s.goals[0]!, targetCents: -1 }] })).toBe(null);
    expect(parseDemoState({ ...s, allocations: [...s.allocations, { goalId: 'inconnu', amountCents: 1, allocatedOn: today, source: 'manual' }] })).toBe(null);
    expect(parseDemoState({ ...s, v: 2 })).toBe(null);
    expect(parseDemoState({ ...s, goals: [{ ...s.goals[0]!, name: '<script>'.repeat(30) }] })).toBe(null);
    // Taille : un état réaliste tient dans les cookies ; au-delà des limites, l'opération est refusée
    let big = initialDemoState();
    const toAdd = DEMO_LIMITS.goals - big.goals.length;
    for (let i = 0; i < toAdd; i++) {
      big = must(opCreateGoal(big, { ...travel, name: `Projet fictif ${i}` }, today)).state;
      big = must(opAddAllocation(big, big.goals.at(-1)!.id, 1_000, today)).state;
    }
    expect(big.goals).toHaveLength(DEMO_LIMITS.goals);
    expect(toChunks(encodeDemoState(big))).not.toBe(null);
    expect(opCreateGoal(big, travel, today).ok).toBe(false);
  });

  it('point de départ : les données fictives existantes', () => {
    const s = initialDemoState();
    expect(s.goals.map((g) => g.id)).toEqual(['goal-hajj', 'goal-omra', 'goal-etudes', 'goal-aid']);
    expect(s.declaredCapacityCents).toBe(50_000);
    expect(parseDemoState(s)).toEqual(s);
  });
});
