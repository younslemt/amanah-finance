import { expect, test } from '@playwright/test';
import { activateIslamicFinance, apiToken, completeOnboarding, euros, fakeUser, latestLink, rest, signIn, signUpAndConfirm } from './helpers';

/**
 * Sprint 5 en mode réel, sur mobile et ordinateur. Utilisateurs et montants FICTIFS.
 * Lot 5.1 : projets universels sans consentement religieux, parcours Créer → Planifier →
 * Simuler → Suivre → Réaliser, modification sans perte d'historique, projets religieux protégés.
 */
test.describe.serial('Sprint 5 — projets de vie', () => {
  let K: ReturnType<typeof fakeUser>;
  let L: ReturnType<typeof fakeUser>;

  test.beforeAll(({}, info) => {
    K = fakeUser('a', `s5k-${info.project.name}`);
    L = fakeUser('b', `s5l-${info.project.name}`);
  });

  test('projet général sans consentement religieux ; Hajj et Omra fermés', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, K);
    await page.goto(await latestLink(K.email, 'signup', sentAt));
    await completeOnboarding(page, K.name);
    await page.goto('/goals');
    const form = page.getByTestId('form-objectif');
    await expect(form.getByRole('option', { name: /^(Hajj|Omra)/ })).toHaveCount(0);
    await expect(page.getByTestId('projets-religieux-fermes')).toBeVisible();
    await form.getByLabel('Catégorie').selectOption('children_education');
    await form.getByLabel('Nom du projet (facultatif)').fill('Études fictives');
    await form.getByLabel('Montant cible (€)').fill('12 000');
    await form.getByLabel('Épargne déjà disponible (€)').fill('2 000');
    await form.getByLabel('Capacité d’épargne mensuelle (€)').fill('300');
    await form.getByRole('button', { name: 'Créer l’objectif' }).click();
    const card = page.getByRole('article').filter({ hasText: 'Études fictives' });
    await expect(card).toContainText(euros('2 000,00 €'));
    await expect(card.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'follow');
    // Côté base : un projet Hajj est refusé sans consentement
    const token = await apiToken(K);
    const [{ id: hid }] = (await (await rest(token, 'households?select=id')).json()) as Array<{ id: string }>;
    const res = await rest(token, 'rpc/create_goal_with_allocation', { method: 'POST', body: JSON.stringify({
      p_household_id: hid, p_kind: 'hajj', p_name: 'Hajj fictif', p_target_cents: 900000, p_target_date: '2029-05-01',
      p_monthly_capacity_cents: 40000, p_initial_cents: 0, p_allocated_on: '2026-11-01' }) });
    expect(res.ok).toBe(false);
  });

  test('planifier, simuler, suivre, réaliser : l’historique est conservé', async ({ page }) => {
    await signIn(page, K);
    await page.goto('/goals');
    await page.getByRole('article').filter({ hasText: 'Études fictives' }).getByTestId('lien-projet').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Études fictives');

    // Simuler : rien n'est enregistré
    await page.getByTestId('form-simuler').getByLabel('Et si j’épargnais par mois (€)').fill('500');
    await page.getByTestId('form-simuler').getByRole('button', { name: 'Simuler' }).click();
    await expect(page.getByTestId('resultat-simulation')).toContainText('rien n’est enregistré');
    await expect(page.getByTestId('resultat-simulation')).toContainText('20 mois'); // 10 000 € / 500 €

    // Suivre : mise de côté virtuelle
    const alloc = page.getByTestId('form-allocation');
    await alloc.getByLabel('Montant (€)').fill('250');
    await alloc.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByTestId('historique-affectations')).toContainText(euros('2 250,00 €'));

    // Planifier : modification de la cible, historique des affectations intact
    const plan = page.getByTestId('form-planifier');
    await plan.getByLabel('Montant cible (€)').fill('15 000');
    await plan.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByTestId('historique-modifications')).toContainText('Montant cible');
    await expect(page.getByTestId('historique-modifications')).toContainText(euros('15 000,00 €'));
    await expect(page.getByTestId('historique-affectations')).toContainText(euros('2 250,00 €'));
    await expect(page.getByTestId('plan-projet')).toContainText(euros('15 000,00 €'));

    // Réaliser puis rouvrir
    await page.getByTestId('form-realiser').getByRole('button', { name: 'Marquer comme réalisé' }).click();
    await expect(page.getByTestId('form-rouvrir')).toBeVisible();
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'realize');
    await page.getByTestId('form-rouvrir').getByRole('button').click();
    await expect(page.getByTestId('form-realiser')).toBeVisible();
    await expect(page.getByTestId('historique-modifications').getByText(/^Statut :/)).toHaveCount(2);
    // Historique en ajout seulement : écriture directe refusée
    const token = await apiToken(K);
    const [{ id: hid }] = (await (await rest(token, 'households?select=id')).json()) as Array<{ id: string }>;
    const [{ id: gid }] = (await (await rest(token, 'goals?select=id&kind=eq.children_education')).json()) as Array<{ id: string }>;
    const forged = await rest(token, 'goal_changes', { method: 'POST', body: JSON.stringify({ household_id: hid, goal_id: gid, changes: { faux: true } }) });
    expect(forged.ok).toBe(false);
  });

  test('avec consentement : projet Omra privé ; isolation entre foyers', async ({ page }) => {
    await signIn(page, K);
    await activateIslamicFinance(page, '/goals');
    const form = page.getByTestId('form-objectif');
    await form.getByLabel('Catégorie').selectOption('omra');
    await form.getByLabel('Montant cible (€)').fill('5 000');
    await form.getByLabel('Capacité d’épargne mensuelle (€)').fill('200');
    await form.getByRole('button', { name: 'Créer l’objectif' }).click();
    await expect(page.getByRole('article').filter({ hasText: 'Omra' })).toContainText('privé');

    const { sentAt } = await signUpAndConfirm(page, L);
    await page.goto(await latestLink(L.email, 'signup', sentAt));
    await completeOnboarding(page, L.name);
    const tokenK = await apiToken(K);
    const [{ id: hidK }] = (await (await rest(tokenK, 'households?select=id')).json()) as Array<{ id: string }>;
    const tokenL = await apiToken(L);
    for (const table of ['goals', 'goal_allocations', 'goal_changes']) {
      expect(await (await rest(tokenL, `${table}?select=id&household_id=eq.${hidK}`)).json()).toEqual([]);
    }
  });
});
