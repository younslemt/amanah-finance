import { describe, expect, it } from 'vitest';
import { buildSnapshot } from './snapshot.ts';
import { getDemoHousehold } from './demo.ts';
import { findingText, proposalText, RULE_TITLE, dataLine } from './recommendation-text.ts';
import { savingsPlanSchema, declaredCapacitySchema } from './validation.ts';
import type { Recommendation } from '@amanah/engines';

describe('plan d’épargne dans la synthèse (démonstration fictive)', () => {
  const s = buildSnapshot(getDemoHousehold());
  it('capacité déclarée, montants prévus, aucune somme couverte deux fois', () => {
    expect(s.savingsPlan.capacitySource).toBe('declared');
    expect(s.savingsPlan.capacityCents).toBe(50_000);
    const funded = s.savingsPlan.lines.reduce((t, l) => t + l.fundedCents, 0);
    expect(funded).toBeLessThanOrEqual(50_000);
    expect(s.savingsPlan.lines.find((l) => l.goalId === 'goal-aid')!.plannedCents).toBe(5_000);
  });
  it('l’analyse des dépenses n’est pas modifiée par le plan (mises de côté virtuelles)', () => {
    const without = buildSnapshot({ ...getDemoHousehold(), declaredSavingsCapacityCents: null });
    expect(without.analysis.capacity).toEqual(s.analysis.capacity);
    expect(without.month).toEqual(s.month);
  });
});

describe('formulaires du plan', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  it('une ligne par projet : montant et priorité', () => {
    expect(savingsPlanSchema.safeParse({ goalIds: [id], monthly: ['50'], priority: ['2'] }).success).toBe(true);
    expect(savingsPlanSchema.safeParse({ goalIds: [id], monthly: ['50'], priority: ['7'] }).success).toBe(false);
    expect(savingsPlanSchema.safeParse({ goalIds: [id, id], monthly: ['50'], priority: ['2'] }).success).toBe(false);
  });
  it('capacité déclarée facultative', () => {
    expect(declaredCapacitySchema.safeParse({ capacity: '' }).success).toBe(true);
    const r = declaredCapacitySchema.safeParse({ capacity: '500' });
    expect(r.success && r.data.capacity).toBe(50_000);
  });
});

describe('textes de R7', () => {
  const r7 = {
    ruleId: 'R7', fingerprint: 'x', severity: 'medium', subject: 'g', rank: 1, impact: null, action: { code: 'open_goal', href: '/goals/g' },
    finding: { code: 'goal_late', params: { goalName: 'Voyage fictif', targetDate: '2027-11-20', projectedDate: '2031-11-20', delayMonths: 48, overdue: 0, remainingCents: 600_000 } },
    data: [{ code: 'goal_pace', value: 10_000, unit: 'cents', source: 'goal_declared_pace' }],
    proposal: { code: 'catch_up_goal', params: { extraMonthlyCents: 40_000, newMonthlyCents: 50_000, laterDate: '2031-11-20', reachableCents: 120_000, correctedDate: '2027-11-20' } },
  } as unknown as Recommendation;
  it('retard, données et scénarios expliqués', () => {
    expect(RULE_TITLE.R7).toBe('Projet en retard');
    expect(findingText(r7)).toContain('48 mois de retard');
    const p = proposalText(r7);
    expect(p).toContain('augmenter l’effort');
    expect(p).toContain('repousser la date au 20/11/2031 (estimation)');
    expect(p).toContain('ajuster la cible');
    expect(dataLine(r7.data[0]!)).toMatchObject({ label: 'Effort d’épargne actuel', source: 'votre capacité mensuelle déclarée' });
  });
  it('sans rythme : aucune date promise', () => {
    const none = { ...r7, finding: { code: 'goal_late', params: { ...r7.finding.params, projectedDate: '', delayMonths: -1 } },
      proposal: { code: 'catch_up_goal', params: { ...r7.proposal.params, laterDate: '' } } } as Recommendation;
    expect(findingText(none)).toContain('aucune date estimable');
    expect(proposalText(none)).not.toContain('repousser');
  });
});
