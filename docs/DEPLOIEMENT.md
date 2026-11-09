# Guide de mise en place — GitHub, Supabase, environnements

Aucune étape de ce guide ne crée de déploiement public ni n'exige d'abonnement payant.

## 1. Environnements

| Environnement | `NEXT_PUBLIC_APP_MODE` | Données | Base | Usage |
| --- | --- | --- | --- | --- |
| Local démo | `demo` | Fictives | Aucune | Développement des écrans |
| Local réel | `live` | Utilisateurs de test fictifs | Supabase local (`supabase start`) | Sprint 1 : comptes, saisie, persistance |
| CI GitHub | `demo` | Fictives | PostgreSQL 16 et image Supabase jetables | Tests automatiques |
| Production | `live` | Réelles | Projet Supabase UE dédié | Plus tard, après validation |

Règles : un environnement démo et un environnement réel ne partagent jamais de base ni de clé.
En production, l'application refuse de démarrer si le mode est absent ou incomplet.

## 2. Variables d'environnement (`apps/web/.env.local`)

| Variable | Démo | Réel | Côté | Rôle |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_MODE` | `demo` | `live` | public | Choix explicite du mode |
| `NEXT_PUBLIC_SUPABASE_URL` | vide | obligatoire | public | URL du projet (https ; http seulement en local) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | vide | obligatoire | public | Clé publique ; la RLS protège les données |
| `NEXT_PUBLIC_SITE_URL` | facultatif | obligatoire en production | public | Base des liens de connexion |
| `SUPABASE_SERVICE_ROLE_KEY` | — | non utilisée au Sprint 1 | serveur | Ne jamais préfixer `NEXT_PUBLIC_`, jamais dans le navigateur |

Valeurs locales (affichées par `supabase status`) : URL `http://127.0.0.1:54321`, clé anon locale,
`NEXT_PUBLIC_SITE_URL=http://localhost:3000`.

## 3. GitHub (gratuit)

1. Créer un dépôt **privé** `amanah-finance` (GitHub Free inclut des minutes d'Actions pour les dépôts privés).
2. Pousser le contenu de l'archive sur `main` :
   ```bash
   git init && git add . && git commit -m "Socle Sprint 0.2"
   git branch -M main
   git remote add origin https://github.com/<compte>/amanah-finance.git
   git push -u origin main
   ```
3. Le workflow `CI` démarre seul. Trois jobs : application, base PostgreSQL 16, base Supabase réelle.
4. **Premier passage** : `pnpm-lock.yaml` n'existe pas encore. Le job l'installe sans verrou et le
   publie en artefact `pnpm-lock`. Le télécharger, le placer à la racine, le committer : les passages
   suivants seront reproductibles (`--frozen-lockfile`).
5. Résultats : onglet *Actions* → le passage → artefacts `rapports-app` (build.log, rapports JUnit,
   rapport Playwright), `rapports-sql`, `rapports-supabase`.
6. Recommandé : *Settings → Branches* → protéger `main` en exigeant les trois jobs verts.

Aucun secret n'est nécessaire à la CI : l'application y est construite en mode démo.

## 4. Supabase

### 4.1 Local (Sprint 1)

Prérequis : Docker Desktop et la CLI Supabase (gratuits).

```bash
supabase start                 # Postgres, Auth, API, boîte mail de test ; applique migrations + seed
supabase status                # URL et clé anon locales
pnpm --filter @amanah/web dev  # avec NEXT_PUBLIC_APP_MODE=live dans .env.local
```

Les liens de connexion locaux arrivent dans la boîte de test de Supabase (URL affichée par `supabase status`).
`supabase db reset` réapplique toutes les migrations et `seed.sql` (prix fictifs uniquement).

### 4.2 Projet hébergé (quand tu le décides)

1. Créer un projet sur supabase.com, offre gratuite, **région Central EU (Frankfurt)**.
   Un projet distinct par environnement (pré-production, production). Pas de projet pour la démo.
2. `supabase link --project-ref <ref>` puis `supabase db push` (migrations 0001 à 0008).
   Ne jamais lancer `seed.sql` en production.
3. *Authentication → URL Configuration* :
   - Site URL : l'URL de l'application.
   - Redirect URLs : `<SITE_URL>/auth/callback` uniquement (pas de joker).
4. *Authentication → Providers → Email* : connexion par lien magique activée ; mots de passe facultatifs.
5. *Authentication → Multi-Factor* : TOTP activé.
6. *Authentication → Rate Limits* : garder les limites par défaut ou plus strictes.
7. *Project Settings → API* : récupérer l'URL et la clé anon ; ne jamais copier la clé service_role
   dans le code ni dans Vercel au Sprint 1.
8. Vérifier dans *Table Editor* que chaque table affiche « RLS enabled ».

## 5. Hébergement de l'application

Pas de déploiement à ce stade. Quand il sera décidé : un projet par environnement, région `fra1`,
variables du §2 ; l'offre gratuite de Vercel est réservée à un usage non commercial.
