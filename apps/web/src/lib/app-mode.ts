/**
 * Mode de l'application, déterminé UNE fois et de façon explicite.
 *  - demo : données fictives, aucune authentification, bandeau permanent, aucun client Supabase.
 *  - live : Supabase obligatoire, authentification obligatoire, jamais de données fictives.
 * Règles :
 *  1. NEXT_PUBLIC_APP_MODE vaut 'demo' ou 'live'. Toute autre valeur est une erreur.
 *  2. Absent en développement : 'demo'. Absent en production : erreur (pas de démo par accident).
 *  3. 'live' sans URL et clé Supabase : erreur (pas de repli silencieux vers la démo).
 */
export type AppMode = 'demo' | 'live';

export interface AppModeEnv {
  NEXT_PUBLIC_APP_MODE?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NODE_ENV?: string;
}

export type AppModeResult =
  | { ok: true; mode: AppMode; supabaseUrl: string; supabaseAnonKey: string; siteUrl: string | null }
  | { ok: false; error: string };

export function resolveAppMode(env: AppModeEnv): AppModeResult {
  const raw = (env.NEXT_PUBLIC_APP_MODE ?? '').trim();
  const isProd = env.NODE_ENV === 'production';
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const site = (env.NEXT_PUBLIC_SITE_URL ?? '').trim();

  if (raw !== '' && raw !== 'demo' && raw !== 'live') {
    return { ok: false, error: `NEXT_PUBLIC_APP_MODE invalide : « ${raw} » (attendu : demo ou live)` };
  }
  const mode: AppMode | null = raw === '' ? (isProd ? null : 'demo') : raw;
  if (mode === null) return { ok: false, error: 'NEXT_PUBLIC_APP_MODE doit être défini en production (demo ou live)' };

  if (mode === 'demo') return { ok: true, mode, supabaseUrl: '', supabaseAnonKey: '', siteUrl: site || null };

  if (!url || !key) return { ok: false, error: 'Mode live : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont obligatoires' };
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(url)) {
    return { ok: false, error: 'NEXT_PUBLIC_SUPABASE_URL doit être en https (http autorisé seulement en local)' };
  }
  if (isProd && !site) return { ok: false, error: 'Mode live en production : NEXT_PUBLIC_SITE_URL est obligatoire (URL de redirection)' };
  return { ok: true, mode, supabaseUrl: url, supabaseAnonKey: key, siteUrl: site || null };
}
