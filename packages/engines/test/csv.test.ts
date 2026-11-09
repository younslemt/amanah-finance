import { describe, expect, it } from 'vitest';
import { CSV_PROFILES, parseBankCsv, splitCsvRecords } from '../src/index.ts';

describe('import CSV', () => {
  it('respecte les guillemets, le BOM et les fins de ligne Windows', () => {
    const recs = splitCsvRecords('﻿a;"b;c";"d ""e"""\r\n1;2;3\r\n', ';');
    expect(recs).toEqual([['a', 'b;c', 'd "e"'], ['1', '2', '3']]);
  });

  it('lit un export belge générique', () => {
    const csv = [
      'Date;Montant;Libellé;Contrepartie;Compte contrepartie;Devise',
      '01/10/2026;2.500,00;"Salaire octobre; ACME";ACME SA;BE68 5390 0754 7034;EUR',
      '02/10/2026;-950,00;Loyer;Propriétaire;BE71 0961 2345 6769;EUR',
      '31/10/2026;12,34;Intérêt de base;;;EUR',
      '32/10/2026;-1,00;Date fausse;;;EUR',
      '03/10/2026;abc;Montant faux;;;EUR',
    ].join('\n');
    const { rows, errors } = parseBankCsv(csv, CSV_PROFILES.generic_be);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ bookedOn: '2026-10-01', amountCents: 250_000, description: 'Salaire octobre; ACME', counterpartyIbanLast4: '7034' });
    expect(rows[1].amountCents).toBe(-95_000);
    expect(errors.map((e) => e.line)).toEqual([5, 6]);
  });

  it('gère les colonnes Débit et Crédit séparées', () => {
    const csv = 'Date;Débit;Crédit;Description;Communication;Nom contrepartie;Compte contrepartie\n05/10/2026;42,10;;Paiement;DELHAIZE;;\n06/10/2026;;100,00;Virement;Remboursement;Ali;\n';
    const { rows, errors } = parseBankCsv(csv, CSV_PROFILES.split_debit_credit_be);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.amountCents)).toEqual([-4_210, 10_000]);
    expect(rows[0].description).toBe('Paiement — DELHAIZE');
  });

  it('signale les colonnes manquantes au lieu d’importer à moitié', () => {
    const { rows, errors } = parseBankCsv('Date;Montant\n01/10/2026;1,00', CSV_PROFILES.generic_be);
    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('Libellé');
  });
});
