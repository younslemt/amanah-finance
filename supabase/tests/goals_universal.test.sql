-- =============================================================================
-- Sprint 5, lot 5.1 : projets universels. Utilisateurs fictifs : Hana (propriétaire,
-- consentement article 9), Idris (membre du même foyer, SANS consentement),
-- Jad (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _gu (check_name text, ok boolean, detail text);
grant all on _gu to authenticated, anon;

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
    insert into _gu values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _gu values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _gu values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _gu values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _gu values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

set role authenticated;

-- Idris (sans consentement) : projets généraux oui, projets religieux non
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.expect('sans consentement : projet « études » créé avec épargne initiale', format($q$
  select public.create_goal_with_allocation(%L, 'children_education', 'Études fictives', 1200000, date '2030-09-01', 30000, 200000, date '2026-11-01')$q$,
  current_setting('t.hh')), true);
select pg_temp.expect('sans consentement : projet « réserve d''urgence » créé', format($q$
  select public.create_goal_with_allocation(%L, 'emergency_fund', 'Réserve fictive', 600000, date '2027-12-01', 20000, 0, date '2026-11-01')$q$,
  current_setting('t.hh')), true);
select pg_temp.expect('sans consentement : projet Hajj refusé', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj fictif', 900000, date '2028-05-01', 40000, 0, date '2026-11-01')$q$,
  current_setting('t.hh')), false);
select pg_temp.check_val('projet général : commun au foyer (aucun propriétaire)',
  $q$select count(*)::text from public.goals where owner_id is null and kind = 'children_education'$q$, '1');
select set_config('t.g', (select id::text from public.goals where kind = 'children_education'), false);

-- Modification sans perte d'historique
select pg_temp.expect('modification de la cible et de la capacité', $q$
  update public.goals set target_cents = 1500000, monthly_capacity_cents = 35000 where kind = 'children_education'$q$, true);
select pg_temp.check_val('affectations conservées après modification',
  $q$select sum(amount_cents)::text from public.goal_allocations where goal_id = current_setting('t.g')::uuid$q$, '200000');
select pg_temp.check_val('modification journalisée (avant / après)',
  $q$select (changes -> 'target_cents' ->> 'from') || '→' || (changes -> 'target_cents' ->> 'to') || ',' || (changes ? 'monthly_capacity_cents')::text
     from public.goal_changes where goal_id = current_setting('t.g')::uuid$q$, '1200000→1500000,true');
select pg_temp.check_val('auteur de la modification enregistré par la base',
  $q$select changed_by::text from public.goal_changes where goal_id = current_setting('t.g')::uuid$q$, '00000000-0000-0000-0000-0000000000a2');
select pg_temp.expect('historique : écriture directe refusée', format($q$
  insert into public.goal_changes (household_id, goal_id, changes) values (%L, %L, '{"faux": true}')$q$,
  current_setting('t.hh'), current_setting('t.g')), false);
select pg_temp.expect('historique : suppression refusée', 'delete from public.goal_changes', false);
select pg_temp.check_val('historique intact', 'select count(*)::text from public.goal_changes', '1');
select pg_temp.expect('changement de catégorie refusé', $q$update public.goals set kind = 'retirement' where kind = 'children_education'$q$, false);
select pg_temp.expect('« réalisé » sans date de réalisation refusé', $q$update public.goals set status = 'achieved' where kind = 'emergency_fund'$q$, false);
select pg_temp.expect('réalisé avec sa date', $q$update public.goals set status = 'achieved', realized_on = date '2026-11-15' where kind = 'emergency_fund'$q$, true);
select pg_temp.expect('rouvert : date de réalisation retirée', $q$update public.goals set status = 'active', realized_on = null where kind = 'emergency_fund'$q$, true);

-- Hana (consentement) : projet Hajj privé, son historique aussi
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('avec consentement : projet Hajj créé', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj fictif', 900000, date '2028-05-01', 40000, 100000, date '2026-11-01')$q$,
  current_setting('t.hh')), true);
select pg_temp.expect('Hana modifie son projet Hajj', $q$update public.goals set target_cents = 950000 where kind = 'hajj'$q$, true);
select pg_temp.check_val('Hana voit les projets du foyer et son Hajj',
  $q$select count(*)::text from public.goals$q$, '3');
select pg_temp.check_val('Hana voit l''historique du projet commun',
  $q$select count(*)::text from public.goal_changes where goal_id = current_setting('t.g')::uuid$q$, '1');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
select pg_temp.check_val('Idris : ni le Hajj de Hana, ni son historique, ni ses affectations',
  $q$select (select count(*) from public.goals where kind = 'hajj') + (select count(*) from public.goal_changes c where not exists (select 1 from public.goals g where g.id = c.goal_id and g.owner_id is null))
     + (select count(*) from public.goal_allocations a join public.goals g on g.id = a.goal_id where g.kind = 'hajj')$q$, '0');

-- Jad (autre foyer) : rien
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a3';
select pg_temp.check_val('Jad ne voit rien du foyer de Hana',
  $q$select (select count(*) from public.goals) + (select count(*) from public.goal_changes) + (select count(*) from public.goal_allocations)$q$, '0');
select pg_temp.expect('Jad : modification d''un projet d''un autre foyer sans effet', $q$update public.goals set target_cents = 1 where true$q$, true);
reset role;
select pg_temp.check_val('… aucun projet modifié', $q$select count(*)::text from public.goals where target_cents = 1$q$, '0');

-- Retrait du consentement de Hana avec effacement : son Hajj et son historique disparaissent, le projet commun reste
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select pg_temp.expect('retrait avec effacement', $q$select public.withdraw_religious_consent('test', true)$q$, true);
reset role;
select pg_temp.check_val('effacement : Hajj et son historique supprimés, projets communs conservés',
  $q$select (select count(*) from public.goals where kind = 'hajj') || '/' || (select count(*) from public.goals where owner_id is null)
     || '/' || (select count(*) from public.goal_changes c join public.goals g on g.id = c.goal_id where g.owner_id is null)$q$, '0/2/3');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _gu loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) projets universels en échec', failures; end if;
end $$;
