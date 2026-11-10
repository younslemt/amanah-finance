-- =============================================================================
-- Amanah Finance — Migration 0012 : import bancaire atomique (Sprint 2, lot 1)
--
-- Une seule fonction pour toutes les sources (CSV aujourd'hui, PSD2 demain) :
--  * lot d'import et opérations écrits dans UNE transaction (tout ou rien) ;
--  * doublons ignorés par l'empreinte (account_id, dedupe_hash) : un même fichier
--    importé deux fois n'ajoute aucune ligne ;
--  * catégorie inconnue → opération non catégorisée (jamais d'erreur) ;
--  * intérêts : l'opération est marquée is_interest ; un élément de purification
--    « détecté » n'est créé que si l'utilisateur a un consentement article 9 en vigueur.
-- SECURITY INVOKER : RLS et clés composites de l'appelant s'appliquent.
-- =============================================================================

alter table public.import_batches
  add column interest_count  integer not null default 0,
  add column purification_count integer not null default 0,
  add constraint import_batches_counts_positive check (
    row_count >= 0 and imported_count >= 0 and duplicate_count >= 0 and error_count >= 0
    and interest_count >= 0 and purification_count >= 0),
  add constraint import_batches_profile_length check (csv_profile is null or char_length(csv_profile) <= 40),
  add constraint import_batches_file_name_length check (file_name is null or char_length(file_name) <= 200);

create or replace function public.import_transactions(
  p_household_id uuid, p_account_id uuid, p_source public.banking_provider,
  p_file_name text, p_profile text, p_error_count integer, p_rows jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  bid uuid;
  n_rows int;
  n_ins int;
  n_int int;
  n_pur int;
begin
  if p_source in ('demo', 'manual') then
    raise exception 'source d''import non autorisée : %', p_source using errcode = 'check_violation';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'lignes attendues sous forme de tableau' using errcode = 'invalid_parameter_value';
  end if;
  n_rows := jsonb_array_length(p_rows);
  if n_rows = 0 or n_rows > 5000 then
    raise exception 'nombre de lignes hors limites : %', n_rows using errcode = 'check_violation';
  end if;
  if not public.can_write_household(p_household_id) then
    raise exception 'foyer inconnu' using errcode = 'insufficient_privilege';
  end if;

  insert into public.import_batches (household_id, account_id, source, file_name, csv_profile, row_count, error_count)
  values (p_household_id, p_account_id, p_source, left(p_file_name, 200), p_profile, n_rows, greatest(coalesce(p_error_count, 0), 0))
  returning id into bid;

  with src as (
    select * from jsonb_to_recordset(p_rows) as r(
      booked_on date, amount_cents bigint, currency text, description text, counterparty_name text,
      counterparty_iban_last4 text, category_slug text, external_id text, dedupe_hash text,
      is_interest boolean, interest_kind text, interest_reason text)
  ), ins as (
    insert into public.transactions (household_id, account_id, booked_on, amount_cents, currency, description,
      counterparty_name, counterparty_iban_last4, category_slug, category_source, source, external_id,
      dedupe_hash, import_batch_id, is_interest)
    select p_household_id, p_account_id, s.booked_on, s.amount_cents, coalesce(upper(s.currency), 'EUR'),
      left(coalesce(s.description, ''), 500), left(s.counterparty_name, 200),
      case when s.counterparty_iban_last4 ~ '^[0-9A-Z]{4}$' then s.counterparty_iban_last4 end,
      case when public.category_is_visible(p_household_id, s.category_slug) then s.category_slug end,
      case when s.category_slug is not null and public.category_is_visible(p_household_id, s.category_slug) then 'rule' end,
      p_source, s.external_id, s.dedupe_hash, bid, coalesce(s.is_interest, false) and s.amount_cents > 0
    from src s
    on conflict (account_id, dedupe_hash) do nothing
    returning id, dedupe_hash, amount_cents, booked_on, is_interest
  ), pur as (
    insert into public.purification_items (household_id, transaction_id, source_kind, credited_cents, occurred_on, detection_reason)
    select p_household_id, i.id,
      case when s.interest_kind in ('bank_interest', 'loyalty_bonus', 'dividend_impure_share') then s.interest_kind else 'bank_interest' end,
      i.amount_cents, i.booked_on, left(coalesce(s.interest_reason, 'import'), 120)
    from ins i join src s on s.dedupe_hash = i.dedupe_hash
    where i.is_interest and public.has_religious_consent(auth.uid())
    on conflict (transaction_id) do nothing
    returning 1
  )
  select (select count(*) from ins), (select count(*) from ins where is_interest), (select count(*) from pur)
  into n_ins, n_int, n_pur;

  update public.import_batches
  set imported_count = n_ins, duplicate_count = n_rows - n_ins, interest_count = n_int, purification_count = n_pur
  where id = bid;

  return jsonb_build_object('batch_id', bid, 'rows', n_rows, 'imported', n_ins, 'duplicates', n_rows - n_ins,
                            'interest', n_int, 'purification_items', n_pur);
end;
$$;

revoke execute on function public.import_transactions(uuid, uuid, public.banking_provider, text, text, integer, jsonb) from public, anon;
grant execute on function public.import_transactions(uuid, uuid, public.banking_provider, text, text, integer, jsonb) to authenticated;

comment on function public.import_transactions(uuid, uuid, public.banking_provider, text, text, integer, jsonb) is
  'Point d''entrée unique des imports (CSV, futurs fournisseurs PSD2). Lignes produites par toImportPayload (@amanah/banking).';
