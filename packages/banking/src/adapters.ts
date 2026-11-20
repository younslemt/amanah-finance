import {
  categorize, dedupeHash, detectInterest, parseBankCsv, splitCsvRecords, CSV_PROFILES,
  type CategorizationRule, type CsvError, type IsoDate, type PurificationSource,
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
  /** Revenu d'intérêts présumé (libellé ou catégorie) : alimente la purification après confirmation. */
  interest: { kind: PurificationSource; reason: string } | null;
}

export interface ImportPreview {
  toInsert: NormalizedTransaction[];
  duplicates: NormalizedTransaction[];
  errors: CsvError[];
}

/** Limites de l'import : le fichier est lu en mémoire puis écarté, jamais conservé. */
export const IMPORT_LIMITS = { maxBytes: 512 * 1024, maxRows: 5000 } as const;

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
    const [hit] = detectInterest([{
      id: hash, accountId: '', bookedOn: tx.bookedOn, amountCents: tx.amountCents, currency: tx.currency,
      description: tx.description, counterpartyName: tx.counterpartyName, categorySlug,
    }]);
    const interest = hit ? { kind: hit.sourceKind, reason: hit.reason } : null;
    const n: NormalizedTransaction = { ...tx, dedupeHash: hash, categorySlug, matchedPattern, interest };
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
  const profile = Object.hasOwn(CSV_PROFILES, profileId) ? CSV_PROFILES[profileId] : undefined;
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

/**
 * Décodage d'un relevé : UTF-8 si le fichier est valide, sinon Windows-1252
 * (encodage fréquent des exports bancaires belges).
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Profil dont toutes les colonnes obligatoires figurent dans l'en-tête, sinon null. */
export function detectCsvProfile(text: string): keyof typeof CSV_PROFILES | null {
  for (const profile of Object.values(CSV_PROFILES)) {
    const [header] = splitCsvRecords(text.split(/\r?\n/, 1 + profile.skipLines).join('\n'), profile.delimiter).slice(profile.skipLines);
    if (!header) continue;
    const cols = new Set(header.map((h) => h.trim()));
    const c = profile.columns;
    const needed = [c.date, ...c.description, ...(c.amount ? [c.amount] : [c.debit!, c.credit!])];
    if (needed.every((n) => cols.has(n))) return profile.id as keyof typeof CSV_PROFILES;
  }
  return null;
}

/**
 * Lignes au format attendu par la fonction SQL `import_transactions` (une seule
 * transaction). Même format pour le CSV et pour les futurs fournisseurs PSD2.
 */
export interface ImportRowPayload {
  booked_on: string;
  amount_cents: number;
  currency: string;
  description: string;
  counterparty_name: string | null;
  counterparty_iban_last4: string | null;
  category_slug: string;
  external_id: string | null;
  dedupe_hash: string;
  is_interest: boolean;
  interest_kind: PurificationSource | null;
  interest_reason: string | null;
}

export function toImportPayload(rows: readonly NormalizedTransaction[]): ImportRowPayload[] {
  return rows.map((r) => ({
    booked_on: r.bookedOn,
    amount_cents: r.amountCents,
    currency: r.currency,
    description: r.description.slice(0, 500),
    counterparty_name: r.counterpartyName?.slice(0, 200) ?? null,
    counterparty_iban_last4: r.counterpartyIbanLast4 ?? null,
    category_slug: r.categorySlug,
    external_id: r.externalId ?? null,
    dedupe_hash: r.dedupeHash,
    is_interest: r.interest !== null,
    interest_kind: r.interest?.kind ?? null,
    interest_reason: r.interest?.reason ?? null,
  }));
}

/** Registre : le reste de l'application ne connaît que cette fonction. */
export function getProvider(id: 'demo' | 'csv'): BankingProvider {
  switch (id) {
    case 'demo': return new DemoProvider();
    case 'csv': return new CsvProvider();
  }
}
