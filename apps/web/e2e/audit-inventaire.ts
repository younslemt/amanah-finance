import type { Page } from '@playwright/test';

/**
 * Inventaire d'un écran pour l'audit fonctionnel (aucune action n'est déclenchée) :
 * statut HTTP, titre, formulaires visibles et leur bouton d'envoi, boutons hors formulaire,
 * mentions de démonstration ou de lecture seule.
 */
export interface ScreenInventory {
  route: string;
  status: number;
  h1: string | null;
  forms: Array<{ id: string | null; submit: string | null; visible: boolean }>;
  buttons: string[];
  notices: string[];
}

export const AUDIT_ROUTES = [
  '/dashboard', '/finance-islamique', '/zakat', '/zakat/al-fitr', '/purification', '/dons',
  '/goals', '/goals/nouveau', '/goals/aid', '/goals/calendrier', '/goals/preferences',
  '/budget', '/budget/plan-epargne', '/budget/optimiser', '/comptes', '/import', '/wealth',
  '/recommandations', '/parametres', '/simulation',
] as const;

export async function inventory(page: Page, route: string): Promise<ScreenInventory> {
  const res = await page.goto(route);
  const status = res?.status() ?? 0;
  const data = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const forms = [...main.querySelectorAll('form')].map((f) => {
      const holder = f.closest('[data-testid]');
      const submit = f.querySelector('button[type="submit"], button:not([type])');
      return { id: f.getAttribute('data-testid') ?? holder?.getAttribute('data-testid') ?? null, submit: submit?.textContent?.trim() ?? null, visible: vis(f) };
    });
    const buttons = [...main.querySelectorAll('button')].filter((b) => !b.closest('form') && vis(b)).map((b) => (b.textContent ?? '').trim()).filter(Boolean);
    const notices = [...main.querySelectorAll('[role="note"], [role="status"], [role="alert"], p')]
      .map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim())
      .filter((t) => /démonstration|lecture seule|ne permet que la lecture|désactivé|mode réel/i.test(t)).slice(0, 6);
    return { h1: document.querySelector('h1')?.textContent?.trim() ?? null, forms, buttons, notices };
  });
  return { route, status, ...data };
}
