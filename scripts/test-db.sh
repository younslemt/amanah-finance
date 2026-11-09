#!/usr/bin/env bash
# Applique les migrations sur une base PostgreSQL vierge puis exécute les tests SQL.
# Usage : DATABASE_URL=postgres://... ./scripts/test-db.sh   (base jetable uniquement !)
set -euo pipefail
DB="${DATABASE_URL:?DATABASE_URL requis (base jetable)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# TEST_DB_TARGET=supabase : base Supabase réelle (supabase db start) où les migrations
# sont déjà appliquées ; ni stub ni réapplication.
if [ "${TEST_DB_TARGET:-postgres}" != "supabase" ]; then
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$ROOT/supabase/tests/_local_supabase_stub.sql"
  for f in "$ROOT"/supabase/migrations/*.sql; do
    echo "→ migration $(basename "$f")"
    psql "$DB" -v ON_ERROR_STOP=1 -q -f "$f"
  done
fi
# Chaque fichier de test s'exécute dans une transaction annulée : les tests sont indépendants.
for f in "$ROOT"/supabase/tests/*.test.sql; do
  echo "→ test $(basename "$f")"
  { echo 'begin;'; cat "$f"; echo 'rollback;'; } | psql "$DB" -v ON_ERROR_STOP=1 -q -o /dev/null
done
echo "Tous les tests SQL sont passés."
