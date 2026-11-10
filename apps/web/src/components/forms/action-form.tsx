'use client';
import { useActionState, type ReactNode } from 'react';
import { initialFormState, type FormState } from '@/lib/form-state';
import { cn } from '@/components/ui';

/**
 * Formulaire relié à une action serveur. Affiche les erreurs (globales et par champ)
 * dans une zone annoncée aux lecteurs d'écran.
 */
export function ActionForm({
  action, submitLabel, children, className, testId, variant = 'primary',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel: string;
  children?: ReactNode;
  className?: string;
  testId?: string;
  variant?: 'primary' | 'danger' | 'quiet';
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const errors = state.fieldErrors ? Object.values(state.fieldErrors) : [];
  const buttonClass = {
    primary: 'bg-primary-800 text-ivory hover:bg-primary-700',
    danger: 'bg-critical text-ivory hover:opacity-90',
    quiet: 'border border-line bg-paper text-ink hover:bg-mist',
  }[variant];
  return (
    <form action={formAction} className={cn('space-y-3', className)} data-testid={testId} noValidate>
      {state.status === 'error' ? (
        <div role="alert" className="rounded-lg border border-[#f0d3cd] bg-[#fbeeeb] p-3 text-sm text-critical">
          {state.message ? <p className="font-medium">{state.message}</p> : null}
          {errors.length ? <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
        </div>
      ) : null}
      {state.status === 'ok' && state.message ? (
        <p role="status" className="rounded-lg bg-primary-50 p-3 text-sm text-primary-900">{state.message}</p>
      ) : null}
      {children}
      <button type="submit" disabled={pending}
        className={cn('rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-60', buttonClass)}>
        {pending ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  );
}
