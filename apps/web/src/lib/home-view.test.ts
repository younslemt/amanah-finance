import { describe, expect, it } from 'vitest';
import { capacityForGoal, familyCalendar, isReligiousGoal, suggestGoals } from '@amanah/engines';
import { buildSnapshot } from './snapshot.ts';
import { getDemoHousehold } from './demo.ts';
import { initialDemoState, opSetSimulationDate } from './goals/demo-state.ts';
import { DEMO_CALCS, DEMO_CONTRIBUTIONS, DEMO_USER } from './demo-donations.ts';
import { buildHomeView, HOME_LIMITS, recommendationGoalId, type HomeViewInput } from './home-view.ts';
import type { Recommendation } from '@amanah/engines';

/** Entrées de l'accueil à partir des données fictives et des moteurs (même chaîne que l'application). */
function inputs(opts: { religious: boolean; layout?: unknown; date?: string; records?: boolean }): HomeViewInput {
  let st = initialDemoState();
  if (opts.date) { const r = opSetSimulationDate(st, opts.date); if (!r.ok) throw new Error(r.error); st = r.state; }
  const data = getDemoHousehold(st);
  const s = buildSnapshot(data);
  const calendar = familyCalendar({
    asOf: s.asOf, prefs: st.planning.prefs, religiousEnabled: opts.religious, customEvents: st.planning.events,
    goalDeadlines: data.goals.filter((g) => (g.lifecycle ?? 'active') === 'active' && g.kind !== 'eid_al_adha')
      .map((g) => ({ goalId: g.id, name: g.name, date: g.targetDate, religious: isReligiousGoal(g.kind) })),
    eidDates: [], annualExpenses: [],
  });
  const suggestions = suggestGoals({
    asOf: s.asOf, prefs: st.planning.prefs, religiousEnabled: opts.religious, calendar, decisions: st.planning.decisions,
    goals: data.goals.map((g) => ({ id: g.id, kind: g.kind, templateId: g.templateId, occurrence: g.occurrence, lifecycle: g.lifecycle })),
    eidYears: [], availableCapacityCents: capacityForGoal(s.savingsPlan, '__nouveau__').availableCents,
  });
  return {
    religiousEnabled: opts.religious, layoutPreference: opts.layout, snapshot: s, data, calendar, suggestions,
    zakatRecords: opts.religious && opts.records !== false ? { userId: DEMO_USER, calculations: DEMO_CALCS, contributions: DEMO_CONTRIBUTIONS } : null,
  };
}

describe('accueil Islamic-first : modèle de vue', () => {
  it('avec consentement : six blocs, engagements en 2e position, données issues des moteurs', () => {
    const inp = inputs({ religious: true });
    const v = buildHomeView(inp);
    expect(v.presentation.blocks.map((b) => b.id)).toEqual(['situation', 'commitments', 'projects', 'calendar', 'wealth', 'next_actions']);
    expect(v.situation.balanceCents).toBe(inp.snapshot.totalBalanceCents);
    expect(v.situation.netWorthCents).toBe(inp.snapshot.wealth.netWorthCents);
    expect(v.commitments).not.toBe(null);
    // Zakat : dernier calcul enregistré (480 €) et contribution rapprochée (250 €) — calcul fictif de démonstration
    const z = v.commitments!.zakat;
    expect(z.basis).toBe('saved');
    expect(z.view.lines.find((l) => l.kind === 'estimated')!.cents).toBe(48_000);
    expect(z.view.lines.find((l) => l.kind === 'declared')!.cents).toBe(25_000);
    expect(z.view.lines.find((l) => l.kind === 'bank_matched')!.cents).toBe(25_000);
    expect(z.view.remainingCents).toBe(23_000);
    expect(z.view.remainingLabel).toBe('Montant restant selon vos déclarations');
    // Aucune provision n'existe dans les moteurs : rien n'est inventé
    expect(z.view.lines.find((l) => l.kind === 'provision')!.cents).toBe(null);
  });

  it('épargne : excédent observé, capacité retenue et part non affectée viennent de leurs moteurs, sans calcul ajouté', () => {
    const inp = inputs({ religious: true });
    const v = buildHomeView(inp);
    const cap = capacityForGoal(inp.snapshot.savingsPlan, '__accueil__');
    expect(v.situation.capacity).toEqual({ retainedCents: cap.capacityCents, availableCents: cap.availableCents, source: cap.capacitySource });
    expect(v.situation.observedSurplus).toEqual({
      cents: inp.snapshot.analysis.capacity.observedCents, months: inp.snapshot.analysis.monthsWithData, sufficient: true,
    });
    // Trois montants de natures différentes : la part non affectée est incluse dans la capacité retenue
    expect(v.situation.capacity.availableCents!).toBeLessThanOrEqual(v.situation.capacity.retainedCents!);
    expect(v.situation.capacity.availableCents).not.toBe(v.situation.balanceCents);
  });

  it('projets : synthèse limitée, progression, objectif et prochaine étape du Journey', () => {
    const inp = inputs({ religious: true });
    const v = buildHomeView(inp);
    expect(v.projects.items.length).toBeLessThanOrEqual(HOME_LIMITS.projects);
    expect(v.projects.activeCount).toBeGreaterThanOrEqual(v.projects.items.length);
    for (const p of v.projects.items) {
      const src = inp.snapshot.goals.find((g) => g.goal.id === p.id)!;
      expect(p.targetCents).toBe(src.goal.targetCents);
      expect(p.progressPercent).toBe(Math.round(src.plan.progressPermille / 10));
      expect(p.next === null || typeof p.next.action === 'string').toBe(true);
    }
  });

  it('prochaines actions : trois au plus, destinations réelles', () => {
    const v = buildHomeView(inputs({ religious: true }));
    expect(v.actions.length).toBeGreaterThan(0);
    expect(v.actions.length).toBeLessThanOrEqual(3);
    for (const a of v.actions) expect(a.href.startsWith('/')).toBe(true);
  });

  it('affichage analytique : mêmes données, seul l’ordre change', () => {
    const a = buildHomeView(inputs({ religious: true }));
    const b = buildHomeView(inputs({ religious: true, layout: 'classic' }));
    expect(b.presentation.blocks.map((x) => x.id)).toEqual(['situation', 'next_actions', 'projects', 'wealth', 'calendar', 'commitments']);
    const { presentation: _p1, ...ra } = a; const { presentation: _p2, ...rb } = b;
    expect(rb).toEqual(ra);
  });

  it('sans consentement : aucune donnée religieuse personnalisée, quelle que soit la préférence', () => {
    for (const layout of ['islamic_first', 'classic']) {
      const inp = inputs({ religious: false, layout });
      const v = buildHomeView({ ...inp, zakatRecords: { userId: DEMO_USER, calculations: DEMO_CALCS, contributions: DEMO_CONTRIBUTIONS } }); // même si des données arrivaient
      expect(v.commitments).toBe(null);
      expect(v.presentation.blocks.find((b) => b.id === 'commitments')).toMatchObject({ title: 'Finance islamique', variant: 'pedagogic' });
      expect(v.projects.items.every((p) => !p.religious)).toBe(true);
      expect(v.calendar.every((e) => !e.religious)).toBe(true);
      expect(v.suggestions.every((x) => x.group !== 'religious')).toBe(true);
      expect(v.actions.every((a) => !a.religious)).toBe(true);
      expect(v.wealth.toReview).toEqual([]);
      expect(v.wealth.investmentsWithoutScreening).toBe(false);
      // Aucun nom de projet religieux ni terme religieux dans tout le modèle sérialisé
      const json = JSON.stringify(v);
      for (const g of inp.snapshot.goals.filter((x) => isReligiousGoal(x.goal.kind))) {
        expect(json.includes(g.goal.name)).toBe(false);
        expect(json.includes(g.goal.id)).toBe(false);
      }
      for (const word of ['Zakat', 'zakat', 'purification', 'Hajj', 'Omra', 'Ramadan', 'Aïd']) expect(json.includes(word)).toBe(false);
    }
  });

  it('Zakat sans calcul enregistré : calcul courant ; incomplet jamais présenté comme établi', () => {
    const inp = inputs({ religious: true, records: false });
    const v = buildHomeView(inp);
    const z = v.commitments!.zakat;
    expect(z.basis).toBe('live');
    expect(z.view.lines.find((l) => l.kind === 'declared')!.cents).toBe(0);
    if (!inp.snapshot.zakat.result || inp.snapshot.zakat.result.status === 'to_determine') {
      expect(z.view.complete).toBe(false);
      expect(z.view.remainingCents).toBe(null);
    } else {
      expect(z.view.remainingCents).toBe(inp.snapshot.zakat.result.dueCents);
    }
    // Calcul courant forcé à « incomplet »
    const incomplete = buildHomeView({ ...inp, snapshot: { ...inp.snapshot, zakat: { ...inp.snapshot.zakat, result: null } } });
    expect(incomplete.commitments!.zakat.view).toMatchObject({ complete: false, incompleteReason: 'missing_choices', remainingCents: null });
    expect(incomplete.actions.some((a) => a.kind === 'zakat')).toBe(true);
  });

  it('suggestions et calendrier suivent la date de référence (janvier : Ramadan proche)', () => {
    const v = buildHomeView(inputs({ religious: true, date: '2027-01-15' }));
    expect(v.asOf).toBe('2027-01-15');
    expect(v.calendar.every((e) => e.date >= '2027-01-15')).toBe(true);
    expect(v.calendar.length).toBeLessThanOrEqual(HOME_LIMITS.calendar);
    expect(v.suggestions.length).toBeLessThanOrEqual(HOME_LIMITS.suggestions);
  });

  it('patrimoine : répartition des données disponibles, aucun score de conformité', () => {
    const v = buildHomeView(inputs({ religious: true }));
    const sum = v.wealth.groups.reduce((t, g) => t + g.cents, 0);
    expect(sum).toBe(v.wealth.totalAssetsCents);
    expect(Object.keys(v.wealth)).not.toContain('score');
    expect(JSON.stringify(v.wealth).toLowerCase()).not.toMatch(/conforme|score|halal|certifi/);
  });

  it('R7 : une recommandation sur un projet religieux n’est jamais divulguée sans consentement', () => {
    const inp = inputs({ religious: false });
    const religiousGoal = inp.snapshot.goals.find((g) => isReligiousGoal(g.goal.kind))!.goal;
    const plainGoal = inp.snapshot.goals.find((g) => !isReligiousGoal(g.goal.kind))!.goal;
    const r7 = (goalId: string, name: string, severity: Recommendation['severity']): Recommendation => ({
      ruleId: 'R7', fingerprint: `R7:${goalId}:test`, severity, subject: goalId, rank: 0,
      finding: { code: 'goal_late', params: { goalName: name } }, data: [], proposal: { code: 'catch_up_goal', params: {} }, impact: null,
      action: { code: 'catch_up_goal', href: `/goals/${goalId}#scenarios` },
    });
    const injected = [
      r7(religiousGoal.id, religiousGoal.name, 'critical'),          // projet religieux connu
      r7('goal-inconnu-hors-accueil', 'Projet masqué', 'critical'),   // projet absent de l'accueil : classification impossible
      r7(plainGoal.id, plainGoal.name, 'critical'),                    // projet non religieux : conservé
    ];
    const v = buildHomeView({ ...inp, snapshot: { ...inp.snapshot, recommendations: injected } });
    const json = JSON.stringify(v);
    for (const leak of [religiousGoal.name, religiousGoal.id, `/goals/${religiousGoal.id}`, 'goal-inconnu-hors-accueil', 'Projet masqué']) {
      expect(json.includes(leak), leak).toBe(false);
    }
    const kept = v.actions.filter((a) => a.kind === 'recommendation');
    expect(kept.map((a) => a.href)).toEqual([`/goals/${plainGoal.id}#scenarios`]);
    expect(kept[0]!.religious).toBe(false);
    // Avec consentement : la même recommandation religieuse est présente et classée religieuse
    const withConsent = buildHomeView({ ...inputs({ religious: true }), snapshot: { ...inp.snapshot, recommendations: [injected[0]!] } });
    expect(withConsent.actions.find((a) => a.kind === 'recommendation')).toMatchObject({ href: `/goals/${religiousGoal.id}#scenarios`, religious: true });
  });

  it('projet visé par une recommandation : sujet de R7 ou lien vers une fiche, jamais le nom', () => {
    expect(recommendationGoalId('R7', 'goal-a', '/goals/goal-a#x')).toBe('goal-a');
    expect(recommendationGoalId('R2', null, '/goals/goal-b?x=1')).toBe('goal-b');
    expect(recommendationGoalId('R2', null, '/goals')).toBe(null);
    expect(recommendationGoalId('R2', null, '/goals/nouveau?modele=x')).toBe(null);
    expect(recommendationGoalId('R4', 'restaurants', '/budget/optimiser')).toBe(null);
  });
});
