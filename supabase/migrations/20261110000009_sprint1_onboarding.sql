-- =============================================================================
-- Amanah Finance — Migration 0009 : parcours d'accueil (Sprint 1)
--  * Consentements : empreinte du texte accepté (preuve de la version exacte)
--  * Profil : date de complétion du profil
--  * Catégories personnelles : libellé lisible
--  * Objectifs : capacité d'épargne mensuelle déclarée
--  * Suppression du compte par l'utilisateur lui-même (RGPD, art. 17)
-- =============================================================================

-- Consentements ---------------------------------------------------------------
alter table public.consents
  add column document_hash text check (document_hash ~ '^[0-9a-f]{64}$'),   -- SHA-256 du texte présenté
  add column collected_via text not null default 'web' check (collected_via in ('web', 'mobile', 'support'));

comment on column public.consents.document_hash is 'SHA-256 hexadécimal du texte exact présenté à l''utilisateur.';

-- Un consentement accordé doit porter la preuve du texte accepté
alter table public.consents
  add constraint consents_granted_has_hash check (not granted or document_hash is not null);

-- Historique des consentements : ni modification ni suppression par le client
revoke update, delete on public.consents from authenticated;

-- Profil ----------------------------------------------------------------------
alter table public.profiles
  add column profile_completed_at timestamptz;

-- Le profil est modifiable par son titulaire, sauf l'identifiant
revoke update on public.profiles from authenticated;
grant update (display_name, locale, profile_completed_at) on public.profiles to authenticated;

-- Catégories personnelles -----------------------------------------------------
alter table public.categories
  add column label text check (char_length(label) between 1 and 60);
-- Une catégorie créée par un foyer doit avoir un libellé et un code préfixé
alter table public.categories
  add constraint categories_custom_labelled check (
    household_id is null or (label is not null and slug ~ '^perso-[a-z0-9-]{1,50}$'));

-- Objectifs -------------------------------------------------------------------
alter table public.goals
  add column monthly_capacity_cents bigint check (monthly_capacity_cents >= 0);

-- Budgets et transactions : la catégorie doit exister (système ou du foyer) ----
create or replace function public.category_is_visible(hid uuid, cat text)
returns boolean language sql stable security definer set search_path = public as $$
  select cat is null or exists (
    select 1 from public.categories c
    where c.slug = cat and (c.household_id is null or c.household_id = hid));
$$;
revoke execute on function public.category_is_visible(uuid, text) from public, anon;
grant execute on function public.category_is_visible(uuid, text) to authenticated;

alter table public.transactions
  add constraint transactions_category_visible check (public.category_is_visible(household_id, category_slug)) not valid;
alter table public.budgets
  add constraint budgets_category_visible check (public.category_is_visible(household_id, category_slug)) not valid;

-- Suppression du compte -------------------------------------------------------
-- Supprime l'utilisateur appelant ; la cascade efface profil, consentements,
-- foyers dont il est créateur et toutes leurs données (migration 0006).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'non authentifié' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = uid;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
