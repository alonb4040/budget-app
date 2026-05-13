-- ════════════════════════════════════════════════════════════════
-- v26_sections_rename — הסרת אימוגי משמות סקציות בטבלת categories
-- ניקיון: שם הסקציה הוא נתון בלבד — האייקון מנוהל בקוד (SECTION_ICONS)
-- ════════════════════════════════════════════════════════════════

UPDATE categories SET section = 'הכנסות'                  WHERE section = '💰 הכנסות';
UPDATE categories SET section = 'דיור'                    WHERE section = '🏠 דיור';
UPDATE categories SET section = 'תקשורת'                  WHERE section = '📱 תקשורת';
UPDATE categories SET section = 'חינוך וילדים'            WHERE section = '🎓 חינוך וילדים';
UPDATE categories SET section = 'ילדים'                   WHERE section = '🎓 ילדים';
UPDATE categories SET section = 'ביטוחים'                 WHERE section = '🛡️ ביטוחים';
UPDATE categories SET section = 'הלוואות ומימון'          WHERE section = '🏦 הלוואות ומימון';
UPDATE categories SET section = 'בריאות'                  WHERE section = '💊 בריאות';
UPDATE categories SET section = 'בריאות'                  WHERE section = '💊 בריאות ורפואה';
UPDATE categories SET section = 'רכב'                     WHERE section = '🔧 רכב';
UPDATE categories SET section = 'פנאי קבוע'               WHERE section = '🎯 פנאי קבוע';
UPDATE categories SET section = 'מנויים'                  WHERE section = '📲 מנויים';
UPDATE categories SET section = 'חיסכון'                  WHERE section = '💎 חיסכון';
UPDATE categories SET section = 'שונות קבועות'            WHERE section = '📌 שונות קבועות';
UPDATE categories SET section = 'קניות ואוכל'             WHERE section = '🛒 קניות ואוכל';
UPDATE categories SET section = 'טיפוח ויופי'             WHERE section = '💅 טיפוח ויופי';
UPDATE categories SET section = 'תרבות ופנאי'             WHERE section = '🎭 תרבות ופנאי';
UPDATE categories SET section = 'ילדים - הוצאות משתנות'   WHERE section = '👶 ילדים - הוצאות משתנות';
UPDATE categories SET section = 'רכב ותחבורה'             WHERE section = '🚗 רכב ותחבורה';
UPDATE categories SET section = 'בנק'                     WHERE section = '🏧 בנק';
UPDATE categories SET section = 'שונות'                   WHERE section = '🔄 שונות';
UPDATE categories SET section = 'שונות'                   WHERE section = '🔄 הוצאות שונות';
UPDATE categories SET section = 'להתעלם'                  WHERE section = '🚫 להתעלם';
UPDATE categories SET section = 'הקטגוריות שלי'           WHERE section = '⭐ הקטגוריות שלי';
