/**
 * Actions rapides du bouton « + » (lot 1). Fonction pure : seules des actions RÉELLEMENT
 * opérationnelles dans le contexte courant sont proposées — jamais de bouton inactif.
 *
 * Disponibilité (reflète les écrans existants) :
 * - démonstration : création de projet, mise de côté et échéance (dépôt de démonstration) ;
 *   saisie d'opérations, dons et import y sont désactivés, donc absents ;
 * - mode réel : il faut un rôle qui permet l'écriture ; l'opération et l'import exigent un compte ;
 *   le don exige le consentement religieux en vigueur (écran /dons) ;
 * - mettre de côté exige au moins un projet actif.
 * Aucune action disponible : pas de bouton « + » du tout.
 */

export type QuickActionId = 'add_operation' | 'allocate_to_goal' | 'create_goal' | 'add_calendar_event' | 'record_contribution' | 'import_statement';

export interface QuickAction { id: QuickActionId; label: string; hint: string; href: string; religious: boolean }

export interface QuickActionContext {
  mode: 'demo' | 'real';
  /** Mode réel : rôle propriétaire ou membre (lecture seule sinon). Ignoré en démonstration. */
  canWrite: boolean;
  religiousEnabled: boolean;
  hasAccount: boolean;
  hasActiveGoal: boolean;
}

interface Rule extends QuickAction { demo: boolean; needsAccount?: boolean; needsActiveGoal?: boolean; needsConsent?: boolean }

export const QUICK_ACTIONS: readonly Rule[] = [
  { id: 'add_operation', label: 'Ajouter une opération', hint: 'Dépense ou revenu, saisi à la main', href: '/budget', religious: false, demo: false, needsAccount: true },
  { id: 'allocate_to_goal', label: 'Mettre de côté pour un projet', hint: 'Affectation à un projet existant', href: '/goals', religious: false, demo: true, needsActiveGoal: true },
  { id: 'create_goal', label: 'Créer un projet', hint: 'Catalogue de modèles ou projet libre', href: '/goals/nouveau', religious: false, demo: true },
  { id: 'add_calendar_event', label: 'Ajouter une échéance', hint: 'Personnelle ou familiale', href: '/goals/calendrier', religious: false, demo: true },
  { id: 'record_contribution', label: 'Enregistrer un don', hint: 'Zakat, Sadaqah ou autre don', href: '/dons', religious: true, demo: false, needsConsent: true },
  { id: 'import_statement', label: 'Importer un relevé', hint: 'Fichier CSV de votre banque', href: '/import', religious: false, demo: false, needsAccount: true },
];

export function availableQuickActions(ctx: QuickActionContext): QuickAction[] {
  const demo = ctx.mode === 'demo';
  if (!demo && !ctx.canWrite) return [];
  return QUICK_ACTIONS.filter((r) => {
    if (demo && !r.demo) return false;
    if (r.needsAccount && !ctx.hasAccount) return false;
    if (r.needsActiveGoal && !ctx.hasActiveGoal) return false;
    if (r.needsConsent && !ctx.religiousEnabled) return false;
    return true;
  }).map(({ id, label, hint, href, religious }) => ({ id, label, hint, href, religious }));
}
