import { expect, test } from '@playwright/test';
import { activateIslamicFinance, completeOnboarding, fakeUser, latestLink, signUpAndConfirm } from './helpers';

/**
 * Accueil Islamic-first en mode réel (Supabase local), mobile et ordinateur. Utilisateur et montants
 * FICTIFS. Vérifie : aucune donnée religieuse sans consentement (rendu serveur), contenu pédagogique,
 * préférence d'affichage privée et persistante, indépendante du consentement, Zakat incomplète jamais
 * présentée comme établie, et retour à l'affichage sans données religieuses après retrait.
 */
const ISLAMIC = ['situation', 'engagements', 'projets', 'calendrier', 'patrimoine', 'actions'];
const ANALYTIC = ['situation', 'actions', 'projets', 'patrimoine', 'calendrier', 'engagements'];
const WIDTHS = [375, 390, 430, 768, 1440] as const;

test.describe.serial('Accueil Islamic-first — mode réel', () => {
  let U: ReturnType<typeof fakeUser>;
  test.beforeAll(({}, info) => { U = fakeUser('a', `accueil-${info.project.name}`); });

  test('sans consentement, avec consentement, préférence privée, retrait', async ({ page }, info) => {
    const { sentAt } = await signUpAndConfirm(page, U);
    await page.goto(await latestLink(U.email, 'signup', sentAt));
    await completeOnboarding(page, U.name);
    await page.goto('/comptes');
    await page.getByLabel('Nom du compte').fill('Épargne fictive');
    await page.getByLabel('Type').selectOption('savings');
    await page.getByLabel('Solde de départ (€)').fill('2500');
    await page.getByRole('button', { name: 'Ajouter le compte' }).click();
    await expect(page.getByTestId('liste-comptes')).toContainText('Épargne fictive');

    // 1. Sans consentement : bloc pédagogique, aucune donnée religieuse personnelle dans le HTML rendu
    await page.goto('/dashboard');
    const home = page.getByTestId('accueil');
    await expect(home).toHaveAttribute('data-religious', 'no');
    expect(await page.locator('[data-block]').evaluateAll((e) => e.map((x) => x.getAttribute('data-block')))).toEqual(ISLAMIC);
    await expect(page.getByRole('heading', { level: 2, name: 'Finance islamique' })).toBeVisible();
    await expect(page.getByTestId('finance-islamique-pedagogique')).toBeVisible();
    await expect(page.getByTestId('dashboard-finance-islamique')).toHaveCount(0);
    const html = await page.content();
    for (const leak of ['zakat-accueil', 'purification-accueil', 'Montant restant selon vos déclarations', 'Méthode provisoire', 'a-examiner']) expect(html.includes(leak), leak).toBe(false);
    await expect(page.getByTestId('capacite-disponible')).toBeVisible();
    if (info.project.name === 'desktop') {
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`accueil-sans-consentement-${w}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // 2. Préférence d'affichage privée, enregistrée en base, indépendante du consentement
    await page.getByTestId('form-affichage').getByRole('button').click();
    await expect(home).toHaveAttribute('data-layout', 'classic');
    await page.reload();
    await expect(home).toHaveAttribute('data-layout', 'classic');
    expect(await page.locator('[data-block]').evaluateAll((e) => e.map((x) => x.getAttribute('data-block')))).toEqual(ANALYTIC);
    await expect(page.getByTestId('finance-islamique-pedagogique')).toBeVisible();

    // 3. Avec consentement : engagements, Zakat incomplète (aucun choix) jamais présentée comme établie
    await activateIslamicFinance(page, '/zakat');
    await page.goto('/dashboard');
    await expect(home).toHaveAttribute('data-religious', 'yes');
    await expect(home).toHaveAttribute('data-layout', 'classic'); // la préférence ne dépend pas du consentement
    await page.getByTestId('form-affichage').getByRole('button').click();
    await expect(home).toHaveAttribute('data-layout', 'islamic_first');
    await expect(page.getByRole('heading', { level: 2, name: 'Mes engagements' })).toBeVisible();
    const reste = page.getByTestId('zakat-accueil').getByTestId('zakat-reste');
    await expect(reste).toContainText('Montant restant selon vos déclarations');
    await expect(reste).toHaveAttribute('data-complete', 'no');
    await expect(reste).toContainText('Non déterminé tant que le calcul est incomplet');
    await expect(page.locator('[data-testid="prochaine-action"][data-kind="zakat"]')).toContainText('des choix restent à faire');
    if (info.project.name === 'desktop') {
      for (const w of [375, 1440]) {
        await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
        await page.screenshot({ path: info.outputPath(`accueil-zakat-incomplete-${w}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // 4. Retrait du consentement (données conservées) : plus aucune donnée religieuse, quelle que soit la préférence
    await page.getByTestId('form-affichage').getByRole('button').click();
    await expect(home).toHaveAttribute('data-layout', 'classic');
    await page.goto('/finance-islamique');
    const withdraw = page.getByTestId('form-retrait-finance-islamique');
    await withdraw.getByLabel(/Les conserver/).check();
    await withdraw.getByRole('button', { name: 'Retirer mon consentement' }).click();
    await expect(page).toHaveURL(/retrait=keep/);
    await page.goto('/dashboard');
    await expect(home).toHaveAttribute('data-religious', 'no');
    await expect(home).toHaveAttribute('data-layout', 'classic');
    await expect(page.getByTestId('dashboard-finance-islamique')).toHaveCount(0);
    expect((await page.content()).includes('Montant restant selon vos déclarations')).toBe(false);
  });
});
