import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { JourneySteps, actionHref } from '@/components/finance/journey';
import { loadPlanning } from '@/lib/planning-data';
import { SuggestionCard } from '@/components/finance/suggestion-card';
import { isDemoMode } from '@/lib/env';
import { readDemoState } from '@/lib/goals/demo-repository';
import { religiousAccess } from '@/lib/supabase/session';
import { ReligiousGate } from '@/components/religious-gate';
import { formatCents, formatDate } from '@/lib/format';
import { goalJourney, isReligiousGoal, type Goal, type GoalPlan } from '@amanah/engines';
import { fr } from '@/messages/fr';
import { resetDemo } from '../actions';

export const metadata: Metadata = { title: fr.goals.title };

const goalTone = { achieved: 'positive', on_track: 'positive', behind: 'warning', overdue: 'critical', to_determine: 'neutral' } as const;
const STORAGE_NOTICE = {
  corrupted: 'Les données de démonstration enregistrées dans ce navigateur étaient illisibles : les données fictives de départ ont été rétablies.',
  outdated: 'Les données de démonstration enregistrées venaient d’une version précédente : les données fictives de départ ont été rétablies.',
} as const;

function AddGoalButton({ className, testId = 'ajouter-objectif' }: { className?: string; testId?: string }) {
  return (
    <Link href="/goals/nouveau" data-testid={testId}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-primary-800 px-5 py-3 text-base font-semibold text-ivory shadow-sm hover:bg-primary-700 ${className ?? ''}`}>
      <span aria-hidden="true" className="text-lg leading-none">＋</span> Ajouter un objectif
    </Link>
  );
}

export default async function GoalsPage() {
  const { enabled: religious } = await religiousAccess();
  const { s, data, suggestions } = await loadPlanning();
  const fresh = suggestions.filter((x) => x.status === 'new');
  const snoozed = suggestions.filter((x) => x.status === 'snoozed');
  const storage = isDemoMode ? (await readDemoState()).status : null;
  const t = fr.goals;
  const open = s.goals.filter(({ goal }) => goal.lifecycle !== 'achieved' && goal.lifecycle !== 'archived');
  const closed = s.goals.filter(({ goal }) => goal.lifecycle === 'achieved' || goal.lifecycle === 'archived');
  const activeOnes = open.filter(({ goal }) => (goal.lifecycle ?? 'active') === 'active');
  const p = s.savingsPlan;

  const card = ({ goal, plan }: { goal: Goal; plan: GoalPlan }) => {
    const journey = goalJourney(goal, plan, data.allocations);
    const lifecycle = goal.lifecycle ?? 'active';
    return (
      <Card key={goal.id} as="article">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-accent-600">{t.kind[goal.kind]}{isReligiousGoal(goal.kind) ? ' · privé' : ''}</p>
            <h2 className="break-words text-xl text-primary-900">{goal.name}</h2>
          </div>
          <Badge tone={lifecycle !== 'active' ? 'neutral' : goalTone[plan.status]}>{lifecycle !== 'active' ? t.lifecycle[lifecycle] : t.status[plan.status]}</Badge>
        </div>
        <JourneySteps journey={journey} compact />
        <div className="mt-3"><Progress permille={plan.progressPermille} label={goal.name} /></div>
        <p className="mt-1 flex justify-between text-xs text-ink-muted" data-testid="progression">
          <span>{formatCents(plan.savedCents)} sur {formatCents(goal.targetCents)}</span><span>{Math.round(plan.progressPermille / 10)} %</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Stat label="Date souhaitée" value={formatDate(goal.targetDate)} />
          <Stat label="Atteinte estimée" value={plan.projectedCompletionDate ? formatDate(plan.projectedCompletionDate) : fr.common.toDetermine}
            hint={plan.paceSource === 'none' ? 'Indiquez une mensualité' : plan.paceSource === 'declared' ? `À ${formatCents(goal.monthlyCapacityCents ?? 0)} / mois` : 'Rythme observé sur 3 mois'} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {journey.next && lifecycle === 'active' ? (
            <Link href={actionHref(goal.id, journey.next.action, journey.next.step)} data-testid="prochaine-action"
              className="rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory hover:bg-primary-700">
              {t.action[journey.next.action]}
            </Link>
          ) : null}
          <Link href={`/goals/${goal.id}`} className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary-800 hover:bg-mist" data-testid="lien-projet">
            Ouvrir le projet
          </Link>
        </div>
      </Card>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title={t.title} subtitle="Créer, planifier, simuler, suivre, réaliser : vos projets de vie pas à pas." />
        <AddGoalButton className="mb-4 sm:mb-6" />
      </div>
      {storage && storage in STORAGE_NOTICE ? <Notice tone="warning" className="mb-3">{STORAGE_NOTICE[storage as keyof typeof STORAGE_NOTICE]}</Notice> : null}
      <Notice>{t.virtualNotice} Affecter un montant à un projet n’est ni une dépense ni un virement.</Notice>

      <h2 className="mt-6 text-lg font-semibold text-primary-900">1. Mes projets en cours</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="synthese-projets">
        <Card><Stat label="Projets en cours" value={String(activeOnes.length)} hint={open.length > activeOnes.length ? `${open.length - activeOnes.length} en pause` : undefined} /></Card>
        <Card><Stat label="Épargne virtuelle affectée" value={formatCents(open.reduce((x, g) => x + g.plan.savedCents, 0))} hint="Reste sur vos comptes" /></Card>
        <Card><Stat label="Mensualités prévues" value={formatCents(p.assignedCents)} hint={p.capacityCents === null ? 'Capacité inconnue' : `Capacité : ${formatCents(p.capacityCents)}`} /></Card>
        <Card><Stat label="Capacité encore libre" value={p.freeCents === null ? fr.common.toDetermine : formatCents(Math.max(0, p.freeCents))}
          tone={p.overcommittedCents > 0 ? 'critical' : 'default'} hint={p.overcommittedCents > 0 ? `Dépassement : ${formatCents(p.overcommittedCents)}` : undefined} /></Card>
      </div>
      <p className="mt-2 text-right text-sm"><Link href="/budget/plan-epargne" className="text-primary-800 underline-offset-4 hover:underline">Répartir ma capacité entre mes projets →</Link></p>

      {open.length === 0 ? (
        <Card className="mt-4 text-center">
          <p className="mb-3 text-ink-muted">Aucun projet en cours. Hajj, études, logement, mariage, voyage… commencez par le premier.</p>
          <AddGoalButton testId="ajouter-premier-objectif" />
        </Card>
      ) : <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="liste-projets">{open.map(card)}</div>}

      {closed.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line bg-paper p-4" data-testid="projets-clos">
          <summary className="cursor-pointer font-medium">Projets réalisés et archivés ({closed.length})</summary>
          <p className="mt-1 text-sm text-ink-muted">Ils ne comptent plus dans la planification ; leur historique reste consultable.</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">{closed.map(card)}</div>
        </details>
      ) : null}

      <section className="mt-8" data-testid="projets-suggeres" aria-labelledby="titre-suggestions">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="titre-suggestions" className="text-lg font-semibold text-primary-900">2. Projets suggérés</h2>
          <p className="flex gap-4 text-sm">
            <Link href="/goals/calendrier" className="text-primary-800 underline-offset-4 hover:underline" data-testid="lien-calendrier">Calendrier familial</Link>
            <Link href="/goals/preferences" className="text-primary-800 underline-offset-4 hover:underline" data-testid="lien-preferences">Mes préférences</Link>
          </p>
        </div>
        <p className="mt-1 text-sm text-ink-muted">Des idées pour anticiper, d’après le calendrier et vos préférences déclarées. Ce ne sont ni des conseils personnalisés ni des produits financiers : rien n’est créé sans votre accord.</p>
        {fresh.length === 0 ? <p className="mt-3 text-sm text-ink-muted" data-testid="aucune-suggestion">Aucune nouvelle suggestion. Complétez vos préférences pour en recevoir de plus utiles.</p> : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{fresh.map((x) => <SuggestionCard key={x.id} s={x} />)}</div>
        )}
        {snoozed.length > 0 ? (
          <details className="mt-3 text-sm" data-testid="suggestions-reportees">
            <summary className="cursor-pointer text-ink-muted">Suggestions reportées ({snoozed.length})</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{snoozed.map((x) => <SuggestionCard key={x.id} s={x} compact />)}</div>
          </details>
        ) : null}
      </section>

      <section className="mt-8" aria-labelledby="titre-creer">
        <h2 id="titre-creer" className="text-lg font-semibold text-primary-900">3. Créer mon propre projet</h2>
        <p className="mt-1 text-sm text-ink-muted">Voyage, mariage, véhicule, création d’entreprise… ou partir d’un modèle du catalogue. Vous décidez de tout, y compris des montants.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/goals/nouveau" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary-800 hover:bg-mist" data-testid="creer-projet-libre">Créer un projet personnalisé</Link>
          <Link href="/goals/nouveau?mode=modele" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary-800 hover:bg-mist" data-testid="choisir-modele">Choisir dans le catalogue</Link>
          {religious ? <Link href="/goals/aid" className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary-800 hover:bg-mist" data-testid="lien-preparer-aid">Préparer mon Aïd</Link> : null}
        </div>
      </section>

      {!isDemoMode && !religious ? (
        <div className="mt-4" data-testid="projets-religieux-fermes">
          <ReligiousGate feature="Projets Hajj, Omra et Aïd al-Adha" next="/goals" />
        </div>
      ) : null}

      {isDemoMode ? (
        <details className="mt-6 rounded-xl border border-dashed border-line p-4 text-sm">
          <summary className="cursor-pointer font-medium">Réinitialiser la démonstration</summary>
          <p className="my-2 text-ink-muted">Vos projets fictifs sont conservés dans ce navigateur uniquement (aucune base de données). La réinitialisation rétablit les données fictives de départ sur tous les écrans.</p>
          <ActionForm action={resetDemo} submitLabel="Réinitialiser les données de démonstration" variant="quiet" testId="form-reinitialiser" />
        </details>
      ) : null}
    </>
  );
}
