import { fr, type Messages } from '../messages/fr.ts';

const dictionaries: Record<string, Messages> = { fr };

/** V1 : français uniquement. La locale viendra du profil (profiles.locale). */
export function getMessages(locale = 'fr'): Messages {
  return dictionaries[locale.slice(0, 2)] ?? fr;
}

/** Remplace les {paramètres} d'un message. */
export function interpolate(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
