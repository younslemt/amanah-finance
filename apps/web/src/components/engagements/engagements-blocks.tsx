import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatCents, formatDate } from '@/lib/format';
import type { EngagementsActions, EngagementsView } from '@/lib/engagements-view';
import { MethodBadge } from '@/components/home/method-badge';
import { ZakatStatusList } from '@/components/home/zakat-status-list';

const card = 'rounded-2xl border border-line bg-paper p-4 md:p-5';
const primary = 'inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800';
const quiet = 'inline-flex min-h-11 items-center text-sm font-semibold text-primary-800 underline underline-offset-4';

function Section({ id, title, badge, children, testId }: { id: string; title: string; badge?: ReactNode; children: ReactNode; testId: string }) {
  return (
    <section aria-labelledby={`titre-${id}`} id={id} className={`${card} min-w-0 scroll-mt-6`} data-testid={testId}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`titre-${id}`} className="text-xl text-primary-900">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Row({ label, hint, value, testId }: { label: string; hint?: string; value: string; testId?: string }) {
  return (
    <div className="flex justify-between gap-3 py-2" data-testid={testId}>
      <dt className="min-w-0">
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-xs text-ink-muted">{hint}</span> : null}
      </dt>
      <dd className="tabular whitespace-nowrap font-semibold">{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zakat
// ---------------------------------------------------------------------------
/** Actions : `engagementsActions` (démonstration, écriture, lecture seule). */
export function ZakatEngagement({ z, actions }: { z: EngagementsView['zakat']; actions: EngagementsActions }) {
  return (
    <Section id="zakat" title="Zakat" badge={<MethodBadge methodId="M-01, M-02" />} testId="engagement-zakat">
      <dl className="mb-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2" data-basis={z.basis} data-testid="zakat-dernier-calcul">
        <div>
          <dt className="text-xs text-ink-muted">Dernier calcul</dt>
          <dd className="font-medium">{z.calculationAsOf ? `Enregistré le ${formatDate(z.calculationAsOf)}` : 'Aucun calcul enregistré : estimation courante'}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Statut du calcul</dt>
          <dd className="font-medium" data-testid="zakat-statut" data-complete={z.view.complete ? 'yes' : 'no'}>{z.statusLabel}</dd>
        </div>
      </dl>
      <ZakatStatusList view={z.view} lines={z.lines} title={null} />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href={actions.zakat.href} className={primary} data-testid="lien-calcul-zakat">{actions.zakat.label}</Link>
        {actions.zakatHistory ? (
          <Link href="/zakat#historique" className={quiet} data-testid="lien-historique-zakat">
            Historique des calculs{z.historyCount > 0 ? ` (${z.historyCount})` : ''}
          </Link>
        ) : null}
        {actions.recordContribution ? <Link href="/dons" className={quiet} data-testid="lien-contribution-zakat">Enregistrer une contribution</Link> : null}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Purification
// ---------------------------------------------------------------------------
export function PurificationEngagement({ p, actions }: { p: EngagementsView['purification']; actions: EngagementsActions }) {
  const ops = p.detected.count === 0 ? 'Aucune opération en attente' : p.detected.count === 1 ? '1 opération en attente de votre décision' : `${p.detected.count} opérations en attente de votre décision`;
  return (
    <Section id="purification" title="Purification" badge={<MethodBadge methodId="M-03" />} testId="engagement-purification">
      <p className="mb-2 text-sm text-ink-muted">Méthode non encore validée par une autorité qualifiée : montants indicatifs, à confirmer par vous.</p>
      <dl className="divide-y divide-mist text-sm">
        <Row label="Opérations détectées" hint={ops} value={formatCents(p.detected.creditedCents)} testId="purification-detectees" />
        <Row label="Montants nécessitant un examen"
          hint={p.toDetermineCount > 0 ? `Dont ${p.toDetermineCount} confirmée(s) dont la base de calcul reste à choisir` : 'Montants nets crédités, avant votre décision'}
          value={formatCents(p.toReviewCents)} testId="purification-a-examiner" />
        <Row label="Décisions déjà enregistrées"
          hint={p.decisions === null ? 'Non enregistrables en démonstration'
            : `${p.decisions.confirmed} confirmée(s) · ${p.decisions.rejected} écartée(s) · ${p.decisions.purified} purifiée(s)`}
          value={p.decisions === null ? '—' : String(p.decisions.total)} testId="purification-decisions" />
        <Row label="Montant à purifier selon vos choix" hint="Montants confirmés, pas encore donnés"
          value={p.toPurifyCents === null ? '—' : formatCents(p.toPurifyCents)} testId="purification-a-purifier" />
        {p.purifiedCents !== null && p.purifiedCents > 0 ? <Row label="Déjà purifié" value={formatCents(p.purifiedCents)} /> : null}
      </dl>
      <p className="mt-1 text-xs text-ink-muted" data-testid="purification-perimetre" data-shared={p.sharedByOthersCount}>
        Vos éléments uniquement.{p.sharedByOthersCount > 0
          ? ` ${p.sharedByOthersCount === 1 ? '1 élément partagé' : `${p.sharedByOthersCount} éléments partagés`} par un membre du foyer : consultable(s) dans le détail, non compté(s) ici.`
          : ''}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Link href={actions.purification.href} className={primary} data-testid="lien-purification">{actions.purification.label}</Link>
        {actions.recordContribution ? <Link href="/dons" className={quiet} data-testid="lien-contribution-purification">Enregistrer ensuite votre don</Link> : null}
      </div>
      <p className="mt-3 text-xs text-ink-muted" data-testid="purification-pas-un-transfert">
        Confirmer un montant enregistre votre choix : ce n’est pas un transfert. Le don se fait en dehors de l’application, puis s’enregistre dans « Dons ». Amanah Finance n’effectue aucun paiement.
      </p>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Solidarité
// ---------------------------------------------------------------------------
export function SolidarityEngagement({ s, actions }: { s: EngagementsView['solidarity']; actions: EngagementsActions }) {
  return (
    <Section id="solidarite" title="Solidarité" testId="engagement-solidarite">
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-primary-50 p-3" data-testid="solidarite-total" data-count={s.count}>
        <span className="text-sm font-semibold text-primary-700">Contributions enregistrées en {s.year}</span>
        <span className="tabular text-2xl font-semibold text-primary-900">{formatCents(s.totalCents)}</span>
      </div>
      <dl className="mt-2 divide-y divide-mist text-sm" data-testid="solidarite-types">
        {s.lines.map((l) => (
          <div key={l.key} className="flex justify-between gap-3 py-2" data-testid="solidarite-type" data-key={l.key}>
            <dt>
              {l.key === 'zakat_al_fitr' ? <Link href="/zakat/al-fitr" className="underline-offset-4 hover:underline">{l.label}</Link> : l.label}
              <span className="ml-1 text-xs text-ink-muted">{l.count === 0 ? '' : `(${l.count})`}</span>
            </dt>
            <dd className="tabular whitespace-nowrap font-semibold">{formatCents(l.cents)}</dd>
          </div>
        ))}
      </dl>
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-mist pt-3 text-xs" data-testid="solidarite-statuts">
        <div><dt className="text-ink-muted">Déclarées seulement</dt><dd className="tabular font-semibold">{formatCents(s.declaredCents)}</dd></div>
        <div><dt className="text-ink-muted">Rapprochées d’une opération</dt><dd className="tabular font-semibold">{formatCents(s.bankMatchedCents)}</dd></div>
        <div><dt className="text-ink-muted">Confirmées</dt><dd className="tabular font-semibold">{formatCents(s.confirmedCents)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-ink-muted">Chaque contribution n’est comptée qu’une fois, dans un seul type. Un rapprochement est un indice de paiement, pas une confirmation de réception ; aucune source de confirmation n’est activée aujourd’hui.</p>
      {s.latest ? (
        <p className="mt-2 text-sm" data-testid="dernier-don">Dernière contribution : {s.latest.kindLabel}, {formatCents(s.latest.amountCents)} le {formatDate(s.latest.paidOn)}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {actions.recordContribution ? <Link href="/dons" className={primary} data-testid="lien-enregistrer-don">Enregistrer un don</Link> : null}
        <Link href="/dons" className={quiet}>Historique des dons</Link>
      </div>
    </Section>
  );
}
