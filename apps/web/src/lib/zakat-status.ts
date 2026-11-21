/**
 * Présentation des montants de Zakat (lot 1). Fonction pure : elle ne calcule aucune Zakat,
 * elle met en forme un règlement déjà produit par le moteur (`zakatSettlements`).
 *
 * Cinq notions toujours distinctes :
 * 1. montant estimé : résultat du calcul (méthode provisoire) ;
 * 2. provision virtuelle : somme mise de côté pour préparer le paiement — JAMAIS un paiement,
 *    jamais déduite du reste à verser ;
 * 3. contributions déclarées : paiements enregistrés par la personne et affectés à ce calcul ;
 * 4. dont rapprochées avec une opération bancaire (indice de paiement, pas une preuve de réception) ;
 * 5. dont confirmées (statut réservé ; aucune source activée aujourd'hui).
 * Les lignes 4 et 5 sont disjointes : une contribution confirmée n'est pas recomptée comme rapprochée.
 *
 * Pas de double comptage : les lignes 4 et 5 sont des sous-ensembles de la ligne 3 (le moteur
 * compte chaque contribution une seule fois) ; le reste à verser = estimé − déclaré, jamais moins
 * la provision.
 */
import type { Settlement } from '@amanah/engines';

export type ZakatLineKind = 'estimated' | 'provision' | 'declared' | 'bank_matched' | 'confirmed';

export interface ZakatLine {
  kind: ZakatLineKind;
  label: string;
  hint: string;
  cents: number | null;
  /** Sous-ensemble de la ligne « déclarées » (affiché « dont … »). */
  subsetOfDeclared: boolean;
}

export interface ZakatStatusView {
  lines: ZakatLine[];
  /** Estimé − déclaré (jamais négatif) ; la provision n'est pas déduite. */
  remainingCents: number;
  /** Contributions affectées au-delà du montant estimé. */
  excessCents: number;
  /** La provision couvre-t-elle le reste à verser ? Information, pas un paiement. */
  provisionCoversRemaining: boolean | null;
}

const assertAmount = (v: number, what: string) => {
  if (!Number.isInteger(v) || v < 0) throw new RangeError(`${what} : montant invalide`);
};

export function zakatStatusView(settlement: Pick<Settlement, 'dueCents' | 'paidCents' | 'bankMatchedPaidCents' | 'confirmedPaidCents'>, provisionCents: number | null): ZakatStatusView {
  const { dueCents, paidCents, bankMatchedPaidCents, confirmedPaidCents } = settlement;
  for (const [v, w] of [[dueCents, 'estimé'], [paidCents, 'déclaré'], [bankMatchedPaidCents, 'rapproché'], [confirmedPaidCents, 'confirmé']] as const) assertAmount(v, w);
  if (provisionCents !== null) assertAmount(provisionCents, 'provision');
  // Sous-ensembles disjoints du déclaré (le moteur classe chaque contribution sous son statut le plus fort)
  if (bankMatchedPaidCents + confirmedPaidCents > paidCents) throw new RangeError('incohérence : sous-ensemble supérieur au déclaré');

  const remainingCents = Math.max(0, dueCents - paidCents);
  return {
    lines: [
      { kind: 'estimated', label: 'Montant estimé', hint: 'Calcul selon vos choix (méthode provisoire)', cents: dueCents, subsetOfDeclared: false },
      { kind: 'provision', label: 'Provision virtuelle', hint: 'Mise de côté pour préparer le paiement : ce n’est pas un paiement', cents: provisionCents, subsetOfDeclared: false },
      { kind: 'declared', label: 'Contributions déclarées', hint: 'Paiements que vous avez enregistrés', cents: paidCents, subsetOfDeclared: false },
      { kind: 'bank_matched', label: 'dont rapprochées avec une opération bancaire', hint: 'Retrouvées dans vos relevés : indice de paiement', cents: bankMatchedPaidCents, subsetOfDeclared: true },
      { kind: 'confirmed', label: 'dont confirmées', hint: 'Confirmation du bénéficiaire (non disponible aujourd’hui)', cents: confirmedPaidCents, subsetOfDeclared: true },
    ],
    remainingCents,
    excessCents: Math.max(0, paidCents - dueCents),
    provisionCoversRemaining: provisionCents === null ? null : provisionCents >= remainingCents,
  };
}
