import Link from 'next/link';
import { isReligiousGoal, type GoalKind } from '@amanah/engines';
import { fr } from '@/messages/fr';

/**
 * Choix de la catégorie en grandes cartes (boutons radio : clavier, lecteurs d'écran et
 * fonctionnement sans JavaScript). L'Aïd a son propre parcours (budget détaillé, date).
 */
export function CategoryPicker({ kinds, withEid, defaultValue }: { kinds: readonly GoalKind[]; withEid: boolean; defaultValue?: string }) {
  return (
    <fieldset className="sm:col-span-2" data-testid="choix-categorie">
      <legend className="mb-2 text-sm font-medium">Catégorie du projet</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {kinds.map((k) => (
          <label key={k} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-paper p-3 text-sm hover:border-primary-700 has-[:checked]:border-primary-700 has-[:checked]:bg-primary-50">
            <input type="radio" name="kind" value={k} required defaultChecked={k === defaultValue} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-700)]" />
            <span>
              <span className="block font-semibold text-primary-900">{fr.goals.kind[k]}{isReligiousGoal(k) ? ' · privé' : ''}</span>
              <span className="block text-xs text-ink-muted">{fr.goals.kindHint[k]}</span>
            </span>
          </label>
        ))}
        {withEid ? (
          <Link href="/goals/aid" className="flex items-start gap-3 rounded-xl border border-dashed border-line p-3 text-sm hover:border-primary-700" data-testid="categorie-aid">
            <span aria-hidden="true" className="mt-0.5 text-lg leading-none">→</span>
            <span>
              <span className="block font-semibold text-primary-900">{fr.goals.kind.eid_al_adha} · privé</span>
              <span className="block text-xs text-ink-muted">{fr.goals.kindHint.eid_al_adha} — parcours dédié</span>
            </span>
          </Link>
        ) : null}
      </div>
    </fieldset>
  );
}
