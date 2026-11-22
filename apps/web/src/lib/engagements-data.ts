import 'server-only';
import { cache } from 'react';
import { addDays } from '@amanah/engines';
import { getSnapshot } from './data.ts';
import { isDemoMode } from './env.ts';
import { religiousAccess } from './supabase/session.ts';
import { loadDonations } from './supabase/contributions.ts';
import { loadPurification } from './supabase/purification.ts';
import { purificationItems } from './purification-review.ts';
import { DEMO_CALCS, DEMO_CONTRIBUTIONS, DEMO_USER } from './demo-donations.ts';
import { zakatCommitment } from './home-view.ts';
import { buildEngagementsView, type EngagementsAccess, type EngagementsView } from './engagements-view.ts';

/**
 * Page « Mes engagements » : charge les données existantes puis construit la vue côté serveur.
 * Sans consentement religieux en vigueur, RIEN n'est chargé (null) ; la RLS l'impose aussi.
 */
export const loadEngagementsView = cache(async (): Promise<{ view: EngagementsView; demo: boolean; access: EngagementsAccess } | null> => {
  const { enabled, ctx } = await religiousAccess();
  if (!enabled) return null;
  const s = await getSnapshot();

  if (isDemoMode) {
    const records = { userId: DEMO_USER, calculations: DEMO_CALCS, contributions: DEMO_CONTRIBUTIONS };
    return {
      demo: true, access: 'demo',
      view: buildEngagementsView({
        asOf: s.asOf, userId: DEMO_USER, zakat: zakatCommitment(s, records),
        calculations: DEMO_CALCS, contributions: DEMO_CONTRIBUTIONS,
        purification: { kind: 'candidates', count: s.purification.candidates.length, creditedCents: s.purification.detectedCreditedCents },
      }),
    };
  }

  const [d, p] = await Promise.all([loadDonations(ctx!, addDays(s.asOf, -3 * 366)), loadPurification(ctx!)]);
  const records = { userId: ctx!.userId, calculations: d.calculations, contributions: d.contributions };
  return {
    demo: false, access: ctx!.canWrite ? 'write' : 'read',
    view: buildEngagementsView({
      asOf: s.asOf, userId: ctx!.userId, zakat: zakatCommitment(s, records),
      calculations: d.calculations, contributions: d.contributions,
      // Éléments visibles avec leur propriétaire ; la vue ne compte que ceux de la personne
      purification: { kind: 'items', items: purificationItems(p.rows).map((it, k) => ({ ...it, ownerId: p.rows[k]!.owner_id })) },
    }),
  };
});
