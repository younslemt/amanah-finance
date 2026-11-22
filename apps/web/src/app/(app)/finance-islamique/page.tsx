import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Checkbox, RadioGroup } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { religiousAccess, requireOnboardedSession } from '@/lib/supabase/session';
import { loadEngagementsView } from '@/lib/engagements-data';
import { IslamicFinanceIntro } from '@/components/home/consent-gate';
import { PurificationEngagement, SolidarityEngagement, ZakatEngagement } from '@/components/engagements/engagements-blocks';
import { latestConsent, LEGAL_DRAFT_NOTICE, RELIGIOUS_DOCUMENT } from '@/lib/legal/documents';
import { formatDate } from '@/lib/format';
import { activateReligiousFeatures, saveReligiousSharing, withdrawReligiousConsent } from '../../(onboarding)/actions';

export async function generateMetadata(): Promise<Metadata> {
  const { enabled } = await religiousAccess();
  return { title: enabled ? 'Mes engagements' : 'Finance islamique' };
}

const NEXT = new Set(['/goals', '/zakat', '/zakat/al-fitr', '/purification', '/dons']);

/** Tableau de bord des engagements : Zakat, purification, solidarité (consentement en vigueur). */
function Engagements({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadEngagementsView>>> }) {
  const { view, demo, canRecord } = data;
  return (
    <>
      <PageHeader title="Mes engagements" subtitle={`Zakat, purification et solidarité${demo ? ' · données fictives' : ''}`} />
      <Notice>Les méthodologies religieuses utilisées sont provisoires : ni fatwa ni certification. Les montants sont des estimations selon vos choix ; Amanah Finance n’effectue aucun paiement.</Notice>
      <div className="mt-4 grid gap-4 lg:grid-cols-2" data-testid="mes-engagements">
        <div className="lg:col-span-2"><ZakatEngagement z={view.zakat} canRecord={canRecord} history={!demo} /></div>
        <PurificationEngagement p={view.purification} canRecord={canRecord} />
        <SolidarityEngagement s={view.solidarity} canRecord={canRecord} />
      </div>
      {demo ? (
        <p className="mt-4 text-sm text-ink-muted">En démonstration, les décisions de purification et l’enregistrement de dons ne sont pas disponibles. En mode réel, ces fonctions demandent un consentement explicite distinct (article 9 du RGPD).</p>
      ) : null}
      <nav aria-label="Autres fonctions de finance islamique" className="mt-4">
        <ul className="flex flex-wrap gap-2 text-sm">
          <li><Link href="/zakat/al-fitr" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-medium text-primary-800 hover:bg-mist">Zakat al-Fitr</Link></li>
          <li><Link href="/goals" className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-medium text-primary-800 hover:bg-mist">Projets Hajj et Omra</Link></li>
        </ul>
      </nav>
    </>
  );
}

export default async function IslamicFinancePage({ searchParams }: { searchParams: Promise<{ suite?: string; retrait?: string }> }) {
  const { suite, retrait } = await searchParams;
  if (isDemoMode) return <Engagements data={(await loadEngagementsView())!} />;
  const ctx = await requireOnboardedSession();
  const latest = latestConsent(ctx.consents, 'special_category');
  const { data: prefs } = ctx.religiousEnabled
    ? await ctx.supabase.from('religious_preferences').select('share_with_household').eq('user_id', ctx.userId).maybeSingle()
    : { data: null };
  const { count: members } = await ctx.supabase.from('household_members').select('user_id', { count: 'exact', head: true }).eq('household_id', ctx.householdId);

  const stateCard = (
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
  );

  if (!ctx.religiousEnabled) {
    // Sans consentement : contenu pédagogique et activation, AUCUNE donnée personnelle chargée
    return (
      <>
        <PageHeader title="Finance islamique" subtitle="Comprendre la Zakat, la purification et la solidarité" />
        {retrait === 'keep' ? <Notice className="mb-4">Consentement retiré. Vos données de finance islamique sont conservées mais inaccessibles jusqu’à un nouveau consentement.</Notice> : null}
        {retrait === 'erase' ? <Notice className="mb-4">Consentement retiré. Vos données de finance islamique ont été effacées.</Notice> : null}
        {stateCard}
        <section aria-labelledby="titre-comprendre" className="mt-4">
          <h2 id="titre-comprendre" className="mb-2 text-lg text-primary-900">Comprendre</h2>
          <IslamicFinanceIntro activateHref={null} />
        </section>
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
      </>
    );
  }

  const data = await loadEngagementsView();
  return (
    <>
      <Engagements data={data!} />

      <section aria-labelledby="titre-confidentialite" className="mt-8 border-t border-line pt-6" id="confidentialite">
        <h2 id="titre-confidentialite" className="mb-3 text-lg text-primary-900">Confidentialité et consentement</h2>
        {stateCard}
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
      </section>
    </>
  );
}
