-- =============================================================================
-- Tests d'isolation RLS et d'intégrité.
-- Chaque assertion lève une exception en cas d'échec : le script s'arrête
-- (psql -v ON_ERROR_STOP=1) et la CI échoue.
-- =============================================================================
\set ON_ERROR_STOP 1

-- Deux utilisateurs : Amina (A) et Bilal (B). L'inscription crée leur foyer.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'amina@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bilal@example.test');

do $$
declare n int;
begin
  select count(*) into n from public.households;
  if n <> 2 then raise exception 'ECHEC inscription : % foyers au lieu de 2', n; end if;
  select count(*) into n from public.household_members where role = 'owner';
  if n <> 2 then raise exception 'ECHEC inscription : % propriétaires au lieu de 2', n; end if;
  raise notice 'OK  inscription : foyer, profil et appartenance créés automatiquement';
end $$;

-- Données de chaque foyer (insérées en superutilisateur)
insert into public.accounts (household_id, name, type)
select h.id, 'Compte de ' || u.email, 'current'
from public.households h join auth.users u on u.id = h.created_by;

insert into public.transactions (household_id, account_id, booked_on, amount_cents, description, source, dedupe_hash)
select a.household_id, a.id, date '2026-10-01', 250000, 'SALAIRE OCTOBRE', 'demo', 'h-' || a.id
from public.accounts a;

-- ---------------------------------------------------------------------------
-- En tant qu'Amina
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
declare n int; hid_b uuid; acc_b uuid;
begin
  select count(*) into n from public.households;
  if n <> 1 then raise exception 'ECHEC isolation : Amina voit % foyers', n; end if;
  select count(*) into n from public.accounts;
  if n <> 1 then raise exception 'ECHEC isolation : Amina voit % comptes', n; end if;
  select count(*) into n from public.transactions;
  if n <> 1 then raise exception 'ECHEC isolation : Amina voit % transactions', n; end if;
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'ECHEC isolation : Amina voit % profils', n; end if;
  raise notice 'OK  lecture : Amina ne voit que son foyer, ses comptes, ses transactions';

  -- Les données système restent visibles
  select count(*) into n from public.categories where household_id is null;
  if n < 20 then raise exception 'ECHEC référentiel : % catégories système visibles', n; end if;
  select count(*) into n from public.zakat_rulesets;
  if n <> 1 then raise exception 'ECHEC référentiel : % référentiels Zakat visibles', n; end if;
  raise notice 'OK  référentiels : catégories système et référentiel Zakat lisibles';

  -- Mise à jour invisible des données de Bilal : 0 ligne touchée
  update public.transactions set amount_cents = 1 where description = 'SALAIRE OCTOBRE'
    and household_id <> (select household_id from public.household_members limit 1);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ECHEC isolation : Amina a modifié % transactions de Bilal', n; end if;
  raise notice 'OK  écriture : aucune modification possible sur le foyer de Bilal';
end $$;

-- Tentative d'insertion dans le foyer de Bilal : doit être refusée par la RLS
reset role;
select set_config('test.hid_b', h.id::text, false), set_config('test.acc_b', a.id::text, false)
from public.households h join public.accounts a on a.household_id = h.id
where h.created_by = '00000000-0000-0000-0000-00000000000b';
select set_config('test.hid_a', h.id::text, false)
from public.households h where h.created_by = '00000000-0000-0000-0000-00000000000a';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
begin
  begin
    insert into public.transactions (household_id, account_id, booked_on, amount_cents, source, dedupe_hash)
    values (current_setting('test.hid_b')::uuid, current_setting('test.acc_b')::uuid, date '2026-10-02', -100, 'manual', 'intrusion');
    raise exception 'ECHEC isolation : insertion dans le foyer de Bilal acceptée';
  exception when insufficient_privilege then
    raise notice 'OK  insertion : écriture dans un autre foyer refusée (RLS)';
  end;
end $$;

-- Calcul de Zakat : insertion autorisée, modification interdite, trace d'audit créée
do $$
declare cid uuid; n int;
begin
  insert into public.zakat_calculations (household_id, ruleset_id, ruleset_version, engine_version, as_of,
    inputs, result, zakatable_cents, nisab_cents, zakat_due_cents, is_above_nisab, status)
  values (current_setting('test.hid_a')::uuid, 'amanah-zakat', '1.0.0', '0.1.0', date '2026-11-09',
    '{}'::jsonb, '{}'::jsonb, 1000000, 600000, 25000, true, 'due')
  returning id into cid;

  begin
    update public.zakat_calculations set zakat_due_cents = 0 where id = cid;
    get diagnostics n = row_count;
    if n > 0 then raise exception 'ECHEC immutabilité : calcul de Zakat modifié'; end if;
    raise notice 'OK  immutabilité : la RLS ne permet aucune modification d''un calcul';
  exception when insufficient_privilege then
    raise notice 'OK  immutabilité : modification d''un calcul de Zakat refusée';
  end;

  select count(*) into n from public.audit_log where entity = 'zakat_calculations' and entity_id = cid;
  if n <> 1 then raise exception 'ECHEC audit : % entrées pour le calcul', n; end if;
  raise notice 'OK  audit : le calcul de Zakat est journalisé';

  begin
    delete from public.audit_log;
    raise exception 'ECHEC audit : suppression du journal acceptée';
  exception when insufficient_privilege then
    raise notice 'OK  audit : le journal est en ajout seul pour l''utilisateur';
  end;
end $$;

-- Même en superutilisateur, un calcul figé et le journal ne se modifient pas
reset role;
do $$
begin
  begin
    update public.zakat_calculations set zakat_due_cents = 0;
    raise exception 'ECHEC immutabilité : modification acceptée en superutilisateur';
  exception when insufficient_privilege then
    raise notice 'OK  immutabilité : déclencheur actif même hors RLS';
  end;
  begin
    update public.audit_log set action = 'x';
    raise exception 'ECHEC audit : modification du journal acceptée en superutilisateur';
  exception when insufficient_privilege then
    raise notice 'OK  audit : déclencheur d''ajout seul actif même hors RLS';
  end;
end $$;

-- Purification : un statut « purifié » exige une contribution liée
do $$
begin
  begin
    insert into public.purification_items (household_id, source_kind, credited_cents, occurred_on, status)
    values (current_setting('test.hid_a')::uuid, 'bank_interest', 1234, date '2026-10-31', 'purified');
    raise exception 'ECHEC purification : statut purifié sans contribution accepté';
  exception when check_violation then
    raise notice 'OK  purification : « purifié » impossible sans don enregistré';
  end;
end $$;

-- Toutes les tables du schéma public ont la RLS activée
do $$
declare missing text;
begin
  select string_agg(c.relname, ', ') into missing
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if missing is not null then raise exception 'ECHEC RLS non activée sur : %', missing; end if;
  raise notice 'OK  couverture : RLS activée sur 100 %% des tables publiques';
end $$;
