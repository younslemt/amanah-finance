-- =============================================================================
-- Amanah Finance — Migration 0002 : noyau financier
-- Connexions bancaires, comptes, imports, transactions, catégories, budgets,
-- objectifs (enveloppes virtuelles), patrimoine simplifié.
-- =============================================================================

create type public.banking_provider as enum ('demo', 'csv', 'manual', 'enable_banking', 'tink', 'salt_edge');
create type public.connection_status as enum ('pending', 'active', 'expired', 'revoked', 'error');
create type public.account_type as enum ('current', 'savings', 'regulated_savings', 'credit_card', 'loan', 'cash', 'investment', 'pension', 'other');
create type public.category_kind as enum ('income', 'expense', 'transfer');
create type public.goal_kind as enum ('hajj', 'omra', 'children_education', 'real_estate', 'retirement', 'family_savings', 'emergency_fund', 'personal');
create type public.goal_status as enum ('active', 'paused', 'achieved', 'archived');
create type public.asset_kind as enum ('cash', 'bank_balance', 'gold', 'silver', 'jewelry_personal', 'stocks_funds', 'pension', 'group_insurance', 'life_insurance', 'real_estate_residence', 'real_estate_investment', 'business_inventory', 'business_cash', 'receivable', 'vehicle', 'other');
create type public.liability_kind as enum ('mortgage', 'consumer_loan', 'family_loan', 'credit_card', 'tax_due', 'business_debt', 'other');

-- -----------------------------------------------------------------------------
-- Établissements (référentiel, lecture pour tous les utilisateurs connectés)
-- -----------------------------------------------------------------------------
create table public.institutions (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  bic       text,
  country   char(2) not null default 'BE',
  unique (name, country)
);

-- -----------------------------------------------------------------------------
-- Connexions PSD2 : uniquement des références. Le jeton d'accès est chiffré
-- dans Supabase Vault et référencé par vault_secret_id.
-- -----------------------------------------------------------------------------
create table public.bank_connections (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  provider         public.banking_provider not null,
  institution_id   uuid references public.institutions (id),
  consent_ref      text,
  status           public.connection_status not null default 'pending',
  scope            jsonb not null default '[]'::jsonb,
  expires_at       timestamptz,
  vault_secret_id  uuid,
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Comptes
-- -----------------------------------------------------------------------------
create table public.accounts (
  id                     uuid primary key default gen_random_uuid(),
  household_id           uuid not null references public.households (id) on delete cascade,
  connection_id          uuid references public.bank_connections (id) on delete set null,
  institution_id         uuid references public.institutions (id),
  name                   text not null check (char_length(name) <= 120),
  type                   public.account_type not null default 'current',
  currency               char(3) not null default 'EUR',
  iban_last4             text check (iban_last4 ~ '^[0-9A-Z]{4}$'),  -- jamais l'IBAN complet
  opening_balance_cents  bigint not null default 0,
  is_interest_bearing    boolean not null default false,
  external_id            text,
  archived               boolean not null default false,
  created_at             timestamptz not null default now()
);
create index accounts_household_idx on public.accounts (household_id);

create table public.import_batches (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  account_id       uuid not null references public.accounts (id) on delete cascade,
  source           public.banking_provider not null,
  file_name        text,
  csv_profile      text,
  row_count        integer not null default 0,
  imported_count   integer not null default 0,
  duplicate_count  integer not null default 0,
  error_count      integer not null default 0,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Catégories : household_id null = catégorie système (lecture seule)
-- -----------------------------------------------------------------------------
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references public.households (id) on delete cascade,
  slug          text not null,
  parent_slug   text,
  kind          public.category_kind not null,
  is_essential  boolean not null default false,   -- sert au calcul de la réserve de précaution
  is_interest   boolean not null default false,   -- revenus d'intérêts : alimentent la purification
  unique nulls not distinct (household_id, slug)
);

create table public.categorization_rules (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references public.households (id) on delete cascade,
  pattern       text not null,                    -- sous-chaîne normalisée (sans accents, majuscules)
  category_slug text not null,
  direction     text check (direction in ('credit', 'debit')),
  priority      integer not null default 100,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Transactions : modèle canonique commun à demo, CSV et PSD2
-- -----------------------------------------------------------------------------
create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  account_id         uuid not null references public.accounts (id) on delete cascade,
  booked_on          date not null,
  value_on           date,
  amount_cents       bigint not null check (amount_cents <> 0),  -- négatif = débit
  currency           char(3) not null default 'EUR',
  description        text not null default '',
  counterparty_name  text,
  counterparty_iban_last4 text,
  category_slug      text,
  category_source    text check (category_source in ('rule', 'user', 'provider', 'ai')),
  source             public.banking_provider not null,
  external_id        text,
  dedupe_hash        text not null,
  import_batch_id    uuid references public.import_batches (id) on delete set null,
  is_interest        boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (account_id, dedupe_hash)
);
create index transactions_household_date_idx on public.transactions (household_id, booked_on desc);
create index transactions_interest_idx on public.transactions (household_id) where is_interest;

-- -----------------------------------------------------------------------------
-- Budgets mensuels
-- -----------------------------------------------------------------------------
create table public.budgets (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  month          date not null check (extract(day from month) = 1),
  category_slug  text not null,
  limit_cents    bigint not null check (limit_cents >= 0),
  currency       char(3) not null default 'EUR',
  unique (household_id, month, category_slug)
);

-- -----------------------------------------------------------------------------
-- Objectifs de vie et enveloppes virtuelles.
-- Une allocation ne déplace AUCUN fonds : c'est une affectation déclarative.
-- -----------------------------------------------------------------------------
create table public.goals (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  kind            public.goal_kind not null,
  name            text not null check (char_length(name) <= 120),
  target_cents    bigint not null check (target_cents > 0),
  currency        char(3) not null default 'EUR',
  target_date     date not null,
  priority        smallint not null default 3 check (priority between 1 and 5),
  status          public.goal_status not null default 'active',
  notes           text,
  created_at      timestamptz not null default now()
);

create table public.goal_allocations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  goal_id       uuid not null references public.goals (id) on delete cascade,
  amount_cents  bigint not null check (amount_cents <> 0),  -- négatif = retrait de l'enveloppe
  allocated_on  date not null default current_date,
  note          text,
  created_at    timestamptz not null default now()
);
create index goal_allocations_goal_idx on public.goal_allocations (goal_id);

-- -----------------------------------------------------------------------------
-- Patrimoine simplifié
-- -----------------------------------------------------------------------------
create table public.assets (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  kind           public.asset_kind not null,
  name           text not null check (char_length(name) <= 120),
  value_cents    bigint not null default 0 check (value_cents >= 0),
  currency       char(3) not null default 'EUR',
  weight_mg      bigint check (weight_mg >= 0),          -- or et argent : poids de métal fin
  purity_permille smallint check (purity_permille between 1 and 1000),
  is_accessible  boolean not null default true,          -- pension bloquée = false
  receivable_likely boolean,                             -- créances : remboursement probable ?
  valued_on      date not null default current_date,
  account_id     uuid references public.accounts (id) on delete set null,
  details        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create table public.liabilities (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  kind               public.liability_kind not null,
  name               text not null check (char_length(name) <= 120),
  outstanding_cents  bigint not null check (outstanding_cents >= 0),
  due_12m_cents      bigint not null default 0 check (due_12m_cents >= 0),  -- échéances des 12 prochains mois
  currency           char(3) not null default 'EUR',
  is_interest_bearing boolean not null default false,
  created_at         timestamptz not null default now(),
  check (due_12m_cents <= outstanding_cents)
);

-- -----------------------------------------------------------------------------
-- RLS : politique standard appliquée à toutes les tables du foyer
-- -----------------------------------------------------------------------------
create or replace function public.apply_household_rls(tbl regclass)
returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('create policy household_select on %s for select using (public.is_household_member(household_id))', tbl);
  execute format('create policy household_insert on %s for insert with check (public.can_write_household(household_id))', tbl);
  execute format('create policy household_update on %s for update using (public.can_write_household(household_id)) with check (public.can_write_household(household_id))', tbl);
  execute format('create policy household_delete on %s for delete using (public.can_write_household(household_id))', tbl);
end;
$$;

do $$
declare t regclass;
begin
  foreach t in array array[
  'public.bank_connections', 'public.accounts', 'public.import_batches',
  'public.transactions', 'public.budgets', 'public.goals', 'public.goal_allocations',
  'public.assets', 'public.liabilities'
]::regclass[] loop
    perform public.apply_household_rls(t);
  end loop;
end $$;

-- Référentiels et règles mixtes (système + foyer)
alter table public.institutions enable row level security;
create policy institutions_read on public.institutions for select to authenticated using (true);

alter table public.categories enable row level security;
create policy categories_select on public.categories for select
  using (household_id is null or public.is_household_member(household_id));
create policy categories_write on public.categories for all
  using (household_id is not null and public.can_write_household(household_id))
  with check (household_id is not null and public.can_write_household(household_id));

alter table public.categorization_rules enable row level security;
create policy rules_select on public.categorization_rules for select
  using (household_id is null or public.is_household_member(household_id));
create policy rules_write on public.categorization_rules for all
  using (household_id is not null and public.can_write_household(household_id))
  with check (household_id is not null and public.can_write_household(household_id));

-- Audit des connexions bancaires
create trigger bank_connections_audit after insert or update or delete on public.bank_connections
  for each row execute function public.audit_row();
