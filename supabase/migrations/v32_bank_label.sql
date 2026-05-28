-- v32: הוספת bank_label ל-bank_submissions (שם בנק + תיאור חשבון)
ALTER TABLE bank_submissions
  ADD COLUMN IF NOT EXISTS bank_label TEXT;
