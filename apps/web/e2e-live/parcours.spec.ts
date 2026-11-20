import { expect, test } from '@playwright/test';
import {
  activateIslamicFinance, apiToken, completeOnboarding, euros, fakeUser, latestLink, rest, signIn, signUpAndConfirm, visibleButton,
} from './helpers';

/**
 * Parcours Sprint 1 en mode réel, sur mobile et ordinateur.
 * Deux utilisateurs FICTIFS (A et B), montants fictifs. Les étapes dépendent les unes des autres.
 */
test.describe.serial('Sprint 1 — parcours réel', () => {
  let A: ReturnType<typeof fakeUser>;
  let B: ReturnType<typeof fakeUser>;

  test.beforeAll(({}, info) => {
    A = fakeUser('a', info.project.name);
    B = fakeUser('b', info.project.name);
  });

  test('1-2. inscription, connexion refusée avant confirmation, confirmation par e-mail', async ({ page }) => {
    // Validation du formulaire : mots de passe différents
    await page.goto('/inscription');
    await page.getByLabel('Adresse e-mail').fill(A.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(A.password);
    await page.getByLabel('Confirmer le mot de passe').fill('autre-mot-2026');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('ne correspondent pas');

    const { sentAt } = await signUpAndConfirm(page, A);

    await signIn(page, A, { expectSuccess: false });
    await expect(page.getByRole('main').getByRole('alert')).toContainText('pas encore confirmée');

    await page.goto(await latestLink(A.email, 'signup', sentAt));
    await expect(page).toHaveURL(/\/bienvenue\/consentements/);
  });

  test('3-4. consentements obligatoires puis profil', async ({ page }) => {
    await signIn(page, A);
    await expect(page).toHaveURL(/\/bienvenue\/consentements/);
    // Les pages privées restent inaccessibles tant que le parcours n'est pas terminé
    await page.goto('/budget');
    await expect(page).toHaveURL(/\/bienvenue\/consentements/);
    // Envoi sans cocher : refusé
    await page.getByRole('button', { name: 'Accepter et continuer' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Chaque case doit être cochée');
    await completeOnboarding(page, A.name);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(A.name);
    await expect(page.getByText('Votre espace est prêt')).toBeVisible();
  });

  test('5. compte, revenus et dépenses, validation des formulaires', async ({ page }) => {
    await signIn(page, A);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/comptes');
    await page.getByLabel('Nom du compte').fill('Compte principal');
    await page.getByLabel('Solde de départ (€)').fill('1 000,00');
    await page.getByRole('button', { name: 'Ajouter le compte' }).click();
    await expect(page.getByRole('status')).toContainText('Compte ajouté');
    await expect(page.getByTestId('liste-comptes')).toContainText('Compte principal');

    await page.goto('/budget');
    const form = page.getByTestId('form-operation');
    // Montant illisible : refusé
    await form.getByLabel('Montant (€)').fill('abc');
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(form.getByRole('alert')).toContainText('illisible');
    // Revenu
    await form.getByLabel('Type').selectOption('income');
    await form.getByLabel('Montant (€)').fill('2 500');
    await form.getByLabel('Catégorie').selectOption('salaire');
    await form.getByLabel('Description (facultatif)').fill('Salaire fictif');
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(form.getByRole('status')).toContainText('Revenu enregistré');
    // Dépense
    await form.getByLabel('Type').selectOption('expense');
    await form.getByLabel('Montant (€)').fill('42,50');
    await form.getByLabel('Catégorie').selectOption('alimentation');
    await form.getByLabel('Description (facultatif)').fill('Courses fictives');
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(form.getByRole('status')).toContainText('Dépense enregistrée');

    await page.reload();
    await expect(page.getByTestId('liste-operations')).toContainText('Courses fictives');
    await expect(page.getByTestId('liste-operations')).toContainText('Salaire fictif');

    // Budget mensuel
    const budget = page.getByTestId('form-budget');
    await budget.getByLabel('Catégorie').selectOption('alimentation');
    await budget.getByLabel(/Plafond pour/).fill('400');
    await budget.getByRole('button', { name: 'Enregistrer le budget' }).click();
    await expect(budget.getByRole('status')).toContainText('Budget enregistré');
  });

  test('6. objectif Hajj : consentement article 9, cible, épargne disponible, date, capacité, progression', async ({ page }) => {
    await signIn(page, A);
    await page.goto('/goals');
    // Sprint 2 : l'objectif Hajj demande le consentement article 9, distinct de l'accès à l'application
    await expect(page.getByTestId('form-hajj')).toHaveCount(0);
    await activateIslamicFinance(page, '/goals');
    const form = page.getByTestId('form-hajj');
    await form.getByLabel('Montant cible (€)').fill('9 000');
    await form.getByLabel('Épargne déjà disponible (€)').fill('1 500');
    await form.getByLabel('Capacité d’épargne mensuelle (€)').fill('400');
    await form.getByRole('button', { name: 'Créer l’objectif' }).click();
    await expect(form.getByRole('status')).toContainText('Objectif Hajj créé');
    await page.reload();
    const card = page.getByRole('article').filter({ hasText: 'Hajj' }).first();
    await expect(card).toContainText(euros('1 500,00 €'));
    await expect(card).toContainText(euros('9 000,00 €'));
    await expect(card.getByTestId('progression')).toHaveText('17 %'); // 1 500 / 9 000
  });

  test('7. le dashboard est alimenté par les données enregistrées', async ({ page }) => {
    await signIn(page, A);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(euros('3 457,50 €')).first()).toBeVisible(); // 1 000 + 2 500 − 42,50
    await expect(page.getByText('Hajj').first()).toBeVisible();
  });

  test('8-9. déconnexion, accès refusé, reconnexion et données retrouvées', async ({ page }) => {
    await signIn(page, A);
    await expect(page).toHaveURL(/\/dashboard/);
    await visibleButton(page, 'Se déconnecter').click();
    await expect(page).toHaveURL(/\/connexion/);
    await page.goto('/budget');
    await expect(page).toHaveURL(/\/connexion/);

    await signIn(page, A);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(euros('3 457,50 €')).first()).toBeVisible();
    await page.goto('/budget');
    await expect(page.getByTestId('liste-operations')).toContainText('Courses fictives');
    await page.goto('/goals');
    await expect(page.getByRole('article').filter({ hasText: 'Hajj' }).first()).toContainText(euros('1 500,00 €'));
  });

  test('isolation : B ne voit rien de A, par l’interface comme par l’API', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, B);
    await page.goto(await latestLink(B.email, 'signup', sentAt));
    await completeOnboarding(page, B.name);
    await expect(page.getByText('Votre espace est prêt')).toBeVisible();
    await page.goto('/budget');
    await expect(page.getByText('Aucune opération ce mois-ci.')).toBeVisible();

    const tokenA = await apiToken(A);
    const tokenB = await apiToken(B);
    const [hA] = (await (await rest(tokenA, 'households?select=id')).json()) as Array<{ id: string }>;
    const [accA] = (await (await rest(tokenA, 'accounts?select=id')).json()) as Array<{ id: string }>;
    const [goalA] = (await (await rest(tokenA, 'goals?select=id')).json()) as Array<{ id: string }>;
    expect(hA?.id && accA?.id && goalA?.id).toBeTruthy();

    // Lecture : aucune donnée de A visible pour B
    for (const table of ['transactions', 'accounts', 'goals', 'goal_allocations', 'budgets', 'account_balances', 'audit_log']) {
      const rows = (await (await rest(tokenB, `${table}?select=*&household_id=eq.${hA.id}`)).json()) as unknown[];
      expect(rows, `lecture ${table}`).toEqual([]);
    }
    // Consentements et profils : B ne voit que les siens
    const consentOwners = new Set(((await (await rest(tokenB, 'consents?select=user_id')).json()) as Array<{ user_id: string }>).map((c) => c.user_id));
    expect(consentOwners.size).toBe(1);
    const profiles = (await (await rest(tokenB, 'profiles?select=id')).json()) as unknown[];
    expect(profiles).toHaveLength(1);
    // Écriture dans le foyer de A : refusée
    const insert = await rest(tokenB, 'transactions', { method: 'POST', body: JSON.stringify({
      household_id: hA.id, account_id: accA.id, booked_on: '2026-11-01', amount_cents: -1, source: 'manual', dedupe_hash: 'intrusion',
    }) });
    expect(insert.status, 'insertion dans le foyer de A').toBeGreaterThanOrEqual(400);
    // Modification de l'objectif de A : aucune ligne touchée
    const patch = await rest(tokenB, `goals?id=eq.${goalA.id}`, { method: 'PATCH', body: JSON.stringify({ target_cents: 1 }) });
    expect((await patch.json()) as unknown[]).toEqual([]);
    // L'objectif de A est intact
    const [goalCheck] = (await (await rest(tokenA, `goals?select=target_cents&id=eq.${goalA.id}`)).json()) as Array<{ target_cents: number }>;
    expect(goalCheck.target_cents).toBe(900_000);
  });

  test('mot de passe oublié : lien, nouveau mot de passe, connexion', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie');
    await page.getByLabel('Adresse e-mail').fill(A.email);
    const sentAt = Date.now() - 2000;
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('status')).toContainText('Si un compte correspond');
    await page.goto(await latestLink(A.email, 'recovery', sentAt));
    await expect(page).toHaveURL(/\/reinitialiser/);
    A.password = 'Nouveau-mdp-2026';
    await page.getByLabel('Nouveau mot de passe').fill(A.password);
    await page.getByLabel('Confirmer le mot de passe').fill(A.password);
    await page.getByRole('button', { name: 'Enregistrer le mot de passe' }).click();
    await expect(page).toHaveURL(/\/connexion\?message=password_updated/);
    await signIn(page, A);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('retrait du consentement article 9 : seules les fonctions religieuses sont fermées, puis rétablies', async ({ page }) => {
    await signIn(page, A);
    await page.goto('/finance-islamique');
    const form = page.getByTestId('form-retrait-finance-islamique');
    await form.getByLabel(/Les conserver/).check();
    await form.getByRole('button', { name: 'Retirer mon consentement' }).click();
    await expect(page).toHaveURL(/\/finance-islamique\?retrait=keep/);
    // Budget et tableau de bord restent accessibles
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('dashboard-finance-islamique')).toHaveCount(0);
    await page.goto('/budget');
    await expect(page.getByTestId('liste-operations')).toContainText('Courses fictives');
    // Objectif Hajj : fermé dans l'interface ET dans la base
    await page.goto('/goals');
    await expect(page.getByTestId('lien-activer-finance-islamique')).toBeVisible();
    await expect(page.getByRole('article').filter({ hasText: 'Hajj' })).toHaveCount(0);
    const goals = (await (await rest(await apiToken(A), 'goals?select=id&kind=eq.hajj')).json()) as unknown[];
    expect(goals).toEqual([]);
    // Nouveau consentement : données conservées retrouvées
    await activateIslamicFinance(page, '/goals');
    await expect(page.getByRole('article').filter({ hasText: 'Hajj' }).first()).toContainText(euros('1 500,00 €'));
  });

  test('suppression du compte de B : données effacées, connexion impossible', async ({ page }) => {
    await signIn(page, B);
    await page.goto('/parametres');
    const form = page.getByTestId('form-suppression');
    await form.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('non');
    await form.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(form.getByRole('alert')).toContainText('SUPPRIMER');
    await form.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER');
    await form.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page).toHaveURL(/\/connexion\?message=account_deleted/);
    await signIn(page, B, { expectSuccess: false });
    await expect(page.getByRole('main').getByRole('alert')).toContainText('incorrect');
    await expect(apiToken(B)).rejects.toThrow();
  });
});
