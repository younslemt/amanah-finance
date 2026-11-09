-- =============================================================================
-- Données de développement LOCAL uniquement (supabase db reset).
-- Tout est FICTIF : prix des métaux d'exemple, aucune donnée personnelle.
-- Ne jamais exécuter sur un projet de production.
-- =============================================================================
insert into public.market_prices (symbol, price_per_g_cents, currency, as_of, source) values
  ('XAU', 11000, 'EUR', current_date, 'FICTIF — développement local'),
  ('XAG',   130, 'EUR', current_date, 'FICTIF — développement local')
on conflict (symbol, currency, as_of) do nothing;
