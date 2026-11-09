-- =============================================================================
-- Amanah Finance — Migration 0004 : extensions préparées (hors MVP)
-- Personnes du foyer (charges familiales, succession), titres, positions et
-- résultats de screening. Tables créées et protégées, aucun écran en MVP.
-- =============================================================================

create type public.person_relation as enum ('self', 'spouse', 'child', 'parent', 'sibling', 'grandchild', 'other');
create type public.screening_verdict as enum ('compliant', 'non_compliant', 'needs_review', 'insufficient_data');

-- Personnes du foyer : pas forcément des utilisateurs de l'application.
-- Minimisation : pas de date de naissance complète, seulement l'année.
create table public.household_persons (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  first_name     text not null check (char_length(first_name) <= 80),
  relation       public.person_relation not null,
  gender         text check (gender in ('female', 'male')),  -- requis pour le calcul des parts (Fara'id)
  birth_year     smallint check (birth_year between 1900 and 2100),
  is_dependent   boolean not null default false,
  created_at     timestamptz not null default now()
);

-- Titres : référentiel partagé
create table public.securities (
  id          uuid primary key default gen_random_uuid(),
  isin        text unique check (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  name        text not null,
  asset_class text not null check (asset_class in ('equity', 'etf', 'fund', 'bond', 'sukuk', 'other')),
  currency    char(3) not null default 'EUR'
);

-- Positions détenues par le foyer
create table public.holdings (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  account_id     uuid references public.accounts (id) on delete set null,
  security_id    uuid not null references public.securities (id),
  quantity       numeric(20, 6) not null check (quantity >= 0),
  value_cents    bigint not null default 0,
  currency       char(3) not null default 'EUR',
  held_for       text not null default 'long_term' check (held_for in ('trading', 'long_term')),
  valued_on      date not null default current_date
);

-- Méthodologies et résultats de screening (AAOIFI, critères éthiques)
create table public.screening_methodologies (
  id          text not null,
  version     text not null,
  title       text not null,
  criteria    jsonb not null,      -- seuils et définitions des ratios
  references_ jsonb not null,
  primary key (id, version)
);

create table public.screening_results (
  id                 uuid primary key default gen_random_uuid(),
  security_id        uuid not null references public.securities (id) on delete cascade,
  methodology_id     text not null,
  methodology_version text not null,
  verdict            public.screening_verdict not null,
  ratios             jsonb not null,  -- valeurs calculées et données sources
  impure_income_ratio numeric(7, 6),  -- sert à la purification des dividendes
  data_as_of         date not null,
  computed_at        timestamptz not null default now(),
  foreign key (methodology_id, methodology_version) references public.screening_methodologies (id, version)
);

do $$
declare t regclass;
begin
  foreach t in array array[
  'public.household_persons', 'public.holdings'
]::regclass[] loop
    perform public.apply_household_rls(t);
  end loop;
end $$;

alter table public.securities enable row level security;
create policy securities_read on public.securities for select to authenticated using (true);
alter table public.screening_methodologies enable row level security;
create policy methodologies_read on public.screening_methodologies for select to authenticated using (true);
alter table public.screening_results enable row level security;
create policy screening_read on public.screening_results for select to authenticated using (true);
