-- Allow clients to upsert their own client_intake row
-- Previously only admins could write; clients only had SELECT.
-- Needed so clients can save electricity bills and other self-entered data.

CREATE POLICY "client_intake: client write"
  ON client_intake FOR ALL
  USING (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());
