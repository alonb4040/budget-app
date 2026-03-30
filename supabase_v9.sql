-- ════════════════════════════════════════════════════════════════
-- supabase_v9.sql — storage bucket + required_docs + extra_data
-- הרץ ב-SQL Editor של Supabase
-- ════════════════════════════════════════════════════════════════

-- 1. Storage bucket לקבצי לקוחות (פרטי, לא public)
insert into storage.buckets (id, name, public)
  values ('client-documents', 'client-documents', false)
  on conflict (id) do nothing;

-- פוליסת גישה לbucket
create policy "allow all on client-documents"
  on storage.objects for all
  using (bucket_id = 'client-documents')
  with check (bucket_id = 'client-documents');

-- 2. עמודה extra_data בטבלת client_documents (להלוואות עם שדות)
alter table client_documents add column if not exists extra_data jsonb default null;

-- 3. עמודה required_docs בטבלת clients (המאמן בוחר אילו מסמכים הלקוח צריך)
alter table clients add column if not exists required_docs jsonb default null;

-- 4. כמה שאלונים נדרשים (1 = בן/בת זוג ראשון בלבד, 2 = שני בני זוג)
alter table clients add column if not exists questionnaire_spouses int default null;

-- 5. עמודה questionnaire_done בטבלת client_questionnaire (לסימון "סיימתי" פר בן/בת זוג)
alter table client_questionnaire add column if not exists done boolean default false;
