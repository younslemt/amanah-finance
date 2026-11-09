-- =============================================================================
-- Amanah Finance — Migration 0007 : fiabilité des données de conformité (Sprint 0.1)
--  * Purification : montant net crédité, brut et précompte distingués ; base de
--    purification non imposée ; montant à purifier nul tant qu'il n'est pas déterminé.
--  * Zakat : statut explicite, dont « à déterminer », et raisons enregistrées.
-- =============================================================================

create type public.purification_basis as enum ('gross', 'net_credited');
create type public.zakat_status as enum ('to_determine', 'below_nisab', 'hawl_incomplete', 'due');

-- -----------------------------------------------------------------------------
-- Purification
-- -----------------------------------------------------------------------------
alter table public.purification_items drop constraint purification_items_check;  -- ancienne règle « purifié ⇒ contribution »
alter table public.purification_items rename column amount_cents to credited_cents;
alter table public.purification_items
  add column gross_cents            bigint check (gross_cents > 0),
  add column withholding_tax_cents  bigint check (withholding_tax_cents >= 0),
  add column basis                  public.purification_basis,         -- choix de l'utilisateur ou d'un référentiel validé
  add column basis_source           text check (basis_source in ('user_choice', 'validated_ruleset')),
  add column amount_to_purify_cents bigint check (amount_to_purify_cents > 0),
  -- brut = net + précompte lorsque les trois sont connus
  add constraint purification_amounts_consistent check (
    gross_cents is null or withholding_tax_cents is null or gross_cents = credited_cents + withholding_tax_cents),
  add constraint purification_gross_not_below_net check (gross_cents is null or gross_cents >= credited_cents),
  -- base et montant vont ensemble, et le montant suit la base
  add constraint purification_basis_amount_together check ((basis is null) = (amount_to_purify_cents is null)),
  add constraint purification_amount_matches_basis check (
    basis is null
    or (basis = 'net_credited' and amount_to_purify_cents = credited_cents)
    or (basis = 'gross' and gross_cents is not null and amount_to_purify_cents = gross_cents)),
  add constraint purification_basis_has_source check ((basis is null) = (basis_source is null)),
  -- « purifié » exige un montant déterminé et un don enregistré
  add constraint purification_purified_requires_amount_and_gift check (
    status <> 'purified' or (amount_to_purify_cents is not null and contribution_id is not null));

comment on column public.purification_items.credited_cents is 'Montant net effectivement crédité sur le compte.';
comment on column public.purification_items.amount_to_purify_cents is 'Nul tant que la base (brut ou net) n''est pas déterminée.';

-- -----------------------------------------------------------------------------
-- Zakat : statut et raisons ; nisab et franchissement peuvent être inconnus
-- -----------------------------------------------------------------------------
alter table public.zakat_calculations
  add column status          public.zakat_status not null default 'to_determine',
  add column pending_reasons text[] not null default '{}',
  alter column nisab_cents drop not null,
  alter column is_above_nisab drop not null,
  -- seule une Zakat « exigible » porte un montant dû
  add constraint zakat_due_only_when_established check (status = 'due' or zakat_due_cents = 0),
  add constraint zakat_to_determine_has_reasons check (status <> 'to_determine' or cardinality(pending_reasons) > 0);
alter table public.zakat_calculations alter column status drop default;

alter table public.zakat_settings alter column nisab_basis drop not null;  -- non choisi = à déterminer
