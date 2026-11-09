# Sprint 0.2 — validation technique : résultats et blocages (9 novembre 2026)

## 1. Blocage principal

L'installation des dépendances est impossible depuis les environnements dont je dispose :

| Environnement | Registre npm | Constat |
| --- | --- | --- |
| Conteneur de travail (cloud) | Inaccessible | Résolution DNS de `registry.npmjs.org` impossible |
| Machine virtuelle sur ton ordinateur (via l'app de bureau) | Refusé | Le proxy répond `403 Forbidden` pour `registry.npmjs.org` |

Cause : les réglages réseau du compte n'autorisent pas les installations de paquets. Ils se modifient
dans les paramètres du compte (accès réseau) ; une nouvelle conversation prendra le changement en compte.

Conséquence : les vérifications qui exigent les paquets (Next.js, vrai Vitest, types React, ESLint)
**n'ont pas été exécutées**. Elles sont entièrement automatisées dans GitHub Actions
(`.github/workflows/ci.yml`), qui dispose du registre npm.

## 2. État de chaque vérification demandée

| Vérification | Exécutée ? | Où | Résultat |
| --- | --- | --- | --- |
| Installation des dépendances | **Non** | — | Bloquée (§1) ; job CI prêt |
| TypeScript complet, TSX compris | **Non** pour les TSX | — | Job CI prêt. Exécuté ici : engines, banking, logique web (0 erreur) |
| Compilation Next.js | **Non** | — | Job CI prêt (`next build`, journal publié) |
| Vrai Vitest | **Non** | — | Job CI prêt (rapports JUnit). Exécuté ici avec `node --test` : 81/81 |
| Playwright | **Partiel** | Conteneur | Vrai Playwright 1.63 + Chrome, contre l'aperçu statique : 27 réussis, 1 ignoré. Contre Next.js : job CI prêt |
| Démarrage de l'application | **Non** | — | Job CI prêt (`next start`, HTTP 200, en-têtes, bandeau démo) |
| Migrations et RLS | **Oui** | Conteneur | PostgreSQL 16 : 48/48. Contre l'image Supabase réelle : job CI prêt |

Aucune de ces lignes « Non » ne doit être lue comme un succès. Le premier passage de la CI
donnera les vrais résultats.

## 3. Corrections préventives faites à la relecture

Défauts qui auraient fait échouer la première exécution réelle :

| Défaut | Effet attendu | Correction |
| --- | --- | --- |
| Pas de configuration ESLint | `next lint` interactif ou en échec en CI | `eslint.config.mjs` (règles Next.js), script `eslint .` |
| `next-env.d.ts` ignoré par git | `tsc` échoue sur l'import CSS avant toute compilation | Fichier versionné |
| `@types/node` absent des paquets engines et banking | Erreurs de résolution de types via Vitest | Ajouté en dépendance de développement |
| Pas de `pnpm-lock.yaml` | `pnpm install --frozen-lockfile` échoue | CI : installation sans verrou au premier passage et verrou publié en artefact |
| Cache `setup-node` lié au verrou | Échec du job sans verrou | Cache du store pnpm indépendant |
| Playwright recompilait l'application en CI | Double compilation | Réutilise la compilation du job |
| Rétrécissement de type fragile dans `screens.spec.ts` | Erreur TypeScript possible | Variable explicite |
| Scripts d'installation bloqués par pnpm 10 | Binaires natifs non préparés | `onlyBuiltDependencies` déclarés |
| Pas de configuration de la CLI Supabase | `supabase start` impossible | `supabase/config.toml` (local uniquement) |

## 4. Points à confirmer au premier passage de la CI

- Le job `supabase` (image réelle) : la CLI et la version 17 de Postgres sont supposées ; s'il échoue,
  le job PostgreSQL 16 reste la référence et l'écart sera corrigé au Sprint 1.
- `pnpm audit` peut signaler des vulnérabilités des versions résolues ; à traiter au cas par cas.
- Next.js 15.5 : avertissements de dépréciation possibles (`middleware`), sans effet bloquant attendu.

## 5. Pour obtenir les vrais résultats

1. Créer le dépôt privé et pousser (voir `DEPLOIEMENT.md` §3). Si tu me donnes accès au dépôt,
   je pousse moi-même et je corrige à partir des journaux de la CI.
2. Ou autoriser les installations de paquets dans les réglages réseau du compte : je refais alors
   toute la validation ici, dans une nouvelle conversation.
