-- =============================================================================
-- Sprint 2, lot 0 : consentement article 9 par fonction, données religieuses privées.
-- Utilisateurs fictifs : Karim (K, propriétaire du foyer), Lina (L, membre du même
-- foyer), Malik (M, autre foyer). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _rc (check_name text, ok boolean, detail text);
grant all on _rc to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'karim@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'lina@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'malik@example.test');
select set_config('t.hk', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000c1'), false);
select set_config('t.hm', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000c3'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000c2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hk')::uuid, '00000000-0000-0000-0000-0000000000c2', 'member');
-- Conditions et information acceptées par tous ; AUCUN consentement article 9 au départ
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select u.id, k.kind::public.consent_kind, true, 'test', repeat('a', 64)
from auth.users u cross join (values ('terms'), ('privacy')) k(kind)
where u.id in ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3');
insert into public.accounts (household_id, name) values (current_setting('t.hk')::uuid, 'Compte commun fictif');
select set_config('t.acc', (select id::text from public.accounts where household_id = current_setting('t.hk')::uuid), false);
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash, is_interest)
values (current_setting('t.hk')::uuid, current_setting('t.acc')::uuid, date '2026-10-31', 1234, 'INTERETS CREDITEURS', 'csv', 'k-int-1', true);
select set_config('t.tx', (select id::text from public.transactions where dedupe_hash = 'k-int-1'), false);

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _rc values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _rc values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _rc values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.count_as(sql text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || sql || ') x' into n; return n; end $$;
create or replace function pg_temp.check_count(name text, sql text, expected bigint) returns void language plpgsql as $$
declare n bigint;
begin
  n := pg_temp.count_as(sql);
  insert into _rc values (name, n = expected, n || ' ligne(s), attendu ' || expected);
end $$;
grant execute on function pg_temp.expect(text, text, boolean), pg_temp.count_as(text), pg_temp.check_count(text, text, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Sans consentement article 9 : fonctions générales ouvertes, religieuses fermées
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';

select pg_temp.expect('sans art. 9 : opération du budget acceptée', format($q$
  insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash)
  values (%L, %L, date '2026-11-02', -4250, 'Courses fictives', 'manual', 'k-man-1')$q$, current_setting('t.hk'), current_setting('t.acc')), true);
select pg_temp.expect('sans art. 9 : budget mensuel accepté', format($q$
  insert into public.budgets (household_id, month, category_slug, limit_cents) values (%L, date '2026-11-01', 'alimentation', 40000)$q$,
  current_setting('t.hk')), true);
select pg_temp.expect('sans art. 9 : objectif non religieux accepté', format($q$
  insert into public.goals (household_id, kind, name, target_cents, target_date) values (%L, 'emergency_fund', 'Réserve', 300000, date '2027-12-31')$q$,
  current_setting('t.hk')), true);
select pg_temp.expect('sans art. 9 : objectif Hajj refusé', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj', 900000, date '2028-05-01', 40000, 0, date '2026-11-10')$q$,
  current_setting('t.hk')), false);
select pg_temp.expect('sans art. 9 : élément de purification refusé', format($q$
  insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on)
  values (%L, %L, 'bank_interest', 1234, date '2026-10-31')$q$, current_setting('t.hk'), current_setting('t.tx')), false);
select pg_temp.expect('sans art. 9 : contribution refusée', format($q$
  insert into public.contributions (household_id, kind, amount_cents, paid_on) values (%L, 'sadaqah', 1000, date '2026-11-01')$q$,
  current_setting('t.hk')), false);
select pg_temp.expect('sans art. 9 : réglages Zakat refusés', format($q$
  insert into public.zakat_settings (household_id, ruleset_id, ruleset_version) values (%L, 'amanah-zakat', '1.0.0')$q$,
  current_setting('t.hk')), false);
select pg_temp.expect('sans art. 9 : préférences religieuses refusées', $q$
  insert into public.religious_preferences (user_id, share_with_household) values (auth.uid(), true)$q$, false);

-- ---------------------------------------------------------------------------
-- 2. Karim consent : ses données religieuses, propriétaire imposé
-- ---------------------------------------------------------------------------
insert into public.consents (user_id, kind, granted, document_version, document_hash)
values (auth.uid(), 'special_category', true, 'test', repeat('b', 64));

select pg_temp.expect('avec art. 9 : objectif Hajj et épargne initiale acceptés', format($q$
  select public.create_goal_with_allocation(%L, 'hajj', 'Hajj de Karim', 900000, date '2028-05-01', 40000, 150000, date '2026-11-10')$q$,
  current_setting('t.hk')), true);
select pg_temp.expect('avec art. 9 : purification acceptée, propriétaire usurpé ignoré', format($q$
  insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on, owner_id)
  values (%L, %L, 'bank_interest', 1234, date '2026-10-31', '00000000-0000-0000-0000-0000000000c2')$q$, current_setting('t.hk'), current_setting('t.tx')), true);
select pg_temp.expect('avec art. 9 : contribution acceptée', format($q$
  insert into public.contributions (household_id, kind, amount_cents, paid_on, beneficiary_label) values (%L, 'sadaqah', 1000, date '2026-11-01', 'Association fictive')$q$,
  current_setting('t.hk')), true);
select pg_temp.expect('avec art. 9 : préférences acceptées (privées par défaut)', $q$
  insert into public.religious_preferences (user_id, purification_basis) values (auth.uid(), 'net_credited')$q$, true);
select pg_temp.expect('changement de propriétaire refusé', $q$
  update public.purification_items set owner_id = '00000000-0000-0000-0000-0000000000c2'$q$, false);
select pg_temp.expect('objectif Hajj transformé en objectif commun refusé', $q$
  update public.goals set kind = 'personal' where owner_id is not null$q$, false);
reset role;

do $$
declare o uuid; p boolean;
begin
  select owner_id into o from public.purification_items where transaction_id = current_setting('t.tx')::uuid;
  insert into _rc values ('propriétaire de la purification = auteur', o = '00000000-0000-0000-0000-0000000000c1', coalesce(o::text, 'null'));
  select share_with_household into p from public.religious_preferences where user_id = '00000000-0000-0000-0000-0000000000c1';
  insert into _rc values ('partage avec le foyer désactivé par défaut', p = false, coalesce(p::text, 'null'));
  insert into _rc values ('journal : aucune valeur religieuse copiée',
    not exists (select 1 from public.audit_log where public.is_religious_entity(entity) and payload <> '{}'::jsonb), 'payload');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Lina, membre du même foyer
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check_count('Lina sans art. 9 : budget commun visible', 'select 1 from public.transactions', 2);
select pg_temp.check_count('Lina sans art. 9 : objectif commun visible', 'select 1 from public.goals where owner_id is null', 1);
select pg_temp.check_count('Lina sans art. 9 : Hajj de Karim invisible', 'select 1 from public.goals where owner_id is not null', 0);
select pg_temp.check_count('Lina sans art. 9 : affectations du Hajj invisibles', 'select 1 from public.goal_allocations', 0);
select pg_temp.check_count('Lina sans art. 9 : purification invisible', 'select 1 from public.purification_items', 0);
select pg_temp.check_count('Lina : journal religieux de Karim invisible',
  'select 1 from public.audit_log where public.is_religious_entity(entity)', 0);

insert into public.consents (user_id, kind, granted, document_version, document_hash)
values (auth.uid(), 'special_category', true, 'test', repeat('d', 64));
select pg_temp.check_count('Lina avec art. 9 : données de Karim privées par défaut',
  'select 1 from public.purification_items union all select 1 from public.contributions union all select 1 from public.goals where owner_id is not null', 0);
select pg_temp.expect('Lina : affectation sur le Hajj de Karim refusée', format($q$
  insert into public.goal_allocations (household_id, goal_id, amount_cents)
  select %L, id, 100 from public.goals where name = 'Hajj de Karim'$q$, current_setting('t.hk')), true);  -- invisible : 0 ligne insérée
reset role;
select pg_temp.check_count('aucune affectation insérée par Lina', $q$select 1 from public.goal_allocations ga join public.goals g on g.id = ga.goal_id
  where g.name = 'Hajj de Karim' and ga.amount_cents = 100$q$, 0);
do $$
declare gid uuid;
begin
  select id into gid from public.goals where name = 'Hajj de Karim';
  perform set_config('t.goal_k', gid::text, false);
end $$;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.expect('Lina : affectation directe sur l''objectif de Karim refusée', format($q$
  insert into public.goal_allocations (household_id, goal_id, amount_cents) values (%L, %L, 100)$q$,
  current_setting('t.hk'), current_setting('t.goal_k')), false);

-- Karim choisit de partager
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
update public.religious_preferences set share_with_household = true where user_id = auth.uid();
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select pg_temp.check_count('partage choisi : Lina voit le Hajj de Karim', 'select 1 from public.goals where owner_id is not null', 1);
select pg_temp.check_count('partage choisi : Lina voit la purification de Karim', 'select 1 from public.purification_items', 1);
select pg_temp.check_count('partage choisi : Lina voit les affectations du Hajj', 'select 1 from public.goal_allocations', 1);
select pg_temp.check_count('partage : Lina ne lit pas les préférences de Karim', 'select 1 from public.religious_preferences', 0);
select pg_temp.expect('partage : Lina ne modifie pas la purification de Karim', $q$
  do $d$ declare n int; begin
    update public.purification_items set status = 'rejected'; get diagnostics n = row_count;
    if n > 0 then raise exception 'modifié'; end if; end $d$$q$, true);
select pg_temp.expect('partage : Lina ne supprime pas le Hajj de Karim', $q$
  do $d$ declare n int; begin
    delete from public.goals where owner_id is not null; get diagnostics n = row_count;
    if n > 0 then raise exception 'supprimé'; end if; end $d$$q$, true);
select pg_temp.expect('Lina : contribution au nom de Karim impossible (propriétaire imposé)', format($q$
  insert into public.contributions (household_id, kind, amount_cents, paid_on, owner_id) values (%L, 'sadaqah', 1, date '2026-11-01', '00000000-0000-0000-0000-0000000000c1')$q$,
  current_setting('t.hk')), true);
reset role;
select pg_temp.check_count('la contribution de Lina lui appartient',
  $q$select 1 from public.contributions where amount_cents = 1 and owner_id = '00000000-0000-0000-0000-0000000000c2'$q$, 1);

-- Lina retire son consentement : elle ne voit plus rien, même partagé
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select public.withdraw_religious_consent('test', false);
select pg_temp.check_count('Lina après retrait : données partagées invisibles',
  'select 1 from public.purification_items union all select 1 from public.goals where owner_id is not null', 0);
select pg_temp.check_count('Lina après retrait : budget toujours accessible', 'select 1 from public.transactions', 2);

-- ---------------------------------------------------------------------------
-- 4. Malik, autre foyer, avec consentement : rien de visible
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c3';
insert into public.consents (user_id, kind, granted, document_version, document_hash)
values (auth.uid(), 'special_category', true, 'test', repeat('e', 64));
select pg_temp.check_count('autre foyer : aucune donnée religieuse visible',
  'select 1 from public.purification_items union all select 1 from public.contributions union all select 1 from public.goals union all select 1 from public.goal_allocations', 0);
select pg_temp.expect('autre foyer : purification sur la transaction de Karim refusée', format($q$
  insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on)
  values (%L, %L, 'bank_interest', 1, date '2026-10-31')$q$, current_setting('t.hm'), current_setting('t.tx')), false);
select pg_temp.expect('autre foyer : écriture dans le foyer de Karim refusée', format($q$
  insert into public.contributions (household_id, kind, amount_cents, paid_on) values (%L, 'sadaqah', 1, date '2026-11-01')$q$,
  current_setting('t.hk')), false);

-- ---------------------------------------------------------------------------
-- 5. Karim retire son consentement en conservant ses données, puis consent à nouveau
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.withdraw_religious_consent('test', false);
select pg_temp.check_count('Karim après retrait : ses données sont inaccessibles',
  'select 1 from public.purification_items union all select 1 from public.goals where owner_id is not null union all select 1 from public.contributions', 0);
select pg_temp.check_count('Karim après retrait : budget accessible', 'select 1 from public.transactions', 2);
select pg_temp.expect('Karim après retrait : écriture religieuse refusée', format($q$
  insert into public.contributions (household_id, kind, amount_cents, paid_on) values (%L, 'sadaqah', 1, date '2026-11-01')$q$,
  current_setting('t.hk')), false);
reset role;
select pg_temp.check_count('données conservées après retrait sans effacement',
  $q$select 1 from public.purification_items where owner_id = '00000000-0000-0000-0000-0000000000c1'$q$, 1);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
insert into public.consents (user_id, kind, granted, document_version, document_hash)
values (auth.uid(), 'special_category', true, 'test', repeat('f', 64));
select pg_temp.check_count('nouveau consentement : données retrouvées', 'select 1 from public.purification_items', 1);

-- ---------------------------------------------------------------------------
-- 6. Retrait avec effacement : uniquement les données de Karim
-- ---------------------------------------------------------------------------
select public.withdraw_religious_consent('test', true);
reset role;
do $$
declare n int;
begin
  select (select count(*) from public.purification_items where owner_id = '00000000-0000-0000-0000-0000000000c1')
       + (select count(*) from public.contributions where owner_id = '00000000-0000-0000-0000-0000000000c1')
       + (select count(*) from public.goals where owner_id = '00000000-0000-0000-0000-0000000000c1')
       + (select count(*) from public.religious_preferences where user_id = '00000000-0000-0000-0000-0000000000c1') into n;
  insert into _rc values ('effacement : données religieuses de Karim supprimées', n = 0, n || ' ligne(s)');
  select count(*) into n from public.contributions where owner_id = '00000000-0000-0000-0000-0000000000c2';
  insert into _rc values ('effacement : données de Lina intactes', n = 1, n || '');
  select count(*) into n from public.goals where household_id = current_setting('t.hk')::uuid and owner_id is null;
  insert into _rc values ('effacement : objectif commun intact', n = 1, n || '');
  select count(*) into n from public.transactions where household_id = current_setting('t.hk')::uuid;
  insert into _rc values ('effacement : opérations bancaires intactes', n = 2, n || '');
  select count(*) into n from public.consents where user_id = '00000000-0000-0000-0000-0000000000c1' and kind = 'special_category';
  insert into _rc values ('historique des consentements conservé', n = 4, n || ' ligne(s)');
end $$;

-- Fonctions réservées : un client anonyme ne peut rien appeler
set role anon;
select pg_temp.expect('anonyme : effacement impossible', $q$select public.erase_my_religious_data()$q$, false);
select pg_temp.expect('anonyme : lecture des préférences impossible', $q$select * from public.religious_preferences$q$, false);
reset role;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _rc loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) de consentement en échec', failures; end if;
end $$;
