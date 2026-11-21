import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge, Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Checkbox, Field, RadioGroup } from '@/components/forms/fields';
import { formatDate } from '@/lib/format';
import { loadPlanning } from '@/lib/planning-data';
import { EVENT_SOURCE_LABEL } from '@/lib/suggestion-text';
import { addCalendarEvent, confirmReligiousDate, correctSchoolDate, removeCalendarEvent, resetSchoolDate } from '../../actions';

export const metadata: Metadata = { title: 'Calendrier financier familial' };

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/**
 * Calendrier des douze prochains mois : rentrée, vacances, dates religieuses (si activées),
 * dépenses annuelles détectées, échéances personnalisées et échéances des projets.
 * Une date n'est jamais une obligation financière.
 */
export default async function CalendarPage() {
  const { calendar, suggestions, planning, religiousEnabled } = await loadPlanning();
  const ownEvent = new Map(planning.events.map((e) => [`custom:${e.id}`, e.mine]));
  const byMonth = new Map<string, typeof calendar>();
  for (const e of calendar) byMonth.set(e.date.slice(0, 7), [...(byMonth.get(e.date.slice(0, 7)) ?? []), e]);
  const suggestionFor = (type: string, year: string) => suggestions.find((x) => x.status !== 'dismissed' && x.dueDate?.startsWith(year) &&
    ((type === 'school_start' && x.templateId === 'rentree-scolaire') || (type === 'summer_holidays' && x.templateId === 'vacances-familiales')
      || (type === 'ramadan' && x.templateId === 'ramadan') || (type === 'eid_al_fitr' && x.templateId === 'aid-al-fitr') || (type === 'eid_al_adha' && x.templateId === 'aid-al-adha')));

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Projets</Link></p>
      <PageHeader title="Calendrier financier familial" subtitle="Les dépenses importantes des douze prochains mois, pour les anticiper." />
      <Notice>Une date du calendrier n’est pas une obligation de dépense. Les dates scolaires et religieuses calculées sont indicatives : vérifiez-les ou confirmez-les.
        {' '}<Link href="/goals/preferences" className="underline">Calendrier scolaire et préférences</Link></Notice>

      {calendar.length === 0 ? <p className="mt-4 text-ink-muted">Aucun événement dans les douze prochains mois.</p> : (
        <ol className="mt-4 space-y-4" data-testid="calendrier">
          {[...byMonth.entries()].map(([month, events]) => (
            <li key={month}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent-600">{MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}</h2>
              <ul className="space-y-2">
                {events.map((e) => {
                  const sug = suggestionFor(e.type, e.date.slice(0, 4));
                  return (
                    <li key={e.id} className="rounded-xl border border-line bg-paper p-3" data-testid="evenement" data-type={e.type}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">{e.label}</p>
                        <p className="text-sm">{formatDate(e.date)} {e.indicative ? <Badge tone="warning">indicative</Badge> : null}</p>
                      </div>
                      <p className="text-xs text-ink-muted">
                        Source : {e.type === 'custom' && ownEvent.get(e.id) === false ? 'partagée par un membre du foyer' : EVENT_SOURCE_LABEL[e.source]}
                        {e.detail ? ` — ${e.detail}` : ''}
                        {e.type === 'custom' ? (
                          <span className="ml-2" data-testid="visibilite-evenement" data-visibility={e.visibility} data-religious={e.religious ? 'yes' : 'no'}>
                            <Badge tone={e.visibility === 'household' ? 'positive' : 'neutral'}>{e.religious ? 'religieux · privé' : e.visibility === 'household' ? 'partagé avec le foyer' : 'personnel'}</Badge>
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        {e.goalId ? <Link href={`/goals/${e.goalId}`} className="text-primary-800 underline">Voir le projet</Link> : null}
                        {sug && sug.status !== 'accepted' ? <Link href={sug.href} className="text-primary-800 underline" data-testid="preparer-depuis-calendrier">Préparer ce projet</Link> : null}
                        {e.type === 'custom' ? (
                          <ActionForm action={removeCalendarEvent} submitLabel="Retirer" variant="quiet" testId="retirer-evenement">
                            <input type="hidden" name="id" value={e.id.slice('custom:'.length)} />
                          </ActionForm>
                        ) : null}
                      </div>
                      {e.type === 'school_start' || e.type === 'summer_holidays' ? (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer text-primary-800">{e.source === 'confirmed_by_user' ? 'Modifier la correction' : 'Corriger la date'}</summary>
                          <ActionForm action={correctSchoolDate} submitLabel="Enregistrer la date" testId="corriger-date-scolaire" className="mt-2 grid gap-2 sm:grid-cols-3">
                            <input type="hidden" name="kind" value={e.type === 'school_start' ? 'start' : 'holidays'} />
                            <input type="hidden" name="year" value={e.date.slice(0, 4)} />
                            <Field label="Date exacte" name="date" type="date" defaultValue={e.date} required />
                            <Field label="Source" name="source" required hint="École, courrier, site officiel…" />
                          </ActionForm>
                          {e.source === 'confirmed_by_user' ? (
                            <ActionForm action={resetSchoolDate} submitLabel="Retirer ma correction" variant="quiet" testId="retirer-correction-scolaire" className="mt-2">
                              <input type="hidden" name="kind" value={e.type === 'school_start' ? 'start' : 'holidays'} />
                              <input type="hidden" name="year" value={e.date.slice(0, 4)} />
                            </ActionForm>
                          ) : null}
                        </details>
                      ) : null}
                      {religiousEnabled && e.indicative && (e.type === 'ramadan' || e.type === 'eid_al_fitr') ? (
                        <details className="mt-2 text-sm">
                          <summary className="cursor-pointer text-primary-800">Confirmer la date</summary>
                          <ActionForm action={confirmReligiousDate} submitLabel="Confirmer" testId="confirmer-date-religieuse" className="mt-2 grid gap-2 sm:grid-cols-3">
                            <input type="hidden" name="type" value={e.type} />
                            <input type="hidden" name="year" value={e.date.slice(0, 4)} />
                            <Field label="Date retenue" name="date" type="date" defaultValue={e.date} required />
                            <Field label="Source" name="source" required hint="Mosquée, autorité suivie…" />
                          </ActionForm>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      <Card className="mt-6">
        <CardTitle>Ajouter une échéance</CardTitle>
        <p className="-mt-1 mb-3 text-sm text-ink-muted">Assurance, taxe, abonnement annuel, anniversaire… Elle apparaît dans le calendrier, sans créer de dépense ni de projet.</p>
        <ActionForm action={addCalendarEvent} submitLabel="Ajouter au calendrier" testId="form-evenement" className="grid gap-3 sm:grid-cols-3">
          <Field label="Libellé" name="label" required maxLength={80} />
          <Field label="Date" name="date" type="date" required />
          <div className="self-end"><Checkbox name="yearly" label="Revient chaque année" /></div>
          <div className="sm:col-span-3">
            <RadioGroup name="visibility" legend="Qui peut voir cette échéance ?" defaultValue="private" options={[
              { value: 'private', label: 'Moi seulement (personnel)' },
              { value: 'household', label: 'Tout mon foyer (partage volontaire)' },
            ]} />
          </div>
          {religiousEnabled ? (
            <div className="sm:col-span-3">
              <Checkbox name="religious" label={<>Événement religieux <span className="text-ink-muted">— reste toujours privé et sera supprimé si vous retirez votre consentement</span></>} />
            </div>
          ) : null}
        </ActionForm>
        <p className="mt-2 text-xs text-ink-muted">Le caractère religieux d’un événement n’est jamais déduit de son libellé : seule la case ci-dessus le classe comme tel.</p>
        {planning.events.length > 0 ? <p className="mt-2 text-xs text-ink-muted">{planning.events.length} échéance(s) personnalisée(s).</p> : null}
      </Card>
    </>
  );
}
