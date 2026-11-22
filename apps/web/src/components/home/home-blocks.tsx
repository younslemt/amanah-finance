import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CalendarEvent, Suggestion } from '@amanah/engines';
import { formatCents, formatDate, formatMonth } from '@/lib/format';
import type { HomeBlockVariant } from '@/lib/presentation';
import type { HomeView } from '@/lib/home-view';
import { suggestionExplanation } from '@/lib/suggestion-text';
import { fr } from '@/messages/fr';
import { actionHref } from '@/components/finance/journey';
import { SectionHeader } from './section-header';
import { MethodBadge } from './method-badge';
import { IslamicFinanceIntro } from './consent-gate';
import { HomeActionList } from './home-action-list';

/**
 * Blocs de l'accueil Islamic-first (lot 2). Composants serveur sans calcul : ils affichent le
 * modèle de vue construit par `buildHomeView` (moteurs existants). Aucun montant en dur.
 */

const card = 'rounded-2xl border border-line bg-paper';

export function HomeSection({ id, title, href, linkLabel, wide = false, children }: { id: string; title: string; href?: string; linkLabel?: string; wide?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={`titre-${id}`} className={`min-w-0 ${wide ? 'lg:col-span-2' : ''}`} data-testid="bloc-accueil" data-block={id}>
      <SectionHeader id={`titre-${id}`} title={title} href={href} linkLabel={linkLabel} />
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 1. Mon Amanah
// ---------------------------------------------------------------------------
export function AmanahHero({ v, synthesis, analytic, categoryName, chart }: {
  v: HomeView; synthesis: string | null; analytic: boolean; categoryName: (slug: string) => string; chart?: ReactNode;
}) {
  const s = v.situation;
  const month = formatMonth(s.month);
  const cap = s.capacity;
  return (
    <section aria-labelledby="titre-situation" className="pattern-khatam -mx-4 bg-primary-900 px-5 py-6 text-ivory sm:mx-0 sm:rounded-2xl md:px-7 lg:col-span-2" data-testid="ma-situation" data-block="situation">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id="titre-situation" className="text-xl font-semibold text-ivory">Mon Amanah</h2>
        <span className="text-xs text-primary-100">Ma situation financière</span>
        {analytic ? <span className="rounded-full border border-accent-500/70 px-2 py-0.5 text-xs text-accent-100" data-testid="badge-analytique">Affichage analytique</span> : null}
      </div>
      <p className="mt-4 text-sm text-primary-100">{fr.dashboard.netWorth}{s.wealthPartial ? ` · ${fr.dashboard.partialWealth}` : ''}</p>
      <p className="tabular font-display text-4xl font-semibold" data-testid="patrimoine-net">{formatCents(s.netWorthCents, { round: true })}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-accent-500/50 pt-4">
        <div><dt className="text-xs text-primary-100">{fr.dashboard.balance}</dt><dd className="tabular mt-0.5 font-semibold sm:text-lg">{formatCents(s.balanceCents)}</dd></div>
        <div><dt className="text-xs text-primary-100">{fr.dashboard.income} · <span className="whitespace-nowrap">{month}</span></dt><dd className="tabular mt-0.5 font-semibold sm:text-lg">{formatCents(s.incomeCents, { round: true })}</dd></div>
        <div><dt className="text-xs text-primary-100">{fr.dashboard.expenses} · <span className="whitespace-nowrap">{month}</span></dt><dd className="tabular mt-0.5 font-semibold sm:text-lg">{formatCents(s.expenseCents, { round: true })}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border-l-2 border-accent-500 bg-ivory/10 px-3 py-2" data-testid="capacite-disponible" data-source={cap.source}>
        <span className="text-xs text-primary-100">Capacité d’épargne encore disponible · plan d’épargne{cap.source === 'estimated' ? ' (estimée)' : ''}</span>
        {cap.availableCents === null
          ? <Link href="/budget/plan-epargne" className="text-sm font-semibold text-ivory underline underline-offset-4">Indiquer ma capacité</Link>
          : <span className="tabular text-sm font-semibold">{formatCents(cap.availableCents, { round: true })} / mois</span>}
      </div>
      {synthesis ? <p className="mt-3 text-sm text-primary-100" data-testid="synthese">{synthesis}</p> : null}
      {analytic ? (
        <div className="mt-4 rounded-xl bg-paper p-4 text-ink" data-testid="budget-du-mois">
          <p className="mb-2 text-sm font-semibold text-primary-900">Mon budget de {month}{s.savingsRatePermille !== null ? ` · taux d’épargne ${Math.round(s.savingsRatePermille / 10)} %` : ''}</p>
          {s.budgetLines.length === 0 ? <p className="text-sm text-ink-muted">Aucun plafond de dépenses défini.</p> : (
            <ul className="space-y-2.5 text-sm">
              {s.budgetLines.map((l) => {
                const pct = Math.min(100, Math.round((l.spentCents * 100) / Math.max(1, l.limitCents)));
                return (
                  <li key={l.categorySlug}>
                    <div className="flex justify-between gap-2"><span>{categoryName(l.categorySlug)}{l.status === 'over' ? <span className="ml-1 text-xs font-semibold text-critical">dépassé</span> : null}</span><span className="tabular">{formatCents(l.spentCents, { round: true })} / {formatCents(l.limitCents, { round: true })}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-mist" aria-hidden="true"><div className={`h-1.5 rounded-full ${l.status === 'over' ? 'bg-critical' : 'bg-primary-700'}`} style={{ width: `${pct}%` }} /></div>
                  </li>
                );
              })}
            </ul>
          )}
          {chart ? <div className="mt-4">{chart}</div> : null}
        </div>
      ) : null}
      <Link href="/budget" className="mt-4 inline-block text-sm text-ivory underline underline-offset-4">Mon budget du mois →</Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. Mes engagements / Finance islamique
// ---------------------------------------------------------------------------
export function CommitmentsBlock({ v, variant }: { v: HomeView; variant: HomeBlockVariant }) {
  if (variant === 'pedagogic' || !v.commitments) return <IslamicFinanceIntro />;
  const { zakat, purification, solidarity } = v.commitments;
  const z = zakat.view;
  const line = (k: string) => z.lines.find((l) => l.kind === k)!;
  const remaining = z.remainingCents === null ? null : formatCents(z.remainingCents);
  if (variant === 'compact') {
    return (
      <ul className={`${card} divide-y divide-mist px-4 text-sm`} data-testid="dashboard-finance-islamique" data-variant="compact">
        <li className="flex justify-between gap-3 py-3" data-testid="zakat-reste" data-complete={z.complete ? 'yes' : 'no'}><Link href="/zakat" className="underline-offset-4 hover:underline">Zakat · restant selon vos déclarations</Link><span className="tabular font-semibold">{remaining ?? 'à compléter'}</span></li>
        <li className="flex justify-between gap-3 py-3"><Link href="/purification" className="underline-offset-4 hover:underline">Purification · à examiner</Link><span className="tabular font-semibold">{formatCents(purification.pendingCents)}</span></li>
        <li className="flex justify-between gap-3 py-3"><Link href="/dons" className="underline-offset-4 hover:underline">Solidarité · dons {solidarity.year}</Link><span className="tabular font-semibold">{formatCents(solidarity.totalCents)}</span></li>
      </ul>
    );
  }
  return (
    <div className="space-y-3" data-testid="dashboard-finance-islamique" data-variant="full">
      <article className={`${card} p-4`} data-testid="zakat-accueil" data-basis={zakat.basis}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-sans text-base font-semibold">Zakat</h3>
          <MethodBadge methodId="M-01, M-02" />
        </div>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" data-testid="zakat-reste" data-complete={z.complete ? 'yes' : 'no'}>
          <span className="text-sm text-ink-muted">{z.remainingLabel}</span>
          {remaining === null
            ? <span className="text-sm text-ink-muted">Non déterminé tant que le calcul est incomplet</span>
            : <span className="tabular font-display text-2xl font-semibold text-primary-900">{remaining}</span>}
        </div>
        <dl className="mt-2 space-y-1.5 border-t border-mist pt-2 text-xs">
          <div className="flex justify-between gap-3" data-testid="zakat-ligne" data-kind="estimated">
            <dt className="text-ink-muted">Montant estimé{zakat.calculationAsOf ? ` (calcul du ${formatDate(zakat.calculationAsOf)})` : ' (calcul non enregistré)'}{!z.complete ? ` — ${line('estimated').hint.toLowerCase()}` : ''}</dt>
            <dd className="tabular whitespace-nowrap font-semibold">{line('estimated').cents === null ? 'à compléter' : formatCents(line('estimated').cents!)}</dd>
          </div>
          <div className="flex justify-between gap-3" data-testid="zakat-ligne" data-kind="declared">
            <dt className="text-ink-muted">Contributions déclarées{line('bank_matched').cents ? ` (dont ${formatCents(line('bank_matched').cents!)} rapprochées)` : ''}</dt>
            <dd className="tabular whitespace-nowrap font-semibold">{line('declared').cents ? `− ${formatCents(line('declared').cents!)}` : formatCents(0)}</dd>
          </div>
        </dl>
        <Link href="/zakat" className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800">Accéder au calcul</Link>
      </article>
      <div className="grid grid-cols-2 gap-3">
        <article className={`${card} p-4`} data-testid="purification-accueil">
          <h3 className="font-sans text-sm font-semibold">Purification</h3>
          <p className="tabular mt-1 text-xl font-semibold">{formatCents(purification.pendingCents)}</p>
          <p className="text-xs text-ink-muted">{purification.pendingCount === 0 ? 'Aucun intérêt à examiner' : purification.pendingCount === 1 ? '1 intérêt à examiner' : `${purification.pendingCount} intérêts à examiner`}</p>
          <div className="mt-2"><MethodBadge methodId="M-03" /></div>
          <Link href="/purification" className="mt-2 inline-block text-xs font-semibold text-primary-800 underline underline-offset-4">Examiner</Link>
        </article>
        <article className={`${card} p-4`} data-testid="solidarite-accueil">
          <h3 className="font-sans text-sm font-semibold">Solidarité</h3>
          <p className="tabular mt-1 text-xl font-semibold">{formatCents(solidarity.totalCents)}</p>
          <p className="text-xs text-ink-muted">{solidarity.count === 0 ? `Aucun don enregistré en ${solidarity.year}` : `Dons enregistrés en ${solidarity.year}`}</p>
          <Link href="/dons" className="mt-2 inline-block text-xs font-semibold text-primary-800 underline underline-offset-4">Enregistrer un don</Link>
        </article>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Mes projets de vie
// ---------------------------------------------------------------------------
export function ProjectsBlock({ v }: { v: HomeView }) {
  const { items, activeCount } = v.projects;
  return (
    <div className="space-y-3">
      <div className={`${card} px-4`} data-testid="projets-tableau-de-bord" data-total={activeCount}>
        {items.length === 0 ? <p className="py-4 text-sm text-ink-muted">Aucun projet en cours.</p> : (
          <ul className="divide-y divide-mist">
            {items.map((p) => (
              <li key={p.id} className="py-3" data-testid="projet-accueil">
                <div className="flex justify-between gap-3">
                  <Link href={`/goals/${p.id}`} className="min-w-0 break-words font-semibold underline-offset-4 hover:underline">{p.name}</Link>
                  <span className="tabular shrink-0 font-semibold">{p.progressPercent} %</span>
                </div>
                <div role="progressbar" aria-label={`Progression : ${p.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, p.progressPercent)} className="mt-1.5 h-1.5 rounded-full bg-mist">
                  <div className="h-1.5 rounded-full bg-primary-700" style={{ width: `${Math.min(100, p.progressPercent)}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="tabular">{formatCents(p.savedCents, { round: true })} / {formatCents(p.targetCents, { round: true })} · {formatDate(p.targetDate)}{p.paused ? ' · en pause' : ''}</span>
                  {p.next ? (
                    <Link href={actionHref(p.id, p.next.action, p.next.step)} className="font-semibold text-primary-800 underline underline-offset-4" data-testid="prochaine-etape-projet" data-action={p.next.action}>
                      {fr.goals.action[p.next.action]}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href="/goals" className="font-medium text-primary-800 underline-offset-4 hover:underline" data-testid="tous-les-projets">Tous les projets ({activeCount})</Link>
        <Link href="/goals/nouveau" className="font-medium text-primary-800 underline-offset-4 hover:underline" data-testid="tableau-ajouter-objectif">＋ Ajouter un projet</Link>
      </p>
      {v.suggestions.length > 0 ? <SuggestionList suggestions={v.suggestions} /> : null}
    </div>
  );
}

function SuggestionList({ suggestions }: { suggestions: readonly Suggestion[] }) {
  return (
    <div className="rounded-2xl bg-primary-50 px-4" data-testid="suggestions-accueil">
      <h3 className="pt-3 font-sans text-xs font-semibold text-primary-700">Suggestions</h3>
      <ul className="divide-y divide-primary-100">
        {suggestions.map((x) => (
          <li key={x.id} className="py-3" data-testid="suggestion-accueil">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <span className="font-semibold">{x.title}</span>
              <Link href={x.href} className="text-sm font-semibold text-primary-800 underline underline-offset-4">Préparer ce projet</Link>
            </div>
            <p className="mt-0.5 text-xs text-ink-muted">{suggestionExplanation(x)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Mon calendrier Amanah
// ---------------------------------------------------------------------------
/** Nature de l'échéance, sans jamais présenter une estimation comme confirmée. */
function eventNote(e: CalendarEvent): string {
  if (e.indicative) return 'indicative';
  if (e.source === 'goal') return 'échéance de projet';
  if (e.source === 'user') return e.visibility === 'household' ? 'partagée avec le foyer' : 'personnelle';
  if (e.source === 'confirmed_by_user') return 'confirmée par vous';
  if (e.source === 'official_calendar') return 'calendrier officiel';
  if (e.source === 'detected') return 'dépense annuelle détectée';
  return '';
}

export function CalendarBlock({ events }: { events: readonly CalendarEvent[] }) {
  if (events.length === 0) return <p className="text-sm text-ink-muted">Aucune échéance à venir.</p>;
  return (
    <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4 lg:grid-cols-2" data-testid="calendrier-accueil">
      {events.map((e) => (
        <li key={e.id} className={`${card} p-3`} data-testid="echeance-accueil" data-type={e.type}>
          <p className="text-xs font-semibold text-accent-600">{formatDate(e.date)}</p>
          <p className="mt-0.5 break-words text-sm font-semibold">{e.label}</p>
          <p className="text-xs text-ink-muted">{eventNote(e)}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 5. Mon patrimoine et mes valeurs
// ---------------------------------------------------------------------------
const GROUP_COLOR = { liquid: 'bg-primary-700', investments: 'bg-primary-600', metals: 'bg-accent-500', real_estate: 'bg-primary-100', other: 'bg-mist' } as const;

export function WealthBlock({ v }: { v: HomeView }) {
  const w = v.wealth;
  return (
    <div className={`${card} space-y-3 p-4`} data-testid="patrimoine-accueil">
      {w.groups.length === 0 ? <p className="text-sm text-ink-muted">Aucun actif renseigné.</p> : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden="true">
            {w.groups.map((g) => <div key={g.key} className={GROUP_COLOR[g.key]} style={{ width: `${g.permille / 10}%` }} />)}
          </div>
          <ul className="grid grid-cols-1 gap-1.5 text-xs min-[420px]:grid-cols-2">
            {w.groups.map((g) => (
              <li key={g.key} className="flex items-center gap-2" data-testid="groupe-patrimoine" data-group={g.key}>
                <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${GROUP_COLOR[g.key]}`} />
                <span className="whitespace-nowrap">{g.label} <span className="tabular font-semibold">{Math.round(g.permille / 10)} %</span></span>
              </li>
            ))}
          </ul>
          {w.partial ? <p className="text-xs text-ink-muted">Certains actifs n’ont pas encore de valeur établie.</p> : null}
        </>
      )}
      {w.toReview.length > 0 || w.investmentsWithoutScreening ? (
        <div className="border-t border-mist pt-3" data-testid="a-examiner">
          <p className="text-xs font-semibold text-accent-600">À examiner</p>
          <ul className="mt-1 space-y-1 text-sm">
            {w.toReview.map((r) => (
              <li key={r.label} className="flex justify-between gap-3"><span>{r.label}</span><Link href={r.href} className="shrink-0 font-semibold text-primary-800 underline underline-offset-4">Examiner</Link></li>
            ))}
            {w.investmentsWithoutScreening ? <li className="text-xs text-ink-muted">Placements : analyse de conformité non disponible (chantier dédié à venir).</li> : null}
          </ul>
        </div>
      ) : null}
      {w.reserve ? <p className="text-xs text-ink-muted" data-testid="reserve-accueil">Réserve d’urgence : {String(w.reserve.monthsCovered).replace('.', ',')} mois couverts sur {w.reserve.months}</p> : null}
      <Link href="/wealth" className="inline-block text-sm font-semibold text-primary-800 underline underline-offset-4">Voir mon patrimoine</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Mes prochaines actions
// ---------------------------------------------------------------------------
export function NextActionsBlock({ v }: { v: HomeView }) {
  return <HomeActionList actions={v.actions} empty="Rien d’urgent : continuez ainsi." />;
}
