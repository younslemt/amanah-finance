-- =============================================================================
-- Sprint 5, lot 5.3 : plan d'épargne. Utilisateurs fictifs : Sara (propriétaire),
-- Taha (membre lecteur du même foyer), Uma (autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _sp (check_name text, ok boolean, detail text);
grant all on _sp to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'sara@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'taha@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'uma@example.test');
select set_config('t.hs', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000d1'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000d2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hs')::uuid, '00000000-0000-0000-0000-0000000000d2', 'viewer');

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _sp values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _sp values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _sp values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _sp values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _sp values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.expect('capacité déclarée par le foyer', format($q$
  insert into public.household_savings_settings (household_id, declared_capacity_cents) values (%L, 50000)$q$, current_setting('t.hs')), true);
select pg_temp.expect('capacité négative refusée', $q$update public.household_savings_settings set declared_capacity_cents = -1$q$, false);
select pg_temp.expect('projet réserve', format($q$
  select public.create_goal_with_allocation(%L, 'emergency_fund', 'Réserve fictive', 600000, date '2028-11-01', 10000, 0, date '2026-11-01')$q$, current_setting('t.hs')), true);
select pg_temp.expect('montant prévu et priorité modifiés', $q$update public.goals set monthly_capacity_cents = 15000, priority = 1$q$, true);
select pg_temp.check_val('plan journalisé dans l''historique du projet',
  $q$select (changes -> 'monthly_capacity_cents' ->> 'to') || '/' || (changes -> 'priority' ->> 'to') from public.goal_changes$q$, '15000/1');
select pg_temp.check_val('affecter un montant ne crée aucune opération (mise de côté virtuelle)',
  'select count(*)::text from public.transactions', '0');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.check_val('Taha (lecteur) voit la capacité du foyer', 'select declared_capacity_cents::text from public.household_savings_settings', '50000');
update public.household_savings_settings set declared_capacity_cents = 1;
select pg_temp.check_val('Taha (lecteur) ne peut pas la modifier', 'select declared_capacity_cents::text from public.household_savings_settings', '50000');

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d3';
select pg_temp.check_val('Uma ne voit rien', 'select count(*)::text from public.household_savings_settings', '0');
select pg_temp.expect('Uma : écriture dans le foyer de Sara refusée', format($q$
  insert into public.household_savings_settings (household_id, declared_capacity_cents) values (%L, 1)
  on conflict (household_id) do update set declared_capacity_cents = 1$q$, current_setting('t.hs')), false);
reset role;
select pg_temp.check_val('… capacité inchangée', 'select declared_capacity_cents::text from public.household_savings_settings', '50000');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _sp loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) plan d''épargne en échec', failures; end if;
end $$;
