'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { scenarioBaseline, scenarioBudgetLines } from '@amanah/engines';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { getSnapshot, todayInBrussels } from '@/lib/data';
import { formError, type FormState } from '@/lib/form-state';
import { fieldErrorsOf, parseAdjustments, scenarioSchema } from '@/lib/validation';

/**
 * Décider : enregistrer un scénario (et, sur confirmation explicite, l'appliquer aux
 * plafonds du mois). Les chiffres sont recalculés sur le serveur à partir des données
 * de l'utilisateur ; rien de ce que le navigateur a calculé n'est enregistré tel quel.
 * Aucune opération bancaire n'est jamais modifiée.
 */
export async function saveScenario(_p: FormState, fd: FormData): Promise<FormState> {
  if (isDemoMode) return formError('Enregistrement désactivé en mode démonstration : la simulation reste disponible.');
  const ctx = await requireOnboardedSession();
  if (!ctx.canWrite) return formError('Votre rôle dans ce foyer ne permet que la lecture.');
  const parsed = scenarioSchema.safeParse({ name: fd.get('name'), adjustments: parseAdjustments(fd.get('adjustments')) });
  if (!parsed.success) return formError('Vérifiez le scénario.', fieldErrorsOf(parsed.error));
  const apply = fd.get('apply') === 'yes';
  if (apply && fd.get('confirm') !== 'yes') {
    return formError('Confirmez la modification de vos plafonds.', { confirm: 'Cochez la case pour appliquer le scénario à votre budget.' });
  }

  const { analysis } = await getSnapshot();
  if (analysis.reliability === 'insufficient') return formError('Données insuffisantes : importez au moins 3 mois complets d’opérations.');
  const today = todayInBrussels();
  const baseline = scenarioBaseline(analysis, parsed.data.adjustments, today);
  const lines = scenarioBudgetLines(analysis, parsed.data.adjustments);
  if (apply && lines.length === 0) return formError('Ce scénario ne vise aucune catégorie : il n’y a pas de plafond à appliquer (une réduction globale reste un objectif).');

  const { data: row, error } = await ctx.supabase.from('budget_scenarios')
    .insert({ household_id: ctx.householdId, name: parsed.data.name, adjustments: parsed.data.adjustments, baseline })
    .select('id').single();
  if (error || !row) { console.error('[scenario] save', error?.code); return formError('Enregistrement impossible. Réessayez.'); }

  if (apply) {
    const { error: applyError } = await ctx.supabase.rpc('apply_budget_lines', {
      p_household_id: ctx.householdId, p_month: `${today.slice(0, 7)}-01`,
      p_lines: lines.map((l) => ({ category_slug: l.categorySlug, limit_cents: l.limitCents })), p_scenario_id: row.id,
    });
    if (applyError) { console.error('[scenario] apply', applyError.code); return formError('Le scénario est enregistré, mais les plafonds n’ont pas pu être appliqués. Réessayez.'); }
  }
  revalidatePath('/', 'layout');
  redirect(`/budget/optimiser?${apply ? 'applique' : 'enregistre'}=1#suivi`);
}
