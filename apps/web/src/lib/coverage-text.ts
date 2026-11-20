/** Textes de la couverture des données et des virements à confirmer (français). */
import type { DataCoverage, CoverageIssue } from '@amanah/engines';
import { formatMonth } from './format.ts';

export const COVERAGE_LABEL: Record<DataCoverage['status'], string> = {
  complete: 'Couverture complète',
  partial: 'Couverture partielle',
  insufficient: 'Données insuffisantes',
};

export function coverageIssueText(i: CoverageIssue, accountName: (id: string) => string): string {
  const acc = accountName(i.accountId);
  switch (i.code) {
    case 'account_without_transactions': return `« ${acc} » n’a aucune opération : importez son relevé si ce compte est utilisé.`;
    case 'account_starts_later': return `« ${acc} » n’a des opérations qu’à partir de ${formatMonth(i.month!)} : les mois précédents peuvent être incomplets.`;
    case 'month_gap': return `Aucune opération sur « ${acc} » en ${formatMonth(i.month!)} : ce mois est exclu des calculs.`;
    case 'statement_stops_early': return `Le relevé de « ${acc} » s’arrête avant la fin de ${formatMonth(i.month!)} : ce mois est exclu des calculs.`;
    case 'account_stops_early': return `Plus d’opérations sur « ${acc} » en ${formatMonth(i.month!)} : ce mois est exclu des calculs.`;
    default: return '';
  }
}

export const TRANSFER_REASON: Record<string, string> = {
  user_confirmed: 'confirmé par vous',
  transfer_category: 'catégorie « virement / épargne »',
  iban_match: 'compte de contrepartie = l’un de vos comptes',
  transfer_label: 'libellé de virement entre comptes',
  same_day: 'même jour',
  ambiguous: 'plusieurs rapprochements possibles',
};
