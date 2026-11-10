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
import { createCategory, createTransaction, deleteTransaction, saveBudget } from '../actions';

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
    </>
  );
}
