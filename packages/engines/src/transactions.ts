import type { Cents, Currency } from './money.ts';
import type { IsoDate } from './dates.ts';
import { fnv1a64, normalizeLabel } from './text.ts';

/** Modèle canonique commun à la démo, au CSV et aux fournisseurs PSD2. */
export interface Transaction {
  id: string;
  accountId: string;
  bookedOn: IsoDate;
  amountCents: Cents; // négatif = débit
  currency: Currency;
  description: string;
  counterpartyName?: string;
  categorySlug?: string;
  isInterest?: boolean;
}

export interface CategorizationRule {
  pattern: string; // déjà normalisé (majuscules, sans accents)
  categorySlug: string;
  direction?: 'credit' | 'debit';
  priority: number; // plus petit = prioritaire
}

export interface CategoryInfo {
  slug: string;
  kind: 'income' | 'expense' | 'transfer';
  isEssential: boolean;
  isInterest: boolean;
}

export interface CategorizationResult {
  categorySlug: string;
  matchedPattern: string | null;
}

export const FALLBACK_EXPENSE = 'divers';
export const FALLBACK_INCOME = 'autres_revenus';

export function categorize(
  tx: Pick<Transaction, 'amountCents' | 'description' | 'counterpartyName'>,
  rules: readonly CategorizationRule[],
): CategorizationResult {
  const haystack = normalizeLabel(`${tx.description} ${tx.counterpartyName ?? ''}`);
  const direction = tx.amountCents >= 0 ? 'credit' : 'debit';
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || b.pattern.length - a.pattern.length);
  for (const rule of sorted) {
    if (rule.direction && rule.direction !== direction) continue;
    const needle = normalizeLabel(rule.pattern);
    if (needle && haystack.includes(needle)) {
      return { categorySlug: rule.categorySlug, matchedPattern: rule.pattern };
    }
  }
  return { categorySlug: direction === 'credit' ? FALLBACK_INCOME : FALLBACK_EXPENSE, matchedPattern: null };
}

/**
 * Empreinte de dédoublonnage : identique pour une même opération, qu'elle vienne
 * d'un CSV ou d'un fournisseur PSD2.
 */
export function dedupeHash(tx: Pick<Transaction, 'bookedOn' | 'amountCents' | 'description'> & { counterpartyIbanLast4?: string }, occurrence = 0): string {
  return fnv1a64([tx.bookedOn, tx.amountCents, normalizeLabel(tx.description), tx.counterpartyIbanLast4 ?? '', occurrence].join('|'));
}
