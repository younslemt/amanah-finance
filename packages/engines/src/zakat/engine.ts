import type { Cents, Currency } from '../money.ts';
import { applyRatePer100k, applyRatio, assertCents, divRoundHalfEven, metalValueCents } from '../money.ts';
import { daysBetween, type IsoDate } from '../dates.ts';
import { ENGINE_VERSION, ZAKAT_RULESET, type ReferenceId } from './ruleset.ts';

// -----------------------------------------------------------------------------
// Entrées
// -----------------------------------------------------------------------------

export type ZakatAssetKind =
  | 'cash' | 'bank_balance' | 'gold' | 'silver' | 'jewelry_personal'
  | 'stocks_funds' | 'pension' | 'group_insurance' | 'life_insurance'
  | 'business_inventory' | 'business_cash' | 'receivable'
  | 'real_estate_residence' | 'real_estate_investment' | 'vehicle' | 'other';

export interface ZakatAsset {
  id: string;
  kind: ZakatAssetKind;
  label: string;
  /** Valeur saisie. Pour l'or et l'argent, ignorée si le poids est fourni. */
  valueCents?: Cents;
  weightMg?: number;
  purityPermille?: number;
  /** Pour les bijoux : métal concerné. */
  metal?: 'gold' | 'silver';
  /** Actions et fonds : détenus pour la revente rapide ou à long terme. */
  heldFor?: 'trading' | 'long_term';
  /** Pension, assurance : sommes accessibles aujourd'hui ? */
  isAccessible?: boolean;
  /** Créances : remboursement probable ? */
  receivableLikely?: boolean;
}

export interface ZakatLiability {
  id: string;
  label: string;
  outstandingCents: Cents;
  /** Échéances des 12 prochains mois. */
  due12mCents: Cents;
}

export interface MetalPrice {
  pricePerGramCents: Cents;
  asOf: IsoDate;
}

export interface ZakatOptions {
  /** Non choisi = « À déterminer » : le moteur ne choisit jamais à la place de l'utilisateur. */
  nisabBasis: 'gold' | 'silver' | null;
  yearBasis: 'lunar' | 'solar';
  personalJewelry: 'include' | 'exclude';
  longTermInvestments: { mode: 'full_market_value' } | { mode: 'custom_ratio'; ratio: number };
  lockedPensions: 'exclude' | 'include';
  debts: 'due_12_months' | 'none' | 'all';
}

export interface ZakatInput {
  asOf: IsoDate;
  currency: Currency;
  /** Début du Hawl en cours (date à laquelle le nisab a été atteint ou dernier anniversaire). */
  hawlStart?: IsoDate;
  /** Un prix absent rend « À déterminer » toute conclusion qui en dépend. */
  prices: { gold?: MetalPrice | null; silver?: MetalPrice | null };
  assets: readonly ZakatAsset[];
  liabilities: readonly ZakatLiability[];
  options: ZakatOptions;
}

// -----------------------------------------------------------------------------
// Sorties
// -----------------------------------------------------------------------------

/** Codes d'explication : traduits par l'interface (fr, nl, en…). */
export type ZakatRuleCode =
  | 'included_full'
  | 'included_metal_weight'
  | 'included_ratio'
  | 'excluded_personal_use'
  | 'excluded_jewelry_option'
  | 'excluded_locked_pension'
  | 'excluded_doubtful_receivable'
  | 'excluded_real_estate_investment'
  | 'excluded_unclassified'
  | 'pending_uncertain_receivable'
  | 'pending_metal_price'
  | 'debt_due_12_months'
  | 'debt_all'
  | 'debt_not_deducted';

export type ZakatWarningCode =
  | 'ruleset_not_approved'
  | 'hawl_unknown'
  | 'hawl_incomplete'
  | 'price_stale'
  | 'conventional_product'
  | 'needs_review'
  | 'debts_capped';

/** Raisons pour lesquelles une conclusion ne peut pas être établie. */
export type ZakatPendingReason =
  | 'nisab_basis_not_chosen'
  | 'nisab_price_unavailable'
  | 'valuation_price_unavailable'
  | 'hawl_start_unknown'
  | 'hawl_start_invalid'
  | 'unclassified_assets'
  | 'uncertain_receivables';

export interface ZakatLine {
  sourceId: string;
  label: string;
  kind: ZakatAssetKind | 'liability';
  valueCents: Cents;
  includedCents: Cents; // négatif pour une dette déduite
  rule: ZakatRuleCode;
  references: ReferenceId[];
  params?: Record<string, string | number>;
}

export interface ZakatWarning {
  code: ZakatWarningCode;
  sourceId?: string;
  params?: Record<string, string | number>;
}

export interface ZakatResult {
  rulesetId: string;
  rulesetVersion: string;
  engineVersion: string;
  asOf: IsoDate;
  currency: Currency;
  /**
   * - to_determine : informations insuffisantes pour conclure (voir pendingReasons)
   * - below_nisab : assiette nette établie et inférieure au nisab
   * - hawl_incomplete : l'année de possession n'est pas achevée
   * - due : nisab atteint, Hawl achevé, aucune donnée manquante — selon le référentiel indiqué
   */
  status: 'to_determine' | 'below_nisab' | 'hawl_incomplete' | 'due';
  pendingReasons: ZakatPendingReason[];
  /** Valeur des éléments non pris en compte faute d'information (créances incertaines, actifs à classer, métal sans prix). */
  uncertainCents: Cents;
  isAboveNisab: boolean | null;
  grossZakatableCents: Cents;
  deductibleDebtsCents: Cents;
  netZakatableCents: Cents;
  nisabCents: Cents | null;
  nisabBasis: 'gold' | 'silver' | null;
  ratePer100k: number;
  /** Montant calculé sur l'assiette nette connue, quel que soit le statut (indicatif si « à déterminer »). */
  estimatedZakatCents: Cents;
  /** Montant exigible : égal à l'estimation si statut « due », sinon 0. */
  dueCents: Cents;
  lines: ZakatLine[];
  warnings: ZakatWarning[];
}

// -----------------------------------------------------------------------------
// Moteur
// -----------------------------------------------------------------------------

const PURE = 1000;

/** Prix utilisable : présent, positif, ni futur ni plus ancien que la tolérance du référentiel. */
export function priceStatus(price: MetalPrice | null | undefined, asOf: IsoDate): 'ok' | 'missing' | 'stale' | 'future' {
  if (!price || !(price.pricePerGramCents > 0)) return 'missing';
  assertCents(price.pricePerGramCents, 'prix du métal');
  const age = daysBetween(price.asOf, asOf);
  if (age < 0) return 'future';
  return age > ZAKAT_RULESET.maxPriceAgeDays ? 'stale' : 'ok';
}

export function calculateZakat(input: ZakatInput): ZakatResult {
  const { options, prices } = input;
  const lines: ZakatLine[] = [];
  const warnings: ZakatWarning[] = [];
  const pending = new Set<ZakatPendingReason>();

  if (ZAKAT_RULESET.reviewStatus !== 'approved') warnings.push({ code: 'ruleset_not_approved' });
  if (options.longTermInvestments.mode === 'custom_ratio') {
    const r = options.longTermInvestments.ratio;
    if (!(r >= 0 && r <= 1)) throw new RangeError('ratio des placements hors de [0, 1]');
  }

  const priceOk = { gold: priceStatus(prices.gold, input.asOf), silver: priceStatus(prices.silver, input.asOf) };
  for (const metal of ['gold', 'silver'] as const) {
    const st = priceOk[metal];
    if (st === 'stale' || st === 'future') {
      warnings.push({ code: 'price_stale', params: { metal, days: daysBetween(prices[metal]!.asOf, input.asOf), priceDate: prices[metal]!.asOf } });
    }
  }

  let uncertain = 0;
  for (const asset of input.assets) {
    const line = assessAsset(asset, input, priceOk, warnings);
    if (line.rule === 'excluded_unclassified') { pending.add('unclassified_assets'); uncertain += line.valueCents; }
    if (line.rule === 'pending_uncertain_receivable') { pending.add('uncertain_receivables'); uncertain += line.valueCents; }
    if (line.rule === 'pending_metal_price') pending.add('valuation_price_unavailable');
    lines.push(line);
  }

  const gross = lines.reduce((s, l) => s + l.includedCents, 0);

  // Dettes déductibles, plafonnées à l'assiette brute
  let debtTotal = 0;
  for (const debt of input.liabilities) {
    assertCents(debt.outstandingCents, debt.label);
    assertCents(debt.due12mCents, debt.label);
    let deducted = 0;
    let rule: ZakatRuleCode = 'debt_not_deducted';
    if (options.debts === 'due_12_months') {
      deducted = Math.min(debt.due12mCents, debt.outstandingCents);
      rule = 'debt_due_12_months';
    } else if (options.debts === 'all') {
      deducted = debt.outstandingCents;
      rule = 'debt_all';
    }
    debtTotal += deducted;
    lines.push({
      sourceId: debt.id,
      label: debt.label,
      kind: 'liability',
      valueCents: debt.outstandingCents,
      includedCents: -deducted,
      rule,
      references: rule === 'debt_due_12_months' ? ['contemporary-debts', 'aaoifi-ss35'] : ['aaoifi-ss35'],
    });
  }
  const deductible = Math.min(debtTotal, gross);
  if (deductible < debtTotal) warnings.push({ code: 'debts_capped', params: { cappedAtCents: deductible } });

  const net = gross - deductible;
  const rate = ZAKAT_RULESET.ratePer100k[options.yearBasis];
  const estimated = net > 0 ? applyRatePer100k(net, rate) : 0;

  // Nisab : seulement si la base est choisie et son prix utilisable
  let nisabCents: Cents | null = null;
  if (!options.nisabBasis) pending.add('nisab_basis_not_chosen');
  else if (priceOk[options.nisabBasis] !== 'ok') pending.add('nisab_price_unavailable');
  else nisabCents = divRoundHalfEven(ZAKAT_RULESET.nisabMg[options.nisabBasis] * prices[options.nisabBasis]!.pricePerGramCents, 1000);

  // Hawl
  let hawlIncomplete = false;
  if (!input.hawlStart) {
    pending.add('hawl_start_unknown');
  } else {
    const elapsed = daysBetween(input.hawlStart, input.asOf);
    const required = ZAKAT_RULESET.hawlDays[options.yearBasis];
    if (elapsed < 0) pending.add('hawl_start_invalid');
    else if (elapsed < required) {
      hawlIncomplete = true;
      warnings.push({ code: 'hawl_incomplete', params: { elapsedDays: elapsed, requiredDays: required } });
    }
  }
  if (pending.has('hawl_start_unknown')) warnings.push({ code: 'hawl_unknown' });

  // Conclusion : chaque statut n'est retenu que si ses conditions sont établies.
  let status: ZakatResult['status'];
  let isAboveNisab: boolean | null = null;
  const reasons = [...pending];
  if (nisabCents === null) {
    status = 'to_determine';
  } else if (net + uncertain < nisabCents && !pending.has('valuation_price_unavailable')) {
    // Même en comptant les éléments incertains, l'assiette reste sous le nisab : conclusion établie.
    status = 'below_nisab';
    isAboveNisab = false;
    reasons.length = 0;
  } else if (hawlIncomplete) {
    status = 'hawl_incomplete';
    isAboveNisab = net >= nisabCents ? true : null;
  } else if (net >= nisabCents) {
    isAboveNisab = true;
    status = reasons.length === 0 ? 'due' : 'to_determine';
  } else {
    status = 'to_determine';
  }

  return {
    rulesetId: ZAKAT_RULESET.id,
    rulesetVersion: ZAKAT_RULESET.version,
    engineVersion: ENGINE_VERSION,
    asOf: input.asOf,
    currency: input.currency,
    status,
    pendingReasons: status === 'to_determine' ? reasons : [],
    uncertainCents: uncertain,
    isAboveNisab,
    grossZakatableCents: gross,
    deductibleDebtsCents: deductible,
    netZakatableCents: net,
    nisabCents,
    nisabBasis: options.nisabBasis,
    ratePer100k: rate,
    estimatedZakatCents: estimated,
    dueCents: status === 'due' ? estimated : 0,
    lines,
    warnings,
  };
}

type PriceAvailability = Record<'gold' | 'silver', 'ok' | 'missing' | 'stale' | 'future'>;

function assessAsset(asset: ZakatAsset, input: ZakatInput, priceOk: PriceAvailability, warnings: ZakatWarning[]): ZakatLine {
  const { options, prices } = input;
  const base = { sourceId: asset.id, label: asset.label, kind: asset.kind };

  const metalOf = (a: ZakatAsset): 'gold' | 'silver' => (a.kind === 'silver' ? 'silver' : a.kind === 'gold' ? 'gold' : a.metal ?? 'gold');
  const valueOf = (a: ZakatAsset): { value: Cents; byWeight: boolean; priceMissing: boolean } => {
    if (a.weightMg !== undefined && (a.kind === 'gold' || a.kind === 'silver' || a.kind === 'jewelry_personal')) {
      const metal = metalOf(a);
      const price = prices[metal];
      if (priceOk[metal] === 'missing' || !price) return { value: 0, byWeight: true, priceMissing: true };
      return { value: metalValueCents(a.weightMg, a.purityPermille ?? PURE, price.pricePerGramCents), byWeight: true, priceMissing: priceOk[metal] !== 'ok' };
    }
    const v = a.valueCents ?? 0;
    assertCents(v, a.label);
    if (v < 0) throw new RangeError(`valeur négative pour « ${a.label} »`);
    return { value: v, byWeight: false, priceMissing: false };
  };

  const { value, byWeight, priceMissing } = valueOf(asset);
  const full = (refs: ReferenceId[] = ['aaoifi-ss35']): ZakatLine => ({
    ...base, valueCents: value, includedCents: value,
    rule: byWeight ? 'included_metal_weight' : 'included_full', references: refs,
    params: byWeight ? { weightMg: asset.weightMg ?? 0, purityPermille: asset.purityPermille ?? PURE } : undefined,
  });
  const excluded = (rule: ZakatRuleCode, refs: ReferenceId[] = ['aaoifi-ss35']): ZakatLine => ({
    ...base, valueCents: value, includedCents: 0, rule, references: refs,
  });

  // Métal évalué au poids sans prix utilisable : non retenu, conclusion suspendue.
  // Les bijoux exclus par option n'en dépendent pas.
  const jewelryExcluded = asset.kind === 'jewelry_personal' && options.personalJewelry === 'exclude';
  if (byWeight && priceMissing && !jewelryExcluded) {
    return { ...base, valueCents: value, includedCents: 0, rule: 'pending_metal_price', references: ['aaoifi-ss35'], params: { weightMg: asset.weightMg ?? 0 } };
  }

  switch (asset.kind) {
    case 'cash':
    case 'bank_balance':
    case 'business_cash':
    case 'business_inventory':
    case 'gold':
    case 'silver':
      return full();

    case 'jewelry_personal':
      return options.personalJewelry === 'include'
        ? full(['fiqh-hanafi'])
        : excluded('excluded_jewelry_option', ['fiqh-majority']);

    case 'stocks_funds':
      if (asset.heldFor === 'trading' || options.longTermInvestments.mode === 'full_market_value') return full();
      return {
        ...base, valueCents: value,
        includedCents: applyRatio(value, options.longTermInvestments.ratio),
        rule: 'included_ratio', references: ['aaoifi-ss35'],
        params: { ratioPer100k: Math.round(options.longTermInvestments.ratio * 100_000) },
      };

    case 'pension':
    case 'group_insurance':
    case 'life_insurance':
      if (asset.kind === 'life_insurance') warnings.push({ code: 'conventional_product', sourceId: asset.id });
      if (asset.isAccessible === false && options.lockedPensions === 'exclude') return excluded('excluded_locked_pension');
      return full();

    case 'receivable':
      if (asset.receivableLikely === false) return excluded('excluded_doubtful_receivable');
      if (asset.receivableLikely === undefined) {
        // Remboursement probable ou non : information requise, l'élément n'est pas supposé.
        warnings.push({ code: 'needs_review', sourceId: asset.id });
        return excluded('pending_uncertain_receivable');
      }
      return full();

    case 'real_estate_residence':
    case 'vehicle':
      return excluded('excluded_personal_use');

    case 'real_estate_investment':
      return excluded('excluded_real_estate_investment');

    case 'other':
    default:
      warnings.push({ code: 'needs_review', sourceId: asset.id });
      return excluded('excluded_unclassified');
  }
}
