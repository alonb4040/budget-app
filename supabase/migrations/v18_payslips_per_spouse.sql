-- v18: תמיכה בתלושי שכר לפי בן/בת זוג + אפשרות "אין לי תלושים"

-- 1. הוסף spouse_index לטבלת payslips (NULL = רשומות ישנות לפני הפיצ'ר)
ALTER TABLE payslips
  ADD COLUMN IF NOT EXISTS spouse_index INT; -- 1 = בן/בת זוג ראשון, 2 = בן/בת זוג שני

-- 2. הוסף עמודות opt-out לטבלת clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS no_payslip_reason_s1 TEXT,
  ADD COLUMN IF NOT EXISTS no_payslip_reason_s2 TEXT;
