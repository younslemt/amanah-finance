import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { JourneySteps, actionHref } from '@/components/finance/journey';
import { getHouseholdData, getSnapshot } from '@/lib/data';
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
  const [s, data] = await Promise.all([getSnapshot(), getHouseholdData()]);
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

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="synthese-projets">
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

      {religious ? (
        <Card className="mt-4">
          <CardTitle>Préparer mon Aïd</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">Sacrifice ou quote-part, frais, contributions familiales, date : un projet par année civile, reconductible chaque année.</p>
          <Link href="/goals/aid" className="inline-block rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-primary-800 hover:bg-mist" data-testid="lien-preparer-aid">Préparer mon Aïd</Link>
        </Card>
      ) : null}

      {closed.length > 0 ? (
        <details className="mt-4 rounded-xl border border-line bg-paper p-4" data-testid="projets-clos">
          <summary className="cursor-pointer font-medium">Projets réalisés et archivés ({closed.length})</summary>
          <p className="mt-1 text-sm text-ink-muted">Ils ne comptent plus dans la planification ; leur historique reste consultable.</p>
          <div className="mt-3 grid gap-4 md:grid-cols-2">{closed.map(card)}</div>
        </details>
      ) : null}

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
