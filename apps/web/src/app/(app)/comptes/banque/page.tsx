import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/forms/action-form';
import { Checkbox, Field, SelectField } from '@/components/forms/fields';
import { Badge, Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { isDemoMode } from '@/lib/env';
import { formatDate } from '@/lib/format';
import { requireOnboardedSession } from '@/lib/supabase/session';
import { BANK_FAILURE_MESSAGE, bankSettings, canUseBanking, listBanks, type BankFailure } from '@/lib/banking/bank-sync';
import { connectBank, deleteBankData, revokeBank, syncBank } from './actions';

export const metadata: Metadata = { title: 'Connecter une banque' };
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; tone: 'positive' | 'neutral' | 'warning' | 'critical' }> = {
  active: { label: 'Active', tone: 'positive' },
  pending: { label: 'En attente de la banque', tone: 'neutral' },
  expired: { label: 'Expirée : à reconnecter', tone: 'warning' },
  revoked: { label: 'Révoquée', tone: 'neutral' },
  error: { label: 'En erreur', tone: 'critical' },
};

/**
 * Connexion bancaire (mode réel uniquement, connecteur Enable Banking).
 * Accès en LECTURE SEULE, autorisé par l'utilisateur chez sa banque, révocable à tout moment.
 * Jamais d'identifiant ni de code bancaire demandé ici ; aucune initiation de paiement.
 */
export default async function BankPage({ searchParams }: { searchParams: Promise<{ resultat?: string; motif?: string; importees?: string }> }) {
  if (isDemoMode) notFound();
  const ctx = await requireOnboardedSession();
  const s = bankSettings();
  const q = await searchParams;

  if (!s.configured || !canUseBanking(ctx, s)) {
    return (
      <>
        <PageHeader title="Connecter une banque" subtitle="Connexion bancaire en lecture seule" />
        <div data-testid="banque-indisponible"><Notice>
          {!s.configured
            ? 'La connexion bancaire n’est pas activée sur ce serveur. Vous pouvez importer un relevé CSV.'
            : 'La connexion bancaire est réservée, pour l’instant, à un test personnel restreint. Vous pouvez importer un relevé CSV.'}
        </Notice></div>
        <p className="mt-4"><Link href="/import" className="font-semibold text-primary-800 underline underline-offset-4">Importer un relevé</Link></p>
      </>
    );
  }

  const [{ data: connections }, { data: accounts }] = await Promise.all([
    ctx.supabase.from('bank_connections').select('id, aspsp_name, status, environment, expires_at, last_synced_at, last_error, created_at')
      .eq('household_id', ctx.householdId).eq('provider', 'enable_banking').order('created_at', { ascending: false }),
    ctx.supabase.from('accounts').select('id, connection_id, name, iban_last4').eq('household_id', ctx.householdId).not('connection_id', 'is', null),
  ]);
  let banks: Awaited<ReturnType<typeof listBanks>> = [];
  let banksError = false;
  try { banks = await listBanks('BE'); } catch { banksError = true; }
  const failure = q.motif && q.motif in BANK_FAILURE_MESSAGE ? BANK_FAILURE_MESSAGE[q.motif as BankFailure] : null;
  const sandbox = s.env === 'sandbox';

  return (
    <>
      <PageHeader title="Connecter une banque" subtitle="Accès en lecture seule à vos comptes, autorisé chez votre banque" />
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="banque-environnement" data-env={s.env}>
        <Badge tone={sandbox ? 'neutral' : 'warning'}>{sandbox ? 'Environnement simulé : banques et données fictives' : 'Production restreinte : uniquement vos comptes liés'}</Badge>
      </div>
      {q.resultat === 'connecte' ? <div className="mb-4" data-testid="banque-resultat" data-resultat="connecte"><Notice>Banque connectée. {Number(q.importees) || 0} opération(s) importée(s).</Notice></div> : null}
      {failure ? <div className="mb-4" data-testid="banque-resultat" data-resultat="echec"><Notice tone="warning">{failure}</Notice></div> : null}

      <Card>
        <CardTitle>Ce que voit Amanah Finance</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="banque-engagements">
          <li>Vous vous identifiez <strong>chez votre banque</strong>. Amanah Finance ne demande ni ne voit jamais vos identifiants ou codes.</li>
          <li>Accès en <strong>lecture seule</strong> : soldes et opérations comptabilisées. Aucun paiement ne peut être initié.</li>
          <li>Durée de l’accès : {s.consentDays} jours au plus, puis nouvelle autorisation. Révocable ici à tout moment.</li>
          <li>Seuls les 4 derniers caractères de l’IBAN sont conservés. Prestataire : Enable Banking (agréé AISP en Finlande).</li>
        </ul>
      </Card>

      <Card className="mt-4">
        <CardTitle>Nouvelle connexion</CardTitle>
        {banksError ? <Notice tone="warning">La liste des banques n’a pas pu être chargée : réessayez plus tard.</Notice> : (
          <ActionForm action={connectBank} submitLabel="Continuer vers ma banque" testId="form-connecter-banque">
            <SelectField label="Votre banque" name="institutionId" defaultValue="" required>
              <option value="" disabled>Choisir…</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </SelectField>
            <Checkbox name="accord" required label={`J’autorise Amanah Finance à lire, via Enable Banking, les soldes et opérations des comptes que je choisirai chez ma banque, pendant ${s.consentDays} jours au plus. Je peux révoquer cet accès à tout moment.`} />
          </ActionForm>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>Mes connexions</CardTitle>
        {!connections?.length ? <p className="text-sm text-ink-muted">Aucune connexion.</p> : (
          <ul className="divide-y divide-mist" data-testid="liste-connexions">
            {connections.map((c) => {
              const st = STATUS[c.status as string] ?? STATUS.error!;
              const linked = (accounts ?? []).filter((a) => a.connection_id === c.id);
              return (
                <li key={c.id as string} className="space-y-2 py-4 first:pt-0" data-testid="connexion-bancaire" data-statut={c.status as string}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{(c.aspsp_name as string) ?? 'Banque'}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {c.expires_at ? `Accès valable jusqu’au ${formatDate((c.expires_at as string).slice(0, 10))}. ` : ''}
                    {c.last_synced_at ? `Dernière synchronisation le ${formatDate((c.last_synced_at as string).slice(0, 10))}.` : 'Jamais synchronisée.'}
                  </p>
                  {linked.length ? <p className="text-sm" data-testid="comptes-relies">{linked.map((a) => `${a.name as string}${a.iban_last4 ? ` (…${a.iban_last4 as string})` : ''}`).join(' · ')}</p> : null}
                  {c.last_error ? <p className="text-sm text-critical" data-testid="erreur-connexion">{c.last_error as string}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {c.status === 'active' ? (
                      <>
                        <ActionForm action={syncBank} submitLabel="Synchroniser" variant="quiet" testId="form-synchroniser"><input type="hidden" name="connectionId" value={c.id as string} /></ActionForm>
                        <ActionForm action={revokeBank} submitLabel="Révoquer l’accès" variant="quiet" testId="form-revoquer"><input type="hidden" name="connectionId" value={c.id as string} /></ActionForm>
                      </>
                    ) : null}
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer">Supprimer les données de cette banque</summary>
                    <ActionForm action={deleteBankData} submitLabel="Supprimer définitivement" variant="danger" testId="form-supprimer-banque" className="mt-2">
                      <input type="hidden" name="connectionId" value={c.id as string} />
                      <p className="text-ink-muted">Révoque l’accès puis efface les comptes reliés et toutes leurs opérations importées. Irréversible.</p>
                      <Field label="Tapez SUPPRIMER pour confirmer" name="confirmation" autoComplete="off" />
                    </ActionForm>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
