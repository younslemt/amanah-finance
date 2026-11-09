# Amanah Finance

Plateforme européenne de gestion financière, patrimoniale et éthique, conforme aux principes
de la finance islamique. L'utilisateur garde sa banque : Amanah est une couche d'analyse au-dessus.

> **Statut : Sprint 0.1 (socle consolidé).** Aucune banque connectée, aucun paiement.
> Deux modes explicites : `demo` (données fictives, sans connexion) et `live` (Supabase, données de l'utilisateur).
> Les calculs de Zakat et de purification sont des **estimations** fondées sur un référentiel
> en brouillon, à faire valider par un comité charia. Ils ne constituent ni une fatwa ni une certification.

## Structure

```
apps/web/            Next.js 15 (App Router), Tailwind 4, PWA, mode démo intégré
packages/engines/    Moteurs purs : argent, dates, budget, objectifs, Zakat, purification, CSV
packages/banking/    Interface BankingProvider, DemoProvider, pipeline d'import CSV
apps/web/src/config/brand.ts  Nom, couleurs, icônes : source unique de l'identité (nom provisoire)
tools/static-preview/ Aperçu statique des écrans sans Next.js (vérification hors ligne)
supabase/migrations/ Schéma PostgreSQL, RLS, audit, données de référence
supabase/tests/      Tests d'isolation RLS et d'intégrité (SQL)
scripts/             test-db.sh, check-boundaries.mjs
docs/adr/            Décisions d'architecture
```

## Démarrer (5 minutes, sans Supabase)

Prérequis : Node 22.18 ou plus, pnpm 10 (`corepack enable`).

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # NEXT_PUBLIC_APP_MODE=demo par défaut
pnpm dev                 # http://localhost:3000 → tableau de bord en mode démo
```

### Modes

| Mode | Données | Connexion | Supabase |
| --- | --- | --- | --- |
| `demo` | fictives, bandeau permanent | désactivée | jamais appelé |
| `live` | celles de l'utilisateur connecté, jamais fictives | lien magique obligatoire | URL, clé anon et `NEXT_PUBLIC_SITE_URL` obligatoires |

En production, l'application refuse de démarrer si `NEXT_PUBLIC_APP_MODE` est absent ou si le mode
`live` est incomplet : aucun basculement silencieux vers la démo.

## Tests

```bash
pnpm check:boundaries    # règles de dépendance entre couches
pnpm -r test             # Vitest : moteurs, banking, vue d'ensemble
pnpm typecheck
pnpm test:e2e            # Playwright, mobile et desktop (construit l'app en mode démo)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/amanah_test pnpm test:db
                         # migrations + tests RLS sur une base PostgreSQL JETABLE
```

Aperçu des écrans sans Next.js (rendu React réel, CSS Tailwind compilé) :
`node tools/static-preview/build.mjs dist-preview && node tools/static-preview/serve.mjs dist-preview`.

Sans aucune installation, les moteurs se testent aussi avec Node seul :
`cd packages/engines && node --test test/*.test.ts` (nécessite un shim `vitest`, voir docs/adr/0004).

## Brancher Supabase (projet UE)

1. Créer un projet Supabase en région **eu-central-1 (Francfort)**.
2. `supabase init` (si `supabase/config.toml` est absent), puis `supabase link --project-ref <ref>`.
3. `supabase db push` applique les migrations de `supabase/migrations/`.
4. Auth → URL de redirection : `https://<domaine>/auth/callback` ; activer le MFA TOTP.
5. Copier `apps/web/.env.example` en `apps/web/.env.local` et renseigner l'URL et la clé anon.
6. Ne jamais exposer la clé `service_role` au navigateur.

## Déployer sur Vercel

Projet Vercel pointé sur `apps/web`, région de fonctions `fra1`. Définir `NEXT_PUBLIC_APP_MODE`
(`demo` pour un environnement de présentation, `live` pour le réel) ; en `live`, ajouter les
variables Supabase et `NEXT_PUBLIC_SITE_URL`, et déclarer `<SITE_URL>/auth/callback` dans
Supabase > Authentication > URL Configuration. Un environnement démo et un environnement réel
sont deux déploiements distincts.

## Règles non négociables

- Montants en centimes entiers. Jamais de flottant pour l'argent.
- Les moteurs ne lisent ni l'horloge ni le réseau : la date de référence et les prix sont des paramètres.
- Toute table métier porte `household_id` et la RLS ; un test vérifie la couverture à 100 %.
- Aucun identifiant bancaire n'est collecté. Les jetons PSD2 iront dans Supabase Vault.
- Un calcul de Zakat enregistré est figé (entrées, référentiel, version du moteur, résultat).
- Une table qui référence une autre table du foyer le fait par clé composite `(household_id, id)`.
- Aucune conclusion religieuse sans données établies : Zakat et purification peuvent être « à déterminer ».
- Aucune fonctionnalité n'est déclarée terminée sans tests exécutés.
