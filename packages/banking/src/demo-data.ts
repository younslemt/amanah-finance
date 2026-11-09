import type { Goal, GoalAllocation, ZakatAsset, ZakatLiability } from '@amanah/engines';
import type { ProviderAccount, ProviderTransaction } from './provider.ts';

/**
 * Jeu de données FICTIF du foyer de démonstration. Aucune personne réelle.
 * Généré de façon déterministe : mêmes données à chaque exécution.
 */

export const DEMO_AS_OF = '2026-11-09';

export const DEMO_ACCOUNTS: ProviderAccount[] = [
  { externalId: 'demo-current', name: 'Compte courant', type: 'current', currency: 'EUR', ibanLast4: '4821', balanceCents: 412_650 },
  { externalId: 'demo-savings', name: 'Compte d’épargne réglementé', type: 'regulated_savings', currency: 'EUR', ibanLast4: '7730', balanceCents: 1_185_000 },
];

type Line = [day: number, cents: number, description: string, counterparty?: string];

const MONTHLY: Line[] = [
  [1, 320_000, 'SALAIRE MENSUEL — EMPLOYEUR FICTIF SA', 'Employeur Fictif SA'],
  [3, 37_400, 'FAMIRIS ALLOCATIONS FAMILIALES', 'Famiris'],
  [2, -105_000, 'LOYER APPARTEMENT', 'Propriétaire'],
  [5, -14_200, 'ENGIE ELECTRICITE GAZ', 'Engie'],
  [6, -6_499, 'PROXIMUS FACTURE', 'Proximus'],
  [7, -4_900, 'STIB ABONNEMENT', 'STIB'],
  [8, -12_850, 'DELHAIZE BRUXELLES', 'Delhaize'],
  [12, -9_740, 'COLRUYT ANDERLECHT', 'Colruyt'],
  [15, -3_215, 'PHARMACIE CENTRALE', 'Pharmacie'],
  [18, -11_320, 'ALDI FOREST', 'Aldi'],
  [20, -50_000, 'VERS EPARGNE OBJECTIF HAJJ', 'Compte épargne'],
  [22, -4_680, 'RESTAURANT LE CEDRE', 'Le Cèdre'],
  [25, -8_830, 'LIDL ETTERBEEK', 'Lidl'],
  [27, -2_500, 'DON MOSQUEE DE QUARTIER', 'ASBL fictive'],
];

const MONTHS = ['2026-08', '2026-09', '2026-10', '2026-11'];

function generate(): Array<ProviderTransaction & { accountExternalId: string }> {
  const out: Array<ProviderTransaction & { accountExternalId: string }> = [];
  for (const month of MONTHS) {
    for (const [day, cents, description, counterparty] of MONTHLY) {
      const date = `${month}-${String(day).padStart(2, '0')}`;
      if (date > DEMO_AS_OF) continue;
      // Légère variation déterministe des dépenses courantes
      const variation = cents < 0 && Math.abs(cents) < 20_000 ? (Number(month.slice(5)) % 3) * 137 : 0;
      out.push({
        accountExternalId: 'demo-current',
        externalId: `demo-${date}-${day}-${Math.abs(cents)}`,
        bookedOn: date,
        amountCents: cents < 0 ? cents - variation : cents,
        currency: 'EUR',
        description,
        counterpartyName: counterparty,
      });
    }
  }
  // Intérêts du compte d'épargne réglementé (à purifier)
  out.push(
    { accountExternalId: 'demo-savings', externalId: 'demo-int-1', bookedOn: '2026-09-30', amountCents: 1_845, currency: 'EUR', description: 'INTERET DE BASE 3E TRIMESTRE' },
    { accountExternalId: 'demo-savings', externalId: 'demo-int-2', bookedOn: '2026-10-01', amountCents: 612, currency: 'EUR', description: 'PRIME DE FIDELITE' },
    { accountExternalId: 'demo-savings', externalId: 'demo-sav-oct', bookedOn: '2026-10-20', amountCents: 50_000, currency: 'EUR', description: 'VERSEMENT DEPUIS COMPTE COURANT' },
  );
  return out;
}

export const DEMO_TRANSACTIONS = generate();

export const DEMO_GOALS: Goal[] = [
  { id: 'goal-hajj', kind: 'hajj', name: 'Hajj en couple', targetCents: 1_400_000, targetDate: '2028-05-01' },
  { id: 'goal-omra', kind: 'omra', name: 'Omra en famille', targetCents: 600_000, targetDate: '2027-04-01' },
  { id: 'goal-etudes', kind: 'children_education', name: 'Études de Yasmine', targetCents: 2_500_000, targetDate: '2034-09-01' },
];

export const DEMO_ALLOCATIONS: GoalAllocation[] = [
  { goalId: 'goal-hajj', amountCents: 350_000, allocatedOn: '2026-01-15' },
  { goalId: 'goal-hajj', amountCents: 50_000, allocatedOn: '2026-08-20' },
  { goalId: 'goal-hajj', amountCents: 50_000, allocatedOn: '2026-09-20' },
  { goalId: 'goal-hajj', amountCents: 50_000, allocatedOn: '2026-10-20' },
  { goalId: 'goal-omra', amountCents: 210_000, allocatedOn: '2026-03-01' },
  { goalId: 'goal-etudes', amountCents: 475_000, allocatedOn: '2026-01-01' },
];

/** Actifs saisis manuellement. Les soldes des comptes s'y ajoutent automatiquement (pas de double saisie). */
export const DEMO_ASSETS: ZakatAsset[] = [
  { id: 'asset-cash', kind: 'cash', label: 'Espèces à la maison', valueCents: 40_000 },
  { id: 'asset-gold', kind: 'gold', label: 'Pièces d’or', weightMg: 15_550, purityPermille: 917 },
  { id: 'asset-jewelry', kind: 'jewelry_personal', label: 'Bijoux portés', weightMg: 42_000, purityPermille: 750, metal: 'gold' },
  { id: 'asset-pension', kind: 'pension', label: 'Épargne-pension', valueCents: 1_860_000, isAccessible: false },
];

export const DEMO_LIABILITIES: ZakatLiability[] = [
  { id: 'debt-car', label: 'Prêt familial pour la voiture', outstandingCents: 300_000, due12mCents: 120_000 },
];

/** Prix FICTIFS de démonstration, à remplacer par la table market_prices. */
export const DEMO_PRICES = {
  gold: { pricePerGramCents: 11_000, asOf: '2026-11-06' },
  silver: { pricePerGramCents: 130, asOf: '2026-11-06' },
};
