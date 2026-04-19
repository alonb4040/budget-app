-- v21: Phase 2 שדרוג טבלת סיכום תנועות
-- 1. הוסף budget_type לטבלת estimates (לקטגוריות ידניות)
-- 2. טבלת override לממוצע — לשורות של עסקאות אמיתיות

ALTER TABLE category_estimates
  ADD COLUMN IF NOT EXISTS budget_type text NOT NULL DEFAULT 'משתנה';

CREATE TABLE IF NOT EXISTS portfolio_avg_overrides (
  client_id    bigint REFERENCES clients(id) ON DELETE CASCADE,
  category     text NOT NULL,
  override_avg numeric NOT NULL,
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, category)
);

ALTER TABLE portfolio_avg_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_portfolio_avg_overrides" ON portfolio_avg_overrides
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
