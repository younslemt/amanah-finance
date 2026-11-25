import { expect, test, type Page } from '@playwright/test';
import { completeOnboarding, fakeUser, latestLink, signUpAndConfirm } from './helpers';

/**
 * Connecteur Enable Banking de bout en bout, en mode réel, contre un serveur Enable Banking SIMULÉ
 * (e2e-live/fake-enable-banking.mjs, démarré par la CI). Données FICTIVES, aucune banque réelle.
 * Le serveur simulé vérifie la signature RS256 de chaque appel : la clé privée de l'application
 * reste côté serveur Next.js.
 */
const MOCK = process.env.E2E_EB_MOCK_URL;
test.skip(!MOCK, 'serveur Enable Banking simulé absent');
test.skip(({ isMobile }) => isMobile, 'parcours bancaire exécuté une fois (ordinateur)');

const euros = (s: string) => new RegExp(s.replace(/ /g, '[\\s\\u00a0\\u202f]'));

async function connect(page: Page, choice: 'Autoriser l’accès' | 'Refuser') {
  await page.goto('/comptes/banque');
  const form = page.getByTestId('form-connecter-banque');
  await form.getByLabel('Votre banque').selectOption({ label: 'Mock ASPSP' });
  await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: 'Continuer vers ma banque' }).click();
  // Banque simulée : authentification forte chez la banque, aucun identifiant saisi dans Amanah
  await expect(page).toHaveURL(new RegExp(`^${MOCK!.replace(/[.]/g, '\\.')}/banque-simulee`));
  await page.getByRole('link', { name: choice }).click();
  await expect(page).toHaveURL(/\/comptes\/banque\?resultat=/);
}

test.describe.serial('Connexion bancaire Enable Banking (sandbox simulée)', () => {
  const U = fakeUser('a', 'banque');

  test('connexion, comptes, transactions, synchronisation sans doublon, erreurs, expiration, révocation, suppression', async ({ page, request }) => {
    const { sentAt } = await signUpAndConfirm(page, U);
    await page.goto(await latestLink(U.email, 'signup', sentAt));
    await completeOnboarding(page, U.name);

    // Accès depuis Mes comptes ; environnement simulé clairement signalé
    await page.goto('/comptes');
    await page.getByTestId('lien-connecter-banque').click();
    await expect(page.getByTestId('banque-environnement')).toHaveAttribute('data-env', 'sandbox');
    await expect(page.getByTestId('banque-engagements')).toContainText('ne demande ni ne voit jamais vos identifiants');
    await expect(page.getByTestId('banque-engagements')).toContainText('Aucun paiement ne peut être initié');
    const options = await page.getByTestId('form-connecter-banque').getByLabel('Votre banque').locator('option').allTextContents();
    expect(options).toEqual(['Choisir…', 'Banque Fictive Belge', 'Mock ASPSP']);

    // Sans accord explicite : refus
    const form = page.getByTestId('form-connecter-banque');
    await form.getByLabel('Votre banque').selectOption({ label: 'Mock ASPSP' });
    await form.evaluate((f) => (f as HTMLFormElement).noValidate = true);
    await form.getByRole('button', { name: 'Continuer vers ma banque' }).click();
    await expect(form.getByRole('alert').first()).toBeVisible();

    // Autorisation chez la banque simulée → comptes et opérations comptabilisées importés
    await connect(page, 'Autoriser l’accès');
    await expect(page.getByTestId('banque-resultat')).toHaveAttribute('data-resultat', 'connecte');
    await expect(page.getByTestId('banque-resultat')).toContainText('4 opération(s) importée(s)'); // 3 + 1, l'opération en attente est écartée
    const conn = page.getByTestId('connexion-bancaire').first();
    await expect(conn).toHaveAttribute('data-statut', 'active');
    await expect(conn.getByTestId('comptes-relies')).toContainText('Compte à vue fictif (…6769)');
    await expect(conn.getByTestId('comptes-relies')).toContainText('Épargne fictive (…0404)');
    // Jamais d'IBAN complet
    expect(await page.content()).not.toContain('BE71096123456769');

    // Les moteurs existants voient les données : soldes alignés sur la banque, opérations au budget
    await page.goto('/comptes');
    await expect(page.getByTestId('liste-comptes')).toContainText(euros('1 535,65 €'));
    await expect(page.getByTestId('liste-comptes')).toContainText(euros('5 003,21 €'));
    await page.goto('/budget');
    await expect(page.locator('main')).toContainText('LOYER FICTIF');
    await expect(page.locator('main')).not.toContainText('EN ATTENTE FICTIF');

    // Nouvelle synchronisation : rien de nouveau, aucun doublon
    await page.goto('/comptes/banque');
    await page.getByTestId('form-synchroniser').first().getByRole('button').click();
    await expect(page.getByTestId('form-synchroniser').first().getByRole('status')).toContainText('0 nouvelle(s) opération(s)');
    await page.goto('/comptes');
    await expect(page.getByTestId('liste-comptes')).toContainText(euros('1 535,65 €'));

    // Refus à la banque : signalé, aucune donnée
    await connect(page, 'Refuser');
    await expect(page.getByTestId('banque-resultat')).toHaveAttribute('data-resultat', 'echec');
    await expect(page.getByTestId('banque-resultat')).toContainText('Autorisation refusée ou annulée à la banque.');

    // Retour falsifié (jeton anti-CSRF inconnu) : refusé
    await page.goto('/api/banque/retour?code=falsifie&state=falsifie');
    await expect(page.getByTestId('banque-resultat')).toContainText('Retour de la banque non reconnu');
    // Message affiché choisi par code, jamais recopié de l'adresse
    await page.goto('/comptes/banque?resultat=echec&motif=%3Cscript%3E');
    await expect(page.getByTestId('banque-resultat')).toHaveCount(0);

    // Accès expiré côté banque : signalé, reconnexion demandée
    expect((await request.get(`${MOCK}/__expirer`)).ok()).toBe(true);
    await page.goto('/comptes/banque');
    const active = page.locator('[data-testid="connexion-bancaire"][data-statut="active"]').first();
    await active.getByTestId('form-synchroniser').getByRole('button').click();
    // La connexion passe à « expirée » (le formulaire de synchronisation disparaît avec elle)
    const expired = page.locator('[data-testid="connexion-bancaire"][data-statut="expired"]');
    await expect(expired).toHaveCount(1);
    await expect(expired.getByTestId('erreur-connexion')).toContainText('expiré');
    await expect(expired.getByTestId('form-synchroniser')).toHaveCount(0);

    // Nouvelle connexion puis révocation (session fermée chez le fournisseur)
    await connect(page, 'Autoriser l’accès');
    await page.locator('[data-testid="connexion-bancaire"][data-statut="active"]').first().getByTestId('form-revoquer').getByRole('button').click();
    await expect(page.locator('[data-testid="connexion-bancaire"][data-statut="active"]')).toHaveCount(0);
    const calls = await (await request.get(`${MOCK}/__appels`)).json() as string[];
    expect(calls.some((c) => c.startsWith('DELETE /sessions/'))).toBe(true);
    expect(calls.some((c) => c.includes('/payments'))).toBe(false);
    await expect(page.locator('[data-testid="connexion-bancaire"][data-statut="revoked"]')).toHaveCount(1);
    // Les données importées restent après révocation
    await page.goto('/comptes');
    await expect(page.getByTestId('liste-comptes')).toContainText('Compte à vue fictif');
    await page.goto('/comptes/banque');

    // Suppression des données d'une connexion : comptes et opérations effacés
    const revoked = page.locator('[data-testid="connexion-bancaire"][data-statut="revoked"]').first();
    await revoked.locator('summary').click();
    const del = revoked.getByTestId('form-supprimer-banque');
    await del.getByLabel('Tapez SUPPRIMER pour confirmer').fill('SUPPRIMER');
    await del.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.locator('[data-testid="connexion-bancaire"][data-statut="revoked"]')).toHaveCount(0);
    // Les comptes de la connexion supprimée ont disparu ; ceux d'une autre connexion (expirée) restent
    await page.goto('/comptes/banque');
    await expect(page.getByTestId('connexion-bancaire')).toHaveCount(2); // expirée + refusée
  });
});
