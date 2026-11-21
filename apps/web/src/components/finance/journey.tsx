import Link from 'next/link';
import { JOURNEY_STEPS, type Journey, type JourneyAction, type JourneyStep } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { cn } from '@/components/ui';

/** Ancre de la section où se fait chaque étape (fiche du projet). */
export const STEP_ANCHOR: Record<JourneyStep, string> = { create: 'projet', plan: 'planifier', simulate: 'simuler', follow: 'suivre', realize: 'realiser' };

export function actionHref(goalId: string, action: JourneyAction, step: JourneyStep): string {
  return action === 'explore_solutions' ? `/goals/${goalId}/solutions` : `/goals/${goalId}#${STEP_ANCHOR[step]}`;
}

const DOT = { done: 'bg-primary-700 text-ivory', recommended: 'bg-accent-500 text-ink ring-2 ring-accent-100', available: 'bg-paper text-ink border border-line', locked: 'bg-mist text-ink-muted' } as const;

function stepTone(journey: Journey, s: JourneyStep): keyof typeof DOT {
  if (journey.recommended === s && !journey.done[s]) return 'recommended';
  return journey.status[s];
}

/**
 * Parcours compact (cartes de la liste) : chaque étape montre si elle est faite, conseillée,
 * disponible ou en attente. Une étape n'est « faite » que par une action de l'utilisateur.
 */
export function JourneySteps({ journey, compact = false }: { journey: Journey; compact?: boolean }) {
  const doneCount = JOURNEY_STEPS.filter((s) => journey.done[s]).length;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label={`Parcours du projet : ${doneCount} étape(s) sur ${JOURNEY_STEPS.length} accomplie(s)`}
      data-testid="parcours-projet" data-current={journey.current}>
      {JOURNEY_STEPS.map((s, i) => {
        const tone = stepTone(journey, s);
        return (
          <li key={s} className="flex items-center gap-1" data-etape={s} data-statut={journey.done[s] ? 'done' : tone} aria-current={tone === 'recommended' ? 'step' : undefined}>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
              journey.done[s] ? 'bg-primary-50 text-primary-700' : tone === 'recommended' ? 'bg-accent-100 text-ink' : 'bg-mist text-ink-muted')}>
              <span aria-hidden="true">{journey.done[s] ? '✓' : i + 1}</span>
              {compact && tone !== 'recommended' && !journey.done[s] ? <span className="sr-only">{fr.goals.journey[s]}</span> : fr.goals.journey[s]}
              <span className="sr-only"> ({journey.done[s] ? fr.goals.stepStatus.done : tone === 'recommended' ? 'conseillée' : fr.goals.stepStatus[journey.status[s]]})</span>
            </span>
            {i < JOURNEY_STEPS.length - 1 ? <span aria-hidden="true" className="text-ink-muted">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Parcours interactif (fiche du projet) : étape mise en avant et son action principale ;
 * toutes les étapes disponibles restent accessibles (retour en arrière libre).
 */
export function JourneyPanel({ goalId, journey }: { goalId: string; journey: Journey }) {
  const next = journey.next;
  return (
    <nav aria-label="Parcours du projet" className="rounded-xl border border-line bg-paper p-3 sm:p-4" data-testid="parcours-interactif">
      <JourneySteps journey={journey} />
      <ol className="mt-3 grid grid-cols-5 gap-1 text-center text-[11px] sm:text-xs" aria-hidden="true">
        {JOURNEY_STEPS.map((s) => {
          const tone = journey.done[s] ? 'done' : stepTone(journey, s);
          return (
            <li key={s}>
              <a href={`#${STEP_ANCHOR[s]}`} tabIndex={-1} className="flex flex-col items-center gap-1">
                <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold', DOT[tone])}>{journey.done[s] ? '✓' : JOURNEY_STEPS.indexOf(s) + 1}</span>
                <span className="leading-tight text-ink-muted">{fr.goals.journey[s]}</span>
              </a>
            </li>
          );
        })}
      </ol>
      {next ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="block text-xs uppercase tracking-wide text-accent-600">Prochaine étape conseillée · {fr.goals.journey[next.step]}</span>
            <span className="text-ink-muted">{fr.goals.stepHelp[next.step]}</span>
          </p>
          <Link href={actionHref(goalId, next.action, next.step)} data-testid="action-principale" data-action={next.action}
            className="inline-flex shrink-0 justify-center rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory hover:bg-primary-700">
            {fr.goals.action[next.action]}
          </Link>
        </div>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-sm text-ink-muted">Projet archivé : son historique reste consultable. Vous pouvez le restaurer à tout moment.</p>
      )}
    </nav>
  );
}
