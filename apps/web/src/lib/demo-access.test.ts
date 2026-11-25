import { describe, it, expect } from 'vitest';
import { demoAccessConfig, demoAccessAllowed } from './demo-access.ts';

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString('base64')}`;

describe('accès protégé à la démonstration privée', () => {
  it('sans mot de passe configuré : pas de protection (usage local)', () => {
    expect(demoAccessConfig({})).toBe(null);
  });
  it('refuse un mot de passe trop court', () => {
    expect(() => demoAccessConfig({ DEMO_ACCESS_PASSWORD: 'court' })).toThrow();
  });
  it('accepte uniquement les bons identifiants', () => {
    const cfg = demoAccessConfig({ DEMO_ACCESS_PASSWORD: 'motdepasse-fictif-123' })!;
    expect(demoAccessAllowed(basic('demo', 'motdepasse-fictif-123'), cfg)).toBe(true);
    expect(demoAccessAllowed(basic('demo', 'mauvais-mot-de-passe'), cfg)).toBe(false);
    expect(demoAccessAllowed(basic('autre', 'motdepasse-fictif-123'), cfg)).toBe(false);
    expect(demoAccessAllowed(null, cfg)).toBe(false);
    expect(demoAccessAllowed('Bearer xyz', cfg)).toBe(false);
    expect(demoAccessAllowed('Basic ###', cfg)).toBe(false);
  });
  it('utilisateur personnalisable', () => {
    const cfg = demoAccessConfig({ DEMO_ACCESS_PASSWORD: 'motdepasse-fictif-123', DEMO_ACCESS_USER: 'jury' })!;
    expect(demoAccessAllowed(basic('jury', 'motdepasse-fictif-123'), cfg)).toBe(true);
  });
});

import { accessTokenValid, demoAccessRequired, demoPasswordMatches, safeNextPath, signAccessToken, ACCESS_MAX_AGE_S } from './demo-access.ts';
import { feedbackMailto, FEEDBACK_QUESTIONS } from './feedback.ts';

describe('jeton d’accès signé (application installée sur iPhone)', () => {
  const cfg = demoAccessConfig({ DEMO_ACCESS_PASSWORD: 'motdepasse-fictif-123' })!;
  const now = 1_800_000_000;
  it('un jeton signé est accepté jusqu’à son expiration, puis refusé', async () => {
    const t = await signAccessToken(cfg, now);
    expect(await accessTokenValid(t, cfg, now)).toBe(true);
    expect(await accessTokenValid(t, cfg, now + ACCESS_MAX_AGE_S - 1)).toBe(true);
    expect(await accessTokenValid(t, cfg, now + ACCESS_MAX_AGE_S + 1)).toBe(false);
  });
  it('changer le mot de passe révoque tous les jetons ; jeton falsifié refusé', async () => {
    const t = await signAccessToken(cfg, now);
    const other = demoAccessConfig({ DEMO_ACCESS_PASSWORD: 'autre-motdepasse-fictif' })!;
    expect(await accessTokenValid(t, other, now)).toBe(false);
    const [exp] = t.split('.');
    expect(await accessTokenValid(`${Number(exp) + 1000}.${t.split('.')[1]}`, cfg, now)).toBe(false);
    expect(await accessTokenValid(`${exp}.AAAA`, cfg, now)).toBe(false);
    expect(await accessTokenValid(undefined, cfg, now)).toBe(false);
    expect(await accessTokenValid('n.importe.quoi', cfg, now)).toBe(false);
  });
  it('expiration plus lointaine que la durée maximale : refusée', async () => {
    expect(await accessTokenValid(`${now + ACCESS_MAX_AGE_S * 10}.x`, cfg, now)).toBe(false);
  });
  it('mot de passe saisi comparé exactement', () => {
    expect(demoPasswordMatches('motdepasse-fictif-123', cfg)).toBe(true);
    expect(demoPasswordMatches('motdepasse-fictif-12', cfg)).toBe(false);
    expect(demoPasswordMatches('', cfg)).toBe(false);
  });
  it('hébergement : protection exigée par le build ou la variable', () => {
    expect(demoAccessRequired({}, true)).toBe(true);
    expect(demoAccessRequired({ DEMO_ACCESS_REQUIRED: 'true' }, false)).toBe(true);
    expect(demoAccessRequired({}, false)).toBe(false);
  });
  it('destination après connexion : chemin interne seulement', () => {
    expect(safeNextPath('/goals/abc?x=1')).toBe('/goals/abc?x=1');
    for (const bad of ['https://ailleurs.example', '//ailleurs.example', '/\\ailleurs', 'goals', '', null, '/acces']) expect(safeNextPath(bad)).toBe('/dashboard');
  });
});

describe('recueil d’avis', () => {
  it('lien e-mail prérempli seulement avec une adresse valide ; aucune donnée bancaire demandée', () => {
    expect(feedbackMailto(undefined)).toBeNull();
    expect(feedbackMailto('pas-une-adresse')).toBeNull();
    const m = feedbackMailto('avis@example.test')!;
    expect(m.startsWith('mailto:avis%40example.test?subject=')).toBe(true);
    expect(decodeURIComponent(m)).toContain(FEEDBACK_QUESTIONS[0]);
    expect(FEEDBACK_QUESTIONS.join(' ')).not.toMatch(/IBAN|identifiant|code|carte|mot de passe/i);
  });
});
