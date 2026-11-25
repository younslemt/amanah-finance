-- =============================================================================
-- Connecteur Enable Banking (sandbox, puis production restreinte aux comptes du fondateur)
-- La table bank_connections existe depuis le schéma initial, sous la RLS du foyer (lecture :
-- membres ; écriture : droit d'écriture). On ajoute seulement ce que le parcours exige.
-- Aucun identifiant bancaire, aucun jeton d'accès, aucun IBAN complet n'est stocké :
-- - consent_ref : identifiant de session Enable Banking (inutilisable sans la clé privée du serveur) ;
-- - state_hash : empreinte SHA-256 du jeton anti-CSRF, effacée au retour de la banque.
-- =============================================================================

alter table public.bank_connections
  add column if not exists aspsp_name    text check (char_length(aspsp_name) <= 120),
  add column if not exists aspsp_country char(2) check (aspsp_country ~ '^[A-Z]{2}$'),
  add column if not exists environment   text check (environment in ('sandbox', 'production')),
  add column if not exists state_hash    text check (state_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists requested_by  uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists revoked_at    timestamptz,
  add column if not exists last_error    text check (char_length(last_error) <= 200);

-- Un compte bancaire distant n'est rattaché qu'une fois à une connexion
create unique index if not exists accounts_connection_external_key
  on public.accounts (connection_id, external_id)
  where connection_id is not null and external_id is not null;

create index if not exists bank_connections_household_status_idx on public.bank_connections (household_id, status);

comment on column public.bank_connections.consent_ref is
  'Identifiant de session Enable Banking (accès en lecture seule, révocable). Jamais de jeton ni d''identifiant bancaire.';
comment on column public.bank_connections.state_hash is
  'SHA-256 du jeton anti-CSRF de la redirection bancaire ; effacé au retour.';
