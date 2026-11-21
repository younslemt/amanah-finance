import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { zakatSettlements, type Contribution } from '@amanah/engines';
import { DEFAULT_HOME_LAYOUT, navEntries, parseHomeLayout, resolvePresentation } from './presentation.ts';
import { zakatStatusView } from './zakat-status.ts';
import { EVENT_HORIZON_DAYS, homeActions, type HomeActionInput } from './home-actions.ts';
import { QUICK_ACTIONS, availableQuickActions, type QuickActionContext } from './quick-actions.ts';

/** Une destination doit être un écran existant de l'application (pas de bouton inactif). */
const APP = fileURLToPath(new URL('../app/(app)', import.meta.url));
const routeExists = (href: string) => {
  const path = href.split('?')[0]!.split('#')[0]!;
  const dir = path.split('/').filter(Boolean).map((seg) => (/^demo-|^[0-9a-f-]{36}$|^goal-/.test(seg) ? '[id]' : seg)).join('/');
  return existsSync(`${APP}/${dir}/page.tsx`);
};
/** Aucun libellé ne présente une action comme une obligation religieuse ou un conseil. */
const PRESCRIPTIVE = /\b(devez|obligatoire|obligation|conseill|recommand|il faut|halal|haram|conforme|certifi)/i;

describe('présentation Islamic-first', () => {
  it('avec consentement : Islamic-first par défaut, engagements en 2e position', () => {
    const p = resolvePresentation({ layoutPreference: undefined, religiousEnabled: true });
    expect(DEFAULT_HOME_LAYOUT).toBe('islamic_first');
    expect(p.blocks.map((b) => b.id)).toEqual(['situation', 'commitments', 'projects', 'calendar', 'wealth', 'next_actions']);
    expect(p.blocks[1]).toMatchObject({ title: 'Mes engagements', variant: 'full', religiousData: true });
    expect(p.commitmentsLabel).toBe('Mes engagements');
    expect(p.blocks.at(-1)!.title).toBe('Mes prochaines actions');
  });

  it('affichage classique : même contenu, indicateurs financiers d’abord, engagements compacts', () => {
    const p = resolvePresentation({ layoutPreference: 'classic', religiousEnabled: true });
    expect(p.blocks.map((b) => b.id)).toEqual(['situation', 'next_actions', 'projects', 'wealth', 'calendar', 'commitments']);
    expect(p.blocks.find((b) => b.id === 'commitments')).toMatchObject({ variant: 'compact', religiousData: true });
    // Aucun bloc n'est retiré dans aucune variante
    for (const layout of ['islamic_first', 'classic']) for (const religiousEnabled of [true, false]) {
      expect(new Set(resolvePresentation({ layoutPreference: layout, religiousEnabled }).blocks.map((b) => b.id)).size).toBe(6);
    }
  });

  it('sans consentement : aucune donnée religieuse, quelle que soit la préférence', () => {
    for (const layoutPreference of ['islamic_first', 'classic', 'valeur-alteree', null]) {
      const p = resolvePresentation({ layoutPreference, religiousEnabled: false });
      expect(p.showReligiousData).toBe(false);
      expect(p.commitmentsLabel).toBe('Finance islamique');
      expect(p.blocks.every((b) => b.religiousData === false)).toBe(true);
      expect(p.blocks.find((b) => b.id === 'commitments')).toMatchObject({ title: 'Finance islamique', variant: 'pedagogic' });
    }
  });

  it('préférence illisible : affichage par défaut ; navigation à cinq entrées existantes', () => {
    expect(parseHomeLayout('classic')).toBe('classic');
    expect(parseHomeLayout(42)).toBe('islamic_first');
    expect(navEntries(true).map((n) => n.label)).toEqual(['Accueil', 'Mes engagements', 'Projets', 'Budget', 'Patrimoine']);
    expect(navEntries(false)[1]).toEqual({ href: '/finance-islamique', label: 'Finance islamique' });
    for (const n of navEntries(true)) expect(routeExists(n.href)).toBe(true);
  });
});

describe('Zakat : estimé, provision, déclaré, rapproché, confirmé', () => {
  const c = (id: string, cents: number, extra: Partial<Contribution> = {}): Contribution => ({ id, kind: 'zakat', amountCents: cents, paidOn: '2026-11-15', zakatCalculationId: 'calc', ...extra });

  it('la provision ne réduit jamais le reste à verser ; aucun double comptage', () => {
    const contributions = [c('a', 30_000, { transactionId: 'tx1' }), c('b', 10_000), c('a', 30_000, { transactionId: 'tx1' })]; // « a » chargée deux fois
    const [s] = zakatSettlements([{ id: 'calc', dueCents: 104_200 }], contributions);
    const v = zakatStatusView(s!, 60_000);
    expect(v.lines.map((l) => [l.kind, l.cents])).toEqual([['estimated', 104_200], ['provision', 60_000], ['declared', 40_000], ['bank_matched', 30_000], ['confirmed', 0]]);
    expect(v.remainingCents).toBe(64_200); // 1 042 € − 400 € ; la provision de 600 € n'est pas déduite
    expect(v.provisionCoversRemaining).toBe(false);
    expect(v.lines.filter((l) => l.subsetOfDeclared).map((l) => l.kind)).toEqual(['bank_matched', 'confirmed']);
    expect(v.lines.find((l) => l.kind === 'provision')!.hint).toContain('pas un paiement');
  });

  it('provision seule : rien n’est considéré comme payé', () => {
    const v = zakatStatusView({ dueCents: 50_000, paidCents: 0, bankMatchedPaidCents: 0, confirmedPaidCents: 0 }, 50_000);
    expect(v.remainingCents).toBe(50_000);
    expect(v.provisionCoversRemaining).toBe(true);
    expect(zakatStatusView({ dueCents: 50_000, paidCents: 0, bankMatchedPaidCents: 0, confirmedPaidCents: 0 }, null).provisionCoversRemaining).toBe(null);
  });

  it('excédent signalé ; incohérences refusées', () => {
    expect(zakatStatusView({ dueCents: 10_000, paidCents: 12_000, bankMatchedPaidCents: 0, confirmedPaidCents: 0 }, null)).toMatchObject({ remainingCents: 0, excessCents: 2_000 });
    expect(() => zakatStatusView({ dueCents: 10_000, paidCents: 5_000, bankMatchedPaidCents: 4_000, confirmedPaidCents: 2_000 }, null)).toThrow();
    expect(() => zakatStatusView({ dueCents: 10_000, paidCents: 0, bankMatchedPaidCents: 0, confirmedPaidCents: 0 }, -1)).toThrow();
  });
});

describe('passerelles entre observations et actions', () => {
  const base: HomeActionInput = {
    religiousEnabled: true, asOf: '2026-11-09', purificationPendingCount: 3,
    zakat: { state: 'hawl_due_soon', hawlEndsOn: '2026-11-20' },
    lateGoals: [{ id: 'goal-omra', name: 'Omra en famille' }],
    upcomingEvents: [
      { id: 'eid_al_adha:2027', label: 'Aïd al-Adha', date: '2027-02-20', religious: true, hasGoal: false, suggestionHref: '/goals/nouveau?modele=aid-al-adha&occurrence=2027' },
      { id: 'school_start:2027', label: 'Rentrée scolaire', date: '2027-08-30', religious: false, hasGoal: false, suggestionHref: '/goals/nouveau?modele=rentree-scolaire&occurrence=2027' },
    ],
    availableCapacityCents: 18_000,
  };

  it('les cinq passerelles, par priorité, vers des écrans existants', () => {
    const all = homeActions(base, 10);
    expect(all.map((a) => a.kind)).toEqual(['zakat', 'purification', 'late_goal', 'upcoming_event', 'available_capacity']);
    expect(all.map((a) => a.cta)).toEqual(['Accéder au calcul', 'Examiner la purification', 'Comparer les scénarios', 'Préparer un objectif', 'Revoir mes projets']);
    for (const a of all) expect(routeExists(a.href)).toBe(true);
    // Rentrée au-delà de l'horizon : pas encore proposée
    expect(all.some((a) => a.id === 'event:school_start:2027')).toBe(false);
    expect(EVENT_HORIZON_DAYS).toBe(120);
    expect(homeActions(base).length).toBe(3);
  });

  it('aucun libellé prescriptif', () => {
    for (const a of homeActions(base, 10)) {
      expect(PRESCRIPTIVE.test(a.observation)).toBe(false);
      expect(PRESCRIPTIVE.test(a.cta)).toBe(false);
    }
  });

  it('sans consentement : aucune passerelle religieuse, même si des données arrivent', () => {
    const off = homeActions({ ...base, religiousEnabled: false }, 10);
    expect(off.every((a) => !a.religious)).toBe(true);
    expect(off.map((a) => a.kind)).toEqual(['late_goal', 'available_capacity']);
  });

  it('rien à signaler : aucune action', () => {
    expect(homeActions({ ...base, purificationPendingCount: 0, zakat: { state: 'up_to_date' }, lateGoals: [], upcomingEvents: [], availableCapacityCents: 500 })).toEqual([]);
    // Événement déjà couvert par un projet : pas de doublon
    expect(homeActions({ ...base, upcomingEvents: [{ ...base.upcomingEvents[0]!, hasGoal: true }] }, 10).some((a) => a.kind === 'upcoming_event')).toBe(false);
  });
});

describe('actions rapides : uniquement des actions opérationnelles', () => {
  const ctx = (p: Partial<QuickActionContext> = {}): QuickActionContext => ({ mode: 'real', canWrite: true, religiousEnabled: true, hasAccount: true, hasActiveGoal: true, ...p });
  const ids = (p: Partial<QuickActionContext> = {}) => availableQuickActions(ctx(p)).map((a) => a.id);

  it('chaque destination existe', () => {
    for (const a of QUICK_ACTIONS) expect(routeExists(a.href)).toBe(true);
  });

  it('mode réel complet, sans consentement, sans compte, sans projet', () => {
    expect(ids()).toEqual(['add_operation', 'allocate_to_goal', 'create_goal', 'add_calendar_event', 'record_contribution', 'import_statement']);
    expect(ids({ religiousEnabled: false })).not.toContain('record_contribution');
    expect(ids({ hasAccount: false })).toEqual(['allocate_to_goal', 'create_goal', 'add_calendar_event', 'record_contribution']);
    expect(ids({ hasActiveGoal: false })).not.toContain('allocate_to_goal');
  });

  it('lecture seule : aucun bouton ; démonstration : seulement ce que le dépôt de démonstration accepte', () => {
    expect(ids({ canWrite: false })).toEqual([]);
    expect(ids({ mode: 'demo', canWrite: false })).toEqual(['allocate_to_goal', 'create_goal', 'add_calendar_event']);
    expect(ids({ mode: 'demo', hasActiveGoal: false })).toEqual(['create_goal', 'add_calendar_event']);
  });
});
