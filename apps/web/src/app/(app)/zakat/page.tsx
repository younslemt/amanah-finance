import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup, SelectField } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { getHouseholdData, getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate } from '@/lib/format';
import { interpolate } from '@/lib/i18n';
import { fr } from '@/messages/fr';
import { religiousAccess } from '@/lib/supabase/session';
import { loadZakatPage } from '@/lib/supabase/zakat';
import { toContribution } from '@/lib/contributions-view';
import { CHOICE_OPTIONS, CHOICE_TEXT, zakatHistory, type HistoryEntry } from '@/lib/zakat-view';
import { requiredZakatChoices, zakatSettlements, ZAKAT_RULESET, type ZakatChoices, type ZakatResult } from '@amanah/engines';
import type { HouseholdSnapshot } from '@/lib/snapshot';
import { addAsset, addLiability, addMetalPrice, deleteAsset, deleteLiability, deleteMetalPrice, saveZakatCalculation, saveZakatSettings } from './actions';

export const metadata: Metadata = { title: fr.zakat.title };

const statusTone = { to_determine: 'warning', below_nisab: 'neutral', hawl_incomplete: 'neutral', due: 'positive' } as const;
const ASSET_LABEL: Record<string, string> = {
  cash: 'Espèces', bank_balance: 'Solde bancaire', gold: 'Or (lingot, pièces)', silver: 'Argent métal', jewelry_personal: 'Bijoux portés',
  stocks_funds: 'Actions et fonds', pension: 'Épargne-pension', group_insurance: 'Assurance groupe', life_insurance: 'Assurance vie',
  business_inventory: 'Stock commercial', business_cash: 'Trésorerie professionnelle', receivable: 'Créance (argent prêté)',
  real_estate_residence: 'Résidence', real_estate_investment: 'Immobilier loué', vehicle: 'Véhicule', other: 'Autre bien',
};
const LIABILITY_LABEL: Record<string, string> = { mortgage: 'Crédit hypothécaire', consumer_loan: 'Prêt à la consommation', family_loan: 'Prêt familial', other: 'Autre dette' };
const PRICE_STATUS = { ok: ['positive', 'Récent'], stale: ['warning', 'Trop ancien (plus de 7 jours)'], missing: ['critical', 'Absent'], future: ['warning', 'Daté dans le futur'] } as const;

function Ruleset() {
  return (
    <div className="space-y-3">
      <Notice tone="warning">{fr.zakat.disclaimer}</Notice>
      <Notice>Référentiel {ZAKAT_RULESET.id} {ZAKAT_RULESET.version} : <strong>provisoire</strong>, en attente de validation par un comité charia qualifié. Aucune option n’est présentée comme la règle : chaque choix vous appartient, avec ses références.</Notice>
    </div>
  );
}

function Detail({ z }: { z: HouseholdSnapshot['zakat'] }) {
  if (!z.result) {
    return (
      <Card className="mt-4">
        <CardTitle>Calcul détaillé</CardTitle>
        <div data-testid="zakat-choix-manquants">
          <Badge tone="warning">Choix à compléter</Badge>
          <p className="mt-3 text-sm">Le calcul n’est pas lancé tant que ces choix, qui changent le résultat pour vos biens, ne sont pas faits :</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {z.prepared.missing.map((k) => <li key={k}>{CHOICE_TEXT[k].legend} — {CHOICE_TEXT[k].why}</li>)}
          </ul>
        </div>
      </Card>
    );
  }
  return <ResultCard r={z.result} notApplicable={z.prepared.notApplicable} />;
}

function ResultCard({ r, notApplicable, title = 'Calcul détaillé', children }: { r: ZakatResult; notApplicable?: readonly string[]; title?: string; children?: ReactNode }) {
  const t = fr.zakat;
  const rate = `${(r.ratePer100k / 1000).toLocaleString('fr-BE', { maximumFractionDigits: 3 })} %`;
  const nisabLabel = interpolate(t.nisab, { basis: r.nisabBasis ? t.basis[r.nisabBasis] : fr.common.toDetermine });
  return (
    <Card className="mt-4">
      <CardTitle>{title}</CardTitle>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-testid="zakat-statut">
        <Badge tone={statusTone[r.status]}>{t.status[r.status]}</Badge>
        <span className="text-sm text-ink-muted">{t.rate} {rate} · au {formatDate(r.asOf)}</span>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <Stat label={t.gross} value={formatCents(r.grossZakatableCents)} />
        <Stat label={t.debts} value={`− ${formatCents(r.deductibleDebtsCents)}`} />
        <Stat label={nisabLabel} value={r.nisabCents === null ? t.unknownNisab : formatCents(r.nisabCents)} />
        <Stat label={r.status === 'due' ? t.estimated : t.indicative} value={r.status === 'to_determine' ? fr.common.toDetermine : formatCents(r.status === 'due' ? r.dueCents : r.estimatedZakatCents)} tone={r.status === 'due' ? 'positive' : 'default'} />
      </div>
      {r.status === 'to_determine' && r.pendingReasons.length > 0 ? (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-sm font-medium">{t.pendingTitle}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">{r.pendingReasons.map((p) => <li key={p}>{t.pending[p]}</li>)}</ul>
        </div>
      ) : null}
      {r.warnings.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-ink-muted">
          {r.warnings.map((w, i) => <li key={`${w.code}-${i}`}>⚠ {interpolate(t.warnings[w.code], w.params)}</li>)}
        </ul>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm" data-testid="zakat-lignes">
          <caption className="sr-only">{t.lines}</caption>
          <thead className="text-left text-ink-muted">
            <tr><th scope="col" className="pb-2 font-normal">Élément</th><th scope="col" className="pb-2 font-normal">Règle appliquée et références</th><th scope="col" className="pb-2 text-right font-normal">{t.value}</th><th scope="col" className="pb-2 text-right font-normal">{t.included}</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {r.lines.map((l) => (
              <tr key={l.sourceId}>
                <th scope="row" className="py-2 pr-3 text-left font-medium">{l.label}</th>
                <td className="py-2 pr-3 text-ink-muted">{t.rules[l.rule]}<span className="block text-xs">{l.references.map((ref) => ZAKAT_RULESET.references[ref]).join(' · ')}</span></td>
                <td className="tabular py-2 text-right">{formatCents(l.valueCents)}</td>
                <td className="tabular py-2 text-right font-medium">{formatCents(l.includedCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line"><th scope="row" colSpan={3} className="pt-2 text-left font-medium">{t.net}</th><td className="tabular pt-2 text-right font-semibold">{formatCents(r.netZakatableCents)}</td></tr>
          </tfoot>
        </table>
      </div>
      {notApplicable?.length ? <p className="mt-3 text-xs text-ink-muted">Sans objet pour vos biens actuels (aucune valeur appliquée) : {notApplicable.map((k) => CHOICE_TEXT[k as keyof typeof CHOICE_TEXT].legend.toLowerCase()).join(', ')}.</p> : null}
      {children}
    </Card>
  );
}

function SettingsForm({ choices, required, sources }: { choices: ZakatChoices; required: readonly string[]; sources: Array<{ id: string; label: string; detail: string }> }) {
  const excluded = new Set(choices.excludedSourceIds ?? []);
  const radio = (key: keyof typeof CHOICE_OPTIONS, legend: string, why: string, needed: boolean) => (
    <div className="rounded-lg border border-line p-3">
      <RadioGroup name={key} legend={`${legend}${needed ? '' : ' (sans objet pour vos biens actuels)'}`} options={CHOICE_OPTIONS[key]}
        defaultValue={((choices as Record<string, unknown>)[key] as string | null | undefined) ?? undefined} />
      <p className="mt-2 text-xs text-ink-muted">{why}</p>
    </div>
  );
  return (
    <Card className="mt-4">
      <CardTitle>Mes choix méthodologiques</CardTitle>
      <p className="mb-3 text-sm text-ink-muted">Aucun choix n’est fait à votre place. Les choix sans objet ne changent pas le résultat.</p>
      <ActionForm action={saveZakatSettings} submitLabel="Enregistrer mes choix" testId="form-reglages-zakat" className="grid gap-3 md:grid-cols-2">
        {radio('nisabBasis', 'Base du nisab', 'Or ou argent : avis divergents. La base argent donne un seuil plus bas.', true)}
        <div className="rounded-lg border border-line p-3">
          <Field label="Début de votre année de possession (Hawl)" name="hawlStart" type="date" defaultValue={choices.hawlStart ?? ''} />
          <p className="mt-2 text-xs text-ink-muted">Date à laquelle votre patrimoine a atteint le nisab, ou dernier anniversaire de cette date.</p>
        </div>
        {radio('yearBasis', CHOICE_TEXT.yearBasis.legend, CHOICE_TEXT.yearBasis.why, true)}
        {radio('personalJewelry', CHOICE_TEXT.personalJewelry.legend, CHOICE_TEXT.personalJewelry.why, required.includes('personalJewelry'))}
        <div className="rounded-lg border border-line p-3">
          <RadioGroup name="longTermInvestments" legend={`${CHOICE_TEXT.longTermInvestments.legend}${required.includes('longTermInvestments') ? '' : ' (sans objet pour vos biens actuels)'}`}
            options={CHOICE_OPTIONS.longTermInvestments} defaultValue={choices.longTermInvestments ?? undefined} />
          <Field label="Part retenue (%)" name="longTermRatioPercent" inputMode="decimal" defaultValue={choices.longTermRatioPer100k == null ? '' : String(choices.longTermRatioPer100k / 1000)} />
          <p className="mt-2 text-xs text-ink-muted">{CHOICE_TEXT.longTermInvestments.why}</p>
        </div>
        {radio('lockedPensions', CHOICE_TEXT.lockedPensions.legend, CHOICE_TEXT.lockedPensions.why, required.includes('lockedPensions'))}
        {radio('debts', CHOICE_TEXT.debts.legend, CHOICE_TEXT.debts.why, required.includes('debts'))}
        {sources.length ? (
          <fieldset className="rounded-lg border border-line p-3 md:col-span-2">
            <legend className="text-sm font-medium">Biens et dettes du foyer retenus pour MA Zakat</legend>
            <p className="mb-2 text-xs text-ink-muted">Décochez ce qui appartient à un autre membre du foyer : la Zakat est due par chaque personne sur ses biens.</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {sources.map((s) => (
                <li key={s.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="included" value={s.id} defaultChecked={!excluded.has(s.id)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-700)]" />
                    <span>{s.label} <span className="text-ink-muted">· {s.detail}</span></span>
                  </label>
                  {/* Les biens décochés sont transmis comme exclus */}
                </li>
              ))}
            </ul>
            {sources.map((s) => <input key={s.id} type="hidden" name="all" value={s.id} />)}
          </fieldset>
        ) : null}
      </ActionForm>
    </Card>
  );
}

function Prices({ data, mine }: { data: Awaited<ReturnType<typeof getHouseholdData>>; mine: Awaited<ReturnType<typeof loadZakatPage>>['prices'] }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
  return (
    <Card className="mt-4">
      <CardTitle>Prix de l’or et de l’argent</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="prix-metaux">
        {(['gold', 'silver'] as const).map((m) => {
          const p = data.prices[m] as (typeof data.prices.gold & { source?: string; status?: keyof typeof PRICE_STATUS }) | null;
          const st = p?.status ?? 'missing';
          return (
            <div key={m} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium">{m === 'gold' ? 'Or' : 'Argent'} <Badge tone={PRICE_STATUS[st][0]}>{PRICE_STATUS[st][1]}</Badge></p>
              {p ? <p className="mt-1 text-ink-muted"><span className="tabular">{formatCents(p.pricePerGramCents)}</span> / g fin · {formatDate(p.asOf)} · source : {p.source ?? 'non précisée'}</p> : <p className="mt-1 text-ink-muted">Aucun prix saisi.</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-muted">Saisie manuelle : indiquez la source et la date. Un prix de plus de {ZAKAT_RULESET.maxPriceAgeDays} jours ne permet pas de conclure. Aucun service payant n’est interrogé.</p>
      <ActionForm action={addMetalPrice} submitLabel="Enregistrer le prix" testId="form-prix" className="mt-3 grid gap-3 sm:grid-cols-4">
        <SelectField label="Métal" name="symbol" defaultValue=""><option value="" disabled>Choisir…</option><option value="XAU">Or</option><option value="XAG">Argent</option></SelectField>
        <Field label="Prix par gramme de métal fin (€)" name="pricePerGram" inputMode="decimal" required />
        <Field label="Date du prix" name="asOf" type="date" max={today} defaultValue={today} required />
        <Field label="Source" name="source" maxLength={200} required />
      </ActionForm>
      {mine.length ? (
        <ul className="mt-3 divide-y divide-line text-sm">
          {mine.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{p.symbol === 'XAU' ? 'Or' : 'Argent'} · <span className="tabular">{formatCents(Number(p.price_per_g_cents))}</span> / g · {formatDate(p.as_of)} · {p.source}</span>
              <ActionForm action={deleteMetalPrice} variant="quiet" submitLabel="Supprimer"><input type="hidden" name="id" value={p.id} /></ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function Wealth({ page }: { page: Awaited<ReturnType<typeof loadZakatPage>> }) {
  return (
    <Card className="mt-4">
      <CardTitle>Patrimoine du foyer</CardTitle>
      <p className="mb-3 text-sm text-ink-muted">Les soldes des comptes sont repris automatiquement. Ajoutez ici les autres biens et les dettes (données du foyer, visibles dans Patrimoine).</p>
      <ul className="divide-y divide-line text-sm" data-testid="liste-biens">
        {page.assets.filter((a) => !(a.kind === 'bank_balance' && a.account_id)).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{a.name} · {ASSET_LABEL[a.kind] ?? a.kind} · {a.weight_mg !== null ? `${(Number(a.weight_mg) / 1000).toLocaleString('fr-BE')} g, titre ${a.purity_permille ?? 1000} ‰` : <span className="tabular">{formatCents(Number(a.value_cents))}</span>}</span>
            <ActionForm action={deleteAsset} variant="quiet" submitLabel="Supprimer"><input type="hidden" name="id" value={a.id} /></ActionForm>
          </li>
        ))}
        {page.liabilities.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{l.name} · {LIABILITY_LABEL[l.kind] ?? 'Dette'} · reste dû <span className="tabular">{formatCents(Number(l.outstanding_cents))}</span>, dont 12 mois <span className="tabular">{formatCents(Number(l.due_12m_cents))}</span></span>
            <ActionForm action={deleteLiability} variant="quiet" submitLabel="Supprimer"><input type="hidden" name="id" value={l.id} /></ActionForm>
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ActionForm action={addAsset} submitLabel="Ajouter le bien" testId="form-bien" className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Type de bien" name="kind" defaultValue=""><option value="" disabled>Choisir…</option>
            {Object.entries(ASSET_LABEL).filter(([k]) => k !== 'bank_balance').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
          <Field label="Nom" name="name" maxLength={120} required />
          <Field label="Valeur (€)" name="value" inputMode="decimal" hint="Or, argent, bijoux : indiquez plutôt le poids." />
          <Field label="Poids de métal (g)" name="weightGrams" inputMode="decimal" />
          <Field label="Titre (‰, 750 pour 18 carats)" name="purityPermille" inputMode="numeric" />
          <SelectField label="Métal des bijoux" name="metal" defaultValue=""><option value="">—</option><option value="gold">Or</option><option value="silver">Argent</option></SelectField>
          <SelectField label="Actions et fonds : détention" name="heldFor" defaultValue=""><option value="">—</option><option value="long_term">Long terme</option><option value="trading">Revente rapide</option></SelectField>
          <SelectField label="Épargne accessible aujourd’hui ?" name="accessible" defaultValue=""><option value="">—</option><option value="yes">Oui</option><option value="no">Non (bloquée)</option></SelectField>
          <SelectField label="Créance : remboursement probable ?" name="receivableLikely" defaultValue=""><option value="">Je ne sais pas</option><option value="yes">Oui</option><option value="no">Non</option></SelectField>
        </ActionForm>
        <ActionForm action={addLiability} submitLabel="Ajouter la dette" testId="form-dette" className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Type de dette" name="kind" defaultValue=""><option value="" disabled>Choisir…</option>
            {Object.entries(LIABILITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
          <Field label="Nom" name="name" maxLength={120} required />
          <Field label="Capital restant dû (€)" name="outstanding" inputMode="decimal" required />
          <Field label="Échéances des 12 prochains mois (€)" name="due12m" inputMode="decimal" required />
        </ActionForm>
      </div>
    </Card>
  );
}

function History({ entries }: { entries: HistoryEntry[] }) {
  return (
    <Card className="mt-4">
      <CardTitle>Historique de mes calculs</CardTitle>
      {entries.length === 0 ? <p className="text-sm text-ink-muted">Aucun calcul enregistré.</p> : (
        <ul className="divide-y divide-line" data-testid="historique-zakat">
          {entries.map((e) => (
            <li key={e.id} className="py-3 text-sm" data-testid="calcul-zakat">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">Calcul du {formatDate(e.asOf)} · <Badge tone={statusTone[e.status]}>{fr.zakat.status[e.status]}</Badge></p>
                <Badge tone={e.replay.reproducible === true ? 'positive' : e.replay.reproducible === false ? 'critical' : 'neutral'}>
                  {e.replay.reproducible === true ? 'Reproduit à l’identique' : e.replay.reproducible === false ? 'Résultat différent au recalcul' : 'Non vérifiable'}
                </Badge>
              </div>
              <p className="mt-1 text-ink-muted">
                Assiette nette {formatCents(e.netCents)} · nisab {e.nisabCents === null ? 'inconnu' : formatCents(e.nisabCents)} · dû {formatCents(e.dueCents)} · {e.versions}
              </p>
              {e.change ? <p className="text-ink-muted">Depuis le calcul du {formatDate(e.change.previousAsOf)} : assiette {e.change.netCents >= 0 ? '+' : '−'} {formatCents(Math.abs(e.change.netCents))}, dû {e.change.dueCents >= 0 ? '+' : '−'} {formatCents(Math.abs(e.change.dueCents))}</p> : null}
              {e.settlement && e.dueCents > 0 ? <p className="text-ink-muted">Payé {formatCents(e.settlement.paidCents)} (vérifié {formatCents(e.settlement.verifiedPaidCents)}) · reste <span className="font-medium text-ink">{formatCents(e.settlement.remainingCents)}</span> · <Link href="/dons" className="underline">déclarer un paiement</Link></p> : null}
              {e.replay.reproducible === false ? <p className="text-critical">Champs différents : {e.replay.differences.join(', ')}{e.replay.engineVersionMatches ? '' : ' (version du moteur différente)'}.</p> : null}
              {'reason' in e.replay ? <p className="text-ink-muted">{e.replay.reason}</p> : null}
              {e.result ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-primary-800">Détail et entrées de ce calcul</summary>
                  <ResultCard r={e.result} notApplicable={e.stored?.notApplicable} title="Détail enregistré">
                    {e.stored ? <p className="mt-3 text-xs text-ink-muted">Prix utilisés : or {e.stored.priceSources.gold ?? 'aucun'} ; argent {e.stored.priceSources.silver ?? 'aucun'}. Éléments exclus par vous : {e.stored.excludedSourceIds.length}.</p> : null}
                  </ResultCard>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function ZakatPage() {
  const t = fr.zakat;
  if (isDemoMode) {
    const s = await getSnapshot();
    return (
      <>
        <PageHeader title={t.title} subtitle="Démonstration : choix et biens fictifs" />
        <Ruleset />
        <Detail z={s.zakat} />
      </>
    );
  }
  const { enabled, ctx } = await religiousAccess();
  if (!enabled || !ctx) return (<><PageHeader title={t.title} /><ReligiousGate feature={t.title} next="/zakat" /></>);
  const [data, s, page] = await Promise.all([getHouseholdData(), getSnapshot(), loadZakatPage(ctx)]);
  const settlements = zakatSettlements(page.calculations.map((c) => ({ id: c.id, dueCents: Number(c.zakat_due_cents) })), page.payments.map(toContribution));
  const history = zakatHistory(page.calculations, ctx.userId, settlements);
  const sources = [
    ...data.assets.map((a) => ({ id: a.id, label: a.label, detail: ASSET_LABEL[a.kind] ?? a.kind })),
    ...data.liabilities.map((l) => ({ id: l.id, label: l.label, detail: 'dette' })),
  ];
  return (
    <>
      <PageHeader title={t.title} subtitle="Zakat patrimoniale. La Zakat al-Fitr est suivie séparément." />
      <Ruleset />
      <p className="mt-3 text-sm"><Link href="/zakat/al-fitr" className="text-primary-800 underline">Zakat al-Fitr</Link> · <Link href="/dons" className="text-primary-800 underline">Dons et paiements de Zakat</Link></p>
      <Detail z={s.zakat} />
      {s.zakat.result && ctx.canWrite ? (
        <ActionForm action={saveZakatCalculation} submitLabel="Enregistrer ce calcul" testId="form-enregistrer-calcul" className="mt-3" />
      ) : null}
      {ctx.canWrite ? <SettingsForm choices={data.zakat.choices} required={requiredZakatChoices(s.zakat.prepared.input?.assets ?? data.assets, s.zakat.prepared.input?.liabilities ?? data.liabilities)} sources={sources} /> : null}
      {ctx.canWrite ? <Prices data={data} mine={page.prices} /> : null}
      {ctx.canWrite ? <Wealth page={page} /> : null}
      <History entries={history} />
    </>
  );
}
