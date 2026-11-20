/**
 * Financial Analysis Engine (Sprint 3, lot 3.1).
 *
 * Fonctions pures et déterministes : mêmes données → même analyse. Aucune horloge
 * (la date d'analyse est fournie), aucun accès réseau ni base.
 *
 * Règle d'or : chaque opération tombe dans UN SEUL compartiment, ce qui exclut
 * tout double comptage.
 *
 *   ignorée (autre devise) │ transfert │ intérêt │ remboursement │
 *   revenu régulier │ revenu exceptionnel │ charge fixe │ dépense variable │ dépense exceptionnelle
 *
 * « Essentiel » n'est pas un compartiment mais un attribut de la catégorie : les
 * dépenses essentielles sont une partie des dépenses fixes, variables ou exceptionnelles.
 */
import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import { daysBetween, monthKey, type IsoDate } from './dates.ts';
import { normalizeLabel } from './text.ts';
import type { CategoryInfo, Transaction } from './transactions.ts';
import { planEmergencyFund, type EmergencyFundPlan } from './budget.ts';

export type CategoryNature = 'fixed' | 'variable';

export interface AnalysisCategory extends CategoryInfo {
  /** Nature par défaut de la catégorie (référentiel) ; facultative. */
  defaultNature?: CategoryNature;
}

export interface AnalysisBudget {
  month: string; // AAAA-MM
  categorySlug: string;
  limitCents: Cents;
}

export interface AnalysisAccount {
  id: string;
  type: string;
  balanceCents: Cents;
  /** Choix de l'utilisateur ; absent = comptes d'épargne et d'épargne réglementée. */
  countsAsReserve?: boolean | null;
}

export interface AnalysisInput {
  asOf: IsoDate;
  transactions: readonly Transaction[];
  categories: readonly AnalysisCategory[];
  budgets?: readonly AnalysisBudget[];
  accounts?: readonly AnalysisAccount[];
  /** Nature choisie par le foyer, par catégorie (prioritaire sur tout le reste). */
  natureOverrides?: Readonly<Record<string, CategoryNature>>;
  /** Séries écartées par l'utilisateur (« ce n'est pas une dépense récurrente »). */
  notRecurring?: ReadonlySet<string>;
  /** Mois analysés (mois complets précédant la date d'analyse). */
  months?: number;
  /** Réserve cible en mois de dépenses essentielles. */
  reserveMonths?: 3 | 6;
  currency?: string;
}

/** Seuils de la méthode, publiés pour l'interface et la documentation. */
export const ANALYSIS_RULES = {
  /** Écart de montant toléré dans une série récurrente : ±10 %. */
  recurringAmountTolerancePermille: 100,
  /** Cadence mensuelle : 25 à 35 jours entre deux occurrences. */
  monthlyGapDays: [25, 35] as const,
  /** Cadence annuelle : 350 à 380 jours. */
  yearlyGapDays: [350, 380] as const,
  minMonthlyOccurrences: 3,
  minYearlyOccurrences: 2,
  /** Une série est « active » si la dernière occurrence date de moins de 45 jours (mensuel) ou 400 jours (annuel). */
  activeWithinDays: { monthly: 45, yearly: 400 } as const,
  /** Abonnement : catégorie de loisirs, télécoms ou divers et 150 € par mois au plus. */
  subscriptionSlugs: ['telecom', 'loisirs', 'divers', 'abonnements'] as readonly string[],
  subscriptionMaxCents: 15_000,
  /** Revenus réguliers par nature, même sans historique suffisant. */
  regularIncomeSlugs: ['salaire', 'allocations_familiales'] as readonly string[],
  /** Dépense exceptionnelle : non récurrente, variable, ≥ 300 € et ≥ 3 × la médiane mensuelle de sa catégorie. */
  exceptionalMinCents: 30_000,
  exceptionalMultiple: 3,
  /** Virement entre ses propres comptes : même montant, sens opposés, comptes différents, ≤ 3 jours. */
  internalTransferMaxDays: 3,
  /** Mois complets nécessaires pour chiffrer une capacité d'épargne. */
  minMonthsForCapacity: 3,
} as const;

export type Bucket =
  | 'skipped_currency' | 'transfer' | 'interest' | 'refund'
  | 'regular_income' | 'exceptional_income'
  | 'fixed_expense' | 'variable_expense' | 'exceptional_expense';

export type RecurringKind = 'income' | 'fixed_charge' | 'subscription' | 'recurring_expense';

export interface RecurringSeries {
  key: string;
  label: string;
  direction: 'credit' | 'debit';
  cadence: 'monthly' | 'yearly';
  kind: RecurringKind;
  categorySlug: string | null;
  occurrences: number;
  /** Montant habituel (positif), médiane des occurrences. */
  typicalAmountCents: Cents;
  /** Équivalent mensuel (annuel ÷ 12, arrondi bancaire). */
  monthlyEquivalentCents: Cents;
  lastDate: IsoDate;
  nextExpectedDate: IsoDate;
  active: boolean;
  transactionIds: string[];
}

export interface MonthAnalysis {
  month: string;
  regularIncomeCents: Cents;
  exceptionalIncomeCents: Cents;
  interestCents: Cents;
  refundCents: Cents;
  transferCents: Cents; // volume des mouvements internes ignorés (sorties + entrées)
  fixedExpenseCents: Cents;
  variableExpenseCents: Cents;
  exceptionalExpenseCents: Cents;
  essentialExpenseCents: Cents;
  totalIncomeCents: Cents; // régulier + exceptionnel (hors intérêts)
  totalExpenseCents: Cents; // fixe + variable + exceptionnel (remboursements déduits)
  /** Solde observé du mois : revenus − dépenses. */
  netCents: Cents;
  /** Dépense nette par catégorie (remboursements déduits). */
  categories: Record<string, Cents>;
}

export interface CategoryVariance {
  categorySlug: string;
  limitCents: Cents;
  /** Mois examinés (les 3 derniers mois complets avec un budget applicable). */
  months: Array<{ month: string; spentCents: Cents; limitCents: Cents; over: boolean }>;
  overMonths: number;
  repeated: boolean; // dépassé au moins 2 mois sur 3
  averageOverrunCents: Cents; // moyenne des dépassements des mois dépassés
  medianSpentCents: Cents;
}

export type Reliability = 'insufficient' | 'low' | 'medium' | 'high';

export interface SavingsCapacity {
  /** Solde médian réellement constaté (exceptionnels compris). null si données insuffisantes. */
  observedCents: Cents | null;
  /** Capacité structurelle : revenus réguliers − charges fixes − dépenses variables (médianes), hors exceptionnels. */
  estimatedCents: Cents | null;
  regularIncomeCents: Cents | null;
  fixedExpenseCents: Cents | null;
  variableExpenseCents: Cents | null;
  monthsUsed: number;
  reliability: Reliability;
}

export interface ReserveStatus extends EmergencyFundPlan {
  months: 3 | 6;
  avgEssentialMonthlyCents: Cents;
  accountIds: string[];
}

export interface FinancialAnalysis {
  asOf: IsoDate;
  /** Mois complets analysés, du plus ancien au plus récent (uniquement ceux couverts par les données). */
  months: MonthAnalysis[];
  monthsWithData: number;
  reliability: Reliability;
  capacity: SavingsCapacity;
  recurring: RecurringSeries[];
  variance: CategoryVariance[];
  /** Première catégorie de dépense variable non essentielle, en part des dépenses courantes. */
  concentration: { categorySlug: string; medianMonthlyCents: Cents; sharePermille: number } | null;
  reserve: ReserveStatus | null;
  /** Classement de chaque opération analysée (transparence, tests). */
  buckets: Record<string, Bucket>;
  skippedForeignCurrency: number;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : divRoundHalfEven(s[mid - 1] + s[mid], 2);
}

function addDays(iso: IsoDate, days: number): IsoDate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mois complets précédant la date d'analyse, du plus ancien au plus récent. */
export function completeMonthsBefore(asOf: IsoDate, count: number): string[] {
  const [y, m] = asOf.split('-').map(Number);
  const out: string[] = [];
  for (let i = count; i >= 1; i--) out.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return out;
}

/** Clé de regroupement d'une série : contrepartie (ou libellé) normalisée, sans nombres, 3 premiers mots. */
export function seriesKey(tx: Pick<Transaction, 'description' | 'counterpartyName' | 'amountCents'>): string {
  const base = normalizeLabel(tx.counterpartyName?.trim() ? tx.counterpartyName : tx.description)
    .split(' ').filter((w) => w && !/\d/.test(w)).slice(0, 3).join(' ');
  return `${tx.amountCents >= 0 ? 'C' : 'D'}:${base}`;
}

// ---------------------------------------------------------------------------
// Virements entre ses propres comptes
// ---------------------------------------------------------------------------
/** Paires débit/crédit de même montant entre deux comptes différents à 3 jours au plus. */
export function detectInternalTransfers(transactions: readonly Transaction[]): Set<string> {
  const ids = new Set<string>();
  const credits = transactions.filter((t) => t.amountCents > 0);
  const used = new Set<string>();
  const debits = transactions.filter((t) => t.amountCents < 0).sort((a, b) => (a.bookedOn < b.bookedOn ? -1 : a.bookedOn > b.bookedOn ? 1 : a.id < b.id ? -1 : 1));
  for (const d of debits) {
    const match = credits
      .filter((c) => !used.has(c.id) && c.accountId !== d.accountId && c.amountCents === -d.amountCents && c.currency === d.currency
        && Math.abs(daysBetween(d.bookedOn, c.bookedOn)) <= ANALYSIS_RULES.internalTransferMaxDays)
      .sort((a, b) => Math.abs(daysBetween(d.bookedOn, a.bookedOn)) - Math.abs(daysBetween(d.bookedOn, b.bookedOn)) || (a.id < b.id ? -1 : 1))[0];
    if (match) { used.add(match.id); ids.add(match.id); ids.add(d.id); }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Opérations récurrentes
// ---------------------------------------------------------------------------
export function detectRecurring(
  transactions: readonly Transaction[], asOf: IsoDate,
  categories: ReadonlyMap<string, AnalysisCategory>, excluded: ReadonlySet<string> = new Set(),
): RecurringSeries[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const key = seriesKey(t);
    if (key.endsWith(':') || excluded.has(key)) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }
  const out: RecurringSeries[] = [];
  for (const [key, list] of groups) {
    const typical = median(list.map((t) => Math.abs(t.amountCents)));
    const tol = divRoundHalfEven(typical * ANALYSIS_RULES.recurringAmountTolerancePermille, 1000);
    const kept = list.filter((t) => Math.abs(Math.abs(t.amountCents) - typical) <= tol)
      .sort((a, b) => (a.bookedOn < b.bookedOn ? -1 : a.bookedOn > b.bookedOn ? 1 : 0));
    // Une occurrence par période au plus : deux achats le même mois ne font pas une série mensuelle
    const gaps = kept.slice(1).map((t, i) => daysBetween(kept[i].bookedOn, t.bookedOn));
    const inRange = (g: number, [lo, hi]: readonly [number, number]) => g >= lo && g <= hi;
    let cadence: 'monthly' | 'yearly' | null = null;
    if (kept.length >= ANALYSIS_RULES.minMonthlyOccurrences && gaps.every((g) => inRange(g, ANALYSIS_RULES.monthlyGapDays))) cadence = 'monthly';
    else if (kept.length >= ANALYSIS_RULES.minYearlyOccurrences && gaps.every((g) => inRange(g, ANALYSIS_RULES.yearlyGapDays))) cadence = 'yearly';
    if (!cadence) continue;

    const amounts = kept.map((t) => Math.abs(t.amountCents));
    const amount = median(amounts);
    const slugCount = new Map<string, number>();
    for (const t of kept) if (t.categorySlug) slugCount.set(t.categorySlug, (slugCount.get(t.categorySlug) ?? 0) + 1);
    const categorySlug = [...slugCount.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]?.[0] ?? null;
    const cat = categorySlug ? categories.get(categorySlug) : undefined;
    if (cat?.kind === 'transfer' || cat?.isInterest) continue; // ni dépense ni revenu
    const direction = key.startsWith('C') ? 'credit' : 'debit';
    const monthly = cadence === 'monthly' ? amount : divRoundHalfEven(amount, 12);
    let kind: RecurringKind;
    if (direction === 'credit') kind = 'income';
    else if (categorySlug && ANALYSIS_RULES.subscriptionSlugs.includes(categorySlug) && monthly <= ANALYSIS_RULES.subscriptionMaxCents) kind = 'subscription';
    else if (cat?.defaultNature === 'fixed') kind = 'fixed_charge';
    else kind = 'recurring_expense';
    const last = kept[kept.length - 1].bookedOn;
    const step = cadence === 'monthly' ? Math.round(median(gaps)) : 365;
    out.push({
      key, label: (kept[kept.length - 1].counterpartyName?.trim() || kept[kept.length - 1].description).slice(0, 80),
      direction, cadence, kind, categorySlug, occurrences: kept.length,
      typicalAmountCents: amount, monthlyEquivalentCents: monthly,
      lastDate: last, nextExpectedDate: addDays(last, step),
      active: daysBetween(last, asOf) <= ANALYSIS_RULES.activeWithinDays[cadence],
      transactionIds: kept.map((t) => t.id),
    });
  }
  return out.sort((a, b) => b.monthlyEquivalentCents - a.monthlyEquivalentCents || (a.key < b.key ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Analyse complète
// ---------------------------------------------------------------------------
function reliabilityOf(months: number): Reliability {
  if (months < ANALYSIS_RULES.minMonthsForCapacity) return 'insufficient';
  if (months === 3) return 'low';
  if (months < 6) return 'medium';
  return 'high';
}

/** Plafond applicable : celui du mois, sinon le dernier fixé avant ce mois (reconduit). */
export function budgetFor(budgets: readonly AnalysisBudget[], month: string, slug: string): Cents | null {
  const candidates = budgets.filter((b) => b.categorySlug === slug && b.month <= month).sort((a, b) => (a.month < b.month ? 1 : -1));
  return candidates[0]?.limitCents ?? null;
}

export function analyzeFinances(input: AnalysisInput): FinancialAnalysis {
  const currency = input.currency ?? 'EUR';
  const window = completeMonthsBefore(input.asOf, input.months ?? 6);
  const firstMonth = window[0];
  const lastMonth = window[window.length - 1];
  const cats = new Map(input.categories.map((c) => [c.slug, c]));
  const inWindow = input.transactions.filter((t) => { const k = monthKey(t.bookedOn); return k >= firstMonth && k <= lastMonth; });

  // Mois couverts : à partir du premier mois commencé par les données (première opération au plus tard le 3)
  const earliest = [...input.transactions].map((t) => t.bookedOn).sort()[0];
  const covered = earliest === undefined ? [] : window.filter((m) => {
    const first = monthKey(earliest);
    return m > first || (m === first && Number(earliest.slice(8, 10)) <= 3);
  });

  const skipped = inWindow.filter((t) => t.currency !== currency);
  const txs = inWindow.filter((t) => t.currency === currency);
  const internal = detectInternalTransfers(txs);
  const recurring = detectRecurring(txs.filter((t) => !internal.has(t.id)), input.asOf, cats, input.notRecurring);
  const recurringOf = new Map<string, RecurringSeries>();
  for (const s of recurring) for (const id of s.transactionIds) recurringOf.set(id, s);

  const natureOf = (slug: string, series?: RecurringSeries): CategoryNature => {
    const override = input.natureOverrides?.[slug];
    if (override) return override;
    if (series && (series.kind === 'fixed_charge' || series.kind === 'subscription')) return 'fixed';
    return cats.get(slug)?.defaultNature ?? 'variable';
  };

  // Médiane mensuelle par catégorie (avant repérage des exceptionnels), pour le seuil « exceptionnel »
  const perCatMonth = new Map<string, Map<string, number>>();
  for (const t of txs) {
    if (t.amountCents >= 0 || internal.has(t.id)) continue;
    const slug = t.categorySlug ?? 'divers';
    const m = perCatMonth.get(slug) ?? new Map<string, number>();
    m.set(monthKey(t.bookedOn), (m.get(monthKey(t.bookedOn)) ?? 0) - t.amountCents);
    perCatMonth.set(slug, m);
  }

  const buckets: Record<string, Bucket> = {};
  for (const t of skipped) buckets[t.id] = 'skipped_currency';
  for (const t of txs) {
    const cat = t.categorySlug ? cats.get(t.categorySlug) : undefined;
    const series = recurringOf.get(t.id);
    let b: Bucket;
    if (internal.has(t.id) || cat?.kind === 'transfer') b = 'transfer';
    else if (t.amountCents > 0 && (t.isInterest || cat?.isInterest)) b = 'interest';
    else if (t.amountCents > 0 && cat?.kind === 'expense') b = 'refund';
    else if (t.amountCents > 0) {
      b = series?.kind === 'income' || (t.categorySlug && ANALYSIS_RULES.regularIncomeSlugs.includes(t.categorySlug)) ? 'regular_income' : 'exceptional_income';
    } else {
      const slug = t.categorySlug ?? 'divers';
      const nature = natureOf(slug, series);
      if (nature === 'fixed') b = 'fixed_expense';
      else {
        const amount = -t.amountCents;
        // Médiane mensuelle de la catégorie sur les mois couverts, hors cette opération
        const byMonth = perCatMonth.get(slug) ?? new Map<string, number>();
        const values = covered.map((m) => (byMonth.get(m) ?? 0) - (m === monthKey(t.bookedOn) ? amount : 0));
        const ref = median(values);
        const exceptional = !series && amount >= ANALYSIS_RULES.exceptionalMinCents && amount >= ref * ANALYSIS_RULES.exceptionalMultiple;
        b = exceptional ? 'exceptional_expense' : 'variable_expense';
      }
    }
    buckets[t.id] = b;
  }

  const months: MonthAnalysis[] = covered.map((month) => {
    const r: MonthAnalysis = {
      month, regularIncomeCents: 0, exceptionalIncomeCents: 0, interestCents: 0, refundCents: 0, transferCents: 0,
      fixedExpenseCents: 0, variableExpenseCents: 0, exceptionalExpenseCents: 0, essentialExpenseCents: 0,
      totalIncomeCents: 0, totalExpenseCents: 0, netCents: 0, categories: {},
    };
    for (const t of txs) {
      if (monthKey(t.bookedOn) !== month) continue;
      const b = buckets[t.id];
      const slug = t.categorySlug ?? (t.amountCents < 0 ? 'divers' : 'autres_revenus');
      const cat = cats.get(slug);
      switch (b) {
        case 'transfer': r.transferCents += Math.abs(t.amountCents); break;
        case 'interest': r.interestCents += t.amountCents; break;
        case 'regular_income': r.regularIncomeCents += t.amountCents; break;
        case 'exceptional_income': r.exceptionalIncomeCents += t.amountCents; break;
        case 'refund': {
          // Remboursement : déduit de la catégorie et du compartiment de sa nature (jamais compté comme revenu)
          r.refundCents += t.amountCents;
          r.categories[slug] = (r.categories[slug] ?? 0) - t.amountCents;
          if (natureOf(slug) === 'fixed') r.fixedExpenseCents -= t.amountCents; else r.variableExpenseCents -= t.amountCents;
          if (cat?.isEssential) r.essentialExpenseCents -= t.amountCents;
          break;
        }
        default: {
          const amount = -t.amountCents;
          if (b === 'fixed_expense') r.fixedExpenseCents += amount;
          else if (b === 'variable_expense') r.variableExpenseCents += amount;
          else r.exceptionalExpenseCents += amount;
          r.categories[slug] = (r.categories[slug] ?? 0) + amount;
          if (cat?.isEssential) r.essentialExpenseCents += amount;
        }
      }
    }
    r.totalIncomeCents = r.regularIncomeCents + r.exceptionalIncomeCents;
    r.totalExpenseCents = r.fixedExpenseCents + r.variableExpenseCents + r.exceptionalExpenseCents;
    r.netCents = r.totalIncomeCents - r.totalExpenseCents;
    return r;
  });

  // Capacité d'épargne
  const n = months.length;
  const reliability = reliabilityOf(n);
  const enough = reliability !== 'insufficient';
  const med = (f: (m: MonthAnalysis) => number) => median(months.map(f));
  const regular = enough ? med((m) => m.regularIncomeCents) : null;
  const fixed = enough ? med((m) => m.fixedExpenseCents) : null;
  const variable = enough ? med((m) => m.variableExpenseCents) : null;
  const capacity: SavingsCapacity = {
    observedCents: enough ? med((m) => m.netCents) : null,
    estimatedCents: enough ? regular! - fixed! - variable! : null,
    regularIncomeCents: regular, fixedExpenseCents: fixed, variableExpenseCents: variable,
    monthsUsed: n, reliability,
  };

  // Dépassements budgétaires (3 derniers mois couverts, plafond du mois ou reconduit)
  const budgets = input.budgets ?? [];
  const recent = months.slice(-3);
  const slugs = [...new Set(budgets.map((b) => b.categorySlug))].sort();
  const variance: CategoryVariance[] = [];
  for (const slug of slugs) {
    const rows = recent.map((m) => ({ m, limit: budgetFor(budgets, m.month, slug) }))
      .filter((x): x is { m: MonthAnalysis; limit: number } => x.limit !== null)
      .map(({ m, limit }) => { const spent = m.categories[slug] ?? 0; return { month: m.month, spentCents: spent, limitCents: limit, over: spent > limit }; });
    if (rows.length === 0) continue;
    const overs = rows.filter((r) => r.over);
    variance.push({
      categorySlug: slug,
      limitCents: rows[rows.length - 1].limitCents,
      months: rows,
      overMonths: overs.length,
      repeated: overs.length >= 2,
      averageOverrunCents: overs.length ? divRoundHalfEven(overs.reduce((s, r) => s + r.spentCents - r.limitCents, 0), overs.length) : 0,
      medianSpentCents: median(rows.map((r) => r.spentCents)),
    });
  }

  // Concentration : première catégorie variable non essentielle
  let concentration: FinancialAnalysis['concentration'] = null;
  if (enough) {
    const current = med((m) => m.fixedExpenseCents + m.variableExpenseCents);
    const allSlugs = new Set(months.flatMap((m) => Object.keys(m.categories)));
    const ranked = [...allSlugs]
      .filter((s) => !cats.get(s)?.isEssential && natureOf(s) === 'variable')
      .map((s) => ({ categorySlug: s, medianMonthlyCents: med((m) => m.categories[s] ?? 0) }))
      .filter((x) => x.medianMonthlyCents > 0)
      .sort((a, b) => b.medianMonthlyCents - a.medianMonthlyCents || (a.categorySlug < b.categorySlug ? -1 : 1));
    if (ranked[0] && current > 0) concentration = { ...ranked[0], sharePermille: divRoundHalfEven(ranked[0].medianMonthlyCents * 1000, current) };
  }

  // Réserve de précaution : dépenses essentielles médianes × N mois ; comptes d'épargne par défaut
  let reserve: ReserveStatus | null = null;
  if (enough && input.accounts) {
    const reserveAccounts = input.accounts.filter((a) => a.countsAsReserve ?? (a.type === 'savings' || a.type === 'regulated_savings'));
    const avgEssential = med((m) => m.essentialExpenseCents);
    const months3or6 = input.reserveMonths ?? 3;
    reserve = {
      ...planEmergencyFund(avgEssential, months3or6, reserveAccounts.reduce((s, a) => s + Math.max(0, a.balanceCents), 0)),
      months: months3or6, avgEssentialMonthlyCents: avgEssential, accountIds: reserveAccounts.map((a) => a.id),
    };
  }

  return {
    asOf: input.asOf, months, monthsWithData: n, reliability, capacity, recurring, variance, concentration, reserve,
    buckets, skippedForeignCurrency: skipped.length,
  };
}
