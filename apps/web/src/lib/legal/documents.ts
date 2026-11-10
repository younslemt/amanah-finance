/**
 * Textes juridiques PROVISOIRES. Ils doivent être relus et validés par un juriste
 * avant toute ouverture à de vrais utilisateurs. Changer un texte = changer sa
 * version : les utilisateurs devront à nouveau l'accepter.
 */
import { brand } from '../../config/brand.ts';

export type LegalKind = 'terms' | 'privacy' | 'special_category';

export interface LegalDocument {
  kind: LegalKind;
  version: string;
  title: string;
  /** Ce que l'utilisateur coche. */
  checkboxLabel: string;
  /** Texte intégral présenté (son empreinte SHA-256 est conservée comme preuve). */
  body: string;
  /** Nature : consentement (retirable) ou prise de connaissance. */
  nature: 'acceptance' | 'acknowledgement' | 'explicit_consent';
}

export const LEGAL_DRAFT_NOTICE = 'Texte provisoire — validation juridique requise avant toute utilisation publique.';

const VERSION = '2026-11-brouillon-1';

export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [
  {
    kind: 'terms',
    version: VERSION,
    nature: 'acceptance',
    title: 'Conditions générales d’utilisation',
    checkboxLabel: 'J’accepte les conditions générales d’utilisation.',
    body: [
      `${brand.name} est un outil d’organisation financière personnelle. Il ne détient aucun fonds, n’exécute aucun paiement et ne fournit aucun conseil en investissement personnalisé.`,
      'Les calculs de Zakat et de purification sont des estimations fondées sur un référentiel indiqué à l’écran ; ils ne constituent ni une fatwa ni une certification et doivent être validés par une autorité religieuse qualifiée.',
      'Vous êtes responsable de l’exactitude des données que vous saisissez. Vous pouvez supprimer votre compte et vos données à tout moment depuis les paramètres.',
      LEGAL_DRAFT_NOTICE,
    ].join('\n\n'),
  },
  {
    kind: 'privacy',
    version: VERSION,
    nature: 'acknowledgement',
    title: 'Information sur la protection des données',
    checkboxLabel: 'J’ai pris connaissance de l’information sur la protection de mes données.',
    body: [
      'Données traitées : adresse e-mail, profil (prénom ou pseudonyme, nom du foyer, région), données financières que vous saisissez (comptes, revenus, dépenses, budgets, objectifs).',
      'Finalité : vous fournir le service d’organisation financière. Base légale : exécution du contrat (article 6.1.b du RGPD).',
      'Hébergement : Union européenne. Aucune vente de données, aucune publicité. Aucun identifiant bancaire n’est collecté.',
      'Vos droits : accès, rectification, effacement (suppression du compte dans les paramètres), portabilité, opposition, et réclamation auprès de l’Autorité de protection des données (Belgique).',
      'Conservation : jusqu’à la suppression de votre compte.',
      LEGAL_DRAFT_NOTICE,
    ].join('\n\n'),
  },
  {
    kind: 'special_category',
    version: VERSION,
    nature: 'explicit_consent',
    title: 'Consentement explicite : données pouvant révéler une conviction religieuse',
    checkboxLabel: 'Je consens explicitement au traitement de données pouvant révéler mes convictions religieuses (usage des fonctions de finance islamique).',
    body: [
      'L’utilisation de fonctions comme la Zakat, la purification des intérêts ou un objectif Hajj peut révéler une conviction religieuse, donnée protégée par l’article 9 du RGPD.',
      'Ces données ne sont traitées qu’avec votre consentement explicite (article 9.2.a), uniquement pour vous fournir ces fonctions.',
      'Vous pouvez retirer ce consentement à tout moment dans les paramètres. Le retrait ne remet pas en cause les traitements déjà effectués ; l’accès à l’application est alors suspendu jusqu’à un nouveau consentement ou la suppression de votre compte.',
      LEGAL_DRAFT_NOTICE,
    ].join('\n\n'),
  },
];

/** Empreinte SHA-256 (hexadécimal) du texte exact présenté, utilisée comme preuve. */
export async function documentHash(doc: LegalDocument): Promise<string> {
  const payload = `${doc.kind}\n${doc.version}\n${doc.title}\n${doc.checkboxLabel}\n${doc.body}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ConsentRecord {
  kind: string;
  granted: boolean;
  document_version: string;
  recorded_at: string;
}

/**
 * Documents encore à accepter : pour chaque document, l'enregistrement le plus
 * récent doit être une acceptation de la version en vigueur.
 */
export function missingConsents(records: readonly ConsentRecord[], docs: readonly LegalDocument[] = LEGAL_DOCUMENTS): LegalKind[] {
  return docs.filter((doc) => {
    const latest = records.filter((r) => r.kind === doc.kind).sort((a, b) => (a.recorded_at < b.recorded_at ? 1 : -1))[0];
    return !latest || !latest.granted || latest.document_version !== doc.version;
  }).map((d) => d.kind);
}
