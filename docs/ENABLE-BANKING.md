# Enable Banking — connecteur, sandbox et conditions d'un test sur vos propres comptes

> Mise à jour du 25 novembre 2026. Complète `docs/ETUDE-PSD2.md` (choix du fournisseur).
> GoCardless Bank Account Data n'accepte plus de nouveaux clients depuis juillet 2025 :
> Enable Banking reste le premier choix.

Rien dans ce document n'a été souscrit, signé ou payé. Aucune banque réelle n'a été connectée.

## 1. Ce qui est livré (PR « Connecteur Enable Banking en sandbox »)

| Étape | Implémentation | Vérification |
|---|---|---|
| 1. Configuration sécurisée | `lib/banking/config.ts` : variables serveur uniquement, clé privée jamais transmise au navigateur, HTTPS obligatoire en production, liste nominative obligatoire en production | tests unitaires ; contrôle de dépendances (aucun composant client n'importe le connecteur) |
| 2. Banques belges | `listInstitutions('BE')` : `GET /aspsps?country=BE&psu_type=personal&service=AIS` | tests avec serveur simulé |
| 3. Demande de consentement | `POST /auth` : lecture seule (`balances`, `transactions`), durée 1 à 180 jours (90 par défaut), **aucun accès aux paiements** | le test vérifie le corps de la requête |
| 4. Redirection | l'action serveur renvoie l'adresse de la banque ; le navigateur l'ouvre (CSP conservée) | parcours réel en CI |
| 5. Retour sécurisé | `/api/banque/retour` : jeton `state` à usage unique (cookie httpOnly limité à `/api/banque`, empreinte SHA-256 en base, comparaison à temps constant, 15 min) | état falsifié refusé, motif injecté ignoré |
| 6. Comptes | `POST /sessions` puis détails et soldes ; seuls les 4 derniers chiffres de l'IBAN sont stockés | aucun IBAN complet à l'écran ni dans les journaux |
| 7. Transactions | pagination `continuation_key`, opérations comptabilisées (BOOK) seulement, chevauchement de 7 jours | opérations en attente exclues |
| 8. Normalisation | montants en centimes exacts (chaîne décimale, pas de virgule flottante), sens CRDT/DBIT | tests unitaires |
| 9. Doublons | même pipeline que l'import CSV : `normalizeForImport` + fonction SQL `import_transactions` (unicité `account_id, dedupe_hash`) | 2e synchronisation : 0 nouvelle opération |
| 10. Moteurs existants | budget, catégories, objectifs lisent les mêmes tables : aucun moteur modifié | budget du parcours réel |
| 11. Révocation | `DELETE /sessions/{id}` puis statut `revoked` ; données conservées tant que la personne ne les supprime pas | appel DELETE vérifié sur le serveur simulé |
| 12. Erreurs et expiration | `EXPIRED/REVOKED/CLOSED_SESSION` → statut `expired` et nouvelle connexion proposée ; limites et pannes → message « réessayez » ; messages choisis par code, jamais reflétés | expiration simulée en CI |

Suppression complète d'une banque (comptes et opérations, après saisie de `SUPPRIMER`) : `deleteConnectionData`.

**Ce qui est prouvé, et ce qui ne l'est pas.** Le connecteur est vérifié de bout en bout contre un
**serveur Enable Banking simulé** (`apps/web/e2e-live/fake-enable-banking.mjs`) qui vérifie la
signature RS256 de chaque appel. Il n'a **pas encore été exécuté contre la vraie sandbox Enable
Banking** : cela demande un compte et une application sandbox (gratuits) que je ne peux pas créer
à votre place. La procédure est ci-dessous ; c'est le seul pas restant pour la sandbox réelle.

## 2. Faits techniques retenus (documentation Enable Banking)

- API : `https://api.enablebanking.com`. Chaque appel porte un JWT RS256 signé par la clé privée de
  l'application (`kid` = identifiant de l'application, `iss` = `enablebanking.com`,
  `aud` = `api.enablebanking.com`, durée ≤ 24 h ; nous utilisons 1 h).
- Parcours : `GET /aspsps` → `POST /auth` (adresse de la banque + `authorization_id`) → retour sur
  `redirect_url` avec `code` et `state` → `POST /sessions` → comptes → `GET /accounts/{uid}/balances`
  et `/transactions`.
- Sandbox : banque fictive « Mock ASPSP » disponible pour tous les pays, sans identifiant ; ses
  comptes et opérations se saisissent dans le panneau de contrôle. Les applications sandbox sont
  activées automatiquement.
- Production restreinte : gratuite, sans contrat, limitée aux comptes que vous **liez vous-même**
  dans le panneau de contrôle, pour évaluation ou usage personnel d'un particulier.
- Production complète (autres utilisateurs) : contrat et vérification de l'entreprise (KYB).
- Une application de production exige une adresse HTTPS, une URL de politique de confidentialité et
  une adresse e-mail de contact pour la protection des données.

## 3. Lancer la vraie sandbox (environ 20 minutes, gratuit)

1. Créez un compte sur `enablebanking.com` (panneau de contrôle). **Aucun moyen de paiement n'est
   demandé pour la sandbox ; si un écran en demande un, arrêtez-vous.**
2. Sur votre ordinateur, générez une paire de clés (jamais dans le dépôt) :
   ```bash
   openssl genrsa -out eb-sandbox.pem 2048
   openssl req -new -x509 -key eb-sandbox.pem -out eb-sandbox.crt -days 365 -subj "/CN=amanah-sandbox"
   ```
3. Panneau de contrôle → *Applications* → *Register* : environnement **Sandbox**, nom
   « Amanah Finance (sandbox) », certificat `eb-sandbox.crt`, adresse de retour
   `http://localhost:3000/api/banque/retour`. Notez l'identifiant de l'application.
4. Dans la sandbox, ouvrez « Mock ASPSP » et saisissez des comptes et opérations **fictifs**.
5. Lancez l'application en mode réel avec Supabase local (`docs/DEPLOIEMENT.md`) et ajoutez dans
   `apps/web/.env.local` (fichier ignoré par Git) :
   ```
   ENABLE_BANKING_ENV=sandbox
   ENABLE_BANKING_APP_ID=<identifiant>
   ENABLE_BANKING_PRIVATE_KEY_B64=<base64 -w0 eb-sandbox.pem>
   ENABLE_BANKING_REDIRECT_URL=http://localhost:3000/api/banque/retour
   ```
6. Comptes → *Connexion bancaire* → « Mock ASPSP » → cochez l'accord → « Continuer vers ma banque ».
   Autorisez, revenez, vérifiez comptes, soldes, budget ; relancez la synchronisation (0 nouvelle
   opération attendue) ; révoquez ; supprimez.

Le mode démonstration refuse toute connexion bancaire, et la version hébergée refuse de se
construire si une variable `ENABLE_BANKING_*` ou Supabase est présente.

## 4. Conditions avant un test sur VOS comptes (production restreinte)

À ne lancer qu'avec votre accord explicite, sur un déploiement **séparé et privé**, jamais sur
l'adresse de la démonstration.

| # | Condition | État |
|---|---|---|
| 1 | Conditions d'utilisation Enable Banking lues et acceptées par vous (usage personnel des comptes liés) | à faire par vous |
| 2 | Rôle réglementaire : Enable Banking est le prestataire agréé d'information sur les comptes ; pour un usage strictement personnel, Amanah Finance n'exerce pas d'activité réglementée. Toute ouverture à d'autres personnes exige contrat + avis juridique | à confirmer avec Enable Banking |
| 3 | Authentification de l'application : compte Supabase personnel, e-mail confirmé | en place |
| 4 | RLS : `bank_connections` et `accounts` limités au foyer, écriture réservée aux membres autorisés ; test SQL dédié | en place (inchangée) |
| 5 | Secrets : clé privée et identifiant uniquement dans les variables serveur de l'hébergeur ; jamais dans GitHub ni dans le navigateur | en place (contrôles CI) |
| 6 | Liste nominative `ENABLE_BANKING_ALLOWED_EMAILS` = votre seule adresse (obligatoire en production) | en place |
| 7 | Révocation depuis l'application et depuis le panneau Enable Banking | en place |
| 8 | Suppression des comptes et opérations d'une banque ; suppression du compte | en place |
| 9 | Journaux : codes d'erreur seulement, aucun IBAN, libellé, montant, jeton ni clé (contrôle CI) | en place |
| 10 | Chiffrement : HTTPS de bout en bout ; base Supabase chiffrée au repos ; aucun identifiant bancaire ne transite par Amanah (authentification forte chez la banque) | à vérifier sur le déploiement privé |
| 11 | Test complet réussi avec des données fictives (serveur simulé puis Mock ASPSP) | serveur simulé : CI ; Mock ASPSP : à faire |
| 12 | Déploiement privé distinct (projet Supabase et site séparés, accès restreint), politique de confidentialité et e-mail de contact publiés | à préparer |

Variables de production restreinte : `ENABLE_BANKING_ENV=production`, adresse de retour en HTTPS
sur le déploiement privé, `ENABLE_BANKING_ALLOWED_EMAILS=<votre e-mail>`.

## 5. Coûts (aucun engagement pris)

| Poste | Coût | Remarque |
|---|---|---|
| Sandbox Enable Banking | 0 € | aucun moyen de paiement |
| Production restreinte (vos comptes liés) | 0 € | évaluation / usage personnel |
| Production pour d'autres utilisateurs | sur devis | contrat, KYB, minimum mensuel possible non publié |
| Hébergement de la démonstration (Netlify Free) | 0 € | voir `docs/HEBERGEMENT-DEMO.md` |
| Déploiement privé réel (Supabase Free + hébergeur gratuit) | 0 € tant que les quotas gratuits suffisent | à valider avant création |
