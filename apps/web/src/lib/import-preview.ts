/**
 * Aperçu d'un import bancaire : fonctions pures (sans Supabase), testées seules.
 * Le pipeline (lecture, empreintes, doublons, catégories, intérêts) vient de
 * @amanah/banking ; ce module ne fait que le présenter et le contrôler.
 */
import { CSV_PROFILES } from '@amanah/engines';
import { IMPORT_LIMITS, type ImportPreview } from '@amanah/banking';

export type ProfileId = keyof typeof CSV_PROFILES;
export const PROFILE_OPTIONS = Object.values(CSV_PROFILES).map((p) => ({ id: p.id as ProfileId, label: p.label }));
export const isProfileId = (v: unknown): v is ProfileId => typeof v === 'string' && Object.hasOwn(CSV_PROFILES, v);

export interface PreviewRow {
  bookedOn: string;
  description: string;
  amountCents: number;
  category: string;
  status: 'new' | 'duplicate';
  interest: 'bank_interest' | 'loyalty_bonus' | 'dividend_impure_share' | 'manual' | null;
}

export interface PreviewView {
  rows: PreviewRow[];
  /** Lignes non affichées (aperçu limité). */
  hiddenRows: number;
  errors: Array<{ line: number; message: string }>;
  counts: { read: number; toImport: number; duplicates: number; errors: number; interest: number };
}

export const PREVIEW_DISPLAY_LIMIT = 200;

export function previewView(p: ImportPreview, label: (slug: string) => string, limit = PREVIEW_DISPLAY_LIMIT): PreviewView {
  const all: PreviewRow[] = [
    ...p.toInsert.map((t) => ({ t, status: 'new' as const })),
    ...p.duplicates.map((t) => ({ t, status: 'duplicate' as const })),
  ].sort((a, b) => (a.t.bookedOn < b.t.bookedOn ? -1 : a.t.bookedOn > b.t.bookedOn ? 1 : 0))
    .map(({ t, status }) => ({
      bookedOn: t.bookedOn, description: t.description, amountCents: t.amountCents,
      category: label(t.categorySlug), status, interest: t.interest?.kind ?? null,
    }));
  return {
    rows: all.slice(0, limit),
    hiddenRows: Math.max(0, all.length - limit),
    errors: p.errors.slice(0, 50),
    counts: {
      read: p.toInsert.length + p.duplicates.length + p.errors.length,
      toImport: p.toInsert.length,
      duplicates: p.duplicates.length,
      errors: p.errors.length,
      interest: p.toInsert.filter((t) => t.interest).length,
    },
  };
}

/** Contrôles du fichier avant lecture. Renvoie un message d'erreur, ou null si le fichier est acceptable. */
export function checkCsvFile(file: { name: string; size: number } | null): string | null {
  if (!file || file.size === 0) return 'Choisissez un fichier CSV.';
  if (!/\.(csv|txt)$/i.test(file.name)) return 'Le fichier doit être un export CSV (.csv).';
  if (file.size > IMPORT_LIMITS.maxBytes) return `Fichier trop volumineux (maximum ${Math.round(IMPORT_LIMITS.maxBytes / 1024)} Ko).`;
  return null;
}

export function checkCsvText(text: string): string | null {
  if (text.length > IMPORT_LIMITS.maxBytes * 2) return 'Fichier trop volumineux.';
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '').length;
  if (lines < 2) return 'Le fichier ne contient aucune opération.';
  if (lines - 1 > IMPORT_LIMITS.maxRows) return `Trop d’opérations dans un seul fichier (maximum ${IMPORT_LIMITS.maxRows}).`;
  return null;
}

/** Résumé passé dans l'adresse après l'import (uniquement des nombres). */
export function encodeResult(r: { imported: number; duplicates: number; interest: number; purification_items: number }): string {
  return [r.imported, r.duplicates, r.interest, r.purification_items].map((n) => Math.max(0, Math.trunc(n))).join('-');
}
export function decodeResult(v: string | undefined): { imported: number; duplicates: number; interest: number; purification: number } | null {
  const m = /^(\d{1,5})-(\d{1,5})-(\d{1,5})-(\d{1,5})$/.exec(v ?? '');
  if (!m) return null;
  const [imported, duplicates, interest, purification] = m.slice(1).map(Number);
  return { imported, duplicates, interest, purification };
}
