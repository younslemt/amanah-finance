-- Revue produit — suggestions de projets : « autre projet religieux » (Ramadan, Aïd al-Fitr…).
-- Une valeur d'énumération doit être seule dans sa migration avant d'être utilisée (0023).
-- Catégorie nécessaire : un projet « Ramadan » révèle une pratique religieuse et doit donc être
-- protégé comme Hajj, Omra et Aïd (article 9 RGPD), pas classé en projet personnel.
alter type public.goal_kind add value if not exists 'religious_other';
