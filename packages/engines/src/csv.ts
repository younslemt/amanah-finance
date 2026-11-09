import { parseAmountToCents, type Cents } from './money.ts';
import { toIsoDate, type IsoDate } from './dates.ts';

/**
 * Import CSV piloté par profils. Les profils de départ décrivent des exports
 * bancaires belges courants ; ils doivent être validés sur de vrais fichiers.
 */
export interface CsvProfile {
  id: string;
  label: string;
  delimiter: ';' | ',' | '\t';
  decimalSeparator: ',' | '.';
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'DD.MM.YYYY';
  /** Lignes à ignorer avant l'en-tête. */
  skipLines: number;
  columns: {
    date: string;
    amount?: string;
    debit?: string; // si débit et crédit sont séparés
    credit?: string;
    description: string[];
    counterpartyName?: string;
    counterpartyAccount?: string;
    currency?: string;
  };
}

export interface ParsedRow {
  line: number;
  bookedOn: IsoDate;
  amountCents: Cents;
  currency: string;
  description: string;
  counterpartyName?: string;
  counterpartyIbanLast4?: string;
}

export interface CsvError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ParsedRow[];
  errors: CsvError[];
}

export const CSV_PROFILES: Record<string, CsvProfile> = {
  generic_be: {
    id: 'generic_be',
    label: 'Format belge générique (date, montant, libellé)',
    delimiter: ';',
    decimalSeparator: ',',
    dateFormat: 'DD/MM/YYYY',
    skipLines: 0,
    columns: { date: 'Date', amount: 'Montant', description: ['Libellé'], counterpartyName: 'Contrepartie', counterpartyAccount: 'Compte contrepartie', currency: 'Devise' },
  },
  generic_iso: {
    id: 'generic_iso',
    label: 'Format international (AAAA-MM-JJ, point décimal)',
    delimiter: ',',
    decimalSeparator: '.',
    dateFormat: 'YYYY-MM-DD',
    skipLines: 0,
    columns: { date: 'date', amount: 'amount', description: ['description'], counterpartyName: 'counterparty', currency: 'currency' },
  },
  split_debit_credit_be: {
    id: 'split_debit_credit_be',
    label: 'Export belge avec colonnes Débit et Crédit séparées',
    delimiter: ';',
    decimalSeparator: ',',
    dateFormat: 'DD/MM/YYYY',
    skipLines: 0,
    columns: { date: 'Date', debit: 'Débit', credit: 'Crédit', description: ['Description', 'Communication'], counterpartyName: 'Nom contrepartie', counterpartyAccount: 'Compte contrepartie' },
  },
};

/** Découpe une ligne CSV en respectant les guillemets doubles (RFC 4180). */
export function splitCsvRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) { record.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      record.push(field); field = '';
      records.push(record); record = [];
    } else field += ch;
  }
  if (field !== '' || record.length > 0) { record.push(field); records.push(record); }
  return records.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseDate(raw: string, format: CsvProfile['dateFormat']): IsoDate {
  const v = raw.trim();
  const parts = format === 'YYYY-MM-DD' ? v.split('-') : v.split(/[/.-]/);
  if (parts.length !== 3) throw new SyntaxError(`date illisible : « ${raw} »`);
  const [a, b, c] = parts.map(Number);
  return format === 'YYYY-MM-DD' ? toIsoDate(a, b, c) : toIsoDate(c, b, a);
}

const last4 = (account?: string) => {
  const compact = (account ?? '').replace(/\s/g, '').toUpperCase();
  return compact.length >= 4 ? compact.slice(-4) : undefined;
};

export function parseBankCsv(text: string, profile: CsvProfile, defaultCurrency = 'EUR'): CsvParseResult {
  const records = splitCsvRecords(text, profile.delimiter).slice(profile.skipLines);
  const errors: CsvError[] = [];
  const rows: ParsedRow[] = [];
  if (records.length === 0) return { rows, errors: [{ line: 0, message: 'fichier vide' }] };

  const header = records[0].map((h) => h.trim());
  const idx = (name?: string) => (name ? header.indexOf(name) : -1);
  const required = [profile.columns.date, ...profile.columns.description];
  const missing = required.filter((c) => idx(c) < 0);
  if (!profile.columns.amount && !(profile.columns.debit && profile.columns.credit)) missing.push('montant');
  if (profile.columns.amount && idx(profile.columns.amount) < 0) missing.push(profile.columns.amount);
  if (missing.length) return { rows, errors: [{ line: 1 + profile.skipLines, message: `colonnes absentes : ${missing.join(', ')}` }] };

  records.slice(1).forEach((rec, i) => {
    const line = i + 2 + profile.skipLines;
    const cell = (name?: string) => { const j = idx(name); return j >= 0 ? (rec[j] ?? '').trim() : ''; };
    try {
      let amount: Cents;
      if (profile.columns.amount) {
        amount = parseAmountToCents(cell(profile.columns.amount), profile.decimalSeparator);
      } else {
        const debit = cell(profile.columns.debit);
        const credit = cell(profile.columns.credit);
        amount = credit ? Math.abs(parseAmountToCents(credit, profile.decimalSeparator)) : -Math.abs(parseAmountToCents(debit, profile.decimalSeparator));
      }
      if (amount === 0) throw new RangeError('montant nul');
      const description = profile.columns.description.map(cell).filter(Boolean).join(' — ');
      rows.push({
        line,
        bookedOn: parseDate(cell(profile.columns.date), profile.dateFormat),
        amountCents: amount,
        currency: cell(profile.columns.currency) || defaultCurrency,
        description,
        counterpartyName: cell(profile.columns.counterpartyName) || undefined,
        counterpartyIbanLast4: last4(cell(profile.columns.counterpartyAccount)),
      });
    } catch (e) {
      errors.push({ line, message: e instanceof Error ? e.message : String(e) });
    }
  });
  return { rows, errors };
}
