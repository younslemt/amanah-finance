/**
 * Protection d'accès de la démonstration privée, appliquée PAR LE SERVEUR (middleware),
 * indépendamment de l'hébergeur : authentification HTTP Basic sur toutes les pages
 * quand DEMO_ACCESS_PASSWORD est défini. Ni robots.txt, ni écran de connexion côté navigateur.
 * Fonctions pures, sans dépendance au runtime : testées seules.
 */
export interface DemoAccessConfig { user: string; password: string }

/** Configuration lue dans l'environnement serveur ; null = accès libre (usage local). */
export function demoAccessConfig(env: Record<string, string | undefined>): DemoAccessConfig | null {
  const password = env.DEMO_ACCESS_PASSWORD?.trim();
  if (!password) return null;
  if (password.length < 12) throw new Error('DEMO_ACCESS_PASSWORD trop court (12 caractères minimum).');
  return { user: env.DEMO_ACCESS_USER?.trim() || 'demo', password };
}

/** Comparaison en temps constant (longueurs incluses) pour ne rien révéler du secret. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i % (a.length || 1)) || 0) ^ (b.charCodeAt(i % (b.length || 1)) || 0);
  return diff === 0;
}

export function demoAccessAllowed(authorization: string | null, cfg: DemoAccessConfig | null): boolean {
  if (!cfg) return true;
  if (!authorization?.startsWith('Basic ')) return false;
  let decoded: string;
  try { decoded = atob(authorization.slice(6).trim()); } catch { return false; }
  const sep = decoded.indexOf(':');
  if (sep < 0) return false;
  // Les deux comparaisons sont toujours évaluées
  const userOk = safeEqual(decoded.slice(0, sep), cfg.user);
  const passOk = safeEqual(decoded.slice(sep + 1), cfg.password);
  return userOk && passOk;
}

// ---------------------------------------------------------------------------
// Jeton d'accès (cookie) : nécessaire à l'application installée sur iPhone
// ---------------------------------------------------------------------------
// Une application ajoutée à l'écran d'accueil d'iOS gère mal l'authentification HTTP Basic.
// Après saisie du mot de passe sur /acces, le serveur dépose un cookie httpOnly signé
// (HMAC-SHA256, clé dérivée du mot de passe) : changer le mot de passe révoque tous les accès.
// Web Crypto uniquement : fonctionne dans le middleware (Edge) comme dans Node.

export const ACCESS_COOKIE = 'amanah_acces';
export const ACCESS_MAX_AGE_S = 30 * 24 * 3600;

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(`amanah-demo-access:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Jeton « <expiration en secondes>.<signature> ». */
export async function signAccessToken(cfg: DemoAccessConfig, nowS: number): Promise<string> {
  const exp = nowS + ACCESS_MAX_AGE_S;
  return `${exp}.${await hmac(cfg.password, `${cfg.user}:${exp}`)}`;
}

export async function accessTokenValid(token: string | undefined, cfg: DemoAccessConfig | null, nowS: number): Promise<boolean> {
  if (!cfg) return true;
  if (!token) return false;
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || !sig || exp < nowS || exp > nowS + ACCESS_MAX_AGE_S) return false;
  return safeEqual(sig, await hmac(cfg.password, `${cfg.user}:${exp}`));
}

/** Mot de passe saisi sur /acces : comparaison en temps constant. */
export function demoPasswordMatches(input: string, cfg: DemoAccessConfig): boolean {
  return safeEqual(input, cfg.password);
}

/**
 * Un hébergement public doit TOUJOURS être protégé : si l'accès est exigé (build sur Netlify ou
 * DEMO_ACCESS_REQUIRED=true) mais qu'aucun mot de passe n'est configuré, tout est refusé.
 */
export function demoAccessRequired(env: Record<string, string | undefined>, builtForHosting: boolean): boolean {
  return builtForHosting || env.DEMO_ACCESS_REQUIRED === 'true';
}

/** Destination après connexion : chemin interne uniquement (aucune redirection ouverte). */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/acces')) return '/dashboard';
  return raw.slice(0, 300);
}
