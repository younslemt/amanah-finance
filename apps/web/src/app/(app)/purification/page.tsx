import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate } from '@/lib/format';
import { fr } from '@/messages/fr';
import { purificationAmount } from '@amanah/engines';
import { religiousAccess } from '@/lib/supabase/session';
import { loadPurification } from '@/lib/supabase/purification';
import { purificationSummary, purificationViews, type PurificationView } from '@/lib/purification-review';
import { detectPurification, recordPurification, reviewPurification, setPurificationMethod } from './actions';

export const metadata: Metadata = { title: fr.purification.title };

const pendingText = {
  basis_not_chosen: 'À déterminer : choisissez une méthodologie',
  gross_unknown: 'À déterminer : montant brut inconnu',
  inconsistent_amounts: 'À déterminer : montants incohérents',
} as const;
const statusLabel = { detected: 'À examiner', confirmed: 'Confirmé', rejected: 'Écarté', purified: 'Purifié' } as const;
const statusTone = { detected: 'warning', confirmed: 'positive', rejected: 'neutral', purified: 'positive' } as const;
const basisLabel = { gross: 'Montant brut (avant précompte mobilier)', net_credited: 'Montant net crédité sur le compte' } as const;

function Amounts({ v }: { v: PurificationView }) {
  const t = fr.purification;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt className="text-ink-muted">{t.credited}</dt><dd className="tabular font-semibold">{formatCents(v.creditedCents)}</dd></div>
      <div><dt className="text-ink-muted">{t.withholding}</dt><dd className="tabular">{v.withholdingCents === null ? t.unknown : formatCents(v.withholdingCents)}</dd></div>
      <div><dt className="text-ink-muted">{t.gross}</dt><dd className="tabular">{v.grossCents === null ? t.unknown : formatCents(v.grossCents)}</dd></div>
      <div><dt className="text-ink-muted">{t.toPurify}</dt>
        <dd className="font-medium" data-testid="montant-a-purifier">{v.previewCents === null ? pendingText[v.pendingReason ?? 'basis_not_chosen'] : formatCents(v.previewCents)}</dd></div>
    </dl>
  );
}

function ItemCard({ v, children }: { v: PurificationView; children?: ReactNode }) {
  return (
    <li className="py-4 first:pt-0 last:pb-0" data-testid="element-purification">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{v.label}</p>
          <p className="text-sm text-ink-muted">{fr.purification.source[v.sourceKind]} · {formatDate(v.occurredOn)}{v.mine ? '' : ' · partagé par un membre du foyer'}</p>
        </div>
        <Badge tone={statusTone[v.status]}>{statusLabel[v.status]}</Badge>
      </div>
      <Amounts v={v} />
      {v.mine ? children : null}
    </li>
  );
}

export default async function PurificationPage() {
  if (isDemoMode) return DemoPurification();
  const { enabled, ctx } = await religiousAccess();
  const t = fr.purification;
  if (!enabled || !ctx) return (<><PageHeader title={t.title} subtitle={t.intro} /><ReligiousGate feature={t.title} next="/purification" /></>);

  const { rows, basis, gifts } = await loadPurification(ctx);
  const views = purificationViews(rows, basis, ctx.userId);
  const summary = purificationSummary(rows);
  const by = (st: PurificationView['status']) => views.filter((v) => v.status === st);
  const payable = by('confirmed').filter((v) => v.mine && v.amountToPurifyCents !== null);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());

  return (
    <>
      <PageHeader title={t.title} subtitle={t.intro} />
      <div className="space-y-3">
        <Notice>{t.distinct}</Notice>
        <Notice tone="warning">Estimation à titre indicatif : ni fatwa ni certification. La méthodologie (brut ou net) relève de votre choix ou d’un avis religieux qualifié. Aucun paiement n’est effectué par l’application.</Notice>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5" data-testid="synthese-purification">
        <Card><Stat label="À examiner (net)" value={formatCents(summary.detectedCreditedCents)} /></Card>
        <Card><Stat label="Montant à déterminer" value={`${summary.toDetermineCount}`} hint={summary.toDetermineCount ? `${formatCents(summary.toDetermineCreditedCents)} net crédité` : undefined} /></Card>
        <Card><Stat label="À purifier" value={formatCents(summary.toPurifyCents)} tone={summary.toPurifyCents > 0 ? 'critical' : 'default'} /></Card>
        <Card><Stat label="Purifié" value={formatCents(summary.purifiedCents)} tone="positive" /></Card>
        <Card><Stat label="Écarté (net)" value={formatCents(summary.rejectedCreditedCents)} /></Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Méthodologie de calcul</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">
            {basis ? <>Choix actuel : <strong data-testid="methodologie-actuelle">{basisLabel[basis]}</strong>.</> : 'Aucune méthodologie choisie : les montants restent « à déterminer ».'}
          </p>
          <ActionForm action={setPurificationMethod} submitLabel="Enregistrer la méthodologie" variant="quiet" testId="form-methodologie">
            <RadioGroup name="basis" legend="Purifier sur la base du…" defaultValue={basis ?? undefined}
              options={[
                { value: 'net_credited', label: <>Montant <strong>net crédité</strong> (ce que vous avez reçu)</> },
                { value: 'gross', label: <>Montant <strong>brut</strong> (avant précompte mobilier) : brut ou précompte à saisir</> },
              ]} />
          </ActionForm>
        </Card>
        <Card>
          <CardTitle>Détection</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">Les intérêts des relevés importés sont détectés automatiquement. Lancez une détection sur vos opérations déjà enregistrées (24 derniers mois).</p>
          <ActionForm action={detectPurification} submitLabel="Détecter les intérêts" variant="quiet" testId="form-detection" />
          <Link href="/import" className="mt-3 inline-block text-sm font-medium text-primary-700 underline-offset-4 hover:underline">Importer un relevé CSV</Link>
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle>À examiner</CardTitle>
        {by('detected').length === 0 ? <p className="text-ink-muted">{t.empty}</p> : (
          <ul className="divide-y divide-line" data-testid="liste-a-examiner">
            {by('detected').map((v) => (
              <ItemCard key={v.id} v={v}>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ActionForm action={reviewPurification} submitLabel={t.confirm} testId="form-confirmer-purification" className="rounded-lg border border-line p-3">
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="decision" value="confirm" />
                    <Field label="Montant brut (€), si connu" name="gross" inputMode="decimal" hint="Ou le précompte : l’autre montant est calculé." />
                    <Field label="Précompte mobilier (€), si connu" name="withholding" inputMode="decimal" />
                  </ActionForm>
                  <ActionForm action={reviewPurification} submitLabel={t.reject} variant="quiet" testId="form-ecarter-purification">
                    <input type="hidden" name="id" value={v.id} />
                    <input type="hidden" name="decision" value="reject" />
                  </ActionForm>
                </div>
              </ItemCard>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>Confirmés</CardTitle>
        {by('confirmed').length === 0 ? <p className="text-ink-muted">Aucun élément confirmé.</p> : (
          <ul className="divide-y divide-line" data-testid="liste-confirmes">
            {by('confirmed').map((v) => (
              <ItemCard key={v.id} v={v}>
                <ActionForm action={reviewPurification} submitLabel="Annuler la confirmation" variant="quiet" className="mt-3">
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="decision" value="unconfirm" />
                </ActionForm>
              </ItemCard>
            ))}
          </ul>
        )}
      </Card>

      {payable.length ? (
        <Card className="mt-4">
          <CardTitle>Enregistrer une purification réalisée</CardTitle>
          <p className="mb-3 text-sm text-ink-muted">Indiquez un don déjà effectué par vos propres moyens. L’application n’exécute aucun paiement.</p>
          <ActionForm action={recordPurification} submitLabel="Enregistrer la purification" testId="form-purification-realisee">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Éléments purifiés par ce don</legend>
              {payable.map((v) => (
                <label key={v.id} className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="itemIds" value={v.id} defaultChecked className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-700)]" />
                  <span>{v.label} · {formatDate(v.occurredOn)} · <span className="tabular font-medium">{formatCents(v.amountToPurifyCents!)}</span></span>
                </label>
              ))}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Date du don" name="paidOn" type="date" required defaultValue={today} max={today} />
              <Field label="Bénéficiaire" name="beneficiary" required maxLength={120} hint="Association ou personne bénéficiaire (texte libre)." />
            </div>
          </ActionForm>
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardTitle>Purifications réalisées</CardTitle>
        {gifts.length === 0 ? <p className="text-ink-muted">Aucune purification enregistrée.</p> : (
          <ul className="divide-y divide-line text-sm" data-testid="liste-purifications">
            {gifts.map((g) => (
              <li key={g.id} className="flex flex-wrap justify-between gap-3 py-2">
                <span>{formatDate(g.paid_on)} · {g.beneficiary_label ?? 'Bénéficiaire'}</span>
                <span className="tabular font-semibold">{formatCents(Number(g.amount_cents))}</span>
              </li>
            ))}
          </ul>
        )}
        {by('purified').length ? <p className="mt-2 text-xs text-ink-muted">{by('purified').length} élément(s) purifié(s) : statut définitif.</p> : null}
      </Card>

      {by('rejected').length ? (
        <Card className="mt-4">
          <CardTitle>Écartés</CardTitle>
          <ul className="divide-y divide-line">
            {by('rejected').map((v) => (
              <ItemCard key={v.id} v={v}>
                <ActionForm action={reviewPurification} submitLabel="Remettre à examiner" variant="quiet" className="mt-3">
                  <input type="hidden" name="id" value={v.id} />
                  <input type="hidden" name="decision" value="restore" />
                </ActionForm>
              </ItemCard>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

async function DemoPurification() {
  const { purification: p } = await getSnapshot();
  const t = fr.purification;
  return (
    <>
      <PageHeader title={t.title} subtitle={t.intro} />
      <div className="space-y-3">
        <Notice>{t.distinct}</Notice>
        <Notice tone="warning">{t.basisNotice}</Notice>
      </div>
      <Card className="mt-4"><Stat label={t.pending} value={formatCents(p.detectedCreditedCents)} /></Card>
      <Card className="mt-4">
        {p.candidates.length === 0 ? <p className="text-ink-muted">{t.empty}</p> : (
          <ul className="divide-y divide-line">
            {p.candidates.map((c) => {
              // Relevé bancaire : seul le net crédité est connu ; base non choisie → à déterminer
              const amount = purificationAmount({ creditedCents: c.creditedCents }, null);
              return (
                <li key={c.transactionId} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{t.source[c.sourceKind]}</p>
                      <p className="text-sm text-ink-muted">{formatDate(c.bookedOn)}</p>
                    </div>
                    {/* Sprint 3 : saisie du brut ou du précompte, choix de la base, confirmation */}
                    <Badge tone="warning">À confirmer</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div><dt className="text-ink-muted">{t.credited}</dt><dd className="tabular font-semibold">{formatCents(amount.amounts.creditedCents)}</dd></div>
                    <div><dt className="text-ink-muted">{t.withholding}</dt><dd className="tabular">{amount.amounts.withholdingTaxCents === null ? t.unknown : formatCents(amount.amounts.withholdingTaxCents)}</dd></div>
                    <div><dt className="text-ink-muted">{t.gross}</dt><dd className="tabular">{amount.amounts.grossCents === null ? t.unknown : formatCents(amount.amounts.grossCents)}</dd></div>
                    <div><dt className="text-ink-muted">{t.toPurify}</dt><dd className="font-medium">{amount.amountCents === null ? fr.common.toDetermine : formatCents(amount.amountCents)}</dd></div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
