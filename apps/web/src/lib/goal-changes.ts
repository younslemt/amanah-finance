/** Texte lisible d'une modification de projet (avant → après). Fonction pure, testée. */
const FIELD: Record<string, string> = {
  name: 'Nom', target_cents: 'Montant cible', target_date: 'Date souhaitée', monthly_capacity_cents: 'Capacité mensuelle',
  priority: 'Priorité', status: 'Statut', realized_on: 'Date de réalisation',
  date_status: 'Date de l’Aïd', date_source: 'Source de la date', estimated_date: 'Estimation de la date',
  sacrifice_cents: 'Sacrifice ou quote-part', extra_costs_cents: 'Frais complémentaires', organization_cents: 'Contribution à un organisme',
  family_contribution_cents: 'Contributions familiales',
};
const STATUS: Record<string, string> = { active: 'en cours', paused: 'en pause', achieved: 'réalisé', archived: 'archivé', entered: 'saisie, non confirmée', confirmed: 'confirmée' };

function show(field: string, v: unknown, money: (c: number) => string): string {
  if (v === null || v === undefined) return '—';
  if (field.endsWith('_cents')) return money(Number(v));
  if (field === 'status' || field === 'date_status') return STATUS[String(v)] ?? String(v);
  if (field.endsWith('_date') || field === 'realized_on' || field === 'estimated_date') return String(v).split('-').reverse().join('/');
  return String(v);
}

export function describeGoalChange(changes: Record<string, { from: unknown; to: unknown }>, money: (c: number) => string): string[] {
  return Object.keys(FIELD).filter((f) => f in changes)
    .map((f) => `${FIELD[f]} : ${show(f, changes[f]!.from, money)} → ${show(f, changes[f]!.to, money)}`);
}
