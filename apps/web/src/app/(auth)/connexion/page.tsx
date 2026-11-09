import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark, Notice } from '@/components/ui';
import { isDemoMode } from '@/lib/env';
import { parseAuthError, safeRedirectPath } from '@/lib/redirect';
import { fr } from '@/messages/fr';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: fr.auth.title };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const error = parseAuthError(params.erreur);
  const next = safeRedirectPath(params.next);
  return (
    <main className="pattern-khatam flex min-h-dvh items-center justify-center bg-primary-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-8 shadow-xl">
        <LogoMark className="mb-6 h-10 w-10 text-primary-900" />
        <h1 className="text-2xl text-primary-900">{fr.auth.title}</h1>
        <p className="mb-6 mt-1 text-sm text-ink-muted">{fr.auth.subtitle}</p>
        {error ? <div className="mb-4"><Notice tone="warning">{fr.auth.errors[error]}</Notice></div> : null}
        {isDemoMode ? <Notice>{fr.auth.demoDisabled}</Notice> : <SignInForm next={next} />}
        <p className="mt-6 text-xs text-ink-muted">{fr.auth.noCredentials}</p>
        {isDemoMode ? (
          <Link href="/dashboard" className="mt-4 block text-center text-sm text-primary-700 underline-offset-4 hover:underline">{fr.auth.demo}</Link>
        ) : null}
      </div>
    </main>
  );
}
