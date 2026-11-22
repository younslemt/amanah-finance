/**
 * Navigation Islamic-first (lot 3). Fonctions pures, testées sans navigateur.
 *
 * Cinq entrées, dans l'ordre des maquettes validées :
 * Accueil · Mes engagements (ou Finance islamique) · Projets · Budget · Patrimoine.
 *
 * Confidentialité (article 9) : sans consentement religieux en vigueur, la deuxième entrée
 * s'appelle « Finance islamique » et mène au contenu pédagogique ; aucune sous-entrée
 * (Zakat, Purification, Solidarité) n'est proposée. La navigation ne porte jamais de donnée
 * personnelle : ni montant, ni compteur, ni nom de projet.
 */

import { navEntries } from './presentation.ts';

export type NavIcon = 'home' | 'commitments' | 'goals' | 'budget' | 'wealth';

export interface NavChild { href: string; label: string; also: readonly string[] }

export interface NavItem {
  key: 'home' | 'commitments' | 'goals' | 'budget' | 'wealth';
  href: string;
  label: string;
  icon: NavIcon;
  /** Autres chemins qui rendent l'entrée active. */
  also: readonly string[];
  /** Sous-entrées (navigation latérale sur ordinateur). */
  children: readonly NavChild[];
}

export const COMMITMENT_CHILDREN: readonly NavChild[] = [
  { href: '/zakat', label: 'Zakat', also: [] },
  { href: '/purification', label: 'Purification', also: [] },
  { href: '/dons', label: 'Solidarité', also: [] },
];

type NavMeta = Omit<NavItem, 'href' | 'label'>;

/** Libellés et destinations : `navEntries` (lot 1) ; ici, icônes, chemins associés et sous-entrées. */
export function mainNavigation({ religiousEnabled }: { religiousEnabled: boolean }): NavItem[] {
  const religious = religiousEnabled === true;
  const meta: Record<string, NavMeta> = {
    '/dashboard': { key: 'home', icon: 'home', also: ['/recommandations'], children: [] },
    // Les pages Zakat, purification et dons affichent la porte de consentement sans lui :
    // l'entrée reste active pour garder l'orientation, sans révéler de donnée.
    '/finance-islamique': {
      key: 'commitments', icon: 'commitments',
      also: ['/zakat', '/purification', '/dons'], children: religious ? COMMITMENT_CHILDREN : [],
    },
    '/goals': { key: 'goals', icon: 'goals', also: [], children: [] },
    '/budget': { key: 'budget', icon: 'budget', also: ['/comptes', '/import'], children: [] },
    '/wealth': { key: 'wealth', icon: 'wealth', also: [], children: [] },
  };
  return navEntries(religious).map((e) => ({ ...e, ...meta[e.href]! }));
}

/** Le chemin est-il `href` ou une de ses sous-pages ? */
export function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isItemActive(item: Pick<NavItem, 'href' | 'also' | 'children'>, pathname: string): boolean {
  return isUnder(pathname, item.href) || item.also.some((h) => isUnder(pathname, h)) || item.children.some((c) => isUnder(pathname, c.href));
}

/** Sous-entrée active (une seule) : la plus spécifique. */
export function activeChild(item: Pick<NavItem, 'children'>, pathname: string): string | null {
  const hits = item.children.filter((c) => isUnder(pathname, c.href) || c.also.some((h) => isUnder(pathname, h)));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

// ---------------------------------------------------------------------------
// Menu profil
// ---------------------------------------------------------------------------

export interface ProfileMenuItem { id: 'accounts' | 'import' | 'recommendations' | 'settings' | 'display' | 'consents' | 'simulation'; label: string; href: string }

export interface ProfileMenu { items: ProfileMenuItem[]; signOut: boolean }

/**
 * Accès secondaires, regroupés derrière l'avatar. Chaque lien mène à un écran existant
 * et autorisé dans le contexte :
 * - Paramètres et Consentements n'existent qu'en mode réel (la démonstration n'a pas de compte) ;
 * - l'import exige un droit d'écriture (comme le bouton « + ») ;
 * - la date simulée n'existe qu'en démonstration ;
 * - la déconnexion n'existe qu'en mode réel.
 */
export function profileMenu(ctx: { mode: 'demo' | 'real'; canWrite: boolean }): ProfileMenu {
  const demo = ctx.mode === 'demo';
  const items: ProfileMenuItem[] = [
    { id: 'accounts', label: 'Mes comptes', href: '/comptes' },
  ];
  if (demo || ctx.canWrite) items.push({ id: 'import', label: 'Importer un relevé', href: '/import' });
  items.push({ id: 'recommendations', label: 'Mes recommandations', href: '/recommandations' });
  if (!demo) items.push({ id: 'settings', label: 'Paramètres', href: '/parametres' });
  items.push({ id: 'display', label: 'Préférences d’affichage', href: '/dashboard#affichage' });
  if (!demo) items.push({ id: 'consents', label: 'Consentements', href: '/parametres#consentements' });
  if (demo) items.push({ id: 'simulation', label: 'Date simulée', href: '/simulation' });
  return { items, signOut: !demo };
}

/** Initiale affichée dans l'avatar (prénom ou pseudonyme) ; null sans nom. */
export function avatarInitial(displayName: string | null): string | null {
  const t = displayName?.trim();
  if (!t) return null;
  const first = [...t][0]!;
  return first.toLocaleUpperCase('fr-BE');
}
