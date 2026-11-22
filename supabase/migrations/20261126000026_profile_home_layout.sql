-- =============================================================================
-- Islamic-first lot 2 : préférence d'affichage de l'accueil.
--
-- - Colonne privée de `profiles` : lisible et modifiable par la personne seule (politiques
--   existantes profiles_self_select / profiles_self_update, aucune autre lecture).
-- - Indépendante du consentement religieux : la retirer ou l'accorder ne change pas la préférence,
--   et la préférence ne donne accès à aucune donnée religieuse (filtrage serveur + RLS existantes).
-- - Valeurs : 'islamic_first' (défaut) ou 'classic' (affichage analytique).
-- =============================================================================
alter table public.profiles
  add column home_layout text not null default 'islamic_first'
  constraint profiles_home_layout_check check (home_layout in ('islamic_first', 'classic'));

-- Mise à jour colonne par colonne (comme display_name, locale, profile_completed_at)
grant update (home_layout) on public.profiles to authenticated;

comment on column public.profiles.home_layout is
  'Préférence de présentation de l''accueil (privée, indépendante du consentement religieux).';
