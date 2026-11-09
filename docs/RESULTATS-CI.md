# Résultats de la CI réelle — 9 novembre 2026

Passage de référence : commit `7015266`, run GitHub Actions `42697097115`, installation figée (`--frozen-lockfile`).
Les trois jobs sont verts.

| Vérification | Résultat (preuve : journal du run) |
| --- | --- |
| Installation | `pnpm install --frozen-lockfile` sur `pnpm-lock.yaml` versionné |
| Règles de dépendance | Respectées |
| TypeScript strict | engines, banking, apps/web (fichiers TSX compris) : 0 erreur |
| ESLint (règles Next.js) | 0 erreur, 0 avertissement |
| Vitest | 81 / 81 (engines 50, banking 6, web 25) |
| Compilation Next.js 15.5.29 | Réussie, 16 pages générées |
| Démarrage (`next start`) | HTTP 200 sur `/dashboard`, en-tête CSP présent, bandeau démo affiché |
| Playwright (vrai Next.js, Pixel 7 et Desktop Chrome) | 27 réussis, 1 ignoré par conception (test clavier sur mobile) |
| Audit des dépendances de production | Aucune vulnérabilité connue |
| SQL sur PostgreSQL 16 | 48 / 48 |
| SQL sur image Supabase réelle (`supabase db start`, migrations 0001 à 0008 appliquées par la CLI) | 48 / 48 |

## Corrections apportées pendant la validation

| Problème constaté en CI | Correction |
| --- | --- |
| Playwright : port 3000 occupé (le serveur lancé par l'étape de démarrage restait actif) | Playwright réutilise le serveur démarré et vérifié |
| 3 avertissements ESLint (exports anonymes, directive inutile) | Corrigés |
| `postcss` vulnérable via Next.js (GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849, gravité élevée) | Version forcée ≥ 8.5.18 (résolue en 8.5.32) |
| Pas de verrou de dépendances | `pnpm-lock.yaml` généré en CI et versionné |

## Reste non vérifié
Mode `live` (connexion réelle, lecture Supabase) : objet du Sprint 1, avec un job e2e dédié.
