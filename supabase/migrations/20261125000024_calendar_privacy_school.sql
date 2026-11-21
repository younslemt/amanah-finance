-- =============================================================================
-- Revue finale Sprint 5 — confidentialité du calendrier et calendriers scolaires
--
-- 1. calendar_events : classification EXPLICITE (jamais déduite du libellé)
--    - visibility 'private'   : événement personnel, visible de son auteur seulement ;
--    - visibility 'household' : événement familial volontairement partagé avec le foyer ;
--    - religious = true       : événement religieux personnalisé, donnée article 9 : toujours
--      enregistré comme personnel, lu selon les règles religieuses existantes (consentement
--      en vigueur ; partage avec le foyer seulement si la personne l'a choisi dans ses
--      préférences religieuses, privé par défaut) ; effacé au retrait du consentement.
--    Les événements existants (partagés jusqu'ici) restent partagés ; les nouveaux sont
--    personnels par défaut.
-- 2. planning_preferences.school_overrides : dates scolaires corrigées ou confirmées par la
--    personne. Elles priment sur tout calcul et ne sont jamais écrasées automatiquement.
-- =============================================================================

alter table public.calendar_events
  add column visibility text not null default 'household' check (visibility in ('private', 'household')),
  add column religious boolean not null default false,
  add constraint calendar_events_religious_private check (not religious or visibility = 'private'),
  add constraint calendar_events_private_owner check (visibility = 'household' or created_by is not null);
alter table public.calendar_events alter column visibility set default 'private';

drop policy household_select on public.calendar_events;
drop policy household_insert on public.calendar_events;
drop policy household_update on public.calendar_events;
drop policy household_delete on public.calendar_events;

create or replace function public.calendar_event_readable(hid uuid, owner uuid, vis text, rel boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_household_member(hid) and case
    when rel then public.religious_readable(hid, owner)
    when vis = 'private' then owner = auth.uid()
    else true end;
$$;
create or replace function public.calendar_event_writable(hid uuid, owner uuid, vis text, rel boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.can_write_household(hid) and case
    when rel then public.religious_writable(hid, owner)
    when vis = 'private' then owner = auth.uid()
    else true end;
$$;
revoke execute on function public.calendar_event_readable(uuid, uuid, text, boolean), public.calendar_event_writable(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.calendar_event_readable(uuid, uuid, text, boolean), public.calendar_event_writable(uuid, uuid, text, boolean) to authenticated;

create policy calendar_select on public.calendar_events for select to authenticated
  using (public.calendar_event_readable(household_id, created_by, visibility, religious));
-- L'auteur est toujours la personne connectée (jamais un autre membre)
create policy calendar_insert on public.calendar_events for insert to authenticated
  with check (created_by = auth.uid() and public.calendar_event_writable(household_id, created_by, visibility, religious));
create policy calendar_update on public.calendar_events for update to authenticated
  using (public.calendar_event_writable(household_id, created_by, visibility, religious))
  -- Un membre peut modifier un événement familial partagé, mais seul l'auteur peut le rendre privé ou religieux
  with check (public.calendar_event_writable(household_id, created_by, visibility, religious)
    and (created_by = auth.uid() or (visibility = 'household' and not religious)));
create policy calendar_delete on public.calendar_events for delete to authenticated
  using (public.calendar_event_writable(household_id, created_by, visibility, religious));

-- L'auteur d'un événement ne change jamais
create or replace function public.calendar_events_keep_author()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.created_by is distinct from old.created_by or new.household_id is distinct from old.household_id then
    raise exception 'auteur et foyer d''un événement non modifiables' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists calendar_events_keep_author on public.calendar_events;
create trigger calendar_events_keep_author before update on public.calendar_events
  for each row execute function public.calendar_events_keep_author();

alter table public.planning_preferences
  add column school_overrides jsonb not null default '[]'
    check (jsonb_typeof(school_overrides) = 'array' and jsonb_array_length(school_overrides) <= 20);

-- Retrait du consentement : les événements religieux créés par la personne sont supprimés
create or replace function public.erase_my_religious_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n_pur int; n_con int; n_calc int; n_set int; n_goal int; n_fitr int; n_price int; n_dec int; n_evt int;
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
  delete from public.calendar_events where created_by = uid and religious;  get diagnostics n_evt = row_count;
  update public.planning_preferences
     set groups = array_remove(groups, 'religious'),
         interests = array(select i from unnest(interests) i where i not in ('aid-al-adha', 'aid-al-fitr', 'ramadan', 'hajj', 'omra')),
         confirmations = '[]', updated_at = now()
   where user_id = uid;
  return jsonb_build_object('purification_items', n_pur, 'contributions', n_con, 'zakat_calculations', n_calc,
                            'zakat_settings', n_set, 'goals', n_goal, 'zakat_fitr_obligations', n_fitr, 'zakat_metal_prices', n_price,
                            'suggestion_decisions', n_dec, 'calendar_events', n_evt);
end;
$$;
revoke execute on function public.erase_my_religious_data() from public, anon;
grant execute on function public.erase_my_religious_data() to authenticated;

comment on column public.calendar_events.visibility is 'private : auteur seulement ; household : partagé volontairement avec le foyer.';
comment on column public.calendar_events.religious is 'Classification explicite par l''auteur (jamais déduite du libellé) : donnée article 9.';
comment on column public.planning_preferences.school_overrides is 'Dates scolaires corrigées ou confirmées par la personne : jamais écrasées par un recalcul.';
