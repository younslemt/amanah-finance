# Sprint 4 — dons et Sadaqah, Zakat personnalisée, étude PSD2

Branche `sprint-4`, créée depuis `main` après la fusion du Sprint 3. Données exclusivement fictives :
aucun paiement, aucun justificatif stocké, aucune banque connectée, aucun déploiement.

## Lot 4.1 — Dons et Sadaqah (`/dons`)

Moteur pur `packages/engines/src/contributions.ts`. Il réutilise la table `contributions` et le parcours de purification existants.

| Exigence | Réalisation |
| --- | --- |
| Types suivis | Zakat, Zakat al-Fitr, Sadaqah, purification, waqf, autre don |
| Historique et bénéficiaires | Liste datée, note facultative. Bénéficiaires déjà utilisés proposés à la saisie et regroupés sans tenir compte de la casse |
| Totaux annuels | Par année et par type (`summarizeContributions`), avec la part déclarée et la part vérifiée |
| Affectations | Un don de Zakat peut être affecté à un calcul de Zakat enregistré, une Zakat al-Fitr à l'obligation d'une année. Suivi « dû, payé, reste, au-delà du dû » (`zakatSettlements`, `fitrSettlements`). Affectation impossible vers un autre type ou vers les données d'une autre personne (application ET base) |
| Pas de double comptage | Une contribution « purification » ne naît que de `record_purification`. Toute saisie directe est refusée par la base, y compris par l'API. Le module de dons l'affiche une fois, sans pouvoir la modifier ni la supprimer. Les totaux dédoublonnent par identifiant |
| Déclaré ou vérifié | « Déclaré » : saisi par la personne. « Vérifié » : rapproché d'un débit importé du même montant, à 10 jours au plus. Une opération ne prouve qu'un don. Après vérification, le montant n'est plus modifiable. La personne choisit l'opération parmi celles proposées (`matchCandidates`) |
| Confidentialité | Données article 9 (`owner_id`, RLS `religious_readable` / `religious_writable`). Les dons partagés par un membre du foyer sont affichés, mais pas comptés dans les totaux de la personne |

## Lot 4.2 — Zakat personnalisée (`/zakat`, `/zakat/al-fitr`)

Le moteur existant `calculateZakat` est réutilisé sans modification. Ajout de `packages/engines/src/zakat/settings.ts`.

| Exigence | Réalisation |
| --- | --- |
| Aucune règle imposée | Les options qui changent le résultat doivent être choisies explicitement : année lunaire ou solaire, bijoux, placements à long terme, épargne bloquée, dettes. Seules celles qui concernent les biens retenus sont demandées (`requiredZakatChoices`). Un choix manquant bloque le calcul et est listé. Une option sans objet est signalée comme telle. La base du nisab et le Hawl restent « à déterminer » dans le moteur. Les valeurs de repli de l'ancienne lecture des réglages sont supprimées. La base n'impose plus d'année par défaut (migration 0016) |
| Réglages individuels | Réglages propres à chaque personne, avec les références de chaque option (écoles, avis contemporains). La personne peut exclure de SA Zakat des biens ou des dettes du foyer |
| Saisie du patrimoine | Biens (or et argent au poids et au titre, bijoux, placements, pensions, créances…) et dettes avec échéances à 12 mois. Ce sont des données du foyer, déjà utilisées par Patrimoine. Les soldes de comptes sont repris automatiquement, sans double saisie |
| Prix de l'or et de l'argent | Saisie manuelle, par personne, avec source et date (jamais dans le futur). Le prix le plus récent non futur est retenu (`selectMetalPrice`). Fraîcheur affichée (récent, plus de 7 jours, absent). Aucun service payant |
| Calcul détaillé | Statut, assiette brute, dettes déduites, nisab, taux, puis chaque ligne avec la règle appliquée et ses références. Les raisons « à déterminer » et les avertissements sont affichés |
| Enregistrement et reproductibilité | Le serveur refait tout le calcul depuis la base : aucune valeur ne vient du navigateur. Il conserve les entrées exactes du moteur, les options sans objet, les biens exclus, la source des prix, le résultat et les versions. Le calcul enregistré est figé par la base. L'historique refait chaque calcul (`replayZakat`, comparaison insensible à l'ordre des clés JSONB) et affiche « Reproduit à l'identique » ou les champs qui diffèrent |
| Historique | Calculs de la personne, écart avec le calcul précédent (assiette, montant dû), dû / payé / reste depuis les dons affectés |
| Zakat al-Fitr séparée | Page et table propres (`zakat_fitr_obligations`) : année, personnes, montant par personne et sa source, tous choisis par la personne, sans valeur par défaut. Une obligation par personne et par année. Les paiements sont déclarés comme dons affectés |
| Référentiel provisoire | `amanah-zakat 1.0.0` affiché comme provisoire, en attente de validation par un comité charia qualifié. Mention « ni fatwa ni certification » sur chaque écran |

## Lot 4.3 — Étude PSD2

`docs/ETUDE-PSD2.md` compare Tink, Salt Edge, Enable Banking, Yapily, Powens et Ponto : couverture des banques belges, fonctions, agrément et partenariat, prix, minimums, sandbox, données, consentement (180 jours) et intégration.
Recommandation : **Enable Banking**, puis **Ponto**. Le budget repose sur des hypothèses identifiées, car aucun des deux ne publie de grille complète.
Aucune souscription ni connexion.

## Base de données (migration 0016)

`20261121000016_contributions_zakat.sql` :
- tables `zakat_fitr_obligations` et `zakat_metal_prices`, avec propriétaire imposé et RLS article 9 ;
- contributions :
  - colonnes `note`, `transaction_id` et `zakat_fitr_id`, avec clés étrangères composites (même foyer) ;
  - unicité de l'opération rapprochée ;
  - contrôles du type affecté ;
  - garde `contribution_guard` : purification réservée au parcours, date non future, débit compatible, affectations à la même personne ;
- `record_purification` marque sa propre insertion ;
- l'effacement au retrait du consentement couvre les nouvelles tables ;
- année de référence Zakat sans valeur par défaut.

## Validation

| Niveau | Contenu |
| --- | --- |
| Moteurs | `contributions.test.ts` : totaux sans double comptage, déclaré et vérifié, affectations, règlements, rapprochement, bénéficiaires ; choix requis, aucune valeur par défaut, exclusions, prix et fraîcheur, reproductibilité après passage par JSON, Zakat al-Fitr |
| Application | `donations.test.ts` : modèle d'affichage, validation des saisies (purification refusée, affectations), historique reproductible et altération détectée ; mise à jour des tests de conversion et de synthèse |
| SQL (PostgreSQL 16 et image Supabase) | `contributions_zakat.test.sql` : propriétaire imposé, purification saisie refusée, vérification bancaire (montant, délai, crédit, unicité), Zakat al-Fitr, prix (source, date), réglages sans défaut, calcul figé, affectations croisées refusées, isolation dans le foyer, sans consentement et entre foyers, effacement au retrait |
| Démonstration | Écrans `/dons` et `/zakat/al-fitr` : rendu, navigation, contraste, mobile et ordinateur |
| Parcours réels | `sprint4.spec.ts`, mobile et ordinateur : dons fermés sans consentement ; Zakat sans choix imposé, prix avec source, calcul enregistré et reproduit ; Zakat al-Fitr ; dons affectés, totaux, rapprochement avec un relevé importé ; purification falsifiée refusée par l'API ; isolation entre foyers |

## Limites connues

- Les biens et dettes restent des données du foyer. La répartition entre membres se fait par exclusion personnelle, pas par propriété des biens.
- La Zakat al-Fitr n'a pas de date de Ramadan calculée. L'année est saisie par la personne.
- Aucun justificatif n'est stocké (décision D6 en attente).
- Le référentiel de Zakat reste un brouillon (D2) ; la méthodologie de la purification reste le choix de la personne (D3).
