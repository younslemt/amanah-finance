-- =============================================================================
-- Revue finale Sprint 5 : confidentialité du calendrier familial (migration 0024). Utilisateurs fictifs : Hana (propriétaire,
-- consentement article 9), Idris (membre du même foyer, SANS consentement),
-- Jad (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _cp (check_name text, ok boolean, detail text);
grant all on _cp to authenticated, anon;

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
    insert into _cp values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _cp values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _cp values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _cp values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _cp values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('t.hh2', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000a3'), false);
set role authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('Hana : événement personnel (par défaut)', format($q$
  insert into public.calendar_events (household_id, label, event_date) values (%L, 'Rendez-vous personnel fictif', date '2027-02-01')$q$, current_setting('t.hh')), true);
select pg_temp.check_val('visibilité par défaut : personnel', $q$select visibility from public.calendar_events where label = 'Rendez-vous personnel fictif'$q$, 'private');
select pg_temp.expect('Hana : événement familial partagé volontairement', format($q$
  insert into public.calendar_events (household_id, label, event_date, visibility) values (%L, 'Anniversaire familial fictif', date '2027-03-01', 'household')$q$, current_setting('t.hh')), true);
select pg_temp.expect('Hana : événement religieux personnalisé (privé)', format($q$
  insert into public.calendar_events (household_id, label, event_date, religious) values (%L, 'Veillée fictive', date '2027-03-05', true)$q$, current_setting('t.hh')), true);
select pg_temp.expect('événement religieux partagé au foyer refusé', format($q$
  insert into public.calendar_events (household_id, label, event_date, religious, visibility) values (%L, 'Partage religieux', date '2027-03-06', true, 'household')$q$, current_setting('t.hh')), false);
select pg_temp.expect('auteur usurpé refusé', format($q$
  insert into public.calendar_events (household_id, label, event_date, created_by) values (%L, 'Au nom d''Idris', date '2027-03-07', '00000000-0000-0000-0000-0000000000a2')$q$, current_setting('t.hh')), false);
select pg_temp.check_val('Hana voit ses trois événements', $q$select count(*)::text from public.calendar_events$q$, '3');
select pg_temp.expect('dates scolaires corrigées conservées dans les préférences', format($q$
  insert into public.planning_preferences (user_id, household_id, school_overrides) values ('00000000-0000-0000-0000-0000000000a1', %L, '[{"kind":"start","year":2027,"date":"2027-08-30","source":"École fictive"}]')$q$, current_setting('t.hh')), true);

-- Idris (même foyer, sans consentement religieux)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check_val('Idris ne voit que l''événement familial partagé', $q$select string_agg(label, ',') from public.calendar_events$q$, 'Anniversaire familial fictif');
select pg_temp.expect('Idris : événement religieux refusé sans consentement', format($q$
  insert into public.calendar_events (household_id, label, event_date, religious) values (%L, 'Religieux sans consentement', date '2027-03-08', true)$q$, current_setting('t.hh')), false);
select pg_temp.expect('Idris : suppression de l''événement personnel de Hana sans effet', $q$delete from public.calendar_events where label = 'Rendez-vous personnel fictif'$q$, true);
select pg_temp.expect('Idris : passer un événement privé de Hana en familial sans effet', $q$update public.calendar_events set visibility = 'household' where label = 'Veillée fictive'$q$, true);
select pg_temp.expect('Idris : modifier l''événement familial (droit d''écriture du foyer)', $q$update public.calendar_events set label = 'Anniversaire familial (modifié)' where label = 'Anniversaire familial fictif'$q$, true);
select pg_temp.expect('Idris : rendre privé un événement familial de Hana refusé', $q$update public.calendar_events set visibility = 'private' where label = 'Anniversaire familial (modifié)'$q$, false);
select pg_temp.expect('Idris : s''approprier l''événement refusé', $q$update public.calendar_events set created_by = '00000000-0000-0000-0000-0000000000a2' where label = 'Anniversaire familial (modifié)'$q$, false);
reset role;
select pg_temp.check_val('les événements privés de Hana sont intacts', $q$select count(*)::text from public.calendar_events where visibility = 'private'$q$, '2');
select pg_temp.check_val('l''événement familial est partagé et modifiable', $q$select count(*)::text from public.calendar_events where label = 'Anniversaire familial (modifié)'$q$, '1');
set role authenticated;

-- Jad (autre foyer)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.check_val('Jad ne voit rien du foyer', $q$select count(*)::text from public.calendar_events$q$, '0');
select pg_temp.expect('Jad : écriture dans un autre foyer refusée', format($q$
  insert into public.calendar_events (household_id, label, event_date, visibility) values (%L, 'Intrus', date '2027-03-09', 'household')$q$, current_setting('t.hh')), false);

-- Retrait du consentement de Hana : ses événements religieux sont supprimés, le reste conservé
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check_val('effacement : événements religieux supprimés', $q$select (public.erase_my_religious_data() ->> 'calendar_events')$q$, '1');
reset role;
select pg_temp.check_val('événements non religieux conservés', $q$select string_agg(label, ',' order by label) from public.calendar_events$q$, 'Anniversaire familial (modifié),Rendez-vous personnel fictif');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _cp loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) confidentialité du calendrier en échec', failures; end if;
end $$;
