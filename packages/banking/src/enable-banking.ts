/**
 * Fournisseur Enable Banking (accès aux comptes, AIS uniquement) — CÔTÉ SERVEUR SEULEMENT.
 *
 * Implémente le contrat `BankingProvider` du projet ; aucun système bancaire parallèle.
 * - Authentification de l'application : JWT RS256 signé avec la clé privée de l'application
 *   (`kid` = identifiant d'application), durée courte (1 h, maximum autorisé : 24 h).
 * - L'utilisateur s'authentifie CHEZ SA BANQUE (redirection) : aucun identifiant ni code
 *   bancaire ne transite par Amanah Finance.
 * - Aucune initiation de paiement : seuls les accès « balances » et « transactions » sont demandés.
 * - Montants convertis en centimes sans passer par des nombres flottants.
 *
 * Référence : https://enablebanking.com/docs/api/latest/ (POST /auth, POST /sessions,
 * GET /sessions/{id}, DELETE /sessions/{id}, GET /aspsps, GET /accounts/{id}/details|balances|transactions).
 */
import { createSign } from 'node:crypto';
import type { Cents, Currency, IsoDate } from '@amanah/engines';
import type {
  BankingProvider, ConsentCallback, ConsentGrant, Country, Institution, ProviderAccount, ProviderTransaction, StartConsentInput,
} from './provider.ts';

export const ENABLE_BANKING_API = 'https://api.enablebanking.com';

export interface EnableBankingConfig {
  applicationId: string;
  /** Clé privée RSA au format PEM : variable d'environnement du serveur, jamais dans le navigateur. */
  privateKey: string;
  /** Uniquement pour les tests automatisés (serveur simulé). Par défaut : API officielle. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Horloge injectable (tests). */
  now?: () => number;
  /** Plafond de pages de transactions lues par synchronisation (sécurité). */
  maxPages?: number;
}

/** Codes d'erreur de l'API qui imposent un nouveau consentement de l'utilisateur. */
const RECONSENT = new Set(['EXPIRED_SESSION', 'REVOKED_SESSION', 'CLOSED_SESSION', 'SESSION_DOES_NOT_EXIST', 'WRONG_SESSION_STATUS']);
const RETRYABLE = new Set(['ASPSP_TIMEOUT', 'ASPSP_RATE_LIMIT_EXCEEDED', 'ASPSP_ERROR']);

export class EnableBankingError extends Error {
  readonly status: number;
  readonly code: string | null;
  /** L'accès a expiré ou a été révoqué : il faut repasser par la banque. */
  readonly reconsent: boolean;
  /** Erreur passagère (banque indisponible, limite de fréquence) : réessayer plus tard. */
  readonly retryable: boolean;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'EnableBankingError';
    this.status = status;
    this.code = code;
    this.reconsent = code !== null && RECONSENT.has(code);
    this.retryable = status === 429 || status >= 500 || (code !== null && RETRYABLE.has(code));
  }
}

/** L'utilisateur a refusé ou annulé à la banque (paramètre `error` du retour). */
export class ConsentDeniedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Autorisation refusée ou annulée à la banque (${reason}).`);
    this.name = 'ConsentDeniedError';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Fonctions pures (testées séparément)
// ---------------------------------------------------------------------------

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT d'application (RS256). `ttlSeconds` ≤ 86 400 (limite de l'API). */
export function signApplicationJwt(applicationId: string, privateKey: string, nowMs: number, ttlSeconds = 3600): string {
  if (ttlSeconds <= 0 || ttlSeconds > 86_400) throw new Error('Durée du JWT hors limites (1 s à 24 h).');
  const iat = Math.floor(nowMs / 1000);
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: applicationId }));
  const payload = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + ttlSeconds }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  return `${header}.${payload}.${b64url(signer.sign(privateKey))}`;
}

/** « 1234.5 » → 123450 centimes, exactement (aucun flottant). Signe selon CRDT / DBIT. */
export function parseAmountCents(amount: string, indicator: 'CRDT' | 'DBIT' | undefined): Cents {
  const m = /^\s*(-?)(\d+)(?:\.(\d{1,2}))?\s*$/.exec(amount);
  if (!m) throw new Error(`montant illisible : ${amount}`);
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0') || '0');
  const negativeInText = m[1] === '-';
  // L'API donne un montant positif et un indicateur ; un montant déjà signé est respecté
  const negative = indicator === 'DBIT' ? true : indicator === 'CRDT' ? false : negativeInText;
  return (negative ? -cents : cents) as Cents;
}

export function ibanLast4(iban: string | null | undefined): string | undefined {
  const clean = iban?.replace(/\s/g, '').toUpperCase();
  return clean && /^[A-Z0-9]{8,34}$/.test(clean) ? clean.slice(-4) : undefined;
}

/** Type de compte ISO 20022 (cash_account_type) → type Amanah. */
export function mapAccountType(cashAccountType: string | null | undefined): ProviderAccount['type'] {
  switch (cashAccountType) {
    case 'CACC': case 'CASH': case 'TRAN': return 'current';
    case 'SVGS': case 'MOMA': case 'ONDP': return 'savings';
    case 'CARD': return 'credit_card';
    case 'LOAN': case 'MGLD': return 'loan';
    default: return 'other';
  }
}

const CURRENCIES: ReadonlySet<string> = new Set(['EUR', 'GBP', 'USD', 'MAD', 'CHF']);
const currency = (c: string | undefined): Currency => (c && CURRENCIES.has(c.toUpperCase()) ? c.toUpperCase() : 'EUR') as Currency;

export interface EbTransaction {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount: { amount: string; currency: string };
  credit_debit_indicator?: 'CRDT' | 'DBIT';
  status?: string;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  creditor_account?: { iban?: string | null } | null;
  debtor_account?: { iban?: string | null } | null;
}

/** Transaction Enable Banking → transaction normalisée du projet ; null si non comptabilisée. */
export function mapTransaction(t: EbTransaction): ProviderTransaction | null {
  if (t.status && t.status !== 'BOOK') return null; // en attente, annulée, rejetée : jamais importée
  const bookedOn = (t.booking_date ?? t.value_date ?? t.transaction_date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookedOn)) return null;
  const debit = t.credit_debit_indicator === 'DBIT';
  const counterparty = debit ? t.creditor : t.debtor;
  const counterpartyAccount = debit ? t.creditor_account : t.debtor_account;
  const remittance = (t.remittance_information ?? []).map((s) => s.trim()).filter(Boolean).join(' ');
  const description = (remittance || counterparty?.name || (debit ? 'Paiement' : 'Crédit')).slice(0, 500);
  return {
    externalId: t.entry_reference ?? t.transaction_id ?? undefined,
    bookedOn: bookedOn as IsoDate,
    amountCents: parseAmountCents(t.transaction_amount.amount, t.credit_debit_indicator),
    currency: currency(t.transaction_amount.currency),
    description,
    counterpartyName: counterparty?.name?.slice(0, 200) ?? undefined,
    counterpartyIbanLast4: ibanLast4(counterpartyAccount?.iban),
  };
}

/** Identifiant d'établissement stable : « BE:Nom de la banque » (l'API identifie par nom + pays). */
export const institutionId = (country: string, name: string) => `${country}:${name}`;
export function parseInstitutionId(id: string): { country: Country; name: string } {
  const sep = id.indexOf(':');
  const country = id.slice(0, sep) as Country;
  const name = id.slice(sep + 1);
  if (sep !== 2 || !name || !['BE', 'FR', 'LU', 'NL'].includes(country)) throw new Error('Établissement inconnu.');
  return { country, name };
}

// ---------------------------------------------------------------------------
// Fournisseur
// ---------------------------------------------------------------------------

export interface EnableBankingSession {
  grant: ConsentGrant;
  accounts: ProviderAccount[];
}

export class EnableBankingProvider implements BankingProvider {
  readonly id = 'enable_banking' as const;
  readonly requiresConsent = true;
  private readonly cfg: Required<Omit<EnableBankingConfig, 'fetchImpl' | 'now'>> & { fetchImpl: typeof fetch; now: () => number };

  constructor(cfg: EnableBankingConfig) {
    if (!cfg.applicationId || !cfg.privateKey.includes('PRIVATE KEY')) throw new Error('Configuration Enable Banking incomplète.');
    this.cfg = {
      applicationId: cfg.applicationId, privateKey: cfg.privateKey,
      baseUrl: (cfg.baseUrl ?? ENABLE_BANKING_API).replace(/\/+$/, ''),
      fetchImpl: cfg.fetchImpl ?? fetch, now: cfg.now ?? Date.now, maxPages: cfg.maxPages ?? 50,
    };
  }

  private async call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const res = await this.cfg.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${signApplicationJwt(this.cfg.applicationId, this.cfg.privateKey, this.cfg.now())}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const err = (json ?? {}) as { error?: string; message?: string };
      // Le message de l'API ne contient pas de données de compte ; il reste néanmoins tronqué
      throw new EnableBankingError(res.status, err.error ?? null, `Enable Banking ${res.status}${err.error ? ` ${err.error}` : ''} : ${(err.message ?? 'erreur').slice(0, 160)}`);
    }
    return json as T;
  }

  async listInstitutions(country: Country): Promise<Institution[]> {
    const r = await this.call<{ aspsps: Array<{ name: string; country: string; bic?: string; psu_types?: string[] }> }>(
      'GET', `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal&service=AIS`);
    return r.aspsps
      .filter((a) => !a.psu_types || a.psu_types.includes('personal'))
      .map((a) => ({ id: institutionId(a.country, a.name), name: a.name, bic: a.bic || undefined, country: a.country as Country }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  async startConsent(input: StartConsentInput): Promise<{ redirectUrl: string; consentRef: string }> {
    const { country, name } = parseInstitutionId(input.institutionId);
    const days = Math.min(Math.max(1, Math.floor(input.validDays)), 180);
    const validUntil = new Date(this.cfg.now() + days * 86_400_000).toISOString();
    const r = await this.call<{ url: string; authorization_id: string }>('POST', '/auth', {
      access: { valid_until: validUntil, balances: true, transactions: true },
      aspsp: { name, country },
      state: input.state,
      redirect_url: input.redirectUri,
      psu_type: 'personal',
      language: 'fr',
    });
    if (!/^https:\/\//.test(r.url) && !this.cfg.baseUrl.startsWith('http://localhost')) throw new Error('Adresse de redirection bancaire invalide.');
    return { redirectUrl: r.url, consentRef: r.authorization_id };
  }

  /** Retour de la banque : la vérification du `state` est faite par l'appelant AVANT cet appel. */
  async completeSession(callback: ConsentCallback): Promise<EnableBankingSession> {
    if (callback.error) throw new ConsentDeniedError(callback.error.slice(0, 60));
    if (!callback.code) throw new ConsentDeniedError('code_absent');
    const r = await this.call<{
      session_id: string;
      access: { valid_until: string };
      accounts: Array<{ uid: string; account_id?: { iban?: string } | null; name?: string | null; product?: string | null; currency?: string; cash_account_type?: string }>;
    }>('POST', '/sessions', { code: callback.code });
    return {
      grant: { provider: 'enable_banking', consentRef: r.session_id, secretRef: 'none', expiresAt: r.access.valid_until },
      accounts: r.accounts.map((a) => ({
        externalId: a.uid,
        name: (a.name || a.product || 'Compte bancaire').slice(0, 120),
        type: mapAccountType(a.cash_account_type),
        currency: currency(a.currency),
        ibanLast4: ibanLast4(a.account_id?.iban),
      })),
    };
  }

  async completeConsent(callback: ConsentCallback): Promise<ConsentGrant> {
    return (await this.completeSession(callback)).grant;
  }

  /** État de la session (AUTHORIZED, EXPIRED, REVOKED…). */
  async sessionStatus(grant: ConsentGrant): Promise<string> {
    return (await this.call<{ status: string }>('GET', `/sessions/${encodeURIComponent(grant.consentRef)}`)).status;
  }

  async fetchAccounts(grant: ConsentGrant): Promise<ProviderAccount[]> {
    const s = await this.call<{ accounts: string[] }>('GET', `/sessions/${encodeURIComponent(grant.consentRef)}`);
    const out: ProviderAccount[] = [];
    for (const uid of s.accounts) {
      const d = await this.call<{ account_id?: { iban?: string }; name?: string; product?: string; currency?: string; cash_account_type?: string }>(
        'GET', `/accounts/${encodeURIComponent(uid)}/details`);
      out.push({
        externalId: uid, name: (d.name || d.product || 'Compte bancaire').slice(0, 120), type: mapAccountType(d.cash_account_type),
        currency: currency(d.currency), ibanLast4: ibanLast4(d.account_id?.iban), balanceCents: await this.fetchBalanceCents(uid),
      });
    }
    return out;
  }

  /** Solde disponible ou comptable (CLAV, ITAV, CLBD, ITBD, XPCD), en centimes ; undefined sinon. */
  async fetchBalanceCents(accountUid: string): Promise<Cents | undefined> {
    const r = await this.call<{ balances: Array<{ balance_type: string; balance_amount: { amount: string } }> }>(
      'GET', `/accounts/${encodeURIComponent(accountUid)}/balances`);
    for (const type of ['CLBD', 'ITBD', 'CLAV', 'ITAV', 'XPCD']) {
      const b = r.balances.find((x) => x.balance_type === type);
      if (b) return parseAmountCents(b.balance_amount.amount, undefined);
    }
    return undefined;
  }

  async fetchTransactions(_grant: ConsentGrant, accountExternalId: string, since: IsoDate): Promise<ProviderTransaction[]> {
    const out: ProviderTransaction[] = [];
    let continuation: string | null = null;
    for (let page = 0; page < this.cfg.maxPages; page++) {
      const q = new URLSearchParams({ date_from: since });
      if (continuation) q.set('continuation_key', continuation);
      const r: { transactions: EbTransaction[]; continuation_key?: string | null } =
        await this.call('GET', `/accounts/${encodeURIComponent(accountExternalId)}/transactions?${q.toString()}`);
      for (const t of r.transactions) {
        const mapped = mapTransaction(t);
        if (mapped && mapped.bookedOn >= since) out.push(mapped);
      }
      continuation = r.continuation_key ?? null;
      if (!continuation) return out;
    }
    throw new EnableBankingError(0, 'TOO_MANY_PAGES', 'Trop de pages de transactions : synchronisation interrompue.');
  }

  /** Révocation : ferme la session chez Enable Banking (et le consentement à la banque si possible). */
  async revokeConsent(grant: ConsentGrant): Promise<void> {
    try {
      await this.call('DELETE', `/sessions/${encodeURIComponent(grant.consentRef)}`);
    } catch (e) {
      // Déjà fermée, expirée ou inconnue : l'accès n'existe plus, la révocation est acquise
      if (e instanceof EnableBankingError && (e.reconsent || e.status === 404)) return;
      throw e;
    }
  }
}
