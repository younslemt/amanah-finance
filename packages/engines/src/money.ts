/**
 * Arithmétique monétaire en centimes entiers.
 * Règle : aucun montant n'est jamais manipulé en flottant décimal.
 */

export type Currency = 'EUR' | 'GBP' | 'USD' | 'MAD' | 'CHF';
export type Cents = number;

/** Plafond de sécurité : au-delà, la multiplication par un taux sortirait des entiers exacts. */
export const MAX_SAFE_CENTS = 3_000_000_000_000; // 30 milliards d'euros

export function assertCents(value: number, label = 'montant'): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} doit être un entier de centimes (reçu ${value})`);
  }
  if (Math.abs(value) > MAX_SAFE_CENTS) {
    throw new RangeError(`${label} dépasse le plafond supporté`);
  }
}

export function sum(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) {
    assertCents(v);
    total += v;
  }
  return total;
}

/**
 * Arrondi bancaire (au pair le plus proche) d'une division entière.
 * Utilisé pour toute application de taux afin d'éviter les biais cumulés.
 */
export function divRoundHalfEven(numerator: number, denominator: number): number {
  if (denominator <= 0 || !Number.isInteger(denominator)) throw new RangeError('dénominateur invalide');
  if (!Number.isSafeInteger(numerator)) throw new RangeError('numérateur hors des entiers exacts');
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const q = Math.floor(n / denominator);
  const r = n - q * denominator;
  const twice = 2 * r;
  let result = q;
  if (twice > denominator || (twice === denominator && q % 2 === 1)) result = q + 1;
  return sign * result;
}

/** Applique un taux exprimé en parts pour 100 000 (2,5 % = 2 500 ; 2,577 % = 2 577). */
export function applyRatePer100k(cents: Cents, ratePer100k: number): Cents {
  assertCents(cents);
  if (!Number.isInteger(ratePer100k) || ratePer100k < 0) throw new RangeError('taux invalide');
  return divRoundHalfEven(cents * ratePer100k, 100_000);
}

/** Applique un ratio décimal (0 à 1), converti en parts pour 100 000. */
export function applyRatio(cents: Cents, ratio: number): Cents {
  if (!(ratio >= 0 && ratio <= 1)) throw new RangeError('ratio hors de [0, 1]');
  return applyRatePer100k(cents, Math.round(ratio * 100_000));
}

/** Valeur en centimes d'un poids de métal : milligrammes × pureté (‰) × prix du gramme. */
export function metalValueCents(weightMg: number, purityPermille: number, pricePerGramCents: Cents): Cents {
  if (!Number.isInteger(weightMg) || weightMg < 0) throw new RangeError('poids invalide');
  if (!Number.isInteger(purityPermille) || purityPermille < 1 || purityPermille > 1000) throw new RangeError('pureté invalide');
  assertCents(pricePerGramCents, 'prix du gramme');
  // mg × ‰ / 1 000 000 = grammes de métal fin
  return divRoundHalfEven(weightMg * purityPermille * pricePerGramCents, 1_000_000);
}

/** Convertit une saisie « 1 234,56 » ou « -12.5 » en centimes, sans passer par un flottant. */
export function parseAmountToCents(raw: string, decimalSeparator: ',' | '.' = ','): Cents {
  const cleaned = raw.trim().replace(/[\s  €]/g, '');
  if (cleaned === '') throw new SyntaxError('montant vide');
  const thousands = decimalSeparator === ',' ? '.' : ',';
  const normalized = cleaned.split(thousands).join('').replace(decimalSeparator, '.');
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) throw new SyntaxError(`montant illisible : « ${raw} »`);
  const [, sign, units, decimals = ''] = match;
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'));
  const value = sign === '-' ? -cents : cents;
  assertCents(value);
  return value;
}
