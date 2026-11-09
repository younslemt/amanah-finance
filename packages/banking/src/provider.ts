import type { Cents, Currency, IsoDate } from '@amanah/engines';

/**
 * Contrat unique pour toute source de données bancaires.
 * V1 : 'demo' et 'csv'. Ensuite : 'enable_banking', 'tink', 'salt_edge'.
 * Règle : aucun adaptateur ne reçoit ni ne stocke les identifiants bancaires
 * de l'utilisateur ; l'authentification forte se fait chez la banque.
 */
export type ProviderId = 'demo' | 'csv' | 'enable_banking' | 'tink' | 'salt_edge';
export type Country = 'BE' | 'FR' | 'LU' | 'NL';

export interface Institution {
  id: string;
  name: string;
  bic?: string;
  country: Country;
}

export interface StartConsentInput {
  institutionId: string;
  redirectUri: string;
  /** Durée demandée, plafonnée par la réglementation et le fournisseur. */
  validDays: number;
  /** Corrélation anti-CSRF générée par le serveur. */
  state: string;
}

export interface ConsentCallback {
  state: string;
  code?: string;
  error?: string;
}

export interface ConsentGrant {
  provider: ProviderId;
  consentRef: string;
  /** Référence vers le secret chiffré (Supabase Vault). Jamais le jeton en clair. */
  secretRef: string;
  expiresAt: string;
}

export interface ProviderAccount {
  externalId: string;
  name: string;
  type: 'current' | 'savings' | 'regulated_savings' | 'credit_card' | 'loan' | 'investment' | 'other';
  currency: Currency;
  ibanLast4?: string;
  balanceCents?: Cents;
}

export interface ProviderTransaction {
  externalId?: string;
  bookedOn: IsoDate;
  amountCents: Cents;
  currency: Currency;
  description: string;
  counterpartyName?: string;
  counterpartyIbanLast4?: string;
}

export interface BankingProvider {
  readonly id: ProviderId;
  /** true si le fournisseur nécessite une redirection vers la banque. */
  readonly requiresConsent: boolean;
  listInstitutions(country: Country): Promise<Institution[]>;
  startConsent(input: StartConsentInput): Promise<{ redirectUrl: string; consentRef: string }>;
  completeConsent(callback: ConsentCallback): Promise<ConsentGrant>;
  fetchAccounts(grant: ConsentGrant): Promise<ProviderAccount[]>;
  fetchTransactions(grant: ConsentGrant, accountExternalId: string, since: IsoDate): Promise<ProviderTransaction[]>;
  revokeConsent(grant: ConsentGrant): Promise<void>;
}

export class ProviderNotSupportedError extends Error {
  constructor(provider: ProviderId, operation: string) {
    super(`Le fournisseur « ${provider} » ne prend pas en charge « ${operation} ».`);
    this.name = 'ProviderNotSupportedError';
  }
}
