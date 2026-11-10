import type { Metadata } from 'next';
import Link from 'next/link';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { requestPasswordReset } from '../actions';
import { AuthCard, authLink } from '../auth-card';

export const metadata: Metadata = { title: 'Mot de passe oublié' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe."
      footer={<p><Link className={authLink} href="/connexion">Retour à la connexion</Link></p>}>
      {isDemoMode ? null : (
        <ActionForm action={requestPasswordReset} submitLabel="Envoyer le lien" testId="form-oubli">
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
        </ActionForm>
      )}
    </AuthCard>
  );
}
