/**
 * Données FICTIVES de démonstration pour les dons et la Zakat al-Fitr.
 * Jamais mélangées aux données réelles : utilisées seulement en mode démonstration.
 */
import type { CalcSummaryRow, ContributionRow, DebitRow, FitrRow } from './contributions-view.ts';

export const DEMO_USER = 'demo-user';

export const DEMO_CONTRIBUTIONS: ContributionRow[] = [
  { id: 'demo-c1', owner_id: DEMO_USER, kind: 'zakat', amount_cents: 25_000, paid_on: '2026-11-12', beneficiary_label: 'Association caritative fictive', note: 'Premier versement', transaction_id: 'demo-d1', zakat_calculation_id: 'demo-calc' },
  { id: 'demo-c2', owner_id: DEMO_USER, kind: 'sadaqah', amount_cents: 5_000, paid_on: '2026-10-03', beneficiary_label: 'Banque alimentaire fictive', note: null },
  { id: 'demo-c3', owner_id: DEMO_USER, kind: 'zakat_al_fitr', amount_cents: 4_000, paid_on: '2026-03-18', beneficiary_label: 'Mosquée fictive du quartier', zakat_fitr_id: 'demo-fitr' },
  { id: 'demo-c4', owner_id: DEMO_USER, kind: 'purification', amount_cents: 2_457, paid_on: '2026-09-30', beneficiary_label: 'Organisme fictif', note: null },
  { id: 'demo-c5', owner_id: DEMO_USER, kind: 'sadaqah', amount_cents: 2_000, paid_on: '2025-12-24', beneficiary_label: 'Banque alimentaire fictive', note: null },
];
export const DEMO_FITR: FitrRow[] = [
  { id: 'demo-fitr', owner_id: DEMO_USER, year: 2026, persons: 4, amount_per_person_cents: 1_000, due_cents: 4_000, amount_source: 'Montant fictif communiqué par une mosquée de démonstration' },
];
export const DEMO_CALCS: CalcSummaryRow[] = [
  { id: 'demo-calc', owner_id: DEMO_USER, as_of: '2026-11-09', status: 'due', zakat_due_cents: 48_000 },
];
export const DEMO_DEBITS: DebitRow[] = [
  { id: 'demo-d1', booked_on: '2026-11-12', amount_cents: -25_000, description: 'VIREMENT ASSOCIATION FICTIVE' },
  { id: 'demo-d2', booked_on: '2026-10-04', amount_cents: -5_000, description: 'DON BANQUE ALIMENTAIRE FICTIVE' },
];
