import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ImportWizard } from '@/components/import/import-wizard';
import { isDemoMode } from '@/lib/env';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { decodeResult } from '@/lib/import-preview';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Importer un relevé' };

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ resultat?: string }> }) {
  if (isDemoMode) {
    return (
      <>
        <PageHeader title="Importer un relevé" subtitle="CSV exporté depuis votre banque" />
        <Notice>L’import est désactivé en démonstration : aucune donnée n’est enregistrée. En mode réel, vous importez un relevé CSV, vous vérifiez l’aperçu, puis vous confirmez.</Notice>
      </>
    );
  }
  const ctx = await requireOnboardedSession();
  const { resultat } = await searchParams;
  const result = decodeResult(resultat);
  const [{ data: accounts }, { data: batches }] = await Promise.all([
    ctx.supabase.from('accounts').select('id, name').eq('household_id', ctx.householdId).eq('archived', false).order('created_at'),
    ctx.supabase.from('import_batches').select('id, file_name, row_count, imported_count, duplicate_count, error_count, interest_count, created_at, accounts(name)')
      .eq('household_id', ctx.householdId).order('created_at', { ascending: false }).limit(10),
  ]);

  return (
    <>
      <PageHeader title="Importer un relevé" subtitle="CSV exporté depuis votre banque : aperçu, puis confirmation" />
      {result ? (
        <div role="status" className="mb-4 rounded-xl border border-primary-100 bg-primary-50 p-4 text-sm text-primary-900" data-testid="resultat-import">
          <p className="font-medium">Import terminé : {result.imported} opération(s) importée(s), {result.duplicates} doublon(s) ignoré(s).</p>
          {result.interest > 0 ? (
            <p className="mt-1">
              {result.interest} revenu(s) d’intérêts détecté(s)
              {result.purification > 0
                ? <>, dont {result.purification} proposé(s) à la <Link href="/purification" className="underline">purification</Link>.</>
                : ctx.religiousEnabled ? '.' : <> — <Link href="/finance-islamique?suite=%2Fpurification" className="underline">activez la finance islamique</Link> pour les purifier.</>}
            </p>
          ) : null}
        </div>
      ) : null}
      <Notice>Utilisez un export CSV de votre banque. Aucun identifiant bancaire n’est demandé et aucune connexion à votre banque n’est établie.</Notice>
      <Card className="mt-4">
        {(accounts ?? []).length === 0 ? (
          <p className="text-sm">Ajoutez d’abord un compte : <Link href="/comptes" className="font-medium text-primary-700 underline">Mes comptes</Link>.</p>
        ) : <ImportWizard key={resultat ?? 'nouveau'} accounts={(accounts ?? []) as Array<{ id: string; name: string }>} religious={ctx.religiousEnabled} />}
      </Card>

      <Card className="mt-4">
        <CardTitle>Derniers imports</CardTitle>
        {(batches ?? []).length === 0 ? <p className="text-sm text-ink-muted">Aucun import pour le moment.</p> : (
          <ul className="divide-y divide-line text-sm" data-testid="historique-imports">
            {(batches ?? []).map((b) => (
              <li key={b.id as string} className="py-2">
                <p className="font-medium">{(b.file_name as string | null) ?? 'Relevé'} · {((b.accounts as { name?: string } | null)?.name) ?? 'Compte'}</p>
                <p className="text-ink-muted">
                  {formatDate((b.created_at as string).slice(0, 10))} · {b.row_count as number} lue(s), {b.imported_count as number} importée(s),
                  {' '}{b.duplicate_count as number} doublon(s), {b.error_count as number} erreur(s), {b.interest_count as number} intérêt(s)
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
