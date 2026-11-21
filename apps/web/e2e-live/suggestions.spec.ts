import { expect, test } from '@playwright/test';
import { activateIslamicFinance, completeOnboarding, fakeUser, latestLink, signUpAndConfirm } from './helpers';

/**
 * Suggestions de projets et calendrier familial en mode réel (Supabase local), mobile et
 * ordinateur. Utilisateur et montants FICTIFS. Vérifie : aucune suggestion religieuse sans
 * consentement, préférences privées enregistrées, création depuis une suggestion, décisions,
 * calendrier du foyer, apparition des suggestions religieuses après activation volontaire.
 */
test.describe.serial('Suggestions de projets — mode réel', () => {
  let U: ReturnType<typeof fakeUser>;
  test.beforeAll(({}, info) => { U = fakeUser('a', `sug-${info.project.name}`); });

  test('préférences, suggestion acceptée, décision, calendrier ; religieux seulement après activation', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, U);
    await page.goto(await latestLink(U.email, 'signup', sentAt));
    await completeOnboarding(page, U.name);

    // Sans consentement religieux : aucune suggestion religieuse, réserve d'urgence proposée
    await page.goto('/goals');
    await expect(page.locator('[data-testid="suggestion"][data-suggestion="reserve-urgence"]')).toBeVisible();
    await expect(page.locator('[data-testid="suggestion"][data-suggestion^="ramadan"], [data-testid="suggestion"][data-suggestion^="aid-"]')).toHaveCount(0);
    // Sans déclaration, pas de suggestion liée aux enfants
    await expect(page.locator('[data-testid="suggestion"][data-suggestion^="rentree-scolaire"]')).toHaveCount(0);

    // Préférences déclarées (privées) : enfants scolarisés, intérêt pour des travaux
    await page.getByTestId('lien-preferences').click();
    const prefs = page.getByTestId('form-preferences');
    await expect(prefs.getByText('Événements religieux (fonctions religieuses activées)')).toHaveCount(0);
    await prefs.getByRole('group', { name: 'Enfants scolarisés dans le foyer' }).getByLabel('Oui').check();
    await prefs.getByRole('group', { name: 'Projets qui m’intéressent' }).getByLabel('Travaux').check();
    await prefs.getByRole('button', { name: 'Enregistrer mes préférences' }).click();
    await expect(prefs.getByRole('status')).toContainText('recalculés');

    // Création depuis une suggestion : parcours prérempli, montant choisi par la personne
    await page.goto('/goals');
    const travaux = page.locator('[data-testid="suggestion"][data-suggestion="travaux"]');
    await expect(travaux).toBeVisible();
    await travaux.getByTestId('preparer-suggestion').click();
    const form = page.getByTestId('form-objectif');
    await expect(form.getByLabel('Nom du projet')).toHaveValue('Travaux');
    await form.getByLabel('Nom du projet').fill('Travaux de salle de bain');
    await form.getByTestId('etape-suivante').click();
    await expect(form.getByLabel('Montant cible (€)')).toHaveValue('');
    await form.getByLabel('Montant cible (€)').fill('8 000');
    await form.getByTestId('etape-suivante').click();
    await form.getByLabel('Mensualité prévue (€)').fill('300');
    await form.getByRole('button', { name: 'Créer l’objectif' }).click();
    await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}\?cree=1$/, { timeout: 15_000 });
    await expect(page.getByText('Suggestion : Travaux')).toBeVisible();
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'plan');
    await page.goto('/goals');
    await expect(page.locator('[data-testid="suggestion"][data-suggestion="travaux"]')).toHaveCount(0);

    // Décision : ne plus proposer (conservée après rechargement)
    const id = await page.locator('[data-testid="suggestion"][data-statut="new"]').nth(1).getAttribute('data-suggestion');
    expect(id).toBeTruthy();
    await page.locator(`[data-testid="suggestion"][data-suggestion="${id}"]`).getByTestId('ecarter-suggestion').getByRole('button').click();
    await expect(page.locator(`[data-testid="suggestion"][data-suggestion="${id}"]`)).toHaveCount(0);
    await page.reload();
    await expect(page.locator(`[data-testid="suggestion"][data-suggestion="${id}"]`)).toHaveCount(0);

    // Calendrier du foyer : échéance personnalisée
    await page.goto('/goals/calendrier');
    await expect(page.locator('[data-testid="evenement"][data-type="ramadan"]')).toHaveCount(0);
    const add = page.getByTestId('form-evenement');
    await add.getByLabel('Libellé').fill('Assurance auto fictive');
    await add.getByLabel('Date').fill(`${new Date().getUTCFullYear() + 1}-02-10`);
    await add.getByRole('button', { name: 'Ajouter au calendrier' }).click();
    await expect(page.locator('[data-testid="evenement"][data-type="custom"]')).toContainText('Assurance auto fictive');
    // Personnel par défaut ; sans consentement, aucune case « religieux »
    await expect(page.locator('[data-testid="evenement"]', { hasText: 'Assurance auto fictive' }).getByTestId('visibilite-evenement')).toHaveAttribute('data-visibility', 'private');
    await expect(add.getByLabel(/Événement religieux/)).toHaveCount(0);
    await add.getByLabel('Libellé').fill('Anniversaire familial fictif');
    await add.getByLabel('Date').fill(`${new Date().getUTCFullYear() + 1}-03-10`);
    await add.getByLabel('Tout mon foyer (partage volontaire)').check();
    await add.getByRole('button', { name: 'Ajouter au calendrier' }).click();
    await expect(page.locator('[data-testid="evenement"]', { hasText: 'Anniversaire familial fictif' }).getByTestId('visibilite-evenement')).toHaveAttribute('data-visibility', 'household');

    // Activation volontaire des fonctions religieuses : suggestions et dates religieuses apparaissent
    await page.goto('/goals');
    await activateIslamicFinance(page, '/goals');
    await page.getByTestId('lien-preferences').click();
    const prefs2 = page.getByTestId('form-preferences');
    await prefs2.getByLabel('Événements religieux (fonctions religieuses activées)').check();
    await prefs2.getByRole('button', { name: 'Enregistrer mes préférences' }).click();
    await expect(prefs2.getByRole('status')).toContainText('recalculés');
    await page.goto('/goals/calendrier');
    await expect(page.locator('[data-testid="evenement"][data-type="ramadan"]').first()).toContainText('indicative');

    // Événement religieux : classification explicite, toujours privé, même si « foyer » est choisi
    const add2 = page.getByTestId('form-evenement');
    await add2.getByLabel('Libellé').fill('Veillée fictive');
    await add2.getByLabel('Date').fill(`${new Date().getUTCFullYear() + 1}-04-10`);
    await add2.getByLabel('Tout mon foyer (partage volontaire)').check();
    await add2.getByLabel(/Événement religieux/).check();
    await add2.getByRole('button', { name: 'Ajouter au calendrier' }).click();
    const vigil = page.locator('[data-testid="evenement"]', { hasText: 'Veillée fictive' }).getByTestId('visibilite-evenement');
    await expect(vigil).toHaveAttribute('data-religious', 'yes');
    await expect(vigil).toHaveAttribute('data-visibility', 'private');

    // Retrait du consentement avec effacement : l'événement religieux disparaît, les autres restent
    await page.goto('/finance-islamique');
    const withdraw = page.getByTestId('form-retrait-finance-islamique');
    await withdraw.getByLabel(/Les effacer/).check();
    await withdraw.getByRole('button', { name: 'Retirer mon consentement' }).click();
    await expect(page).toHaveURL(/retrait=erase/);
    await page.goto('/goals/calendrier');
    await expect(page.locator('[data-testid="evenement"]', { hasText: 'Veillée fictive' })).toHaveCount(0);
    await expect(page.locator('[data-testid="evenement"]', { hasText: 'Anniversaire familial fictif' })).toHaveCount(1);
    await expect(page.locator('[data-testid="evenement"]', { hasText: 'Assurance auto fictive' })).toHaveCount(1);
  });
});
