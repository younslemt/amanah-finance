/**
 * Textes des suggestions et du calendrier (le moteur renvoie des motifs, jamais de phrases).
 * Une suggestion n'est ni un conseil personnalisé ni un produit financier.
 */
import type { CalendarEvent, GoalTemplate, Suggestion, SuggestionGroup } from '@amanah/engines';

export const GROUP_LABEL: Record<SuggestionGroup, string> = {
  religious: 'Événements religieux', family: 'Famille et enfants', finance: 'Finances et logement', wealth: 'Patrimoine et long terme',
};
export const STATUS_LABEL = { new: 'Nouvelle', snoozed: 'Reportée', dismissed: 'Écartée', accepted: 'Projet créé' } as const;

const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export function suggestionExplanation(s: Suggestion): string {
  const capacity = s.capacityFullyEngaged ? ' Votre capacité d’épargne connue est déjà entièrement engagée : préparer ce projet demandera d’ajuster vos autres projets.' : '';
  switch (s.reason) {
    case 'no_emergency_fund': return `Aucune réserve d’urgence n’est prévue. Une réserve aide à faire face aux imprévus sans toucher à vos autres projets.${capacity}`;
    case 'upcoming_event': {
      const when = s.monthsUntil === 0 ? 'dans moins d’un mois' : `dans ${s.monthsUntil} mois`;
      return `Échéance ${s.indicativeDate ? 'indicative ' : ''}le ${dmy(s.dueDate!)} (${when}). L’anticiper permet de répartir la dépense sur plusieurs mois.${capacity}`;
    }
    case 'yearly_need': return `Dépense qui revient chaque année, d’après vos préférences : la préparer évite de la financer en une fois.${capacity}`;
    case 'declared_interest': return `Projet que vous avez indiqué dans vos préférences.${capacity}`;
  }
}

export const FREQUENCY_LABEL = (t: GoalTemplate) => (t.recurrence === 'yearly' ? 'Chaque année (chaque occurrence reste un projet distinct)' : 'Ponctuel');

export const EVENT_SOURCE_LABEL: Record<CalendarEvent['source'], string> = {
  school_calendar: 'calendrier scolaire choisi (indicatif)', tabular_estimate: 'estimation par calcul (non officielle)',
  confirmed_by_user: 'confirmée par vous', user: 'saisie par vous', goal: 'échéance d’un projet', detected: 'dépense annuelle détectée',
};
