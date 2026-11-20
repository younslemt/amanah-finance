-- =============================================================================
-- Sprint 3 : nature des catégories, scénarios, plafonds appliqués, séries écartées,
-- décisions sur les recommandations. Utilisateurs fictifs : Sami (propriétaire),
-- Tina (membre du même foyer), Ugo (autre foyer).
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _rf (check_name text, ok boolean, detail text);
grant all on _rf to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'sami@example.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'tina@example.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'ugo@example.test');
select set_config('t.hs', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000e1'), false);
select set_config('t.hu', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000e3'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000e2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hs')::uuid, '00000000-0000-0000-0000-0000000000e2', 'member');
insert into public.accounts (household_id, name) values (current_setting('t.hs')::uuid, 'Compte fictif de Sami');
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash, category_slug)
select current_setting('t.hs')::uuid, a.id, date '2026-10-08', -9000, 'SUPERMARCHE FICTIF', 'manual', 's-1', 'alimentation'
from public.accounts a where a.household_id = current_setting('t.hs')::uuid;
insert into public.accounts (household_id, name, type) values (current_setting('t.hs')::uuid, 'Épargne fictive de Sami', 'savings');
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash)
select current_setting('t.hs')::uuid, a.id, date '2026-10-09', 9000, 'VERSEMENT RECU', 'manual', 's-2'
from public.accounts a where a.name = 'Épargne fictive de Sami';
select set_config('t.d1', (select id::text from public.transactions where dedupe_hash = 's-1'), false);
select set_config('t.c1', (select id::text from public.transactions where dedupe_hash = 's-2'), false);

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _rf values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _rf values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _rf values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _rf values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _rf values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

select pg_temp.check_val('référentiel : logement fixe, alimentation variable',
  $q$select string_agg(slug || '=' || default_nature, ',' order by slug) from public.categories where household_id is null and slug in ('logement', 'alimentation')$q$,
  'alimentation=variable,logement=fixed');
select pg_temp.check_val('référentiel : aucune catégorie de dépense sans nature',
  $q$select count(*)::text from public.categories where household_id is null and kind = 'expense' and default_nature is null$q$, '0');

-- ---------------------------------------------------------------------------
-- Sami
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select pg_temp.expect('nature choisie par le foyer', format($q$
  insert into public.household_category_settings (household_id, category_slug, nature) values (%L, 'restaurants', 'fixed')$q$, current_setting('t.hs')), true);
select pg_temp.expect('nature d''une catégorie inconnue refusée', format($q$
  insert into public.household_category_settings (household_id, category_slug, nature) values (%L, 'inconnue', 'fixed')$q$, current_setting('t.hs')), false);
select pg_temp.expect('scénario enregistré', format($q$
  insert into public.budget_scenarios (household_id, name, adjustments, baseline)
  values (%L, 'Moins de restaurants', '[{"type":"category","categorySlug":"restaurants","monthlyCents":5000}]', '{"createdOn":"2026-11-20"}')$q$,
  current_setting('t.hs')), true);
select set_config('t.sc', (select id::text from public.budget_scenarios limit 1), false);
select pg_temp.expect('scénario vide refusé', format($q$
  insert into public.budget_scenarios (household_id, name, adjustments, baseline) values (%L, 'Vide', '[]', '{}')$q$, current_setting('t.hs')), false);
select pg_temp.expect('contenu d''un scénario non modifiable', format($q$
  update public.budget_scenarios set name = 'Autre' where id = %L$q$, current_setting('t.sc')), false);

select pg_temp.check_val('plafonds appliqués explicitement (2 lignes)', format($q$
  select public.apply_budget_lines(%L, date '2026-11-01', '[{"category_slug":"restaurants","limit_cents":15000},{"category_slug":"alimentation","limit_cents":40000}]'::jsonb, %L)::text$q$,
  current_setting('t.hs'), current_setting('t.sc')), '2');
select pg_temp.check_val('scénario marqué appliqué au mois choisi',
  $q$select applied_month::text from public.budget_scenarios$q$, '2026-11-01');
select pg_temp.check_val('réapplication : une ligne mise à jour', format($q$
  select public.apply_budget_lines(%L, date '2026-11-01', '[{"category_slug":"restaurants","limit_cents":12000}]'::jsonb)::text$q$, current_setting('t.hs')), '1');
select pg_temp.check_val('réapplication : plafond remplacé, pas de doublon',
  $q$select count(*) || '/' || max(limit_cents) from public.budgets where category_slug = 'restaurants'$q$, '1/12000');
select pg_temp.expect('plafond sur une catégorie de revenu refusé', format($q$
  select public.apply_budget_lines(%L, date '2026-11-01', '[{"category_slug":"loisirs","limit_cents":1},{"category_slug":"salaire","limit_cents":1}]'::jsonb)$q$,
  current_setting('t.hs')), false);
select pg_temp.check_val('échec : aucun plafond partiel écrit',
  $q$select count(*)::text from public.budgets where category_slug = 'loisirs'$q$, '0');
select pg_temp.expect('plafond négatif refusé', format($q$
  select public.apply_budget_lines(%L, date '2026-11-01', '[{"category_slug":"loisirs","limit_cents":-1}]'::jsonb)$q$, current_setting('t.hs')), false);
select pg_temp.expect('mois invalide refusé', format($q$
  select public.apply_budget_lines(%L, date '2026-11-15', '[{"category_slug":"loisirs","limit_cents":1}]'::jsonb)$q$, current_setting('t.hs')), false);
select pg_temp.check_val('opérations bancaires jamais modifiées',
  $q$select count(*) || '/' || sum(amount_cents) from public.transactions$q$, '2/0');
select pg_temp.expect('virement incertain confirmé par le foyer', format($q$
  insert into public.transfer_decisions (household_id, debit_id, credit_id, verdict) values (%L, %L, %L, 'confirmed')$q$,
  current_setting('t.hs'), current_setting('t.d1'), current_setting('t.c1')), true);
select pg_temp.expect('décision de virement : verdict inconnu refusé', format($q$
  insert into public.transfer_decisions (household_id, debit_id, credit_id, verdict) values (%L, %L, %L, 'peut-être')$q$,
  current_setting('t.hs'), current_setting('t.c1'), current_setting('t.d1')), false);

select pg_temp.expect('série écartée par le foyer', format($q$
  insert into public.recurring_feedback (household_id, series_key) values (%L, 'D:STREAMING FICTIF')$q$, current_setting('t.hs')), true);
select pg_temp.expect('recommandation écartée (personnelle)', format($q$
  insert into public.recommendation_feedback (household_id, fingerprint, status) values (%L, 'R6:D:STREAMING FICTIF', 'dismissed')$q$, current_setting('t.hs')), true);
select pg_temp.expect('report sans date refusé', format($q$
  insert into public.recommendation_feedback (household_id, fingerprint, status) values (%L, 'R2:1:3', 'snoozed')$q$, current_setting('t.hs')), false);
select pg_temp.expect('décision au nom d''un autre membre refusée', format($q$
  insert into public.recommendation_feedback (household_id, user_id, fingerprint, status)
  values (%L, '00000000-0000-0000-0000-0000000000e2', 'R5:x:1', 'done')$q$, current_setting('t.hs')), false);
select pg_temp.expect('réserve : compte marqué par l''utilisateur',
  $q$update public.accounts set counts_as_reserve = true$q$, true);

-- ---------------------------------------------------------------------------
-- Tina, membre du même foyer
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.check_val('Tina : scénarios, natures, séries et virements du foyer visibles',
  $q$select (select count(*) from public.budget_scenarios) || '/' || (select count(*) from public.household_category_settings) || '/' || (select count(*) from public.recurring_feedback) || '/' || (select count(*) from public.transfer_decisions)$q$, '1/1/1/1');
select pg_temp.check_val('Tina : décisions de Sami invisibles',
  $q$select count(*)::text from public.recommendation_feedback$q$, '0');
select pg_temp.expect('Tina : décision personnelle', format($q$
  insert into public.recommendation_feedback (household_id, fingerprint, status, snooze_until) values (%L, 'R2:1:3', 'snoozed', date '2026-12-20')$q$,
  current_setting('t.hs')), true);
select pg_temp.expect('Tina : modifier la décision de Sami sans effet', $q$
  do $d$ declare n int; begin update public.recommendation_feedback set status = 'done' where user_id = '00000000-0000-0000-0000-0000000000e1';
  get diagnostics n = row_count; if n > 0 then raise exception 'modifié'; end if; end $d$$q$, true);

-- ---------------------------------------------------------------------------
-- Ugo, autre foyer
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e3';
select pg_temp.check_val('autre foyer : rien de visible',
  $q$select ((select count(*) from public.budget_scenarios) + (select count(*) from public.household_category_settings)
     + (select count(*) from public.recurring_feedback) + (select count(*) from public.recommendation_feedback))::text$q$, '0');
select pg_temp.expect('autre foyer : plafonds chez Sami refusés', format($q$
  select public.apply_budget_lines(%L, date '2026-11-01', '[{"category_slug":"loisirs","limit_cents":1}]'::jsonb)$q$, current_setting('t.hs')), false);
select pg_temp.expect('autre foyer : marquer le scénario de Sami via son propre foyer refusé', format($q$
  select public.apply_budget_lines(%L, date '2026-11-01', '[{"category_slug":"loisirs","limit_cents":1}]'::jsonb, %L)$q$,
  current_setting('t.hu'), current_setting('t.sc')), false);
select pg_temp.check_val('échec : aucun plafond écrit chez Ugo',
  $q$select count(*)::text from public.budgets$q$, '0');
select pg_temp.check_val('autre foyer : décisions de virement invisibles',
  $q$select count(*)::text from public.transfer_decisions$q$, '0');
select pg_temp.expect('autre foyer : décision sur les opérations de Sami via son propre foyer refusée', format($q$
  insert into public.transfer_decisions (household_id, debit_id, credit_id, verdict) values (%L, %L, %L, 'rejected')$q$,
  current_setting('t.hu'), current_setting('t.d1'), current_setting('t.c1')), false);
select pg_temp.expect('autre foyer : scénario chez Sami refusé', format($q$
  insert into public.budget_scenarios (household_id, name, adjustments, baseline) values (%L, 'x', '[{"type":"total","monthlyCents":1}]', '{}')$q$,
  current_setting('t.hs')), false);
set role anon;
select pg_temp.expect('anonyme : scénarios illisibles', $q$select * from public.budget_scenarios$q$, false);
reset role;

-- Suppression du compte de Tina : ses décisions disparaissent, le foyer garde ses données
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e2';
select public.delete_my_account();
reset role;
select pg_temp.check_val('suppression d''un compte : ses décisions effacées, celles de Sami conservées',
  $q$select string_agg(user_id::text, ',') from public.recommendation_feedback$q$, '00000000-0000-0000-0000-0000000000e1');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _rf loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) d''analyse financière en échec', failures; end if;
end $$;
