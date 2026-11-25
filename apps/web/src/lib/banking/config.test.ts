import { describe, expect, it } from 'vitest';
import { bankAccessAllowed, enableBankingSettings, syncSince } from './config.ts';

const KEY = '-----BEGIN PRIVATE KEY-----\\nFICTIVE\\n-----END PRIVATE KEY-----';
const base = {
  ENABLE_BANKING_ENV: 'sandbox', ENABLE_BANKING_APP_ID: 'app-fictive-0001', ENABLE_BANKING_PRIVATE_KEY: KEY,
  ENABLE_BANKING_REDIRECT_URL: 'http://localhost:3000/api/banque/retour',
};

describe('configuration du connecteur Enable Banking', () => {
  it('jamais en démonstration ; désactivé par défaut', () => {
    expect(enableBankingSettings(base, true).configured).toBe(false);
    expect(enableBankingSettings({}, false)).toEqual({ configured: false, reason: 'connecteur non activé' });
  });
  it('sandbox locale : HTTP local admis, clé PEM avec « \\n » échappés', () => {
    const s = enableBankingSettings(base, false);
    expect(s.configured).toBe(true);
    if (s.configured) {
      expect(s.privateKey).toContain('\nFICTIVE\n');
      expect(s.consentDays).toBe(90);
      expect(s.baseUrl).toBeUndefined();
    }
  });
  it('production : HTTPS et liste de personnes autorisées obligatoires', () => {
    const prod = { ...base, ENABLE_BANKING_ENV: 'production' };
    expect(enableBankingSettings(prod, false)).toMatchObject({ configured: false, reason: 'adresse de retour HTTPS obligatoire' });
    const https = { ...prod, ENABLE_BANKING_REDIRECT_URL: 'https://amanah.example.test/api/banque/retour' };
    expect(enableBankingSettings(https, false)).toMatchObject({ configured: false, reason: 'production restreinte : ENABLE_BANKING_ALLOWED_EMAILS obligatoire' });
    expect(enableBankingSettings({ ...https, ENABLE_BANKING_ALLOWED_EMAILS: 'Moi@Example.test' }, false).configured).toBe(true);
  });
  it('adresse d’API de test réservée à un serveur local en sandbox', () => {
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_API_URL: 'http://localhost:4010' }, false)).toMatchObject({ configured: true, baseUrl: 'http://localhost:4010' });
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_API_URL: 'https://ailleurs.example' }, false).configured).toBe(false);
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_ENV: 'production', ENABLE_BANKING_REDIRECT_URL: 'https://a.example/api/banque/retour', ENABLE_BANKING_ALLOWED_EMAILS: 'a@b.c', ENABLE_BANKING_API_URL: 'http://localhost:4010' }, false).configured).toBe(false);
  });
  it('adresse de retour : chemin attendu ; clé et identifiant valides', () => {
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_REDIRECT_URL: 'http://localhost:3000/ailleurs' }, false).configured).toBe(false);
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_PRIVATE_KEY: 'secret' }, false).configured).toBe(false);
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_APP_ID: 'a b' }, false).configured).toBe(false);
    expect(enableBankingSettings({ ...base, ENABLE_BANKING_CONSENT_DAYS: '400' }, false)).toMatchObject({ consentDays: 90 });
  });
  it('accès : droit d’écriture ; liste nominative en production', () => {
    const sandbox = enableBankingSettings(base, false);
    expect(bankAccessAllowed(sandbox, { email: 'x@y.z', canWrite: true })).toBe(true);
    expect(bankAccessAllowed(sandbox, { email: 'x@y.z', canWrite: false })).toBe(false);
    const prod = enableBankingSettings({ ...base, ENABLE_BANKING_ENV: 'production', ENABLE_BANKING_REDIRECT_URL: 'https://a.example/api/banque/retour', ENABLE_BANKING_ALLOWED_EMAILS: 'moi@example.test' }, false);
    expect(bankAccessAllowed(prod, { email: 'MOI@example.test', canWrite: true })).toBe(true);
    expect(bankAccessAllowed(prod, { email: 'autre@example.test', canWrite: true })).toBe(false);
    expect(bankAccessAllowed(prod, { email: null, canWrite: true })).toBe(false);
  });
  it('périodes de synchronisation : 90 jours puis recouvrement de 7 jours', () => {
    expect(syncSince(null, '2026-11-25')).toBe('2026-08-27');
    expect(syncSince('2026-11-20T08:00:00Z', '2026-11-25')).toBe('2026-11-13');
    expect(syncSince('2026-01-01T00:00:00Z', '2026-11-25')).toBe('2026-08-27');
  });
});
