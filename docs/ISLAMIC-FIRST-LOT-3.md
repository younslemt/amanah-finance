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
