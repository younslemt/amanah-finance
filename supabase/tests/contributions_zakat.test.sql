-- =============================================================================
-- Sprint 4 : dons et Sadaqah, Zakat personnalisée.
-- Utilisateurs fictifs : Rami (R, propriétaire du foyer, consentement article 9),
-- Rita (membre du même foyer, consentement, ne partage pas), Omar (autre foyer,
-- consentement), Nour (membre du foyer de Rami, SANS consentement). Montants fictifs.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _cz (check_name text, ok boolean, detail text);
grant all on _cz to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'rami@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'rita@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'omar@example.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'nour@example.test');
select set_config('t.hr', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000f1'), false);
select set_config('t.ho', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000f3'), false);
delete from public.households where created_by in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f4');
insert into public.household_members (household_id, user_id, role) values
  (current_setting('t.hr')::uuid, '00000000-0000-0000-0000-0000000000f2', 'member'),
  (current_setting('t.hr')::uuid, '00000000-0000-0000-0000-0000000000f4', 'member');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select u.id, k.kind::public.consent_kind, true, 'test', repeat('a', 64)
from auth.users u cross join (values ('terms'), ('privacy')) k(kind)
where u.id::text like '00000000-0000-0000-0000-0000000000f%';
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select id, 'special_category', true, 'test', repeat('b', 64) from auth.users
where id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3');

insert into public.accounts (household_id, name) values (current_setting('t.hr')::uuid, 'Compte fictif de Rami');
select set_config('t.acc', (select id::text from public.accounts where household_id = current_setting('t.hr')::uuid), false);
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash, is_interest) values
  (current_setting('t.hr')::uuid, current_setting('t.acc')::uuid, date '2026-10-05', -5000, 'VIREMENT ASSOCIATION FICTIVE', 'csv', 'r-don', false),
  (current_setting('t.hr')::uuid, current_setting('t.acc')::uuid, date '2026-10-01', -5000, 'AUTRE DEBIT FICTIF', 'csv', 'r-autre', false),
  (current_setting('t.hr')::uuid, current_setting('t.acc')::uuid, date '2026-08-01', -5000, 'DEBIT TROP ANCIEN', 'csv', 'r-ancien', false),
  (current_setting('t.hr')::uuid, current_setting('t.acc')::uuid, date '2026-10-31', 800, 'INTERETS CREDITEURS FICTIFS', 'csv', 'r-int', true);
select set_config('t.tdon', (select id::text from public.transactions where dedupe_hash = 'r-don'), false);
select set_config('t.tautre', (select id::text from public.transactions where dedupe_hash = 'r-autre'), false);
select set_config('t.tancien', (select id::text from public.transactions where dedupe_hash = 'r-ancien'), false);
select set_config('t.tint', (select id::text from public.transactions where dedupe_hash = 'r-int'), false);

create or replace function pg_temp.expect(name text, stmt text, should_pass boolean) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    insert into _cz values (name, should_pass, case when should_pass then 'accepté' else 'accepté à tort' end);
  exception when others then
    if sqlstate in ('42601', '42703', '42P01', '42883') then insert into _cz values (name, false, 'erreur de test : ' || sqlerrm);
    else insert into _cz values (name, not should_pass, sqlstate || ' ' || sqlerrm); end if;
  end;
end $$;
create or replace function pg_temp.check_val(name text, sql text, expected text) returns void language plpgsql as $$
declare v text;
begin
  execute sql into v;
  insert into _cz values (name, v is not distinct from expected, coalesce(v, 'null') || ', attendu ' || coalesce(expected, 'null'));
exception when others then insert into _cz values (name, false, sqlstate || ' ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------------
-- Rami : dons, Zakat al-Fitr, prix, réglages, calcul
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';

select pg_temp.expect('Sadaqah déclarée', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, note)
  values (%L, 'sadaqah', 'Association fictive', 5000, date '2026-10-03', 'Don fictif')$q$, current_setting('t.hr')), true);
select pg_temp.check_val('propriétaire imposé par le serveur',
  $q$select owner_id::text from public.contributions where note = 'Don fictif'$q$, '00000000-0000-0000-0000-0000000000f1');
select pg_temp.expect('purification saisie à la main : refusée (double comptage)', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on)
  values (%L, 'purification', 'Organisme fictif', 800, date '2026-11-01')$q$, current_setting('t.hr')), false);
select pg_temp.expect('don dans le futur refusé', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on)
  values (%L, 'sadaqah', 'Association fictive', 100, date '2099-01-01')$q$, current_setting('t.hr')), false);

-- Vérification bancaire
select pg_temp.expect('rapproché : débit du même montant à 2 jours', format($q$
  update public.contributions set transaction_id = %L where note = 'Don fictif'$q$, current_setting('t.tdon')), true);
select pg_temp.expect('une opération ne prouve qu''une seule contribution', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, transaction_id)
  values (%L, 'sadaqah', 'Association fictive', 5000, date '2026-10-04', %L)$q$, current_setting('t.hr'), current_setting('t.tdon')), false);
select pg_temp.expect('débit trop éloigné refusé', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, transaction_id)
  values (%L, 'sadaqah', 'Association fictive', 5000, date '2026-10-04', %L)$q$, current_setting('t.hr'), current_setting('t.tancien')), false);
select pg_temp.expect('montant différent refusé', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, transaction_id)
  values (%L, 'sadaqah', 'Association fictive', 4999, date '2026-10-02', %L)$q$, current_setting('t.hr'), current_setting('t.tautre')), false);
select pg_temp.expect('crédit (intérêt) refusé comme preuve de don', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, transaction_id)
  values (%L, 'sadaqah', 'Association fictive', 800, date '2026-10-31', %L)$q$, current_setting('t.hr'), current_setting('t.tint')), false);
select pg_temp.expect('statut « confirmé » non saisissable par l''utilisateur (insertion)', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, confirmation_source, confirmed_on)
  values (%L, 'sadaqah', 'Association fictive', 100, date '2026-10-01', 'partner', date '2026-10-02')$q$, current_setting('t.hr')), false);
select pg_temp.expect('statut « confirmé » non saisissable par l''utilisateur (modification)', $q$
  update public.contributions set confirmation_source = 'proof', confirmed_on = date '2026-10-06' where note = 'Don fictif'$q$, false);
select pg_temp.expect('montant modifié après rapprochement : refusé', $q$
  update public.contributions set amount_cents = 6000 where note = 'Don fictif'$q$, false);

-- Zakat al-Fitr
select pg_temp.expect('Zakat al-Fitr : 4 personnes, montant et source choisis', format($q$
  insert into public.zakat_fitr_obligations (household_id, civil_year, persons, amount_per_person_cents, amount_source)
  values (%L, 2026, 4, 1000, 'Montant fictif communiqué par la mosquée')$q$, current_setting('t.hr')), true);
select pg_temp.check_val('Zakat al-Fitr due calculée par la base', 'select due_cents::text from public.zakat_fitr_obligations', '4000');
select pg_temp.check_val('Zakat al-Fitr : année hégirienne année civile enregistrée, année hégirienne non déduite',
  'select count(*)::text from public.zakat_fitr_obligations where hijri_year is null and civil_year = 2026', '1');
select pg_temp.expect('Zakat al-Fitr sans source refusée', format($q$
  insert into public.zakat_fitr_obligations (household_id, civil_year, persons, amount_per_person_cents, amount_source)
  values (%L, 2025, 2, 1000, '  ')$q$, current_setting('t.hr')), false);
select pg_temp.expect('une seule Zakat al-Fitr par personne et par année', format($q$
  insert into public.zakat_fitr_obligations (household_id, civil_year, persons, amount_per_person_cents, amount_source)
  values (%L, 2026, 1, 1000, 'Autre source fictive')$q$, current_setting('t.hr')), false);
select pg_temp.expect('paiement de Zakat al-Fitr affecté', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, zakat_fitr_id)
  select %L, 'zakat_al_fitr', 'Mosquée fictive', 4000, date '2026-03-28', id from public.zakat_fitr_obligations$q$, current_setting('t.hr')), true);
select pg_temp.expect('affectation Zakat al-Fitr refusée pour une Sadaqah', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, zakat_fitr_id)
  select %L, 'sadaqah', 'Mosquée fictive', 100, date '2026-03-28', id from public.zakat_fitr_obligations$q$, current_setting('t.hr')), false);

-- Prix des métaux
select pg_temp.expect('prix de l''or saisi avec source', format($q$
  insert into public.zakat_metal_prices (household_id, symbol, price_per_g_cents, as_of, source)
  values (%L, 'XAU', 11000, date '2026-11-15', 'Cotation fictive')$q$, current_setting('t.hr')), true);
select pg_temp.expect('prix sans source refusé', format($q$
  insert into public.zakat_metal_prices (household_id, symbol, price_per_g_cents, as_of, source)
  values (%L, 'XAG', 130, date '2026-11-15', '')$q$, current_setting('t.hr')), false);
select pg_temp.expect('prix daté dans le futur refusé', format($q$
  insert into public.zakat_metal_prices (household_id, symbol, price_per_g_cents, as_of, source)
  values (%L, 'XAG', 130, date '2099-01-01', 'Cotation fictive')$q$, current_setting('t.hr')), false);

-- Réglages sans valeur imposée, calcul figé
select pg_temp.expect('réglages Zakat sans base du nisab ni année choisies', format($q$
  insert into public.zakat_settings (household_id, ruleset_id, ruleset_version, options)
  values (%L, 'amanah-zakat', '1.0.0', '{}'::jsonb)$q$, current_setting('t.hr')), true);
select pg_temp.check_val('aucune année imposée par défaut', 'select coalesce(year_basis::text, ''non choisie'') from public.zakat_settings', 'non choisie');
select pg_temp.expect('calcul enregistré', format($q$
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of, inputs, result,
    zakatable_cents, nisab_cents, zakat_due_cents, is_above_nisab, status)
  values (%L, 'amanah-zakat', '1.0.0', '0.1.0', date '2026-11-20', '{"fictif":true}', '{"status":"due"}', 1000000, 77350, 25000, true, 'due')$q$,
  current_setting('t.hr')), true);
select set_config('t.calc', (select id::text from public.zakat_calculations), false);
update public.zakat_calculations set zakat_due_cents = 1;
select pg_temp.check_val('calcul figé : aucune modification possible', 'select zakat_due_cents::text from public.zakat_calculations', '25000');
select pg_temp.expect('Zakat payée affectée au calcul', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, zakat_calculation_id)
  select %L, 'zakat', 'Association fictive', 25000, date '2026-11-19', id from public.zakat_calculations$q$, current_setting('t.hr')), true);
select pg_temp.expect('affectation à un calcul refusée pour une Sadaqah', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, zakat_calculation_id)
  select %L, 'sadaqah', 'Association fictive', 100, date '2026-11-19', id from public.zakat_calculations$q$, current_setting('t.hr')), false);

-- Purification : créée par le parcours, visible une seule fois, non modifiable ici
select pg_temp.expect('élément de purification', format($q$
  insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on)
  values (%L, %L, 'bank_interest', 800, date '2026-10-31')$q$, current_setting('t.hr'), current_setting('t.tint')), true);
select pg_temp.expect('base nette choisie', $q$select public.set_purification_basis('net_credited')$q$, true);
select pg_temp.expect('élément confirmé', $q$update public.purification_items set status = 'confirmed', basis = 'net_credited', basis_source = 'user_choice', amount_to_purify_cents = 800$q$, true);
select pg_temp.expect('purification enregistrée par le parcours', format($q$
  select public.record_purification(%L, array(select id from public.purification_items), date '2026-11-02', 'Organisme fictif')$q$, current_setting('t.hr')), true);
select pg_temp.check_val('une seule contribution « purification », du montant purifié',
  $q$select count(*) || '/' || sum(amount_cents) from public.contributions where kind = 'purification'$q$, '1/800');
select pg_temp.expect('purification enregistrée : montant non modifiable depuis les dons', $q$
  update public.contributions set amount_cents = 1 where kind = 'purification'$q$, false);
select pg_temp.expect('purification enregistrée : non convertible en Sadaqah', $q$
  update public.contributions set kind = 'sadaqah' where kind = 'purification'$q$, false);
select pg_temp.expect('Sadaqah : non convertible en purification', $q$
  update public.contributions set kind = 'purification' where note = 'Don fictif'$q$, false);
select pg_temp.expect('purification : suppression refusée (éléments liés)', $q$delete from public.contributions where kind = 'purification'$q$, false);
select pg_temp.check_val('totaux : chaque contribution comptée une fois',
  $q$select count(*) || '/' || sum(amount_cents) from public.contributions$q$, '4/34800');

-- ---------------------------------------------------------------------------
-- Rita (même foyer, ne partage pas) : rien de Rami, pas d'affectation croisée
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
select pg_temp.check_val('Rita ne voit aucune donnée religieuse de Rami',
  $q$select (select count(*) from public.contributions) + (select count(*) from public.zakat_fitr_obligations)
     + (select count(*) from public.zakat_metal_prices) + (select count(*) from public.zakat_calculations)
     + (select count(*) from public.zakat_settings)$q$, '0');
select pg_temp.expect('Rita ne peut pas affecter son don au calcul de Rami', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, zakat_calculation_id)
  values (%L, 'zakat', 'Association fictive', 100, date '2026-11-19', %L)$q$,
  current_setting('t.hr'), current_setting('t.calc')), false);
select pg_temp.expect('Rita ne peut pas utiliser l''opération déjà rapprochée par Rami', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, transaction_id)
  values (%L, 'sadaqah', 'Association fictive', 5000, date '2026-10-05', %L)$q$, current_setting('t.hr'), current_setting('t.tdon')), false);
select pg_temp.expect('Rita : don au nom de Rami impossible (propriétaire imposé)', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, owner_id)
  values (%L, 'sadaqah', 'Association fictive', 300, date '2026-11-01', '00000000-0000-0000-0000-0000000000f1')$q$, current_setting('t.hr')), true);
select pg_temp.check_val('… enregistré au nom de Rita', $q$select owner_id::text from public.contributions where amount_cents = 300$q$, '00000000-0000-0000-0000-0000000000f2');

-- Nour (même foyer, sans consentement article 9) : tout est fermé
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f4';
select pg_temp.expect('Nour sans consentement : don refusé', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on)
  values (%L, 'sadaqah', 'Association fictive', 100, date '2026-11-01')$q$, current_setting('t.hr')), false);
select pg_temp.expect('Nour sans consentement : prix refusé', format($q$
  insert into public.zakat_metal_prices (household_id, symbol, price_per_g_cents, as_of, source)
  values (%L, 'XAG', 130, date '2026-11-15', 'Cotation fictive')$q$, current_setting('t.hr')), false);
select pg_temp.check_val('Nour ne voit rien', $q$select (select count(*) from public.contributions) + (select count(*) from public.zakat_fitr_obligations)$q$, '0');

-- Omar (autre foyer)
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f3';
select pg_temp.check_val('Omar ne voit rien du foyer de Rami',
  $q$select (select count(*) from public.contributions) + (select count(*) from public.zakat_fitr_obligations) + (select count(*) from public.zakat_metal_prices)$q$, '0');
select pg_temp.expect('Omar : écriture dans le foyer de Rami refusée', format($q$
  insert into public.zakat_fitr_obligations (household_id, civil_year, persons, amount_per_person_cents, amount_source)
  values (%L, 2026, 1, 1000, 'Source fictive')$q$, current_setting('t.hr')), false);
select pg_temp.expect('Omar : opération d''un autre foyer comme preuve refusée', format($q$
  insert into public.contributions (household_id, kind, beneficiary_label, amount_cents, paid_on, transaction_id)
  values (%L, 'sadaqah', 'Association fictive', 5000, date '2026-10-01', %L)$q$, current_setting('t.ho'), current_setting('t.tautre')), false);

-- ---------------------------------------------------------------------------
-- Retrait avec effacement : toutes les nouvelles données de Rami disparaissent
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.expect('Rami retire son consentement et efface', $q$select public.withdraw_religious_consent('test', true)$q$, true);
reset role;
select pg_temp.check_val('effacement : dons, Zakat al-Fitr, prix, réglages et calculs de Rami supprimés',
  $q$select (select count(*) from public.contributions where owner_id = '00000000-0000-0000-0000-0000000000f1')
     + (select count(*) from public.zakat_fitr_obligations where owner_id = '00000000-0000-0000-0000-0000000000f1')
     + (select count(*) from public.zakat_metal_prices where owner_id = '00000000-0000-0000-0000-0000000000f1')
     + (select count(*) from public.zakat_settings where owner_id = '00000000-0000-0000-0000-0000000000f1')
     + (select count(*) from public.zakat_calculations where owner_id = '00000000-0000-0000-0000-0000000000f1')$q$, '0');
select pg_temp.check_val('… le don de Rita est conservé', $q$select count(*)::text from public.contributions where owner_id = '00000000-0000-0000-0000-0000000000f2'$q$, '1');
select pg_temp.check_val('… l''opération bancaire reste (donnée du budget)', $q$select count(*)::text from public.transactions where dedupe_hash = 'r-don'$q$, '1');

do $$
declare r record; failures int := 0;
begin
  for r in select * from _cz loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) dons et Zakat en échec', failures; end if;
end $$;
