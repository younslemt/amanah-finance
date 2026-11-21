/** Données FICTIVES de démonstration : un projet « Préparer mon Aïd ». */
import type { Goal, GoalAllocation } from '@amanah/engines';
import type { EidPlanRow } from './eid-view.ts';

export const DEMO_AID_GOAL: Goal = { id: 'goal-aid', kind: 'eid_al_adha', name: 'Aïd al-Adha 2027', targetCents: 33_000, targetDate: '2027-05-17', monthlyCapacityCents: 5_000 };
export const DEMO_AID_ALLOCATIONS: GoalAllocation[] = [
  { goalId: 'goal-aid', amountCents: 5_000, allocatedOn: '2026-09-15' },
  { goalId: 'goal-aid', amountCents: 5_000, allocatedOn: '2026-10-15' },
];
export const DEMO_AID_PLAN: EidPlanRow = {
  goal_id: 'goal-aid', owner_id: 'demo-user', civil_year: 2027, sacrifice_cents: 35_000, extra_costs_cents: 8_000,
  organization_cents: 0, family_contribution_cents: 10_000, date_status: 'entered', date_source: null,
  estimated_date: '2027-05-17', previous_goal_id: null,
};
