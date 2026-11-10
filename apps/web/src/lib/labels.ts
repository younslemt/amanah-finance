import type { CategoryInfo } from '@amanah/engines';
import { fr } from '../messages/fr.ts';

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  current: 'Compte courant', savings: 'Compte d’épargne', regulated_savings: 'Épargne réglementée', cash: 'Espèces',
  credit_card: 'Carte de crédit', other: 'Autre', investment: 'Placement', pension: 'Épargne-pension', loan: 'Prêt',
};

/** Libellé d'une catégorie : traduction des catégories système, libellé saisi pour les personnelles. */
export function categoryLabel(slug: string, categories: readonly CategoryInfo[] = []): string {
  return fr.categories[slug] ?? categories.find((c) => c.slug === slug)?.label ?? slug;
}

/** Catégories proposées à la saisie, triées par libellé (virements internes exclus). */
export function selectableCategories(categories: readonly CategoryInfo[], kind: 'income' | 'expense') {
  return categories.filter((c) => c.kind === kind)
    .map((c) => ({ slug: c.slug, label: categoryLabel(c.slug, categories) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}
