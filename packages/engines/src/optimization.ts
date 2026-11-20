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

/** Rythme d'épargne actuel d'un objectif : capacité déclarée, sinon rythme observé, sinon aucun. */
export function goalPace(goal: Goal, observedPaceCents?: Cents): Cents {
  return Math.max(0, goal.monthlyCapacityCents ?? observedPaceCents ?? 0);
}

/**
 * Simulation INDIVIDUELLE : toute l'économie est affectée à cet objectif seul.
 * Les simulations individuelles sont des alternatives : elles ne s'additionnent pas.
 */
export interface IndividualGoalImpact {
  goalId: string;
  name: string;
  kind: Goal['kind'];
  paceBeforeCents: Cents;
  paceAfterCents: Cents;
  before: GoalPlan;
  after: GoalPlan;
  /** Mois gagnés (positif = plus tôt) ; null si l'une des dates est inconnue. */
  monthsGained: number | null;
  /** Toujours vrai : alternative exclusive, non cumulable avec les autres objectifs. */
  exclusive: true;
}

/** Répartition GLOBALE : une même somme n'est jamais affectée à deux objectifs. */
export interface GlobalGoalImpact {
  goalId: string;
  name: string;
  kind: Goal['kind'];
  /** Rythme actuel de l'objectif (déjà engagé, déjà compté dans la capacité affectée). */
  paceCents: Cents;
  /** Complément proposé sur la capacité disponible, sans le scénario puis avec. */
  extraBeforeCents: Cents;
  extraAfterCents: Cents;
  before: GoalPlan;
  after: GoalPlan;
  monthsGained: number | null;
}

export interface CapacityBreakdown {
  /** Capacité d'épargne estimée (structurelle). */
  estimatedCents: Cents | null;
  /** Déjà engagé sur les objectifs (rythmes actuels). */
  committedCents: Cents;
  /** Capacité réellement disponible = estimée − engagée (peut être négative). */
  availableCents: Cents | null;
  /** Disponible après le scénario. */
  availableAfterCents: Cents | null;
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
  capacity: CapacityBreakdown;
  reserve: { gapCents: Cents; monthsToTargetBefore: number | null; monthsToTargetAfter: number | null } | null;
  /** Répartition globale de la capacité disponible entre les objectifs (avant / après scénario). */
  allocation: {
    lines: GlobalGoalImpact[];
    allocatedBeforeCents: Cents;
    allocatedAfterCents: Cents;
    /** Capacité disponible après scénario restant non affectée. */
    unallocatedAfterCents: Cents;
  };
  /** Simulations individuelles (alternatives exclusives, jamais additionnées). */
  individual: IndividualGoalImpact[];
}

/** Dépense médiane mensuelle d'une catégorie sur les mois analysés. */
export function categoryMedian(analysis: FinancialAnalysis, slug: string): Cents {
  return median(analysis.months.filter((m) => m.complete).map((m) => Math.max(0, m.categories[slug] ?? 0)));
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

const gained = (a: GoalPlan, b: GoalPlan) => (a.projectedMonthsAtCurrentPace !== null && b.projectedMonthsAtCurrentPace !== null
  ? a.projectedMonthsAtCurrentPace - b.projectedMonthsAtCurrentPace : null);

/**
 * Simule des ajustements et en mesure l'effet sur trois plans distincts :
 * - capacité : estimée, déjà engagée sur les objectifs, réellement disponible (avant / après) ;
 * - répartition globale : la capacité disponible est répartie entre objectifs (en retard
 *   d'abord, puis par échéance) sans jamais dépasser ce qui est disponible : aucune double
 *   allocation ; l'effet du scénario = répartition après − répartition avant ;
 * - simulations individuelles : « si toute l'économie allait à cet objectif », alternatives
 *   exclusives présentées comme telles.
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
  const paces = goals.map((g) => goalPace(g.goal, g.observedPaceCents));
  const committed = paces.reduce((s, p) => s + p, 0);
  const empty: Simulation = {
    available: false, reason: 'insufficient_data', current, applied: [], potentialMonthlyCents: 0, potentialAnnualCents: 0,
    after: { capacityCents: current.capacityCents },
    capacity: { estimatedCents: current.capacityCents, committedCents: committed, availableCents: null, availableAfterCents: null },
    reserve: null, allocation: { lines: [], allocatedBeforeCents: 0, allocatedAfterCents: 0, unallocatedAfterCents: 0 }, individual: [],
  };
  if (analysis.reliability === 'insufficient' || current.capacityCents === null) return empty;
  const applied = applyAdjustments(analysis, adjustments);
  const potential = applied.reduce((s, a) => s + a.monthlyCents, 0);
  const afterCapacity = current.capacityCents + potential;
  const available = current.capacityCents - committed;
  const availableAfter = available + potential;

  const reserve = analysis.reserve
    ? {
      gapCents: analysis.reserve.gapCents,
      monthsToTargetBefore: monthsTo(analysis.reserve.gapCents, Math.max(0, available)),
      monthsToTargetAfter: monthsTo(analysis.reserve.gapCents, Math.max(0, availableAfter)),
    }
    : null;

  // Plans au rythme actuel (base commune)
  const base = goals.map((g, i) => ({ ...g, pace: paces[i], plan: planGoal({ ...g.goal, monthlyCapacityCents: paces[i] }, g.allocations, analysis.asOf) }));
  const before = allocateShortfalls(Math.max(0, available), base.map((b) => ({ goal: b.goal, plan: b.plan, paceCents: b.pace })));
  const after = allocateShortfalls(Math.max(0, availableAfter), base.map((b) => ({ goal: b.goal, plan: b.plan, paceCents: b.pace })));
  const extraOf = (p: AllocationProposal, id: string) => p.lines.find((l) => l.goalId === id)?.proposedCents ?? 0;

  const lines: GlobalGoalImpact[] = base.map((b) => {
    const xb = extraOf(before, b.goal.id), xa = extraOf(after, b.goal.id);
    const pb = planGoal({ ...b.goal, monthlyCapacityCents: b.pace + xb }, b.allocations, analysis.asOf);
    const pa = planGoal({ ...b.goal, monthlyCapacityCents: b.pace + xa }, b.allocations, analysis.asOf);
    return { goalId: b.goal.id, name: b.goal.name, kind: b.goal.kind, paceCents: b.pace, extraBeforeCents: xb, extraAfterCents: xa, before: pb, after: pa, monthsGained: gained(pb, pa) };
  });

  const individual: IndividualGoalImpact[] = base.map((b) => {
    const pa = planGoal({ ...b.goal, monthlyCapacityCents: b.pace + potential }, b.allocations, analysis.asOf);
    return { goalId: b.goal.id, name: b.goal.name, kind: b.goal.kind, paceBeforeCents: b.pace, paceAfterCents: b.pace + potential, before: b.plan, after: pa, monthsGained: gained(b.plan, pa), exclusive: true };
  });

  return {
    available: true,
    reason: potential === 0 ? 'no_adjustment' : null,
    current, applied,
    potentialMonthlyCents: potential,
    potentialAnnualCents: potential * 12,
    after: { capacityCents: afterCapacity },
    capacity: { estimatedCents: current.capacityCents, committedCents: committed, availableCents: available, availableAfterCents: availableAfter },
    reserve,
    allocation: {
      lines,
      allocatedBeforeCents: Math.max(0, available) - before.unallocatedCents,
      allocatedAfterCents: Math.max(0, availableAfter) - after.unallocatedCents,
      unallocatedAfterCents: after.unallocatedCents,
    },
    individual,
  };
}

// ---------------------------------------------------------------------------
// Réallocation proposée vers les objectifs
// ---------------------------------------------------------------------------
export interface AllocationProposal {
  lines: Array<{ goalId: string; requiredCents: Cents; proposedCents: Cents }>;
  unallocatedCents: Cents;
}

/**
 * Répartit une capacité mensuelle entre objectifs : objectifs en retard d'abord, puis par
 * échéance. Chaque objectif reçoit au plus ce qui lui manque (mensualité requise − rythme
 * actuel). La somme proposée ne dépasse jamais la capacité : aucune double allocation.
 */
export function allocateShortfalls(
  capacityCents: Cents,
  goals: ReadonlyArray<{ goal: Goal; plan: GoalPlan; paceCents?: Cents }>,
): AllocationProposal {
  let left = Math.max(0, capacityCents);
  const urgency = (s: GoalPlan['status']) => (s === 'overdue' ? 0 : s === 'behind' ? 1 : 2);
  const ordered = goals.filter((g) => g.plan.status !== 'achieved' && g.plan.remainingCents > 0)
    .sort((a, b) => urgency(a.plan.status) - urgency(b.plan.status)
      || (a.goal.targetDate < b.goal.targetDate ? -1 : a.goal.targetDate > b.goal.targetDate ? 1 : 0)
      || (a.goal.id < b.goal.id ? -1 : 1));
  const lines = ordered.map(({ goal, plan, paceCents }) => {
    const required = Math.max(0, plan.monthlyRequiredCents - (paceCents ?? 0));
    const proposed = Math.min(required, left);
    left -= proposed;
    return { goalId: goal.id, requiredCents: required, proposedCents: proposed };
  });
  return { lines, unallocatedCents: left };
}

/** Compatibilité : répartition sans rythme actuel connu. */
export function proposeAllocation(capacityCents: Cents, goals: ReadonlyArray<{ goal: Goal; plan: GoalPlan; paceCents?: Cents }>): AllocationProposal {
  return allocateShortfalls(capacityCents, goals);
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
  const after = analysis.months.filter((m) => m.complete && m.month > monthKey(baseline.createdOn));
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
