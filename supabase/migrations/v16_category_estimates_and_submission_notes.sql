-- v16: הוספת הערכות חודשיות + הערת הגשה
-- פיצ'ר: בדיקת כיסוי קטגוריות בסוף כל חודש

-- 1. הוסף עמודת submission_notes לטבלת clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS submission_notes TEXT;

-- 2. צור טבלת category_estimates
CREATE TABLE IF NOT EXISTS category_estimates (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category_name   TEXT NOT NULL,
  monthly_amount  NUMERIC NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. הפעל RLS
ALTER TABLE category_estimates ENABLE ROW LEVEL SECURITY;

-- 4. לקוח מנהל רק את ההערכות שלו
DROP POLICY IF EXISTS "client_own_estimates" ON category_estimates;
CREATE POLICY "client_own_estimates" ON category_estimates
  USING (client_id::text = auth.uid()::text)
  WITH CHECK (client_id::text = auth.uid()::text);

-- 5. אדמין קורא הכל
DROP POLICY IF EXISTS "admin_read_estimates" ON category_estimates;
CREATE POLICY "admin_read_estimates" ON category_estimates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clients
      WHERE id::text = auth.uid()::text
        AND username = 'admin'
    )
  );

-- 6. (לעתיד) הוסף עמודת description לקטגוריות — למלא ידנית ע"י האדמין
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS description TEXT;
