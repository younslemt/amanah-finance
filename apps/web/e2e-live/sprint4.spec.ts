import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { activateIslamicFinance, apiToken, completeOnboarding, euros, fakeUser, latestLink, rest, signIn, signUpAndConfirm } from './helpers';

/**
 * Sprint 4 en mode réel, sur mobile et ordinateur : Zakat personnalisée (choix explicites,
 * prix saisi avec source, calcul figé et reproductible), Zakat al-Fitr séparée, dons
 * déclarés puis vérifiés par une opération importée, garde contre le double comptage,
 * isolation entre foyers. Utilisateurs, montants et relevés FICTIFS ; aucun paiement.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

function debitStatement(): string {
  const d = new Date(Date.now() - 2 * 86_400_000);
  const date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const dir = mkdtempSync(join(tmpdir(), 'amanah-s4-'));
  const file = join(dir, 'releve-fictif-don.csv');
  writeFileSync(file, `Date;Montant;Libellé;Contrepartie;Compte contrepartie;Devise\n${date};-50,00;VIREMENT ASSOCIATION FICTIVE;Association Fictive;;EUR\n`, 'utf8');
  return file;
}

test.describe.serial('Sprint 4 — dons, Sadaqah et Zakat personnalisée', () => {
  let G: ReturnType<typeof fakeUser>;
  let H: ReturnType<typeof fakeUser>;

  test.beforeAll(({}, info) => {
    G = fakeUser('a', `s4g-${info.project.name}`);
    H = fakeUser('b', `s4h-${info.project.name}`);
  });

  test('dons fermés sans consentement article 9, ouverts après activation', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, G);
    await page.goto(await latestLink(G.email, 'signup', sentAt));
    await completeOnboarding(page, G.name);
    await page.goto('/dons');
    await expect(page.getByTestId('lien-activer-finance-islamique')).toBeVisible();
    await expect(page.getByTestId('form-don')).toHaveCount(0);
    await activateIslamicFinance(page, '/dons');
    await expect(page.getByTestId('form-don')).toBeVisible();
  });

  test('Zakat : aucun choix imposé, prix avec source, calcul détaillé, figé et reproductible', async ({ page }) => {
    await signIn(page, G);
    await page.goto('/comptes');
    await page.getByLabel('Nom du compte').fill('Compte courant fictif');
    await page.getByLabel('Type').selectOption('current');
    await page.getByLabel('Solde de départ (€)').fill('10000');
    await page.getByRole('button', { name: 'Ajouter le compte' }).click();
    await expect(page.getByTestId('liste-comptes')).toContainText('Compte courant fictif');

    await page.goto('/zakat');
    // Rien n'est choisi à la place de la personne : le calcul attend l'année de référence
    await expect(page.getByTestId('zakat-choix-manquants')).toContainText('Année de référence');
    await expect(page.getByTestId('form-enregistrer-calcul')).toHaveCount(0);
    const settings = page.getByTestId('form-reglages-zakat');
    await expect(settings.getByRole('radio', { checked: true })).toHaveCount(0);

    const price = page.getByTestId('form-prix');
    await price.getByLabel('Métal').selectOption('XAG');
    await price.getByLabel('Prix par gramme de métal fin (€)').fill('1,30');
    await price.getByLabel('Source').fill('Cotation fictive de test');
    await price.getByRole('button', { name: 'Enregistrer le prix' }).click();
    await expect(page.getByTestId('prix-metaux')).toContainText('Cotation fictive de test');

    await settings.getByLabel('Argent (595 g de métal fin)').check();
    await settings.getByLabel('Année lunaire (354 jours, 2,5 %)').check();
    await settings.getByLabel('Début de votre année de possession (Hawl)').fill(daysAgo(400));
    await settings.getByRole('button', { name: 'Enregistrer mes choix' }).click();

    await expect(page.getByTestId('zakat-statut')).toContainText('Exigible selon le référentiel indiqué');
    await expect(page.getByTestId('zakat-lignes')).toContainText('Compte courant fictif');
    await page.getByTestId('form-enregistrer-calcul').getByRole('button', { name: 'Enregistrer ce calcul' }).click();
    const calc = page.getByTestId('calcul-zakat').first();
    await expect(calc).toContainText('Reproduit à l’identique');
    await expect(calc).toContainText(euros('250,00 €'));
    await expect(calc).toContainText('amanah-zakat 1.0.0');
  });

  test('Zakat al-Fitr séparée, montant et source choisis par la personne', async ({ page }) => {
    await signIn(page, G);
    await page.goto('/zakat/al-fitr');
    const form = page.getByTestId('form-fitr');
    await form.getByLabel('Nombre de personnes').fill('4');
    await form.getByLabel('Montant par personne (€)').fill('10,00');
    await form.getByLabel('Source du montant').fill('Montant fictif communiqué par une mosquée');
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('liste-fitr')).toContainText(euros('40,00 €'));
  });

  test('dons : affectations, totaux, vérification bancaire, aucune purification ressaisie', async ({ page }) => {
    await signIn(page, G);
    await page.goto('/dons');
    const form = page.getByTestId('form-don');
    let declared = 0;
    const declare = async (kind: string, amount: string, beneficiary: string, calc: 'first' | '', fitr: 'first' | '') => {
      await form.getByLabel('Type').selectOption(kind);
      await form.getByLabel('Montant (€)').fill(amount);
      await form.getByLabel('Bénéficiaire').fill(beneficiary);
      await form.getByLabel(/Affecter à un calcul de Zakat/).selectOption(calc === 'first' ? { index: 1 } : '');
      await form.getByLabel(/Affecter à une Zakat al-Fitr/).selectOption(fitr === 'first' ? { index: 1 } : '');
      await form.getByRole('button', { name: 'Enregistrer le don' }).click();
      declared += 1;
      await expect(page.getByTestId('don')).toHaveCount(declared);
    };
    await declare('zakat', '250,00', 'Association fictive', 'first', '');
    await declare('zakat_al_fitr', '40,00', 'Mosquée fictive', '', 'first');
    await declare('sadaqah', '50,00', 'Association fictive', '', '');

    await expect(page.getByTestId('synthese-dons')).toContainText(euros('340,00 €'));
    await expect(page.getByTestId('suivi-zakat')).toContainText(euros('reste 0,00 €'));
    await expect(page.getByTestId('suivi-fitr')).toContainText(euros('reste 0,00 €'));
    await expect(page.getByTestId('don').filter({ hasText: 'Sadaqah' }).getByText('Déclaré', { exact: true })).toBeVisible();

    // Une opération importée prouve le don : il devient « vérifié »
    await page.goto('/import');
    await page.getByLabel('Compte concerné').selectOption({ label: 'Compte courant fictif' });
    await page.getByLabel('Relevé CSV').setInputFiles(debitStatement());
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await page.getByTestId('form-confirmer-import').getByRole('button', { name: /Importer 1 opération/ }).click();
    await expect(page.getByTestId('resultat-import')).toContainText('1 opération(s) importée(s)');
    await page.goto('/dons');
    const sadaqah = page.getByTestId('don').filter({ hasText: 'Sadaqah' });
    await sadaqah.getByTestId('form-verifier-don').getByRole('button').click();
    await expect(page.getByTestId('don').filter({ hasText: 'Sadaqah' }).getByText('Vérifié (opération bancaire)')).toBeVisible();

    const token = await apiToken(G);
    const rows = (await (await rest(token, 'contributions?select=kind,transaction_id')).json()) as Array<{ kind: string; transaction_id: string | null }>;
    expect(rows.map((r) => `${r.kind}:${r.transaction_id !== null}`).sort()).toEqual(['sadaqah:true', 'zakat:false', 'zakat_al_fitr:false']);
    // Double comptage impossible : une purification ne se saisit pas comme un don
    const [{ id: hid }] = (await (await rest(token, 'households?select=id')).json()) as Array<{ id: string }>;
    const forged = await rest(token, 'contributions', { method: 'POST', body: JSON.stringify({ household_id: hid, kind: 'purification', amount_cents: 100, paid_on: daysAgo(1), beneficiary_label: 'Organisme fictif' }) });
    expect(forged.ok).toBe(false);
  });

  test('isolation : un autre foyer ne voit ni ne modifie rien', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, H);
    await page.goto(await latestLink(H.email, 'signup', sentAt));
    await completeOnboarding(page, H.name);
    await activateIslamicFinance(page, '/dons');
    const tokenG = await apiToken(G);
    const [{ id: hidG }] = (await (await rest(tokenG, 'households?select=id')).json()) as Array<{ id: string }>;
    const tokenH = await apiToken(H);
    for (const table of ['contributions', 'zakat_fitr_obligations', 'zakat_metal_prices', 'zakat_calculations', 'zakat_settings']) {
      expect(await (await rest(tokenH, `${table}?select=household_id&household_id=eq.${hidG}`)).json()).toEqual([]);
    }
    const write = await rest(tokenH, 'zakat_fitr_obligations', { method: 'POST', body: JSON.stringify({ household_id: hidG, year: 2026, persons: 1, amount_per_person_cents: 100, amount_source: 'Source fictive' }) });
    expect(write.ok).toBe(false);
  });
});
