import Link from 'next/link';
import type { Suggestion } from '@amanah/engines';
import { Badge } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { GROUP_LABEL, STATUS_LABEL, suggestionExplanation } from '@/lib/suggestion-text';
import { decideSuggestion } from '@/app/(app)/actions';

/**
 * Carte de suggestion : préparer (ouvre le parcours de création, rien n'est créé d'office),
 * me le rappeler plus tard (30 jours), ne plus me le proposer (rétablissable).
 */
export function SuggestionCard({ s, compact = false }: { s: Suggestion; compact?: boolean }) {
  return (
    <article className="flex flex-col rounded-xl border border-line bg-paper p-4" data-testid="suggestion" data-suggestion={s.id} data-statut={s.status}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-accent-600">{GROUP_LABEL[s.group]}</p>
          <h3 className="break-words text-lg text-primary-900">{s.title}</h3>
        </div>
        {s.status !== 'new' ? <Badge>{STATUS_LABEL[s.status]}</Badge> : null}
      </div>
      <p className="mt-1 text-sm text-ink-muted">{suggestionExplanation(s)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link href={s.href} className="rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory hover:bg-primary-700" data-testid="preparer-suggestion">
          Préparer ce projet
        </Link>
        {!compact && s.status === 'new' ? (
          <>
            <ActionForm action={decideSuggestion} submitLabel="Me le rappeler plus tard" variant="quiet" testId="reporter-suggestion">
              <input type="hidden" name="suggestionId" value={s.id} /><input type="hidden" name="decision" value="snooze" />
            </ActionForm>
            <ActionForm action={decideSuggestion} submitLabel="Ne plus me le proposer" variant="quiet" testId="ecarter-suggestion">
              <input type="hidden" name="suggestionId" value={s.id} /><input type="hidden" name="decision" value="dismiss" />
            </ActionForm>
          </>
        ) : null}
      </div>
    </article>
  );
}
