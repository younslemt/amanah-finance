-- =============================================================================
-- Amanah Finance — Migration 0005 : données de référence (production)
-- Catégories système, règles de catégorisation, établissements belges,
-- référentiel de Zakat v1 et méthodologie de screening (brouillons à valider).
-- =============================================================================

insert into public.categories (household_id, slug, parent_slug, kind, is_essential, is_interest) values
  (null, 'salaire',                null, 'income',  false, false),
  (null, 'allocations_familiales', null, 'income',  false, false),
  (null, 'autres_revenus',         null, 'income',  false, false),
  (null, 'interets',               null, 'income',  false, true),
  (null, 'logement',               null, 'expense', true,  false),
  (null, 'energie',                'logement', 'expense', true, false),
  (null, 'alimentation',           null, 'expense', true,  false),
  (null, 'transport',              null, 'expense', true,  false),
  (null, 'sante',                  null, 'expense', true,  false),
  (null, 'assurances',             null, 'expense', true,  false),
  (null, 'enfants',                null, 'expense', true,  false),
  (null, 'telecom',                null, 'expense', true,  false),
  (null, 'impots',                 null, 'expense', true,  false),
  (null, 'remboursement_credit',   null, 'expense', true,  false),
  (null, 'loisirs',                null, 'expense', false, false),
  (null, 'vetements',              null, 'expense', false, false),
  (null, 'restaurants',            null, 'expense', false, false),
  (null, 'dons',                   null, 'expense', false, false),
  (null, 'frais_bancaires',        null, 'expense', false, false),
  (null, 'divers',                 null, 'expense', false, false),
  (null, 'epargne',                null, 'transfer', false, false),
  (null, 'virement_interne',       null, 'transfer', false, false);

-- Motifs normalisés : majuscules, sans accents. Français et néerlandais.
insert into public.categorization_rules (household_id, pattern, category_slug, direction, priority) values
  (null, 'INTERET',              'interets', 'credit', 10),
  (null, 'INTERESTS',            'interets', 'credit', 10),
  (null, 'PRIME DE FIDELITE',    'interets', 'credit', 10),
  (null, 'GETROUWHEIDSPREMIE',   'interets', 'credit', 10),
  (null, 'BASISRENTE',           'interets', 'credit', 10),
  (null, 'SALAIRE',              'salaire', 'credit', 20),
  (null, 'LOON',                 'salaire', 'credit', 30),
  (null, 'FAMIWAL',              'allocations_familiales', 'credit', 20),
  (null, 'FAMIRIS',              'allocations_familiales', 'credit', 20),
  (null, 'IRISCARE',             'allocations_familiales', 'credit', 20),
  (null, 'GROEIPAKKET',          'allocations_familiales', 'credit', 20),
  (null, 'LOYER',                'logement', 'debit', 50),
  (null, 'HUUR',                 'logement', 'debit', 50),
  (null, 'ENGIE',                'energie', 'debit', 50),
  (null, 'LUMINUS',              'energie', 'debit', 50),
  (null, 'TOTALENERGIES',        'energie', 'debit', 50),
  (null, 'COLRUYT',              'alimentation', 'debit', 50),
  (null, 'DELHAIZE',             'alimentation', 'debit', 50),
  (null, 'CARREFOUR',            'alimentation', 'debit', 50),
  (null, 'ALDI',                 'alimentation', 'debit', 50),
  (null, 'LIDL',                 'alimentation', 'debit', 50),
  (null, 'STIB',                 'transport', 'debit', 50),
  (null, 'SNCB',                 'transport', 'debit', 50),
  (null, 'NMBS',                 'transport', 'debit', 50),
  (null, 'DE LIJN',              'transport', 'debit', 50),
  (null, 'PROXIMUS',             'telecom', 'debit', 50),
  (null, 'TELENET',              'telecom', 'debit', 50),
  (null, 'PHARMACIE',            'sante', 'debit', 50),
  (null, 'APOTHEEK',             'sante', 'debit', 50),
  (null, 'MUTUALITE',            'sante', 'debit', 50),
  (null, 'SPF FINANCES',         'impots', 'debit', 40),
  (null, 'FOD FINANCIEN',        'impots', 'debit', 40),
  (null, 'FRAIS DE GESTION',     'frais_bancaires', 'debit', 60),
  (null, 'BEHEERSKOSTEN',        'frais_bancaires', 'debit', 60);

insert into public.institutions (name, bic, country) values
  ('BNP Paribas Fortis', 'GEBABEBB', 'BE'),
  ('KBC',                'KREDBEBB', 'BE'),
  ('Belfius',            'GKCCBEBB', 'BE'),
  ('ING Belgique',       'BBRUBEBB', 'BE'),
  ('Argenta',            'ARSPBE22', 'BE'),
  ('Crelan',             'NICABEBB', 'BE'),
  ('Beobank',            'CTBKBEBX', 'BE'),
  ('Keytrade Bank',      'KEYTBEBB', 'BE');

-- Référentiel de Zakat v1 : BROUILLON. Doit être relu et approuvé par un comité
-- charia avant tout usage public. Les montants restent des estimations.
insert into public.zakat_rulesets (id, version, title, parameters, references_, review_status) values (
  'amanah-zakat', '1.0.0',
  'Zakat sur le patrimoine — référentiel Amanah v1 (brouillon)',
  '{
     "rate": { "lunar": 0.025, "solar": 0.02577 },
     "nisab_mg": { "gold": 85000, "silver": 595000 },
     "hawl_days": { "lunar": 354, "solar": 365 },
     "options": {
       "personal_jewelry": { "allowed": ["include", "exclude"], "default": "exclude" },
       "long_term_investments": { "allowed": ["full_market_value", "custom_ratio"], "default": "full_market_value" },
       "locked_pensions": { "allowed": ["exclude", "include"], "default": "exclude" },
       "debts": { "allowed": ["due_12_months", "none", "all"], "default": "due_12_months" },
       "doubtful_receivables": { "allowed": ["exclude"], "default": "exclude" }
     }
   }'::jsonb,
  '[
     { "id": "aaoifi-ss35", "label": "AAOIFI, norme charia n° 35 : Zakat", "scope": "méthode générale, actifs et passifs" },
     { "id": "fiqh-hanafi", "label": "École hanafite", "scope": "inclusion des bijoux d''usage personnel ; nisab argent couramment retenu" },
     { "id": "fiqh-majority", "label": "Écoles malikite, chafiite et hanbalite", "scope": "exemption des bijoux d''usage personnel" },
     { "id": "contemporary-debts", "label": "Avis contemporains", "scope": "déduction limitée aux échéances des 12 prochains mois" }
   ]'::jsonb,
  'draft'
);

insert into public.screening_methodologies (id, version, title, criteria, references_) values (
  'aaoifi-equity', '0.1.0',
  'Screening actions inspiré d''AAOIFI (brouillon, non utilisé en MVP)',
  '{
     "business_activity": { "prohibited_sectors": ["conventional_finance", "alcohol", "pork", "gambling", "adult_entertainment", "weapons"], "max_impure_revenue_ratio": 0.05 },
     "financial_ratios": {
       "interest_bearing_debt_to_market_cap_max": 0.30,
       "interest_bearing_deposits_to_market_cap_max": 0.30
     }
   }'::jsonb,
  '[{ "id": "aaoifi-ss21", "label": "AAOIFI, norme charia n° 21 : titres financiers (actions et obligations)" }]'::jsonb
);
