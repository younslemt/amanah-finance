'use client';
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { initialFormState, type FormState } from '@/lib/form-state';
import { cn } from '@/components/ui';
import { notifyDataChanged } from '@/components/pwa/data-sync';

/**
 * Formulaire relié à une action serveur. Affiche les erreurs (globales et par champ)
 * dans une zone annoncée aux lecteurs d'écran.
 *
 * wizard : parcours guidé. Chaque <FormStep> devient un écran avec « Précédent » et
 * « Suivant » ; toutes les étapes restent dans le MÊME formulaire (masquées, jamais
 * démontées), donc revenir en arrière ne perd aucune saisie. Sans JavaScript, toutes les
 * étapes s'affichent ensemble et le formulaire fonctionne normalement.
 */
export function ActionForm({
  action, submitLabel, children, className, testId, variant = 'primary', wizard = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  testId?: string;
  variant?: 'primary' | 'danger' | 'quiet';
  wizard?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  /** Étape affichée (null : pas encore hydraté, ou formulaire simple : tout est visible). */
  const [step, setStep] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [announce, setAnnounce] = useState('');
  const steps = () => Array.from(formRef.current?.querySelectorAll<HTMLFieldSetElement>('[data-wizard-step]') ?? []);

  // React 19 vide le formulaire après chaque envoi : en cas d'erreur, la saisie est conservée
  // (envoi par onSubmit) ; elle n'est effacée qu'après un enregistrement réussi.
  useEffect(() => {
    if (state.status === 'ok') { formRef.current?.reset(); notifyDataChanged(); if (wizard) setStep(0); }
    // Erreur serveur sur un champ : retour à l'étape qui le contient
    if (state.status === 'error' && wizard && state.fieldErrors) {
      const first = Object.keys(state.fieldErrors)[0];
      const idx = steps().findIndex((f) => first && f.querySelector(`[name="${CSS.escape(first)}"]`));
      if (idx >= 0) setStep(idx);
    }
  }, [state, wizard]);

  useEffect(() => { if (wizard) { setCount(steps().length); setStep(0); } }, [wizard]);
  useEffect(() => {
    if (!wizard || step === null) return;
    const all = steps();
    all.forEach((f, i) => { f.hidden = i !== step; });
    const title = all[step]?.dataset.wizardTitle ?? '';
    setAnnounce(`Étape ${step + 1} sur ${all.length}${title ? ` : ${title}` : ''}`);
  }, [wizard, step]);

  const isLast = step === null || step >= count - 1;
  /** Une étape n'est franchie que si ses champs sont valides (messages natifs du navigateur). */
  const goNext = () => {
    if (step === null) return;
    const fields = Array.from(steps()[step]?.querySelectorAll<HTMLInputElement>('input, select, textarea') ?? []);
    const invalid = fields.find((f) => !f.checkValidity());
    if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    setStep(step + 1);
    requestAnimationFrame(() => steps()[step + 1]?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus());
  };
  const goBack = () => {
    if (step === null || step === 0) return;
    setStep(step - 1);
    requestAnimationFrame(() => steps()[step - 1]?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea')?.focus());
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (wizard && !isLast) { goNext(); return; } // « Entrée » au milieu du parcours : étape suivante
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  const errors = state.fieldErrors ? Object.values(state.fieldErrors) : [];
  const buttonClass = {
    primary: 'bg-primary-800 text-ivory hover:bg-primary-700',
    danger: 'bg-critical text-ivory hover:opacity-90',
    quiet: 'border border-line bg-paper text-ink hover:bg-mist',
  }[variant];
  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className={cn('space-y-3', className)} data-testid={testId} noValidate>
      {state.status === 'error' ? (
        <div role="alert" className="rounded-lg border border-[#f0d3cd] bg-[#fbeeeb] p-3 text-sm text-critical sm:col-span-2">
          {state.message ? <p className="font-medium">{state.message}</p> : null}
          {errors.length ? <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </div>
      ) : null}
      {state.status === 'ok' && state.message ? (
        <p role="status" className="rounded-lg bg-primary-50 p-3 text-sm text-primary-900 sm:col-span-2">{state.message}</p>
      ) : null}
      {wizard ? <p aria-live="polite" className="sr-only" data-testid="etape-annonce">{announce}</p> : null}
      {children}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        {wizard && step !== null && step > 0 ? (
          <button type="button" onClick={goBack} className="rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium hover:bg-mist" data-testid="etape-precedente">
            ← Précédent
          </button>
        ) : null}
        {wizard && !isLast ? (
          <button type="button" onClick={goNext} className={cn('rounded-lg px-4 py-2.5 text-sm font-medium', buttonClass)} data-testid="etape-suivante">
            Suivant →
          </button>
        ) : (
          <button type="submit" disabled={pending}
            className={cn('rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60', buttonClass)}>
            {pending ? 'Enregistrement…' : submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}
