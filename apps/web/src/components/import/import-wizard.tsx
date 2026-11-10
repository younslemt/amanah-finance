'use client';
import { useActionState } from 'react';
import { ActionForm } from '@/components/forms/action-form';
import { SelectField } from '@/components/forms/fields';
import { Badge, cn } from '@/components/ui';
import { formatCents, formatDate } from '@/lib/format';
import { PROFILE_OPTIONS } from '@/lib/import-preview';
import type { ImportState } from '@/app/(app)/import/actions';
import { confirmImport, previewImport } from '@/app/(app)/import/actions';

const interestLabel = { bank_interest: 'Intérêt', loyalty_bonus: 'Prime de fidélité', dividend_impure_share: 'Dividende', manual: 'Intérêt' } as const;

/** Import en deux temps : aperçu (rien n'est écrit), puis confirmation explicite. */
export function ImportWizard({ accounts, religious }: { accounts: Array<{ id: string; name: string }>; religious: boolean }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(previewImport, { status: 'idle' });
  const p = state.preview;
  const errors = state.fieldErrors ? Object.values(state.fieldErrors) : [];

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-3" data-testid="form-import" noValidate>
        {state.status === 'error' ? (
          <div role="alert" className="rounded-lg border border-[#f0d3cd] bg-[#fbeeeb] p-3 text-sm text-critical">
            {state.message ? <p className="font-medium">{state.message}</p> : null}
            {errors.length ? <ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Compte concerné" name="accountId" required defaultValue={p?.accountId ?? accounts[0]?.id}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
          <SelectField label="Format du fichier" name="profile" defaultValue="auto">
            <option value="auto">Détection automatique</option>
            {PROFILE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </SelectField>
        </div>
        <label className="block text-sm font-medium">
          Relevé CSV
          <input type="file" name="file" accept=".csv,text/csv,.txt" required
            className="mt-1 block w-full rounded-lg border border-line bg-ivory px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-primary-50 file:px-3 file:py-1.5 file:text-primary-900" />
        </label>
        <p className="text-xs text-ink-muted">Le fichier est lu sur le serveur puis écarté. Rien n’est enregistré avant votre confirmation.</p>
        <button type="submit" disabled={pending} className="rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory hover:bg-primary-700 disabled:opacity-60">
          {pending ? 'Lecture…' : 'Prévisualiser'}
        </button>
      </form>

      {p ? (
        <section aria-labelledby="apercu-titre" className="rounded-xl border border-line bg-paper p-4" data-testid="apercu-import">
          <h2 id="apercu-titre" className="text-lg text-primary-900">Aperçu : {p.fileName}</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div><dt className="text-ink-muted">Lignes lues</dt><dd className="tabular font-semibold" data-testid="apercu-lues">{p.counts.read}</dd></div>
            <div><dt className="text-ink-muted">À importer</dt><dd className="tabular font-semibold" data-testid="apercu-a-importer">{p.counts.toImport}</dd></div>
            <div><dt className="text-ink-muted">Doublons ignorés</dt><dd className="tabular font-semibold" data-testid="apercu-doublons">{p.counts.duplicates}</dd></div>
            <div><dt className="text-ink-muted">Lignes en erreur</dt><dd className="tabular font-semibold" data-testid="apercu-erreurs">{p.counts.errors}</dd></div>
            <div><dt className="text-ink-muted">Intérêts détectés</dt><dd className="tabular font-semibold" data-testid="apercu-interets">{p.counts.interest}</dd></div>
          </dl>
          {p.errors.length ? (
            <div className="mt-3 rounded-lg bg-mist p-3 text-sm">
              <p className="font-medium">Lignes ignorées</p>
              <ul className="mt-1 list-disc pl-5">{p.errors.map((e) => <li key={`${e.line}-${e.message}`}>Ligne {e.line} : {e.message}</li>)}</ul>
            </div>
          ) : null}
          {p.counts.interest > 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              {religious
                ? 'Les intérêts importés seront proposés à la purification : vous confirmerez chaque élément.'
                : 'Les intérêts sont marqués comme tels. Pour les suivre en purification, activez les fonctions de finance islamique.'}
            </p>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Opérations lues dans le fichier</caption>
              <thead><tr className="border-b border-line text-left text-ink-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2 pr-3 font-medium">Libellé</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Montant</th>
                <th scope="col" className="py-2 pr-3 font-medium">Catégorie proposée</th>
                <th scope="col" className="py-2 font-medium">Statut</th>
              </tr></thead>
              <tbody>
                {p.rows.map((r, i) => (
                  <tr key={i} className={cn('border-b border-line/60', r.status === 'duplicate' && 'text-ink-muted')}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.bookedOn)}</td>
                    <td className="py-2 pr-3">{r.description}</td>
                    <td className={cn('tabular py-2 pr-3 text-right whitespace-nowrap', r.amountCents > 0 && 'text-positive')}>{formatCents(r.amountCents)}</td>
                    <td className="py-2 pr-3">{r.category}</td>
                    <td className="py-2">
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={r.status === 'duplicate' ? 'neutral' : 'positive'}>{r.status === 'duplicate' ? 'Doublon' : 'Nouvelle'}</Badge>
                        {r.interest ? <Badge tone="warning">{interestLabel[r.interest]}</Badge> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.hiddenRows ? <p className="mt-2 text-xs text-ink-muted">{p.hiddenRows} autre(s) ligne(s) non affichée(s).</p> : null}
          </div>
          {p.counts.toImport > 0 ? (
            <ActionForm action={confirmImport} submitLabel={`Importer ${p.counts.toImport} opération(s)`} className="mt-4" testId="form-confirmer-import">
              <input type="hidden" name="csv" value={p.csv} />
              <input type="hidden" name="accountId" value={p.accountId} />
              <input type="hidden" name="profile" value={p.profile} />
              <input type="hidden" name="fileName" value={p.fileName} />
            </ActionForm>
          ) : <p className="mt-4 text-sm font-medium">Aucune nouvelle opération : ce relevé est déjà importé.</p>}
        </section>
      ) : null}
    </div>
  );
}
