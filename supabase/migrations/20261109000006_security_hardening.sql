-- =============================================================================
-- Amanah Finance — Migration 0006 : durcissement de sécurité (Sprint 0.1)
--
-- Failles constatées par supabase/tests/security_cross_household.test.sql :
--  1. Les clés étrangères simples permettaient de rattacher une ligne de SON foyer
--     à un enregistrement d'un AUTRE foyer (compte, objectif, calcul, contribution…).
--     La RLS contrôle la ligne écrite, pas la ligne référencée.
--     → clés étrangères composites (household_id, id) : la cible doit appartenir
--       au même foyer, contrôlé par le moteur de la base lui-même.
--  2. Champs d'auteur (created_by, decided_by) fournis par le client.
--  3. Le propriétaire pouvait modifier households.created_by.
--  4. La suppression d'un compte (RGPD) échouait : journal en ajout seul.
--  5. Le rôle anon héritait des droits par défaut de Supabase sur les tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unicité composite sur les tables référencées
-- -----------------------------------------------------------------------------
alter table public.accounts            add constraint accounts_household_id_id_key            unique (household_id, id);
alter table public.bank_connections    add constraint bank_connections_household_id_id_key    unique (household_id, id);
alter table public.import_batches      add constraint import_batches_household_id_id_key      unique (household_id, id);
alter table public.transactions        add constraint transactions_household_id_id_key        unique (household_id, id);
alter table public.goals               add constraint goals_household_id_id_key               unique (household_id, id);
alter table public.zakat_calculations  add constraint zakat_calculations_household_id_id_key  unique (household_id, id);
alter table public.contributions       add constraint contributions_household_id_id_key       unique (household_id, id);

-- -----------------------------------------------------------------------------
-- 2. Clés étrangères composites (même foyer obligatoire)
--    ON DELETE SET NULL (colonne) : PostgreSQL 15+, ne vide que la référence.
-- -----------------------------------------------------------------------------
alter table public.accounts drop constraint accounts_connection_id_fkey,
  add constraint accounts_connection_same_household
  foreign key (household_id, connection_id) references public.bank_connections (household_id, id) on delete set null (connection_id);

alter table public.import_batches drop constraint import_batches_account_id_fkey,
  add constraint import_batches_account_same_household
  foreign key (household_id, account_id) references public.accounts (household_id, id) on delete cascade;

alter table public.transactions drop constraint transactions_account_id_fkey,
  add constraint transactions_account_same_household
  foreign key (household_id, account_id) references public.accounts (household_id, id) on delete cascade;

alter table public.transactions drop constraint transactions_import_batch_id_fkey,
  add constraint transactions_import_batch_same_household
  foreign key (household_id, import_batch_id) references public.import_batches (household_id, id) on delete set null (import_batch_id);

alter table public.goal_allocations drop constraint goal_allocations_goal_id_fkey,
  add constraint goal_allocations_goal_same_household
  foreign key (household_id, goal_id) references public.goals (household_id, id) on delete cascade;

alter table public.assets drop constraint assets_account_id_fkey,
  add constraint assets_account_same_household
  foreign key (household_id, account_id) references public.accounts (household_id, id) on delete set null (account_id);

alter table public.contributions drop constraint contributions_zakat_calculation_id_fkey,
  add constraint contributions_zakat_calculation_same_household
  foreign key (household_id, zakat_calculation_id) references public.zakat_calculations (household_id, id) on delete set null (zakat_calculation_id);

alter table public.purification_items drop constraint purification_items_transaction_id_fkey,
  add constraint purification_items_transaction_same_household
  foreign key (household_id, transaction_id) references public.transactions (household_id, id) on delete set null (transaction_id);

-- Une contribution liée à un élément purifié ne peut pas être supprimée seule
-- (NO ACTION : contrôlé en fin d'instruction, donc compatible avec l'effacement du foyer).
alter table public.purification_items drop constraint purification_items_contribution_id_fkey,
  add constraint purification_items_contribution_same_household
  foreign key (household_id, contribution_id) references public.contributions (household_id, id) on delete no action;

alter table public.holdings drop constraint holdings_account_id_fkey,
  add constraint holdings_account_same_household
  foreign key (household_id, account_id) references public.accounts (household_id, id) on delete set null (account_id);

-- -----------------------------------------------------------------------------
-- 3. Champs d'auteur imposés par le serveur
-- -----------------------------------------------------------------------------
create or replace function public.stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() est nul pour le rôle serveur (service_role) : la valeur fournie est alors conservée
  if auth.uid() is not null then
    if tg_table_name in ('zakat_calculations', 'import_batches') then
      new.created_by := auth.uid();
    elsif tg_table_name = 'purification_items' then
      if tg_op = 'INSERT' or new.status is distinct from old.status then
        new.decided_by := case when new.status = 'detected' then null else auth.uid() end;
        new.decided_at := case when new.status = 'detected' then null else now() end;
      else
        new.decided_by := old.decided_by;
        new.decided_at := old.decided_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger zakat_calculations_stamp before insert on public.zakat_calculations
  for each row execute function public.stamp_actor();
create trigger import_batches_stamp before insert on public.import_batches
  for each row execute function public.stamp_actor();
create trigger purification_items_stamp before insert or update on public.purification_items
  for each row execute function public.stamp_actor();

-- -----------------------------------------------------------------------------
-- 4. Foyers : seules les colonnes descriptives sont modifiables
-- -----------------------------------------------------------------------------
create or replace function public.is_household_owner(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.household_members m
                 where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner');
$$;

drop policy households_owner_update on public.households;
create policy households_owner_update on public.households for update
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));

revoke update on public.households from authenticated;
grant update (name, base_currency, country, region) on public.households to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Effacement RGPD : le journal suit le foyer supprimé
-- -----------------------------------------------------------------------------
create or replace function public.audit_log_guard()
returns trigger language plpgsql as $$
begin
  -- Seule exception : suppression en cascade d'un foyer qui n'existe plus
  if tg_op = 'DELETE' and old.household_id is not null
     and not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;
  end if;
  raise exception 'audit_log est en ajout seul : % interdit', tg_op using errcode = 'insufficient_privilege';
end;
$$;

drop trigger audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.audit_log_guard();

-- Pas de journalisation des lignes effacées avec leur foyer
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rec jsonb;
  hid uuid;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  hid := (rec ->> 'household_id')::uuid;
  if tg_op = 'DELETE' and not exists (select 1 from public.households h where h.id = hid) then
    return null;
  end if;
  insert into public.audit_log (household_id, actor_id, action, entity, entity_id, payload)
  values (hid, auth.uid(), lower(tg_op), tg_table_name, (rec ->> 'id')::uuid, rec - 'description');
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Privilèges : aucun accès anonyme, fonctions internes non exécutables
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.audit_log_guard() from public, anon, authenticated;
revoke execute on function public.stamp_actor() from public, anon, authenticated;
revoke execute on function public.forbid_mutation() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.apply_household_rls(regclass) from public, anon, authenticated;
revoke execute on function public.is_household_member(uuid) from public, anon;
revoke execute on function public.can_write_household(uuid) from public, anon;
revoke execute on function public.is_household_owner(uuid) from public, anon;
grant execute on function public.is_household_member(uuid), public.can_write_household(uuid), public.is_household_owner(uuid) to authenticated;

-- Le journal n'est jamais écrit directement par un client
revoke insert, update, delete on public.audit_log from authenticated;
