-- =============================================================================
-- Amanah Finance — Migration 0013 : parcours de purification (Sprint 2, lot 2)
--
--  * Transitions de statut imposées par la base (identiques au moteur canTransition) :
--      détecté → confirmé | rejeté ; confirmé → purifié | rejeté | détecté ; rejeté → détecté ;
--      purifié : définitif (seule l'anonymisation de l'auteur reste possible).
--  * Un élément purifié ne peut pas être supprimé par un client.
--  * Méthodologie (base brute ou nette) : choix explicite de la personne, appliqué
--    à ses éléments confirmés non purifiés, dans une seule transaction.
--  * Purification réalisée : contribution « purification » + éléments « purifiés »,
--    dans une seule transaction. Aucun paiement n'est exécuté : c'est un enregistrement.
-- =============================================================================

create or replace function public.purification_guard()
returns trigger language plpgsql as $$
begin
  if old.status = 'purified' then
    -- Seule exception : anonymisation de l'auteur de la décision (suppression d'un compte)
    if (to_jsonb(new) - 'decided_by' - 'decided_at') = (to_jsonb(old) - 'decided_by' - 'decided_at') and new.decided_by is null then
      return new;
    end if;
    raise exception 'un élément purifié est définitif' using errcode = 'insufficient_privilege';
  end if;
  if new.status is distinct from old.status and not (
       (old.status = 'detected'  and new.status in ('confirmed', 'rejected'))
    or (old.status = 'confirmed' and new.status in ('purified', 'rejected', 'detected'))
    or (old.status = 'rejected'  and new.status = 'detected')) then
    raise exception 'transition de purification interdite : % → %', old.status, new.status using errcode = 'check_violation';
  end if;
  -- Les montants d'origine (crédité, opération, date) ne changent jamais
  if new.credited_cents is distinct from old.credited_cents or new.transaction_id is distinct from old.transaction_id
     or new.occurred_on is distinct from old.occurred_on then
    raise exception 'le montant crédité et l''opération d''origine ne sont pas modifiables' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.purification_guard() from public, anon, authenticated;

create trigger purification_items_guard before update on public.purification_items
  for each row execute function public.purification_guard();

-- Suppression : jamais un élément purifié (l'effacement RGPD passe par des fonctions du serveur)
drop policy religious_delete on public.purification_items;
create policy religious_delete on public.purification_items for delete
  using (public.religious_writable(household_id, owner_id) and status <> 'purified');

-- -----------------------------------------------------------------------------
-- Méthodologie : préférence + recalcul des éléments confirmés de la personne
-- -----------------------------------------------------------------------------
create or replace function public.set_purification_basis(p_basis public.purification_basis)
returns integer language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  insert into public.religious_preferences (user_id, purification_basis) values (auth.uid(), p_basis)
  on conflict (user_id) do update set purification_basis = excluded.purification_basis;
  -- Base brute sans brut connu : montant « à déterminer » (aucune base appliquée)
  update public.purification_items set
    basis = case when p_basis = 'net_credited' or (p_basis = 'gross' and gross_cents is not null) then p_basis end,
    basis_source = case when p_basis = 'net_credited' or (p_basis = 'gross' and gross_cents is not null) then 'user_choice' end,
    amount_to_purify_cents = case when p_basis = 'net_credited' then credited_cents when p_basis = 'gross' then gross_cents end
  where owner_id = auth.uid() and status = 'confirmed';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- -----------------------------------------------------------------------------
-- Purification réalisée (enregistrement, sans paiement)
-- -----------------------------------------------------------------------------
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
  -- Verrou : deux enregistrements simultanés ne peuvent pas purifier le même élément
  select count(*), sum(amount_to_purify_cents) into found, total
  from (select amount_to_purify_cents from public.purification_items
        where id = any(p_item_ids) and household_id = p_household_id and owner_id = auth.uid()
          and status = 'confirmed' and amount_to_purify_cents is not null
        for update) x;
  if found <> wanted then
    raise exception 'éléments non purifiables : confirmés, montant déterminé et propriétaire requis' using errcode = 'check_violation';
  end if;
  insert into public.contributions (household_id, kind, organization_id, beneficiary_label, amount_cents, paid_on)
  values (p_household_id, 'purification', p_organization_id, nullif(left(trim(p_beneficiary_label), 120), ''), total, p_paid_on)
  returning id into cid;
  update public.purification_items set status = 'purified', contribution_id = cid
  where id = any(p_item_ids) and household_id = p_household_id and owner_id = auth.uid();
  return cid;
end;
$$;

revoke execute on function public.set_purification_basis(public.purification_basis) from public, anon;
revoke execute on function public.record_purification(uuid, uuid[], date, text, uuid) from public, anon;
grant execute on function public.set_purification_basis(public.purification_basis) to authenticated;
grant execute on function public.record_purification(uuid, uuid[], date, text, uuid) to authenticated;
