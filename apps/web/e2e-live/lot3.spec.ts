import { expect, test, type Page } from '@playwright/test';
import {
  activateIslamicFinance, completeOnboarding, createGoalWithWizard, euros, fakeUser, latestLink, openProfileMenu, signIn, signUpAndConfirm,
} from './helpers';

/**
 * Lot 3 en mode réel (Supabase local), mobile et ordinateur. Utilisateur et montants FICTIFS.
 * Navigation Islamic-first, page Mes engagements, actions rapides selon les autorisations, menu profil,
 * sans consentement, avec consentement et après retrait : aucune donnée religieuse personnelle sans
 * consentement, ni dans la page, ni dans la navigation, ni dans le panneau « + ».
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

const navOf = (page: Page, mobile: boolean) => page.getByRole('navigation', { name: mobile ? 'Navigation mobile' : 'Navigation principale' });
const navLabels = async (page: Page, mobile: boolean) =>
  (await navOf(page, mobile).getByTestId(mobile ? 'entree-navigation-mobile' : 'entree-navigation').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());

async function quickActions(page: Page, mobile: boolean): Promise<{ ids: string[]; text: string }> {
  await page.goto('/dashboard');
  const button = page.getByTestId(mobile ? 'bouton-actions-rapides' : 'bouton-actions-rapides-ordinateur');
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Actions rapides' });
  await expect(dialog).toBeVisible();
  const ids = await dialog.getByTestId('action-rapide').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')!));
  const text = await dialog.innerText();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  return { ids, text };
}

const cents = (text: string) => {
  const all = [...text.replace(/[  ]/g, ' ').matchAll(/(?<![\d,])(\d{1,3}(?: \d{3})*(?:,\d{2})?) ?€/g)];
  const m = all.at(-1);
  if (!m) throw new Error(`montant introuvable : ${text}`);
  return Math.round(Number(m[1]!.replace(/ /g, '').replace(',', '.')) * 100);
};

test.describe.serial('Lot 3 — navigation, Mes engagements, actions rapides, menu profil (mode réel)', () => {
  let U: ReturnType<typeof fakeUser>;
  test.beforeAll(({}, info) => { U = fakeUser('l3', `lot3-${info.project.name}`); });

  test('sans consentement : « Finance islamique » pédagogique, aucune donnée religieuse, menu profil complet', async ({ page, isMobile }, info) => {
    const { sentAt } = await signUpAndConfirm(page, U);
    await page.goto(await latestLink(U.email, 'signup', sentAt));
    await completeOnboarding(page, U.name);

    // Navigation : cinq entrées, la deuxième pédagogique, aucune sous-entrée
    await page.goto('/dashboard');
    expect(await navLabels(page, isMobile)).toEqual(['Accueil', 'Finance islamique', 'Projets', 'Budget', 'Patrimoine']);
    await expect(page.getByTestId('sous-entree')).toHaveCount(0);
    await expect(page.getByTestId('coque')).toHaveAttribute('data-religious', 'no');

    // Actions rapides : ni compte ni projet → créer un projet, ajouter une échéance ; aucun don
    const qa = await quickActions(page, isMobile);
    expect(qa.ids).toEqual(['create_goal', 'add_calendar_event']);
    expect(qa.text).not.toMatch(/religi|Zakat|Sadaqah|don\b/i);

    // Page pédagogique : rien de personnel n'est rendu côté serveur
    await page.goto('/finance-islamique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finance islamique');
    await expect(page.getByTestId('finance-islamique-pedagogique')).toBeVisible();
    await expect(page.getByTestId('form-activer-finance-islamique')).toBeVisible();
    await expect(navOf(page, isMobile).getByRole('link', { name: 'Finance islamique' })).toHaveAttribute('aria-current', 'page');
    const html = await page.content();
    for (const leak of ['engagement-zakat', 'engagement-purification', 'engagement-solidarite', 'Montant restant selon vos déclarations', 'Mes engagements']) {
      expect(html.includes(leak), leak).toBe(false);
    }
    // Sous-page demandée directement : porte de consentement, l'entrée reste « Finance islamique »
    await page.goto('/zakat');
    await expect(page.getByTestId('lien-activer-finance-islamique')).toBeVisible();
    await expect(navOf(page, isMobile).getByRole('link', { name: 'Finance islamique' })).toHaveAttribute('aria-current', 'page');

    // Menu profil : accès secondaires du mode réel, déconnexion comprise
    await page.goto('/budget');
    const panel = await openProfileMenu(page);
    await expect(panel.getByTestId('lien-profil')).toHaveText(['Mes comptes', 'Importer un relevé', 'Mes recommandations', 'Paramètres', 'Préférences d’affichage', 'Consentements']);
    await expect(panel.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    for (const href of await panel.getByTestId('lien-profil').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      expect((await page.request.get(href)).status(), href).toBe(200);
    }
    await panel.getByRole('link', { name: 'Consentements' }).click();
    await expect(page).toHaveURL(/\/parametres#consentements$/);
    await expect(page.locator('#consentements')).toBeInViewport();

    if (info.project.name === 'desktop') {
      for (const w of [375, 1440]) {
        await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
        await page.goto('/finance-islamique');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
        await page.screenshot({ path: info.outputPath(`lot3-reel-finance-islamique-sans-consentement-${w}.jpg`), fullPage: w >= 768, type: 'jpeg', quality: 75 });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('avec consentement : Mes engagements, Zakat incomplète puis complète, solidarité sans double comptage', async ({ page, isMobile }, info) => {
    await signIn(page, U);

    // Un compte puis un projet : les actions correspondantes apparaissent
    await page.goto('/comptes');
    await page.getByLabel('Nom du compte').fill('Compte courant fictif');
    await page.getByLabel('Type').selectOption('current');
    await page.getByLabel('Solde de départ (€)').fill('10000');
    await page.getByRole('button', { name: 'Ajouter le compte' }).click();
    await expect(page.getByTestId('liste-comptes')).toContainText('Compte courant fictif');
    expect((await quickActions(page, isMobile)).ids).toEqual(['add_operation', 'create_goal', 'add_calendar_event', 'import_statement']);
    await createGoalWithWizard(page, { category: 'Études des enfants', name: 'Études fictives', target: '12 000', available: '1 000', monthly: '200' });
    expect((await quickActions(page, isMobile)).ids).toEqual(['add_operation', 'allocate_to_goal', 'create_goal', 'add_calendar_event', 'import_statement']);

    // Consentement : « Mes engagements », sous-entrées sur ordinateur, don et échéance religieuse
    await activateIslamicFinance(page, '/dons');
    await page.goto('/dashboard');
    expect(await navLabels(page, isMobile)).toEqual(['Accueil', 'Mes engagements', 'Projets', 'Budget', 'Patrimoine']);
    if (!isMobile) await expect(navOf(page, false).getByTestId('sous-entree')).toHaveText(['Zakat', 'Purification', 'Solidarité']);
    const qa = await quickActions(page, isMobile);
    expect(qa.ids).toEqual(['add_operation', 'allocate_to_goal', 'create_goal', 'add_calendar_event', 'record_contribution', 'import_statement']);
    expect(qa.text).toContain('Personnelle, familiale ou religieuse');

    // Mes engagements, aucun calcul : Zakat incomplète, jamais présentée comme établie
    await page.goto('/finance-islamique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes engagements');
    const z = page.getByTestId('engagement-zakat');
    await expect(z.getByTestId('zakat-statut')).toHaveAttribute('data-complete', 'no');
    await expect(z.getByTestId('zakat-statut')).toContainText('Calcul incomplet');
    await expect(z.getByTestId('zakat-reste')).toContainText('Non déterminé tant que le calcul est incomplet');
    await expect(z.locator('[data-kind="estimated"]')).toContainText('à compléter');
    await expect(z.locator('[data-kind="provision"]')).toHaveCount(0);
    await expect(z.getByTestId('lien-calcul-zakat')).toHaveText('Compléter le calcul');
    await expect(page.getByTestId('purification-detectees')).toContainText('Aucune opération en attente');
    await expect(page.getByTestId('purification-decisions')).toContainText('0 confirmée(s)');
    await expect(page.getByTestId('purification-pas-un-transfert')).toContainText('ce n’est pas un transfert');
    await expect(page.getByTestId('lien-purification')).toHaveText('Confirmer les montants à purifier');
    await expect(page.getByTestId('purification-perimetre')).toHaveAttribute('data-shared', '0');
    expect(cents(await page.getByTestId('solidarite-total').innerText())).toBe(0);
    await expect(page.getByTestId('lien-enregistrer-don')).toBeVisible();
    await expect(page.getByTestId('form-retrait-finance-islamique')).toBeVisible();
    if (info.project.name === 'desktop') {
      for (const w of [390, 1440]) {
        await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
        await page.screenshot({ path: info.outputPath(`lot3-reel-engagements-zakat-incomplete-${w}.jpg`), fullPage: w >= 768, type: 'jpeg', quality: 75 });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }

    // Calcul de Zakat enregistré (prix et choix fictifs), puis deux dons déclarés
    await page.goto('/zakat');
    const price = page.getByTestId('form-prix');
    await price.getByRole('combobox', { name: /^Métal/ }).selectOption('XAG');
    await price.getByLabel('Prix par gramme de métal fin (€)').fill('1,30');
    await price.getByLabel('Source', { exact: true }).fill('Cotation fictive de test');
    await price.getByRole('button', { name: 'Enregistrer le prix' }).click();
    await expect(page.getByTestId('prix-metaux')).toContainText('Cotation fictive de test');
    const settings = page.getByTestId('form-reglages-zakat');
    await settings.getByLabel('Argent (595 g de métal fin)').check();
    await settings.getByLabel('Année lunaire (354 jours, 2,5 %)').check();
    await settings.getByLabel('Début de votre année de possession (Hawl)').fill(daysAgo(400));
    await settings.getByRole('button', { name: 'Enregistrer mes choix' }).click();
    await page.getByTestId('form-enregistrer-calcul').getByRole('button', { name: 'Enregistrer ce calcul' }).click();
    await expect(page.getByTestId('calcul-zakat').first()).toContainText(euros('250,00 €'));

    await page.goto('/dons');
    const form = page.getByTestId('form-don');
    const declare = async (kind: string, amount: string, calc: boolean, n: number) => {
      await form.getByLabel('Type').selectOption(kind);
      await form.getByLabel('Montant (€)').fill(amount);
      await form.getByLabel('Bénéficiaire').fill('Association fictive');
      await form.getByLabel(/Affecter à un calcul de Zakat/).selectOption(calc ? { index: 1 } : '');
      await form.getByRole('button', { name: 'Enregistrer le don' }).click();
      await expect(page.getByTestId('don')).toHaveCount(n);
    };
    await declare('zakat', '100,00', true, 1);
    await declare('sadaqah', '50,00', false, 2);
    const donsTotal = cents(await page.getByTestId('synthese-dons').getByText(/^Total \d{4}/).locator('xpath=following-sibling::p[1]').innerText());

    // Mes engagements : mêmes montants que les écrans Zakat et Dons, chacun compté une fois
    await page.goto('/finance-islamique');
    await expect(z.getByTestId('zakat-statut')).toHaveAttribute('data-complete', 'yes');
    await expect(z.getByTestId('zakat-statut')).toHaveText('Zakat estimée due selon vos choix');
    expect(cents(await z.locator('[data-kind="estimated"] dd').innerText())).toBe(25_000);
    expect(cents(await z.locator('[data-kind="declared"] dd').innerText())).toBe(10_000);
    expect(cents(await z.getByTestId('zakat-reste').innerText())).toBe(15_000);
    await expect(z.getByTestId('lien-calcul-zakat')).toHaveText('Revoir le calcul');
    const s = page.getByTestId('engagement-solidarite');
    const total = cents(await s.getByTestId('solidarite-total').innerText());
    expect(total).toBe(15_000);
    expect(total).toBe(donsTotal);
    expect((await s.getByTestId('solidarite-type').locator('dd').allInnerTexts()).map(cents).reduce((a, b) => a + b, 0)).toBe(total);
    expect((await s.getByTestId('solidarite-statuts').locator('dd').allInnerTexts()).map(cents)).toEqual([15_000, 0, 0]);
    // Historique des calculs : lien vers la section de l'écran Zakat
    await expect(z.getByTestId('lien-historique-zakat')).toHaveText('Historique des calculs (1)');
    await z.getByTestId('lien-historique-zakat').click();
    await expect(page).toHaveURL(/\/zakat#historique$/);
    await expect(page.getByTestId('historique-zakat')).toBeVisible();

    if (info.project.name === 'desktop') {
      await page.goto('/finance-islamique');
      for (const w of [375, 390, 430, 768, 1440]) {
        await page.setViewportSize({ width: w, height: w < 768 ? 844 : 900 });
        await page.waitForTimeout(150);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${w} px`).toBeLessThanOrEqual(1);
        if (w === 390 || w === 1440) await page.screenshot({ path: info.outputPath(`lot3-reel-engagements-zakat-complete-${w}.jpg`), fullPage: w >= 768, type: 'jpeg', quality: 75 });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByTestId('bouton-actions-rapides').click();
      await page.screenshot({ path: info.outputPath('lot3-reel-actions-rapides-390.jpg'), type: 'jpeg', quality: 75 });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  });

  test('après retrait : retour à « Finance islamique », plus de don proposé, plus aucune donnée religieuse', async ({ page, isMobile }) => {
    await signIn(page, U);
    await page.goto('/finance-islamique');
    const withdraw = page.getByTestId('form-retrait-finance-islamique');
    await withdraw.getByLabel(/Les conserver/).check();
    await withdraw.getByRole('button', { name: 'Retirer mon consentement' }).click();
    await expect(page).toHaveURL(/retrait=keep/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finance islamique');
    // Nouveau rendu serveur (le document précédent contient encore les données d'avant le retrait)
    await page.goto('/finance-islamique');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Finance islamique');
    expect(await navLabels(page, isMobile)).toEqual(['Accueil', 'Finance islamique', 'Projets', 'Budget', 'Patrimoine']);
    await expect(page.getByTestId('sous-entree')).toHaveCount(0);
    const html = await page.content();
    for (const leak of ['engagement-zakat', 'solidarite-total', 'Montant restant selon vos déclarations', 'Association fictive']) expect(html.includes(leak), leak).toBe(false);
    const qa = await quickActions(page, isMobile);
    expect(qa.ids).not.toContain('record_contribution');
    expect(qa.text).not.toMatch(/religi/i);
    await page.goto('/dons');
    await expect(page.getByTestId('lien-activer-finance-islamique')).toBeVisible();
  });
});
