/**
 * Suggestions de projets et calendrier financier familial — moteur PUR et déterministe.
 *
 * Principes :
 * - une suggestion n'est jamais un objectif : aucun projet n'est créé sans action de la personne ;
 * - aucun montant n'est proposé par le catalogue (seule une reconduction propose l'ancien budget,
 *   comme référence modifiable) ;
 * - aucune conviction n'est déduite d'opérations ou d'autres signaux : les suggestions religieuses
 *   n'existent que si les fonctions religieuses sont activées ET le groupe choisi dans les préférences ;
 * - un événement du calendrier n'est pas une obligation financière ; les dates religieuses et
 *   scolaires calculées sont indicatives ;
 * - les modèles « investissements », « retraite » et « transmission » sont annoncés mais pas
 *   proposés : ils relèvent d'un chantier distinct, et aucun modèle n'est un produit financier.
 */
import { addMonths, monthsBetween, type IsoDate } from './dates.ts';
import { estimateEidAlAdha, estimateHijriEvent } from './eid.ts';
import type { GoalKind } from './goals.ts';

export type SuggestionGroup = 'religious' | 'family' | 'finance' | 'wealth';
export const SUGGESTION_GROUPS: readonly SuggestionGroup[] = ['religious', 'family', 'finance', 'wealth'];

export type CalendarEventType =
  | 'school_start' | 'summer_holidays' | 'ramadan' | 'eid_al_fitr' | 'eid_al_adha' | 'annual_expense' | 'custom' | 'goal_deadline';
export const RELIGIOUS_EVENT_TYPES: readonly CalendarEventType[] = ['ramadan', 'eid_al_fitr', 'eid_al_adha'];

/** Déclencheur d'une suggestion : un événement du calendrier, un intérêt déclaré, ou un besoin de base. */
export type TemplateTrigger =
  | { type: 'calendar'; event: CalendarEventType; leadMonths: number }
  | { type: 'interest' }
  | { type: 'missing_kind'; kind: GoalKind };

export interface GoalTemplate {
  /** Identifiant stable (jamais renommé : il sert aux décisions et aux projets créés). */
  id: string;
  title: string;
  group: SuggestionGroup;
  /** Catégorie du projet créé ; 'eid_flow' : parcours Aïd dédié (budget détaillé, date). */
  kind: GoalKind | 'eid_flow';
  recurrence: 'yearly' | 'once';
  trigger: TemplateTrigger;
  /** Prérequis déclarés explicitement dans les préférences. */
  needs?: 'children' | 'vehicle';
  /** Catégories de dépenses possibles (information affichée, jamais un montant). */
  spendingCategories: readonly string[];
  /** false : annoncé, chantier distinct, jamais suggéré ni créé depuis le catalogue. */
  available: boolean;
}

const T = (t: Omit<GoalTemplate, 'available'> & { available?: boolean }): GoalTemplate => ({ available: true, ...t });

export const GOAL_TEMPLATES: readonly GoalTemplate[] = [
  // Événements religieux (fonctions religieuses activées + groupe choisi)
  T({ id: 'aid-al-adha', title: 'Aïd al-Adha', group: 'religious', kind: 'eid_flow', recurrence: 'yearly', trigger: { type: 'calendar', event: 'eid_al_adha', leadMonths: 10 }, spendingCategories: ['Sacrifice ou quote-part', 'Frais d’abattage', 'Repas et réception', 'Cadeaux'] }),
  T({ id: 'aid-al-fitr', title: 'Aïd al-Fitr', group: 'religious', kind: 'religious_other', recurrence: 'yearly', trigger: { type: 'calendar', event: 'eid_al_fitr', leadMonths: 5 }, spendingCategories: ['Zakat al-Fitr', 'Vêtements', 'Cadeaux', 'Repas et réception'] }),
  T({ id: 'ramadan', title: 'Ramadan', group: 'religious', kind: 'religious_other', recurrence: 'yearly', trigger: { type: 'calendar', event: 'ramadan', leadMonths: 5 }, spendingCategories: ['Alimentation', 'Repas partagés (iftar)', 'Dons'] }),
  T({ id: 'hajj', title: 'Hajj', group: 'religious', kind: 'hajj', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Forfait agence', 'Transport', 'Hébergement', 'Préparation'] }),
  T({ id: 'omra', title: 'Omra', group: 'religious', kind: 'omra', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Forfait agence', 'Transport', 'Hébergement'] }),
  // Famille et enfants
  T({ id: 'rentree-scolaire', title: 'Rentrée scolaire', group: 'family', kind: 'children_education', recurrence: 'yearly', needs: 'children', trigger: { type: 'calendar', event: 'school_start', leadMonths: 10 }, spendingCategories: ['Fournitures', 'Frais scolaires', 'Vêtements', 'Cartable et équipement'] }),
  T({ id: 'activites-extrascolaires', title: 'Activités extrascolaires', group: 'family', kind: 'children_education', recurrence: 'yearly', needs: 'children', trigger: { type: 'calendar', event: 'school_start', leadMonths: 6 }, spendingCategories: ['Inscriptions', 'Équipement', 'Stages'] }),
  T({ id: 'etudes-superieures', title: 'Études supérieures', group: 'family', kind: 'children_education', recurrence: 'once', needs: 'children', trigger: { type: 'interest' }, spendingCategories: ['Minerval', 'Logement étudiant', 'Matériel', 'Transport'] }),
  T({ id: 'mariage', title: 'Mariage', group: 'family', kind: 'personal', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Cérémonie', 'Réception', 'Tenues', 'Voyage'] }),
  T({ id: 'naissance', title: 'Naissance', group: 'family', kind: 'personal', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Équipement de puériculture', 'Frais médicaux non remboursés', 'Garde'] }),
  T({ id: 'vacances-familiales', title: 'Vacances familiales', group: 'family', kind: 'personal', recurrence: 'yearly', trigger: { type: 'calendar', event: 'summer_holidays', leadMonths: 8 }, spendingCategories: ['Transport', 'Hébergement', 'Activités'] }),
  // Finances et logement
  T({ id: 'reserve-urgence', title: 'Réserve d’urgence', group: 'finance', kind: 'emergency_fund', recurrence: 'once', trigger: { type: 'missing_kind', kind: 'emergency_fund' }, spendingCategories: ['Imprévus', 'Perte de revenus', 'Réparations urgentes'] }),
  T({ id: 'achat-immobilier', title: 'Achat immobilier', group: 'finance', kind: 'real_estate', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Apport', 'Frais de notaire et d’enregistrement', 'Déménagement'] }),
  T({ id: 'travaux', title: 'Travaux', group: 'finance', kind: 'real_estate', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Matériaux', 'Main-d’œuvre', 'Imprévus de chantier'] }),
  T({ id: 'assurance-annuelle', title: 'Assurance annuelle', group: 'finance', kind: 'personal', recurrence: 'yearly', trigger: { type: 'interest' }, spendingCategories: ['Assurance habitation', 'Assurance auto', 'Assurance familiale'] }),
  T({ id: 'entretien-automobile', title: 'Entretien automobile', group: 'finance', kind: 'personal', recurrence: 'yearly', needs: 'vehicle', trigger: { type: 'interest' }, spendingCategories: ['Entretien', 'Contrôle technique', 'Pneus'] }),
  T({ id: 'achat-vehicule', title: 'Achat d’un véhicule', group: 'finance', kind: 'personal', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Prix d’achat', 'Immatriculation', 'Assurance'] }),
  // Patrimoine et long terme
  T({ id: 'epargne-familiale', title: 'Épargne familiale', group: 'wealth', kind: 'family_savings', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: ['Épargne de précaution familiale', 'Projets futurs'] }),
  T({ id: 'investissements', title: 'Investissements', group: 'wealth', kind: 'personal', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: [], available: false }),
  T({ id: 'retraite', title: 'Retraite', group: 'wealth', kind: 'retirement', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: [], available: false }),
  T({ id: 'transmission', title: 'Préparation de la transmission', group: 'wealth', kind: 'personal', recurrence: 'once', trigger: { type: 'interest' }, spendingCategories: [], available: false }),
];

export const templateById = (id: string): GoalTemplate | undefined => GOAL_TEMPLATES.find((t) => t.id === id);
export const isReligiousTemplate = (t: GoalTemplate): boolean => t.group === 'religious';

// ---------------------------------------------------------------------------
// Préférences déclarées (jamais déduites)
// ---------------------------------------------------------------------------
export type SchoolCalendarId = 'be-fwb' | 'be-vl' | 'custom';
export interface PlanningPreferences {
  /** Groupes de suggestions activés. « religious » n'a d'effet qu'avec les fonctions religieuses activées. */
  groups: SuggestionGroup[];
  /** Déclarations explicites (null : non renseigné → aucune suggestion qui en dépend). */
  hasChildren: boolean | null;
  hasVehicle: boolean | null;
  /** Projets ponctuels qui intéressent la personne (identifiants de modèles). */
  interests: string[];
  schoolCalendar: SchoolCalendarId;
  /** Calendrier personnalisé : jours de l'année (MM-JJ). */
  customSchool: { start: string; holidays: string } | null;
  /** Dates religieuses confirmées par la personne (avec leur source). */
  confirmations: Array<{ type: 'ramadan' | 'eid_al_fitr'; year: number; date: IsoDate; source: string }>;
  /**
   * Dates scolaires corrigées ou confirmées par la personne (école, document reçu…).
   * Elles priment toujours : aucun recalcul automatique ne les écrase.
   */
  schoolOverrides: SchoolOverride[];
}

export interface SchoolOverride { kind: 'start' | 'holidays'; year: number; date: IsoDate; source: string }

export const DEFAULT_PLANNING_PREFERENCES: PlanningPreferences = {
  groups: ['religious', 'family', 'finance', 'wealth'], hasChildren: null, hasVehicle: null, interests: [],
  schoolCalendar: 'be-fwb', customSchool: null, confirmations: [], schoolOverrides: [],
};

// ---------------------------------------------------------------------------
// Calendrier financier familial
// ---------------------------------------------------------------------------
/**
 * Événement ajouté par une personne du foyer.
 * - visibility « private » (par défaut) : visible par son auteur uniquement ;
 * - visibility « household » : partagé volontairement avec le foyer ;
 * - religious : classification EXPLICITE choisie par la personne (jamais déduite du libellé),
 *   toujours privé et masqué sans consentement aux fonctions religieuses.
 */
export interface CustomCalendarEvent {
  id: string; label: string; date: IsoDate; yearly: boolean;
  visibility?: 'private' | 'household';
  religious?: boolean;
}

/**
 * Calendrier scolaire officiel publié par la communauté compétente, versionné par année scolaire.
 * Aucun jeu de données n'est fourni tant qu'il n'a pas été vérifié dans la source officielle :
 * les dates restent alors des approximations indicatives.
 */
export interface OfficialSchoolCalendar {
  authority: 'fwb' | 'vl';
  /** Année scolaire, par exemple « 2026-2027 ». */
  schoolYear: string;
  version: string;
  source: string;
  publishedOn: IsoDate;
  /** Rentrée de cette année scolaire. */
  start: IsoDate;
  /** Début des vacances d'été qui terminent cette année scolaire. */
  summerHolidays: IsoDate;
}

/** Registre des calendriers officiels vérifiés (vide : aucune date officielle n'est inventée). */
export const OFFICIAL_SCHOOL_CALENDARS: readonly OfficialSchoolCalendar[] = [];

export interface ResolvedSchoolDate {
  date: IsoDate;
  source: 'confirmed_by_user' | 'official_calendar' | 'school_calendar' | 'user';
  indicative: boolean;
  /** Version du calendrier officiel ou source déclarée par la personne. */
  detail?: string;
}

const authorityOf = (id: SchoolCalendarId): OfficialSchoolCalendar['authority'] | null => (id === 'be-fwb' ? 'fwb' : id === 'be-vl' ? 'vl' : null);

/**
 * Résolution d'une date scolaire, par priorité :
 * 1. date corrigée ou confirmée par la personne (jamais écrasée) ;
 * 2. calendrier officiel versionné de la communauté choisie ;
 * 3. calendrier personnalisé (jours saisis) ;
 * 4. approximation indicative.
 */
export function resolveSchoolDates(
  year: number,
  prefs: Pick<PlanningPreferences, 'schoolCalendar' | 'customSchool' | 'schoolOverrides'>,
  official: readonly OfficialSchoolCalendar[] = OFFICIAL_SCHOOL_CALENDARS,
): { start: ResolvedSchoolDate; holidays: ResolvedSchoolDate } {
  const approx = schoolDates(year, prefs);
  const authority = authorityOf(prefs.schoolCalendar);
  const pick = (kind: 'start' | 'holidays'): ResolvedSchoolDate => {
    const o = (prefs.schoolOverrides ?? []).find((x) => x.kind === kind && x.year === year);
    if (o) return { date: o.date, source: 'confirmed_by_user', indicative: false, detail: o.source };
    if (authority) {
      // La rentrée de l'année Y ouvre l'année scolaire Y-(Y+1) ; les vacances d'été de Y clôturent (Y-1)-Y.
      const schoolYear = kind === 'start' ? `${year}-${year + 1}` : `${year - 1}-${year}`;
      const cal = official.filter((c) => c.authority === authority && c.schoolYear === schoolYear)
        .sort((a, b) => (a.publishedOn < b.publishedOn ? 1 : -1))[0];
      if (cal) return { date: kind === 'start' ? cal.start : cal.summerHolidays, source: 'official_calendar', indicative: false, detail: `${cal.source} (version ${cal.version})` };
    }
    const date = kind === 'start' ? approx.start : approx.holidays;
    if (prefs.schoolCalendar === 'custom' && prefs.customSchool) return { date, source: 'user', indicative: true, detail: 'calendrier personnalisé' };
    return { date, source: 'school_calendar', indicative: true };
  };
  return { start: pick('start'), holidays: pick('holidays') };
}

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: IsoDate;
  label: string;
  /** Date calculée (scolaire ou religieuse) : indicative, à vérifier ou confirmer. */
  indicative: boolean;
  source: 'school_calendar' | 'official_calendar' | 'tabular_estimate' | 'confirmed_by_user' | 'user' | 'goal' | 'detected';
  /** Précision sur la source (version du calendrier officiel, source d'une correction). */
  detail?: string;
  /** Événements ajoutés : personnel (privé) ou partagé avec le foyer. */
  visibility?: 'private' | 'household';
  /** Projet ou montant associé : une date n'est jamais une obligation financière. */
  goalId?: string;
  religious: boolean;
}

export interface CalendarInput {
  asOf: IsoDate;
  /** Nombre de mois couverts à partir d'aujourd'hui (12 par défaut). */
  months?: number;
  prefs: PlanningPreferences;
  religiousEnabled: boolean;
  customEvents: readonly CustomCalendarEvent[];
  goalDeadlines: ReadonlyArray<{ goalId: string; name: string; date: IsoDate; religious: boolean }>;
  /** Dates d'Aïd al-Adha saisies dans les projets Aïd (priment sur l'estimation). */
  eidDates: ReadonlyArray<{ civilYear: number; date: IsoDate; confirmed: boolean; goalId: string }>;
  /** Dépenses annuelles détectées dans les opérations (série annuelle). */
  annualExpenses: ReadonlyArray<{ key: string; label: string; nextDate: IsoDate; categorySlug: string | null }>;
  /** Calendriers scolaires officiels (registre par défaut ; injectable pour les tests). */
  officialSchoolCalendars?: readonly OfficialSchoolCalendar[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const weekday = (s: IsoDate) => new Date(`${s}T00:00:00Z`).getUTCDay(); // 0 = dimanche
function lastWeekdayOfMonth(y: number, m: number, wd: number): IsoDate {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = last; d > last - 7; d--) if (weekday(iso(y, m, d)) === wd) return iso(y, m, d);
  return iso(y, m, last);
}
function firstWeekdayOnOrAfter(s: IsoDate, wds: number[]): IsoDate {
  const d = new Date(`${s}T00:00:00Z`);
  while (!wds.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Dates scolaires indicatives (à vérifier dans le calendrier officiel) :
 * - be-fwb (Fédération Wallonie-Bruxelles, calendrier réformé) : rentrée le dernier lundi d'août,
 *   vacances d'été à partir du premier samedi de juillet ;
 * - be-vl (Flandre) : rentrée le premier jour ouvrable à partir du 1er septembre, vacances le 1er juillet ;
 * - custom : jours saisis par la personne.
 */
export function schoolDates(year: number, prefs: Pick<PlanningPreferences, 'schoolCalendar' | 'customSchool'>): { start: IsoDate; holidays: IsoDate } {
  if (prefs.schoolCalendar === 'custom' && prefs.customSchool) {
    return { start: `${year}-${prefs.customSchool.start}`, holidays: `${year}-${prefs.customSchool.holidays}` };
  }
  if (prefs.schoolCalendar === 'be-vl') return { start: firstWeekdayOnOrAfter(iso(year, 9, 1), [1, 2, 3, 4, 5]), holidays: iso(year, 7, 1) };
  return { start: lastWeekdayOfMonth(year, 8, 1), holidays: firstWeekdayOnOrAfter(iso(year, 7, 1), [6]) };
}

/** Prochaine occurrence d'un événement annuel à partir d'une date (même jour et mois). */
function nextYearly(date: IsoDate, asOf: IsoDate): IsoDate {
  const [, m, d] = date.split('-');
  for (let y = Number(asOf.slice(0, 4)); y <= Number(asOf.slice(0, 4)) + 1; y++) {
    const c = `${y}-${m}-${d === '29' && m === '02' ? '28' : d}`;
    if (c >= asOf) return c;
  }
  return `${Number(asOf.slice(0, 4)) + 1}-${m}-${d}`;
}

export function familyCalendar(input: CalendarInput): CalendarEvent[] {
  const { asOf, prefs } = input;
  const end = addMonths(asOf, input.months ?? 12);
  const inRange = (d: IsoDate) => d >= asOf && d <= end;
  const y0 = Number(asOf.slice(0, 4));
  const years = [y0, y0 + 1];
  const out: CalendarEvent[] = [];
  const religious = input.religiousEnabled && prefs.groups.includes('religious');

  for (const y of years) {
    const s = resolveSchoolDates(y, prefs, input.officialSchoolCalendars ?? OFFICIAL_SCHOOL_CALENDARS);
    out.push({ id: `school_start:${y}`, type: 'school_start', date: s.start.date, label: 'Rentrée scolaire', indicative: s.start.indicative, source: s.start.source, detail: s.start.detail, religious: false });
    out.push({ id: `summer_holidays:${y}`, type: 'summer_holidays', date: s.holidays.date, label: 'Début des vacances d’été', indicative: s.holidays.indicative, source: s.holidays.source, detail: s.holidays.detail, religious: false });
    if (religious) {
      for (const [type, month, day, label] of [['ramadan', 9, 1, 'Début du Ramadan'], ['eid_al_fitr', 10, 1, 'Aïd al-Fitr']] as const) {
        const confirmed = prefs.confirmations.find((c) => c.type === type && c.year === y);
        if (confirmed) out.push({ id: `${type}:${y}`, type, date: confirmed.date, label, indicative: false, source: 'confirmed_by_user', religious: true });
        else for (const e of estimateHijriEvent(y, month, day)) out.push({ id: `${type}:${y}:${e.hijriYear}`, type, date: e.date, label, indicative: true, source: 'tabular_estimate', religious: true });
      }
      const eid = input.eidDates.find((e) => e.civilYear === y);
      if (eid) out.push({ id: `eid_al_adha:${y}`, type: 'eid_al_adha', date: eid.date, label: 'Aïd al-Adha', indicative: !eid.confirmed, source: eid.confirmed ? 'confirmed_by_user' : 'user', goalId: eid.goalId, religious: true });
      else for (const e of estimateEidAlAdha(y)) out.push({ id: `eid_al_adha:${y}:${e.hijriYear}`, type: 'eid_al_adha', date: e.date, label: 'Aïd al-Adha', indicative: true, source: 'tabular_estimate', religious: true });
    }
  }
  for (const e of input.customEvents) {
    // Classification explicite : un événement religieux n'apparaît qu'avec le consentement.
    if (e.religious && !input.religiousEnabled) continue;
    const date = e.yearly ? nextYearly(e.date, asOf) : e.date;
    out.push({ id: `custom:${e.id}`, type: 'custom', date, label: e.label, indicative: false, source: 'user', religious: e.religious === true, visibility: e.religious ? 'private' : e.visibility ?? 'private' });
  }
  for (const a of input.annualExpenses) out.push({ id: `annual:${a.key}`, type: 'annual_expense', date: a.nextDate, label: a.label, indicative: true, source: 'detected', religious: false });
  for (const g of input.goalDeadlines) {
    if (g.religious && !input.religiousEnabled) continue;
    out.push({ id: `goal:${g.goalId}`, type: 'goal_deadline', date: g.date, label: g.name, indicative: false, source: 'goal', goalId: g.goalId, religious: g.religious });
  }
  return out.filter((e) => inRange(e.date)).sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------
export type SuggestionStatus = 'new' | 'snoozed' | 'dismissed' | 'accepted';
export type SuggestionReason = 'upcoming_event' | 'declared_interest' | 'no_emergency_fund' | 'yearly_need';

export interface SuggestionDecision {
  /** Identifiant de suggestion (« modele:occurrence ») ou de modèle (« ne plus proposer »). */
  id: string;
  status: 'snoozed' | 'dismissed';
  /** Report : date jusqu'à laquelle la suggestion est mise de côté. */
  until?: IsoDate;
}

export interface ExistingGoalRef {
  id: string;
  kind: GoalKind;
  templateId?: string;
  occurrence?: number;
  lifecycle?: 'active' | 'paused' | 'achieved' | 'archived';
}

export interface SuggestionInput {
  asOf: IsoDate;
  prefs: PlanningPreferences;
  religiousEnabled: boolean;
  calendar: readonly CalendarEvent[];
  goals: readonly ExistingGoalRef[];
  /** Années civiles couvertes par un projet Aïd existant. */
  eidYears: readonly number[];
  decisions: readonly SuggestionDecision[];
  /** Capacité encore libre (null : inconnue). Elle informe, elle ne bloque jamais. */
  availableCapacityCents: number | null;
}

export interface Suggestion {
  /** Identifiant stable : « modele » (ponctuel) ou « modele:année » (annuel). */
  id: string;
  templateId: string;
  title: string;
  group: SuggestionGroup;
  reason: SuggestionReason;
  dueDate: IsoDate | null;
  monthsUntil: number | null;
  /** Date calculée (scolaire ou religieuse) : indicative. */
  indicativeDate: boolean;
  occurrence: number | null;
  /** Lien vers le parcours de création (jamais une création automatique). */
  href: string;
  /** Rang d'affichage (1 = le plus pertinent). */
  displayPriority: number;
  status: SuggestionStatus;
  /** La capacité connue est déjà entièrement engagée par d'autres projets. */
  capacityFullyEngaged: boolean;
}

export const SNOOZE_DAYS = 30;

/**
 * Suggestions classées par pertinence. Déterministe : mêmes entrées, même liste.
 * Statuts : « new », « snoozed » (reportée, jusqu'à une date), « dismissed » (modèle écarté),
 * « accepted » (un projet existe déjà pour cette occurrence). Aucun doublon : un projet existant
 * de même modèle et même occurrence (ou une réserve existante, ou un Aïd de l'année) vaut « accepted ».
 */
export function suggestGoals(input: SuggestionInput): Suggestion[] {
  const { asOf, prefs } = input;
  const religious = input.religiousEnabled && prefs.groups.includes('religious');
  const live = input.goals.filter((g) => g.lifecycle !== 'archived');
  const candidates: Array<Omit<Suggestion, 'displayPriority' | 'status'> & { score: number }> = [];

  for (const t of GOAL_TEMPLATES) {
    if (!t.available || !prefs.groups.includes(t.group)) continue;
    if (isReligiousTemplate(t) && !religious) continue;
    if (t.needs === 'children' && prefs.hasChildren !== true) continue;
    if (t.needs === 'vehicle' && prefs.hasVehicle !== true) continue;
    const trig = t.trigger;
    if (trig.type === 'missing_kind') {
      if (live.some((g) => g.kind === trig.kind)) continue;
      candidates.push({ id: t.id, templateId: t.id, title: t.title, group: t.group, reason: 'no_emergency_fund', dueDate: null, monthsUntil: null, indicativeDate: false, occurrence: null, href: hrefFor(t, null), capacityFullyEngaged: false, score: 100 });
    } else if (trig.type === 'interest') {
      if (!prefs.interests.includes(t.id)) continue;
      const occurrence = t.recurrence === 'yearly' ? Number(asOf.slice(0, 4)) : null;
      candidates.push({ id: occurrence === null ? t.id : `${t.id}:${occurrence}`, templateId: t.id, title: occurrence === null ? t.title : `${t.title} ${occurrence}`, group: t.group, reason: t.recurrence === 'yearly' ? 'yearly_need' : 'declared_interest', dueDate: null, monthsUntil: null, indicativeDate: false, occurrence, href: hrefFor(t, occurrence), capacityFullyEngaged: false, score: 50 });
    } else {
      // Premier événement à venir de ce type (dans l'horizon du calendrier)
      const ev = input.calendar.find((e) => e.type === trig.event && e.date >= asOf && (!e.religious || religious));
      if (!ev) continue;
      const months = Math.max(0, monthsBetween(asOf, ev.date));
      if (months > trig.leadMonths) continue;
      const occurrence = Number(ev.date.slice(0, 4));
      candidates.push({ id: `${t.id}:${occurrence}`, templateId: t.id, title: `${t.title} ${occurrence}`, group: t.group, reason: 'upcoming_event', dueDate: ev.date, monthsUntil: months, indicativeDate: ev.indicative, occurrence, href: hrefFor(t, occurrence), capacityFullyEngaged: false, score: 90 - months * 4 });
    }
  }

  const engaged = input.availableCapacityCents !== null && input.availableCapacityCents <= 0;
  const status = (c: (typeof candidates)[number]): SuggestionStatus => {
    const t = templateById(c.templateId)!;
    const exists = t.kind === 'eid_flow'
      ? c.occurrence !== null && input.eidYears.includes(c.occurrence)
      : live.some((g) => g.templateId === c.templateId && (c.occurrence === null || g.occurrence === c.occurrence));
    if (exists) return 'accepted';
    if (input.decisions.some((d) => d.id === c.templateId && d.status === 'dismissed')) return 'dismissed';
    const snooze = input.decisions.find((d) => d.id === c.id && d.status === 'snoozed');
    if (snooze?.until && snooze.until > asOf) return 'snoozed';
    return 'new';
  };
  const rank = { new: 0, snoozed: 1, accepted: 2, dismissed: 3 } as const;
  return candidates
    .map((c) => ({ ...c, status: status(c), capacityFullyEngaged: engaged, score: c.score - (engaged ? 10 : 0) }))
    .sort((a, b) => rank[a.status] - rank[b.status] || b.score - a.score || a.id.localeCompare(b.id))
    .map(({ score: _s, ...c }, i) => ({ ...c, displayPriority: i + 1 }));
}

function hrefFor(t: GoalTemplate, occurrence: number | null): string {
  if (t.kind === 'eid_flow') return occurrence === null ? '/goals/aid' : `/goals/aid?annee=${occurrence}`;
  return `/goals/nouveau?modele=${t.id}${occurrence === null ? '' : `&annee=${occurrence}`}`;
}

/** Date indicative pour préremplir un projet issu d'un modèle (première échéance de l'occurrence). */
export function templateDueDate(t: GoalTemplate, occurrence: number | null, calendar: readonly CalendarEvent[]): IsoDate | null {
  if (t.trigger.type !== 'calendar' || occurrence === null) return null;
  const ev = calendar.find((e) => e.type === (t.trigger as { event: CalendarEventType }).event && e.date.startsWith(`${occurrence}-`));
  return ev?.date ?? null;
}

/** Reconduction d'un projet annuel : possible une fois réalisé, une seule fois, jamais automatique. */
export function annualRenewalCheck(goal: ExistingGoalRef, all: ReadonlyArray<ExistingGoalRef & { previousGoalId?: string }>):
  { allowed: true; template: GoalTemplate; occurrence: number } | { allowed: false; reason: 'not_yearly' | 'not_realized' | 'already_renewed' } {
  const t = goal.templateId ? templateById(goal.templateId) : undefined;
  if (!t || t.recurrence !== 'yearly' || t.kind === 'eid_flow' || goal.occurrence === undefined) return { allowed: false, reason: 'not_yearly' };
  if (goal.lifecycle !== 'achieved') return { allowed: false, reason: 'not_realized' };
  if (all.some((g) => g.previousGoalId === goal.id)) return { allowed: false, reason: 'already_renewed' };
  return { allowed: true, template: t, occurrence: goal.occurrence + 1 };
}
