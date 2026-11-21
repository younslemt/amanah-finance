-- =============================================================================
-- Revue produit — suggestions de projets et calendrier financier familial
--
-- 1. « Autre projet religieux » protégé comme Hajj / Omra / Aïd (owner_id, RLS article 9).
-- 2. goals : modèle d'origine (template_id), occurrence annuelle (occurrence_year) et
--    occurrence précédente (previous_goal_id) pour les projets annuels. La reconduction est
--    une décision de la personne : une seule fois, depuis une occurrence réalisée du même
--    modèle, année suivante ; aucune affectation n'est reprise.
-- 3. Préférences de suggestion et décisions (reporter / ne plus proposer) : PRIVÉES à chaque
--    personne (elles peuvent révéler une pratique religieuse) ; effacées pour la partie
--    religieuse au retrait du consentement.
-- 4. Événements personnalisés du calendrier familial : partagés par le foyer.
-- Aucune suggestion n'est stockée : elles sont recalculées par le moteur déterministe.
-- =============================================================================

create or replace function public.is_religious_goal_kind(k public.goal_kind)
returns boolean language sql immutable as $$ select k in ('hajj', 'omra', 'eid_al_adha', 'religious_other'); $$;

-- ---------------------------------------------------------------------------
-- 2. Projets issus d'un modèle, projets annuels
-- ---------------------------------------------------------------------------
alter table public.goals
  add column template_id text check (template_id ~ '^[a-z0-9-]{2,40}$'),
  add column occurrence_year smallint check (occurrence_year between 2000 and 2100),
  add column previous_goal_id uuid references public.goals (id) on delete set null,
  add constraint goals_renewed_once unique (previous_goal_id),
  add constraint goals_renewal_has_occurrence check (previous_goal_id is null or (template_id is not null and occurrence_year is not null));

create or replace function public.goal_template_guard()
returns trigger language plpgsql security invoker set search_path = public as $$
declare prev record;
begin
  if tg_op = 'UPDATE' then
    -- Mise à null par la clé étrangère (occurrence précédente supprimée) : autorisée
    if new.previous_goal_id is null and old.previous_goal_id is not null
       and new.template_id is not distinct from old.template_id and new.occurrence_year is not distinct from old.occurrence_year then
      return new;
    end if;
    if new.template_id is distinct from old.template_id or new.occurrence_year is distinct from old.occurrence_year
       or new.previous_goal_id is distinct from old.previous_goal_id then
      raise exception 'l''origine d''un projet (modèle, occurrence) ne peut pas être modifiée' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if new.previous_goal_id is not null then
    -- Lecture avec la RLS de l'appelant : un projet invisible (autre foyer, projet religieux
    -- d'une autre personne) ne peut pas être reconduit
    select household_id, status, template_id, occurrence_year into prev from public.goals where id = new.previous_goal_id;
    if not found or prev.household_id <> new.household_id or prev.status <> 'achieved'
       or prev.template_id is distinct from new.template_id or new.occurrence_year <> prev.occurrence_year + 1 then
      raise exception 'reconduction refusée : occurrence précédente réalisée, même modèle, année suivante' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger goal_template_guard before insert or update on public.goals
  for each row execute function public.goal_template_guard();

-- Création atomique (projet + épargne initiale), désormais avec l'origine du projet
drop function public.create_goal_with_allocation(uuid, public.goal_kind, text, bigint, date, bigint, bigint, date);
create function public.create_goal_with_allocation(
  p_household_id uuid, p_kind public.goal_kind, p_name text, p_target_cents bigint,
  p_target_date date, p_monthly_capacity_cents bigint, p_initial_cents bigint, p_allocated_on date,
  p_template_id text default null, p_occurrence_year smallint default null, p_previous_goal_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  gid uuid;
begin
  if p_initial_cents < 0 then raise exception 'épargne initiale négative' using errcode = 'check_violation'; end if;
  if p_initial_cents > p_target_cents then raise exception 'épargne initiale supérieure à la cible' using errcode = 'check_violation'; end if;
  insert into public.goals (household_id, kind, name, target_cents, target_date, monthly_capacity_cents, template_id, occurrence_year, previous_goal_id)
  values (p_household_id, p_kind, p_name, p_target_cents, p_target_date, p_monthly_capacity_cents, p_template_id, p_occurrence_year, p_previous_goal_id)
  returning id into gid;
  if p_initial_cents > 0 then
    insert into public.goal_allocations (household_id, goal_id, amount_cents, allocated_on, note, source)
    values (p_household_id, gid, p_initial_cents, p_allocated_on, 'Épargne disponible à la création', 'initial');
  end if;
  return gid;
end;
$$;
revoke execute on function public.create_goal_with_allocation(uuid, public.goal_kind, text, bigint, date, bigint, bigint, date, text, smallint, uuid) from public, anon;
grant execute on function public.create_goal_with_allocation(uuid, public.goal_kind, text, bigint, date, bigint, bigint, date, text, smallint, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Préférences et décisions de suggestion (privées)
-- ---------------------------------------------------------------------------
create table public.planning_preferences (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  household_id   uuid not null references public.households (id) on delete cascade,
  groups         text[] not null default array['religious', 'family', 'finance', 'wealth']
                   check (groups <@ array['religious', 'family', 'finance', 'wealth']),
  has_children   boolean,
  has_vehicle    boolean,
  interests      text[] not null default '{}' check (cardinality(interests) <= 30),
  school_calendar text not null default 'be-fwb' check (school_calendar in ('be-fwb', 'be-vl', 'custom')),
  custom_school  jsonb check (custom_school is null or jsonb_typeof(custom_school) = 'object'),
  confirmations  jsonb not null default '[]' check (jsonb_typeof(confirmations) = 'array' and jsonb_array_length(confirmations) <= 20),
  updated_at     timestamptz not null default now()
);

create table public.suggestion_decisions (
  user_id        uuid not null references auth.users (id) on delete cascade,
  household_id   uuid not null references public.households (id) on delete cascade,
  suggestion_id  text not null check (suggestion_id ~ '^[a-z0-9-]{2,40}(:[0-9]{4})?$'),
  status         text not null check (status in ('snoozed', 'dismissed')),
  until          date,
  decided_at     timestamptz not null default now(),
  -- Décision sur un modèle religieux : effacée au retrait du consentement
  religious      boolean generated always as (split_part(suggestion_id, ':', 1) in ('aid-al-adha', 'aid-al-fitr', 'ramadan', 'hajj', 'omra')) stored,
  primary key (user_id, suggestion_id),
  check ((status = 'snoozed') = (until is not null))
);

do $$
declare t text;
begin
  foreach t in array array['planning_preferences', 'suggestion_decisions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (user_id = auth.uid() and public.is_household_member(household_id))
      with check (user_id = auth.uid() and public.is_household_member(household_id))$p$, t || '_own', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Calendrier familial : événements personnalisés (foyer)
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  label         text not null check (char_length(btrim(label)) between 2 and 80),
  event_date    date not null,
  yearly        boolean not null default false,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index calendar_events_household on public.calendar_events (household_id, event_date);
select public.apply_household_rls('public.calendar_events');
revoke all on public.calendar_events from anon;

-- ---------------------------------------------------------------------------
-- Retrait du consentement religieux : effacement étendu aux suggestions religieuses
-- ---------------------------------------------------------------------------
create or replace function public.erase_my_religious_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n_pur int; n_con int; n_calc int; n_set int; n_goal int; n_fitr int; n_price int; n_dec int;
begin
  if uid is null then raise exception 'non authentifié' using errcode = 'insufficient_privilege'; end if;
  delete from public.purification_items where owner_id = uid;      get diagnostics n_pur = row_count;
  delete from public.contributions where owner_id = uid;           get diagnostics n_con = row_count;
  delete from public.zakat_calculations where owner_id = uid;      get diagnostics n_calc = row_count;
  delete from public.zakat_fitr_obligations where owner_id = uid;  get diagnostics n_fitr = row_count;
  delete from public.zakat_metal_prices where owner_id = uid;      get diagnostics n_price = row_count;
  delete from public.zakat_settings where owner_id = uid;          get diagnostics n_set = row_count;
  delete from public.goals where owner_id = uid;                   get diagnostics n_goal = row_count;
  delete from public.religious_preferences where user_id = uid;
  delete from public.suggestion_decisions where user_id = uid and religious; get diagnostics n_dec = row_count;
  update public.planning_preferences
     set groups = array_remove(groups, 'religious'),
         interests = array(select i from unnest(interests) i where i not in ('aid-al-adha', 'aid-al-fitr', 'ramadan', 'hajj', 'omra')),
         confirmations = '[]', updated_at = now()
   where user_id = uid;
  return jsonb_build_object('purification_items', n_pur, 'contributions', n_con, 'zakat_calculations', n_calc,
                            'zakat_settings', n_set, 'goals', n_goal, 'zakat_fitr_obligations', n_fitr, 'zakat_metal_prices', n_price,
                            'suggestion_decisions', n_dec);
end;
$$;
revoke execute on function public.erase_my_religious_data() from public, anon;
grant execute on function public.erase_my_religious_data() to authenticated;

comment on table public.planning_preferences is 'Préférences de suggestions de projets, déclarées par la personne (jamais déduites). Privées.';
comment on table public.suggestion_decisions is 'Suggestions reportées ou écartées. Privées ; les décisions religieuses sont effacées au retrait du consentement.';
comment on table public.calendar_events is 'Échéances personnalisées du calendrier financier familial (une date n''est pas une obligation financière).';
