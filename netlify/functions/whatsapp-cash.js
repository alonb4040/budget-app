// netlify/functions/whatsapp-cash.js
//
// מקבל webhook מ-Twilio WhatsApp, מפרסר הוצאת מזומן,
// מסווג לפי הקטגוריות של הלקוח ושומר ב-manual_transactions.
//
// פורמט הודעה נתמך:
//   "קפה 18"                        → שם: קפה, סכום: 18
//   "18 קפה"                        → שם: קפה, סכום: 18
//   "נסיעה לתל אביב 45"             → שם: נסיעה לתל אביב, סכום: 45
//   "קפה 18 הערה יום הולדת דני"     → שם: קפה, סכום: 18, הערה: יום הולדת דני
//   "עזרה" או "help"                → הוראות שימוש

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL      = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── TwiML response helper ────────────────────────────────────────────────────
function twiml(msg) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/xml" },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`,
  };
}

// ── נרמול מספר טלפון ─────────────────────────────────────────────────────────
// Twilio שולח "whatsapp:+972501234567" — נמיר ל-"0501234567"
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, ""); // רק ספרות
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

// ── פרסור הודעה ──────────────────────────────────────────────────────────────
// מחזיר { name, amount, note } או null אם לא הצליח
function parseMessage(text) {
  const t = (text || "").trim();
  if (!t) return null;

  // הוצא הערה אחרי מילת "הערה"
  let note = null;
  let body = t;
  const noteMatch = t.match(/הערה[:\s]+(.+)$/iu);
  if (noteMatch) {
    note = noteMatch[1].trim();
    body = t.slice(0, noteMatch.index).trim();
  }

  // מצא את הסכום — המספר הראשון (כולל עשרוני)
  const numMatch = body.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;

  const amount = parseFloat(numMatch[1]);
  if (!amount || amount <= 0) return null;

  const before = body.slice(0, numMatch.index).trim();
  const after  = body.slice(numMatch.index + numMatch[0].length).trim();

  // שם = מה שלפני הסכום, אם ריק — מה שאחריו
  const name = before || after;
  if (!name) return null;

  return { name, amount, note };
}

// ── חישוב billing_month לפי יום איפוס ───────────────────────────────────────
// זהה ללוגיקת assignBillingMonth ב-data.ts
function assignBillingMonth(dateStr, cycleStartDay) {
  if (!dateStr) return null;
  const d   = new Date(dateStr);
  const day = d.getDate();
  const sd  = cycleStartDay || 1;
  let year  = d.getFullYear();
  let month = d.getMonth() + 1;
  if (day >= sd) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ── סיווג תנועה (מקביל ל-classifyTx ב-data.ts) ──────────────────────────────
function classifyTx(name, rememberedMappings, rules) {
  if (rememberedMappings[name]) return { cat: rememberedMappings[name], conf: "high" };
  const nl = (name || "").toLowerCase();
  for (const rule of rules) {
    if ((rule.keywords || []).some(kw => nl.includes(kw.toLowerCase()))) {
      return { cat: rule.name, conf: "high" };
    }
  }
  for (const rule of rules) {
    if ((rule.max_hints || []).some(h => nl.includes(h.toLowerCase()))) {
      return { cat: rule.name, conf: "med" };
    }
  }
  return { cat: "הוצאות לא מתוכננות", conf: "low" };
}

// ── HELP message ─────────────────────────────────────────────────────────────
const HELP_MSG = `💡 *איך לרשום הוצאת מזומן:*

*שם + סכום:*
קפה 18
סופר 120

*סכום + שם:*
45 דלק

*עם הערה:*
קפה 18 הערה יום הולדת

📌 הוצאות שלא מסווגות אוטומטית יסומנו באדום באתר לסיווג ידני.`;

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // פרסור body מ-Twilio (application/x-www-form-urlencoded)
  const params = Object.fromEntries(new URLSearchParams(event.body));
  const rawFrom = params.From || "";   // "whatsapp:+972501234567"
  const body    = (params.Body || "").trim();

  // עזרה
  if (/^(עזרה|help|הוראות)$/i.test(body)) {
    return twiml(HELP_MSG);
  }

  // זיהוי לקוח לפי מספר טלפון
  const phone = normalizePhone(rawFrom);
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, cycle_start_day")
    .or(`phone.eq.${phone},phone.eq.+972${phone.slice(1)}`)
    .maybeSingle();

  if (!client) {
    return twiml("❌ המספר שלך לא מזוהה במערכת. פנה ליועץ שלך להוספה.");
  }

  // פרסור ההודעה
  const parsed = parseMessage(body);
  if (!parsed) {
    return twiml(`❌ לא הבנתי. נסה לכתוב: *שם + סכום* (לדוגמה: קפה 18)\nלהוראות מלאות כתוב: עזרה`);
  }

  const { name, amount, note } = parsed;

  // טעינת remembered_mappings + rules
  const [{ data: maps }, { data: rules }] = await Promise.all([
    supabase.from("remembered_mappings").select("business_name,category").eq("client_id", client.id),
    supabase.from("categories").select("name,keywords,max_hints").or(`client_id.is.null,client_id.eq.${client.id}`).eq("is_active", true),
  ]);

  const rememberedMappings = {};
  (maps || []).forEach(m => { rememberedMappings[m.business_name] = m.category; });

  const { cat, conf } = classifyTx(name, rememberedMappings, rules || []);

  // חישוב תאריך ו-billing_month
  const today = new Date().toISOString().slice(0, 10);
  const billingMonth = assignBillingMonth(today, client.cycle_start_day || 1);

  // שמירה ב-manual_transactions
  const { error } = await supabase.from("manual_transactions").insert([{
    client_id:     client.id,
    date:          today,
    name,
    amount,
    cat,
    conf,
    note:          note || null,
    type:          "expense",
    payment_method: "מזומן",
    billing_month: billingMonth,
  }]);

  if (error) {
    console.error("DB error:", error);
    return twiml("❌ שגיאה בשמירה, נסה שוב.");
  }

  // תשובה ללקוח
  const confMsg = conf === "high"
    ? `✅ נרשם: *${name}* ₪${amount} → ${cat}`
    : `🔴 נרשם: *${name}* ₪${amount}\nלא הצלחתי לסווג אוטומטית — יש לסווג באתר.`;

  const noteMsg = note ? `\n📝 הערה: ${note}` : "";

  return twiml(confMsg + noteMsg);
};
