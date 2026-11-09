import {
  categorize, dedupeHash, parseBankCsv, CSV_PROFILES,
  type CategorizationRule, type CsvError, type IsoDate,
} from '@amanah/engines';
import { DEMO_ACCOUNTS, DEMO_TRANSACTIONS } from './demo-data.ts';
import {
  ProviderNotSupportedError,
  type BankingProvider, type ConsentCallback, type ConsentGrant, type StartConsentInput, type Country, type Institution,
  type ProviderAccount, type ProviderTransaction,
} from './provider.ts';

/** Fournisseur de démonstration : données fictives, aucune connexion réelle. */
export class DemoProvider implements BankingProvider {
  readonly id = 'demo' as const;
  readonly requiresConsent = false;
  async listInstitutions(country: Country): Promise<Institution[]> {
    return [{ id: 'demo-bank', name: 'Banque de démonstration', country }];
  }
  async startConsent(_input: StartConsentInput): Promise<{ redirectUrl: string; consentRef: string }> {
    return { redirectUrl: '/comptes?demo=1', consentRef: 'demo-consent' };
  }
  async completeConsent(_callback: ConsentCallback): Promise<ConsentGrant> {
    return { provider: 'demo', consentRef: 'demo-consent', secretRef: 'none', expiresAt: '2099-12-31T00:00:00Z' };
  }
  async fetchAccounts(): Promise<ProviderAccount[]> {
    return DEMO_ACCOUNTS;
  }
  async fetchTransactions(_grant: ConsentGrant, accountExternalId: string, since: IsoDate): Promise<ProviderTransaction[]> {
    return DEMO_TRANSACTIONS.filter((t) => t.accountExternalId === accountExternalId && t.bookedOn >= since)
      .map(({ accountExternalId: _a, ...t }) => t);
  }
  async revokeConsent(): Promise<void> {}
}

/** Le CSV n'a pas de consentement : il passe par `importCsv` plutôt que par le flux PSD2. */
export class CsvProvider implements BankingProvider {
  readonly id = 'csv' as const;
  readonly requiresConsent = false;
  async listInstitutions(): Promise<Institution[]> { return []; }
  async startConsent(): Promise<never> { throw new ProviderNotSupportedError('csv', 'startConsent'); }
  async completeConsent(): Promise<never> { throw new ProviderNotSupportedError('csv', 'completeConsent'); }
  async fetchAccounts(): Promise<ProviderAccount[]> { return []; }
  async fetchTransactions(): Promise<ProviderTransaction[]> { return []; }
  async revokeConsent(): Promise<void> {}
}

export interface NormalizedTransaction extends ProviderTransaction {
  dedupeHash: string;
  categorySlug: string;
  matchedPattern: string | null;
}

export interface ImportPreview {
  toInsert: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  errors: CsvError[];
}

/**
 * Pipeline commun (CSV aujourd'hui, PSD2 demain) : normalisation, empreinte,
 * dédoublonnage contre l'existant, catégorisation par règles.
 * Deux opérations identiques le même jour reçoivent des empreintes distinctes (rang d'occurrence).
 */
export function normalizeForImport(
  txs: readonly ProviderTransaction[],
  rules: readonly CategorizationRule[],
  existingHashes: ReadonlySet<string>,
): Omit<ImportPreview, 'errors'> {
  const seen = new Map<string, number>();
  const toInsert: NormalizedTransaction[] = [];
  const duplicates: NormalizedTransaction[] = [];
  for (const tx of txs) {
    const base = dedupeHash(tx);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const hash = occurrence === 0 ? base : dedupeHash(tx, occurrence);
    const { categorySlug, matchedPattern } = categorize(tx, rules);
    const n: NormalizedTransaction = { ...tx, dedupeHash: hash, categorySlug, matchedPattern };
    (existingHashes.has(hash) ? duplicates : toInsert).push(n);
  }
  return { toInsert, duplicates };
}

export function previewCsvImport(
  csv: string,
  profileId: keyof typeof CSV_PROFILES,
  rules: readonly CategorizationRule[],
  existingHashes: ReadonlySet<string> = new Set(),
): ImportPreview {
  const profile = CSV_PROFILES[profileId];
  if (!profile) throw new Error(`profil CSV inconnu : ${String(profileId)}`);
  const { rows, errors } = parseBankCsv(csv, profile);
  const txs: ProviderTransaction[] = rows.map((r) => ({
    bookedOn: r.bookedOn,
    amountCents: r.amountCents,
    currency: r.currency as ProviderTransaction['currency'],
    description: r.description,
    counterpartyName: r.counterpartyName,
    counterpartyIbanLast4: r.counterpartyIbanLast4,
  }));
  return { ...normalizeForImport(txs, rules, existingHashes), errors };
}

/** Registre : le reste de l'application ne connaît que cette fonction. */
export function getProvider(id: 'demo' | 'csv'): BankingProvider {
  switch (id) {
    case 'demo': return new DemoProvider();
    case 'csv': return new CsvProvider();
  }
}
