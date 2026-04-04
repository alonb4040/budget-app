-- הרץ את זה ב-SQL Editor של Supabase

-- טבלת הגדרות מנהל
create table admin_settings (
  id bigint primary key default 1,
  password text not null default 'admin123'
);
insert into admin_settings (id, password) values (1, 'admin123')
  on conflict (id) do nothing;

-- טבלת לקוחות
create table clients (
  id bigserial primary key,
  name text not null,
  username text not null unique,
  password text not null,
  created_at timestamptz default now()
);

-- טבלת הגשות
create table submissions (
  id bigserial primary key,
  client_id bigint references clients(id) on delete cascade,
  label text,
  files jsonb,
  transactions jsonb,
  created_at timestamptz default now()
);

-- טבלת מיפויי בתי עסק
create table remembered_mappings (
  id bigserial primary key,
  client_id bigint references clients(id) on delete cascade,
  business_name text not null,
  category text not null,
  created_at timestamptz default now(),
  unique(client_id, business_name)
);

-- הגדרות Row Level Security (RLS) — חשוב!
alter table admin_settings enable row level security;
alter table clients enable row level security;
alter table submissions enable row level security;
alter table remembered_mappings enable row level security;

-- מדיניות: גישה חופשית דרך anon key (האפליקציה מנהלת הרשאות בעצמה)
create policy "allow all" on admin_settings for all using (true);
create policy "allow all" on clients for all using (true);
create policy "allow all" on submissions for all using (true);
create policy "allow all" on remembered_mappings for all using (true);

-- טבלת תלושי משכורת (הרץ רק אם עוד לא קיים)
create table if not exists payslips (
  id bigserial primary key,
  client_id bigint references clients(id) on delete cascade,
  label text,
  month_key text,
  filename text,
  created_at timestamptz default now()
);
alter table payslips enable row level security;
create policy "allow all" on payslips for all using (true);
