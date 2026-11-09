# ADR 0003 — Isolation des données par foyer (household)

**Statut** : accepté

**Décision** : toutes les données métier appartiennent à un foyer. L'accès passe par
`is_household_member()` et `can_write_household()` (security definer). Un foyer est créé à
l'inscription. Le partage (conjoint, conseiller en lecture seule) viendra sans changer le schéma.

**Conséquences** : la Zakat, les charges familiales et la succession se calculent au bon niveau.
Le test `rls_isolation.test.sql` vérifie l'isolation et que 100 % des tables ont la RLS.
