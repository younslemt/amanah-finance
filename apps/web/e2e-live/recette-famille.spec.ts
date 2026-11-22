import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  activateIslamicFinance, completeOnboarding, createGoalWithWizard, expectRedirectOrShowError, fakeUser, fillEidWizard, latestLink, signIn, signUpAndConfirm,
} from './helpers';

/**
 * RECETTE FONCTIONNELLE — famille fictive, de bout en bout, en mode réel (Supabase local).
 *
 * Données de recette (FICTIVES, saisies par les parcours de l'application, jamais codées dans les
 * composants) : revenus 4 500 €/mois, dépenses 3 600 €/mois (6 mois complets importés), capacité
 * d'épargne retenue 650 €, épargne existante 8 000 €, projets Omra 5 000 €, Aïd 500 €,
 * Rentrée scolaire 900 €.
 *
 * Ce test est un relevé d'observations : les étapes du parcours sont vérifiées (échec = parcours
 * cassé) ; les montants lus sur chaque écran sont consignés dans `recette-famille.json` (journal de
 * CI) avec les écarts constatés, pour l'analyse de cohérence. Il ne corrige rien.
 */
test.skip(({ isMobile }) => isMobile, 'recette exécutée une fois (ordinateur)');

const findings: Array<{ zone: string; constat: string }> = [];
const report: Record<string, unknown> = {};
const note = (zone: string, constat: string) => findings.push({ zone, constat });

const clean = (t: string) => t.replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
async function grab(page: Page, ids: string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const id of ids) {
    const l = page.getByTestId(id);
    out[id] = (await l.count()) ? clean((await l.allInnerTexts()).join(' | ')) : null;
  }
  return out;
}
/** Tous les montants en euros d'un texte, en centimes. */
const amounts = (t: string | null) => [...(t ?? '').matchAll(/(?<![\d,])(\d{1,3}(?: \d{3})*(?:,\d{2})?) ?€/g)].map((m) => Math.round(Number(m[1]!.replace(/ /g, '').replace(',', '.')) * 100));
const firstAmount = (t: string | null) => amounts(t)[0] ?? null;

/** Relevé fictif : 6 mois complets (revenus 4 500 €, dépenses 3 600 €) + début du mois en cours. */
function familyStatement(): string {
  const today = new Date();
  const lines = ['Date;Montant;Libellé;Contrepartie;Compte contrepartie;Devise'];
  const fmt = (y: number, m: number, d: number) => `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
  const amt = (c: number) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)},${String(Math.abs(c) % 100).padStart(2, '0')}`;
  const expenses: Array<[number, number, string]> = [
    [2, -125_000, 'LOYER APPARTEMENT FICTIF'], [5, -18_000, 'ENGIE FICTIF'], [6, -7_000, 'PROXIMUS FICTIF'],
    [8, -55_000, 'DELHAIZE FICTIF'], [22, -55_000, 'COLRUYT FICTIF'], [10, -20_000, 'STIB FICTIF'],
    [12, -15_000, 'ASSURANCE FICTIVE'], [18, -30_000, 'LOISIRS FICTIFS'], [25, -35_000, 'DIVERS FICTIFS'],
  ];
  if (expenses.reduce((s, e) => s + e[1], 0) !== -360_000) throw new Error('dépenses de recette ≠ 3 600 €');
  for (let i = 6; i >= 1; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    lines.push(`${fmt(y, m, 1)};${amt(450_000)};VIREMENT SALAIRE EMPLOYEUR FICTIF;Employeur Fictif SA;;EUR`);
    for (const [day, c, label] of expenses) lines.push(`${fmt(y, m, day)};${amt(c)};${label};${label};;EUR`);
  }
  // Mois en cours (hors analyse des mois complets) : salaire et intérêts créditeurs (purification)
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  lines.push(`${fmt(y, m, 1)};${amt(450_000)};VIREMENT SALAIRE EMPLOYEUR FICTIF;Employeur Fictif SA;;EUR`);
  lines.push(`${fmt(y, m, 1)};${amt(1_234)};INTERETS CREDITEURS COMPTE EPARGNE;Banque Fictive;;EUR`);
  const dir = mkdtempSync(join(tmpdir(), 'amanah-recette-'));
  const file = join(dir, 'releve-famille-fictive.csv');
  writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
  return file;
}

test.describe.serial('Recette — famille fictive de bout en bout (mode réel)', () => {
  let F: ReturnType<typeof fakeUser>;
  test.beforeAll(() => { F = fakeUser('a', 'recette'); });

  test.afterAll(async ({}, info) => {
    const file = info.outputPath('recette-famille.json');
    writeFileSync(file, JSON.stringify({ report, findings }, null, 2), 'utf8');
    console.log('=====RECETTE-JSON=====');
    console.log(JSON.stringify({ report, findings }));
    console.log('=====FIN-RECETTE-JSON=====');
  });

  test('1. inscription, comptes, import de 6 mois, consentement', async ({ page }) => {
    const { sentAt } = await signUpAndConfirm(page, F);
    await page.goto(await latestLink(F.email, 'signup', sentAt));
    await completeOnboarding(page, F.name);
    // Consentement article 9 avant l'import : les intérêts créditeurs sont proposés à la purification
    await activateIslamicFinance(page, '/purification');

    await page.goto('/comptes');
    for (const [name, type, balance] of [['Compte courant famille', 'current', '0'], ['Épargne famille', 'savings', '8000']] as const) {
      await page.getByLabel('Nom du compte').fill(name);
      await page.getByLabel('Type').selectOption(type);
      await page.getByLabel('Solde de départ (€)').fill(balance);
      await page.getByRole('button', { name: 'Ajouter le compte' }).click();
      await expect(page.getByTestId('liste-comptes')).toContainText(name);
    }
    await page.goto('/import');
    await page.getByLabel('Compte concerné').selectOption({ label: 'Compte courant famille' });
    await page.getByLabel('Relevé CSV').setInputFiles(familyStatement());
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await page.getByTestId('form-confirmer-import').getByRole('button', { name: /^Importer \d+ opération/ }).click();
    await expect(page.getByTestId('resultat-import')).toContainText('opération(s) importée(s)');
    report.import = await grab(page, ['resultat-import']);
    await page.goto('/comptes');
    report.comptes = await grab(page, ['liste-comptes']);
  });

  test('2. projets : Omra, Aïd, Rentrée scolaire ; plan d’épargne ; affectation', async ({ page }) => {
    await signIn(page, F);
    await createGoalWithWizard(page, { category: 'Omra', target: '5 000', available: '2 000', monthly: '250' });
    report.omraCree = await grab(page, ['plan-projet', 'etat-projet', 'capacite-projet']);

    await page.goto('/goals');
    await page.getByTestId('lien-preparer-aid').click();
    const eid = await fillEidWizard(page, { sacrifice: '350', extras: '150', family: '0', monthly: '50' });
    await eid.getByRole('button', { name: 'Créer mon projet Aïd' }).click();
    await expectRedirectOrShowError(page, eid, /\/goals\/[0-9a-f-]{36}\?cree=1$/);
    report.aidCree = await grab(page, ['budget-aid', 'date-aid', 'plan-projet']);
    if (firstAmount((report.aidCree as Record<string, string | null>)['budget-aid']) !== 50_000) note('Aïd', `budget affiché ≠ 500 € : ${JSON.stringify(report.aidCree)}`);

    // Rentrée scolaire : modèle du catalogue, montant saisi par l'utilisateur
    await page.goto('/goals/nouveau?modele=rentree-scolaire');
    const form = page.getByTestId('form-objectif');
    await expect(page.getByTestId('modele-choisi')).toBeVisible();
    await form.getByTestId('etape-suivante').click();
    await form.getByLabel('Montant cible (€)').fill('900');
    await form.getByTestId('etape-suivante').click();
    await form.getByLabel('Mensualité prévue (€)').fill('150');
    await form.getByRole('button', { name: 'Créer l’objectif' }).click();
    await expectRedirectOrShowError(page, form, /\/goals\/[^/?]+\?cree=1$/);
    report.rentreeCree = await grab(page, ['plan-projet', 'etat-projet']);

    // Plan d'épargne : capacité retenue 650 € ; Omra 250, Aïd 50, Rentrée 150 → 450 affectés, 200 libres
    await page.goto('/budget/plan-epargne');
    report.planAvantCapacite = await grab(page, ['synthese-plan', 'lignes-plan']);
    await page.getByTestId('form-capacite').getByLabel('Capacité mensuelle (€)').fill('650');
    await page.getByTestId('form-capacite').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByTestId('synthese-plan')).toContainText('650');
    const plan = page.getByTestId('form-plan-epargne');
    await plan.getByLabel('Montant mensuel pour « Omra » (€)').fill('250');
    await plan.getByLabel(/Montant mensuel pour « Aïd al-Adha \d{4} » \(€\)/).fill('50');
    await plan.getByLabel(/Montant mensuel pour « Rentrée scolaire/).fill('150');
    await plan.getByRole('button', { name: 'Enregistrer le plan' }).click();
    await expect(page.getByTestId('synthese-plan')).toContainText('450');
    report.plan = await grab(page, ['synthese-plan', 'lignes-plan']);

    // Affectation virtuelle : +300 € sur l'Omra (2 000 € déjà disponibles à la création)
    await page.goto('/goals');
    await page.getByRole('article').filter({ hasText: 'Omra' }).getByTestId('lien-projet').click();
    await page.getByTestId('form-allocation').getByLabel('Montant (€)').fill('300');
    await page.getByTestId('form-allocation').getByRole('button', { name: 'Valider' }).click();
    await expect(page.getByTestId('historique-affectations')).toContainText('300');
    report.omra = await grab(page, ['plan-projet', 'etat-projet', 'capacite-projet', 'historique-affectations', 'impact-projets', 'parcours-projet']);
    // Simulation : 2 scénarios, rien n'est enregistré avant le choix
    const sim = page.getByTestId('form-simuler');
    if (await sim.count()) {
      await sim.getByLabel('Scénario 1 (€/mois)').fill('300');
      await sim.getByLabel('Scénario 2 (€/mois)').fill('150');
      await sim.getByRole('button', { name: 'Comparer' }).click();
      report.omraSimulation = await grab(page, ['scenario', 'resultat-simulation']);
    } else note('Projet Omra', 'formulaire de simulation absent à cette étape du parcours');
  });

  test('3. cohérence : accueil, projets, plan, calendrier, budget, patrimoine ; rafraîchissement', async ({ page }) => {
    await signIn(page, F);
    await page.goto('/dashboard');
    const home = await grab(page, ['excedent-observe', 'capacite-retenue', 'capacite-non-affectee', 'capacite-disponible', 'synthese',
      'projets-tableau-de-bord', 'projet-accueil', 'calendrier-accueil', 'evenement-accueil', 'zakat-accueil', 'purification-accueil', 'solidarite-accueil',
      'patrimoine-accueil', 'reserve-accueil', 'prochaines-actions']);
    report.accueil = home;
    await page.reload();
    const again = await grab(page, ['excedent-observe', 'capacite-retenue', 'capacite-non-affectee', 'projets-tableau-de-bord']);
    for (const k of Object.keys(again)) if (again[k] !== home[k]) note('Rafraîchissement', `${k} diffère après rechargement`);
    await page.screenshot({ path: test.info().outputPath('recette-accueil-1280.jpg'), fullPage: true, type: 'jpeg', quality: 70 });

    await page.goto('/goals');
    report.projets = await grab(page, ['synthese-projets', 'liste-projets', 'progression', 'prochaine-action']);
    await page.goto('/budget/plan-epargne');
    report.planRelu = await grab(page, ['synthese-plan', 'lignes-plan']);
    await page.goto('/goals/calendrier');
    report.calendrier = await grab(page, ['calendrier']);
    await page.screenshot({ path: test.info().outputPath('recette-calendrier-1280.jpg'), fullPage: true, type: 'jpeg', quality: 70 });
    await page.goto('/budget');
    report.budget = await grab(page, ['resume-plan', 'depassements', 'liste-recurrentes', 'virements-a-confirmer']);
    report.budgetTexte = clean(await page.locator('main').innerText()).slice(0, 2500);
    await page.goto('/wealth');
    report.patrimoine = clean(await page.locator('main').innerText()).slice(0, 2500);
    await page.goto('/recommandations');
    report.recommandations = await page.getByTestId('recommandation').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-rule')}: ${(e as HTMLElement).innerText.split('\n')[0]}`));

    // Écarts de cohérence vérifiables automatiquement
    const retained = firstAmount(home['capacite-retenue']);
    const unassigned = firstAmount(home['capacite-non-affectee']);
    const observed = firstAmount(home['excedent-observe']);
    if (retained !== 65_000) note('Accueil', `capacité retenue lue ${retained} ≠ 65 000 (650 € déclarés)`);
    if (observed !== 90_000) note('Accueil', `excédent observé lu ${observed} ≠ 90 000 (4 500 − 3 600)`);
    if (unassigned !== 20_000) note('Accueil', `capacité non affectée lue ${unassigned} ≠ 20 000 (650 − 450)`);
    const planText = (report.planRelu as Record<string, string | null>)['synthese-plan'];
    if (!amounts(planText).includes(20_000)) note('Plan d’épargne', `synthèse sans 200 € libres : ${planText}`);
  });

  test('4. Zakat incomplète puis complète, contributions, Zakat al-Fitr', async ({ page }) => {
    await signIn(page, F);
    await page.goto('/finance-islamique');
    report.engagementsAvantZakat = await grab(page, ['zakat-statut', 'zakat-reste', 'engagement-purification', 'solidarite-total']);
    await page.goto('/zakat');
    report.zakatSansPrix = clean(await page.locator('main').innerText()).slice(0, 1500);
    const price = page.getByTestId('form-prix');
    await price.getByRole('combobox', { name: /^Métal/ }).selectOption('XAG');
    await price.getByLabel('Prix par gramme de métal fin (€)').fill('1,30');
    await price.getByLabel('Source', { exact: true }).fill('Cotation fictive de recette');
    await price.getByRole('button', { name: 'Enregistrer le prix' }).click();
    const settings = page.getByTestId('form-reglages-zakat');
    await settings.getByLabel('Argent (595 g de métal fin)').check();
    await settings.getByLabel('Année lunaire (354 jours, 2,5 %)').check();
    const hawl = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    await settings.getByLabel('Début de votre année de possession (Hawl)').fill(hawl);
    await settings.getByRole('button', { name: 'Enregistrer mes choix' }).click();
    await page.getByTestId('form-enregistrer-calcul').getByRole('button', { name: 'Enregistrer ce calcul' }).click();
    await expect(page.getByTestId('calcul-zakat').first()).toBeVisible();
    report.zakatCalcul = await grab(page, ['calcul-zakat', 'zakat-statut', 'historique-zakat']);

    await page.goto('/dons');
    const form = page.getByTestId('form-don');
    const declare = async (kind: string, amount: string, calc: boolean, n: number) => {
      await form.getByLabel('Type').selectOption(kind);
      await form.getByLabel('Montant (€)').fill(amount);
      await form.getByLabel('Bénéficiaire').fill('Association fictive de recette');
      if (calc) await form.getByLabel(/Affecter à un calcul de Zakat/).selectOption({ index: 1 });
      await form.getByRole('button', { name: 'Enregistrer le don' }).click();
      await expect(page.getByTestId('don')).toHaveCount(n);
    };
    await declare('zakat', '100,00', true, 1);
    await declare('sadaqah', '50,00', false, 2);
    report.dons = await grab(page, ['synthese-dons']);

    await page.goto('/zakat/al-fitr');
    const fitr = page.getByTestId('form-fitr');
    await fitr.getByLabel('Nombre de personnes').fill('5');
    await fitr.getByLabel('Montant par personne (€)').fill('10');
    await fitr.getByLabel('Source du montant').fill('Montant fictif de recette');
    await fitr.getByRole('button', { name: 'Enregistrer' }).click();
    await page.reload();
    report.fitr = clean(await page.locator('main').innerText()).slice(0, 1200);

    await page.goto('/finance-islamique');
    const e = await grab(page, ['zakat-statut', 'zakat-dernier-calcul', 'engagement-zakat', 'solidarite-total', 'solidarite-types', 'solidarite-statuts']);
    report.engagements = e;
    const remaining = firstAmount((await grab(page, ['zakat-reste']))['zakat-reste']);
    await page.goto('/dashboard');
    const homeRemaining = firstAmount((await grab(page, ['zakat-reste']))['zakat-reste']);
    if (remaining !== homeRemaining) note('Zakat', `restant Mes engagements ${remaining} ≠ accueil ${homeRemaining}`);
  });

  test('5. purification : confirmation, méthodologie, enregistrement ; engagements', async ({ page }) => {
    await signIn(page, F);
    await page.goto('/purification');
    const items = page.getByTestId('liste-a-examiner').getByTestId('element-purification');
    report.purificationDetectee = { count: await items.count(), synthese: (await grab(page, ['synthese-purification']))['synthese-purification'] };
    if ((await items.count()) === 0) { note('Purification', 'intérêts créditeurs importés non détectés'); return; }
    await items.first().getByTestId('form-confirmer-purification').getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByTestId('liste-confirmes').getByTestId('element-purification')).toHaveCount(1);
    const method = page.getByTestId('form-methodologie');
    await method.getByLabel(/net crédité/).check();
    await method.getByRole('button', { name: 'Enregistrer la méthodologie' }).click();
    await expect(method.getByRole('status')).toBeVisible();
    await page.reload();
    report.purificationConfirmee = await grab(page, ['synthese-purification', 'liste-confirmes']);
    await page.goto('/finance-islamique');
    report.engagementsPurificationAvant = await grab(page, ['engagement-purification']);
    await page.goto('/purification');
    const record = page.getByTestId('form-purification-realisee');
    await record.getByLabel('Bénéficiaire').fill('Association fictive de recette');
    await record.getByRole('button', { name: 'Enregistrer la purification' }).click();
    await expect(page.getByTestId('liste-purifications')).toBeVisible();
    await page.goto('/finance-islamique');
    report.engagementsFinal = await grab(page, ['engagement-purification', 'solidarite-total', 'solidarite-types', 'solidarite-statuts']);
    await page.screenshot({ path: test.info().outputPath('recette-engagements-1280.jpg'), fullPage: true, type: 'jpeg', quality: 70 });

    // Vocabulaire : aucune consultation ou déclaration présentée comme un paiement exécuté par l'application
    const pages = ['/dashboard', '/finance-islamique', '/zakat', '/zakat/al-fitr', '/purification', '/dons', '/goals', '/budget/plan-epargne'];
    const wording: Record<string, string[]> = {};
    for (const p of pages) {
      await page.goto(p);
      const t = clean(await page.locator('main').innerText());
      const hits = [...t.matchAll(/[^.]{0,60}\b(payé|payée|paiement effectué|virement effectué|transféré|versé par l’application)\b[^.]{0,40}/gi)].map((m) => m[0].trim());
      if (hits.length) wording[p] = hits;
    }
    report.vocabulairePaiement = wording;
  });

  test('6. préférences et données après rafraîchissement ; actions rapides ; navigation', async ({ page }) => {
    await signIn(page, F);
    await page.goto('/dashboard');
    await page.getByTestId('form-affichage').getByRole('button').click();
    await expect(page.getByTestId('accueil')).toHaveAttribute('data-layout', 'classic');
    await page.reload();
    report.affichageApresRechargement = await page.getByTestId('accueil').getAttribute('data-layout');
    await page.getByTestId('form-affichage').getByRole('button').click();
    await page.getByTestId('bouton-actions-rapides-ordinateur').click();
    report.actionsRapides = await page.getByRole('dialog', { name: 'Actions rapides' }).getByTestId('action-rapide').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
    await page.keyboard.press('Escape');
    report.navigation = await page.getByTestId('entree-navigation').allInnerTexts();
    // Les liens de chaque action rapide aboutissent
    for (const href of await page.getByTestId('panneau-actions-rapides').getByRole('link', { includeHidden: true }).evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      const status = (await page.request.get(href)).status();
      if (status !== 200) note('Actions rapides', `${href} → HTTP ${status}`);
    }
  });
});
