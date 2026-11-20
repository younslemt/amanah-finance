-- =============================================================================
-- Amanah Finance — Migration 0016 : dons et Sadaqah, Zakat personnalisée (Sprint 4)
--
--  * Contributions : note, rapprochement avec une opération bancaire (« vérifié »),
--    affectation à un calcul de Zakat ou à une Zakat al-Fitr, garde contre le double
--    comptage des purifications (créées uniquement par record_purification).
--  * Zakat al-Fitr : obligation annuelle par personne, séparée de la Zakat patrimoniale.
--  * Prix des métaux saisis par la personne : source, date, jamais dans le futur.
--  * Réglages Zakat : plus aucune valeur imposée par défaut (base du nisab, année).
--  * Toutes ces données sont des données article 9 propres à une personne (owner_id),
--    protégées par religious_readable / religious_writable et effacées au retrait.
--  Aucun paiement n'est exécuté ; aucun justificatif n'est stocké.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Zakat al-Fitr
-- -----------------------------------------------------------------------------
create table public.zakat_fitr_obligations (
  id                       uuid primary key default gen_random_uuid(),
  household_id             uuid not null references public.households (id) on delete cascade,
  owner_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year                     smallint not null check (year between 2000 and 2100),
  persons                  smallint not null check (persons between 1 and 30),
  amount_per_person_cents  bigint not null check (amount_per_person_cents between 1 and 100000),
  due_cents                bigint generated always as (persons * amount_per_person_cents) stored,
  amount_source            text not null check (char_length(btrim(amount_source)) between 3 and 200),
  created_at               timestamptz not null default now(),
  unique (household_id, owner_id, year),
  unique (household_id, id)
);
create index zakat_fitr_owner_idx on public.zakat_fitr_obligations (owner_id);

-- -----------------------------------------------------------------------------
-- 2. Prix des métaux saisis par la personne
-- -----------------------------------------------------------------------------
create table public.zakat_metal_prices (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  owner_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol             text not null check (symbol in ('XAU', 'XAG')),
  price_per_g_cents  bigint not null check (price_per_g_cents between 1 and 10000000),
  as_of              date not null,
  source             text not null check (char_length(btrim(source)) between 3 and 200),
  created_at         timestamptz not null default now(),
  unique (household_id, owner_id, symbol, as_of)
);
create index zakat_metal_prices_owner_idx on public.zakat_metal_prices (owner_id);

create or replace function public.forbid_future_price()
returns trigger language plpgsql as $$
begin
  if new.as_of > (now() at time zone 'Europe/Brussels')::date then
    raise exception 'la date du prix ne peut pas être dans le futur' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.forbid_future_price() from public, anon, authenticated;
create trigger zakat_metal_prices_date before insert or update on public.zakat_metal_prices
  for each row execute function public.forbid_future_price();

-- Propriétaire imposé par le serveur, RLS article 9
do $$
declare t text;
begin
  foreach t in array array['zakat_fitr_obligations', 'zakat_metal_prices'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.stamp_religious_owner()', t || '_religious_owner', t);
    execute format('create policy religious_select on public.%I for select using (public.religious_readable(household_id, owner_id))', t);
    execute format('create policy religious_insert on public.%I for insert with check (public.religious_writable(household_id, owner_id))', t);
    execute format('create policy religious_update on public.%I for update using (public.religious_writable(household_id, owner_id)) with check (public.religious_writable(household_id, owner_id))', t);
    execute format('create policy religious_delete on public.%I for delete using (public.religious_writable(household_id, owner_id))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
comment on table public.zakat_fitr_obligations is 'Article 9 : Zakat al-Fitr annuelle d''une personne (owner_id).';
comment on table public.zakat_metal_prices is 'Article 9 : prix des métaux saisis par une personne pour sa Zakat (owner_id).';

-- -----------------------------------------------------------------------------
-- 3. Réglages Zakat : aucun choix méthodologique imposé
-- -----------------------------------------------------------------------------
-- (la base du nisab est déjà facultative depuis la migration 0007)
alter table public.zakat_settings alter column year_basis drop default, alter column year_basis drop not null;

-- -----------------------------------------------------------------------------
-- 4. Contributions : note, vérification bancaire, affectations
-- -----------------------------------------------------------------------------
alter table public.contributions
  add column note           text check (char_length(note) <= 300),
  add column transaction_id uuid,
  add column zakat_fitr_id  uuid,
  add constraint contributions_transaction_same_household
    foreign key (household_id, transaction_id) references public.transactions (household_id, id) on delete set null (transaction_id),
  add constraint contributions_fitr_same_household
    foreign key (household_id, zakat_fitr_id) references public.zakat_fitr_obligations (household_id, id) on delete set null (zakat_fitr_id),
  add constraint contributions_zakat_link_kind check (zakat_calculation_id is null or kind = 'zakat'),
  add constraint contributions_fitr_link_kind check (zakat_fitr_id is null or kind = 'zakat_al_fitr');
-- Une opération bancaire ne prouve qu'une seule contribution
create unique index contributions_transaction_unique on public.contributions (transaction_id) where transaction_id is not null;

create or replace function public.contribution_guard()
returns trigger language plpgsql as $$
declare
  tx record;
  link_owner uuid;
begin
  if tg_op = 'INSERT' then
    -- Une purification naît du parcours de purification (éléments liés) : jamais ressaisie ici
    if new.kind = 'purification' and coalesce(current_setting('amanah.recording_purification', true), '') <> 'on' then
      raise exception 'une purification s''enregistre depuis le parcours de purification' using errcode = 'check_violation';
    end if;
  else
    if (old.kind = 'purification') <> (new.kind = 'purification') then
      raise exception 'le type purification ne peut pas être ajouté ni retiré' using errcode = 'check_violation';
    end if;
    -- Purification : seule la vérification bancaire peut être ajoutée ou retirée
    if old.kind = 'purification' and (to_jsonb(new) - 'transaction_id') <> (to_jsonb(old) - 'transaction_id') then
      raise exception 'une purification enregistrée n''est pas modifiable' using errcode = 'check_violation';
    end if;
  end if;

  if new.paid_on > (now() at time zone 'Europe/Brussels')::date then
    raise exception 'la date du don ne peut pas être dans le futur' using errcode = 'check_violation';
  end if;

  -- Vérification : débit du même montant, à 10 jours au plus de la date déclarée
  if new.transaction_id is not null then
    select amount_cents, booked_on into tx from public.transactions
    where household_id = new.household_id and id = new.transaction_id;
    if not found or tx.amount_cents <> -new.amount_cents or abs(tx.booked_on - new.paid_on) > 10 then
      raise exception 'opération bancaire incompatible : débit du même montant à 10 jours au plus requis' using errcode = 'check_violation';
    end if;
  end if;

  -- Affectations : uniquement aux calculs et obligations de la même personne
  if new.zakat_calculation_id is not null then
    select owner_id into link_owner from public.zakat_calculations where household_id = new.household_id and id = new.zakat_calculation_id;
    if link_owner is distinct from new.owner_id then
      raise exception 'affectation à un calcul d''une autre personne refusée' using errcode = 'insufficient_privilege';
    end if;
  end if;
  if new.zakat_fitr_id is not null then
    select owner_id into link_owner from public.zakat_fitr_obligations where household_id = new.household_id and id = new.zakat_fitr_id;
    if link_owner is distinct from new.owner_id then
      raise exception 'affectation à une Zakat al-Fitr d''une autre personne refusée' using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.contribution_guard() from public, anon, authenticated;
-- Nom choisi pour s'exécuter APRÈS contributions_religious_owner (ordre alphabétique) : propriétaire déjà imposé
create trigger contributions_zz_guard before insert or update on public.contributions
  for each row execute function public.contribution_guard();

-- record_purification : seule voie de création d'une contribution « purification »
create or replace function public.record_purification(
  p_household_id uuid, p_item_ids uuid[], p_paid_on date, p_beneficiary_label text, p_organization_id uuid default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  wanted int := cardinality(array(select distinct unnest(p_item_ids)));
  found int;
  total bigint;
  cid uuid;
begin
  if wanted = 0 then raise exception 'aucun élément sélectionné' using errcode = 'check_violation'; end if;
  if p_paid_on is null or p_paid_on > (now() at time zone 'Europe/Brussels')::date then
    raise exception 'date de la purification invalide' using errcode = 'check_violation';
  end if;
  if p_organization_id is null and coalesce(trim(p_beneficiary_label), '') = '' then
    raise exception 'bénéficiaire requis' using errcode = 'check_violation';
  end if;
  select count(*), sum(amount_to_purify_cents) into found, total
  from (select amount_to_purify_cents from public.purification_items
        where id = any(p_item_ids) and household_id = p_household_id and owner_id = auth.uid()
          and status = 'confirmed' and amount_to_purify_cents is not null
        for update) x;
  if found <> wanted then
    raise exception 'éléments non purifiables : confirmés, montant déterminé et propriétaire requis' using errcode = 'check_violation';
  end if;
  perform set_config('amanah.recording_purification', 'on', true);
  insert into public.contributions (household_id, kind, organization_id, beneficiary_label, amount_cents, paid_on)
  values (p_household_id, 'purification', p_organization_id, nullif(left(trim(p_beneficiary_label), 120), ''), total, p_paid_on)
  returning id into cid;
  perform set_config('amanah.recording_purification', 'off', true);
  update public.purification_items set status = 'purified', contribution_id = cid
  where id = any(p_item_ids) and household_id = p_household_id and owner_id = auth.uid();
  return cid;
end;
$$;
revoke execute on function public.record_purification(uuid, uuid[], date, text, uuid) from public, anon;
grant execute on function public.record_purification(uuid, uuid[], date, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Effacement ciblé : nouvelles données article 9 incluses
-- -----------------------------------------------------------------------------
create or replace function public.erase_my_religious_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n_pur int; n_con int; n_calc int; n_set int; n_goal int; n_fitr int; n_price int;
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
  return jsonb_build_object('purification_items', n_pur, 'contributions', n_con, 'zakat_calculations', n_calc,
                            'zakat_settings', n_set, 'goals', n_goal, 'zakat_fitr_obligations', n_fitr, 'zakat_metal_prices', n_price);
end;
$$;
revoke execute on function public.erase_my_religious_data() from public, anon;
grant execute on function public.erase_my_religious_data() to authenticated;
