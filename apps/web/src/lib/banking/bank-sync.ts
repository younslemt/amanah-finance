import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizeForImport, toImportPayload, type ProviderTransaction } from '@amanah/banking';
import { ConsentDeniedError, EnableBankingError, EnableBankingProvider } from '@amanah/banking/enable-banking';
import type { CategorizationRule } from '@amanah/engines';
import { isDemoMode } from '../env.ts';
import type { SessionContext } from '../supabase/session.ts';
import { bankAccessAllowed, enableBankingSettings, syncSince, type EnableBankingSettings } from './config.ts';

/**
 * Connexion bancaire Enable Banking — opérations CÔTÉ SERVEUR uniquement (actions et route de retour).
 * - Jamais d'identifiant ni de code bancaire : l'utilisateur s'authentifie chez sa banque.
 * - Jeton anti-CSRF (`state`) aléatoire : empreinte SHA-256 en base, valeur dans un cookie httpOnly.
 * - Écritures soumises à la RLS du foyer (droit d'écriture), import par la fonction SQL commune.
 * - Journaux : codes d'erreur seulement, jamais de montant, de libellé, d'IBAN ni de jeton.
 */
export const STATE_COOKIE = 'amanah_eb_state';
export const STATE_MAX_AGE_S = 15 * 60;

export function bankSettings(): EnableBankingSettings {
  return enableBankingSettings(process.env, isDemoMode);
}

export function canUseBanking(ctx: Pick<SessionContext, 'email' | 'canWrite'>, s = bankSettings()): boolean {
  return bankAccessAllowed(s, ctx);
}

function providerFor(s: Extract<EnableBankingSettings, { configured: true }>) {
  return new EnableBankingProvider({ applicationId: s.applicationId, privateKey: s.privateKey, baseUrl: s.baseUrl });
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const sameHex = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Libellé d'erreur présentable (aucun détail technique ni donnée bancaire). */
export type BankFailure = 'refus' | 'etat' | 'expire' | 'indisponible' | 'fournisseur' | 'autorisation' | 'inattendu';

/** Messages présentables, choisis par code (jamais de texte reçu de l'extérieur). */
export const BANK_FAILURE_MESSAGE: Record<BankFailure, string> = {
  refus: 'Autorisation refusée ou annulée à la banque.',
  etat: 'Retour de la banque non reconnu : recommencez la connexion.',
  expire: 'L’accès a expiré ou a été retiré : reconnectez la banque.',
  indisponible: 'La banque ne répond pas pour le moment : réessayez plus tard.',
  fournisseur: 'Le fournisseur a refusé la demande : réessayez ou contactez le support.',
  autorisation: 'Connexion bancaire non autorisée pour votre compte.',
  inattendu: 'Erreur inattendue : aucune donnée n’a été modifiée.',
};

export function bankErrorMessage(e: unknown): { status: 'expired' | 'error'; code: BankFailure; message: string } {
  const out = (status: 'expired' | 'error', code: BankFailure) => ({ status, code, message: BANK_FAILURE_MESSAGE[code] });
  if (e instanceof ConsentDeniedError) return out('error', 'refus');
  if (e instanceof EnableBankingError) {
    if (e.reconsent) return out('expired', 'expire');
    if (e.retryable) return out('error', 'indisponible');
    return out('error', 'fournisseur');
  }
  return out('error', 'inattendu');
}

const log = (step: string, e: unknown) =>
  console.error(`[banque] ${step}`, e instanceof EnableBankingError ? `${e.status} ${e.code ?? ''}` : e instanceof Error ? e.name : 'erreur');

export async function listBanks(country: 'BE' = 'BE') {
  const s = bankSettings();
  if (!s.configured) return [];
  return providerFor(s).listInstitutions(country);
}

/** Démarre une connexion : ligne « pending », jeton anti-CSRF, adresse de la banque. */
export async function startConnection(ctx: SessionContext, institutionId: string): Promise<{ redirectUrl: string; cookie: string }> {
  const s = bankSettings();
  if (!s.configured || !canUseBanking(ctx, s)) throw new Error('connexion bancaire non autorisée');
  const sep = institutionId.indexOf(':');
  const state = randomBytes(32).toString('hex');
  const { data, error } = await ctx.supabase.from('bank_connections').insert({
    household_id: ctx.householdId, provider: 'enable_banking', status: 'pending', environment: s.env,
    aspsp_country: institutionId.slice(0, sep), aspsp_name: institutionId.slice(sep + 1).slice(0, 120), state_hash: sha256(state),
    scope: ['balances', 'transactions'],
  }).select('id').single();
  if (error) { log('création', error); throw new Error('connexion impossible'); }
  try {
    const r = await providerFor(s).startConsent({ institutionId, redirectUri: s.redirectUrl, validDays: s.consentDays, state });
    return { redirectUrl: r.redirectUrl, cookie: `${data.id}.${state}` };
  } catch (e) {
    log('autorisation', e);
    await ctx.supabase.from('bank_connections').update({ status: 'error', last_error: bankErrorMessage(e).message, state_hash: null }).eq('id', data.id);
    throw e;
  }
}

/** Retour de la banque : vérifie le jeton, crée la session, les comptes, puis synchronise. */
export async function completeConnection(ctx: SessionContext, q: { code?: string; state?: string; error?: string }, cookie: string | undefined):
  Promise<{ ok: true; connectionId: string; imported: number } | { ok: false; code: BankFailure }> {
  const s = bankSettings();
  if (!s.configured || !canUseBanking(ctx, s)) return { ok: false, code: 'autorisation' };
  const [connectionId, cookieState] = (cookie ?? '').split('.');
  if (!connectionId || !cookieState || !q.state || !sameHex(sha256(q.state), sha256(cookieState))) {
    return { ok: false, code: 'etat' };
  }
  const { data: row } = await ctx.supabase.from('bank_connections').select('id, state_hash, status')
    .eq('id', connectionId).eq('household_id', ctx.householdId).maybeSingle();
  if (!row || row.status !== 'pending' || !row.state_hash || !sameHex(row.state_hash as string, sha256(q.state))) {
    return { ok: false, code: 'etat' };
  }
  const provider = providerFor(s);
  try {
    const session = await provider.completeSession({ state: q.state, code: q.code, error: q.error });
    const { error } = await ctx.supabase.from('bank_connections').update({
      status: 'active', consent_ref: session.grant.consentRef, expires_at: session.grant.expiresAt, state_hash: null, last_error: null,
    }).eq('id', connectionId);
    if (error) throw error;
    for (const a of session.accounts) {
      const { data: existing } = await ctx.supabase.from('accounts').select('id').eq('connection_id', connectionId).eq('external_id', a.externalId).maybeSingle();
      if (existing) continue;
      const { error: aErr } = await ctx.supabase.from('accounts').insert({
        household_id: ctx.householdId, connection_id: connectionId, external_id: a.externalId, name: a.name,
        type: a.type === 'other' ? 'other' : a.type, currency: a.currency, iban_last4: a.ibanLast4 ?? null, opening_balance_cents: 0,
      });
      if (aErr) throw aErr;
    }
    const sync = await syncConnection(ctx, connectionId);
    return { ok: true, connectionId, imported: sync.ok ? sync.imported : 0 };
  } catch (e) {
    log('retour', e);
    const m = bankErrorMessage(e);
    await ctx.supabase.from('bank_connections').update({ status: m.status, last_error: m.message, state_hash: null }).eq('id', connectionId);
    return { ok: false, code: m.code };
  }
}

async function categorizationRules(ctx: SessionContext): Promise<CategorizationRule[]> {
  const { data, error } = await ctx.supabase.from('categorization_rules').select('pattern, category_slug, direction, priority');
  if (error) throw error;
  return (data ?? []).map((r) => ({
    pattern: r.pattern as string, categorySlug: r.category_slug as string,
    direction: (r.direction as 'credit' | 'debit' | null) ?? undefined, priority: r.priority as number,
  }));
}

async function existingHashes(ctx: SessionContext, accountId: string, since: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.supabase.from('transactions').select('dedupe_hash').eq('account_id', accountId).gte('booked_on', since)
      .order('id').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) out.add(r.dedupe_hash as string);
    if (!data || data.length < 1000) return out;
  }
}

async function transactionsSum(ctx: SessionContext, accountId: string): Promise<number> {
  let sum = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await ctx.supabase.from('transactions').select('amount_cents').eq('account_id', accountId).order('id').range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) sum += Number(r.amount_cents);
    if (!data || data.length < 1000) return sum;
  }
}

/** Synchronisation : opérations comptabilisées depuis la dernière fois (recouvrement dédoublonné), solde aligné. */
export async function syncConnection(ctx: SessionContext, connectionId: string): Promise<{ ok: true; imported: number; duplicates: number } | { ok: false; message: string }> {
  const s = bankSettings();
  if (!s.configured || !canUseBanking(ctx, s)) return { ok: false, message: 'Connexion bancaire non autorisée.' };
  const { data: c } = await ctx.supabase.from('bank_connections').select('id, status, consent_ref, expires_at, last_synced_at')
    .eq('id', connectionId).eq('household_id', ctx.householdId).maybeSingle();
  if (!c || c.status !== 'active' || !c.consent_ref) return { ok: false, message: 'Cette connexion n’est pas active.' };
  if (c.expires_at && Date.parse(c.expires_at as string) <= Date.now()) {
    await ctx.supabase.from('bank_connections').update({ status: 'expired', last_error: 'Accès expiré : reconnectez la banque.' }).eq('id', connectionId);
    return { ok: false, message: 'L’accès a expiré : reconnectez la banque.' };
  }
  const grant = { provider: 'enable_banking' as const, consentRef: c.consent_ref as string, secretRef: 'none', expiresAt: (c.expires_at as string) ?? '' };
  const provider = providerFor(s);
  const today = new Date().toISOString().slice(0, 10);
  const since = syncSince((c.last_synced_at as string | null) ?? null, today);
  let imported = 0, duplicates = 0;
  try {
    const rules = await categorizationRules(ctx);
    const { data: accounts, error } = await ctx.supabase.from('accounts').select('id, external_id').eq('connection_id', connectionId).eq('archived', false);
    if (error) throw error;
    for (const a of accounts ?? []) {
      const txs: ProviderTransaction[] = await provider.fetchTransactions(grant, a.external_id as string, since);
      const prepared = normalizeForImport(txs, rules, await existingHashes(ctx, a.id as string, since));
      if (prepared.toInsert.length > 0) {
        const { data, error: rpcErr } = await ctx.supabase.rpc('import_transactions', {
          p_household_id: ctx.householdId, p_account_id: a.id, p_source: 'enable_banking', p_file_name: null, p_profile: 'enable_banking',
          p_error_count: 0, p_rows: toImportPayload(prepared.toInsert),
        });
        if (rpcErr) throw rpcErr;
        const r = data as { imported: number; duplicates: number };
        imported += r.imported;
        duplicates += r.duplicates + prepared.duplicates.length;
      } else duplicates += prepared.duplicates.length;
      // Solde affiché = solde de la banque : le solde de départ absorbe l'historique non importé
      const balance = await provider.fetchBalanceCents(a.external_id as string);
      if (balance !== undefined) {
        await ctx.supabase.from('accounts').update({ opening_balance_cents: balance - await transactionsSum(ctx, a.id as string) }).eq('id', a.id);
      }
    }
    await ctx.supabase.from('bank_connections').update({ last_synced_at: new Date().toISOString(), last_error: null }).eq('id', connectionId);
    return { ok: true, imported, duplicates };
  } catch (e) {
    log('synchronisation', e);
    const m = bankErrorMessage(e);
    await ctx.supabase.from('bank_connections').update({ status: m.status === 'expired' ? 'expired' : 'active', last_error: m.message }).eq('id', connectionId);
    return { ok: false, message: m.message };
  }
}

/** Révocation : session fermée chez Enable Banking ; comptes et opérations conservés. */
export async function revokeConnection(ctx: SessionContext, connectionId: string): Promise<{ ok: boolean; message: string }> {
  const s = bankSettings();
  if (!s.configured || !canUseBanking(ctx, s)) return { ok: false, message: 'Connexion bancaire non autorisée.' };
  const { data: c } = await ctx.supabase.from('bank_connections').select('id, status, consent_ref').eq('id', connectionId).eq('household_id', ctx.householdId).maybeSingle();
  if (!c) return { ok: false, message: 'Connexion introuvable.' };
  if (c.consent_ref && c.status !== 'revoked') {
    try {
      await providerFor(s).revokeConsent({ provider: 'enable_banking', consentRef: c.consent_ref as string, secretRef: 'none', expiresAt: '' });
    } catch (e) {
      log('révocation', e);
      return { ok: false, message: 'La révocation n’a pas abouti chez le fournisseur : réessayez.' };
    }
  }
  const { error } = await ctx.supabase.from('bank_connections').update({ status: 'revoked', revoked_at: new Date().toISOString(), consent_ref: null, state_hash: null }).eq('id', connectionId);
  if (error) { log('révocation (base)', error); return { ok: false, message: 'Révocation enregistrée chez le fournisseur, mais pas ici : réessayez.' }; }
  return { ok: true, message: 'Accès révoqué. Vos comptes et opérations déjà importés sont conservés.' };
}

/** Suppression : révocation puis effacement des comptes liés (opérations comprises) et de la connexion. */
export async function deleteConnectionData(ctx: SessionContext, connectionId: string): Promise<{ ok: boolean; message: string }> {
  const revoked = await revokeConnection(ctx, connectionId);
  if (!revoked.ok) return revoked;
  const { error: aErr } = await ctx.supabase.from('accounts').delete().eq('connection_id', connectionId).eq('household_id', ctx.householdId);
  if (aErr) { log('suppression des comptes', aErr); return { ok: false, message: 'Suppression incomplète : réessayez.' }; }
  const { error } = await ctx.supabase.from('bank_connections').delete().eq('id', connectionId).eq('household_id', ctx.householdId);
  if (error) { log('suppression de la connexion', error); return { ok: false, message: 'Suppression incomplète : réessayez.' }; }
  return { ok: true, message: 'Accès révoqué, comptes et opérations importés de cette banque supprimés.' };
}
