/**
 * Dépôt des projets : contrat commun aux deux modes.
 *
 * Les écrans et les actions ne connaissent que cette interface. Deux implémentations :
 * - démonstration (demo-repository.ts) : données fictives conservées dans le navigateur
 *   (cookie compressé et validé), aucune base, aucun appel réseau vers une base ;
 * - réelle (supabase-repository.ts) : Supabase / PostgreSQL, RLS, fonctions SQL et
 *   consentement article 9 inchangés.
 * Les calculs restent dans les moteurs déterministes (@amanah/engines) : le dépôt ne fait
 * que lire et enregistrer des faits (projets, affectations, décisions, historique).
 */
import type { CustomCalendarEvent, Goal, GoalKind, PlanningPreferences, SuggestionDecision } from '@amanah/engines';
import type { EidPlanRow } from '../eid-view.ts';

export type IsoDate = string;
export type RepoResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const ok = <T>(value: T): RepoResult<T> => ({ ok: true, value });
export const fail = (error: string, fieldErrors?: Record<string, string>): RepoResult<never> => ({ ok: false, error, ...(fieldErrors ? { fieldErrors } : {}) });

/** Une entrée d'historique : champs modifiés, avant / après (mêmes noms que la base). */
export interface GoalChangeRow { id: string; changed_at: string; changes: Record<string, { from: unknown; to: unknown }> }

export interface NewGoalInput {
  kind: Exclude<GoalKind, 'eid_al_adha'>;
  name: string;
  targetCents: number;
  targetDate: IsoDate;
  monthlyCapacityCents: number;
  /** Épargne déjà disponible (affectation « initial », qui ne vaut pas « Suivre »). */
  initialCents: number;
  /** Suggestion acceptée : modèle d'origine et occurrence annuelle. */
  templateId?: string | null;
  occurrence?: number | null;
  /** Reconduction d'un projet annuel réalisé (une seule fois, année suivante). */
  previousGoalId?: string | null;
}

/** Préférences, décisions sur les suggestions et événements du calendrier familial. */
export interface PlanningData { prefs: PlanningPreferences; decisions: SuggestionDecision[]; events: CustomCalendarEvent[] }

export interface GoalPatch {
  name: string;
  targetCents: number;
  targetDate: IsoDate;
  monthlyCapacityCents: number;
  priority: number;
}

export type LifecycleAction = 'achieve' | 'reopen' | 'pause' | 'resume' | 'archive';

export interface EidBudgetFields { sacrificeCents: number; extraCostsCents: number; organizationCents: number; familyContributionCents: number }

export interface NewEidInput extends EidBudgetFields {
  name: string;
  civilYear: number;
  targetDate: IsoDate;
  dateStatus: 'entered' | 'confirmed';
  dateSource: string | null;
  /** Estimation tabulaire conservée pour traçabilité (jamais une confirmation). */
  estimatedDate: IsoDate | null;
  monthlyCapacityCents: number;
  initialCents: number;
  previousGoalId: string | null;
}

export interface PlanLineInput { goalId: string; monthlyCents: number; priority: number }

export interface GoalRepository {
  readonly mode: 'demo' | 'live';
  /** Projets Hajj, Omra et Aïd permis (démo : toujours ; réel : consentement article 9). */
  readonly religiousEnabled: boolean;
  /** Date du jour du mode (démo : date fictive des données ; réel : Bruxelles). */
  today(): IsoDate;

  listGoals(): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal | null>;
  history(goalId: string): Promise<GoalChangeRow[]>;
  eidPlans(): Promise<EidPlanRow[]>;

  create(input: NewGoalInput): Promise<RepoResult<{ id: string }>>;
  /** Modifie le plan ; confirmPlan = l'utilisateur valide son plan d'épargne (« Planifier »). */
  update(id: string, patch: GoalPatch, opts?: { confirmPlan?: boolean }): Promise<RepoResult>;
  /** « Simuler » : stratégie retenue après comparaison ; devient la mensualité du projet. */
  chooseStrategy(id: string, monthlyCents: number): Promise<RepoResult>;
  /** Affectation virtuelle (négative = retrait). Aucune somme n'est déplacée. */
  addAllocation(goalId: string, amountCents: number): Promise<RepoResult>;
  /** Plan d'épargne : mensualités et priorités de plusieurs projets. */
  savePlan(lines: PlanLineInput[]): Promise<RepoResult>;
  setLifecycle(id: string, action: LifecycleAction, realizedOn: IsoDate | null): Promise<RepoResult>;
  setDeclaredCapacity(cents: number | null): Promise<RepoResult>;

  createEid(input: NewEidInput): Promise<RepoResult<{ id: string }>>;
  updateEidDate(goalId: string, date: IsoDate, status: 'entered' | 'confirmed', source: string | null): Promise<RepoResult>;
  updateEidBudget(goalId: string, budget: EidBudgetFields): Promise<RepoResult>;

  /** Suggestions : rien n'est stocké hormis les choix de la personne (préférences, reports, refus). */
  planning(): Promise<PlanningData>;
  savePlanningPreferences(prefs: PlanningPreferences): Promise<RepoResult>;
  /** Reporter (30 jours), ne plus proposer (le modèle), ou rétablir. */
  decideSuggestion(suggestionId: string, decision: 'snooze' | 'dismiss' | 'restore'): Promise<RepoResult>;
  addCalendarEvent(event: Omit<CustomCalendarEvent, 'id'>): Promise<RepoResult>;
  removeCalendarEvent(id: string): Promise<RepoResult>;
}
