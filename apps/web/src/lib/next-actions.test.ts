import { describe, expect, it } from 'vitest';
import { analyzeFinances, recommend } from '@amanah/engines';
import { nextActions } from './next-actions.ts';
import { findingText, impactText, proposalText, dataLine } from './recommendation-text.ts';
import { buildSnapshot } from './snapshot.ts';
import { getDemoHousehold } from './demo.ts';

describe('prochaines actions', () => {
  const s = buildSnapshot(getDemoHousehold());
  const purif = { detectedCreditedCents: 2_457, toPurifyCents: 0, toDetermineCount: 0, toDetermineCreditedCents: 0, purifiedCents: 0, rejectedCreditedCents: 0 };
  it('reprend les actions des recommandations, sans doublon, dans l’ordre de priorité', () => {
    const a = nextActions({ recommendations: s.recommendations, religious: false, purification: null });
    expect(a.length).toBeGreaterThan(0);
    expect(a[0].href).toBe(s.recommendations.find((r) => r.action)!.action!.href);
    expect(new Set(a.map((x) => x.href)).size).toBe(a.length);
  });
  it('n’ajoute la purification qu’avec la finance islamique activée', () => {
    expect(nextActions({ recommendations: [], religious: false, purification: purif })).toEqual([]);
    expect(nextActions({ recommendations: [], religious: true, purification: purif })[0]).toMatchObject({ href: '/purification', source: 'religious' });
  });
  it('sans données suffisantes : une seule action, importer', () => {
    const a = analyzeFinances({ asOf: '2026-11-10', transactions: [], categories: [] });
    expect(nextActions({ recommendations: recommend({ analysis: a, goals: [] }), religious: false, purification: null }))
      .toEqual([{ label: 'Importer un relevé', detail: 'Données insuffisantes', href: '/import', source: 'data' }]);
  });
});

describe('textes des recommandations', () => {
  const s = buildSnapshot(getDemoHousehold());
  it('rend chaque recommandation de la démonstration en français, sans code brut', () => {
    expect(s.recommendations.length).toBeGreaterThan(0);
    for (const r of s.recommendations) {
      expect(findingText(r).length).toBeGreaterThan(10);
      expect(proposalText(r).length).toBeGreaterThan(10);
      for (const d of r.data) expect(dataLine(d).label).not.toMatch(/^[a-z_]+$/);
    }
  });
  it('présente un plafond comme un maximum simulé, jamais comme une économie réalisée', () => {
    const r6 = s.recommendations.find((r) => r.ruleId === 'R6');
    if (r6) expect(impactText(r6)).toMatch(/Jusqu’à .* simulé/);
    for (const r of s.recommendations) expect(impactText(r) ?? '').not.toMatch(/économisé/);
  });
});
