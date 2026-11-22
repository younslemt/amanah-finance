/**
 * Page « Mes engagements » (lot 3) : modèle de vue construit CÔTÉ SERVEUR, fonction pure.
 * Elle ne calcule ni Zakat, ni purification : elle regroupe ce que produisent déjà les moteurs.
 *
 * Sources :
 * - Zakat : `zakatCommitment` (accueil, lot 2) — dernier calcul enregistré de la personne et ses
 *   contributions (`zakatSettlements`), sinon calcul courant ; historique : calculs de la personne ;
 * - purification : éléments enregistrés (`summarizePurification` + statuts) en mode réel,
 *   opérations détectées sur les relevés (`detectPurificationCandidates`) en démonstration ;
 * - solidarité : contributions de la personne (`summarizeContributions`, qui dédoublonne) pour
 *   l'année de référence, ventilées par type : chaque contribution est dans UN seul type.
 *
 * Règles :
 * - la provision virtuelle n'est affichée que si une source réelle existe (aucune aujourd'hui) ;
 *   elle n'est jamais un paiement ;
 * - un montant « à purifier » est un choix de la personne, jamais un transfert d'argent ;
 * - déclaration, rapprochement et confirmation restent distincts ;
 * - aucune donnée n'est produite sans consentement : l'appelant ne construit cette vue
 *   qu'avec le consentement religieux en vigueur.
 */
import { summarizeContributions, summarizePurification, uniqueContributions, type ContributionKind, type PurificationItem } from '@amanah/engines';
import { KIND_LABEL, toContribution, type CalcSummaryRow, type ContributionRow } from './contributions-view.ts';
import type { ZakatCommitment } from './home-view.ts';
import type { ZakatLine, ZakatStatusView } from './zakat-status.ts';

export type PurificationSource =
  /** Mode réel : éléments enregistrés (statuts et décisions de la personne ou partagés). */
  | { kind: 'items'; items: ReadonlyArray<Pick<PurificationItem, 'status' | 'creditedCents' | 'amountToPurifyCents'>> }
  /** Démonstration : opérations détectées sur les relevés fictifs ; aucune décision enregistrable. */
  | { kind: 'candidates'; count: number; creditedCents: number };

export interface EngagementsInput {
  asOf: string;
  userId: string;
  zakat: ZakatCommitment;
  calculations: readonly CalcSummaryRow[];
  contributions: readonly ContributionRow[];
  purification: PurificationSource;
}

export type SolidarityKey = 'zakat' | 'zakat_al_fitr' | 'sadaqah' | 'purification' | 'others';

export interface EngagementsView {
  zakat: {
    view: ZakatStatusView;
    /** Lignes à afficher : la provision n'apparaît que si elle a une source. */
    lines: ZakatLine[];
    basis: 'saved' | 'live';
    calculationAsOf: string | null;
    statusLabel: string;
    /** Nombre de calculs enregistrés par la personne (historique sur /zakat). */
    historyCount: number;
  };
  purification: {
    /** Opérations détectées en attente de décision. */
    detected: { count: number; creditedCents: number };
    /** Montants nécessitant un examen : détectés + confirmés dont la base reste à choisir. */
    toReviewCents: number;
    toDetermineCount: number;
    /** Décisions enregistrées (null : non enregistrables, démonstration). */
    decisions: { confirmed: number; rejected: number; purified: number; total: number } | null;
    /** Montant à purifier selon les choix de la personne (null : aucune décision enregistrable). */
    toPurifyCents: number | null;
    purifiedCents: number | null;
  };
  solidarity: {
    year: number;
    totalCents: number;
    count: number;
    declaredCents: number;
    bankMatchedCents: number;
    confirmedCents: number;
    lines: Array<{ key: SolidarityKey; label: string; cents: number; count: number }>;
    latest: { kindLabel: string; amountCents: number; paidOn: string } | null;
  };
}

const ZAKAT_STATUS: Record<NonNullable<ZakatCommitment['statusKey']>, string> = {
  due: 'Zakat estimée due selon vos choix',
  below_nisab: 'Patrimoine estimé sous le nisab',
  hawl_incomplete: 'Hawl pas encore écoulé',
  to_determine: 'Calcul incomplet : des choix restent à faire',
};

const SOLIDARITY_LINES: ReadonlyArray<{ key: SolidarityKey; label: string; kinds: readonly ContributionKind[] }> = [
  { key: 'zakat', label: 'Zakat', kinds: ['zakat'] },
  { key: 'zakat_al_fitr', label: KIND_LABEL.zakat_al_fitr, kinds: ['zakat_al_fitr'] },
  { key: 'sadaqah', label: KIND_LABEL.sadaqah, kinds: ['sadaqah'] },
  { key: 'purification', label: KIND_LABEL.purification, kinds: ['purification'] },
  { key: 'others', label: 'Autres dons (waqf, autres)', kinds: ['waqf', 'other'] },
];

export function zakatStatusLabel(z: Pick<ZakatCommitment, 'view' | 'statusKey'>): string {
  if (!z.view.complete) {
    return z.view.incompleteReason === 'price_stale' ? 'Calcul à actualiser : prix des métaux trop ancien' : 'Calcul incomplet : des choix restent à faire';
  }
  return z.statusKey ? ZAKAT_STATUS[z.statusKey] : 'Estimation courante, non enregistrée';
}

export function buildEngagementsView(input: EngagementsInput): EngagementsView {
  const { zakat: z } = input;
  const year = Number(input.asOf.slice(0, 4));

  // Zakat : la provision virtuelle n'a aujourd'hui aucune source dans le modèle → masquée
  const lines = z.view.lines.filter((l) => !(l.kind === 'provision' && l.cents === null));
  const historyCount = input.calculations.filter((c) => c.owner_id === input.userId).length;

  // Purification
  let purification: EngagementsView['purification'];
  if (input.purification.kind === 'items') {
    const items = input.purification.items;
    const sum = summarizePurification(items.map((i, k) => ({ id: String(k), ...i })));
    const count = (st: PurificationItem['status']) => items.filter((i) => i.status === st).length;
    const decisions = { confirmed: count('confirmed'), rejected: count('rejected'), purified: count('purified'), total: 0 };
    decisions.total = decisions.confirmed + decisions.rejected + decisions.purified;
    purification = {
      detected: { count: count('detected'), creditedCents: sum.detectedCreditedCents },
      toReviewCents: sum.detectedCreditedCents + sum.toDetermineCreditedCents,
      toDetermineCount: sum.toDetermineCount,
      decisions,
      toPurifyCents: sum.toPurifyCents,
      purifiedCents: sum.purifiedCents,
    };
  } else {
    const { count, creditedCents } = input.purification;
    purification = {
      detected: { count, creditedCents }, toReviewCents: creditedCents, toDetermineCount: 0,
      decisions: null, toPurifyCents: null, purifiedCents: null,
    };
  }

  // Solidarité : contributions de la personne, chacune comptée une fois et dans un seul type
  const mine = uniqueContributions(input.contributions).filter((c) => c.owner_id === input.userId);
  const summary = summarizeContributions(mine.map(toContribution)).find((y) => y.year === year);
  const ofYear = mine.filter((c) => c.paid_on.startsWith(`${year}-`))
    .sort((a, b) => (a.paid_on < b.paid_on ? 1 : a.paid_on > b.paid_on ? -1 : a.id.localeCompare(b.id)));
  const latest = ofYear[0];
  const solidarity: EngagementsView['solidarity'] = {
    year,
    totalCents: summary?.totalCents ?? 0,
    count: summary?.count ?? 0,
    declaredCents: summary?.declaredCents ?? 0,
    bankMatchedCents: summary?.bankMatchedCents ?? 0,
    confirmedCents: summary?.confirmedCents ?? 0,
    lines: SOLIDARITY_LINES.map((l) => ({
      key: l.key, label: l.label,
      cents: l.kinds.reduce((t, k) => t + (summary?.byKind[k].totalCents ?? 0), 0),
      count: l.kinds.reduce((t, k) => t + (summary?.byKind[k].count ?? 0), 0),
    })),
    latest: latest ? { kindLabel: KIND_LABEL[latest.kind], amountCents: toContribution(latest).amountCents, paidOn: latest.paid_on } : null,
  };

  return {
    zakat: { view: z.view, lines, basis: z.basis, calculationAsOf: z.calculationAsOf, statusLabel: zakatStatusLabel(z), historyCount },
    purification,
    solidarity,
  };
}
