-- גרסה 6: עמודת plan בלקוחות + טבלת ai_insights

-- הוסף עמודת תכנית ללקוחות (free / pro)
alter table clients add column if not exists plan text default 'free'
  check (plan in ('free','pro'));

-- טבלת מטמון תובנות AI (חסכת קריאה לAPI בכל כניסה)
create table if not exists ai_insights (
  id          bigserial primary key,
  client_id   bigint references clients(id) on delete cascade,
  month_key   text not null,          -- YYYY-MM
  content     text not null,          -- טקסט תובנות מ-Claude
  created_at  timestamptz default now(),
  unique (client_id, month_key)
);
