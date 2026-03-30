-- גרסה 4: טבלת manual_transactions לתנועות ידניות

create table if not exists manual_transactions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete cascade,
  billing_month text not null,          -- YYYY-MM
  date          text,                   -- DD/MM/YYYY (אופציונלי)
  name          text not null,          -- פירוט
  amount        numeric not null,
  cat           text not null,          -- סיווג
  type          text not null check (type in ('income', 'expense')),
  payment_method text,                  -- 'מזומן' | טקסט חופשי | null להכנסות
  created_at    timestamptz default now()
);

-- RLS (אם מופעל בעתיד)
-- alter table manual_transactions enable row level security;
