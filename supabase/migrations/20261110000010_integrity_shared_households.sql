-- =============================================================================
-- Amanah Finance — Migration 0010 : atomicité des écritures et foyers partagés
--
-- Défauts corrigés (revue de fin de Sprint 1) :
--  1. La création d'un objectif avec épargne initiale faisait deux écritures
--     séparées : une erreur pouvait laisser l'objectif sans son affectation.
--     Idem pour le profil (profil + foyer). → fonctions SQL, une transaction chacune.
--  2. Supprimer le compte du créateur d'un foyer partagé supprimait tout le foyer
--     (households.created_by en ON DELETE CASCADE), y compris les données des autres
--     membres. → le foyer est conservé, un autre membre en devient propriétaire,
--     et les traces nominatives de la personne supprimée sont anonymisées.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Écritures atomiques. SECURITY INVOKER : la RLS de l'appelant s'applique.
-- -----------------------------------------------------------------------------
create or replace function public.create_goal_with_allocation(
  p_household_id uuid, p_kind public.goal_kind, p_name text, p_target_cents bigint,
  p_target_date date, p_monthly_capacity_cents bigint, p_initial_cents bigint, p_allocated_on date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  gid uuid;
begin
  if p_initial_cents < 0 then raise exception 'épargne initiale négative' using errcode = 'check_violation'; end if;
  if p_initial_cents > p_target_cents then raise exception 'épargne initiale supérieure à la cible' using errcode = 'check_violation'; end if;
  insert into public.goals (household_id, kind, name, target_cents, target_date, monthly_capacity_cents)
  values (p_household_id, p_kind, p_name, p_target_cents, p_target_date, p_monthly_capacity_cents)
  returning id into gid;
  if p_initial_cents > 0 then
    insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on, note)
    values (p_household_id, gid, p_initial_cents, p_allocated_on, 'Épargne disponible à la création');
  end if;
  return gid;
end;
$$;

create or replace function public.save_profile(
  p_household_id uuid, p_display_name text, p_household_name text, p_region text
) returns void
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  update public.profiles set display_name = p_display_name, profile_completed_at = coalesce(profile_completed_at, now())
  where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'profil introuvable' using errcode = 'insufficient_privilege'; end if;
  if not public.is_household_member(p_household_id) then
    raise exception 'foyer inconnu' using errcode = 'insufficient_privilege';  -- annule aussi la mise à jour du profil
  end if;
  -- Nom et région du foyer : réservés au propriétaire ; un membre ne modifie que son profil
  if public.is_household_owner(p_household_id) then
    update public.households set name = p_household_name, region = p_region where id = p_household_id;
  end if;
end;
$$;

revoke execute on function public.create_goal_with_allocation(uuid, public.goal_kind, text, bigint, date, bigint, bigint, date) from public, anon;
revoke execute on function public.save_profile(uuid, text, text, text) from public, anon;
grant execute on function public.create_goal_with_allocation(uuid, public.goal_kind, text, bigint, date, bigint, bigint, date) to authenticated;
grant execute on function public.save_profile(uuid, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Foyers partagés : la suppression d'un utilisateur ne supprime plus le foyer
-- -----------------------------------------------------------------------------
alter table public.households alter column created_by drop not null;
alter table public.households drop constraint households_created_by_fkey,
  add constraint households_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- Anonymisation : seule modification tolérée sur les tables en ajout seul ou figées,
-- et uniquement pour remplacer un identifiant de personne par NULL.
create or replace function public.only_actor_anonymization()
returns trigger language plpgsql as $$
declare
  col text := tg_argv[0];
begin
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - col) = (to_jsonb(old) - col)
     and (to_jsonb(new) ->> col) is null and (to_jsonb(old) ->> col) is not null then
    return new;
  end if;
  if tg_op = 'DELETE' and tg_table_name = 'audit_log' and old.household_id is not null
     and not exists (select 1 from public.households h where h.id = old.household_id) then
    return old;  -- effacement en cascade d'un foyer supprimé (migration 0006)
  end if;
  raise exception '% : % interdit', tg_table_name, tg_op using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.only_actor_anonymization() from public, anon, authenticated;

drop trigger audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.only_actor_anonymization('actor_id');

drop trigger zakat_calculations_immutable on public.zakat_calculations;
create trigger zakat_calculations_immutable before update on public.zakat_calculations
  for each row execute function public.only_actor_anonymization('created_by');

-- L'horodatage d'auteur (migration 0006) doit laisser passer l'anonymisation
create or replace function public.stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_table_name in ('zakat_calculations', 'import_batches') then
      new.created_by := auth.uid();
    elsif tg_table_name = 'purification_items' then
      if tg_op = 'INSERT' or new.status is distinct from old.status then
        new.decided_by := case when new.status = 'detected' then null else auth.uid() end;
        new.decided_at := case when new.status = 'detected' then null else now() end;
      elsif new.decided_by is not null then
        -- un client ne peut pas réattribuer une décision ; seule l'anonymisation (NULL) passe
        new.decided_by := old.decided_by;
        new.decided_at := old.decided_at;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Suppression d'un utilisateur, quel que soit le chemin (l'utilisateur lui-même via
-- delete_my_account(), ou un administrateur via Supabase) : foyers partagés conservés,
-- foyers individuels effacés, traces nominatives anonymisées.
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
      -- Seul membre : le foyer et toutes ses données sont effacés (cascade)
      delete from public.households where id = m.household_id;
    else
      -- Foyer partagé : les données communes restent aux autres membres
      if m.role = 'owner' and not exists (
        select 1 from public.household_members
        where household_id = m.household_id and role = 'owner' and user_id <> uid) then
        update public.household_members set role = 'owner' where household_id = m.household_id and user_id = successor;
      end if;
      update public.households set created_by = successor where id = m.household_id and created_by = uid;
      -- Traces nominatives anonymisées (journal en dernier : les mises à jour ci-dessous sont journalisées)
      update public.zakat_calculations set created_by = null where household_id = m.household_id and created_by = uid;
      update public.import_batches set created_by = null where household_id = m.household_id and created_by = uid;
      update public.purification_items set decided_by = null where household_id = m.household_id and decided_by = uid;
      update public.household_persons set user_id = null where household_id = m.household_id and user_id = uid;
      delete from public.household_members where household_id = m.household_id and user_id = uid;
      update public.audit_log set actor_id = null where household_id = m.household_id and actor_id = uid;
    end if;
  end loop;
  -- Foyers créés par la personne dont elle n'est plus membre : rattachés à un membre ou effacés
  delete from public.households h where h.created_by = uid
    and not exists (select 1 from public.household_members hm where hm.household_id = h.id and hm.user_id <> uid);
  update public.households h set created_by = null where h.created_by = uid;
  return old;  -- profil, consentements et appartenances suivent en cascade
end;
$$;
revoke execute on function public.handle_user_deletion() from public, anon, authenticated;

create trigger on_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_deletion();

-- L'utilisateur supprime son propre compte
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
