/**
 * Recommendation Engine (Sprint 3, lot 3.3 ; R7 au Sprint 5) : règles déterministes R1 à R7.
 *
 * Chaque recommandation est structurée (codes et montants, pas de phrases) : l'interface
 * en fait des textes. Aucune ne nomme ni ne conseille un produit financier : il s'agit
 * de gestion budgétaire générale, calculée sur les données de l'utilisateur.
 *
 * Données insuffisantes (< 3 mois complets) : AUCUNE recommandation chiffrée,
 * seulement l'indication des données manquantes (R0).
 */
import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import type { FinancialAnalysis } from './analysis.ts';
import { allocateShortfalls } from './optimization.ts';
import { isPlannable, simulateGoalPace, type Goal, type GoalAllocation, type GoalPlan } from './goals.ts';
import type { IsoDate } from './dates.ts';

export type RuleId = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7';
export type Severity = 'critical' | 'high' | 'medium' | 'info';

export interface DataPoint {
  /** Code de la donnée (traduit par l'interface). */
  code: string;
  value: number | string;
  unit: 'cents' | 'permille' | 'months' | 'count' | 'text';
  /** Origine : « analyse sur N mois », « budget », « comptes de réserve »… */
  source: string;
}

export interface Recommendation {
  ruleId: RuleId;
  /** Empreinte stable : change seulement si la situation change significativement. */
  fingerprint: string;
  severity: Severity;
  /** Clé de la situation (catégorie, série…). */
  subject: string | null;
  finding: { code: string; params: Record<string, number | string> };
  data: DataPoint[];
  proposal: { code: string; params: Record<string, number | string> };
  /** Impact simulé : null quand il n'est pas chiffrable honnêtement. */
  impact: { monthlyCents: Cents; annualCents: Cents; params?: Record<string, number | string> } | null;
  /** Action facultative proposée à l'utilisateur. */
  action: { code: string; href: string } | null;
  /** Rang de priorité (1 = la plus importante). */
  rank: number;
}

/** Seuils publiés (documentation et tests). */
export const RECOMMENDATION_RULES = {
  /** R1 : solde négatif au moins 2 des 3 derniers mois ET capacité observée négative. */
  deficitMonths: 2,
  /** R2 : délai visé pour reconstituer la réserve. */
  reserveRebuildMonths: 12,
  /** R3 : dépassement significatif seulement (≥ 10 € et ≥ 5 % du plafond en moyenne). */
  overrunMinCents: 1_000,
  overrunMinPermille: 50,
  /** R4 : capacité non affectée significative à partir de 50 €/mois. */
  unallocatedMinCents: 5_000,
  /** R5 : une catégorie non essentielle pèse au moins 25 % des dépenses courantes et 150 €/mois. */
  concentrationPermille: 250,
  concentrationMinCents: 15_000,
  /** R5 : réduction testée. */
  concentrationCutPermille: 100,
  /** R6 : au moins 2 abonnements ou 20 €/mois au total. */
  subscriptionsMinCount: 2,
  subscriptionsMinCents: 2_000,
} as const;

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

/** Arrondi d'empreinte : la recommandation n'est « nouvelle » que si le chiffre change de palier. */
const bucket = (cents: number, step = 5_000) => Math.round(cents / step);

export interface RecommendationInput {
  analysis: FinancialAnalysis;
  /** Objectifs visibles (les objectifs religieux ne sont fournis que si le consentement article 9 est en vigueur). */
  goals: ReadonlyArray<{ goal: Goal; plan: GoalPlan; /** Rythme observé des affectations, si connu. */ paceCents?: Cents }>;
  /** Empreintes écartées, faites ou reportées par l'utilisateur. */
  hidden?: ReadonlySet<string>;
  /** R7 : date du jour et affectations, pour chiffrer les scénarios de rattrapage. */
  asOf?: IsoDate;
  allocations?: readonly GoalAllocation[];
}

/**
 * R7 — projet en retard. Données de l'utilisateur seulement (cible, mis de côté, date,
 * rythme déclaré ou observé) : indépendant de l'historique bancaire. Aucune date n'est
 * promise sans rythme (rythme inconnu ou nul : pas de date estimée).
 */
function lateGoals(input: RecommendationInput): Omit<Recommendation, 'rank'>[] {
  const out: Omit<Recommendation, 'rank'>[] = [];
  for (const { goal, plan, paceCents } of input.goals) {
    if (!isPlannable(goal) || (plan.status !== 'behind' && plan.status !== 'overdue')) continue;
    const pace = goal.monthlyCapacityCents ?? paceCents;
    if (pace === undefined) continue; // rythme inconnu : on ne conclut pas
    const extra = Math.max(0, plan.monthlyRequiredCents - pace);
    const delay = plan.projectedMonthsAtCurrentPace === null ? null : Math.max(0, plan.projectedMonthsAtCurrentPace - Math.max(0, plan.monthsLeft));
    const reachable = plan.savedCents + pace * Math.max(0, plan.monthsLeft);
    const corrected = input.asOf && input.allocations ? simulateGoalPace(goal, input.allocations, input.asOf, pace + extra) : null;
    out.push({
      ruleId: 'R7', fingerprint: `R7:${goal.id}:${bucket(extra, 2_500)}:${plan.status}`,
      severity: plan.status === 'overdue' ? 'high' : 'medium', subject: goal.id,
      finding: { code: 'goal_late', params: {
        goalName: goal.name, targetDate: goal.targetDate, projectedDate: plan.projectedCompletionDate ?? '',
        delayMonths: delay ?? -1, overdue: plan.status === 'overdue' ? 1 : 0, remainingCents: plan.remainingCents,
      } },
      data: [
        { code: 'goal_target', value: goal.targetCents, unit: 'cents', source: 'goal' },
        { code: 'goal_saved', value: plan.savedCents, unit: 'cents', source: 'goal_allocations' },
        { code: 'goal_pace', value: pace, unit: 'cents', source: goal.monthlyCapacityCents !== undefined ? 'goal_declared_pace' : 'goal_observed_pace' },
        { code: 'goal_required', value: plan.monthlyRequiredCents, unit: 'cents', source: 'goal' },
        { code: 'goal_months_left', value: Math.max(0, plan.monthsLeft), unit: 'months', source: 'goal' },
      ],
      proposal: { code: 'catch_up_goal', params: {
        extraMonthlyCents: extra, newMonthlyCents: pace + extra,
        laterDate: plan.projectedCompletionDate ?? '', reachableCents: Math.min(goal.targetCents, reachable),
        correctedDate: corrected?.projectedCompletionDate ?? '',
      } },
      impact: null,
      action: { code: 'open_goal', href: `/goals/${encodeURIComponent(goal.id)}` },
    });
  }
  return out;
}

const ranked = (list: Omit<Recommendation, 'rank'>[], hidden: ReadonlySet<string>): Recommendation[] => list
  .filter((r) => !hidden.has(r.fingerprint))
  .sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]
    || (y.impact?.annualCents ?? 0) - (x.impact?.annualCents ?? 0)
    || (x.ruleId < y.ruleId ? -1 : x.ruleId > y.ruleId ? 1 : 0))
  .map((r, i) => ({ ...r, rank: i + 1 }));

export function recommend(input: RecommendationInput): Recommendation[] {
  const { analysis, hidden = new Set() } = input;
  // Seuls les projets actifs comptent (en pause ou réalisés : hors planification)
  const goals = input.goals.filter((g) => isPlannable(g.goal));
  const r7 = lateGoals({ ...input, goals });
  const a = analysis;
  const out: Omit<Recommendation, 'rank'>[] = [];
  const src = `analysis_${a.monthsWithData}_months`;

  if (a.reliability === 'insufficient') {
    const r0: Omit<Recommendation, 'rank'> = {
      ruleId: 'R0', fingerprint: `R0:${a.monthsWithData}`, severity: 'info', subject: null,
      finding: { code: 'insufficient_data', params: { months: a.monthsWithData, required: 3 } },
      data: [{ code: 'complete_months', value: a.monthsWithData, unit: 'months', source: 'transactions' }],
      proposal: { code: 'import_more_history', params: { required: 3 } },
      impact: null, action: { code: 'import', href: '/import' },
    };
    // R0 reste affichée ; R7 ne dépend que des données des projets
    return [{ ...r0, rank: 1 }, ...ranked(r7, hidden).map((r, i) => ({ ...r, rank: i + 2 }))];
  }
  const cap = a.capacity;
  const months = a.months.filter((m) => m.complete);

  // R1 — dépenses supérieures aux revenus
  const last3 = months.slice(-3);
  const deficitMonths = last3.filter((m) => m.netCents < 0).length;
  if (cap.observedCents !== null && cap.observedCents < 0 && deficitMonths >= RECOMMENDATION_RULES.deficitMonths) {
    const deficit = -cap.observedCents;
    const top = [...new Set(months.flatMap((m) => Object.keys(m.categories)))]
      .map((s) => ({ s, v: months.map((m) => m.categories[s] ?? 0).sort((x, y) => x - y)[Math.floor(months.length / 2)] }))
      .sort((x, y) => y.v - x.v)[0];
    out.push({
      ruleId: 'R1', fingerprint: `R1:${bucket(deficit)}`, severity: 'critical', subject: null,
      finding: { code: 'spending_exceeds_income', params: { deficitCents: deficit, months: deficitMonths, of: last3.length } },
      data: [
        { code: 'observed_capacity', value: cap.observedCents, unit: 'cents', source: src },
        { code: 'deficit_months', value: deficitMonths, unit: 'count', source: src },
        ...(top ? [{ code: 'largest_category', value: top.s, unit: 'text' as const, source: src }] : []),
      ],
      proposal: { code: 'reduce_to_balance', params: { targetCents: deficit, ...(top ? { category: top.s } : {}) } },
      impact: { monthlyCents: deficit, annualCents: deficit * 12 },
      action: { code: 'optimize', href: '/budget/optimiser' },
    });
  }

  // R2 — réserve de précaution insuffisante
  if (a.reserve && a.reserve.avgEssentialMonthlyCents > 0 && a.reserve.gapCents > 0) {
    const r = a.reserve;
    const monthly = Math.ceil(r.gapCents / RECOMMENDATION_RULES.reserveRebuildMonths);
    const severity: Severity = r.monthsCovered < 1 ? 'critical' : r.monthsCovered < r.months / 2 ? 'high' : 'medium';
    const capacity = cap.estimatedCents ?? 0;
    out.push({
      ruleId: 'R2', fingerprint: `R2:${Math.floor(r.monthsCovered)}:${r.months}`, severity, subject: null,
      finding: { code: 'reserve_below_target', params: { monthsCovered: r.monthsCovered, targetMonths: r.months } },
      data: [
        { code: 'reserve_balance', value: r.currentCents, unit: 'cents', source: 'reserve_accounts' },
        { code: 'essential_monthly', value: r.avgEssentialMonthlyCents, unit: 'cents', source: src },
        { code: 'reserve_target', value: r.targetCents, unit: 'cents', source: src },
      ],
      proposal: { code: 'rebuild_reserve', params: { monthlyCents: monthly, months: RECOMMENDATION_RULES.reserveRebuildMonths } },
      // Chiffrable seulement si la capacité le permet
      impact: capacity >= monthly ? { monthlyCents: monthly, annualCents: monthly * 12, params: { gapCents: r.gapCents } } : null,
      action: { code: 'reserve_goal', href: '/goals' },
    });
  }

  // R3 — dépassements budgétaires répétés
  const material = (v: { averageOverrunCents: number; limitCents: number }) => v.averageOverrunCents >= RECOMMENDATION_RULES.overrunMinCents
    && v.averageOverrunCents * 1000 >= v.limitCents * RECOMMENDATION_RULES.overrunMinPermille;
  for (const v of a.variance.filter((x) => x.repeated && material(x))) {
    out.push({
      ruleId: 'R3', fingerprint: `R3:${v.categorySlug}:${bucket(v.averageOverrunCents, 2_500)}`, severity: 'high', subject: v.categorySlug,
      finding: { code: 'budget_overrun_repeated', params: { category: v.categorySlug, overMonths: v.overMonths, of: v.months.length } },
      data: [
        { code: 'budget_limit', value: v.limitCents, unit: 'cents', source: 'budget' },
        { code: 'median_spent', value: v.medianSpentCents, unit: 'cents', source: src },
        { code: 'average_overrun', value: v.averageOverrunCents, unit: 'cents', source: src },
      ],
      proposal: { code: 'reduce_or_adjust_budget', params: { category: v.categorySlug, overrunCents: v.averageOverrunCents, realisticLimitCents: v.medianSpentCents } },
      impact: { monthlyCents: v.averageOverrunCents, annualCents: v.averageOverrunCents * 12 },
      action: { code: 'optimize_category', href: `/budget/optimiser?categorie=${encodeURIComponent(v.categorySlug)}` },
    });
  }

  // R4 — capacité d'épargne non affectée
  if (cap.estimatedCents !== null && cap.estimatedCents > 0) {
    // Engagement mensuel : capacité déclarée, sinon rythme d'affectation observé
    const committed = goals.filter((g) => g.plan.status !== 'achieved').reduce((s, g) => s + (g.goal.monthlyCapacityCents ?? g.paceCents ?? 0), 0);
    const free = cap.estimatedCents - committed;
    if (free >= RECOMMENDATION_RULES.unallocatedMinCents) {
      // Répartition sans double allocation : chaque objectif reçoit au plus ce qui lui manque
      const proposal = allocateShortfalls(free, goals.map((g) => ({ ...g, paceCents: g.goal.monthlyCapacityCents ?? g.paceCents ?? 0 })));
      const allocated = free - proposal.unallocatedCents;
      out.push({
        ruleId: 'R4', fingerprint: `R4:${bucket(free)}`, severity: 'medium', subject: null,
        finding: { code: 'unallocated_capacity', params: { freeCents: free, capacityCents: cap.estimatedCents, committedCents: committed } },
        data: [
          { code: 'estimated_capacity', value: cap.estimatedCents, unit: 'cents', source: src },
          { code: 'committed_to_goals', value: committed, unit: 'cents', source: 'goals' },
        ],
        proposal: proposal.lines.some((l) => l.proposedCents > 0)
          ? { code: 'allocate_to_goals', params: { allocatedCents: allocated, goals: proposal.lines.filter((l) => l.proposedCents > 0).length } }
          : { code: 'create_goal', params: { freeCents: free } },
        impact: { monthlyCents: free, annualCents: free * 12 },
        action: { code: 'goals', href: '/goals' },
      });
    }
  }

  // R5 — concentration des dépenses
  const c = a.concentration;
  if (c && c.sharePermille >= RECOMMENDATION_RULES.concentrationPermille && c.medianMonthlyCents >= RECOMMENDATION_RULES.concentrationMinCents) {
    const cut = divRoundHalfEven(c.medianMonthlyCents * RECOMMENDATION_RULES.concentrationCutPermille, 1000);
    out.push({
      ruleId: 'R5', fingerprint: `R5:${c.categorySlug}:${Math.floor(c.sharePermille / 50)}`, severity: 'medium', subject: c.categorySlug,
      finding: { code: 'spending_concentration', params: { category: c.categorySlug, sharePermille: c.sharePermille } },
      data: [
        { code: 'category_median', value: c.medianMonthlyCents, unit: 'cents', source: src },
        { code: 'share_of_spending', value: c.sharePermille, unit: 'permille', source: src },
      ],
      proposal: { code: 'test_reduction', params: { category: c.categorySlug, cutPermille: RECOMMENDATION_RULES.concentrationCutPermille, cutCents: cut } },
      impact: { monthlyCents: cut, annualCents: cut * 12 },
      action: { code: 'optimize_category', href: `/budget/optimiser?categorie=${encodeURIComponent(c.categorySlug)}` },
    });
  }

  // R6 — abonnements à revoir
  const subs = a.recurring.filter((s) => s.kind === 'subscription' && s.active);
  const subsTotal = subs.reduce((s, x) => s + x.monthlyEquivalentCents, 0);
  if (subs.length >= RECOMMENDATION_RULES.subscriptionsMinCount || (subs.length > 0 && subsTotal >= RECOMMENDATION_RULES.subscriptionsMinCents)) {
    out.push({
      ruleId: 'R6', fingerprint: `R6:${subs.map((s) => s.key).sort().join('|')}`, severity: subsTotal >= 5_000 ? 'medium' : 'info', subject: null,
      finding: { code: 'subscriptions_review', params: { count: subs.length, totalCents: subsTotal } },
      data: subs.slice(0, 6).map((s) => ({ code: 'subscription', value: `${s.label}|${s.monthlyEquivalentCents}`, unit: 'text' as const, source: 'recurring_detection' })),
      proposal: { code: 'review_subscriptions', params: { count: subs.length } },
      // Montant maximal si TOUT était résilié : présenté comme un plafond, pas une économie
      impact: { monthlyCents: subsTotal, annualCents: subsTotal * 12, params: { kind: 'upper_bound' } },
      action: { code: 'optimize', href: '/budget/optimiser' },
    });
  }

  return ranked([...out, ...r7], hidden);
}
