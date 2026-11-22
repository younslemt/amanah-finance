# Islamic-first — lot 3 : navigation, Mes engagements, actions rapides, menu profil

Branche `islamic-first-lot-3`, partie de `main` après la fusion du lot 2 (`a996d87`).
Périmètre strict : navigation, page Mes engagements, bouton « + », menu profil, parcours entre
fonctionnalités existantes. Aucun module d'investissement, de retraite ou de transmission.
Aucun moteur financier modifié, aucune migration, aucune règle RLS modifiée.

## 1. Navigation

Cinq entrées, dans l'ordre des maquettes : **Accueil · Mes engagements · Projets · Budget · Patrimoine**.

| | Avec consentement religieux | Sans consentement |
|---|---|---|
| 2e entrée | « Mes engagements » → `/finance-islamique` (tableau de bord) | « Finance islamique » → `/finance-islamique` (pédagogique) |
| Sous-entrées (ordinateur) | Zakat (`/zakat`), Purification (`/purification`), Solidarité (`/dons`) | aucune |
| `/zakat`, `/purification`, `/dons` | page de la fonction | porte de consentement, entrée « Finance islamique » active |

- Libellés et destinations : `navEntries` (lot 1) ; icônes, chemins associés et sous-entrées :
  `mainNavigation` (`lib/navigation.ts`, pur, testé).
- Le modèle de la coque est résolu **côté serveur** (`loadShell`, `lib/shell-data.ts`) : la navigation
  ne contient que des libellés, jamais un montant, un compteur ou un nom de projet.
- Ordinateur : colonne latérale fixe ; la sous-entrée courante porte `aria-current="page"`, l'entrée
  parente reste mise en évidence. Smartphone : barre basse à cinq entrées, cibles de 56 px,
  `env(safe-area-inset-*)` en bas et sur les côtés, en-tête avec avatar.

## 2. Page Mes engagements (`/finance-islamique`)

Modèle de vue pur `buildEngagementsView` (`lib/engagements-view.ts`), chargé par
`loadEngagementsView` **uniquement avec le consentement en vigueur** (sinon rien n'est chargé ; la RLS
l'impose aussi). Il ne calcule rien : il regroupe les résultats des moteurs existants.

**Zakat** — même source que l'accueil (`zakatCommitment`, extrait de `home-view.ts`) :
dernier calcul enregistré (date) ou estimation courante, statut du calcul, montant estimé, contributions
déclarées, dont rapprochées, dont confirmées, « Montant restant selon vos déclarations », accès au calcul
(« Compléter » ou « Revoir ») et à l'historique (`/zakat#historique`, mode réel).
Calcul incomplet : aucun montant estimé ni restant n'est affiché comme établi.
**Provision virtuelle** : aucune source n'existe dans le modèle, la ligne est donc masquée (elle ne
s'affichera que lorsqu'une donnée réelle l'alimentera, et ne sera jamais un paiement).

**Purification** — mode réel : éléments enregistrés (`summarizePurification` + statuts) ;
démonstration : opérations détectées sur les relevés fictifs. Opérations détectées, montants nécessitant
un examen (détectés + confirmés dont la base reste à choisir), décisions enregistrées (confirmées,
écartées, purifiées), montant à purifier selon vos choix, déjà purifié. Accès : « Confirmer les montants
à purifier » (`/purification`), puis « Enregistrer ensuite votre don » (`/dons`). Mention explicite :
confirmer un montant n'est pas un transfert ; Amanah Finance n'effectue aucun paiement.

**Solidarité** — contributions **de la personne** pour l'année de référence (`summarizeContributions`,
qui dédoublonne) : total, ventilation Zakat · Zakat al-Fitr · Sadaqah · Purification · Autres dons
(waqf, autres). Chaque contribution est comptée une fois et dans un seul type (somme des types = total).
Statuts distincts : déclarées seulement, rapprochées d'une opération, confirmées (aucune source activée).

**Sans consentement** : titre « Finance islamique », contenu pédagogique (Zakat, purification,
solidarité), texte du consentement et activation. Aucune donnée religieuse n'est lue.
**Confidentialité et consentement** (bas de page, avec consentement) : état, partage dans le foyer,
retrait — formulaires existants inchangés.

## 3. Actions rapides (« + »)

`availableQuickActions` (lot 1) décide, côté serveur, à partir du mode, du rôle (écriture), des comptes
(non archivés), des projets actifs (visibles selon la RLS) et du consentement :

| Contexte | Actions proposées |
|---|---|
| Démonstration | Mettre de côté (si projet actif), Créer un projet, Ajouter une échéance |
| Réel, sans compte ni projet | Créer un projet, Ajouter une échéance |
| Réel, avec compte | + Ajouter une opération, Importer un relevé |
| Réel, avec projet actif | + Mettre de côté pour un projet |
| Réel, avec consentement | + Enregistrer un don ; échéance « personnelle, familiale ou religieuse » |
| Lecture seule | aucun bouton |

Composant `QuickActions` : `<dialog>` modal natif — focus placé sur la première action et piégé,
fermeture par Échap, bouton « Fermer » (44 px) ou clic hors du panneau, focus rendu au bouton,
`aria-expanded` tenu à jour, fermeture à chaque navigation. Feuille en bas d'écran sur smartphone
(zone de sécurité), fenêtre centrée sur ordinateur (bouton dans la colonne latérale). Le bouton flottant
est placé au-dessus de la barre basse et le contenu garde une marge suffisante pour ne jamais être masqué.

## 4. Menu profil

Bouton avatar (initiale du prénom ou pseudonyme ; icône en démonstration), bouton de divulgation
(`aria-expanded`, `aria-controls`), navigation « Profil et paramètres » :

| Accès | Réel | Démonstration |
|---|---|---|
| Mes comptes | ✓ | ✓ |
| Importer un relevé | ✓ (droit d'écriture) | ✓ (écran explicatif) |
| Mes recommandations | ✓ | ✓ |
| Paramètres | ✓ | — (pas de compte) |
| Préférences d'affichage | ✓ `/dashboard#affichage` | ✓ |
| Consentements | ✓ `/parametres#consentements` | — |
| Date simulée | — | ✓ |
| Se déconnecter | ✓ (formulaire POST inchangé) | — |

Fermeture par Échap (focus rendu), clic extérieur et navigation. La préférence d'affichage est aussi
proposée sur le premier accueil (compte sans données). Authentification et autorisations inchangées.

## 5. Sécurité et confidentialité

- Données article 9 : aucune n'est chargée sans consentement (`loadEngagementsView` renvoie `null`,
  `loadShell` ne lit que deux comptages soumis à la RLS). La navigation, le panneau « + » et les liens
  ne révèlent rien de personnel ; sans consentement, aucune mention religieuse dans les actions.
- Règles RLS, migrations et consentements : inchangés. Le contrôle serveur reste `religiousAccess`.
- Tests en mode réel : sans consentement, avec consentement, après retrait (contenu HTML vérifié).

## 6. Tests

- Unitaires (`navigation.test.ts`) : navigation avec et sans consentement, entrées actives, menu profil
  (réel, lecture seule, démonstration), libellé de l'échéance, modèle Mes engagements (Zakat complète et
  incomplète, provision masquée, historique de la personne seule, purification réelle et démonstration,
  solidarité dédoublonnée, sans contribution d'un autre membre, somme des types = total).
- e2e démonstration (`e2e/navigation.spec.ts`, mobile et ordinateur) : ordre des entrées, sous-entrées,
  page Mes engagements (cohérence avec l'accueil et l'écran Dons), liens, actions rapides (clavier,
  Échap, Fermer, clic extérieur, 320 px), menu profil, rendu à 375, 390, 430, 768 et 1440 px.
- e2e mode réel (`e2e-live/lot3.spec.ts`) : sans consentement, compte puis projet (actions qui
  apparaissent), consentement, Zakat incomplète puis calcul enregistré et dons, cohérence des montants,
  historique, retrait.
- Non-régression : écrans existants (`screens.spec.ts`, `smoke.spec.ts`), déconnexion via le menu profil.

## 7. Comparaison avec les maquettes validées

Captures de l'application réellement exécutée (CI, démonstration et mode réel), comparées aux
maquettes « Engagements », « Actions rapides » et « Ordinateur ».

| Élément | Maquette | Application | Raison |
|---|---|---|---|
| Ordre de la navigation | Accueil · Mes engagements · Projets · Budget · Patrimoine | identique | — |
| Sous-entrées ordinateur | Zakat, Purification, Solidarité | identiques (avec consentement) | — |
| Provision virtuelle | 600 € affichés | ligne masquée | aucune source de provision dans le modèle ; jamais inventée |
| Purification | cases à cocher et « Confirmer et purifier 12,40 € » sur la page | synthèse + « Confirmer les montants à purifier » vers `/purification` | les décisions passent par le parcours existant (méthodologie, brut/net) ; aucun calcul dupliqué ; libellé validé au lot 1 |
| Solidarité | total et dernier don | total, ventilation par type, statuts, dernier don | exigence « distinction déclaration / rapprochement / confirmation » et « aucun double comptage » |
| Avatar | dans le bandeau de l'accueil | dans l'en-tête de chaque page (smartphone) et la colonne latérale (ordinateur) | menu profil accessible partout |
| Bouton « + » sur ordinateur | non représenté | « Actions rapides » dans la colonne latérale | même panneau, accessible au clavier |
| En-tête de la page | bandeau vert, lien « ← Accueil » | titre standard des pages | cohérence avec les autres écrans ; la navigation indique la page courante |
| Montants | montants d'exemple de la maquette | montants des moteurs (démonstration fictive ou données réelles) | aucun montant codé en dur |

Écarts restant ouverts : aucune provision virtuelle tant qu'un moteur ou une saisie ne l'alimente pas ;
historique des calculs de Zakat non disponible en démonstration (rien n'y est enregistré).

## 8. Corrections de la revue (validation conditionnelle)

**Purification : engagements personnels.** Avec le partage religieux activé, la RLS (inchangée) rend
visibles les éléments des autres membres consentants. Les synthèses ne comptent désormais que les
éléments de la personne connectée :
- « Mes engagements » : `buildEngagementsView` filtre sur `ownerId = userId` et indique le nombre
  d'éléments partagés par d'autres (`sharedByOthersCount`), sans aucun de leurs montants ;
- détail `/purification` : totaux calculés sur vos éléments ; les éléments partagés restent listés,
  marqués « partagé par un membre du foyer », sans action possible ;
- accueil : la synthèse du bloc « Mes engagements » lit les éléments de la personne (`owner_id`).
Une future vue « engagements du foyer » pourra réutiliser `loadPurification` (tous les éléments visibles)
et le même modèle sans filtre.

**Actions selon les fonctionnalités disponibles** (`engagementsActions`) :

| | Démonstration | Réel, écriture | Réel, lecture seule |
|---|---|---|---|
| Purification | Examiner les opérations fictives | Confirmer les montants à purifier | Consulter les opérations de purification |
| Zakat | Consulter le calcul fictif | Compléter / Revoir le calcul | Consulter le calcul |
| Historique des calculs | — | ✓ | ✓ |
| Enregistrer un don / une contribution | — | ✓ | — |
| Accueil, bloc Solidarité | Voir les dons | Enregistrer un don | Voir les dons |

**Tests ajoutés** : SQL `purification_personal_scope.test.sql` (deux membres consentants, partage
activé, montants différents : visibilité partagée, requête personnelle, aucune modification croisée,
retrait du partage) ; unitaires (synthèse personnelle vue par chaque membre, libellés par contexte) ;
mode réel `lot3-foyer.spec.ts` (foyer préparé par fixture SQL sur la base locale de CI : montants
personnels dans Mes engagements, le détail et l'accueil, éléments partagés consultables, puis lecture
seule : libellés de consultation, ni don, ni « + », ni import) ; démonstration (libellés de consultation).
