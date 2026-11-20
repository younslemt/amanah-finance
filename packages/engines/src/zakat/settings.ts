/**
 * Préparation d'un calcul de Zakat à partir des choix de la personne.
 *
 * - Aucune option méthodologique n'est choisie à sa place : une option qui change le
 *   résultat (année, bijoux, placements, pensions bloquées, dettes) doit être choisie
 *   explicitement, sinon le calcul n'est pas lancé et les choix manquants sont listés.
 * - Une option sans effet (aucun bien concerné) n'est pas demandée ; la valeur neutre
 *   transmise au moteur est signalée comme « sans objet » dans les entrées enregistrées.
 * - La base du nisab et le début du Hawl restent gérés par le moteur (« à déterminer »).
 * - Le calcul est reproductible : les entrées complètes du moteur sont conservées et
 *   `replayZakat` refait le calcul pour vérifier qu'il donne le même résultat.
 */
import type { Cents, Currency } from '../money.ts';
import { assertCents } from '../money.ts';
import type { IsoDate } from '../dates.ts';
import { calculateZakat, priceStatus, type MetalPrice, type ZakatAsset, type ZakatInput, type ZakatLiability, type ZakatOptions, type ZakatResult } from './engine.ts';
import { ENGINE_VERSION } from './ruleset.ts';

export interface ZakatChoices {
  nisabBasis?: 'gold' | 'silver' | null;
  yearBasis?: 'lunar' | 'solar' | null;
  hawlStart?: IsoDate | null;
  personalJewelry?: 'include' | 'exclude' | null;
  longTermInvestments?: 'full_market_value' | 'custom_ratio' | null;
  /** Part retenue des placements à long terme, en parts pour 100 000 (0 à 100 000). */
  longTermRatioPer100k?: number | null;
  lockedPensions?: 'exclude' | 'include' | null;
  debts?: 'due_12_months' | 'none' | 'all' | null;
  /** Biens ou dettes du foyer que la personne ne retient pas pour SA Zakat (biens d'un autre membre…). */
  excludedSourceIds?: readonly string[];
}

export type ZakatChoiceKey = 'yearBasis' | 'personalJewelry' | 'longTermInvestments' | 'lockedPensions' | 'debts';

/** Options qui changent le résultat compte tenu des biens et dettes retenus. */
export function requiredZakatChoices(assets: readonly ZakatAsset[], liabilities: readonly ZakatLiability[]): ZakatChoiceKey[] {
  const req: ZakatChoiceKey[] = ['yearBasis'];
  if (assets.some((a) => a.kind === 'jewelry_personal')) req.push('personalJewelry');
  if (assets.some((a) => a.kind === 'stocks_funds' && a.heldFor !== 'trading')) req.push('longTermInvestments');
  if (assets.some((a) => (a.kind === 'pension' || a.kind === 'group_insurance' || a.kind === 'life_insurance') && a.isAccessible === false)) req.push('lockedPensions');
  if (liabilities.length > 0) req.push('debts');
  return req;
}

export interface PreparedZakat {
  /** Null tant qu'un choix nécessaire manque. */
  input: ZakatInput | null;
  missing: ZakatChoiceKey[];
  /** Options transmises au moteur sans effet sur le résultat (aucun bien concerné). */
  notApplicable: ZakatChoiceKey[];
  excludedSourceIds: string[];
}

export function prepareZakat(args: {
  asOf: IsoDate;
  currency: Currency;
  choices: ZakatChoices;
  assets: readonly ZakatAsset[];
  liabilities: readonly ZakatLiability[];
  prices: { gold?: MetalPrice | null; silver?: MetalPrice | null };
}): PreparedZakat {
  const { choices: c } = args;
  const excluded = new Set(c.excludedSourceIds ?? []);
  const assets = args.assets.filter((a) => !excluded.has(a.id));
  const liabilities = args.liabilities.filter((l) => !excluded.has(l.id));
  const required = requiredZakatChoices(assets, liabilities);

  const ratioOk = typeof c.longTermRatioPer100k === 'number' && Number.isInteger(c.longTermRatioPer100k)
    && c.longTermRatioPer100k >= 0 && c.longTermRatioPer100k <= 100_000;
  const chosen: Record<ZakatChoiceKey, boolean> = {
    yearBasis: c.yearBasis === 'lunar' || c.yearBasis === 'solar',
    personalJewelry: c.personalJewelry === 'include' || c.personalJewelry === 'exclude',
    longTermInvestments: c.longTermInvestments === 'full_market_value' || (c.longTermInvestments === 'custom_ratio' && ratioOk),
    lockedPensions: c.lockedPensions === 'include' || c.lockedPensions === 'exclude',
    debts: c.debts === 'due_12_months' || c.debts === 'none' || c.debts === 'all',
  };
  const missing = required.filter((k) => !chosen[k]);
  const notApplicable = (Object.keys(chosen) as ZakatChoiceKey[]).filter((k) => !required.includes(k));
  const base = { missing, notApplicable, excludedSourceIds: [...excluded].filter((id) => args.assets.some((a) => a.id === id) || args.liabilities.some((l) => l.id === id)).sort() };
  if (missing.length) return { input: null, ...base };

  // Valeurs neutres pour les options sans objet : elles ne s'appliquent à aucun bien retenu.
  const options: ZakatOptions = {
    nisabBasis: c.nisabBasis === 'gold' || c.nisabBasis === 'silver' ? c.nisabBasis : null,
    yearBasis: c.yearBasis!,
    personalJewelry: chosen.personalJewelry ? c.personalJewelry! : 'exclude',
    longTermInvestments: chosen.longTermInvestments && c.longTermInvestments === 'custom_ratio'
      ? { mode: 'custom_ratio', ratio: c.longTermRatioPer100k! / 100_000 } : { mode: 'full_market_value' },
    lockedPensions: chosen.lockedPensions ? c.lockedPensions! : 'exclude',
    debts: chosen.debts ? c.debts! : 'none',
  };
  return {
    ...base,
    input: {
      asOf: args.asOf, currency: args.currency,
      ...(c.hawlStart ? { hawlStart: c.hawlStart } : {}),
      prices: { gold: bare(args.prices.gold), silver: bare(args.prices.silver) },
      assets, liabilities, options,
    },
  };
}

/** Seuls le prix et sa date entrent dans le calcul (la source est affichée, pas calculée). */
const bare = (p: MetalPrice | null | undefined): MetalPrice | null => (p ? { pricePerGramCents: p.pricePerGramCents, asOf: p.asOf } : null);

export interface PriceEntry { symbol: 'XAU' | 'XAG'; pricePerGramCents: Cents; asOf: IsoDate; source: string }
export interface SelectedPrice extends MetalPrice { source: string; status: ReturnType<typeof priceStatus> }

/** Prix le plus récent saisi pour le métal, jamais postérieur à la date du calcul. */
export function selectMetalPrice(entries: readonly PriceEntry[], symbol: 'XAU' | 'XAG', asOf: IsoDate): SelectedPrice | null {
  const e = entries
    .filter((p) => p.symbol === symbol && p.asOf <= asOf && p.pricePerGramCents > 0)
    .sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0))[0];
  if (!e) return null;
  const price = { pricePerGramCents: e.pricePerGramCents, asOf: e.asOf };
  return { ...price, source: e.source, status: priceStatus(price, asOf) };
}

/** Sérialisation à clés triées : un résultat relu depuis JSONB (clés réordonnées) reste comparable. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export interface Replay { reproducible: boolean; engineVersionMatches: boolean; differences: string[] }

/** Refait un calcul enregistré à partir de ses entrées et compare au résultat conservé. */
export function replayZakat(input: ZakatInput, stored: ZakatResult): Replay {
  const engineVersionMatches = stored.engineVersion === ENGINE_VERSION;
  const fresh = calculateZakat(input) as unknown as Record<string, unknown>;
  const old = stored as unknown as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(fresh), ...Object.keys(old)])].sort();
  const differences = keys.filter((k) => canonicalJson(fresh[k]) !== canonicalJson(old[k]));
  return { reproducible: differences.length === 0, engineVersionMatches, differences };
}

/** Zakat al-Fitr : montant par personne fixé par la personne (source indiquée), jamais par défaut. */
export function zakatAlFitrDue(persons: number, amountPerPersonCents: Cents): Cents {
  if (!Number.isInteger(persons) || persons < 1 || persons > 30) throw new RangeError('nombre de personnes invalide (1 à 30)');
  assertCents(amountPerPersonCents, 'montant par personne');
  if (amountPerPersonCents <= 0) throw new RangeError('montant par personne invalide');
  return persons * amountPerPersonCents;
}
