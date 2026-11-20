# Sprint 3 — analyse financière, optimisation budgétaire, recommandations, tableau de bord

Branche `sprint-3` (depuis `main` après fusion des PR #12 et #13).
Cadrage : `PRODUIT-FINANCIAL-WELLNESS.md`, §6.
Données exclusivement fictives, aucun déploiement, aucun service payant.

**Objectif** : faire d'Amanah Finance un assistant de gestion financière qui identifie des opportunités
d'amélioration et mesure leur impact sur les projets de vie, sans activer les fonctions religieuses.

## Lot 3.1 — Financial Analysis Engine (`packages/engines/src/analysis.ts`)

**Un seul compartiment par opération**, donc aucun double comptage :

| Compartiment | Règle |
| --- | --- |
| Autre devise | Ignorée et comptée à part (aucune conversion implicite) |
| Transfert | Catégorie de transfert, **ou** paire débit/crédit de même montant entre deux comptes du foyer à 3 jours au plus |
| Intérêts | Crédit marqué intérêt : hors revenus (suivi par la purification si elle est activée) |
| Remboursement | Crédit sur une catégorie de dépense : déduit de cette catégorie, jamais compté comme revenu |
| Revenu régulier | Série récurrente de crédits, ou salaire / allocations familiales |
| Revenu exceptionnel | Tout autre crédit |
| Charge fixe | Nature choisie par le foyer, sinon série récurrente (charge fixe, abonnement), sinon nature de la catégorie |
| Dépense variable | Autres débits |
| Dépense exceptionnelle | Débit variable non récurrent, d'au moins 300 € et d'au moins 3 fois la médiane mensuelle de sa catégorie |

« Essentiel » est un **attribut** de la catégorie, pas un compartiment : la dépense essentielle est une partie des dépenses fixes, variables ou exceptionnelles.

**Récurrences**
- Regroupement par contrepartie ou libellé normalisé (sans nombres), même sens, montant à ±10 %.
- Cadence mensuelle (25 à 35 jours, 3 occurrences au moins) ou annuelle (350 à 380 jours, 2 au moins).
- Pour chaque série : abonnement, charge fixe, dépense régulière ou revenu, avec la prochaine échéance attendue.
- Le foyer peut écarter une série (« Pas récurrent »).

**Capacité d'épargne** (médianes sur les mois complets couverts par les données)
- **Observée** : solde réel médian, exceptionnels compris.
- **Estimée** : revenus réguliers − charges fixes − dépenses variables, hors exceptionnels.
- **Moins de 3 mois complets** : `insufficient`. Aucun chiffre, aucune simulation, aucune recommandation chiffrée.
- **Fiabilité** : faible (3 mois), moyenne (4 ou 5 mois), élevée (6 mois).

**Autres sorties de l'analyse**
- **Dépassements** sur les 3 derniers mois. Le plafond appliqué est celui du mois ou, à défaut, le dernier fixé avant ce mois (reconduit).
- **Concentration** : première catégorie variable non essentielle, en part des dépenses courantes.
- **Réserve** : dépenses essentielles médianes × 3 ou 6 mois. Les comptes retenus sont l'épargne et l'épargne réglementée, modifiables par l'utilisateur sur l'écran Comptes.

## Lot 3.2 — Budget Optimization Engine et « Optimiser mon budget »

Parcours `/budget/optimiser` : **Analyser → Identifier → Simuler → Décider → Suivre**.

| Étape | Contenu |
| --- | --- |
| Analyser | Revenus réguliers, charges fixes, dépenses variables, capacité estimée, répartition, fiabilité |
| Identifier | Principaux postes (médiane mensuelle, nature) et dépenses récurrentes détectées |
| Simuler | Réduction globale, réduction par catégorie, arrêt d'une dépense récurrente. Affiche la situation actuelle, la capacité après scénario, les impacts mensuel et annuel, l'incidence sur la réserve et sur chaque projet (date projetée avant/après, mois gagnés) |
| Décider | Enregistrer le scénario. Sur **double confirmation**, appliquer aux plafonds du mois (`apply_budget_lines`, en une seule transaction) |
| Suivre | Pour chaque scénario enregistré : plafond cible face à la dépense réelle des mois suivants |

**Garanties**
- La simulation tourne dans le navigateur avec le moteur partagé. Elle n'écrit rien : c'est vérifié en base et dans les parcours réels.
- Ajustements plafonnés à la dépense réelle et appliqués dans un ordre fixe (arrêts, catégories, global) : aucune économie comptée deux fois.
- Libellés « simulé » et « projection ». Une économie n'est jamais présentée comme réalisée.
- Les opérations ne sont jamais modifiées. Au moment de décider, le serveur recalcule tout ; aucun chiffre du navigateur n'est enregistré tel quel.

## Lot 3.3 — Recommendation Engine et « Mes recommandations »

| Règle | Déclencheur | Proposition et impact |
| --- | --- | --- |
| R0 | Moins de 3 mois complets | Importer un historique (aucun chiffre) |
| R1 (prioritaire) | Capacité observée négative et au moins 2 des 3 derniers mois en négatif | Retrouver l'équilibre ; déficit mensuel et annuel |
| R2 | Réserve inférieure à la cible | Reconstituer en 12 mois ; impact non chiffré si la capacité ne le permet pas |
| R3 (importante) | Budget dépassé au moins 2 mois sur 3, dépassement d'au moins 10 € et 5 % du plafond | Réduire ou fixer un budget réaliste |
| R4 (utile) | Capacité estimée − engagements (capacité déclarée ou rythme observé des projets) ≥ 50 € | Répartition proposée vers les projets, sinon donner une destination à l'épargne |
| R5 (utile) | Catégorie non essentielle ≥ 25 % des dépenses courantes et ≥ 150 € | Tester −10 % |
| R6 | Au moins 2 abonnements ou 20 €/mois | Revoir les abonnements ; montant présenté comme plafond simulé |

**Contenu et ordre**
- Chaque recommandation contient : constat, données utilisées (avec leur source), proposition, impact simulé et action facultative.
- Ordre : urgence, puis impact annuel, puis code de règle.

**Décisions de l'utilisateur**
- Décisions personnelles : « C'est fait », « Me le rappeler dans un mois », « Écarter », « Réafficher tout ».
- L'empreinte d'une recommandation change avec un palier de montant : une recommandation écartée ne revient que si la situation change.

**Ligne réglementaire** : aucune recommandation ne nomme ni ne conseille un produit financier. Une mention le rappelle sur chaque écran concerné (question Q1 et Q9 du cadrage).

## Lot 3.4 — Tableau de bord et navigation

**Accueil**, dans l'ordre demandé :
1. Ma situation financière : phrase de synthèse, liquidités, patrimoine, mois en cours.
2. Évolution des revenus et dépenses : graphique, avec un tableau équivalent.
3. Capacité d'épargne : estimée, observée, réserve.
4. Mes recommandations : les 3 prioritaires.
5. Mes projets : avancement, date projetée.
6. Mes prochaines actions : issues des recommandations et, avec le consentement, de la purification.

**Navigation**
- 5 entrées : Accueil, Budget, Projets, Patrimoine, Finance islamique.
- Zakat et purification sont regroupées dans Finance islamique.
- Budget gagne les sections Évolution, Charges récurrentes et Mes données, ainsi que le bouton « Optimiser mon budget ».

**Positionnement**
- Tout fonctionne sans consentement religieux.
- Avec le consentement : les blocs Zakat et purification, les objectifs Hajj et Omra (pris en compte dans les engagements de R4) et les actions de purification apparaissent. Les règles de consentement et de RLS sont inchangées.

## Données (migration 0014)

| Objet | Sécurité |
| --- | --- |
| `categories.default_nature` (référentiel fixe / variable) | Référence |
| `household_category_settings` | RLS foyer ; catégorie visible exigée |
| `accounts.counts_as_reserve` | RLS foyer existante |
| `budget_scenarios` (ajustements, référence de suivi) | RLS foyer ; contenu figé, seul le marquage « appliqué » est possible |
| `recurring_feedback` | RLS foyer |
| `recommendation_feedback` | Personnelle (`user_id = auth.uid()`), effacée avec le compte |
| `apply_budget_lines()` | Transaction unique, catégories de dépense visibles, montants ≥ 0, mois valide, scénario du même foyer |

## Corrections de revue (finalisation du Sprint 3)

### 1. Virements internes fiabilisés
- `matchInternalTransfers()` remplace la détection binaire. Candidats : montants opposés égaux, même devise, deux comptes différents du foyer, 3 jours au plus, opérations de catégorie neutre (`divers` / `autres_revenus`), non catégorisées ou de transfert. Une catégorie reconnue (salaire, loyer, alimentation…) ou des intérêts excluent l'opération.
- Score de preuve : catégorie de transfert +2, IBAN de la contrepartie = compte du foyer +2, libellé de virement interne +1 par côté, même jour +1.
- Statuts : **confirmé** (score ≥ 2 et appariement univoque, ou confirmation de l'utilisateur) → neutralisé ; **incertain** (preuve insuffisante ou plusieurs appariements possibles) → les deux opérations restent comptées normalement et la paire apparaît dans « Virements à confirmer » (page Budget). Un rejet de l'utilisateur écarte la paire.
- `detectInternalTransfers()` ne renvoie plus que les paires confirmées.
- Migration `20261120000015_transfer_decisions.sql` : décisions de l'utilisateur, RLS par foyer, clés étrangères composites vers les opérations du même foyer.
- Tests : vrais virements (libellé, IBAN, catégorie), opérations similaires qui n'en sont pas (paiement + remboursement, catégories reconnues, intérêts), cas ambigus, décisions confirmées/rejetées.

### 2. Simulation sans double allocation
- `simulateScenario()` distingue désormais :
  - la **capacité** : estimée, déjà engagée (rythmes des objectifs), réellement disponible avant / après scénario ;
  - l'**allocation globale** : `allocateShortfalls()` répartit la capacité disponible entre les objectifs (en retard, puis à la traîne, puis par échéance) ; la somme allouée ne dépasse jamais la capacité, l'économie potentielle n'est donc comptée qu'une fois ;
  - les **simulations individuelles** : « si toute l'économie allait à cet objectif », marquées exclusives et non cumulables (affichées repliées).
- Tests : somme des gains alloués ≤ économie potentielle, allocation + non alloué = disponible, capacité engagée supérieure à l'estimation.

### 3. Couverture des données
- Une période n'est plus supposée complète parce que les opérations couvrent plusieurs mois. `assessCoverage()` vérifie chaque compte courant ou carte : mois manquant dans sa période, relevé arrêté plus de 10 jours avant la fin du mois, compte sans opérations ensuite. Ces mois sont marqués incomplets et exclus des calculs (capacité, variations, concentration). Un compte sans opération ou commençant plus tard est signalé.
- Statut : complet / partiel / insuffisant (moins de 3 mois complets), affiché sur le tableau de bord, la page Budget et « Optimiser » ; les mois incomplets sont grisés dans les graphiques.

### 4. CI
- La CLI Supabase est figée en **3.2.0** (les deux occurrences de `version: latest`), version vérifiée par l'étape `supabase --version` lors de la CI précédente. Cela supprime aussi les échecs « rate limit exceeded » de la résolution de `latest`.
- Le test de bout en bout « virement incertain » attend la fin de l'import avant de quitter la page.

## Validation

| Niveau | Contenu |
| --- | --- |
| Moteurs | 30 tests : compartiments et bouclage mois par mois, récurrences (mensuelle, annuelle, écartée, montants irréguliers), virements internes, capacités, données insuffisantes, budget reconduit, réserve, simulation, plafonnement, absence de mutation, réallocation, suivi, plafonds de décision, R0 à R6, pertinence, hiérarchie, décisions |
| Application | Textes des recommandations, prochaines actions, intégration religieuse conditionnelle |
| SQL | `financial_analysis.test.sql` : référentiel, RLS des 4 tables, contenu figé, application atomique, refus (catégorie de revenu, montant négatif, mois invalide, autre foyer, scénario d'un autre foyer), opérations jamais modifiées, décisions personnelles, suppression de compte |
| Parcours réels | Sans historique (R0 seul), import de 6 mois, tableau de bord, récurrences, simulation sans écriture, refus sans confirmation, application et suivi, recommandations expliquées, écartées, réaffichées, isolation, intégration religieuse après consentement |
| Démonstration | Écrans Optimiser et Recommandations, nouveau tableau de bord, navigation, contraste, mise en page mobile |

## Limites et suites

- **Plafond de catégorie :** l'application d'un scénario crée un plafond pour le mois en cours. Les mois suivants le reprennent (budget reconduit) jusqu'à un nouveau plafond.
- **Rythme d'épargne :** le moteur d'objectifs garde son rythme actuel (capacité déclarée ou affectations observées). L'objectif universel et l'Aïd arrivent au Sprint 4.
- **Dettes :** la recommandation R8 attend le Sprint 6 et des données de crédit complètes.
- **Validation juridique :** la mention réglementaire et le caractère non personnalisé quant aux produits restent à faire confirmer par le juriste (questions Q1 et Q9).
