# Sprint 0 — état et vérifications

> Ce document décrit l'état du Sprint 0. Voir `SPRINT-0.1.md` pour la consolidation et les corrections.

## Exécuté et vérifié lors de la préparation (9 novembre 2026)

| Vérification | Résultat |
| --- | --- |
| Migrations 0001 à 0005 sur PostgreSQL 16 vierge | appliquées sans erreur |
| `supabase/tests/rls_isolation.test.sql` | 12 assertions passées |
| `packages/engines` : tests | 31 passés sur 31 |
| `packages/banking` : tests | 6 passés sur 6 |
| `apps/web/src/lib/snapshot.test.ts` | 5 passés sur 5 |
| TypeScript strict : engines, banking, logique de l'app | 0 erreur |
| `check-boundaries.mjs` | règles respectées ; violation volontaire bien détectée |

Ces tests ont tourné avec `node --test` et un shim de l'API Vitest, faute d'accès au registre npm.

## À exécuter chez toi (non vérifié ici)

- [ ] `pnpm install` puis `pnpm -r test` avec le vrai Vitest
- [ ] `pnpm --filter @amanah/web typecheck` et `pnpm build` (React, Next et Tailwind non installés ici)
- [ ] `pnpm test:e2e` (Playwright, mobile et desktop)
- [ ] `supabase db push` sur un projet UE, puis inscription réelle et vérification du foyer créé
- [ ] Premier déploiement Vercel en mode démo
