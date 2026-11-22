/**
 * Statut d'une méthodologie religieuse (registre docs/METHODOLOGIES-GOUVERNANCE.md).
 * Aujourd'hui toutes sont provisoires : aucune validation ni certification n'est affichée.
 */
export type MethodStatus = 'draft' | 'under_review' | 'personal_choice';

const LABEL: Record<MethodStatus, string> = {
  draft: 'Méthode provisoire',
  under_review: 'Méthode en revue',
  personal_choice: 'Choix personnel',
};

export function MethodBadge({ status = 'draft', methodId }: { status?: MethodStatus; methodId?: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-accent-600 px-2 py-0.5 text-xs text-accent-600"
      title={methodId ? `Registre des méthodologies : ${methodId}` : undefined}
      data-testid="badge-methode" data-status={status}
    >
      {LABEL[status]}
    </span>
  );
}
