import { describe, expect, it } from 'vitest';
import { APP_DOCUMENTS, documentHash, hasReligiousConsent, LEGAL_DOCUMENTS, LEGAL_DRAFT_NOTICE, missingConsents, RELIGIOUS_DOCUMENT } from './documents.ts';
import { nextOnboardingStep } from '../onboarding.ts';

const versionOf = (kind: string) => LEGAL_DOCUMENTS.find((d) => d.kind === kind)!.version;
const rec = (kind: string, granted: boolean, at: string, version = versionOf(kind)) => ({ kind, granted, document_version: version, recorded_at: at });

describe('documents juridiques provisoires', () => {
  it('distingue conditions, information et consentement explicite', () => {
    expect(LEGAL_DOCUMENTS.map((d) => [d.kind, d.nature])).toEqual([
      ['terms', 'acceptance'], ['privacy', 'acknowledgement'], ['special_category', 'explicit_consent'],
    ]);
  });
  it('signale chaque texte comme provisoire', () => {
    for (const d of LEGAL_DOCUMENTS) expect(d.body).toContain(LEGAL_DRAFT_NOTICE);
  });
  it('produit une empreinte SHA-256 stable et propre à chaque texte', async () => {
    const h = await documentHash(LEGAL_DOCUMENTS[0]);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await documentHash(LEGAL_DOCUMENTS[0])).toBe(h);
    expect(await documentHash({ ...LEGAL_DOCUMENTS[0], body: LEGAL_DOCUMENTS[0].body + ' ' })).not.toBe(h);
  });
});

describe('consentements requis pour l’application (Sprint 2 : sans article 9)', () => {
  it('exige seulement les conditions et l’information, dans leur version en vigueur', () => {
    expect(APP_DOCUMENTS.map((d) => d.kind)).toEqual(['terms', 'privacy']);
    expect(missingConsents([])).toEqual(['terms', 'privacy']);
    expect(missingConsents([rec('terms', true, '1'), rec('privacy', true, '1')])).toEqual([]);
    expect(missingConsents([rec('terms', true, '1', 'ancienne'), rec('privacy', true, '1')])).toEqual(['terms']);
  });
  it('le retrait du consentement article 9 ne bloque pas l’application', () => {
    const r = [rec('terms', true, '1'), rec('privacy', true, '1'), rec('special_category', true, '1'), rec('special_category', false, '2')];
    expect(missingConsents(r)).toEqual([]);
    expect(hasReligiousConsent(r)).toBe(false);
  });
  it('oriente vers la bonne étape d’accueil', () => {
    expect(nextOnboardingStep({ missingConsents: ['terms'], profileCompleted: true })).toBe('/bienvenue/consentements');
    expect(nextOnboardingStep({ missingConsents: [], profileCompleted: false })).toBe('/bienvenue/profil');
    expect(nextOnboardingStep({ missingConsents: [], profileCompleted: true })).toBe(null);
  });
});

describe('consentement article 9 (fonctions de finance islamique)', () => {
  it('est un consentement explicite distinct, qui annonce le caractère facultatif et la confidentialité en foyer', () => {
    expect(RELIGIOUS_DOCUMENT.nature).toBe('explicit_consent');
    expect(RELIGIOUS_DOCUMENT.body).toContain('facultatif');
    expect(RELIGIOUS_DOCUMENT.body).toContain('foyer partagé');
  });
  it('exige la version en vigueur et suit l’enregistrement le plus récent', () => {
    expect(hasReligiousConsent([])).toBe(false);
    expect(hasReligiousConsent([rec('special_category', true, '1')])).toBe(true);
    expect(hasReligiousConsent([rec('special_category', true, '1', '2026-11-brouillon-1')])).toBe(false);
    const r = [rec('special_category', true, '1'), rec('special_category', false, '2')];
    expect(hasReligiousConsent(r)).toBe(false);
    expect(hasReligiousConsent([...r, rec('special_category', true, '3')])).toBe(true);
  });
  it('départage les enregistrements de même horodatage par leur ordre', () => {
    const same = '2026-11-10T10:00:00Z';
    const r = [{ ...rec('special_category', false, same), seq: 2 }, { ...rec('special_category', true, same), seq: 1 }];
    expect(hasReligiousConsent(r)).toBe(false);
    expect(hasReligiousConsent([...r, { ...rec('special_category', true, same), seq: 3 }])).toBe(true);
  });
});
