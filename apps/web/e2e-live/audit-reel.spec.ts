import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { AUDIT_ROUTES, inventory, type ScreenInventory } from '../e2e/audit-inventaire';
import { activateIslamicFinance, completeOnboarding, createGoalWithWizard, fakeUser, latestLink, signIn, signUpAndConfirm } from './helpers';

/**
 * Audit fonctionnel (mode réel) : inventaire de chaque écran pour un propriétaire du foyer, puis pour
 * un membre en LECTURE SEULE du même foyer (rattachement par fixture SQL sur la base locale de CI).
 * Rien n'est modifié par l'inventaire. Résultat imprimé dans le journal de CI.
 */
const DB = process.env.E2E_DB_URL;
const sql = (q: string) => execFileSync('psql', [DB!, '-v', 'ON_ERROR_STOP=1', '-At', '-c', q], { encoding: 'utf8' }).trim();

test.describe.serial('Audit — inventaire des écrans en mode réel', () => {
  test.skip(({ isMobile }) => isMobile, 'inventaire exécuté une fois (ordinateur)');
  let O: ReturnType<typeof fakeUser>;
  let V: ReturnType<typeof fakeUser>;
  let goalPath = '';
  test.beforeAll(() => { O = fakeUser('a', 'audit-o'); V = fakeUser('b', 'audit-v'); });

  test('propriétaire, avec consentement', async ({ page }, info) => {
    const { sentAt } = await signUpAndConfirm(page, O);
    await page.goto(await latestLink(O.email, 'signup', sentAt));
    await completeOnboarding(page, O.name);
    await activateIslamicFinance(page, '/dons');
    await page.goto('/comptes');
    await page.getByLabel('Nom du compte').fill('Compte courant fictif');
    await page.getByLabel('Type').selectOption('current');
    await page.getByLabel('Solde de départ (€)').fill('1000');
    await page.getByRole('button', { name: 'Ajouter le compte' }).click();
    await expect(page.getByTestId('liste-comptes')).toContainText('Compte courant fictif');
    await createGoalWithWizard(page, { category: 'Études des enfants', name: 'Études fictives', target: '3 000', monthly: '100' });
    goalPath = new URL(page.url()).pathname;
    const out: ScreenInventory[] = [];
    for (const route of [...AUDIT_ROUTES, goalPath, `${goalPath}/solutions`]) {
      const inv = await inventory(page, route);
      expect(inv.status, route).toBe(200);
      out.push(inv);
    }
    writeFileSync(info.outputPath('audit-reel-proprietaire.json'), JSON.stringify(out, null, 2));
    console.log('=====AUDIT-JSON reel-proprietaire=====');
    console.log(JSON.stringify(out));
    console.log('=====FIN-AUDIT-JSON=====');
  });

  test('membre en lecture seule du même foyer, avec consentement', async ({ page }, info) => {
    test.skip(!DB, 'E2E_DB_URL absent : fixture SQL indisponible');
    const { sentAt } = await signUpAndConfirm(page, V);
    await page.goto(await latestLink(V.email, 'signup', sentAt));
    await completeOnboarding(page, V.name);
    await activateIslamicFinance(page, '/dons');
    const o = sql(`select id from auth.users where email = '${O.email}'`);
    const v = sql(`select id from auth.users where email = '${V.email}'`);
    const hid = sql(`select household_id from public.household_members where user_id = '${o}'`);
    sql(`delete from public.households where created_by = '${v}';
         insert into public.household_members (household_id, user_id, role) values ('${hid}', '${v}', 'viewer');`);
    await signIn(page, V);
    const out: ScreenInventory[] = [];
    for (const route of [...AUDIT_ROUTES, goalPath, `${goalPath}/solutions`]) {
      const inv = await inventory(page, route);
      expect(inv.status, route).toBe(200);
      out.push(inv);
    }
    writeFileSync(info.outputPath('audit-reel-lecture-seule.json'), JSON.stringify(out, null, 2));
    console.log('=====AUDIT-JSON reel-lecture-seule=====');
    console.log(JSON.stringify(out));
    console.log('=====FIN-AUDIT-JSON=====');
  });
});
