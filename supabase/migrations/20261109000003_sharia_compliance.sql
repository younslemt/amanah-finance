-- =============================================================================
-- Amanah Finance — Migration 0003 : moteurs de conformité
-- Référentiels de Zakat versionnés, calculs figés, purification, organisations,
-- contributions (Zakat, Sadaqah, purification : toujours distinguées).
-- =============================================================================

create type public.nisab_basis as enum ('gold', 'silver');
create type public.year_basis as enum ('lunar', 'solar');
create type public.purification_status as enum ('detected', 'confirmed', 'rejected', 'purified');
create type public.contribution_kind as enum ('zakat', 'zakat_al_fitr', 'sadaqah', 'purification', 'waqf', 'other');

-- -----------------------------------------------------------------------------
-- Prix des métaux (référentiel, alimenté par l'administrateur)
-- -----------------------------------------------------------------------------
create table public.market_prices (
  id                 uuid primary key default gen_random_uuid(),
  symbol             text not null check (symbol in ('XAU', 'XAG')),
  price_per_g_cents  bigint not null check (price_per_g_cents > 0),
  currency           char(3) not null default 'EUR',
  as_of              date not null,
  source             text not null,
  unique (symbol, currency, as_of)
);

-- -----------------------------------------------------------------------------
-- Référentiels de Zakat : un identifiant + une version immuable
-- -----------------------------------------------------------------------------
create table public.zakat_rulesets (
  id            text not null,
  version       text not null,
  title         text not null,
  parameters    jsonb not null,       -- taux, nisab en grammes, options autorisées
  references_   jsonb not null,       -- sources : AAOIFI, ECFR, écoles…
  review_status text not null default 'draft' check (review_status in ('draft', 'under_review', 'approved', 'retired')),
  reviewed_by   text,                 -- comité ou savant ayant validé
  reviewed_at   date,
  created_at    timestamptz not null default now(),
  primary key (id, version)
);

-- Réglages Zakat du foyer
create table public.zakat_settings (
  household_id     uuid primary key references public.households (id) on delete cascade,
  ruleset_id       text not null,
  ruleset_version  text not null,
  nisab_basis      public.nisab_basis not null,
  year_basis       public.year_basis not null default 'lunar',
  hawl_date        date,                -- date anniversaire choisie
  options          jsonb not null default '{}'::jsonb,
  updated_at       timestamptz not null default now(),
  foreign key (ruleset_id, ruleset_version) references public.zakat_rulesets (id, version)
);

-- Calculs figés : entrées, référentiel, résultat et explication.
create table public.zakat_calculations (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  ruleset_id        text not null,
  ruleset_version   text not null,
  engine_version    text not null,
  as_of             date not null,
  inputs            jsonb not null,
  result            jsonb not null,     -- lignes, explications, avertissements
  zakatable_cents   bigint not null,
  nisab_cents       bigint not null,
  zakat_due_cents   bigint not null check (zakat_due_cents >= 0),
  currency          char(3) not null default 'EUR',
  is_above_nisab    boolean not null,
  created_by        uuid default auth.uid(),
  created_at        timestamptz not null default now(),
  foreign key (ruleset_id, ruleset_version) references public.zakat_rulesets (id, version)
);
create index zakat_calc_household_idx on public.zakat_calculations (household_id, as_of desc);

create trigger zakat_calculations_immutable
  before update on public.zakat_calculations
  for each row execute function public.forbid_mutation();

-- -----------------------------------------------------------------------------
-- Organisations bénéficiaires (référentiel)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  country             char(2) not null default 'BE',
  website             text,
  accepts             public.contribution_kind[] not null default '{}',
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'suspended')),
  verified_at         date,
  tax_deductible_be   boolean,          -- agrément fiscal belge à vérifier
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Contributions : Zakat, Sadaqah, purification… toujours typées
-- -----------------------------------------------------------------------------
create table public.contributions (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references public.households (id) on delete cascade,
  kind                  public.contribution_kind not null,
  organization_id       uuid references public.organizations (id),
  beneficiary_label     text,             -- si l'organisation n'est pas référencée
  amount_cents          bigint not null check (amount_cents > 0),
  currency              char(3) not null default 'EUR',
  paid_on               date not null,
  proof_path            text,             -- chemin dans Supabase Storage (bucket privé)
  zakat_calculation_id  uuid references public.zakat_calculations (id) on delete set null,
  created_at            timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Purification du Riba
-- -----------------------------------------------------------------------------
create table public.purification_items (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  transaction_id   uuid references public.transactions (id) on delete set null,
  source_kind      text not null check (source_kind in ('bank_interest', 'loyalty_bonus', 'dividend_impure_share', 'manual')),
  amount_cents     bigint not null check (amount_cents > 0),
  currency         char(3) not null default 'EUR',
  occurred_on      date not null,
  status           public.purification_status not null default 'detected',
  detection_reason text,                  -- règle ou mot-clé ayant déclenché la détection
  decided_by       uuid,
  decided_at       timestamptz,
  contribution_id  uuid references public.contributions (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (transaction_id),
  check (status <> 'purified' or contribution_id is not null)
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
do $$
declare t regclass;
begin
  foreach t in array array[
  'public.zakat_settings', 'public.contributions', 'public.purification_items'
]::regclass[] loop
    perform public.apply_household_rls(t);
  end loop;
end $$;

-- Calculs : lecture et insertion seulement (pas de modification ni suppression)
alter table public.zakat_calculations enable row level security;
create policy zakat_calc_select on public.zakat_calculations for select using (public.is_household_member(household_id));
create policy zakat_calc_insert on public.zakat_calculations for insert with check (public.can_write_household(household_id));

alter table public.market_prices enable row level security;
create policy market_prices_read on public.market_prices for select to authenticated using (true);

alter table public.zakat_rulesets enable row level security;
create policy rulesets_read on public.zakat_rulesets for select to authenticated using (true);

alter table public.organizations enable row level security;
create policy organizations_read on public.organizations for select to authenticated using (true);

-- Audit
create trigger zakat_calculations_audit after insert on public.zakat_calculations
  for each row execute function public.audit_row();
create trigger purification_items_audit after insert or update or delete on public.purification_items
  for each row execute function public.audit_row();
create trigger contributions_audit after insert or update or delete on public.contributions
  for each row execute function public.audit_row();
create trigger zakat_settings_audit after insert or update on public.zakat_settings
  for each row execute function public.audit_row();
