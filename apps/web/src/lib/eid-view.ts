/** Aïd al-Adha : conversion des lignes de la base vers le moteur (fonction pure, testée). */
import type { EidPlan } from '@amanah/engines';

export interface EidPlanRow {
  goal_id: string; owner_id: string; civil_year: number;
  sacrifice_cents: number | string; extra_costs_cents: number | string; organization_cents: number | string; family_contribution_cents: number | string;
  date_status: 'entered' | 'confirmed'; date_source: string | null; estimated_date: string | null; previous_goal_id: string | null;
}

export function eidPlanFrom(r: EidPlanRow, goalDate: string): EidPlan {
  return {
    goalId: r.goal_id, civilYear: r.civil_year, date: goalDate, dateStatus: r.date_status,
    budget: {
      sacrificeCents: Number(r.sacrifice_cents), extraCostsCents: Number(r.extra_costs_cents),
      organizationCents: Number(r.organization_cents), familyContributionCents: Number(r.family_contribution_cents),
    },
    ...(r.date_source ? { dateSource: r.date_source } : {}),
    ...(r.estimated_date ? { estimatedDate: r.estimated_date } : {}),
    ...(r.previous_goal_id ? { previousGoalId: r.previous_goal_id } : {}),
  };
}

/** Montant affiché en saisie (« 350,00 ») depuis des centimes. */
export const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');
