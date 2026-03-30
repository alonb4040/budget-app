-- ════════════════════════════════════════════════════════════════
-- supabase_v10.sql — path column for payslips (Supabase Storage)
-- הרץ ב-SQL Editor של Supabase
-- ════════════════════════════════════════════════════════════════

alter table payslips add column if not exists path text default null;
