'use client';
import { useMemo, useState } from 'react';
import {
  parseAmountToCents, simulateScenario,
  type Adjustment, type FinancialAnalysis, type Goal, type GoalAllocation, type RecurringSeries,
} from '@amanah/engines';
import { ActionForm } from '@/components/forms/action-form';
import { Badge } from '@/components/ui';
import { formatCents, formatDate } from '@/lib/format';
import { saveScenario } from '@/app/(app)/budget/optimiser/actions';

export type ClientAnalysis = Omit<FinancialAnalysis, 'buckets'>;

interface Candidate { slug: string; label: string; medianCents: number; nature: 'fixed' | 'variable' }

const toCents = (v: string): number | null => {
  try { const c = parseAmountToCents(v.trim()); return c > 0 ? c : null; } catch { return null; }
};

/**
 * Identifier → Simuler → Décider. Tout le calcul se fait dans le navigateur avec le
 * moteur partagé : aucune donnée n'est écrite tant que l'utilisateur ne décide pas.
 */
export function ScenarioBuilder({ analysis, goals, candidates, initialCategory, demo }: {
  analysis: ClientAnalysis;
  goals: Array<{ goal: Goal; allocations: GoalAllocation[]; observedPaceCents?: number }>;
  candidates: Candidate[];
  initialCategory?: string;
  demo: boolean;
}) {
  const initial = candidates.find((c) => c.slug === initialCategory);
  const [adjustments, setAdjustments] = useState<Adjustment[]>(
    initial ? [{ type: 'category', categorySlug: initial.slug, monthlyCents: Math.max(100, Math.round(initial.medianCents / 1000) * 100) }] : [],
  );
  const [total, setTotal] = useState('');
  const [catSlug, setCatSlug] = useState(candidates[0]?.slug ?? '');
  const [catAmount, setCatAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const subs: RecurringSeries[] = analysis.recurring.filter((s) => s.direction === 'debit' && s.active && (s.kind === 'subscription' || s.kind === 'recurring_expense'));
  const all = useMemo(() => {
    const t = toCents(total);
    return t ? [...adjustments, { type: 'total', monthlyCents: t } as Adjustment] : adjustments;
  }, [adjustments, total]);
  const sim = useMemo(() => simulateScenario(analysis as FinancialAnalysis, all, goals), [analysis, all, goals]);
  const labelOf = (slug: string | null) => candidates.find((c) => c.slug === slug)?.label ?? slug ?? 'Toutes dépenses variables';

  const addCategory = (slug: string, cents: number | null) => {
    if (!slug || !cents) { setError('Indiquez un montant mensuel valide (exemple : 50 ou 12,50).'); return; }
    setError(null);
    setAdjustments((a) => [...a.filter((x) => !(x.type === 'category' && x.categorySlug === slug)), { type: 'category', categorySlug: slug, monthlyCents: cents }]);
    setCatAmount('');
  };
  const toggleCancel = (key: string) => setAdjustments((a) => (a.some((x) => x.type === 'cancel_recurring' && x.seriesKey === key)
    ? a.filter((x) => !(x.type === 'cancel_recurring' && x.seriesKey === key))
    : [...a, { type: 'cancel_recurring', seriesKey: key }]));

  return (
    <div className="space-y-4">
      <section aria-labelledby="etape-identifier" className="rounded-xl border border-line bg-paper p-4">
        <h2 id="etape-identifier" className="text-lg text-primary-900">2. Identifier</h2>
        <p className="mt-1 text-sm text-ink-muted">Vos principaux postes de dépense (médiane mensuelle) et vos dépenses récurrentes.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="postes-candidats">
          {candidates.slice(0, 6).map((c) => (
            <li key={c.slug} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
              <span><span className="font-medium">{c.label}</span> <span className="text-ink-muted">· {c.nature === 'fixed' ? 'fixe' : 'variable'}</span><br />
                <span className="tabular">{formatCents(c.medianCents, { round: true })} / mois</span></span>
              <button type="button" className="rounded-lg border border-primary-700 px-3 py-1.5 text-primary-800 hover:bg-primary-50"
                onClick={() => addCategory(c.slug, Math.max(100, Math.round(c.medianCents / 1000) * 100))}>Simuler −10 %</button>
            </li>
          ))}
        </ul>
        {subs.length ? (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium">Dépenses récurrentes détectées</legend>
            <ul className="mt-2 space-y-2" data-testid="recurrentes-candidates">
              {subs.map((s) => (
                <li key={s.key}>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[var(--color-primary-700)]"
                      checked={adjustments.some((x) => x.type === 'cancel_recurring' && x.seriesKey === s.key)} onChange={() => toggleCancel(s.key)} />
                    <span>Simuler l’arrêt de <span className="font-medium">{s.label}</span> · <span className="tabular">{formatCents(s.monthlyEquivalentCents)} / mois</span>
                      {s.kind === 'subscription' ? <> <Badge>Abonnement</Badge></> : null}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : null}
      </section>

      <section aria-labelledby="etape-simuler" className="rounded-xl border border-line bg-paper p-4">
        <h2 id="etape-simuler" className="text-lg text-primary-900">3. Simuler</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">Réduire mes dépenses variables de (€ par mois)
            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Exemple : 50"
              className="mt-1 block w-full rounded-lg border border-line bg-ivory px-3 py-2" data-testid="reduction-globale" />
          </label>
          <div className="text-sm">
            <span className="font-medium">Réduire une catégorie</span>
            <div className="mt-1 flex gap-2">
              <select aria-label="Catégorie" value={catSlug} onChange={(e) => setCatSlug(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-line bg-ivory px-2 py-2">
                {candidates.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </select>
              <input aria-label="Montant mensuel (€)" inputMode="decimal" value={catAmount} onChange={(e) => setCatAmount(e.target.value)} placeholder="€ / mois"
                className="w-24 rounded-lg border border-line bg-ivory px-2 py-2" />
              <button type="button" onClick={() => addCategory(catSlug, toCents(catAmount))} className="rounded-lg border border-primary-700 px-3 text-primary-800 hover:bg-primary-50">Ajouter</button>
            </div>
          </div>
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-critical">{error}</p> : null}

        {sim.applied.length ? (
          <ul className="mt-3 space-y-1 text-sm" data-testid="ajustements">
            {sim.applied.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-1">
                <span>{a.adjustment.type === 'cancel_recurring' ? `Arrêt : ${subs.find((s) => s.key === (a.adjustment as { seriesKey: string }).seriesKey)?.label ?? 'dépense récurrente'}` : `Réduction : ${labelOf(a.categorySlug)}`}
                  {a.capped ? <span className="text-ink-muted"> (limité à la dépense habituelle)</span> : null}</span>
                <span className="flex items-center gap-3"><span className="tabular font-medium">−{formatCents(a.monthlyCents)}</span>
                  {a.adjustment.type !== 'total' ? (
                    <button type="button" className="text-primary-700 underline-offset-4 hover:underline" onClick={() => setAdjustments((x) => x.filter((y) => y !== a.adjustment))}>Retirer</button>
                  ) : null}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-4 rounded-lg bg-mist p-4" data-testid="resultat-simulation" aria-live="polite">
          {!sim.available ? (
            <p className="text-sm">Données insuffisantes : la simulation demande au moins 3 mois complets d’opérations.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-ink-muted">Situation actuelle</dt><dd className="tabular text-lg font-semibold" data-testid="sim-actuelle">{sim.current.capacityCents === null ? '—' : formatCents(sim.current.capacityCents, { round: true })}</dd><dd className="text-xs text-ink-muted">capacité estimée / mois</dd></div>
                <div><dt className="text-ink-muted">Amélioration potentielle</dt><dd className="tabular text-lg font-semibold" data-testid="sim-apres">{sim.after.capacityCents === null ? '—' : formatCents(sim.after.capacityCents, { round: true })}</dd><dd className="text-xs text-ink-muted">capacité après scénario</dd></div>
                <div><dt className="text-ink-muted">Impact mensuel</dt><dd className="tabular text-lg font-semibold text-positive" data-testid="sim-mensuel">+{formatCents(sim.potentialMonthlyCents)}</dd></div>
                <div><dt className="text-ink-muted">Impact annuel</dt><dd className="tabular text-lg font-semibold text-positive" data-testid="sim-annuel">+{formatCents(sim.potentialAnnualCents, { round: true })}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-ink-muted">Économie simulée : elle ne sera réelle que si vos dépenses baissent effectivement. Vos opérations et votre budget ne sont pas modifiés.</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm sm:grid-cols-4" data-testid="repartition-capacite">
                <div><dt className="text-ink-muted">Capacité estimée</dt><dd className="tabular font-medium">{formatCents(sim.capacity.estimatedCents ?? 0, { round: true })}</dd></div>
                <div><dt className="text-ink-muted">Déjà engagée sur vos projets</dt><dd className="tabular font-medium">{formatCents(sim.capacity.committedCents, { round: true })}</dd></div>
                <div><dt className="text-ink-muted">Réellement disponible</dt><dd className={`tabular font-medium ${(sim.capacity.availableCents ?? 0) < 0 ? 'text-critical' : ''}`} data-testid="dispo-avant">{formatCents(sim.capacity.availableCents ?? 0, { round: true })}</dd></div>
                <div><dt className="text-ink-muted">Disponible après scénario</dt><dd className="tabular font-medium" data-testid="dispo-apres">{formatCents(sim.capacity.availableAfterCents ?? 0, { round: true })}</dd></div>
              </dl>
              {sim.reserve && sim.reserve.gapCents > 0 ? (
                <p className="mt-2 text-sm">Réserve de précaution : objectif atteint en {sim.reserve.monthsToTargetBefore ?? '—'} mois aujourd’hui, {sim.reserve.monthsToTargetAfter ?? '—'} mois avec ce scénario (si la capacité disponible y était entièrement consacrée).</p>
              ) : null}
              {sim.allocation.lines.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm" data-testid="incidence-objectifs">
                    <caption className="mb-1 text-left font-medium">Répartition globale de la capacité disponible entre vos projets</caption>
                    <thead><tr className="border-b border-line text-left text-ink-muted">
                      <th scope="col" className="py-1.5 pr-3 font-medium">Projet</th>
                      <th scope="col" className="py-1.5 pr-3 text-right font-medium">Complément / mois</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Date projetée sans scénario</th>
                      <th scope="col" className="py-1.5 pr-3 font-medium">Avec le scénario</th>
                      <th scope="col" className="py-1.5 font-medium">Gain</th>
                    </tr></thead>
                    <tbody>
                      {sim.allocation.lines.map((g) => (
                        <tr key={g.goalId} className="border-b border-line/60">
                          <th scope="row" className="py-1.5 pr-3 text-left font-normal">{g.name}</th>
                          <td className="tabular py-1.5 pr-3 text-right">{formatCents(g.extraBeforeCents, { round: true })} → {formatCents(g.extraAfterCents, { round: true })}</td>
                          <td className="py-1.5 pr-3">{g.before.projectedCompletionDate ? formatDate(g.before.projectedCompletionDate) : 'Rythme à déterminer'}</td>
                          <td className="py-1.5 pr-3">{g.after.projectedCompletionDate ? formatDate(g.after.projectedCompletionDate) : '—'}</td>
                          <td className="py-1.5">{g.monthsGained === null ? '—' : `${g.monthsGained} mois`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-1 text-xs text-ink-muted">Chaque euro n’est affecté qu’une fois : projets en retard d’abord, puis par échéance, jusqu’à ce qu’il leur manque. Non affecté après scénario : {formatCents(sim.allocation.unallocatedAfterCents, { round: true })} / mois.</p>
                </div>
              ) : null}
              {sim.individual.length && sim.potentialMonthlyCents > 0 ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-primary-700">Simulations individuelles (alternatives, non cumulables)</summary>
                  <ul className="mt-2 space-y-1" data-testid="simulations-individuelles">
                    {sim.individual.map((g) => (
                      <li key={g.goalId}>Si toute l’économie allait à « {g.name} » : {g.after.projectedCompletionDate ? formatDate(g.after.projectedCompletionDate) : '—'}{g.monthsGained !== null ? ` (${g.monthsGained} mois gagnés)` : ''}</li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-ink-muted">Chaque ligne suppose que la totalité de l’économie va à ce seul projet : ces gains ne s’additionnent pas.</p>
                </details>
              ) : null}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="etape-decider" className="rounded-xl border border-line bg-paper p-4">
        <h2 id="etape-decider" className="text-lg text-primary-900">4. Décider</h2>
        <p className="mt-1 text-sm text-ink-muted">Vous gardez la main : enregistrez le scénario pour le suivre, et appliquez-le à vos plafonds du mois seulement si vous le souhaitez.</p>
        {demo ? <p className="mt-2 text-sm">En démonstration, la simulation fonctionne mais rien n’est enregistré.</p> : null}
        <ActionForm action={saveScenario} submitLabel="Enregistrer le scénario" className="mt-3" testId="form-scenario">
          <input type="hidden" name="adjustments" value={JSON.stringify(all)} />
          <label className="block text-sm font-medium">Nom du scénario
            <input name="name" required maxLength={80} defaultValue="Mon scénario" className="mt-1 block w-full rounded-lg border border-line bg-ivory px-3 py-2" />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="apply" value="yes" className="mt-0.5 h-5 w-5 accent-[var(--color-primary-700)]" />
            <span>Appliquer aussi aux plafonds de ce mois les catégories visées (dépense habituelle − économie simulée)</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" value="yes" className="mt-0.5 h-5 w-5 accent-[var(--color-primary-700)]" />
            <span>Je confirme : mes plafonds de budget seront modifiés ; mes opérations ne le seront jamais.</span>
          </label>
        </ActionForm>
      </section>
    </div>
  );
}
