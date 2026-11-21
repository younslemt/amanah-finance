import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Field } from '@/components/forms/fields';
import { CategoryPicker } from '@/components/forms/category-picker';
import { FormStep } from '@/components/ui/form-step';
import { ReligiousGate } from '@/components/religious-gate';
import { getSnapshot } from '@/lib/data';
import { isDemoMode } from '@/lib/env';
import { formatCents } from '@/lib/format';
import { religiousAccess } from '@/lib/supabase/session';
import { addMonths, capacityForGoal, GENERAL_GOAL_KINDS, RELIGIOUS_GOAL_KINDS } from '@amanah/engines';
import { createGoal } from '../../actions';

export const metadata: Metadata = { title: 'Ajouter un objectif' };

/** Idées de dénomination pour un projet personnel (le nom reste libre). */
const PERSONAL_IDEAS = ['Voyage', 'Mariage', 'Véhicule', 'Création d’entreprise', 'Autre projet'];

export default async function NewGoalPage({ searchParams }: { searchParams: Promise<{ categorie?: string }> }) {
  const [{ categorie }, { enabled: religious }, s] = await Promise.all([searchParams, religiousAccess(), getSnapshot()]);
  // Démonstration : toutes les catégories (données fictives) ; réel : religieuses avec le consentement
  const kinds = [...(religious ? RELIGIOUS_GOAL_KINDS.filter((k) => k !== 'eid_al_adha') : []), ...GENERAL_GOAL_KINDS];
  const cap = capacityForGoal(s.savingsPlan, '__nouveau__');
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/goals" className="text-primary-800 underline-offset-4 hover:underline">← Tous les projets</Link></p>
      <PageHeader title="Ajouter un objectif" subtitle="Trois étapes courtes. Vous pourrez ensuite planifier, simuler et suivre depuis la fiche du projet." />
      {isDemoMode ? <Notice className="mb-4">Démonstration : saisissez des montants fictifs. Le projet est conservé dans ce navigateur uniquement.</Notice> : null}
      <Card>
        <ActionForm action={createGoal} submitLabel="Créer l’objectif" testId="form-objectif" className="grid gap-4 sm:grid-cols-2" wizard>
          <FormStep step={1} total={3} title="Le projet">
            <CategoryPicker kinds={kinds} withEid={religious} defaultValue={categorie} />
            <div className="sm:col-span-2">
              <Field label="Nom du projet" name="name" maxLength={120} list="idees-projet" autoComplete="off"
                hint="Obligatoire pour un projet personnel (par exemple : Voyage, Mariage). Sinon, le nom de la catégorie est utilisé." />
              <datalist id="idees-projet">{PERSONAL_IDEAS.map((i) => <option key={i} value={i} />)}</datalist>
            </div>
          </FormStep>
          <FormStep step={2} total={3} title="Montant et échéance">
            <Field label="Montant cible (€)" name="target" inputMode="decimal" required hint="Estimation du budget total." />
            <Field label="Date souhaitée" name="targetDate" type="date" required min={addMonths(s.asOf, 1)} defaultValue={addMonths(s.asOf, 24)} />
          </FormStep>
          <FormStep step={3} total={3} title="Épargne">
            <Field label="Épargne déjà disponible (€)" name="available" inputMode="decimal" defaultValue="0" hint="Montant déjà mis de côté pour ce projet (il reste sur vos comptes)." />
            <Field label="Mensualité prévue (€)" name="monthlyCapacity" inputMode="decimal" required
              hint={cap.availableCents === null ? 'Capacité d’épargne inconnue : indiquez ce que vous pensez pouvoir mettre de côté.' : `Capacité encore libre après vos autres projets : ${formatCents(cap.availableCents)} par mois.`} />
          </FormStep>
        </ActionForm>
      </Card>
      {!isDemoMode && !religious ? (
        <div className="mt-4" data-testid="projets-religieux-fermes"><ReligiousGate feature="Projets Hajj, Omra et Aïd al-Adha" next="/goals" /></div>
      ) : null}
    </>
  );
}
