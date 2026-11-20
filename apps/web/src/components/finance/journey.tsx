import { JOURNEY_STEPS, type Journey } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { cn } from '@/components/ui';

/** Parcours d'un projet : Créer → Planifier → Simuler → Suivre → Réaliser (indicateur de progression). */
export function JourneySteps({ journey, compact = false }: { journey: Journey; compact?: boolean }) {
  const doneCount = JOURNEY_STEPS.filter((s) => journey.done[s]).length;
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label={`Parcours du projet : étape ${doneCount} sur ${JOURNEY_STEPS.length}`} data-testid="parcours-projet" data-current={journey.current}>
      {JOURNEY_STEPS.map((s, i) => {
        const done = journey.done[s];
        const current = journey.current === s && !done;
        return (
          <li key={s} className="flex items-center gap-1" aria-current={current ? 'step' : undefined}>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
              done ? 'bg-primary-50 text-primary-700' : current ? 'bg-accent-100 text-ink' : 'bg-mist text-ink-muted')}>
              <span aria-hidden="true">{done ? '✓' : i + 1}</span>
              {compact && !current && !done ? <span className="sr-only">{fr.goals.journey[s]}</span> : fr.goals.journey[s]}
              {done ? <span className="sr-only"> (fait)</span> : current ? <span className="sr-only"> (étape en cours)</span> : null}
            </span>
            {i < JOURNEY_STEPS.length - 1 ? <span aria-hidden="true" className="text-ink-muted">›</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
