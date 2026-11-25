import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Card, CardTitle, Notice, PageHeader } from '@/components/ui';
import { isDemoMode } from '@/lib/env';
import { FEEDBACK_QUESTIONS, feedbackMailto } from '@/lib/feedback';

export const metadata: Metadata = { title: 'Donner mon avis' };
export const dynamic = 'force-dynamic';

/**
 * Recueil d'avis des testeurs de la démonstration privée. Rien n'est stocké par l'application :
 * l'avis part par e-mail, depuis la messagerie du testeur, vers l'adresse configurée sur
 * l'hébergeur (DEMO_FEEDBACK_EMAIL). Aucune donnée bancaire ni personnelle n'est demandée.
 */
export default function FeedbackPage() {
  if (!isDemoMode) notFound();
  const mailto = feedbackMailto(process.env.DEMO_FEEDBACK_EMAIL);
  return (
    <>
      <PageHeader title="Donner mon avis" subtitle="Quelques minutes pour améliorer Amanah Finance" />
      <Notice tone="warning">N’indiquez aucune donnée bancaire (IBAN, identifiants, codes), aucun montant réel ni aucune information personnelle sensible. Décrivez seulement votre expérience de la démonstration.</Notice>
      <Card className="mt-4">
        <CardTitle>Les questions</CardTitle>
        <ol className="list-decimal space-y-2 pl-5 text-sm" data-testid="questions-avis">
          {FEEDBACK_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
        </ol>
      </Card>
      <Card className="mt-4">
        <CardTitle>Envoyer</CardTitle>
        {mailto ? (
          <>
            <p className="mb-3 text-sm text-ink-muted">Le bouton ouvre votre messagerie avec les questions déjà copiées. Vous relisez et envoyez vous-même.</p>
            <a href={mailto} className="inline-flex min-h-11 items-center rounded-lg bg-primary-700 px-4 text-sm font-semibold text-white" data-testid="lien-envoyer-avis">Écrire mon avis par e-mail</a>
          </>
        ) : (
          <p className="text-sm text-ink-muted" data-testid="avis-sans-adresse">Répondez aux questions dans un message adressé à la personne qui vous a invité.</p>
        )}
      </Card>
    </>
  );
}
