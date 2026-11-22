import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { activeChild, avatarInitial, isItemActive, mainNavigation, profileMenu } from './navigation.ts';
import { availableQuickActions } from './quick-actions.ts';
import { buildEngagementsView, type EngagementsInput } from './engagements-view.ts';
import { zakatStatusView } from './zakat-status.ts';
import type { ZakatCommitment } from './home-view.ts';
import type { ContributionRow } from './contributions-view.ts';

const APP = fileURLToPath(new URL('../app/(app)', import.meta.url));
const routeExists = (href: string) => existsSync(`${APP}/${href.split('#')[0]!.split('?')[0]!.split('/').filter(Boolean).join('/')}/page.tsx`);

describe('navigation Islamic-first : cinq entrées', () => {
  it('avec consentement : « Mes engagements » et ses sous-entrées Zakat, Purification, Solidarité', () => {
    const nav = mainNavigation({ religiousEnabled: true });
    expect(nav.map((n) => n.label)).toEqual(['Accueil', 'Mes engagements', 'Projets', 'Budget', 'Patrimoine']);
    expect(nav[1]!.children.map((c) => [c.label, c.href])).toEqual([['Zakat', '/zakat'], ['Purification', '/purification'], ['Solidarité', '/dons']]);
    for (const n of nav) {
      expect(routeExists(n.href)).toBe(true);
      for (const c of n.children) expect(routeExists(c.href)).toBe(true);
    }
  });

  it('sans consentement : « Finance islamique », aucune sous-entrée, même destination pédagogique', () => {
    const nav = mainNavigation({ religiousEnabled: false });
    expect(nav[1]).toMatchObject({ label: 'Finance islamique', href: '/finance-islamique', children: [] });
    expect(nav.every((n) => n.children.length === 0)).toBe(true);
    // Aucune donnée : la navigation ne dépend que du consentement (aucun montant, compteur ou nom)
    expect(JSON.stringify(nav)).not.toMatch(/\d+\s?€|Zakat|Purification|Solidarité/);
  });

  it('entrée et sous-entrée actives', () => {
    const [, commitments, , budget] = mainNavigation({ religiousEnabled: true });
    expect(isItemActive(commitments!, '/zakat/al-fitr')).toBe(true);
    expect(activeChild(commitments!, '/zakat/al-fitr')).toBe('/zakat');
    expect(activeChild(commitments!, '/dons')).toBe('/dons');
    expect(activeChild(commitments!, '/finance-islamique')).toBeNull();
    expect(isItemActive(budget!, '/comptes')).toBe(true);
    expect(isItemActive(budget!, '/budgetaire')).toBe(false);
    // Sans consentement, la porte de consentement des sous-pages garde l'entrée active
    const off = mainNavigation({ religiousEnabled: false })[1]!;
    expect(isItemActive(off, '/purification')).toBe(true);
    expect(activeChild(off, '/purification')).toBeNull();
  });
});

describe('menu profil', () => {
  const ids = (m: ReturnType<typeof profileMenu>) => m.items.map((i) => i.id);

  it('mode réel : comptes, import, recommandations, paramètres, affichage, consentements, déconnexion', () => {
    const m = profileMenu({ mode: 'real', canWrite: true });
    expect(ids(m)).toEqual(['accounts', 'import', 'recommendations', 'settings', 'display', 'consents']);
    expect(m.signOut).toBe(true);
    for (const i of m.items) expect(routeExists(i.href)).toBe(true);
    expect(m.items.find((i) => i.id === 'consents')!.href).toBe('/parametres#consentements');
  });

  it('lecture seule : pas d’import ; démonstration : ni paramètres, ni consentements, ni déconnexion', () => {
    expect(ids(profileMenu({ mode: 'real', canWrite: false }))).not.toContain('import');
    const demo = profileMenu({ mode: 'demo', canWrite: false });
    expect(ids(demo)).toEqual(['accounts', 'import', 'recommendations', 'display', 'simulation']);
    expect(demo.signOut).toBe(false);
    for (const i of demo.items) expect(routeExists(i.href)).toBe(true);
  });

  it('initiale de l’avatar', () => {
    expect(avatarInitial(' élise ')).toBe('É');
    expect(avatarInitial('')).toBeNull();
    expect(avatarInitial(null)).toBeNull();
  });
});

describe('actions rapides : libellé de l’échéance selon le consentement', () => {
  const base = { mode: 'real' as const, canWrite: true, hasAccount: true, hasActiveGoal: true };
  const hint = (religiousEnabled: boolean) => availableQuickActions({ ...base, religiousEnabled }).find((a) => a.id === 'add_calendar_event')!.hint;
  it('l’échéance religieuse n’est mentionnée qu’avec le consentement', () => {
    expect(hint(true)).toBe('Personnelle, familiale ou religieuse');
    expect(hint(false)).toBe('Personnelle ou familiale');
    expect(availableQuickActions({ ...base, religiousEnabled: false }).map((a) => `${a.label} ${a.hint}`).join(' ')).not.toMatch(/religi|Zakat|Sadaqah/i);
  });
});

describe('Mes engagements : modèle de vue', () => {
  const zakat = (complete: boolean, paid = 0, matched = 0): ZakatCommitment => ({
    view: zakatStatusView({
      estimate: complete ? { complete: true, dueCents: 104_200 } : { complete: false, reason: 'missing_choices' },
      paidCents: paid, bankMatchedPaidCents: matched, confirmedPaidCents: 0, provisionCents: null,
    }),
    basis: 'saved', calculationAsOf: '2026-11-09', statusKey: complete ? 'due' : 'to_determine', observation: complete ? 'up_to_date' : 'missing_choices',
  });
  const c = (id: string, kind: ContributionRow['kind'], cents: number, paidOn: string, extra: Partial<ContributionRow> = {}): ContributionRow =>
    ({ id, owner_id: 'moi', kind, amount_cents: cents, paid_on: paidOn, beneficiary_label: null, ...extra });
  const input = (p: Partial<EngagementsInput> = {}): EngagementsInput => ({
    asOf: '2026-11-20', userId: 'moi', zakat: zakat(true, 40_000, 40_000),
    calculations: [
      { id: 'k1', owner_id: 'moi', as_of: '2026-11-09', status: 'due', zakat_due_cents: 104_200 },
      { id: 'k0', owner_id: 'moi', as_of: '2025-11-09', status: 'due', zakat_due_cents: 90_000 },
      { id: 'kx', owner_id: 'autre', as_of: '2026-10-01', status: 'due', zakat_due_cents: 1_000 },
    ],
    contributions: [
      c('a', 'zakat', 40_000, '2026-11-12', { transaction_id: 'tx', zakat_calculation_id: 'k1' }),
      c('a', 'zakat', 40_000, '2026-11-12', { transaction_id: 'tx', zakat_calculation_id: 'k1' }), // chargée deux fois
      c('b', 'sadaqah', 5_000, '2026-10-03'),
      c('f', 'zakat_al_fitr', 4_000, '2026-03-18'),
      c('p', 'purification', 2_457, '2026-09-30'),
      c('w', 'waqf', 1_000, '2026-02-01'),
      c('o', 'other', 500, '2026-01-15'),
      c('old', 'sadaqah', 2_000, '2025-12-24'),
      c('m', 'sadaqah', 9_999, '2026-06-01', { owner_id: 'autre' }), // membre du foyer : pas mes engagements
    ],
    purification: { kind: 'items', items: [
      { status: 'detected', creditedCents: 410, amountToPurifyCents: null },
      { status: 'detected', creditedCents: 620, amountToPurifyCents: null },
      { status: 'confirmed', creditedCents: 300, amountToPurifyCents: null },
      { status: 'confirmed', creditedCents: 210, amountToPurifyCents: 250 },
      { status: 'rejected', creditedCents: 100, amountToPurifyCents: null },
      { status: 'purified', creditedCents: 200, amountToPurifyCents: 240 },
    ] },
    ...p,
  });

  it('Zakat : statut, historique de la personne seulement, provision virtuelle masquée faute de source', () => {
    const v = buildEngagementsView(input());
    expect(v.zakat.statusLabel).toBe('Zakat estimée due selon vos choix');
    expect(v.zakat.historyCount).toBe(2);
    expect(v.zakat.lines.map((l) => l.kind)).toEqual(['estimated', 'declared', 'bank_matched', 'confirmed']);
    expect(v.zakat.view.remainingCents).toBe(64_200);
  });

  it('Zakat incomplète : aucun montant estimé ni restant présenté comme établi', () => {
    const v = buildEngagementsView(input({ zakat: zakat(false, 10_000) }));
    expect(v.zakat.statusLabel).toBe('Calcul incomplet : des choix restent à faire');
    expect(v.zakat.lines.find((l) => l.kind === 'estimated')!.cents).toBeNull();
    expect(v.zakat.view.remainingCents).toBeNull();
    expect(v.zakat.lines.find((l) => l.kind === 'declared')!.cents).toBe(10_000);
  });

  it('purification : détectées, à examiner, décisions et montant à purifier selon les choix', () => {
    const p = buildEngagementsView(input()).purification;
    expect(p.detected).toEqual({ count: 2, creditedCents: 1_030 });
    expect(p.toReviewCents).toBe(1_030 + 300);
    expect(p.toDetermineCount).toBe(1);
    expect(p.decisions).toEqual({ confirmed: 2, rejected: 1, purified: 1, total: 4 });
    expect(p.toPurifyCents).toBe(250);
    expect(p.purifiedCents).toBe(240);
  });

  it('démonstration : opérations détectées seulement, aucune décision inventée', () => {
    const p = buildEngagementsView(input({ purification: { kind: 'candidates', count: 3, creditedCents: 1_240 } })).purification;
    expect(p).toEqual({ detected: { count: 3, creditedCents: 1_240 }, toReviewCents: 1_240, toDetermineCount: 0, decisions: null, toPurifyCents: null, purifiedCents: null });
  });

  it('solidarité : contributions de la personne, comptées une fois, chaque type une seule fois', () => {
    const s = buildEngagementsView(input()).solidarity;
    expect(s.year).toBe(2026);
    expect(s.count).toBe(6);
    expect(s.totalCents).toBe(40_000 + 5_000 + 4_000 + 2_457 + 1_000 + 500);
    expect(s.lines.reduce((t, l) => t + l.cents, 0)).toBe(s.totalCents);
    expect(Object.fromEntries(s.lines.map((l) => [l.key, l.cents]))).toEqual({ zakat: 40_000, zakat_al_fitr: 4_000, sadaqah: 5_000, purification: 2_457, others: 1_500 });
    // Déclaration, rapprochement et confirmation restent distincts et ne se chevauchent pas
    expect(s.declaredCents + s.bankMatchedCents + s.confirmedCents).toBe(s.totalCents);
    expect(s.bankMatchedCents).toBe(40_000);
    expect(s.latest).toEqual({ kindLabel: 'Zakat', amountCents: 40_000, paidOn: '2026-11-12' });
  });

  it('aucune contribution : totaux à zéro, pas de dernière contribution', () => {
    const s = buildEngagementsView(input({ contributions: [] })).solidarity;
    expect(s.totalCents).toBe(0);
    expect(s.latest).toBeNull();
    expect(s.lines.every((l) => l.cents === 0 && l.count === 0)).toBe(true);
  });
});
