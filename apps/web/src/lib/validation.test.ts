import { describe, expect, it } from 'vitest';
import {
  accountSchema, allocationSchema, amountToCents, budgetSchema, categorySchema, customCategorySlug, fieldErrorsOf,
  hajjGoalSchema, newPasswordSchema, profileSchema, signInSchema, signUpSchema, transactionSchema,
} from './validation.ts';

const uuid = '3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90';

describe('montants saisis', () => {
  it('accepte les formats belges et internationaux sans flottant', () => {
    expect(amountToCents('1 234,56')).toBe(123_456);
    expect(amountToCents('1234.56')).toBe(123_456);
    expect(amountToCents('12')).toBe(1_200);
    expect(amountToCents('0,1')).toBe(10);
  });
});

describe('authentification', () => {
  it('exige un mot de passe robuste et confirmé', () => {
    expect(signUpSchema.safeParse({ email: 'a@example.test', password: 'motdepasse1', passwordConfirm: 'motdepasse1' }).success).toBe(true);
    const short = signUpSchema.safeParse({ email: 'a@example.test', password: 'court1', passwordConfirm: 'court1' });
    expect(short.success).toBe(false);
    const noDigit = signUpSchema.safeParse({ email: 'a@example.test', password: 'motdepasseeee', passwordConfirm: 'motdepasseeee' });
    expect(noDigit.success).toBe(false);
    const mismatch = signUpSchema.safeParse({ email: 'a@example.test', password: 'motdepasse1', passwordConfirm: 'motdepasse2' });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) expect(Object.keys(fieldErrorsOf(mismatch.error))).toEqual(['passwordConfirm']);
  });
  it('normalise l’e-mail et refuse une adresse invalide', () => {
    const r = signInSchema.safeParse({ email: '  Amina@Example.TEST ', password: 'x' });
    expect(r.success && r.data.email).toBe('amina@example.test');
    expect(signInSchema.safeParse({ email: 'pas-une-adresse', password: 'x' }).success).toBe(false);
  });
  it('valide le nouveau mot de passe', () => {
    expect(newPasswordSchema.safeParse({ password: 'nouveau-mdp-9', passwordConfirm: 'nouveau-mdp-9' }).success).toBe(true);
  });
});

describe('profil et comptes', () => {
  it('valide le profil et la région', () => {
    const r = profileSchema.safeParse({ displayName: 'Amina', householdName: 'Foyer A', region: '' });
    expect(r.success && r.data.region).toBe(null);
    expect(profileSchema.safeParse({ displayName: '', householdName: 'x', region: 'BRU' }).success).toBe(false);
    expect(profileSchema.safeParse({ displayName: 'A', householdName: 'x', region: 'PARIS' }).success).toBe(false);
    const member = profileSchema.safeParse({ displayName: 'Idris', householdName: 'Foyer' });
    expect(member.success && member.data.region).toBe(null);
  });
  it('accepte un solde de départ négatif (carte de crédit) mais pas un type inconnu', () => {
    const r = accountSchema.safeParse({ name: 'Visa', type: 'credit_card', openingBalance: '-250,00' });
    expect(r.success && r.data.openingBalance).toBe(-25_000);
    expect(accountSchema.safeParse({ name: 'X', type: 'crypto', openingBalance: '0' }).success).toBe(false);
  });
});

describe('revenus, dépenses, catégories, budgets', () => {
  const base = { accountId: uuid, amount: '42,10', bookedOn: '2026-11-05', categorySlug: 'alimentation', description: 'Courses' };
  it('signe le montant selon le sens', () => {
    const exp = transactionSchema.safeParse({ ...base, direction: 'expense' });
    expect(exp.success && exp.data.amountCents).toBe(-4_210);
    const inc = transactionSchema.safeParse({ ...base, direction: 'income', categorySlug: 'salaire' });
    expect(inc.success && inc.data.amountCents).toBe(4_210);
  });
  it('refuse un montant nul, illisible ou une date inexistante', () => {
    expect(transactionSchema.safeParse({ ...base, direction: 'expense', amount: '0' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, direction: 'expense', amount: 'abc' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, direction: 'expense', bookedOn: '2026-02-30' }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...base, direction: 'expense', accountId: 'pas-un-uuid' }).success).toBe(false);
  });
  it('dérive un code de catégorie personnelle sûr', () => {
    expect(customCategorySlug('Zakât al-Fitr !')).toBe('perso-zakat-al-fitr');
    expect(customCategorySlug('***')).toBe('perso-categorie');
    expect(categorySchema.safeParse({ label: 'Voyages', kind: 'expense' }).success).toBe(true);
  });
  it('valide un budget mensuel', () => {
    const r = budgetSchema.safeParse({ categorySlug: 'alimentation', month: '2026-11', limit: '450' });
    expect(r.success && r.data.limit).toBe(45_000);
    expect(budgetSchema.safeParse({ categorySlug: 'alimentation', month: '2026-13', limit: '1' }).success).toBe(false);
  });
});

describe('objectif Hajj', () => {
  it('convertit les montants et accepte une épargne disponible vide', () => {
    const r = hajjGoalSchema.safeParse({ name: 'Hajj', target: '9 000', available: '', targetDate: '2028-05-01', monthlyCapacity: '400' });
    expect(r.success && [r.data.target, r.data.available, r.data.monthlyCapacity]).toEqual([900_000, 0, 40_000]);
  });
  it('refuse une cible nulle', () => {
    expect(hajjGoalSchema.safeParse({ name: 'Hajj', target: '0', available: '', targetDate: '2028-05-01', monthlyCapacity: '1' }).success).toBe(false);
  });
  it('valide une allocation', () => {
    expect(allocationSchema.safeParse({ goalId: uuid, direction: 'add', amount: '100' }).success).toBe(true);
  });
});
