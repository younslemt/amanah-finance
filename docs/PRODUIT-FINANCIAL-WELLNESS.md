# Amanah Finance — évolution produit : Financial Wellness & Ethical Life Planning

**Statut** : cadrage produit et technique. Aucun développement engagé. Le Sprint 2 (PR #12) n'est pas modifié.
**Principe** : l'excellence de la gestion financière est le cœur du produit ; l'identité islamique est la
différenciation. Tous les chiffres viennent de moteurs déterministes et testés, jamais d'un LLM.

---

## 1. Audit de l'existant

### 1.1 Moteurs (`packages/engines`, TypeScript pur, 56 tests)

| Moteur | Fonctions | Réutilisation dans la nouvelle vision |
| --- | --- | --- |
| Budget mensuel | `summarizeMonth` : revenus, dépenses, dépenses essentielles, remboursements, intérêts exclus des revenus, statut par catégorie (ok / alerte à 85 % / dépassé) | **Base** de l'analyse financière : appliqué mois par mois, il donne l'historique et les dépassements |
| Réserve de précaution | `planEmergencyFund` : cible de 3 ou 6 mois de dépenses essentielles, écart, couverture | **Tel quel** pour l'évaluation de la réserve et la recommandation associée |
| Objectifs | `planGoal`, `observedMonthlyPace` : restant, mensualité requise, date projetée, rythme déclaré ou observé ; 8 types (`hajj`, `omra`, `children_education`, `real_estate`, `retirement`, `family_savings`, `emergency_fund`, `personal`) | **Cœur** du moteur universel d'objectifs et des simulations « date de réalisation » |
| Patrimoine | `computeNetWorth` | Situation financière (actifs, dettes, patrimoine net) |
| Opérations | `categorize`, `dedupeHash`, `detectInterest`, import CSV (`@amanah/banking`) | **Source** des données d'analyse ; libellés normalisés réutilisables pour détecter les dépenses récurrentes |
| Zakat, purification | Moteurs complets, figés | Inchangés ; séparés des nouveaux modules (l'Aïd n'est ni Zakat, ni Sadaqah, ni purification) |
| Monnaie, dates | Centimes entiers, arrondi bancaire, `addMonths`, `monthsBetween` | Base de tous les calculs (amortissement, scénarios) |

### 1.2 Données (Supabase, RLS par foyer, données religieuses par personne)

| Existant | Limite pour la nouvelle vision |
| --- | --- |
| `categories.is_essential` | « Essentiel » n'est pas « fixe » : un loyer est fixe, l'alimentation essentielle mais variable. Il manque la nature **fixe / variable** |
| `budgets` (plafond mensuel par catégorie) | Aucun scénario ; aucune comparaison entre mois |
| `goals` + `goal_allocations` (enveloppes) + `monthly_capacity_cents` | Pas de récurrence annuelle (Aïd), pas de date religieuse, pas de contributions familiales |
| `liabilities` : capital restant, échéances à 12 mois, porteuse d'intérêt | Ni mensualité, ni TAEG, ni durée, ni taux fixe/variable, ni conditions de remboursement anticipé |
| `organizations` (statut de vérification, dons acceptés) | Embryon de registre de partenaires, limité aux bénéficiaires de dons |
| Consentement article 9, `owner_id`, partage choisi | **À conserver** : Hajj, Omra et Aïd restent des données religieuses |

### 1.3 Écrans et parcours

| Écran | Constat |
| --- | --- |
| Tableau de bord | Juxtaposition de cartes statistiques (mois, Zakat, purification, objectifs) : pas de hiérarchie, pas d'action proposée. C'est précisément ce qu'il faut éviter |
| Budget | Un seul mois ; ni historique, ni charges récurrentes, ni capacité d'épargne |
| Objectifs | Seul l'objectif Hajj peut être créé, alors que le moteur gère 8 types ; aucune simulation de scénario |
| Patrimoine | Lecture seule ; aucune saisie d'actif ou de dette en mode réel |
| Import, Comptes, Finance islamique | Accessibles par des liens secondaires ; aucun parcours ne relie import → analyse → objectif |
| Navigation | 6 entrées principales, dont 2 religieuses (Zakat, Purification) : la navigation présente une application de conformité plutôt qu'une application de gestion financière |
| Graphiques | Barres de progression seulement ; aucune courbe ni comparaison dans le temps |
| Identité | Vert profond, blanc et or en place ; contrastes vérifiés automatiquement (bonne base) |

---

## 2. Parcours utilisateur cible

```
Données          Comprendre            Améliorer              Planifier             Réaliser
(import CSV,  →  Ma situation       →  Optimiser mon       →  Mes projets        →  Mes prochaines actions
 saisie)         financière            budget (scénarios)     (objectifs, Aïd,      Partenaires vérifiés,
                 capacité d'épargne,   Mes recommandations    Hajj, retraite…)      présentés seulement si
                 réserve, récurrences                                               le besoin est établi
```

**Navigation proposée** (5 entrées) : **Accueil** · **Budget** · **Projets** · **Patrimoine** · **Finance islamique**.
- *Recommandations* et *Prochaines actions* vivent dans l'Accueil (et une page dédiée).
- Zakat, purification et dons sont regroupés dans l'espace **Finance islamique**, ouvert après consentement.
- Comptes et import passent dans Budget (« Mes données »).

**Accueil** : cinq blocs, pas un mur de cartes.
1. **Ma situation financière** : une phrase de synthèse, puis capacité d'épargne, réserve et évolution sur 6 mois (un seul graphique).
2. **Mes recommandations** : les 3 plus importantes.
3. **Mes projets** : avancement et date projetée.
4. **Mes engagements** : mensualités de dettes, contributions planifiées, et Zakat ou purification à faire si l'utilisateur a consenti.
5. **Mes prochaines actions** : 1 à 3 actions concrètes.

**Principe d'honnêteté**, affiché partout :
- une économie **simulée** n'est jamais présentée comme **réalisée** ;
- une **enveloppe** d'objectif n'est jamais présentée comme de l'argent **transféré**.

---

## 3. Architecture complémentaire

Six moteurs, chacun pur, déterministe, sans accès réseau ni base, testé seul.

| Moteur | Emplacement | Entrées | Sorties principales |
| --- | --- | --- | --- |
| Financial Analysis Engine | `engines/src/analysis/` | opérations, catégories, budgets, comptes | séries mensuelles (`summarizeMonth` × N), charges récurrentes, fixe/variable, capacité d'épargne observée et estimée, dépassements répétés, concentration, état de la réserve |
| Budget Optimization Engine | `engines/src/optimization/` | analyse, scénario | capacité après scénario, écart, effet sur les dates des objectifs, proposition de réallocation |
| Goal Planning Engine | `engines/src/goals/` (extension de `goals.ts`) | objectifs, enveloppes, capacité | plans, scénarios, allocation de la capacité par priorité et échéance, occurrences annuelles (Aïd) |
| Debt Analysis Engine | `engines/src/debt/` | crédits | tableau d'amortissement, coût total restant, poids sur le budget, simulations de remboursement anticipé |
| Recommendation Engine | `engines/src/recommendations/` | sorties des quatre moteurs précédents | recommandations structurées, hiérarchisées, avec empreinte stable |
| Partner Directory | `packages/partners` + tables | besoin établi, pays, catégorie | partenaires **vérifiés** pertinents, avec transparence des conditions |

**Règles transverses**
- **Calculs côté client et serveur :** les moteurs tournent aussi dans le navigateur. Un scénario se calcule en direct sans rien écrire en base.
- **Recommandations :** elles sont **recalculées** à chaque affichage, jamais stockées. Seules les décisions de l'utilisateur sont enregistrées (écartée, faite, reportée), avec l'empreinte de la recommandation.
- **Textes :** les moteurs renvoient des **codes et des montants** ; les textes viennent des fichiers de langue (traduction NL et EN possible).
- **Données religieuses :** un objectif Aïd, Hajj ou Omra, ou une recommandation qui s'y rapporte, n'existe qu'avec le consentement article 9. C'est imposé par la RLS existante et par un paramètre `religiousEnabled` passé aux moteurs.
- **Partenaires :** aucune donnée personnelle ne leur est transmise. Une mise en relation future demandera un consentement distinct, un contrat de traitement et une validation réglementaire.

---

## 4. Périmètre des nouvelles fonctionnalités

### 4.1 Optimisation budgétaire (priorité 1)
Les éléments suivants sont détaillés au Sprint 3 (§6) :
- capacité d'épargne réelle (observée) et estimée ;
- distinction fixe / variable ;
- charges récurrentes et abonnements ;
- dépassements ;
- comparaison sur 6 mois ;
- état de la réserve ;
- bouton **« Optimiser mon budget »** avec scénarios non destructifs ;
- réallocation proposée vers les objectifs.

### 4.2 Recommandations (priorité 1)
Chaque recommandation contient :
1. le constat ;
2. les données utilisées, chacune avec sa source ;
3. une proposition ;
4. l'impact simulé ;
5. une action facultative.

Hiérarchie : urgence (critique, importante, utile, information), puis impact en euros. Règles prévues :

| Code | Règle | Sprint |
| --- | --- | --- |
| R1 | Dépenses supérieures aux revenus (capacité négative sur 3 mois) | 3 |
| R2 | Réserve de précaution insuffisante | 3 |
| R3 | Dépassement budgétaire répété | 3 |
| R4 | Capacité d'épargne non affectée | 3 |
| R5 | Concentration excessive des dépenses | 3 |
| R6 | Abonnements à revoir | 3 |
| R7 | Objectif en retard | 4 |
| R8 | Dette pesant fortement sur le budget | 6 |

### 4.3 Objectifs universels et Aïd al-Adha (priorité 2)
**Tous les types d'objectifs** se créent à l'écran, avec : montant cible, date, montant disponible, capacité, simulation, scénarios, alertes et historique des contributions.

**Aïd al-Adha** est un nouveau type, `eid_al_adha`, religieux, qui revient chaque année :
- coût du sacrifice ou de la quote-part ;
- frais complémentaires ;
- contributions familiales ;
- alternative « contribution à un organisme » ;
- reconduction annuelle.

**Date de l'Aïd** :
- elle est estimée par le calendrier hégirien tabulaire et affichée comme **estimation** ;
- l'utilisateur peut la confirmer ou la corriger, car l'observation lunaire varie selon les communautés ;
- l'objectif garde la trace de la source de la date (estimation ou date confirmée).

### 4.4 Parcours de réalisation et registre de partenaires (priorité 3)
Un partenaire n'est proposé qu'au bout du parcours : objectif défini, budget analysé, capacité évaluée, puis planification.

Le registre contient, pour chaque partenaire :
- domaine, pays et services ;
- statut de vérification et justificatifs ;
- conditions commerciales et commissions, affichées en toute transparence.

Règles d'affichage :
- un partenaire non vérifié n'est jamais présenté comme une offre ;
- les données de démonstration sont marquées « fictif » ;
- aucun partenaire réel n'est intégré avant validation.

### 4.5 Dettes et alternatives de financement (priorité 4)
- **Données de chaque crédit :** type, capital restant, mensualité, TAEG, durée résiduelle, taux fixe ou variable, coûts et conditions de remboursement anticipé.
- **Calculs :** amortissement, coût restant, poids sur le budget, scénarios de remboursement anticipé et de réduction de dette.
- **Espace « Explorer des alternatives de financement » :** contenu pédagogique (Murabaha, Ijara, Musharaka, Qard Hasan), relu par un comité charia. Il ne présente aucun produit comme disponible ni conforme, ne propose aucun refinancement et ne fait aucune mise en relation.

---

## 5. Roadmap

Le Sprint 2 se termine comme prévu. Son lot 4 (« dashboard financier ») est **remplacé** par le Sprint 3, qui le couvre en mieux, pour éviter de faire deux fois le même travail. Ses lots 3 (dons), 5 (Zakat de base), 6 (formats bancaires) et 7 (invitation) restent planifiés et dépendent de tes décisions.

| Sprint | Contenu | Durée | Préalables |
| --- | --- | --- | --- |
| **3** | Analyse financière, optimisation budgétaire, recommandations R1 à R6, nouvel accueil (situation + recommandations), navigation à 5 entrées | 2 semaines | Fusion de la PR #12 |
| 4 | Objectifs universels (tous types, scénarios, historique, alertes), Aïd al-Adha, recommandation R7, bloc « Mes projets » | 2 semaines | Q4 et Q5 (§7) pour l'Aïd |
| 5 | Parcours de réalisation, registre de partenaires (administration, vérification, affichage conditionnel), blocs « Mes engagements » et « Mes prochaines actions » | 2 semaines | Q1 à Q3 avant tout partenaire réel |
| 6 | Dettes complètes, simulations, recommandation R8, alternatives de financement pédagogiques | 2 semaines | Q6 à Q8 |

---

## 6. Sprint 3 — prêt à exécuter

**Objectif** : l'utilisateur comprend sa situation, voit ce qui pèse sur son budget, teste une économie sans rien
modifier et reçoit des recommandations chiffrées et vérifiables.

### Lot 3.1 — Financial Analysis Engine (moteur pur)
| Fonction | Règle |
| --- | --- |
| `monthlySeries(tx, categories, budgets, months)` | `summarizeMonth` appliqué à chaque mois complet |
| `detectRecurring(tx)` | Même contrepartie ou libellé normalisé, même sens, montant à ±10 %, cadence mensuelle (25 à 35 jours) ou annuelle ; au moins 3 occurrences (2 pour l'annuel) ; classée abonnement / charge fixe / revenu récurrent ; prochaine échéance attendue |
| `classifyNature(category, recurring)` | Nature choisie par l'utilisateur, sinon nature par défaut de la catégorie, sinon fixe si récurrente, sinon variable |
| `savingsCapacity(series, recurring)` | **Observée** : médiane du solde net sur les 3 à 6 derniers mois complets. **Estimée** : revenus récurrents − charges fixes − moyenne des dépenses variables. Fiabilité selon le nombre de mois disponibles (« données insuffisantes » sous 3 mois) |
| `budgetVariance(series)` | Dépassements du mois, dépassements répétés (2 mois sur 3), variation par catégorie par rapport à la moyenne |
| `spendingConcentration(series)` | Part de la première catégorie non essentielle dans les dépenses |
| `reserveStatus(series, accounts)` | `planEmergencyFund` sur la moyenne des dépenses essentielles ; comptes retenus : épargne et épargne réglementée, modifiables par l'utilisateur ; les enveloppes d'objectifs ne sont pas déduites, mais le chevauchement est signalé |

### Lot 3.2 — Budget Optimization Engine et écran « Optimiser mon budget »
- **Scénarios :**
  - réduction globale (« −50 €/mois ») ;
  - réduction par catégorie ;
  - suppression d'un abonnement détecté.
- **Résultat affiché :**
  - capacité avant et après ;
  - écart mensuel et annuel ;
  - nouvelles dates projetées des objectifs (`planGoal`) ;
  - délai pour atteindre la réserve cible.
- **Libellés :** « Économie simulée », « Projection », jamais « économisé ».
- **Écran `/budget/optimiser` :** calcul en direct dans le navigateur. Deux actions facultatives :
  - **Enregistrer le scénario** ;
  - **Appliquer au budget**, qui crée ou modifie des plafonds de budget après confirmation. Elle ne touche jamais aux opérations.
- **Réallocation :** la capacité libérée est répartie entre les objectifs actifs par priorité, puis par échéance. Ce n'est qu'une proposition, sans écriture.

### Lot 3.3 — Recommendation Engine et page « Mes recommandations »
- **Règles :** R1 à R6, codes et données structurés, empreinte stable (règle + clé + période).
- **Décisions de l'utilisateur :**
  - « Écarter », « C'est fait » ou « Me le rappeler dans 30 jours » ;
  - une recommandation écartée ne revient que si ses données changent significativement.
- **Page `/recommandations` et 3 premières sur l'accueil :** chacune affiche « Pourquoi ? » avec les données utilisées.

### Lot 3.4 — Accueil et navigation
- Accueil restructuré : **Ma situation financière** (synthèse, capacité, réserve, graphique 6 mois avec tableau équivalent), **Mes recommandations**, **Mes projets** (existant).
- Navigation à 5 entrées. Budget gagne les onglets **Ce mois**, **Évolution**, **Charges récurrentes** et **Mes données** (comptes, import).

### Données (migration 0014)
| Changement | Sécurité |
| --- | --- |
| `categories.default_nature` (fixe / variable) renseigné pour les catégories système | Référence |
| `household_category_settings (household_id, category_slug, nature)` | RLS foyer |
| `accounts.counts_as_reserve` (par défaut : épargne et épargne réglementée) | RLS foyer existante |
| `budget_scenarios (household_id, name, adjustments jsonb, created_by)` | RLS foyer ; aucune écriture sur budgets ou opérations |
| `recommendation_feedback (household_id, user_id, fingerprint, status, snooze_until)` | Personnelle (user_id = auth.uid()) |
| `recurring_feedback (household_id, series_key, verdict)` (« pas un abonnement ») | RLS foyer |

### Critères d'acceptation
1. Avec 6 mois d'opérations fictives, l'évolution affiche les 6 mois et les dépassements répétés.
2. Les abonnements fictifs (streaming, salle de sport, téléphone) sont détectés avec leur prochaine échéance.
3. Une dépense isolée n'est jamais détectée comme récurrente.
4. Capacité observée et capacité estimée sont affichées séparément, avec leur méthode. Avec moins de 3 mois de données, l'écran affiche « données insuffisantes », pas un chiffre.
5. Le scénario « −50 €/mois » affiche la capacité après scénario et la nouvelle date de chaque objectif. Les budgets et les opérations en base restent identiques avant et après la simulation (test en base).
6. « Appliquer au budget » ne modifie que les plafonds, après confirmation, et c'est tracé.
7. Chaque recommandation affiche constat, données utilisées, proposition, impact simulé et action facultative ; l'ordre suit la règle de hiérarchie (test unitaire).
8. Une recommandation écartée ne réapparaît pas tant que ses données ne changent pas.
9. Aucune recommandation ne mentionne de donnée religieuse sans consentement article 9.
10. Un membre d'un autre foyer ne lit aucune donnée nouvelle (scénarios, réglages, décisions), contrôlé en base et par l'API.
11. L'accueil est utilisable sur téléphone (412 px), sans défilement horizontal, avec un contraste conforme ; chaque graphique a un tableau équivalent.
12. La CI (4 jobs) reste verte, et tous les tests des Sprints 1 et 2 passent sans modification de leur intention.

### Tests
- **Moteurs :** relevé fictif de 12 mois (cas limites : mois incomplet, remboursement, devise étrangère, abonnement annuel, montant variable de ±10 %).
- **SQL :** RLS des 4 nouvelles tables, absence d'écriture lors d'une simulation, décisions personnelles.
- **Parcours réels :** import 6 mois, évolution, récurrences, optimisation, application au budget, recommandations, isolation.

---

## 7. Questions réglementaires et décisions à valider

| # | Question | Pour quel sprint | Interlocuteur |
| --- | --- | --- | --- |
| Q1 | Les recommandations budgétaires restent-elles hors du conseil en investissement (MiFID) et de l'intermédiation en crédit ? Ligne rouge proposée : jamais de produit nommé, ni de « souscrivez », ni de « refinancez » | 3 (à confirmer avant mise en production) | Juriste, FSMA si nécessaire |
| Q2 | Registre de partenaires avec commissions : statut d'intermédiaire (crédit, assurance, services d'investissement) selon les partenaires, règles des pratiques commerciales et de la publicité (TAEG) | 5 | Juriste |
| Q3 | Transmission de données à un partenaire : consentement distinct, contrat de traitement, information sur le profilage (RGPD art. 13, 21 et 22) | 5 | Juriste RGPD |
| Q4 | Prestataires de l'Aïd : conformité aux règles régionales d'abattage et à l'AFSCA, qui diffèrent entre la Flandre, la Wallonie et Bruxelles | 4 (avant tout partenaire) | Juriste, autorités régionales |
| Q5 | Date de l'Aïd : référence retenue (calcul, comité, observation locale) | 4 | Comité charia |
| Q6 | Remboursement anticipé : indemnités légales (crédit hypothécaire, crédit à la consommation, Code de droit économique, livre VII) à paramétrer, non codées en dur sans validation | 6 | Juriste |
| Q7 | Contenu pédagogique sur Murabaha, Ijara, Musharaka et Qard Hasan : relecture charia ; aucune affirmation de disponibilité en Belgique ni de conformité | 6 | Comité charia, juriste |
| Q8 | Organisateurs Hajj et Omra, organismes caritatifs : vérification (voyages à forfait, agrément saoudien, agrément fiscal belge des dons) | 5 | Juriste |
| Q9 | Recommandations calculées automatiquement : sont-elles un profilage au sens du RGPD ? Information et opposition à prévoir | 3 | Juriste RGPD |
