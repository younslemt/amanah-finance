import type { ReactNode } from 'react';
import { LogoMark, Notice } from '@/components/ui';
import { isDemoMode } from '@/lib/env';
import { brand } from '@/config/brand';

/** Cadre commun des écrans d'authentification. */
export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="pattern-khatam flex min-h-dvh items-center justify-center bg-primary-900 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-8 shadow-xl">
        <LogoMark className="mb-6 h-10 w-10 text-primary-900" />
        <p className="text-xs uppercase tracking-wide text-accent-600">{brand.name}</p>
        <h1 className="text-2xl text-primary-900">{title}</h1>
        {subtitle ? <p className="mb-6 mt-1 text-sm text-ink-muted">{subtitle}</p> : <div className="mb-6" />}
        {isDemoMode ? <div className="mb-4"><Notice>La connexion est désactivée en mode démonstration : aucune donnée réelle n’est utilisée.</Notice></div> : null}
        {children}
        {footer ? <div className="mt-6 space-y-2 text-sm">{footer}</div> : null}
        <p className="mt-6 text-xs text-ink-muted">{brand.name} ne vous demandera jamais vos identifiants bancaires.</p>
      </div>
    </main>
  );
}

export const authLink = 'text-primary-700 underline underline-offset-4';
