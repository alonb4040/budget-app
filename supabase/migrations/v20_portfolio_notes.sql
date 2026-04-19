-- v20: טבלת הערות אדמין לטבלת סיכום תנועות
-- הערה אחת לכל לקוח + קטגוריה, גישת אדמין בלבד

CREATE TABLE IF NOT EXISTS portfolio_notes (
  client_id  bigint REFERENCES clients(id) ON DELETE CASCADE,
  category   text NOT NULL,
  note       text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (client_id, category)
);

ALTER TABLE portfolio_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_portfolio_notes" ON portfolio_notes
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());
