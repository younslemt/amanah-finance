import Link from 'next/link';

/** Titre de section de l'accueil : typographie de titre, filet or, lien « Tout voir » facultatif. */
export function SectionHeader({ title, href, linkLabel = 'Tout voir', id }: { title: string; href?: string; linkLabel?: string; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-accent-500 pb-1.5">
      <h2 id={id} className="text-xl font-semibold text-primary-900">{title}</h2>
      {href ? <Link href={href} className="text-sm text-primary-800 underline-offset-4 hover:underline">{linkLabel}</Link> : null}
    </div>
  );
}
