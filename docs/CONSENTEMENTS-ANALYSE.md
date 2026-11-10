# Consentements : séparation finance générale / données religieuses

Revue de fin de Sprint 1 (10 novembre 2026). **Ce document n'est pas un avis juridique** : il recense
les constats techniques, les ajustements recommandés et les questions à faire trancher par un juriste
spécialisé en protection des données.

## 1. Situation actuelle (Sprint 1)

- Trois documents : conditions générales (acceptation), information confidentialité (prise de connaissance),
  consentement explicite article 9 (données pouvant révéler une conviction religieuse).
- **Les trois sont exigés pour accéder à toute l'application**, y compris aux fonctions purement financières
  (comptes, revenus, dépenses, budgets).
- Le retrait du consentement article 9 suspend l'accès à toute l'application.
- Preuve conservée : version, empreinte SHA-256 du texte, date ; historique non modifiable.
- À la suppression du compte, les consentements sont effacés avec le profil.

## 2. Constats

| # | Constat | Risque |
| --- | --- | --- |
| C1 | Le consentement article 9 conditionne l'accès aux fonctions financières générales, qui n'exigent pas de traiter une conviction religieuse | Consentement non « libre » si l'exécution du service est subordonnée à un consentement non nécessaire à ce service (art. 7.4 RGPD) |
| C2 | Le simple fait d'utiliser une application présentée comme « finance islamique » peut, à lui seul, laisser déduire une conviction religieuse | La jurisprudence européenne retient que des données révélant *indirectement* une catégorie particulière en relèvent (CJUE, C‑184/20, 2022 — portée à confirmer). La base légale du compte lui-même serait alors en cause |
| C3 | Données qui révèlent directement une conviction : objectifs Hajj et Omra, Zakat, purification, contributions (Zakat, Sadaqah, waqf) | Doivent relever du consentement explicite ou d'une autre exception de l'article 9.2 |
| C4 | Texte libre (descriptions, catégories personnelles « Zakat al-Fitr », dons à une mosquée) | Peut révéler une conviction même dans les fonctions générales ; impossible à exclure techniquement |
| C5 | Foyers partagés : les données religieuses d'un membre sont visibles par les autres membres | Chaque membre doit être informé ; le consentement de l'un ne vaut pas pour l'autre |
| C6 | Les e-mails (confirmation, réinitialisation) portent le nom de l'application | Un tiers ayant accès à la boîte de réception peut en déduire l'usage |
| C7 | Les preuves de consentement disparaissent avec le compte | Tension entre effacement (art. 17) et obligation de pouvoir démontrer le consentement (art. 7.1) |
| C8 | Aucune vérification d'âge | Applicabilité de l'article 8 (âge du consentement numérique en Belgique) et opportunité de réserver le service aux majeurs |

## 3. Ajustements recommandés (à réaliser en lot 0 du Sprint 2, avant les fonctions Zakat et purification)

1. **Consentement par fonction** : les fonctions financières générales reposent sur l'exécution du contrat
   (art. 6.1.b). Le consentement article 9 n'est demandé qu'à l'activation des fonctions religieuses
   (Zakat, purification, objectifs Hajj et Omra, contributions religieuses), au moment où l'utilisateur les ouvre.
2. **Retrait ciblé** : retirer le consentement article 9 désactive uniquement ces fonctions, sans bloquer
   le reste de l'application. L'utilisateur choisit alors entre conserver ses données religieuses (inaccessibles)
   ou les supprimer immédiatement.
3. **Marquage des données** : chaque table ou valeur relevant de l'article 9 est identifiée dans le schéma
   (`goals.kind` Hajj/Omra, tables Zakat, purification, contributions), pour permettre l'export,
   l'effacement ciblé et le contrôle d'accès par fonction.
4. **Garde côté serveur** : toute lecture ou écriture d'une donnée religieuse vérifie le consentement en vigueur
   (fonction SQL utilisée par la RLS), pas seulement l'interface.
5. **Foyers partagés** : information explicite de chaque membre ; données religieuses visibles par les autres
   membres seulement si chacun a consenti (ou visibilité individuelle par défaut — à décider).
6. **E-mails neutres** : objet et expéditeur sans mention religieuse (décision de marque).
7. **Preuves de consentement** : conservation pseudonymisée après suppression du compte, si le juriste le juge
   nécessaire, avec durée limitée.
8. **Âge** : déclaration de majorité à l'inscription, si retenue.

Effet sur l'existant : la contrainte « trois consentements pour accéder à l'application » devient
« conditions + information pour l'application, consentement article 9 pour les fonctions religieuses ».
Les tests de parcours réel seront adaptés en conséquence.

## 4. Questions à faire valider par le juriste

1. L'usage même de l'application (compte existant) constitue-t-il une donnée de catégorie particulière (C2) ?
   Si oui, quelle base de l'article 9.2 pour le compte, et comment éviter de conditionner le service (C1) ?
2. Le découpage proposé (contrat pour la finance générale, consentement explicite pour les fonctions religieuses)
   est-il suffisant ?
3. Quel traitement pour le texte libre susceptible de révéler une conviction (C4) ?
4. Foyers partagés : faut-il un consentement de chaque membre avant tout partage de données religieuses (C5) ?
5. Durée et forme de conservation des preuves de consentement après suppression du compte (C7).
6. Âge minimal et vérification (C8).
7. Une analyse d'impact (AIPD, art. 35) est-elle obligatoire dès le lancement ? (recommandé dans tous les cas)
8. Contrats de sous-traitance : Supabase (région UE), futur fournisseur d'e-mails, futur fournisseur PSD2.
9. Formulation des avertissements « estimation, ni fatwa ni certification » au regard de la responsabilité.
