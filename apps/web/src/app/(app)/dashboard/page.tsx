import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Notice } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { IncomeExpenseChart } from '@/components/finance/charts';
import { RECOMMENDATION_NOTICE } from '@/lib/recommendation-text';
import { categoryLabel } from '@/lib/labels';
import { fr } from '@/messages/fr';
import { loadHomeView } from '@/lib/home-data';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import type { HomeBlockId } from '@/lib/presentation';
import {
  AmanahHero, CalendarBlock, CommitmentsBlock, HomeSection, NextActionsBlock, ProjectsBlock, WealthBlock, WelcomeHome,
} from '@/components/home/home-blocks';
import { setHomeLayout } from '../actions';

export const metadata: Metadata = { title: fr.nav.dashboard };

/**
 * Accueil Islamic-first (lot 2) : six blocs dans l'ordre de la présentation choisie.
 * Toutes les données viennent du modèle de vue serveur (`buildHomeView`) ; sans consentement
 * religieux, il ne contient aucune donnée religieuse personnalisée.
 */
export default async function DashboardPage() {
  const [{ view: v, displayName }, s, data] = await Promise.all([loadHomeView(), getSnapshot(), getHouseholdData()]);
  const t = fr.dashboard;
  const greeting = displayName ? `${t.greeting}, ${displayName}` : t.greeting;
  // Enregistrer un don : mode réel avec droit d'écriture seulement (sinon : consulter)
  const canRecord = !isDemoMode && (await requireOnboardedSession()).canWrite;

  // Préférence d'affichage (privée) : accessible aussi depuis le menu profil, même sans données
  const analytic = v.presentation.layout === 'classic';
  const displaySection = (
    <section id="affichage" aria-label="Affichage de l’accueil" className="scroll-mt-6 mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
      <span className="text-ink-muted">Affichage : {analytic ? 'analytique (indicateurs financiers d’abord)' : 'Islamic-first'}</span>
      <ActionForm action={setHomeLayout} submitLabel={analytic ? 'Revenir à l’affichage Islamic-first' : 'Passer à l’affichage analytique'} variant="quiet" testId="form-affichage">
        <input type="hidden" name="layout" value={analytic ? 'islamic_first' : 'classic'} />
      </ActionForm>
    </section>
  );

  // Premier accueil : identité Amanah, possibilités et premières démarches, sans aucun chiffre
  if (v.isEmpty) {
    return (
      <>
        <h1 className="sr-only">{greeting}</h1>
        <WelcomeHome religious={v.presentation.showReligiousData} greeting={greeting} />
        {displaySection}
      </>
    );
  }

  const a = s.analysis;
  const categoryName = (slug: string) => categoryLabel(slug, data.categories);

  const blocks: Record<HomeBlockId, () => ReactNode> = {
    situation: () => (
      <AmanahHero key="situation" v={v} analytic={analytic} categoryName={categoryName}
        chart={analytic && a.months.length ? <IncomeExpenseChart months={a.months} /> : undefined} />
    ),
    commitments: () => {
      const b = v.presentation.blocks.find((x) => x.id === 'commitments')!;
      return (
        <HomeSection key="commitments" id="engagements" title={b.title} href="/finance-islamique" linkLabel={b.variant === 'pedagogic' ? 'Découvrir' : 'Tout voir'} wide>
          <CommitmentsBlock v={v} variant={b.variant} canRecord={canRecord} />
        </HomeSection>
      );
    },
    projects: () => <HomeSection key="projects" id="projets" title="Mes projets de vie" href="/goals" linkLabel="Tous les projets"><ProjectsBlock v={v} /></HomeSection>,
    calendar: () => <HomeSection key="calendar" id="calendrier" title="Mon calendrier Amanah" href="/goals/calendrier" linkLabel="Calendrier"><CalendarBlock events={v.calendar} /></HomeSection>,
    wealth: () => <HomeSection key="wealth" id="patrimoine" title="Mon patrimoine et mes valeurs"><WealthBlock v={v} /></HomeSection>,
    next_actions: () => <HomeSection key="next_actions" id="actions" title="Mes prochaines actions" href="/recommandations" linkLabel="Tout voir"><NextActionsBlock v={v} /></HomeSection>,
  };

  return (
    <>
      <h1 className="sr-only">{greeting}</h1>
      <div className="grid gap-y-7 lg:grid-cols-2 lg:gap-x-6" data-testid="accueil" data-layout={v.presentation.layout} data-religious={v.presentation.showReligiousData ? 'yes' : 'no'}>
        {v.presentation.blocks.map((b) => blocks[b.id]())}
      </div>

      {displaySection}

      {v.commitments ? <div className="mt-6"><Notice>{fr.zakat.disclaimer}</Notice></div> : null}
      <p className="mt-4 text-xs text-ink-muted">{RECOMMENDATION_NOTICE}</p>
    </>
  );
}
