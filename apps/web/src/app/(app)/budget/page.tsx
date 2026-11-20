import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Progress, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate, formatMonth } from '@/lib/format';
import { categoryLabel, selectableCategories } from '@/lib/labels';
import { fr } from '@/messages/fr';
import { createCategory, createTransaction, decideTransfer, deleteTransaction, markNotRecurring, saveBudget, saveCategoryNature } from '../actions';
import { CoverageNotice } from '@/components/finance/coverage-notice';
import { TRANSFER_REASON } from '@/lib/coverage-text';
import { IncomeExpenseChart } from '@/components/finance/charts';

export const metadata: Metadata = { title: fr.budget.title };

const tone = { no_budget: 'neutral', ok: 'positive', warning: 'warning', over: 'critical' } as const;
const bar = { no_budget: 'primary', ok: 'primary', warning: 'warning', over: 'critical' } as const;

export default async function BudgetPage() {
  const [data, s] = await Promise.all([getHouseholdData(), getSnapshot()]);
  const month = s.month; // mois en cours
  const accountName = new Map(data.accounts.map((a) => [a.id, a.name]));
  const monthTx = data.transactions.filter((t) => t.bookedOn.startsWith(month.month)).sort((a, b) => (a.bookedOn < b.bookedOn ? 1 : -1));
  const expenseCats = selectableCategories(data.categories, 'expense');
  const incomeCats = selectableCategories(data.categories, 'income');

  return (
    <>
      <PageHeader title={fr.budget.title} subtitle={formatMonth(month.month)} />
      <nav aria-label="Sections du budget" className="-mt-3 mb-4 flex flex-wrap items-center gap-2 text-sm">
        <a href="#ce-mois" className="rounded-full border border-line bg-paper px-3 py-1.5 hover:bg-mist">Ce mois</a>
        <a href="#evolution" className="rounded-full border border-line bg-paper px-3 py-1.5 hover:bg-mist">Évolution</a>
        <a href="#recurrentes" className="rounded-full border border-line bg-paper px-3 py-1.5 hover:bg-mist">Charges récurrentes</a>
        <a href="#mes-donnees" className="rounded-full border border-line bg-paper px-3 py-1.5 hover:bg-mist">Mes données</a>
        <Link href="/budget/plan-epargne" data-testid="lien-plan-epargne" className="ml-auto rounded-lg border border-line bg-paper px-4 py-2 font-medium text-primary-800 hover:bg-mist">Épargne des projets</Link>
        <Link href="/budget/optimiser" data-testid="lien-optimiser" className="rounded-lg bg-primary-800 px-4 py-2 font-medium text-ivory hover:bg-primary-700">Optimiser mon budget</Link>
      </nav>
      {s.savingsPlan.lines.length > 0 ? (
        <p className="mb-3 text-sm text-ink-muted" data-testid="resume-plan">
          Épargne prévue pour vos projets : {formatCents(s.savingsPlan.assignedCents)} par mois
          {s.savingsPlan.capacityCents !== null ? ` sur une capacité de ${formatCents(s.savingsPlan.capacityCents)}` : ''}
          {s.savingsPlan.overcommittedCents > 0 ? ` — dépassement de ${formatCents(s.savingsPlan.overcommittedCents)}` : ''}. Ces mises de côté ne sont pas des dépenses.
        </p>
      ) : null}
      <div id="ce-mois" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><Stat label="Revenus du mois" value={formatCents(month.incomeCents)} tone="positive" /></Card>
        <Card><Stat label="Dépenses du mois" value={formatCents(month.expenseCents)} /></Card>
        <Card><Stat label="Solde du mois" value={formatCents(month.netCents)} tone={month.netCents < 0 ? 'critical' : 'default'} /></Card>
      </div>

      {!isDemoMode ? (
        <Card className="mt-4">
          <CardTitle>Ajouter un revenu ou une dépense</CardTitle>
          {data.accounts.length === 0 ? (
            <Notice>Ajoutez d’abord un compte dans <Link href="/comptes" className="underline">Mes comptes</Link>.</Notice>
          ) : (
            <ActionForm action={createTransaction} submitLabel="Enregistrer" testId="form-operation" className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Type" name="direction" defaultValue="expense">
                <option value="expense">Dépense</option>
                <option value="income">Revenu</option>
              </SelectField>
              <Field label="Montant (€)" name="amount" inputMode="decimal" required placeholder="42,50" />
              <Field label="Date" name="bookedOn" type="date" required defaultValue={data.asOf} />
              <SelectField label="Compte" name="accountId">
                {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </SelectField>
              <SelectField label="Catégorie" name="categorySlug" defaultValue="alimentation">
                <optgroup label="Dépenses">{expenseCats.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</optgroup>
                <optgroup label="Revenus">{incomeCats.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}</optgroup>
              </SelectField>
              <Field label="Description (facultatif)" name="description" maxLength={140} />
            </ActionForm>
          )}
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardTitle>Par catégorie</CardTitle>
        {month.categories.length === 0 ? <p className="text-ink-muted">Aucune dépense ce mois-ci.</p> : (
          <ul className="divide-y divide-line">
            {month.categories.map((c) => (
              <li key={c.categorySlug} className="py-4 first:pt-0 last:pb-0">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-medium">{categoryLabel(c.categorySlug, data.categories)}</span>
                  <Badge tone={tone[c.status]}>{fr.budget.status[c.status]}</Badge>
                </div>
                {c.limitCents !== null ? (
                  <Progress permille={c.limitCents > 0 ? Math.round((c.spentCents * 1000) / c.limitCents) : 1000} label={categoryLabel(c.categorySlug, data.categories)} tone={bar[c.status]} />
                ) : null}
                <p className="tabular mt-2 text-sm text-ink-muted">
                  {fr.budget.spent} {formatCents(c.spentCents)}{c.limitCents !== null ? ` · ${fr.budget.limit} ${formatCents(c.limitCents)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>Opérations du mois</CardTitle>
        {monthTx.length === 0 ? <p className="text-ink-muted">Aucune opération ce mois-ci.</p> : (
          <ul className="divide-y divide-line" data-testid="liste-operations">
            {monthTx.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{t.description || categoryLabel(t.categorySlug ?? 'divers', data.categories)}</p>
                  <p className="text-xs text-ink-muted">{formatDate(t.bookedOn)} · {categoryLabel(t.categorySlug ?? 'divers', data.categories)} · {accountName.get(t.accountId) ?? ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`tabular font-semibold ${t.amountCents > 0 ? 'text-positive' : ''}`}>{formatCents(t.amountCents)}</span>
                  {!isDemoMode ? (
                    <ActionForm action={deleteTransaction} submitLabel="Supprimer" variant="quiet">
                      <input type="hidden" name="id" value={t.id} />
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!isDemoMode ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>Budget mensuel</CardTitle>
            <ActionForm action={saveBudget} submitLabel="Enregistrer le budget" testId="form-budget">
              <input type="hidden" name="month" value={month.month} />
              <SelectField label="Catégorie" name="categorySlug" defaultValue="alimentation">
                {expenseCats.map((c) => <option key={c.slug} value={c.slug}>{c.label}</option>)}
              </SelectField>
              <Field label={`Plafond pour ${formatMonth(month.month)} (€)`} name="limit" inputMode="decimal" required />
            </ActionForm>
          </Card>
          <Card>
            <CardTitle>Nouvelle catégorie</CardTitle>
            <ActionForm action={createCategory} submitLabel="Ajouter la catégorie" testId="form-categorie">
              <Field label="Nom" name="label" required maxLength={60} />
              <SelectField label="Type" name="kind" defaultValue="expense">
                <option value="expense">Dépense</option>
                <option value="income">Revenu</option>
              </SelectField>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    
      <Card className="mt-4">
        <h2 id="evolution" className="mb-3 text-lg text-primary-900">Évolution sur {s.analysis.months.length} mois</h2>
        <div className="mb-3"><CoverageNotice coverage={s.analysis.coverage} accountName={(id) => accountName.get(id) ?? 'Compte'} /></div>
        {s.analysis.months.length === 0 ? <p className="text-ink-muted">Pas encore de mois complet à comparer.</p> : (
          <>
            <IncomeExpenseChart months={s.analysis.months} />
            {s.analysis.variance.filter((v) => v.overMonths > 0).length ? (
              <ul className="mt-3 space-y-1 text-sm" data-testid="depassements">
                {s.analysis.variance.filter((v) => v.overMonths > 0).map((v) => (
                  <li key={v.categorySlug}><span className="font-medium">{categoryLabel(v.categorySlug, data.categories)}</span> : budget dépassé {v.overMonths} mois sur {v.months.length} (dépassement moyen {formatCents(v.averageOverrunCents)})</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </Card>

      {s.analysis.transfers.some((m) => m.status === 'uncertain') ? (
        <Card className="mt-4">
          <h2 className="mb-1 text-lg text-primary-900">Virements à confirmer</h2>
          <p className="mb-3 text-sm text-ink-muted">Même montant, sens opposés, deux de vos comptes, à quelques jours d’intervalle, mais sans preuve suffisante. Tant que vous ne confirmez pas, les deux opérations restent comptées normalement.</p>
          <ul className="divide-y divide-line" data-testid="virements-a-confirmer">
            {s.analysis.transfers.filter((m) => m.status === 'uncertain').map((m) => {
              const d = data.transactions.find((x) => x.id === m.debitId);
              const c = data.transactions.find((x) => x.id === m.creditId);
              return (
                <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium tabular">{formatCents(m.amountCents)}</p>
                    <p className="text-ink-muted">{formatDate(m.debitDate)} : {d?.description ?? 'débit'} ({accountName.get(m.debitAccountId) ?? 'compte'}) → {formatDate(m.creditDate)} : {c?.description ?? 'crédit'} ({accountName.get(m.creditAccountId) ?? 'compte'})</p>
                    {m.reasons.length ? <p className="text-xs text-ink-muted">Indices : {m.reasons.map((r) => TRANSFER_REASON[r]).join(', ')}</p> : null}
                  </div>
                  {!isDemoMode ? (
                    <div className="flex flex-wrap gap-2">
                      {(['confirmed', 'rejected'] as const).map((v) => (
                        <ActionForm key={v} action={decideTransfer} variant="quiet" submitLabel={v === 'confirmed' ? 'C’est un virement entre mes comptes' : 'Ce sont deux opérations distinctes'} testId={`virement-${v}`}>
                          <input type="hidden" name="debitId" value={m.debitId} />
                          <input type="hidden" name="creditId" value={m.creditId} />
                          <input type="hidden" name="verdict" value={v} />
                        </ActionForm>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 id="recurrentes" className="mb-3 text-lg text-primary-900">Charges et revenus récurrents</h2>
        {s.analysis.recurring.length === 0 ? <p className="text-ink-muted">Aucune opération récurrente détectée (il faut au moins 3 occurrences mensuelles).</p> : (
          <ul className="divide-y divide-line" data-testid="liste-recurrentes">
            {s.analysis.recurring.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{r.label} {r.active ? null : <span className="text-xs text-ink-muted">(plus observée récemment)</span>}</p>
                  <p className="text-sm text-ink-muted">
                    {{ income: 'Revenu récurrent', fixed_charge: 'Charge fixe', subscription: 'Abonnement', recurring_expense: 'Dépense régulière' }[r.kind]}
                    {' · '}{r.cadence === 'monthly' ? 'mensuel' : 'annuel'} · prochaine échéance attendue le {formatDate(r.nextExpectedDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`tabular font-semibold ${r.direction === 'credit' ? 'text-positive' : ''}`}>{r.direction === 'credit' ? '+' : '−'}{formatCents(r.typicalAmountCents)}</span>
                  {!isDemoMode ? (
                    <ActionForm action={markNotRecurring} submitLabel="Pas récurrent" variant="quiet">
                      <input type="hidden" name="seriesKey" value={r.key} />
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <h2 id="mes-donnees" className="mb-3 text-lg text-primary-900">Mes données</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/comptes" className="rounded-lg border border-line px-3 py-2 font-medium text-primary-800 hover:bg-mist">Mes comptes</Link>
          <Link href="/import" className="rounded-lg border border-line px-3 py-2 font-medium text-primary-800 hover:bg-mist">Importer un relevé CSV</Link>
        </div>
        {!isDemoMode ? (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-primary-700">Charges fixes ou variables : ajuster une catégorie</summary>
            <p className="mt-2 text-ink-muted">Une charge fixe revient chaque mois pour un montant prévisible (loyer, énergie, abonnements). Ce choix affine votre capacité d’épargne estimée.</p>
            <ActionForm action={saveCategoryNature} submitLabel="Enregistrer" variant="quiet" className="mt-2 grid gap-3 sm:grid-cols-2" testId="form-nature">
              <SelectField label="Catégorie" name="categorySlug">
                {expenseCats.map((c) => <option key={c.slug} value={c.slug}>{c.label}{data.natureOverrides?.[c.slug] ? ` (${data.natureOverrides[c.slug] === 'fixed' ? 'fixe' : 'variable'}, choisi)` : ''}</option>)}
              </SelectField>
              <SelectField label="Nature" name="nature" defaultValue="fixed">
                <option value="fixed">Charge fixe</option>
                <option value="variable">Dépense variable</option>
                <option value="default">Nature par défaut</option>
              </SelectField>
            </ActionForm>
          </details>
        ) : null}
      </Card>
</>
  );
}
