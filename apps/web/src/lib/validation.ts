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

export const allocationSchema = z.object({
  goalId: z.string().uuid('Objectif invalide.'),
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
