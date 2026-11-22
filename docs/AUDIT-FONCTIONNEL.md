# Amanah Finance — audit fonctionnel et recette de bout en bout

État audité : `main` après fusion du lot 3 (`6deaec7`), 22 novembre 2026.
Méthode : lecture du code (écrans, actions serveur, règles d'accès), **exécution réelle** en CI
(Supabase local, navigateur Chromium) d'une recette avec une famille fictive et d'un inventaire
automatique des écrans pour trois profils : démonstration, propriétaire du foyer, membre en lecture
seule. Tous les chiffres de ce document proviennent de ces exécutions (relevés `recette-famille.json`,
`audit-*.json` du journal de CI, branche `recette-fonctionnelle`, PR #20). Aucune correction générale
n'a été faite ; seul le correctif demandé sur `/purification` est préparé (PR #21, non fusionnée).

---

## 1. Synthèse

| | Constat |
|---|---|
| Parcours de la famille fictive | **Réalisable de bout en bout sans erreur** en mode réel : comptes, import de 6 mois, projets, plan d'épargne, affectation, simulation, Zakat, dons, Zakat al-Fitr, purification, préférences. |
| Cohérence des montants | **Bonne sur les calculs** : capacité, plan, projets, Zakat, solidarité et purification concordent entre accueil, Projets, plan d'épargne, Mes engagements, Dons et détail Purification, y compris après rechargement. |
| Points bloquants pour une V1 | Formulaires d'écriture visibles en lecture seule sur 12 écrans ; incohérence entre plan d'épargne et parcours des projets ; année erronée des projets annuels créés depuis le catalogue ; patrimoine non saisissable sans consentement religieux ; absence d'invitation au foyer ; opérations importées non recatégorisables. |
| Sécurité | Aucune écriture interdite n'aboutit : les actions serveur et la RLS refusent tout ce que l'interface montre à tort. Les anomalies sont d'ergonomie, pas de sécurité. |

Anomalies : **0 critique, 6 majeures, 6 moyennes, 4 mineures** (section 5).

---

## 2. Matrice fonctionnelle

Catégories : **F** fonctionnelle · **P** partiellement fonctionnelle · **C** consultation uniquement · **N** non développée.
CRUD : C création, M modification, S suppression (« — » : aucune).
Persistance : base Supabase (réel) ; cookie du navigateur (démonstration, quand l'écriture y existe).
Lecture seule : visibilité des formulaires d'écriture pour un membre `viewer` (relevé automatique).

### 2.1 Pilotage et budget

| Écran / fonction | Réel | Démo | CRUD (réel) | Interactions | Lecture seule | Tests | Classe |
|---|---|---|---|---|---|---|---|
| **Accueil** — situation, capacité (observée, retenue, non affectée), engagements, projets, calendrier, patrimoine, prochaines actions | F | F (données fictives) | préférence d'affichage (M) | lit tous les modules | correct (seule la préférence, personnelle) | `accueil` démo et réel, `recette` | **F** |
| Accueil — affichage Islamic-first / analytique | F (base, persistant) | F (cookie) | M | — | correct | `accueil`, `recette` (rechargement) | **F** |
| **Budget** — mois en cours, catégories, opérations, évolution 6 mois, récurrents, virements internes | F | C | opérations C/S, budgets C/M, catégories C, nature C/M, « pas récurrent », virements à confirmer | plan d'épargne (rappel), recommandations | **formulaires visibles** (refusés au serveur) | `sprint3`, `parcours` | **P** : pas de modification ni de recatégorisation d'une opération ; dates « prochaine échéance » passées (B2) |
| **Optimiser mon budget** — scénarios | F (simulation + enregistrement) | P (simulation, bouton d'enregistrement refusé) | scénarios C | budget | **formulaire visible** | `sprint3` | **F** réel / **P** démo |
| **Plan d'épargne** — capacité déclarée, répartition par projet, priorités, dépassement | F | F (cookie) | M | projets, accueil, budget, R7 | **formulaires visibles** | `sprint5`, `recette` | **F** |
| **Comptes** — création, solde de départ, réserve de précaution | F | C | C, réserve M ; **ni renommage, ni archivage, ni suppression** | import, budget, Zakat, patrimoine | **formulaires visibles** | `parcours`, `sprint3`, `recette` | **P** |
| **Import CSV** — aperçu, doublons, confirmation, détection des intérêts | F | C (désactivé, expliqué) | C | budget, purification | **formulaire visible** | `sprint2`, `sprint3`, `recette` | **F** |
| **Patrimoine** — actifs, dettes, patrimoine net | C | C | **aucune saisie sur cet écran** (biens et dettes saisis dans Zakat, sous consentement) | accueil, Zakat | — | `recette` (relevé) | **C** ; investissements et succession : **N** (annoncés) |
| **Recommandations** — R0 à R7, impact, retours | F | C (retours désactivés) | retours M (personnels) | accueil, projets | correct (personnel) | `sprint3`, `sprint5` | **F** |

### 2.2 Projets de vie

| Écran / fonction | Réel | Démo | CRUD (réel) | Interactions | Lecture seule | Tests | Classe |
|---|---|---|---|---|---|---|---|
| **Projets** — liste, synthèse, suggestions (reporter, écarter) | F | F (cookie) | décisions de suggestion M | accueil, calendrier, plan | **formulaires visibles** | `sprint5`, `suggestions` démo et réel | **F** |
| **Ajouter un objectif** — libre ou depuis le catalogue (3 étapes) | F | F (cookie) | C | plan, accueil | **formulaire visible** | `sprint5`, `demo-interactive`, `recette` | **P** : année et date erronées depuis le catalogue pour un projet annuel (A2) |
| **Fiche projet (Journey)** — Créer, Planifier, Simuler, Suivre, Réaliser ; affectations, historique, pause, archivage, reconduction | F | F (cookie) | M, affectation C, statut M ; **pas de suppression** (archivage) | plan, accueil, calendrier, R7 | **formulaires visibles** | `sprint5`, `recette` | **P** : étape « Planifier » toujours demandée après enregistrement du plan d'épargne (A4) |
| **Aïd al-Adha** — budget, date estimée puis confirmée, reconduction | F | F (cookie) | C/M | calendrier, plan | **formulaire visible** | `sprint5`, `demo-interactive`, `recette` | **F** |
| **Calendrier familial** — dates indicatives, confirmation religieuse, correction scolaire, échéances personnelles | F | F (cookie) | C/S, corrections M | projets, suggestions, accueil | **formulaires visibles** | `suggestions`, `recette` | **P** : un projet « Rentrée » créé depuis le catalogue n'est pas relié à l'événement (A2) |
| **Préférences des suggestions** | F | F (cookie) | M | suggestions, calendrier | **formulaire visible** | `suggestions` | **F** |
| **Explorer les solutions** | C | C | — | fiche projet | — | `sprint5` | **N** (« Bientôt disponible », aucun partenaire) |

### 2.3 Finance islamique

| Écran / fonction | Réel | Démo | CRUD (réel) | Interactions | Lecture seule | Tests | Classe |
|---|---|---|---|---|---|---|---|
| **Mes engagements / Finance islamique** | F | F (lecture) | partage M, retrait | Zakat, purification, dons, accueil | correct (libellés de consultation, lot 3) | `lot3`, `lot3-foyer`, `recette` | **F** |
| **Zakat** — choix méthodologiques, prix des métaux avec source, biens et dettes, calcul figé, historique | F | C | réglages M, prix C/S, biens C/S, dettes C/S, calcul C ; **pas de modification d'un bien** | dons, engagements, accueil, patrimoine | correct | `sprint4`, `lot3`, `recette` | **F** |
| **Zakat al-Fitr** | F | C | C/S | dons | correct | `sprint4`, `recette` | **F** (libellé « Payé », B1) |
| **Purification** — détection, examen, méthodologie, enregistrement | F | C (opérations détectées) | décisions M, purification C | import, dons, engagements | **méthodologie et détection visibles** → correctif PR #21 | `sprint2`, `lot3-foyer`, `recette` | **F** |
| **Dons et Sadaqah** — déclaration, affectation Zakat / Fitr, rapprochement | F | C | C/S, rapprochement M | Zakat, Fitr, purification, engagements | correct | `sprint4`, `lot3`, `recette` | **F** (libellé « payé », B1) |
| Provision virtuelle de Zakat | N | N | — | — | — | — | **N** (masquée faute de source) |
| Screening des fonds, conformité des placements | N | N | — | — | — | — | **N** (chantier dédié) |

### 2.4 Compte, foyer et transversal

| Écran / fonction | Réel | Démo | CRUD | Lecture seule | Tests | Classe |
|---|---|---|---|---|---|---|
| Inscription, confirmation, connexion, mot de passe oublié | F | — | — | — | `parcours` | **F** |
| Consentements (conditions, confidentialité, article 9) et retrait | F | — (toujours actif en démo) | M | correct | `parcours`, `sprint2`, `lot3`, `accueil` | **F** |
| Profil, région, suppression du compte | F | — | M/S | région réservée au propriétaire | `parcours` | **F** |
| **Foyer à plusieurs membres** : rôles, partage religieux | P | — | — | — | SQL, `lot3-foyer` (par fixture) | **P** : **aucun parcours d'invitation** ; les fonctions de foyer ne sont pas atteignables par un utilisateur (A5) |
| Export de mes données (portabilité) | N | N | — | — | — | **N** |
| Navigation, actions rapides « + », menu profil | F | F | — | « + » masqué en lecture seule | `navigation`, `lot3`, `lot3-foyer`, `recette` | **F** |
| Date simulée, réinitialisation | — (404) | F | — | — | `demo-interactive` | **F** (démo seulement) |
| Hors ligne (PWA) | F | F | — | — | `pwa` | **F** |

---

## 3. Recette de bout en bout — famille fictive

Données saisies **par les parcours de l'application** (aucune valeur codée dans les composants) :
revenus 4 500 €/mois et dépenses 3 600 €/mois (relevé CSV fictif de 6 mois complets + début du mois),
capacité retenue 650 €, épargne existante 8 000 € (compte d'épargne), Omra 5 000 € (2 000 € déjà
disponibles), Aïd 500 € (350 € sacrifice + 150 € frais), Rentrée scolaire 900 €.
Plan d'épargne : Omra 250 €, Aïd 50 €, Rentrée 150 € par mois. Affectation : +300 € sur l'Omra.

| # | Étape | Résultat |
|---|---|---|
| 1 | Inscription, profil, consentement article 9 | ✓ |
| 2 | Comptes : courant 0 €, épargne 8 000 € ; import de 62 opérations | ✓ « 62 importées, 1 intérêt proposé à la purification » ; courant 9 912,34 € (6 × 900 + 4 500 + 12,34) |
| 3 | Omra 5 000 € (2 000 € disponibles, 250 €/mois) | ✓ effort nécessaire 125 €/mois, atteinte novembre 2027 |
| 4 | Aïd : 350 + 150 € | ✓ coût total 500 €, date estimée 17 mai 2027 (non officielle) ; 50 €/mois < 100 € nécessaires → « En retard », R7 |
| 5 | Rentrée scolaire depuis le catalogue, 900 € | ⚠ nommée « Rentrée scolaire **2026** », date **22 novembre 2028** (A2) |
| 6 | Plan : capacité 650 €, 450 € affectés | ✓ « Restant libre 200 € », « Plan équilibré » |
| 7 | Affectation +300 € sur l'Omra ; simulation 300 / 150 € | ✓ 2 300 € affectés ; scénarios 9 et 18 mois, rien enregistré avant le choix |
| 8 | Rechargement de l'accueil | ✓ valeurs identiques ; préférence d'affichage conservée |
| 9 | Zakat sans prix, puis prix de l'argent 1,30 €/g, nisab argent, année lunaire | ✓ incomplète puis « Exigible » : assiette 17 912,34 €, nisab 773,50 €, dû 447,81 € (2,5 %) |
| 10 | Dons : Zakat 100 € (affectée au calcul), Sadaqah 50 € | ✓ restant 347,81 € identique sur Mes engagements et l'accueil |
| 11 | Zakat al-Fitr : 5 personnes × 10 € | ✓ dû 50 € (aucun montant imposé) |
| 12 | Purification : confirmation, méthodologie « net crédité », enregistrement | ✓ 12,34 € à purifier, puis purifié ; solidarité 162,34 € |
| 13 | Actions rapides, navigation | ✓ 6 actions, 5 entrées, liens valides |

---

## 4. Cohérence des montants financiers

| Grandeur | Accueil | Projets | Plan d'épargne | Fiche projet | Autres écrans | Verdict |
|---|---|---|---|---|---|---|
| Excédent observé | 900 €/mois | — | 900 € (avant déclaration) | « capacité estimée 900 € » | budget : 6 mois complets | ✓ |
| Capacité retenue | 650 € | 650 € | 650 € « déclarée par vous » | 650 € | budget : 650 € | ✓ |
| Mensualités prévues | — | 450 € | 450 € | 250 / 50 / 150 € | budget : 450 € « pas des dépenses » | ✓ |
| Capacité libre | 200 € | 200 € | 200 € | Omra : 450 € (650 − 200 des autres) | — | ✓ (définition par projet explicitée) |
| Épargne affectée Omra | 2 300 € / 5 000 €, 46 % | 2 300 € | effort 112,50 € | historique 2 000 + 300 | « argent réellement détenu 17 912,34 €, dont 2 300 € affectés » | ✓ |
| Patrimoine net | — | — | — | — | Patrimoine 17 912,34 € = comptes = assiette Zakat | ✓ |
| Zakat restante | 347,81 € | — | — | — | Mes engagements 347,81 € ; Zakat : dû 447,81 € | ✓ |
| Solidarité 2026 | — | — | — | — | Mes engagements 162,34 € = somme des types = Dons | ✓ |
| Purification | « à examiner » 12,34 € puis 0 | — | — | — | détail et Mes engagements identiques | ✓ |
| Calendrier ↔ projets | Aïd relié au projet | — | — | — | Rentrée 30 août 2027 **non reliée** au projet « Rentrée scolaire 2026 » daté 2028 | ✗ (A2) |
| Plan ↔ parcours du projet | « Valider mon plan d'épargne » sur les 3 projets | idem | plan enregistré | « Planifier (conseillée) » | — | ✗ (A4) |

Point méthodologique à soumettre (pas une anomalie) : l'assiette de la Zakat inclut les 12,34 €
d'intérêts confirmés à purifier. Selon les avis, ces montants ne sont pas un bien possédé et pourraient
être exclus : décision à prendre dans la gouvernance des méthodologies.

---

## 5. Anomalies classées par gravité

### Majeures

| # | Anomalie | Preuve | Correction proposée |
|---|---|---|---|
| A1 | **Lecture seule : formulaires d'écriture visibles** sur Budget, Optimiser, Plan d'épargne, Comptes, Import, Projets (suggestions), Ajouter un objectif, Aïd, Calendrier, Préférences, Fiche projet, Purification. Les actions sont refusées au serveur, mais l'utilisateur ne le découvre qu'après envoi. | `audit-reel-lecture-seule.json` | Règle commune `canWrite` sur chaque écran (comme Zakat, Fitr, Dons, Mes engagements) ; **Purification : PR #21 prête**. |
| A2 | **Projet annuel créé depuis le catalogue** : l'année par défaut est l'année en cours même si l'événement est passé → « Rentrée scolaire 2026 » daté 2028, non relié au calendrier (Ramadan, Aïd al-Fitr, vacances : même cause). Les suggestions, elles, transmettent la bonne année. | recette étape 5, calendrier | Prendre la prochaine occurrence à venir quand `annee` est absent. |
| A3 | **Patrimoine non saisissable sans consentement religieux** : biens (or, immobilier, véhicule…) et dettes ne se saisissent que dans Zakat. Sans consentement, le patrimoine se limite aux comptes. | code, recette (Patrimoine = comptes) | Saisie des biens et dettes dans Patrimoine (données générales), réutilisées par la Zakat avec consentement. |
| A4 | **Plan d'épargne et parcours du projet incohérents** : après enregistrement du plan (montants mensuels par projet), chaque projet reste à « Planifier (conseillée) » et l'accueil comme Projets proposent « Valider mon plan d'épargne ». | recette étapes 6 à 8 | Considérer l'étape « Planifier » faite quand le plan d'épargne fixe une mensualité au projet, ou fusionner les deux validations. |
| A5 | **Pas d'invitation au foyer** : rôles, partage religieux et lecture seule existent en base mais aucun parcours ne permet d'ajouter un membre. | code | Invitation par e-mail avec rôle, acceptation, départ du foyer. |
| A6 | **Opérations non modifiables** : une opération importée ou saisie ne peut être ni recatégorisée ni corrigée (seulement supprimée) ; un compte ne peut être ni renommé ni archivé. Le budget dépend alors entièrement de la catégorisation automatique. | code, inventaire | Modifier la catégorie et la description d'une opération ; renommer et archiver un compte. |

### Moyennes

| # | Anomalie | Correction proposée |
|---|---|---|
| B1 | Vocabulaire « Payé / payé » pour des contributions **déclarées** (Zakat : historique ; Zakat al-Fitr ; Dons : Zakat et Fitr), alors que Mes engagements dit « déclarées ». | « Déclaré » partout, « rapproché » et « confirmé » distincts. |
| B2 | Charges récurrentes : « prochaine échéance attendue » dans le passé (2 novembre au 22 novembre) et salaire du mois importé signalé « plus observé récemment ». | Prochaine date à venir ; tenir compte du mois en cours. |
| B3 | Biens et dettes de la Zakat : ajout et suppression seulement, pas de modification de valeur. | Modification avec historique. |
| B4 | Démonstration, Optimiser : bouton « Enregistrer le scénario » visible mais refusé (une note l'explique). | Masquer le bouton en démonstration. |
| B5 | Aïd : la mensualité proposée par l'assistant peut être inférieure au besoin, le projet naît « En retard ». | Proposer la mensualité nécessaire par défaut. |
| B6 | Absence d'export des données (portabilité RGPD). | Export JSON / CSV depuis Paramètres. |

### Mineures

| # | Anomalie |
|---|---|
| C1 | `/simulation` répond 404 en mode réel (normal, mais une page explicative serait plus claire si le lien est partagé). |
| C2 | Fiche projet : « Suivre (fait) » affiché alors que « Planifier » ne l'est pas (ordre des étapes peu lisible, lié à A4). |
| C3 | Budget en milieu de mois : « Dépenses du mois 0 € » sans rappel des charges attendues restantes. |
| C4 | Explorer les solutions : écran « Bientôt disponible » atteignable depuis chaque projet réalisé. |

---

## 6. Écarts entre démonstration et mode réel

| Domaine | Démonstration | Mode réel |
|---|---|---|
| Compte, connexion, consentements | aucun ; fonctions religieuses toujours actives | complets, consentement article 9 distinct et révocable |
| Projets, Aïd, plan d'épargne, calendrier, préférences, suggestions | **modifiables**, conservés dans le navigateur (cookie), réinitialisables | modifiables, base de données |
| Date de référence | simulable (`/simulation`) | date du jour |
| Comptes, opérations, budgets, catégories, récurrents, virements | consultation | création, suppression (pas de modification) |
| Import CSV | désactivé (expliqué) | complet |
| Optimiser | simulation seule | simulation et enregistrement |
| Zakat, Zakat al-Fitr | consultation d'un calcul fictif | réglages, prix, biens, dettes, calcul figé, historique |
| Dons | consultation | déclaration, affectation, rapprochement |
| Purification | opérations détectées, aucune décision | détection, décisions, méthodologie, enregistrement |
| Recommandations | consultation | retours enregistrés |
| Paramètres | absents (redirection) | profil, consentements, suppression du compte |
| Foyer, rôles, partage | absents | en base, sans invitation (A5) |
| Libellés d'action | « Examiner les opérations fictives », « Consulter le calcul fictif », « Voir les dons » | selon le rôle (lot 3) |

---

## 7. Analyse des parcours utilisateurs

1. **Premier lancement** : inscription → consentements → profil → accueil de bienvenue avec 5 premières
   démarches réelles. Clair. Manque : pas d'invitation du conjoint (A5).
2. **Mettre en place son budget** : comptes → import → budget. Fonctionne ; la qualité dépend de la
   catégorisation automatique, non corrigible (A6). Les dates de récurrence passées brouillent la lecture (B2).
3. **Préparer ses projets** : création (libre ou catalogue) → plan d'épargne → affectations → suivi.
   Calculs justes et cohérents ; deux frictions : l'année des projets annuels du catalogue (A2) et la
   double validation plan / projet (A4).
4. **Patrimoine** : seuls les comptes sont visibles sans consentement religieux (A3) ; avec
   consentement, les biens se saisissent dans Zakat, ce qui n'est pas intuitif.
5. **Engagements islamiques** : Zakat, dons, Zakat al-Fitr, purification et Mes engagements forment
   un parcours complet et cohérent ; vocabulaire « payé » à harmoniser (B1).
6. **Foyer** : en lecture seule, beaucoup de formulaires inutilisables restent visibles (A1).

---

## 8. Corrections prioritaires proposées

| Ordre | Correction | Anomalies | Effort indicatif |
|---|---|---|---|
| 1 | Gating lecture seule sur tous les écrans (Purification déjà prête, PR #21) | A1 | moyen |
| 2 | Cohérence plan d'épargne ↔ parcours du projet | A4, C2 | moyen |
| 3 | Prochaine occurrence pour les projets annuels du catalogue | A2 | faible |
| 4 | Modification des opérations (catégorie, description) et des comptes (renommer, archiver) | A6 | moyen |
| 5 | Vocabulaire « déclaré / rapproché / confirmé » partout | B1 | faible |
| 6 | Dates des charges récurrentes | B2 | faible |
| 7 | Saisie des biens et dettes dans Patrimoine, indépendante du consentement | A3, B3 | élevé |
| 8 | Invitation au foyer (rôle, acceptation, départ) | A5 | élevé |
| 9 | Export des données | B6 | moyen |
| 10 | Finitions démonstration et Aïd | B4, B5, C1, C3, C4 | faible |

## 9. Recommandation pour une première version utilisable

**Indispensable avant une V1 (utilisable sans accompagnement)** : corrections 1 à 6 (cohérence,
fiabilité du budget, lecture seule, vocabulaire), puis 7 (patrimoine complet) — sans elles, un
utilisateur rencontre des écrans contradictoires ou des données qu'il ne peut pas corriger.

**Nécessaire pour un produit « foyer »** : 8 (invitation) et 9 (export, exigence RGPD de portabilité
avant toute ouverture au public).

**Peut attendre la V1** : provision virtuelle de Zakat, screening des fonds, solutions partenaires,
investissement, retraite et succession (non commencés, conformément à vos instructions).

Prérequis hors produit, inchangés : validation juridique des textes (marqués provisoires), validation
des méthodologies religieuses par une autorité qualifiée, aucune banque réelle, aucun paiement, aucun
déploiement public sans autorisation.

---

## 10. Tests disponibles

- Unitaires : moteurs 153, banking 13, application 152.
- SQL et RLS : 17 fichiers (PostgreSQL 16 et image Supabase réelle), dont confidentialité religieuse,
  isolation entre foyers, intégrité du foyer partagé, périmètre personnel de la purification.
- Playwright démonstration : `smoke`, `screens`, `responsive`, `pwa`, `accueil`, `navigation`,
  `suggestions`, `demo-interactive`, `audit-demo` (inventaire).
- Playwright mode réel : `parcours`, `sprint2` à `sprint5`, `suggestions`, `accueil`, `lot3`,
  `lot3-foyer`, `recette-famille`, `audit-reel` (inventaire propriétaire et lecture seule).
- Non couverts automatiquement : invitation au foyer (inexistante), export (inexistant).
