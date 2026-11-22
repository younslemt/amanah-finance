-- =============================================================================
-- Lot 3 : « Mes engagements » calcule la purification sur les éléments de la personne
-- connectée, même lorsque le partage religieux du foyer est activé.
-- Deux membres consentants (Karim, Lina), partage activé des deux côtés, montants
-- différents. On vérifie :
--   1. la RLS (inchangée) rend visibles les éléments partagés de l'autre membre ;
--   2. la requête personnelle utilisée par l'application (owner_id = auth.uid())
--      ne restitue que les montants de la personne connectée ;
--   3. l'autre membre ne peut toujours pas modifier ces éléments.
-- Utilisateurs et montants FICTIFS.
-- =============================================================================
\set ON_ERROR_STOP 1

create temp table _ps (check_name text, ok boolean, detail text);
grant all on _ps to authenticated, anon;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'karim.ps@example.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'lina.ps@example.test');
select set_config('t.hk', (select id::text from public.households where created_by = '00000000-0000-0000-0000-0000000000d1'), false);
delete from public.households where created_by = '00000000-0000-0000-0000-0000000000d2';
insert into public.household_members (household_id, user_id, role)
values (current_setting('t.hk')::uuid, '00000000-0000-0000-0000-0000000000d2', 'member');
insert into public.consents (user_id, kind, granted, document_version, document_hash)
select u.id, k.kind::public.consent_kind, true, 'test', repeat('a', 64)
from auth.users u cross join (values ('terms'), ('privacy'), ('special_category')) k(kind)
where u.id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2');
insert into public.accounts (household_id, name) values (current_setting('t.hk')::uuid, 'Compte commun fictif');
select set_config('t.acc', (select id::text from public.accounts where household_id = current_setting('t.hk')::uuid), false);
insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash, is_interest)
select current_setting('t.hk')::uuid, current_setting('t.acc')::uuid, date '2026-10-31', v.cents, 'INTERETS CREDITEURS FICTIFS', 'csv', v.hash, true
from (values (1000, 'ps-k-1'), (2000, 'ps-k-2'), (370, 'ps-l-1')) v(cents, hash);

create or replace function pg_temp.ps_check(name text, got text, expected text) returns void language plpgsql as $$
begin insert into _ps values (name, got is not distinct from expected, coalesce(got, 'null') || ', attendu ' || expected); end $$;
grant execute on function pg_temp.ps_check(text, text, text) to authenticated;

set role authenticated;

-- Karim : deux éléments (10,00 € confirmé à purifier 10,00 € ; 20,00 € détecté) ; partage activé
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on, status, basis, basis_source, amount_to_purify_cents)
select current_setting('t.hk')::uuid, t.id, 'bank_interest', t.amount_cents, t.booked_on,
       (case t.dedupe_hash when 'ps-k-1' then 'confirmed' else 'detected' end)::public.purification_status,
       (case t.dedupe_hash when 'ps-k-1' then 'net_credited' end)::public.purification_basis,
       case t.dedupe_hash when 'ps-k-1' then 'user_choice' end,
       case t.dedupe_hash when 'ps-k-1' then 1000 end
from public.transactions t where t.dedupe_hash in ('ps-k-1', 'ps-k-2');
insert into public.religious_preferences (user_id, purification_basis, share_with_household) values (auth.uid(), 'net_credited', true);

-- Lina : un élément de 3,70 € confirmé à purifier 3,70 € ; partage activé
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on, status, basis, basis_source, amount_to_purify_cents)
select current_setting('t.hk')::uuid, t.id, 'bank_interest', t.amount_cents, t.booked_on, 'confirmed', 'net_credited', 'user_choice', 370
from public.transactions t where t.dedupe_hash = 'ps-l-1';
insert into public.religious_preferences (user_id, purification_basis, share_with_household) values (auth.uid(), 'net_credited', true);

-- Vue de Lina
select pg_temp.ps_check('partage : Lina voit les 3 éléments du foyer (RLS inchangée)',
  (select count(*)::text from public.purification_items where household_id = current_setting('t.hk')::uuid), '3');
select pg_temp.ps_check('Lina : requête personnelle = 1 élément',
  (select count(*)::text from public.purification_items where household_id = current_setting('t.hk')::uuid and owner_id = auth.uid()), '1');
select pg_temp.ps_check('Lina : montant personnel à purifier = 370 (et non 1 370)',
  (select coalesce(sum(amount_to_purify_cents), 0)::text from public.purification_items
   where household_id = current_setting('t.hk')::uuid and owner_id = auth.uid() and status = 'confirmed'), '370');
select pg_temp.ps_check('Lina : aucun élément détecté personnel (les 20,00 € sont à Karim)',
  (select coalesce(sum(credited_cents), 0)::text from public.purification_items
   where household_id = current_setting('t.hk')::uuid and owner_id = auth.uid() and status = 'detected'), '0');
do $$ declare n int; begin
  update public.purification_items set status = 'rejected' where owner_id <> auth.uid(); get diagnostics n = row_count;
  perform pg_temp.ps_check('Lina ne modifie pas les éléments partagés de Karim', n::text, '0');
end $$;

-- Vue de Karim
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select pg_temp.ps_check('partage : Karim voit les 3 éléments du foyer',
  (select count(*)::text from public.purification_items where household_id = current_setting('t.hk')::uuid), '3');
select pg_temp.ps_check('Karim : montant personnel à purifier = 1 000',
  (select coalesce(sum(amount_to_purify_cents), 0)::text from public.purification_items
   where household_id = current_setting('t.hk')::uuid and owner_id = auth.uid() and status = 'confirmed'), '1000');
select pg_temp.ps_check('Karim : détecté personnel = 2 000',
  (select coalesce(sum(credited_cents), 0)::text from public.purification_items
   where household_id = current_setting('t.hk')::uuid and owner_id = auth.uid() and status = 'detected'), '2000');

-- Sans partage de Karim : Lina ne voit plus que ses propres éléments
update public.religious_preferences set share_with_household = false where user_id = auth.uid();
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select pg_temp.ps_check('partage retiré par Karim : Lina ne voit que son élément',
  (select count(*)::text from public.purification_items where household_id = current_setting('t.hk')::uuid), '1');
reset role;

do $$
declare r record; failures int := 0;
begin
  for r in select * from _ps loop
    if r.ok then raise notice 'OK    %', r.check_name;
    else failures := failures + 1; raise notice 'ECHEC %  (%)', r.check_name, r.detail; end if;
  end loop;
  if failures > 0 then raise exception '% contrôle(s) de périmètre personnel de la purification en échec', failures; end if;
end $$;
