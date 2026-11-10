# Sprint 2 — cahier des charges : Zakat, purification, dons, dashboard, import CSV

**Statut : à valider. Aucun développement n'est commencé.**
Objectif : livrer les modules qui différencient le produit, en réutilisant les moteurs existants
(`packages/engines` : Zakat, purification, budget, objectifs, patrimoine, CSV) et la couche
`packages/banking` (pipeline d'import), sans reconstruire de module.

Durée estimée : **3 semaines** (le périmètre dépasse un sprint de 2 semaines ; découpage proposé au §8).

## 0. Lot 0 — consentement par fonction (prérequis)

Mettre en œuvre les ajustements de `CONSENTEMENTS-ANALYSE.md` §3 avant d'exposer de nouvelles données religieuses :
consentement article 9 à l'activation des fonctions religieuses, retrait ciblé, garde SQL par fonction.

| Critère d'acceptation |
| --- |
| Un utilisateur sans consentement article 9 utilise comptes, budget et dashboard ; Zakat, purification, Hajj et dons religieux lui sont fermés, côté interface ET côté base |
| Le retrait désactive uniquement ces fonctions et propose la suppression de leurs données |
| Tests SQL : lecture et écriture d'une donnée religieuse refusées sans consentement en vigueur |

## 1. Zakat

**Réutilise** : `calculateZakat`, `priceStatus`, référentiel `amanah-zakat 1.0.0`, tables `zakat_settings`,
`zakat_calculations` (figées), `market_prices`, `assets`, `liabilities`, vue `account_balances`.

| Fonction | Détail |
| --- | --- |
| Réglages | Base du nisab (or ou argent), année lunaire ou solaire, date de début du Hawl, options (bijoux, placements, pensions bloquées, dettes) — **aucune valeur choisie par défaut** |
| Patrimoine | Saisie et modification des actifs (dont or et argent au poids) et des dettes avec échéances à 12 mois |
| Prix des métaux | Saisie datée par un administrateur (aucune API payante) ; prix ancien = statut « à déterminer » |
| Calcul | Aperçu en direct ; enregistrement d'un calcul figé (entrées, référentiel, version du moteur, résultat, raisons) |
| Détail | Ligne par ligne : valeur, montant retenu, règle, référence ; avertissements ; raisons « à déterminer » |
| Historique | Liste des calculs enregistrés, consultation, comparaison d'une année à l'autre |
| Paiement | Lien entre un calcul et les contributions de type Zakat (§3) : montant dû, payé, reste |

Critères : un calcul enregistré se relit à l'identique ; le statut « exigible » n'apparaît jamais sans nisab, prix
récent et Hawl établis ; la mention « estimation, ni fatwa ni certification » est visible sur chaque écran.

## 2. Purification du Riba

**Réutilise** : `detectInterest`, `resolveInterestAmounts`, `purificationAmount`, `summarizePurification`,
`canTransition`, table `purification_items` (contraintes brut / net / précompte de la migration 0007).

| Fonction | Détail |
| --- | --- |
| Détection | Sur les transactions saisies ou importées ; création des éléments « détectés » sans doublon |
| Revue | Confirmer ou rejeter chaque élément ; saisir le brut ou le précompte s'ils sont connus |
| Base | Choix explicite de l'utilisateur (brut ou net crédité), mémorisé comme préférence modifiable ; aucune base par défaut |
| Purification | Rattacher un ou plusieurs éléments à une contribution de type purification ; statut « purifié » définitif |
| Synthèse | Détecté, à déterminer, à purifier, purifié, rejeté ; distinction explicite avec Zakat et Sadaqah |

Critères : un élément ne passe à « purifié » qu'avec un montant déterminé et un don lié (moteur et base) ;
le rejet est réversible, la purification ne l'est pas.

## 3. Dons et Sadaqah

**Réutilise** : table `contributions` (types Zakat, Zakat al-Fitr, Sadaqah, purification, waqf, autre),
table `organizations` (référentiel non vérifié à ce stade).

| Fonction | Détail |
| --- | --- |
| Saisie | Type, montant, date, bénéficiaire (organisation du référentiel ou libellé libre), note |
| Justificatifs | Téléversement d'un reçu dans un stockage privé (Supabase Storage, bucket privé, accès par foyer) |
| Suivi | Totaux par type et par année ; Zakat payée face à la Zakat calculée ; purifications réalisées |
| Fiscalité | Mention informative de la réduction d'impôt belge pour les dons aux institutions agréées, **sans calcul** (à valider) |

Critères : aucun paiement réel ; un justificatif n'est lisible que par les membres du foyer (test d'isolation sur le stockage).

## 4. Dashboard financier

**Réutilise** : `summarizeMonth`, `planEmergencyFund`, `planGoal`, `computeNetWorth`, `buildSnapshot`.

| Fonction | Détail |
| --- | --- |
| Tendance | Revenus, dépenses et solde sur 6 mois (graphique) |
| Répartition | Dépenses du mois par catégorie, avec budgets |
| Patrimoine | Patrimoine net, part liquide, mention « partiel » si des actifs ne sont pas valorisés |
| Conformité | Statut Zakat, purification à faire, dons de l'année (si consentement article 9) |
| Accessibilité | Chaque graphique a son équivalent en tableau ; contraste AA |

## 5. Import bancaire CSV (préparation PSD2)

**Réutilise** : `parseBankCsv`, profils `CSV_PROFILES`, `previewCsvImport`, `normalizeForImport`, `dedupeHash`,
`categorize`, tables `import_batches` et `transactions`.

| Fonction | Détail |
| --- | --- |
| Téléversement | Fichier CSV traité côté serveur, jamais conservé après l'import ; taille limitée |
| Profil | Choix du profil (générique BE, séparé débit/crédit, international) ; profils BNP Paribas Fortis, KBC, Belfius, ING à établir sur des fichiers d'exemple **fictifs** fournis par le fondateur |
| Aperçu | Lignes lues, erreurs par ligne, doublons détectés, catégories proposées ; rien n'est écrit avant validation |
| Import | Écriture atomique du lot (un seul appel SQL) ; journal du lot (lu, importé, doublons, erreurs) |
| Réimport | Un même fichier importé deux fois n'ajoute aucune ligne |
| Après import | Détection automatique des intérêts → éléments de purification « détectés » |
| PSD2 | Le même pipeline sert de point d'entrée au futur `BankingProvider` ; aucun fournisseur connecté |

## 6. Tests exigés

| Niveau | Contenu |
| --- | --- |
| Moteurs (Vitest) | Cas de référence Zakat fournis par le comité charia ; purification brut/net ; tendances du dashboard |
| SQL | Garde de consentement par fonction ; isolation des calculs, purifications, contributions et justificatifs ; atomicité de l'import |
| E2E réel | Parcours : consentement article 9 → réglages Zakat → calcul enregistré → don Zakat lié ; import CSV fictif → purification détectée → confirmée → purifiée ; utilisateur sans consentement article 9 : fonctions religieuses fermées ; isolation entre deux utilisateurs |
| E2E démo | Écrans enrichis, mobile et ordinateur |

## 7. Hors périmètre

Fournisseur PSD2 réel, paiement des dons, screening des investissements, succession, assistant IA,
calcul fiscal, validation religieuse automatique.

## 8. Découpage proposé

| Semaine | Lots |
| --- | --- |
| 1 | Lot 0 (consentement par fonction) ; import CSV |
| 2 | Purification (alimentée par l'import) ; dons et Sadaqah |
| 3 | Zakat (réglages, calcul, historique, lien avec les dons) ; dashboard ; recette |

## 9. Décisions et contributions attendues du fondateur

| # | Sujet | Bloquant pour |
| --- | --- | --- |
| D1 | Réponses du juriste aux questions de `CONSENTEMENTS-ANALYSE.md` (au minimum Q1 et Q2) | Lot 0 |
| D2 | Comité charia : relecture du référentiel Zakat v1 et cas de référence chiffrés | Zakat (passage du référentiel de « brouillon » à « approuvé ») |
| D3 | Règle de purification (brut ou net) : choix laissé à l'utilisateur ou fixé par le comité | Purification |
| D4 | Exemples d'exports CSV fictifs (structure réelle, données inventées) des 4 grandes banques | Import CSV |
| D5 | Source des prix de l'or et de l'argent (saisie manuelle par un administrateur proposée) | Zakat |
| D6 | Stockage des justificatifs : durée de conservation | Dons |
