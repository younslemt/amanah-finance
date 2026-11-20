/**
 * Décisions de purification : fonctions pures qui appliquent le moteur
 * (canTransition, resolveInterestAmounts, purificationAmount) avant toute écriture.
 * La base de données impose les mêmes règles (migrations 0007 et 0013).
 */
import {
  canTransition, purificationAmount, resolveInterestAmounts, summarizePurification,
  type PurificationBasis, type PurificationItem, type PurificationStatus, type PurificationSummary,
} from '@amanah/engines';

export interface PurificationRow {
  id: string;
  owner_id: string;
  transaction_id: string | null;
  source_kind: 'bank_interest' | 'loyalty_bonus' | 'dividend_impure_share' | 'manual';
  credited_cents: number | string;
  gross_cents: number | string | null;
  withholding_tax_cents: number | string | null;
  basis: PurificationBasis | null;
  amount_to_purify_cents: number | string | null;
  status: PurificationStatus;
  occurred_on: string;
  detection_reason: string | null;
  contribution_id: string | null;
  transactions?: { description: string | null } | null;
}

const n = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));

export type ReviewDecision = 'confirm' | 'reject' | 'restore' | 'unconfirm';
const TARGET: Record<ReviewDecision, PurificationStatus> = { confirm: 'confirmed', reject: 'rejected', restore: 'detected', unconfirm: 'detected' };

export type ReviewUpdate = {
  status: PurificationStatus;
  gross_cents: number | null;
  withholding_tax_cents: number | null;
  basis: PurificationBasis | null;
  basis_source: 'user_choice' | null;
  amount_to_purify_cents: number | null;
};

/**
 * Prépare la mise à jour d'un élément : transition autorisée, montants cohérents
 * (brut = net + précompte), montant à purifier selon la méthodologie choisie
 * (aucune par défaut : « à déterminer »).
 */
export function planReview(row: PurificationRow, decision: ReviewDecision, input: { gross: number | null; withholding: number | null }, basis: PurificationBasis | null):
  { ok: true; update: ReviewUpdate } | { ok: false; message: string } {
  const to = TARGET[decision];
  if (!canTransition(row.status, to)) return { ok: false, message: 'Cette décision n’est pas possible pour cet élément.' };
  const credited = Number(row.credited_cents);
  const gross = input.gross ?? (input.withholding === null ? n(row.gross_cents) : null);
  const withholding = input.withholding ?? (input.gross === null ? n(row.withholding_tax_cents) : null);
  const amounts = resolveInterestAmounts({ creditedCents: credited, grossCents: gross, withholdingTaxCents: withholding });
  if (!amounts.consistent) return { ok: false, message: 'Montants incohérents : le brut doit être égal au net crédité augmenté du précompte.' };
  const base = { status: to, gross_cents: amounts.grossCents, withholding_tax_cents: amounts.withholdingTaxCents };
  if (to !== 'confirmed') return { ok: true, update: { ...base, basis: null, basis_source: null, amount_to_purify_cents: null } };
  const a = purificationAmount(amounts, basis);
  return a.status === 'determined'
    ? { ok: true, update: { ...base, basis: a.basis, basis_source: 'user_choice', amount_to_purify_cents: a.amountCents } }
    : { ok: true, update: { ...base, basis: null, basis_source: null, amount_to_purify_cents: null } };
}

export interface PurificationView {
  id: string;
  label: string;
  sourceKind: PurificationRow['source_kind'];
  occurredOn: string;
  status: PurificationStatus;
  creditedCents: number;
  grossCents: number | null;
  withholdingCents: number | null;
  amountToPurifyCents: number | null;
  /** Montant indicatif selon la méthodologie actuelle (éléments non confirmés). */
  previewCents: number | null;
  pendingReason: 'basis_not_chosen' | 'gross_unknown' | 'inconsistent_amounts' | null;
  mine: boolean;
}

export function purificationViews(rows: readonly PurificationRow[], basis: PurificationBasis | null, userId: string): PurificationView[] {
  return rows.map((r) => {
    const resolved = { creditedCents: Number(r.credited_cents), grossCents: n(r.gross_cents), withholdingTaxCents: n(r.withholding_tax_cents) };
    const a = purificationAmount(resolved, r.status === 'confirmed' || r.status === 'purified' ? r.basis ?? basis : basis);
    const stored = n(r.amount_to_purify_cents);
    return {
      id: r.id, label: r.transactions?.description || 'Opération', sourceKind: r.source_kind, occurredOn: r.occurred_on,
      status: r.status, creditedCents: resolved.creditedCents, grossCents: a.amounts.grossCents, withholdingCents: a.amounts.withholdingTaxCents,
      amountToPurifyCents: stored, previewCents: stored ?? a.amountCents,
      pendingReason: stored !== null ? null : a.reason, mine: r.owner_id === userId,
    };
  });
}

export function purificationSummary(rows: readonly PurificationRow[]): PurificationSummary {
  const items: PurificationItem[] = rows.map((r) => ({
    id: r.id, creditedCents: Number(r.credited_cents), amountToPurifyCents: n(r.amount_to_purify_cents), status: r.status,
  }));
  return summarizePurification(items);
}
