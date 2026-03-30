-- גרסה 7: טבלת מסמכי לקוח + שדה הגשה

-- מסמכים שהלקוח מעלה (הלוואות, קרן השתלמות, דוח רווח והפסד)
create table if not exists client_documents (
  id          bigserial primary key,
  client_id   bigint references clients(id) on delete cascade,
  category    text not null,            -- loan_mortgage, loan_bank, loan_car, loan_work, loan_family, loan_credit, loan_overdraft, loan_other, loans_section, provident_fund, profit_loss
  label       text,                     -- תווית ידידותית
  files       jsonb default '[]'::jsonb,-- [{filename, size}]
  marked_done boolean default false,
  created_at  timestamptz default now(),
  unique(client_id, category)
);

-- תאריך הגשה בלקוח (כאשר לוחץ "הגש")
alter table clients add column if not exists submitted_at timestamptz;
