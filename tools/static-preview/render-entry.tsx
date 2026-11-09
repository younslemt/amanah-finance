// Point d'entrée de l'aperçu : rend les VRAIS composants de apps/web en HTML statique.
import { renderToString } from 'react-dom/server';
import RootLayout from '@/app/layout';
import AppLayout from '@/app/(app)/layout';
import Dashboard from '@/app/(app)/dashboard/page';
import Budget from '@/app/(app)/budget/page';
import Goals from '@/app/(app)/goals/page';
import Zakat from '@/app/(app)/zakat/page';
import Purification from '@/app/(app)/purification/page';
import Wealth from '@/app/(app)/wealth/page';
import SignIn from '@/app/(auth)/connexion/page';
import { __preview } from 'next/navigation';
import { brand, brandIconSvg } from '@/config/brand';
export { brandIconSvg };
import { fr } from '@/messages/fr';

type Page = { path: string; title: string; render: () => Promise<JSX.Element>; app: boolean };
export const PAGES: Page[] = [
  { path: '/dashboard', title: fr.nav.dashboard, render: () => Dashboard(), app: true },
  { path: '/budget', title: fr.budget.title, render: () => Budget(), app: true },
  { path: '/goals', title: fr.goals.title, render: () => Goals(), app: true },
  { path: '/zakat', title: fr.zakat.title, render: () => Zakat(), app: true },
  { path: '/purification', title: fr.purification.title, render: () => Purification(), app: true },
  { path: '/wealth', title: fr.wealth.title, render: () => Wealth(), app: true },
  { path: '/connexion', title: fr.auth.title, render: () => SignIn({ searchParams: Promise.resolve({}) }), app: false },
];

export async function renderPage(p: Page): Promise<string> {
  __preview.pathname = p.path;
  const content = await p.render();
  const tree = <RootLayout>{p.app ? <AppLayout>{content}</AppLayout> : content}</RootLayout>;
  const html = renderToString(tree);
  const head = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="${brand.colors.primary900}"><title>${p.title} · ${brand.name}</title><link rel="icon" href="/icons/icon.svg"><link rel="stylesheet" href="/styles.css"></head>`;
  return '<!DOCTYPE html>' + html.replace(/^(<html[^>]*>)/, `$1${head}`);
}
