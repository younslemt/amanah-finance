-- =============================================================================
-- Amanah Finance — Migration 0014 : analyse financière, optimisation, recommandations
-- (Sprint 3). Données NON religieuses : RLS par foyer, sauf les décisions sur les
-- recommandations, propres à chaque personne.
--
-- Principe : une simulation n'écrit RIEN. Seules des décisions explicites sont
-- enregistrées : scénario sauvegardé, plafonds appliqués après confirmation,
-- nature d'une catégorie, série écartée, recommandation écartée / faite / reportée.
-- Aucune table ne touche aux opérations bancaires.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Nature fixe / variable des catégories
-- -----------------------------------------------------------------------------
create type public.category_nature as enum ('fixed', 'variable');

alter table public.categories add column default_nature public.category_nature;
update public.categories set default_nature = 'fixed'
where household_id is null and slug in ('logement', 'energie', 'assurances', 'telecom', 'impots', 'remboursement_credit', 'frais_bancaires');
update public.categories set default_nature = 'variable'
where household_id is null and kind = 'expense' and default_nature is null;

create table public.household_category_settings (
  household_id   uuid not null references public.households (id) on delete cascade,
  category_slug  text not null,
  nature         public.category_nature not null,
  updated_at     timestamptz not null default now(),
  primary key (household_id, category_slug),
  constraint household_category_settings_visible check (public.category_is_visible(household_id, category_slug))
);
select public.apply_household_rls('public.household_category_settings');
create trigger household_category_settings_touch before update on public.household_category_settings
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 2. Comptes retenus pour la réserve de précaution (null = épargne et épargne réglementée)
-- -----------------------------------------------------------------------------
alter table public.accounts add column counts_as_reserve boolean;

-- -----------------------------------------------------------------------------
-- 3. Scénarios d'optimisation enregistrés (jamais appliqués automatiquement)
-- -----------------------------------------------------------------------------
create table public.budget_scenarios (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  adjustments    jsonb not null check (jsonb_typeof(adjustments) = 'array' and jsonb_array_length(adjustments) between 1 and 50),
  baseline       jsonb not null check (jsonb_typeof(baseline) = 'object'),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  applied_at     timestamptz,
  applied_month  date check (applied_month is null or extract(day from applied_month) = 1),
  check ((applied_at is null) = (applied_month is null)),
  unique (household_id, id)
);
create index budget_scenarios_household_idx on public.budget_scenarios (household_id, created_at desc);
select public.apply_household_rls('public.budget_scenarios');
-- Contenu figé : seul le marquage « appliqué » est possible après coup
revoke update on public.budget_scenarios from authenticated;
grant update (applied_at, applied_month) on public.budget_scenarios to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Séries écartées (« ce n'est pas une dépense récurrente »)
-- -----------------------------------------------------------------------------
create table public.recurring_feedback (
  household_id  uuid not null references public.households (id) on delete cascade,
  series_key    text not null check (char_length(series_key) between 3 and 120),
  verdict       text not null default 'not_recurring' check (verdict = 'not_recurring'),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (household_id, series_key)
);
select public.apply_household_rls('public.recurring_feedback');

-- -----------------------------------------------------------------------------
-- 5. Décisions sur les recommandations : propres à chaque personne
-- -----------------------------------------------------------------------------
create table public.recommendation_feedback (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fingerprint   text not null check (char_length(fingerprint) between 2 and 300),
  status        text not null check (status in ('dismissed', 'done', 'snoozed')),
  snooze_until  date,
  updated_at    timestamptz not null default now(),
  primary key (household_id, user_id, fingerprint),
  check ((status = 'snoozed') = (snooze_until is not null))
);
alter table public.recommendation_feedback enable row level security;
create policy feedback_select on public.recommendation_feedback for select
  using (user_id = auth.uid() and public.is_household_member(household_id));
create policy feedback_insert on public.recommendation_feedback for insert
  with check (user_id = auth.uid() and public.is_household_member(household_id));
create policy feedback_update on public.recommendation_feedback for update
  using (user_id = auth.uid() and public.is_household_member(household_id))
  with check (user_id = auth.uid() and public.is_household_member(household_id));
create policy feedback_delete on public.recommendation_feedback for delete
  using (user_id = auth.uid() and public.is_household_member(household_id));
create trigger recommendation_feedback_touch before update on public.recommendation_feedback
  for each row execute function public.touch_updated_at();

revoke all on public.household_category_settings, public.budget_scenarios, public.recurring_feedback,
  public.recommendation_feedback from anon;

-- -----------------------------------------------------------------------------
-- 6. Appliquer des plafonds au budget du mois : décision explicite, en une transaction
-- -----------------------------------------------------------------------------
create or replace function public.apply_budget_lines(
  p_household_id uuid, p_month date, p_lines jsonb, p_scenario_id uuid default null
) returns integer
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if not public.can_write_household(p_household_id) then
    raise exception 'foyer inconnu' using errcode = 'insufficient_privilege';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'mois invalide' using errcode = 'check_violation';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'plafonds attendus (1 à 100)' using errcode = 'check_violation';
  end if;
  -- Chaque catégorie doit être une catégorie de dépense visible par le foyer
  if exists (
    select 1 from jsonb_to_recordset(p_lines) as l(category_slug text, limit_cents bigint)
    where l.limit_cents is null or l.limit_cents < 0
       or not exists (select 1 from public.categories c where c.slug = l.category_slug and c.kind = 'expense'
                      and (c.household_id is null or c.household_id = p_household_id))) then
    raise exception 'plafond invalide' using errcode = 'check_violation';
  end if;
  insert into public.budgets (household_id, month, category_slug, limit_cents)
  select p_household_id, p_month, l.category_slug, l.limit_cents
  from jsonb_to_recordset(p_lines) as l(category_slug text, limit_cents bigint)
  on conflict (household_id, month, category_slug) do update set limit_cents = excluded.limit_cents;
  get diagnostics n = row_count;
  if p_scenario_id is not null then
    update public.budget_scenarios set applied_at = now(), applied_month = p_month
    where id = p_scenario_id and household_id = p_household_id;
    if not found then raise exception 'scénario inconnu' using errcode = 'check_violation'; end if;
  end if;
  return n;
end;
$$;
revoke execute on function public.apply_budget_lines(uuid, date, jsonb, uuid) from public, anon;
grant execute on function public.apply_budget_lines(uuid, date, jsonb, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Suppression d'un compte : auteur des scénarios et séries écartées anonymisé (FK set null),
--    décisions sur les recommandations effacées (FK cascade). Rien d'autre à faire.
-- -----------------------------------------------------------------------------
