import { resolveAppMode } from './app-mode.ts';

/**
 * Lecture explicite de chaque variable : Next.js n'injecte les NEXT_PUBLIC_*
 * que lorsqu'elles sont écrites en toutes lettres.
 */
const result = resolveAppMode({
  NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NODE_ENV: process.env.NODE_ENV,
});

// Configuration invalide : l'application refuse de démarrer plutôt que de basculer en démo.
if (!result.ok) throw new Error(`Configuration invalide — ${result.error}`);

export const APP_MODE = result.mode;
export const isDemoMode = result.mode === 'demo';
export const isLiveMode = result.mode === 'live';
export const SUPABASE_URL = result.supabaseUrl;
export const SUPABASE_ANON_KEY = result.supabaseAnonKey;
export const SITE_URL = result.siteUrl;
