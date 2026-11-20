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
