-- =============================================================================
-- Amanah Finance — Migration 0008 : modèles de lecture (préparation Sprint 1)
-- Soldes calculés dans la base : exacts quel que soit le nombre de transactions
-- (l'API REST plafonne les réponses), et soumis à la RLS de l'appelant.
-- =============================================================================

create view public.account_balances
with (security_invoker = true)   -- la RLS des tables sous-jacentes s'applique à l'appelant
as
select a.id              as account_id,
       a.household_id,
       a.currency,
       a.opening_balance_cents + coalesce(sum(t.amount_cents), 0) as balance_cents,
       count(t.id)       as transaction_count,
       max(t.booked_on)  as last_booked_on
from public.accounts a
left join public.transactions t on t.account_id = a.id and t.household_id = a.household_id
group by a.id;

revoke all on public.account_balances from anon;
grant select on public.account_balances to authenticated;
