# ADR 0001 — Monorepo pnpm et moteurs en TypeScript pur

**Statut** : accepté (Sprint 0)

**Contexte** : les calculs financiers et religieux doivent être auditables, testables seuls et
réutilisables dans une future application native.

**Décision** : un dépôt unique (pnpm workspaces). `packages/engines` ne dépend de rien, ne lit ni
l'horloge ni le réseau. `packages/banking` dépend seulement de `engines`. `apps/web` orchestre.
Le script `check-boundaries.mjs` fait échouer la CI en cas de violation.

**Conséquences** : un comité charia peut relire un seul dossier ; une app React Native importera
les mêmes moteurs ; légère complexité de configuration (transpilePackages).
