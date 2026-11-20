/** Texte lisible d'une modification de projet (avant → après). Fonction pure, testée. */
const FIELD: Record<string, string> = {
  name: 'Nom', target_cents: 'Montant cible', target_date: 'Date souhaitée', monthly_capacity_cents: 'Capacité mensuelle',
  priority: 'Priorité', status: 'Statut', realized_on: 'Date de réalisation',
};
const STATUS: Record<string, string> = { active: 'en cours', paused: 'en pause', achieved: 'réalisé', archived: 'archivé' };

function show(field: string, v: unknown, money: (c: number) => string): string {
  if (v === null || v === undefined) return '—';
  if (field.endsWith('_cents')) return money(Number(v));
  if (field === 'status') return STATUS[String(v)] ?? String(v);
  if (field.endsWith('_date') || field === 'realized_on') return String(v).split('-').reverse().join('/');
  return String(v);
}

export function describeGoalChange(changes: Record<string, { from: unknown; to: unknown }>, money: (c: number) => string): string[] {
  return Object.keys(FIELD).filter((f) => f in changes)
    .map((f) => `${FIELD[f]} : ${show(f, changes[f]!.from, money)} → ${show(f, changes[f]!.to, money)}`);
}
