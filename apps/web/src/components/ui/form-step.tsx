import type { ReactNode } from 'react';

/**
 * Étape d'un formulaire découpé (mobile) : « Étape n sur N » avec indicateur de progression.
 * Sans JavaScript : toutes les étapes restent dans le même formulaire, donc rien n'est perdu.
 * Avec <ActionForm wizard>, chaque étape devient un écran (Précédent / Suivant).
 */
export function FormStep({ step, total, title, children }: { step: number; total: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-testid="etape-formulaire" data-wizard-step={step} data-wizard-title={title}>
      <legend className="mb-2 w-full">
        <span className="flex items-center justify-between text-sm font-semibold text-primary-900">
          <span>{title}</span>
          <span className="text-xs font-normal text-ink-muted">Étape {step} sur {total}</span>
        </span>
        <span aria-hidden="true" className="mt-1 flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i < step ? 'bg-primary-700' : 'bg-line'}`} />
          ))}
        </span>
      </legend>
      {children}
    </fieldset>
  );
}
