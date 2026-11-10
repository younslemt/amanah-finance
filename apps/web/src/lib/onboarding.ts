import type { LegalKind } from './legal/documents.ts';

/** Prochaine étape obligatoire du parcours d'accueil, ou null si l'utilisateur peut accéder à l'application. */
export function nextOnboardingStep(state: { missingConsents: readonly LegalKind[]; profileCompleted: boolean }): '/bienvenue/consentements' | '/bienvenue/profil' | null {
  if (state.missingConsents.length > 0) return '/bienvenue/consentements';
  if (!state.profileCompleted) return '/bienvenue/profil';
  return null;
}
