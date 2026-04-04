// netlify/functions/bookmarklet-import.js
//
// מקבל POST מהבוקמרקלט של מקס עם תנועות + client_id,
// שומר ב-Supabase ומחזיר דף HTML עם הודעת הצלחה/שגיאה.
//
// אבטחה: משתמש ב-service_role key שנשמר כ-env variable ב-Netlify.
// הלקוח שולח רק client_id (מספר גלוי) — אין token secret.
// סיכון: מישהו שמנחש client_id יכול להוסיף תנועות. בפועל — סיכון זניח.

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.APP_URL || "https://symphonious-strudel-4b95e6.netlify.app";

function htmlPage(title, body, isError = false) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center;
           min-height: 100vh; margin: 0; background: #f4f6f3; direction: rtl; }
    .box { background: #fff; border-radius: 16px; padding: 40px 48px; text-align: center;
           box-shadow: 0 8px 32px rgba(0,0,0,0.1); max-width: 480px; }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: ${isError ? "#e53935" : "#2d6a4f"}; margin: 0 0 12px; }
    p { color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0 0 24px; }
    a { display: inline-block; background: ${isError ? "#e53935" : "#2d6a4f"}; color: #fff;
        padding: 12px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; }
    a:hover { opacity: 0.9; }
  </style>
  <script>
    // סגור טאב זה וחזור לאפליקציה אחרי 3 שניות
    setTimeout(() => {
      window.close();
      // אם לא הצליח לסגור (Chrome חוסם) — נווט לאפליקציה
      setTimeout(() => { window.location.href = "${APP_URL}"; }, 500);
    }, 3000);
  </script>
</head>
<body>
  <div class="box">
    ${body}
    <a href="${APP_URL}">חזור לאפליקציה ←</a>
  </div>
</body>
</html>`;
}

exports.handler = async (event) => {
  // תמיכה ב-CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage("שגיאה", `<div class="icon">❌</div><h1>שיטה לא נתמכת</h1><p>נא להשתמש בבוקמרקלט.</p>`, true),
    };
  }

  // --- ולידציה של משתני סביבה ---
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("[bookmarklet-import] Missing env vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage("שגיאת שרת", `<div class="icon">⚠️</div><h1>שגיאת הגדרות שרת</h1><p>אנא פנה לאלון.</p>`, true),
    };
  }

  // --- פיענוח הגוף ---
  let payload;
  try {
    // הבוקמרקלט שולח form POST — content-type: application/x-www-form-urlencoded
    const body = event.body || "";
    const isBase64 = event.isBase64Encoded;
    const decoded = isBase64 ? Buffer.from(body, "base64").toString("utf-8") : body;

    const params = new URLSearchParams(decoded);
    const dataStr = params.get("data");
    const clientIdStr = params.get("client_id");

    if (!dataStr) throw new Error("חסר שדה data");
    if (!clientIdStr) throw new Error("חסר שדה client_id — נא להתחבר לאפליקציה תחילה");

    payload = JSON.parse(dataStr);
    payload.client_id = parseInt(clientIdStr, 10);

    if (!Number.isInteger(payload.client_id) || payload.client_id <= 0) {
      throw new Error("client_id לא תקין");
    }
    if (!Array.isArray(payload.transactions) || payload.transactions.length === 0) {
      throw new Error("לא נשלחו תנועות");
    }
  } catch (e) {
    console.error("[bookmarklet-import] Parse error:", e.message);
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage("שגיאה", `<div class="icon">❌</div><h1>שגיאה בקריאת הנתונים</h1><p>${e.message}</p>`, true),
    };
  }

  const { client_id, transactions, source, card_last4 } = payload;

  // --- וידוא שהלקוח קיים ---
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", client_id)
    .maybeSingle();

  if (clientErr || !client) {
    console.error("[bookmarklet-import] Client not found:", client_id, clientErr?.message);
    return {
      statusCode: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage("שגיאה", `<div class="icon">❌</div><h1>לקוח לא נמצא</h1><p>נא להתחבר לאפליקציה ולנסות שוב.</p>`, true),
    };
  }

  // --- הכן שורות לשמירה, דלג על כפילויות ---
  // בדוק אם כבר קיימות תנועות עם אותו תאריך+שם+סכום ללקוח זה (מניעת כפילויות)
  const { data: existing } = await supabase
    .from("imported_transactions")
    .select("name, date, amount")
    .eq("client_id", client_id)
    .eq("source", source || "max_bookmarklet");

  const existingSet = new Set(
    (existing || []).map(t => `${t.date}|${t.name}|${t.amount}`)
  );

  const toInsert = transactions
    .filter(tx => {
      const key = `${tx.date}|${tx.name}|${tx.amount}`;
      return !existingSet.has(key);
    })
    .map(tx => ({
      client_id,
      name: tx.name || "",
      date: tx.date || null,
      amount: parseFloat(tx.amount) || 0,
      max_category: tx.cat || "",
      source: source || "max_bookmarklet",
      card_last4: card_last4 || null,
      created_at: new Date().toISOString(),
    }));

  const duplicates = transactions.length - toInsert.length;

  if (toInsert.length === 0) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage(
        "כפילויות",
        `<div class="icon">ℹ️</div>
         <h1>כל התנועות כבר קיימות</h1>
         <p>כל ${transactions.length} התנועות שנשלחו כבר נמצאות בחשבון שלך.<br>לא נוספו תנועות חדשות.</p>`
      ),
    };
  }

  // --- שמירה ב-DB ---
  const { error: insertErr } = await supabase
    .from("imported_transactions")
    .insert(toInsert);

  if (insertErr) {
    console.error("[bookmarklet-import] Insert error:", insertErr.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body: htmlPage("שגיאת שמירה", `<div class="icon">❌</div><h1>שגיאה בשמירת התנועות</h1><p>${insertErr.message}</p>`, true),
    };
  }

  console.log(`[bookmarklet-import] ✅ client=${client_id} added=${toInsert.length} duplicates=${duplicates}`);

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: htmlPage(
      "נשמר בהצלחה",
      `<div class="icon">✅</div>
       <h1>${toInsert.length} תנועות נוספו למאזן</h1>
       <p>${duplicates > 0 ? `${duplicates} תנועות כפולות דולגו.<br>` : ""}חלון זה ייסגר אוטומטית...</p>`
    ),
  };
};
