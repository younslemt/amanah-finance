import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Affiche le contenu religieux personnalisé seulement avec un consentement en vigueur.
 * Sinon : contenu pédagogique général et proposition d'activation, sans aucune donnée personnelle.
 * Les règles d'accès en base restent la protection finale : ce composant ne remplace pas la RLS.
 */
export function ConsentGate({ religiousEnabled, children, fallback }: { religiousEnabled: boolean; children: ReactNode; fallback?: ReactNode }) {
  if (religiousEnabled) return <>{children}</>;
  return <>{fallback ?? <IslamicFinanceIntro />}</>;
}

/** Contenu pédagogique de la rubrique « Finance islamique » (aucune donnée personnelle). */
export function IslamicFinanceIntro({ activateHref = '/finance-islamique' }: { activateHref?: string | null }) {
  const topics = [
    { title: 'La Zakat', text: 'Nisab, hawl et biens concernés.' },
    { title: 'La purification', text: 'Intérêts et revenus à purifier.' },
    { title: 'La solidarité', text: 'Sadaqah, waqf et dons.' },
  ];
  return (
    <div data-testid="finance-islamique-pedagogique" className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-3">
        {topics.map((t) => (
          <li key={t.title} className="rounded-xl border border-line bg-paper p-3">
            <p className="text-sm font-semibold">{t.title}</p>
            <p className="text-xs text-ink-muted">{t.text}</p>
          </li>
        ))}
      </ul>
      {activateHref === null ? null : <div className="rounded-xl border border-dashed border-accent-600 bg-paper p-4 text-sm">
        <p className="font-semibold">Suivre mes propres engagements ?</p>
        <p className="mt-1 text-ink-muted">Ces informations révèlent des convictions religieuses : elles ne sont enregistrées qu’avec votre accord explicite, retirable à tout moment.</p>
        <Link href={activateHref} className="mt-3 inline-block rounded-lg bg-primary-700 px-4 py-3 font-semibold text-white">Activer mes engagements</Link>
      </div>}
    </div>
  );
}
