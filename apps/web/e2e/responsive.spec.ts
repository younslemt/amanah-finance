import { expect, test } from '@playwright/test';

/**
 * Rendu réel aux largeurs de référence (démonstration, données fictives) : aucun débordement
 * horizontal sur les écrans principaux. Les largeurs sont appliquées au navigateur lui-même
 * (pas une réduction d'image). Exécuté une fois, dans le projet « desktop ».
 */
const WIDTHS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

const PAGES = [
  '/dashboard', '/finance-islamique', '/zakat', '/purification', '/dons',
  '/goals', '/goals/nouveau', '/goals/calendrier', '/budget', '/budget/plan-epargne', '/wealth', '/simulation',
] as const;

for (const vp of WIDTHS) {
  test(`aucun débordement horizontal à ${vp.width} px`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'largeurs fixées explicitement : un seul projet suffit');
    await page.setViewportSize(vp);
    const problems: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('main, #contenu').first()).toBeVisible();
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        const extra = doc.scrollWidth - doc.clientWidth;
        if (extra <= 1) return null;
        // Éléments visibles qui dépassent la largeur de la fenêtre (hors zones défilantes prévues)
        const culprits = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= doc.clientWidth + 1) return false;
          for (let p = el.parentElement; p; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
          }
          return true;
        }).slice(0, 3).map((el) => `${el.tagName.toLowerCase()}${el.dataset.testid ? `[${el.dataset.testid}]` : ''} « ${(el.textContent ?? '').trim().slice(0, 40)} »`);
        return `${extra}px : ${culprits.join(' ; ')}`;
      });
      if (overflow) problems.push(`${path} → ${overflow}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}
