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

## Ajustements de la revue finale

- **Recommandations visant un projet (R7, liens `/goals/[id]`)** : elles héritent de la catégorie réelle du projet (son type, jamais son nom). Sans consentement, celles qui visent un projet religieux, ou un projet absent de l'accueil (classification impossible), sont exclues du modèle de vue : ni nom, ni identifiant, ni lien. Test : recommandation R7 religieuse injectée dans un modèle sans consentement.
- **Épargne** : trois montants de natures différentes, sans aucun calcul ajouté. **Excédent mensuel observé** : constat de l'analyse des mois complets. **Capacité d'épargne retenue pour le plan** : ce que le plan d'épargne répartit entre les projets (déclarée ou estimée). **Capacité d'épargne non affectée** : la part de cette capacité qui n'est encore affectée à aucun projet. Une phrase précise qu'ils ne s'additionnent pas et ne s'ajoutent pas au solde.
- **Premier accueil** (aucune donnée) : message de bienvenue Amanah, possibilités générales, cinq premières démarches réellement disponibles (compte, saisie, import, projet, patrimoine). Avec consentement : accès direct à la Zakat, à la purification et aux dons. Sans consentement : contenu pédagogique « Finance islamique ». Aucun chiffre affiché. Les parcours d'onboarding sont inchangés.

## Confidentialité

- Le modèle de vue est construit **côté serveur** (`lib/home-view.ts`, `lib/home-data.ts`). Sans consentement religieux en vigueur, il ne contient aucune donnée religieuse personnalisée : ni engagements, ni projet, événement, suggestion ou action religieux. Les calculs et contributions de Zakat ne sont même pas chargés. Les règles RLS restent la protection de la base.
- Le bloc 2 devient alors « Finance islamique », pédagogique (composant `IslamicFinanceIntro` du lot 1).
- **Préférence d'affichage** : colonne privée `profiles.home_layout` (migration `0026`), lisible et modifiable par la personne seule, indépendante du consentement (l'effacement des données religieuses ne la touche pas). En démonstration : champ de l'état existant (cookie), sans base.

## Tests

- Unitaires : `lib/home-view.test.ts` (11 tests : ordre, données des moteurs, Zakat enregistrée et incomplète, montants d'épargne, projets, actions, analytique, absence de divulgation, non-divulgation R7, patrimoine sans score).
- SQL : `supabase/tests/home_layout.test.sql` (12 contrôles : défaut, valeur refusée, isolation dans un même foyer et entre foyers, indépendance du consentement).
- Démonstration : `e2e/accueil.spec.ts` (ordre des blocs, Zakat, capacité, projets, suggestions et actions vers des écrans existants, analytique, accessibilité, rendu réel à 375, 390, 430, 768 et 1440 px dans les deux affichages, avec captures).
- Mode réel : `e2e-live/accueil.spec.ts` (premier accueil sans et avec consentement, sans consentement, préférence persistante, avec consentement et Zakat incomplète, retrait du consentement, captures).
- Tests existants adaptés au nouvel accueil (mêmes vérifications, nouveaux repères).

## Comparaison avec les maquettes validées

Captures de l'application exécutée (CI, rendu Chromium réel) comparées aux maquettes, à 375, 390, 430, 768 et 1440 px, dans les deux affichages, sans consentement et avec une Zakat incomplète.

| Écart | Nature | Suite |
|---|---|---|
| Montants différents des maquettes | Voulu : ils viennent des moteurs et des données fictives de démonstration (aucun montant en dur) | — |
| Pas de ligne « Provision virtuelle » | Aucune provision n'existe encore dans les moteurs : rien n'est inventé | À concevoir avec le plan d'épargne (chantier à valider) |
| Prochaine étape des projets : « Valider mon plan d'épargne » plutôt que « Comparer les scénarios » | Voulu : l'étape vient du Journey de chaque projet | — |
| Encadré épargne de « Mon Amanah » : excédent observé, capacité retenue, part non affectée | Ajout demandé à la revue : les trois montants et leur différence sont expliqués | — |
| Libellé « Liquidités disponibles » au lieu de « Solde » | Libellé existant de l'application | Harmonisation possible au lot 3 |
| Trois suggestions compactes dans un seul encadré (maquette : une) | Décision antérieure : trois suggestions au plus sur l'accueil | — |
| Affichage analytique : budget du mois et graphique dans « Mon Amanah » (maquette : bloc séparé) | Même contenu, ordre des blocs respecté | — |
| Carte Zakat de l'accueil : estimé, déclaré et rapproché ; « confirmées » seulement dans le détail | Accueil compact ; les cinq notions restent séparées dans le modèle | Écran « Mes engagements » complet au lot 3 |
| Navigation : entrée « Finance islamique » et pas de bouton « + » | Hors lot 2 | Lot 3 (navigation, « Mes engagements », actions rapides) |
| En-tête mobile du mode réel chargé à 375 px (Comptes, Paramètres, Se déconnecter) | Coque existante | Lot 3 (menu profil) |
| Barre de navigation basse visible au milieu des captures pleine page | Artefact de capture pleine page (élément fixe), pas un défaut d'affichage | — |
