/**
 * Référentiel de Zakat v1 — miroir de la ligne `zakat_rulesets` ('amanah-zakat', '1.0.0').
 * STATUT : BROUILLON. À faire relire et approuver par un comité charia avant usage public.
 * Toute modification de règle = nouvelle version ; un calcul enregistré garde sa version.
 */

export const ZAKAT_RULESET = {
  id: 'amanah-zakat',
  version: '1.0.0',
  reviewStatus: 'draft' as 'draft' | 'under_review' | 'approved' | 'retired',
  /** Taux en parts pour 100 000 : 2,5 % (année lunaire) ou 2,577 % (année solaire). */
  ratePer100k: { lunar: 2_500, solar: 2_577 },
  /** Nisab en milligrammes de métal fin. */
  nisabMg: { gold: 85_000, silver: 595_000 },
  hawlDays: { lunar: 354, solar: 365 },
  /** Au-delà, le prix du métal est jugé trop ancien pour un calcul fiable. */
  maxPriceAgeDays: 7,
  references: {
    'aaoifi-ss35': 'AAOIFI, norme charia n° 35 : Zakat',
    'fiqh-hanafi': 'École hanafite',
    'fiqh-majority': 'Écoles malikite, chafiite et hanbalite',
    'contemporary-debts': 'Avis contemporains sur la déduction des dettes',
  },
} as const;

export type ReferenceId = keyof typeof ZAKAT_RULESET.references;

export const ENGINE_VERSION = '0.1.0';
