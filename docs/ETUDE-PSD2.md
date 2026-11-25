# Étude PSD2 — choix d'un fournisseur d'Open Banking pour le lancement en Belgique

Sprint 4, lot 4.3. Recherches du 20 novembre 2026, sur les pages officielles des fournisseurs et les textes européens.
**Aucune souscription, aucune clé de production, aucune connexion bancaire réelle.**

Règle suivie : un prix, une banque couverte ou une condition contractuelle n'est indiqué que s'il est publié.
Sinon : « non publié ». Les chiffres repris d'articles de tiers sont signalés comme tels et ne servent qu'aux hypothèses.

## 1. Ce dont Amanah Finance a besoin

| Besoin | Détail |
| --- | --- |
| Service | Information sur les comptes (AIS) seulement : soldes et opérations des comptes de particuliers. Aucun paiement (PIS) au lancement |
| Banques | BNP Paribas Fortis (avec Fintro et Hello bank!), KBC / CBC, Belfius, ING Belgique, Argenta, Crelan, puis Beobank, Keytrade, bpost bank, Van Breda |
| Statut | Amanah Finance n'a pas d'agrément AISP. Il faut donc s'appuyer sur l'agrément du fournisseur |
| Données | Hébergement dans l'UE, aucune revente ni réutilisation par le fournisseur, suppression à la demande |
| Architecture | Brancher le fournisseur sur l'interface existante `BankingProvider` (`packages/banking`) et sur la chaîne d'import déjà utilisée pour les CSV : `normalizeForImport` → `toImportPayload` → fonction SQL `import_transactions`, avec détection des doublons commune CSV / PSD2 |

## 2. Cadre réglementaire commun

- **Agrément.** L'accès aux comptes est un service de paiement réglementé (AIS). Sans agrément propre, il faut s'appuyer sur un fournisseur agréé, selon l'un de deux modèles : le client final contracte avec le fournisseur, ou Amanah devient son agent enregistré. Le modèle à retenir dépend du contrat de chaque fournisseur ; il est à faire valider par le juriste (question Q10, §8).
- **Renouvellement de l'accès.** Le règlement délégué (UE) 2022/2360 porte de 90 à 180 jours le délai de renouvellement de l'authentification forte, quand l'accès passe par un prestataire AIS. Il est applicable depuis le 25 juillet 2023. Concrètement : l'utilisateur doit se réauthentifier auprès de sa banque environ tous les 6 mois. Enable Banking confirme que la durée maximale est de 180 jours pour la plupart des banques.
- **PSD3 / PSR.** Le Parlement européen et le Conseil ont conclu un accord politique provisoire le 27 novembre 2025. Il prévoit une liste d'obstacles interdits à l'accès aux données et un tableau de bord des autorisations chez la banque. Les textes doivent encore être adoptés formellement : l'architecture doit rester indépendante du fournisseur.
- **Données article 9.** Les opérations bancaires peuvent révéler des convictions religieuses (dons, mosquée). Elles restent des données du foyer. Les fonctions religieuses restent soumises au consentement séparé déjà en place, et le fournisseur ne reçoit jamais de catégorisation religieuse.

## 3. Comparatif

Légende : ✅ publié et vérifié · ⚠️ partiel ou à confirmer · ❌ non publié.

### 3.1 Couverture des banques belges

| Fournisseur | Ce qui est publié pour la Belgique |
| --- | --- |
| **Enable Banking** | ✅ Page dédiée à la Belgique : BNP Paribas Fortis, KBC (KBC, CBC, KBC Brussels), Belfius, ING, Argenta, Crelan, avec le détail de l'authentification de chaque banque (itsme, lecteur de carte, passage vers l'application de la banque). Bank Van Breda et BBVA sont également cités. Limite publiée : pas d'accès aux comptes de carte de crédit chez KBC et Crelan |
| **Ponto (Isabel Group)** | ⚠️ Annonce plus de 1 700 banques européennes dans 15 pays. Société belge, liée aux grandes banques belges : Isabel développe la plateforme KUBE avec Belfius, BNP Paribas Fortis, ING Belgique et KBC. Liste détaillée par banque non consultée : à demander |
| **Yapily** | ⚠️ Documentation par banque : KBC, CBC et KBC Brussels, Belfius (et Banx), BNP Paribas. Pour Belfius, la documentation exige des certificats eIDAS si l'on n'utilise pas l'agrément Yapily |
| **Tink** | ⚠️ Couverture de la Belgique documentée dans son outil de capacités par marché (non consultable sans compte). Partenaire historique de BNP Paribas Fortis pour l'agrégation |
| **Salt Edge** | ⚠️ Annonce plus de 5 000 banques et plus de 2 500 banques de l'UE via son Partner Program. Belgique présente dans ses listes de connecteurs, sans liste exploitable par banque |
| **Powens** | ❌ Aucune liste par pays ni par banque sur la page de tarifs. Couverture belge à demander |

### 3.2 Fonctions, cadre et modalités de partenariat

| Fournisseur | Fonctions | Agrément et partenariat |
| --- | --- | --- |
| **Enable Banking** | AIS et PIS, une API unifiée, données comptes particuliers et entreprises | Prestataire AIS agréé par l'autorité finlandaise (FIN-FSA). Contrat et vérification de la société (KYB) requis avant la production |
| **Ponto** | AIS (soldes, opérations en temps réel) et PIS | Établissement de paiement agréé AISP / PISP par la Banque nationale de Belgique, avec passeport européen. Deux modèles : le partenaire paie (Ponto facture Amanah), ou le client final paie Ponto |
| **Tink** (groupe Visa) | AIS, vérification de compte. PIS et analyses avancées réservés à l'offre Enterprise | Offre Standard : agrément Tink. Offre Enterprise : agrément Tink ou agrément propre |
| **Yapily** | Données, Data Plus (catégorisation), paiements | Option Yapily Connect pour les entreprises sans agrément (entités agréées au Royaume-Uni et en Lituanie) |
| **Salt Edge** | AIS, PIS, enrichissement, AML | Partner Program : pas d'agrément PSD2 ni de certificat eIDAS requis pour le client |
| **Powens** | Agrégation, documents, paiements | « Opérateurs réglementés ou non réglementés » : modèle exact non précisé |

### 3.3 Prix, minimums et sandbox

| Fournisseur | Frais d'intégration | Abonnement / coût par connexion | Minimum de volume | Sandbox |
| --- | --- | --- | --- | --- |
| **Enable Banking** | ❌ | ❌ Prix selon le volume (comptes consultés, paiements), sur devis | ⚠️ Facture mensuelle minimale annoncée, montant non publié | ✅ Environnements simulé et de production accessibles avant contrat. Mode restreint possible sur ses propres comptes |
| **Ponto** | ⚠️ « Aucun investissement initial » sur une page non datée ; page actuelle : pas de coûts cachés | ❌ Abonnement mensuel par compte lié, dégressif, sans montant publié. Une page de myponto.com (non datée) mentionne une tarification descendant jusqu'à 1 € par compte et 0,10 € par paiement : à reconfirmer | ✅ Aucun minimum mentionné | ✅ Sandbox gratuite annoncée |
| **Tink** | ❌ | ❌ La page de tarifs réserve les prix aux clients existants : contact commercial. Des articles de tiers citent 0,50 € par utilisateur et par mois (offre Standard) : non confirmé par Tink | ❌ | ⚠️ Console développeur ; conditions non détaillées sur la page de tarifs |
| **Yapily** | ❌ | ❌ « Tarification sur mesure » | ❌ | ⚠️ Démarrage gratuit annoncé, sans détail |
| **Salt Edge** | ❌ | ❌ Aucun prix sur la page produit | ❌ | ⚠️ Accès aux clés d'API proposé, conditions non détaillées |
| **Powens** | ❌ | ❌ « Prix dégressifs », sans montant | ❌ | ✅ Environnement de test, en autonomie |

### 3.4 Hébergement, protection des données, consentement

| Fournisseur | Données | Consentement et renouvellement |
| --- | --- | --- |
| **Enable Banking** | ✅ Ne stocke ni ne met en cache les données, sauf pour les transmettre à l'application autorisée | ✅ Durée fixée à la création de la session, plafonnée par la banque (180 jours pour la plupart). Renouvellement obligatoire à l'échéance |
| **Ponto** | ✅ Société et autorité de contrôle belges (Banque nationale de Belgique). L'utilisateur limite les données partagées et la durée, et peut révoquer à tout moment | ⚠️ Règle européenne de 180 jours ; modalités Ponto à confirmer en sandbox |
| **Tink** | ⚠️ Conditions d'utilisation publiques ; hébergement à confirmer | Règle européenne de 180 jours |
| **Yapily, Salt Edge, Powens** | ⚠️ À obtenir par écrit (localisation, sous-traitants, durée de conservation) | Règle européenne de 180 jours |

### 3.5 Intégration dans l'architecture actuelle

L'interface `BankingProvider` prévoit déjà : liste des banques, début et fin du consentement, comptes, opérations et révocation. La table `bank_connections` prévoit déjà le consentement, son échéance et une référence au coffre de secrets. La chaîne d'import est commune au CSV et à la PSD2. Un fournisseur ne demande donc qu'un **adaptateur** : authentification de l'application, redirection, conversion des opérations, gestion des échéances.

| Fournisseur | Simplicité estimée | Raison |
| --- | --- | --- |
| Enable Banking | **Élevée** | API unique, redirection vers la banque, documentation publique par banque belge ; identifiant déjà prévu dans `ProviderId` |
| Ponto | Élevée | API REST documentée, sandbox. Le parcours passe par un compte Ponto de l'utilisateur : impact à vérifier en sandbox |
| Tink | Moyenne | Interface Tink Link à intégrer, offre Standard limitée ; identifiant déjà prévu |
| Salt Edge | Moyenne | Modèle « client / connexion » à adapter ; identifiant déjà prévu |
| Yapily, Powens | Moyenne | Pas d'identifiant prévu ; certificats eIDAS requis pour Belfius chez Yapily sans Yapily Connect |

Charge estimée pour un adaptateur et ses tests (sandbox, données fictives) : 8 à 12 jours de développement, quel que soit le fournisseur. C'est une **hypothèse interne**, pas un tarif.

## 4. Recommandation : deux fournisseurs pour le lancement en Belgique

### 1er choix : Enable Banking
- **Couverture belge la mieux documentée** : les six grandes banques, avec leurs particularités d'authentification et leurs limites publiées.
- **Données** : le fournisseur ne stocke pas les données, ce qui réduit l'exposition RGPD.
- **Intégration** : API directe et neutre, qui correspond exactement à notre interface ; identifiant déjà prévu.
- **Essai** : sandbox et mode restreint avant tout contrat.
- **Point faible** : aucun prix public et une facture mensuelle minimale non chiffrée. C'est la première question à poser.

### 2e choix : Ponto (Isabel Group)
- **Ancrage belge** : agréé par la Banque nationale de Belgique, lié aux grandes banques belges.
- **Tarification** : modèle par compte lié, sans minimum ni investissement initial annoncés, possibilité de refacturer le client.
- **Point faible** : le parcours passe par un compte Ponto de l'utilisateur, à évaluer pour une application grand public. La liste des banques couvertes est à obtenir.

**Écartés au lancement** (à réexaminer à l'échelle européenne) :
- Tink : prix réservés aux clients, fonctions avancées en offre Enterprise ;
- Yapily : couverture belge partielle documentée, orientation paiements ;
- Salt Edge : couverture belge non détaillée ;
- Powens : aucune information belge publiée.

## 5. Estimation budgétaire (hypothèses explicites)

Aucun des deux fournisseurs recommandés ne publie aujourd'hui de prix complet. Le budget est donc construit sur des **hypothèses**, à remplacer par les devis.

| Hypothèse | Valeur | Origine |
| --- | --- | --- |
| H1 Comptes liés par utilisateur | 1,5 | Hypothèse interne (compte courant + épargne pour une partie des foyers) |
| H2 Prix bas par compte et par mois | 0,50 € | Ordre de grandeur cité par des tiers pour Tink Standard (non confirmé) |
| H3 Prix médian par compte et par mois | 1,00 € | Plancher mentionné sur une page Ponto non datée (à reconfirmer) |
| H4 Prix haut par compte et par mois | 2,00 € | Marge de prudence pour faibles volumes |
| H5 Minimum mensuel | 0 € (Ponto, aucun annoncé) ; inconnu (Enable Banking) | Pages officielles |

| Utilisateurs connectés | Comptes liés (H1) | Coût mensuel bas (H2) | Médian (H3) | Haut (H4) | Coût par utilisateur et par mois |
| --- | --- | --- | --- | --- | --- |
| 100 (pilote) | 150 | 75 € | 150 € | 300 € | 0,75 € à 3,00 € |
| 1 000 | 1 500 | 750 € | 1 500 € | 3 000 € | 0,75 € à 3,00 € |
| 5 000 | 7 500 | 3 750 € | 7 500 € | 15 000 € | 0,75 € à 3,00 € |

À ajouter :
- un éventuel minimum mensuel (Enable Banking) ;
- la TVA ;
- la charge d'intégration interne (8 à 12 jours) ;
- aucun certificat eIDAS (agrément du fournisseur).

**Conséquence produit** : la connexion bancaire coûte de 0,75 € à 3 € par utilisateur connecté et par mois. Elle doit donc rester une fonction réservée à une offre payante, ou être plafonnée en nombre de comptes. L'import CSV reste gratuit et sans limite.

## 6. Questions à poser aux deux fournisseurs (avant tout contrat)

1. Grille tarifaire écrite : prix par compte lié, par appel, par renouvellement, minimum mensuel, durée d'engagement.
2. Liste des banques belges en production, taux de réussite des connexions, et accès aux comptes d'épargne et de carte de crédit.
3. Modèle juridique : qui contracte avec l'utilisateur, faut-il enregistrer Amanah Finance comme agent auprès de la Banque nationale, à qui reviennent les responsabilités RGPD.
4. Localisation des données, sous-traitants, durée de conservation, procédure d'effacement.
5. Gestion de l'échéance des 180 jours : notifications, renouvellement dans l'application.
6. Sandbox : données fictives disponibles pour les banques belges, durée et limites d'utilisation.

## 7. Suite proposée (non engagée)

- Sprint 5 ou 6 : demande de devis aux deux fournisseurs, puis adaptateur en **sandbox uniquement**, avec des données fictives.
- Aucune clé de production ni connexion réelle avant validation juridique (Q10) et décision du fondateur.

## 8. Question réglementaire ajoutée

| # | Question | Pour quand | Interlocuteur |
| --- | --- | --- | --- |
| Q10 | Accès aux comptes via un fournisseur agréé : modèle contractuel (client du fournisseur ou agent d'Amanah), enregistrement éventuel auprès de la BNB, répartition des rôles RGPD (responsable du traitement, sous-traitant) | Avant la première connexion réelle | Juriste, BNB si nécessaire |

## Sources

- [Tink, tarifs](https://tink.com/pricing) ; [Tink, FAQ](https://tink.com/faq/)
- [Enable Banking, FAQ (tarifs, sandbox, consentement, données)](https://enablebanking.com/docs/faq) ; [Enable Banking, Belgique](https://enablebanking.com/docs/markets/be/) ; [Enable Banking, formulaire de devis (mars 2026)](https://enablebanking.com/blog/2026/04/08/enable-banking-changelogmarch-2026)
- [Ponto, modèle « le partenaire paie »](https://myponto.com/en/pricing/partner-paying-model/) ; [Ponto, modèle « le client paie »](https://myponto.com/en/pricing/customer-paying-model/) ; [Ponto, accueil](https://myponto.com/en) ; [Ponto, agrément BNB](https://myponto.com/?p=1175) ; [KBC, plateforme KUBE](https://newsroom.kbc.com/four-major-banks-and-isabel-group-join-forces-to-streamline-business-services-with-kube)
- [Yapily, tarifs](https://www.yapily.com/pricing) ; [Yapily, KBC Belgique](https://docs.yapily.com/institution-configurations/belgium/KBC-Belgium) ; [Yapily, Belfius](https://docs.yapily.com/institution-configurations/belgium/Belfius)
- [Salt Edge, agrégation](https://saltedge.com/products/spectre) ; [Salt Edge, Partner Program](https://www.saltedge.com/partner_program)
- [Powens, tarifs](https://www.powens.com/products/pricing/)
- [Règlement délégué (UE) 2022/2360](https://lawplayer.com/eu/act/32022R2360) ; [EBA, rapport final (180 jours)](https://www.eba.europa.eu/publications-and-media/press-releases/eba-publishes-final-report-amendment-its-technical-standards)
- [Parlement européen, accord PSR / PSD3](https://www.europarl.europa.eu/news/en/press-room/20251121IPR31540/payment-services-deal-more-protection-from-online-fraud-and-hidden-fees)
- Sources tierces (hypothèses seulement) : [Finexer, tarifs Tink](https://blog.finexer.com/tink-pricing/)

## 9. Mise à jour du 25 novembre 2026

Connecteur livré en sandbox et conditions d'un test sur vos propres comptes : voir `docs/ENABLE-BANKING.md`. Architecture d'une future bêta : `docs/ARCHITECTURE-BETA.md`.
