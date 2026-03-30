-- הרץ את זה ב-SQL Editor של Supabase (שינויים לגרסה 2)

-- הוסף עמודות לטבלת submissions
alter table submissions add column if not exists month_key text;
alter table submissions add column if not exists is_finalized boolean default false;
alter table submissions add column if not exists source_label text; -- "מקס", "ישראכרט", "עו\"ש" וכו'

-- הוסף עמודות ללקוחות
alter table clients add column if not exists email text;
alter table clients add column if not exists phone text;
alter table clients add column if not exists portfolio_open boolean default false;

-- טבלת month_entries — חודש עם סטטוס הושלם
create table if not exists month_entries (
  id bigserial primary key,
  client_id bigint references clients(id) on delete cascade,
  month_key text not null,           -- e.g. "2026-03"
  label text not null,               -- e.g. "מרץ 2026"
  is_finalized boolean default false,
  created_at timestamptz default now(),
  unique(client_id, month_key)
);
alter table month_entries enable row level security;
create policy "allow all" on month_entries for all using (true);

-- טבלת חודשי תיק כלכלי (נפרדת מ-month_entries)
create table if not exists portfolio_months (
  id bigserial primary key,
  client_id bigint references clients(id) on delete cascade,
  month_key text not null,
  label text not null,
  is_finalized boolean default false,
  created_at timestamptz default now(),
  unique(client_id, month_key)
);
alter table portfolio_months enable row level security;
create policy "allow all" on portfolio_months for all using (true);

-- טבלת תנועות תיק כלכלי
create table if not exists portfolio_submissions (
  id bigserial primary key,
  client_id bigint references clients(id) on delete cascade,
  month_key text not null,
  label text,
  source_label text,
  files jsonb,
  transactions jsonb,
  created_at timestamptz default now()
);
alter table portfolio_submissions enable row level security;
create policy "allow all" on portfolio_submissions for all using (true);
