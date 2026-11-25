import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * Démonstration privée « telle que déployée » : build de production, mode démo, protection d'accès
 * exigée (DEMO_ACCESS_REQUIRED=true + DEMO_ACCESS_PASSWORD), moteur WebKit (celui de Safari) avec
 * l'écran d'un iPhone SE (375 px) et d'un iPhone 13 (390 px), navigation tactile.
 * Le mot de passe est généré par la CI et masqué dans le journal ; il n'est jamais écrit ici.
 */
const PASSWORD = process.env.E2E_DEMO_PASSWORD!;
test.skip(!PASSWORD, 'E2E_DEMO_PASSWORD absent');

const euros = (s: string) => new RegExp(s.replace(/ /g, '[\\s\\u00a0\\u202f]'));

async function login(page: Page, path = '/dashboard') {
  await page.goto(path);
  await expect(page).toHaveURL(/\/acces\?suite=/);
  await page.getByLabel('Mot de passe d’accès').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page).toHaveURL(new RegExp(`${path.replace(/[?]/g, '\\?')}$`));
}

async function noOverflow(page: Page, label: string) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra, `débordement horizontal : ${label}`).toBeLessThanOrEqual(1);
}

test('sans mot de passe : aucune page ni donnée, refus côté serveur', async ({ request, page }) => {
  // Requête d'un navigateur : redirection vers la page d'accès, sans contenu de l'application
  const html = await request.get('/dashboard', { headers: { accept: 'text/html' }, maxRedirects: 0 });
  expect(html.status()).toBe(307);
  expect(html.headers()['location']).toContain('/acces?suite=%2Fdashboard');
  expect(await html.text()).not.toMatch(/Mon Amanah|€/);
  // Autre requête (API, action serveur, outil) : 401 sans contenu
  for (const path of ['/dashboard', '/goals', '/zakat', '/budget/plan-epargne', '/avis']) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(401);
    expect(await r.text()).toBe('Accès réservé : démonstration privée.');
    expect(r.headers()['cache-control']).toContain('no-store');
  }
  const post = await request.post('/goals', { data: 'x=1', maxRedirects: 0 });
  expect(post.status()).toBe(401);
  // Mauvais mot de passe : refusé, aucun cookie
  await page.goto('/goals');
  await page.getByLabel('Mot de passe d’accès').fill('mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Entrer' }).click();
  await expect(page.getByTestId('erreur-acces')).toHaveText('Mot de passe incorrect.');
  expect((await page.context().cookies()).find((c) => c.name === 'amanah_acces')).toBeUndefined();
  // Ressources publiques nécessaires à l'installation, sans aucune donnée
  for (const path of ['/manifest.webmanifest', '/sw.js']) expect((await request.get(path)).status(), path).toBe(200);
});

test('cookie d’accès : httpOnly, SameSite=Lax, Secure derrière HTTPS', async ({ request }) => {
  const r = await request.post('/acces/verifier', {
    form: { motdepasse: PASSWORD, suite: '/goals' }, maxRedirects: 0, headers: { 'x-forwarded-proto': 'https' },
  });
  expect(r.status()).toBe(303);
  expect(r.headers()['location']).toMatch(/\/goals$/);
  const cookie = r.headers()['set-cookie'] ?? '';
  expect(cookie).toMatch(/^amanah_acces=\d+\.[\w-]+;/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  expect(cookie).toMatch(/SameSite=lax/i);
  expect(cookie).not.toContain(PASSWORD);
  // Redirection ouverte impossible
  const open = await request.post('/acces/verifier', { form: { motdepasse: PASSWORD, suite: 'https://ailleurs.example' }, maxRedirects: 0 });
  expect(open.headers()['location']).toMatch(/\/dashboard$/);
});

test('parcours complet sur smartphone, conservé après rafraîchissement puis réinitialisé', async ({ page }, info) => {
  const thirdParty: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) thirdParty.push(u.host); });
  await login(page);
  const w = page.viewportSize()!.width;

  // Accueil Islamic-first
  await expect(page.getByTestId('accueil')).toHaveAttribute('data-layout', 'islamic_first');
  await expect(page.getByRole('heading', { level: 2, name: 'Mes engagements' })).toBeVisible();
  await noOverflow(page, `accueil ${w}`);
  await page.screenshot({ path: info.outputPath(`deploy-accueil-${w}.jpg`), type: 'jpeg', quality: 70 });

  // Navigation tactile (barre basse)
  const nav = page.getByRole('navigation', { name: 'Navigation mobile' });
  await nav.getByRole('link', { name: 'Projets' }).tap();
  await expect(page).toHaveURL(/\/goals$/);
  await nav.getByRole('link', { name: 'Mes engagements' }).tap();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mes engagements');
  await noOverflow(page, `engagements ${w}`);

  // Créer un objectif personnalisé (assistant en 3 étapes)
  await page.goto('/goals/nouveau');
  const form = page.getByTestId('form-objectif');
  await form.getByRole('radio', { name: /^Projet personnel/ }).check();
  await form.getByLabel('Nom du projet').fill('Voyage fictif');
  await form.getByTestId('etape-suivante').tap();
  await form.getByLabel('Montant cible (€)').fill('3 000');
  await form.getByTestId('etape-suivante').tap();
  await form.getByLabel('Mensualité prévue (€)').fill('150');
  await form.getByRole('button', { name: 'Créer l’objectif' }).tap();
  await expect(page).toHaveURL(/\/goals\/demo-\d+\?cree=1$/);
  const goal = page.url().split('?')[0]!;
  await noOverflow(page, `projet ${w}`);

  // Modifier, simuler, répartir virtuellement
  const plan = page.getByTestId('form-planifier');
  await plan.getByLabel('Montant cible (€)').fill('3 500');
  await plan.getByRole('button', { name: /valider mon plan/i }).tap();
  await expect(page.getByTestId('historique-modifications')).toContainText('Montant cible');
  const sim = page.getByTestId('form-simuler');
  await sim.getByLabel('Scénario 1 (€/mois)').fill('100');
  await sim.getByLabel('Scénario 2 (€/mois)').fill('250');
  await sim.getByLabel('Scénario 3 (€/mois)').fill('400');
  await sim.getByRole('button', { name: 'Comparer' }).tap();
  await expect(page.getByTestId('scenario')).toHaveCount(3);
  const alloc = page.getByTestId('form-allocation');
  await alloc.getByLabel('Montant (€)').fill('200');
  await alloc.getByRole('button', { name: 'Valider' }).tap();
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('200,00 €'));

  // Accepter une suggestion
  await page.goto('/goals');
  const sugg = page.getByTestId('suggestion').filter({ has: page.getByTestId('preparer-suggestion') }).first();
  const suggId = await sugg.getAttribute('data-suggestion');
  await sugg.getByTestId('preparer-suggestion').tap();
  const sform = page.getByTestId('form-objectif');
  await sform.getByTestId('etape-suivante').tap();
  await sform.getByLabel('Montant cible (€)').fill('600');
  await sform.getByTestId('etape-suivante').tap();
  await sform.getByLabel('Mensualité prévue (€)').fill('50');
  await sform.getByRole('button', { name: 'Créer l’objectif' }).tap();
  await expect(page).toHaveURL(/\?cree=1$/);
  await page.goto('/goals');
  await expect(page.locator(`[data-testid="suggestion"][data-suggestion="${suggId}"]`)).toHaveCount(0);

  // Calendrier, Zakat fictive, purification fictive
  for (const [path, heading] of [['/goals/calendrier', 'Calendrier financier familial'], ['/zakat', 'Zakat'], ['/purification', 'Purification']] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await noOverflow(page, `${path} ${w}`);
  }
  await page.goto('/finance-islamique');
  await expect(page.getByTestId('lien-purification')).toHaveText('Examiner les opérations fictives');

  // Préférences
  await page.goto('/goals/preferences');
  const prefs = page.getByTestId('form-preferences');
  await prefs.getByRole('group', { name: 'Projets qui m’intéressent' }).getByLabel('Mariage').check();
  await prefs.getByRole('button', { name: 'Enregistrer mes préférences' }).tap();
  await expect(prefs.getByRole('status')).toContainText('recalculés');

  // Conservé après rafraîchissement (cookie de démonstration en production)
  await page.goto(goal);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Voyage fictif');
  await expect(page.getByTestId('historique-affectations')).toContainText(euros('200,00 €'));
  const demoCookies = (await page.context().cookies()).filter((c) => c.name.startsWith('amanah_demo'));
  expect(demoCookies.length).toBeGreaterThan(0);
  for (const c of demoCookies) { expect(c.httpOnly).toBe(true); expect(c.sameSite).toBe('Lax'); }

  // Réinitialiser
  await page.goto('/goals');
  await page.getByText('Réinitialiser la démonstration').tap();
  await page.getByTestId('form-reinitialiser').getByRole('button').tap();
  await expect(page.getByTestId('form-reinitialiser').getByRole('status')).toContainText('réinitialisée');
  await page.reload();
  await expect(page.getByTestId('liste-projets')).not.toContainText('Voyage fictif');

  // Avis des testeurs : e-mail prérempli, aucune donnée bancaire demandée
  await page.goto('/avis');
  await expect(page.getByTestId('lien-envoyer-avis')).toHaveAttribute('href', /^mailto:avis%40example\.test\?/);
  await noOverflow(page, `avis ${w}`);

  // Aucune requête vers un tiers ; aucune variable sensible dans les pages
  expect(thirdParty, 'requêtes vers des domaines tiers').toEqual([]);
  const htmlSource = await (await page.request.get('/dashboard')).text();
  for (const leak of ['SUPABASE', 'service_role', 'ENABLE_BANKING', PASSWORD]) expect(htmlSource.includes(leak), leak).toBe(false);
});

test('installation sur l’écran d’accueil : manifeste, icônes, mode autonome', async ({ page, request }) => {
  await login(page);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
  for (const icon of manifest.icons as Array<{ src: string }>) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).not.toHaveCount(0);
  await expect(page.locator('meta[name="theme-color"]')).not.toHaveCount(0);
});

test('deux testeurs : chacun modifie ses données fictives sans toucher à celles de l’autre', async ({ browser }, info) => {
  const device = info.project.use;
  const open = async (): Promise<[BrowserContext, Page]> => {
    const ctx = await browser.newContext({ ...device });
    const p = await ctx.newPage();
    await login(p, '/goals');
    return [ctx, p];
  };
  const [ctxA, a] = await open();
  const [ctxB, b] = await open();
  await a.goto('/goals/nouveau');
  const form = a.getByTestId('form-objectif');
  await form.getByRole('radio', { name: /^Projet personnel/ }).check();
  await form.getByLabel('Nom du projet').fill('Projet du testeur A');
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Montant cible (€)').fill('1 000');
  await form.getByTestId('etape-suivante').click();
  await form.getByLabel('Mensualité prévue (€)').fill('50');
  await form.getByRole('button', { name: 'Créer l’objectif' }).click();
  await expect(a).toHaveURL(/\?cree=1$/);
  await b.goto('/goals');
  await expect(b.getByTestId('liste-projets')).not.toContainText('Projet du testeur A');
  await a.goto('/goals');
  await expect(a.getByTestId('liste-projets')).toContainText('Projet du testeur A');
  await ctxA.close();
  await ctxB.close();
});
