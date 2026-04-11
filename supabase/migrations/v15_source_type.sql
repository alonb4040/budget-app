-- v15: Add source_type and source_nickname to portfolio_submissions
-- Allows distinguishing between multiple accounts of the same type (e.g., עו"ש לאומי vs עו"ש פועלים)
ALTER TABLE portfolio_submissions
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_nickname TEXT;
