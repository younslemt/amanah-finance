import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { activateIslamicFinance, completeOnboarding, fakeUser, latestLink, openProfileMenu, signIn, signUpAndConfirm } from './helpers';

/**
 * Lot 3, foyer à deux membres (mode réel, Supabase local) : la synthèse Purification de
 * « Mes engagements » et du détail ne compte que les éléments de la personne connectée, même
 * lorsque l'autre membre partage les siens ; les éléments partagés restent consultables.
 * Puis membre en lecture seule : aucune action d'écriture présentée comme réalisable.
 *
 * L'application n'a pas encore de parcours d'invitation : le rattachement au foyer, le partage et
 * les éléments de purification sont préparés par une fixture SQL sur la base LOCALE et jetable
 * de la CI (E2E_DB_URL). Rien de cela n'existe côté navigateur. Utilisateurs et montants FICTIFS.
 */
const DB = process.env.E2E_DB_URL;
const sql = (q: string) => execFileSync('psql', [DB!, '-v', 'ON_ERROR_STOP=1', '-At', '-c', q], { encoding: 'utf8' }).trim();

const cents = (text: string) => {
  const all = [...text.replace(/[  ]/g, ' ').matchAll(/(?<![\d,])(\d{1,3}(?: \d{3})*(?:,\d{2})?) ?€/g)];
  const m = all.at(-1);
  if (!m) throw new Error(`montant introuvable : ${text}`);
  return Math.round(Number(m[1]!.replace(/ /g, '').replace(',', '.')) * 100);
};
const amountOf = async (page: Page, testId: string) => cents(await page.getByTestId(testId).locator('dd').innerText());

test.describe.serial('Lot 3 — foyer à deux membres : engagements personnels et lecture seule', () => {
  test.skip(!DB, 'E2E_DB_URL absent : fixture SQL du foyer indisponible');
  test.skip(({ isMobile }) => isMobile, 'scénario de foyer exécuté une fois (ordinateur)');

  let A: ReturnType<typeof fakeUser>;
  let B: ReturnType<typeof fakeUser>;
  test.beforeAll(() => { A = fakeUser('a', 'foyer-l3'); B = fakeUser('b', 'foyer-l3'); });

  test('deux membres consentants, partage activé, montants différents', async ({ browser }) => {
    // Inscription, profil et consentement article 9 des deux membres (parcours réels)
    for (const u of [A, B]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const { sentAt } = await signUpAndConfirm(page, u);
      await page.goto(await latestLink(u.email, 'signup', sentAt));
      await completeOnboarding(page, u.name);
      await activateIslamicFinance(page, '/dons');
      await ctx.close();
    }

    // Fixture : B rejoint le foyer de A comme membre ; partage choisi par les deux ;
    // A : 10,00 € confirmés à purifier + 20,00 € détectés ; B : 3,70 € confirmés à purifier
    const a = sql(`select id from auth.users where email = '${A.email}'`);
    const b = sql(`select id from auth.users where email = '${B.email}'`);
    const hid = sql(`select household_id from public.household_members where user_id = '${a}'`);
    sql(`delete from public.households where created_by = '${b}';
         insert into public.household_members (household_id, user_id, role) values ('${hid}', '${b}', 'member');
         insert into public.religious_preferences (user_id, share_with_household) values ('${a}', true), ('${b}', true)
           on conflict (user_id) do update set share_with_household = true;
         insert into public.accounts (household_id, name) values ('${hid}', 'Compte commun fictif');
         insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash, is_interest)
         select '${hid}', (select id from public.accounts where household_id = '${hid}' limit 1), current_date - 10, v.c, 'INTERETS FICTIFS', 'csv', v.h || '-${hid}', true
         from (values (1000, 'l3-a1'), (2000, 'l3-a2'), (370, 'l3-b1')) v(c, h);
         insert into public.purification_items (household_id, owner_id, transaction_id, source_kind, credited_cents, occurred_on, status, basis, basis_source, amount_to_purify_cents)
         select '${hid}', case when t.dedupe_hash like 'l3-b%' then '${b}'::uuid else '${a}'::uuid end, t.id, 'bank_interest', t.amount_cents, t.booked_on,
                (case when t.dedupe_hash like 'l3-a2%' then 'detected' else 'confirmed' end)::public.purification_status,
                (case when t.dedupe_hash like 'l3-a2%' then null else 'net_credited' end)::public.purification_basis,
                case when t.dedupe_hash like 'l3-a2%' then null else 'user_choice' end,
                case when t.dedupe_hash like 'l3-a2%' then null else t.amount_cents end
         from public.transactions t where t.household_id = '${hid}' and t.dedupe_hash like 'l3-%';`);

    // B : ses montants seulement ; les 2 éléments de A sont signalés comme partagés, non comptés
    const ctxB = await browser.newContext();
    const pb = await ctxB.newPage();
    await signIn(pb, B);
    await pb.goto('/finance-islamique');
    expect(await amountOf(pb, 'purification-a-purifier')).toBe(370);
    expect(await amountOf(pb, 'purification-detectees')).toBe(0);
    await expect(pb.getByTestId('purification-decisions').locator('dd')).toHaveText('1');
    await expect(pb.getByTestId('purification-perimetre')).toHaveAttribute('data-shared', '2');
    const html = await pb.getByTestId('engagement-purification').innerText();
    expect(html).not.toMatch(/10,00|20,00|13,70/);
    await expect(pb.getByTestId('lien-purification')).toHaveText('Confirmer les montants à purifier');
    // Le lien mène au détail, dont la synthèse donne les MÊMES montants personnels
    await pb.getByTestId('lien-purification').click();
    await expect(pb).toHaveURL(/\/purification$/);
    const synth = pb.getByTestId('synthese-purification');
    expect(cents(await synth.getByText(/^À purifier$/).locator('xpath=following-sibling::p[1]').innerText())).toBe(370);
    expect(cents(await synth.getByText(/^À examiner \(net\)$/).locator('xpath=following-sibling::p[1]').innerText())).toBe(0);
    await expect(pb.getByTestId('purification-perimetre-detail')).toHaveAttribute('data-shared', '2');
    // Les éléments partagés restent consultables, signalés, sans action pour B
    await expect(pb.getByText('partagé par un membre du foyer').first()).toBeVisible();
    // Accueil : bloc « Mes engagements » cohérent (à examiner : aucun élément détecté de B)
    await pb.goto('/dashboard');
    expect(cents(await pb.getByTestId('purification-accueil').locator('p').first().innerText())).toBe(0);
    await expect(pb.getByTestId('purification-accueil')).not.toContainText(/20,00/);

    // A : ses propres montants
    const ctxA = await browser.newContext();
    const pa = await ctxA.newPage();
    await signIn(pa, A);
    await pa.goto('/finance-islamique');
    expect(await amountOf(pa, 'purification-a-purifier')).toBe(1_000);
    expect(await amountOf(pa, 'purification-detectees')).toBe(2_000);
    await expect(pa.getByTestId('purification-perimetre')).toHaveAttribute('data-shared', '1');
    await ctxA.close();

    // B passe en lecture seule : plus aucune action d'écriture présentée comme réalisable
    sql(`update public.household_members set role = 'viewer' where user_id = '${b}'`);
    await pb.goto('/finance-islamique');
    await expect(pb.getByTestId('lien-purification')).toHaveText('Consulter les opérations de purification');
    await expect(pb.getByTestId('lien-calcul-zakat')).toHaveText('Consulter le calcul');
    for (const id of ['lien-enregistrer-don', 'lien-contribution-zakat', 'lien-contribution-purification']) await expect(pb.getByTestId(id)).toHaveCount(0);
    await expect(pb.getByTestId('mes-engagements').getByRole('link', { name: /^(Confirmer|Compléter|Enregistrer|Revoir)/ })).toHaveCount(0);
    // Accueil en lecture seule : consulter les dons, pas en enregistrer
    await pb.goto('/dashboard');
    await expect(pb.getByTestId('solidarite-accueil').getByRole('link')).toHaveText('Voir les dons');
    await pb.goto('/finance-islamique');
    // Ses montants restent consultables
    expect(await amountOf(pb, 'purification-a-purifier')).toBe(370);
    // Ni bouton « + », ni import dans le menu profil
    await expect(pb.getByTestId('bouton-actions-rapides-ordinateur')).toHaveCount(0);
    await expect(pb.getByTestId('bouton-actions-rapides')).toHaveCount(0);
    const panel = await openProfileMenu(pb);
    await expect(panel.getByTestId('lien-profil')).toHaveText(['Mes comptes', 'Mes recommandations', 'Paramètres', 'Préférences d’affichage', 'Consentements']);
    await pb.keyboard.press('Escape');
    await pb.setViewportSize({ width: 1440, height: 900 });
    await pb.screenshot({ path: test.info().outputPath('lot3-reel-lecture-seule-1440.jpg'), fullPage: true, type: 'jpeg', quality: 75 });
    await ctxB.close();
  });
});
