import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui';

/**
 * Affiché à la place d'une fonction de finance islamique tant que le consentement
 * article 9 n'est pas en vigueur. Le reste de l'application reste accessible.
 */
export function ReligiousGate({ feature, next }: { feature: string; next: '/goals' | '/zakat' | '/purification' }) {
  return (
    <Card>
      <CardTitle>{feature} : fonction désactivée</CardTitle>
      <p className="text-sm leading-relaxed text-ink-muted">
        Cette fonction de finance islamique demande votre consentement explicite, distinct des conditions d’utilisation,
        car elle peut révéler une conviction religieuse (article 9 du RGPD). Vos comptes, votre budget et l’import de relevés
        restent disponibles sans ce consentement.
      </p>
      <Link href={`/finance-islamique?suite=${encodeURIComponent(next)}`} data-testid="lien-activer-finance-islamique"
        className="mt-4 inline-block rounded-lg bg-primary-800 px-4 py-2.5 text-sm font-medium text-ivory hover:bg-primary-700">
        Activer les fonctions de finance islamique
      </Link>
    </Card>
  );
}
