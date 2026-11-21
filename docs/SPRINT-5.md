# Sprint 5 — projets de vie, Aïd al-Adha, plan d’épargne, mobile et démonstration privée

Branche `sprint-5`, créée depuis `main` après la fusion du Sprint 4 (CI entièrement verte).

Contraintes respectées :
- données exclusivement fictives ;
- aucun fournisseur PSD2, aucun paiement, aucun service payant, aucune mise en ligne.

Les Sprints 6 et 7 n’ont pas été commencés. Moteurs réutilisés : `goals`, `allocations` du Sprint 3, `snapshot`, `recommend`.

## Lot 5.1 — Objectifs universels (`/goals`, `/goals/[id]`)

| Exigence | Réalisation |
| --- | --- |
| Catégories | Hajj, Omra, Études des enfants, Achat immobilier, Retraite, Épargne familiale, Réserve d’urgence, Projet personnel (et Aïd al-Adha, lot 5.2) |
| Données d’un projet | Nom, catégorie, montant cible, date souhaitée, épargne disponible, capacité mensuelle, statut de progression, date estimée, historique des affectations avec solde cumulé (`allocationHistory`) |
| Modifier sans effacer | Table `goal_changes` en ajout seul, alimentée par un déclencheur de base pour le nom, la cible, la date, la capacité, la priorité, le statut et la réalisation. Personne ne peut l’écrire, la modifier ou la supprimer, même par l’API. Elle est anonymisée à la suppression du compte. |
| Parcours | « Créer → Planifier → Simuler → Suivre → Réaliser » (`goalJourney`), affiché sur chaque carte et chaque fiche. La simulation n’écrit rien. Un projet peut être réalisé, rouvert, mis en pause, repris ou archivé. Les projets en pause ou archivés sortent des calculs. |
| Consentement | Les projets généraux sont accessibles sans consentement religieux. Hajj, Omra et Aïd restent des données article 9 (`owner_id`, RLS religieuse) : ils sont refusés sans consentement par l’application **et** par la base, et effacés au retrait du consentement. |

## Lot 5.2 — Préparer mon Aïd (`/goals/aid`)

| Exigence | Réalisation |
| --- | --- |
| Budget | Sacrifice ou quote-part, frais complémentaires, contribution à un organisme, contributions familiales. Reste à épargner calculé (`eidBudget`) ; la cible du projet est synchronisée par la base. |
| Date | Saisie par la personne. Une estimation par calendrier tabulaire peut être proposée, toujours affichée « estimation non officielle ». La base conserve la date estimée, la date retenue, son statut (estimée, saisie, confirmée), la source de confirmation (obligatoire pour « confirmée ») et l’historique des changements. **Une estimation n’est jamais une confirmation.** |
| Reconduction annuelle | Elle est proposée seulement après réalisation et décidée par la personne. Les montants de l’année précédente ne sont jamais repris : seul le budget est proposé comme valeur modifiable. Les doublons sont empêchés par des contraintes d’unicité, d’une part par personne et par année civile, d’autre part par Aïd d’origine. Le déclencheur `eid_plan_guard` refuse la reconduction d’un Aïd non réalisé, d’une autre personne ou d’une autre année. Les années ne sont jamais fusionnées. |

## Lot 5.3 — Plan d’épargne récurrent (`/budget/plan-epargne`) et R7

| Exigence | Réalisation |
| --- | --- |
| Répartition | Exemple : capacité de 500 € répartie entre Aïd 50 €, Hajj 150 €, études 100 € et réserve 100 €. Moteur pur `buildSavingsPlan`, qui affiche la capacité (estimée par l’analyse ou déclarée), les montants affectés, la capacité libre, le dépassement, l’effet sur chaque date et le déséquilibre du plan. |
| Pas de double comptage | Une mise de côté virtuelle n’est pas une dépense, un transfert entre comptes de la personne non plus (règles du Sprint 3 inchangées). Une affectation à un objectif n’implique aucun transfert. Une même capacité n’est jamais financée deux fois : les lignes sont servies par priorité, puis par date, dans la limite de la capacité restante (`fundedCents`). |
| Priorités | Modifiables. Le dépassement de capacité est signalé, jamais accepté en silence. |
| R7 « objectif en retard » | Retard estimé, données utilisées, effort mensuel supplémentaire, scénarios de correction (augmenter l’effort, reporter la date, revoir la cible). **Aucune date n’est promise si les données sont insuffisantes** : R7 indique alors ce qui manque. |

## Lot 5.4 — Expérience mobile et démonstration privée

| Exigence | Réalisation |
| --- | --- |
| Démonstration | Couvre l’accueil, le budget, l’optimisation, les recommandations, les projets (dont Hajj et Aïd), le plan d’épargne, la Zakat, les dons et la purification, avec des données fictives (`e2e/screens.spec.ts`, mobile et ordinateur). |
| Formulaires courts | Création de projet et d’Aïd découpée en 3 étapes, chacune avec l’indicateur « Étape n sur 3 » (`FormStep`). Le formulaire reste unique, rien n’est perdu, aucun JavaScript n’est requis. |
| PWA | Icônes PNG 192 et 512, icône maskable et `apple-touch-icon` générées depuis la charte. Manifeste avec `id` et `scope`. Métadonnées `appleWebApp`. Installation sur l’écran d’accueil. |
| Erreurs réseau | Bandeau « Connexion perdue », page `/hors-ligne`, écran d’erreur `(app)/error.tsx` sans détail technique. |
| Cache | Le service worker `public/sw.js` (production, HTTPS ou localhost) **ne met en cache aucune page, aucune donnée, aucune réponse d’API ni de Supabase**. Il ne conserve que la page hors ligne et les fichiers statiques versionnés. `sw.js` est servi sans cache. |
| Accès privé | Authentification HTTP Basic **côté serveur** (middleware) en mode démo dès que `DEMO_ACCESS_PASSWORD` est défini (12 caractères au minimum, comparaison en temps constant), avec `X-Robots-Tag: noindex`. L’accès ne repose ni sur `robots.txt` ni sur un écran côté navigateur. Seuls le manifeste et les icônes restent publics, sans donnée. |
| Hébergement | Étude `docs/HEBERGEMENT-DEMO.md` (Vercel Hobby, Cloudflare Workers et Access, Netlify Free). Recommandation : Netlify Free avec la Basic Auth du middleware. **Rien n’est déployé.** |
| Windows | `scripts/windows/lancer-demo.cmd` (CRLF imposé par `.gitattributes`, aucun secret, mode démo imposé par variable de processus) et `docs/LANCEMENT-WINDOWS.md`. **Non exécuté sur Windows** : l’environnement de Claude est sous Linux. |

## Migrations

| Fichier | Contenu |
| --- | --- |
| `20261122000017_goals_universal.sql` | Réalisation, `updated_at`, historique `goal_changes`, anonymisation |
| `20261122000018_goal_kind_eid.sql` | Valeur d’énumération `eid_al_adha` (migration isolée, exigence PostgreSQL) |
| `20261122000019_eid_plans.sql` | `eid_plans`, garde de reconduction, RPC `create_eid_goal`, RLS article 9 |
| `20261122000020_savings_plan.sql` | `household_savings_settings` (capacité déclarée), RLS du foyer |

## Tests

| Niveau | Fichiers |
| --- | --- |
| Moteurs | `goals`, `eid`, `planning`, `recommendations` (R7) |
| Formulaires et vues | `goals-forms`, `savings-plan`, `demo-access` |
| SQL, RLS, isolation, séparation religieuse | `goals_universal`, `eid_plans`, `savings_plan` |
| Playwright démo (mobile et ordinateur) | `screens.spec.ts` (nouveaux écrans), `pwa.spec.ts` (manifeste, icônes, service worker, hors ligne, bandeau réseau) |
| Playwright réel (Supabase local) | `e2e-live/sprint5.spec.ts` : projet général sans consentement et projets religieux refusés, parcours complet avec historique, Omra privé et isolation, Aïd (estimation puis confirmation avec source), reconduction unique sans reprise des montants, plan d’épargne avec dépassement et priorités, R7 |
| Non-régression | Toutes les suites des Sprints 0 à 4, inchangées |

## Corrections trouvées pendant la recette

- **Saisie perdue après une erreur** (tous les formulaires) : React 19 vidait le formulaire après chaque action serveur. Après une erreur (par exemple une date « confirmée » sans source), un second envoi enregistrait donc une autre valeur que celle voulue. `ActionForm` conserve désormais la saisie en cas d’erreur et ne vide le formulaire qu’après un enregistrement réussi.
- **Débordement mobile** : la source de la date de l’Aïd, un texte libre, était affichée dans un badge insécable. La page débordait et se dézoomait sur smartphone. Le texte est maintenant renvoyé à la ligne, et un test e2e vérifie l’absence de défilement horizontal.

## Résultats (CI du commit `85c1c4d`, 4 jobs verts)

| Suite | Résultat |
| --- | --- |
| Moteurs (`packages/engines`) | 137 tests réussis |
| Banque fictive (`packages/banking`) | 13 tests réussis |
| Application (`apps/web`, formulaires et vues) | 100 tests réussis |
| SQL, RLS et isolation (PostgreSQL 16 et image Supabase réelle) | Toutes les assertions passent sur les deux bases |
| Playwright démo, mobile et ordinateur | 59 réussis, 1 ignoré (test clavier, volontairement limité à l’ordinateur, inchangé depuis le Sprint 1) |
| Playwright réel (Supabase local), mobile et ordinateur | 68 réussis |

Non vérifié : lancement sous Windows (voir `docs/LANCEMENT-WINDOWS.md`), installation sur un vrai smartphone, déploiement (non autorisé).

## Revue produit — démonstration interactive (après la recette)

Détails complets : `docs/DEMO-INTERACTIVE.md`.

- **Audit** : en démonstration, la création, la modification, les affectations, le cycle de vie, l’historique, l’Aïd et le plan d’épargne étaient désactivés. Par ailleurs, les projets archivés disparaissaient, y compris en mode réel.
- **Parcours** : il était fondé sur la présence de données. Un projet tout juste créé apparaissait « à réaliser ». Désormais, une étape n’est franchie que par une décision (plan validé, stratégie retenue, mise de côté enregistrée, réalisation). Chaque étape est faite, disponible ou en attente, avec une action conseillée. Migration `0021`.
- **Stockage interchangeable** : `GoalRepository`, avec un adaptateur de démonstration (état fictif dans le navigateur, sans base) et un adaptateur Supabase (RLS, fonctions SQL et article 9 inchangés).
- **Expérience** :
  - assistant « Ajouter un objectif » en 3 écrans, avec retour en arrière sans perte de saisie ;
  - catégories présentées en cartes ;
  - projet personnel au nom libre ;
  - simulateur multi-scénarios tenant compte des autres projets ;
  - point d’intégration « Explorer les solutions », sans aucun partenaire.
- **Correction annexe** : le test e2e Sprint 3 dépendait du jour d’exécution. L’abonnement fictif du 6 du mois devenait « inactif » après le 21. Il ne dépend plus de la date.
