-- v33: admin_data column for admin overrides of client-entered data in client_documents
ALTER TABLE client_documents
  ADD COLUMN IF NOT EXISTS admin_data JSONB DEFAULT '{}'::jsonb;
