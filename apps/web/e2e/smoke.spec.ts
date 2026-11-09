import { expect, test } from '@playwright/test';

test.describe('Sprint 0 — parcours de démonstration', () => {
  test('la racine mène au tableau de bord en mode démo', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('status')).toContainText('Mode démonstration');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Assalamu alaykum');
    await expect(page.getByText('Liquidités disponibles')).toBeVisible();
  });

  test('chaque écran du MVP est accessible depuis la navigation', async ({ page, isMobile }) => {
    await page.goto('/dashboard');
    const nav = page.getByRole('navigation', { name: isMobile ? 'Navigation mobile' : 'Navigation principale' });
    for (const [label, path, heading] of [
      ['Budget', '/budget', 'Budget'],
      ['Objectifs', '/goals', 'Projets de vie'],
      ['Zakat', '/zakat', 'Zakat'],
      ['Purification', '/purification', 'Purification'],
      ['Patrimoine', '/wealth', 'Patrimoine'],
    ] as const) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    }
  });

  test('la Zakat affiche son référentiel et l’avertissement', async ({ page }) => {
    await page.goto('/zakat');
    await expect(page.getByText(/amanah-zakat 1\.0\.0/)).toBeVisible();
    await expect(page.getByText(/ni une fatwa ni une certification/)).toBeVisible();
  });

  test('les en-têtes de sécurité sont présents', async ({ request }) => {
    const res = await request.get('/dashboard');
    expect(res.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});
