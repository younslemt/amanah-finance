import Link from 'next/link';
import type { QuickAction } from '@/lib/quick-actions';

/** Liste des actions rapides disponibles (contenu de la future feuille du bouton « + »). */
export function QuickActionList({ actions }: { actions: readonly QuickAction[] }) {
  if (actions.length === 0) return null;
  return (
    <ul className="divide-y divide-mist" data-testid="actions-rapides">
      {actions.map((a) => (
        <li key={a.id}>
          <Link href={a.href} className="flex min-h-11 items-center justify-between gap-3 py-3" data-testid="action-rapide" data-id={a.id}>
            <span>
              <span className="block font-semibold">{a.label}</span>
              <span className="block text-xs text-ink-muted">{a.hint}</span>
            </span>
            <span aria-hidden="true" className="text-ink-muted">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
