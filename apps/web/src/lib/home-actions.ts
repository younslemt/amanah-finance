/**
 * Passerelles entre observations et actions (lot 1). Fonction pure : elle relie des résultats
 * DÉJÀ produits par les moteurs existants (purification, calendrier, plan d'épargne, Zakat,
 * parcours des projets) à l'écran où la personne peut agir. Elle ne calcule rien de nouveau.
 *
 * Règles :
 * - les libellés invitent à examiner : jamais d'obligation religieuse ni de conseil réglementé ;
 * - sans consentement religieux, aucune passerelle religieuse (même si des données arrivaient) ;
 * - le NOM d'un projet religieux (Hajj, Omra, Aïd…) révèle une conviction : il n'apparaît jamais
 *   sans consentement, ni dans une observation, ni dans une destination ;
 * - chaque destination est un écran existant (vérifié par les tests).
 */
import { formatCents, formatDate } from './format.ts';

export type HomeActionKind = 'zakat' | 'purification' | 'late_goal' | 'upcoming_event' | 'available_capacity';

export interface HomeAction {
  id: string;
  kind: HomeActionKind;
  /** Ce qui a été observé, en une ligne. */
  observation: string;
  /** Libellé du lien d'action. */
  cta: string;
  href: string;
  religious: boolean;
}

export type ZakatObservation = 'missing_choices' | 'price_stale' | 'hawl_due_soon' | 'up_to_date';

export interface HomeActionInput {
  religiousEnabled: boolean;
  asOf: string;
  /** Intérêts détectés par le moteur de purification, ni confirmés ni écartés. */
  purificationPendingCount: number;
  /** État du calcul de Zakat (null : aucun calcul possible, rien à signaler). */
  zakat: { state: ZakatObservation; hawlEndsOn?: string } | null;
  /** Projets en retard sur leur plan (parcours existant) ; `religious` : catégorie religieuse du projet. */
  lateGoals: ReadonlyArray<{ id: string; name: string; religious: boolean }>;
  /** Événements à venir du calendrier familial, avec la suggestion correspondante s'il y en a une. */
  upcomingEvents: ReadonlyArray<{ id: string; label: string; date: string; religious: boolean; hasGoal: boolean; suggestionHref: string | null }>;
  /** Capacité d'épargne mensuelle encore disponible (plan d'épargne). */
  availableCapacityCents: number;
}

/** Fenêtre d'anticipation d'un événement du calendrier. */
export const EVENT_HORIZON_DAYS = 120;
/** En dessous, la capacité disponible n'est pas signalée. */
export const MIN_CAPACITY_CENTS = 1_000;

const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);

const ZAKAT_TEXT: Record<Exclude<ZakatObservation, 'up_to_date'>, (hawl?: string) => string> = {
  missing_choices: () => 'Calcul de la Zakat : des choix restent à faire',
  price_stale: () => 'Calcul de la Zakat : le prix des métaux est à actualiser',
  hawl_due_soon: (hawl) => (hawl ? `Zakat à actualiser : fin du hawl le ${formatDate(hawl)}` : 'Zakat à actualiser : fin du hawl proche'),
};

/** Toutes les passerelles applicables, par ordre de priorité ; `limit` pour l'accueil. */
export function homeActions(input: HomeActionInput, limit = 3): HomeAction[] {
  const religious = input.religiousEnabled === true;
  const out: HomeAction[] = [];

  if (religious && input.zakat && input.zakat.state !== 'up_to_date') {
    out.push({ id: 'zakat', kind: 'zakat', observation: ZAKAT_TEXT[input.zakat.state](input.zakat.hawlEndsOn), cta: 'Accéder au calcul', href: '/zakat', religious: true });
  }
  if (religious && input.purificationPendingCount > 0) {
    const n = input.purificationPendingCount;
    out.push({ id: 'purification', kind: 'purification', observation: n === 1 ? '1 intérêt détecté à examiner' : `${n} intérêts détectés à examiner`, cta: 'Examiner la purification', href: '/purification', religious: true });
  }
  for (const g of input.lateGoals) {
    // Projet religieux sans consentement : ni son nom ni son lien ne sont exposés
    if (g.religious && !religious) continue;
    out.push({ id: `late:${g.id}`, kind: 'late_goal', observation: `${g.name} : en retard sur son plan`, cta: 'Comparer les scénarios', href: `/goals/${encodeURIComponent(g.id)}`, religious: g.religious });
  }
  for (const e of input.upcomingEvents) {
    if (e.religious && !religious) continue;
    if (e.hasGoal || !e.suggestionHref) continue;
    const d = daysUntil(input.asOf, e.date);
    if (d < 0 || d > EVENT_HORIZON_DAYS) continue;
    out.push({ id: `event:${e.id}`, kind: 'upcoming_event', observation: `${e.label} le ${formatDate(e.date)}`, cta: 'Préparer un objectif', href: e.suggestionHref, religious: e.religious });
  }
  if (input.availableCapacityCents >= MIN_CAPACITY_CENTS) {
    out.push({ id: 'capacity', kind: 'available_capacity', observation: `${formatCents(input.availableCapacityCents, { round: true })} par mois encore disponibles`, cta: 'Revoir mes projets', href: '/budget/plan-epargne', religious: false });
  }
  return out.slice(0, Math.max(0, limit));
}
