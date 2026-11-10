import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Notice, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/forms/action-form';
import { Checkbox } from '@/components/forms/fields';
import { requireSession } from '@/lib/supabase/session';
import { LEGAL_DOCUMENTS, LEGAL_DRAFT_NOTICE, missingConsents } from '@/lib/legal/documents';
import { acceptConsents } from '../../actions';

export const metadata: Metadata = { title: 'Consentements' };

export default async function ConsentsPage() {
  const ctx = await requireSession();
  if (missingConsents(ctx.consents).length === 0) redirect(ctx.profileCompleted ? '/dashboard' : '/bienvenue/profil');
  return (
    <>
      <PageHeader title="Avant de commencer" subtitle="Étape 1 sur 2 — lisez et acceptez les documents suivants." />
      <Notice tone="warning">{LEGAL_DRAFT_NOTICE}</Notice>
      <div className="mt-4 space-y-4">
        {LEGAL_DOCUMENTS.map((d) => (
          <Card key={d.kind} as="article">
            <h2 className="text-lg text-primary-900">{d.title}</h2>
            <p className="mb-3 text-xs text-ink-muted">Version {d.version}</p>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg bg-mist p-3 text-sm leading-relaxed" tabIndex={0} aria-label={`Texte : ${d.title}`}>
              {d.body.split('\n\n').map((para) => <p key={para}>{para}</p>)}
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <ActionForm action={acceptConsents} submitLabel="Accepter et continuer" testId="form-consentements">
          {LEGAL_DOCUMENTS.map((d) => <Checkbox key={d.kind} name={`consent_${d.kind}`} label={d.checkboxLabel} required />)}
        </ActionForm>
      </Card>
    </>
  );
}
