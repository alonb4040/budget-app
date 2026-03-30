-- גרסה 5: טבלת debts לניהול חובות

create table if not exists debts (
  id               bigint generated always as identity primary key,
  client_id        bigint references clients(id) on delete cascade,
  name             text not null,
  type             text not null default 'loan'
                   check (type in ('loan','mortgage','credit_card','overdraft','other')),
  original_balance numeric not null,   -- יתרה מקורית בעת פתיחה
  interest_rate    numeric not null default 0, -- ריבית שנתית %
  min_payment      numeric not null default 0, -- תשלום חודשי
  start_date       date,               -- תאריך תחילת ההלוואה
  due_day          integer,            -- יום חיוב בחודש (1-31)
  notes            text,
  created_at       timestamptz default now()
);
