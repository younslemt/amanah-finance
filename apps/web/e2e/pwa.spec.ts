import { expect, test } from '@playwright/test';

/** Application installable et comportement sans réseau (mode démo, données fictives). */
test.describe('PWA', () => {
  test('manifeste et icônes installables', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/dashboard');
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
    for (const icon of m.icons as { src: string; type: string }[]) {
      const r = await request.get(icon.src);
      expect(r.ok(), icon.src).toBe(true);
      expect(r.headers()['content-type']).toContain(icon.type);
    }
    expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);
  });

  test('service worker : jamais de cache pour les pages et données', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBe(true);
    expect(res.headers()['cache-control']).toContain('no-cache');
    const body = await res.text();
    expect(body).toContain("req.mode === 'navigate'");
    // Seuls les fichiers statiques versionnés et les icônes sont mis en cache
    expect(body).toContain("url.pathname.startsWith('/_next/static/')");
  });

  test('page hors ligne accessible sans données', async ({ page }) => {
    await page.goto('/hors-ligne');
    await expect(page.getByRole('heading', { name: 'Vous êtes hors ligne' })).toBeVisible();
    await expect(page.getByText('rien n’est conservé sur l’appareil')).toBeVisible();
  });

  test('bandeau de perte de connexion', async ({ page, context }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('bandeau-hors-ligne')).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByTestId('bandeau-hors-ligne')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByTestId('bandeau-hors-ligne')).toHaveCount(0);
  });

});
