import { describe, expect, it } from 'vitest';
import { documentHash, LEGAL_DOCUMENTS, LEGAL_DRAFT_NOTICE, missingConsents } from './documents.ts';
import { nextOnboardingStep } from '../onboarding.ts';

const v = LEGAL_DOCUMENTS[0].version;
const rec = (kind: string, granted: boolean, at: string, version = v) => ({ kind, granted, document_version: version, recorded_at: at });

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

describe('consentements requis', () => {
  it('exige les trois documents dans leur version en vigueur', () => {
    expect(missingConsents([])).toEqual(['terms', 'privacy', 'special_category']);
    expect(missingConsents([rec('terms', true, '1'), rec('privacy', true, '1'), rec('special_category', true, '1')])).toEqual([]);
    expect(missingConsents([rec('terms', true, '1', 'ancienne'), rec('privacy', true, '1'), rec('special_category', true, '1')])).toEqual(['terms']);
  });
  it('tient compte du retrait le plus récent', () => {
    const r = [rec('terms', true, '1'), rec('privacy', true, '1'), rec('special_category', true, '1'), rec('special_category', false, '2')];
    expect(missingConsents(r)).toEqual(['special_category']);
    expect(missingConsents([...r, rec('special_category', true, '3')])).toEqual([]);
  });
  it('oriente vers la bonne étape d’accueil', () => {
    expect(nextOnboardingStep({ missingConsents: ['terms'], profileCompleted: true })).toBe('/bienvenue/consentements');
    expect(nextOnboardingStep({ missingConsents: [], profileCompleted: false })).toBe('/bienvenue/profil');
    expect(nextOnboardingStep({ missingConsents: [], profileCompleted: true })).toBe(null);
  });
});
