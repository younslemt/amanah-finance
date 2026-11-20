-- =============================================================================
-- Amanah Finance — Migration 0019 : « Préparer mon Aïd » (Sprint 5, lot 5.2)
--
--  * L'Aïd al-Adha est un projet religieux propre à une personne (article 9), comme
--    le Hajj et l'Omra : propriétaire imposé, RLS religious_readable / religious_writable.
--  * Budget détaillé (sacrifice ou quote-part, frais, organisme, contributions familiales) ;
--    la cible du projet est toujours recalculée par la base (coût total − famille).
--  * Date saisie par l'utilisateur. « Confirmée » exige une source. L'estimation affichée
--    est conservée à part, avec sa méthode : elle n'est jamais une confirmation.
--  * Reconduction : un projet par personne et par année civile ; une année ne se reconduit
--    qu'une fois, après réalisation. Aucun montant n'est repris de l'année précédente.
--  * Historique : modifications de la date et du budget journalisées dans goal_changes.
-- =============================================================================

create or replace function public.is_religious_goal_kind(k public.goal_kind)
returns boolean language sql immutable as $$ select k in ('hajj', 'omra', 'eid_al_adha'); $$;

alter table public.goals drop constraint goals_religious_owner,
  add constraint goals_religious_owner check (public.is_religious_goal_kind(kind) = (owner_id is not null));

create or replace function public.stamp_religious_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- rôle serveur : valeur fournie conservée
  if tg_op = 'INSERT' then
    if tg_table_name = 'goals' then
      new.owner_id := case when public.is_religious_goal_kind(new.kind) then auth.uid() end;
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

create table public.eid_plans (
  goal_id                    uuid primary key,
  household_id               uuid not null,
  owner_id                   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  civil_year                 smallint not null check (civil_year between 2000 and 2100),
  sacrifice_cents            bigint not null default 0 check (sacrifice_cents >= 0),
  extra_costs_cents          bigint not null default 0 check (extra_costs_cents >= 0),
  organization_cents         bigint not null default 0 check (organization_cents >= 0),
  family_contribution_cents  bigint not null default 0 check (family_contribution_cents >= 0),
  date_status                text not null default 'entered' check (date_status in ('entered', 'confirmed')),
  date_source                text check (char_length(btrim(date_source)) between 3 and 200),
  estimated_date             date,
  estimate_method            text check (estimate_method in ('tabular')),
  previous_goal_id           uuid,
  created_at                 timestamptz not null default now(),
  check (sacrifice_cents + extra_costs_cents + organization_cents > family_contribution_cents),
  check (date_status <> 'confirmed' or date_source is not null),
  check ((estimated_date is null) = (estimate_method is null)),
  foreign key (household_id, goal_id) references public.goals (household_id, id) on delete cascade,
  foreign key (household_id, previous_goal_id) references public.goals (household_id, id) on delete set null (previous_goal_id),
  unique (household_id, owner_id, civil_year),
  unique (previous_goal_id)
);
create index eid_plans_owner_idx on public.eid_plans (owner_id);
comment on table public.eid_plans is 'Article 9 : préparation de l''Aïd al-Adha d''une personne (owner_id), une année civile par projet.';
comment on column public.eid_plans.estimated_date is 'Estimation affichée (calendrier tabulaire), conservée pour traçabilité ; jamais une confirmation.';

create trigger eid_plans_religious_owner before insert or update on public.eid_plans
  for each row execute function public.stamp_religious_owner();

-- Cohérence : projet Aïd de la même personne ; reconduction contrôlée ; champs d'identité figés
create or replace function public.eid_plan_guard()
returns trigger language plpgsql as $$
declare
  g record;
  prev record;
begin
  -- Suppression du projet précédent (clé étrangère « set null ») : seul le lien disparaît
  if tg_op = 'UPDATE' and new.previous_goal_id is null and old.previous_goal_id is not null
     and (to_jsonb(new) - 'previous_goal_id') = (to_jsonb(old) - 'previous_goal_id') then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.goal_id <> old.goal_id or new.civil_year <> old.civil_year
       or new.previous_goal_id is distinct from old.previous_goal_id and new.previous_goal_id is not null) then
    raise exception 'année, projet et reconduction d''un Aïd ne sont pas modifiables' using errcode = 'check_violation';
  end if;
  select kind, owner_id into g from public.goals where household_id = new.household_id and id = new.goal_id;
  if not found or g.kind <> 'eid_al_adha' or g.owner_id is distinct from new.owner_id then
    raise exception 'le plan doit être rattaché à un projet Aïd de la même personne' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.previous_goal_id is not null then
    select gg.kind, gg.owner_id, gg.status, ep.civil_year into prev
    from public.goals gg left join public.eid_plans ep on ep.goal_id = gg.id
    where gg.household_id = new.household_id and gg.id = new.previous_goal_id;
    if not found or prev.kind <> 'eid_al_adha' or prev.owner_id is distinct from new.owner_id
       or prev.status <> 'achieved' or prev.civil_year is distinct from new.civil_year - 1 then
      raise exception 'reconduction refusée : Aïd précédent de la même personne, réalisé, de l''année civile précédente requis' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.eid_plan_guard() from public, anon, authenticated;
create trigger eid_plans_zz_guard before insert or update on public.eid_plans
  for each row execute function public.eid_plan_guard();

-- La cible du projet suit toujours le budget (coût total − contributions familiales)
create or replace function public.eid_sync_target()
returns trigger language plpgsql as $$
begin
  update public.goals
  set target_cents = new.sacrifice_cents + new.extra_costs_cents + new.organization_cents - new.family_contribution_cents
  where household_id = new.household_id and id = new.goal_id
    and target_cents is distinct from new.sacrifice_cents + new.extra_costs_cents + new.organization_cents - new.family_contribution_cents;
  return null;
end;
$$;
revoke execute on function public.eid_sync_target() from public, anon, authenticated;
create trigger eid_plans_sync_target after insert or update on public.eid_plans
  for each row execute function public.eid_sync_target();

-- Historique des modifications de date et de budget (même journal que les projets)
create or replace function public.log_eid_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  diff jsonb := '{}'::jsonb;
  f text;
begin
  foreach f in array array['date_status', 'date_source', 'estimated_date', 'sacrifice_cents', 'extra_costs_cents', 'organization_cents', 'family_contribution_cents'] loop
    if (to_jsonb(new) -> f) is distinct from (to_jsonb(old) -> f) then
      diff := diff || jsonb_build_object(f, jsonb_build_object('from', to_jsonb(old) -> f, 'to', to_jsonb(new) -> f));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.goal_changes (household_id, goal_id, changed_by, changes) values (new.household_id, new.goal_id, auth.uid(), diff);
  end if;
  return null;
end;
$$;
revoke execute on function public.log_eid_change() from public, anon, authenticated;
create trigger eid_plans_log_change after update on public.eid_plans
  for each row execute function public.log_eid_change();

alter table public.eid_plans enable row level security;
create policy religious_select on public.eid_plans for select using (public.religious_readable(household_id, owner_id));
create policy religious_insert on public.eid_plans for insert with check (public.religious_writable(household_id, owner_id));
create policy religious_update on public.eid_plans for update using (public.religious_writable(household_id, owner_id)) with check (public.religious_writable(household_id, owner_id));
create policy religious_delete on public.eid_plans for delete using (public.religious_writable(household_id, owner_id));
revoke all on public.eid_plans from anon;

-- Création (ou reconduction) atomique : projet, plan et épargne initiale ensemble
create or replace function public.create_eid_goal(
  p_household_id uuid, p_name text, p_civil_year smallint,
  p_sacrifice_cents bigint, p_extra_costs_cents bigint, p_organization_cents bigint, p_family_contribution_cents bigint,
  p_target_date date, p_date_status text, p_date_source text, p_estimated_date date,
  p_monthly_capacity_cents bigint, p_initial_cents bigint, p_allocated_on date, p_previous_goal_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  to_save bigint := p_sacrifice_cents + p_extra_costs_cents + p_organization_cents - p_family_contribution_cents;
  gid uuid;
begin
  if to_save <= 0 then raise exception 'aucun montant à mettre de côté' using errcode = 'check_violation'; end if;
  if p_initial_cents < 0 or p_initial_cents > to_save then raise exception 'épargne initiale invalide' using errcode = 'check_violation'; end if;
  insert into public.goals (household_id, kind, name, target_cents, target_date, monthly_capacity_cents)
  values (p_household_id, 'eid_al_adha', p_name, to_save, p_target_date, p_monthly_capacity_cents)
  returning id into gid;
  insert into public.eid_plans (goal_id, household_id, civil_year, sacrifice_cents, extra_costs_cents, organization_cents,
    family_contribution_cents, date_status, date_source, estimated_date, estimate_method, previous_goal_id)
  values (gid, p_household_id, p_civil_year, p_sacrifice_cents, p_extra_costs_cents, p_organization_cents,
    p_family_contribution_cents, p_date_status, nullif(btrim(p_date_source), ''), p_estimated_date,
    case when p_estimated_date is null then null else 'tabular' end, p_previous_goal_id);
  if p_initial_cents > 0 then
    insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on)
    values (p_household_id, gid, p_initial_cents, p_allocated_on);
  end if;
  return gid;
end;
$$;
revoke execute on function public.create_eid_goal(uuid, text, smallint, bigint, bigint, bigint, bigint, date, text, text, date, bigint, bigint, date, uuid) from public, anon;
grant execute on function public.create_eid_goal(uuid, text, smallint, bigint, bigint, bigint, bigint, date, text, text, date, bigint, bigint, date, uuid) to authenticated;

-- Effacement au retrait du consentement : les projets Aïd partent avec les goals de la personne
-- (cascade), y compris leurs plans et leur historique.
