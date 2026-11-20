-- =============================================================================
-- Tests Sprint 1 : consentements, profil, catégories, budgets, objectifs,
-- suppression du compte. Utilisateurs fictifs : Farah (F) et Ghali (G).
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _s1 (check_name text, ok boolean, detail text);
grant all on _s1 to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'farah@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'ghali@example.test');
select set_config('t.hf', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000f1'), false);
select set_config('t.hg', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000f2'), false);

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _s1 values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then
      insert into _s1 values (name, false, 'erreur de test : ' || sqlerrm);
    else
      insert into _s1 values (name, not should_pass, sqlstate || ' ' || sqlerrm);
    end if;
  end;
end $$;

-- Ghali crée une catégorie personnelle (pour tester qu'elle reste privée)
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.expect('catégorie personnelle avec libellé acceptée', format(
  $q$insert into public.categories (household_id, slug, kind, label) values (%L, 'perso-zakat-al-fitr', 'expense', 'Zakat al-Fitr')$q$,
  current_setting('t.hg')), true);

-- ---------------------------------------------------------------------------
-- En tant que Farah
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';

-- Consentements
select pg_temp.expect('consentement accordé avec empreinte du texte', $q$
  insert into public.consents (user_id, kind, granted, document_version, document_hash)
  values (auth.uid(), 'terms', true, '2026-11-brouillon', repeat('a', 64))$q$, true);
select pg_temp.expect('consentement accordé sans empreinte refusé', $q$
  insert into public.consents (user_id, kind, granted, document_version)
  values (auth.uid(), 'special_category', true, '2026-11-brouillon')$q$, false);
select pg_temp.expect('retrait de consentement (sans empreinte) accepté', $q$
  insert into public.consents (user_id, kind, granted, document_version)
  values (auth.uid(), 'special_category', false, '2026-11-brouillon')$q$, true);
select pg_temp.expect('consentement au nom d''un autre utilisateur refusé', $q$
  insert into public.consents (user_id, kind, granted, document_version, document_hash)
  values ('00000000-0000-0000-0000-0000000000f2', 'terms', true, 'x', repeat('b', 64))$q$, false);
select pg_temp.expect('modification d''un consentement passé refusée', $q$
  update public.consents set granted = false where user_id = auth.uid()$q$, false);

-- Profil
do $$
declare n int;
begin
  update public.profiles set display_name = 'Farah', profile_completed_at = now() where id = auth.uid();
  get diagnostics n = row_count;
  insert into _s1 values ('profil modifiable par son titulaire', n = 1, n || ' ligne');
  update public.profiles set display_name = 'Pirate' where id = '00000000-0000-0000-0000-0000000000f2';
  get diagnostics n = row_count;
  insert into _s1 values ('profil d''autrui non modifiable', n = 0, n || ' ligne');
end $$;
select pg_temp.expect('identifiant du profil non modifiable', $q$
  update public.profiles set id = '00000000-0000-0000-0000-0000000000f2' where id = auth.uid()$q$, false);

-- Foyer : nom et région modifiables
select pg_temp.expect('nom et région du foyer modifiables', format(
  $q$update public.households set name = 'Foyer F', region = 'BRU' where id = %L$q$, current_setting('t.hf')), true);

-- Catégories
select pg_temp.expect('catégorie personnelle sans libellé refusée', format(
  $q$insert into public.categories (household_id, slug, kind) values (%L, 'perso-voyage', 'expense')$q$, current_setting('t.hf')), false);
select pg_temp.expect('catégorie personnelle au code non préfixé refusée', format(
  $q$insert into public.categories (household_id, slug, kind, label) values (%L, 'loyer', 'expense', 'Loyer bis')$q$, current_setting('t.hf')), false);
do $$
declare n int;
begin
  update public.categories set label = 'x' where household_id is null and slug = 'logement';
  select count(*) into n from public.categories where household_id is null and label = 'x';
  insert into _s1 values ('catégorie système inchangée', n = 0, n || ' ligne(s) modifiée(s)');
  select count(*) into n from public.categories where slug = 'perso-zakat-al-fitr';
  insert into _s1 values ('catégorie personnelle d''autrui invisible', n = 0, n || ' visible(s)');
end $$;

-- Compte, transaction, budget, objectif
with a as (insert into public.accounts (household_id, name, type, opening_balance_cents)
  values (current_setting('t.hf')::uuid, 'Compte principal', 'current', 150000) returning id)
select set_config('t.acc_f', (select id::text from a), false);

select pg_temp.expect('dépense avec catégorie système acceptée', format(
  $q$insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, category_slug, source, dedupe_hash)
     values (%L, %L, date '2026-11-05', -4200, 'Courses', 'alimentation', 'manual', 'manual:1')$q$,
  current_setting('t.hf'), current_setting('t.acc_f')), true);
select pg_temp.expect('dépense avec la catégorie personnelle d''autrui refusée', format(
  $q$insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, category_slug, source, dedupe_hash)
     values (%L, %L, date '2026-11-05', -100, 'x', 'perso-zakat-al-fitr', 'manual', 'manual:2')$q$,
  current_setting('t.hf'), current_setting('t.acc_f')), false);
select pg_temp.expect('budget sur catégorie inconnue refusé', format(
  $q$insert into public.budgets (household_id, month, category_slug, limit_cents) values (%L, date '2026-11-01', 'inexistante', 1000)$q$,
  current_setting('t.hf')), false);
select pg_temp.expect('budget mensuel accepté', format(
  $q$insert into public.budgets (household_id, month, category_slug, limit_cents) values (%L, date '2026-11-01', 'alimentation', 45000)$q$,
  current_setting('t.hf')), true);
select pg_temp.expect('budget dans le foyer d''autrui refusé', format(
  $q$insert into public.budgets (household_id, month, category_slug, limit_cents) values (%L, date '2026-11-01', 'alimentation', 1)$q$,
  current_setting('t.hg')), false);
select pg_temp.expect('objectif Hajj refusé sans consentement article 9 (retiré plus haut)', format(
  $q$insert into public.goals (household_id, kind, name, target_cents, target_date)
     values (%L, 'hajj', 'Hajj', 900000, date '2028-05-01')$q$, current_setting('t.hf')), false);
select pg_temp.expect('consentement article 9 accordé à nouveau', $q$
  insert into public.consents (user_id, kind, granted, document_version, document_hash)
  values (auth.uid(), 'special_category', true, '2026-11-brouillon', repeat('c', 64))$q$, true);
select pg_temp.expect('objectif Hajj avec capacité mensuelle accepté', format(
  $q$insert into public.goals (household_id, kind, name, target_cents, target_date, monthly_capacity_cents)
     values (%L, 'hajj', 'Hajj', 900000, date '2028-05-01', 40000)$q$, current_setting('t.hf')), true);
select pg_temp.expect('capacité mensuelle négative refusée', format(
  $q$insert into public.goals (household_id, kind, name, target_cents, target_date, monthly_capacity_cents)
     values (%L, 'hajj', 'Hajj', 900000, date '2028-05-01', -1)$q$, current_setting('t.hf')), false);

-- Vue des soldes après saisie
do $$
declare b bigint;
begin
  select balance_cents into b from public.account_balances where account_id = current_setting('t.acc_f')::uuid;
  insert into _s1 values ('solde = ouverture + transactions', b = 145800, coalesce(b::text, 'null'));
end $$;

-- ---------------------------------------------------------------------------
-- Suppression du compte
-- ---------------------------------------------------------------------------
reset role;
set role anon;
reset request.jwt.claim.sub;
select pg_temp.expect('anon ne peut pas supprimer de compte', $q$select public.delete_my_account()$q$, false);
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect('suppression de son propre compte', $q$select public.delete_my_account()$q$, true);
reset role;
do $$
declare n int;
begin
  select (select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000f1')
       + (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000f1')
       + (select count(*) from public.consents where user_id = '00000000-0000-0000-0000-0000000000f1')
       + (select count(*) from public.households where id = current_setting('t.hf')::uuid)
       + (select count(*) from public.transactions where household_id = current_setting('t.hf')::uuid)
       + (select count(*) from public.goals where household_id = current_setting('t.hf')::uuid)
    into n;
  insert into _s1 values ('suppression : aucune donnée restante', n = 0, n || ' ligne(s)');
  select count(*) into n from auth.users where id = '00000000-0000-0000-0000-0000000000f2';
  insert into _s1 values ('suppression : l''autre utilisateur intact', n = 1, n || ' ligne');
end $$;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _s1 loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) Sprint 1 en échec', failures; end if;
end $$;
