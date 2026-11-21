import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, Notice, PageHeader } from '@/components/ui';
import { getSnapshot } from '@/lib/data';
import { NO_PARTNERS, SOLUTION_LABEL, solutionCategoriesFor } from '@/lib/solutions';
import { fr } from '@/messages/fr';

export const metadata: Metadata = { title: 'Concrétiser mon projet' };

/** Étape de réalisation : point d'entrée des futurs services. Aucun partenaire ni offre à ce stade. */
export default async function SolutionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSnapshot();
  const entry = s.goals.find((g) => g.goal.id === id);
  if (!entry) notFound();
  const { goal } = entry;
  const categories = solutionCategoriesFor(goal.kind);
  const partners = await Promise.all(categories.map((c) => NO_PARTNERS.list(c)));
  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/goals/${goal.id}`} className="text-primary-800 underline-offset-4 hover:underline">← {goal.name}</Link></p>
      <PageHeader title="Explorer les solutions pour concrétiser mon projet" subtitle={`${fr.goals.kind[goal.kind]} · ${goal.name}`} />
      <Notice tone="warning">Bientôt disponible. Aucun partenaire n’est référencé aujourd’hui : rien ici n’est une offre commerciale, et aucune de vos données n’est transmise à un tiers.</Notice>
      <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="familles-solutions">
        {categories.map((c, i) => (
          <Card key={c} as="article">
            <h2 className="text-lg text-primary-900">{SOLUTION_LABEL[c].title}</h2>
            <p className="mt-1 text-sm text-ink-muted">{SOLUTION_LABEL[c].description}</p>
            <p className="mt-3 text-sm">{partners[i]!.length === 0 ? 'Aucun partenaire pour le moment.' : null}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
