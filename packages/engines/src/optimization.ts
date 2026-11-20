/**
 * Budget Optimization Engine (Sprint 3, lot 3.2).
 *
 * Simule l'effet d'ajustements de dépenses sur la capacité d'épargne, la réserve et
 * les objectifs. Fonctions pures : une simulation ne lit ni n'écrit aucune donnée,
 * et ne modifie jamais les opérations. Les montants sont des économies SIMULÉES.
 */
import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import { monthKey, type IsoDate } from './dates.ts';
import { median, type FinancialAnalysis } from './analysis.ts';
import { planGoal, type Goal, type GoalAllocation, type GoalPlan } from './goals.ts';

export type Adjustment =
  /** Réduction globale des dépenses variables. */
  | { type: 'total'; monthlyCents: Cents }
  /** Réduction d'une catégorie. */
  | { type: 'category'; categorySlug: string; monthlyCents: Cents }
  /** Résiliation d'une dépense récurrente détectée (abonnement, charge). */
  | { type: 'cancel_recurring'; seriesKey: string };

export interface AppliedAdjustment {
  adjustment: Adjustment;
  /** Économie retenue après plafonnement (on ne peut pas économiser plus que ce qui est dépensé). */
  monthlyCents: Cents;
  capped: boolean;
  /** Catégorie concernée, si connue. */
  categorySlug: string | null;
}

export interface GoalImpact {
  goalId: string;
  name: string;
  kind: Goal['kind'];
  /** Rythme actuel : capacité déclarée, sinon rythme observé, sinon aucun. */
  paceBeforeCents: Cents | null;
  paceAfterCents: Cents;
  before: GoalPlan;
  after: GoalPlan;
  /** Mois gagnés (positif = plus tôt) ; null si l'une des dates est inconnue. */
  monthsGained: number | null;
}

export interface Simulation {
  available: boolean;
  reason: 'insufficient_data' | 'no_adjustment' | null;
  current: {
    /** Capacité de référence : capacité estimée (structurelle). */
    capacityCents: Cents | null;
    observedCents: Cents | null;
    fixedExpenseCents: Cents | null;
    variableExpenseCents: Cents | null;
  };
  applied: AppliedAdjustment[];
  potentialMonthlyCents: Cents;
  potentialAnnualCents: Cents;
  after: { capacityCents: Cents | null };
  reserve: { gapCents: Cents; monthsToTargetBefore: number | null; monthsToTargetAfter: number | null } | null;
  goals: GoalImpact[];
}

/** Dépense médiane mensuelle d'une catégorie sur les mois analysés. */
export function categoryMedian(analysis: FinancialAnalysis, slug: string): Cents {
  return median(analysis.months.map((m) => Math.max(0, m.categories[slug] ?? 0)));
}

/**
 * Applique les ajustements dans un ordre fixe (résiliations, catégories, global) en
 * plafonnant chacun à ce qui reste dépensé : aucune économie n'est comptée deux fois.
 */
export function applyAdjustments(analysis: FinancialAnalysis, adjustments: readonly Adjustment[]): AppliedAdjustment[] {
  const remainingByCat = new Map<string, number>();
  const remainingOf = (slug: string) => remainingByCat.get(slug) ?? categoryMedian(analysis, slug);
  let variableLeft = analysis.capacity.variableExpenseCents ?? 0;
  const out: AppliedAdjustment[] = [];
  const order = { cancel_recurring: 0, category: 1, total: 2 } as const;
  const sorted = adjustments.map((a, i) => ({ a, i })).sort((x, y) => order[x.a.type] - order[y.a.type] || x.i - y.i);
  const seen = new Set<string>();
  for (const { a } of sorted) {
    if (a.type === 'cancel_recurring') {
      const s = analysis.recurring.find((r) => r.key === a.seriesKey && r.direction === 'debit' && r.active);
      if (!s || seen.has(s.key)) { out.push({ adjustment: a, monthlyCents: 0, capped: true, categorySlug: s?.categorySlug ?? null }); continue; }
      seen.add(s.key);
      const slug = s.categorySlug ?? 'divers';
      const v = Math.min(s.monthlyEquivalentCents, remainingOf(slug));
      remainingByCat.set(slug, remainingOf(slug) - v);
      out.push({ adjustment: a, monthlyCents: v, capped: v < s.monthlyEquivalentCents, categorySlug: s.categorySlug });
    } else if (a.type === 'category') {
      const want = Math.max(0, Math.trunc(a.monthlyCents));
      const v = Math.min(want, remainingOf(a.categorySlug));
      remainingByCat.set(a.categorySlug, remainingOf(a.categorySlug) - v);
      out.push({ adjustment: a, monthlyCents: v, capped: v < want, categorySlug: a.categorySlug });
    } else {
      const want = Math.max(0, Math.trunc(a.monthlyCents));
      const already = out.reduce((s, x) => s + x.monthlyCents, 0);
      variableLeft = Math.max(0, (analysis.capacity.variableExpenseCents ?? 0) - already);
      const v = Math.min(want, variableLeft);
      out.push({ adjustment: a, monthlyCents: v, capped: v < want, categorySlug: null });
    }
  }
  // Restitue l'ordre de saisie
  return adjustments.map((a) => out.find((o) => o.adjustment === a)!);
}

function monthsTo(gap: Cents, monthly: Cents | null): number | null {
  if (gap <= 0) return 0;
  if (monthly === null || monthly <= 0) return null;
  return Math.ceil(gap / monthly);
}

/**
 * Simule des ajustements. L'économie est appliquée, pour chaque objectif pris
 * isolément, en plus de son rythme actuel (« si cette économie lui est affectée »).
 */
export function simulateScenario(
  analysis: FinancialAnalysis,
  adjustments: readonly Adjustment[],
  goals: ReadonlyArray<{ goal: Goal; allocations: readonly GoalAllocation[]; observedPaceCents?: Cents }> = [],
): Simulation {
  const current = {
    capacityCents: analysis.capacity.estimatedCents,
    observedCents: analysis.capacity.observedCents,
    fixedExpenseCents: analysis.capacity.fixedExpenseCents,
    variableExpenseCents: analysis.capacity.variableExpenseCents,
  };
  const empty: Simulation = {
    available: false, reason: 'insufficient_data', current, applied: [], potentialMonthlyCents: 0, potentialAnnualCents: 0,
    after: { capacityCents: current.capacityCents }, reserve: null, goals: [],
  };
  if (analysis.reliability === 'insufficient') return empty;
  const applied = applyAdjustments(analysis, adjustments);
  const potential = applied.reduce((s, a) => s + a.monthlyCents, 0);
  const afterCapacity = current.capacityCents === null ? null : current.capacityCents + potential;

  const reserve = analysis.reserve
    ? {
      gapCents: analysis.reserve.gapCents,
      monthsToTargetBefore: monthsTo(analysis.reserve.gapCents, current.capacityCents),
      monthsToTargetAfter: monthsTo(analysis.reserve.gapCents, afterCapacity),
    }
    : null;

  const goalImpacts: GoalImpact[] = goals.map(({ goal, allocations, observedPaceCents }) => {
    const paceBefore = goal.monthlyCapacityCents ?? observedPaceCents ?? null;
    const paceAfter = (paceBefore ?? 0) + potential;
    const before = planGoal(goal, allocations, analysis.asOf, observedPaceCents);
    const after = planGoal({ ...goal, monthlyCapacityCents: paceAfter }, allocations, analysis.asOf);
    const gained = before.projectedMonthsAtCurrentPace !== null && after.projectedMonthsAtCurrentPace !== null
      ? before.projectedMonthsAtCurrentPace - after.projectedMonthsAtCurrentPace : null;
    return { goalId: goal.id, name: goal.name, kind: goal.kind, paceBeforeCents: paceBefore, paceAfterCents: paceAfter, before, after, monthsGained: gained };
  });

  return {
    available: true,
    reason: potential === 0 ? 'no_adjustment' : null,
    current, applied,
    potentialMonthlyCents: potential,
    potentialAnnualCents: potential * 12,
    after: { capacityCents: afterCapacity },
    reserve, goals: goalImpacts,
  };
}

// ---------------------------------------------------------------------------
// Réallocation proposée vers les objectifs
// ---------------------------------------------------------------------------
export interface AllocationProposal {
  lines: Array<{ goalId: string; requiredCents: Cents; proposedCents: Cents }>;
  unallocatedCents: Cents;
}

/** Répartit une capacité mensuelle : objectifs en retard d'abord, puis par échéance. Proposition seulement. */
export function proposeAllocation(capacityCents: Cents, goals: ReadonlyArray<{ goal: Goal; plan: GoalPlan }>): AllocationProposal {
  let left = Math.max(0, capacityCents);
  const urgency = (s: GoalPlan['status']) => (s === 'overdue' ? 0 : s === 'behind' ? 1 : 2);
  const ordered = goals.filter((g) => g.plan.status !== 'achieved' && g.plan.remainingCents > 0)
    .sort((a, b) => urgency(a.plan.status) - urgency(b.plan.status)
      || (a.goal.targetDate < b.goal.targetDate ? -1 : a.goal.targetDate > b.goal.targetDate ? 1 : 0)
      || (a.goal.id < b.goal.id ? -1 : 1));
  const lines = ordered.map(({ goal, plan }) => {
    const required = plan.monthlyRequiredCents;
    const proposed = Math.min(required, left);
    left -= proposed;
    return { goalId: goal.id, requiredCents: required, proposedCents: proposed };
  });
  return { lines, unallocatedCents: left };
}

// ---------------------------------------------------------------------------
// Suivi d'un scénario enregistré
// ---------------------------------------------------------------------------
export interface ScenarioBaseline {
  /** Date d'enregistrement du scénario. */
  createdOn: IsoDate;
  /** Dépense médiane de référence par catégorie concernée, et dépenses variables. */
  categories: Record<string, Cents>;
  variableExpenseCents: Cents;
  potentialMonthlyCents: Cents;
}

export interface ScenarioTracking {
  /** Mois complets écoulés depuis l'enregistrement. */
  months: string[];
  lines: Array<{ categorySlug: string; baselineCents: Cents; targetCents: Cents; actualCents: Cents | null; onTrack: boolean | null }>;
  /** Baisse réellement constatée des dépenses suivies (moyenne mensuelle), null avant un mois complet. */
  observedReductionCents: Cents | null;
}

/** Photographie de référence à enregistrer avec un scénario (permet le suivi ultérieur). */
export function scenarioBaseline(analysis: FinancialAnalysis, adjustments: readonly Adjustment[], createdOn: IsoDate): ScenarioBaseline {
  const applied = applyAdjustments(analysis, adjustments);
  const categories: Record<string, Cents> = {};
  for (const a of applied) if (a.categorySlug) categories[a.categorySlug] = categoryMedian(analysis, a.categorySlug);
  return {
    createdOn, categories,
    variableExpenseCents: analysis.capacity.variableExpenseCents ?? 0,
    potentialMonthlyCents: applied.reduce((s, a) => s + a.monthlyCents, 0),
  };
}

/** Compare, après coup, les dépenses réelles aux objectifs du scénario (catégories visées). */
export function trackScenario(analysis: FinancialAnalysis, adjustments: readonly Adjustment[], baseline: ScenarioBaseline): ScenarioTracking {
  const after = analysis.months.filter((m) => m.month > monthKey(baseline.createdOn));
  const months = after.map((m) => m.month);
  const cuts = new Map<string, number>();
  for (const a of adjustments) {
    if (a.type === 'category') cuts.set(a.categorySlug, (cuts.get(a.categorySlug) ?? 0) + Math.max(0, a.monthlyCents));
    if (a.type === 'cancel_recurring') {
      const s = analysis.recurring.find((r) => r.key === a.seriesKey);
      if (s?.categorySlug) cuts.set(s.categorySlug, (cuts.get(s.categorySlug) ?? 0) + s.monthlyEquivalentCents);
    }
  }
  const lines = Object.entries(baseline.categories).map(([slug, base]) => {
    const target = Math.max(0, base - (cuts.get(slug) ?? 0));
    const actual = after.length ? divRoundHalfEven(after.reduce((s, m) => s + (m.categories[slug] ?? 0), 0), after.length) : null;
    return { categorySlug: slug, baselineCents: base, targetCents: target, actualCents: actual, onTrack: actual === null ? null : actual <= target };
  });
  const observed = after.length
    ? lines.reduce((s, l) => s + (l.baselineCents - (l.actualCents ?? l.baselineCents)), 0)
    : null;
  return { months, lines, observedReductionCents: observed };
}

// ---------------------------------------------------------------------------
// Décision : plafonds de budget correspondant à un scénario
// ---------------------------------------------------------------------------
/**
 * Plafonds par catégorie : dépense médiane − économie simulée, arrondie à l'euro supérieur.
 * La réduction globale ne vise aucune catégorie : elle ne produit pas de plafond.
 */
export function scenarioBudgetLines(analysis: FinancialAnalysis, adjustments: readonly Adjustment[]): Array<{ categorySlug: string; limitCents: Cents; medianCents: Cents }> {
  const cuts = new Map<string, number>();
  for (const a of applyAdjustments(analysis, adjustments)) {
    if (a.categorySlug && a.monthlyCents > 0 && a.adjustment.type !== 'total') cuts.set(a.categorySlug, (cuts.get(a.categorySlug) ?? 0) + a.monthlyCents);
  }
  return [...cuts.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([slug, cut]) => {
    const med = categoryMedian(analysis, slug);
    return { categorySlug: slug, medianCents: med, limitCents: Math.ceil(Math.max(0, med - cut) / 100) * 100 };
  });
}
