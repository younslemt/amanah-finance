/**
 * Textes des recommandations (français). Le moteur renvoie des codes et des montants ;
 * ce module les rend lisibles. Aucune formulation ne vise un produit financier.
 */
import type { DataPoint, Recommendation, Severity } from '@amanah/engines';
import { categoryLabel } from './labels.ts';
import { formatCents, formatPermille } from './format.ts';

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Prioritaire', high: 'Important', medium: 'Utile', info: 'Information',
};

export const RULE_TITLE: Record<Recommendation['ruleId'], string> = {
  R0: 'Données insuffisantes',
  R1: 'Vos dépenses dépassent vos revenus',
  R2: 'Réserve de précaution insuffisante',
  R3: 'Budget dépassé plusieurs mois',
  R4: 'Capacité d’épargne non affectée',
  R5: 'Une catégorie pèse lourd dans vos dépenses',
  R6: 'Abonnements à revoir',
};

const n = (v: unknown) => Number(v);
const cat = (v: unknown) => categoryLabel(String(v)).toLowerCase();
const months = (v: unknown) => { const x = n(v); return `${String(x).replace('.', ',')} mois`; };

export function findingText(r: Recommendation): string {
  const p = r.finding.params;
  switch (r.finding.code) {
    case 'insufficient_data': return `Nous disposons de ${p.months} mois complet(s) d’opérations. Il en faut au moins ${p.required} pour chiffrer votre situation sans risque d’erreur.`;
    case 'spending_exceeds_income': return `Sur ${p.of} mois, ${p.months} se sont terminés en négatif. En moyenne (médiane), il manque ${formatCents(n(p.deficitCents), { round: true })} par mois.`;
    case 'reserve_below_target': return `Votre réserve couvre ${months(p.monthsCovered)} de dépenses essentielles, pour un objectif de ${p.targetMonths} mois.`;
    case 'budget_overrun_repeated': return `Le budget « ${categoryLabel(String(p.category))} » a été dépassé ${p.overMonths} mois sur ${p.of}.`;
    case 'unallocated_capacity': return `Votre capacité d’épargne estimée est de ${formatCents(n(p.capacityCents), { round: true })} par mois ; ${formatCents(n(p.freeCents), { round: true })} ne sont affectés à aucun projet.`;
    case 'spending_concentration': return `La catégorie « ${categoryLabel(String(p.category))} » représente ${formatPermille(n(p.sharePermille))} de vos dépenses courantes.`;
    case 'subscriptions_review': return `${p.count} abonnement(s) actif(s) détecté(s), pour ${formatCents(n(p.totalCents))} par mois.`;
    default: return '';
  }
}

export function proposalText(r: Recommendation): string {
  const p = r.proposal.params;
  switch (r.proposal.code) {
    case 'import_more_history': return `Importez vos relevés des ${p.required} derniers mois au moins.`;
    case 'reduce_to_balance': return `Identifier ${formatCents(n(p.targetCents), { round: true })} de dépenses mensuelles à réduire pour revenir à l’équilibre${p.category ? `, en commençant par le poste le plus important (${cat(p.category)})` : ''}.`;
    case 'rebuild_reserve': return `Mettre de côté ${formatCents(n(p.monthlyCents), { round: true })} par mois pendant ${p.months} mois pour atteindre votre réserve cible.`;
    case 'reduce_or_adjust_budget': return `Réduire ce poste d’environ ${formatCents(n(p.overrunCents), { round: true })} par mois, ou fixer un budget réaliste (dépense habituelle : ${formatCents(n(p.realisticLimitCents), { round: true })}).`;
    case 'allocate_to_goals': return `Affecter ${formatCents(n(p.allocatedCents), { round: true })} par mois à ${p.goals} projet(s) qui en ont besoin.`;
    case 'create_goal': return `Donner une destination à ces ${formatCents(n(p.freeCents), { round: true })} : réserve, projet ou épargne de long terme.`;
    case 'test_reduction': return `Tester une réduction de ${formatPermille(n(p.cutPermille))} sur « ${categoryLabel(String(p.category))} », soit ${formatCents(n(p.cutCents), { round: true })} par mois.`;
    case 'review_subscriptions': return 'Vérifier si chaque abonnement est encore utile.';
    default: return '';
  }
}

export function impactText(r: Recommendation): string | null {
  if (!r.impact) return r.ruleId === 'R2' ? 'Impact non chiffré : votre capacité d’épargne actuelle ne permet pas ce rythme.' : null;
  const base = `${formatCents(r.impact.monthlyCents, { round: true })} par mois, soit ${formatCents(r.impact.annualCents, { round: true })} par an`;
  if (r.impact.params?.kind === 'upper_bound') return `Jusqu’à ${base} si tout était résilié (montant maximal, simulé).`;
  return `${base} (simulé).`;
}

const DATA_LABEL: Record<string, string> = {
  complete_months: 'Mois complets disponibles',
  observed_capacity: 'Capacité d’épargne observée',
  estimated_capacity: 'Capacité d’épargne estimée',
  deficit_months: 'Mois en négatif (3 derniers)',
  largest_category: 'Premier poste de dépense',
  reserve_balance: 'Comptes de réserve',
  essential_monthly: 'Dépenses essentielles (médiane mensuelle)',
  reserve_target: 'Réserve cible',
  budget_limit: 'Budget mensuel',
  median_spent: 'Dépense habituelle (médiane)',
  average_overrun: 'Dépassement moyen',
  committed_to_goals: 'Déjà affecté à vos projets',
  category_median: 'Dépense mensuelle (médiane)',
  share_of_spending: 'Part des dépenses courantes',
  subscription: 'Abonnement',
};

const SOURCE_LABEL = (s: string) => {
  const m = /^analysis_(\d+)_months$/.exec(s);
  if (m) return `vos opérations des ${m[1]} derniers mois complets`;
  return ({ transactions: 'vos opérations', reserve_accounts: 'vos comptes de réserve', budget: 'vos budgets', goals: 'vos projets', recurring_detection: 'détection des opérations récurrentes' } as Record<string, string>)[s] ?? s;
};

export function dataLine(d: DataPoint): { label: string; value: string; source: string } {
  let value: string;
  if (d.code === 'subscription') {
    const [label, cents] = String(d.value).split('|');
    return { label, value: `${formatCents(Number(cents))} / mois`, source: SOURCE_LABEL(d.source) };
  }
  switch (d.unit) {
    case 'cents': value = formatCents(Number(d.value), { round: true }); break;
    case 'permille': value = formatPermille(Number(d.value)); break;
    case 'months': value = months(d.value); break;
    case 'text': value = categoryLabel(String(d.value)); break;
    default: value = String(d.value);
  }
  return { label: DATA_LABEL[d.code] ?? d.code, value, source: SOURCE_LABEL(d.source) };
}

export const ACTION_LABEL: Record<string, string> = {
  import: 'Importer un relevé',
  optimize: 'Optimiser mon budget',
  optimize_category: 'Simuler une réduction',
  reserve_goal: 'Planifier ma réserve',
  goals: 'Voir mes projets',
};

/** Mention réglementaire affichée avec les recommandations. */
export const RECOMMENDATION_NOTICE =
  'Recommandations de gestion budgétaire générales, calculées automatiquement à partir de vos données. Elles ne constituent ni un conseil en investissement, ni un conseil en crédit, et ne portent sur aucun produit financier. Elles sont facultatives.';
