import { describe, expect, it } from 'vitest';
import { goalLifecycleSchema, goalSchema, goalUpdateSchema } from './validation.ts';
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
});
