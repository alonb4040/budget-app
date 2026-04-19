-- v22: טבלת override לערכי חודשים בטבלת סיכום תנועות
-- מאפשרת לאדמין לערוך ידנית ערך של קטגוריה בחודש ספציפי
-- שומרת גם את הערך המקורי לצורך איפוס (↩)

CREATE TABLE IF NOT EXISTS portfolio_month_overrides (
  client_id       bigint REFERENCES clients(id) ON DELETE CASCADE,
  month_key       text NOT NULL,
  category        text NOT NULL,
  override_amount numeric NOT NULL,
  original_amount numeric NOT NULL,
  updated_at      timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, month_key, category)
);

ALTER TABLE portfolio_month_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_portfolio_month_overrides" ON portfolio_month_overrides
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
