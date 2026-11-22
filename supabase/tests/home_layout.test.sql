-- =============================================================================
-- Islamic-first lot 2 : préférence d'affichage privée et indépendante du consentement (migration 0026). Utilisateurs fictifs : Hana (propriétaire,
-- consentement article 9), Idris (membre du même foyer, SANS consentement),
-- Jad (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _hl (check_name text, ok boolean, detail text);
grant all on _hl to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'hana@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'idris@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'jad@example.test');
select set_config('t.hh', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000a1'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000a2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hh')::uuid, '00000000-0000-0000-0000-0000000000a2', 'member');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select u.id, k.kind::public.consent_kind, true, 'test', repeat('a', 64)
from auth.users u cross join (values ('terms'), ('privacy')) k(kind)
where u.id::text like '00000000-0000-0000-0000-0000000000a%';
insert into public.consents (user_id, kind, granted, document_version, document_hash)
values ('00000000-0000-0000-0000-0000000000a1', 'special_category', true, 'test', repeat('b', 64));

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _hl values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _hl values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _hl values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _hl values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _hl values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('t.hh2', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000a3'), false);
set role authenticated;

-- Hana (consentement religieux), Idris (même foyer, sans consentement), Jad (autre foyer)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check_val('valeur par défaut : Islamic-first', $q$select home_layout from public.profiles where id = auth.uid()$q$, 'islamic_first');
select pg_temp.expect('Hana choisit l''affichage analytique', $q$update public.profiles set home_layout = 'classic' where id = auth.uid()$q$, true);
select pg_temp.check_val('préférence enregistrée', $q$select home_layout from public.profiles where id = auth.uid()$q$, 'classic');
select pg_temp.expect('valeur inconnue refusée', $q$update public.profiles set home_layout = 'autre' where id = auth.uid()$q$, false);

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check_val('Idris (même foyer) ne lit pas la préférence de Hana', $q$select count(*)::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$q$, '0');
select pg_temp.expect('Idris ne modifie pas la préférence de Hana (sans effet)', $q$update public.profiles set home_layout = 'islamic_first' where id = '00000000-0000-0000-0000-0000000000a1'$q$, true);
select pg_temp.expect('Idris (sans consentement) peut choisir sa propre préférence', $q$update public.profiles set home_layout = 'classic' where id = auth.uid()$q$, true);

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.check_val('Jad (autre foyer) ne lit pas la préférence de Hana', $q$select count(*)::text from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$q$, '0');

reset role;
select pg_temp.check_val('la préférence de Hana est intacte', $q$select home_layout from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'classic');
set role authenticated;

-- Indépendance du consentement : l'effacement des données religieuses ne touche pas la préférence
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('effacement des données religieuses', $q$select public.erase_my_religious_data()$q$, true);
reset role;
select pg_temp.check_val('préférence conservée après l''effacement', $q$select home_layout from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'$q$, 'classic');
select pg_temp.check_val('aucune colonne de préférence dans les tables religieuses', $q$select count(*)::text from information_schema.columns where table_schema = 'public' and column_name = 'home_layout'$q$, '1');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _hl loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) préférence d''affichage en échec', failures; end if;
end $$;
