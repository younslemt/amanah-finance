# Sprint 0.1 — rapport de consolidation (9 novembre 2026)

Aucun nouveau module n'a été développé. Le travail du Sprint 0 est conservé ; les corrections passent
par de nouvelles migrations (0006 à 0008) et des modifications ciblées du code existant.

## 1. Vérifications : exécuté et non exécuté

L'environnement de préparation n'a pas accès au registre npm (résolution DNS impossible). Les
paquets non préinstallés (Next.js, Vitest, @supabase/ssr, @supabase/supabase-js, @types/react,
@tailwindcss/postcss) n'ont donc pas pu être installés.

| Vérification demandée | Statut | Détail |
| --- | --- | --- |
| Installer les dépendances | **Non exécuté** | Registre npm injoignable |
| Tests avec le véritable Vitest | **Non exécuté** | Exécutés avec `node --test` et un shim de l'API Vitest |
| Compilation Next.js | **Non exécuté** | Next.js absent ; les écrans ont été compilés par esbuild et rendus avec React 19.2 (voir aperçu) |
| TypeScript | **Partiel** | Strict, 0 erreur : engines, banking, logique web (lib, config, messages). Fichiers `.tsx` non vérifiés (pas de @types/react) |
| Tests Playwright | **Exécuté** | Vrai lanceur Playwright 1.63 et Chrome 153, contre l'aperçu statique (pas contre Next.js) : 27 réussis, 1 ignoré par conception |
| Parcours ordinateur et mobile | **Exécuté** | 6 écrans, Pixel 7 et Desktop Chrome : navigation, état actif, absence de défilement horizontal, contraste WCAG AA, aucune erreur console |
| Tests SQL | **Exécuté** | PostgreSQL 16 vierge, 8 migrations, 48 contrôles réussis |

Résultats chiffrés : moteurs 50/50, banking 6/6, logique web 25/25, SQL 48/48, Playwright 27/27
(+1 ignoré : test clavier réservé à l'ordinateur). Total : 156 vérifications automatisées.

## 2. Problèmes identifiés et corrigés

### Sécurité

| # | Problème | Gravité | Correction | Preuve |
| --- | --- | --- | --- | --- |
| S1 | Une ligne du foyer pouvait référencer un enregistrement d'un autre foyer (10 cas : transaction vers compte ou lot d'import, allocation vers objectif, contribution vers calcul de Zakat, purification vers transaction ou contribution, lot vers compte, actif vers compte, compte vers connexion bancaire). La RLS contrôle la ligne écrite, pas la ligne référencée | Critique | Clés étrangères composites `(household_id, id)` (migration 0006, ADR 0005) | 10 tentatives refusées (23503) |
| S2 | `created_by` et `decided_by` fournis par le client (usurpation d'auteur) | Moyenne | Déclencheur `stamp_actor` : valeur imposée par `auth.uid()` | Tests SQL sécurité et intégrité |
| S3 | Le propriétaire pouvait modifier `households.created_by` | Moyenne | Droits de mise à jour limités aux colonnes descriptives | Refus 42501 |
| S4 | Suppression d'un compte (RGPD, art. 17) impossible : le journal en ajout seul bloquait la cascade | Élevée | Journal effacé avec son foyer uniquement ; pas de journalisation des lignes effacées avec le foyer | Effacement complet vérifié |
| S5 | Le rôle `anon` héritait des droits par défaut de Supabase (lecture des catégories système possible) | Faible | Révocation sur toutes les tables, vues et futures tables | Refus 42501 |
| S6 | Fonctions internes (inscription, audit, administration RLS) exécutables par tous | Faible | `revoke execute` | Refus 42501 |
| S7 | En mode réel, un utilisateur connecté voyait les données de démonstration comme les siennes | Élevée | Mode `live` : chargeur Supabase uniquement, jamais de données fictives | Code relu ; chargeur non exécuté (voir §1) |
| S8 | Basculement silencieux en démo si les variables Supabase manquaient en production | Élevée | `resolveAppMode` : mode explicite, refus de démarrer si incohérent | 6 tests |
| S9 | URL de retour du lien magique construite depuis l'en-tête `Origin` (modifiable) | Moyenne | `NEXT_PUBLIC_SITE_URL` ; `localhost` seulement en local | Tests unitaires |
| S10 | Erreurs de connexion non gérées : lien expiré ou invalide non distingués, limitation de débit masquée, faux « lien envoyé » en démo | Moyenne | Codes d'erreur affichables sans détail technique ; connexion désactivée en démo | Tests unitaires et Playwright |
| S11 | Aucune déconnexion | Faible | Route `POST /auth/signout` | Code |
| S12 | Une panne de vérification de session dans le middleware n'était pas traitée | Faible | Échec fermé : utilisateur considéré comme non connecté | Code |
| S13 | Redirection après connexion non prévue (risque de redirection ouverte à l'ajout) | Préventif | `safeRedirectPath` : chemins internes sur liste blanche | 8 cas malveillants refusés |

### Fiabilité financière

| # | Problème | Gravité | Correction |
| --- | --- | --- | --- |
| F1 | Zakat déclarée « exigible » sans date de début du Hawl (simple avertissement) | Élevée | Statut `to_determine` avec raisons ; contrainte SQL : montant dû seulement si `due` |
| F2 | Zakat conclue avec un prix du nisab trop ancien | Élevée | Prix absent, ancien ou futur : pas de conclusion |
| F3 | Créance au remboursement inconnu incluse d'office | Moyenne | Non retenue, signalée ; conclusion suspendue si elle peut changer le résultat |
| F4 | Base du nisab obligatoire dans le code, donc forcément choisie à la place de l'utilisateur en mode réel | Moyenne | Base facultative : non choisie, la Zakat reste à déterminer |
| F5 | Métal évalué au poids : plantage si son prix manquait | Moyenne | Ligne « prix indisponible », conclusion suspendue |
| F6 | Purification : un seul montant, base nette implicite | Élevée | Brut, précompte et net distingués ; aucune base imposée ; « purifié » impossible sans montant déterminé (moteur et SQL) |
| F7 | Budget : un remboursement était compté comme un revenu | Moyenne | Déduit de la catégorie de dépense |
| F8 | Budget : montants de devises différentes additionnés | Moyenne | Opérations hors devise exclues et comptées |
| F9 | Objectif « en bonne voie » sans aucun rythme d'épargne connu | Moyenne | Rythme observé sur 3 mois ; sinon « rythme à déterminer » |
| F10 | Patrimoine net dérivé des lignes de Zakat ; actif non valorisé compté pour zéro en silence | Moyenne | Moteur `computeNetWorth` ; total marqué « partiel » |
| F11 | Soldes bancaires comptés deux fois (compte et actif saisi) | Moyenne | Le solde du compte est la seule source ; l'actif lié est ignoré |
| F12 | Soldes calculés côté application : faux au-delà de 1 000 transactions (plafond de l'API) | Préventif | Vue SQL `account_balances` soumise à la RLS ; historique paginé |

### Interface

| # | Problème | Correction |
| --- | --- | --- |
| U1 | Pas d'icône d'onglet : erreur 404 dans la console | Icônes générées depuis la marque, déclarées dans les métadonnées |
| U2 | Nom et couleurs codés en dur dans une dizaine de fichiers | `src/config/brand.ts`, source unique ; jetons `primary` et `accent` |
| U3 | Pas de lien d'évitement ; tableau Zakat sans en-têtes de ligne ; badges repliés sur deux lignes | Corrigés |
| U4 | Aucun état vide pour un nouvel utilisateur | Écrans vides explicites, aucune conclusion supposée |
| U5 | Couleurs d'alerte et texte secondaire proches du seuil de contraste | Assombries ; contraste AA vérifié sur chaque texte des 6 écrans |

### Outillage de test

- Les fichiers de tests SQL partageaient la même base : chacun tourne désormais dans une transaction annulée.
- Le stub Supabase local reproduit les droits par défaut réels de Supabase : c'est ce qui a révélé S5.

## 3. Fonctionnalités réellement opérationnelles

| Fonctionnalité | État | Vérifié par |
| --- | --- | --- |
| 6 écrans en mode démo (Dashboard, Budget, Objectifs, Zakat, Purification, Patrimoine), navigation mobile et ordinateur | Opérationnel dans l'aperçu ; à confirmer avec `next build` | Playwright |
| Moteur Zakat avec états « à déterminer », « sous le nisab », « Hawl en cours », « exigible » | Opérationnel | 21 tests |
| Purification : détection FR et NL, brut, précompte, net, base non imposée | Opérationnel (moteur) | 7 tests |
| Budget, réserve de précaution, objectifs avec rythme observé, patrimoine net | Opérationnel (moteurs) | 11 tests |
| Import CSV : parsing, dédoublonnage, catégorisation | Opérationnel (moteur, sans écran) | 9 tests |
| Schéma, RLS, intégrité inter-foyers, effacement RGPD | Opérationnel | 48 contrôles SQL |
| Séparation démo / réel, redirections sûres, erreurs de connexion | Logique opérationnelle | 10 tests |
| Identité de marque centralisée | Opérationnelle | Rendu vérifié |
| Création de compte et connexion réelles | **Écrit, non exécuté** | Nécessite Supabase |
| Lecture des données réelles (chargeur Supabase) | **Écrit, conversion testée, requêtes non exécutées** | 8 tests de conversion |
| Saisie de données par l'utilisateur | **Absent** (Sprint 1) | — |

## 4. À exécuter chez toi, dans cet ordre

1. `pnpm install`, puis `pnpm -r test` avec le vrai Vitest.
2. `pnpm typecheck` : première vérification des fichiers `.tsx`.
3. `NEXT_PUBLIC_APP_MODE=demo pnpm build`, puis `pnpm test:e2e`.
4. `pnpm test:db` sur une base PostgreSQL jetable.
Toute erreur à ces étapes est à corriger en priorité au début du Sprint 1.
