import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { AUDIT_ROUTES, inventory, type ScreenInventory } from './audit-inventaire';

/**
 * Audit fonctionnel (démonstration) : inventaire de chaque écran, sans rien modifier.
 * Le résultat (`audit-demo.json`) est imprimé dans le journal de CI pour la matrice fonctionnelle.
 */
test('inventaire des écrans en démonstration', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'inventaire exécuté une fois');
  const out: ScreenInventory[] = [];
  await page.goto('/goals');
  const goalHref = await page.getByTestId('lien-projet').first().getAttribute('href');
  for (const route of [...AUDIT_ROUTES, goalHref!, `${goalHref}/solutions`]) {
    const inv = await inventory(page, route);
    expect(inv.status, route).toBe(200);
    out.push(inv);
  }
  writeFileSync(info.outputPath('audit-demo.json'), JSON.stringify(out, null, 2));
  console.log('=====AUDIT-JSON demo=====');
  console.log(JSON.stringify(out));
  console.log('=====FIN-AUDIT-JSON=====');
});
