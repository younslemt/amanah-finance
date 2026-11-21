import { describe, expect, it } from 'vitest';
import {
  annualRenewalCheck, DEFAULT_PLANNING_PREFERENCES, estimateHijriEvent, familyCalendar, GOAL_TEMPLATES, schoolDates,
  suggestGoals, templateById, templateDueDate, type CalendarInput, type PlanningPreferences, type SuggestionInput,
} from '../src/index.ts';

const asOf = '2026-11-09';
const prefs = (p: Partial<PlanningPreferences> = {}): PlanningPreferences => ({ ...DEFAULT_PLANNING_PREFERENCES, ...p });
const cal = (p: Partial<CalendarInput> = {}) => familyCalendar({
  asOf, prefs: prefs(), religiousEnabled: true, customEvents: [], goalDeadlines: [], eidDates: [], annualExpenses: [], ...p,
});
const input = (p: Partial<SuggestionInput> = {}): SuggestionInput => {
  const pr = p.prefs ?? prefs({ hasChildren: true });
  const religiousEnabled = p.religiousEnabled ?? true;
  return {
    asOf, prefs: pr, religiousEnabled, calendar: cal({ prefs: pr, religiousEnabled }), goals: [], eidYears: [], decisions: [], availableCapacityCents: 50_000, ...p,
  };
};
const ids = (p: Partial<SuggestionInput> = {}) => suggestGoals(input(p)).filter((s) => s.status === 'new').map((s) => s.id);

describe('catalogue', () => {
  it('identifiants stables et uniques ; investissements, retraite et transmission annoncés mais non proposés', () => {
    expect(new Set(GOAL_TEMPLATES.map((t) => t.id)).size).toBe(GOAL_TEMPLATES.length);
    expect(GOAL_TEMPLATES.filter((t) => !t.available).map((t) => t.id)).toEqual(['investissements', 'retraite', 'transmission']);
    expect(GOAL_TEMPLATES.length).toBe(21);
    // Aucun modèle ne porte de montant
    for (const t of GOAL_TEMPLATES) expect(Object.keys(t)).not.toContain('amountCents');
  });
});

describe('calendrier financier familial', () => {
  it('dates scolaires configurables selon la région (indicatives)', () => {
    expect(schoolDates(2027, prefs())).toEqual({ start: '2027-08-30', holidays: '2027-07-03' }); // FWB : dernier lundi d'août
    expect(schoolDates(2027, prefs({ schoolCalendar: 'be-vl' }))).toEqual({ start: '2027-09-01', holidays: '2027-07-01' });
    expect(schoolDates(2027, prefs({ schoolCalendar: 'custom', customSchool: { start: '09-06', holidays: '06-30' } }))).toEqual({ start: '2027-09-06', holidays: '2027-06-30' });
  });

  it('dates religieuses indicatives, confirmables, et absentes sans activation', () => {
    const c = cal();
    const ramadan = c.find((e) => e.type === 'ramadan')!;
    expect(ramadan).toMatchObject({ indicative: true, source: 'tabular_estimate', religious: true });
    expect(ramadan.date).toBe(estimateHijriEvent(2027, 9, 1)[0]!.date);
    const confirmed = cal({ prefs: prefs({ confirmations: [{ type: 'ramadan', year: 2027, date: '2027-02-08', source: 'Mosquée fictive' }] }) });
    expect(confirmed.find((e) => e.type === 'ramadan')).toMatchObject({ date: '2027-02-08', indicative: false, source: 'confirmed_by_user' });
    expect(cal({ religiousEnabled: false }).some((e) => e.religious)).toBe(false);
    expect(cal({ prefs: prefs({ groups: ['family', 'finance'] }) }).some((e) => e.religious)).toBe(false);
    // Une date saisie dans un projet Aïd prime sur l'estimation
    expect(cal({ eidDates: [{ civilYear: 2027, date: '2027-05-16', confirmed: true, goalId: 'g' }] }).find((e) => e.type === 'eid_al_adha'))
      .toMatchObject({ date: '2027-05-16', source: 'confirmed_by_user', goalId: 'g' });
  });

  it('événements personnalisés (annuels ou ponctuels), échéances de projets, horizon de 12 mois, tri par date', () => {
    const c = cal({
      customEvents: [{ id: 'a', label: 'Assurance habitation', date: '2025-03-15', yearly: true }, { id: 'b', label: 'Passé', date: '2025-01-01', yearly: false }],
      goalDeadlines: [{ goalId: 'g1', name: 'Mariage', date: '2027-06-01', religious: false }, { goalId: 'g2', name: 'Hajj', date: '2027-04-01', religious: true }],
    });
    expect(c.find((e) => e.id === 'custom:a')!.date).toBe('2027-03-15');
    expect(c.some((e) => e.id === 'custom:b')).toBe(false);
    expect(c.find((e) => e.id === 'goal:g1')).toMatchObject({ type: 'goal_deadline', indicative: false });
    expect(c.every((e) => e.date >= asOf && e.date <= '2027-11-09')).toBe(true);
    expect([...c].map((e) => e.date)).toEqual([...c].map((e) => e.date).sort());
    expect(cal({ religiousEnabled: false, goalDeadlines: [{ goalId: 'g2', name: 'Hajj', date: '2027-04-01', religious: true }] }).some((e) => e.id === 'goal:g2')).toBe(false);
  });
});

describe('suggestions', () => {
  it('selon le calendrier : rentrée, vacances, Ramadan, Aïd ; réserve d’urgence en tête', () => {
    const s = suggestGoals(input());
    expect(s[0]!.id).toBe('reserve-urgence');
    const rentree = s.find((x) => x.templateId === 'rentree-scolaire')!;
    expect(rentree).toMatchObject({ id: 'rentree-scolaire:2027', dueDate: '2027-08-30', indicativeDate: true, href: '/goals/nouveau?modele=rentree-scolaire&annee=2027', status: 'new' });
    for (const i of ['ramadan:2027', 'aid-al-fitr:2027', 'aid-al-adha:2027', 'vacances-familiales:2027']) expect(ids()).toContain(i);
    // Trop loin : la rentrée n'est pas encore proposée en janvier de l'année précédente
    expect(ids({ asOf: '2026-09-01', calendar: cal({ prefs: prefs({ hasChildren: true }) }).map((e) => e) })).not.toContain('rentree-scolaire:2027');
    expect(s.find((x) => x.templateId === 'aid-al-adha')!.href).toBe('/goals/aid?annee=2027');
    expect(s.map((x) => x.displayPriority)).toEqual(s.map((_, i) => i + 1));
  });

  it('préférences respectées : groupes, enfants et véhicule déclarés, intérêts', () => {
    expect(ids({ prefs: prefs({ hasChildren: null }) })).not.toContain('rentree-scolaire:2027');
    expect(ids({ prefs: prefs({ hasChildren: false }) })).not.toContain('rentree-scolaire:2027');
    expect(ids({ prefs: prefs({ hasChildren: true, groups: ['finance'] }) }).every((i) => i === 'reserve-urgence')).toBe(true);
    expect(ids({ prefs: prefs({ hasVehicle: true, interests: ['entretien-automobile'] }) })).toContain('entretien-automobile:2026');
    expect(ids({ prefs: prefs({ hasVehicle: null, interests: ['entretien-automobile'] }) })).not.toContain('entretien-automobile:2026');
    for (const i of ['mariage', 'achat-immobilier']) expect(ids({ prefs: prefs({ interests: ['mariage', 'achat-immobilier'] }) })).toContain(i);
    // Modèles du chantier distinct : jamais proposés, même déclarés
    expect(ids({ prefs: prefs({ interests: ['retraite', 'investissements', 'transmission'] }) }).some((i) => /retraite|investissements|transmission/.test(i))).toBe(false);
  });

  it('aucune suggestion religieuse sans activation volontaire, et aucune déduction', () => {
    const religious = (p: Partial<SuggestionInput>) => suggestGoals(input(p)).filter((s) => s.group === 'religious');
    expect(religious({ religiousEnabled: false, prefs: prefs({ interests: ['hajj', 'omra'] }) })).toEqual([]);
    expect(religious({ prefs: prefs({ groups: ['family', 'finance', 'wealth'], interests: ['hajj'] }) })).toEqual([]);
    // Activé : Hajj seulement si l'intérêt est déclaré (jamais déduit d'opérations)
    expect(religious({}).some((s) => s.templateId === 'hajj')).toBe(false);
    expect(religious({ prefs: prefs({ interests: ['hajj'] }) }).some((s) => s.templateId === 'hajj')).toBe(true);
  });

  it('pas de doublon avec les projets existants ; reportée, écartée, acceptée', () => {
    const goals = [
      { id: 'r', kind: 'emergency_fund' as const },
      { id: 'x', kind: 'children_education' as const, templateId: 'rentree-scolaire', occurrence: 2027, lifecycle: 'active' as const },
    ];
    const s = suggestGoals(input({ goals, eidYears: [2027] }));
    expect(s.some((x) => x.id === 'reserve-urgence')).toBe(false);
    expect(s.find((x) => x.id === 'rentree-scolaire:2027')!.status).toBe('accepted');
    expect(s.find((x) => x.id === 'aid-al-adha:2027')!.status).toBe('accepted');
    // Projet archivé : la suggestion revient
    expect(suggestGoals(input({ goals: [{ ...goals[1]!, lifecycle: 'archived' }] })).find((x) => x.id === 'rentree-scolaire:2027')!.status).toBe('new');
    const decided = suggestGoals(input({ decisions: [{ id: 'ramadan:2027', status: 'snoozed', until: '2026-12-09' }, { id: 'vacances-familiales', status: 'dismissed' }] }));
    expect(decided.find((x) => x.id === 'ramadan:2027')!.status).toBe('snoozed');
    expect(decided.find((x) => x.templateId === 'vacances-familiales')!.status).toBe('dismissed');
    // Report échu : la suggestion redevient nouvelle
    expect(suggestGoals(input({ asOf: '2026-12-10', decisions: [{ id: 'ramadan:2027', status: 'snoozed', until: '2026-12-09' }] })).find((x) => x.id === 'ramadan:2027')!.status).toBe('new');
    // Nouvelles d'abord
    const order = decided.map((x) => x.status);
    expect(order.indexOf('snoozed')).toBeGreaterThan(order.lastIndexOf('new'));
  });

  it('capacité : elle informe et abaisse la priorité, elle ne bloque jamais ; déterministe', () => {
    const full = suggestGoals(input({ availableCapacityCents: 0 }));
    expect(full.length).toBeGreaterThan(0);
    expect(full.every((s) => s.capacityFullyEngaged)).toBe(true);
    expect(suggestGoals(input({ availableCapacityCents: null })).every((s) => !s.capacityFullyEngaged)).toBe(true);
    expect(suggestGoals(input())).toEqual(suggestGoals(input()));
  });

  it('création depuis un modèle : date indicative de l’occurrence, jamais de montant', () => {
    const c = cal({ prefs: prefs({ hasChildren: true }) });
    expect(templateDueDate(templateById('rentree-scolaire')!, 2027, c)).toBe('2027-08-30');
    expect(templateDueDate(templateById('mariage')!, null, c)).toBe(null);
  });

  it('projet annuel : reconduction décidée après réalisation, une seule fois, occurrence suivante', () => {
    const g = { id: 'a', kind: 'personal' as const, templateId: 'vacances-familiales', occurrence: 2026, lifecycle: 'achieved' as const };
    expect(annualRenewalCheck(g, [g])).toMatchObject({ allowed: true, occurrence: 2027 });
    expect(annualRenewalCheck({ ...g, lifecycle: 'active' }, [])).toEqual({ allowed: false, reason: 'not_realized' });
    expect(annualRenewalCheck(g, [g, { id: 'b', kind: 'personal', previousGoalId: 'a' }])).toEqual({ allowed: false, reason: 'already_renewed' });
    expect(annualRenewalCheck({ ...g, templateId: 'mariage' }, [])).toEqual({ allowed: false, reason: 'not_yearly' });
    expect(annualRenewalCheck({ ...g, templateId: undefined }, [])).toEqual({ allowed: false, reason: 'not_yearly' });
  });
});
