import type { Metadata } from 'next';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { requireSession } from '@/lib/supabase/session';
import { updatePassword } from '../actions';
import { AuthCard } from '../auth-card';

export const metadata: Metadata = { title: 'Nouveau mot de passe' };

export default async function ResetPasswordPage() {
  if (!isDemoMode) await requireSession(); // session ouverte par le lien de réinitialisation
  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Choisissez un nouveau mot de passe pour votre compte.">
      {isDemoMode ? null : (
        <ActionForm action={updatePassword} submitLabel="Enregistrer le mot de passe" testId="form-reinitialiser">
          <Field label="Nouveau mot de passe" name="password" type="password" autoComplete="new-password" required minLength={10}
            hint="Au moins 10 caractères, avec au moins une lettre et un chiffre." />
          <Field label="Confirmer le mot de passe" name="passwordConfirm" type="password" autoComplete="new-password" required />
        </ActionForm>
      )}
    </AuthCard>
  );
}
