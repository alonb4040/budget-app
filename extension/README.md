# מאזן Extension — הוראות התקנה ופיתוח

## התקנה (Development Mode)

1. פתח Chrome → `chrome://extensions`
2. הפעל "Developer mode" (מתג בפינה הימנית)
3. לחץ "Load unpacked"
4. בחר את תיקיית `extension`

## לפני הפעלה — חשוב!

1. פתח `src/popup.js` ו-`src/background.js`
2. החלף `REPLACE_WITH_ANON_KEY` במפתח ה-Supabase anon שלך

## שימוש

1. לחץ על האייקון של מאזן בדפדפן
2. התחבר עם שם המשתמש והסיסמה שלך
3. לחץ "סנכרן" ליד מקס
4. Extension יפתח אוטומטית את אתר מקס ויחלץ את התנועות

## מבנה הקבצים

```
extension/
├── manifest.json          — הגדרות Extension
├── popup.html             — ממשק המשתמש
├── src/
│   ├── popup.js           — לוגיקת ה-popup
│   ├── background.js      — Service Worker (תקשורת + שמירה)
│   └── providers/
│       ├── max.js         — Content script למקס
│       └── isracard.js    — Content script לישראכרט (בפיתוח)
└── icons/                 — אייקונים (להוסיף)
```

## הוספת ספק חדש

1. צור קובץ `src/providers/[provider].js`
2. הוסף `content_scripts` ב-`manifest.json`
3. הוסף כפתור ב-`popup.html`
4. הוסף URL ב-`background.js` ב-`PROVIDER_URLS`
