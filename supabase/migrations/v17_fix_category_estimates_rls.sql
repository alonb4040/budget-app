-- v17: תיקון RLS על category_estimates
-- הבאג: v16 השתמש ב-auth.uid()::text במקום current_client_id()
-- כתוצאה מכך INSERT נחסם ב-403

DROP POLICY IF EXISTS "client_own_estimates" ON category_estimates;
CREATE POLICY "client_own_estimates" ON category_estimates
  FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());

DROP POLICY IF EXISTS "admin_read_estimates" ON category_estimates;
-- אדמין כבר מכוסה ב-"client_own_estimates" עם is_admin()
