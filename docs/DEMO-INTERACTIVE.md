# Revue produit Sprint 5 — démonstration interactive et parcours projet

Branche `sprint-5` (PR #16, non fusionnée). Données exclusivement fictives.
- Aucune base de données pour la démonstration.
- Aucun déploiement, aucun partenaire, aucun paiement.
- Sprints 6 et 7 non commencés.

## 1. Audit de la PR #16 : ce qui était désactivé en démonstration

| Écran / fonction | État avant la revue | Fichier |
| --- | --- | --- |
| Créer un projet | Formulaire masqué (`!isDemoMode`) | `goals/page.tsx` |
| Modifier un projet (planifier, priorité) | « Démonstration : modification désactivée » | `goals/[id]/page.tsx` |
| Affecter ou retirer un montant | Masqué | `goals/[id]/page.tsx` |
| Réaliser, mettre en pause, archiver, rouvrir | « Démonstration : actions désactivées » | `goals/[id]/page.tsx` |
| Historique des modifications | Masqué (lecture Supabase seulement) | `goals/[id]/page.tsx` |
| Créer, ajuster ou reconduire un Aïd | « Démonstration : création désactivée » ; date et budget non modifiables | `goals/aid/page.tsx`, `EidSection` |
| Plan d’épargne : mensualités, priorités, capacité déclarée | Formulaires masqués | `budget/plan-epargne/page.tsx` |
| Actions serveur | Toutes refusaient : « Saisie désactivée en mode démonstration » | `(app)/actions.ts`, `goals/aid/actions.ts` |
| Données | `getDemoHousehold()` renvoyait des projets figés (`DEMO_GOALS`) | `lib/demo.ts`, `lib/data.ts` |

Restent volontairement hors périmètre, désactivés en démonstration comme avant :
- import de relevés ;
- comptes et opérations ;
- décisions sur les recommandations ;
- dons et Zakat enregistrés.

Autres défauts relevés :
- **Projets archivés invisibles** : le mappeur les filtrait. L’historique d’un projet archivé n’était donc plus consultable, et l’écran affichait « en pause » pour un projet archivé.
- **Écrans liés au stockage** : la fiche projet lisait directement Supabase (`loadGoalChanges`, `loadEidPlans`) et des constantes de démonstration (`DEMO_AID_PLAN`).

## 2. Revue critique du parcours (avant)

`goalJourney()` déduisait les étapes de la présence de données, pas de décisions :
- **Planifier** était « fait » dès qu’une capacité mensuelle existait, alors qu’elle est obligatoire à la création. L’étape était donc toujours franchie.
- **Simuler** était « fait » dès que le moteur savait calculer une date, sans que la personne ait rien simulé.
- **Suivre** était « fait » par l’épargne saisie à la création. Un projet créé avec un montant disponible arrivait donc directement à « Réaliser ».
- **Pas de nuance** : une étape était faite ou non. Rien ne distinguait une étape disponible d’une étape conseillée.
- **Pas d’action** : le parcours était un indicateur, sans bouton vers la prochaine action.

Les tests de bout en bout de la PR le montraient : un projet tout juste créé était marqué « Réaliser ».

## 3. Nouveau parcours : des décisions identifiables

| Étape | Faite quand… | Données |
| --- | --- | --- |
| Créer | le projet est défini | catégorie, montant, échéance |
| Planifier | la personne **valide** son plan (« Valider mon plan ») | `plan_confirmed_on` |
| Simuler | la personne **retient** un scénario après comparaison | `strategy_monthly_cents`, `strategy_chosen_on` |
| Suivre | au moins une mise de côté **enregistrée après la création** (l’épargne initiale ne compte pas) | `goal_allocations.source = 'manual'` |
| Réaliser | le projet est déclaré réalisé | `status = 'achieved'`, `realized_on` |

Chaque étape a un statut :
- **faite** ;
- **disponible** : le parcours n’est pas linéaire, on peut revenir en arrière ou simuler avant de planifier ;
- **en attente** : projet en pause, archivé ou réalisé.

Une seule **action conseillée** est proposée à la fois : valider le plan, comparer, enregistrer une mise de côté, poursuivre, déclarer réalisé (cible atteinte), reprendre, ou explorer les solutions.

Ces règles vivent dans `goalJourney()`, dans le moteur pur `packages/engines/src/goals.ts`, et sont testées.

## 4. Architecture de stockage interchangeable

```
Écrans (RSC) ── getHouseholdData() / getSnapshot() ── moteurs déterministes (@amanah/engines)
     │                     │
Actions serveur ── GoalRepository (lib/goals/repository.ts)
                     ├── démonstration : lib/goals/demo-repository.ts  (+ demo-state.ts, demo-codec.ts)
                     └── réel          : lib/goals/supabase-repository.ts (RLS, fonctions SQL, article 9)
```

- **Contrat `GoalRepository`** :
  - lecture : `listGoals`, `getGoal`, `history`, `eidPlans` ;
  - projet : `create`, `update` (avec validation du plan), `chooseStrategy`, `setLifecycle` (réaliser, rouvrir, pause, reprise, archive) ;
  - épargne : `addAllocation` (négatif = retrait), `savePlan` (mensualités et priorités), `setDeclaredCapacity` ;
  - Aïd : `createEid`, `updateEidDate`, `updateEidBudget`.
- **Choix du stockage** : un seul endroit, `lib/goals/index.ts`. En mode réel, le cookie de démonstration est ignoré.
- **Modèle commun** : `Goal`, `GoalAllocation`, `GoalPlan` des moteurs. Les calculs (plan, scénarios, capacité, plan d’épargne, recommandations) ne sont écrits qu’une fois, dans les moteurs, et jamais dans les composants React.
- **Mode réel** : le dépôt Supabase reprend à l’identique les écritures existantes :
  - fonctions `create_goal_with_allocation` et `create_eid_goal` ;
  - RLS du foyer et article 9 ;
  - historique écrit par trigger.

  Aucune migration n’est supprimée. Une modification qui ne touche aucune ligne (autre foyer, autre personne) est un refus. Les identifiants non UUID sont refusés avant toute requête.

### Pourquoi un cookie plutôt que `localStorage`

Les écrans et les moteurs s’exécutent **côté serveur** (React Server Components), et `localStorage` n’est lisible que dans le navigateur. L’utiliser aurait obligé :
- soit à dupliquer chaque écran en version cliente ;
- soit à afficher d’abord les données de départ puis à les corriger, avec les incohérences d’hydratation que la demande exclut.

Le cookie est lui aussi un **stockage du navigateur** : aucune base, et le serveur ne conserve rien. Mais il est relu à chaque requête, donc projets, plan d’épargne, tableau de bord, recommandations et Zakat partagent exactement le même état, sans écart d’affichage.

Les exigences sur le stockage dans le navigateur sont toutes tenues :

| Exigence | Réalisation |
| --- | --- |
| Pas de données sensibles réelles | Contenu fictif ; avertissement à la création. Le cookie est `HttpOnly`, `SameSite=Lax`, et `Secure` en HTTPS. |
| Valider les données lues | Schéma zod : bornes, longueurs, dates, cohérence des références. Décompression bornée à 256 Ko. |
| Versionner le format | Préfixe `v1.` et champ `v`. Un format inconnu est signalé et les données de départ sont rétablies. |
| Données corrompues | Ignorées, données de départ rétablies, message affiché sur la page Projets. |
| Conservation après rafraîchissement | Cookie de 30 jours. |
| Réinitialisation complète | Bouton « Réinitialiser la démonstration », qui supprime le cookie. |
| Hydratation React | Pas de problème possible : le rendu serveur utilise déjà l’état à jour. |
| Synchronisation des pages | Même source à chaque requête ; signal `BroadcastChannel` entre onglets après un enregistrement. |
| Aucun appel vers une base | Le dépôt de démonstration n’importe rien de Supabase. |

**Limites de la démonstration** : 30 projets, 300 affectations et 300 modifications. Au-delà, un message invite à archiver des projets ou à réinitialiser. Un état réaliste (30 projets, 240 affectations) occupe environ 2,2 Ko compressés, pour une capacité de 3 cookies de 3,5 Ko.

**Mêmes règles que la base** : les opérations de démonstration (`demo-state.ts`, fonctions pures testées) reproduisent les contrôles SQL :
- historique en ajout seul, avec les mêmes noms de champs ;
- retrait impossible au-delà de l’épargne du projet ;
- Aïd : une année civile par projet, date « confirmée » seulement avec une source, reconduction uniquement après réalisation, une seule fois, depuis l’année précédente, sans reprise de montants.

## 5. Ce que l’on peut faire en démonstration

1. Ajouter un objectif avec l’assistant en 3 écrans (catégorie, montant et échéance, épargne). « Précédent » et « Suivant » ne perdent aucune saisie. Sans JavaScript, les 3 étapes s’affichent ensemble.
2. Choisir parmi 9 catégories, dont **projet personnel** au nom libre (voyage, mariage, véhicule, création d’entreprise…), avec plusieurs projets par catégorie. Aucune nouvelle catégorie réglementaire n’a été créée.
3. Modifier et valider son plan, avec un historique avant / après.
4. Comparer jusqu’à 3 mensualités, avec pour chacune :
   - le délai et la date d’atteinte ;
   - l’écart avec l’échéance ;
   - la compatibilité avec la capacité encore libre.

   Puis retenir une stratégie.
5. Ajouter ou retirer une mise de côté virtuelle.
6. Modifier les priorités et les mensualités dans le plan d’épargne.
7. Mettre en pause, reprendre, archiver, restaurer, déclarer réalisé, rouvrir.
8. Aïd : ajuster le budget, confirmer la date avec sa source, simuler, réaliser, préparer l’année suivante.
9. Réinitialiser.

Le simulateur montre séparément :
- la capacité **estimée** (analyse des opérations) ;
- la capacité **déclarée** ;
- la capacité **déjà engagée** par les autres projets ;
- la capacité **disponible** pour ce projet ;
- l’**épargne virtuelle** ;
- l’**argent réellement détenu** sur les comptes.

Une même capacité n’est jamais affectée deux fois (`capacityForGoal`, `buildSavingsPlan`). Aucune simulation n’est présentée comme une économie réalisée.

## 6. Futurs partenaires : point d’intégration seulement

« Explorer les solutions pour concrétiser mon projet » apparaît quand la cible est atteinte ou le projet réalisé. La page liste les familles de services envisagées par catégorie :
- organisateurs Hajj et Omra ;
- prestataires Aïd ;
- solutions d’épargne ;
- prestataires éducatifs ;
- professionnels de l’immobilier.

Elle affiche clairement : **aucun partenaire référencé, aucune offre, aucune donnée transmise**. Le contrat `PartnerDirectory` (`lib/solutions.ts`) ne reçoit qu’une catégorie, jamais de données personnelles. Il n’y a aucune intermédiation financière.

## 7. Migration 0021 (mode réel)

- `goals.plan_confirmed_on`, `goals.strategy_monthly_cents`, `goals.strategy_chosen_on`. Une stratégie est soit complète, soit absente. Ces champs sont journalisés par `log_goal_change`.
- `goal_allocations.source` (`initial` ou `manual`, `manual` par défaut). Les données existantes sont reprises. Les deux fonctions de création marquent l’épargne initiale.
- Signatures des fonctions, RLS et article 9 inchangés. Tests : `supabase/tests/goals_journey.test.sql`.

## 8. Défauts trouvés et corrigés pendant la recette

- **Saisie détournée dans l’assistant.** Le focus était replacé sur le premier champ de l’étape une image après « Suivant ». Une saisie déjà commencée dans un autre champ de la même étape partait alors dans le mauvais champ. Le diagnostic CI l’a montré : « 0200 » dans l’épargne disponible, mensualité vide. Le focus n’est désormais jamais déplacé quand la personne est déjà dans un champ de l’étape. Un test de non-régression a été ajouté.
- **Envoi incomplet.** Tout envoi vérifie d’abord l’ensemble des étapes. Un champ obligatoire vide ramène à l’étape concernée, sans appel au serveur. Les boutons « Suivant » et « Créer » ne sont jamais remplacés l’un par l’autre sous le clic.
- **Service worker.** Il ne prend plus le contrôle d’une page déjà ouverte : il s’applique à la navigation suivante.
- **Test Sprint 3 dépendant de la date.** L’abonnement fictif du 6 du mois devenait « inactif » après le 21. Le jeu de données s’aligne désormais sur le jour d’exécution.

## 9. Résultats (CI de `d3e0c32`, 4 jobs verts, job applicatif relancé une 2e fois sans échec)

| Suite | Résultat |
| --- | --- |
| Moteurs | 140 tests réussis (parcours, scénarios, capacité par projet) |
| Banque fictive | 13 tests réussis |
| Application (`apps/web`) | 107 tests réussis, dont 7 sur le dépôt de démonstration |
| SQL, RLS et isolation (PostgreSQL 16 et image Supabase) | Toutes les assertions passent, dont `goals_journey` (23 contrôles) |
| Playwright démo, mobile et ordinateur | 75 réussis, 1 ignoré (test clavier, ordinateur seul, existant). Aucun test instable sur les 2 exécutions. |
| Playwright réel (Supabase local), mobile et ordinateur | 68 réussis |

## 10. Lancer la nouvelle démonstration sous Windows

```bat
git pull
scripts\windows\lancer-demo.cmd
```

L’état de démonstration est propre à chaque navigateur. Pour repartir des données fictives de départ, utilisez Projets → « Réinitialiser la démonstration ».
