/**
 * Zakat personnalisée : textes des choix méthodologiques, historique des calculs
 * (reproductibilité, comparaison d'un calcul à l'autre, dû / payé / reste).
 * Fonctions pures, testées sans base. Aucune option n'est présentée comme la règle.
 */
import { replayZakat, type Replay, type Settlement, type ZakatChoiceKey, type ZakatInput, type ZakatResult } from '@amanah/engines';

export const CHOICE_TEXT: Record<ZakatChoiceKey, { legend: string; why: string }> = {
  yearBasis: { legend: 'Année de référence', why: 'Fixe la durée du Hawl et le taux (2,5 % en année lunaire, 2,577 % en année solaire).' },
  personalJewelry: { legend: 'Bijoux d’usage personnel', why: 'Les écoles divergent : inclus selon l’école hanafite, exclus selon la majorité des autres écoles.' },
  longTermInvestments: { legend: 'Placements détenus à long terme', why: 'Valeur de marché entière, ou part retenue (par exemple la part d’actifs zakatables des sociétés).' },
  lockedPensions: { legend: 'Épargne bloquée (pension, assurance non rachetable)', why: 'Certains avis l’excluent tant qu’elle n’est pas accessible, d’autres l’incluent.' },
  debts: { legend: 'Déduction des dettes', why: 'Échéances des 12 prochains mois, totalité de la dette, ou aucune déduction : avis contemporains divergents.' },
};

export const CHOICE_OPTIONS = {
  nisabBasis: [{ value: 'gold', label: 'Or (85 g de métal fin)' }, { value: 'silver', label: 'Argent (595 g de métal fin)' }],
  yearBasis: [{ value: 'lunar', label: 'Année lunaire (354 jours, 2,5 %)' }, { value: 'solar', label: 'Année solaire (365 jours, 2,577 %)' }],
  personalJewelry: [{ value: 'include', label: 'Inclure les bijoux portés' }, { value: 'exclude', label: 'Exclure les bijoux portés' }],
  longTermInvestments: [{ value: 'full_market_value', label: 'Valeur de marché entière' }, { value: 'custom_ratio', label: 'Part retenue (à indiquer en %)' }],
  lockedPensions: [{ value: 'exclude', label: 'Exclure l’épargne bloquée' }, { value: 'include', label: 'Inclure l’épargne bloquée' }],
  debts: [{ value: 'due_12_months', label: 'Déduire les échéances des 12 prochains mois' }, { value: 'all', label: 'Déduire la totalité' }, { value: 'none', label: 'Ne rien déduire' }],
} as const;

export interface CalculationRow {
  id: string;
  owner_id: string;
  as_of: string;
  status: ZakatResult['status'];
  zakat_due_cents: number | string;
  zakatable_cents: number | string;
  nisab_cents: number | string | null;
  engine_version: string;
  ruleset_id: string;
  ruleset_version: string;
  inputs: unknown;
  result: unknown;
  created_at: string;
}

/** Entrées enregistrées avec un calcul : entrées exactes du moteur et choix de la personne. */
export interface StoredInputs {
  engineInput: ZakatInput;
  notApplicable: ZakatChoiceKey[];
  excludedSourceIds: string[];
  priceSources: { gold: string | null; silver: string | null };
}

export interface HistoryEntry {
  id: string;
  asOf: string;
  createdAt: string;
  status: ZakatResult['status'];
  dueCents: number;
  netCents: number;
  nisabCents: number | null;
  versions: string;
  replay: Replay | { reproducible: null; reason: string };
  /** Écart avec le calcul précédent (plus ancien) de la personne. */
  change: { netCents: number; dueCents: number; previousAsOf: string } | null;
  result: ZakatResult | null;
  stored: StoredInputs | null;
  settlement: Settlement | null;
}

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

function isStored(v: unknown): v is StoredInputs {
  const o = v as StoredInputs | null;
  return Boolean(o && typeof o === 'object' && o.engineInput && typeof o.engineInput === 'object' && Array.isArray(o.engineInput.assets));
}
function isResult(v: unknown): v is ZakatResult {
  const o = v as ZakatResult | null;
  return Boolean(o && typeof o === 'object' && Array.isArray(o.lines) && typeof o.status === 'string');
}

/** Historique de la personne, du plus récent au plus ancien ; chaque calcul est refait pour vérifier qu'il se reproduit. */
export function zakatHistory(rows: readonly CalculationRow[], userId: string, settlements: readonly Settlement[] = []): HistoryEntry[] {
  const mine = rows.filter((r) => r.owner_id === userId)
    .sort((a, b) => (a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : a.created_at < b.created_at ? 1 : -1));
  return mine.map((r, i) => {
    const stored = isStored(r.inputs) ? r.inputs : null;
    const result = isResult(r.result) ? r.result : null;
    let replay: HistoryEntry['replay'];
    if (!stored || !result) replay = { reproducible: null, reason: 'Calcul antérieur sans entrées complètes : non reproductible automatiquement.' };
    else {
      try { replay = replayZakat(stored.engineInput, result); } catch { replay = { reproducible: null, reason: 'Entrées enregistrées illisibles.' }; }
    }
    const prev = mine[i + 1];
    return {
      id: r.id, asOf: r.as_of, createdAt: r.created_at, status: r.status,
      dueCents: Number(r.zakat_due_cents), netCents: Number(r.zakatable_cents), nisabCents: num(r.nisab_cents),
      versions: `${r.ruleset_id} ${r.ruleset_version} · moteur ${r.engine_version}`,
      replay,
      change: prev ? { netCents: Number(r.zakatable_cents) - Number(prev.zakatable_cents), dueCents: Number(r.zakat_due_cents) - Number(prev.zakat_due_cents), previousAsOf: prev.as_of } : null,
      result, stored,
      settlement: settlements.find((s) => s.id === r.id) ?? null,
    };
  });
}
