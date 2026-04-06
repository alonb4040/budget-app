// api/whatsapp.js — Vercel Serverless Function
// מקבל webhook מ-Meta Cloud API, מפרסר הוצאת מזומן ושומר ב-Supabase

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL        = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_KEY= process.env.SUPABASE_SERVICE_ROLE_KEY;
const WA_TOKEN            = process.env.WHATSAPP_TOKEN;
const WA_VERIFY_TOKEN     = process.env.WHATSAPP_VERIFY_TOKEN || "mazan-secret-2025";
const WA_PHONE_NUMBER_ID  = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendWhatsApp(to, text) {
  await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
}

function normalizePhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("972")) return "0" + digits.slice(3);
  return digits;
}

function parseMessage(text) {
  const t = (text || "").trim();
  if (!t) return null;
  let note = null, body = t;
  const noteMatch = t.match(/הערה[:\s]+(.+)$/iu);
  if (noteMatch) { note = noteMatch[1].trim(); body = t.slice(0, noteMatch.index).trim(); }
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

function assignBillingMonth(dateStr, cycleStartDay) {
  const d = new Date(dateStr), day = d.getDate(), sd = cycleStartDay || 1;
  let year = d.getFullYear(), month = d.getMonth() + 1;
  if (day < sd) { month -= 1; if (month === 0) { month = 12; year -= 1; } }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function classifyTx(name, rememberedMappings, rules) {
  if (rememberedMappings[name]) return { cat: rememberedMappings[name], conf: "high" };
  const nl = (name || "").toLowerCase();
  for (const rule of rules) {
    if ((rule.keywords || []).some(kw => nl.includes(kw.toLowerCase()))) return { cat: rule.name, conf: "high" };
  }
  for (const rule of rules) {
    if ((rule.max_hints || []).some(h => nl.includes(h.toLowerCase()))) return { cat: rule.name, conf: "med" };
  }
  return { cat: "הוצאות לא מתוכננות", conf: "low" };
}

const HELP_MSG = `💡 *איך לרשום הוצאת מזומן:*\n\n*שם + סכום:*\nקפה 18\nסופר 120\n\n*סכום + שם:*\n45 דלק\n\n*עם הערה:*\nקפה 18 הערה יום הולדת\n\n📌 הוצאות שלא מסווגות אוטומטית יסומנו באדום באתר.`;

module.exports = async function handler(req, res) {
  // אימות Webhook — Meta שולחת GET בעת ההגדרה
  if (req.method === "GET") {
    const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
    if (mode === "subscribe" && token?.trim() === WA_VERIFY_TOKEN?.trim()) return res.status(200).send(challenge);
    return res.status(403).send(`Forbidden: mode=${mode}, token=${JSON.stringify(token)}, expected=${JSON.stringify(WA_VERIFY_TOKEN)}`);
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const payload = req.body;
  const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message || message.type !== "text") return res.status(200).send("OK");

  const fromRaw = message.from;
  const body    = (message.text?.body || "").trim();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  if (/^(עזרה|help|הוראות)$/i.test(body)) {
    await sendWhatsApp(fromRaw, HELP_MSG);
    return res.status(200).send("OK");
  }

  const phone = normalizePhone(fromRaw);
  const { data: client } = await supabase
    .from("clients").select("id, name, cycle_start_day")
    .or(`phone.eq.${phone},phone.eq.+972${phone.slice(1)}`).maybeSingle();

  if (!client) {
    await sendWhatsApp(fromRaw, "❌ המספר שלך לא מזוהה במערכת. פנה ליועץ שלך להוספה.");
    return res.status(200).send("OK");
  }

  const parsed = parseMessage(body);
  if (!parsed) {
    await sendWhatsApp(fromRaw, `❌ לא הבנתי. נסה: *שם + סכום* (לדוגמה: קפה 18)\nלהוראות: עזרה`);
    return res.status(200).send("OK");
  }

  const { name, amount, note } = parsed;
  const [{ data: maps }, { data: rules }] = await Promise.all([
    supabase.from("remembered_mappings").select("business_name,category").eq("client_id", client.id),
    supabase.from("categories").select("name,keywords,max_hints").or(`client_id.is.null,client_id.eq.${client.id}`).eq("is_active", true),
  ]);

  const rememberedMappings = {};
  (maps || []).forEach(m => { rememberedMappings[m.business_name] = m.category; });

  const { cat, conf } = classifyTx(name, rememberedMappings, rules || []);
  const today        = new Date().toISOString().slice(0, 10);
  const billingMonth = assignBillingMonth(today, client.cycle_start_day || 1);

  const { error } = await supabase.from("manual_transactions").insert([{
    client_id: client.id, date: today, name, amount, cat, conf,
    note: note || null, type: "expense", payment_method: "מזומן", billing_month: billingMonth,
  }]);

  if (error) {
    console.error("DB error:", error);
    await sendWhatsApp(fromRaw, "❌ שגיאה בשמירה, נסה שוב.");
    return res.status(200).send("OK");
  }

  const confMsg = conf === "high"
    ? `✅ נרשם: *${name}* ₪${amount} → ${cat}`
    : `🔴 נרשם: *${name}* ₪${amount}\nלא הצלחתי לסווג — יש לסווג באתר.`;

  await sendWhatsApp(fromRaw, confMsg + (note ? `\n📝 הערה: ${note}` : ""));
  return res.status(200).send("OK");
};
