import Link from 'next/link';
import type { HomeAction } from '@/lib/home-actions';

/** « Mes prochaines actions » : une observation, un lien vers l'écran où agir. */
export function HomeActionList({ actions, empty = 'Rien à signaler pour le moment.' }: { actions: readonly HomeAction[]; empty?: string }) {
  if (actions.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-mist rounded-2xl border border-line bg-paper px-4" data-testid="prochaines-actions">
      {actions.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-3" data-testid="prochaine-action" data-kind={a.kind}>
          <span className="text-sm">{a.observation}</span>
          <Link href={a.href} className="shrink-0 text-sm font-semibold text-primary-800 underline underline-offset-4">{a.cta}</Link>
        </li>
      ))}
    </ul>
  );
}
