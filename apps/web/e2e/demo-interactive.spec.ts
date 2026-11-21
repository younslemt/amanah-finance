import { expect, test, type Page } from '@playwright/test';

/**
 * Démonstration interactive (sans base de données), sur mobile et ordinateur.
 * Un utilisateur crée plusieurs projets FICTIFS, les modifie, compare des scénarios, les suit
 * et constate l'effet sur le plan d'épargne et le tableau de bord. Chaque test a son propre
 * navigateur : l'état de démonstration (cookie) ne fuit pas d'un test à l'autre.
 */
const euros = (s: string) => new RegExp(s.replace(/ /g, '[\\s\\u00a0\\u202f]'));

/** Journal de diagnostic : erreurs console, requêtes en échec et envois (POST), joint au rapport en cas d'échec. */
function watch(page: Page): string[] {
  const log: string[] = [];
  const t0 = Date.now();
  const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${at()} console.${m.type()} ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => log.push(`${at()} pageerror ${e.message.slice(0, 300)}`));
  page.on('requestfailed', (r) => log.push(`${at()} échec ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => { if (r.request().method() === 'POST') log.push(`${at()} POST ${r.status()} ${r.url()}`); });
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) log.push(`${at()} navigation ${f.url()}`); });
  return log;
}

// Diagnostic automatique : en cas d'échec, journal et état de la page affichés dans le rapport CI
let journal: string[] = [];
test.beforeEach(({ page }) => { journal = watch(page); });
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const state = await page.evaluate(() => ({
    url: location.href,
    formulaires: Array.from(document.querySelectorAll('form')).map((f) => `${f.dataset.testid ?? ''} étape=${f.dataset.etape ?? '-'} bloqué=${f.dataset.envoiBloque ?? '-'}`),
    champs: Array.from(document.querySelectorAll('[data-testid="form-objectif"] input:not([type=hidden])')).map((i) => `${(i as HTMLInputElement).name}=${(i as HTMLInputElement).type === 'radio' ? (i as HTMLInputElement).checked : (i as HTMLInputElement).value}`).filter((x) => !x.endsWith('=false')),
    erreurPage: !!document.querySelector('[data-testid="erreur-page"]'),
    alertes: Array.from(document.querySelectorAll('[role="alert"]')).map((a) => a.textContent?.slice(0, 200)),
    boutons: Array.from(document.querySelectorAll('form button')).map((b) => `${b.textContent}|${(b as HTMLButtonElement).type}|${(b as HTMLButtonElement).disabled}`).slice(0, 12),
    sw: navigator.serviceWorker?.controller ? 'contrôlée' : 'non contrôlée',
  })).catch(() => null);
  console.log(`\n[DIAGNOSTIC] ${info.title} (${info.project.name})\nÉtat : ${JSON.stringify(state)}\n${journal.join('\n')}\n[FIN DIAGNOSTIC]`);
});

async function addGoal(page: Page, g: { category: string; name?: string; target: string; available?: string; monthly: string }) {
  await page.goto('/goals');
  await page.getByTestId('ajouter-objectif').click();
  const form = page.getByTestId('form-objectif');
  await form.getByRole('radio', { name: new RegExp(`^${g.category}`) }).check();
  if (g.name) await form.getByLabel('Nom du projet').fill(g.name);
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Montant cible (€)').fill(g.target);
  await form.getByTestId('etape-suivante').click();
  // Arriver à la dernière étape n'envoie jamais le formulaire (aucune erreur avant la saisie)
  await expect(form.getByRole('button', { name: 'Créer l’objectif' })).toBeVisible();
  await expect(form.getByRole('alert')).toHaveCount(0);
  if (g.available) await form.getByLabel('Épargne déjà disponible (€)').fill(g.available);
  await form.getByLabel('Mensualité prévue (€)').fill(g.monthly);
  await form.getByRole('button', { name: 'Créer l’objectif' }).click();
  await Promise.race([page.waitForURL(/cree=1/, { timeout: 20_000 }).catch(() => undefined), form.getByRole('alert').first().waitFor({ timeout: 20_000 }).catch(() => undefined),
    page.getByTestId('erreur-page').waitFor({ timeout: 20_000 }).catch(() => undefined)]);
  expect(await form.getByRole('alert').allTextContents(), 'erreur affichée par le formulaire').toEqual([]);
  expect(await page.getByTestId('erreur-page').count(), 'écran d’erreur (exception côté serveur ou réseau)').toBe(0);
  await expect(page).toHaveURL(/\/goals\/demo-\d+\?cree=1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(g.name ?? g.category);
  return page.url().split('?')[0]!;
}

test('assistant de création : une étape à la fois, retour en arrière sans perte de saisie', async ({ page }) => {
  await page.goto('/goals/nouveau');
  const form = page.getByTestId('form-objectif');
  const steps = form.getByTestId('etape-formulaire');
  await expect(steps).toHaveCount(3);
  await expect(steps.nth(1)).toBeHidden();
  // Aucune catégorie choisie : on reste à l'étape 1
  await form.getByTestId('etape-suivante').click();
  await expect(steps.first()).toBeVisible();
  await form.getByRole('radio', { name: /^Projet personnel/ }).check();
  await form.getByLabel('Nom du projet').fill('Voyage au Japon');
  await form.getByTestId('etape-suivante').click();
  await expect(page.getByTestId('etape-annonce')).toHaveText('Étape 2 sur 3 : Montant et échéance');
  await form.getByLabel('Montant cible (€)').fill('3 000');
  await form.getByTestId('etape-precedente').click();
  await expect(form.getByLabel('Nom du projet')).toHaveValue('Voyage au Japon');
  await expect(form.getByRole('radio', { name: /^Projet personnel/ })).toBeChecked();
  await form.getByTestId('etape-suivante').click();
  await expect(form.getByLabel('Montant cible (€)')).toHaveValue('3 000');
  // Projet personnel sans nom : refus du serveur, retour à l'étape concernée, saisie conservée
  await form.getByTestId('etape-precedente').click();
  await form.getByLabel('Nom du projet').fill('');
  await form.getByTestId('etape-suivante').click();
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Mensualité prévue (€)').fill('150');
  await form.getByRole('button', { name: 'Créer l’objectif' }).click();
  await expect(form.getByRole('alert')).toContainText('Donnez un nom à votre projet personnel', { timeout: 15_000 });
  await expect(form.getByLabel('Nom du projet')).toBeVisible();
  await expect(form.getByLabel('Montant cible (€)')).toHaveValue('3 000');
});

test('plusieurs projets créés, suivis de bout en bout, cohérents sur tous les écrans, conservés et réinitialisables', async ({ page }) => {
  const voyage = await addGoal(page, { category: 'Projet personnel', name: 'Voyage au Japon', target: '3 000', available: '500', monthly: '150' });
  // Juste créé : rien n'est supposé (l'épargne initiale n'est pas un suivi)
  await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'plan');
  await expect(page.getByTestId('parcours-projet').locator('[data-etape="follow"]')).toHaveAttribute('data-statut', 'available');
  const mariage = await addGoal(page, { category: 'Projet personnel', name: 'Mariage', target: '8 000', monthly: '200' });
  const maison = await addGoal(page, { category: 'Achat immobilier', target: '40 000', monthly: '300' });

  // Liste, tableau de bord et plan d'épargne partagent le même état
  await page.goto('/goals');
  for (const n of ['Voyage au Japon', 'Mariage', 'Achat immobilier', 'Hajj en couple']) await expect(page.getByTestId('liste-projets')).toContainText(n);
  await page.goto('/dashboard');
  await expect(page.getByTestId('projets-tableau-de-bord')).toContainText('Voyage au Japon');
  await page.goto('/budget/plan-epargne');
  await expect(page.getByTestId('lignes-plan')).toContainText('Mariage');
  await expect(page.getByTestId('synthese-plan')).toContainText(euros('700,00 €')); // 150 + 200 + 300 + Aïd fictif 50
  // Conservé après rafraîchissement
  await page.reload();
  await expect(page.getByTestId('lignes-plan')).toContainText('Voyage au Japon');

  // Planifier → Simuler → Suivre sur le voyage
  await page.goto(voyage);
  await page.getByTestId('form-planifier').getByRole('button', { name: 'Valider mon plan' }).click();
  await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'simulate');
  const sim = page.getByTestId('form-simuler');
  await sim.getByLabel('Scénario 1 (€/mois)').fill('100');
  await sim.getByLabel('Scénario 2 (€/mois)').fill('250');
  await sim.getByLabel('Scénario 3 (€/mois)').fill('500');
  await sim.getByRole('button', { name: 'Comparer' }).click();
  const scenarios = page.getByTestId('scenario');
  await expect(scenarios).toHaveCount(3);
  await expect(scenarios.nth(1)).toContainText('10 mois'); // 2 500 € / 250 €
  await expect(page.getByTestId('capacite-projet')).toContainText('Déjà engagée par vos autres projets');
  await scenarios.nth(1).getByRole('button', { name: 'Retenir ce scénario' }).click();
  await expect(page.getByTestId('parcours-projet')).toHaveAttribute('data-current', 'follow');
  const alloc = page.getByTestId('form-allocation');
  await alloc.getByLabel('Montant (€)').fill('250');
  await alloc.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('750,00 €'));
  await alloc.getByLabel('Mouvement').selectOption('remove');
  await alloc.getByLabel('Montant (€)').fill('50');
  await alloc.getByRole('button', { name: 'Valider' }).click();
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('700,00 €'));
  await expect(page.getByTestId('action-principale')).toHaveAttribute('data-action', 'keep_saving');
  // Modifier : l'historique garde l'avant / après, les affectations restent
  await page.getByTestId('form-planifier').getByLabel('Montant cible (€)').fill('3 500');
  await page.getByTestId('form-planifier').getByRole('button', { name: /valider mon plan/i }).click();
  await expect(page.getByTestId('historique-modifications')).toContainText('Montant cible');
  await expect(page.getByTestId('historique-modifications')).toContainText('Stratégie retenue');
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('700,00 €'));

  // Priorités : le voyage passe en priorité 1 dans le plan d'épargne
  await page.goto('/budget/plan-epargne');
  await page.getByTestId('form-plan-epargne').locator('fieldset', { hasText: 'Voyage au Japon' }).getByLabel('Priorité').selectOption('1');
  await page.getByTestId('form-plan-epargne').getByRole('button', { name: 'Enregistrer le plan' }).click();
  await expect(page.getByTestId('ligne-plan').first()).toContainText('Voyage au Japon');

  // Pause, archive, réalisation
  await page.goto(mariage);
  await page.getByTestId('form-pause').getByRole('button').click();
  await expect(page.getByTestId('etat-projet')).toContainText('en pause');
  await page.goto('/budget/plan-epargne');
  await expect(page.getByTestId('lignes-plan')).not.toContainText('Mariage');
  await page.goto(maison);
  await page.getByTestId('form-archiver').getByRole('button').click();
  await expect(page.getByTestId('etat-projet')).toContainText('archivé');
  await expect(page.getByTestId('historique-modifications')).toContainText('Statut : en cours → archivé');
  await page.goto('/goals');
  await expect(page.getByTestId('liste-projets')).not.toContainText('Achat immobilier');
  await page.getByTestId('projets-clos').locator('summary').click();
  await expect(page.getByTestId('projets-clos')).toContainText('Achat immobilier');
  await page.goto(voyage);
  await page.getByTestId('form-realiser').getByRole('button', { name: 'Marquer comme réalisé' }).click();
  await expect(page.getByTestId('action-principale')).toHaveAttribute('data-action', 'explore_solutions');
  await page.getByTestId('action-principale').click();
  await expect(page.getByText('Aucun partenaire n’est référencé aujourd’hui')).toBeVisible();

  // Réinitialisation : retour aux données fictives de départ, partout
  await page.goto('/goals');
  await page.getByText('Réinitialiser la démonstration').click();
  await page.getByTestId('form-reinitialiser').getByRole('button').click();
  await expect(page.getByTestId('form-reinitialiser').getByRole('status')).toContainText('réinitialisée');
  await page.reload();
  await expect(page.getByTestId('liste-projets')).not.toContainText('Voyage au Japon');
  await expect(page.getByTestId('liste-projets')).toContainText('Hajj en couple');
  await page.goto('/dashboard');
  await expect(page.getByTestId('projets-tableau-de-bord')).not.toContainText('Voyage au Japon');
});

test('Aïd en démonstration : budget ajusté, réalisation puis préparation de l’année suivante, une seule fois', async ({ page }) => {
  await page.goto('/goals/goal-aid');
  await page.getByText('Modifier le budget').click();
  await page.getByTestId('form-aid-budget').getByLabel('Sacrifice ou quote-part (€)').fill('380');
  await page.getByTestId('form-aid-budget').getByRole('button', { name: 'Enregistrer le budget' }).click();
  await expect(page.getByTestId('budget-aid')).toContainText(euros('360,00 €')); // 380 + 80 − 100
  await page.goto('/goals/goal-aid?s1=30&s2=60&s3=90');
  await expect(page.getByTestId('scenario')).toHaveCount(3);
  await page.getByTestId('form-realiser').getByRole('button', { name: 'Marquer comme réalisé' }).click();
  await page.getByTestId('lien-reconduire').click();
  await expect(page.getByTestId('form-aid').getByLabel('Sacrifice ou quote-part (€)')).toHaveValue('380,00');
  const form = page.getByTestId('form-aid');
  await form.getByTestId('etape-suivante').click();
  await expect(form.getByTestId('estimation-aid')).toContainText('non officielle');
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Effort d’épargne mensuel (€)').fill('40');
  await form.getByRole('button', { name: 'Créer l’Aïd de l’année suivante' }).click();
  await expect(page).toHaveURL(/\/goals\/demo-\d+\?cree=1$/, { timeout: 15_000 });
  await expect(page.getByText('Aucune affectation.')).toBeVisible(); // aucun montant repris
  await page.goto('/goals/goal-aid');
  await expect(page.getByTestId('reconduction-aid')).toContainText('Reconduit');
  await page.goto('/goals/aid?suite=goal-aid');
  const again = page.getByTestId('form-aid');
  await again.getByTestId('etape-suivante').click();
  await again.getByTestId('etape-suivante').click();
  await again.getByLabel('Effort d’épargne mensuel (€)').fill('40');
  await again.getByRole('button', { name: 'Créer l’Aïd de l’année suivante' }).click();
  await expect(again.getByRole('alert')).toContainText('déjà');
});

test('données de démonstration illisibles : données de départ rétablies et signalées', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'amanah_demo_0', value: 'v1.donnees-alterees', url: baseURL ?? 'http://localhost:3000' }]);
  await page.goto('/goals');
  await expect(page.getByText('étaient illisibles')).toBeVisible();
  await expect(page.getByTestId('liste-projets')).toContainText('Hajj en couple');
});

test('deux onglets : même état de démonstration (un projet créé dans l’un apparaît dans l’autre)', async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto('/dashboard');
  await expect(other.getByTestId('projets-tableau-de-bord')).toBeVisible();
  await addGoal(page, { category: 'Épargne familiale', target: '2 000', monthly: '50' });
  await other.reload();
  await expect(other.getByTestId('projets-tableau-de-bord')).toContainText('Épargne familiale');
});
