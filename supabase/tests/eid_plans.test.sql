-- =============================================================================
-- Sprint 5, lot 5.2 : « Préparer mon Aïd ». Utilisateurs fictifs : Nadia (propriétaire,
-- consentement), Omar (membre du même foyer, consentement, ne partage pas), Paul (même
-- foyer, sans consentement), Rania (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _ep (check_name text, ok boolean, detail text);
grant all on _ep to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'nadia@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'omar@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'paul@example.test'),
  ('00000000-0000-0000-0000-0000000000b4', 'rania@example.test');
select set_config('t.hn', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000b1'), false);
select set_config('t.hr', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000b4'), false);
delete from public.households where created_by in ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b3');
insert into public.household_members (household_id, user_id, role) values
  (current_setting('t.hn')::uuid, '00000000-0000-0000-0000-0000000000b2', 'member'),
  (current_setting('t.hn')::uuid, '00000000-0000-0000-0000-0000000000b3', 'member');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select u.id, k.kind::public.consent_kind, true, 'test', repeat('a', 64)
from auth.users u cross join (values ('terms'), ('privacy')) k(kind)
where u.id::text like '00000000-0000-0000-0000-0000000000b%';
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select id, 'special_category', true, 'test', repeat('b', 64) from auth.users
where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b4');

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _ep values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _ep values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _ep values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _ep values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _ep values (name, false, sqlstate || ' ' || sqlerrm);
end $$;
-- create_eid_goal(foyer, nom, année, sacrifice, frais, organisme, famille, date, statut, source, estimation, capacité, initial, jour, précédent)
create or replace function pg_temp.eid(hid text, yr int, initial bigint, prev text default null) returns text language sql as $$
  select format('select public.create_eid_goal(%L, %L, %s::smallint, 35000, 5000, 0, 10000, date %L, %L, null, date %L, 5000, %s, date %L, %s)',
    hid, 'Aïd ' || yr, yr, yr || '-05-27', 'entered', yr || '-05-27', initial, '2026-11-01', coalesce(quote_literal(prev) || '::uuid', 'null'));
$$;

set role authenticated;

-- Paul (sans consentement) : refusé
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.expect('sans consentement : projet Aïd refusé', pg_temp.eid(current_setting('t.hn'), 2026, 0), false);

-- Nadia
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect('Aïd 2026 créé (projet, plan et épargne initiale)', pg_temp.eid(current_setting('t.hn'), 2026, 5000), true);
select set_config('t.g26', (select goal_id::text from public.eid_plans where civil_year = 2026), false);
select pg_temp.check_val('cible = coût total − contributions familiales ; projet privé',
  $q$select target_cents || '/' || (owner_id is not null)::text from public.goals where id = current_setting('t.g26')::uuid$q$, '30000/true');
select pg_temp.check_val('date saisie, non confirmée ; estimation conservée à part',
  $q$select date_status || '/' || estimate_method || '/' || estimated_date from public.eid_plans$q$, 'entered/tabular/2026-05-27');
select pg_temp.expect('« confirmée » sans source refusée', $q$update public.eid_plans set date_status = 'confirmed'$q$, false);
select pg_temp.expect('date confirmée avec sa source', $q$update public.eid_plans set date_status = 'confirmed', date_source = 'Mosquée fictive'$q$, true);
select pg_temp.check_val('historique : confirmation de la date journalisée',
  $q$select (changes -> 'date_status' ->> 'to') || '/' || (changes -> 'date_source' ->> 'to') from public.goal_changes where changes ? 'date_status'$q$, 'confirmed/Mosquée fictive');
select pg_temp.expect('budget modifié', $q$update public.eid_plans set extra_costs_cents = 8000$q$, true);
select pg_temp.check_val('… la cible du projet suit le budget', $q$select target_cents::text from public.goals where id = current_setting('t.g26')::uuid$q$, '33000');
select pg_temp.expect('contributions familiales couvrant tout le budget refusées', $q$update public.eid_plans set family_contribution_cents = 48000$q$, false);
select pg_temp.expect('année civile non modifiable', $q$update public.eid_plans set civil_year = 2027$q$, false);
select pg_temp.expect('doublon : second Aïd 2026 refusé', pg_temp.eid(current_setting('t.hn'), 2026, 0), false);

-- Reconduction
select pg_temp.expect('reconduction avant réalisation refusée', pg_temp.eid(current_setting('t.hn'), 2027, 0, current_setting('t.g26')), false);
select pg_temp.expect('Aïd 2026 réalisé', $q$update public.goals set status = 'achieved', realized_on = date '2026-05-27' where id = current_setting('t.g26')::uuid$q$, true);
select pg_temp.expect('reconduction vers une année non consécutive refusée', pg_temp.eid(current_setting('t.hn'), 2028, 0, current_setting('t.g26')), false);
select pg_temp.expect('reconduction 2027 acceptée après réalisation', pg_temp.eid(current_setting('t.hn'), 2027, 0, current_setting('t.g26')), true);
select pg_temp.expect('seconde reconduction de 2026 refusée', $q$
  insert into public.goals (household_id, kind, name, target_cents, target_date) values (current_setting('t.hn')::uuid, 'eid_al_adha', 'Aïd bis', 30000, date '2028-05-06');
  insert into public.eid_plans (goal_id, household_id, civil_year, sacrifice_cents, family_contribution_cents, previous_goal_id)
  select id, household_id, 2028, 30000, 0, current_setting('t.g26')::uuid from public.goals where name = 'Aïd bis'$q$, false);
select pg_temp.check_val('montants non fusionnés : 2027 démarre sans affectation, 2026 conserve les siennes',
  $q$select coalesce((select sum(amount_cents) from public.goal_allocations a join public.eid_plans p on p.goal_id = a.goal_id where p.civil_year = 2027), 0)
     || '/' || (select sum(amount_cents) from public.goal_allocations where goal_id = current_setting('t.g26')::uuid)$q$, '0/5000');
select pg_temp.expect('plan Aïd rattaché à un projet non-Aïd refusé', format($q$
  select public.create_goal_with_allocation(%L, 'personal', 'Projet perso', 100000, date '2028-01-01', 1000, 0, date '2026-11-01');
  insert into public.eid_plans (goal_id, household_id, civil_year, sacrifice_cents)
  select id, household_id, 2029, 30000 from public.goals where name = 'Projet perso'$q$, current_setting('t.hn')), false);

-- Omar (même foyer, ne partage pas) et Paul (sans consentement) : rien ; Rania (autre foyer) : rien
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.check_val('Omar ne voit ni les projets Aïd de Nadia, ni leurs plans',
  $q$select (select count(*) from public.eid_plans) + (select count(*) from public.goals where kind = 'eid_al_adha')$q$, '0');
select pg_temp.expect('Omar : reconduction de l''Aïd de Nadia refusée', pg_temp.eid(current_setting('t.hn'), 2028, 0, current_setting('t.g26')), false);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b3';
select pg_temp.check_val('Paul ne voit rien', $q$select count(*)::text from public.eid_plans$q$, '0');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b4';
select pg_temp.check_val('Rania ne voit rien', $q$select count(*)::text from public.eid_plans$q$, '0');
select pg_temp.expect('Rania : Aïd dans le foyer de Nadia refusé', pg_temp.eid(current_setting('t.hn'), 2030, 0), false);

-- Retrait avec effacement
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select pg_temp.expect('Nadia retire son consentement et efface', $q$select public.withdraw_religious_consent('test', true)$q$, true);
reset role;
select pg_temp.check_val('effacement : projets Aïd, plans et historique supprimés',
  $q$select (select count(*) from public.eid_plans) + (select count(*) from public.goals where kind = 'eid_al_adha')
     + (select count(*) from public.goal_changes c where not exists (select 1 from public.goals g where g.id = c.goal_id))$q$, '0');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _ep loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) Aïd en échec', failures; end if;
end $$;
