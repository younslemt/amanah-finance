/** Questions posées aux testeurs de la démonstration (aucune donnée personnelle demandée). */
export const FEEDBACK_QUESTIONS = [
  'Sur quel appareil et quel navigateur avez-vous testé (ex. iPhone, Safari) ?',
  'Qu’avez-vous compris de l’accueil « Mon Amanah » en moins d’une minute ?',
  'Quel parcours avez-vous essayé (projet, Zakat, purification, calendrier, plan d’épargne) ? A-t-il abouti ?',
  'Qu’est-ce qui vous a semblé confus, lent ou incorrect ?',
  'L’identité islamique de l’application vous paraît-elle juste et respectueuse ?',
  'Utiliseriez-vous Amanah Finance avec vos vraies données ? Pourquoi ?',
  'Une note globale de 1 à 5, et une suggestion.',
] as const;

/** Lien mailto prérempli ; null si aucune adresse valide n'est configurée. */
export function feedbackMailto(address: string | undefined): string | null {
  const to = address?.trim();
  if (!to || !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(to)) return null;
  const body = ['Avis sur la démonstration Amanah Finance (données fictives)', '', ...FEEDBACK_QUESTIONS.map((q, i) => `${i + 1}. ${q}\n→ `)].join('\n');
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent('Avis — démonstration Amanah Finance')}&body=${encodeURIComponent(body)}`;
}
