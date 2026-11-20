-- =============================================================================
-- Amanah Finance — Migration 0015 : décisions sur les virements internes (Sprint 3,
-- revue de code). Un rapprochement « incertain » n'est jamais neutralisé d'office :
-- l'utilisateur le confirme (virement entre ses comptes) ou le rejette (opérations
-- distinctes). La décision est propre au foyer ; aucune opération n'est modifiée.
-- =============================================================================
create table public.transfer_decisions (
  household_id  uuid not null references public.households (id) on delete cascade,
  debit_id      uuid not null,
  credit_id     uuid not null,
  verdict       text not null check (verdict in ('confirmed', 'rejected')),
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (household_id, debit_id, credit_id),
  check (debit_id <> credit_id),
  -- Les deux opérations appartiennent au foyer (clés composites, comme ailleurs)
  foreign key (household_id, debit_id) references public.transactions (household_id, id) on delete cascade,
  foreign key (household_id, credit_id) references public.transactions (household_id, id) on delete cascade
);
select public.apply_household_rls('public.transfer_decisions');
revoke all on public.transfer_decisions from anon;
