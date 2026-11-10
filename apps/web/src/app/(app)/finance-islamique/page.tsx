import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Checkbox, RadioGroup } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { latestConsent, LEGAL_DRAFT_NOTICE, RELIGIOUS_DOCUMENT } from '@/lib/legal/documents';
import { formatDate } from '@/lib/format';
import { activateReligiousFeatures, saveReligiousSharing, withdrawReligiousConsent } from '../../(onboarding)/actions';

export const metadata: Metadata = { title: 'Finance islamique' };

const NEXT = new Set(['/goals', '/zakat', '/purification']);

export default async function IslamicFinancePage({ searchParams }: { searchParams: Promise<{ suite?: string; retrait?: string }> }) {
  const { suite, retrait } = await searchParams;
  if (isDemoMode) {
    return (
      <>
        <PageHeader title="Finance islamique" subtitle="Zakat, purification, objectif Hajj, dons religieux" />
        <Notice>En démonstration, ces fonctions sont ouvertes avec des données fictives. En mode réel, elles demandent un consentement explicite distinct (article 9 du RGPD).</Notice>
      </>
    );
  }
  const ctx = await requireOnboardedSession();
  const latest = latestConsent(ctx.consents, 'special_category');
  const { data: prefs } = ctx.religiousEnabled
    ? await ctx.supabase.from('religious_preferences').select('share_with_household').eq('user_id', ctx.userId).maybeSingle()
    : { data: null };
  const { count: members } = await ctx.supabase.from('household_members').select('user_id', { count: 'exact', head: true }).eq('household_id', ctx.householdId);

  return (
    <>
      <PageHeader title="Finance islamique" subtitle="Zakat, purification, objectif Hajj, dons religieux" />
      {retrait === 'keep' ? <Notice className="mb-4">Consentement retiré. Vos données de finance islamique sont conservées mais inaccessibles jusqu’à un nouveau consentement.</Notice> : null}
      {retrait === 'erase' ? <Notice className="mb-4">Consentement retiré. Vos données de finance islamique ont été effacées.</Notice> : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>État</CardTitle>
          <Badge tone={ctx.religiousEnabled ? 'positive' : 'neutral'}>{ctx.religiousEnabled ? 'Activées' : 'Désactivées'}</Badge>
        </div>
        <p className="text-sm text-ink-muted" data-testid="etat-finance-islamique">
          {ctx.religiousEnabled
            ? `Consentement explicite donné le ${formatDate(latest!.recorded_at.slice(0, 10))} (version ${RELIGIOUS_DOCUMENT.version}).`
            : 'Ces fonctions sont facultatives. Sans elles, vous utilisez normalement les comptes, le budget, l’import et le tableau de bord.'}
        </p>
      </Card>

      {!ctx.religiousEnabled ? (
        <Card className="mt-4" as="article">
          <h2 className="text-lg text-primary-900">{RELIGIOUS_DOCUMENT.title}</h2>
          <p className="mb-3 text-xs text-ink-muted">Version {RELIGIOUS_DOCUMENT.version}</p>
          <Notice tone="warning" className="mb-3">{LEGAL_DRAFT_NOTICE}</Notice>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg bg-mist p-3 text-sm leading-relaxed" tabIndex={0} aria-label={`Texte : ${RELIGIOUS_DOCUMENT.title}`}>
            {RELIGIOUS_DOCUMENT.body.split('\n\n').map((para) => <p key={para}>{para}</p>)}
          </div>
          <ActionForm action={activateReligiousFeatures} submitLabel="Activer" className="mt-4" testId="form-activer-finance-islamique">
            <input type="hidden" name="next" value={suite && NEXT.has(suite) ? suite : '/finance-islamique'} />
            <Checkbox name="consent_special_category" label={RELIGIOUS_DOCUMENT.checkboxLabel} required />
          </ActionForm>
        </Card>
      ) : (
        <>
          <Card className="mt-4">
            <CardTitle>Fonctions disponibles</CardTitle>
            <ul className="grid gap-2 sm:grid-cols-3">
              <li><Link href="/purification" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">Purification des intérêts</Link></li>
              <li><Link href="/goals" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">Objectif Hajj</Link></li>
              <li><Link href="/zakat" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">Zakat (estimation)</Link></li>
            </ul>
          </Card>

          <Card className="mt-4">
            <CardTitle>Confidentialité dans le foyer</CardTitle>
            <p className="mb-3 text-sm text-ink-muted">
              {(members ?? 1) > 1
                ? 'Votre foyer compte plusieurs membres. Par défaut, vos données de finance islamique ne sont visibles que par vous.'
                : 'Vous êtes seul dans votre foyer. Ce réglage s’appliquera si d’autres personnes le rejoignent.'}
            </p>
            <ActionForm action={saveReligiousSharing} submitLabel="Enregistrer" variant="quiet" testId="form-partage-religieux">
              <RadioGroup name="share" legend="Visibilité de mes données de finance islamique" defaultValue={prefs?.share_with_household ? 'yes' : 'no'}
                options={[
                  { value: 'no', label: 'Privées : visibles par moi seul (recommandé)' },
                  { value: 'yes', label: 'Partagées avec les membres du foyer qui ont eux-mêmes donné ce consentement' },
                ]} />
            </ActionForm>
          </Card>

          <Card className="mt-4">
            <CardTitle>Retirer mon consentement</CardTitle>
            <p className="mb-3 text-sm text-ink-muted">Seules les fonctions de finance islamique seront fermées. Votre budget et vos comptes restent accessibles.</p>
            <ActionForm action={withdrawReligiousConsent} submitLabel="Retirer mon consentement" variant="danger" testId="form-retrait-finance-islamique">
              <RadioGroup name="data" legend="Que deviennent mes données de finance islamique ?"
                options={[
                  { value: 'keep', label: 'Les conserver, inaccessibles, jusqu’à un éventuel nouveau consentement' },
                  { value: 'erase', label: 'Les effacer définitivement maintenant (objectifs Hajj, purification, dons, Zakat)' },
                ]} />
            </ActionForm>
          </Card>
        </>
      )}
    </>
  );
}
