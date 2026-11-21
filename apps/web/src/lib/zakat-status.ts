/**
 * Présentation des montants de Zakat (lot 1). Fonction pure : elle ne calcule aucune Zakat,
 * elle met en forme un calcul et un règlement déjà produits par le moteur
 * (`prepareZakat` / `calculateZakat`, `zakatSettlements`).
 *
 * Cinq notions toujours distinctes :
 * 1. montant estimé : résultat du calcul selon les choix de la personne (méthode provisoire) ;
 * 2. provision virtuelle : somme mise de côté pour préparer le paiement — JAMAIS un paiement,
 *    jamais déduite ;
 * 3. contributions déclarées : paiements enregistrés par la personne et affectés à ce calcul ;
 * 4. dont rapprochées avec une opération bancaire (indice de paiement, pas une preuve de réception) ;
 * 5. dont confirmées (statut réservé ; aucune source activée aujourd'hui).
 * Les lignes 4 et 5 sont disjointes : le moteur classe chaque contribution sous son statut le plus
 * fort, et compte chaque contribution une seule fois.
 *
 * Rigueur :
 * - « Montant restant selon vos déclarations » = estimé − déclaré. Ce n'est ni un montant dû
 *   établi, ni un avis religieux : c'est l'écart entre une estimation et ce que la personne a déclaré.
 * - Calcul incomplet (choix manquants, prix trop ancien, aucun calcul) : AUCUN montant estimé ni
 *   restant n'est affiché comme établi ; les montants déclarés restent visibles.
 * - Montants affichés au centime près (aucun arrondi).
 */

export type ZakatLineKind = 'estimated' | 'provision' | 'declared' | 'bank_matched' | 'confirmed';

export interface ZakatLine {
  kind: ZakatLineKind;
  label: string;
  hint: string;
  /** null : pas de montant à afficher (calcul incomplet, provision non renseignée). */
  cents: number | null;
  /** Sous-ensemble de la ligne « déclarées » (affiché « dont … »). */
  subsetOfDeclared: boolean;
}

/** Pourquoi un calcul n'est pas complet. */
export type ZakatIncompleteReason = 'missing_choices' | 'price_stale' | 'no_calculation';

export type ZakatEstimate =
  | { complete: true; dueCents: number }
  | { complete: false; reason: ZakatIncompleteReason };

export interface ZakatStatusInput {
  estimate: ZakatEstimate;
  /** Contributions affectées à ce calcul, comptées une fois (moteur `zakatSettlements`). */
  paidCents: number;
  bankMatchedPaidCents: number;
  confirmedPaidCents: number;
  /** Provision virtuelle (null : non renseignée). */
  provisionCents: number | null;
}

export const REMAINING_LABEL = 'Montant restant selon vos déclarations' as const;

export interface ZakatStatusView {
  complete: boolean;
  incompleteReason: ZakatIncompleteReason | null;
  lines: ZakatLine[];
  remainingLabel: typeof REMAINING_LABEL;
  /** Estimé − déclaré (jamais négatif) ; null si le calcul est incomplet. La provision n'est pas déduite. */
  remainingCents: number | null;
  /** Contributions déclarées au-delà du montant estimé ; null si le calcul est incomplet. */
  excessCents: number | null;
  /** La provision couvre-t-elle le montant restant ? Information, pas un paiement. */
  provisionCoversRemaining: boolean | null;
}

const INCOMPLETE_HINT: Record<ZakatIncompleteReason, string> = {
  missing_choices: 'Calcul incomplet : des choix restent à faire',
  price_stale: 'Calcul à actualiser : le prix des métaux est trop ancien',
  no_calculation: 'Aucun calcul enregistré',
};

const assertAmount = (v: number, what: string) => {
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`${what} : montant invalide`);
};

export function zakatStatusView(input: ZakatStatusInput): ZakatStatusView {
  const { estimate, paidCents, bankMatchedPaidCents, confirmedPaidCents, provisionCents } = input;
  for (const [v, w] of [[paidCents, 'déclaré'], [bankMatchedPaidCents, 'rapproché'], [confirmedPaidCents, 'confirmé']] as const) assertAmount(v, w);
  if (estimate.complete) assertAmount(estimate.dueCents, 'estimé');
  if (provisionCents !== null) assertAmount(provisionCents, 'provision');
  if (bankMatchedPaidCents + confirmedPaidCents > paidCents) throw new RangeError('incohérence : sous-ensembles supérieurs au déclaré');

  const due = estimate.complete ? estimate.dueCents : null;
  const remainingCents = due === null ? null : Math.max(0, due - paidCents);
  return {
    complete: estimate.complete,
    incompleteReason: estimate.complete ? null : estimate.reason,
    lines: [
      {
        kind: 'estimated', label: 'Montant estimé', cents: due,
        hint: estimate.complete ? 'Estimation selon vos choix (méthode provisoire)' : INCOMPLETE_HINT[estimate.reason],
        subsetOfDeclared: false,
      },
      { kind: 'provision', label: 'Provision virtuelle', hint: 'Mise de côté pour préparer le paiement : ce n’est pas un paiement', cents: provisionCents, subsetOfDeclared: false },
      { kind: 'declared', label: 'Contributions déclarées', hint: 'Paiements que vous avez enregistrés', cents: paidCents, subsetOfDeclared: false },
      { kind: 'bank_matched', label: 'dont rapprochées avec une opération bancaire', hint: 'Retrouvées dans vos relevés : indice de paiement', cents: bankMatchedPaidCents, subsetOfDeclared: true },
      { kind: 'confirmed', label: 'dont confirmées', hint: 'Confirmation du bénéficiaire (non disponible aujourd’hui)', cents: confirmedPaidCents, subsetOfDeclared: true },
    ],
    remainingLabel: REMAINING_LABEL,
    remainingCents,
    excessCents: due === null ? null : Math.max(0, paidCents - due),
    provisionCoversRemaining: provisionCents === null || remainingCents === null ? null : provisionCents >= remainingCents,
  };
}
