# Registre de gouvernance des méthodologies religieuses

**Statut au 21 novembre 2026 : toutes les méthodologies sont PROVISOIRES.** Aucune n'a été relue ni approuvée par une autorité religieuse qualifiée. Amanah Finance ne revendique aucune certification, aucun label et aucune validation charia.

Décision produit (21 novembre 2026) : le développement continue avec des méthodologies provisoires, documentées et versionnées. Une validation par une autorité religieuse qualifiée est **obligatoire avant toute certification ou commercialisation** de conclusions de conformité.

## 1. Règles du registre

1. **Une méthodologie = une entrée** : identifiant stable, version, statut, emplacement dans le code, choix laissés à la personne, référence consultée, réviseur.
2. **Statuts** (même vocabulaire que `zakat_rulesets.review_status`) : `draft` (brouillon) → `under_review` (en revue) → `approved` (approuvée) → `retired` (retirée). Aujourd'hui, toutes les entrées sont `draft`.
3. **Le passage à `approved` exige** une revue écrite par une autorité religieuse qualifiée, nommément désignée, avec la date, le périmètre et la version relue. Ce document est archivé dans `docs/adr/`. Sans cette pièce, le statut reste `draft` ou `under_review`.
4. **Toute modification de règle crée une nouvelle version** ; un calcul enregistré garde la version qui l'a produit (déjà le cas pour la Zakat : `zakat_calculations` conserve les entrées et la version).
5. **Affichage** : une méthodologie non `approved` porte la mention « Méthode provisoire » partout où elle produit un résultat. Ses résultats ne sont jamais présentés comme une obligation religieuse, un avis juridique ou un conseil réglementé.
6. **Choix personnels** : quand les écoles divergent, l'option est laissée à la personne. Rien n'est choisi à sa place ; un choix manquant bloque le calcul au lieu de prendre une valeur par défaut.
7. **Consentement** : aucune méthodologie ne s'exécute sur des données religieuses sans consentement article 9 en vigueur.

## 2. Registre

| Id | Méthodologie | Version | Statut | Code | Choix laissés à la personne | Références consultées | Réviseur |
|---|---|---|---|---|---|---|---|
| M-01 | Référentiel de Zakat : taux (2,5 % lunaire, 2,577 % solaire), nisab (85 g d'or, 595 g d'argent), hawl (354 / 365 jours), ancienneté maximale des prix (7 jours) | `amanah-zakat` 1.0.0, moteur 0.1.0 | draft | `packages/engines/src/zakat/ruleset.ts`, table `zakat_rulesets` | Base du nisab (or / argent) | AAOIFI norme n° 35 ; écoles hanafite et majoritaire (libellés internes, non vérifiés par un savant) | à désigner |
| M-02 | Options de calcul de la Zakat : année, bijoux personnels, placements à long terme, pensions bloquées, dettes, biens exclus | 1.0.0 | draft | `packages/engines/src/zakat/settings.ts` | Toutes (aucune valeur par défaut) | Avis contemporains sur les dettes (libellé interne) | à désigner |
| M-03 | Purification des intérêts : détection de candidats (intérêts, primes de fidélité, part impure de dividendes), confirmation par la personne | 1.0.0 | draft | `packages/engines/src/purification.ts` | Base brute ou nette (« à déterminer » tant qu'elle n'est pas choisie), confirmation ligne par ligne | aucune référence formelle | à désigner |
| M-04 | Estimation des dates hégiriennes (Ramadan, Aïd al-Fitr, Aïd al-Adha) par le calendrier tabulaire | 1.0.0 | draft | `packages/engines/src/eid.ts`, `familyCalendar` | Confirmation de la date avec sa source (mosquée, autorité suivie) | calendrier arithmétique, non officiel | à désigner |
| M-05 | Classement des contributions : Zakat, Zakat al-Fitr, Sadaqah, purification, waqf, autre ; rapprochement avec une opération sous 10 jours | 1.0.0 | draft | `packages/engines/src/contributions.ts` | Type de chaque contribution, confirmation du rapprochement | aucune référence formelle | à désigner |
| M-06 | Suggestions de projets religieux (Ramadan, Aïd, Hajj, Omra, autre projet religieux) | 1.0.0 | draft | `packages/engines/src/suggestions.ts` | Activation du groupe « religieux », décision sur chaque suggestion, montants | aucune : suggestion d'organisation, jamais une obligation | à désigner |

Hors registre : le budget de l'Aïd (`eidBudget`) additionne des montants saisis par la personne et ne tranche aucune question religieuse. Les règles de confidentialité (article 9) relèvent du registre des consentements (`CONSENTEMENTS-ANALYSE.md`).

## 3. Avant toute certification ou commercialisation

- [ ] Désigner une ou plusieurs autorités religieuses qualifiées (périmètre, indépendance, conflits d'intérêts).
- [ ] Faire relire M-01 à M-06 dans leur version en vigueur ; archiver chaque avis signé.
- [ ] Remplacer les libellés de références internes par les références exactes retenues par le réviseur.
- [ ] Faire passer chaque entrée à `approved` ou la corriger (nouvelle version).
- [ ] Faire valider par un juriste le vocabulaire public (« conforme », « certifié », « halal ») avant tout usage.

## 4. Historique

| Date | Changement |
|---|---|
| 2026-11-21 | Création du registre ; six méthodologies recensées, toutes en brouillon. |
