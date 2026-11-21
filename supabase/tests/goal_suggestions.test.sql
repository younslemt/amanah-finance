-- =============================================================================
-- Suggestions de projets et calendrier familial (migrations 0022-0023). Utilisateurs fictifs : Hana (propriétaire,
-- consentement article 9), Idris (membre du même foyer, SANS consentement),
-- Jad (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _gs (check_name text, ok boolean, detail text);
grant all on _gs to authenticated, anon;

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
    insert into _gs values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _gs values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _gs values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _gs values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _gs values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

select set_config('t.hh2', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000a3'), false);
set role authenticated;

-- Hana (consentement) : projet religieux issu d'un modèle (Ramadan → « autre projet religieux »)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('Ramadan créé depuis un modèle (projet religieux privé)', format($q$
  select public.create_goal_with_allocation(%L, 'religious_other', 'Ramadan 2027', 40000, date '2027-02-08', 5000, 0, date '2026-11-24', 'ramadan', 2027::smallint)$q$,
  current_setting('t.hh')), true);
select pg_temp.check_val('« autre projet religieux » protégé (propriétaire renseigné)',
  $q$select (owner_id = '00000000-0000-0000-0000-0000000000a1')::text from public.goals where template_id = 'ramadan'$q$, 'true');
select pg_temp.expect('préférences privées de Hana', format($q$
  insert into public.planning_preferences (user_id, household_id, groups, has_children, interests, confirmations)
  values ('00000000-0000-0000-0000-0000000000a1', %L, array['religious', 'family'], true, array['hajj', 'mariage'],
          '[{"type":"ramadan","year":2027,"date":"2027-02-08","source":"Mosquée fictive"}]')$q$, current_setting('t.hh')), true);
select pg_temp.expect('groupe inconnu refusé', $q$update public.planning_preferences set groups = array['religious', 'crypto']$q$, false);
select pg_temp.expect('décision : reporter (avec date)', format($q$
  insert into public.suggestion_decisions (user_id, household_id, suggestion_id, status, until) values ('00000000-0000-0000-0000-0000000000a1', %L, 'ramadan:2027', 'snoozed', date '2026-12-24')$q$, current_setting('t.hh')), true);
select pg_temp.expect('décision : ne plus proposer', format($q$
  insert into public.suggestion_decisions (user_id, household_id, suggestion_id, status) values ('00000000-0000-0000-0000-0000000000a1', %L, 'vacances-familiales', 'dismissed')$q$, current_setting('t.hh')), true);
select pg_temp.expect('report sans date refusé', format($q$
  insert into public.suggestion_decisions (user_id, household_id, suggestion_id, status) values ('00000000-0000-0000-0000-0000000000a1', %L, 'mariage', 'snoozed')$q$, current_setting('t.hh')), false);
select pg_temp.expect('identifiant de suggestion invalide refusé', format($q$
  insert into public.suggestion_decisions (user_id, household_id, suggestion_id, status) values ('00000000-0000-0000-0000-0000000000a1', %L, 'x; drop', 'dismissed')$q$, current_setting('t.hh')), false);
select pg_temp.expect('décision au nom d''une autre personne refusée', format($q$
  insert into public.suggestion_decisions (user_id, household_id, suggestion_id, status) values ('00000000-0000-0000-0000-0000000000a2', %L, 'mariage', 'dismissed')$q$, current_setting('t.hh')), false);
select pg_temp.expect('événement familial du foyer', format($q$
  insert into public.calendar_events (household_id, label, event_date, yearly, visibility) values (%L, 'Assurance habitation', date '2027-03-15', true, 'household')$q$, current_setting('t.hh')), true);

-- Idris (même foyer, sans consentement)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check_val('Idris ne voit ni les préférences ni les décisions de Hana, ni son projet Ramadan',
  $q$select (select count(*) from public.planning_preferences) + (select count(*) from public.suggestion_decisions) + (select count(*) from public.goals where template_id = 'ramadan')$q$, '0');
select pg_temp.check_val('Idris voit le calendrier familial du foyer', $q$select count(*)::text from public.calendar_events$q$, '1');
select pg_temp.expect('Idris : « autre projet religieux » refusé sans consentement', format($q$
  select public.create_goal_with_allocation(%L, 'religious_other', 'Aïd al-Fitr', 20000, date '2027-03-10', 2000, 0, date '2026-11-24', 'aid-al-fitr', 2027::smallint)$q$,
  current_setting('t.hh')), false);
select pg_temp.expect('projet annuel depuis un modèle (rentrée 2026)', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Rentrée scolaire 2026', 60000, date '2026-12-20', 5000, 10000, date '2026-11-24', 'rentree-scolaire', 2026::smallint)$q$,
  current_setting('t.hh')), true);
select set_config('t.r26', (select id::text from public.goals where name = 'Rentrée scolaire 2026'), false);
select pg_temp.expect('reconduction refusée tant que l''occurrence n''est pas réalisée', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Rentrée scolaire 2027', 60000, date '2027-08-30', 5000, 0, date '2026-11-24', 'rentree-scolaire', 2027::smallint, %L)$q$,
  current_setting('t.hh'), current_setting('t.r26')), false);
select pg_temp.expect('occurrence réalisée', $q$update public.goals set status = 'achieved', realized_on = date '2026-11-24' where name = 'Rentrée scolaire 2026'$q$, true);
select pg_temp.expect('reconduction : mauvaise année refusée', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Rentrée 2029', 60000, date '2029-08-30', 5000, 0, date '2026-11-24', 'rentree-scolaire', 2029::smallint, %L)$q$,
  current_setting('t.hh'), current_setting('t.r26')), false);
select pg_temp.expect('reconduction : autre modèle refusé', format($q$
  select public.create_goal_with_allocation(%L, 'personal', 'Vacances 2027', 60000, date '2027-07-03', 5000, 0, date '2026-11-24', 'vacances-familiales', 2027::smallint, %L)$q$,
  current_setting('t.hh'), current_setting('t.r26')), false);
select pg_temp.expect('reconduction décidée : rentrée 2027, budget modifié', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Rentrée scolaire 2027', 65000, date '2027-08-30', 5500, 0, date '2026-11-24', 'rentree-scolaire', 2027::smallint, %L)$q$,
  current_setting('t.hh'), current_setting('t.r26')), true);
select pg_temp.check_val('occurrences distinctes, aucune affectation reprise',
  $q$select string_agg(g.occurrence_year || ':' || coalesce((select sum(a.amount_cents) from public.goal_allocations a where a.goal_id = g.id), 0), ',' order by g.occurrence_year) from public.goals g where g.template_id = 'rentree-scolaire'$q$,
  '2026:10000,2027:0');
select pg_temp.expect('reconduction une seule fois', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Rentrée bis', 65000, date '2027-08-30', 5500, 0, date '2026-11-24', 'rentree-scolaire', 2027::smallint, %L)$q$,
  current_setting('t.hh'), current_setting('t.r26')), false);
select pg_temp.expect('origine du projet non modifiable', $q$update public.goals set occurrence_year = 2030 where name = 'Rentrée scolaire 2027'$q$, false);

-- Jad (autre foyer) : rien de visible, rien de reconductible
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.check_val('Jad ne voit ni le calendrier ni les projets du foyer', $q$select (select count(*) from public.calendar_events) + (select count(*) from public.goals where template_id is not null)$q$, '0');
select pg_temp.expect('Jad ne peut pas reconduire un projet d''un autre foyer', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Rentrée volée', 60000, date '2027-08-30', 5000, 0, date '2026-11-24', 'rentree-scolaire', 2027::smallint, %L)$q$,
  current_setting('t.hh2'), current_setting('t.r26')), false);

-- Retrait du consentement de Hana : partie religieuse effacée, le reste conservé
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.check_val('effacement : décisions religieuses supprimées',
  $q$select (public.erase_my_religious_data() ->> 'suggestion_decisions')$q$, '1');
select pg_temp.check_val('préférences : groupe et intérêts religieux retirés, le reste conservé',
  $q$select array_to_string(groups, ',') || '|' || array_to_string(interests, ',') || '|' || confirmations::text || '|' || has_children::text from public.planning_preferences$q$,
  'family|mariage|[]|true');
select pg_temp.check_val('décision non religieuse conservée', $q$select string_agg(suggestion_id, ',') from public.suggestion_decisions$q$, 'vacances-familiales');
select pg_temp.check_val('projet Ramadan effacé', $q$select count(*)::text from public.goals where template_id = 'ramadan'$q$, '0');
reset role;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _gs loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) suggestions en échec', failures; end if;
end $$;
