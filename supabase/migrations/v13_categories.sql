-- ════════════════════════════════════════════════════════════════
-- v13_categories — טבלת קטגוריות דינמית
-- גלובליות (client_id IS NULL) נשלטות ע"י אדמין
-- אישיות (client_id = X) נשלטות ע"י הלקוח עצמו
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  section     TEXT NOT NULL,
  client_id   INT REFERENCES clients(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_ignored  BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Unique constraint ─────────────────────────────────────────────────────────
-- שם ייחודי בתוך אותו לקוח (NULL נחשב שונה מכל NULL אחר ב-Postgres,
-- לכן גלובליות לא מתנגשות ביניהן — נוסיף partial unique לשם בטיחות)
CREATE UNIQUE INDEX IF NOT EXISTS categories_global_unique
  ON categories (name) WHERE client_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS categories_client_unique
  ON categories (name, client_id) WHERE client_id IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- service_role — גישה מלאה (אדמין דרך Edge Functions)
DO $$ BEGIN
  CREATE POLICY "categories_service_role"
    ON categories TO service_role
    USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- לקוחות מורשים: רואים גלובליות + שלהם בלבד
DO $$ BEGIN
  CREATE POLICY "categories_select"
    ON categories FOR SELECT TO authenticated
    USING (client_id IS NULL OR client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- לקוח יכול להוסיף רק קטגוריות אישיות (לא גלובלי)
DO $$ BEGIN
  CREATE POLICY "categories_insert_client"
    ON categories FOR INSERT TO authenticated
    WITH CHECK (client_id IS NOT NULL AND client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- לקוח יכול למחוק רק שלו
DO $$ BEGIN
  CREATE POLICY "categories_delete_client"
    ON categories FOR DELETE TO authenticated
    USING (client_id IS NOT NULL AND client_id = current_client_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed — קטגוריות גלובליות ברירת מחדל ────────────────────────────────────
INSERT INTO categories (name, section, client_id, is_active, is_ignored, sort_order) VALUES
  -- 💰 הכנסות
  ('הכנסה בן/ת זוג נטו',        '💰 הכנסות', NULL, TRUE, FALSE, 10),
  ('קצבת ילדים',                 '💰 הכנסות', NULL, TRUE, FALSE, 20),
  ('שכירות',                     '💰 הכנסות', NULL, TRUE, FALSE, 30),
  ('הכנסה מההורים',              '💰 הכנסות', NULL, TRUE, FALSE, 40),
  ('תן ביס/סיבוס',               '💰 הכנסות', NULL, TRUE, FALSE, 50),
  ('הכנסות מזדמנות',             '💰 הכנסות', NULL, TRUE, FALSE, 60),
  ('אחר-הכנסה',                  '💰 הכנסות', NULL, TRUE, FALSE, 70),

  -- 🏠 דיור
  ('שכר דירה',                   '🏠 דיור',   NULL, TRUE, FALSE, 10),
  ('משכנתה',                     '🏠 דיור',   NULL, TRUE, FALSE, 20),
  ('חשמל',                       '🏠 דיור',   NULL, TRUE, FALSE, 30),
  ('ארנונה',                     '🏠 דיור',   NULL, TRUE, FALSE, 40),
  ('גז',                         '🏠 דיור',   NULL, TRUE, FALSE, 50),
  ('מים וביוב',                  '🏠 דיור',   NULL, TRUE, FALSE, 60),
  ('ועד בית',                    '🏠 דיור',   NULL, TRUE, FALSE, 70),
  ('מיסי יישוב',                 '🏠 דיור',   NULL, TRUE, FALSE, 80),
  ('מוקד אבטחה',                 '🏠 דיור',   NULL, TRUE, FALSE, 90),
  ('עוזרת בית',                  '🏠 דיור',   NULL, TRUE, FALSE, 100),
  ('גינון',                      '🏠 דיור',   NULL, TRUE, FALSE, 110),

  -- 📱 תקשורת
  ('טלפון נייד',                 '📱 תקשורת', NULL, TRUE, FALSE, 10),
  ('טלפון קווי',                 '📱 תקשורת', NULL, TRUE, FALSE, 20),
  ('תשתית אינטרנט',              '📱 תקשורת', NULL, TRUE, FALSE, 30),
  ('ספק אינטרנט',                '📱 תקשורת', NULL, TRUE, FALSE, 40),
  ('כבלים',                      '📱 תקשורת', NULL, TRUE, FALSE, 50),
  ('עיתונים',                    '📱 תקשורת', NULL, TRUE, FALSE, 60),

  -- 🎓 חינוך וילדים
  ('מעון',                       '🎓 חינוך וילדים', NULL, TRUE, FALSE, 10),
  ('צהרון',                      '🎓 חינוך וילדים', NULL, TRUE, FALSE, 20),
  ('בי"ס - תשלומים קבועים',     '🎓 חינוך וילדים', NULL, TRUE, FALSE, 30),
  ('חוגים',                      '🎓 חינוך וילדים', NULL, TRUE, FALSE, 40),
  ('שיעורי עזר',                 '🎓 חינוך וילדים', NULL, TRUE, FALSE, 50),
  ('קיץ גדול וחומרי לימוד',     '🎓 חינוך וילדים', NULL, TRUE, FALSE, 60),
  ('פסיכולוג/הוראה מתקנת',      '🎓 חינוך וילדים', NULL, TRUE, FALSE, 70),
  ('אוניברסיטה',                 '🎓 חינוך וילדים', NULL, TRUE, FALSE, 80),
  ('ספרים וצעצועים',             '🎓 חינוך וילדים', NULL, TRUE, FALSE, 90),
  ('דמי כיס',                    '🎓 חינוך וילדים', NULL, TRUE, FALSE, 100),
  ('שמרטף',                      '🎓 חינוך וילדים', NULL, TRUE, FALSE, 110),

  -- 🛡️ ביטוחים
  ('קופ"ח ביטוח משלים',         '🛡️ ביטוחים', NULL, TRUE, FALSE, 10),
  ('ביטוח רפואי פרטי',           '🛡️ ביטוחים', NULL, TRUE, FALSE, 20),
  ('ביטוח חיים',                 '🛡️ ביטוחים', NULL, TRUE, FALSE, 30),
  ('ביטוח דירה',                 '🛡️ ביטוחים', NULL, TRUE, FALSE, 40),
  ('ביטוח משכנתה',               '🛡️ ביטוחים', NULL, TRUE, FALSE, 50),
  ('ביטוח רכב מקיף וחובה',      '🛡️ ביטוחים', NULL, TRUE, FALSE, 60),

  -- 🚗 רכב ותחבורה
  ('דלק',                        '🚗 רכב ותחבורה', NULL, TRUE, FALSE, 10),
  ('טיפולים ורישוי',             '🚗 רכב ותחבורה', NULL, TRUE, FALSE, 20),
  ('חניה (כולל כביש 6)',         '🚗 רכב ותחבורה', NULL, TRUE, FALSE, 30),
  ('תחבורה ציבורית',             '🚗 רכב ותחבורה', NULL, TRUE, FALSE, 40),

  -- 🏦 הלוואות ומימון
  ('החזרי הלוואות תלוש',        '🏦 הלוואות ומימון', NULL, TRUE, FALSE, 10),
  ('החזרי הלוואות עו"ש',        '🏦 הלוואות ומימון', NULL, TRUE, FALSE, 20),
  ('חובות נוספים',               '🏦 הלוואות ומימון', NULL, TRUE, FALSE, 30),
  ('ריבית חובה בבנק',            '🏦 הלוואות ומימון', NULL, TRUE, FALSE, 40),
  ('עמלות בנק וכרטיסי אשראי',  '🏦 הלוואות ומימון', NULL, TRUE, FALSE, 50),

  -- 💊 בריאות ורפואה
  ('תרופות כרוניות',             '💊 בריאות ורפואה', NULL, TRUE, FALSE, 10),
  ('טיפולי שיניים',              '💊 בריאות ורפואה', NULL, TRUE, FALSE, 20),

  -- 🛒 קניות ואוכל
  ('סופר (אוכל)',                '🛒 קניות ואוכל', NULL, TRUE, FALSE, 10),
  ('פארם',                       '🛒 קניות ואוכל', NULL, TRUE, FALSE, 20),
  ('אוכל בחוץ (כולל משלוחים)', '🛒 קניות ואוכל', NULL, TRUE, FALSE, 30),
  ('ארוחות צהריים (עבודה)',     '🛒 קניות ואוכל', NULL, TRUE, FALSE, 40),
  ('חיות מחמד',                  '🛒 קניות ואוכל', NULL, TRUE, FALSE, 50),
  ('טיטולים ומוצרים לתינוק',   '🛒 קניות ואוכל', NULL, TRUE, FALSE, 60),
  ('סיגריות',                    '🛒 קניות ואוכל', NULL, TRUE, FALSE, 70),
  ('מוצרים לבית',                '🛒 קניות ואוכל', NULL, TRUE, FALSE, 80),

  -- 💅 טיפוח ויופי
  ('קוסמטיקה טיפולים',          '💅 טיפוח ויופי', NULL, TRUE, FALSE, 10),
  ('קוסמטיקה מוצרים',           '💅 טיפוח ויופי', NULL, TRUE, FALSE, 20),
  ('מספרה',                      '💅 טיפוח ויופי', NULL, TRUE, FALSE, 30),
  ('ביגוד והנעלה',               '💅 טיפוח ויופי', NULL, TRUE, FALSE, 40),

  -- 🎭 תרבות ופנאי
  ('בילויים',                    '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 10),
  ('מכון כושר',                  '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 20),
  ('נסיעות וחופשות',             '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 30),
  ('הוצאות חג',                  '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 40),
  ('מנויים (subscriptions)',     '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 50),
  ('מתנות לאירועים',             '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 60),
  ('ימי הולדת שלנו',             '🎭 תרבות ופנאי', NULL, TRUE, FALSE, 70),

  -- 💎 חיסכון
  ('הפקדות עצמאי',               '💎 חיסכון',     NULL, TRUE, FALSE, 10),
  ('חסכונות',                    '💎 חיסכון',     NULL, TRUE, FALSE, 20),

  -- 🔄 הוצאות שונות
  ('תרומות ומעשרות',             '🔄 הוצאות שונות', NULL, TRUE, FALSE, 10),
  ('מנוי מפעל הפיס',            '🔄 הוצאות שונות', NULL, TRUE, FALSE, 20),
  ('תמי4/נספרסו',                '🔄 הוצאות שונות', NULL, TRUE, FALSE, 30),
  ('מזונות',                     '🔄 הוצאות שונות', NULL, TRUE, FALSE, 40),
  ('מזומן ללא מעקב',             '🔄 הוצאות שונות', NULL, TRUE, FALSE, 50),
  ('הוצאות לא מתוכננות',        '🔄 הוצאות שונות', NULL, TRUE, FALSE, 60),
  ('אחר-קבוע',                   '🔄 הוצאות שונות', NULL, TRUE, FALSE, 70),
  ('אחר-משתנה',                  '🔄 הוצאות שונות', NULL, TRUE, FALSE, 80),

  -- 🚫 להתעלם
  ('להתעלם',                     '🚫 להתעלם',     NULL, TRUE, TRUE,  10)

ON CONFLICT DO NOTHING;
