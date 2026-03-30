-- גרסה 3: תמיכה בתקופות תסריט מרובות + ניווט שנתי

-- 1. הוסף עמודת active_until לתסריט הפעיל (null = ללא תאריך סיום)
alter table active_scenario add column if not exists active_until date;

-- 2. הסר את ה-unique constraint על client_id כדי לאפשר מספר תקופות ללקוח
--    (Supabase קורא לזה active_scenario_client_id_key כברירת מחדל)
alter table active_scenario drop constraint if exists active_scenario_client_id_key;

-- 3. הוסף עמודת completion_email_sent ל-clients אם לא קיים
alter table clients add column if not exists completion_email_sent boolean default false;
alter table clients add column if not exists cycle_start_day integer default 1;
