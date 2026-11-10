-- =============================================================================
-- Sprint 2, lots 1 et 2 : import bancaire atomique et parcours de purification.
-- Utilisateurs fictifs : Nora (N, consentement art. 9), Rania (R, membre du foyer
-- de Nora, sans consentement), Omar (O, autre foyer, sans consentement). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _ri (check_name text, ok boolean, detail text);
grant all on _ri to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'nora@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'rania@example.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'omar@example.test');
select set_config('t.hn', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000d1'), false);
select set_config('t.ho', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000d3'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000d2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hn')::uuid, '00000000-0000-0000-0000-0000000000d2', 'member');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
values ('00000000-0000-0000-0000-0000000000d1', 'special_category', true, 'test', repeat('a', 64));
insert into public.accounts (household_id, name) values (current_setting('t.hn')::uuid, 'Compte de Nora'), (current_setting('t.ho')::uuid, 'Compte d''Omar');
select set_config('t.acc_n', (select id::text from public.accounts where name = 'Compte de Nora'), false);
select set_config('t.acc_o', (select id::text from public.accounts where name = 'Compte d''Omar'), false);

-- Relevé fictif au format produit par toImportPayload (@amanah/banking)
select set_config('t.rows', $j$[
  {"booked_on":"2026-10-01","amount_cents":265000,"currency":"EUR","description":"VIREMENT SALAIRE OCTOBRE","counterparty_name":"Employeur Fictif SA","counterparty_iban_last4":"1111","category_slug":"salaire","external_id":null,"dedupe_hash":"n-1","is_interest":false,"interest_kind":null,"interest_reason":null},
  {"booked_on":"2026-10-05","amount_cents":-350,"currency":"EUR","description":"CARTE CAFE FICTIF","counterparty_name":null,"counterparty_iban_last4":null,"category_slug":"categorie-inconnue","external_id":null,"dedupe_hash":"n-2","is_interest":false,"interest_kind":null,"interest_reason":null},
  {"booked_on":"2026-10-05","amount_cents":-350,"currency":"EUR","description":"CARTE CAFE FICTIF","counterparty_name":null,"counterparty_iban_last4":null,"category_slug":"divers","external_id":null,"dedupe_hash":"n-3","is_interest":false,"interest_kind":null,"interest_reason":null},
  {"booked_on":"2026-10-31","amount_cents":1234,"currency":"EUR","description":"INTERETS CREDITEURS","counterparty_name":null,"counterparty_iban_last4":null,"category_slug":"interets","external_id":null,"dedupe_hash":"n-4","is_interest":true,"interest_kind":"bank_interest","interest_reason":"marker:INTERETS CREDITEURS"},
  {"booked_on":"2026-10-31","amount_cents":456,"currency":"EUR","description":"PRIME DE FIDELITE","counterparty_name":null,"counterparty_iban_last4":null,"category_slug":"interets","external_id":null,"dedupe_hash":"n-5","is_interest":true,"interest_kind":"loyalty_bonus","interest_reason":"marker:PRIME DE FIDELITE"},
  {"booked_on":"2026-10-31","amount_cents":-500,"currency":"EUR","description":"INTERETS DEBITEURS","counterparty_name":null,"counterparty_iban_last4":null,"category_slug":"divers","external_id":null,"dedupe_hash":"n-6","is_interest":true,"interest_kind":"bank_interest","interest_reason":"x"}
]$j$, false);

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _ri values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _ri values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _ri values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _ri values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _ri values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- Import (en tant que Nora)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';

select pg_temp.check_val('import : résultat du lot', format($q$
  select public.import_transactions(%L, %L, 'csv', 'releve-fictif.csv', 'generic_be', 1, %L::jsonb)
         - 'batch_id'$q$, current_setting('t.hn'), current_setting('t.acc_n'), current_setting('t.rows')),
  '{"rows": 6, "imported": 6, "interest": 2, "duplicates": 0, "purification_items": 2}');
select pg_temp.check_val('import : journal du lot (lu, importé, doublons, erreurs, intérêts)',
  $q$select row_count || '/' || imported_count || '/' || duplicate_count || '/' || error_count || '/' || interest_count || '/' || purification_count
     from public.import_batches$q$, '7/6/0/1/2/2');
select pg_temp.check_val('import : catégorie inconnue laissée vide',
  $q$select coalesce(category_slug, 'aucune') from public.transactions where dedupe_hash = 'n-2'$q$, 'aucune');
select pg_temp.check_val('import : un débit n''est jamais un intérêt',
  $q$select is_interest::text from public.transactions where dedupe_hash = 'n-6'$q$, 'false');
select pg_temp.check_val('import : éléments « détectés » créés pour Nora',
  $q$select string_agg(source_kind || ':' || credited_cents || ':' || status, ',' order by credited_cents) from public.purification_items$q$,
  'loyalty_bonus:456:detected,bank_interest:1234:detected');
select pg_temp.check_val('réimport du même fichier : aucune ligne ajoutée', format($q$
  select (public.import_transactions(%L, %L, 'csv', 'releve-fictif.csv', 'generic_be', 0, %L::jsonb) ->> 'imported')$q$,
  current_setting('t.hn'), current_setting('t.acc_n'), current_setting('t.rows')), '0');
select pg_temp.check_val('réimport : opérations et purification inchangées',
  $q$select (select count(*) from public.transactions) || '/' || (select count(*) from public.purification_items)$q$, '6/2');
select pg_temp.expect('import atomique : une ligne invalide annule tout le lot', format($q$
  select public.import_transactions(%L, %L, 'csv', 'x.csv', 'generic_be', 0,
    '[{"booked_on":"2026-11-01","amount_cents":100,"dedupe_hash":"z-1"},{"booked_on":"2026-11-02","amount_cents":0,"dedupe_hash":"z-2"}]'::jsonb)$q$,
  current_setting('t.hn'), current_setting('t.acc_n')), false);
select pg_temp.check_val('import atomique : ni lot ni opération partiels',
  $q$select (select count(*) from public.import_batches) || '/' || (select count(*) from public.transactions where dedupe_hash like 'z-%')$q$, '2/0');
select pg_temp.expect('import : source « manuelle » refusée', format($q$
  select public.import_transactions(%L, %L, 'manual', 'x.csv', null, 0, '[{"booked_on":"2026-11-01","amount_cents":1,"dedupe_hash":"m-1"}]'::jsonb)$q$,
  current_setting('t.hn'), current_setting('t.acc_n')), false);
select pg_temp.expect('import : plus de 5 000 lignes refusé', format($q$
  select public.import_transactions(%L, %L, 'csv', 'x.csv', null, 0,
    (select jsonb_agg(jsonb_build_object('booked_on', '2026-11-01', 'amount_cents', 1, 'dedupe_hash', 'big-' || g)) from generate_series(1, 5001) g))$q$,
  current_setting('t.hn'), current_setting('t.acc_n')), false);
select pg_temp.expect('import : lot vide refusé', format($q$
  select public.import_transactions(%L, %L, 'csv', 'x.csv', null, 0, '[]'::jsonb)$q$,
  current_setting('t.hn'), current_setting('t.acc_n')), false);

-- ---------------------------------------------------------------------------
-- Isolation de l'import (Omar, autre foyer, sans consentement)
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d3';
select pg_temp.expect('Omar : import dans le foyer de Nora refusé', format($q$
  select public.import_transactions(%L, %L, 'csv', 'x.csv', null, 0, '[{"booked_on":"2026-11-01","amount_cents":1,"dedupe_hash":"o-x"}]'::jsonb)$q$,
  current_setting('t.hn'), current_setting('t.acc_n')), false);
select pg_temp.expect('Omar : import sur le compte de Nora via son propre foyer refusé', format($q$
  select public.import_transactions(%L, %L, 'csv', 'x.csv', null, 0, '[{"booked_on":"2026-11-01","amount_cents":1,"dedupe_hash":"o-y"}]'::jsonb)$q$,
  current_setting('t.ho'), current_setting('t.acc_n')), false);
select pg_temp.check_val('Omar sans art. 9 : intérêt importé, aucune purification créée', format($q$
  select (public.import_transactions(%L, %L, 'csv', 'o.csv', 'generic_be', 0,
    '[{"booked_on":"2026-10-31","amount_cents":777,"description":"INTERETS","dedupe_hash":"o-1","is_interest":true,"interest_kind":"bank_interest"}]'::jsonb)
    - 'batch_id')::text$q$, current_setting('t.ho'), current_setting('t.acc_o')),
  '{"rows": 1, "imported": 1, "interest": 1, "duplicates": 0, "purification_items": 0}');
select pg_temp.check_val('Omar : aucune opération ni lot de Nora visibles',
  $q$select (select count(*) from public.transactions) || '/' || (select count(*) from public.import_batches)$q$, '1/1');
reset role;
select pg_temp.check_val('aucune écriture d''Omar chez Nora',
  format($q$select count(*)::text from public.transactions where account_id = %L and dedupe_hash like 'o-%%'$q$, current_setting('t.acc_n')), '0');

-- ---------------------------------------------------------------------------
-- Purification (Nora)
-- ---------------------------------------------------------------------------
select set_config('t.p1', (select id::text from public.purification_items where credited_cents = 1234), false);
select set_config('t.p2', (select id::text from public.purification_items where credited_cents = 456), false);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';

select pg_temp.expect('détecté → purifié directement refusé', format($q$
  update public.purification_items set status = 'purified' where id = %L$q$, current_setting('t.p1')), false);
select pg_temp.expect('montant crédité non modifiable', format($q$
  update public.purification_items set credited_cents = 1 where id = %L$q$, current_setting('t.p1')), false);
select pg_temp.expect('précompte saisi : brut = net + précompte', format($q$
  update public.purification_items set withholding_tax_cents = 529, gross_cents = 1763 where id = %L$q$, current_setting('t.p1')), true);
select pg_temp.expect('montants incohérents refusés', format($q$
  update public.purification_items set withholding_tax_cents = 1, gross_cents = 9999 where id = %L$q$, current_setting('t.p2')), false);
select pg_temp.expect('confirmation de l''élément 1', format($q$
  update public.purification_items set status = 'confirmed' where id = %L$q$, current_setting('t.p1')), true);
select pg_temp.expect('confirmation de l''élément 2 (brut inconnu)', format($q$
  update public.purification_items set status = 'confirmed' where id = %L$q$, current_setting('t.p2')), true);
select pg_temp.check_val('sans méthodologie : montants à déterminer',
  $q$select count(*)::text from public.purification_items where amount_to_purify_cents is null$q$, '2');
select pg_temp.check_val('méthodologie brute : 2 éléments recalculés', $q$select public.set_purification_basis('gross')::text$q$, '2');
select pg_temp.check_val('méthodologie brute : brut retenu si connu, sinon à déterminer',
  $q$select string_agg(credited_cents || '=' || coalesce(amount_to_purify_cents::text, '?'), ',' order by credited_cents) from public.purification_items$q$,
  '456=?,1234=1763');
select pg_temp.expect('purification d''un élément au montant indéterminé refusée', format($q$
  select public.record_purification(%L, array[%L, %L]::uuid[], current_date, 'Association fictive')$q$,
  current_setting('t.hn'), current_setting('t.p1'), current_setting('t.p2')), false);
select pg_temp.check_val('échec : aucune contribution ni élément purifié',
  $q$select (select count(*) from public.contributions) || '/' || (select count(*) from public.purification_items where status = 'purified')$q$, '0/0');
select pg_temp.check_val('méthodologie nette : montant = net crédité', $q$select public.set_purification_basis('net_credited')::text$q$, '2');
select pg_temp.check_val('méthodologie nette appliquée',
  $q$select string_agg(credited_cents || '=' || amount_to_purify_cents || ':' || basis || ':' || basis_source, ',' order by credited_cents) from public.purification_items$q$,
  '456=456:net_credited:user_choice,1234=1234:net_credited:user_choice');
select pg_temp.check_val('préférence de méthodologie mémorisée',
  $q$select purification_basis::text from public.religious_preferences$q$, 'net_credited');
select pg_temp.expect('date de purification future refusée', format($q$
  select public.record_purification(%L, array[%L]::uuid[], current_date + 2, 'Association fictive')$q$,
  current_setting('t.hn'), current_setting('t.p1')), false);
select pg_temp.expect('bénéficiaire manquant refusé', format($q$
  select public.record_purification(%L, array[%L]::uuid[], current_date, '  ')$q$,
  current_setting('t.hn'), current_setting('t.p1')), false);
select pg_temp.expect('purification réalisée enregistrée', format($q$
  select public.record_purification(%L, array[%L, %L]::uuid[], current_date, 'Association fictive')$q$,
  current_setting('t.hn'), current_setting('t.p1'), current_setting('t.p2')), true);
select pg_temp.check_val('contribution « purification » = somme des éléments',
  $q$select kind || ':' || amount_cents || ':' || beneficiary_label from public.contributions$q$, 'purification:1690:Association fictive');
select pg_temp.check_val('éléments purifiés et liés au don',
  $q$select count(*)::text from public.purification_items p join public.contributions c on c.id = p.contribution_id where p.status = 'purified'$q$, '2');
select pg_temp.expect('élément purifié : retour en arrière refusé', format($q$
  update public.purification_items set status = 'rejected' where id = %L$q$, current_setting('t.p1')), false);
select pg_temp.expect('élément purifié : montant non modifiable', format($q$
  update public.purification_items set gross_cents = null, withholding_tax_cents = null where id = %L$q$, current_setting('t.p1')), false);
select pg_temp.expect('élément purifié : suppression sans effet', format($q$
  do $d$ declare n int; begin delete from public.purification_items where id = %L; get diagnostics n = row_count;
  if n > 0 then raise exception 'supprimé'; end if; end $d$$q$, current_setting('t.p1')), true);
select pg_temp.expect('don lié à une purification : suppression refusée',
  $q$delete from public.contributions where kind = 'purification'$q$, false);
select pg_temp.expect('purifier deux fois le même élément refusé', format($q$
  select public.record_purification(%L, array[%L]::uuid[], current_date, 'Association fictive')$q$,
  current_setting('t.hn'), current_setting('t.p1')), false);

-- Rejet réversible : nouvel intérêt saisi à la main
reset role;
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash, is_interest)
values (current_setting('t.hn')::uuid, current_setting('t.acc_n')::uuid, date '2026-11-30', 900, 'INTERETS', 'manual', 'n-man', true);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.expect('détection manuelle d''un intérêt', format($q$
  insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on)
  select household_id, id, 'bank_interest', amount_cents, booked_on from public.transactions where dedupe_hash = 'n-man'$q$), true);
select pg_temp.expect('rejet d''un élément détecté', $q$update public.purification_items set status = 'rejected' where credited_cents = 900$q$, true);
select pg_temp.expect('rejeté → confirmé directement refusé', $q$update public.purification_items set status = 'confirmed' where credited_cents = 900$q$, false);
select pg_temp.expect('rejet réversible : rejeté → détecté', $q$update public.purification_items set status = 'detected' where credited_cents = 900$q$, true);

-- ---------------------------------------------------------------------------
-- Rania, membre du foyer de Nora
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.check_val('Rania : opérations importées visibles (budget commun)',
  $q$select count(*)::text from public.transactions$q$, '7');
select pg_temp.check_val('Rania sans art. 9 : purification et dons de Nora invisibles',
  $q$select ((select count(*) from public.purification_items) + (select count(*) from public.contributions))::text$q$, '0');
select pg_temp.expect('Rania sans art. 9 : méthodologie refusée', $q$select public.set_purification_basis('gross')$q$, false);
select pg_temp.expect('Rania : purification des éléments de Nora refusée', format($q$
  select public.record_purification(%L, array[%L]::uuid[], current_date, 'x')$q$, current_setting('t.hn'), current_setting('t.p1')), false);
reset role;
insert into public.consents (user_id, kind, granted, document_version, document_hash)
values ('00000000-0000-0000-0000-0000000000d2', 'special_category', true, 'test', repeat('b', 64));
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.check_val('Rania avec art. 9 : données de Nora toujours privées (non partagées)',
  $q$select ((select count(*) from public.purification_items) + (select count(*) from public.contributions))::text$q$, '0');
select pg_temp.check_val('Rania : import sans création de purification sur un intérêt déjà suivi', format($q$
  select (public.import_transactions(%L, %L, 'csv', 'r.csv', 'generic_be', 0, %L::jsonb) ->> 'purification_items')$q$,
  current_setting('t.hn'), current_setting('t.acc_n'), current_setting('t.rows')), '0');
reset role;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _ri loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) import/purification en échec', failures; end if;
end $$;
