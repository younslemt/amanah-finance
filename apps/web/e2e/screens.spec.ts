import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours des écrans principaux en mode démo, sur mobile et ordinateur.
 * Vérifie : rendu, navigation, état actif, absence de défilement horizontal,
 * contraste des textes (WCAG AA) et contenus de conformité attendus.
 */
const SCREENS = [
  { path: '/dashboard', heading: 'Assalamu alaykum', nav: 'Accueil' },
  { path: '/budget', heading: 'Budget', nav: 'Budget' },
  { path: '/budget/optimiser', heading: 'Optimiser mon budget', nav: 'Budget' },
  { path: '/recommandations', heading: 'Mes recommandations', nav: 'Accueil' },
  { path: '/goals', heading: 'Projets de vie', nav: 'Projets' },
  { path: '/goals/goal-hajj', heading: 'Hajj en couple', nav: 'Projets' },
  { path: '/goals/goal-aid', heading: 'Aïd al-Adha 2027', nav: 'Projets' },
  { path: '/wealth', heading: 'Patrimoine', nav: 'Patrimoine' },
  { path: '/finance-islamique', heading: 'Finance islamique', nav: 'Finance islamique' },
  { path: '/zakat', heading: 'Zakat', nav: 'Finance islamique' },
  { path: '/purification', heading: 'Purification', nav: 'Finance islamique' },
  { path: '/dons', heading: 'Dons et Sadaqah', nav: 'Finance islamique' },
  { path: '/zakat/al-fitr', heading: 'Zakat al-Fitr', nav: 'Finance islamique' },
] as const;

function visibleNav(page: Page, isMobile: boolean) {
  return page.getByRole('navigation', { name: isMobile ? 'Navigation mobile' : 'Navigation principale' });
}

/** Ratio de contraste WCAG de chaque nœud de texte visible contre son fond opaque le plus proche. */
async function contrastFailures(page: Page) {
  return page.evaluate(() => {
    const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = '1'] = m[1].split(/[ ,/]+/).filter(Boolean); return { r: +r, g: +g, b: +b, a: +a }; };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el: Element | null): { r: number; g: number; b: number } => {
      for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.9) return c; }
      return { r: 255, g: 255, b: 255 };
    };
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement; const text = n.textContent?.trim(); if (!el || !text) continue;
      const st = getComputedStyle(el); const rect = el.getBoundingClientRect();
      if (st.visibility === 'hidden' || st.display === 'none' || rect.width === 0 || el.closest('.sr-only')) continue;
      const fg = parse(st.color); if (!fg) continue;
      const bg = bgOf(el); const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(st.fontSize); const bold = +st.fontWeight >= 700;
      const min = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      if (ratio < min) out.push(`${text.slice(0, 40)} — ${ratio.toFixed(2)} < ${min}`);
    }
    return out;
  });
}

for (const s of SCREENS) {
  test(`écran ${s.path} : rendu, navigation active, mise en page, contraste`, async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(s.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(s.heading);
    const nav = visibleNav(page, isMobile);
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: s.nav })).toHaveAttribute('aria-current', 'page');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
    expect(await contrastFailures(page)).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`${s.path.slice(1)}.png`), fullPage: true });
  });
}

test('la navigation adaptée à l’appareil est la seule visible', async ({ page, isMobile }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('navigation', { name: 'Navigation mobile' })).toBeVisible({ visible: isMobile });
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible({ visible: !isMobile });
});

test('le lien d’évitement mène au contenu au clavier', async ({ page, isMobile }) => {
  test.skip(isMobile, 'navigation clavier : ordinateur');
  await page.goto('/dashboard');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Aller au contenu' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
});

test('les statuts de conformité reflètent les informations disponibles', async ({ page }) => {
  await page.goto('/zakat');
  await expect(page.getByText('Exigible selon le référentiel indiqué')).toBeVisible();
  await expect(page.getByText('Ce référentiel est en cours de validation par un comité charia.')).toBeVisible();
  await expect(page.getByText(/provisoire/).first()).toBeVisible();
  await page.goto('/dons');
  await expect(page.getByTestId('synthese-dons')).toContainText('Dont purification');
  await expect(page.getByText('Rapproché avec une opération bancaire', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Vérifié', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Déclaré', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Parcours de purification')).toBeVisible();
  await page.goto('/zakat/al-fitr');
  await expect(page.getByTestId('liste-fitr')).toContainText('Montant fictif communiqué');
  await expect(page.getByTestId('liste-fitr')).toContainText('année civile 2026');
  await expect(page.getByTestId('annee-hegirienne')).toContainText('aucune conversion automatique');
  await page.goto('/purification');
  await expect(page.getByText(/brut \(avant précompte mobilier\)/)).toBeVisible();
  await expect(page.getByText('À déterminer').first()).toBeVisible();
  await expect(page.getByText('Non communiqué').first()).toBeVisible();
  await page.goto('/goals');
  await expect(page.getByText('Rythme à déterminer').first()).toBeVisible();
  await expect(page.getByText('En retard').first()).toBeVisible();
  await expect(page.getByTestId('parcours-projet').first()).toBeVisible();
  await page.goto('/goals/goal-hajj?mensuel=500');
  await expect(page.getByTestId('resultat-simulation')).toContainText('rien n’est enregistré');
  await expect(page.getByTestId('historique-affectations')).toContainText('500,00');
  await page.goto('/goals/goal-aid');
  await expect(page.getByTestId('budget-aid')).toContainText('330,00');
  await expect(page.getByTestId('date-aid')).toContainText('Saisie, non confirmée');
  await expect(page.getByTestId('date-aid')).toContainText('non officielle');
  await expect(page.getByTestId('reconduction-aid')).toContainText('Disponible après la réalisation');
});

test('la connexion est désactivée en démonstration', async ({ page }) => {
  await page.goto('/connexion');
  await expect(page.getByText(/La connexion est désactivée en mode démonstration/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

// Sprint 2 : écrans hors barre de navigation, désactivés ou explicatifs en démonstration
for (const s of [
  { path: '/import', heading: 'Importer un relevé', text: 'désactivé en démonstration' },
] as const) {
  test(`écran ${s.path} (démonstration) : rendu, mise en page, contraste`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(s.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(s.heading);
    await expect(page.getByRole('note').filter({ hasText: s.text })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'défilement horizontal').toBeLessThanOrEqual(0);
    expect(await contrastFailures(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

// Sprint 3 : tableau de bord, simulation et recommandations en démonstration
test('le tableau de bord présente situation, évolution, capacité, recommandations, projets et actions', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByTestId('ma-situation')).toContainText('Ma situation financière');
  await expect(page.getByTestId('synthese')).toContainText('par mois');
  await expect(page.getByRole('img', { name: /Revenus et dépenses sur 3 mois/ })).toBeVisible();
  await expect(page.getByTestId('capacite')).toContainText('Estimée');
  await expect(page.getByTestId('recommandations-prioritaires').getByTestId('recommandation').first()).toBeVisible();
  await expect(page.getByTestId('prochaines-actions').getByRole('link').first()).toBeVisible();
});

test('la simulation calcule sans rien enregistrer en démonstration', async ({ page }) => {
  await page.goto('/budget/optimiser');
  await expect(page.getByTestId('analyse-situation')).toContainText('Capacité d’épargne estimée');
  await page.getByTestId('reduction-globale').fill('50');
  await expect(page.getByTestId('sim-mensuel')).toContainText('50,00');
  await expect(page.getByTestId('sim-annuel')).toContainText('600');
  await expect(page.getByTestId('incidence-objectifs')).toBeVisible();
  await page.getByTestId('form-scenario').getByRole('button', { name: 'Enregistrer le scénario' }).click();
  await expect(page.getByTestId('form-scenario').getByRole('alert')).toContainText('mode démonstration');
});

test('chaque recommandation expose ses données', async ({ page }) => {
  await page.goto('/recommandations');
  const first = page.getByTestId('recommandation').first();
  await first.getByText('Pourquoi ? Les données utilisées').click();
  await expect(first.getByTestId('donnees-utilisees')).toBeVisible();
  await expect(page.getByRole('note').filter({ hasText: 'ne constituent ni un conseil en investissement' })).toBeVisible();
});
