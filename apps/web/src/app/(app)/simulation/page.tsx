import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEMO_AS_OF } from '@amanah/banking';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { isDemoMode } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { readDemoState } from '@/lib/goals/demo-repository';
import { demoAsOf, SIMULATION_MAX } from '@/lib/goals/demo-state';
import { loadPlanning } from '@/lib/planning-data';
import { setSimulationDate } from '../actions';

export const metadata: Metadata = { title: 'Simuler une date (démonstration)' };

/** Moments clés de l'année pour présenter l'application (dates fictives de démonstration). */
const PRESETS = [
  { date: '2027-01-15', label: 'Janvier 2027', hint: 'Préparer le Ramadan et l’Aïd al-Fitr' },
  { date: '2027-04-15', label: 'Avril 2027', hint: 'Vacances de printemps et Aïd al-Adha' },
  { date: '2027-07-15', label: 'Juillet 2027', hint: 'Vacances d’été et rentrée scolaire' },
  { date: '2027-10-15', label: 'Octobre 2027', hint: 'Révision du budget et projets de l’année suivante' },
] as const;

/**
 * Démonstration uniquement : choisir la date du jour simulée. Échéances, suggestions,
 * calendrier, budget et Zakat sont recalculés à partir de cette date ; les données restent
 * fictives (aucune donnée bancaire réelle). Absent en mode réel.
 */
export default async function SimulationPage() {
  if (!isDemoMode) notFound();
  const current = demoAsOf((await readDemoState()).state);
  const { calendar, suggestions } = await loadPlanning();
  const next = calendar.slice(0, 4);
  const fresh = suggestions.filter((s) => s.status === 'new').slice(0, 3);
  return (
    <>
      <PageHeader title="Simuler une date" subtitle="Voyez comment l’application accompagne le foyer fictif à différents moments de l’année." />
      <Notice className="mb-4">
        Démonstration : seules des données fictives sont utilisées. Les opérations fictives sont décalées pour rester récentes ; vos projets de démonstration ne sont pas modifiés.
      </Notice>
      <p className="mb-4 text-sm" data-testid="date-simulee" data-date={current}>
        Date de référence actuelle : <strong>{formatDate(current)}</strong>{current === DEMO_AS_OF ? ' (date de départ)' : ''}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {PRESETS.map((p) => (
          <Card key={p.date}>
            <CardTitle>{p.label}</CardTitle>
            <p className="-mt-1 mb-3 text-sm text-ink-muted">{p.hint}</p>
            <ActionForm action={setSimulationDate} submitLabel={`Se placer au ${formatDate(p.date)}`} variant="quiet" testId={`simulation-${p.date}`}>
              <input type="hidden" name="date" value={p.date} />
            </ActionForm>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardTitle>Autre date</CardTitle>
        <ActionForm action={setSimulationDate} submitLabel="Simuler cette date" testId="simulation-date-libre" className="grid gap-3 sm:grid-cols-2">
          <Field label="Date du jour simulée" name="date" type="date" min={DEMO_AS_OF} max={SIMULATION_MAX} defaultValue={current} required />
        </ActionForm>
        {current !== DEMO_AS_OF ? (
          <ActionForm action={setSimulationDate} submitLabel="Revenir à la date de départ" variant="quiet" testId="simulation-reinitialiser" className="mt-3">
            <input type="hidden" name="date" value="" />
          </ActionForm>
        ) : null}
      </Card>

      <Card className="mt-4">
        <CardTitle>À cette date</CardTitle>
        <ul className="space-y-1 text-sm" data-testid="apercu-simulation">
          {next.map((e) => <li key={e.id}>{formatDate(e.date)} — {e.label}{e.indicative ? ' (indicative)' : ''}</li>)}
        </ul>
        {fresh.length > 0 ? (
          <p className="mt-3 text-sm">Suggestions : {fresh.map((s) => s.title).join(', ')}.</p>
        ) : null}
        <p className="mt-3 text-sm"><Link href="/dashboard" className="text-primary-800 underline">Voir le tableau de bord</Link> · <Link href="/goals/calendrier" className="text-primary-800 underline">Voir le calendrier</Link></p>
      </Card>
    </>
  );
}
