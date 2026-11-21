/**
 * Règles de présentation Islamic-first (lot 1). Fonctions pures, sans React ni stockage.
 *
 * - La préférence d'affichage (Islamic-first ou classique) est PRIVÉE et INDÉPENDANTE du
 *   consentement religieux : elle ne change que l'ordre des blocs, jamais ce qui peut être affiché.
 * - Sans consentement religieux en vigueur, aucun bloc ne reçoit de données religieuses
 *   personnalisées, quelle que soit la préférence : le bloc des engagements devient
 *   « Finance islamique », pédagogique.
 * - Aucun bloc financier essentiel n'est retiré, dans aucune variante.
 */

export type HomeLayout = 'islamic_first' | 'classic';
export const HOME_LAYOUTS: readonly HomeLayout[] = ['islamic_first', 'classic'];
export const DEFAULT_HOME_LAYOUT: HomeLayout = 'islamic_first';

export type HomeBlockId = 'situation' | 'commitments' | 'projects' | 'calendar' | 'wealth' | 'next_actions';

/**
 * full : bloc complet ; compact : résumé en lignes (engagements en affichage classique) ;
 * pedagogic : contenu général sans aucune donnée religieuse personnelle (sans consentement).
 */
export type HomeBlockVariant = 'full' | 'compact' | 'pedagogic';

export interface HomeBlock {
  id: HomeBlockId;
  title: string;
  variant: HomeBlockVariant;
  /** Le bloc peut-il afficher des données religieuses personnalisées ? */
  religiousData: boolean;
}

export interface Presentation {
  layout: HomeLayout;
  /** Vrai seulement avec un consentement religieux en vigueur. */
  showReligiousData: boolean;
  /** Libellé de la deuxième entrée de navigation et du bloc des engagements. */
  commitmentsLabel: 'Mes engagements' | 'Finance islamique';
  blocks: HomeBlock[];
}

const TITLES: Record<HomeBlockId, string> = {
  situation: 'Mon Amanah',
  commitments: 'Mes engagements',
  projects: 'Mes projets de vie',
  calendar: 'Mon calendrier Amanah',
  wealth: 'Mon patrimoine et mes valeurs',
  next_actions: 'Mes prochaines actions',
};

const ORDER: Record<HomeLayout, readonly HomeBlockId[]> = {
  // Islamic-first : les engagements juste après la situation financière
  islamic_first: ['situation', 'commitments', 'projects', 'calendar', 'wealth', 'next_actions'],
  // Classique : indicateurs financiers d'abord ; les engagements restent présents, en fin d'accueil
  classic: ['situation', 'next_actions', 'projects', 'wealth', 'calendar', 'commitments'],
};

/** Valeur stockée illisible ou absente : affichage par défaut (Islamic-first). */
export function parseHomeLayout(raw: unknown): HomeLayout {
  return typeof raw === 'string' && (HOME_LAYOUTS as readonly string[]).includes(raw) ? (raw as HomeLayout) : DEFAULT_HOME_LAYOUT;
}

export function resolvePresentation(args: { layoutPreference: unknown; religiousEnabled: boolean }): Presentation {
  const layout = parseHomeLayout(args.layoutPreference);
  const religious = args.religiousEnabled === true;
  const blocks = ORDER[layout].map((id): HomeBlock => {
    if (id === 'commitments') {
      if (!religious) return { id, title: 'Finance islamique', variant: 'pedagogic', religiousData: false };
      return { id, title: TITLES.commitments, variant: layout === 'classic' ? 'compact' : 'full', religiousData: true };
    }
    // Projets, calendrier, patrimoine, actions : données religieuses seulement avec consentement
    const mayCarryReligious = id === 'projects' || id === 'calendar' || id === 'wealth' || id === 'next_actions';
    return { id, title: TITLES[id], variant: 'full', religiousData: religious && mayCarryReligious };
  });
  return { layout, showReligiousData: religious, commitmentsLabel: religious ? 'Mes engagements' : 'Finance islamique', blocks };
}

export interface NavEntry { href: string; label: string }

/** Cinq entrées ; seule la deuxième change selon le consentement (même destination). */
export function navEntries(religiousEnabled: boolean): NavEntry[] {
  return [
    { href: '/dashboard', label: 'Accueil' },
    { href: '/finance-islamique', label: religiousEnabled ? 'Mes engagements' : 'Finance islamique' },
    { href: '/goals', label: 'Projets' },
    { href: '/budget', label: 'Budget' },
    { href: '/wealth', label: 'Patrimoine' },
  ];
}
