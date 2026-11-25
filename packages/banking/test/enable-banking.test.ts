import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { normalizeForImport } from '../src/adapters.ts';
import {
  ConsentDeniedError, EnableBankingError, EnableBankingProvider, ibanLast4, institutionId, mapAccountType, mapTransaction,
  parseAmountCents, parseInstitutionId, signApplicationJwt, type EbTransaction,
} from '../src/enable-banking.ts';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const NOW = Date.parse('2026-11-25T10:00:00Z');
const APP = 'app-fictive-0001';

const decode = (part: string) => JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
function verifyJwt(auth: string | null) {
  const token = auth?.replace(/^Bearer /, '') ?? '';
  const [h, p, s] = token.split('.');
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${p}`);
  if (!v.verify(publicKey, Buffer.from(s!.replace(/-/g, '+').replace(/_/g, '/'), 'base64'))) throw new Error('signature');
  return { header: decode(h!), payload: decode(p!) };
}

/** Serveur Enable Banking simulé (données FICTIVES), conforme à la référence publique de l'API. */
function fakeApi(overrides: Record<string, () => Response> = {}) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const tx = (i: number, extra: Partial<EbTransaction> = {}): EbTransaction => ({
    entry_reference: `ref-${i}`, transaction_amount: { amount: `${10 + i}.50`, currency: 'EUR' }, credit_debit_indicator: 'DBIT',
    status: 'BOOK', booking_date: `2026-11-${String(10 + i).padStart(2, '0')}`, remittance_information: [`ACHAT FICTIF ${i}`], creditor: { name: `Commerce ${i}` }, ...extra,
  });
  const impl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname}`;
    calls.push({ method: init?.method ?? 'GET', path: url.pathname + url.search, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const { header, payload } = verifyJwt(new Headers(init?.headers).get('authorization'));
    expect(header).toEqual({ typ: 'JWT', alg: 'RS256', kid: APP });
    expect(payload.iss).toBe('enablebanking.com');
    expect(payload.aud).toBe('api.enablebanking.com');
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(86_400);
    if (overrides[key]) return overrides[key]!();
    switch (key) {
      case 'GET /aspsps': return json({ aspsps: [
        { name: 'Mock ASPSP', country: 'BE', psu_types: ['personal', 'business'] },
        { name: 'Banque Entreprises Fictive', country: 'BE', psu_types: ['business'] },
        { name: 'Belfius', country: 'BE', bic: 'GKCCBEBB', psu_types: ['personal'] },
      ] });
      case 'POST /auth': return json({ url: 'https://tilisy.enablebanking.com/auth/fictif', authorization_id: 'auth-fictif-1' });
      case 'POST /sessions': return json({ session_id: 'sess-fictive-1', access: { valid_until: '2027-05-24T10:00:00+00:00' }, accounts: [
        { uid: 'acc-1', account_id: { iban: 'BE71 0961 2345 6769' }, name: 'Compte à vue fictif', currency: 'EUR', cash_account_type: 'CACC' },
        { uid: 'acc-2', account_id: { iban: 'BE10000000000404' }, product: 'Épargne fictive', currency: 'EUR', cash_account_type: 'SVGS' },
      ] });
      case 'GET /sessions/sess-fictive-1': return json({ status: 'AUTHORIZED', accounts: ['acc-1'] });
      case 'GET /accounts/acc-1/details': return json({ account_id: { iban: 'BE71096123456769' }, name: 'Compte à vue fictif', currency: 'EUR', cash_account_type: 'CACC' });
      case 'GET /accounts/acc-1/balances': return json({ balances: [{ balance_type: 'XPCD', balance_amount: { amount: '1.00', currency: 'EUR' } }, { balance_type: 'CLBD', balance_amount: { amount: '2345.67', currency: 'EUR' } }] });
      case 'GET /accounts/acc-1/transactions': {
        const page = url.searchParams.get('continuation_key');
        if (!page) return json({ transactions: [tx(1), tx(2, { status: 'PDNG' }), tx(3, { credit_debit_indicator: 'CRDT', debtor: { name: 'Employeur Fictif' }, debtor_account: { iban: 'BE68539007547034' }, remittance_information: ['SALAIRE FICTIF'] })], continuation_key: 'page-2' });
        return json({ transactions: [tx(4), tx(5, { booking_date: '2026-10-01' })], continuation_key: null });
      }
      case 'DELETE /sessions/sess-fictive-1': return json({ message: 'OK' });
      default: return json({ message: 'introuvable', error: 'NOT_FOUND' }, 404);
    }
  };
  return { impl, calls };
}

const provider = (f: ReturnType<typeof fakeApi>, extra = {}) =>
  new EnableBankingProvider({ applicationId: APP, privateKey, baseUrl: 'https://api.example.test', fetchImpl: f.impl, now: () => NOW, ...extra });

describe('Enable Banking : fonctions pures', () => {
  it('montants exacts en centimes, signe selon CRDT / DBIT, sans flottant', () => {
    expect(parseAmountCents('1234.5', 'CRDT')).toBe(123_450);
    expect(parseAmountCents('0.07', 'DBIT')).toBe(-7);
    expect(parseAmountCents('10', 'DBIT')).toBe(-1_000);
    expect(parseAmountCents('-15.20', undefined)).toBe(-1_520);
    expect(parseAmountCents('0.1', 'CRDT') + parseAmountCents('0.2', 'CRDT')).toBe(30);
    expect(() => parseAmountCents('1,50', 'CRDT')).toThrow();
    expect(() => parseAmountCents('1.234', 'CRDT')).toThrow();
  });
  it('IBAN : seuls les 4 derniers caractères sont conservés', () => {
    expect(ibanLast4('BE71 0961 2345 6769')).toBe('6769');
    expect(ibanLast4(null)).toBeUndefined();
    expect(ibanLast4('xx')).toBeUndefined();
  });
  it('types de compte ISO 20022', () => {
    expect(mapAccountType('CACC')).toBe('current');
    expect(mapAccountType('SVGS')).toBe('savings');
    expect(mapAccountType('CARD')).toBe('credit_card');
    expect(mapAccountType(undefined)).toBe('other');
  });
  it('transactions : seules les opérations comptabilisées sont gardées ; contrepartie selon le sens', () => {
    const base: EbTransaction = { transaction_amount: { amount: '42.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', status: 'BOOK', booking_date: '2026-11-02', remittance_information: ['LOYER FICTIF'], creditor: { name: 'Propriétaire' }, creditor_account: { iban: 'BE12345678901234' } };
    expect(mapTransaction(base)).toEqual({ externalId: undefined, bookedOn: '2026-11-02', amountCents: -4_200, currency: 'EUR', description: 'LOYER FICTIF', counterpartyName: 'Propriétaire', counterpartyIbanLast4: '1234' });
    expect(mapTransaction({ ...base, status: 'PDNG' })).toBeNull();
    expect(mapTransaction({ ...base, booking_date: null, value_date: null })).toBeNull();
    expect(mapTransaction({ ...base, remittance_information: [] })!.description).toBe('Propriétaire');
  });
  it('identifiant d’établissement « pays:nom »', () => {
    expect(parseInstitutionId(institutionId('BE', 'Mock ASPSP'))).toEqual({ country: 'BE', name: 'Mock ASPSP' });
    expect(() => parseInstitutionId('XX:Banque')).toThrow();
    expect(() => parseInstitutionId('BE')).toThrow();
  });
  it('JWT d’application : RS256, kid, durée bornée à 24 h', () => {
    const { header, payload } = verifyJwt(`Bearer ${signApplicationJwt(APP, privateKey, NOW)}`);
    expect(header.kid).toBe(APP);
    expect(payload.exp - payload.iat).toBe(3600);
    expect(() => signApplicationJwt(APP, privateKey, NOW, 86_401)).toThrow();
  });
});

describe('Enable Banking : fournisseur (serveur simulé, données fictives)', () => {
  it('banques belges pour particuliers, triées', async () => {
    const f = fakeApi();
    const banks = await provider(f).listInstitutions('BE');
    expect(banks.map((b) => b.id)).toEqual(['BE:Belfius', 'BE:Mock ASPSP']);
    expect(f.calls[0]!.path).toBe('/aspsps?country=BE&psu_type=personal&service=AIS');
  });

  it('demande de consentement : lecture seule (soldes, transactions), durée plafonnée à 180 jours, aucun paiement', async () => {
    const f = fakeApi();
    const r = await provider(f).startConsent({ institutionId: 'BE:Mock ASPSP', redirectUri: 'https://app.example.test/api/banque/retour', validDays: 365, state: 'etat-aleatoire' });
    expect(r).toEqual({ redirectUrl: 'https://tilisy.enablebanking.com/auth/fictif', consentRef: 'auth-fictif-1' });
    const body = f.calls[0]!.body as Record<string, any>;
    expect(body.access).toEqual({ valid_until: new Date(NOW + 180 * 86_400_000).toISOString(), balances: true, transactions: true });
    expect(body.aspsp).toEqual({ name: 'Mock ASPSP', country: 'BE' });
    expect(body.state).toBe('etat-aleatoire');
    expect(JSON.stringify(f.calls)).not.toMatch(/payment|password|credential/i);
    expect(f.calls.every((c) => !c.path.startsWith('/payments'))).toBe(true);
  });

  it('retour de la banque : session, comptes (IBAN tronqué), refus et annulation', async () => {
    const f = fakeApi();
    const s = await provider(f).completeSession({ state: 'x', code: 'code-fictif' });
    expect(s.grant).toEqual({ provider: 'enable_banking', consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '2027-05-24T10:00:00+00:00' });
    expect(s.accounts).toEqual([
      { externalId: 'acc-1', name: 'Compte à vue fictif', type: 'current', currency: 'EUR', ibanLast4: '6769' },
      { externalId: 'acc-2', name: 'Épargne fictive', type: 'savings', currency: 'EUR', ibanLast4: '0404' },
    ]);
    expect(JSON.stringify(s)).not.toContain('BE71');
    await expect(provider(fakeApi()).completeSession({ state: 'x', error: 'access_denied' })).rejects.toBeInstanceOf(ConsentDeniedError);
    await expect(provider(fakeApi()).completeSession({ state: 'x' })).rejects.toBeInstanceOf(ConsentDeniedError);
  });

  it('comptes et solde comptable de la session', async () => {
    const f = fakeApi();
    const accounts = await provider(f).fetchAccounts({ provider: 'enable_banking', consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '' });
    expect(accounts).toEqual([{ externalId: 'acc-1', name: 'Compte à vue fictif', type: 'current', currency: 'EUR', ibanLast4: '6769', balanceCents: 234_567 }]);
  });

  it('transactions : pagination, opérations en attente écartées, période respectée, puis dédoublonnage du pipeline commun', async () => {
    const f = fakeApi();
    const grant = { provider: 'enable_banking' as const, consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '' };
    const txs = await provider(f).fetchTransactions(grant, 'acc-1', '2026-11-01');
    expect(txs.map((t) => [t.externalId, t.amountCents])).toEqual([['ref-1', -1_150], ['ref-3', 1_350], ['ref-4', -1_450]]);
    expect(txs[1]).toMatchObject({ description: 'SALAIRE FICTIF', counterpartyName: 'Employeur Fictif', counterpartyIbanLast4: '7034' });
    expect(f.calls.map((c) => c.path)).toEqual(['/accounts/acc-1/transactions?date_from=2026-11-01', '/accounts/acc-1/transactions?date_from=2026-11-01&continuation_key=page-2']);
    // Même pipeline que le CSV : une 2e synchronisation sur la même période n'ajoute rien
    const first = normalizeForImport(txs, [], new Set());
    const again = normalizeForImport(await provider(fakeApi()).fetchTransactions(grant, 'acc-1', '2026-11-01'), [], new Set(first.toInsert.map((t) => t.dedupeHash)));
    expect(first.toInsert).toHaveLength(3);
    expect(again.toInsert).toHaveLength(0);
    expect(again.duplicates).toHaveLength(3);
  });

  it('pagination sans fin : interrompue', async () => {
    const loop = fakeApi({ 'GET /accounts/acc-1/transactions': () => new Response(JSON.stringify({ transactions: [], continuation_key: 'encore' })) });
    await expect(provider(loop, { maxPages: 3 }).fetchTransactions({ provider: 'enable_banking', consentRef: 's', secretRef: 'none', expiresAt: '' }, 'acc-1', '2026-11-01'))
      .rejects.toMatchObject({ code: 'TOO_MANY_PAGES' });
  });

  it('erreurs : session expirée ou révoquée → nouveau consentement ; limite de fréquence → réessayer', async () => {
    const grant = { provider: 'enable_banking' as const, consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '' };
    const expired = fakeApi({ 'GET /accounts/acc-1/transactions': () => new Response(JSON.stringify({ message: 'Session is expired', error: 'EXPIRED_SESSION', code: 401 }), { status: 401 }) });
    const e = await provider(expired).fetchTransactions(grant, 'acc-1', '2026-11-01').catch((x) => x);
    expect(e).toBeInstanceOf(EnableBankingError);
    expect(e).toMatchObject({ status: 401, code: 'EXPIRED_SESSION', reconsent: true, retryable: false });
    const limited = fakeApi({ 'GET /accounts/acc-1/transactions': () => new Response(JSON.stringify({ message: 'ASPSP rate limit exceeded', error: 'ASPSP_RATE_LIMIT_EXCEEDED' }), { status: 429 }) });
    expect(await provider(limited).fetchTransactions(grant, 'acc-1', '2026-11-01').catch((x) => x)).toMatchObject({ retryable: true, reconsent: false });
  });

  it('révocation : session fermée ; déjà fermée ou expirée = révocation acquise', async () => {
    const f = fakeApi();
    await provider(f).revokeConsent({ provider: 'enable_banking', consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '' });
    expect(f.calls[0]).toMatchObject({ method: 'DELETE', path: '/sessions/sess-fictive-1' });
    const closed = fakeApi({ 'DELETE /sessions/sess-fictive-1': () => new Response(JSON.stringify({ message: 'Session is closed', error: 'CLOSED_SESSION' }), { status: 400 }) });
    await expect(provider(closed).revokeConsent({ provider: 'enable_banking', consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '' })).resolves.toBeUndefined();
    const down = fakeApi({ 'DELETE /sessions/sess-fictive-1': () => new Response('{}', { status: 500 }) });
    await expect(provider(down).revokeConsent({ provider: 'enable_banking', consentRef: 'sess-fictive-1', secretRef: 'none', expiresAt: '' })).rejects.toBeInstanceOf(EnableBankingError);
  });

  it('configuration incomplète refusée', () => {
    expect(() => new EnableBankingProvider({ applicationId: '', privateKey })).toThrow();
    expect(() => new EnableBankingProvider({ applicationId: APP, privateKey: 'pas une clé' })).toThrow();
  });
});
