# Islamic-first — Lot 2 : accueil Islamic-first

Branche `islamic-first-lot-2`, issue de `main` (`0aea2fd`, fusion du lot 1). Référence visuelle : les maquettes validées (canevas « AMANAH — Maquettes Islamic-first »).

## Ce qui change

L'accueil (`/dashboard`) est refait en six blocs, dans l'ordre de la présentation choisie :

| Bloc | Données (moteurs existants) |
|---|---|
| 1. Mon Amanah | Snapshot : patrimoine net, solde, revenus et dépenses du mois, synthèse de l'analyse ; capacité d'épargne encore disponible = `capacityForGoal` du plan d'épargne (même calcul que les suggestions), distincte du solde |
| 2. Mes engagements | Zakat : dernier calcul enregistré de la personne et ses contributions (`zakatSettlements`), sinon calcul courant sans contribution ; « Montant restant selon vos déclarations » ; calcul incomplet jamais présenté comme établi. Purification : intérêts détectés à examiner. Solidarité : dons de l'année |
| 3. Mes projets de vie | `planGoal` et `goalJourney` : 3 projets au plus (nom, avancement, objectif, une seule prochaine étape), total et accès à tous ; suggestions de `suggestGoals` (3 au plus) |
| 4. Mon calendrier Amanah | `familyCalendar` : 4 prochaines échéances |
| 5. Mon patrimoine et mes valeurs | Répartition des actifs disponibles, éléments à examiner (comptes ayant reçu des intérêts), réserve d'urgence. Aucun score de conformité |
| 6. Mes prochaines actions | `homeActions()` (lot 1) et recommandations budgétaires : engagements et projets en retard, puis recommandations urgentes, puis échéances et capacité ; 3 au plus |

**Affichage analytique** (préférence) : mêmes données ; ordre situation, actions, projets, patrimoine, calendrier, engagements (compacts) ; la synthèse financière s'enrichit du budget du mois et du graphique revenus / dépenses.

## Confidentialité

- Le modèle de vue est construit **côté serveur** (`lib/home-view.ts`, `lib/home-data.ts`). Sans consentement religieux en vigueur, il ne contient aucune donnée religieuse personnalisée : ni engagements, ni projet, événement, suggestion ou action religieux. Les calculs et contributions de Zakat ne sont même pas chargés. Les règles RLS restent la protection de la base.
- Le bloc 2 devient alors « Finance islamique », pédagogique (composant `IslamicFinanceIntro` du lot 1).
- **Préférence d'affichage** : colonne privée `profiles.home_layout` (migration `0026`), lisible et modifiable par la personne seule, indépendante du consentement (l'effacement des données religieuses ne la touche pas). En démonstration : champ de l'état existant (cookie), sans base.

## Tests

- Unitaires : `lib/home-view.test.ts` (9 tests : ordre, données des moteurs, Zakat enregistrée et incomplète, capacité, projets, actions, analytique, absence de divulgation, patrimoine sans score).
- SQL : `supabase/tests/home_layout.test.sql` (12 contrôles : défaut, valeur refusée, isolation dans un même foyer et entre foyers, indépendance du consentement).
- Démonstration : `e2e/accueil.spec.ts` (ordre des blocs, Zakat, capacité, projets, suggestions et actions vers des écrans existants, analytique, accessibilité, rendu réel à 375, 390, 430, 768 et 1440 px dans les deux affichages, avec captures).
- Mode réel : `e2e-live/accueil.spec.ts` (sans consentement, préférence persistante, avec consentement et Zakat incomplète, retrait du consentement, captures).
- Tests existants adaptés au nouvel accueil (mêmes vérifications, nouveaux repères).
