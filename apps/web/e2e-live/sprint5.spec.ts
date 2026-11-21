import { expect, test } from '@playwright/test';
import { activateIslamicFinance, apiToken, completeOnboarding, createGoalWithWizard, euros, fakeUser, fillEidWizard, latestLink, rest, signIn, signUpAndConfirm } from './helpers';

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
    await expect(page.getByTestId('projets-religieux-fermes')).toBeVisible();
    await page.getByTestId('ajouter-objectif').click();
    const form = page.getByTestId('form-objectif');
    await expect(form.getByTestId('etape-formulaire')).toHaveCount(3);
    await expect(form.getByRole('radio', { name: /^(Hajj|Omra)/ })).toHaveCount(0);
    await createGoalWithWizard(page, { category: 'Études des enfants', name: 'Études fictives', target: '12 000', available: '2 000', monthly: '300' });
    await expect(page.getByTestId('plan-projet')).toContainText(euros('2 000,00 €'));
    // L'épargne initiale ne vaut pas « Suivre », une date calculable ne vaut pas « Simuler » : prochaine étape « Planifier »
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'plan');
    await expect(page.getByTestId('action-principale')).toHaveAttribute('data-action', 'confirm_plan');
    await page.goto('/goals');
    await expect(page.getByRole('article').filter({ hasText: 'Études fictives' }).getByTestId('prochaine-action')).toHaveText('Valider mon plan d’épargne');
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

    // Planifier : modification de la cible et validation du plan (décision de l'utilisateur)
    const plan = page.getByTestId('form-planifier');
    await plan.getByLabel('Montant cible (€)').fill('12 000');
    await plan.getByRole('button', { name: 'Valider mon plan' }).click();
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'simulate');

    // Simuler : plusieurs scénarios comparés, rien n'est enregistré avant le choix
    const sim = page.getByTestId('form-simuler');
    await sim.getByLabel('Scénario 1 (€/mois)').fill('500');
    await sim.getByLabel('Scénario 2 (€/mois)').fill('250');
    await sim.getByLabel('Scénario 3 (€/mois)').fill('');
    await sim.getByRole('button', { name: 'Comparer' }).click();
    const scenarios = page.getByTestId('scenario');
    await expect(scenarios).toHaveCount(2);
    await expect(scenarios.first()).toContainText('20 mois'); // 10 000 € / 500 €
    await expect(scenarios.nth(1)).toContainText('40 mois');
    await expect(page.getByTestId('capacite-projet')).toContainText('Déjà engagée par vos autres projets');
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'simulate');
    await scenarios.first().getByRole('button', { name: 'Retenir ce scénario' }).click();
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'follow');
    await expect(page.getByTestId('plan-projet')).toContainText(euros('500,00 €'));

    // Suivre : mise de côté virtuelle
    const alloc = page.getByTestId('form-allocation');
    await alloc.getByLabel('Montant (€)').fill('250');
    await alloc.getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByTestId('historique-affectations')).toContainText(euros('2 250,00 €'));
    await expect(page.getByTestId('action-principale')).toHaveAttribute('data-action', 'keep_saving');

    // Modifier : historique des affectations intact
    await page.getByTestId('form-planifier').getByLabel('Montant cible (€)').fill('15 000');
    await page.getByTestId('form-planifier').getByRole('button', { name: /valider mon plan/i }).click();
    await expect(page.getByTestId('historique-modifications')).toContainText('Montant cible');
    await expect(page.getByTestId('historique-modifications')).toContainText(euros('15 000,00 €'));
    await expect(page.getByTestId('historique-modifications')).toContainText('Stratégie retenue');
    await expect(page.getByTestId('historique-affectations')).toContainText(euros('2 250,00 €'));
    await expect(page.getByTestId('plan-projet')).toContainText(euros('15 000,00 €'));

    // Réaliser puis rouvrir
    await page.getByTestId('form-realiser').getByRole('button', { name: 'Marquer comme réalisé' }).click();
    await expect(page.getByTestId('form-rouvrir')).toBeVisible();
    await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'realize');
    await expect(page.getByTestId('action-principale')).toHaveAttribute('data-action', 'explore_solutions');
    await page.getByTestId('action-principale').click();
    await expect(page.getByTestId('familles-solutions')).toContainText('Prestataires éducatifs');
    await expect(page.getByText('aucune de vos données n’est transmise')).toBeVisible();
    await page.goBack();
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
    await createGoalWithWizard(page, { category: 'Omra', target: '5 000', monthly: '200' });
    await page.goto('/goals');
    await expect(page.getByRole('article').filter({ hasText: 'Omra' })).toContainText('privé');

    await page.context().clearCookies(); // fin de session de K avant l'inscription de L
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

  test('Aïd : budget, date estimée puis confirmée avec sa source, historique', async ({ page }) => {
    await signIn(page, K);
    await page.goto('/goals');
    await page.getByTestId('lien-preparer-aid').click();
    const form = await fillEidWizard(page, { sacrifice: '350', extras: '80', family: '100', monthly: '50' });
    await form.getByRole('button', { name: 'Créer mon projet Aïd' }).click();
    await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}\?cree=1$/, { timeout: 15_000 });
    await expect(page.getByTestId('budget-aid')).toContainText(euros('330,00 €'));
    await expect(page.getByTestId('date-aid')).toContainText('Saisie, non confirmée');

    await page.getByText('Modifier ou confirmer la date').click();
    const date = page.getByTestId('form-aid-date');
    await date.getByLabel('Oui, confirmée par une source que j’indique').check();
    await date.getByRole('button', { name: 'Enregistrer la date' }).click();
    await expect(date.getByRole('alert')).toContainText('source');
    await date.getByLabel('Source de la date (si confirmée)').fill('Annonce fictive de la mosquée');
    await date.getByRole('button', { name: 'Enregistrer la date' }).click();
    await expect(page.getByTestId('date-aid')).toContainText('Confirmée par vous — source : Annonce fictive de la mosquée');
    // Texte libre saisi : aucun débordement horizontal sur mobile
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId('historique-modifications')).toContainText('Date de l’Aïd : saisie, non confirmée → confirmée');
    await expect(page.getByTestId('reconduction-aid')).toContainText('Disponible après la réalisation');
  });

  test('Aïd : reconduction contrôlée, une seule fois, sans reprise des montants', async ({ page }) => {
    await signIn(page, K);
    await page.goto('/goals');
    await page.getByRole('article').filter({ hasText: 'Aïd al-Adha' }).getByTestId('lien-projet').click();
    await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}$/); // navigation terminée avant de lire l'adresse
    await expect(page.getByTestId('budget-aid')).toBeVisible();
    const url = page.url();
    await page.getByTestId('form-allocation').getByLabel('Montant (€)').fill('120');
    await page.getByTestId('form-allocation').getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByTestId('historique-affectations')).toContainText(euros('120,00 €'));
    await page.getByTestId('form-realiser').getByRole('button', { name: 'Marquer comme réalisé' }).click();
    await page.getByTestId('lien-reconduire').click();
    await expect(page.getByTestId('form-aid').getByLabel('Sacrifice ou quote-part (€)')).toHaveValue('350,00'); // budget repris, modifiable
    const form = await fillEidWizard(page, { monthly: '50' });
    await form.getByRole('button', { name: 'Créer l’Aïd de l’année suivante' }).click();
    await expect(page).toHaveURL(/\/goals\/[0-9a-f-]{36}\?cree=1$/, { timeout: 15_000 });
    expect(page.url().split('?')[0]).not.toBe(url);
    await expect(page.getByText('Aucune affectation.')).toBeVisible(); // aucun montant repris
    await page.goto(url);
    await expect(page.getByTestId('reconduction-aid')).toContainText('Reconduit');
    await expect(page.getByTestId('historique-affectations')).toContainText(euros('120,00 €'));
    // Reconduction multiple accidentelle : refusée
    await page.goto(`/goals/aid?suite=${url.split('/').pop()}`);
    const again = await fillEidWizard(page, { monthly: '50' });
    await again.getByRole('button', { name: 'Créer l’Aïd de l’année suivante' }).click();
    await expect(again.getByRole('alert')).toContainText('déjà');
  });

  test('plan d’épargne : capacité, répartition, priorités, dépassement ; R7 expliquée', async ({ page }) => {
    await signIn(page, K);
    await page.goto('/budget');
    await page.getByTestId('lien-plan-epargne').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan d’épargne des projets');
    await page.getByTestId('form-capacite').getByLabel('Capacité mensuelle (€)').fill('500');
    await page.getByTestId('form-capacite').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('synthese-plan')).toContainText(euros('500,00 €'));
    await expect(page.getByTestId('synthese-plan')).toContainText('déclarée par vous');

    // Montants prévus : Études 100 €, Omra 150 €, Aïd 50 € → 300 € affectés, 200 € libres
    const plan = page.getByTestId('form-plan-epargne');
    await plan.getByLabel('Montant mensuel pour « Études fictives » (€)').fill('100');
    await plan.getByLabel('Montant mensuel pour « Omra » (€)').fill('150');
    await plan.getByLabel(/Montant mensuel pour « Aïd al-Adha \d{4} » \(€\)/).fill('50');
    await plan.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByTestId('synthese-plan')).toContainText(euros('300,00 €'));
    await expect(page.getByTestId('synthese-plan')).toContainText(euros('200,00 €'));
    await expect(page.getByTestId('synthese-plan')).toContainText('Plan équilibré');

    // Dépassement : capacité 200 € pour 300 € prévus, le projet le moins prioritaire n'est pas couvert en entier
    await page.getByTestId('form-capacite').getByLabel('Capacité mensuelle (€)').fill('200');
    await page.getByTestId('form-capacite').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('synthese-plan')).toContainText('Le plan dépasse votre capacité');
    await expect(page.getByTestId('lignes-plan')).toContainText('Capacité insuffisante');

    // Priorités modifiables : le premier projet passe en priorité 1
    await page.getByTestId('form-plan-epargne').getByRole('combobox').first().selectOption('1');
    await page.getByTestId('form-plan-epargne').getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByTestId('ligne-plan').first()).toContainText('Priorité 1');

    // R7 : les études (100 €/mois) ne tiendront pas leur date souhaitée
    await page.goto('/recommandations');
    const r7 = page.locator('[data-rule="R7"]').first();
    await expect(r7).toContainText('Projet en retard');
    await expect(r7).toContainText('Scénarios possibles');
    await expect(r7).toContainText('Effort d’épargne actuel');
  });
});
