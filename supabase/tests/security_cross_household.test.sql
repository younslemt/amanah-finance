-- =============================================================================
-- Tests de sécurité : tentatives d'association inter-foyers et contournements.
-- Utilisateurs fictifs : Chadia (C) et Driss (D). Aucune donnée personnelle réelle.
-- Chaque contrôle est exécuté ; les échecs sont comptés puis le script échoue
-- à la fin s'il y en a au moins un (rapport complet en une exécution).
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _results (check_name text, ok boolean, detail text);
grant all on _results to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000c', 'chadia@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'driss@example.test');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
  select id, 'special_category', true, 'test', repeat('a', 64) from auth.users where id in ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d');  -- article 9 (lot 0, Sprint 2)

-- Données de Driss, créées en superutilisateur
select set_config('t.hc', (select id::text from public.households where created_by = '00000000-0000-0000-0000-00000000000c'), false);
select set_config('t.hd', (select id::text from public.households where created_by = '00000000-0000-0000-0000-00000000000d'), false);

with acc as (
  insert into public.accounts (household_id, name) values (current_setting('t.hd')::uuid, 'Compte D') returning id
) select set_config('t.acc_d', (select id::text from acc), false);
with g as (
  insert into public.goals (household_id, kind, name, target_cents, target_date, owner_id)
  values (current_setting('t.hd')::uuid, 'hajj', 'Objectif D', 100000, date '2028-01-01', '00000000-0000-0000-0000-00000000000d') returning id
) select set_config('t.goal_d', (select id::text from g), false);
with tx as (
  insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash)
  values (current_setting('t.hd')::uuid, current_setting('t.acc_d')::uuid, date '2026-10-31', 1000, 'INTERET', 'demo', 'd-1') returning id
) select set_config('t.tx_d', (select id::text from tx), false);
with zc as (
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result,
    zakatable_cents, nisab_cents, zakat_due_cents, is_above_nisab, status, owner_id)
  values (current_setting('t.hd')::uuid, 'amanah-zakat', '1.0.0', 'test', date '2026-11-01', '{}', '{}', 1, 1, 0, false, 'below_nisab', '00000000-0000-0000-0000-00000000000d') returning id
) select set_config('t.zc_d', (select id::text from zc), false);
with c as (
  insert into public.contributions (household_id, kind, amount_cents, paid_on, owner_id)
  values (current_setting('t.hd')::uuid, 'sadaqah', 500, date '2026-11-01', '00000000-0000-0000-0000-00000000000d') returning id
) select set_config('t.contrib_d', (select id::text from c), false);
with bc as (
  insert into public.bank_connections (household_id, provider) values (current_setting('t.hd')::uuid, 'demo') returning id
) select set_config('t.conn_d', (select id::text from bc), false);
with ib as (
  insert into public.import_batches (household_id, account_id, source) values (current_setting('t.hd')::uuid, current_setting('t.acc_d')::uuid, 'csv') returning id
) select set_config('t.batch_d', (select id::text from ib), false);

-- Un compte et une transaction de Chadia, pour les tentatives de mise à jour
with acc as (
  insert into public.accounts (household_id, name) values (current_setting('t.hc')::uuid, 'Compte C') returning id
) select set_config('t.acc_c', (select id::text from acc), false);
with tx as (
  insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash)
  values (current_setting('t.hc')::uuid, current_setting('t.acc_c')::uuid, date '2026-10-01', -500, 'CAFE', 'demo', 'c-1') returning id
) select set_config('t.tx_c', (select id::text from tx), false);

-- Fonction utilitaire : exécute une instruction qui DOIT échouer
create or replace function pg_temp.must_fail(name text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _results values (name, false, 'instruction acceptée');
  exception when others then
    -- Une erreur de syntaxe ou de colonne inconnue est une erreur du test, pas une protection
    if sqlstate in ('42601', '42703', '42P01', '42883') then
      insert into _results values (name, false, 'erreur de test : ' || sqlerrm);
    else
      insert into _results values (name, true, sqlstate || ' ' || sqlerrm);
    end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- En tant que Chadia
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';

select pg_temp.must_fail('transaction rattachée au compte d''un autre foyer', format(
  $q$insert into public.transactions (household_id, account_id, booked_on, amount_cents, source, dedupe_hash)
     values (%L, %L, date '2026-11-01', -100, 'manual', 'x1')$q$, current_setting('t.hc'), current_setting('t.acc_d')));

select pg_temp.must_fail('transaction déplacée vers le compte d''un autre foyer', format(
  $q$update public.transactions set account_id = %L where id = %L$q$, current_setting('t.acc_d'), current_setting('t.tx_c')));

select pg_temp.must_fail('transaction rattachée à un lot d''import d''un autre foyer', format(
  $q$insert into public.transactions (household_id, account_id, booked_on, amount_cents, source, dedupe_hash, import_batch_id)
     values (%L, %L, date '2026-11-01', -100, 'csv', 'x2', %L)$q$, current_setting('t.hc'), current_setting('t.acc_c'), current_setting('t.batch_d')));

select pg_temp.must_fail('allocation vers l''objectif d''un autre foyer', format(
  $q$insert into public.goal_allocations (household_id, goal_id, amount_cents) values (%L, %L, 1000)$q$,
  current_setting('t.hc'), current_setting('t.goal_d')));

select pg_temp.must_fail('contribution liée au calcul de Zakat d''un autre foyer', format(
  $q$insert into public.contributions (household_id, kind, amount_cents, paid_on, zakat_calculation_id)
     values (%L, 'zakat', 100, date '2026-11-01', %L)$q$, current_setting('t.hc'), current_setting('t.zc_d')));

select pg_temp.must_fail('purification liée à la transaction d''un autre foyer', format(
  $q$insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on)
     values (%L, %L, 'bank_interest', 1000, date '2026-10-31')$q$, current_setting('t.hc'), current_setting('t.tx_d')));

select pg_temp.must_fail('purification liée à la contribution d''un autre foyer', format(
  $q$insert into public.purification_items (household_id, source_kind, credited_cents, occurred_on, contribution_id)
     values (%L, 'manual', 1000, date '2026-10-31', %L)$q$, current_setting('t.hc'), current_setting('t.contrib_d')));

select pg_temp.must_fail('lot d''import sur le compte d''un autre foyer', format(
  $q$insert into public.import_batches (household_id, account_id, source) values (%L, %L, 'csv')$q$,
  current_setting('t.hc'), current_setting('t.acc_d')));

select pg_temp.must_fail('actif rattaché au compte d''un autre foyer', format(
  $q$insert into public.assets (household_id, kind, name, account_id) values (%L, 'bank_balance', 'x', %L)$q$,
  current_setting('t.hc'), current_setting('t.acc_d')));

select pg_temp.must_fail('compte rattaché à la connexion bancaire d''un autre foyer', format(
  $q$insert into public.accounts (household_id, name, connection_id) values (%L, 'x', %L)$q$,
  current_setting('t.hc'), current_setting('t.conn_d')));

select pg_temp.must_fail('transaction transférée vers un autre foyer', format(
  $q$update public.transactions set household_id = %L where id = %L$q$, current_setting('t.hd'), current_setting('t.tx_c')));

select pg_temp.must_fail('ajout de soi-même dans un autre foyer', format(
  $q$insert into public.household_members (household_id, user_id, role) values (%L, auth.uid(), 'owner')$q$, current_setting('t.hd')));

select pg_temp.must_fail('changement du créateur du foyer', format(
  $q$update public.households set created_by = '00000000-0000-0000-0000-00000000000d' where id = %L$q$, current_setting('t.hc')));

select pg_temp.must_fail('exécution d''une fonction d''administration RLS',
  $q$select public.apply_household_rls('public.transactions'::regclass)$q$);

select pg_temp.must_fail('modification d''un référentiel de Zakat',
  $q$insert into public.zakat_rulesets (id, version, title, parameters, references_) values ('pirate', '1', 'x', '{}', '[]')$q$);

-- Usurpation d'auteur : la valeur fournie doit être remplacée par auth.uid()
do $$
declare v uuid;
begin
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result,
    zakatable_cents, nisab_cents, zakat_due_cents, is_above_nisab, status, created_by)
  values (current_setting('t.hc')::uuid, 'amanah-zakat', '1.0.0', 'test', date '2026-11-01', '{}', '{}', 1, 1, 0, false, 'below_nisab',
          '00000000-0000-0000-0000-00000000000d')
  returning created_by into v;
  insert into _results values ('auteur d''un calcul non usurpable', v = auth.uid(), 'created_by = ' || coalesce(v::text, 'null'));
exception when others then
  insert into _results values ('auteur d''un calcul non usurpable', true, 'refusé : ' || sqlerrm);
end $$;

-- Vue des soldes : la RLS de l'appelant s'applique (security_invoker)
do $$
declare n int; foreign_rows int;
begin
  select count(*) into n from public.account_balances;
  select count(*) into foreign_rows from public.account_balances where household_id <> current_setting('t.hc')::uuid;
  insert into _results values ('vue des soldes limitée au foyer', n = 1 and foreign_rows = 0, n || ' ligne(s), ' || foreign_rows || ' d''un autre foyer');
end $$;

-- ---------------------------------------------------------------------------
-- Rôle lecteur : lecture seule
-- ---------------------------------------------------------------------------
reset role;
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hd')::uuid, '00000000-0000-0000-0000-00000000000c', 'viewer');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';

do $$
declare n int;
begin
  select count(*) into n from public.accounts where household_id = current_setting('t.hd')::uuid;
  insert into _results values ('un lecteur voit le foyer partagé', n = 1, n || ' compte(s) visibles');
end $$;
select pg_temp.must_fail('un lecteur ne peut pas écrire', format(
  $q$insert into public.goals (household_id, kind, name, target_cents, target_date) values (%L, 'omra', 'x', 1, date '2030-01-01')$q$,
  current_setting('t.hd')));
reset role;
delete from public.household_members where household_id = current_setting('t.hd')::uuid and user_id = '00000000-0000-0000-0000-00000000000c';

-- ---------------------------------------------------------------------------
-- Visiteur non connecté (anon) : aucun accès aux tables
-- ---------------------------------------------------------------------------
set role anon;
reset request.jwt.claim.sub;
select pg_temp.must_fail('anon ne lit pas les catégories', $q$select count(*) from public.categories$q$);
select pg_temp.must_fail('anon ne lit pas les foyers', $q$select count(*) from public.households$q$);
select pg_temp.must_fail('anon ne lit pas la vue des soldes', $q$select count(*) from public.account_balances$q$);
reset role;

-- ---------------------------------------------------------------------------
-- Droit à l'effacement : suppression du compte en cascade, journal compris
-- ---------------------------------------------------------------------------
do $$
declare n int;
begin
  begin
    delete from auth.users where id = '00000000-0000-0000-0000-00000000000d';
    select count(*) into n from public.households where id = current_setting('t.hd')::uuid;
    insert into _results values ('suppression RGPD : foyer effacé', n = 0, n || ' foyer(s) restant(s)');
    select count(*) into n from public.audit_log where household_id = current_setting('t.hd')::uuid;
    insert into _results values ('suppression RGPD : journal du foyer effacé', n = 0, n || ' entrée(s) restante(s)');
  exception when others then
    insert into _results values ('suppression RGPD : effacement en cascade', false, sqlstate || ' ' || sqlerrm);
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Rapport
-- ---------------------------------------------------------------------------
do $$
declare r record; failures int := 0;
begin
  for r in select * from _results loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail;
    end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) de sécurité en échec', failures; end if;
end $$;
