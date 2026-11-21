-- =============================================================================
-- Amanah Finance — Migration 0020 : plan d'épargne des projets (Sprint 5, lot 5.3)
--
--  * Capacité d'épargne mensuelle déclarée par le foyer (facultative) : elle prime sur
--    l'estimation de l'analyse pour répartir l'épargne entre les projets.
--  * Le montant prévu par projet reste goals.monthly_capacity_cents et la priorité
--    goals.priority (déjà journalisés dans goal_changes).
--  * Une mise de côté reste virtuelle : rien ici n'est une dépense ni un virement.
-- =============================================================================
create table public.household_savings_settings (
  household_id             uuid primary key references public.households (id) on delete cascade,
  declared_capacity_cents  bigint check (declared_capacity_cents between 0 and 10000000),
  updated_at               timestamptz not null default now()
);
select public.apply_household_rls('public.household_savings_settings');
revoke all on public.household_savings_settings from anon;
comment on table public.household_savings_settings is 'Capacité d''épargne mensuelle déclarée par le foyer (plan des projets).';
