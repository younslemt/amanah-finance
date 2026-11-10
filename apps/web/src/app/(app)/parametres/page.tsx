import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import Link from 'next/link';
import { APP_DOCUMENTS } from '@/lib/legal/documents';
import { formatDate } from '@/lib/format';
import { deleteAccount, saveProfile, withdrawConsent } from '../../(onboarding)/actions';

export const metadata: Metadata = { title: 'Paramètres' };

export default async function SettingsPage() {
  if (isDemoMode) redirect('/dashboard');
  const ctx = await requireOnboardedSession();
  const { data: household } = await ctx.supabase.from('households').select('name, region').eq('id', ctx.householdId).single();
  const latest = (kind: string) => ctx.consents.filter((c) => c.kind === kind).sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))[0];

  return (
    <>
      <PageHeader title="Paramètres" subtitle={ctx.email ?? undefined} />

      <Card>
        <CardTitle>Profil</CardTitle>
        <ActionForm action={saveProfile} submitLabel="Enregistrer le profil" testId="form-parametres-profil">
          <Field label="Prénom ou pseudonyme" name="displayName" defaultValue={ctx.displayName ?? ''} required maxLength={80} />
          <Field label="Nom du foyer" name="householdName" defaultValue={household?.name ?? ''} required maxLength={120} readOnly={!ctx.isOwner}
            hint={ctx.isOwner ? undefined : 'Seul le propriétaire du foyer peut modifier son nom et sa région.'} />
          <SelectField label="Région de résidence" name="region" defaultValue={household?.region ?? ''} disabled={!ctx.isOwner}>
            <option value="">Non indiquée</option>
            <option value="BRU">Bruxelles-Capitale</option>
            <option value="WAL">Wallonie</option>
            <option value="VLA">Flandre</option>
          </SelectField>
        </ActionForm>
      </Card>

      <Card className="mt-4">
        <CardTitle>Consentements</CardTitle>
        <ul className="divide-y divide-line">
          {APP_DOCUMENTS.map((d) => {
            const r = latest(d.kind);
            return (
              <li key={d.kind} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-ink-muted">Version {d.version}{r ? ` · enregistré le ${formatDate(r.recorded_at.slice(0, 10))}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={r?.granted ? 'positive' : 'warning'}>{r?.granted ? 'Accepté' : 'Non accepté'}</Badge>
                  {d.nature !== 'acknowledgement' && r?.granted ? (
                    <ActionForm action={withdrawConsent} submitLabel="Retirer" variant="quiet" testId={`form-retrait-${d.kind}`}>
                      <input type="hidden" name="kind" value={d.kind} />
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-ink-muted">Le retrait des conditions d’utilisation suspend l’accès à l’application jusqu’à une nouvelle acceptation. L’historique de vos choix est conservé comme preuve.</p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Finance islamique</CardTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">Consentement explicite distinct (article 9 du RGPD), facultatif et retirable sans perdre l’accès au budget.</p>
          <Badge tone={ctx.religiousEnabled ? 'positive' : 'neutral'}>{ctx.religiousEnabled ? 'Activée' : 'Désactivée'}</Badge>
        </div>
        <Link href="/finance-islamique" className="mt-3 inline-block text-sm font-medium text-primary-700 underline-offset-4 hover:underline">
          {ctx.religiousEnabled ? 'Gérer la confidentialité ou retirer mon consentement' : 'Activer les fonctions de finance islamique'}
        </Link>
      </Card>

      <Card className="mt-4">
        <CardTitle>Supprimer mon compte</CardTitle>
        <Notice tone="warning">La suppression efface définitivement votre compte, votre profil et vos consentements. Si vous êtes seul dans votre foyer, toutes ses données sont effacées ; si d’autres personnes en font partie, les données communes leur restent, votre nom en est retiré et vos données de finance islamique sont effacées. Elle ne peut pas être annulée.</Notice>
        <ActionForm action={deleteAccount} submitLabel="Supprimer définitivement" variant="danger" className="mt-3" testId="form-suppression">
          <Field label="Saisissez SUPPRIMER pour confirmer" name="confirmation" autoComplete="off" required />
        </ActionForm>
      </Card>
    </>
  );
}
