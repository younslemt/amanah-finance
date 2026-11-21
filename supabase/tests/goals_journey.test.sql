-- =============================================================================
-- Revue produit Sprint 5 : parcours fondé sur des décisions (migration 0021). Utilisateurs fictifs : Hana (propriétaire,
-- consentement article 9), Idris (membre du même foyer, SANS consentement),
-- Jad (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _gj (check_name text, ok boolean, detail text);
grant all on _gj to authenticated, anon;

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
    insert into _gj values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _gj values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _gj values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _gj values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _gj values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

set role authenticated;

-- Idris (sans consentement) : projet général
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect('création avec épargne initiale', format($q$
  select public.create_goal_with_allocation(%L, 'personal', 'Voyage fictif', 300000, date '2028-06-01', 10000, 50000, date '2026-11-23')$q$,
  current_setting('t.hh')), true);
select set_config('t.g', (select id::text from public.goals where name = 'Voyage fictif'), false);
select pg_temp.check_val('épargne initiale marquée « initial » (ce n''est pas un suivi)',
  $q$select string_agg(source, ',') from public.goal_allocations where goal_id = current_setting('t.g')::uuid$q$, 'initial');
select pg_temp.check_val('nouveau projet : aucune décision de parcours supposée',
  $q$select (plan_confirmed_on is null and strategy_chosen_on is null and strategy_monthly_cents is null)::text from public.goals where id = current_setting('t.g')::uuid$q$, 'true');
select pg_temp.expect('Planifier : validation du plan', $q$update public.goals set plan_confirmed_on = date '2026-11-23' where name = 'Voyage fictif'$q$, true);
select pg_temp.expect('Simuler : stratégie retenue (mensualité et date ensemble)',
  $q$update public.goals set strategy_monthly_cents = 15000, strategy_chosen_on = date '2026-11-23', monthly_capacity_cents = 15000 where name = 'Voyage fictif'$q$, true);
select pg_temp.expect('stratégie incomplète refusée', $q$update public.goals set strategy_chosen_on = null where name = 'Voyage fictif'$q$, false);
select pg_temp.expect('stratégie négative refusée', $q$update public.goals set strategy_monthly_cents = -1 where name = 'Voyage fictif'$q$, false);
select pg_temp.check_val('décisions journalisées (historique en ajout seul)',
  $q$select count(*)::text from public.goal_changes where goal_id = current_setting('t.g')::uuid and (changes ? 'plan_confirmed_on' or changes ? 'strategy_chosen_on')$q$, '2');
select pg_temp.expect('Suivre : affectation enregistrée (source par défaut « manual »)', format($q$
  insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on) values (%L, %L, 15000, date '2026-11-23')$q$,
  current_setting('t.hh'), current_setting('t.g')), true);
select pg_temp.expect('Suivre : retrait enregistré', format($q$
  insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on) values (%L, %L, -5000, date '2026-11-23')$q$,
  current_setting('t.hh'), current_setting('t.g')), true);
select pg_temp.expect('source inconnue refusée', format($q$
  insert into public.goal_allocations (household_id, goal_id, amount_cents, source) values (%L, %L, 100, 'bank')$q$,
  current_setting('t.hh'), current_setting('t.g')), false);
select pg_temp.check_val('affectations : initiale + suivi',
  $q$select string_agg(source || ':' || amount_cents, ',' order by created_at, amount_cents desc) from public.goal_allocations where goal_id = current_setting('t.g')::uuid$q$,
  'initial:50000,manual:15000,manual:-5000');
select pg_temp.expect('plusieurs projets de la même catégorie', format($q$
  select public.create_goal_with_allocation(%L, 'personal', 'Mariage fictif', 800000, date '2029-07-01', 20000, 0, date '2026-11-23')$q$,
  current_setting('t.hh')), true);
select pg_temp.check_val('deux projets personnels distincts', $q$select count(*)::text from public.goals where kind = 'personal'$q$, '2');
select pg_temp.expect('archivage : l''historique reste lisible', $q$update public.goals set status = 'archived' where name = 'Mariage fictif'$q$, true);
select pg_temp.check_val('projet archivé conservé avec son historique',
  $q$select count(*)::text from public.goal_changes c join public.goals g on g.id = c.goal_id where g.name = 'Mariage fictif' and g.status = 'archived'$q$, '1');
select pg_temp.expect('Hajj toujours refusé sans consentement', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj fictif', 900000, date '2028-05-01', 40000, 0, date '2026-11-23')$q$,
  current_setting('t.hh')), false);

-- Hana (consentement) : Aïd, épargne initiale « initial », décision privée invisible pour Idris
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('Aïd créé avec épargne initiale', format($q$
  select public.create_eid_goal(%L, 'Aïd fictif', 2027::smallint, 35000, 8000, 0, 10000, date '2027-05-17', 'entered', null, date '2027-05-17', 5000, 12000, date '2026-11-23')$q$,
  current_setting('t.hh')), true);
select pg_temp.check_val('Aïd : épargne initiale marquée « initial »',
  $q$select string_agg(a.source, ',') from public.goal_allocations a join public.goals g on g.id = a.goal_id where g.kind = 'eid_al_adha'$q$, 'initial');
select pg_temp.expect('Hana retient une stratégie pour son Aïd',
  $q$update public.goals set strategy_monthly_cents = 6000, strategy_chosen_on = date '2026-11-23' where kind = 'eid_al_adha'$q$, true);
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check_val('Idris ne voit ni l''Aïd de Hana ni son historique',
  $q$select (select count(*) from public.goals where kind = 'eid_al_adha') + (select count(*) from public.goal_changes c where not exists (select 1 from public.goals g where g.id = c.goal_id))$q$, '0');
select pg_temp.expect('Idris : décision sur l''Aïd de Hana sans effet', $q$update public.goals set plan_confirmed_on = date '2026-11-23' where kind = 'eid_al_adha'$q$, true);
reset role;
select pg_temp.check_val('… Aïd non modifié', $q$select (plan_confirmed_on is null)::text from public.goals where kind = 'eid_al_adha'$q$, 'true');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _gj loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) parcours projets en échec', failures; end if;
end $$;
