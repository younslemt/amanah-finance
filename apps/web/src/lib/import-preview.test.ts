import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { previewCsvImport } from '@amanah/banking';
import { checkCsvFile, checkCsvText, decodeResult, encodeResult, isProfileId, previewView, PROFILE_OPTIONS } from './import-preview.ts';

const csv = readFileSync(new URL('../../e2e-live/fixtures/releve-fictif-generique-be.csv', import.meta.url), 'utf8');
const rules = [{ pattern: 'INTERET', categorySlug: 'interets', direction: 'credit' as const, priority: 10 }];

describe('aperçu d’import', () => {
  it('compte lignes lues, à importer, doublons, erreurs et intérêts', () => {
    const first = previewCsvImport(csv, 'generic_be', rules);
    const v = previewView(first, (s) => s.toUpperCase());
    expect(v.counts).toEqual({ read: 9, toImport: 8, duplicates: 0, errors: 1, interest: 2 });
    expect(v.rows[0].bookedOn <= v.rows[v.rows.length - 1].bookedOn).toBe(true);
    const again = previewView(previewCsvImport(csv, 'generic_be', rules, new Set(first.toInsert.map((t) => t.dedupeHash))), (s) => s);
    expect(again.counts).toMatchObject({ toImport: 0, duplicates: 8 });
    expect(again.rows.every((r) => r.status === 'duplicate')).toBe(true);
  });
  it('limite l’affichage sans perdre le décompte', () => {
    const v = previewView(previewCsvImport(csv, 'generic_be', rules), (s) => s, 3);
    expect(v.rows).toHaveLength(3);
    expect(v.hiddenRows).toBe(5);
  });
  it('contrôle le fichier avant lecture', () => {
    expect(checkCsvFile(null)).toContain('Choisissez');
    expect(checkCsvFile({ name: 'releve.pdf', size: 10 })).toContain('CSV');
    expect(checkCsvFile({ name: 'releve.csv', size: 600 * 1024 })).toContain('volumineux');
    expect(checkCsvFile({ name: 'releve.CSV', size: 1000 })).toBeNull();
    expect(checkCsvText('Date;Montant;Libellé\n')).toContain('aucune opération');
    expect(checkCsvText(csv)).toBeNull();
  });
  it('n’accepte que des profils connus', () => {
    expect(PROFILE_OPTIONS.map((p) => p.id)).toContain('generic_be');
    expect(isProfileId('generic_be')).toBe(true);
    expect(isProfileId('__proto__')).toBe(false);
  });
  it('résume le résultat par des nombres uniquement', () => {
    expect(encodeResult({ imported: 8, duplicates: 1, interest: 2, purification_items: 2 })).toBe('8-1-2-2');
    expect(decodeResult('8-1-2-2')).toEqual({ imported: 8, duplicates: 1, interest: 2, purification: 2 });
    expect(decodeResult('<script>')).toBeNull();
  });
});
