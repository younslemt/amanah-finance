-- =============================================================================
-- Amanah Finance — Migration 0017 : projets universels (Sprint 5, lot 5.1)
--
--  * Tous les types de projets se créent depuis l'interface : projets généraux
--    (communs au foyer, sans consentement religieux) et projets Hajj / Omra
--    (propres à une personne, article 9, inchangé).
--  * Modification d'un projet sans perte d'historique : les affectations ne sont
--    jamais touchées, et chaque modification est journalisée dans goal_changes
--    (écrit par la base seule, en ajout uniquement, lisible comme le projet).
--  * « Réaliser » : statut achieved + date de réalisation déclarée.
--  Une affectation reste une mise de côté virtuelle : aucun fonds n'est déplacé.
-- =============================================================================

alter table public.goals
  add column updated_at  timestamptz,
  add column realized_on date,
  add constraint goals_realized_when_achieved check ((status = 'achieved') = (realized_on is not null));

create table public.goal_changes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null,
  goal_id       uuid not null,
  changed_by    uuid default auth.uid(),
  changed_at    timestamptz not null default now(),
  changes       jsonb not null,
  foreign key (household_id, goal_id) references public.goals (household_id, id) on delete cascade
);
create index goal_changes_goal_idx on public.goal_changes (goal_id, changed_at);

-- Journal : seuls les champs modifiés, avant / après. Fonction du propriétaire de la table :
-- un client ne peut ni écrire ni effacer cet historique.
create or replace function public.log_goal_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  diff jsonb := '{}'::jsonb;
  f text;
begin
  foreach f in array array['name', 'target_cents', 'target_date', 'monthly_capacity_cents', 'priority', 'status', 'realized_on'] loop
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
create trigger goals_log_change after update on public.goals
  for each row execute function public.log_goal_change();

create or replace function public.touch_goal()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.touch_goal() from public, anon, authenticated;
create trigger goals_touch before update on public.goals
  for each row execute function public.touch_goal();

alter table public.goal_changes enable row level security;
-- Même visibilité que le projet (projets religieux : article 9 via goal_readable)
create policy goal_changes_select on public.goal_changes for select
  using (public.is_household_member(household_id) and public.goal_readable(goal_id));
revoke all on public.goal_changes from anon;
revoke insert, update, delete on public.goal_changes from authenticated;

comment on table public.goal_changes is 'Historique des modifications des projets (append-only, écrit par la base).';

-- Suppression d'un compte : auteur des modifications anonymisé dans les foyers partagés
create or replace function public.anonymize_goal_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.goal_changes set changed_by = null where changed_by = old.id;
  return old;
end;
$$;
revoke execute on function public.anonymize_goal_changes() from public, anon, authenticated;
create trigger auth_users_anonymize_goal_changes before delete on auth.users
  for each row execute function public.anonymize_goal_changes();
