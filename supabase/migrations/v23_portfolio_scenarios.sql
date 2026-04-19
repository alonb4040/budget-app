-- v23: טבלאות תסריטים תקציביים
-- portfolio_scenarios  — כותרת + תאריך + סדר
-- portfolio_scenario_entries — ערך לכל קטגוריה × תסריט

CREATE TABLE IF NOT EXISTS portfolio_scenarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT 'תסריט חדש',
  date_type   text NOT NULL DEFAULT 'month_year'
                CHECK (date_type IN ('month_year', 'year', 'free')),
  date_value  text NOT NULL DEFAULT '',
  sort_order  int  NOT NULL DEFAULT 0,
  is_base     boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_scenario_entries (
  scenario_id uuid NOT NULL REFERENCES portfolio_scenarios(id) ON DELETE CASCADE,
  client_id   bigint NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category    text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (scenario_id, category)
);

-- רשאי לגשת רק אדמין
ALTER TABLE portfolio_scenarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_scenario_entries  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_portfolio_scenarios" ON portfolio_scenarios
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "admin_portfolio_scenario_entries" ON portfolio_scenario_entries
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
