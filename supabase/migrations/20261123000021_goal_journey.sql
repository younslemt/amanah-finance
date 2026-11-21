-- =============================================================================
-- Revue produit Sprint 5 : parcours fondé sur des décisions de l'utilisateur.
--
-- 1. goals : décisions identifiables du parcours « Créer → Planifier → Simuler → Suivre → Réaliser »
--    - plan_confirmed_on : plan d'épargne validé (« Planifier ») ;
--    - strategy_monthly_cents / strategy_chosen_on : stratégie retenue après comparaison
--      de scénarios (« Simuler »). Aucune n'est déduite d'un calcul.
--    Ces champs sont journalisés comme les autres (goal_changes, en ajout seul).
-- 2. goal_allocations.source : « initial » (épargne déclarée à la création) ou « manual »
--    (affectation enregistrée). Seule une affectation « manual » vaut « Suivre ».
-- Sécurité inchangée : RLS du foyer, article 9 pour les projets religieux, fonctions
-- SECURITY INVOKER (la RLS de l'appelant s'applique).
-- =============================================================================

alter table public.goals
  add column plan_confirmed_on date,
  add column strategy_monthly_cents bigint check (strategy_monthly_cents is null or strategy_monthly_cents >= 0),
  add column strategy_chosen_on date,
  add constraint goals_strategy_complete check ((strategy_monthly_cents is null) = (strategy_chosen_on is null));

alter table public.goal_allocations
  add column source text not null default 'manual' check (source in ('initial', 'manual'));

-- Reprise de l'existant : épargne saisie à la création (projets généraux et Hajj / Omra)
update public.goal_allocations set source = 'initial' where note = 'Épargne disponible à la création';
-- … et projets Aïd (créés par create_eid_goal, sans note) : première affectation du jour de création
update public.goal_allocations a set source = 'initial'
from public.goals g
where g.id = a.goal_id and g.kind = 'eid_al_adha' and a.note is null and a.allocated_on = g.created_at::date
  and a.id = (select a2.id from public.goal_allocations a2 where a2.goal_id = g.id order by a2.created_at, a2.id limit 1);

-- Journal : nouveaux champs suivis (même fonction, liste étendue)
create or replace function public.log_goal_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  diff jsonb := '{}'::jsonb;
  f text;
begin
  foreach f in array array['name', 'target_cents', 'target_date', 'monthly_capacity_cents', 'priority', 'status', 'realized_on',
                           'plan_confirmed_on', 'strategy_monthly_cents', 'strategy_chosen_on'] loop
    if (to_jsonb(new) -> f) is distinct from (to_jsonb(old) -> f) then
      diff := diff || jsonb_build_object(f, jsonb_build_object('from', to_jsonb(old) -> f, 'to', to_jsonb(new) -> f));
    end if;
  end loop;
  if diff <> '{}'::jsonb then
    insert into public.goal_changes (household_id, goal_id, changed_by, changes)
    values (new.household_id, new.id, auth.uid(), diff);
  end if;
  return null;
end;
$$;
revoke execute on function public.log_goal_change() from public, anon, authenticated;

-- Création : l'épargne initiale est marquée « initial » (signatures inchangées)
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
    insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on, note, source)
    values (p_household_id, gid, p_initial_cents, p_allocated_on, 'Épargne disponible à la création', 'initial');
  end if;
  return gid;
end;
$$;

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
    insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on, note, source)
    values (p_household_id, gid, p_initial_cents, p_allocated_on, 'Épargne disponible à la création', 'initial');
  end if;
  return gid;
end;
$$;

comment on column public.goals.plan_confirmed_on is 'Parcours : plan d''épargne validé par l''utilisateur (étape Planifier).';
comment on column public.goals.strategy_chosen_on is 'Parcours : stratégie retenue après comparaison de scénarios (étape Simuler).';
comment on column public.goal_allocations.source is 'initial = épargne déclarée à la création ; manual = affectation enregistrée (étape Suivre).';
