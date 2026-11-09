const LOCALE = 'fr-BE';

const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
const moneyRound = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Affichage uniquement : la division par 100 n'intervient jamais dans un calcul. */
export function formatCents(cents: number, opts: { round?: boolean } = {}): string {
  return (opts.round ? moneyRound : money).format(cents / 100);
}

export function formatPermille(permille: number): string {
  return `${Math.round(permille / 10)} %`;
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export function formatMonth(key: string): string {
  return monthFmt.format(new Date(`${key}-01T00:00:00Z`));
}
