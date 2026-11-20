# Sprint 2 — consentement par fonction, import CSV, purification

Branche `sprint-2`, Pull Request #12. Données exclusivement fictives, aucun déploiement, aucun paiement,
aucune banque connectée.

**Objectif** : permettre à un utilisateur d'importer ses opérations bancaires et d'identifier les revenus
d'intérêts à purifier, dans un environnement sécurisé.

## Lot 0 — consentement article 9 par fonction

Choix **provisoires**, à confirmer par le juriste (`CONSENTEMENTS-ANALYSE.md`, ajustements 1 à 5 réalisés).

| Exigence | Réalisation |
| --- | --- |
| Budget sans fonctions religieuses | L'accueil ne demande plus que les conditions et l'information. Comptes, budget, import et tableau de bord fonctionnent sans consentement article 9 |
| Consentement spécifique | Écran `/finance-islamique` : texte intégral, case explicite, preuve (version, empreinte SHA-256). Demandé à l'ouverture de Zakat, purification ou Hajj, avec retour à l'écran d'origine |
| Retrait sans perte du budget | Le retrait ferme uniquement ces fonctions. Au choix : conserver les données (inaccessibles) ou les effacer, dans la même transaction (`withdraw_religious_consent`) |
| Privé par défaut en foyer partagé | Chaque donnée religieuse a un propriétaire (`owner_id`, imposé par le serveur). Un autre membre ne la voit que si le propriétaire a choisi de partager ET si les deux ont un consentement en vigueur. Lecture seule pour les autres membres |
| Protection dans PostgreSQL | Politiques RLS `religious_readable` / `religious_writable` sur objectifs Hajj/Omra et affectations, Zakat (réglages par personne, calculs), contributions, purification, préférences |
| Journal d'audit | Plus aucune valeur religieuse copiée (anciennes entrées purgées) ; entrées visibles de leur seul auteur |
| Suppression d'un compte | Les données religieuses de la personne sont effacées, y compris dans un foyer partagé |

Migration `20261110000011_religious_consent.sql`.

## Lot 1 — import bancaire CSV

Parcours `/import` : compte, format (détection automatique ou choix), fichier → **aperçu** → **confirmation**.

| Exigence | Réalisation |
| --- | --- |
| CSV belge générique | Profils `generic_be` (montant signé), `split_debit_credit_be` (débit / crédit), `generic_iso` ; UTF-8 ou Windows-1252 ; 512 Ko et 5 000 lignes au plus |
| Prévisualisation | Lignes lues, à importer, doublons, erreurs par ligne, intérêts ; tableau date, libellé, montant, catégorie proposée, statut |
| Catégorisation automatique | Règles système et du foyer (`categorize`) ; catégorie inconnue laissée vide |
| Doublons | Empreinte commune CSV/PSD2 (`dedupeHash`, rang d'occurrence pour deux opérations identiques le même jour) ; contrôle à l'aperçu ET dans la base |
| Confirmation | Rien n'est écrit avant. À la confirmation, le serveur **relit le fichier** et refait tous les contrôles : aucune ligne préparée par le navigateur n'est acceptée |
| Enregistrement atomique | `import_transactions` : lot, opérations et éléments de purification dans une seule transaction ; journal du lot (lues, importées, doublons, erreurs, intérêts) |
| Détection des intérêts | Libellés FR/NL et catégorie « intérêts », crédits seulement. L'opération est marquée ; un élément de purification « détecté » n'est créé qu'avec un consentement article 9 |
| Préparation PSD2 | Même pipeline et même fonction SQL pour un futur `BankingProvider` (`normalizeForImport` → `toImportPayload` → `import_transactions`) |
| Fichier | Lu en mémoire puis écarté ; jamais stocké |

Fichiers fictifs : `docs/exemples-csv/`. Migration `20261110000012_bank_import.sql`.

## Lot 2 — purification

Écran `/purification` (consentement article 9 requis). Moteur existant réutilisé : `detectInterest`,
`resolveInterestAmounts`, `purificationAmount`, `summarizePurification`, `canTransition`.

| Exigence | Réalisation |
| --- | --- |
| Détecter | Automatique à l'import ; bouton de détection sur les opérations existantes (24 mois) |
| Examiner | Confirmer (avec brut ou précompte si connus) ou écarter ; rejet réversible ; annulation d'une confirmation |
| Brut, précompte, net | Trois montants distincts ; le troisième est calculé ; incohérence refusée (brut = net + précompte), par l'application et par la base |
| Méthodologie | Choix explicite brut ou net, mémorisé par personne, appliqué aux éléments confirmés en une transaction ; aucune méthodologie par défaut (« à déterminer ») |
| Suivi | Synthèse : à examiner, à déterminer, à purifier, purifié, écarté |
| Purifications réalisées | Don déjà effectué, enregistré avec date et bénéficiaire : contribution « purification » + éléments « purifiés » en une transaction. **Aucun paiement** |
| Règles en base | Transitions imposées ; élément purifié définitif (ni modification, ni suppression) ; don lié non supprimable ; date future refusée |

Migration `20261110000013_purification_workflow.sql`.

## Validation

| Niveau | Contenu |
| --- | --- |
| Moteurs et pipeline (Vitest) | Banque : relevés fictifs, intérêts, débit jamais intérêt, Windows-1252, détection du format, format SQL identique CSV/PSD2. Application : aperçu, limites, décisions de purification, synthèse, consentements séparés |
| SQL (PostgreSQL 16 et image Supabase) | `religious_consent.test.sql` (foyer partagé, partage, retrait, effacement, journal, propriétaire non usurpable) ; `import_purification.test.sql` (atomicité, réimport, limites, isolation, transitions, méthodologie, purification) ; tests antérieurs adaptés |
| Parcours réels (mobile et ordinateur) | Budget sans consentement et fonctions fermées ; import avec aperçu, erreurs, confirmation ; réimport sans ajout ; activation, détection, examen, précompte, méthodologie, purification enregistrée ; isolation par l'API ; retrait avec effacement ; parcours Sprint 1 adaptés (Hajj après consentement, retrait ciblé) |
| Démonstration | Écrans `/import` et `/finance-islamique` : rendu, mise en page, contraste |

Résultats chiffrés de la CI : voir la Pull Request #12 et le rapport de fin de lot.

## Limites connues

- Un seul élément de purification par opération : dans un foyer partagé, deux membres ne peuvent pas suivre
  chacun la purification d'un même intérêt (le premier qui le suit le détient).
- Le consentement en base est vérifié sur l'enregistrement le plus récent, quelle que soit sa version ;
  l'application exige en plus la version en vigueur (nouveau texte = nouvelle demande).
- Les profils propres aux banques belges (BNP Paribas Fortis, KBC, Belfius, ING) attendent des exports fictifs
  à structure réelle (décision D4).
- Aucun écran d'invitation dans un foyer : le partage en foyer est testé en SQL, pas encore dans l'interface.
