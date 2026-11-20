import { describe, expect, it } from 'vitest';
import { planReview, purificationSummary, purificationViews, type PurificationRow } from './purification-review.ts';

const row = (over: Partial<PurificationRow> = {}): PurificationRow => ({
  id: 'p1', owner_id: 'u1', transaction_id: 't1', source_kind: 'bank_interest', credited_cents: 1234, gross_cents: null,
  withholding_tax_cents: null, basis: null, amount_to_purify_cents: null, status: 'detected', occurred_on: '2026-10-31',
  detection_reason: 'marker:INTERETS', contribution_id: null, transactions: { description: 'INTERETS CREDITEURS' }, ...over,
});

describe('décisions de purification', () => {
  it('sans méthodologie, la confirmation laisse le montant à déterminer', () => {
    const r = planReview(row(), 'confirm', { gross: null, withholding: null }, null);
    expect(r).toEqual({ ok: true, update: { status: 'confirmed', gross_cents: null, withholding_tax_cents: null, basis: null, basis_source: null, amount_to_purify_cents: null } });
  });
  it('base nette : montant = net crédité', () => {
    const r = planReview(row(), 'confirm', { gross: null, withholding: null }, 'net_credited');
    expect(r.ok && r.update).toMatchObject({ basis: 'net_credited', basis_source: 'user_choice', amount_to_purify_cents: 1234 });
  });
  it('base brute : le précompte saisi donne le brut (brut = net + précompte)', () => {
    const r = planReview(row(), 'confirm', { gross: null, withholding: 529 }, 'gross');
    expect(r.ok && r.update).toMatchObject({ gross_cents: 1763, withholding_tax_cents: 529, amount_to_purify_cents: 1763, basis: 'gross' });
  });
  it('base brute sans brut connu : à déterminer', () => {
    const r = planReview(row(), 'confirm', { gross: null, withholding: null }, 'gross');
    expect(r.ok && r.update.amount_to_purify_cents).toBeNull();
  });
  it('refuse des montants incohérents (brut inférieur au net)', () => {
    expect(planReview(row(), 'confirm', { gross: 1000, withholding: null }, 'gross')).toMatchObject({ ok: false });
  });
  it('refuse les transitions interdites et protège un élément purifié', () => {
    expect(planReview(row({ status: 'rejected' }), 'confirm', { gross: null, withholding: null }, null)).toMatchObject({ ok: false });
    expect(planReview(row({ status: 'purified' }), 'unconfirm', { gross: null, withholding: null }, null)).toMatchObject({ ok: false });
    expect(planReview(row({ status: 'rejected' }), 'restore', { gross: null, withholding: null }, null)).toMatchObject({ ok: true });
  });
  it('un rejet efface base et montant mais conserve les montants saisis', () => {
    const r = planReview(row({ status: 'confirmed', gross_cents: 1763, withholding_tax_cents: 529, basis: 'gross', amount_to_purify_cents: 1763 }), 'reject', { gross: null, withholding: null }, 'gross');
    expect(r.ok && r.update).toEqual({ status: 'rejected', gross_cents: 1763, withholding_tax_cents: 529, basis: null, basis_source: null, amount_to_purify_cents: null });
  });
});

describe('vue et synthèse', () => {
  it('montre un montant indicatif selon la méthodologie et la raison d’attente', () => {
    const [a] = purificationViews([row()], null, 'u1');
    expect(a).toMatchObject({ previewCents: null, pendingReason: 'basis_not_chosen', mine: true, label: 'INTERETS CREDITEURS' });
    const [b] = purificationViews([row()], 'net_credited', 'u2');
    expect(b).toMatchObject({ previewCents: 1234, mine: false });
  });
  it('sépare détecté, à déterminer, à purifier, purifié et écarté', () => {
    const s = purificationSummary([
      row({ id: 'a' }),
      row({ id: 'b', status: 'confirmed' }),
      row({ id: 'c', status: 'confirmed', basis: 'net_credited', amount_to_purify_cents: 500, credited_cents: 500 }),
      row({ id: 'd', status: 'purified', basis: 'net_credited', amount_to_purify_cents: '700', credited_cents: 700 }),
      row({ id: 'e', status: 'rejected', credited_cents: 99 }),
    ]);
    expect(s).toEqual({ detectedCreditedCents: 1234, toPurifyCents: 500, toDetermineCount: 1, toDetermineCreditedCents: 1234, purifiedCents: 700, rejectedCreditedCents: 99 });
  });
});
