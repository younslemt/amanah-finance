/**
 * Dons et Sadaqah : conversion des lignes de la base vers le moteur des contributions
 * et préparation de l'affichage. Fonctions pures, testées sans base.
 */
import {
  beneficiaryHistory, fitrSettlements, matchCandidates, summarizeContributions, uniqueContributions, statusOf, zakatSettlements,
  type BankDebit, type Contribution, type ContributionKind, type ContributionStatus, type MatchCandidate, type Settlement,
} from '@amanah/engines';

/** Libellés des statuts : un rapprochement n'est ni une preuve de paiement ni une preuve de réception. */
export const STATUS_LABEL: Record<ContributionStatus, string> = {
  declared: 'Déclaré',
  bank_matched: 'Rapproché avec une opération bancaire',
  confirmed: 'Confirmé',
};

export const KIND_LABEL: Record<ContributionKind, string> = {
  zakat: 'Zakat',
  zakat_al_fitr: 'Zakat al-Fitr',
  sadaqah: 'Sadaqah',
  purification: 'Purification',
  waqf: 'Waqf',
  other: 'Autre don',
};

export interface ContributionRow {
  id: string; owner_id: string; kind: ContributionKind; amount_cents: number | string; paid_on: string;
  beneficiary_label: string | null; note?: string | null; transaction_id?: string | null;
  zakat_calculation_id?: string | null; zakat_fitr_id?: string | null;
  confirmation_source?: 'partner' | 'proof' | null; confirmed_on?: string | null;
}
export interface FitrRow { id: string; owner_id: string; civil_year: number; hijri_year?: number | null; hijri_year_status?: 'to_confirm' | 'confirmed' | null; persons: number; amount_per_person_cents: number | string; due_cents: number | string; amount_source: string }
export interface CalcSummaryRow { id: string; owner_id: string; as_of: string; status: 'to_determine' | 'below_nisab' | 'hawl_incomplete' | 'due'; zakat_due_cents: number | string }
export interface DebitRow { id: string; booked_on: string; amount_cents: number | string; description: string }

const n = (v: number | string): number => {
  const x = typeof v === 'string' ? Number(v) : v;
  if (!Number.isSafeInteger(x)) throw new RangeError('montant illisible');
  return x;
};

export function toContribution(r: ContributionRow): Contribution {
  return {
    id: r.id, kind: r.kind, amountCents: n(r.amount_cents), paidOn: r.paid_on,
    ...(r.beneficiary_label ? { beneficiary: r.beneficiary_label } : {}),
    ...(r.transaction_id ? { transactionId: r.transaction_id } : {}),
    ...(r.zakat_calculation_id ? { zakatCalculationId: r.zakat_calculation_id } : {}),
    ...(r.zakat_fitr_id ? { zakatFitrId: r.zakat_fitr_id } : {}),
    ...(r.confirmation_source && r.confirmed_on ? { confirmation: { source: r.confirmation_source, confirmedOn: r.confirmed_on } } : {}),
  };
}

export interface ContributionView {
  id: string;
  kind: ContributionKind;
  kindLabel: string;
  amountCents: number;
  paidOn: string;
  beneficiary: string;
  note: string | null;
  mine: boolean;
  /** Déclaré, rapproché avec une opération bancaire, ou confirmé (statut réservé, non activé). */
  status: ContributionStatus;
  /** Purification : créée par le parcours de purification, affichée ici sans être ressaisie. */
  fromPurification: boolean;
  /** Ce que le don règle (calcul de Zakat, Zakat al-Fitr d'une année), s'il est affecté. */
  allocation: string | null;
  /** Suppression et modification : dons déclarés de la personne, hors purification. */
  editable: boolean;
  /** Opérations bancaires pouvant être rapprochées du don (déclaré, propriétaire). */
  candidates: MatchCandidate[];
}

export interface DonationsModel {
  views: ContributionView[];
  years: ReturnType<typeof summarizeContributions>;
  beneficiaries: ReturnType<typeof beneficiaryHistory>;
  zakat: Array<Settlement & { asOf: string }>;
  fitr: Array<Settlement & { civilYear: number; hijriYear: { year: number; status: 'to_confirm' | 'confirmed' } | null; persons: number; amountPerPersonCents: number; source: string }>;
}

export function donationsModel(args: {
  userId: string;
  contributions: readonly ContributionRow[];
  fitr: readonly FitrRow[];
  calculations: readonly CalcSummaryRow[];
  debits: readonly DebitRow[];
}): DonationsModel {
  const rows = uniqueContributions(args.contributions);
  const all = rows.map(toContribution);
  // Les totaux et règlements portent sur les dons de la personne (ses obligations à elle)
  const mine = rows.filter((r) => r.owner_id === args.userId).map(toContribution);
  const linked = new Set(rows.map((r) => r.transaction_id).filter((x): x is string => Boolean(x)));
  const debits: BankDebit[] = args.debits.map((d) => ({ id: d.id, bookedOn: d.booked_on, amountCents: n(d.amount_cents), description: d.description }));
  const calcs = args.calculations.filter((c) => c.owner_id === args.userId);
  const fitr = args.fitr.filter((f) => f.owner_id === args.userId);
  const calcLabel = new Map(calcs.map((c) => [c.id, `calcul de Zakat du ${c.as_of.split('-').reverse().join('/')}`]));
  const fitrLabel = new Map(fitr.map((f) => [f.id, `Zakat al-Fitr, année civile ${f.civil_year}`]));

  const views = rows.map((r): ContributionView => {
    const c = toContribution(r);
    const own = r.owner_id === args.userId;
    const status = statusOf(c);
    return {
      id: r.id, kind: r.kind, kindLabel: KIND_LABEL[r.kind], amountCents: c.amountCents, paidOn: r.paid_on,
      beneficiary: r.beneficiary_label ?? 'Bénéficiaire non précisé', note: r.note ?? null, mine: own,
      status, fromPurification: r.kind === 'purification',
      allocation: (r.zakat_calculation_id && calcLabel.get(r.zakat_calculation_id)) || (r.zakat_fitr_id && fitrLabel.get(r.zakat_fitr_id)) || null,
      editable: own && r.kind !== 'purification',
      candidates: own && status === 'declared' ? matchCandidates(c, debits, linked).slice(0, 3) : [],
    };
  }).sort((a, b) => (a.paidOn < b.paidOn ? 1 : a.paidOn > b.paidOn ? -1 : a.id.localeCompare(b.id)));

  return {
    views,
    years: summarizeContributions(mine),
    beneficiaries: beneficiaryHistory(all.filter((c) => mine.some((m) => m.id === c.id))),
    zakat: zakatSettlements(calcs.map((c) => ({ id: c.id, dueCents: n(c.zakat_due_cents) })), mine)
      .map((s) => ({ ...s, asOf: calcs.find((c) => c.id === s.id)!.as_of })),
    fitr: fitrSettlements(fitr.map((f) => ({ id: f.id, dueCents: n(f.due_cents) })), mine).map((s) => {
      const f = fitr.find((x) => x.id === s.id)!;
      return { ...s, civilYear: f.civil_year, hijriYear: f.hijri_year && f.hijri_year_status ? { year: f.hijri_year, status: f.hijri_year_status } : null, persons: f.persons, amountPerPersonCents: n(f.amount_per_person_cents), source: f.amount_source };
    }),
  };
}
