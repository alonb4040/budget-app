-- v30: הוספת account_index לbank_submissions + bank_account_count ל-clients

ALTER TABLE bank_submissions
  ADD COLUMN IF NOT EXISTS account_index SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS bank_account_count SMALLINT NOT NULL DEFAULT 1;
