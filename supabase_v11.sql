-- ════════════════════════════════════════════════════════════════
-- supabase_v11.sql — RLS: client_id = current_user_id via Supabase Auth
-- ════════════════════════════════════════════════════════════════
--
-- סדר ביצוע מומלץ:
--   1. פרוס את Edge Function manage-auth
--   2. פרוס קוד frontend מעודכן (LoginScreen / App / AdminPanel)
--   3. הרץ SQL זה ב-SQL Editor של Supabase
--   4. כנס כאדמין ולחץ "מגר כל הלקוחות" ב-AdminPanel
--
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. עמודת auth_id בלקוחות — מחברת clients.id ל-auth.users.id
-- ────────────────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS clients_auth_id_idx ON clients(auth_id);

-- ────────────────────────────────────────────────────────────────
-- 2. פונקציות עזר
-- ────────────────────────────────────────────────────────────────

-- מחזירה את clients.id של המשתמש המחובר כרגע.
-- SECURITY DEFINER = רצה בהרשאות הבעלים → עוקפת RLS על clients
-- ומונעת רקורסיה אינסופית בעת בדיקת הפוליסות של clients.
CREATE OR REPLACE FUNCTION current_client_id()
  RETURNS bigint
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id FROM clients WHERE auth_id = auth.uid() LIMIT 1
$$;

-- מחזירה true אם ה-JWT שייך לאדמין.
-- בודקת app_metadata — ניתן לכתוב רק ע"י service role, לא ע"י הלקוח.
CREATE OR REPLACE FUNCTION is_admin()
  RETURNS boolean
  LANGUAGE sql STABLE
AS $$
  SELECT coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)
$$;

-- ────────────────────────────────────────────────────────────────
-- 3. הפעל RLS על טבלאות שעדיין לא מוגדרות
-- ────────────────────────────────────────────────────────────────
ALTER TABLE debts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights         ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_transactions ENABLE ROW LEVEL SECURITY;

-- טבלאות שנוצרו ישירות ב-Dashboard (אולי קיימות):
DO $$ BEGIN
  ALTER TABLE scenarios           ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE scenario_items      ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE active_scenario     ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE imported_transactions ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE client_change_log   ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────
-- 4. מחק את כל פוליסות "allow all" הישנות
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "allow all" ON admin_settings;
DROP POLICY IF EXISTS "allow all" ON clients;
DROP POLICY IF EXISTS "allow all" ON submissions;
DROP POLICY IF EXISTS "allow all" ON remembered_mappings;
DROP POLICY IF EXISTS "allow all" ON month_entries;
DROP POLICY IF EXISTS "allow all" ON portfolio_months;
DROP POLICY IF EXISTS "allow all" ON portfolio_submissions;
DROP POLICY IF EXISTS "allow all" ON payslips;
DROP POLICY IF EXISTS "allow all" ON client_questionnaire;
DROP POLICY IF EXISTS "allow all" ON client_intake;
DROP POLICY IF EXISTS "allow all on client-documents" ON storage.objects;

-- ────────────────────────────────────────────────────────────────
-- 5. פוליסות חדשות
-- ────────────────────────────────────────────────────────────────

-- ── admin_settings: אדמין בלבד ──────────────────────────────────
CREATE POLICY "admin_settings: admin"
  ON admin_settings FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- ── clients: אדמין הכל, לקוח — שורת עצמו בלבד ──────────────────
CREATE POLICY "clients: admin"
  ON clients FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "clients: own row select"
  ON clients FOR SELECT
  USING (id = current_client_id());

CREATE POLICY "clients: own row update"
  ON clients FOR UPDATE
  USING (id = current_client_id()) WITH CHECK (id = current_client_id());

-- ── טבלאות עם client_id bigint: אדמין הכל, לקוח — נתוניו בלבד ──
-- תבנית: FOR ALL USING (is_admin() OR client_id = current_client_id())

CREATE POLICY "submissions: access"
  ON submissions FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "remembered_mappings: access"
  ON remembered_mappings FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "month_entries: access"
  ON month_entries FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "portfolio_months: access"
  ON portfolio_months FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "portfolio_submissions: access"
  ON portfolio_submissions FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "payslips: access"
  ON payslips FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "client_documents: access"
  ON client_documents FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "debts: access"
  ON debts FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

CREATE POLICY "ai_insights: access"
  ON ai_insights FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

-- manual_transactions: client_id עשוי להיות uuid (v4.sql) — handle both types
-- אם client_id הוא bigint: השתמש בשורה הראשונה
-- אם client_id הוא uuid:   השתמש בשורה השנייה (בהגעשה)
CREATE POLICY "manual_transactions: access"
  ON manual_transactions FOR ALL
  USING (is_admin() OR client_id::text = current_client_id()::text)
  WITH CHECK (is_admin() OR client_id::text = current_client_id()::text);

CREATE POLICY "client_questionnaire: access"
  ON client_questionnaire FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

-- client_intake: אדמין כותב, לקוח קורא
CREATE POLICY "client_intake: admin"
  ON client_intake FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "client_intake: client read"
  ON client_intake FOR SELECT
  USING (client_id = current_client_id());

-- ── טבלאות תסריט (נוצרו ב-Dashboard) ───────────────────────────

-- scenarios: אדמין כותב, לקוח קורא תסריטים שלו
DO $$ BEGIN
  CREATE POLICY "scenarios: admin"
    ON scenarios FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY "scenarios: client read"
    ON scenarios FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- scenario_items: אדמין כותב, לקוח קורא דרך scenarios
DO $$ BEGIN
  CREATE POLICY "scenario_items: admin"
    ON scenario_items FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY "scenario_items: client read"
    ON scenario_items FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM scenarios
        WHERE id = scenario_items.scenario_id
          AND client_id = current_client_id()
      )
    );
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- active_scenario: לקוח מנהל תקופות פעילות, אדמין גם כן
DO $$ BEGIN
  CREATE POLICY "active_scenario: access"
    ON active_scenario FOR ALL
    USING (is_admin() OR client_id = current_client_id())
    WITH CHECK (is_admin() OR client_id = current_client_id());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- imported_transactions: לקוח מנהל, אדמין גם כן
DO $$ BEGIN
  CREATE POLICY "imported_transactions: access"
    ON imported_transactions FOR ALL
    USING (is_admin() OR client_id = current_client_id())
    WITH CHECK (is_admin() OR client_id = current_client_id());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- client_change_log: אדמין כותב, לקוח קורא
DO $$ BEGIN
  CREATE POLICY "client_change_log: admin"
    ON client_change_log FOR ALL
    USING (is_admin()) WITH CHECK (is_admin());
  CREATE POLICY "client_change_log: client read"
    ON client_change_log FOR SELECT
    USING (client_id = current_client_id());
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- ────────────────────────────────────────────────────────────────
-- 6. Storage — bucket client-documents
-- ────────────────────────────────────────────────────────────────
-- פוליסה ישנה כבר נמחקה למעלה.
-- אדמין: גישה מלאה
CREATE POLICY "storage: admin"
  ON storage.objects FOR ALL
  USING  (bucket_id = 'client-documents' AND is_admin())
  WITH CHECK (bucket_id = 'client-documents' AND is_admin());

-- לקוח: גישה לתיקייה שלו בלבד (נתיב: {client_id}/...)
CREATE POLICY "storage: client own folder"
  ON storage.objects FOR ALL
  USING  (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = current_client_id()::text
  )
  WITH CHECK (
    bucket_id = 'client-documents'
    AND (storage.foldername(name))[1] = current_client_id()::text
  );
