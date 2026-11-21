/**
 * Aïd al-Adha : budget de la famille, date et reconduction annuelle.
 *
 * - Le budget distingue le coût total (sacrifice ou quote-part, frais, contribution à un
 *   organisme) et ce que le foyer doit mettre de côté (coût total moins les contributions
 *   familiales annoncées).
 * - La date est saisie par l'utilisateur. Une ESTIMATION par le calendrier hégirien
 *   tabulaire peut être affichée : elle n'est jamais une confirmation officielle (l'Aïd
 *   dépend de l'observation du croissant et de l'autorité suivie ; écart possible de 1 à 2 jours).
 * - Chaque année est un projet distinct : la reconduction crée un nouveau projet, avec ses
 *   propres affectations, sans jamais reprendre ni fusionner les montants de l'année précédente.
 */
import type { Cents } from './money.ts';
import { assertCents } from './money.ts';
import type { IsoDate } from './dates.ts';

export interface EidBudgetInput {
  /** Sacrifice ou quote-part. */
  sacrificeCents: Cents;
  /** Frais complémentaires (transport, découpe, repas…). */
  extraCostsCents: Cents;
  /** Contribution prévue à un organisme (sacrifice délégué, don). */
  organizationCents: Cents;
  /** Contributions annoncées par d'autres membres de la famille. */
  familyContributionCents: Cents;
}

export interface EidBudget { totalCostCents: Cents; toSaveCents: Cents; familyShareCents: Cents }

export function eidBudget(b: EidBudgetInput): EidBudget {
  for (const [k, v] of Object.entries(b)) {
    assertCents(v, k);
    if (v < 0) throw new RangeError(`${k} négatif`);
  }
  const total = b.sacrificeCents + b.extraCostsCents + b.organizationCents;
  if (total <= 0) throw new RangeError('budget de l’Aïd nul');
  if (b.familyContributionCents >= total) throw new RangeError('les contributions familiales couvrent tout le budget : aucun montant à mettre de côté');
  return { totalCostCents: total, toSaveCents: total - b.familyContributionCents, familyShareCents: b.familyContributionCents };
}

// ---------------------------------------------------------------------------
// Estimation par le calendrier hégirien tabulaire (arithmétique, non officielle)
// ---------------------------------------------------------------------------
const ISLAMIC_EPOCH = 1948439.5;
const UNIX_EPOCH_JD = 2440587.5;

function islamicToJd(year: number, month: number, day: number): number {
  return day + Math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + ISLAMIC_EPOCH - 1;
}
function jdToIso(jd: number): IsoDate {
  return new Date(Math.round((jd - UNIX_EPOCH_JD) * 86_400_000)).toISOString().slice(0, 10);
}

export interface EidEstimate {
  hijriYear: number;
  date: IsoDate;
  method: 'tabular';
  /** Toujours vrai : une estimation n'est jamais une confirmation. */
  isEstimate: true;
}

/**
 * Date hégirienne (mois, jour) estimée pour chaque année hégirienne tombant dans l'année civile.
 * Ex. Ramadan : (9, 1) ; Aïd al-Fitr : (10, 1). Indicatif : jamais une confirmation.
 */
export function estimateHijriEvent(civilYear: number, month: number, day: number): EidEstimate[] {
  if (!Number.isInteger(civilYear) || civilYear < 2000 || civilYear > 2100) throw new RangeError('année civile hors plage (2000 à 2100)');
  const approx = Math.floor(((civilYear - 622) * 33) / 32);
  const out: EidEstimate[] = [];
  for (let h = approx - 2; h <= approx + 2; h++) {
    const date = jdToIso(islamicToJd(h, month, day));
    if (date.startsWith(`${civilYear}-`)) out.push({ hijriYear: h, date, method: 'tabular', isEstimate: true });
  }
  return out;
}

/** 10 dhou al-hijja des années hégiriennes tombant dans l'année civile (une, rarement deux). */
export function estimateEidAlAdha(civilYear: number): EidEstimate[] {
  if (!Number.isInteger(civilYear) || civilYear < 2000 || civilYear > 2100) throw new RangeError('année civile hors plage (2000 à 2100)');
  const approx = Math.floor(((civilYear - 622) * 33) / 32);
  const out: EidEstimate[] = [];
  for (let h = approx - 2; h <= approx + 2; h++) {
    const date = jdToIso(islamicToJd(h, 12, 10));
    if (date.startsWith(`${civilYear}-`)) out.push({ hijriYear: h, date, method: 'tabular', isEstimate: true });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Date retenue et reconduction
// ---------------------------------------------------------------------------
export type EidDateStatus = 'entered' | 'confirmed';

export interface EidPlan {
  goalId: string;
  civilYear: number;
  budget: EidBudgetInput;
  /** Date saisie par l'utilisateur (date de réalisation du projet). */
  date: IsoDate;
  dateStatus: EidDateStatus;
  /** Source indiquée par l'utilisateur (mosquée, autorité religieuse…), obligatoire pour « confirmée ». */
  dateSource?: string;
  /** Estimation affichée au moment de la saisie, conservée pour traçabilité. */
  estimatedDate?: IsoDate;
  previousGoalId?: string;
}

/** Libellé honnête de la date : jamais « officielle » sans confirmation sourcée par l'utilisateur. */
export function eidDateLabel(p: Pick<EidPlan, 'dateStatus' | 'dateSource'>): 'confirmed_by_user' | 'entered_unconfirmed' {
  return p.dateStatus === 'confirmed' && p.dateSource?.trim() ? 'confirmed_by_user' : 'entered_unconfirmed';
}

export type RenewalBlock = 'not_realized' | 'already_renewed' | 'next_year_exists';

/**
 * Peut-on proposer l'Aïd de l'année suivante ? Seulement après réalisation, une seule fois,
 * et s'il n'existe pas déjà un projet Aïd pour l'année suivante. La décision reste à l'utilisateur.
 */
export function renewalCheck(
  plan: Pick<EidPlan, 'goalId' | 'civilYear'>, realized: boolean, allPlans: ReadonlyArray<Pick<EidPlan, 'goalId' | 'civilYear' | 'previousGoalId'>>,
): { allowed: true; nextCivilYear: number } | { allowed: false; reason: RenewalBlock } {
  if (!realized) return { allowed: false, reason: 'not_realized' };
  if (allPlans.some((p) => p.previousGoalId === plan.goalId)) return { allowed: false, reason: 'already_renewed' };
  if (allPlans.some((p) => p.civilYear === plan.civilYear + 1)) return { allowed: false, reason: 'next_year_exists' };
  return { allowed: true, nextCivilYear: plan.civilYear + 1 };
}

/** Proposition pour l'année suivante : budget repris tel quel (modifiable), date à saisir, aucun montant reporté. */
export function renewalProposal(plan: EidPlan): { civilYear: number; budget: EidBudgetInput; estimates: EidEstimate[]; initialCents: 0 } {
  const civilYear = plan.civilYear + 1;
  return { civilYear, budget: { ...plan.budget }, estimates: estimateEidAlAdha(civilYear), initialCents: 0 };
}
