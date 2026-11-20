import 'server-only';
import { decodeCsvBytes, detectCsvProfile, previewCsvImport, type ImportPreview } from '@amanah/banking';
import type { CategorizationRule } from '@amanah/engines';
import type { SessionContext } from './session.ts';
import { checkCsvText, isProfileId, type ProfileId } from '../import-preview.ts';

/**
 * Prépare un import pour le foyer de la session : règles de catégorisation (système et
 * foyer), empreintes déjà présentes sur le compte, puis pipeline @amanah/banking.
 * Rien n'est écrit. Le texte du fichier n'est jamais conservé.
 */
export async function prepareImport(ctx: SessionContext, input: { accountId: string; profile: string; text: string }):
  Promise<{ ok: true; preview: ImportPreview; profile: ProfileId } | { ok: false; message: string; field?: string }> {
  const textError = checkCsvText(input.text);
  if (textError) return { ok: false, message: textError, field: 'file' };

  const { data: account } = await ctx.supabase.from('accounts').select('id').eq('id', input.accountId).eq('household_id', ctx.householdId).maybeSingle();
  if (!account) return { ok: false, message: 'Choisissez un de vos comptes.', field: 'accountId' };

  const profile = input.profile === 'auto' ? detectCsvProfile(input.text) : (isProfileId(input.profile) ? input.profile : null);
  if (!profile) return { ok: false, message: 'Format du fichier non reconnu : choisissez le format correspondant à votre banque.', field: 'profile' };

  const { data: ruleRows, error: rErr } = await ctx.supabase.from('categorization_rules').select('pattern, category_slug, direction, priority');
  if (rErr) throw rErr;
  const rules: CategorizationRule[] = (ruleRows ?? []).map((r) => ({
    pattern: r.pattern as string, categorySlug: r.category_slug as string,
    direction: (r.direction as 'credit' | 'debit' | null) ?? undefined, priority: r.priority as number,
  }));

  // Première lecture pour connaître la période, puis empreintes existantes sur cette période
  const draft = previewCsvImport(input.text, profile, rules);
  const dates = draft.toInsert.map((t) => t.bookedOn).sort();
  const existing = new Set<string>();
  if (dates.length) {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await ctx.supabase.from('transactions').select('dedupe_hash')
        .eq('account_id', input.accountId).gte('booked_on', dates[0]).lte('booked_on', dates[dates.length - 1])
        .order('id').range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data ?? []) existing.add(r.dedupe_hash as string);
      if (!data || data.length < PAGE) break;
    }
  }
  return { ok: true, preview: existing.size ? previewCsvImport(input.text, profile, rules, existing) : draft, profile };
}

export async function readCsvFile(file: File): Promise<string> {
  return decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
}
