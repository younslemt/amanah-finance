-- =============================================================================
-- Amanah Finance — Migration 0001 : fondations
-- Foyers, profils, consentements, journal d'audit, fonctions d'accès RLS.
-- Conventions :
--   * montants en centimes entiers (bigint), devise ISO 4217 sur chaque montant
--   * toutes les tables métier portent household_id et ont la RLS activée
--   * aucun identifiant bancaire n'est jamais stocké
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.household_role as enum ('owner', 'member', 'viewer');
create type public.consent_kind as enum (
  'terms',                -- conditions d'utilisation
  'privacy',              -- politique de confidentialité
  'special_category',     -- art. 9 RGPD : données pouvant révéler une conviction religieuse
  'bank_data',            -- traitement des données bancaires importées ou synchronisées
  'ai_assistant',         -- envoi de données pseudonymisées à un fournisseur d'IA
  'marketing'
);

-- -----------------------------------------------------------------------------
-- Profils et foyers
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 120),
  locale        text not null default 'fr-BE' check (locale in ('fr-BE', 'nl-BE', 'en', 'fr-FR', 'fr-LU', 'nl-NL')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.households (
  id             uuid primary key default gen_random_uuid(),
  name           text not null default 'Mon foyer' check (char_length(name) <= 120),
  base_currency  char(3) not null default 'EUR',
  country        char(2) not null default 'BE',
  -- Région belge : utile pour la fiscalité successorale (module 7)
  region         text check (region in ('BRU', 'WAL', 'VLA')),
  created_by     uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now()
);

create table public.household_members (
  household_id  uuid not null references public.households (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          public.household_role not null default 'member',
  joined_at     timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

-- -----------------------------------------------------------------------------
-- Fonctions d'accès : seule porte utilisée par les politiques RLS.
-- security definer pour éviter la récursion RLS sur household_members.
-- -----------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_write_household(hid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
      and m.role in ('owner', 'member')
  );
$$;

-- -----------------------------------------------------------------------------
-- Consentements (RGPD) : historisés, jamais écrasés
-- -----------------------------------------------------------------------------
create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          public.consent_kind not null,
  granted       boolean not null,
  document_version text not null,          -- version du texte accepté
  recorded_at   timestamptz not null default now()
);
create index consents_user_kind_idx on public.consents (user_id, kind, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Journal d'audit : ajout seul
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  household_id  uuid references public.households (id) on delete cascade,
  actor_id      uuid,
  action        text not null,             -- insert | update | delete | calculate | ...
  entity        text not null,             -- nom de table ou d'objet métier
  entity_id     uuid,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_household_idx on public.audit_log (household_id, created_at desc);

create or replace function public.forbid_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% est en ajout seul : % interdit', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();

-- Déclencheur générique d'audit, attaché aux tables sensibles
create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (household_id, actor_id, action, entity, entity_id, payload)
  values (
    (rec ->> 'household_id')::uuid,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    (rec ->> 'id')::uuid,
    rec - 'description'          -- pas de libellés bancaires dans le journal
  );
  return null;
end;
$$;

-- updated_at automatique
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Inscription : profil + foyer + appartenance créés automatiquement
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hid uuid;
begin
  insert into public.profiles (id, display_name) values (new.id, null);
  insert into public.households (created_by) values (new.id) returning id into hid;
  insert into public.household_members (household_id, user_id, role) values (hid, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.consents          enable row level security;
alter table public.audit_log         enable row level security;

create policy profiles_self_select on public.profiles for select using (id = auth.uid());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy households_member_select on public.households for select using (public.is_household_member(id));
create policy households_owner_update on public.households for update
  using (exists (select 1 from public.household_members m where m.household_id = id and m.user_id = auth.uid() and m.role = 'owner'));

create policy members_select on public.household_members for select using (public.is_household_member(household_id));

create policy consents_self_select on public.consents for select using (user_id = auth.uid());
create policy consents_self_insert on public.consents for insert with check (user_id = auth.uid());

-- L'utilisateur lit le journal de son foyer ; personne n'y écrit directement
create policy audit_member_select on public.audit_log for select using (public.is_household_member(household_id));

revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
