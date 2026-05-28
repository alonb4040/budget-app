-- v34: balance settings per client — admin preferences for category display
-- Replaces localStorage storage for catTypeOvr, catRenames, hiddenCats
-- so these are consistent across all admin browsers

CREATE TABLE IF NOT EXISTS portfolio_balance_settings (
  client_id     bigint REFERENCES clients(id) ON DELETE CASCADE PRIMARY KEY,
  cat_type_ovr  JSONB DEFAULT '{}'::jsonb,
  cat_renames   JSONB DEFAULT '{}'::jsonb,
  hidden_cats   JSONB DEFAULT '[]'::jsonb,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE portfolio_balance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_portfolio_balance_settings" ON portfolio_balance_settings
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
