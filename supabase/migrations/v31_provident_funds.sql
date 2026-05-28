-- v31: תמיכה בריבוי קרנות השתלמות ללקוח
-- provident_count  — כמה קרנות יש ללקוח (ברירת מחדל: 1)
-- provident_descriptions — תיאור לכל קרן (מערך JSON של מחרוזות)

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS provident_count        SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS provident_descriptions JSONB    NOT NULL DEFAULT '[]';
