# Sprint 1 — plan détaillé : comptes réels, persistance, isolation

**Durée** : 2 semaines (10 jours ouvrés). **Mode** : `live` avec Supabase local, puis projet hébergé UE.
**Interdits** : banque réelle, données financières personnelles dans les tests, nouveau module.

## Prérequis (bloquants)

| # | Prérequis | Responsable |
| --- | --- | --- |
| P1 | Premier passage de la CI vert sur `main` (installation, typecheck, build, tests) ; écarts corrigés | Claude, à partir des journaux |
| P2 | Dépôt GitHub privé créé | Fondateur |
| P3 | Textes v1 : conditions d'utilisation, confidentialité, consentement art. 9 RGPD | Fondateur (version provisoire fournie par Claude si besoin, à faire relire) |
| P4 | Docker et CLI Supabase sur le poste de développement, ou CI comme seul environnement d'exécution | Fondateur |

## Parcours cible et réalisation

| Étape | Écran / route | Écriture en base | Règle |
| --- | --- | --- | --- |
| 1. Création de compte | `/connexion` (existant) | `auth.users` → déclencheur : profil, foyer, appartenance | Réponse identique si le compte existe |
| 2. Connexion sécurisée | Lien magique, `/auth/callback` (existant) ; MFA TOTP proposé | Session en cookies HttpOnly | Redirections sur liste blanche |
| 3. Consentements | `/bienvenue/consentements` | `consents` (historisés) | Accès à l'application bloqué sans conditions, confidentialité et art. 9 ; retrait possible depuis le profil |
| 4. Profil financier | `/bienvenue/profil` | `profiles.display_name`, `households` (nom, région, devise), `household_persons` (composition, sans date de naissance complète), `zakat_settings` facultatif | Aucune option religieuse choisie par défaut |
| 5. Revenus et dépenses | `/budget/saisie` | Compte manuel « Compte principal » créé une fois, puis `transactions` (source `manual`, catégorie choisie ou proposée) | Montants saisis convertis en centimes sans flottant ; dédoublonnage par empreinte |
| 6. Objectif Hajj | `/goals/nouveau`, `/goals/[id]` | `goals`, `goal_allocations` | Mention « enveloppe virtuelle, aucun fonds déplacé » |
| 7. Enregistrement | Actions serveur | — | Validation Zod côté serveur, `household_id` jamais fourni par le client mais déduit de la session |
| 8. Déconnexion / reconnexion | `POST /auth/signout` (existant) | — | Cookies supprimés |
| 9. Récupération | Chargeur `loadHouseholdData` (existant) | Lecture RLS + vue `account_balances` | Mêmes montants et mêmes résultats de calcul qu'avant la déconnexion |

## Découpage

| Jours | Lot | Livrables |
| --- | --- | --- |
| J1 | Socle | Corrections issues de la CI, `pnpm-lock.yaml` versionné, types générés `supabase gen types` |
| J2 | Garde de session | Middleware : utilisateur sans consentements → `/bienvenue/consentements` ; tests unitaires |
| J3 | Consentements | Écran, action serveur, historique, retrait ; tests SQL (un utilisateur n'écrit que ses consentements) |
| J4 | Profil financier | Écran, actions, validation ; tests |
| J5–J6 | Revenus et dépenses | Formulaire, liste, modification, suppression ; tests du chemin d'écriture |
| J7 | Objectif Hajj | Création, allocation, retrait d'enveloppe ; tests |
| J8 | Lecture réelle | Écrans branchés au chargeur, états vides, gestion d'erreur de chargement |
| J9 | Sécurité | CSP avec nonce, limitation des actions serveur, tests d'isolation étendus aux nouveaux chemins |
| J10 | Recette | Parcours e2e complet en mode réel local dans la CI, rapport de sprint |

## Tests

| Niveau | Contenu | Données |
| --- | --- | --- |
| Unitaires (Vitest) | Validation des formulaires, conversion des montants, garde de consentement | Fictives |
| SQL | Chaque nouvelle écriture : propre foyer accepté, autre foyer refusé, auteur imposé | Utilisateurs fictifs |
| Intégration | Actions serveur contre Supabase local, deux utilisateurs | Fictives |
| E2E (Playwright, CI) | Parcours 1 à 9 complet ; second utilisateur ne voit rien du premier | `test-<horodatage>@example.test`, montants fictifs |

Nouveau job CI prévu : `e2e-live` (Supabase local via la CLI, lien magique lu dans la boîte de test).

## Critères d'acceptation

1. Le parcours 1 à 9 passe en e2e, sur mobile et ordinateur, dans la CI.
2. Après reconnexion, les données et les résultats (budget, progression Hajj, statut Zakat) sont identiques.
3. Un second utilisateur ne voit et ne modifie rien du premier, par l'interface comme par l'API REST.
4. Sans consentements, aucun écran de données n'est accessible.
5. La suppression du compte efface toutes ses données.
6. Build, typecheck, lint, tous les tests verts ; aucune vérification présentée comme réussie sans exécution.

## Risques du sprint

| Risque | Parade |
| --- | --- |
| Premier passage CI révélant des erreurs de compilation | J1 dédié ; corrections avant toute fonctionnalité |
| Lien magique difficile à automatiser en e2e | Boîte de test de Supabase local lue par l'API de la boîte |
| Textes juridiques non disponibles | Version provisoire marquée « brouillon », sans ouverture à de vrais utilisateurs |
