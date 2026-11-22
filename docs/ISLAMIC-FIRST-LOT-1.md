# Islamic-first — Lot 1 : fondations techniques

Branche `islamic-first-lot-1`, issue de `main` (`ba688bc`, fusion du Sprint 5). Architecture de référence : document « Islamic-first — Architecture UX définitive et écrans prioritaires », validé le 21 novembre 2026.

**Périmètre** : composants réutilisables, règles de présentation et fonctions pures. **L'accueil et la navigation ne changent pas encore** : ils attendent la validation visuelle des maquettes, puis les lots 2 et 3. Aucun moteur financier, aucune migration et aucune règle de consentement ne sont modifiés.

## Fonctions pures (`apps/web/src/lib`)

| Fichier | Rôle | Règles garanties par les tests |
|---|---|---|
| `presentation.ts` | Ordre et variante des six blocs de l'accueil ; libellé de la 2e entrée de navigation | Islamic-first par défaut ; affichage classique = même contenu, autre ordre ; sans consentement, aucun bloc ne reçoit de donnée religieuse, quelle que soit la préférence ; la préférence est indépendante du consentement |
| `zakat-status.ts` | Présentation d'un calcul et d'un règlement de Zakat du moteur | Cinq notions distinctes : montant estimé, provision virtuelle, contributions déclarées, dont rapprochées, dont confirmées. « Montant restant selon vos déclarations » = estimé − déclaré ; la provision n'est jamais déduite ni comptée comme paiement ; aucun double comptage ; calcul incomplet (choix manquants, prix trop ancien, aucun calcul) : aucun montant estimé ni restant affiché comme établi ; montants au centime |
| `home-actions.ts` | Passerelles observation → action (Zakat à actualiser, intérêts détectés, projet en retard, événement à venir, capacité disponible) | Destinations existantes ; aucun libellé prescriptif ; aucune passerelle religieuse sans consentement ; le nom et le lien d'un projet religieux n'apparaissent jamais sans consentement ; pas de doublon avec un projet existant |
| `quick-actions.ts` | Actions du bouton « + » | Seulement des actions opérationnelles : en démonstration, projet, mise de côté et échéance ; en mode réel, rôle d'écriture requis, compte requis pour l'opération et l'import, consentement requis pour le don ; aucune action disponible = pas de bouton |

## Composants (`apps/web/src/components/home`)

`SectionHeader`, `MethodBadge` (« Méthode provisoire », relié au registre des méthodologies), `ConsentGate` et `IslamicFinanceIntro` (contenu pédagogique sans donnée personnelle), `ZakatStatusList`, `HomeActionList`, `QuickActionList`. Ils ne sont encore utilisés par aucun écran.

## Patrimoine et valeurs

Aucun score de conformité islamique du patrimoine n'est créé. Le futur bloc « Mon patrimoine et mes valeurs » présentera seulement les données patrimoniales disponibles et les éléments à examiner (par exemple, les comptes rémunérés par intérêts). Le screening des fonds fera l'objet d'un chantier dédié.

## Tests

`apps/web/src/lib/islamic-first.test.ts` (15 tests) et `apps/web/e2e/responsive.spec.ts` : aucun débordement horizontal sur 12 écrans principaux à 375, 390, 430, 768 et 1440 px (rendu réel du navigateur). Les suites existantes sont inchangées : moteurs, application, SQL/RLS, Playwright démo et parcours réel.

## Lots suivants

Chaque lot part d'une branche distincte, créée depuis `main` à jour après la fusion du lot précédent. Une PR par lot, revue et validée avant fusion.
