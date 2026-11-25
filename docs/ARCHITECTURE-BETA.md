# Proposition d'architecture — bêta privée (préparatoire, non engagée)

> Document de réflexion. Rien n'est construit ni souscrit. Chaque étape demandera votre accord.

## 1. Trois environnements strictement séparés

| | Démonstration | Bêta privée | Production (plus tard) |
|---|---|---|---|
| Données | fictives, cookie du navigateur | réelles, saisies ou importées par les testeurs | réelles |
| Base | aucune | projet Supabase **dédié** à la bêta | projet Supabase dédié |
| Banque | interdite (refus à la construction) | sandbox puis, sur contrat, production | production sous contrat |
| Accès | mot de passe partagé | invitation nominative + compte individuel | inscription |
| Adresse | site de démonstration | site distinct | site distinct |

Aucune variable, clé ou base n'est partagée entre deux environnements. La construction hébergée de
la démonstration échoue déjà si une variable Supabase ou Enable Banking est présente.

## 2. Inscription sur invitation

- Table `beta_invitations` (e-mail haché, date d'expiration, utilisée oui/non, invitant).
- Inscription Supabase fermée au public ; un lien d'invitation à usage unique ouvre la création du
  compte. Confirmation par e-mail obligatoire.
- Révocation d'une invitation ou d'un testeur depuis une page d'administration réservée au rôle
  `admin` (vérifié côté serveur et par RLS).

## 3. Comptes individuels et données sur plusieurs appareils

- Chaque testeur a son foyer ; la RLS actuelle (foyer, rôles, lecture seule) s'applique telle quelle.
- Les données vivent dans Supabase : elles suivent la personne sur tous ses appareils, contrairement
  à la démonstration (cookie par navigateur).
- Les consentements existants (traitement, finance islamique, partage de foyer) sont recueillis à
  l'arrivée, comme aujourd'hui en mode réel.

## 4. Accès bancaire autorisé

- Connecteur Enable Banking existant, environnement `production` seulement après contrat et avis
  juridique (rôle d'Amanah Finance vis-à-vis des testeurs).
- Liste nominative `ENABLE_BANKING_ALLOWED_EMAILS` maintenue pendant la bêta.
- Consentement bancaire distinct, daté, révocable ; rappel avant expiration (90 jours par défaut).

## 5. Suppression et droits des personnes

- Suppression d'une banque (déjà livrée), suppression du compte et de toutes les données du foyer
  (à ajouter : fonction SQL unique, journalisée sans contenu).
- Export des données (CSV) avant suppression.
- Conservation : aucune donnée bancaire au-delà de la suppression ; journaux techniques sans donnée
  personnelle, conservés 30 jours.

## 6. Retours des testeurs

- La page « Donner mon avis » de la démonstration devient un formulaire stocké dans une table
  `feedback` (texte libre limité, aucune donnée bancaire, champ facultatif de contact).

## 7. Ordre proposé

1. Valider la démonstration hébergée avec quelques proches.
2. Sandbox Enable Banking réelle (Mock ASPSP) sur votre poste.
3. Déploiement privé réel pour vous seul (production restreinte, vos comptes liés).
4. Avis juridique et échange avec Enable Banking sur le rôle et le contrat.
5. Bêta sur invitation (étapes 2 à 6 ci-dessus).
