import type { Metadata } from 'next';
import { brand } from '@/config/brand';
import { safeNextPath } from '@/lib/demo-access';

export const metadata: Metadata = { title: 'Démonstration privée', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  motdepasse: 'Mot de passe incorrect.',
  configuration: 'La démonstration n’est pas configurée : contactez la personne qui vous a invité.',
};

/**
 * Accès à la démonstration privée : mot de passe vérifié par le serveur (/acces/verifier), qui
 * dépose un cookie signé. Aucune donnée n'est affichée avant. Données de démonstration FICTIVES.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ suite?: string; erreur?: string }> }) {
  const { suite, erreur } = await searchParams;
  const error = erreur ? ERRORS[erreur] ?? ERRORS.motdepasse : null;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5 py-10">
      <div>
        <p className="font-[family-name:var(--font-display)] text-2xl text-primary-900">{brand.name}</p>
        <h1 className="mt-2 text-xl text-primary-900">Démonstration privée</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Accès réservé aux personnes invitées. Toutes les données sont fictives : n’y saisissez jamais de donnée bancaire ou personnelle réelle.
        </p>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-critical/40 bg-critical/5 px-3 py-2 text-sm" data-testid="erreur-acces">{error}</p> : null}
      <form action="/acces/verifier" method="post" className="space-y-4" data-testid="form-acces">
        <input type="hidden" name="suite" value={safeNextPath(suite)} />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Mot de passe d’accès</span>
          <input type="password" name="motdepasse" required autoComplete="current-password" autoFocus
            className="block min-h-12 w-full rounded-lg border border-line bg-paper px-3 text-base" />
        </label>
        <button type="submit" className="min-h-12 w-full rounded-lg bg-primary-800 px-4 font-semibold text-ivory hover:bg-primary-900">Entrer</button>
      </form>
      <p className="text-xs text-ink-muted">Vos modifications restent dans ce navigateur uniquement (cookie) : elles ne sont ni partagées avec les autres testeurs, ni synchronisées entre vos appareils.</p>
    </main>
  );
}
