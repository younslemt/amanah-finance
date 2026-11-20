/**
 * Contributions : Zakat, Zakat al-Fitr, Sadaqah, purification, waqf, autres dons.
 *
 * Principes :
 * - chaque contribution est comptée UNE fois (identifiant), quel que soit le nombre de vues
 *   qui la mentionnent (dons, Zakat, purification) : pas de double comptage ;
 * - une purification n'est créée que par le parcours de purification (contribution liée à
 *   des éléments purifiés) : le module de dons l'affiche, il ne la ressaisit jamais ;
 * - statut d'un don : « déclaré » (saisi par l'utilisateur) ; « rapproché » (associé par l'utilisateur
 *   à un débit importé compatible : indice de paiement, PAS une preuve de réception par le bénéficiaire) ;
 *   « confirmé » (réservé : preuve supplémentaire ou confirmation d'un partenaire fiable, non activé) ;
 *   (débit du même montant, à quelques jours) qu'il a importée ; aucun paiement n'est exécuté ;
 * - les affectations rattachent un don à ce qu'il règle : un calcul de Zakat, une Zakat
 *   al-Fitr d'une année, des éléments de purification.
 */
import type { Cents } from './money.ts';
import { assertCents } from './money.ts';
import { daysBetween, type IsoDate } from './dates.ts';

export const CONTRIBUTION_KINDS = ['zakat', 'zakat_al_fitr', 'sadaqah', 'purification', 'waqf', 'other'] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

/** Écart toléré entre la date déclarée et la date de l'opération bancaire rapprochée. */
export const CONTRIBUTION_MATCH_DAYS = 10;

export interface Contribution {
  id: string;
  kind: ContributionKind;
  amountCents: Cents;
  paidOn: IsoDate;
  beneficiary?: string;
  /** Opération bancaire (débit) rapprochée : le don est alors « rapproché », pas « confirmé ». */
  transactionId?: string;
  /**
   * Réservé au futur statut « confirmé » : preuve supplémentaire ou confirmation d'un partenaire
   * fiable. Jamais renseigné par l'utilisateur ; aucune source n'est activée à ce stade.
   */
  confirmation?: { source: 'partner' | 'proof'; confirmedOn: IsoDate };
  /** Affectations exclusives selon le type. */
  zakatCalculationId?: string;
  zakatFitrId?: string;
}

export type ContributionStatus = 'declared' | 'bank_matched' | 'confirmed';
/** Le statut le plus fort l'emporte : confirmé > rapproché > déclaré. */
export const statusOf = (c: Pick<Contribution, 'transactionId' | 'confirmation'>): ContributionStatus =>
  (c.confirmation ? 'confirmed' : c.transactionId ? 'bank_matched' : 'declared');

/** Une affectation n'a de sens que pour le type correspondant. */
export function allocationError(c: Pick<Contribution, 'kind' | 'zakatCalculationId' | 'zakatFitrId'>): string | null {
  if (c.zakatCalculationId && c.kind !== 'zakat') return 'zakat_calculation_requires_zakat';
  if (c.zakatFitrId && c.kind !== 'zakat_al_fitr') return 'zakat_fitr_requires_zakat_al_fitr';
  return null;
}

/** Retire les doublons d'identifiant (une contribution chargée par deux vues ne compte qu'une fois). */
export function uniqueContributions<T extends { id: string }>(list: readonly T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export interface KindTotals { totalCents: Cents; declaredCents: Cents; bankMatchedCents: Cents; confirmedCents: Cents; count: number }
export interface YearSummary {
  year: number;
  totalCents: Cents;
  declaredCents: Cents;
  bankMatchedCents: Cents;
  confirmedCents: Cents;
  count: number;
  byKind: Record<ContributionKind, KindTotals>;
}

const emptyKind = (): KindTotals => ({ totalCents: 0, declaredCents: 0, bankMatchedCents: 0, confirmedCents: 0, count: 0 });

/** Totaux par année puis par type ; années les plus récentes d'abord. */
export function summarizeContributions(list: readonly Contribution[]): YearSummary[] {
  const years = new Map<number, YearSummary>();
  for (const c of uniqueContributions(list)) {
    assertCents(c.amountCents, 'contribution');
    const y = Number(c.paidOn.slice(0, 4));
    let s = years.get(y);
    if (!s) {
      s = { year: y, totalCents: 0, declaredCents: 0, bankMatchedCents: 0, confirmedCents: 0, count: 0,
        byKind: Object.fromEntries(CONTRIBUTION_KINDS.map((k) => [k, emptyKind()])) as Record<ContributionKind, KindTotals> };
      years.set(y, s);
    }
    const k = s.byKind[c.kind];
    const status = statusOf(c);
    for (const t of [s, k]) {
      t.totalCents += c.amountCents;
      t.count += 1;
      if (status === 'confirmed') t.confirmedCents += c.amountCents;
      else if (status === 'bank_matched') t.bankMatchedCents += c.amountCents;
      else t.declaredCents += c.amountCents;
    }
  }
  return [...years.values()].sort((a, b) => b.year - a.year);
}

export interface Settlement {
  id: string;
  dueCents: Cents;
  paidCents: Cents;
  bankMatchedPaidCents: Cents;
  confirmedPaidCents: Cents;
  remainingCents: Cents;
  excessCents: Cents;
  contributionIds: string[];
}

function settle(id: string, dueCents: Cents, payments: readonly Contribution[]): Settlement {
  const paid = payments.reduce((s, c) => s + c.amountCents, 0);
  const by = (st: ContributionStatus) => payments.filter((c) => statusOf(c) === st).reduce((s, c) => s + c.amountCents, 0);
  return {
    id, dueCents, paidCents: paid, bankMatchedPaidCents: by('bank_matched'), confirmedPaidCents: by('confirmed'),
    remainingCents: Math.max(0, dueCents - paid), excessCents: Math.max(0, paid - dueCents),
    contributionIds: payments.map((c) => c.id),
  };
}

/** Zakat due d'un calcul enregistré face aux contributions qui lui sont affectées. */
export function zakatSettlements(
  calculations: ReadonlyArray<{ id: string; dueCents: Cents }>, contributions: readonly Contribution[],
): Settlement[] {
  const list = uniqueContributions(contributions).filter((c) => c.kind === 'zakat');
  return calculations.map((calc) => settle(calc.id, calc.dueCents, list.filter((c) => c.zakatCalculationId === calc.id)));
}

/** Zakat al-Fitr d'une année face aux contributions qui lui sont affectées. */
export function fitrSettlements(
  obligations: ReadonlyArray<{ id: string; dueCents: Cents }>, contributions: readonly Contribution[],
): Settlement[] {
  const list = uniqueContributions(contributions).filter((c) => c.kind === 'zakat_al_fitr');
  return obligations.map((o) => settle(o.id, o.dueCents, list.filter((c) => c.zakatFitrId === o.id)));
}

export interface BankDebit { id: string; bookedOn: IsoDate; amountCents: Cents; description: string }
export interface MatchCandidate { transactionId: string; bookedOn: IsoDate; description: string; distanceDays: number }

/**
 * Opérations bancaires pouvant prouver un don : débit du même montant, à
 * CONTRIBUTION_MATCH_DAYS jours au plus, pas déjà rapproché d'une autre contribution.
 * Les plus proches en date d'abord. Le rapprochement reste une décision de l'utilisateur.
 */
export function matchCandidates(
  c: Pick<Contribution, 'amountCents' | 'paidOn'>, debits: readonly BankDebit[], alreadyLinked: ReadonlySet<string> = new Set(),
): MatchCandidate[] {
  return debits
    .filter((d) => d.amountCents === -c.amountCents && !alreadyLinked.has(d.id))
    .map((d) => ({ transactionId: d.id, bookedOn: d.bookedOn, description: d.description, distanceDays: Math.abs(daysBetween(c.paidOn, d.bookedOn)) }))
    .filter((m) => m.distanceDays <= CONTRIBUTION_MATCH_DAYS)
    .sort((a, b) => a.distanceDays - b.distanceDays || (a.bookedOn < b.bookedOn ? -1 : 1));
}

export interface BeneficiaryTotal { label: string; totalCents: Cents; count: number; lastPaidOn: IsoDate }

/** Bénéficiaires déjà utilisés (libellé normalisé), du plus récent au plus ancien. */
export function beneficiaryHistory(list: readonly Contribution[]): BeneficiaryTotal[] {
  const map = new Map<string, BeneficiaryTotal>();
  for (const c of uniqueContributions(list)) {
    const label = c.beneficiary?.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    const key = label.toLocaleLowerCase('fr');
    const b = map.get(key) ?? { label, totalCents: 0, count: 0, lastPaidOn: c.paidOn };
    b.totalCents += c.amountCents; b.count += 1;
    if (c.paidOn > b.lastPaidOn) { b.lastPaidOn = c.paidOn; b.label = label; }
    map.set(key, b);
  }
  return [...map.values()].sort((a, b) => (a.lastPaidOn < b.lastPaidOn ? 1 : a.lastPaidOn > b.lastPaidOn ? -1 : a.label.localeCompare(b.label)));
}
