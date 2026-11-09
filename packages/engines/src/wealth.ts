import type { Cents } from './money.ts';
import { assertCents, metalValueCents } from './money.ts';
import type { IsoDate } from './dates.ts';
import { priceStatus, type MetalPrice, type ZakatAsset, type ZakatLiability } from './zakat/engine.ts';

/**
 * Patrimoine net : valeur de marché de TOUS les actifs (y compris résidence et
 * épargne bloquée, contrairement à l'assiette de Zakat) moins TOUTES les dettes.
 * Un actif impossible à valoriser n'est jamais compté pour zéro en silence.
 */
export interface WealthSummary {
  assetsCents: Cents;
  liabilitiesCents: Cents;
  netWorthCents: Cents;
  byKind: Array<{ kind: ZakatAsset['kind']; valueCents: Cents }>;
  /** Actifs sans valeur établie (métal sans prix utilisable, valeur absente). */
  unvaluedAssetIds: string[];
  status: 'complete' | 'partial';
}

export function computeNetWorth(
  assets: readonly ZakatAsset[],
  liabilities: readonly ZakatLiability[],
  prices: { gold?: MetalPrice | null; silver?: MetalPrice | null },
  asOf: IsoDate,
): WealthSummary {
  const byKind = new Map<ZakatAsset['kind'], number>();
  const unvalued: string[] = [];
  let total = 0;
  for (const a of assets) {
    let value: number | null;
    if (a.weightMg !== undefined && (a.kind === 'gold' || a.kind === 'silver' || a.kind === 'jewelry_personal')) {
      const metal = a.kind === 'silver' ? 'silver' : a.kind === 'gold' ? 'gold' : a.metal ?? 'gold';
      const price = prices[metal];
      value = price && priceStatus(price, asOf) === 'ok' ? metalValueCents(a.weightMg, a.purityPermille ?? 1000, price.pricePerGramCents) : null;
    } else {
      value = a.valueCents ?? null;
      if (value !== null) assertCents(value, a.label);
    }
    if (value === null) { unvalued.push(a.id); continue; }
    total += value;
    byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + value);
  }
  let debts = 0;
  for (const l of liabilities) { assertCents(l.outstandingCents, l.label); debts += l.outstandingCents; }
  return {
    assetsCents: total,
    liabilitiesCents: debts,
    netWorthCents: total - debts,
    byKind: [...byKind].map(([kind, valueCents]) => ({ kind, valueCents })).sort((x, y) => y.valueCents - x.valueCents),
    unvaluedAssetIds: unvalued,
    status: unvalued.length ? 'partial' : 'complete',
  };
}
