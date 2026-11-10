import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  activateIslamicFinance, apiToken, completeOnboarding, euros, fakeUser, latestLink, rest, signIn, signUpAndConfirm, SUPABASE_URL, ANON_KEY,
} from './helpers';

/**
 * Sprint 2 en mode réel, sur mobile et ordinateur : consentement par fonction,
 * import CSV fictif, purification. Utilisateurs et relevés FICTIFS.
 */
const fixture = (name: string) => resolve(process.cwd(), 'e2e-live/fixtures', name);

test.describe.serial('Sprint 2 — consentement, import et purification', () => {
  let C: ReturnType<typeof fakeUser>;
  let D: ReturnType<typeof fakeUser>;

  test.beforeAll(({}, info) => {
    C = fakeUser('a', `s2c-${info.project.name}`);
    D = fakeUser('b', `s2d-${info.project.name}`);
  });

  test('budget sans consentement article 9 ; fonctions religieuses fermées', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, C);
    await page.goto(await latestLink(C.email, 'signup', sentAt));
    // Accueil : deux documents seulement, la finance islamique est annoncée comme facultative
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await expect(page.getByRole('note').filter({ hasText: 'sont facultatives' })).toBeVisible();
    await completeOnboarding(page, C.name);
    await expect(page.getByText('Votre espace est prêt')).toBeVisible();
    for (const path of ['/purification', '/zakat', '/goals'] as const) {
      await page.goto(path);
      await expect(page.getByTestId('lien-activer-finance-islamique'), path).toBeVisible();
    }
    await expect(page.getByTestId('form-hajj')).toHaveCount(0);
    // Côté base : écriture religieuse refusée sans consentement
    const token = await apiToken(C);
    const [h] = (await (await rest(token, 'households?select=id')).json()) as Array<{ id: string }>;
    const res = await rest(token, 'contributions', { method: 'POST', body: JSON.stringify({ household_id: h.id, kind: 'sadaqah', amount_cents: 100, paid_on: '2026-11-01' }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('import CSV : aperçu, erreurs, doublons, confirmation, intérêts sans purification', async ({ page }) => {
    await signIn(page, C);
    await page.goto('/comptes');
    await page.getByLabel('Nom du compte').fill('Compte courant fictif');
    await page.getByLabel('Solde de départ (€)').fill('0');
    await page.getByRole('button', { name: 'Ajouter le compte' }).click();
    await expect(page.getByRole('status')).toContainText('Compte ajouté');
    await page.getByTestId('lien-import').click();
    await expect(page).toHaveURL(/\/import/);

    // Fichier absent : refusé
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('Choisissez un fichier CSV');

    await page.getByLabel('Relevé CSV').setInputFiles(fixture('releve-fictif-generique-be.csv'));
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    const preview = page.getByTestId('apercu-import');
    await expect(preview.getByTestId('apercu-lues')).toHaveText('9');
    await expect(preview.getByTestId('apercu-a-importer')).toHaveText('8');
    await expect(preview.getByTestId('apercu-doublons')).toHaveText('0');
    await expect(preview.getByTestId('apercu-erreurs')).toHaveText('1');
    await expect(preview.getByTestId('apercu-interets')).toHaveText('2');
    await expect(preview).toContainText('Ligne 10');
    await expect(preview).toContainText('Salaire');           // catégorie proposée
    await expect(preview).toContainText('Prime de fidélité');
    // Rien n'est écrit avant confirmation
    await page.goto('/budget');
    await page.goto('/import');
    await expect(page.getByTestId('historique-imports')).toHaveCount(0);

    await page.getByLabel('Relevé CSV').setInputFiles(fixture('releve-fictif-generique-be.csv'));
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await page.getByTestId('form-confirmer-import').getByRole('button', { name: 'Importer 8 opération(s)' }).click();
    const result = page.getByTestId('resultat-import');
    await expect(result).toContainText('8 opération(s) importée(s), 0 doublon(s) ignoré(s)');
    await expect(result).toContainText('2 revenu(s) d’intérêts détecté(s)');
    await expect(result).toContainText('activez la finance islamique');
    await expect(page.getByTestId('historique-imports')).toContainText('9 lue(s), 8 importée(s), 0 doublon(s), 1 erreur(s), 2 intérêt(s)');

    // Les intérêts sont marqués, aucune donnée religieuse n'est créée
    const token = await apiToken(C);
    const interest = (await (await rest(token, 'transactions?select=amount_cents&is_interest=eq.true&order=amount_cents')).json()) as Array<{ amount_cents: number }>;
    expect(interest.map((t) => t.amount_cents)).toEqual([456, 1234]);
    expect((await (await rest(token, 'purification_items?select=id')).json()) as unknown[]).toEqual([]);
  });

  test('réimport du même relevé : aucune ligne ajoutée', async ({ page }) => {
    await signIn(page, C);
    await page.goto('/import');
    await page.getByLabel('Relevé CSV').setInputFiles(fixture('releve-fictif-generique-be.csv'));
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    const preview = page.getByTestId('apercu-import');
    await expect(preview.getByTestId('apercu-a-importer')).toHaveText('0');
    await expect(preview.getByTestId('apercu-doublons')).toHaveText('8');
    await expect(preview).toContainText('déjà importé');
    await expect(page.getByTestId('form-confirmer-import')).toHaveCount(0);
    const rows = (await (await rest(await apiToken(C), 'transactions?select=id')).json()) as unknown[];
    expect(rows).toHaveLength(8);
  });

  test('purification : activation, import détecté, examen, méthodologie, purification enregistrée', async ({ page }) => {
    await signIn(page, C);
    await activateIslamicFinance(page, '/purification');

    // Avec consentement, l'import crée directement les éléments « détectés »
    await page.goto('/import');
    await page.getByLabel('Relevé CSV').setInputFiles(fixture('releve-fictif-debit-credit-be.csv'));
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await page.getByTestId('form-confirmer-import').getByRole('button', { name: 'Importer 3 opération(s)' }).click();
    await expect(page.getByTestId('resultat-import')).toContainText('dont 1 proposé(s) à la purification');

    // Intérêts importés avant le consentement : détection sur les opérations existantes
    await page.goto('/purification');
    await expect(page.getByTestId('liste-a-examiner').getByTestId('element-purification')).toHaveCount(1);
    await page.getByTestId('form-detection').getByRole('button', { name: 'Détecter les intérêts' }).click();
    await expect(page.getByTestId('form-detection').getByRole('status')).toContainText('2 revenu(s) d’intérêts détecté(s)');
    await page.reload();
    const toReview = page.getByTestId('liste-a-examiner').getByTestId('element-purification');
    await expect(toReview).toHaveCount(3);
    await expect(toReview.first().getByTestId('montant-a-purifier')).toContainText('choisissez une méthodologie');

    // Confirmer l'intérêt de 12,34 € en indiquant le précompte (5,29 €)
    const interest = toReview.filter({ hasText: 'INTERETS CREDITEURS COMPTE EPARGNE' });
    const confirm = interest.getByTestId('form-confirmer-purification');
    await confirm.getByLabel('Précompte mobilier (€), si connu').fill('5,29');
    await confirm.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByTestId('liste-confirmes').getByTestId('element-purification')).toHaveCount(1);
    // Écarter la prime de fidélité (exemple : l'utilisateur la juge hors purification)
    await page.getByTestId('liste-a-examiner').getByTestId('element-purification').filter({ hasText: 'PRIME DE FIDELITE' })
      .getByTestId('form-ecarter-purification').getByRole('button').click();
    await expect(page.getByTestId('liste-a-examiner').getByTestId('element-purification')).toHaveCount(1);
    await page.reload();
    const confirmed = page.getByTestId('liste-confirmes').getByTestId('element-purification');
    await expect(confirmed).toHaveCount(1);
    await expect(confirmed.getByTestId('montant-a-purifier')).toContainText('choisissez une méthodologie');

    // Méthodologie nette, puis brute
    const method = page.getByTestId('form-methodologie');
    await method.getByLabel(/net crédité/).check();
    await method.getByRole('button', { name: 'Enregistrer la méthodologie' }).click();
    await expect(method.getByRole('status')).toContainText('appliquée à 1 élément(s)');
    await page.reload();
    await expect(page.getByTestId('liste-confirmes').getByTestId('montant-a-purifier')).toContainText(euros('12,34 €'));
    await page.getByTestId('form-methodologie').getByLabel(/brut/).check();
    await page.getByTestId('form-methodologie').getByRole('button', { name: 'Enregistrer la méthodologie' }).click();
    await expect(page.getByTestId('form-methodologie').getByRole('status')).toContainText('Méthodologie enregistrée');
    await page.reload();
    await expect(page.getByTestId('methodologie-actuelle')).toContainText('brut');
    await expect(page.getByTestId('liste-confirmes').getByTestId('montant-a-purifier')).toContainText(euros('17,63 €'));

    // Purification réalisée (enregistrement, aucun paiement)
    const record = page.getByTestId('form-purification-realisee');
    await record.getByLabel('Bénéficiaire').fill('Association fictive');
    await record.getByRole('button', { name: 'Enregistrer la purification' }).click();
    await expect(page.getByTestId('liste-purifications')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('liste-purifications')).toContainText(euros('17,63 €'));
    await expect(page.getByTestId('synthese-purification')).toContainText(euros('17,63 €'));
    await expect(page.getByTestId('liste-confirmes')).toHaveCount(0);

    // Un élément purifié est définitif, y compris par l'API
    const token = await apiToken(C);
    const [purified] = (await (await rest(token, 'purification_items?select=id,status,amount_to_purify_cents&status=eq.purified')).json()) as Array<{ id: string; amount_to_purify_cents: number }>;
    expect(purified.amount_to_purify_cents).toBe(1763);
    const patch = await rest(token, `purification_items?id=eq.${purified.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'rejected' }) });
    expect(patch.status).toBeGreaterThanOrEqual(400);
  });

  test('isolation : un autre utilisateur ne voit ni n’écrit rien', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, D);
    await page.goto(await latestLink(D.email, 'signup', sentAt));
    await completeOnboarding(page, D.name);
    const tokenC = await apiToken(C);
    const tokenD = await apiToken(D);
    const [hC] = (await (await rest(tokenC, 'households?select=id')).json()) as Array<{ id: string }>;
    const [accC] = (await (await rest(tokenC, 'accounts?select=id')).json()) as Array<{ id: string }>;
    for (const table of ['transactions', 'import_batches', 'purification_items', 'contributions', 'religious_preferences', 'audit_log']) {
      const rows = (await (await rest(tokenD, `${table}?select=*`)).json()) as unknown[];
      expect(rows, `lecture ${table}`).toEqual([]);
    }
    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/import_transactions`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenD}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_household_id: hC.id, p_account_id: accC.id, p_source: 'csv', p_file_name: 'x.csv', p_profile: null, p_error_count: 0,
        p_rows: [{ booked_on: '2026-11-01', amount_cents: 1, dedupe_hash: 'intrusion' }] }),
    });
    expect(rpc.status, 'import dans le foyer de C').toBeGreaterThanOrEqual(400);
    const rows = (await (await rest(tokenC, 'transactions?select=id')).json()) as unknown[];
    expect(rows).toHaveLength(11);
  });

  test('retrait avec effacement : données religieuses effacées, budget et opérations conservés', async ({ page }) => {
    await signIn(page, C);
    await page.goto('/finance-islamique');
    const form = page.getByTestId('form-retrait-finance-islamique');
    await form.getByLabel(/Les effacer/).check();
    await form.getByRole('button', { name: 'Retirer mon consentement' }).click();
    await expect(page).toHaveURL(/retrait=erase/);
    await expect(page.getByText('ont été effacées')).toBeVisible();
    await page.goto('/purification');
    await expect(page.getByTestId('lien-activer-finance-islamique')).toBeVisible();
    // Nouveau consentement : plus rien de religieux, les opérations bancaires restent
    await activateIslamicFinance(page, '/purification');
    await expect(page.getByText('Aucune purification enregistrée.')).toBeVisible();
    const token = await apiToken(C);
    expect((await (await rest(token, 'purification_items?select=id')).json()) as unknown[]).toEqual([]);
    expect((await (await rest(token, 'contributions?select=id')).json()) as unknown[]).toEqual([]);
    expect((await (await rest(token, 'transactions?select=id')).json()) as unknown[]).toHaveLength(11);
  });
});
