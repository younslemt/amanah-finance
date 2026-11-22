import Link from 'next/link';

/** Une ligne « observation → action » (passerelle du lot 1 ou recommandation budgétaire). */
export interface ActionLine { id: string; kind: string; observation: string; cta: string; href: string; ruleId?: string }

/** « Mes prochaines actions » : une observation, un lien vers l'écran où agir. */
export function HomeActionList({ actions, empty = 'Rien à signaler pour le moment.' }: { actions: readonly ActionLine[]; empty?: string }) {
  if (actions.length === 0) return <p className="text-sm text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-mist rounded-2xl border border-line bg-paper px-4" data-testid="prochaines-actions">
      {actions.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3" data-testid="prochaine-action" data-kind={a.kind} data-rule={a.ruleId}>
          <span className="min-w-0 text-sm">{a.observation}</span>
          <Link href={a.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-800 underline underline-offset-4">{a.cta}</Link>
        </li>
      ))}
    </ul>
  );
}
