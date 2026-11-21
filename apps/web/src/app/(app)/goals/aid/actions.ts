'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { estimateEidAlAdha } from '@amanah/engines';
import { writeGoalRepository, type GoalRepository } from '@/lib/goals';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { eidBudgetSchema, eidDateSchema, eidSchema, fieldErrorsOf, formDataToObject } from '@/lib/validation';

/**
 * Aïd al-Adha : projet religieux. Mode réel : consentement article 9 (vérifié ici, imposé par
 * la RLS). Démonstration : données fictives, mêmes règles (année civile, reconduction unique).
 * Aucun paiement.
 */
async function religiousRepo(): Promise<GoalRepository | FormState> {
  const r = await writeGoalRepository();
  if ('error' in r) return formError(r.error);
  if (!r.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  return r;
}
const isState = (v: GoalRepository | FormState): v is FormState => 'status' in v;

/** Création, ou reconduction contrôlée (Aïd précédent réalisé, une seule fois). */
export async function createEidGoal(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await religiousRepo(); if (isState(repo)) return repo;
  const parsed = eidSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.targetDate <= repo.today()) return formError('Vérifiez les informations saisies.', { targetDate: 'La date de l’Aïd doit être dans le futur.' });
  // Estimation conservée pour traçabilité ; la date retenue reste celle saisie par l'utilisateur
  const estimate = estimateEidAlAdha(d.civilYear)[0]?.date ?? null;
  const r = await repo.createEid({
    name: d.name ?? `Aïd al-Adha ${d.civilYear}`, civilYear: d.civilYear,
    sacrificeCents: d.sacrifice, extraCostsCents: d.extras, organizationCents: d.organization, familyContributionCents: d.family,
    targetDate: d.targetDate, dateStatus: d.dateStatus, dateSource: d.dateSource, estimatedDate: estimate,
    monthlyCapacityCents: d.monthlyCapacity, initialCents: d.available, previousGoalId: d.previousGoalId,
  });
  if (!r.ok) return formError(r.error, r.fieldErrors);
  revalidatePath('/', 'layout');
  redirect(`/goals/${r.value.id}?cree=1`);
}

/** Date saisie ou confirmée (avec sa source) ; chaque changement est journalisé. */
export async function updateEidDate(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await religiousRepo(); if (isState(repo)) return repo;
  const parsed = eidDateSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const r = await repo.updateEidDate(d.goalId, d.targetDate, d.dateStatus, d.dateSource);
  if (!r.ok) return formError(r.error, r.fieldErrors);
  revalidatePath('/', 'layout');
  return formOk(d.dateStatus === 'confirmed' ? 'Date enregistrée comme confirmée par vous, avec sa source.' : 'Date enregistrée (non confirmée).');
}

export async function updateEidBudget(_p: FormState, fd: FormData): Promise<FormState> {
  const repo = await religiousRepo(); if (isState(repo)) return repo;
  const parsed = eidBudgetSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const r = await repo.updateEidBudget(d.goalId, { sacrificeCents: d.sacrifice, extraCostsCents: d.extras, organizationCents: d.organization, familyContributionCents: d.family });
  if (!r.ok) return formError(r.error, r.fieldErrors);
  revalidatePath('/', 'layout');
  return formOk('Budget mis à jour : le montant à mettre de côté est recalculé, les affectations sont conservées.');
}
