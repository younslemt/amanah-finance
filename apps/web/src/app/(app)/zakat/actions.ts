'use server';
import { revalidatePath } from 'next/cache';
import { calculateZakat, prepareZakat, ZAKAT_RULESET } from '@amanah/engines';
import { isDemoMode } from '@/lib/env';
import { getHouseholdData } from '@/lib/data';
import { requireOnboardedSession, type SessionContext } from '@/lib/supabase/session';
import { formError, formOk, type FormState } from '@/lib/form-state';
import { CHOICE_TEXT, type StoredInputs } from '@/lib/zakat-view';
import {
  assetSchema, fieldErrorsOf, fitrSchema, formDataToObject, idSchema, liabilitySchema, metalPriceSchema, zakatSettingsSchema,
} from '@/lib/validation';

/** Zakat : données article 9 de la personne (RLS). Biens et dettes : données du foyer. */
async function context(religious: boolean): Promise<SessionContext | FormState> {
  if (isDemoMode) return formError('Fonction désactivée en mode démonstration.');
  const ctx = await requireOnboardedSession();
  if (religious && !ctx.religiousEnabled) return formError('Activez d’abord les fonctions de finance islamique (consentement explicite).');
  if (!ctx.canWrite) return formError('Votre rôle dans ce foyer ne permet que la lecture.');
  return ctx;
}
const isState = (v: SessionContext | FormState): v is FormState => 'status' in v;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
const done = (m: string) => { revalidatePath('/', 'layout'); return formOk(m); };

export async function saveZakatSettings(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(true); if (isState(ctx)) return ctx;
  // Cases décochées = biens et dettes que la personne ne retient pas pour sa Zakat
  const included = new Set(fd.getAll('included').map(String));
  const excludedIds = [...new Set(fd.getAll('all').map(String))].filter((id) => !included.has(id));
  const parsed = zakatSettingsSchema.safeParse({ ...formDataToObject(fd), excluded: excludedIds });
  if (!parsed.success) return formError('Vérifiez vos choix.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.hawlStart && d.hawlStart > today()) return formError('Vérifiez vos choix.', { hawlStart: 'Le début du Hawl ne peut pas être dans le futur.' });
  const { error } = await ctx.supabase.from('zakat_settings').upsert({
    household_id: ctx.householdId, owner_id: ctx.userId,
    ruleset_id: ZAKAT_RULESET.id, ruleset_version: ZAKAT_RULESET.version,
    nisab_basis: d.nisabBasis, year_basis: d.yearBasis, hawl_date: d.hawlStart,
    options: {
      personal_jewelry: d.personalJewelry, long_term_investments: d.longTermInvestments,
      long_term_ratio_per100k: d.longTermRatioPercent === null ? null : Math.round(d.longTermRatioPercent * 1000),
      locked_pensions: d.lockedPensions, debts: d.debts, excluded_source_ids: d.excluded,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'household_id,owner_id' });
  if (error) { console.error('[zakat] settings', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  return done('Choix enregistrés. Le calcul détaillé est mis à jour.');
}

export async function addMetalPrice(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(true); if (isState(ctx)) return ctx;
  const parsed = metalPriceSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez le prix saisi.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  if (d.asOf > today()) return formError('Vérifiez le prix saisi.', { asOf: 'La date du prix ne peut pas être dans le futur.' });
  const { error } = await ctx.supabase.from('zakat_metal_prices').upsert({
    household_id: ctx.householdId, owner_id: ctx.userId, symbol: d.symbol, price_per_g_cents: d.pricePerGram, as_of: d.asOf, source: d.source,
  }, { onConflict: 'household_id,owner_id,symbol,as_of' });
  if (error) { console.error('[zakat] price', error.code); return formError('Prix refusé : montant, date ou source invalide.'); }
  return done(`Prix ${d.symbol === 'XAU' ? 'de l’or' : 'de l’argent'} enregistré avec sa source.`);
}

export async function deleteMetalPrice(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(true); if (isState(ctx)) return ctx;
  const parsed = idSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Prix invalide.');
  const { error } = await ctx.supabase.from('zakat_metal_prices').delete().eq('id', parsed.data.id).eq('owner_id', ctx.userId);
  if (error) { console.error('[zakat] price delete', error.code); return formError('Suppression impossible.'); }
  return done('Prix supprimé.');
}

export async function addAsset(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(false); if (isState(ctx)) return ctx;
  const parsed = assetSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez le bien saisi.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const details: Record<string, string> = {};
  if (d.metal && d.kind === 'jewelry_personal') details.metal = d.metal;
  if (d.heldFor && d.kind === 'stocks_funds') details.held_for = d.heldFor;
  const { error } = await ctx.supabase.from('assets').insert({
    household_id: ctx.householdId, kind: d.kind, name: d.name, value_cents: d.valueCents, weight_mg: d.weightMg,
    purity_permille: d.weightMg !== null ? d.purityPermille ?? 1000 : null,
    is_accessible: d.accessible !== 'no',
    receivable_likely: d.kind === 'receivable' && d.receivableLikely ? d.receivableLikely === 'yes' : null,
    details, valued_on: today(),
  });
  if (error) { console.error('[zakat] asset', error.code); return formError('Enregistrement impossible.'); }
  return done('Bien ajouté au patrimoine du foyer.');
}

export async function deleteAsset(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(false); if (isState(ctx)) return ctx;
  const parsed = idSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Bien invalide.');
  const { error } = await ctx.supabase.from('assets').delete().eq('id', parsed.data.id).eq('household_id', ctx.householdId);
  if (error) { console.error('[zakat] asset delete', error.code); return formError('Suppression impossible.'); }
  return done('Bien supprimé.');
}

export async function addLiability(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(false); if (isState(ctx)) return ctx;
  const parsed = liabilitySchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez la dette saisie.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { error } = await ctx.supabase.from('liabilities').insert({
    household_id: ctx.householdId, kind: d.kind, name: d.name, outstanding_cents: d.outstanding, due_12m_cents: d.due12m,
  });
  if (error) { console.error('[zakat] liability', error.code); return formError('Enregistrement impossible.'); }
  return done('Dette ajoutée.');
}

export async function deleteLiability(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(false); if (isState(ctx)) return ctx;
  const parsed = idSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Dette invalide.');
  const { error } = await ctx.supabase.from('liabilities').delete().eq('id', parsed.data.id).eq('household_id', ctx.householdId);
  if (error) { console.error('[zakat] liability delete', error.code); return formError('Suppression impossible.'); }
  return done('Dette supprimée.');
}

/**
 * Enregistre un calcul figé. Le serveur refait tout le calcul à partir de la base :
 * aucune valeur venant du navigateur n'entre dans le résultat.
 */
export async function saveZakatCalculation(_p: FormState, _fd: FormData): Promise<FormState> {
  const ctx = await context(true); if (isState(ctx)) return ctx;
  const data = await getHouseholdData();
  const prepared = prepareZakat({ asOf: data.asOf, currency: 'EUR', choices: data.zakat.choices, assets: data.assets, liabilities: data.liabilities, prices: data.prices });
  if (!prepared.input) {
    return formError(`Choix à compléter avant d’enregistrer : ${prepared.missing.map((k) => CHOICE_TEXT[k].legend.toLowerCase()).join(', ')}.`);
  }
  const result = calculateZakat(prepared.input);
  const priceSource = (p: unknown) => (p && typeof p === 'object' && 'source' in p ? String((p as { source: string }).source) : null);
  const inputs: StoredInputs = {
    engineInput: prepared.input, notApplicable: prepared.notApplicable, excludedSourceIds: prepared.excludedSourceIds,
    priceSources: { gold: priceSource(data.prices.gold), silver: priceSource(data.prices.silver) },
  };
  const { error } = await ctx.supabase.from('zakat_calculations').insert({
    household_id: ctx.householdId, ruleset_id: result.rulesetId, ruleset_version: result.rulesetVersion,
    engine_version: result.engineVersion, as_of: result.asOf, inputs, result,
    zakatable_cents: result.netZakatableCents, nisab_cents: result.nisabCents, zakat_due_cents: result.dueCents,
    is_above_nisab: result.isAboveNisab, status: result.status, pending_reasons: result.pendingReasons, currency: 'EUR',
  });
  if (error) { console.error('[zakat] save', error.code); return formError('Enregistrement impossible. Réessayez.'); }
  return done('Calcul enregistré : il est figé et reproductible à partir de ses entrées.');
}

export async function createFitr(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(true); if (isState(ctx)) return ctx;
  const parsed = fitrSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Vérifiez les informations saisies.', fieldErrorsOf(parsed.error));
  const d = parsed.data;
  const { error } = await ctx.supabase.from('zakat_fitr_obligations').insert({
    household_id: ctx.householdId, civil_year: d.civilYear, persons: d.persons, amount_per_person_cents: d.amountPerPerson, amount_source: d.source,
  });
  if (error) {
    console.error('[zakat] fitr', error.code);
    return formError(error.code === '23505' ? `Une Zakat al-Fitr est déjà enregistrée pour l’année civile ${d.civilYear} : supprimez-la pour la ressaisir.` : 'Enregistrement impossible.');
  }
  return done(`Zakat al-Fitr de l’année civile ${d.civilYear} enregistrée : ${d.persons} personne(s).`);
}

export async function deleteFitr(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await context(true); if (isState(ctx)) return ctx;
  const parsed = idSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return formError('Élément invalide.');
  const { error } = await ctx.supabase.from('zakat_fitr_obligations').delete().eq('id', parsed.data.id).eq('owner_id', ctx.userId);
  if (error) { console.error('[zakat] fitr delete', error.code); return formError('Suppression impossible.'); }
  return done('Zakat al-Fitr supprimée. Les dons déjà enregistrés sont conservés, sans affectation.');
}
