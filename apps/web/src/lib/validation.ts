/**
 * Validation des formulaires (côté serveur, avant toute écriture).
 * Les messages sont destinés à l'utilisateur. Les montants sont convertis en
 * centimes entiers sans passer par un flottant.
 */
import { z } from 'zod';
import { parseAmountToCents } from '@amanah/engines';

/** Convertit une saisie libre (« 1 234,56 », « 1234.56 », « 12 ») en centimes. */
export function amountToCents(raw: string): number {
  const v = raw.trim();
  const sep = v.includes(',') ? ',' : '.';
  return parseAmountToCents(v, sep);
}

const amount = (label: string, opts: { min?: number; allowNegative?: boolean } = {}) =>
  z.string().trim().min(1, `${label} : montant requis.`).transform((v, ctx) => {
    try {
      const cents = amountToCents(v);
      if (!opts.allowNegative && cents < 0) { ctx.addIssue({ code: 'custom', message: `${label} : le montant doit être positif.` }); return z.NEVER; }
      if (opts.min !== undefined && cents < opts.min) { ctx.addIssue({ code: 'custom', message: `${label} : montant trop faible.` }); return z.NEVER; }
      if (Math.abs(cents) > 100_000_000_00) { ctx.addIssue({ code: 'custom', message: `${label} : montant trop élevé.` }); return z.NEVER; }
      return cents;
    } catch {
      ctx.addIssue({ code: 'custom', message: `${label} : montant illisible (exemple : 1 234,56).` });
      return z.NEVER;
    }
  });

const isoDate = (label: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} : date invalide.`)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), `${label} : date inexistante.`);

const email = z.string().trim().toLowerCase().max(254).email('Adresse e-mail invalide.');
const password = z.string().min(10, 'Le mot de passe doit contenir au moins 10 caractères.').max(72, 'Le mot de passe est trop long (72 caractères maximum).')
  .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), 'Le mot de passe doit contenir au moins une lettre et un chiffre.');

export const signUpSchema = z.object({ email, password, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { message: 'Les deux mots de passe ne correspondent pas.', path: ['passwordConfirm'] });
export const signInSchema = z.object({ email, password: z.string().min(1, 'Mot de passe requis.').max(72) });
export const resetRequestSchema = z.object({ email });
export const newPasswordSchema = z.object({ password, passwordConfirm: z.string() })
  .refine((d) => d.password === d.passwordConfirm, { message: 'Les deux mots de passe ne correspondent pas.', path: ['passwordConfirm'] });

export const profileSchema = z.object({
  displayName: z.string().trim().min(1, 'Indiquez un prénom ou un pseudonyme.').max(80, 'Prénom trop long.'),
  householdName: z.string().trim().min(1, 'Indiquez un nom de foyer.').max(120, 'Nom de foyer trop long.'),
  // Absente quand le champ est désactivé (membre non propriétaire) : traitée comme non renseignée
  region: z.enum(['BRU', 'WAL', 'VLA', '']).optional().transform((v) => (v ? v : null)),
});

export const ACCOUNT_TYPES = ['current', 'savings', 'regulated_savings', 'cash', 'credit_card', 'other'] as const;
export const accountSchema = z.object({
  name: z.string().trim().min(1, 'Nom du compte requis.').max(120),
  type: z.enum(ACCOUNT_TYPES, { message: 'Type de compte invalide.' }),
  openingBalance: amount('Solde de départ', { allowNegative: true }),
});

export const transactionSchema = z.object({
  accountId: z.string().uuid('Choisissez un compte.'),
  direction: z.enum(['income', 'expense'], { message: 'Choisissez revenu ou dépense.' }),
  amount: amount('Montant', { min: 1 }),
  bookedOn: isoDate('Date'),
  categorySlug: z.string().trim().min(1, 'Choisissez une catégorie.').max(60),
  description: z.string().trim().max(140, 'Description trop longue (140 caractères maximum).').default(''),
}).transform((d) => ({ ...d, amountCents: d.direction === 'expense' ? -d.amount : d.amount }));

export const categorySchema = z.object({
  label: z.string().trim().min(1, 'Nom de catégorie requis.').max(60, 'Nom trop long.'),
  kind: z.enum(['income', 'expense'], { message: 'Type de catégorie invalide.' }),
});

/** Code technique d'une catégorie personnelle, dérivé du libellé (sans accents). */
export function customCategorySlug(label: string): string {
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `perso-${base || 'categorie'}`;
}

export const budgetSchema = z.object({
  categorySlug: z.string().trim().min(1, 'Choisissez une catégorie.').max(60),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois invalide.'),
  limit: amount('Budget'),
});

export const hajjGoalSchema = z.object({
  name: z.string().trim().min(1, 'Nom de l’objectif requis.').max(120),
  target: amount('Montant cible', { min: 1 }),
  available: z.string().trim().transform((v) => (v === '' ? '0' : v)).pipe(amount('Épargne disponible')),
  targetDate: isoDate('Date souhaitée'),
  monthlyCapacity: amount('Capacité mensuelle'),
});

// --- Projets universels (Sprint 5) ----------------------------------------------
/** Identifiant de projet : UUID (mode réel, vérifié aussi par le dépôt) ou identifiant fictif de démonstration. */
export const goalIdField = (message = 'Projet invalide.') => z.string().regex(/^[0-9a-zA-Z-]{3,64}$/, message);
export const GOAL_KINDS = ['children_education', 'real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal', 'hajj', 'omra', 'religious_other'] as const;
/** Création : la catégorie est choisie une fois (elle ne change plus) ; nom facultatif (libellé de la catégorie). */
export const goalSchema = z.object({
  kind: z.enum(GOAL_KINDS, { message: 'Choisissez une catégorie de projet.' }),
  name: z.string().trim().max(120, 'Nom trop long (120 caractères au plus).').optional().transform((v) => v || null),
  target: amount('Montant cible', { min: 1 }),
  available: z.string().trim().optional().transform((v) => (v ? v : '0')).pipe(amount('Épargne disponible')),
  targetDate: isoDate('Date souhaitée'),
  monthlyCapacity: amount('Capacité mensuelle'),
  /** Projet issu d'une suggestion (modèle du catalogue) : origine conservée, tout reste modifiable. */
  templateId: z.string().optional().transform((v) => v || null).pipe(z.string().regex(/^[a-z0-9-]{2,40}$/, 'Modèle invalide.').nullable()),
  occurrence: z.string().optional().transform((v) => (v ? Number(v) : null)).pipe(z.number().int().min(2000).max(2100).nullable()),
  /** Reconduction d'un projet annuel (vérifiée côté serveur et en base). */
  previousGoalId: z.string().optional().transform((v) => v || null).pipe(z.string().regex(/^[0-9a-zA-Z-]{3,64}$/, 'Projet précédent invalide.').nullable()),
}).refine((d) => d.available <= d.target, { path: ['available'], message: 'L’épargne disponible dépasse le montant cible.' })
  .refine((d) => d.kind !== 'religious_other' || d.name !== null, { path: ['name'], message: 'Donnez un nom à ce projet (par exemple : Ramadan).' })
  // Projet personnel : nom libre obligatoire (voyage, mariage, véhicule, création d'entreprise…)
  .refine((d) => d.kind !== 'personal' || d.name !== null, { path: ['name'], message: 'Donnez un nom à votre projet personnel (par exemple : Voyage).' });

/** Modification : l'historique des affectations n'est jamais touché. */
export const goalUpdateSchema = z.object({
  id: goalIdField(),
  /** « Valider mon plan » : décision de l'étape Planifier. */
  confirm: z.string().optional().transform((v) => v === 'yes'),
  name: z.string().trim().min(1, 'Nom du projet requis.').max(120),
  target: amount('Montant cible', { min: 1 }),
  targetDate: isoDate('Date souhaitée'),
  monthlyCapacity: amount('Capacité mensuelle'),
  priority: z.coerce.number({ message: 'Priorité invalide.' }).int().min(1, 'Priorité de 1 à 5.').max(5, 'Priorité de 1 à 5.'),
});

export const goalLifecycleSchema = z.object({
  id: goalIdField(),
  action: z.enum(['achieve', 'reopen', 'pause', 'resume', 'archive'], { message: 'Action invalide.' }),
  realizedOn: z.string().optional().transform((v) => v || null).pipe(isoDate('Date de réalisation').nullable()),
}).refine((d) => d.action !== 'achieve' || d.realizedOn !== null, { path: ['realizedOn'], message: 'Indiquez la date de réalisation.' });

// --- Aïd al-Adha (Sprint 5, lot 5.2) ---------------------------------------------
const optionalAmountZero = (label: string) => z.string().trim().optional().transform((v) => (v ? v : '0')).pipe(amount(label));
const eidBudgetFields = {
  sacrifice: optionalAmountZero('Sacrifice ou quote-part'),
  extras: optionalAmountZero('Frais complémentaires'),
  organization: optionalAmountZero('Contribution à un organisme'),
  family: optionalAmountZero('Contributions familiales'),
};
const eidDateFields = {
  targetDate: isoDate('Date de l’Aïd'),
  dateStatus: z.enum(['entered', 'confirmed'], { message: 'Indiquez si la date est confirmée.' }),
  dateSource: z.string().trim().max(200, 'Source trop longue.').optional().transform((v) => v || null),
};
const budgetOk = (d: { sacrifice: number; extras: number; organization: number; family: number }) => d.sacrifice + d.extras + d.organization > d.family;
const sourceOk = (d: { dateStatus: string; dateSource: string | null }) => d.dateStatus !== 'confirmed' || (d.dateSource !== null && d.dateSource.length >= 3);

export const eidSchema = z.object({
  name: z.string().trim().max(120).optional().transform((v) => v || null),
  civilYear: z.coerce.number({ message: 'Année civile invalide.' }).int().min(2000, 'Année civile invalide.').max(2100, 'Année civile invalide.'),
  ...eidBudgetFields,
  ...eidDateFields,
  available: optionalAmountZero('Épargne disponible'),
  monthlyCapacity: amount('Effort d’épargne mensuel'),
  previousGoalId: z.string().optional().transform((v) => v || null).pipe(goalIdField('Aïd précédent invalide.').nullable()),
})
  .refine(budgetOk, { path: ['family'], message: 'Les contributions familiales couvrent tout le budget : rien à mettre de côté.' })
  .refine(sourceOk, { path: ['dateSource'], message: 'Une date confirmée doit indiquer sa source (mosquée, autorité suivie…).' })
  .refine((d) => d.available <= d.sacrifice + d.extras + d.organization - d.family, { path: ['available'], message: 'L’épargne disponible dépasse le montant à mettre de côté.' })
  .refine((d) => d.targetDate.startsWith(`${d.civilYear}-`), { path: ['targetDate'], message: 'La date doit tomber dans l’année civile choisie.' });

export const eidDateSchema = z.object({ goalId: goalIdField(), ...eidDateFields })
  .refine(sourceOk, { path: ['dateSource'], message: 'Une date confirmée doit indiquer sa source (mosquée, autorité suivie…).' });

export const eidBudgetSchema = z.object({ goalId: goalIdField(), ...eidBudgetFields })
  .refine(budgetOk, { path: ['family'], message: 'Les contributions familiales couvrent tout le budget : rien à mettre de côté.' });

/** Plan d'épargne : un montant mensuel et une priorité par projet (lignes parallèles du formulaire). */
export const savingsPlanSchema = z.object({
  goalIds: z.array(goalIdField()).min(1, 'Aucun projet à planifier.').max(50),
  monthly: z.array(amount('Montant mensuel')).max(50),
  priority: z.array(z.coerce.number().int().min(1, 'Priorité de 1 à 5.').max(5, 'Priorité de 1 à 5.')).max(50),
}).refine((d) => d.monthly.length === d.goalIds.length && d.priority.length === d.goalIds.length, { message: 'Formulaire incomplet.' });

export const declaredCapacitySchema = z.object({
  capacity: z.string().trim().optional().transform((v) => v || null).pipe(amount('Capacité d’épargne mensuelle').nullable()),
});

export const simulationSchema = z.object({ monthly: amount('Épargne mensuelle simulée') });

/** « Simuler » : stratégie retenue parmi les scénarios comparés. */
export const strategySchema = z.object({
  goalId: goalIdField(),
  monthly: z.string().trim().min(1).regex(/^\d{1,12}$/, 'Scénario invalide.').transform(Number),
});

export const allocationSchema = z.object({
  goalId: goalIdField('Objectif invalide.'),
  direction: z.enum(['add', 'remove']),
  amount: amount('Montant', { min: 1 }),
});

export const idSchema = z.object({ id: z.string().uuid('Identifiant invalide.') });

/** Transforme les erreurs de validation en messages par champ (premier message par champ). */
export function fieldErrorsOf(error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const key = String(i.path[0] ?? '_');
    if (!(key in out)) out[key] = i.message;
  }
  return out;
}

/** Lit un FormData en objet simple de chaînes. */
export function formDataToObject(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === 'string') o[k] = v;
  return o;
}

// --- Purification (Sprint 2) --------------------------------------------------
const optionalAmount = (label: string) => z.string().trim().optional().transform((v, ctx) => {
  if (!v) return null;
  try {
    const cents = amountToCents(v);
    if (cents < 0) { ctx.addIssue({ code: 'custom', message: `${label} : le montant doit être positif.` }); return z.NEVER; }
    if (cents > 100_000_000_00) { ctx.addIssue({ code: 'custom', message: `${label} : montant trop élevé.` }); return z.NEVER; }
    return cents;
  } catch {
    ctx.addIssue({ code: 'custom', message: `${label} : montant illisible (exemple : 12,34).` });
    return z.NEVER;
  }
});

export const purificationReviewSchema = z.object({
  id: z.string().uuid('Élément invalide.'),
  decision: z.enum(['confirm', 'reject', 'restore', 'unconfirm'], { message: 'Décision invalide.' }),
  gross: optionalAmount('Montant brut'),
  withholding: optionalAmount('Précompte mobilier'),
}).refine((d) => d.gross === null || d.withholding === null, { message: 'Indiquez le brut OU le précompte : l’autre montant est calculé.', path: ['withholding'] });

export const purificationBasisSchema = z.object({
  basis: z.enum(['gross', 'net_credited'], { message: 'Choisissez une méthodologie.' }),
});

export const purificationRecordSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, 'Sélectionnez au moins un élément confirmé.').max(500),
  paidOn: isoDate('Date de la purification'),
  beneficiary: z.string().trim().min(1, 'Indiquez le bénéficiaire.').max(120, 'Nom du bénéficiaire trop long.'),
});

// --- Optimisation budgétaire (Sprint 3) -----------------------------------------
const cents = z.number().int().min(1).max(10_000_000);
export const adjustmentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('total'), monthlyCents: cents }),
  z.object({ type: z.literal('category'), categorySlug: z.string().regex(/^[a-z0-9_-]{2,60}$/), monthlyCents: cents }),
  z.object({ type: z.literal('cancel_recurring'), seriesKey: z.string().min(3).max(120) }),
]);
export const scenarioSchema = z.object({
  name: z.string().trim().min(1, 'Donnez un nom au scénario.').max(80, 'Nom trop long (80 caractères au plus).'),
  adjustments: z.array(adjustmentSchema).min(1, 'Ajoutez au moins un ajustement.').max(50),
});

/** Lit la liste d'ajustements transmise par le formulaire (JSON), sans jamais lever d'exception. */
export function parseAdjustments(raw: unknown): unknown {
  if (typeof raw !== 'string' || raw.length > 20_000) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// --- Dons et Zakat (Sprint 4) -----------------------------------------------------
/** Champ absent (bouton radio non coché) ou vide : « non choisi ». */
const emptyToNull = (v: unknown) => (v === undefined || (typeof v === 'string' && v.trim() === '') ? null : v);
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid('Sélection invalide.').nullable().optional());

/** Dons saisis par l'utilisateur : jamais de purification (elle naît du parcours de purification). */
export const DECLARABLE_KINDS = ['zakat', 'zakat_al_fitr', 'sadaqah', 'waqf', 'other'] as const;
export const contributionSchema = z.object({
  kind: z.enum(DECLARABLE_KINDS, { message: 'Choisissez le type de don.' }),
  amount: amount('Montant', { min: 1 }),
  paidOn: isoDate('Date du don'),
  beneficiary: z.string().trim().min(1, 'Indiquez le bénéficiaire.').max(120, 'Nom du bénéficiaire trop long.'),
  note: z.string().trim().max(300, 'Note trop longue (300 caractères au plus).').optional().transform((v) => v || null),
  zakatCalculationId: optionalUuid,
  zakatFitrId: optionalUuid,
}).superRefine((d, ctx) => {
  if (d.zakatCalculationId && d.kind !== 'zakat') ctx.addIssue({ code: 'custom', path: ['zakatCalculationId'], message: 'Seule une Zakat peut être affectée à un calcul de Zakat.' });
  if (d.zakatFitrId && d.kind !== 'zakat_al_fitr') ctx.addIssue({ code: 'custom', path: ['zakatFitrId'], message: 'Seule une Zakat al-Fitr peut être affectée à une Zakat al-Fitr.' });
});

export const contributionLinkSchema = z.object({
  id: z.string().uuid('Don invalide.'),
  transactionId: z.preprocess(emptyToNull, z.string().uuid('Opération invalide.').nullable()),
});

export const fitrSchema = z.object({
  /** Année civile (calendrier grégorien) ; l'année hégirienne n'est jamais déduite automatiquement. */
  civilYear: z.coerce.number({ message: 'Année civile invalide.' }).int('Année civile invalide.').min(2000, 'Année civile invalide.').max(2100, 'Année civile invalide.'),
  persons: z.coerce.number({ message: 'Nombre de personnes invalide.' }).int('Nombre entier requis.').min(1, 'Au moins une personne.').max(30, '30 personnes au plus.'),
  amountPerPerson: amount('Montant par personne', { min: 1 }).refine((v) => v <= 100_000, 'Montant par personne : 1 000 € au plus.'),
  source: z.string().trim().min(3, 'Indiquez d’où vient ce montant (mosquée, organisme, avis suivi…).').max(200, 'Source trop longue.'),
});

export const metalPriceSchema = z.object({
  symbol: z.enum(['XAU', 'XAG'], { message: 'Choisissez le métal.' }),
  pricePerGram: amount('Prix par gramme', { min: 1 }),
  asOf: isoDate('Date du prix'),
  source: z.string().trim().min(3, 'Indiquez la source du prix.').max(200, 'Source trop longue.'),
});

const choice = <T extends readonly [string, ...string[]]>(values: T) => z.preprocess(emptyToNull, z.enum(values).nullable());
export const zakatSettingsSchema = z.object({
  nisabBasis: choice(['gold', 'silver'] as const),
  yearBasis: choice(['lunar', 'solar'] as const),
  hawlStart: z.preprocess(emptyToNull, isoDate('Début du Hawl').nullable()),
  personalJewelry: choice(['include', 'exclude'] as const),
  longTermInvestments: choice(['full_market_value', 'custom_ratio'] as const),
  longTermRatioPercent: z.preprocess(emptyToNull, z.coerce.number({ message: 'Part invalide.' }).min(0, 'Entre 0 et 100 %.').max(100, 'Entre 0 et 100 %.').nullable()),
  lockedPensions: choice(['exclude', 'include'] as const),
  debts: choice(['due_12_months', 'none', 'all'] as const),
  excluded: z.array(z.string().regex(/^(account:)?[0-9a-f-]{36}$/)).max(500),
}).superRefine((d, ctx) => {
  if (d.longTermInvestments === 'custom_ratio' && d.longTermRatioPercent === null) {
    ctx.addIssue({ code: 'custom', path: ['longTermRatioPercent'], message: 'Indiquez la part retenue des placements à long terme.' });
  }
});

export const ASSET_KINDS = ['cash', 'gold', 'silver', 'jewelry_personal', 'stocks_funds', 'pension', 'group_insurance', 'life_insurance',
  'business_inventory', 'business_cash', 'receivable', 'real_estate_residence', 'real_estate_investment', 'vehicle', 'other'] as const;
export const assetSchema = z.object({
  kind: z.enum(ASSET_KINDS, { message: 'Choisissez le type de bien.' }),
  name: z.string().trim().min(1, 'Nom du bien requis.').max(120),
  value: z.string().trim().optional().transform((v) => v ?? ''),
  weightGrams: z.string().trim().optional().transform((v) => v ?? ''),
  purityPermille: z.preprocess(emptyToNull, z.coerce.number({ message: 'Titre invalide.' }).int().min(1, 'Titre entre 1 et 1000 ‰.').max(1000, 'Titre entre 1 et 1000 ‰.').nullable()),
  metal: choice(['gold', 'silver'] as const),
  heldFor: choice(['trading', 'long_term'] as const),
  accessible: choice(['yes', 'no'] as const),
  receivableLikely: choice(['yes', 'no'] as const),
}).transform((d, ctx) => {
  const byWeight = d.kind === 'gold' || d.kind === 'silver' || d.kind === 'jewelry_personal';
  let valueCents = 0;
  let weightMg: number | null = null;
  if (byWeight && d.weightGrams) {
    const mg = Math.round(Number(d.weightGrams.replace(',', '.')) * 1000);
    if (!Number.isFinite(mg) || mg <= 0 || mg > 100_000_000) { ctx.addIssue({ code: 'custom', path: ['weightGrams'], message: 'Poids invalide (en grammes).' }); return z.NEVER; }
    weightMg = mg;
  } else {
    try { valueCents = amountToCents(d.value); } catch { ctx.addIssue({ code: 'custom', path: ['value'], message: byWeight ? 'Indiquez le poids ou la valeur.' : 'Valeur requise (exemple : 1 234,56).' }); return z.NEVER; }
    if (valueCents < 0 || valueCents > 100_000_000_00) { ctx.addIssue({ code: 'custom', path: ['value'], message: 'Valeur invalide.' }); return z.NEVER; }
  }
  if (d.kind === 'jewelry_personal' && weightMg !== null && !d.metal) { ctx.addIssue({ code: 'custom', path: ['metal'], message: 'Précisez le métal des bijoux.' }); return z.NEVER; }
  return { ...d, valueCents, weightMg };
});

export const liabilitySchema = z.object({
  name: z.string().trim().min(1, 'Nom de la dette requis.').max(120),
  kind: z.enum(['mortgage', 'consumer_loan', 'family_loan', 'other'], { message: 'Choisissez le type de dette.' }),
  outstanding: amount('Capital restant dû'),
  due12m: amount('Échéances des 12 prochains mois'),
}).refine((d) => d.due12m <= d.outstanding, { path: ['due12m'], message: 'Les échéances à 12 mois ne peuvent pas dépasser le capital restant dû.' });

// --- Suggestions de projets et calendrier familial ------------------------------
const SUGGESTION_GROUP_VALUES = ['religious', 'family', 'finance', 'wealth'] as const;
const yesNoUnknown = z.enum(['yes', 'no', 'unknown']).transform((v) => (v === 'unknown' ? null : v === 'yes'));
const monthDay = z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Format attendu : MM-JJ.');

/** Préférences déclarées (jamais déduites). */
export const planningPreferencesSchema = z.object({
  groups: z.array(z.enum(SUGGESTION_GROUP_VALUES)).max(4),
  interests: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(30),
  hasChildren: yesNoUnknown,
  hasVehicle: yesNoUnknown,
  schoolCalendar: z.enum(['be-fwb', 'be-vl', 'custom'], { message: 'Calendrier scolaire invalide.' }),
  schoolStart: z.string().trim().optional().transform((v) => v || null).pipe(monthDay.nullable()),
  schoolHolidays: z.string().trim().optional().transform((v) => v || null).pipe(monthDay.nullable()),
}).refine((d) => d.schoolCalendar !== 'custom' || (d.schoolStart && d.schoolHolidays), { path: ['schoolStart'], message: 'Calendrier personnalisé : indiquez la rentrée et le début des vacances (MM-JJ).' });

export const suggestionDecisionSchema = z.object({
  suggestionId: z.string().regex(/^[a-z0-9-]{2,40}(:[0-9]{4})?$/, 'Suggestion invalide.'),
  decision: z.enum(['snooze', 'dismiss', 'restore']),
});

/** Échéance : UUID (réel) ou identifiant fictif de démonstration. */
export const calendarEventIdSchema = z.object({ id: goalIdField('Échéance invalide.') });

export const calendarEventSchema = z.object({
  label: z.string().trim().min(2, 'Libellé trop court.').max(80, 'Libellé trop long (80 caractères au plus).'),
  date: isoDate('Date'),
  yearly: z.string().optional().transform((v) => v === 'on' || v === 'yes'),
  // Personnel par défaut ; le partage avec le foyer est un choix volontaire
  visibility: z.enum(['private', 'household'], { message: 'Visibilité invalide.' }).optional().default('private'),
  // Classification religieuse explicite (case cochée), jamais déduite du libellé
  religious: z.string().optional().transform((v) => v === 'on' || v === 'yes'),
}).transform((d) => (d.religious ? { ...d, visibility: 'private' as const } : d));

/** Date scolaire corrigée ou confirmée par la personne (prime sur tout recalcul). */
export const schoolDateOverrideSchema = z.object({
  kind: z.enum(['start', 'holidays'], { message: 'Type de date invalide.' }),
  year: z.string().regex(/^\d{4}$/).transform(Number),
  date: isoDate('Date'),
  source: z.string().trim().min(3, 'Indiquez la source (école, courrier, site officiel…).').max(200),
}).refine((d) => d.date.startsWith(`${d.year}-`), { path: ['date'], message: 'La date doit tomber dans l’année indiquée.' });

export const schoolDateResetSchema = z.object({
  kind: z.enum(['start', 'holidays']),
  year: z.string().regex(/^\d{4}$/).transform(Number),
});

/** Démonstration : date de référence simulée (vide : date de départ). */
export const simulationDateSchema = z.object({
  date: z.string().trim().optional().transform((v) => v || null).pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.').nullable()),
});

export const religiousDateConfirmationSchema = z.object({
  type: z.enum(['ramadan', 'eid_al_fitr']),
  year: z.string().regex(/^\d{4}$/).transform(Number),
  date: isoDate('Date'),
  source: z.string().trim().min(3, 'Indiquez la source de la confirmation (mosquée, autorité suivie…).').max(200),
}).refine((d) => d.date.startsWith(`${d.year}-`), { path: ['date'], message: 'La date doit tomber dans l’année indiquée.' });
