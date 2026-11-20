import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  activateIslamicFinance, apiToken, completeOnboarding, euros, fakeUser, latestLink, rest, signIn, signUpAndConfirm, SUPABASE_URL, ANON_KEY,
} from './helpers';

/**
 * Sprint 3 en mode réel, mobile et ordinateur : analyse, optimisation, recommandations,
 * tableau de bord. Relevé FICTIF généré pour les 6 mois complets précédant aujourd'hui.
 */
function savingsStatement(): string {
  const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 13));
  const date = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
  const dir = mkdtempSync(join(tmpdir(), 'amanah-s3e-'));
  const file = join(dir, 'releve-fictif-epargne.csv');
  writeFileSync(file, `Date;Montant;Libellé;Contrepartie;Compte contrepartie;Devise\n${date};75,00;VERSEMENT RECU;Marie Fictive;;EUR\n`, 'utf8');
  return file;
}

function fictitiousStatement(): string {
  const today = new Date();
  const lines = ['Date;Montant;Libellé;Contrepartie;Compte contrepartie;Devise'];
  const fmt = (y: number, m: number, d: number) => `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
  const amt = (c: number) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`;
  for (let i = 6; i >= 1; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    const k = 6 - i;
    lines.push(
      `${fmt(y, m, 1)};${amt(280_000)};VIREMENT SALAIRE EMPLOYEUR FICTIF;Employeur Fictif SA;;EUR`,
      `${fmt(y, m, 2)};${amt(-95_000)};LOYER APPARTEMENT FICTIF;Proprietaire Fictif;;EUR`,
      `${fmt(y, m, 5)};${amt(-11_000)};ENGIE FICTIF;Engie Fictif;;EUR`,
      `${fmt(y, m, 6)};${amt(-4_500)};PROXIMUS FICTIF;Proximus Fictif;;EUR`,
      `${fmt(y, m, 10)};${amt(-1_299)};STREAMING FICTIF;Streaming Fictif;;EUR`,
      `${fmt(y, m, 8)};${amt(-18_000)};DELHAIZE FICTIF;Delhaize Fictif;;EUR`,
      `${fmt(y, m, 20)};${amt(-16_000)};COLRUYT FICTIF;Colruyt Fictif;;EUR`,
      `${fmt(y, m, 15)};${amt(-(4_000 + k * 1_500))};RESTAURANT FICTIF ${k};Restaurant Fictif ${k};;EUR`,
    );
    // Dernier mois complet : un paiement de même montant qu'un versement reçu sur l'épargne (rapprochement incertain)
    if (i === 1) lines.push(`${fmt(y, m, 12)};${amt(-7_500)};PAIEMENT FICTIF EN LIGNE;Boutique Fictive;;EUR`);
  }
  // Mois en cours : le relevé continue au-delà des mois complets (couverture complète)
  lines.push(`${fmt(today.getUTCFullYear(), today.getUTCMonth(), 1)};${amt(280_000)};VIREMENT SALAIRE EMPLOYEUR FICTIF;Employeur Fictif SA;;EUR`);
  const dir = mkdtempSync(join(tmpdir(), 'amanah-s3-'));
  const file = join(dir, 'releve-fictif-6-mois.csv');
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

test.describe.serial('Sprint 3 — analyse, optimisation, recommandations', () => {
  let E: ReturnType<typeof fakeUser>;
  let F: ReturnType<typeof fakeUser>;

  test.beforeAll(({}, info) => {
    E = fakeUser('a', `s3e-${info.project.name}`);
    F = fakeUser('b', `s3f-${info.project.name}`);
  });

  test('sans historique : aucune recommandation chiffrée', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, E);
    await page.goto(await latestLink(E.email, 'signup', sentAt));
    await completeOnboarding(page, E.name);
    await page.goto('/recommandations');
    const recos = page.getByTestId('recommandation');
    await expect(recos).toHaveCount(1);
    await expect(recos.first()).toHaveAttribute('data-rule', 'R0');
    await expect(recos.first().getByTestId('impact')).toHaveCount(0);
  });

  test('import de 6 mois : situation, évolution, capacité, recommandations, prochaines actions', async ({ page }) => {
    await signIn(page, E);
    await page.goto('/comptes');
    for (const [name, type, balance] of [['Compte courant fictif', 'current', '0'], ['Épargne fictive', 'savings', '1000']] as const) {
      await page.getByLabel('Nom du compte').fill(name);
      await page.getByLabel('Type').selectOption(type);
      await page.getByLabel('Solde de départ (€)').fill(balance);
      await page.getByRole('button', { name: 'Ajouter le compte' }).click();
      await expect(page.getByTestId('liste-comptes')).toContainText(name);
    }
    await expect(page.getByTestId('liste-comptes')).toContainText('compté dans la réserve de précaution');
    await page.goto('/import');
    await page.getByLabel('Compte concerné').selectOption({ label: 'Compte courant fictif' });
    await page.getByLabel('Relevé CSV').setInputFiles(fictitiousStatement());
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await page.getByTestId('form-confirmer-import').getByRole('button', { name: /Importer 50 opération/ }).click();
    await expect(page.getByTestId('resultat-import')).toContainText('50 opération(s) importée(s)');

    await page.goto('/dashboard');
    await expect(page.getByTestId('synthese')).toContainText('Sur vos 6 derniers mois complets');
    await expect(page.getByTestId('capacite')).toContainText('Estimée');
    await expect(page.getByRole('img', { name: /Revenus et dépenses sur 6 mois/ })).toBeVisible();
    const top = page.getByTestId('recommandations-prioritaires').getByTestId('recommandation');
    await expect(top.first()).toHaveAttribute('data-rule', 'R2'); // réserve : 1 000 € pour ~1 445 € de dépenses essentielles par mois
    await expect(page.getByTestId('prochaines-actions').getByRole('link').first()).toHaveAttribute('href', '/goals');
    await expect(page.getByTestId('dashboard-finance-islamique')).toHaveCount(0);

    await page.goto('/budget');
    const rec = page.getByTestId('liste-recurrentes');
    await expect(rec).toContainText('Streaming Fictif');
    await expect(rec).toContainText('Abonnement');
    await expect(rec).toContainText('Proprietaire Fictif');
    await expect(rec).toContainText('Charge fixe');
    await expect(rec).not.toContainText('Restaurant Fictif');
    await expect(page.getByTestId('couverture')).toHaveAttribute('data-status', 'complete');
    await expect(page.getByTestId('virements-a-confirmer')).toHaveCount(0);
  });

  test('virement incertain : signalé, compté normalement, puis confirmé par l’utilisateur', async ({ page }) => {
    await signIn(page, E);
    await page.goto('/import');
    await page.getByLabel('Compte concerné').selectOption({ label: 'Épargne fictive' });
    await page.getByLabel('Relevé CSV').setInputFiles(savingsStatement());
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await page.getByTestId('form-confirmer-import').getByRole('button', { name: /Importer 1 opération/ }).click();
    await page.goto('/budget');
    const pending = page.getByTestId('virements-a-confirmer');
    await expect(pending).toContainText(euros('75,00 €'));
    await expect(pending).toContainText('PAIEMENT FICTIF EN LIGNE');
    await pending.getByTestId('virement-confirmed').getByRole('button').click();
    await expect(page.getByTestId('virements-a-confirmer')).toHaveCount(0);
    const decisions = (await (await rest(await apiToken(E), 'transfer_decisions?select=verdict')).json()) as Array<{ verdict: string }>;
    expect(decisions).toEqual([{ verdict: 'confirmed' }]);
  });

  test('optimiser : simuler sans rien écrire, puis décider et suivre', async ({ page }) => {
    await signIn(page, E);
    const token = await apiToken(E);
    const count = async (table: string) => ((await (await rest(token, `${table}?select=*`)).json()) as unknown[]).length;
    const before = { tx: await count('transactions'), budgets: await count('budgets') };

    await page.goto('/budget');
    await page.getByTestId('lien-optimiser').click();
    await expect(page).toHaveURL(/\/budget\/optimiser/);
    await expect(page.getByTestId('analyse-situation')).toContainText('Capacité d’épargne estimée');
    await page.getByTestId('reduction-globale').fill('50');
    await expect(page.getByTestId('sim-mensuel')).toContainText(euros('50,00 €'));
    await expect(page.getByTestId('sim-annuel')).toContainText(euros('600 €'));
    await page.getByTestId('recurrentes-candidates').getByLabel(/Streaming Fictif/).check();
    await expect(page.getByTestId('sim-mensuel')).toContainText(euros('62,99 €'));
    // La simulation n'a rien écrit
    expect(await count('transactions')).toBe(before.tx);
    expect(await count('budgets')).toBe(before.budgets);

    // Décider : appliquer sans confirmer est refusé
    await page.getByTestId('reduction-globale').fill('');
    await page.getByTestId('recurrentes-candidates').getByLabel(/Streaming Fictif/).uncheck();
    await page.getByTestId('postes-candidats').getByRole('listitem').filter({ hasText: 'Alimentation' }).getByRole('button', { name: 'Simuler −10 %' }).click();
    await expect(page.getByTestId('sim-mensuel')).toContainText(euros('34,00 €'));
    const form = page.getByTestId('form-scenario');
    await form.getByLabel('Nom du scénario').fill('Courses −10 %');
    await form.getByLabel(/Appliquer aussi aux plafonds/).check();
    await form.getByRole('button', { name: 'Enregistrer le scénario' }).click();
    await expect(form.getByRole('alert')).toContainText('Confirmez');
    expect(await count('budgets')).toBe(before.budgets);

    // Le formulaire est réinitialisé après l'erreur : nouvelle saisie, cette fois confirmée
    await form.getByLabel('Nom du scénario').fill('Courses −10 %');
    await form.getByLabel(/Appliquer aussi aux plafonds/).check();
    await form.getByLabel(/Je confirme/).check();
    await form.getByRole('button', { name: 'Enregistrer le scénario' }).click();
    await expect(page).toHaveURL(/applique=1/);
    await expect(page.getByTestId('scenarios-suivis')).toContainText('Courses −10 %');
    await expect(page.getByTestId('scenarios-suivis')).toContainText('Appliqué');
    const budgets = (await (await rest(token, 'budgets?select=category_slug,limit_cents')).json()) as Array<{ category_slug: string; limit_cents: number }>;
    expect(budgets).toEqual([{ category_slug: 'alimentation', limit_cents: 30_600 }]);
    expect(await count('transactions')).toBe(before.tx);
  });

  test('recommandations : explicables, facultatives, décisions conservées', async ({ page }) => {
    await signIn(page, E);
    await page.goto('/recommandations');
    const r6 = page.locator('[data-testid="recommandation"][data-rule="R6"]');
    await expect(r6).toHaveCount(1);
    await r6.getByText('Pourquoi ? Les données utilisées').click();
    await expect(r6.getByTestId('donnees-utilisees')).toContainText('Streaming Fictif');
    await expect(r6.getByTestId('impact')).toContainText('simulé');
    await r6.getByTestId('reco-dismissed').getByRole('button', { name: 'Écarter' }).click();
    await expect(page.locator('[data-rule="R6"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-rule="R6"]')).toHaveCount(0);
    await page.getByTestId('form-reset-reco').getByRole('button').click();
    await expect(page.locator('[data-rule="R6"]')).toHaveCount(1);
  });

  test('isolation : un autre foyer ne lit ni n’écrit rien', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, F);
    await page.goto(await latestLink(F.email, 'signup', sentAt));
    await completeOnboarding(page, F.name);
    const tokenE = await apiToken(E);
    const tokenF = await apiToken(F);
    for (const table of ['budget_scenarios', 'recommendation_feedback', 'household_category_settings', 'recurring_feedback', 'budgets', 'transfer_decisions']) {
      expect((await (await rest(tokenF, `${table}?select=*`)).json()) as unknown[], table).toEqual([]);
    }
    const [hE] = (await (await rest(tokenE, 'households?select=id')).json()) as Array<{ id: string }>;
    const month = `${new Date().toISOString().slice(0, 7)}-01`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/apply_budget_lines`, {
      method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenF}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_household_id: hE.id, p_month: month, p_lines: [{ category_slug: 'loisirs', limit_cents: 1 }] }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('finance islamique activée : intégrée au tableau de bord, seulement après consentement', async ({ page }) => {
    await signIn(page, E);
    await activateIslamicFinance(page, '/purification');
    await page.goto('/dashboard');
    await expect(page.getByTestId('dashboard-finance-islamique')).toBeVisible();
    await expect(page.getByTestId('ma-situation')).toBeVisible();
  });
});
