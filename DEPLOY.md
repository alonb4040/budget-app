# מדריך פריסה — מאזן חכם
## זמן משוער: 15-20 דקות

---

## שלב 1 — Supabase (Database)

1. היכנס לאתר: https://supabase.com
2. לחץ "Start your project" → "Sign up" עם Gmail
3. צור פרויקט חדש:
   - שם: `budget-app`
   - סיסמה: בחר סיסמה חזקה (שמור אותה)
   - Region: `West EU (Ireland)` (הכי קרוב לישראל)
4. המתן ~2 דקות עד שהפרויקט מוכן
5. לך ל: **SQL Editor** (בתפריט השמאלי)
6. **העתק את תוכן הקובץ `supabase_setup.sql` ולחץ RUN**
7. לך ל: **Project Settings → API**
8. העתק ושמור:
   - `Project URL` (נראה כך: https://abcdefgh.supabase.co)
   - `anon public` key (מחרוזת ארוכה)

---

## שלב 2 — GitHub (אחסון קוד)

1. היכנס לאתר: https://github.com
2. צור חשבון אם אין לך
3. לחץ "+" → "New repository"
   - שם: `budget-app`
   - Public
   - לחץ "Create repository"
4. פתח terminal/cmd במחשב שלך
5. פתח את תיקיית הפרויקט שהורדת
6. הרץ:
```bash
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/budget-app.git
git push -u origin main
```

---

## שלב 3 — Netlify (אירוח)

1. היכנס לאתר: https://netlify.com
2. לחץ "Sign up" → "Continue with GitHub"
3. לחץ "Add new site" → "Import an existing project"
4. בחר "GitHub" → בחר את ה-repo שיצרת
5. הגדרות Build:
   - Build command: `npm run build`
   - Publish directory: `build`
6. לפני שלוחצים Deploy — לחץ "Add environment variables":
   - `REACT_APP_SUPABASE_URL` = ה-URL מ-Supabase
   - `REACT_APP_SUPABASE_ANON_KEY` = ה-anon key מ-Supabase
7. לחץ "Deploy site"
8. המתן ~3 דקות
9. תקבל URL כזה: `https://amazing-name-123.netlify.app`
   - אפשר לשנות ל-domain מותאם אישית בהמשך

---

## שלב 4 — כניסה ראשונה

1. פתח את ה-URL שקיבלת
2. כנס עם:
   - שם משתמש: `admin`
   - סיסמה: `admin123`
3. **שנה סיסמת admin מיד!** (ב-Supabase → SQL Editor):
```sql
update admin_settings set password = 'הסיסמה_החדשה_שלך';
```
4. צור לקוח ראשון מהפאנל

---

## שינוי הכתובת ל-Domain מותאם (אופציונלי)
ב-Netlify → Domain settings → Add custom domain
עולה ~$10/שנה ב-Namecheap / GoDaddy

---

## שאלות? שלח לי צילום מסך ואסייע
