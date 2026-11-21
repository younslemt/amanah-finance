'use client';
import { useEffect } from 'react';

/** Erreur d'affichage (réseau ou serveur) : message clair, aucune donnée technique exposée. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[app] erreur', error.digest ?? ''); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md rounded-xl border border-line bg-paper p-6 text-center" data-testid="erreur-page">
      <h1 className="text-xl text-primary-900">Affichage impossible pour le moment</h1>
      <p className="mt-2 text-sm text-ink-muted">La connexion a peut-être été interrompue. Vos données n’ont pas été modifiées.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory">Réessayer</button>
    </div>
  );
}
