/**
 * Accueil Islamic-first (lot 2) : modèle de vue construit CÔTÉ SERVEUR à partir des moteurs
 * existants. Fonction pure, sans React ni accès aux données.
 *
 * Sources (aucun montant n'est inventé ici) :
 * - situation, budget, patrimoine, réserve : snapshot (`buildSnapshot`) ;
 * - capacité d'épargne disponible : plan d'épargne (`capacityForGoal`, même calcul que les suggestions) ;
 * - Zakat : dernier calcul enregistré de la personne et ses contributions (`zakatSettlements`),
 *   sinon le calcul courant (`calculateZakat` via le snapshot) sans contribution affectée ;
 * - purification : candidats détectés et décisions (`detectPurificationCandidates`, `summarizePurification`) ;
 * - projets : `planGoal` et `goalJourney` ; suggestions : `suggestGoals` ; calendrier : `familyCalendar` ;
 * - prochaines actions : `homeActions` (lot 1) et recommandations budgétaires (`buildRecommendations`) :
 *   engagements et projets en retard, puis recommandations urgentes, puis échéances et capacité.
 *
 * Confidentialité : sans consentement religieux en vigueur, le modèle ne contient AUCUNE donnée
 * religieuse personnalisée (ni engagements, ni projet, événement, suggestion ou action religieux),
 * quelle que soit la préférence d'affichage. Les règles RLS restent la protection de la base.
 */
import {
  capacityForGoal, goalJourney, isReligiousGoal, zakatSettlements,
  type CalendarEvent, type JourneyAction, type JourneyStep, type Suggestion, type ZakatAssetKind,
} from '@amanah/engines';
import type { HouseholdData, HouseholdSnapshot } from './snapshot.ts';
import { toContribution, type CalcSummaryRow, type ContributionRow } from './contributions-view.ts';
import { resolvePresentation, type Presentation } from './presentation.ts';
import { zakatStatusView, type ZakatIncompleteReason, type ZakatStatusView } from './zakat-status.ts';
import { homeActions, type HomeAction, type ZakatObservation } from './home-actions.ts';
import { ACTION_LABEL, RULE_TITLE } from './recommendation-text.ts';

export const HOME_LIMITS = { projects: 3, calendar: 4, actions: 3, suggestions: 3 } as const;

export interface ZakatRecords {
  /** Personne connectée : seuls ses propres calculs et contributions sont résumés sur l'accueil. */
  userId: string;
  calculations: readonly CalcSummaryRow[];
  contributions: readonly ContributionRow[];
}

export interface HomeViewInput {
  religiousEnabled: boolean;
  layoutPreference: unknown;
  snapshot: HouseholdSnapshot;
  data: Pick<HouseholdData, 'accounts' | 'transactions' | 'allocations'>;
  calendar: readonly CalendarEvent[];
  suggestions: readonly Suggestion[];
  /** Fourni seulement avec consentement (null sinon : rien n'est chargé). */
  zakatRecords: ZakatRecords | null;
}

export interface HomeProject {
  id: string; name: string; religious: boolean;
  progressPercent: number; savedCents: number; targetCents: number; targetDate: string;
  status: 'achieved' | 'on_track' | 'behind' | 'overdue' | 'to_determine';
  paused: boolean;
  next: { action: JourneyAction; step: JourneyStep } | null;
}

export interface HomeActionItem extends Omit<HomeAction, 'kind'> { kind: HomeAction['kind'] | 'recommendation'; ruleId?: string }

export interface WealthGroup { key: 'liquid' | 'investments' | 'metals' | 'real_estate' | 'other'; label: string; cents: number; permille: number }

export interface HomeView {
  presentation: Presentation;
  asOf: string;
  isEmpty: boolean;
  situation: {
    netWorthCents: number; wealthPartial: boolean; balanceCents: number;
    month: string; incomeCents: number; expenseCents: number; netCents: number; savingsRatePermille: number | null;
    /**
     * Plan d'épargne (`capacityForGoal`) : capacité retenue pour le plan et part non affectée
     * (null : capacité inconnue). Aucun calcul ici.
     */
    capacity: { retainedCents: number | null; availableCents: number | null; source: 'declared' | 'estimated' | 'unknown' };
    /** Analyse des mois complets : excédent mensuel observé (constat, pas une ressource en plus). */
    observedSurplus: { cents: number | null; months: number; sufficient: boolean };
    /** Catégories budgétées du mois (affichage analytique). */
    budgetLines: Array<{ categorySlug: string; spentCents: number; limitCents: number; status: 'ok' | 'warning' | 'over' | 'no_budget' }>;
  };
  commitments: null | {
    zakat: {
      view: ZakatStatusView;
      /** saved : dernier calcul enregistré ; live : calcul courant non enregistré. */
      basis: 'saved' | 'live';
      calculationAsOf: string | null;
      statusKey: 'to_determine' | 'below_nisab' | 'hawl_incomplete' | 'due' | null;
    };
    purification: { pendingCount: number; pendingCents: number; toPurifyCents: number; toDetermineCount: number };
    solidarity: { year: number; totalCents: number; count: number };
  };
  projects: { items: HomeProject[]; activeCount: number };
  suggestions: Suggestion[];
  calendar: CalendarEvent[];
  wealth: {
    totalAssetsCents: number; groups: WealthGroup[]; partial: boolean;
    reserve: { monthsCovered: number; months: number } | null;
    /** Éléments à examiner (avec consentement) : comptes ayant reçu des intérêts détectés. */
    toReview: Array<{ label: string; href: string }>;
    /** Placements présents : l'analyse de conformité n'existe pas encore (chantier dédié). */
    investmentsWithoutScreening: boolean;
  };
  actions: HomeActionItem[];
}

const GROUP: Record<ZakatAssetKind, WealthGroup['key']> = {
  cash: 'liquid', bank_balance: 'liquid', business_cash: 'liquid',
  stocks_funds: 'investments', pension: 'investments', group_insurance: 'investments', life_insurance: 'investments',
  gold: 'metals', silver: 'metals', jewelry_personal: 'metals',
  real_estate_residence: 'real_estate', real_estate_investment: 'real_estate',
  business_inventory: 'other', receivable: 'other', vehicle: 'other', other: 'other',
};
const GROUP_LABEL: Record<WealthGroup['key'], string> = {
  liquid: 'Comptes, épargne', investments: 'Placements', metals: 'Or et métaux', real_estate: 'Immobilier', other: 'Autres actifs',
};

const PRICE_REASONS = new Set(['nisab_price_unavailable', 'valuation_price_unavailable']);
const num = (v: number | string) => (typeof v === 'string' ? Number(v) : v);

function zakatBlock(s: HouseholdSnapshot, records: ZakatRecords | null): NonNullable<HomeView['commitments']>['zakat'] & { observation: ZakatObservation } {
  const mine = (records?.calculations ?? []).filter((c) => c.owner_id === records!.userId)
    .slice().sort((a, b) => (a.as_of < b.as_of ? 1 : a.as_of > b.as_of ? -1 : 0))[0];
  if (mine) {
    const myContribs = (records!.contributions).filter((c) => c.owner_id === records!.userId).map(toContribution);
    const due = num(mine.zakat_due_cents);
    const [st] = zakatSettlements([{ id: mine.id, dueCents: due }], myContribs);
    const complete = mine.status !== 'to_determine';
    const view = zakatStatusView({
      estimate: complete ? { complete: true, dueCents: due } : { complete: false, reason: 'missing_choices' },
      paidCents: st!.paidCents, bankMatchedPaidCents: st!.bankMatchedPaidCents, confirmedPaidCents: st!.confirmedPaidCents,
      provisionCents: null, // aucune provision virtuelle n'existe encore dans les moteurs : rien n'est affiché
    });
    return { view, basis: 'saved', calculationAsOf: mine.as_of, statusKey: mine.status, observation: complete ? 'up_to_date' : 'missing_choices' };
  }
  const r = s.zakat.result;
  let reason: ZakatIncompleteReason | null = null;
  if (!r) reason = 'missing_choices';
  else if (r.status === 'to_determine') reason = r.pendingReasons.some((p) => PRICE_REASONS.has(p)) ? 'price_stale' : 'missing_choices';
  const view = zakatStatusView({
    estimate: reason ? { complete: false, reason } : { complete: true, dueCents: r!.dueCents },
    paidCents: 0, bankMatchedPaidCents: 0, confirmedPaidCents: 0, provisionCents: null,
  });
  return {
    view, basis: 'live', calculationAsOf: null, statusKey: r?.status ?? null,
    observation: reason === 'price_stale' ? 'price_stale' : reason ? 'missing_choices' : 'up_to_date',
  };
}

/** Projet visé par une recommandation : sujet de R7, ou lien vers la fiche d'un projet. */
export function recommendationGoalId(ruleId: string, subject: string | null, href: string): string | null {
  if (ruleId === 'R7' && subject) return subject;
  const m = /^\/goals\/([^/?#]+)/.exec(href);
  if (!m || m[1] === 'nouveau' || m[1] === 'calendrier' || m[1] === 'preferences' || m[1] === 'aid') return null;
  return decodeURIComponent(m[1]!);
}

export function buildHomeView(input: HomeViewInput): HomeView {
  const { snapshot: s, data } = input;
  const religious = input.religiousEnabled === true;
  const presentation = resolvePresentation({ layoutPreference: input.layoutPreference, religiousEnabled: religious });
  const cap = capacityForGoal(s.savingsPlan, '__accueil__');

  // Projets : jamais de projet religieux sans consentement (défense en plus de la RLS)
  const open = s.goals.filter(({ goal }) => goal.lifecycle !== 'achieved' && goal.lifecycle !== 'archived')
    .filter(({ goal }) => religious || !isReligiousGoal(goal.kind));
  const items: HomeProject[] = open
    .slice().sort((a, b) => ((a.goal.lifecycle ?? 'active') === 'paused' ? 1 : 0) - ((b.goal.lifecycle ?? 'active') === 'paused' ? 1 : 0)
      || (a.goal.priority ?? 3) - (b.goal.priority ?? 3) || (a.goal.targetDate < b.goal.targetDate ? -1 : 1))
    .slice(0, HOME_LIMITS.projects)
    .map(({ goal, plan }) => {
      const j = goalJourney(goal, plan, data.allocations);
      return {
        id: goal.id, name: goal.name, religious: isReligiousGoal(goal.kind),
        progressPercent: Math.round(plan.progressPermille / 10), savedCents: plan.savedCents, targetCents: goal.targetCents, targetDate: goal.targetDate,
        status: plan.status, paused: (goal.lifecycle ?? 'active') === 'paused', next: j.next,
      };
    });

  const calendar = input.calendar.filter((e) => religious || !e.religious).slice(0, HOME_LIMITS.calendar);
  const freshSuggestions = input.suggestions.filter((x) => x.status === 'new' && (religious || x.group !== 'religious'));

  // Engagements (consentement seulement)
  let commitments: HomeView['commitments'] = null;
  let zakatObservation: ZakatObservation | null = null;
  if (religious) {
    const z = zakatBlock(s, input.zakatRecords);
    zakatObservation = z.observation;
    const year = Number(s.asOf.slice(0, 4));
    const solidarity = (input.zakatRecords?.contributions ?? [])
      .filter((c) => c.owner_id === input.zakatRecords!.userId && ['sadaqah', 'waqf', 'other'].includes(c.kind) && c.paid_on.startsWith(`${year}-`) && c.paid_on <= s.asOf);
    const p = s.purification;
    commitments = {
      zakat: { view: z.view, basis: z.basis, calculationAsOf: z.calculationAsOf, statusKey: z.statusKey },
      purification: {
        pendingCount: p.candidates.length, pendingCents: p.summary ? p.summary.detectedCreditedCents : p.detectedCreditedCents,
        toPurifyCents: p.summary?.toPurifyCents ?? 0, toDetermineCount: p.summary?.toDetermineCount ?? 0,
      },
      solidarity: { year, totalCents: solidarity.reduce((t, c) => t + num(c.amount_cents), 0), count: solidarity.length },
    };
  }

  // Patrimoine : données disponibles et éléments à examiner — aucun score de conformité
  const total = s.wealth.assetsCents;
  const sums = new Map<WealthGroup['key'], number>();
  for (const k of s.wealth.byKind) sums.set(GROUP[k.kind] ?? 'other', (sums.get(GROUP[k.kind] ?? 'other') ?? 0) + k.valueCents);
  const groups: WealthGroup[] = (['liquid', 'investments', 'metals', 'real_estate', 'other'] as const)
    .filter((k) => (sums.get(k) ?? 0) > 0)
    .map((k) => ({ key: k, label: GROUP_LABEL[k], cents: sums.get(k)!, permille: total > 0 ? Math.round((sums.get(k)! * 1000) / total) : 0 }));
  const toReview: Array<{ label: string; href: string }> = [];
  if (religious && s.purification.candidates.length > 0) {
    const txAccount = new Map(data.transactions.map((t) => [t.id, t.accountId]));
    const accounts = new Set(s.purification.candidates.map((c) => txAccount.get(c.transactionId)).filter((x): x is string => Boolean(x)));
    const n = accounts.size || 1;
    toReview.push({ label: n === 1 ? '1 compte a reçu des intérêts' : `${n} comptes ont reçu des intérêts`, href: '/purification' });
  }
  const reserve = s.analysis.reserve ? { monthsCovered: s.analysis.reserve.monthsCovered, months: s.analysis.reserve.months } : null;

  // Prochaines actions : passerelles du lot 1, puis recommandations budgétaires
  const late = open.filter(({ goal, plan }) => (goal.lifecycle ?? 'active') === 'active' && (plan.status === 'behind' || plan.status === 'overdue'))
    .map(({ goal }) => ({ id: goal.id, name: goal.name, religious: isReligiousGoal(goal.kind) }));
  const gateways = homeActions({
    religiousEnabled: religious, asOf: s.asOf,
    purificationPendingCount: religious ? s.purification.candidates.length : 0,
    zakat: religious && zakatObservation ? { state: zakatObservation } : null,
    lateGoals: late,
    upcomingEvents: freshSuggestions.filter((x) => x.dueDate).map((x) => ({
      id: x.id, label: x.title, date: x.dueDate!, religious: x.group === 'religious', hasGoal: false, suggestionHref: x.href,
    })),
    availableCapacityCents: cap.availableCents ?? 0,
  }, 20);
  // Recommandations budgétaires (moteur existant) : les urgentes passent avant les opportunités.
  // Une recommandation qui vise un projet (R7, lien /goals/[id]) hérite de la catégorie RÉELLE de ce
  // projet (type, jamais le nom) ; sans consentement, celles d'un projet religieux ou d'un projet
  // inconnu de l'accueil sont exclues : ni nom, ni identifiant, ni lien.
  const goalKind = new Map(s.goals.map(({ goal }) => [goal.id, goal.kind]));
  const recos = s.recommendations.filter((r) => r.action).flatMap((r) => {
    const goalId = recommendationGoalId(r.ruleId, r.subject, r.action!.href);
    const kind = goalId === null ? null : goalKind.get(goalId);
    const isReligious = goalId !== null && (kind === undefined || isReligiousGoal(kind));
    if (isReligious && !religious) return [];
    return [{
      item: { id: `reco:${r.ruleId}:${r.fingerprint}`, kind: 'recommendation' as const, ruleId: r.ruleId, observation: RULE_TITLE[r.ruleId], cta: ACTION_LABEL[r.action!.code] ?? 'Voir', href: r.action!.href, religious: isReligious },
      urgent: r.severity === 'critical' || r.severity === 'high',
    }];
  });
  const ordered: HomeActionItem[] = [
    ...gateways.filter((a) => a.kind === 'zakat' || a.kind === 'purification' || a.kind === 'late_goal'),
    ...recos.filter((r) => r.urgent).map((r) => r.item),
    ...gateways.filter((a) => a.kind === 'upcoming_event' || a.kind === 'available_capacity'),
    ...recos.filter((r) => !r.urgent).map((r) => r.item),
  ];
  const seen = new Set<string>();
  const actions = ordered.filter((a) => (seen.has(a.href) ? false : (seen.add(a.href), true))).slice(0, HOME_LIMITS.actions);

  return {
    presentation, asOf: s.asOf, isEmpty: s.isEmpty,
    situation: {
      netWorthCents: s.wealth.netWorthCents, wealthPartial: s.wealth.status === 'partial', balanceCents: s.totalBalanceCents,
      month: s.month.month, incomeCents: s.month.incomeCents, expenseCents: s.month.expenseCents, netCents: s.month.netCents, savingsRatePermille: s.month.savingsRatePermille,
      capacity: { retainedCents: cap.capacityCents, availableCents: cap.availableCents, source: cap.capacitySource },
      observedSurplus: {
        cents: s.analysis.reliability === 'insufficient' ? null : s.analysis.capacity.observedCents,
        months: s.analysis.monthsWithData, sufficient: s.analysis.reliability !== 'insufficient',
      },
      budgetLines: s.month.categories.filter((c) => c.limitCents !== null).sort((a, b) => b.spentCents - a.spentCents).slice(0, 4)
        .map((c) => ({ categorySlug: c.categorySlug, spentCents: c.spentCents, limitCents: c.limitCents!, status: c.status })),
    },
    commitments,
    projects: { items, activeCount: open.length },
    suggestions: freshSuggestions.slice(0, HOME_LIMITS.suggestions),
    calendar,
    wealth: { totalAssetsCents: total, groups, partial: s.wealth.status === 'partial', reserve, toReview, investmentsWithoutScreening: religious && (sums.get('investments') ?? 0) > 0 },
    actions,
  };
}
