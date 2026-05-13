-- MAX sync: session tracking columns on clients + sync log table

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS max_session_active boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS max_session_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS sync_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id bigint REFERENCES clients(id) ON DELETE CASCADE,
  synced_at timestamptz DEFAULT now(),
  transactions_count integer DEFAULT 0,
  status text CHECK (status IN ('success', 'error')),
  error_message text,
  source text DEFAULT 'extension'
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all sync logs
CREATE POLICY "admin_read_sync_log" ON sync_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admins WHERE admins.user_id = auth.uid()
    )
  );

-- Service role can insert (used by backend sync worker)
CREATE POLICY "service_insert_sync_log" ON sync_log
  FOR INSERT WITH CHECK (true);
