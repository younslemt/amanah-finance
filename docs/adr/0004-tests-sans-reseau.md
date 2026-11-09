# ADR 0004 — Tests exécutables sans installation

**Statut** : accepté

**Contexte** : le socle du Sprint 0 a été produit dans un environnement sans accès au registre npm.

**Décision** : les tests utilisent l'API Vitest (`describe`, `it`, `expect`) et les sources TypeScript
n'utilisent que de la syntaxe effaçable (`erasableSyntaxOnly`). Ils tournent donc avec Vitest en CI,
et avec `node --test` (suppression native des types, Node 22.18+) via un shim minimal de `vitest`.

**Conséquences** : pas d'`enum` TypeScript ni de propriétés de paramètres ; imports relatifs avec
extension `.ts` dans les paquets.
