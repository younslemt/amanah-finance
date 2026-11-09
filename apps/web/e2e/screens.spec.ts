import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours des six écrans du MVP en mode démo, sur mobile et ordinateur.
 * Vérifie : rendu, navigation, état actif, absence de défilement horizontal,
 * contraste des textes (WCAG AA) et contenus de conformité attendus.
 */
const SCREENS = [
  { path: '/dashboard', heading: 'Assalamu alaykum', nav: 'Accueil' },
  { path: '/budget', heading: 'Budget', nav: 'Budget' },
  { path: '/goals', heading: 'Projets de vie', nav: 'Objectifs' },
  { path: '/zakat', heading: 'Zakat', nav: 'Zakat' },
  { path: '/purification', heading: 'Purification', nav: 'Purification' },
  { path: '/wealth', heading: 'Patrimoine', nav: 'Patrimoine' },
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
  await page.goto('/purification');
  await expect(page.getByText(/brut \(avant précompte mobilier\)/)).toBeVisible();
  await expect(page.getByText('À déterminer').first()).toBeVisible();
  await expect(page.getByText('Non communiqué').first()).toBeVisible();
  await page.goto('/goals');
  await expect(page.getByText('Rythme à déterminer').first()).toBeVisible();
  await expect(page.getByText('En retard').first()).toBeVisible();
});

test('la connexion est désactivée en démonstration', async ({ page }) => {
  await page.goto('/connexion');
  await expect(page.getByText(/La connexion est désactivée en mode démonstration/)).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});
