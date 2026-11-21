import 'server-only';
import { cache } from 'react';
import { capacityForGoal, familyCalendar, isReligiousGoal, suggestGoals } from '@amanah/engines';
import { getHouseholdData, getSnapshot } from './data.ts';
import { readGoalRepository } from './goals/index.ts';

/**
 * Données communes des suggestions et du calendrier familial (projets, accueil, calendrier,
 * préférences) : une seule source, les mêmes moteurs, quel que soit le stockage.
 */
export const loadPlanning = cache(async () => {
  const [s, data, repo] = await Promise.all([getSnapshot(), getHouseholdData(), readGoalRepository()]);
  const [planning, eidPlans] = await Promise.all([repo.planning(), repo.religiousEnabled ? repo.eidPlans() : Promise.resolve([])]);
  const religiousEnabled = repo.religiousEnabled;
  const goalById = new Map(data.goals.map((g) => [g.id, g]));
  const calendar = familyCalendar({
    asOf: s.asOf, prefs: planning.prefs, religiousEnabled, customEvents: planning.events,
    goalDeadlines: data.goals.filter((g) => (g.lifecycle ?? 'active') === 'active' && g.kind !== 'eid_al_adha')
      .map((g) => ({ goalId: g.id, name: g.name, date: g.targetDate, religious: isReligiousGoal(g.kind) })),
    eidDates: eidPlans.flatMap((p) => { const g = goalById.get(p.goal_id); return g ? [{ civilYear: p.civil_year, date: g.targetDate, confirmed: p.date_status === 'confirmed', goalId: g.id }] : []; }),
    annualExpenses: s.analysis.recurring.filter((r) => r.cadence === 'yearly' && r.direction === 'debit' && r.active)
      .map((r) => ({ key: r.key, label: `Dépense annuelle : ${r.label}`, nextDate: r.nextExpectedDate, categorySlug: r.categorySlug })),
  });
  const suggestions = suggestGoals({
    asOf: s.asOf, prefs: planning.prefs, religiousEnabled, calendar,
    goals: data.goals.map((g) => ({ id: g.id, kind: g.kind, templateId: g.templateId, occurrence: g.occurrence, lifecycle: g.lifecycle })),
    eidYears: eidPlans.map((p) => p.civil_year), decisions: planning.decisions,
    availableCapacityCents: capacityForGoal(s.savingsPlan, '__nouveau__').availableCents,
  });
  return { s, data, repo, planning, calendar, suggestions, religiousEnabled };
});
