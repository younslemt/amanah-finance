import type { Metadata } from 'next';
import { brand } from '@/config/brand';

export const metadata: Metadata = { title: 'Hors ligne' };
export const dynamic = 'force-static';

/** Page affichée sans réseau. Statique : aucune donnée personnelle n'est conservée hors ligne. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl text-primary-900">Vous êtes hors ligne</h1>
      <p className="text-ink-muted">{brand.name} a besoin d’une connexion pour afficher vos données : rien n’est conservé sur l’appareil, par sécurité.</p>
      <p className="text-ink-muted">Vérifiez votre connexion, puis réessayez.</p>
      {/* Lien classique (rechargement complet) : volontaire hors ligne */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/dashboard" className="mx-auto rounded-lg bg-primary-800 px-4 py-2.5 font-medium text-ivory">Réessayer</a>
    </main>
  );
}
