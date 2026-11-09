'use client';
import { useActionState } from 'react';
import { fr } from '@/messages/fr';
import { signInWithEmail, type SignInState } from './actions';

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInWithEmail, { status: 'idle' });
  if (state.status === 'sent') return <p role="status" className="rounded-lg bg-primary-50 p-3 text-sm text-primary-900">{fr.auth.sent}</p>;
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <label className="block text-sm font-medium" htmlFor="email">{fr.auth.email}</label>
      <input id="email" name="email" type="email" required autoComplete="email" inputMode="email"
        aria-invalid={state.error === 'invalid_email' || undefined} aria-describedby={state.error ? 'email-error' : undefined}
        className="w-full rounded-lg border border-line bg-ivory px-3 py-2.5 outline-none focus:border-primary-700" />
      {state.status === 'error' && state.error ? <p id="email-error" role="alert" className="text-sm text-critical">{fr.auth.formErrors[state.error]}</p> : null}
      <button type="submit" disabled={pending}
        className="w-full rounded-lg bg-primary-800 px-4 py-2.5 font-medium text-ivory transition-colors hover:bg-primary-700 disabled:opacity-60">
        {pending ? fr.auth.sending : fr.auth.submit}
      </button>
    </form>
  );
}
