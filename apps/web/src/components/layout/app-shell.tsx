'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn, LogoMark } from '@/components/ui';
import { fr } from '@/messages/fr';
import { brand } from '@/config/brand';
import { activeChild, isItemActive } from '@/lib/navigation';
import type { ShellModel } from '@/lib/shell-data';
import { Icon } from './icons';
import { ProfileMenu } from './profile-menu';
import { QuickActions } from './quick-actions';

/**
 * Coque Islamic-first (lot 3) : cinq entrées — Accueil, Mes engagements (ou Finance islamique
 * sans consentement), Projets, Budget, Patrimoine.
 * - Ordinateur et tablette : navigation latérale ; sous-entrées Zakat, Purification, Solidarité
 *   avec consentement ; actions rapides et menu profil en bas de la colonne.
 * - Smartphone : barre basse (zones de sécurité), bouton « + » flottant, avatar dans l'en-tête.
 * Le modèle (`loadShell`) est résolu côté serveur ; ce composant ne fait que l'afficher.
 */
export function AppShell({ children, shell }: { children: ReactNode; shell: ShellModel }) {
  const pathname = usePathname();
  const { nav, demo, demoDate } = shell;
  const commitments = nav.find((n) => n.key === 'commitments')!;

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)] md:bg-[linear-gradient(to_right,var(--color-primary-900)_248px,transparent_248px)]" data-testid="coque" data-religious={commitments.children.length > 0 ? 'yes' : 'no'}>
      <a href="#contenu" className="sr-only z-50 rounded bg-paper px-3 py-2 text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">{fr.nav.skip}</a>

      {/* Navigation latérale (tablette et ordinateur) */}
      <aside className="hidden border-r border-line bg-primary-900 text-ivory md:sticky md:top-0 md:flex md:h-dvh md:flex-col">
        <div className="pattern-khatam flex items-center gap-3 px-6 py-6">
          <LogoMark className="h-8 w-8 text-ivory" />
          <span className="font-[family-name:var(--font-display)] text-xl">{brand.shortName}</span>
        </div>
        <nav aria-label={fr.nav.main} className="flex flex-1 flex-col gap-1 overflow-y-auto px-3">
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = isItemActive(item, pathname);
              const child = activeChild(item, pathname);
              return (
                <li key={item.key}>
                  <Link href={item.href} aria-current={active && !child ? 'page' : undefined} data-testid="entree-navigation" data-key={item.key}
                    className={cn('flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                      active ? 'bg-primary-800 text-ivory' : 'text-primary-100 hover:bg-primary-800/60')}>
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                  {item.children.length > 0 ? (
                    <ul className="mb-1 ml-8 mt-1 space-y-0.5 border-l border-primary-700 pl-3" data-testid="sous-entrees">
                      {item.children.map((c) => (
                        <li key={c.href}>
                          <Link href={c.href} aria-current={child === c.href ? 'page' : undefined} data-testid="sous-entree"
                            className={cn('flex min-h-10 items-center rounded-md px-2 text-sm',
                              child === c.href ? 'font-semibold text-accent-100' : 'text-primary-100 hover:text-ivory')}>
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="space-y-3 px-3 py-4">
          <QuickActions actions={shell.quickActions} demo={demo} variant="sidebar" />
          <ProfileMenu menu={shell.profile} initial={shell.initial} displayName={shell.displayName} placement="sidebar" />
          <p className="px-3 text-xs text-primary-100">{brand.tagline}</p>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {demo ? (
          <div role="status" className="bg-accent-100 px-4 py-2 text-center text-xs font-medium text-ink">
            {fr.app.demoBanner}
            {demoDate ? (
              <> {' '}Date simulée : <Link href="/simulation" className="underline underline-offset-2" data-testid="date-demo">{demoDate.split('-').reverse().join('/')}</Link></>
            ) : null}
          </div>
        ) : null}
        <header className="flex items-center gap-2 border-b border-line bg-paper px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
          <LogoMark className="h-7 w-7 text-primary-900" />
          <span className="font-[family-name:var(--font-display)] text-lg text-primary-900">{brand.shortName}</span>
          <div className="ml-auto">
            <ProfileMenu menu={shell.profile} initial={shell.initial} displayName={shell.displayName} placement="header" />
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(9rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-10">{children}</main>

        <QuickActions actions={shell.quickActions} demo={demo} variant="fab" />

        {/* Barre de navigation mobile */}
        <nav aria-label={fr.nav.mobile} className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur md:hidden">
          <ul className="grid grid-cols-5">
            {nav.map((item) => {
              const active = isItemActive(item, pathname);
              return (
                <li key={item.key} className="min-w-0">
                  <Link href={item.href} aria-current={active ? 'page' : undefined} data-testid="entree-navigation-mobile" data-key={item.key}
                    className={cn('flex min-h-14 flex-col items-center justify-center gap-1 border-t-2 px-0.5 py-1.5 text-center text-[11px] leading-tight',
                      active ? 'border-accent-500 font-semibold text-primary-900' : 'border-transparent text-ink-muted')}>
                    <Icon name={item.icon} />
                    <span className="max-w-full">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
