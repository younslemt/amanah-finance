-- =============================================================================
-- Connexions bancaires : séparation stricte entre foyers, écriture réservée au droit d'écriture,
-- suppression en cascade des opérations importées. Données FICTIVES.
-- =============================================================================
\set ON_ERROR_STOP 1
create temp table _bc (check_name text, ok boolean, detail text);
grant all on _bc to authenticated, anon;
create or replace function pg_temp.bc(name text, got text, expected text) returns void language plpgsql as $$
begin insert into _bc values (name, got is not distinct from expected, coalesce(got, 'null') || ', attendu ' || expected); end $$;
grant execute on function pg_temp.bc(text, text, text) to authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'proprietaire.bc@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'lecteur.bc@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'autre-foyer.bc@example.test');
select set_config('t.h1', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000e1'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000e2';
insert into public.household_members (household_id, user_id, role) values (current_setting('t.h1')::uuid, '00000000-0000-0000-0000-0000000000e2', 'viewer');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select u.id, k.kind::public.consent_kind, true, 'test', repeat('a', 64)
from auth.users u cross join (values ('terms'), ('privacy')) k(kind)
where u.email like '%.bc@example.test';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
insert into public.bank_connections (household_id, provider, status, environment, aspsp_name, aspsp_country, state_hash)
values (current_setting('t.h1')::uuid, 'enable_banking', 'pending', 'sandbox', 'Mock ASPSP', 'BE', repeat('ab', 32));
select set_config('t.c1', (select id::text from public.bank_connections where household_id = current_setting('t.h1')::uuid), false);
select pg_temp.bc('demandeur enregistré automatiquement', (select requested_by::text from public.bank_connections where id = current_setting('t.c1')::uuid), '00000000-0000-0000-0000-0000000000e1');
update public.bank_connections set status = 'active', consent_ref = 'sess-fictive', state_hash = null where id = current_setting('t.c1')::uuid;
insert into public.accounts (household_id, connection_id, external_id, name, type) values (current_setting('t.h1')::uuid, current_setting('t.c1')::uuid, 'acc-1', 'Compte fictif relié', 'current');
do $$ begin
  insert into public.accounts (household_id, connection_id, external_id, name) values (current_setting('t.h1')::uuid, current_setting('t.c1')::uuid, 'acc-1', 'Doublon');
  perform pg_temp.bc('un compte distant n''est relié qu''une fois', 'inséré', 'refusé');
exception when unique_violation then perform pg_temp.bc('un compte distant n''est relié qu''une fois', 'refusé', 'refusé'); end $$;
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash)
select current_setting('t.h1')::uuid, id, date '2026-11-02', -4200, 'ACHAT FICTIF', 'enable_banking', 'h-fictif-1' from public.accounts where external_id = 'acc-1';

do $$ begin
  update public.bank_connections set state_hash = 'pas-une-empreinte' where id = current_setting('t.c1')::uuid;
  perform pg_temp.bc('empreinte anti-CSRF au bon format', 'acceptée', 'refusée');
exception when check_violation then perform pg_temp.bc('empreinte anti-CSRF au bon format', 'refusée', 'refusée'); end $$;

-- Lecteur du même foyer : voit, ne modifie pas
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.bc('lecteur : voit la connexion du foyer', (select count(*)::text from public.bank_connections), '1');
do $$ declare n int; begin
  update public.bank_connections set status = 'revoked'; get diagnostics n = row_count;
  perform pg_temp.bc('lecteur : ne peut pas révoquer', n::text, '0');
  delete from public.bank_connections; get diagnostics n = row_count;
  perform pg_temp.bc('lecteur : ne peut pas supprimer', n::text, '0');
end $$;
do $$ begin
  insert into public.bank_connections (household_id, provider) values (current_setting('t.h1')::uuid, 'enable_banking');
  perform pg_temp.bc('lecteur : ne peut pas créer de connexion', 'créée', 'refusée');
exception when insufficient_privilege then perform pg_temp.bc('lecteur : ne peut pas créer de connexion', 'refusée', 'refusée'); end $$;

-- Autre foyer : ne voit rien, ne modifie rien
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e3';
select pg_temp.bc('autre foyer : aucune connexion visible', (select count(*)::text from public.bank_connections), '0');
select pg_temp.bc('autre foyer : aucun compte relié visible', (select count(*)::text from public.accounts where connection_id is not null), '0');
do $$ declare n int; begin
  delete from public.bank_connections where id = current_setting('t.c1')::uuid; get diagnostics n = row_count;
  perform pg_temp.bc('autre foyer : suppression impossible', n::text, '0');
end $$;

-- Propriétaire : suppression des données de la banque (comptes, opérations, connexion)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
delete from public.accounts where connection_id = current_setting('t.c1')::uuid;
delete from public.bank_connections where id = current_setting('t.c1')::uuid;
select pg_temp.bc('suppression : opérations importées effacées', (select count(*)::text from public.transactions where dedupe_hash = 'h-fictif-1'), '0');
select pg_temp.bc('suppression : connexion effacée', (select count(*)::text from public.bank_connections), '0');
reset role;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _bc loop
    if r.ok then raise notice 'OK    %', r.check_name; else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) des connexions bancaires en échec', failures; end if;
end $$;
