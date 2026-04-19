-- v24: UNIQUE constraints נדרשים לתמיכה ב-upsert

-- category_estimates: upsert לפי (client_id, category_name)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'category_estimates_client_id_category_name_unique'
  ) THEN
    ALTER TABLE category_estimates
      ADD CONSTRAINT category_estimates_client_id_category_name_unique
      UNIQUE (client_id, category_name);
  END IF;
END
$$;

-- categories: upsert לפי (name, client_id) לקטגוריות אישיות
-- NULLS NOT DISTINCT: מתייחס ל-NULL כערך שווה (PostgreSQL 15+)
-- כדי שלא ייווצרו כפילויות בקטגוריות גלובליות (client_id = NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'categories_name_client_id_unique'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_name_client_id_unique
      UNIQUE NULLS NOT DISTINCT (name, client_id);
  END IF;
END
$$;
