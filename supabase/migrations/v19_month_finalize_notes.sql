-- v19: הוספת שדה הערות לסיום חודש ולסיכום הגשה
-- משימה 4א: הערה חופשית בתוך popup סיים חודש (month_entries.finalize_note)
-- משימה 4ב: הערות מסכמות מוצגות בchecklist (clients.submission_notes כבר קיים)

ALTER TABLE month_entries
  ADD COLUMN IF NOT EXISTS finalize_note TEXT;
