-- =============================================================================
-- Tests d'intégrité des données de conformité (purification, Zakat).
-- Utilisateur fictif : Elias (E). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _r (check_name text, ok boolean, detail text);
grant all on _r to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000e', 'elias@example.test');
select set_config('t.he', (select id::text from public.households where created_by = '00000000-0000-0000-0000-00000000000e'), false);

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _r values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then
      insert into _r values (name, false, 'erreur de test : ' || sqlerrm);
    else
      insert into _r values (name, not should_pass, sqlstate || ' ' || sqlerrm);
    end if;
  end;
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';

-- Purification
select pg_temp.expect('purification détectée sans base ni montant', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, withholding_tax_cents, occurred_on)
  values (%L, 'bank_interest', 7000, 3000, date '2026-10-31')$q$, current_setting('t.he')), true);
select pg_temp.expect('incohérence brut ≠ net + précompte refusée', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, gross_cents, withholding_tax_cents, occurred_on)
  values (%L, 'bank_interest', 7000, 10000, 1000, date '2026-10-31')$q$, current_setting('t.he')), false);
select pg_temp.expect('brut inférieur au net refusé', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, gross_cents, occurred_on)
  values (%L, 'bank_interest', 7000, 6000, date '2026-10-31')$q$, current_setting('t.he')), false);
select pg_temp.expect('base brute sans montant brut refusée', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, basis, basis_source, amount_to_purify_cents, occurred_on)
  values (%L, 'bank_interest', 7000, 'gross', 'user_choice', 7000, date '2026-10-31')$q$, current_setting('t.he')), false);
select pg_temp.expect('montant à purifier différent de la base refusé', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, basis, basis_source, amount_to_purify_cents, occurred_on)
  values (%L, 'bank_interest', 7000, 'net_credited', 'user_choice', 5000, date '2026-10-31')$q$, current_setting('t.he')), false);
select pg_temp.expect('base nette choisie par l''utilisateur acceptée', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, basis, basis_source, amount_to_purify_cents, occurred_on, status)
  values (%L, 'bank_interest', 7000, 'net_credited', 'user_choice', 7000, date '2026-10-31', 'confirmed')$q$, current_setting('t.he')), true);
select pg_temp.expect('base brute avec précompte connu acceptée', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, gross_cents, withholding_tax_cents, basis, basis_source, amount_to_purify_cents, occurred_on)
  values (%L, 'bank_interest', 7000, 10000, 3000, 'gross', 'user_choice', 10000, date '2026-10-31')$q$, current_setting('t.he')), true);
select pg_temp.expect('« purifié » sans montant déterminé refusé', format($q$
  insert into public.purification_items (household_id, source_kind, credited_cents, occurred_on, status)
  values (%L, 'bank_interest', 7000, date '2026-10-31', 'purified')$q$, current_setting('t.he')), false);

-- Zakat
select pg_temp.expect('Zakat « à déterminer » sans raison refusée', format($q$
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result,
    zakatable_cents, zakat_due_cents, status) values (%L, 'amanah-zakat', '1.0.0', 't', date '2026-11-09', '{}', '{}', 100, 0, 'to_determine')$q$,
  current_setting('t.he')), false);
select pg_temp.expect('montant dû hors statut « exigible » refusé', format($q$
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result,
    zakatable_cents, zakat_due_cents, status, pending_reasons) values (%L, 'amanah-zakat', '1.0.0', 't', date '2026-11-09', '{}', '{}', 100, 50, 'to_determine', '{hawl_start_unknown}')$q$,
  current_setting('t.he')), false);
select pg_temp.expect('Zakat « à déterminer » avec raisons et nisab inconnu acceptée', format($q$
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result,
    zakatable_cents, zakat_due_cents, status, pending_reasons) values (%L, 'amanah-zakat', '1.0.0', 't', date '2026-11-09', '{}', '{}', 100, 0, 'to_determine', '{nisab_basis_not_chosen}')$q$,
  current_setting('t.he')), true);

-- L'auteur d'une décision de purification est imposé par le serveur
do $$
declare v uuid;
begin
  update public.purification_items set status = 'rejected', decided_by = '00000000-0000-0000-0000-00000000000a'
  where household_id = current_setting('t.he')::uuid and basis is null and status = 'detected'
  returning decided_by into v;
  insert into _r values ('décision de purification non usurpable', v = auth.uid(), coalesce(v::text, 'null'));
end $$;

reset role;
do $$
declare r record; failures int := 0;
begin
  for r in select * from _r loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) d''intégrité en échec', failures; end if;
end $$;
