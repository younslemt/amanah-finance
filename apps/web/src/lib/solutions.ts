/**
 * Point d'intégration des futurs partenaires (« Explorer les solutions pour concrétiser
 * mon projet »). AUCUN partenaire n'est référencé à ce stade : ni marketplace, ni offre,
 * ni transmission de données, ni intermédiation financière. Ce module décrit seulement
 * les familles de services envisagées par catégorie de projet, et le contrat qu'un futur
 * annuaire devra respecter.
 */
import type { GoalKind } from '@amanah/engines';

export type SolutionCategory = 'pilgrimage_organizer' | 'eid_provider' | 'savings_solution' | 'education_provider' | 'real_estate_professional';

export const SOLUTION_LABEL: Record<SolutionCategory, { title: string; description: string }> = {
  pilgrimage_organizer: { title: 'Organisateurs de Hajj et d’Omra', description: 'Agences agréées, forfaits, accompagnement sur place.' },
  eid_provider: { title: 'Prestataires pour l’Aïd al-Adha', description: 'Sacrifice ou quote-part, abattage agréé, sacrifice délégué.' },
  savings_solution: { title: 'Solutions d’épargne', description: 'Comptes et placements conformes à vos principes, pour mettre réellement l’argent de côté.' },
  education_provider: { title: 'Prestataires éducatifs', description: 'Établissements, formations, soutien scolaire.' },
  real_estate_professional: { title: 'Professionnels de l’immobilier', description: 'Agents, notaires, financement conforme.' },
};

const BY_KIND: Record<GoalKind, SolutionCategory[]> = {
  hajj: ['pilgrimage_organizer', 'savings_solution'],
  omra: ['pilgrimage_organizer', 'savings_solution'],
  eid_al_adha: ['eid_provider'],
  religious_other: ['savings_solution'],
  children_education: ['education_provider', 'savings_solution'],
  real_estate: ['real_estate_professional', 'savings_solution'],
  retirement: ['savings_solution'],
  family_savings: ['savings_solution'],
  emergency_fund: ['savings_solution'],
  personal: ['savings_solution'],
};

export const solutionCategoriesFor = (kind: GoalKind): SolutionCategory[] => BY_KIND[kind];

/** Contrat d'un futur annuaire. Aujourd'hui : aucun partenaire, aucune donnée transmise. */
export interface PartnerDirectory {
  /** Ne reçoit que la catégorie de service : jamais de données personnelles ou financières. */
  list(category: SolutionCategory): Promise<never[]>;
}
export const NO_PARTNERS: PartnerDirectory = { list: async () => [] };
