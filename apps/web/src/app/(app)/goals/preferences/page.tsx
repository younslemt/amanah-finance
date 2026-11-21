import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field, RadioGroup, SelectField } from '@/components/forms/fields';
import { ReligiousGate } from '@/components/religious-gate';
import { isDemoMode } from '@/lib/env';
import { loadPlanning } from '@/lib/planning-data';
import { GROUP_LABEL } from '@/lib/suggestion-text';
import { GOAL_TEMPLATES, isReligiousTemplate, SUGGESTION_GROUPS, templateById } from '@amanah/engines';
import { decideSuggestion, savePlanningPreferences } from '../../actions';

export const metadata: Metadata = { title: 'Préférences des suggestions' };

const tri = (v: boolean | null) => (v === null ? 'unknown' : v ? 'yes' : 'no');
const box = 'mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-700)]';

/**
 * Préférences DÉCLARÉES (jamais déduites des opérations) : groupes de suggestions, situation
 * familiale, projets qui intéressent la personne, calendrier scolaire, suggestions écartées.
 */
export default async function PreferencesPage() {
  const { planning, religiousEnabled } = await loadPlanning();
  const p = planning.prefs;
  const groups = SUGGESTION_GROUPS.filter((g) => g !== 'religious' || religiousEnabled);
  const interestTemplates = GOAL_TEMPLATES.filter((t) => t.available && t.trigger.type === 'interest' && (!isReligiousTemplate(t) || religiousEnabled));
  const dismissed = planning.decisions.filter((d) => d.status === 'dismissed');
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Projets</Link></p>
      <PageHeader title="Préférences des suggestions" subtitle="Ce que vous déclarez ici oriente les suggestions et le calendrier. Rien n’est déduit de vos opérations." />
      {isDemoMode ? <Notice className="mb-4">Démonstration : préférences fictives, conservées dans ce navigateur uniquement.</Notice> : null}
      <Card>
        <ActionForm action={savePlanningPreferences} submitLabel="Enregistrer mes préférences" testId="form-preferences" className="grid gap-5 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Suggestions à recevoir</legend>
            {groups.map((g) => (
              <label key={g} className="flex items-start gap-3 text-sm">
                <input type="checkbox" name="groups" value={g} defaultChecked={p.groups.includes(g)} className={box} />
                <span>{GROUP_LABEL[g]}{g === 'religious' ? ' (fonctions religieuses activées)' : ''}</span>
              </label>
            ))}
            {!religiousEnabled ? <p className="text-xs text-ink-muted">Événements religieux : disponibles seulement après activation volontaire des fonctions de finance islamique.</p> : null}
          </fieldset>
          <div className="space-y-4">
            <RadioGroup name="hasChildren" legend="Enfants scolarisés dans le foyer" defaultValue={tri(p.hasChildren)}
              options={[{ value: 'yes', label: 'Oui' }, { value: 'no', label: 'Non' }, { value: 'unknown', label: 'Je préfère ne pas le préciser' }]} />
            <RadioGroup name="hasVehicle" legend="Véhicule dans le foyer" defaultValue={tri(p.hasVehicle)}
              options={[{ value: 'yes', label: 'Oui' }, { value: 'no', label: 'Non' }, { value: 'unknown', label: 'Je préfère ne pas le préciser' }]} />
          </div>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Projets qui m’intéressent</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {interestTemplates.map((t) => (
                <label key={t.id} className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="interests" value={t.id} defaultChecked={p.interests.includes(t.id)} className={box} />
                  <span>{t.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-3 sm:col-span-2">
            <SelectField label="Calendrier scolaire" name="schoolCalendar" defaultValue={p.schoolCalendar}>
              <option value="be-fwb">Fédération Wallonie-Bruxelles (rentrée fin août)</option>
              <option value="be-vl">Flandre (rentrée début septembre)</option>
              <option value="custom">Personnalisé</option>
            </SelectField>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Rentrée (calendrier personnalisé, MM-JJ)" name="schoolStart" placeholder="09-01" defaultValue={p.customSchool?.start ?? ''} />
              <Field label="Début des vacances d’été (MM-JJ)" name="schoolHolidays" placeholder="07-01" defaultValue={p.customSchool?.holidays ?? ''} />
            </div>
            <p className="text-xs text-ink-muted">Dates calculées à titre indicatif : vérifiez-les dans le calendrier officiel de votre école.</p>
          </div>
        </ActionForm>
      </Card>

      <Card className="mt-4">
        <CardTitle>Suggestions écartées</CardTitle>
        {dismissed.length === 0 ? <p className="text-sm text-ink-muted">Aucune.</p> : (
          <ul className="divide-y divide-line" data-testid="suggestions-ecartees">
            {dismissed.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{templateById(d.id.split(':')[0]!)?.title ?? d.id}</span>
                <ActionForm action={decideSuggestion} submitLabel="Rétablir" variant="quiet" testId="retablir-suggestion">
                  <input type="hidden" name="suggestionId" value={d.id} /><input type="hidden" name="decision" value="restore" />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {!isDemoMode && !religiousEnabled ? <div className="mt-4"><ReligiousGate feature="Suggestions d’événements religieux" next="/goals" /></div> : null}
    </>
  );
}
