'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn, LogoMark } from '@/components/ui';
import { fr } from '@/messages/fr';
import { brand } from '@/config/brand';

const NAV = [
  { href: '/dashboard', label: fr.nav.dashboard, icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
  { href: '/budget', label: fr.nav.budget, icon: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  { href: '/goals', label: fr.nav.goals, icon: 'M12 21a9 9 0 110-18 9 9 0 010 18zm0-4a5 5 0 110-10 5 5 0 010 10zm0-4a1 1 0 110-2 1 1 0 010 2z' },
  { href: '/zakat', label: fr.nav.zakat, icon: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z' },
  { href: '/purification', label: fr.nav.purification, icon: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z' },
  { href: '/wealth', label: fr.nav.wealth, icon: 'M3 10l9-6 9 6M5 10v9m14-9v9M9 10v9m6-9v9M3 21h18' },
] as const;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function SignOut({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={className}>
      <button type="submit" className="text-sm underline-offset-4 hover:underline">{fr.nav.signOut}</button>
    </form>
  );
}

export function AppShell({ children, demo, displayName = null }: { children: ReactNode; demo: boolean; displayName?: string | null }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <a href="#contenu" className="sr-only z-50 rounded bg-paper px-3 py-2 text-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">{fr.nav.skip}</a>
      {/* Navigation latérale (tablette et ordinateur) */}
      <aside className="hidden border-r border-line bg-primary-900 text-ivory md:flex md:flex-col">
        <div className="pattern-khatam flex items-center gap-3 px-6 py-6">
          <LogoMark className="h-8 w-8 text-ivory" />
          <span className="font-[family-name:var(--font-display)] text-xl">{brand.shortName}</span>
        </div>
        <nav aria-label={fr.nav.main} className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
                isActive(item.href) ? 'bg-primary-800 text-ivory' : 'text-primary-100 hover:bg-primary-800/60')}>
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-3 px-6 py-5 text-primary-100">
          {demo ? null : (
            <>
              {displayName ? <p className="text-sm text-ivory">{displayName}</p> : null}
              <Link href="/comptes" className="block text-sm underline-offset-4 hover:underline">Mes comptes</Link>
              <Link href="/import" className="block text-sm underline-offset-4 hover:underline">Importer un relevé</Link>
              <Link href="/finance-islamique" className="block text-sm underline-offset-4 hover:underline">Finance islamique</Link>
              <Link href="/parametres" className="block text-sm underline-offset-4 hover:underline">Paramètres</Link>
              <SignOut />
            </>
          )}
          <p className="text-xs">{brand.tagline}</p>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col">
        {demo ? (
          <div role="status" className="bg-accent-100 px-4 py-2 text-center text-xs font-medium text-ink">{fr.app.demoBanner}</div>
        ) : null}
        <header className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3 md:hidden">
          <LogoMark className="h-7 w-7 text-primary-900" />
          <span className="font-[family-name:var(--font-display)] text-lg text-primary-900">{brand.shortName}</span>
          {demo ? null : (
            <div className="ml-auto flex items-center gap-4 text-sm text-primary-800">
              <Link href="/comptes" className="underline-offset-4 hover:underline">Comptes</Link>
              <Link href="/parametres" className="underline-offset-4 hover:underline">Paramètres</Link>
              <SignOut />
            </div>
          )}
        </header>
        <main id="contenu" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">{children}</main>

        {/* Barre de navigation mobile */}
        <nav aria-label={fr.nav.mobile} className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-6 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-1 py-2 text-[10.5px]', isActive(item.href) ? 'text-primary-800' : 'text-ink-muted')}>
              <Icon d={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
