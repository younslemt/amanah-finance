import Link from 'next/link';
import type { Metadata } from 'next';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, SelectField } from '@/components/forms/fields';
import { getHouseholdData } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents } from '@/lib/format';
import { ACCOUNT_TYPE_LABELS } from '@/lib/labels';
import { createAccount } from '../actions';

export const metadata: Metadata = { title: 'Mes comptes' };


export default async function AccountsPage() {
  const data = await getHouseholdData();
  return (
    <>
      <PageHeader title="Mes comptes" subtitle="Comptes saisis manuellement. Aucune banque n’est connectée." />
      <p className="-mt-3 mb-4 text-sm"><Link href="/import" className="font-medium text-primary-700 underline-offset-4 hover:underline" data-testid="lien-import">Importer un relevé CSV</Link></p>
      <Card>
        <CardTitle>Comptes</CardTitle>
        {data.accounts.length === 0 ? <p className="text-ink-muted">Aucun compte pour le moment.</p> : (
          <ul className="divide-y divide-line" data-testid="liste-comptes">
            {data.accounts.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-3">
                <span><span className="font-medium">{a.name}</span><span className="block text-xs text-ink-muted">{ACCOUNT_TYPE_LABELS[a.type] ?? a.type}</span></span>
                <span className="tabular font-semibold">{formatCents(a.balanceCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4">
        <CardTitle>Ajouter un compte</CardTitle>
        {isDemoMode ? <Notice>Saisie disponible avec un compte réel.</Notice> : (
          <ActionForm action={createAccount} submitLabel="Ajouter le compte" testId="form-compte">
            <Field label="Nom du compte" name="name" placeholder="Compte courant" required maxLength={120} />
            <SelectField label="Type" name="type" defaultValue="current">
              {['current', 'savings', 'regulated_savings', 'cash', 'credit_card', 'other'].map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
            </SelectField>
            <Field label="Solde de départ (€)" name="openingBalance" inputMode="decimal" defaultValue="0" required hint="Exemple : 1 250,00. Négatif pour une carte de crédit." />
          </ActionForm>
        )}
      </Card>
    </>
  );
}
