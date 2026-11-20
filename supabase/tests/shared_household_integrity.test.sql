-- =============================================================================
-- Revue Sprint 1 : atomicité et suppression d'un compte dans un foyer partagé.
-- Utilisateurs fictifs : Hana (H1, créatrice) et Idris (H2, membre).
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _r10 (check_name text, ok boolean, detail text);
grant all on _r10 to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'hana@example.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'idris@example.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'jamal@example.test');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
  select id, 'special_category', true, 'test', repeat('a', 64) from auth.users where id in ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b3');  -- article 9 (lot 0, Sprint 2)
select set_config('t.h1', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000b1'), false);
select set_config('t.h3', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000b3'), false);
-- Idris rejoint le foyer de Hana (son foyer individuel est retiré)
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000b2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.h1')::uuid, '00000000-0000-0000-0000-0000000000b2', 'member');

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _r10 values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _r10 values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _r10 values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Atomicité (en tant qu'Idris, membre du foyer)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';

select pg_temp.expect('objectif + épargne initiale en une transaction', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj d''Idris', 900000, date '2028-05-01', 40000, 150000, date '2026-11-10')$q$,
  current_setting('t.h1')), true);
do $$
declare g int; a bigint;
begin
  select count(*), coalesce(sum(ga.amount_cents), 0) into g, a from public.goals gl left join public.goal_allocations ga on ga.goal_id = gl.id
  where gl.name = 'Hajj d''Idris';
  insert into _r10 values ('objectif et affectation présents ensemble', g = 1 and a = 150000, g || ' objectif, ' || a || ' affectés');
end $$;

select pg_temp.expect('épargne initiale > cible refusée', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Objectif incohérent', 1000, date '2028-05-01', 0, 5000, date '2026-11-10')$q$,
  current_setting('t.h1')), false);
select pg_temp.expect('objectif dans le foyer d''autrui refusé', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Intrusion', 1000, date '2028-05-01', 0, 500, date '2026-11-10')$q$,
  current_setting('t.h3')), false);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.goals where name in ('Objectif incohérent', 'Intrusion');
  insert into _r10 values ('aucun objectif partiel après échec', n = 0, n || ' objectif(s) orphelin(s)');
end $$;

-- Échec en cours de transaction : l'affectation échoue → l'objectif est annulé aussi
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect('date d''affectation invalide : tout est annulé', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj annulé', 900000, date '2028-05-01', 0, 1000, null)$q$,
  current_setting('t.h1')), false);
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.goals where name = 'Hajj annulé';
  insert into _r10 values ('rollback complet de l''objectif', n = 0, n || ' objectif(s)');
end $$;

-- Profil atomique
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select pg_temp.expect('profil + foyer en une transaction (membre)', format($q$select public.save_profile(%L, 'Idris', 'Foyer partagé', 'BRU')$q$, current_setting('t.h1')), true);
select pg_temp.expect('profil refusé si le foyer n''est pas le sien : rien n''est modifié', format($q$select public.save_profile(%L, 'Pirate', 'X', null)$q$, current_setting('t.h3')), false);
reset role;
do $$
declare dn text;
begin
  select display_name into dn from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  insert into _r10 values ('profil inchangé après échec', dn = 'Idris', coalesce(dn, 'null'));
  insert into _r10 values ('un membre ne renomme pas le foyer',
    (select name from public.households where id = current_setting('t.h1')::uuid) = 'Mon foyer', 'nom du foyer');
end $$;

-- ---------------------------------------------------------------------------
-- Données de Hana dans le foyer, puis suppression de son compte
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
insert into public.consents (user_id, kind, granted, document_version, document_hash) values (auth.uid(), 'terms', true, 'v', repeat('c', 64));
insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result, zakatable_cents, zakat_due_cents, status, pending_reasons)
values (current_setting('t.h1')::uuid, 'amanah-zakat', '1.0.0', 't', date '2026-11-10', '{}', '{}', 1, 0, 'to_determine', '{hawl_start_unknown}');
reset role;
-- Calcul d'Idris (autre membre), qui doit survivre à la suppression du compte de Hana
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result, zakatable_cents, zakat_due_cents, status, pending_reasons)
values (current_setting('t.h1')::uuid, 'amanah-zakat', '1.0.0', 't', date '2026-11-10', '{}', '{}', 2, 0, 'to_determine', '{hawl_start_unknown}');
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select public.delete_my_account();
reset role;

do $$
declare n int; owner_role text; creator uuid;
begin
  select count(*) into n from public.households where id = current_setting('t.h1')::uuid;
  insert into _r10 values ('foyer partagé conservé', n = 1, n || ' foyer');
  select count(*) into n from public.goals where household_id = current_setting('t.h1')::uuid;
  insert into _r10 values ('données des autres membres conservées', n = 1, n || ' objectif(s)');
  select role into owner_role from public.household_members where household_id = current_setting('t.h1')::uuid and user_id = '00000000-0000-0000-0000-0000000000b2';
  insert into _r10 values ('le membre restant devient propriétaire', owner_role = 'owner', coalesce(owner_role, 'aucun'));
  select created_by into creator from public.households where id = current_setting('t.h1')::uuid;
  insert into _r10 values ('créateur du foyer transféré', creator = '00000000-0000-0000-0000-0000000000b2', coalesce(creator::text, 'null'));
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-0000000000b1';
  insert into _r10 values ('profil de la personne supprimé', n = 0, n || '');
  select count(*) into n from public.consents where user_id = '00000000-0000-0000-0000-0000000000b1';
  insert into _r10 values ('consentements de la personne supprimés', n = 0, n || '');
  select count(*) into n from public.audit_log where actor_id = '00000000-0000-0000-0000-0000000000b1';
  insert into _r10 values ('journal : auteur anonymisé', n = 0, n || ' trace(s) nominative(s)');
  select count(*) into n from public.zakat_calculations where owner_id = '00000000-0000-0000-0000-0000000000b1' or created_by = '00000000-0000-0000-0000-0000000000b1';
  insert into _r10 values ('calcul de Zakat de la personne effacé (article 9, Sprint 2)', n = 0, n || ' calcul(s)');
  select count(*) into n from public.zakat_calculations where owner_id = '00000000-0000-0000-0000-0000000000b2';
  insert into _r10 values ('calcul de Zakat de l''autre membre conservé', n = 1, n || ' calcul(s)');
end $$;

-- Le calcul figé reste non modifiable autrement que par anonymisation
do $$
begin
  begin
    update public.zakat_calculations set zakat_due_cents = 1 where household_id = current_setting('t.h1')::uuid;
    insert into _r10 values ('calcul figé toujours non modifiable', false, 'modification acceptée');
  exception when insufficient_privilege then
    insert into _r10 values ('calcul figé toujours non modifiable', true, 'refusé');
  end;
  begin
    update public.audit_log set action = 'x' where household_id = current_setting('t.h1')::uuid;
    insert into _r10 values ('journal toujours en ajout seul', false, 'modification acceptée');
  exception when insufficient_privilege then
    insert into _r10 values ('journal toujours en ajout seul', true, 'refusé');
  end;
end $$;

-- Le dernier membre supprime son compte : le foyer est alors effacé
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b2';
select public.delete_my_account();
reset role;
do $$
declare n int;
begin
  select (select count(*) from public.households where id = current_setting('t.h1')::uuid)
       + (select count(*) from public.goals where household_id = current_setting('t.h1')::uuid)
       + (select count(*) from public.audit_log where household_id = current_setting('t.h1')::uuid) into n;
  insert into _r10 values ('dernier membre : foyer et données effacés', n = 0, n || ' ligne(s)');
  select count(*) into n from public.households where id = current_setting('t.h3')::uuid;
  insert into _r10 values ('foyer d''un tiers intact', n = 1, n || '');
end $$;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _r10 loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) d''intégrité en échec', failures; end if;
end $$;
