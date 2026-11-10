'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { toImportPayload } from '@amanah/banking';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { prepareImport, readCsvFile } from '@/lib/supabase/import';
import { formError, type FormState } from '@/lib/form-state';
import { categoryLabel } from '@/lib/labels';
import { checkCsvFile, encodeResult, previewView, type PreviewView, type ProfileId } from '@/lib/import-preview';

export interface ImportState extends FormState {
  preview?: PreviewView & { csv: string; accountId: string; profile: ProfileId; fileName: string };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function writable() {
  if (isDemoMode) return formError('Import désactivé en mode démonstration.');
  const ctx = await requireOnboardedSession();
  if (!ctx.canWrite) return formError('Votre rôle dans ce foyer ne permet que la lecture.');
  return ctx;
}

/** Étape 1 : lecture et aperçu. Rien n'est écrit en base. */
export async function previewImport(_p: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await writable(); if ('status' in ctx) return ctx;
  const accountId = String(fd.get('accountId') ?? '');
  if (!uuid.test(accountId)) return formError('Vérifiez les informations saisies.', { accountId: 'Choisissez un compte.' });
  const file = fd.get('file');
  const fileError = checkCsvFile(file instanceof File ? file : null);
  if (fileError) return formError('Vérifiez le fichier.', { file: fileError });
  const f = file as File;
  const text = await readCsvFile(f);
  const prepared = await prepareImport(ctx, { accountId, profile: String(fd.get('profile') ?? 'auto'), text });
  if (!prepared.ok) return formError('Vérifiez les informations saisies.', { [prepared.field ?? 'file']: prepared.message });
  const view = previewView(prepared.preview, (slug) => categoryLabel(slug));
  if (view.counts.read === 0) return formError('Aucune opération lisible dans ce fichier.', { file: view.errors[0]?.message ?? 'Fichier vide.' });
  return { status: 'ok', preview: { ...view, csv: text, accountId, profile: prepared.profile, fileName: f.name.slice(0, 200) } };
}

/**
 * Étape 2 : confirmation. Le fichier est relu et contrôlé à nouveau sur le serveur
 * (aucune ligne préparée par le navigateur n'est acceptée), puis écrit en UNE transaction.
 */
export async function confirmImport(_p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await writable(); if ('status' in ctx) return ctx;
  const accountId = String(fd.get('accountId') ?? '');
  if (!uuid.test(accountId)) return formError('Import invalide : recommencez.');
  const prepared = await prepareImport(ctx, { accountId, profile: String(fd.get('profile') ?? ''), text: String(fd.get('csv') ?? '') });
  if (!prepared.ok) return formError(prepared.message);
  // Doublons connus inclus : la base les écarte elle-même et les compte (journal du lot exact)
  const rows = toImportPayload([...prepared.preview.toInsert, ...prepared.preview.duplicates]);
  if (prepared.preview.toInsert.length === 0) return formError('Aucune nouvelle opération à importer : toutes sont déjà enregistrées.');
  const { data, error } = await ctx.supabase.rpc('import_transactions', {
    p_household_id: ctx.householdId, p_account_id: accountId, p_source: 'csv',
    p_file_name: String(fd.get('fileName') ?? '').slice(0, 200) || null, p_profile: prepared.profile,
    p_error_count: prepared.preview.errors.length, p_rows: rows,
  });
  if (error) {
    console.error('[import] rpc', error.code);
    return formError('Import impossible : aucune opération n’a été enregistrée. Réessayez.');
  }
  const r = data as { imported: number; duplicates: number; interest: number; purification_items: number };
  revalidatePath('/', 'layout');
  redirect(`/import?resultat=${encodeResult(r)}`);
}
