import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Card, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { formatCents } from '@/lib/format';
import { IncomeExpenseChart } from '@/components/finance/charts';
import { RECOMMENDATION_NOTICE } from '@/lib/recommendation-text';
import { categoryLabel } from '@/lib/labels';
import { fr } from '@/messages/fr';
import { loadHomeView } from '@/lib/home-data';
import type { HomeBlockId } from '@/lib/presentation';
import {
  AmanahHero, CalendarBlock, CommitmentsBlock, HomeSection, NextActionsBlock, ProjectsBlock, WealthBlock,
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

  if (v.isEmpty) {
    return (
      <>
        <PageHeader title={greeting} subtitle={fr.app.tagline} />
        <Card>
          <h2 className="text-xl text-primary-900">{t.emptyTitle}</h2>
          <p className="mt-2 text-ink-muted">{t.emptyBody}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            <li><Link href="/comptes" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">1. Ajouter un compte</Link></li>
            <li><Link href="/budget" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">2. Saisir revenus et dépenses</Link></li>
            <li><Link href="/import" className="block rounded-lg border border-line p-3 text-sm font-medium text-primary-800 hover:bg-mist">3. Importer un relevé CSV</Link></li>
          </ul>
        </Card>
      </>
    );
  }

  // Synthèse de l'analyse des mois complets (moteur d'analyse existant)
  const a = s.analysis;
  const cap = a.capacity;
  const synthesis = a.reliability === 'insufficient'
    ? `Nous disposons de ${a.monthsWithData} mois complet(s) d’opérations : importez au moins 3 mois pour obtenir une analyse chiffrée.`
    : cap.observedCents! >= 0
      ? `Sur vos ${a.monthsWithData} derniers mois complets, il vous reste en général ${formatCents(cap.observedCents!, { round: true })} par mois après vos dépenses.`
      : `Sur vos ${a.monthsWithData} derniers mois complets, vos dépenses dépassent vos revenus d’environ ${formatCents(-cap.observedCents!, { round: true })} par mois.`;
  const categoryName = (slug: string) => categoryLabel(slug, data.categories);
  const analytic = v.presentation.layout === 'classic';

  const blocks: Record<HomeBlockId, () => ReactNode> = {
    situation: () => (
      <AmanahHero key="situation" v={v} synthesis={synthesis} analytic={analytic} categoryName={categoryName}
        chart={analytic && a.months.length ? <IncomeExpenseChart months={a.months} /> : undefined} />
    ),
    commitments: () => {
      const b = v.presentation.blocks.find((x) => x.id === 'commitments')!;
      return (
        <HomeSection key="commitments" id="engagements" title={b.title} href="/finance-islamique" linkLabel={b.variant === 'pedagogic' ? 'Découvrir' : 'Tout voir'}>
          <CommitmentsBlock v={v} variant={b.variant} />
        </HomeSection>
      );
    },
    projects: () => <HomeSection key="projects" id="projets" title="Mes projets de vie" href="/goals" linkLabel="Tous les projets"><ProjectsBlock v={v} /></HomeSection>,
    calendar: () => <HomeSection key="calendar" id="calendrier" title="Mon calendrier Amanah" href="/goals/calendrier" linkLabel="Calendrier"><CalendarBlock events={v.calendar} /></HomeSection>,
    wealth: () => <HomeSection key="wealth" id="patrimoine" title="Mon patrimoine et mes valeurs"><WealthBlock v={v} /></HomeSection>,
    next_actions: () => <HomeSection key="next_actions" id="actions" title="Mes prochaines actions" href="/recommandations" linkLabel="Recommandations"><NextActionsBlock v={v} /></HomeSection>,
  };

  return (
    <>
      <h1 className="sr-only">{greeting}</h1>
      <div data-testid="accueil" data-layout={v.presentation.layout} data-religious={v.presentation.showReligiousData ? 'yes' : 'no'}>
        {v.presentation.blocks.map((b) => blocks[b.id]())}
      </div>

      <section aria-label="Affichage de l’accueil" className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="text-ink-muted">Affichage : {analytic ? 'analytique (indicateurs financiers d’abord)' : 'Islamic-first'}</span>
        <ActionForm action={setHomeLayout} submitLabel={analytic ? 'Revenir à l’affichage Islamic-first' : 'Passer à l’affichage analytique'} variant="quiet" testId="form-affichage">
          <input type="hidden" name="layout" value={analytic ? 'islamic_first' : 'classic'} />
        </ActionForm>
      </section>

      {v.commitments ? <div className="mt-6"><Notice>{fr.zakat.disclaimer}</Notice></div> : null}
      <p className="mt-4 text-xs text-ink-muted">{RECOMMENDATION_NOTICE}</p>
    </>
  );
}
