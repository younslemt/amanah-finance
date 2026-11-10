import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { LogoMark } from '@/components/ui';
import { brand } from '@/config/brand';
import { isDemoMode } from '@/lib/env';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  if (isDemoMode) redirect('/dashboard'); // pas de parcours d'accueil en démonstration
  return (
    <div className="min-h-dvh bg-ivory">
      <header className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
        <LogoMark className="h-7 w-7 text-primary-900" />
        <span className="font-[family-name:var(--font-display)] text-lg text-primary-900">{brand.shortName}</span>
        <form action="/auth/signout" method="post" className="ml-auto">
          <button type="submit" className="text-sm text-primary-800 underline-offset-4 hover:underline">Se déconnecter</button>
        </form>
      </header>
      <main id="contenu" className="mx-auto w-full max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
