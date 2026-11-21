-- =============================================================================
-- Revue finale Sprint 5 (2) : événements religieux du calendrier STRICTEMENT privés.
--
-- religious_readable(hid, owner) autorise la lecture des données religieuses d'un membre
-- consentant qui a choisi le partage global (religious_preferences.share_with_household).
-- Pour les événements religieux personnalisés du calendrier, ce partage global ne
-- s'applique pas : seul leur auteur les voit (avec son consentement en vigueur).
-- Un partage volontaire événement par événement pourra être étudié plus tard.
-- Les autres règles (événements personnels, familiaux, autres données religieuses) sont inchangées.
-- =============================================================================
create or replace function public.calendar_event_readable(hid uuid, owner uuid, vis text, rel boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.is_household_member(hid) and case
    -- Religieux : l'auteur seulement, avec consentement (jamais via le partage religieux global)
    when rel then owner = auth.uid() and public.religious_readable(hid, owner)
    when vis = 'private' then owner = auth.uid()
    else true end;
$$;
