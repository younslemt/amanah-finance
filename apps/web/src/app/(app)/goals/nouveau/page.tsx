import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { CategoryPicker } from '@/components/forms/category-picker';
import { FormStep } from '@/components/ui/form-step';
import { ReligiousGate } from '@/components/religious-gate';
import { isDemoMode } from '@/lib/env';
import { formatCents, formatDate } from '@/lib/format';
import { centsToInput } from '@/lib/eid-view';
import { loadPlanning } from '@/lib/planning-data';
import { FREQUENCY_LABEL, GROUP_LABEL } from '@/lib/suggestion-text';
import {
  addMonths, annualRenewalCheck, capacityForGoal, GENERAL_GOAL_KINDS, GOAL_TEMPLATES, isReligiousTemplate, RELIGIOUS_GOAL_KINDS,
  SUGGESTION_GROUPS, templateById, templateDueDate, type GoalTemplate,
} from '@amanah/engines';
import { createGoal } from '../../actions';

export const metadata: Metadata = { title: 'Ajouter un objectif' };

/** Idées de dénomination pour un projet personnel (le nom reste libre). */
const PERSONAL_IDEAS = ['Voyage', 'Mariage', 'Véhicule', 'Création d’entreprise', 'Autre projet'];
type Query = { categorie?: string; modele?: string; annee?: string; suite?: string; mode?: string };

function ModeSwitch({ current }: { current: 'modele' | 'libre' }) {
  const cls = (on: boolean) => `flex-1 rounded-xl border p-4 text-left ${on ? 'border-primary-700 bg-primary-50' : 'border-line bg-paper hover:border-primary-700'}`;
  return (
    <nav aria-label="Mode de création" className="mb-4 flex flex-col gap-2 sm:flex-row" data-testid="modes-creation">
      <Link href="/goals/nouveau?mode=modele" className={cls(current === 'modele')} aria-current={current === 'modele' ? 'page' : undefined} data-testid="mode-modele">
        <span className="block font-semibold text-primary-900">A. Choisir un projet suggéré</span>
        <span className="block text-sm text-ink-muted">Un modèle préparé : nom, catégorie et date indicative préremplis, montants à vous.</span>
      </Link>
      <Link href="/goals/nouveau" className={cls(current === 'libre')} aria-current={current === 'libre' ? 'page' : undefined} data-testid="mode-libre">
        <span className="block font-semibold text-primary-900">B. Créer un projet personnalisé</span>
        <span className="block text-sm text-ink-muted">Vous définissez librement votre objectif, sans modèle.</span>
      </Link>
    </nav>
  );
}

export default async function NewGoalPage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const { s, data, calendar, religiousEnabled: religious } = await loadPlanning();
  const cap = capacityForGoal(s.savingsPlan, '__nouveau__');
  const kinds = [...(religious ? RELIGIOUS_GOAL_KINDS.filter((k) => k !== 'eid_al_adha') : []), ...GENERAL_GOAL_KINDS];

  // A. Catalogue des modèles (les modèles religieux n'apparaissent qu'avec les fonctions religieuses activées)
  if (q.mode === 'modele') {
    const visible = GOAL_TEMPLATES.filter((t) => !isReligiousTemplate(t) || religious);
    return (
      <>
        <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
        <PageHeader title="Ajouter un objectif" subtitle="Partez d’un modèle ou créez librement : la suite du parcours est la même." />
        <ModeSwitch current="modele" />
        <Notice className="mb-4">Les modèles sont des idées de projets, pas des produits financiers ni des conseils d’investissement. Aucun montant n’est proposé : vous fixez votre budget.</Notice>
        {SUGGESTION_GROUPS.map((g) => {
          const list = visible.filter((t) => t.group === g);
          if (list.length === 0) return null;
          return (
            <section key={g} className="mb-6" aria-labelledby={`groupe-${g}`}>
              <h2 id={`groupe-${g}`} className="mb-2 text-lg font-semibold text-primary-900">{GROUP_LABEL[g]}</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="catalogue-modeles">
                {list.map((t) => (
                  <li key={t.id}>
                    {t.available ? (
                      <Link href={t.kind === 'eid_flow' ? '/goals/aid' : `/goals/nouveau?modele=${t.id}`} data-testid="modele" data-modele={t.id}
                        className="block h-full rounded-xl border border-line bg-paper p-3 hover:border-primary-700">
                        <span className="block font-semibold text-primary-900">{t.title}</span>
                        <span className="block text-xs text-ink-muted">{FREQUENCY_LABEL(t)} · {t.spendingCategories.slice(0, 3).join(', ')}</span>
                      </Link>
                    ) : (
                      <div className="h-full rounded-xl border border-dashed border-line p-3 text-ink-muted" data-testid="modele-a-venir" data-modele={t.id}>
                        <span className="block font-semibold">{t.title}</span>
                        <span className="block text-xs">Chantier distinct, à venir.</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {!isDemoMode && !religious ? <div data-testid="projets-religieux-fermes"><ReligiousGate feature="Projets Hajj, Omra, Aïd, Ramadan" next="/goals" /></div> : null}
      </>
    );
  }

  // Préremplissage : modèle (suggestion acceptée) ou reconduction d'un projet annuel
  const previous = q.suite ? data.goals.find((g) => g.id === q.suite) : undefined;
  const renewal = previous ? annualRenewalCheck(previous, data.goals) : null;
  const template: GoalTemplate | undefined = renewal?.allowed ? renewal.template : q.modele ? templateById(q.modele) : undefined;
  const usable = template && template.available && template.kind !== 'eid_flow' && (!isReligiousTemplate(template) || religious) ? template : undefined;
  const occurrence = renewal?.allowed ? renewal.occurrence : usable?.recurrence === 'yearly' ? (Number(q.annee) || Number(s.asOf.slice(0, 4))) : null;
  const due = usable ? templateDueDate(usable, occurrence, calendar) : null;
  const defaultDate = due && due > s.asOf ? due
    : previous && renewal?.allowed ? addMonths(previous.targetDate, 12) : addMonths(s.asOf, 24);
  const defaultName = usable ? (occurrence ? `${usable.title} ${occurrence}` : usable.title) : undefined;
  const defaultKind = usable?.kind !== 'eid_flow' ? usable?.kind ?? q.categorie : q.categorie;

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
      <PageHeader title="Ajouter un objectif" subtitle="Trois étapes courtes. Vous pourrez ensuite planifier, simuler et suivre depuis la fiche du projet." />
      <ModeSwitch current={usable ? 'modele' : 'libre'} />
      {q.suite && !renewal?.allowed ? <Notice tone="warning" className="mb-4">Ce projet ne peut pas être reconduit : il doit être annuel, réalisé, et pas déjà reconduit.</Notice> : null}
      {q.modele && !usable ? <Notice tone="warning" className="mb-4">Modèle indisponible : vous pouvez créer votre projet librement.</Notice> : null}
      {usable ? (
        <Card className="mb-4" >
          <div data-testid="modele-choisi" data-modele={usable.id}>
            <p className="text-xs uppercase tracking-wide text-accent-600">{renewal?.allowed ? 'Reconduction de l’année précédente' : 'Projet suggéré'} · {GROUP_LABEL[usable.group]}</p>
            <h2 className="text-lg text-primary-900">{defaultName}</h2>
            <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-ink-muted">Catégories de dépenses possibles</dt><dd>{usable.spendingCategories.join(', ')}</dd></div>
              <div><dt className="text-ink-muted">Fréquence</dt><dd>{FREQUENCY_LABEL(usable)}</dd></div>
              <div><dt className="text-ink-muted">Date</dt><dd>{due ? `${formatDate(due)} (indicative)` : 'À choisir'}</dd></div>
            </dl>
            <p className="mt-2 text-sm text-ink-muted" data-testid="reference-budget">
              {renewal?.allowed && previous
                ? `Budget de l’année précédente, proposé comme référence : ${formatCents(previous.targetCents)}. Modifiez-le librement ; rien n’est repris de l’épargne ou des dépenses de l’an dernier.`
                : 'Aucun montant n’est proposé : indiquez votre propre budget. Tout reste modifiable.'}
            </p>
          </div>
        </Card>
      ) : null}
      {isDemoMode ? <Notice className="mb-4">Démonstration : saisissez des montants fictifs. Le projet est conservé dans ce navigateur uniquement.</Notice> : null}
      <Card>
        <ActionForm action={createGoal} submitLabel="Créer l’objectif" testId="form-objectif" className="grid gap-4 sm:grid-cols-2" wizard>
          {usable ? <input type="hidden" name="templateId" value={usable.id} /> : null}
          {occurrence ? <input type="hidden" name="occurrence" value={occurrence} /> : null}
          {renewal?.allowed && previous ? <input type="hidden" name="previousGoalId" value={previous.id} /> : null}
          <FormStep step={1} total={3} title="Le projet">
            <CategoryPicker kinds={kinds} withEid={religious} defaultValue={defaultKind} />
            <div className="sm:col-span-2">
              <Field label="Nom du projet" name="name" maxLength={120} list="idees-projet" autoComplete="off" defaultValue={defaultName}
                hint="Obligatoire pour un projet personnel (par exemple : Voyage, Mariage). Sinon, le nom de la catégorie est utilisé." />
              <datalist id="idees-projet">{PERSONAL_IDEAS.map((i) => <option key={i} value={i} />)}</datalist>
            </div>
          </FormStep>
          <FormStep step={2} total={3} title="Montant et échéance">
            <Field label="Montant cible (€)" name="target" inputMode="decimal" required hint="Budget total que vous visez."
              defaultValue={renewal?.allowed && previous ? centsToInput(previous.targetCents) : undefined} />
            <Field label="Date souhaitée" name="targetDate" type="date" required min={addMonths(s.asOf, 1)} defaultValue={defaultDate} />
          </FormStep>
          <FormStep step={3} total={3} title="Épargne">
            <Field label="Épargne déjà disponible (€)" name="available" inputMode="decimal" defaultValue="0" hint="Montant déjà mis de côté pour ce projet (il reste sur vos comptes)." />
            <Field label="Mensualité prévue (€)" name="monthlyCapacity" inputMode="decimal" required
              hint={cap.availableCents === null ? 'Capacité d’épargne inconnue : indiquez ce que vous pensez pouvoir mettre de côté.' : `Capacité encore libre après vos autres projets : ${formatCents(cap.availableCents)} par mois.`} />
          </FormStep>
        </ActionForm>
      </Card>
      {!isDemoMode && !religious ? (
        <div className="mt-4" data-testid="projets-religieux-fermes"><ReligiousGate feature="Projets Hajj, Omra, Aïd, Ramadan" next="/goals" /></div>
      ) : null}
    </>
  );
}
