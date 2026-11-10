import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { parseAuthError, parseAuthInfo, safeRedirectPath } from '@/lib/redirect';
import { fr } from '@/messages/fr';
import { signIn } from '../actions';
import { AuthCard, authLink } from '../auth-card';

export const metadata: Metadata = { title: fr.auth.title };

const INFO: Record<string, string> = {
  signed_out: 'Vous êtes déconnecté.',
  password_updated: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.',
  account_deleted: 'Votre compte et toutes vos données ont été supprimés.',
  email_confirmed: 'Adresse confirmée. Vous pouvez vous connecter.',
  consent_withdrawn: 'Consentement retiré : l’accès est suspendu jusqu’à un nouveau consentement.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const error = parseAuthError(params.erreur);
  const info = parseAuthInfo(params.message);
  return (
    <AuthCard title={fr.auth.title} subtitle="Accédez à votre espace en toute sécurité."
      footer={<>
        <p><Link className={authLink} href="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
        <p>Pas encore de compte ? <Link className={authLink} href="/inscription">Créer un compte</Link></p>
        {isDemoMode ? <p><Link className={authLink} href="/dashboard">{fr.auth.demo}</Link></p> : null}
      </>}>
      {info ? <div className="mb-4"><Notice>{INFO[info]}</Notice></div> : null}
      {error ? <div className="mb-4"><Notice tone="warning">{fr.auth.errors[error]}</Notice></div> : null}
      {isDemoMode ? null : (
        <ActionForm action={signIn} submitLabel="Se connecter" testId="form-connexion">
          <input type="hidden" name="next" value={safeRedirectPath(params.next)} />
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
          <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        </ActionForm>
      )}
    </AuthCard>
  );
}
