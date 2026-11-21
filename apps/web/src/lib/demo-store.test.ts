import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot.ts';
import { getDemoHousehold } from './demo.ts';
import {
  DEMO_LIMITS, initialDemoState, opAddAllocation, opChooseStrategy, opCreateEid, opCreateGoal, opSavePlan, opSetDeclaredCapacity,
  opSetLifecycle, opUpdateEidBudget, opUpdateEidDate, opUpdateGoal, parseDemoState, demoHistory, type DemoState, type OpResult,
  opAddCalendarEvent, opDecideSuggestion, opRemoveCalendarEvent, opSavePlanningPreferences,
  demoAsOf, opSetSimulationDate, SIMULATION_MAX,
} from './goals/demo-state.ts';
import { deflateRawSync } from 'node:zlib';
import { decodeDemoState, encodeDemoState, toChunks } from './goals/demo-codec.ts';
import { capacityForGoal, familyCalendar, goalJourney, planGoal, suggestGoals } from '@amanah/engines';

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
    expect(encoded.startsWith('v2.')).toBe(true);
    expect(decodeDemoState(encoded)).toEqual({ state: s, status: 'ok' });
    // Format v1 (version précédente) : mis à niveau à la lecture, projets conservés, préférences de départ
    const { planning: _p, ...rest } = s;
    const v1 = { ...rest, v: 1, goals: s.goals.map(({ templateId: _t, occurrence: _o, previousGoalId: _g, ...g }) => g) };
    const raw1 = 'v1.' + deflateRawSync(Buffer.from(JSON.stringify(v1))).toString('base64url');
    const up = decodeDemoState(raw1);
    expect(up.status).toBe('ok');
    expect(up.state!.goals.map((g) => g.name)).toEqual(s.goals.map((g) => g.name));
    expect(up.state!.planning.prefs.hasChildren).toBe(true);
    expect(decodeDemoState(null).status).toBe('empty');
    expect(decodeDemoState('v0.abc').status).toBe('outdated');
    expect(decodeDemoState('v1.!!pas-du-deflate!!').status).toBe('corrupted');
    expect(decodeDemoState('nimporte quoi').status).toBe('corrupted');
    // JSON valide mais altéré : montant négatif, référence orpheline, version inconnue
    expect(parseDemoState({ ...s, goals: [{ ...s.goals[0]!, targetCents: -1 }] })).toBe(null);
    expect(parseDemoState({ ...s, allocations: [...s.allocations, { goalId: 'inconnu', amountCents: 1, allocatedOn: today, source: 'manual' }] })).toBe(null);
    expect(parseDemoState({ ...s, v: 3 })).toBe(null);
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

  it('suggestions en démonstration : préférences, décisions et calendrier conservés, création depuis un modèle sans doublon', () => {
    let s = initialDemoState();
    const suggest = (st: DemoState) => {
      const h = getDemoHousehold(st);
      const snap = buildSnapshot(h);
      const calendar = familyCalendar({ asOf: h.asOf, prefs: st.planning.prefs, religiousEnabled: true, customEvents: st.planning.events, goalDeadlines: [], eidDates: [], annualExpenses: [] });
      return suggestGoals({
        asOf: h.asOf, prefs: st.planning.prefs, religiousEnabled: true, calendar, decisions: st.planning.decisions,
        goals: h.goals.map((g) => ({ id: g.id, kind: g.kind, templateId: g.templateId, occurrence: g.occurrence, lifecycle: g.lifecycle })),
        eidYears: st.eidPlans.map((p) => p.civil_year), availableCapacityCents: capacityForGoal(snap.savingsPlan, '__n__').availableCents,
      });
    };
    const statusOf = (st: DemoState, id: string) => suggest(st).find((x) => x.id === id)?.status;
    expect(statusOf(s, 'rentree-scolaire:2027')).toBe('new');
    expect(statusOf(s, 'aid-al-adha:2027')).toBe('accepted'); // l'Aïd fictif 2027 existe déjà
    // Création depuis la suggestion : montant choisi par la personne, la suggestion devient « acceptée »
    s = must(opCreateGoal(s, { kind: 'children_education', name: 'Rentrée scolaire 2027', targetCents: 45_000, targetDate: '2027-08-30', monthlyCapacityCents: 5_000, initialCents: 0, templateId: 'rentree-scolaire', occurrence: 2027 }, today)).state;
    expect(statusOf(s, 'rentree-scolaire:2027')).toBe('accepted');
    expect(buildSnapshot(getDemoHousehold(s)).goals.some((g) => g.goal.name === 'Rentrée scolaire 2027')).toBe(true);
    // Reporter, ne plus proposer, rétablir
    s = must(opDecideSuggestion(s, 'ramadan:2027', 'snooze', today)).state;
    expect(statusOf(s, 'ramadan:2027')).toBe('snoozed');
    expect(s.planning.decisions.find((d) => d.id === 'ramadan:2027')!.until).toBe('2026-12-09');
    s = must(opDecideSuggestion(s, 'vacances-familiales:2027', 'dismiss', today)).state;
    expect(statusOf(s, 'vacances-familiales:2027')).toBe('dismissed');
    s = must(opDecideSuggestion(s, 'vacances-familiales', 'restore', today)).state;
    expect(statusOf(s, 'vacances-familiales:2027')).toBe('new');
    expect(opDecideSuggestion(s, 'inconnu:2027', 'dismiss', today).ok).toBe(false);
    // Préférences respectées : sans enfant déclaré, plus de rentrée
    s = must(opSavePlanningPreferences(s, { ...s.planning.prefs, hasChildren: false })).state;
    expect(statusOf(s, 'rentree-scolaire:2027')).toBe(undefined);
    // Calendrier : échéance personnalisée ajoutée puis retirée
    s = must(opAddCalendarEvent(s, { label: 'Taxe annuelle fictive', date: '2027-06-15', yearly: true })).state;
    const evt = s.planning.events.at(-1)!;
    expect(parseDemoState(s)).toEqual(s);
    s = must(opRemoveCalendarEvent(s, evt.id)).state;
    expect(s.planning.events.some((e) => e.id === evt.id)).toBe(false);
  });

  it('projet annuel : reconduction après réalisation, une seule fois, budget modifiable, aucune affectation reprise', () => {
    let s = must(opCreateGoal(initialDemoState(), { kind: 'personal', name: 'Vacances familiales 2026', targetCents: 120_000, targetDate: '2026-12-20', monthlyCapacityCents: 10_000, initialCents: 30_000, templateId: 'vacances-familiales', occurrence: 2026 }, today)).state;
    const prev = s.goals.at(-1)!.id;
    const renewal = { kind: 'personal' as const, name: 'Vacances familiales 2027', targetCents: 150_000, targetDate: '2027-07-03', monthlyCapacityCents: 12_000, initialCents: 0, templateId: 'vacances-familiales', occurrence: 2027, previousGoalId: prev };
    expect(opCreateGoal(s, renewal, today).ok).toBe(false); // pas encore réalisé
    s = must(opSetLifecycle(s, prev, 'achieve', today, today)).state;
    expect(opCreateGoal(s, { ...renewal, occurrence: 2028 }, today).ok).toBe(false); // mauvaise année
    expect(opCreateGoal(s, { ...renewal, templateId: 'rentree-scolaire' }, today).ok).toBe(false); // autre modèle
    const r = must(opCreateGoal(s, renewal, today)); s = r.state;
    expect(s.goals.find((g) => g.id === r.value.id)).toMatchObject({ targetCents: 150_000, occurrence: 2027, previousGoalId: prev });
    expect(s.allocations.some((a) => a.goalId === r.value.id)).toBe(false);
    expect(opCreateGoal(s, renewal, today).ok).toBe(false); // une seule fois
    // Modèles du chantier distinct : refusés
    expect(opCreateGoal(s, { ...renewal, previousGoalId: null, templateId: 'retraite', occurrence: null }, today).ok).toBe(false);
  });

  it('date de référence simulée : échéances, suggestions et données fictives recalculées, projets inchangés', () => {
    const base = initialDemoState();
    expect(demoAsOf(base)).toBe(today);
    expect(opSetSimulationDate(base, '2026-10-01').ok).toBe(false); // avant la date de départ
    expect(opSetSimulationDate(base, '2029-01-01').ok).toBe(false); // au-delà de 24 mois
    expect(SIMULATION_MAX).toBe('2028-11-09');
    const at = (d: string) => {
      const st = must(opSetSimulationDate(base, d)).state;
      const h = getDemoHousehold(st);
      const calendar = familyCalendar({ asOf: h.asOf, prefs: st.planning.prefs, religiousEnabled: true, customEvents: st.planning.events, goalDeadlines: [], eidDates: [], annualExpenses: [] });
      const sug = suggestGoals({
        asOf: h.asOf, prefs: st.planning.prefs, religiousEnabled: true, calendar, decisions: [], goals: [], eidYears: [],
        availableCapacityCents: capacityForGoal(buildSnapshot(h).savingsPlan, '__n__').availableCents,
      });
      return { st, h, calendar, sug, snap: buildSnapshot(h) };
    };
    // Janvier : Ramadan 2027 proche ; juillet : rentrée ; automne : projets de l'année suivante
    const jan = at('2027-01-15');
    expect(jan.h.asOf).toBe('2027-01-15');
    expect(jan.sug.find((x) => x.id === 'ramadan:2027')?.status).toBe('new');
    expect(jan.calendar[0]!.date >= '2027-01-15').toBe(true);
    const jul = at('2027-07-15');
    expect(jul.sug.find((x) => x.id === 'rentree-scolaire:2027')?.status).toBe('new');
    expect(jul.sug.some((x) => x.id === 'ramadan:2027')).toBe(false); // passé
    expect(jul.calendar.every((e) => e.date >= '2027-07-15')).toBe(true);
    const oct = at('2027-10-15');
    expect(oct.calendar.some((e) => e.type === 'ramadan' && e.date.startsWith('2028'))).toBe(true);
    // Données bancaires fictives décalées : aucune opération postérieure, mois courant = mois simulé
    for (const r of [jan, jul, oct]) {
      expect(r.h.transactions.every((t) => t.bookedOn <= r.h.asOf)).toBe(true);
      expect(r.h.transactions.some((t) => t.bookedOn.slice(0, 7) === r.h.asOf.slice(0, 7))).toBe(true);
      expect(r.snap.month.month).toBe(r.h.asOf.slice(0, 7));
    }
    // Projets inchangés ; une affectation datée après la date simulée est ignorée
    expect(jul.h.goals.map((g) => g.targetDate)).toEqual(getDemoHousehold(base).goals.map((g) => g.targetDate));
    let later = must(opAddAllocation(jul.st, 'goal-hajj', 10_000, '2027-07-15')).state;
    later = must(opSetSimulationDate(later, null)).state;
    expect(demoAsOf(later)).toBe(today);
    expect(getDemoHousehold(later).allocations.some((a) => a.allocatedOn === '2027-07-15')).toBe(false);
    expect(parseDemoState(jul.st)).toEqual(jul.st);
  });

  it('calendrier de démonstration : événements personnels, partagés, religieux toujours privés ; état antérieur relu', () => {
    let s = must(opAddCalendarEvent(initialDemoState(), { label: 'Veillée fictive', date: '2027-03-05', yearly: false, visibility: 'household', religious: true })).state;
    expect(s.planning.events.at(-1)).toMatchObject({ visibility: 'private', religious: true });
    s = must(opAddCalendarEvent(s, { label: 'Anniversaire fictif', date: '2027-03-06', yearly: true, visibility: 'household' })).state;
    expect(s.planning.events.at(-1)).toMatchObject({ visibility: 'household', religious: false });
    s = must(opAddCalendarEvent(s, { label: 'Rendez-vous fictif', date: '2027-03-07', yearly: false })).state;
    expect(s.planning.events.at(-1)).toMatchObject({ visibility: 'private', religious: false });
    // Un état v2 antérieur (sans visibilité, corrections scolaires ni date simulée) reste lisible
    const old = JSON.parse(JSON.stringify(initialDemoState()));
    old.planning.events = [{ id: 'evt-x', label: 'Ancien', date: '2027-01-01', yearly: false }];
    delete old.planning.simulationDate; delete old.planning.prefs.schoolOverrides;
    const parsed = parseDemoState(old)!;
    expect(parsed.planning.events[0]).toMatchObject({ visibility: 'private', religious: false });
    expect(parsed.planning.simulationDate).toBe(null);
    expect(parsed.planning.prefs.schoolOverrides).toEqual([]);
    // Un événement religieux partagé (contenu altéré) est refusé
    old.planning.events = [{ id: 'evt-y', label: 'Altéré', date: '2027-01-01', yearly: false, visibility: 'household', religious: true }];
    expect(parseDemoState(old)).toBe(null);
  });
});
