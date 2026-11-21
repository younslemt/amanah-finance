import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { getSnapshot } from '@/lib/data';
import { formatCents, formatDate } from '@/lib/format';
import { fr } from '@/messages/fr';
import { saveDeclaredCapacity, saveSavingsPlan } from '../../actions';

export const metadata: Metadata = { title: 'Plan d’épargne des projets' };

const STATUS = {
  on_track: ['positive', 'À l’heure'], late: ['warning', 'En retard'], underfunded: ['critical', 'Capacité insuffisante'], unplanned: ['neutral', 'Aucun montant prévu'],
} as const;
const SOURCE = { declared: 'déclarée par vous', estimated: 'estimée d’après vos opérations', unknown: 'inconnue' } as const;
const input = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export default async function SavingsPlanPage() {
  const s = await getSnapshot();
  const p = s.savingsPlan;
  const goalById = new Map(s.goals.map((g) => [g.goal.id, g.goal]));
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/budget" className="text-primary-800 underline-offset-4 hover:underline">← Budget</Link></p>
      <PageHeader title="Plan d’épargne des projets" subtitle="Répartir chaque mois votre capacité d’épargne entre vos projets, par priorité." />
      <Notice>Une mise de côté prévue n’est ni une dépense ni un virement : votre argent reste sur vos comptes, et un virement entre vos propres comptes n’est pas compté comme une dépense. Chaque euro de capacité n’est affecté qu’à un seul projet.</Notice>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="synthese-plan">
        <Card><Stat label="Capacité d’épargne mensuelle" value={p.capacityCents === null ? fr.common.toDetermine : formatCents(p.capacityCents)} hint={SOURCE[p.capacitySource]} /></Card>
        <Card><Stat label="Affectée aux projets" value={formatCents(p.assignedCents)} /></Card>
        <Card><Stat label="Restant libre" value={p.freeCents === null ? fr.common.toDetermine : formatCents(Math.max(0, p.freeCents))} tone={p.freeCents !== null && p.freeCents >= 0 ? 'positive' : 'default'} /></Card>
        <Card><Stat label="Dépassement" value={formatCents(p.overcommittedCents)} tone={p.overcommittedCents > 0 ? 'critical' : 'default'} hint={p.overcommittedCents > 0 ? 'Le plan dépasse votre capacité' : 'Plan équilibré'} /></Card>
      </div>
      {p.imbalance.overcommitted || p.imbalance.lateGoals > 0 ? (
        <Notice tone="warning" className="mt-3">
          {p.imbalance.overcommitted ? `Le plan prévoit ${formatCents(p.overcommittedCents)} de plus que votre capacité : les projets les moins prioritaires ne sont couverts qu’en partie. ` : ''}
          {p.imbalance.lateGoals > 0 ? `${p.imbalance.lateGoals} projet(s) n’atteindront pas leur date souhaitée avec le montant prévu.` : ''}
        </Notice>
      ) : null}

      <Card className="mt-4">
        <CardTitle>Répartition et incidence sur les dates</CardTitle>
        {p.lines.length === 0 ? <p className="text-sm text-ink-muted">Aucun projet actif. <Link href="/goals/nouveau" className="underline">Ajouter un objectif</Link></p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="lignes-plan">
              <caption className="sr-only">Répartition mensuelle de l’épargne par projet</caption>
              <thead className="text-left text-ink-muted">
                <tr><th scope="col" className="pb-2 font-normal">Projet</th><th scope="col" className="pb-2 text-right font-normal">Prévu</th><th scope="col" className="pb-2 text-right font-normal">Couvert</th><th scope="col" className="pb-2 text-right font-normal">Nécessaire</th><th scope="col" className="pb-2 font-normal">Atteinte estimée</th><th scope="col" className="pb-2 font-normal">État</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.lines.map((l) => {
                  const g = goalById.get(l.goalId)!;
                  return (
                    <tr key={l.goalId} data-testid="ligne-plan">
                      <th scope="row" className="py-2 pr-3 text-left font-medium"><Link href={`/goals/${l.goalId}`} className="text-primary-800 underline-offset-4 hover:underline">{g.name}</Link><span className="block text-xs font-normal text-ink-muted">Priorité {l.priority} · souhaitée le {formatDate(l.targetDate)}</span></th>
                      <td className="tabular py-2 text-right">{formatCents(l.plannedCents)}</td>
                      <td className="tabular py-2 text-right">{formatCents(l.fundedCents)}</td>
                      <td className="tabular py-2 text-right">{formatCents(l.requiredCents)}</td>
                      <td className="py-2">{l.fundedDate ? formatDate(l.fundedDate) : 'Non estimable'}{l.delayMonths ? <span className="block text-xs text-ink-muted">{l.delayMonths} mois de retard</span> : null}</td>
                      <td className="py-2"><Badge tone={STATUS[l.status][0]}>{STATUS[l.status][1]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {p.lines.length > 0 ? (
        <Card className="mt-4">
          <CardTitle>Modifier mes montants et mes priorités</CardTitle>
          <ActionForm action={saveSavingsPlan} submitLabel="Enregistrer le plan" testId="form-plan-epargne" className="space-y-3">
            {p.lines.map((l) => {
              const g = goalById.get(l.goalId)!;
              return (
                <fieldset key={l.goalId} className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-3">
                  <legend className="px-1 text-sm font-medium">{g.name}</legend>
                  <input type="hidden" name="goalId" value={l.goalId} />
                  <Field label={`Montant mensuel pour « ${g.name} » (€)`} name="monthly" inputMode="decimal" defaultValue={input(l.plannedCents)} required />
                  <label className="block text-sm font-medium">Priorité
                    <select name="priority" defaultValue={String(l.priority)} className="mt-1 w-full rounded-lg border border-line bg-ivory px-3 py-2.5">
                      {[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>{x === 1 ? '1 (la plus haute)' : x === 5 ? '5 (la plus basse)' : x}</option>)}
                    </select>
                  </label>
                </fieldset>
              );
            })}
          </ActionForm>
        </Card>
      ) : null}

      {(
        <Card className="mt-4">
          <CardTitle>Ma capacité d’épargne mensuelle</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">Facultatif : si vous la renseignez, elle remplace l’estimation calculée d’après vos opérations{s.analysis.capacity.estimatedCents !== null ? ` (${formatCents(s.analysis.capacity.estimatedCents)} par mois)` : ''}. Laissez vide pour utiliser l’estimation.</p>
          <ActionForm action={saveDeclaredCapacity} submitLabel="Enregistrer" testId="form-capacite" className="flex flex-wrap items-end gap-3">
            <Field label="Capacité mensuelle (€)" name="capacity" inputMode="decimal" defaultValue={p.capacitySource === 'declared' && p.capacityCents !== null ? input(p.capacityCents) : ''} />
          </ActionForm>
        </Card>
      )}
    </>
  );
}
