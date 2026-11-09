# ADR 0005 — Clés étrangères composites pour l'intégrité inter-foyers

**Statut** : accepté (Sprint 0.1)

**Contexte** : la RLS contrôle la ligne écrite (son `household_id`), pas la ligne référencée.
Avec des clés étrangères simples, un utilisateur pouvait rattacher une transaction de son foyer
au compte d'un autre foyer, une allocation à l'objectif d'un autre, etc. Démontré par
`supabase/tests/security_cross_household.test.sql` sur le schéma du Sprint 0 (15 contrôles en échec).

**Décision** : chaque table référencée porte `unique (household_id, id)` ; chaque référence entre
tables du foyer est une clé composite `(household_id, x_id)`. `ON DELETE SET NULL (colonne)`
(PostgreSQL 15+) ne vide que la référence.

**Conséquences** : la base garantit l'intégrité quel que soit le code applicatif. Toute nouvelle
table du foyer doit suivre ce modèle ; le test de sécurité doit être étendu en même temps.
