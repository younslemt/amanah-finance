import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents';
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
          <Field label="Nom du foyer" name="householdName" defaultValue={household?.name ?? ''} required maxLength={120} />
          <SelectField label="Région de résidence" name="region" defaultValue={household?.region ?? ''}>
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
          {LEGAL_DOCUMENTS.map((d) => {
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
        <p className="mt-3 text-xs text-ink-muted">Le retrait suspend l’accès à l’application jusqu’à un nouveau consentement. L’historique de vos choix est conservé comme preuve.</p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Supprimer mon compte</CardTitle>
        <Notice tone="warning">La suppression efface définitivement votre compte, votre profil, vos consentements et toutes les données de votre foyer. Elle ne peut pas être annulée.</Notice>
        <ActionForm action={deleteAccount} submitLabel="Supprimer définitivement" variant="danger" className="mt-3" testId="form-suppression">
          <Field label="Saisissez SUPPRIMER pour confirmer" name="confirmation" autoComplete="off" required />
        </ActionForm>
      </Card>
    </>
  );
}
