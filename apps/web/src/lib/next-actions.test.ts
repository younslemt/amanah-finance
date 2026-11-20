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

describe('couverture et virements (démonstration)', () => {
  const s = buildSnapshot(getDemoHousehold());
  it('la démonstration est complète sur 3 mois et ses virements vers l’épargne sont confirmés', () => {
    expect(s.analysis.coverage.status).toBe('complete');
    expect(s.analysis.monthsWithData).toBe(3);
    expect(s.analysis.transfers.filter((m) => m.status === 'confirmed').length).toBeGreaterThanOrEqual(1);
    expect(s.analysis.transfers.some((m) => m.status === 'uncertain')).toBe(false);
  });
  it('décrit chaque manque de couverture en clair', async () => {
    const { coverageIssueText } = await import('./coverage-text.ts');
    const name = () => 'Compte courant';
    expect(coverageIssueText({ code: 'month_gap', accountId: 'a', month: '2026-07' }, name)).toContain('juillet 2026');
    expect(coverageIssueText({ code: 'account_without_transactions', accountId: 'a' }, name)).toContain('aucune opération');
    expect(coverageIssueText({ code: 'statement_stops_early', accountId: 'a', month: '2026-10' }, name)).toContain('exclu des calculs');
  });
});
