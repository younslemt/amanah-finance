import { expect, test, type Page } from '@playwright/test';

/**
 * Suggestions de projets et calendrier familial en démonstration (données fictives, sans base),
 * sur mobile et ordinateur. Chaque test a son propre navigateur, donc son propre état.
 */
const euros = (s: string) => new RegExp(s.replace(/ /g, '[\\s\\u00a0\\u202f]'));
const suggestion = (page: Page, id: string) => page.locator(`[data-testid="suggestion"][data-suggestion="${id}"]`);

async function finishWizard(page: Page, v: { target?: string; monthly: string; name?: string }) {
  const form = page.getByTestId('form-objectif');
  if (v.name !== undefined) await form.getByLabel('Nom du projet').fill(v.name);
  await form.getByTestId('etape-suivante').click();
  if (v.target !== undefined) await form.getByLabel('Montant cible (€)').fill(v.target);
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Mensualité prévue (€)').fill(v.monthly);
  await form.getByRole('button', { name: 'Créer l’objectif' }).click();
  await expect(page).toHaveURL(/\/goals\/demo-\d+\?cree=1$/, { timeout: 15_000 });
}

test('page Projets : en cours, suggérés, créer ; une suggestion acceptée devient un projet sur tous les écrans', async ({ page }) => {
  await page.goto('/goals');
  await expect(page.getByRole('heading', { name: '1. Mes projets en cours' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '2. Projets suggérés' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '3. Créer mon propre projet' })).toBeVisible();
  await expect(page.getByTestId('ajouter-objectif')).toBeVisible();
  // Réserve d'urgence en tête (aucune n'existe dans les données fictives) ; l'Aïd 2027 existe déjà : pas de doublon
  await expect(page.getByTestId('suggestion').first()).toHaveAttribute('data-suggestion', 'reserve-urgence');
  await expect(suggestion(page, 'aid-al-adha:2027')).toHaveCount(0);
  await expect(suggestion(page, 'rentree-scolaire:2027')).toContainText('indicative');

  // Préparer : parcours de création prérempli (nom, catégorie, date), JAMAIS de montant
  await suggestion(page, 'rentree-scolaire:2027').getByTestId('preparer-suggestion').click();
  await expect(page.getByTestId('modele-choisi')).toContainText('Fournitures');
  await expect(page.getByTestId('reference-budget')).toContainText('Aucun montant n’est proposé');
  const form = page.getByTestId('form-objectif');
  await expect(form.getByRole('radio', { name: /^Études des enfants/ })).toBeChecked();
  await expect(form.getByLabel('Nom du projet')).toHaveValue('Rentrée scolaire 2027');
  await expect(form.getByLabel('Montant cible (€)')).toHaveValue('');
  await expect(form.getByLabel('Date souhaitée')).toHaveValue('2027-08-30');
  // Tout est modifiable
  await finishWizard(page, { name: 'Rentrée de Yasmine 2027', target: '450', monthly: '50' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rentrée de Yasmine 2027');
  await expect(page.getByText('Suggestion : Rentrée scolaire 2027')).toBeVisible();
  // Même parcours qu'un projet libre
  await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'plan');
  await expect(page.getByTestId('impact-projets')).toBeVisible();

  // La suggestion n'est plus proposée ; le projet est dans la liste, le plan et l'accueil
  await page.goto('/goals');
  await expect(suggestion(page, 'rentree-scolaire:2027')).toHaveCount(0);
  await expect(page.getByTestId('liste-projets')).toContainText('Rentrée de Yasmine 2027');
  await page.goto('/budget/plan-epargne');
  await expect(page.getByTestId('lignes-plan')).toContainText('Rentrée de Yasmine 2027');
  await page.goto('/dashboard');
  await expect(page.getByTestId('projets-tableau-de-bord')).toHaveAttribute('data-total', '5');
  await expect(page.getByTestId('suggestion-accueil')).toHaveCount(3);
  await expect(page.getByTestId('suggestions-accueil')).not.toContainText('Rentrée scolaire 2027');
});

test('me le rappeler plus tard, ne plus me le proposer, rétablir ; préférences respectées', async ({ page }) => {
  await page.goto('/goals');
  await suggestion(page, 'ramadan:2027').getByTestId('reporter-suggestion').getByRole('button').click();
  await expect(page.getByTestId('suggestions-reportees')).toContainText('Ramadan 2027');
  await expect(page.getByTestId('projets-suggeres').locator('> div [data-suggestion="ramadan:2027"]')).toHaveCount(0);
  await suggestion(page, 'vacances-familiales:2027').getByTestId('ecarter-suggestion').getByRole('button').click();
  await expect(suggestion(page, 'vacances-familiales:2027')).toHaveCount(0);
  await page.goto('/goals/preferences');
  await expect(page.getByTestId('suggestions-ecartees')).toContainText('Vacances familiales');
  await page.getByTestId('retablir-suggestion').getByRole('button').click();
  await expect(page.getByTestId('suggestions-ecartees')).toHaveCount(0);

  // Préférences déclarées : pas d'enfant scolarisé, pas d'événements religieux, intérêt pour un mariage
  const prefs = page.getByTestId('form-preferences');
  await prefs.getByRole('group', { name: 'Enfants scolarisés dans le foyer' }).getByLabel('Non').check();
  await prefs.getByLabel('Événements religieux (fonctions religieuses activées)').uncheck();
  await prefs.getByRole('group', { name: 'Projets qui m’intéressent' }).getByLabel('Mariage').check();
  await prefs.getByRole('button', { name: 'Enregistrer mes préférences' }).click();
  await expect(prefs.getByRole('status')).toContainText('recalculés');
  await page.goto('/goals');
  await expect(suggestion(page, 'rentree-scolaire:2027')).toHaveCount(0);
  await expect(page.locator('[data-testid="suggestion"][data-suggestion^="ramadan"], [data-testid="suggestion"][data-suggestion^="aid-"]')).toHaveCount(0);
  await expect(suggestion(page, 'mariage')).toBeVisible();
  await expect(suggestion(page, 'vacances-familiales:2027')).toBeVisible(); // rétablie
  // Conservé après rafraîchissement, et effacé par la réinitialisation
  await page.reload();
  await expect(suggestion(page, 'mariage')).toBeVisible();
  await page.getByText('Réinitialiser la démonstration').click();
  await page.getByTestId('form-reinitialiser').getByRole('button').click();
  await expect(page.getByTestId('form-reinitialiser').getByRole('status')).toContainText('réinitialisée');
  await page.reload();
  await expect(suggestion(page, 'mariage')).toHaveCount(0);
  await expect(suggestion(page, 'rentree-scolaire:2027')).toBeVisible();
});

test('calendrier familial : dates indicatives, confirmation, échéance personnalisée', async ({ page }) => {
  await page.goto('/goals/calendrier');
  await expect(page.getByText('n’est pas une obligation de dépense')).toBeVisible();
  const ramadan = page.locator('[data-testid="evenement"][data-type="ramadan"]').first();
  await expect(ramadan).toContainText('indicative');
  await expect(page.locator('[data-testid="evenement"][data-type="school_start"]').first()).toContainText('30 août 2027');
  await expect(page.locator('[data-testid="evenement"][data-type="custom"]')).toContainText('Assurance habitation (fictive)');
  // Confirmer la date du Ramadan avec sa source
  await ramadan.getByText('Confirmer la date').click();
  const confirm = ramadan.getByTestId('confirmer-date-religieuse');
  await confirm.getByLabel('Date retenue').fill('2027-02-08');
  await confirm.getByLabel('Source').fill('Mosquée fictive du quartier');
  await confirm.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.locator('[data-testid="evenement"][data-type="ramadan"]').first()).toContainText('confirmée ou corrigée par vous');
  await expect(page.locator('[data-testid="evenement"][data-type="ramadan"]').first()).not.toContainText('indicative');
  // Échéance personnalisée : ajoutée puis retirée, sans créer de projet
  const add = page.getByTestId('form-evenement');
  await add.getByLabel('Libellé').fill('Taxe de circulation fictive');
  await add.getByLabel('Date').fill('2027-04-20');
  await add.getByLabel('Revient chaque année').check();
  await add.getByRole('button', { name: 'Ajouter au calendrier' }).click();
  const tax = page.locator('[data-testid="evenement"][data-type="custom"]', { hasText: 'Taxe de circulation fictive' });
  await expect(tax).toContainText('20 avril 2027');
  await tax.getByTestId('retirer-evenement').getByRole('button').click();
  await expect(tax).toHaveCount(0);
  // Préparer depuis le calendrier
  await page.locator('[data-testid="evenement"][data-type="school_start"]').first().getByTestId('preparer-depuis-calendrier').click();
  await expect(page.getByTestId('modele-choisi')).toHaveAttribute('data-modele', 'rentree-scolaire');
});

test('deux modes de création : catalogue de modèles et projet personnalisé, toujours disponible', async ({ page }) => {
  await page.goto('/goals/nouveau?mode=modele');
  await expect(page.getByTestId('modes-creation')).toBeVisible();
  for (const id of ['travaux', 'naissance', 'achat-vehicule', 'ramadan', 'hajj']) await expect(page.locator(`[data-testid="modele"][data-modele="${id}"]`)).toBeVisible();
  // Chantiers distincts : annoncés, non sélectionnables
  for (const id of ['investissements', 'retraite', 'transmission']) await expect(page.locator(`[data-testid="modele-a-venir"][data-modele="${id}"]`)).toContainText('à venir');
  await page.locator('[data-testid="modele"][data-modele="travaux"]').click();
  await expect(page.getByTestId('form-objectif').getByLabel('Nom du projet')).toHaveValue('Travaux');
  await finishWizard(page, { name: 'Travaux de cuisine', target: '6 000', monthly: '250' });
  await expect(page.getByText('Suggestion : Travaux')).toBeVisible();
  // Mode libre
  await page.goto('/goals/nouveau?mode=modele');
  await page.getByTestId('mode-libre').click();
  await expect(page.getByTestId('modele-choisi')).toHaveCount(0);
  const form = page.getByTestId('form-objectif');
  await form.getByRole('radio', { name: /^Projet personnel/ }).check();
  await finishWizard(page, { name: 'Création d’entreprise', target: '15 000', monthly: '300' });
  await expect(page.getByText(/^Suggestion :/)).toHaveCount(0);
});

test('projet annuel : reconduction décidée, budget de référence modifiable, occurrences distinctes', async ({ page }) => {
  await page.goto('/goals');
  await suggestion(page, 'vacances-familiales:2027').getByTestId('preparer-suggestion').click();
  await finishWizard(page, { target: '1 200', monthly: '100' });
  const first = page.url().split('?')[0]!;
  await page.getByTestId('form-allocation').getByLabel('Montant (€)').fill('300');
  await page.getByTestId('form-allocation').getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('300,00 €'));
  await expect(page.getByTestId('lien-reconduire-projet')).toHaveCount(0); // pas avant la réalisation
  await page.getByTestId('form-realiser').getByRole('button', { name: 'Marquer comme réalisé' }).click();
  await page.getByTestId('lien-reconduire-projet').click();
  await expect(page.getByTestId('reference-budget')).toContainText('Budget de l’année précédente');
  const form = page.getByTestId('form-objectif');
  await expect(form.getByLabel('Nom du projet')).toHaveValue('Vacances familiales 2028');
  await form.getByTestId('etape-suivante').click();
  await expect(form.getByLabel('Montant cible (€)')).toHaveValue('1200,00');
  await form.getByLabel('Montant cible (€)').fill('1 400');
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Mensualité prévue (€)').fill('120');
  await form.getByRole('button', { name: 'Créer l’objectif' }).click();
  await expect(page).toHaveURL(/\/goals\/demo-\d+\?cree=1$/, { timeout: 15_000 });
  await expect(page.getByTestId('plan-projet')).toContainText(euros('1 400,00 €'));
  await expect(page.getByText('Aucune affectation.')).toBeVisible(); // rien de l'an dernier n'est repris
  await page.goto(first);
  await expect(page.getByTestId('deja-reconduit')).toBeVisible();
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('300,00 €'));
});

test('calendrier : visibilité explicite, classification religieuse, correction d’une date scolaire jamais recalculée', async ({ page }) => {
  await page.goto('/goals/calendrier');
  const add = page.getByTestId('form-evenement');
  await add.getByLabel('Libellé').fill('Fête de l’Aïd chez les cousins');
  await add.getByLabel('Date').fill('2027-03-20');
  await add.getByRole('button', { name: 'Ajouter au calendrier' }).click();
  // Libellé à connotation religieuse, sans classification : événement personnel ordinaire
  const plain = page.locator('[data-testid="evenement"]', { hasText: 'Fête de l’Aïd chez les cousins' }).getByTestId('visibilite-evenement');
  await expect(plain).toHaveAttribute('data-visibility', 'private');
  await expect(plain).toHaveAttribute('data-religious', 'no');
  await add.getByLabel('Libellé').fill('Veillée fictive');
  await add.getByLabel('Date').fill('2027-03-21');
  await add.getByLabel('Tout mon foyer (partage volontaire)').check();
  await add.getByLabel(/Événement religieux/).check();
  await add.getByRole('button', { name: 'Ajouter au calendrier' }).click();
  const vigil = page.locator('[data-testid="evenement"]', { hasText: 'Veillée fictive' }).getByTestId('visibilite-evenement');
  await expect(vigil).toHaveAttribute('data-religious', 'yes');
  await expect(vigil).toHaveAttribute('data-visibility', 'private');

  // Correction de la rentrée : conservée, plus indicative, et jamais écrasée par un changement de calendrier
  const start = () => page.locator('[data-testid="evenement"][data-type="school_start"]').first();
  await expect(start()).toContainText('indicative');
  await start().getByText('Corriger la date').click();
  const fix = start().getByTestId('corriger-date-scolaire');
  await fix.getByLabel('Date exacte').fill('2027-09-02');
  await fix.getByLabel('Source').fill('Courrier fictif de l’école');
  await fix.getByRole('button', { name: 'Enregistrer la date' }).click();
  await expect(start()).toContainText('2 septembre 2027');
  await expect(start()).not.toContainText('indicative');
  await expect(start()).toContainText('Courrier fictif de l’école');
  await page.goto('/goals/preferences');
  const prefs = page.getByTestId('form-preferences');
  await prefs.getByLabel('Calendrier scolaire').selectOption('be-vl');
  await prefs.getByRole('button', { name: 'Enregistrer mes préférences' }).click();
  await expect(prefs.getByRole('status')).toContainText('recalculés');
  await page.goto('/goals/calendrier');
  await expect(start()).toContainText('2 septembre 2027');
  // Retirer la correction : retour à l'approximation indicative (Flandre)
  await start().getByText('Modifier la correction').click();
  await start().getByTestId('retirer-correction-scolaire').getByRole('button').click();
  await expect(start()).toContainText('1 septembre 2027');
  await expect(start()).toContainText('indicative');
});

test('date de référence simulée : janvier (Ramadan), juillet (rentrée), retour à la date de départ', async ({ page }) => {
  await page.goto('/simulation');
  await expect(page.getByTestId('date-simulee')).toHaveAttribute('data-date', '2026-11-09');
  await page.getByTestId('simulation-2027-01-15').getByRole('button').click();
  await expect(page.getByTestId('date-simulee')).toHaveAttribute('data-date', '2027-01-15');
  await expect(page.getByTestId('date-demo')).toHaveText('15/01/2027');
  await page.goto('/goals');
  await expect(suggestion(page, 'ramadan:2027')).toBeVisible();
  await page.goto('/goals/calendrier');
  await expect(page.locator('[data-testid="evenement"]').first()).not.toContainText('2026');

  await page.goto('/simulation');
  await page.getByTestId('simulation-2027-07-15').getByRole('button').click();
  await expect(page.getByTestId('date-simulee')).toHaveAttribute('data-date', '2027-07-15');
  await page.goto('/goals');
  await expect(suggestion(page, 'rentree-scolaire:2027')).toBeVisible();
  await expect(suggestion(page, 'ramadan:2027')).toHaveCount(0);
  // Le budget suit la date simulée (mois courant fictif)
  await page.goto('/dashboard');
  await expect(page.getByText(/juillet 2027/i).first()).toBeVisible();

  await page.goto('/simulation');
  await page.getByTestId('simulation-reinitialiser').getByRole('button').click();
  await expect(page.getByTestId('date-simulee')).toHaveAttribute('data-date', '2026-11-09');
});
