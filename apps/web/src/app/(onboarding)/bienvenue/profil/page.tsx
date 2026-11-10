import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { requireSession } from '@/lib/supabase/session';
import { missingConsents } from '@/lib/legal/documents';
import { saveProfile } from '../../actions';

export const metadata: Metadata = { title: 'Votre profil' };

export default async function ProfileOnboardingPage() {
  const ctx = await requireSession();
  if (missingConsents(ctx.consents).length > 0) redirect('/bienvenue/consentements');
  if (ctx.profileCompleted) redirect('/dashboard');
  return (
    <>
      <PageHeader title="Votre profil" subtitle="Étape 2 sur 2 — quelques informations pour personnaliser votre espace." />
      <Card>
        <ActionForm action={saveProfile} submitLabel="Terminer" testId="form-profil">
          <input type="hidden" name="from" value="onboarding" />
          <Field label="Prénom ou pseudonyme" name="displayName" autoComplete="given-name" required maxLength={80} />
          <Field label="Nom du foyer" name="householdName" defaultValue="Mon foyer" required maxLength={120} />
          <SelectField label="Région de résidence (facultatif)" name="region" defaultValue="">
            <option value="">Je préfère ne pas indiquer</option>
            <option value="BRU">Bruxelles-Capitale</option>
            <option value="WAL">Wallonie</option>
            <option value="VLA">Flandre</option>
          </SelectField>
          <p className="text-xs text-ink-muted">Aucune date de naissance, adresse ou numéro national n’est demandé.</p>
        </ActionForm>
      </Card>
    </>
  );
}
