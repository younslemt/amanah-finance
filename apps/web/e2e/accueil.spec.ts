import { expect, test, type Page } from '@playwright/test';

/**
 * Accueil Islamic-first (lot 2), démonstration (données fictives) : six blocs, données des moteurs,
 * affichage analytique, projets, suggestions, passerelles, capacité disponible, accessibilité,
 * rendu réel aux largeurs de référence (captures jointes au rapport de CI).
 */
const ORDER_ISLAMIC = ['situation', 'engagements', 'projets', 'calendrier', 'patrimoine', 'actions'];
const ORDER_ANALYTIC = ['situation', 'actions', 'projets', 'patrimoine', 'calendrier', 'engagements'];
const blocks = (page: Page) => page.locator('[data-block]').evaluateAll((els) => els.map((e) => e.getAttribute('data-block')));
const WIDTHS = [
  { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 },
] as const;

async function setLayout(page: Page, layout: 'islamic_first' | 'classic') {
  const current = await page.getByTestId('accueil').getAttribute('data-layout');
  if (current === layout) return;
  await page.getByTestId('form-affichage').getByRole('button').click();
  await expect(page.getByTestId('accueil')).toHaveAttribute('data-layout', layout);
}

test('Islamic-first : six blocs dans l’ordre, engagements juste après la situation financière', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('accueil')).toHaveAttribute('data-layout', 'islamic_first');
  await expect(page.getByTestId('accueil')).toHaveAttribute('data-religious', 'yes');
  expect(await blocks(page)).toEqual(ORDER_ISLAMIC);
  await expect(page.getByRole('heading', { level: 2, name: 'Mes engagements' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Mes prochaines actions' })).toBeVisible();
});

test('Zakat : montant restant selon vos déclarations, calcul enregistré et contribution rapprochée (fictifs)', async ({ page }) => {
  await page.goto('/dashboard');
  const z = page.getByTestId('zakat-accueil');
  await expect(z).toHaveAttribute('data-basis', 'saved');
  await expect(z.getByTestId('zakat-reste')).toContainText('Montant restant selon vos déclarations');
  await expect(z.getByTestId('zakat-reste')).toHaveAttribute('data-complete', 'yes');
  await expect(z.locator('[data-kind="estimated"]')).toContainText('480');
  await expect(z.locator('[data-kind="declared"]')).toContainText('rapprochées');
  await expect(z.getByTestId('badge-methode')).toHaveText('Méthode provisoire');
  // Aucune provision n'existe dans les moteurs : rien d'inventé
  await expect(page.getByTestId('accueil')).not.toContainText('Provision');
});

test('épargne : excédent observé, capacité retenue et part non affectée, clairement distingués', async ({ page }) => {
  await page.goto('/dashboard');
  const box = page.getByTestId('capacite-disponible');
  await expect(box).toHaveAttribute('data-source', 'declared');
  await expect(box.getByTestId('excedent-observe')).toContainText('Excédent mensuel observé');
  await expect(box.getByTestId('capacite-retenue')).toContainText('Capacité d’épargne retenue pour le plan');
  await expect(box.getByTestId('capacite-retenue')).toContainText('déclarée par vous');
  await expect(box.getByTestId('capacite-non-affectee')).toContainText('Capacité d’épargne non affectée');
  for (const id of ['excedent-observe', 'capacite-retenue', 'capacite-non-affectee']) {
    await expect(box.getByTestId(id)).toContainText(/\d[\d\s\u202f\u00a0]*€\s*\/ mois/);
  }
  await expect(box.getByTestId('synthese')).toContainText('ne s’additionnent pas');
  // Même capacité retenue que l'écran du plan d'épargne (moteur de planification)
  const retained = (await box.getByTestId('capacite-retenue').locator('dd').textContent())!.replace(/\s*\/ mois/, '').trim();
  await page.goto('/budget/plan-epargne');
  await expect(page.getByTestId('synthese-plan')).toContainText(retained);
});

test('projets : trois au plus, avancement, objectif, une seule prochaine étape chacun, accès à tous', async ({ page }) => {
  await page.goto('/dashboard');
  const rows = page.getByTestId('projet-accueil');
  await expect(rows).toHaveCount(3);
  for (const r of await rows.all()) {
    await expect(r).toContainText('%');
    await expect(r).toContainText('€');
    await expect(r.getByTestId('prochaine-etape-projet')).toHaveCount(1);
  }
  await expect(page.getByTestId('tous-les-projets')).toHaveAttribute('href', '/goals');
  await rows.first().getByTestId('prochaine-etape-projet').click();
  await expect(page).toHaveURL(/\/goals\/goal-/);
});

test('suggestions du moteur et prochaines actions : trois au plus, vers des écrans existants', async ({ page }) => {
  await page.goto('/dashboard');
  const sug = page.getByTestId('suggestion-accueil');
  expect(await sug.count()).toBeLessThanOrEqual(3);
  await expect(sug.first()).toContainText('Préparer ce projet');
  const actions = page.getByTestId('prochaine-action');
  expect(await actions.count()).toBeGreaterThan(0);
  expect(await actions.count()).toBeLessThanOrEqual(3);
  const hrefs = await page.getByTestId('prochaines-actions').getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  for (const h of hrefs) {
    const res = await page.request.get(h!);
    expect(res.status(), h!).toBe(200);
  }
  for (const t of await page.getByTestId('prochaines-actions').allTextContents()) expect(t).not.toMatch(/devez|obligatoire|obligation/i);
});

test('affichage analytique : mêmes données, autre ordre ; préférence conservée', async ({ page }) => {
  await page.goto('/dashboard');
  const before = await page.getByTestId('patrimoine-net').textContent();
  const projectsBefore = await page.getByTestId('projet-accueil').allTextContents();
  await setLayout(page, 'classic');
  expect(await blocks(page)).toEqual(ORDER_ANALYTIC);
  await expect(page.getByTestId('badge-analytique')).toBeVisible();
  await expect(page.getByTestId('budget-du-mois')).toBeVisible();
  await expect(page.getByTestId('dashboard-finance-islamique')).toHaveAttribute('data-variant', 'compact');
  expect(await page.getByTestId('patrimoine-net').textContent()).toBe(before);
  expect(await page.getByTestId('projet-accueil').allTextContents()).toEqual(projectsBefore);
  await page.reload();
  await expect(page.getByTestId('accueil')).toHaveAttribute('data-layout', 'classic');
  await setLayout(page, 'islamic_first');
  expect(await blocks(page)).toEqual(ORDER_ISLAMIC);
});

test('accessibilité : un seul titre principal, sections nommées, cibles tactiles, clavier', async ({ page, isMobile }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  for (const id of ORDER_ISLAMIC.slice(1)) await expect(page.locator(`section[data-block="${id}"]`)).toHaveAttribute('aria-labelledby', /titre-/);
  // Cibles principales : 44 px de haut au moins ; bouton de préférence : 24 px au moins (WCAG 2.5.8)
  for (const el of [page.getByTestId('zakat-accueil').getByRole('link', { name: 'Accéder au calcul' }), page.getByTestId('prochaines-actions').getByRole('link').first()]) {
    const box = await el.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect((await page.getByTestId('form-affichage').getByRole('button').boundingBox())!.height).toBeGreaterThanOrEqual(24);
  // Barres de progression des projets annoncées aux lecteurs d'écran
  await expect(page.getByTestId('projet-accueil').first().getByRole('progressbar')).toHaveAttribute('aria-valuenow', /\d+/);
  if (!isMobile) {
    // Clavier : l'action principale de la Zakat est atteignable et reçoit le focus visible
    const target = page.getByTestId('zakat-accueil').getByRole('link', { name: 'Accéder au calcul' });
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) { await page.keyboard.press('Tab'); reached = await target.evaluate((e) => e === document.activeElement); }
    expect(reached).toBe(true);
    expect(await target.evaluate((e) => getComputedStyle(e).outlineStyle)).not.toBe('none');
  }
});

for (const layout of ['islamic_first', 'classic'] as const) {
  test(`rendu réel ${layout} aux largeurs de référence : aucun débordement, captures`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'largeurs fixées explicitement : un seul projet suffit');
    await page.goto('/dashboard');
    await setLayout(page, layout);
    for (const vp of WIDTHS) {
      await page.setViewportSize(vp);
      await page.waitForTimeout(150);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(extra, `${layout} à ${vp.width} px`).toBeLessThanOrEqual(1);
      // Texte lisible : aucune police sous 11 px dans l'accueil
      const tiny = await page.getByTestId('accueil').evaluate((root) => [...root.querySelectorAll('*')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11).length);
      expect(tiny, `${layout} à ${vp.width} px : textes trop petits`).toBe(0);
      await page.screenshot({ path: info.outputPath(`accueil-${layout}-${vp.width}.jpg`), fullPage: true, type: 'jpeg', quality: 80 });
    }
    await setLayout(page, 'islamic_first');
  });
}
