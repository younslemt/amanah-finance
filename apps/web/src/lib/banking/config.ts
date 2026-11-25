/**
 * Configuration du connecteur Enable Banking (fonction pure, testée).
 * Lue côté serveur uniquement ; la clé privée ne quitte jamais le serveur.
 *
 * - `ENABLE_BANKING_ENV` : `sandbox` (banque simulée) ou `production` (mode restreint : uniquement
 *   les comptes liés à l'application dans le panneau Enable Banking).
 * - `ENABLE_BANKING_APP_ID`, `ENABLE_BANKING_PRIVATE_KEY` (PEM, « \n » acceptés) ou
 *   `ENABLE_BANKING_PRIVATE_KEY_B64` (PEM en base64).
 * - `ENABLE_BANKING_REDIRECT_URL` : adresse de retour déclarée dans le panneau Enable Banking
 *   (HTTPS obligatoire en production).
 * - `ENABLE_BANKING_ALLOWED_EMAILS` : personnes autorisées (obligatoire en production) — test
 *   personnel restreint, jamais ouvert aux autres utilisateurs sans contrat ni validation juridique.
 * - `ENABLE_BANKING_API_URL` : réservé aux tests automatisés (serveur simulé local, sandbox seulement).
 */
export type EnableBankingEnv = 'sandbox' | 'production';

export type EnableBankingSettings =
  | { configured: false; reason: string }
  | {
      configured: true;
      env: EnableBankingEnv;
      applicationId: string;
      privateKey: string;
      redirectUrl: string;
      baseUrl: string | undefined;
      allowedEmails: ReadonlySet<string>;
      /** Durée d'accès demandée à la banque (jours, ≤ 180). */
      consentDays: number;
    };

export function enableBankingSettings(env: Record<string, string | undefined>, demoMode: boolean): EnableBankingSettings {
  if (demoMode) return { configured: false, reason: 'démonstration : aucune connexion bancaire' };
  const mode = env.ENABLE_BANKING_ENV?.trim();
  if (!mode) return { configured: false, reason: 'connecteur non activé' };
  if (mode !== 'sandbox' && mode !== 'production') return { configured: false, reason: 'ENABLE_BANKING_ENV invalide' };
  const applicationId = env.ENABLE_BANKING_APP_ID?.trim() ?? '';
  let privateKey = env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, '\n').trim() ?? '';
  if (!privateKey && env.ENABLE_BANKING_PRIVATE_KEY_B64) {
    try { privateKey = Buffer.from(env.ENABLE_BANKING_PRIVATE_KEY_B64, 'base64').toString('utf8').trim(); } catch { privateKey = ''; }
  }
  if (!/^[\w-]{6,80}$/.test(applicationId)) return { configured: false, reason: 'ENABLE_BANKING_APP_ID absent ou invalide' };
  if (!/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) return { configured: false, reason: 'clé privée absente ou invalide' };

  let redirect: URL;
  try { redirect = new URL(env.ENABLE_BANKING_REDIRECT_URL ?? ''); } catch { return { configured: false, reason: 'ENABLE_BANKING_REDIRECT_URL absente' }; }
  const local = ['localhost', '127.0.0.1'].includes(redirect.hostname);
  if (redirect.protocol !== 'https:' && !(mode === 'sandbox' && local)) return { configured: false, reason: 'adresse de retour HTTPS obligatoire' };
  if (redirect.pathname !== '/api/banque/retour') return { configured: false, reason: 'adresse de retour : chemin /api/banque/retour attendu' };

  let baseUrl: string | undefined;
  if (env.ENABLE_BANKING_API_URL) {
    let api: URL;
    try { api = new URL(env.ENABLE_BANKING_API_URL); } catch { return { configured: false, reason: 'ENABLE_BANKING_API_URL invalide' }; }
    // Une autre adresse que l'API officielle n'est admise que pour un serveur simulé local en sandbox
    if (mode !== 'sandbox' || !['localhost', '127.0.0.1'].includes(api.hostname)) return { configured: false, reason: 'ENABLE_BANKING_API_URL réservée aux tests locaux' };
    baseUrl = api.origin;
  }

  const allowedEmails = new Set((env.ENABLE_BANKING_ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (mode === 'production' && allowedEmails.size === 0) return { configured: false, reason: 'production restreinte : ENABLE_BANKING_ALLOWED_EMAILS obligatoire' };
  const days = Number(env.ENABLE_BANKING_CONSENT_DAYS ?? 90);
  return {
    configured: true, env: mode, applicationId, privateKey, redirectUrl: redirect.toString(), baseUrl, allowedEmails,
    consentDays: Number.isInteger(days) && days >= 1 && days <= 180 ? days : 90,
  };
}

/** Accès au connecteur pour une personne : droit d'écriture et, si une liste existe, adresse autorisée. */
export function bankAccessAllowed(s: EnableBankingSettings, user: { email: string | null; canWrite: boolean }): boolean {
  if (!s.configured || !user.canWrite) return false;
  if (s.allowedEmails.size === 0) return s.env === 'sandbox';
  return !!user.email && s.allowedEmails.has(user.email.toLowerCase());
}

/** Période de la première synchronisation puis des suivantes (recouvrement de 7 jours, dédoublonné). */
export function syncSince(lastSyncedAt: string | null, today: string, firstDays = 90): string {
  const day = 86_400_000;
  const t = Date.parse(`${today}T00:00:00Z`);
  const floor = new Date(t - firstDays * day).toISOString().slice(0, 10);
  if (!lastSyncedAt) return floor;
  const overlap = new Date(Date.parse(lastSyncedAt) - 7 * day).toISOString().slice(0, 10);
  return overlap > floor ? overlap : floor;
}
