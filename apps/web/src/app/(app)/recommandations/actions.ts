'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { todayInBrussels } from '@/lib/data';
import { addMonths } from '@amanah/engines';

const schema = z.object({
  fingerprint: z.string().min(2).max(300),
  status: z.enum(['dismissed', 'done', 'snoozed']),
});

/** Décision personnelle sur une recommandation (écartée, faite, reportée d'un mois). */
export async function setRecommendationFeedback(_p: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return formError('Désactivé en mode démonstration.');
  const ctx = await requireOnboardedSession();
  const parsed = schema.safeParse({ fingerprint: fd.get('fingerprint'), status: fd.get('status') });
  if (!parsed.success) return formError('Décision invalide.');
  const { fingerprint, status } = parsed.data;
  const { error } = await ctx.supabase.from('recommendation_feedback').upsert({
    household_id: ctx.householdId, user_id: ctx.userId, fingerprint, status,
    snooze_until: status === 'snoozed' ? addMonths(todayInBrussels(), 1) : null,
  }, { onConflict: 'household_id,user_id,fingerprint' });
  if (error) { console.error('[reco] feedback', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  return formOk({ dismissed: 'Recommandation écartée.', done: 'Marquée comme faite.', snoozed: 'Reportée d’un mois.' }[status]);
}

/** Rétablit toutes les recommandations écartées, faites ou reportées. */
export async function resetRecommendationFeedback(_p: FormState, _fd: FormData): Promise<FormState> {
  if (isDemoMode) return formError('Désactivé en mode démonstration.');
  const ctx = await requireOnboardedSession();
  const { error } = await ctx.supabase.from('recommendation_feedback').delete().eq('household_id', ctx.householdId).eq('user_id', ctx.userId);
  if (error) { console.error('[reco] reset', error.code); return formError('Opération impossible. Réessayez.'); }
  revalidatePath('/', 'layout');
  return formOk('Toutes vos recommandations sont de nouveau affichées.');
}
