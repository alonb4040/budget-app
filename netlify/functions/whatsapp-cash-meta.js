// netlify/functions/whatsapp-cash-meta.js
//
// מקבל webhook מ-Meta Cloud API (WhatsApp Business),
// מפרסר הוצאת מזומן, מסווג לפי קטגוריות הלקוח ושומר ב-manual_transactions.
//
// משתני סביבה נדרשים (בנטליפי):
//   REACT_APP_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   WHATSAPP_TOKEN          — access token מ-Meta Developer Console
//   WHATSAPP_VERIFY_TOKEN   — מחרוזת סודית שאתה בוחר (לאימות webhook)
//   WHATSAPP_PHONE_NUMBER_ID — Phone Number ID מ-Meta Developer Console
//
// פורמט הודעה נתמך:
//   "קפה 18"                        → שם: קפה, סכום: 18
//   "18 קפה"                        → שם: קפה, סכום: 18
//   "נסיעה לתל אביב 45"             → שם: נסיעה לתל אביב, סכום: 45
//   "קפה 18 הערה יום הולדת דני"     → שם: קפה, סכום: 18, הערה: יום הולדת דני
//   "עזרה" או "help"                → הוראות שימוש

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL        = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_ROLE_KEY;
const WA_TOKEN            = process.env.WHATSAPP_TOKEN;
const WA_VERIFY_TOKEN     = process.env.WHATSAPP_VERIFY_TOKEN;
const WA_PHONE_NUMBER_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;

// ── שליחת הודעה חזרה ללקוח דרך Meta API ─────────────────────────────────────
async function sendWhatsApp(to, text) {
  await fetch(
    `https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WA_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
}

// ── נרמול מספר טלפון ─────────────────────────────────────────────────────────
// Meta שולח "972501234567" (ללא +) — נמיר ל-"0501234567" לחיפוש ב-DB
function normalizePhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

// ── פרסור הודעה ──────────────────────────────────────────────────────────────
// מחזיר { name, amount, note } או null אם לא הצליח
function parseMessage(text) {
  const t = (text || "").trim();
  if (!t) return null;

  let note = null;
  let body = t;
  const noteMatch = t.match(/הערה[:\s]+(.+)$/iu);
  if (noteMatch) {
    note = noteMatch[1].trim();
    body = t.slice(0, noteMatch.index).trim();
  }

  const numMatch = body.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;

  const amount = parseFloat(numMatch[1]);
  if (!amount || amount <= 0) return null;

  const before = body.slice(0, numMatch.index).trim();
  const after  = body.slice(numMatch.index + numMatch[0].length).trim();
  const name   = before || after;
  if (!name) return null;

  return { name, amount, note };
}

// ── חישוב billing_month לפי יום איפוס ───────────────────────────────────────
function assignBillingMonth(dateStr, cycleStartDay) {
  if (!dateStr) return null;
  const d   = new Date(dateStr);
  const day = d.getDate();
  const sd  = cycleStartDay || 1;
  let year  = d.getFullYear();
  let month = d.getMonth() + 1;
  if (day < sd) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ── סיווג תנועה ──────────────────────────────────────────────────────────────
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

  // ── אימות Webhook (GET) — Meta שולחת בעת ההגדרה הראשונה ────────────────────
  if (event.httpMethod === "GET") {
    const p = event.queryStringParameters || {};
    if (p["hub.mode"] === "subscribe" && p["hub.verify_token"] === WA_VERIFY_TOKEN) {
      return { statusCode: 200, body: p["hub.challenge"] };
    }
    return { statusCode: 403, body: "Forbidden" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // ── פרסור ה-payload של Meta ──────────────────────────────────────────────────
  let payload;
  try { payload = JSON.parse(event.body || "{}"); } catch { return { statusCode: 200, body: "OK" }; }

  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  // התעלם מ-status updates ומהודעות שאינן טקסט
  if (!message || message.type !== "text") {
    return { statusCode: 200, body: "OK" };
  }

  const fromRaw = message.from;          // "972501234567"
  const body    = (message.text?.body || "").trim();

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // עזרה
  if (/^(עזרה|help|הוראות)$/i.test(body)) {
    await sendWhatsApp(fromRaw, HELP_MSG);
    return { statusCode: 200, body: "OK" };
  }

  // זיהוי לקוח לפי מספר טלפון
  const phone = normalizePhone(fromRaw);
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, cycle_start_day")
    .or(`phone.eq.${phone},phone.eq.+972${phone.slice(1)}`)
    .maybeSingle();

  if (!client) {
    await sendWhatsApp(fromRaw, "❌ המספר שלך לא מזוהה במערכת. פנה ליועץ שלך להוספה.");
    return { statusCode: 200, body: "OK" };
  }

  // פרסור ההודעה
  const parsed = parseMessage(body);
  if (!parsed) {
    await sendWhatsApp(fromRaw, `❌ לא הבנתי. נסה לכתוב: *שם + סכום* (לדוגמה: קפה 18)\nלהוראות מלאות כתוב: עזרה`);
    return { statusCode: 200, body: "OK" };
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
  const today        = new Date().toISOString().slice(0, 10);
  const billingMonth = assignBillingMonth(today, client.cycle_start_day || 1);

  // שמירה ב-manual_transactions
  const { error } = await supabase.from("manual_transactions").insert([{
    client_id:      client.id,
    date:           today,
    name,
    amount,
    cat,
    conf,
    note:           note || null,
    type:           "expense",
    payment_method: "מזומן",
    billing_month:  billingMonth,
  }]);

  if (error) {
    console.error("DB error:", error);
    await sendWhatsApp(fromRaw, "❌ שגיאה בשמירה, נסה שוב.");
    return { statusCode: 200, body: "OK" };
  }

  // תשובה ללקוח
  const confMsg = conf === "high"
    ? `✅ נרשם: *${name}* ₪${amount} → ${cat}`
    : `🔴 נרשם: *${name}* ₪${amount}\nלא הצלחתי לסווג אוטומטית — יש לסווג באתר.`;

  const noteMsg = note ? `\n📝 הערה: ${note}` : "";

  await sendWhatsApp(fromRaw, confMsg + noteMsg);
  return { statusCode: 200, body: "OK" };
};
