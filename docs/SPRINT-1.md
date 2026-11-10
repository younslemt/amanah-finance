# Sprint 1 — comptes réels, données persistantes, objectif Hajj

Branche `sprint-1`. Run CI de référence : `42772831922`, quatre jobs verts.

## Fonctionnalités réalisées

| Domaine | Fonctionnalité | Où |
| --- | --- | --- |
| Authentification | Inscription e-mail + mot de passe (10 caractères minimum, lettres et chiffres) | `/inscription` |
| | Confirmation obligatoire de l'adresse e-mail avant la première connexion | lien reçu → `/auth/callback` |
| | Connexion, déconnexion (POST) | `/connexion`, `/auth/signout` |
| | Mot de passe oublié et réinitialisation | `/mot-de-passe-oublie`, `/reinitialiser` |
| | Sessions en cookies HttpOnly, vérifiées côté serveur (`getUser`) | middleware, `lib/supabase/session.ts` |
| | Routes privées : middleware + garde serveur dans la mise en page | `(app)/layout.tsx` |
| | Messages sans énumération des comptes (inscription, oubli) | `(auth)/actions.ts` |
| Consentements | Trois documents distincts : conditions (acceptation), information confidentialité (prise de connaissance), consentement explicite art. 9 RGPD | `/bienvenue/consentements` |
| | Textes provisoires marqués « validation juridique requise », versionnés | `lib/legal/documents.ts` |
| | Preuve : version + empreinte SHA-256 du texte exact + date, historique non modifiable | table `consents` |
| | Retrait (nouvelle ligne « refusé ») ; accès suspendu jusqu'à un nouveau consentement | `/parametres` |
| Profil | Prénom ou pseudonyme, nom et région du foyer ; aucune donnée d'identité superflue | `/bienvenue/profil`, `/parametres` |
| Données personnelles | Suppression définitive du compte et de toutes les données (confirmation « SUPPRIMER ») | `/parametres`, fonction `delete_my_account()` |
| Finances | Comptes manuels avec solde de départ | `/comptes` |
| | Revenus et dépenses (montant, date, compte, catégorie, description), suppression | `/budget` |
| | Catégories personnelles du foyer | `/budget` |
| | Budgets mensuels par catégorie | `/budget` |
| | Dashboard alimenté par les données enregistrées (mois en cours, soldes, objectifs) | `/dashboard` |
| Objectif Hajj | Montant cible, épargne disponible, date souhaitée, capacité mensuelle, progression, effort mensuel requis, date d'atteinte estimée, statut | `/goals` |
| | Affectation et retrait de montants (enveloppe virtuelle, aucun fonds déplacé) | `/goals` |

Démonstration et réel restent séparés : en mode démo, aucune session, aucun appel Supabase, aucun
formulaire de saisie, et les écrans de compte redirigent vers l'accueil de démonstration.

## Sécurité côté serveur

- Le foyer est toujours déduit de la session, jamais d'un champ du formulaire.
- Toutes les entrées sont validées côté serveur (Zod) avant écriture ; montants convertis en centimes sans flottant.
- La RLS, les clés étrangères composites et les contraintes refusent toute référence aux données d'un autre foyer,
  y compris une catégorie personnelle d'un autre foyer.
- Consentements : ni modification ni suppression possible par le client ; un consentement accordé exige l'empreinte du texte.
- La clé `service_role` n'est utilisée nulle part dans l'application.

## Résultats des tests (CI réelle, run 42772831922)

| Suite | Résultat |
| --- | --- |
| TypeScript strict (TSX compris), ESLint, règles de dépendance | Aucune erreur |
| Vitest | 108 / 108 (moteurs 56, banking 6, application 46) |
| Compilation Next.js 15.5.29 (démo et réel) | Réussie, 23 pages |
| Playwright démo (mobile et ordinateur) | 27 réussis, 1 ignoré par conception |
| SQL PostgreSQL 16 | 74 / 74 |
| SQL image Supabase réelle | 74 / 74 |
| **Parcours réel** (Supabase local, Auth, e-mails de test, mobile et ordinateur) | **20 / 20** |
| Audit des dépendances | Aucune vulnérabilité connue |

Le parcours réel couvre, sur chaque appareil, avec des utilisateurs et montants fictifs :
inscription et refus des mots de passe différents ; connexion refusée avant confirmation ; confirmation
par le lien reçu ; consentements obligatoires (envoi sans case cochée refusé ; pages privées inaccessibles
avant la fin du parcours) ; profil ; compte ; revenu, dépense et refus d'un montant illisible ; budget ;
objectif Hajj (progression 17 % vérifiée) ; dashboard (solde 3 457,50 € vérifié) ; déconnexion, accès refusé,
reconnexion et données retrouvées ; isolation : B ne voit rien de A dans l'interface ni par l'API REST
(lecture de 7 tables, insertion dans le foyer de A refusée, modification de l'objectif de A sans effet) ;
mot de passe oublié jusqu'à la nouvelle connexion ; retrait puis nouveau consentement ; suppression du
compte de B puis connexion impossible.

## Défauts trouvés et corrigés pendant le sprint

| Défaut | Correction |
| --- | --- |
| La CI pouvait afficher une compilation en échec comme réussie (`build | tee` sans `pipefail`) | `pipefail` sur toutes les étapes |
| En démo, Next.js pré-générait les pages d'accueil qui appelaient Supabase | Les fonctions de session redirigent en démo, sans appel |
| Identifiants de champs dupliqués entre deux formulaires d'une même page (étiquette associée au mauvais champ) | Étiquettes par imbrication, plus aucun identifiant |
| Historique des consentements modifiable sans erreur explicite | Droits de modification et de suppression retirés |
| Configuration Supabase locale obsolète (`[inbucket]`) | `[local_smtp]` |

## Limites et points ouverts

- **Textes juridiques** : provisoires, à faire valider avant toute ouverture à de vrais utilisateurs.
- **Envoi d'e-mails en production** : le service d'e-mail intégré de Supabase est limité et réservé aux tests.
  Un fournisseur SMTP est nécessaire avant d'ouvrir les inscriptions (décision à prendre ; plusieurs offres gratuites existent).
- **MFA (TOTP)** : activé dans la configuration Supabase, pas encore proposé dans l'interface.
- **CSP** : `script-src 'unsafe-inline'` toujours présent ; nonce prévu.
- **Partage du foyer** (conjoint) : prévu par le schéma, pas d'écran.
- Pas de déploiement public : aucun environnement hébergé n'a été créé.
