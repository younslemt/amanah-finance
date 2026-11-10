import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { signUp } from '../actions';
import { AuthCard, authLink } from '../auth-card';

export const metadata: Metadata = { title: 'Créer un compte' };

export default function SignUpPage() {
  return (
    <AuthCard title="Créer un compte" subtitle="Votre adresse e-mail sera confirmée avant la première connexion."
      footer={<p>Déjà inscrit ? <Link className={authLink} href="/connexion">Se connecter</Link></p>}>
      {isDemoMode ? null : (
        <ActionForm action={signUp} submitLabel="Créer mon compte" testId="form-inscription">
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
          <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" required minLength={10}
            hint="Au moins 10 caractères, avec au moins une lettre et un chiffre." />
          <Field label="Confirmer le mot de passe" name="passwordConfirm" type="password" autoComplete="new-password" required />
        </ActionForm>
      )}
    </AuthCard>
  );
}
