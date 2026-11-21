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
