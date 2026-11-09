import { describe, expect, it } from 'vitest';
import { resolveAppMode } from './app-mode.ts';

const live = { NEXT_PUBLIC_APP_MODE: 'live', NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon', NEXT_PUBLIC_SITE_URL: 'https://app.example.test', NODE_ENV: 'production' };

describe('séparation démo / réel', () => {
  it('démo par défaut en développement uniquement', () => {
    expect(resolveAppMode({ NODE_ENV: 'development' })).toMatchObject({ ok: true, mode: 'demo' });
    expect(resolveAppMode({ NODE_ENV: 'production' }).ok).toBe(false);
  });
  it('n’active jamais la démo par repli silencieux', () => {
    const r = resolveAppMode({ ...live, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' });
    expect(r.ok).toBe(false);
  });
  it('refuse une valeur de mode inconnue', () => {
    expect(resolveAppMode({ NEXT_PUBLIC_APP_MODE: 'prod' }).ok).toBe(false);
  });
  it('exige https et une URL de site en production', () => {
    expect(resolveAppMode({ ...live, NEXT_PUBLIC_SUPABASE_URL: 'http://abc.supabase.co' }).ok).toBe(false);
    expect(resolveAppMode({ ...live, NEXT_PUBLIC_SITE_URL: '' }).ok).toBe(false);
    expect(resolveAppMode(live)).toMatchObject({ ok: true, mode: 'live', siteUrl: 'https://app.example.test' });
  });
  it('accepte Supabase local en http en développement', () => {
    expect(resolveAppMode({ ...live, NODE_ENV: 'development', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SITE_URL: '' })).toMatchObject({ ok: true, mode: 'live' });
  });
  it('n’expose aucun identifiant Supabase en démo', () => {
    expect(resolveAppMode({ ...live, NEXT_PUBLIC_APP_MODE: 'demo' })).toMatchObject({ ok: true, mode: 'demo', supabaseUrl: '', supabaseAnonKey: '' });
  });
});
