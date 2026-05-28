-- v29: טבלת תנועות עו"ש (bank_submissions)
-- נפרדת מ-submissions (אשראי) — לפירוט תנועות חשבון בנק

CREATE TABLE IF NOT EXISTS bank_submissions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   BIGINT      NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month_key   TEXT        NOT NULL,
  label       TEXT,
  transactions JSONB      NOT NULL DEFAULT '[]',
  files       TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_submissions_client_id_idx ON bank_submissions(client_id);
CREATE INDEX IF NOT EXISTS bank_submissions_month_key_idx ON bank_submissions(client_id, month_key);

ALTER TABLE bank_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_submissions: access"
  ON bank_submissions FOR ALL
  USING (is_admin() OR client_id = current_client_id())
  WITH CHECK (is_admin() OR client_id = current_client_id());
