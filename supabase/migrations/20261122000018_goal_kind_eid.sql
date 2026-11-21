-- =============================================================================
-- Amanah Finance — Migration 0018 : type de projet « Aïd al-Adha » (Sprint 5, lot 5.2)
-- Seule dans sa migration : une nouvelle valeur d'énumération n'est utilisable
-- qu'une fois validée.
-- =============================================================================
alter type public.goal_kind add value if not exists 'eid_al_adha';
