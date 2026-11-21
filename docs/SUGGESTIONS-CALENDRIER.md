# Suggestions de projets et calendrier financier familial

Branche `sprint-5` (PR #16, non fusionnée). Données exclusivement fictives.

Hors périmètre de ce lot :
- modules d'investissement, de retraite et de succession, qui feront l'objet d'un chantier distinct ;
- partenaires ;
- paiements.

## 1. Principes

- **Une suggestion n'est jamais un objectif.** Aucun projet n'est créé sans action de la personne : « Préparer ce projet » ouvre seulement le parcours de création.
- **Aucun montant imposé.** Le catalogue ne contient aucun montant. Seule la reconduction d'un projet annuel propose le budget de l'année précédente, comme référence modifiable.
- **Rien n'est déduit.** Les suggestions s'appuient uniquement sur la date, le calendrier, les projets existants, les préférences *déclarées*, les décisions (reporter ou écarter) et la capacité connue. Aucune conviction n'est inférée d'opérations bancaires.
- **Suggestions religieuses** : il faut à la fois l'activation volontaire des fonctions religieuses (consentement article 9) et le groupe « Événements religieux » choisi dans les préférences. Les projets religieux restent protégés en base (`owner_id`, RLS).
- **Calendrier** : une date n'est pas une obligation financière. Les dates scolaires et religieuses calculées sont indicatives. Les dates religieuses peuvent être confirmées par la personne, avec leur source.
- **Pas de produit financier** : les modèles sont des idées de projets, pas des conseils ni des produits. « Investissements », « Retraite » et « Transmission » sont annoncés comme chantier distinct : ils ne sont ni proposés ni créables depuis le catalogue.
- **Un seul système de planification** : un projet issu d'une suggestion suit exactement le même parcours qu'un projet libre (Créer → Planifier → Simuler → Suivre → Réaliser). Les mêmes moteurs calculent :
  - budget, montant disponible et reste à financer ;
  - mensualité nécessaire et capacité disponible ;
  - date projetée et impact sur les autres projets.

## 2. Moteur pur — `packages/engines/src/suggestions.ts`

| Élément | Rôle |
| --- | --- |
| `GOAL_TEMPLATES` | Catalogue de 21 modèles en 4 groupes (événements religieux, famille et enfants, finances et logement, patrimoine). Chaque modèle a un identifiant stable, une catégorie de projet, une fréquence (annuelle ou ponctuelle), un déclencheur, un éventuel prérequis déclaré (enfants, véhicule) et des catégories de dépenses possibles. |
| `familyCalendar()` | Événements des 12 prochains mois, triés par date : rentrée et vacances selon le calendrier scolaire choisi, Ramadan, Aïd al-Fitr et Aïd al-Adha, échéances personnalisées (ponctuelles ou annuelles), dépenses annuelles détectées dans les opérations, échéances des projets. |
| `schoolDates()` | Calendrier scolaire configurable : Fédération Wallonie-Bruxelles (rentrée le dernier lundi d'août, vacances à partir du premier samedi de juillet), Flandre (rentrée le premier jour ouvrable à partir du 1er septembre, vacances le 1er juillet) ou personnalisé (MM-JJ). Dates indicatives. |
| `estimateHijriEvent()` | Estimation par le calendrier hégirien tabulaire (même méthode que l'Aïd). Toujours marquée « estimation ». |
| `suggestGoals()` | Suggestions classées par pertinence. Statuts : nouvelle, reportée, écartée ou acceptée. |
| `templateDueDate()` | Date indicative pour préremplir un projet issu d'un modèle. |
| `annualRenewalCheck()` | Reconduction d'un projet annuel. |

Chaque suggestion contient :
- un identifiant stable : `modele` pour un projet ponctuel, `modele:année` pour un projet annuel ;
- un titre et une catégorie ;
- un motif, que l'application traduit en explication (`lib/suggestion-text.ts`) ;
- une échéance éventuelle (indicative ou non) ;
- un lien vers la création ;
- un rang d'affichage et un statut.

**Déclencheurs :**
- **Événement du calendrier** dans une fenêtre d'anticipation (de 5 à 10 mois selon le modèle) : rentrée, activités extrascolaires, vacances, Ramadan, Aïd.
- **Intérêt déclaré** : Hajj, Omra, mariage, naissance, immobilier, travaux, véhicule, assurance annuelle, entretien automobile, études supérieures, épargne familiale.
- **Besoin de base** : réserve d'urgence, s'il n'en existe aucune.

**Pertinence :**
- La réserve d'urgence passe en tête, puis les événements les plus proches, puis les intérêts déclarés.
- Si la capacité connue est déjà entièrement engagée, la priorité baisse légèrement et l'explication le dit. La suggestion n'est jamais bloquée.

**Pas de doublon :**
- un projet existant (non archivé) du même modèle et de la même occurrence passe la suggestion en « acceptée » ;
- une réserve existante supprime la suggestion de réserve ;
- un projet Aïd de l'année passe la suggestion d'Aïd en « acceptée ».

**Décisions de la personne :**
- « Me le rappeler plus tard » reporte cette occurrence de 30 jours ; le report échu, la suggestion revient.
- « Ne plus me le proposer » écarte le modèle entier. On peut le rétablir dans les préférences.

## 3. Projets annuels

Rentrée, vacances, Aïd al-Fitr, Ramadan, assurance annuelle, entretien automobile (et Aïd al-Adha via son parcours dédié) :
- Chaque occurrence est un projet distinct (`template_id`, `occurrence_year`).
- La reconduction est **décidée par la personne**, après réalisation, une seule fois, pour l'année suivante, depuis le même modèle.
- Le budget précédent est proposé comme référence modifiable. Aucune affectation ni dépense n'est reprise.
- Contrôle à trois niveaux :
  - moteur : `annualRenewalCheck` ;
  - action serveur ;
  - base : trigger `goal_template_guard` et contrainte unique `goals_renewed_once`.

## 4. Stockage interchangeable

Le contrat `GoalRepository` (`lib/goals/repository.ts`) gagne :
- `planning()` ;
- `savePlanningPreferences()` ;
- `decideSuggestion()` ;
- `addCalendarEvent()` et `removeCalendarEvent()`.

`create()` accepte en plus l'origine du projet (`templateId`, `occurrence`, `previousGoalId`). Les écrans passent par `lib/planning-data.ts`, une source unique pour Projets, l'accueil, le calendrier et les préférences. Ils ne dépendent d'aucun stockage.

| | Démonstration | Réel (Supabase) |
| --- | --- | --- |
| Préférences | État de démonstration v2 (cookie compressé et validé) | `planning_preferences` : **privée** (une personne), RLS |
| Décisions | idem | `suggestion_decisions` : **privée** ; colonne `religious` calculée |
| Calendrier | idem | `calendar_events` : partagée par le foyer, RLS du foyer |
| Suggestions | Recalculées, jamais stockées | Recalculées, jamais stockées |

**Démonstration :**
- Format versionné v2, avec mise à niveau automatique d'un état v1 sans perte des projets.
- Contenu altéré : données de départ rétablies, avec un message.
- Réinitialisation complète, préférences et décisions comprises.
- Préférences fictives de départ : enfants et véhicule déclarés, intérêt pour l'entretien automobile, une échéance d'assurance fictive.

**Réel :**
- Sans fonctions religieuses activées, aucune préférence religieuse n'est conservée.
- Au retrait du consentement, `erase_my_religious_data()` supprime :
  - les décisions sur les modèles religieux ;
  - le groupe et les intérêts religieux ;
  - les dates confirmées ;
  - les projets religieux, comme avant.

## 5. Nouvelle catégorie : « autre projet religieux »

Un projet « Ramadan » ou « Aïd al-Fitr » révèle une pratique religieuse. Le classer en « projet personnel » l'aurait sorti de la protection article 9. La valeur `religious_other` a donc été ajoutée (migration `0022`, isolée comme l'exige PostgreSQL). Elle est protégée exactement comme Hajj, Omra et Aïd : `is_religious_goal_kind`, `owner_id`, RLS, effacement. C'est la seule catégorie ajoutée, par nécessité de protection.

## 6. Écrans

| Écran | Contenu |
| --- | --- |
| `/goals` | 1. Mes projets en cours · 2. Projets suggérés (Préparer ce projet / Me le rappeler plus tard / Ne plus me le proposer ; reportées repliées) · 3. Créer mon propre projet. Bouton « ＋ Ajouter un objectif » toujours visible. |
| `/goals/nouveau` | Deux modes : **A. projet suggéré** (catalogue par groupe ; modèles à venir grisés) et **B. projet personnalisé**. Depuis un modèle, l'encart affiche les catégories de dépenses possibles, la fréquence et la date indicative ; le parcours est prérempli (catégorie, nom, date), **sans montant**. Reconduction (`?suite=`) : budget précédent en référence. |
| `/goals/calendrier` | Événements par mois, avec leur source (calendrier scolaire, estimation, confirmé par vous, saisi, détecté, projet). Confirmation des dates du Ramadan et de l'Aïd al-Fitr avec leur source. Ajout et retrait d'échéances. « Préparer ce projet » depuis un événement. |
| `/goals/preferences` | Groupes de suggestions (le groupe religieux seulement si les fonctions religieuses sont activées), enfants scolarisés et véhicule (oui / non / non précisé), projets d'intérêt, calendrier scolaire, suggestions écartées à rétablir. |
| Accueil | Au plus trois suggestions prioritaires (« À anticiper »). |
| Fiche projet | Origine (« Suggestion : … »), impact sur les autres projets, préparation de l'occurrence suivante. |

## 7. Tests

- **Moteur** : `packages/engines/test/suggestions.test.ts`
  - catalogue ;
  - calendrier scolaire par région ;
  - dates religieuses indicatives et confirmées ;
  - absence de religieux sans activation ;
  - préférences ;
  - doublons ;
  - décisions ;
  - capacité ;
  - déterminisme ;
  - reconduction.
- **Dépôt de démonstration** : `apps/web/src/lib/demo-store.test.ts`
  - mise à niveau v1 → v2 ;
  - préférences, décisions et calendrier ;
  - création depuis un modèle ;
  - reconduction ;
  - modèles indisponibles refusés.
- **SQL** : `supabase/tests/goal_suggestions.test.sql` (28 contrôles)
  - projet religieux protégé ;
  - préférences et décisions privées ;
  - calendrier du foyer ;
  - autre foyer isolé ;
  - reconduction contrôlée ;
  - origine non modifiable ;
  - effacement religieux.
- **Playwright démo** : `apps/web/e2e/suggestions.spec.ts`
  - les trois sections ;
  - suggestion acceptée visible sur la liste, le plan d'épargne et l'accueil ;
  - budget prérempli modifiable ;
  - reporter, écarter, rétablir ;
  - préférences respectées ;
  - réinitialisation ;
  - calendrier ;
  - deux modes de création ;
  - reconduction annuelle.
- **Playwright réel** : `apps/web/e2e-live/suggestions.spec.ts`
  - sans consentement, aucune suggestion religieuse ;
  - préférences ;
  - création depuis une suggestion ;
  - décision conservée ;
  - calendrier ;
  - religieux après activation volontaire.

## 8. Revue finale du Sprint 5 — confidentialité et calendriers scolaires

### 8.1 Confidentialité du calendrier (migration `0024`)

Trois sortes d'événements ajoutés, choisies **explicitement** dans le formulaire :

| Sorte | Colonnes | Qui le voit | Qui le modifie |
|---|---|---|---|
| Personnel (par défaut) | `visibility = 'private'` | son auteur seulement | son auteur |
| Familial partagé volontairement | `visibility = 'household'` | tout le foyer | membres avec droit d'écriture (sans pouvoir le rendre privé ni se l'approprier) |
| Religieux personnalisé | `religious = true` (toujours `private`) | son auteur **seulement**, avec consentement article 9 — le partage religieux global (`share_with_household`) ne s'applique pas (migration `0025`) | son auteur, avec consentement |

- Le caractère religieux n'est **jamais déduit du libellé** : seule la case « Événement religieux » le classe (affichée seulement avec le consentement). Un libellé comme « Fête de l'Aïd chez les cousins » sans la case reste un événement ordinaire (testé).
- Base : contraintes `calendar_events_religious_private` et `calendar_events_private_owner`, fonctions `calendar_event_readable` / `calendar_event_writable` (réutilisent `religious_readable` / `religious_writable`), trigger `calendar_events_keep_author` (auteur et foyer non modifiables), `created_by = auth.uid()` exigé à l'insertion.
- Retrait du consentement avec effacement : `erase_my_religious_data()` supprime les événements religieux créés par la personne (`calendar_events` dans le résultat) et conserve les autres.
- Événements existants avant la migration : restent partagés avec le foyer (comportement antérieur) ; nouveaux événements : personnels par défaut.
- Migration `0025` : `calendar_event_readable` exige que la personne connectée soit l'auteur d'un événement religieux, même si l'auteur a activé le partage global de ses données religieuses. Un partage volontaire événement par événement pourra être étudié plus tard. Les autres données religieuses partagées (projets, purification…) suivent toujours `religious_readable`.
- Tests d'isolation dans un même foyer : `supabase/tests/calendar_privacy.test.sql` (30 contrôles — Hana avec consentement, Idris du même foyer d'abord sans consentement puis avec consentement et partage global activé des deux côtés, Jad d'un autre foyer). Sans la migration `0025`, trois de ces contrôles échouent : la fuite était réelle.

### 8.2 Calendriers scolaires officiels

- Les dates calculées restent des **approximations indicatives** (`schoolDates`).
- Architecture prête pour les calendriers officiels : `OFFICIAL_SCHOOL_CALENDARS` (autorité `fwb` / `vl`, année scolaire `2026-2027`, version, source, date de publication, rentrée, début des vacances d'été). **Le registre est vide** : aucune date officielle n'est inventée ; il se remplit après vérification dans la source officielle de la communauté compétente.
- Résolution (`resolveSchoolDates`) : date corrigée par la personne > calendrier officiel (version la plus récente de l'année scolaire) > calendrier personnalisé > approximation.
- Corrections : `prefs.schoolOverrides` (`planning_preferences.school_overrides`, 20 au plus), formulaire « Corriger la date » dans le calendrier, avec source obligatoire. **Une date confirmée n'est jamais écrasée** : ni par un changement de calendrier, ni par l'enregistrement des préférences, ni par un calendrier officiel (testé dans le moteur et en e2e). « Retirer ma correction » revient à la règle de résolution.
