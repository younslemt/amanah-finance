/**
 * « Mes prochaines actions » : liste courte et déterministe, construite à partir des
 * recommandations et, si la finance islamique est activée, de la purification.
 */
import type { PurificationSummary, Recommendation } from '@amanah/engines';
import { ACTION_LABEL, RULE_TITLE } from './recommendation-text.ts';
import { formatCents } from './format.ts';

export interface NextAction { label: string; detail: string; href: string; source: 'recommendation' | 'religious' | 'data' }

export function nextActions(input: {
  recommendations: readonly Recommendation[];
  religious: boolean;
  purification: PurificationSummary | null;
  max?: number;
}): NextAction[] {
  const out: NextAction[] = [];
  for (const r of input.recommendations) {
    if (!r.action) continue;
    out.push({
      label: ACTION_LABEL[r.action.code] ?? 'Voir', detail: RULE_TITLE[r.ruleId], href: r.action.href,
      source: r.ruleId === 'R0' ? 'data' : 'recommendation',
    });
  }
  // Données religieuses : seulement avec le consentement article 9 (et après les urgences budgétaires)
  if (input.religious && input.purification) {
    const p = input.purification;
    if (p.toPurifyCents > 0) out.push({ label: 'Enregistrer une purification', detail: `${formatCents(p.toPurifyCents)} à purifier`, href: '/purification', source: 'religious' });
    else if (p.detectedCreditedCents > 0) out.push({ label: 'Examiner les intérêts détectés', detail: `${formatCents(p.detectedCreditedCents)} à examiner`, href: '/purification', source: 'religious' });
  }
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.href) ? false : (seen.add(a.href), true))).slice(0, input.max ?? 4);
}
