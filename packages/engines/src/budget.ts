import type { Cents } from './money.ts';
import { divRoundHalfEven } from './money.ts';
import { monthKey } from './dates.ts';
import type { CategoryInfo, Transaction } from './transactions.ts';

export interface BudgetLine {
  categorySlug: string;
  limitCents: Cents;
}

export interface CategorySpending {
  categorySlug: string;
  spentCents: Cents; // positif
  limitCents: Cents | null;
  remainingCents: Cents | null;
  status: 'no_budget' | 'ok' | 'warning' | 'over';
}

export interface MonthSummary {
  month: string; // AAAA-MM
  incomeCents: Cents;
  expenseCents: Cents; // positif
  interestIncomeCents: Cents; // exclu des revenus « propres », à purifier
  netCents: Cents;
  savingsRatePermille: number | null;
  essentialExpenseCents: Cents;
  /** Remboursements reçus sur des catégories de dépense (déduits de ces dépenses). */
  refundCents: Cents;
  /** Opérations ignorées car dans une autre devise que celle du budget. */
  skippedForeignCurrencyCount: number;
  categories: CategorySpending[];
}

/** Seuil d'alerte : 85 % du budget consommé. */
export const WARNING_PERMILLE = 850;

export function summarizeMonth(
  month: string,
  transactions: readonly Transaction[],
  categories: readonly CategoryInfo[],
  budget: readonly BudgetLine[] = [],
  currency = 'EUR',
): MonthSummary {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const spent = new Map<string, number>();
  let income = 0;
  let expense = 0;
  let interest = 0;
  let essential = 0;
  let refunds = 0;
  let skipped = 0;

  for (const tx of transactions) {
    if (monthKey(tx.bookedOn) !== month) continue;
    if (tx.currency !== currency) { skipped += 1; continue; } // pas de conversion implicite
    const cat = tx.categorySlug ? bySlug.get(tx.categorySlug) : undefined;
    if (cat?.kind === 'transfer') continue; // virements internes et épargne : ni revenu ni dépense
    const slug = tx.categorySlug ?? 'divers';
    if (tx.amountCents > 0 && cat?.kind === 'expense') {
      // Remboursement (retour d'achat, trop-perçu) : réduit la dépense, n'est pas un revenu
      refunds += tx.amountCents;
      expense -= tx.amountCents;
      if (cat.isEssential) essential -= tx.amountCents;
      spent.set(slug, (spent.get(slug) ?? 0) - tx.amountCents);
    } else if (tx.amountCents > 0) {
      if (tx.isInterest || cat?.isInterest) interest += tx.amountCents;
      else income += tx.amountCents;
    } else {
      const amount = -tx.amountCents;
      expense += amount;
      if (cat?.isEssential) essential += amount;
      spent.set(slug, (spent.get(slug) ?? 0) + amount);
    }
  }

  const limits = new Map(budget.map((b) => [b.categorySlug, b.limitCents]));
  const slugs = new Set([...spent.keys(), ...limits.keys()]);
  const lines: CategorySpending[] = [...slugs].map((slug) => {
    const s = spent.get(slug) ?? 0;
    const limit = limits.get(slug) ?? null;
    let status: CategorySpending['status'] = 'no_budget';
    if (limit !== null) {
      if (s > limit) status = 'over';
      else if (limit > 0 && s * 1000 >= limit * WARNING_PERMILLE) status = 'warning';
      else status = 'ok';
    }
    return { categorySlug: slug, spentCents: s, limitCents: limit, remainingCents: limit === null ? null : limit - s, status };
  });
  lines.sort((a, b) => b.spentCents - a.spentCents);

  const net = income - expense;
  return {
    month,
    incomeCents: income,
    expenseCents: expense,
    interestIncomeCents: interest,
    netCents: net,
    savingsRatePermille: income > 0 ? divRoundHalfEven(net * 1000, income) : null,
    essentialExpenseCents: essential,
    refundCents: refunds,
    skippedForeignCurrencyCount: skipped,
    categories: lines,
  };
}

export interface EmergencyFundPlan {
  targetCents: Cents;
  currentCents: Cents;
  gapCents: Cents;
  coveragePermille: number;
  monthsCovered: number; // en dixièmes de mois, arrondi
}

/**
 * Réserve de précaution : N mois de dépenses essentielles moyennes.
 * Les dépenses essentielles moyennes sont fournies par l'appelant (moyenne des 3 à 6 derniers mois).
 */
export function planEmergencyFund(avgEssentialMonthlyCents: Cents, months: 3 | 6, currentCents: Cents): EmergencyFundPlan {
  const target = avgEssentialMonthlyCents * months;
  return {
    targetCents: target,
    currentCents,
    gapCents: Math.max(0, target - currentCents),
    coveragePermille: target > 0 ? Math.min(1000, divRoundHalfEven(currentCents * 1000, target)) : 1000,
    monthsCovered: avgEssentialMonthlyCents > 0 ? divRoundHalfEven(currentCents * 10, avgEssentialMonthlyCents) / 10 : 0,
  };
}
