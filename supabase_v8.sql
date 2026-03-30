-- ════════════════════════════════════════════════════
-- supabase_v8.sql — שאלון אימון + טופס פגישה ראשונה
-- הרץ ב-SQL Editor של Supabase
-- ════════════════════════════════════════════════════

-- טבלת שאלוני אימון (לקוח ממלא, שני בני זוג)
create table if not exists client_questionnaire (
  id         bigserial primary key,
  client_id  bigint references clients(id) on delete cascade,
  spouse_index int not null default 1,  -- 1 = בן/בת זוג ראשון, 2 = שני
  answers    jsonb not null default '{}',
  updated_at timestamptz default now(),
  unique(client_id, spouse_index)
);
alter table client_questionnaire enable row level security;
create policy "allow all" on client_questionnaire for all using (true);

-- טבלת טופס פגישה ראשונה (המאמן ממלא)
create table if not exists client_intake (
  id         bigserial primary key,
  client_id  bigint references clients(id) on delete cascade unique,
  data       jsonb not null default '{}',
  updated_at timestamptz default now()
);
alter table client_intake enable row level security;
create policy "allow all" on client_intake for all using (true);
