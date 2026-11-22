import { expect, test, type Page } from '@playwright/test';

/**
 * Lot 3 (démonstration, données fictives) : navigation Islamic-first, page Mes engagements,
 * bouton « + » d'actions rapides et menu profil. Accessibilité clavier et lecteurs d'écran,
 * rendu réel aux largeurs de référence (captures « lot3-* » jointes au journal de CI).
 */
const WIDTHS = [
  { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 },
] as const;
const ORDER = ['Accueil', 'Mes engagements', 'Projets', 'Budget', 'Patrimoine'];

const nav = (page: Page, isMobile: boolean) => page.getByRole('navigation', { name: isMobile ? 'Navigation mobile' : 'Navigation principale' });
const quickButton = (page: Page, isMobile: boolean) => page.getByTestId(isMobile ? 'bouton-actions-rapides' : 'bouton-actions-rapides-ordinateur');
const profileButton = (page: Page) => page.getByTestId('bouton-profil').filter({ visible: true });
/** « … 1 234,56 € » → centimes : le dernier montant en euros du texte (espaces insécables compris). */
const cents = (text: string) => {
  const all = [...text.replace(/[\u00a0\u202f]/g, ' ').matchAll(/(?<![\d,])(\d{1,3}(?: \d{3})*(?:,\d{2})?) ?€/g)];
  const m = all.at(-1);
  if (!m) throw new Error(`montant introuvable : ${text}`);
  return Math.round(Number(m[1]!.replace(/ /g, '').replace(',', '.')) * 100);
};

test('navigation : cinq entrées dans l’ordre, « Mes engagements » en deuxième', async ({ page, isMobile }) => {
  await page.goto('/dashboard');
  const n = nav(page, isMobile);
  const testId = isMobile ? 'entree-navigation-mobile' : 'entree-navigation';
  expect((await n.getByTestId(testId).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())).toEqual(ORDER);
  await expect(n.getByRole('link', { name: 'Accueil' })).toHaveAttribute('aria-current', 'page');
  if (isMobile) {
    // Barre basse : cibles d'au moins 44 px (zone de sécurité : env(safe-area-inset-bottom))
    for (const box of await n.getByTestId(testId).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
    await expect(n.getByTestId('sous-entree')).toHaveCount(0);
  } else {
    await expect(n.getByTestId('sous-entree')).toHaveText(['Zakat', 'Purification', 'Solidarité']);
  }
});

test('sous-entrées Zakat, Purification et Solidarité (ordinateur)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'sous-entrées : navigation latérale');
  await page.goto('/finance-islamique');
  const n = nav(page, false);
  for (const [label, path, heading] of [['Zakat', '/zakat', 'Zakat'], ['Purification', '/purification', 'Purification'], ['Solidarité', '/dons', 'Dons et Sadaqah']] as const) {
    await n.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(n.getByRole('link', { name: label, exact: true })).toHaveAttribute('aria-current', 'page');
    // L'entrée parente reste en évidence sans être annoncée comme page courante
    await expect(n.getByRole('link', { name: 'Mes engagements' })).not.toHaveAttribute('aria-current', 'page');
  }
});

test('Mes engagements : Zakat, purification et solidarité depuis les données existantes', async ({ page }) => {
  await page.goto('/finance-islamique');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes engagements');

  // Zakat : dernier calcul, statut, cinq notions sans provision inventée, accès au calcul et à l'historique
  const z = page.getByTestId('engagement-zakat');
  await expect(z.getByTestId('zakat-dernier-calcul')).toContainText('Enregistré le 9 novembre 2026');
  await expect(z.getByTestId('zakat-statut')).toHaveText('Zakat estimée due selon vos choix');
  await expect(z.getByTestId('zakat-ligne')).toHaveCount(4);
  await expect(z.locator('[data-kind="provision"]')).toHaveCount(0);
  await expect(z.getByText(/provision/i)).toHaveCount(0);
  const estimated = cents(await z.locator('[data-kind="estimated"] dd').innerText());
  const declared = cents(await z.locator('[data-kind="declared"] dd').innerText());
  expect(estimated).toBe(48_000);
  expect(cents(await z.getByTestId('zakat-reste').innerText())).toBe(Math.max(0, estimated - declared));
  await expect(z.getByTestId('zakat-reste')).toContainText('Montant restant selon vos déclarations');
  await expect(z.getByTestId('badge-methode')).toHaveText('Méthode provisoire');
  // Même montant restant que l'accueil : une seule source
  const remaining = await z.getByTestId('zakat-reste').innerText();
  await page.goto('/dashboard');
  await expect(page.getByTestId('solidarite-accueil').getByRole('link')).toHaveText('Voir les dons');
  expect(cents(await page.getByTestId('zakat-accueil').getByTestId('zakat-reste').innerText())).toBe(cents(remaining));
  await page.goto('/finance-islamique');

  // Purification : opérations détectées, aucune décision ni transfert inventés en démonstration
  const p = page.getByTestId('engagement-purification');
  await expect(p.getByTestId('purification-detectees')).toContainText('opération');
  await expect(p.getByTestId('purification-decisions')).toContainText('Non enregistrables en démonstration');
  await expect(p.getByTestId('purification-pas-un-transfert')).toContainText('ce n’est pas un transfert');
  await expect(p.getByText(/virement effectué|paiement effectué/i)).toHaveCount(0);
  // Démonstration : actions de consultation seulement, jamais présentées comme des écritures
  await expect(p.getByTestId('lien-purification')).toHaveText('Examiner les opérations fictives');
  await expect(z.getByTestId('lien-calcul-zakat')).toHaveText('Consulter le calcul fictif');
  await expect(page.getByTestId('mes-engagements').getByRole('link', { name: /^(Confirmer|Compléter|Enregistrer|Revoir)/ })).toHaveCount(0);

  // Solidarité : total = somme des types (chaque contribution une fois), identique à l'écran Dons
  const s = page.getByTestId('engagement-solidarite');
  const total = cents(await s.getByTestId('solidarite-total').innerText());
  const lines = await s.getByTestId('solidarite-type').locator('dd').allInnerTexts();
  expect(lines).toHaveLength(5);
  expect(lines.map(cents).reduce((a, b) => a + b, 0)).toBe(total);
  const statuses = (await s.getByTestId('solidarite-statuts').locator('dd').allInnerTexts()).map(cents);
  expect(statuses.reduce((a, b) => a + b, 0)).toBe(total);
  await expect(s.getByTestId('dernier-don')).toBeVisible();
  // Démonstration : l'enregistrement de dons n'existe qu'en mode réel, aucun bouton inactif
  await expect(page.getByTestId('lien-enregistrer-don')).toHaveCount(0);
  await page.goto('/dons');
  expect(cents(await page.getByTestId('synthese-dons').getByText(/^Total 2026/).locator('xpath=following-sibling::p[1]').innerText())).toBe(total);
});

test('Mes engagements : chaque accès mène à un écran existant', async ({ page }) => {
  await page.goto('/finance-islamique');
  const hrefs = await page.getByTestId('mes-engagements').getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
  expect(hrefs).toEqual(expect.arrayContaining(['/zakat', '/purification', '/dons', '/zakat/al-fitr']));
  // Démonstration : aucun historique de calcul enregistré, donc pas de lien vers lui
  await expect(page.getByTestId('lien-historique-zakat')).toHaveCount(0);
  for (const href of new Set(hrefs)) expect((await page.request.get(href)).status(), href).toBe(200);
  await page.getByTestId('lien-calcul-zakat').click();
  await expect(page).toHaveURL(/\/zakat$/);
});

test('actions rapides : uniquement les actions de démonstration, panneau accessible', async ({ page, isMobile }) => {
  await page.goto('/dashboard');
  const button = quickButton(page, isMobile);
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Actions rapides');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  const dialog = page.getByRole('dialog', { name: 'Actions rapides' });
  await expect(dialog).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(dialog.getByTestId('action-rapide')).toHaveText([/Mettre de côté pour un projet/, /Créer un projet/, /Ajouter une échéance/]);
  await expect(dialog.getByTestId('note-actions-rapides')).toContainText('disponibles en mode réel');
  // Le focus entre dans le panneau, reste piégé, et la touche Échap le referme
  await expect(dialog.getByTestId('action-rapide').first()).toBeFocused();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  // Fermeture par le bouton « Fermer »
  await button.click();
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toBeHidden();
  // Fermeture par un clic en dehors du panneau
  await button.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).toBeHidden();
  // Une action mène à l'écran correspondant et referme le panneau
  await button.click();
  await dialog.getByRole('link', { name: /Créer un projet/ }).click();
  await expect(page).toHaveURL(/\/goals\/nouveau$/);
  await expect(dialog).toBeHidden();
  // Cibles tactiles et lisibilité sur petit écran
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 640 });
    await button.click();
    for (const h of await dialog.getByTestId('action-rapide').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
    const box = (await dialog.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(320);
    expect(box.y + box.height).toBeLessThanOrEqual(640 + 1);
  }
});

test('menu profil : accès secondaires de démonstration, clavier et fermeture', async ({ page, isMobile }) => {
  await page.goto('/budget');
  const button = profileButton(page);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const panel = page.getByTestId('panneau-profil').filter({ visible: true });
  await expect(panel.getByRole('navigation', { name: 'Profil et paramètres' })).toBeVisible();
  await expect(panel.getByTestId('lien-profil')).toHaveText(['Mes comptes', 'Importer un relevé', 'Mes recommandations', 'Préférences d’affichage', 'Date simulée']);
  // Démonstration : ni paramètres de compte, ni consentements, ni déconnexion
  await expect(panel.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0);
  for (const href of await panel.getByTestId('lien-profil').evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
    expect((await page.request.get(href)).status(), href).toBe(200);
  }
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  // Clic en dehors du menu (coin du contenu principal, hors du panneau)
  await page.locator('#contenu').click({ position: { x: 4, y: 4 } });
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  // Préférences d'affichage : la section de l'accueil
  await button.click();
  await page.getByTestId('panneau-profil').filter({ visible: true }).getByRole('link', { name: 'Préférences d’affichage' }).click();
  await expect(page).toHaveURL(/\/dashboard#affichage$/);
  await expect(page.getByTestId('form-affichage')).toBeInViewport();
  if (!isMobile) await expect(page.getByTestId('menu-profil-ordinateur')).toBeVisible();
});

test('rendu réel aux largeurs de référence : navigation, Mes engagements, actions rapides, menu profil', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'largeurs fixées explicitement : un seul projet suffit');
  for (const vp of WIDTHS) {
    await page.setViewportSize(vp);
    const mobile = vp.width < 768;
    await page.goto('/finance-islamique');
    await page.waitForTimeout(150);
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(extra, `Mes engagements à ${vp.width} px`).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`lot3-engagements-${vp.width}.jpg`), fullPage: vp.width >= 768, type: 'jpeg', quality: 75 });
    // Le contenu n'est jamais masqué par la barre basse ou le bouton « + »
    if (mobile) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const lastBottom = await page.locator('main > *').last().evaluate((e) => e.getBoundingClientRect().bottom);
      const fabTop = await page.getByTestId('bouton-actions-rapides').evaluate((e) => e.getBoundingClientRect().top);
      expect(lastBottom, `fin du contenu au-dessus du bouton « + » à ${vp.width} px`).toBeLessThanOrEqual(fabTop);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await quickButton(page, mobile).click();
    await expect(page.getByRole('dialog', { name: 'Actions rapides' })).toBeVisible();
    await page.screenshot({ path: info.outputPath(`lot3-actions-rapides-${vp.width}.jpg`), type: 'jpeg', quality: 75 });
    await page.keyboard.press('Escape');
    await profileButton(page).click();
    await expect(page.getByTestId('panneau-profil').filter({ visible: true })).toBeVisible();
    if (vp.width === 390 || vp.width === 1440) await page.screenshot({ path: info.outputPath(`lot3-menu-profil-${vp.width}.jpg`), type: 'jpeg', quality: 75 });
    await page.keyboard.press('Escape');
  }
});
