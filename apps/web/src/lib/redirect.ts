/**
 * Redirections sûres après authentification.
 * Seuls les chemins internes de l'application sont acceptés : pas d'URL absolue,
 * pas de « //hote », pas de barre oblique inverse, pas de caractère de contrôle.
 */
const ALLOWED_PREFIXES = ['/dashboard', '/budget', '/goals', '/zakat', '/purification', '/wealth', '/comptes', '/parametres', '/bienvenue', '/reinitialiser'];
export const DEFAULT_AFTER_LOGIN = '/dashboard';

export function safeRedirectPath(input: string | null | undefined): string {
  if (!input) return DEFAULT_AFTER_LOGIN;
  let value: string;
  try { value = decodeURIComponent(input); } catch { return DEFAULT_AFTER_LOGIN; }
  if (/[\u0000-\u001f\\]/.test(value)) return DEFAULT_AFTER_LOGIN;
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_AFTER_LOGIN;
  const path = value.split(/[?#]/)[0];
  const allowed = ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  return allowed ? value : DEFAULT_AFTER_LOGIN;
}

/**
 * URL de retour du lien magique : construite depuis la configuration (NEXT_PUBLIC_SITE_URL),
 * jamais depuis un en-tête de requête modifiable par le client.
 * En local uniquement, l'origine localhost est acceptée.
 */
export function buildAuthCallbackUrl(siteUrl: string | null, requestOrigin: string | null, next?: string): string | null {
  let base = siteUrl;
  if (!base && requestOrigin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) base = requestOrigin;
  if (!base) return null;
  const url = new URL('/auth/callback', base);
  const target = safeRedirectPath(next);
  if (target !== DEFAULT_AFTER_LOGIN) url.searchParams.set('next', target);
  return url.toString();
}

/** Codes d'erreur affichables sur l'écran de connexion (aucun détail technique exposé). */
export const AUTH_ERROR_CODES = ['link_invalid', 'link_expired', 'session_failed', 'config', 'unknown'] as const;

/** Messages d'information affichables sur l'écran de connexion. */
export const AUTH_INFO_CODES = ['signed_out', 'password_updated', 'account_deleted', 'email_confirmed', 'consent_withdrawn'] as const;
export type AuthInfoCode = (typeof AUTH_INFO_CODES)[number];
export function parseAuthInfo(raw: string | null | undefined): AuthInfoCode | null {
  return raw && (AUTH_INFO_CODES as readonly string[]).includes(raw) ? (raw as AuthInfoCode) : null;
}
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export function parseAuthError(raw: string | null | undefined): AuthErrorCode | null {
  if (!raw) return null;
  return (AUTH_ERROR_CODES as readonly string[]).includes(raw) ? (raw as AuthErrorCode) : 'unknown';
}

/** Traduit une erreur Supabase en code interne, sans divulguer si un compte existe. */
export function classifyAuthError(err: { status?: number; code?: string; message?: string } | null): 'rate_limited' | 'temporary' | 'invalid_email' | 'invalid_credentials' | 'email_not_confirmed' | 'weak_password' | null {
  if (!err) return null;
  if (err.code === 'invalid_credentials') return 'invalid_credentials';
  if (err.code === 'email_not_confirmed') return 'email_not_confirmed';
  if (err.code === 'weak_password') return 'weak_password';
  if (err.status === 429 || err.code === 'over_email_send_rate_limit' || err.code === 'over_request_rate_limit') return 'rate_limited';
  if (err.code === 'email_address_invalid' || err.code === 'validation_failed') return 'invalid_email';
  return 'temporary';
}
