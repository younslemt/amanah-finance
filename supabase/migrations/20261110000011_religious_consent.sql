-- =============================================================================
-- Amanah Finance — Migration 0011 : consentement article 9 par fonction (Sprint 2, lot 0)
--
-- Choix PROVISOIRES, à confirmer par le juriste (docs/CONSENTEMENTS-ANALYSE.md) :
--  1. Les fonctions financières générales (comptes, budget, dashboard, import) ne
--     dépendent plus du consentement article 9 (base : exécution du contrat).
--  2. Les données religieuses (objectifs Hajj/Omra et leurs affectations, réglages
--     et calculs de Zakat, contributions, purification, préférences religieuses)
--     appartiennent à UNE personne (owner_id) et ne sont lisibles ou modifiables
--     qu'avec un consentement article 9 en vigueur, contrôlé par la RLS.
--  3. Foyer partagé : ces données sont privées par défaut. Un membre ne voit celles
--     d'un autre que si (a) il a lui-même consenti, (b) le propriétaire a consenti
--     et (c) le propriétaire a choisi de les partager avec son foyer.
--  4. Retrait : nouvelle ligne « refusé » ; l'utilisateur conserve ses données
--     (inaccessibles) ou les fait effacer immédiatement.
--  5. Journal d'audit : aucune valeur religieuse n'y est copiée, et les entrées
--     correspondantes ne sont visibles que de leur auteur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Consentement en vigueur et préférences religieuses
-- -----------------------------------------------------------------------------
-- Ordre d'enregistrement strict (plusieurs lignes peuvent partager le même horodatage de transaction)
alter table public.consents add column seq bigint generated always as identity;
create index consents_user_kind_seq_idx on public.consents (user_id, kind, seq desc);

create or replace function public.has_religious_consent(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.granted from public.consents c
    where c.user_id = uid and c.kind = 'special_category'
    order by c.seq desc limit 1), false);
$$;

create table public.religious_preferences (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  share_with_household  boolean not null default false,          -- privé par défaut
  purification_basis    public.purification_basis,                -- méthodologie choisie ; nulle = à déterminer
  updated_at            timestamptz not null default now()
);
comment on table public.religious_preferences is 'Données article 9 : préférences de finance islamique, propres à chaque personne.';

create trigger religious_preferences_touch before update on public.religious_preferences
  for each row execute function public.touch_updated_at();

create or replace function public.shares_religious_data(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.share_with_household from public.religious_preferences p where p.user_id = uid), false);
$$;

-- Lecture : membre du foyer, deux consentements en vigueur, et propriétaire ou partage choisi
create or replace function public.religious_readable(hid uuid, owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and public.is_household_member(hid)
     and public.has_religious_consent(auth.uid())
     and (owner = auth.uid()
          or (public.has_religious_consent(owner) and public.shares_religious_data(owner)));
$$;

-- Écriture : uniquement le propriétaire, avec un consentement en vigueur et un droit d'écriture
create or replace function public.religious_writable(hid uuid, owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and owner = auth.uid()
     and public.can_write_household(hid)
     and public.has_religious_consent(auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- 2. Propriétaire des données religieuses
-- -----------------------------------------------------------------------------
create or replace function public.first_household_member(hid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.user_id from public.household_members m where m.household_id = hid
  order by (m.role = 'owner') desc, m.joined_at asc limit 1;
$$;

-- Objectifs : seuls Hajj et Omra sont religieux
alter table public.goals add column owner_id uuid references auth.users (id) on delete cascade;
update public.goals set owner_id = public.first_household_member(household_id) where kind in ('hajj', 'omra');
delete from public.goals where kind in ('hajj', 'omra') and owner_id is null;
alter table public.goals add constraint goals_religious_owner check ((kind in ('hajj', 'omra')) = (owner_id is not null));

alter table public.zakat_settings add column owner_id uuid references auth.users (id) on delete cascade;
alter table public.zakat_calculations add column owner_id uuid references auth.users (id) on delete cascade;
alter table public.contributions add column owner_id uuid references auth.users (id) on delete cascade;
alter table public.purification_items add column owner_id uuid references auth.users (id) on delete cascade;

-- Le calcul figé n'accepte aucune modification : reprise des données existantes sans le déclencheur
alter table public.zakat_calculations disable trigger zakat_calculations_immutable;
do $$
declare t text;
begin
  foreach t in array array['zakat_settings', 'zakat_calculations', 'contributions', 'purification_items'] loop
    execute format('update public.%I set owner_id = public.first_household_member(household_id) where owner_id is null', t);
    execute format('delete from public.%I where owner_id is null', t);
    execute format('alter table public.%I alter column owner_id set default auth.uid(), alter column owner_id set not null', t);
    execute format('create index %I on public.%I (owner_id)', t || '_owner_idx', t);
  end loop;
end $$;
alter table public.zakat_calculations enable trigger zakat_calculations_immutable;

-- Réglages Zakat : un jeu par personne (la Zakat est due par chaque personne sur ses biens)
alter table public.zakat_settings drop constraint zakat_settings_pkey,
  add primary key (household_id, owner_id);

-- Le propriétaire est imposé par le serveur et ne change jamais
create or replace function public.stamp_religious_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- rôle serveur : valeur fournie conservée
  if tg_op = 'INSERT' then
    if tg_table_name = 'goals' then
      new.owner_id := case when new.kind in ('hajj', 'omra') then auth.uid() end;
    else
      new.owner_id := auth.uid();
    end if;
  elsif tg_table_name = 'goals' and (to_jsonb(new) ->> 'kind') is distinct from (to_jsonb(old) ->> 'kind') then
    raise exception 'le type d''un objectif ne peut pas être modifié' using errcode = 'check_violation';
  elsif new.owner_id is distinct from old.owner_id then
    raise exception 'le propriétaire d''une donnée religieuse ne peut pas être modifié' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
revoke execute on function public.stamp_religious_owner() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['goals', 'zakat_settings', 'contributions', 'purification_items'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.stamp_religious_owner()', t || '_religious_owner', t);
  end loop;
end $$;
create trigger zakat_calculations_religious_owner before insert on public.zakat_calculations
  for each row execute function public.stamp_religious_owner();

-- -----------------------------------------------------------------------------
-- 3. Politiques RLS
-- -----------------------------------------------------------------------------
-- Tables entièrement religieuses
do $$
declare t text;
begin
  foreach t in array array['zakat_settings', 'contributions', 'purification_items'] loop
    execute format('drop policy household_select on public.%I', t);
    execute format('drop policy household_insert on public.%I', t);
    execute format('drop policy household_update on public.%I', t);
    execute format('drop policy household_delete on public.%I', t);
    execute format('create policy religious_select on public.%I for select using (public.religious_readable(household_id, owner_id))', t);
    execute format('create policy religious_insert on public.%I for insert with check (public.religious_writable(household_id, owner_id))', t);
    execute format('create policy religious_update on public.%I for update using (public.religious_writable(household_id, owner_id)) with check (public.religious_writable(household_id, owner_id))', t);
    execute format('create policy religious_delete on public.%I for delete using (public.religious_writable(household_id, owner_id))', t);
  end loop;
end $$;

drop policy zakat_calc_select on public.zakat_calculations;
drop policy zakat_calc_insert on public.zakat_calculations;
create policy religious_select on public.zakat_calculations for select using (public.religious_readable(household_id, owner_id));
create policy religious_insert on public.zakat_calculations for insert with check (public.religious_writable(household_id, owner_id));

-- Objectifs : communs au foyer, sauf Hajj et Omra
drop policy household_select on public.goals;
drop policy household_insert on public.goals;
drop policy household_update on public.goals;
drop policy household_delete on public.goals;
create policy goals_select on public.goals for select using (
  case when owner_id is null then public.is_household_member(household_id) else public.religious_readable(household_id, owner_id) end);
create policy goals_insert on public.goals for insert with check (
  case when owner_id is null then public.can_write_household(household_id) else public.religious_writable(household_id, owner_id) end);
create policy goals_update on public.goals for update
  using (case when owner_id is null then public.can_write_household(household_id) else public.religious_writable(household_id, owner_id) end)
  with check (case when owner_id is null then public.can_write_household(household_id) else public.religious_writable(household_id, owner_id) end);
create policy goals_delete on public.goals for delete using (
  case when owner_id is null then public.can_write_household(household_id) else public.religious_writable(household_id, owner_id) end);

-- Affectations : suivent l'objectif
create or replace function public.goal_readable(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.goals g where g.id = gid and
    case when g.owner_id is null then public.is_household_member(g.household_id) else public.religious_readable(g.household_id, g.owner_id) end);
$$;
create or replace function public.goal_writable(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.goals g where g.id = gid and
    case when g.owner_id is null then public.can_write_household(g.household_id) else public.religious_writable(g.household_id, g.owner_id) end);
$$;
drop policy household_select on public.goal_allocations;
drop policy household_insert on public.goal_allocations;
drop policy household_update on public.goal_allocations;
drop policy household_delete on public.goal_allocations;
create policy allocations_select on public.goal_allocations for select using (public.is_household_member(household_id) and public.goal_readable(goal_id));
create policy allocations_insert on public.goal_allocations for insert with check (public.can_write_household(household_id) and public.goal_writable(goal_id));
create policy allocations_update on public.goal_allocations for update
  using (public.can_write_household(household_id) and public.goal_writable(goal_id))
  with check (public.can_write_household(household_id) and public.goal_writable(goal_id));
create policy allocations_delete on public.goal_allocations for delete using (public.can_write_household(household_id) and public.goal_writable(goal_id));

-- Préférences : chacun les siennes ; écriture seulement avec un consentement en vigueur
alter table public.religious_preferences enable row level security;
create policy prefs_select on public.religious_preferences for select using (user_id = auth.uid());
create policy prefs_insert on public.religious_preferences for insert with check (user_id = auth.uid() and public.has_religious_consent(auth.uid()));
create policy prefs_update on public.religious_preferences for update
  using (user_id = auth.uid() and public.has_religious_consent(auth.uid()))
  with check (user_id = auth.uid() and public.has_religious_consent(auth.uid()));
revoke all on public.religious_preferences from anon;
revoke delete on public.religious_preferences from authenticated;

-- -----------------------------------------------------------------------------
-- 4. Journal d'audit : pas de valeur religieuse, visibilité limitée à l'auteur
-- -----------------------------------------------------------------------------
create or replace function public.is_religious_entity(entity text)
returns boolean language sql immutable as $$
  select entity in ('zakat_settings', 'zakat_calculations', 'contributions', 'purification_items', 'religious_preferences');
$$;

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
  values (hid, auth.uid(), lower(tg_op), tg_table_name, (rec ->> 'id')::uuid,
          case when public.is_religious_entity(tg_table_name) then '{}'::jsonb   -- trace de l'action seulement
               else rec - 'description' end);
  return null;
end;
$$;

drop policy audit_member_select on public.audit_log;
create policy audit_member_select on public.audit_log for select using (
  public.is_household_member(household_id)
  and (not public.is_religious_entity(entity) or actor_id = auth.uid()));

-- Les entrées déjà écrites ne contiennent plus de valeur religieuse
alter table public.audit_log disable trigger audit_log_append_only;
update public.audit_log set payload = '{}'::jsonb where public.is_religious_entity(entity) and payload <> '{}'::jsonb;
alter table public.audit_log enable trigger audit_log_append_only;

-- -----------------------------------------------------------------------------
-- 5. Retrait du consentement et effacement ciblé
-- -----------------------------------------------------------------------------
-- Efface toutes les données religieuses dont l'appelant est propriétaire, dans tous ses foyers.
create or replace function public.erase_my_religious_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n_pur int; n_con int; n_calc int; n_set int; n_goal int;
begin
  if uid is null then raise exception 'non authentifié' using errcode = 'insufficient_privilege'; end if;
  delete from public.purification_items where owner_id = uid;      get diagnostics n_pur = row_count;
  delete from public.contributions where owner_id = uid;           get diagnostics n_con = row_count;
  delete from public.zakat_calculations where owner_id = uid;      get diagnostics n_calc = row_count;
  delete from public.zakat_settings where owner_id = uid;          get diagnostics n_set = row_count;
  delete from public.goals where owner_id = uid;                   get diagnostics n_goal = row_count;  -- affectations en cascade
  delete from public.religious_preferences where user_id = uid;
  return jsonb_build_object('purification_items', n_pur, 'contributions', n_con, 'zakat_calculations', n_calc,
                            'zakat_settings', n_set, 'goals', n_goal);
end;
$$;

-- Retrait : une ligne « refusé » (l'historique est conservé), puis effacement si demandé. Une seule transaction.
create or replace function public.withdraw_religious_consent(p_document_version text, p_erase boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  erased jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'non authentifié' using errcode = 'insufficient_privilege'; end if;
  insert into public.consents (user_id, kind, granted, document_version, collected_via)
  values (auth.uid(), 'special_category', false, p_document_version, 'web');
  if p_erase then erased := public.erase_my_religious_data(); end if;
  return erased;
end;
$$;

revoke execute on function public.has_religious_consent(uuid), public.shares_religious_data(uuid),
  public.religious_readable(uuid, uuid), public.religious_writable(uuid, uuid), public.first_household_member(uuid),
  public.goal_readable(uuid), public.goal_writable(uuid), public.erase_my_religious_data(),
  public.withdraw_religious_consent(text, boolean) from public, anon;
revoke execute on function public.first_household_member(uuid) from authenticated;
grant execute on function public.has_religious_consent(uuid), public.shares_religious_data(uuid),
  public.religious_readable(uuid, uuid), public.religious_writable(uuid, uuid),
  public.goal_readable(uuid), public.goal_writable(uuid), public.erase_my_religious_data(),
  public.withdraw_religious_consent(text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Marquage du schéma (export, effacement ciblé, contrôle d'accès par fonction)
-- -----------------------------------------------------------------------------
comment on column public.goals.owner_id is 'Article 9 : renseigné pour les objectifs Hajj et Omra, propres à une personne.';
comment on table public.zakat_settings is 'Article 9 : réglages Zakat d''une personne (owner_id).';
comment on table public.zakat_calculations is 'Article 9 : calculs Zakat figés d''une personne (owner_id).';
comment on table public.contributions is 'Article 9 : contributions religieuses d''une personne (owner_id).';
comment on table public.purification_items is 'Article 9 : éléments de purification d''une personne (owner_id).';

-- -----------------------------------------------------------------------------
-- 7. Suppression d'un compte : ses données religieuses partent avec lui, même dans
--    un foyer partagé (elles lui sont propres), AVANT l'anonymisation du journal.
-- -----------------------------------------------------------------------------
create or replace function public.handle_user_deletion()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := old.id;
  m record;
  successor uuid;
begin
  for m in select household_id, role from public.household_members where user_id = uid loop
    select hm.user_id into successor from public.household_members hm
    where hm.household_id = m.household_id and hm.user_id <> uid
    order by (hm.role = 'owner') desc, (hm.role = 'member') desc, hm.joined_at asc
    limit 1;

    if successor is null then
      delete from public.households where id = m.household_id;
    else
      if m.role = 'owner' and not exists (
        select 1 from public.household_members
        where household_id = m.household_id and role = 'owner' and user_id <> uid) then
        update public.household_members set role = 'owner' where household_id = m.household_id and user_id = successor;
      end if;
      update public.households set created_by = successor where id = m.household_id and created_by = uid;
      -- Données religieuses de la personne : effacées (privées, article 9)
      delete from public.purification_items where household_id = m.household_id and owner_id = uid;
      delete from public.contributions where household_id = m.household_id and owner_id = uid;
      delete from public.zakat_calculations where household_id = m.household_id and owner_id = uid;
      delete from public.zakat_settings where household_id = m.household_id and owner_id = uid;
      delete from public.goals where household_id = m.household_id and owner_id = uid;
      -- Traces nominatives anonymisées (journal en dernier)
      update public.zakat_calculations set created_by = null where household_id = m.household_id and created_by = uid;
      update public.import_batches set created_by = null where household_id = m.household_id and created_by = uid;
      update public.purification_items set decided_by = null where household_id = m.household_id and decided_by = uid;
      update public.household_persons set user_id = null where household_id = m.household_id and user_id = uid;
      delete from public.household_members where household_id = m.household_id and user_id = uid;
      update public.audit_log set actor_id = null where household_id = m.household_id and actor_id = uid;
    end if;
  end loop;
  delete from public.households h where h.created_by = uid
    and not exists (select 1 from public.household_members hm where hm.household_id = h.id and hm.user_id <> uid);
  update public.households h set created_by = null where h.created_by = uid;
  return old;
end;
$$;
revoke execute on function public.handle_user_deletion() from public, anon, authenticated;
