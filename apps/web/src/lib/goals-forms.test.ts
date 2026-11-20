import { describe, expect, it } from 'vitest';
import { eidDateSchema, eidSchema, goalLifecycleSchema, goalSchema, goalUpdateSchema } from './validation.ts';
import { eidPlanFrom } from './eid-view.ts';
import { describeGoalChange } from './goal-changes.ts';

const euro = (c: number) => `${(c / 100).toFixed(2)} €`;

describe('formulaires des projets', () => {
  const base = { kind: 'children_education', target: '12 000', available: '2 000', targetDate: '2030-09-01', monthlyCapacity: '300' };
  it('création : toutes les catégories, nom facultatif, montants en centimes', () => {
    const r = goalSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ kind: 'children_education', name: null, target: 1_200_000, available: 200_000, monthlyCapacity: 30_000 });
    for (const kind of ['real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal', 'hajj', 'omra']) {
      expect(goalSchema.safeParse({ ...base, kind }).success).toBe(true);
    }
    expect(goalSchema.safeParse({ ...base, kind: 'voyage' }).success).toBe(false);
  });
  it('création : épargne disponible supérieure à la cible refusée ; capacité mensuelle obligatoire', () => {
    expect(goalSchema.safeParse({ ...base, available: '13 000' }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, monthlyCapacity: '' }).success).toBe(false);
    expect(goalSchema.safeParse({ ...base, available: '' }).success).toBe(true);
  });
  it('modification : nom, cible, date, capacité, priorité de 1 à 5', () => {
    const u = { id: '00000000-0000-4000-8000-000000000001', name: 'Études', target: '15 000', targetDate: '2031-09-01', monthlyCapacity: '350', priority: '2' };
    expect(goalUpdateSchema.safeParse(u).success).toBe(true);
    expect(goalUpdateSchema.safeParse({ ...u, priority: '6' }).success).toBe(false);
    expect(goalUpdateSchema.safeParse({ ...u, name: ' ' }).success).toBe(false);
  });
  it('réaliser exige une date ; les autres actions non', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(goalLifecycleSchema.safeParse({ id, action: 'achieve', realizedOn: '' }).success).toBe(false);
    expect(goalLifecycleSchema.safeParse({ id, action: 'achieve', realizedOn: '2026-11-15' }).success).toBe(true);
    expect(goalLifecycleSchema.safeParse({ id, action: 'pause' }).success).toBe(true);
    expect(goalLifecycleSchema.safeParse({ id, action: 'delete' }).success).toBe(false);
  });
  it('historique lisible des modifications', () => {
    expect(describeGoalChange({ target_cents: { from: 1_200_000, to: 1_500_000 }, status: { from: 'active', to: 'achieved' }, realized_on: { from: null, to: '2026-11-15' } }, euro))
      .toEqual(['Montant cible : 12000.00 € → 15000.00 €', 'Statut : en cours → réalisé', 'Date de réalisation : — → 15/11/2026']);
  });

  it('Aïd : budget, date dans l’année civile, source exigée si confirmée, aucune reconduction mal formée', () => {
    const aid = { civilYear: '2027', sacrifice: '350', extras: '80', organization: '', family: '100', targetDate: '2027-05-17', dateStatus: 'entered', available: '', monthlyCapacity: '50' };
    const r = eidSchema.safeParse(aid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ sacrifice: 35_000, extras: 8_000, organization: 0, family: 10_000, available: 0, previousGoalId: null, dateSource: null });
    expect(eidSchema.safeParse({ ...aid, family: '430' }).success).toBe(false);
    expect(eidSchema.safeParse({ ...aid, targetDate: '2028-05-06' }).success).toBe(false);
    expect(eidSchema.safeParse({ ...aid, dateStatus: 'confirmed' }).success).toBe(false);
    expect(eidSchema.safeParse({ ...aid, dateStatus: 'confirmed', dateSource: 'Mosquée fictive' }).success).toBe(true);
    expect(eidSchema.safeParse({ ...aid, available: '331' }).success).toBe(false);
    expect(eidSchema.safeParse({ ...aid, previousGoalId: 'pas-un-uuid' }).success).toBe(false);
    expect(eidDateSchema.safeParse({ goalId: '00000000-0000-4000-8000-000000000001', targetDate: '2027-05-16', dateStatus: 'confirmed', dateSource: 'Mosquée fictive' }).success).toBe(true);
  });
  it('Aïd : lecture du plan et historique lisible des changements de date', () => {
    const p = eidPlanFrom({ goal_id: 'g', owner_id: 'u', civil_year: 2027, sacrifice_cents: '35000', extra_costs_cents: 8000, organization_cents: 0, family_contribution_cents: 10000,
      date_status: 'confirmed', date_source: 'Mosquée fictive', estimated_date: '2027-05-17', previous_goal_id: null }, '2027-05-16');
    expect(p).toMatchObject({ civilYear: 2027, date: '2027-05-16', dateStatus: 'confirmed', dateSource: 'Mosquée fictive', estimatedDate: '2027-05-17' });
    expect(p.budget.sacrificeCents).toBe(35_000);
    expect(describeGoalChange({ date_status: { from: 'entered', to: 'confirmed' }, date_source: { from: null, to: 'Mosquée fictive' } }, euro))
      .toEqual(['Date de l’Aïd : saisie, non confirmée → confirmée', 'Source de la date : — → Mosquée fictive']);
  });
});
