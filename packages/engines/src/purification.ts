import type { Cents } from './money.ts';
import { assertCents } from './money.ts';
import { normalizeLabel } from './text.ts';
import type { Transaction } from './transactions.ts';

/**
 * Purification des revenus d'intérêts (Riba).
 * - Le moteur propose des candidats ; seul l'utilisateur confirme.
 * - Trois montants sont distingués : brut, précompte mobilier retenu, net crédité.
 * - La base de purification (brut ou net) n'est PAS imposée : tant qu'aucun
 *   référentiel validé ni choix explicite de l'utilisateur n'existe, le montant
 *   à purifier est « à déterminer ».
 * - La purification se distingue de la Zakat et de la Sadaqah et ne rend pas
 *   un produit financier conforme.
 */

export type PurificationStatus = 'detected' | 'confirmed' | 'rejected' | 'purified';
export type PurificationSource = 'bank_interest' | 'loyalty_bonus' | 'dividend_impure_share' | 'manual';
/** gross : montant brut avant précompte ; net_credited : montant effectivement crédité. */
export type PurificationBasis = 'gross' | 'net_credited';

export interface PurificationCandidate {
  transactionId: string;
  bookedOn: string;
  /** Montant net crédité sur le compte (seul montant connu d'un relevé). */
  creditedCents: Cents;
  sourceKind: PurificationSource;
  reason: string; // motif ou catégorie ayant déclenché la détection
}

export interface InterestAmounts {
  creditedCents: Cents;
  grossCents?: Cents | null;
  withholdingTaxCents?: Cents | null;
}

export interface ResolvedInterestAmounts {
  creditedCents: Cents;
  grossCents: Cents | null;
  withholdingTaxCents: Cents | null;
  consistent: boolean;
}

/** Complète le troisième montant si deux sont connus et vérifie leur cohérence : brut = net + précompte. */
export function resolveInterestAmounts(a: InterestAmounts): ResolvedInterestAmounts {
  assertCents(a.creditedCents, 'montant crédité');
  if (a.creditedCents <= 0) throw new RangeError('le montant crédité doit être positif');
  const gross = a.grossCents ?? null;
  const tax = a.withholdingTaxCents ?? null;
  if (gross !== null) assertCents(gross, 'montant brut');
  if (tax !== null) assertCents(tax, 'précompte');

  if (gross !== null && tax !== null) {
    return { creditedCents: a.creditedCents, grossCents: gross, withholdingTaxCents: tax, consistent: gross - tax === a.creditedCents && tax >= 0 };
  }
  if (tax !== null) {
    return { creditedCents: a.creditedCents, grossCents: a.creditedCents + tax, withholdingTaxCents: tax, consistent: tax >= 0 };
  }
  if (gross !== null) {
    const derived = gross - a.creditedCents;
    return { creditedCents: a.creditedCents, grossCents: gross, withholdingTaxCents: derived, consistent: derived >= 0 };
  }
  return { creditedCents: a.creditedCents, grossCents: null, withholdingTaxCents: null, consistent: true };
}

export type PurificationPendingReason = 'basis_not_chosen' | 'gross_unknown' | 'inconsistent_amounts';

export interface PurificationAmount {
  status: 'determined' | 'to_determine';
  basis: PurificationBasis | null;
  amountCents: Cents | null;
  reason: PurificationPendingReason | null;
  amounts: ResolvedInterestAmounts;
}

/**
 * Montant à purifier selon la base choisie (par l'utilisateur ou un référentiel validé).
 * Aucune base par défaut.
 */
export function purificationAmount(a: InterestAmounts, basis: PurificationBasis | null | undefined): PurificationAmount {
  const amounts = resolveInterestAmounts(a);
  const pending = (reason: PurificationPendingReason): PurificationAmount => ({ status: 'to_determine', basis: basis ?? null, amountCents: null, reason, amounts });
  if (!amounts.consistent) return pending('inconsistent_amounts');
  if (!basis) return pending('basis_not_chosen');
  if (basis === 'gross') {
    if (amounts.grossCents === null) return pending('gross_unknown');
    return { status: 'determined', basis, amountCents: amounts.grossCents, reason: null, amounts };
  }
  return { status: 'determined', basis, amountCents: amounts.creditedCents, reason: null, amounts };
}

/** Marqueurs normalisés (FR et NL). Les plus spécifiques d'abord. */
export const INTEREST_MARKERS: ReadonlyArray<{ marker: string; kind: PurificationSource }> = [
  { marker: 'PRIME DE FIDELITE', kind: 'loyalty_bonus' },
  { marker: 'GETROUWHEIDSPREMIE', kind: 'loyalty_bonus' },
  { marker: 'INTERETS CREDITEURS', kind: 'bank_interest' },
  { marker: 'INTERET DE BASE', kind: 'bank_interest' },
  { marker: 'BASISRENTE', kind: 'bank_interest' },
  { marker: 'CREDITRENTE', kind: 'bank_interest' },
  { marker: 'INTERETS', kind: 'bank_interest' },
  { marker: 'INTERET', kind: 'bank_interest' },
  { marker: 'INTEREST', kind: 'bank_interest' },
];

export function detectInterest(transactions: readonly Transaction[], alreadyTracked: ReadonlySet<string> = new Set()): PurificationCandidate[] {
  const out: PurificationCandidate[] = [];
  for (const tx of transactions) {
    if (tx.amountCents <= 0 || alreadyTracked.has(tx.id)) continue;
    const label = ` ${normalizeLabel(tx.description)} `;
    const hit = INTEREST_MARKERS.find((m) => label.includes(` ${m.marker} `));
    if (hit) {
      out.push({ transactionId: tx.id, bookedOn: tx.bookedOn, creditedCents: tx.amountCents, sourceKind: hit.kind, reason: `marker:${hit.marker}` });
    } else if (tx.isInterest || tx.categorySlug === 'interets') {
      out.push({ transactionId: tx.id, bookedOn: tx.bookedOn, creditedCents: tx.amountCents, sourceKind: 'bank_interest', reason: 'category:interets' });
    }
  }
  return out;
}

export interface PurificationItem {
  id: string;
  creditedCents: Cents;
  /** Montant à purifier une fois la base déterminée ; null tant qu'elle ne l'est pas. */
  amountToPurifyCents: Cents | null;
  status: PurificationStatus;
}

export interface PurificationSummary {
  /** Détectés, en attente de décision (montants nets crédités). */
  detectedCreditedCents: Cents;
  /** Confirmés et montant déterminé, pas encore donnés. */
  toPurifyCents: Cents;
  /** Confirmés mais base non déterminée : nombre et montant net crédité connu. */
  toDetermineCount: number;
  toDetermineCreditedCents: Cents;
  purifiedCents: Cents;
  rejectedCreditedCents: Cents;
}

export function summarizePurification(items: readonly PurificationItem[]): PurificationSummary {
  const s: PurificationSummary = { detectedCreditedCents: 0, toPurifyCents: 0, toDetermineCount: 0, toDetermineCreditedCents: 0, purifiedCents: 0, rejectedCreditedCents: 0 };
  for (const i of items) {
    if (i.status === 'detected') s.detectedCreditedCents += i.creditedCents;
    else if (i.status === 'rejected') s.rejectedCreditedCents += i.creditedCents;
    else if (i.amountToPurifyCents === null) {
      s.toDetermineCount += 1;
      s.toDetermineCreditedCents += i.creditedCents;
    } else if (i.status === 'confirmed') s.toPurifyCents += i.amountToPurifyCents;
    else s.purifiedCents += i.amountToPurifyCents;
  }
  return s;
}

const TRANSITIONS: Record<PurificationStatus, readonly PurificationStatus[]> = {
  detected: ['confirmed', 'rejected'],
  confirmed: ['purified', 'rejected'],
  rejected: ['detected'],
  purified: [],
};

/**
 * Vérifie qu'un changement de statut est permis. Un élément purifié est définitif,
 * et on ne peut pas marquer « purifié » un élément dont le montant n'est pas déterminé.
 */
export function canTransition(from: PurificationStatus, to: PurificationStatus, amountDetermined = true): boolean {
  if (to === 'purified' && !amountDetermined) return false;
  return TRANSITIONS[from].includes(to);
}
