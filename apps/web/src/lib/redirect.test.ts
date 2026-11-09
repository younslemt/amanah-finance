import { describe, expect, it } from 'vitest';
import { buildAuthCallbackUrl, classifyAuthError, parseAuthError, safeRedirectPath } from './redirect.ts';

describe('redirections après connexion', () => {
  it('accepte les chemins internes connus', () => {
    expect(safeRedirectPath('/zakat')).toBe('/zakat');
    expect(safeRedirectPath('/goals/abc?tab=1')).toBe('/goals/abc?tab=1');
    expect(safeRedirectPath(null)).toBe('/dashboard');
  });
  it('refuse les redirections ouvertes', () => {
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil.example', '%2F%2Fevil.example', 'javascript:alert(1)', '/admin', '/zakat\u0000', '/%E0%A4%A']) {
      expect(safeRedirectPath(bad)).toBe('/dashboard');
    }
  });
  it('construit l’URL de retour depuis la configuration, pas depuis l’en-tête', () => {
    expect(buildAuthCallbackUrl('https://app.example.test', 'https://evil.example', '/zakat')).toBe('https://app.example.test/auth/callback?next=%2Fzakat');
    expect(buildAuthCallbackUrl(null, 'https://evil.example')).toBe(null);
    expect(buildAuthCallbackUrl(null, 'http://localhost:3000')).toBe('http://localhost:3000/auth/callback');
    expect(buildAuthCallbackUrl('https://app.example.test', null, '//evil.example')).toBe('https://app.example.test/auth/callback');
  });
  it('classe les erreurs sans révéler l’existence d’un compte', () => {
    expect(classifyAuthError(null)).toBe(null);
    expect(classifyAuthError({ status: 429 })).toBe('rate_limited');
    expect(classifyAuthError({ code: 'email_address_invalid' })).toBe('invalid_email');
    expect(classifyAuthError({ status: 500, code: 'unexpected_failure' })).toBe('temporary');
    expect(parseAuthError('link_expired')).toBe('link_expired');
    expect(parseAuthError('<script>')).toBe('unknown');
    expect(parseAuthError(undefined)).toBe(null);
  });
});
