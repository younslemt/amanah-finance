/**
 * Dates civiles au format ISO « AAAA-MM-JJ », sans fuseau horaire.
 * Les moteurs ne lisent jamais l'horloge : la date de référence est un paramètre.
 */

export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: IsoDate): number {
  const m = ISO.exec(value);
  if (!m) throw new SyntaxError(`date invalide : « ${value} »`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (new Date(t).toISOString().slice(0, 10) !== value) throw new RangeError(`date inexistante : « ${value} »`);
  return t;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / 86_400_000);
}

/** Nombre de mois entiers restants entre deux dates (au moins 0). */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const a = new Date(parseIsoDate(from));
  const b = new Date(parseIsoDate(to));
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function monthKey(date: IsoDate): string {
  parseIsoDate(date);
  return date.slice(0, 7);
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  parseIsoDate(iso);
  return iso;
}
