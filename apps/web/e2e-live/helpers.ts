import { expect, type Page } from '@playwright/test';

/** Environnement fourni par le job CI (sortie de `supabase status`). */
export const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? '';
export const MAIL_URL = process.env.E2E_MAIL_URL ?? 'http://127.0.0.1:54324';

/** Identité FICTIVE propre à chaque exécution et à chaque appareil. */
export function fakeUser(label: string, project: string) {
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { email: `${label}-${project}-${stamp}@example.test`, password: 'Fictif-2026-mdp', name: `${label === 'a' ? 'Amina' : 'Bilal'} Test` };
}

/** Lien reçu dans la boîte de test locale (Mailpit, ou Inbucket sur les anciennes versions de la CLI). */
export async function latestLink(email: string, kind: 'signup' | 'recovery', after = 0): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const body = await readLatestMail(email, after);
    if (body) {
      const links = [...body.replace(/&amp;/g, '&').matchAll(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/g)].map((m) => m[0]);
      const link = links.find((l) => l.includes(`type=${kind}`)) ?? links[0];
      if (link) return link;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Aucun e-mail « ${kind} » reçu pour ${email}`);
}

async function readLatestMail(email: string, after: number): Promise<string | null> {
  // Mailpit
  const list = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).catch(() => null);
  if (list?.ok) {
    const data = (await list.json()) as { messages?: Array<{ ID: string; Created: string }> };
    const msg = (data.messages ?? []).filter((m) => Date.parse(m.Created) >= after).sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];
    if (!msg) return null;
    const full = (await (await fetch(`${MAIL_URL}/api/v1/message/${msg.ID}`)).json()) as { HTML?: string; Text?: string };
    return `${full.HTML ?? ''}\n${full.Text ?? ''}`;
  }
  // Inbucket
  const box = email.split('@')[0];
  const res = await fetch(`${MAIL_URL}/api/v1/mailbox/${box}`).catch(() => null);
  if (!res?.ok) return null;
  const items = (await res.json()) as Array<{ id: string; date: string }>;
  const last = items.filter((m) => Date.parse(m.date) >= after).pop();
  if (!last) return null;
  const full = (await (await fetch(`${MAIL_URL}/api/v1/mailbox/${box}/${last.id}`)).json()) as { body?: { html?: string; text?: string } };
  return `${full.body?.html ?? ''}\n${full.body?.text ?? ''}`;
}

/** Bouton ou lien visible (la navigation diffère entre mobile et ordinateur). */
export function visibleButton(page: Page, name: string | RegExp) {
  return page.getByRole('button', { name }).filter({ visible: true }).first();
}

export async function signUpAndConfirm(page: Page, user: { email: string; password: string }) {
  await page.goto('/inscription');
  await page.getByLabel('Adresse e-mail').fill(user.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(user.password);
  await page.getByLabel('Confirmer le mot de passe').fill(user.password);
  const sentAt = Date.now() - 2000;
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('status')).toContainText('lien de confirmation');
  return { sentAt };
}

export async function signIn(page: Page, user: { email: string; password: string }) {
  await page.goto('/connexion');
  await page.getByLabel('Adresse e-mail').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

export async function completeOnboarding(page: Page, name: string) {
  await expect(page).toHaveURL(/\/bienvenue\/consentements/);
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Accepter et continuer' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/profil/);
  await page.getByLabel('Prénom ou pseudonyme').fill(name);
  await page.getByLabel('Nom du foyer').fill(`Foyer de ${name}`);
  await page.getByRole('button', { name: 'Terminer' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

/** Jeton d'accès obtenu directement auprès de l'API d'authentification (pour les tests d'attaque). */
export async function apiToken(user: { email: string; password: string }): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!r.ok) throw new Error(`connexion API refusée (${r.status})`);
  return ((await r.json()) as { access_token: string }).access_token;
}

export function rest(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers ?? {}) },
  });
}

/** Montant tel qu'affiché en fr-BE (espaces insécables normalisés). */
export const euros = (s: string) => new RegExp(s.replace(/ /g, '[\\s\\u00a0\\u202f]').replace(',', ','));
