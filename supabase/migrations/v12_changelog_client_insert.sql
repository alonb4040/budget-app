-- Allow clients to insert their own change log entries
-- (previously only admins could write)
DO $$ BEGIN
  CREATE POLICY "client_change_log: client insert"
    ON client_change_log FOR INSERT
    WITH CHECK (client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
