// Edge Function: ingest-transactions
// נקודת קליטה מאוחדת לתנועות בנק/אשראי מכל הערוצים (Tampermonkey, Chrome Extension, ובעתיד ספקים נוספים).
// מחליפה 5 מסלולי כתיבה ישנים עם נוסחאות דדופ שונות. כל הזהות/דדופ קורים בפונקציית ה-DB
// ingest_bank_transactions (v40) — הפונקציה הזו רק מאמתת את המשתמש, גוזרת client_id מה-JWT
// (לא סומכת על client_id שמגיע מהלקוח), ומעדכנת מטא-דאטה (import_batches, sync_log, clients.max_last_sync).
//
// v46: שני תיקונים נוספים לפני שהתנועות מגיעות ל-RPC —
// 1. billing_month: אם הלקוח שולח billingMonthKey (החודש הרשמי שה-provider עצמו הצהיר עליו
//    כשנשלחה הבקשה, למשל result.info.date ממקס) — הוא דורס את ה-billing_month שחושב פר-תנועה
//    בצד הלקוח. חישוב פר-תנועה (לפי תאריך רכישה/עיבוד/תשלום) התברר כלא אמין: תנועות מאותה
//    בקשה בדיוק יכולות "לצאת" עם billing_month שונה זו מזו, כי מקס עצמו לפעמים מחייב לפי תאריך
//    שלא תואם את המחזור שהמשתמש בפועל צפה בו. ה-provider כבר עשה את החישוב הזה נכון בשבילנו
//    (זו בדיוק המשמעות של לבקש "תן לי את מחזור אפריל") — אין סיבה לנחש מחדש פר-תנועה.
// 2. סיווג אוטומטי: לפני הקליטה, מריצים סיווג לפי remembered_mappings (עסק ששויך בעבר) ואז
//    לפי keywords/max_hints של קטגוריות, בדיוק כמו ב-3 בוטי הוואטסאפ — כדי שתנועה מ"וולט" למשל
//    תסתווג אוטומטית אם המשתמש כבר לימד את המערכת "וולט → אוכל בחוץ" בעבר. סיווג לא רטרואקטיבי:
//    זה קורה רק על תנועות חדשות בקליטה הזו, לא נוגע בתנועות קיימות. RPC עצמו שומר (COALESCE) על
//    כל cat/budget_type ידני שכבר קיים בשורה — לא דורס סיווג שהמשתמש כבר עשה.
//
// verify_jwt=true ב-config.toml — ה-gateway דוחה בקשות בלי JWT תקין לפני שהקוד כאן בכלל רץ.
//
// חוזה הבקשה — הלקוח (userscript/extension) שולח תנועות גולמיות ממופות לצורה קנונית, לא hash מחושב:
// {
//   provider: "max",
//   source_channel: "extension" | "userscript",
//   card_last4?: string,
//   billingMonthKey?: string,          // "YYYY-MM" — החודש הרשמי שה-provider הצהיר עליו לכל הבקשה
//   transactions: [{
//     bank_reference?: string | null,   // arn ממקס — קיים רק אחרי "קליטה"
//     bank_uid?: string | null,         // uid יציב, קיים כבר בשלב pending
//     date: "YYYY-MM-DD",
//     billing_month: "YYYY-MM",
//     merchant_name: string,
//     amount: number,
//     original_amount?: number | null,
//     original_currency?: string | null,
//     status?: "pending" | "completed",
//     installment_number?: number | null,
//     installment_total?: number | null,
//     category_raw?: string | null,
//     raw_payload?: object,             // התגובה הגולמית המלאה מהספק, לצורך debugging עתידי
//   }]
// }

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.101.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

type RawTx = {
  bank_reference?: string | null;
  bank_uid?: string | null;
  card_last4?: string | null; // עוקף את card_last4 ברמת הבאטש — תגובה אחת ממקס יכולה לערבב כמה כרטיסים
  date: string;
  billing_month: string;
  merchant_name: string;
  amount: number;
  original_amount?: number | null;
  original_currency?: string | null;
  status?: string;
  installment_number?: number | null;
  installment_total?: number | null;
  category_raw?: string | null;
  raw_payload?: unknown;
  cat?: string | null;
  budget_type?: string | null;
};

// חודש החיוב הנפוץ ביותר בין התנועות — לשדה import_batches.billing_month (דיווח בלבד, לא זהות)
function dominantBillingMonth(rows: RawTx[]): string | null {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (!r.billing_month) continue;
    counts[r.billing_month] = (counts[r.billing_month] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

type CategoryRule = { name: string; keywords: string[]; max_hints: string[]; budget_type: string | null };
type RememberedMap = Record<string, { cat: string; budget_type: string | null }>;

// זהה ל-classifyTx בבוטי הוואטסאפ (netlify/functions/whatsapp-cash*.js, api/whatsapp.js) — מכוון.
// כל rule מגיע משורת categories ספציפית עם budget_type משלה, אז כשיש התאמת keyword, ה-budget_type
// המוחזר מדויק (לא ניחוש). לא רטרואקטיבי: רץ רק על תנועות חדשות בקליטה הזו.
function classifyTx(
  name: string,
  rememberedMappings: RememberedMap,
  rules: CategoryRule[],
): { cat: string | null; budget_type: string | null } {
  if (rememberedMappings[name]) {
    const m = rememberedMappings[name];
    return { cat: m.cat, budget_type: m.budget_type || null };
  }
  const nl = (name || "").toLowerCase();
  for (const rule of rules) {
    if ((rule.keywords || []).some((kw) => nl.includes(kw.toLowerCase()))) {
      return { cat: rule.name, budget_type: rule.budget_type || null };
    }
  }
  for (const rule of rules) {
    if ((rule.max_hints || []).some((h) => nl.includes(h.toLowerCase()))) {
      return { cat: rule.name, budget_type: rule.budget_type || null };
    }
  }
  return { cat: null, budget_type: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── אימות: מי המשתמש, ומה ה-client_id שלו (לא נלקח מגוף הבקשה) ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "נדרשת התחברות" }, 401);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !user) return json({ error: "טוקן לא תקין" }, 401);

  const { data: client, error: clientErr } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();
  if (clientErr || !client) return json({ error: "לקוח לא נמצא" }, 403);
  const clientId = client.id as number;

  let body: {
    provider?: string;
    source_channel?: string;
    card_last4?: string | null;
    billingMonthKey?: string | null;
    transactions?: RawTx[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "גוף בקשה לא תקין" }, 400);
  }

  const { provider, source_channel, card_last4, billingMonthKey, transactions } = body;
  if (!provider || !source_channel || !Array.isArray(transactions) || transactions.length === 0) {
    return json({ error: "נתונים חסרים (provider / source_channel / transactions)" }, 400);
  }

  // ── עיבוד מקדים: billing_month רשמי (אם נשלח) + סיווג אוטומטי ──────────
  const [{ data: maps }, { data: catRows }] = await Promise.all([
    supabaseAdmin.from("remembered_mappings").select("business_name,category,budget_type").eq("client_id", clientId),
    supabaseAdmin.from("categories").select("name,keywords,max_hints,budget_type").or(`client_id.is.null,client_id.eq.${clientId}`).eq("is_active", true),
  ]);
  const rememberedMappings: RememberedMap = {};
  (maps || []).forEach((m) => { rememberedMappings[m.business_name] = { cat: m.category, budget_type: m.budget_type }; });
  const rules: CategoryRule[] = (catRows || []).filter((r) => (r.keywords?.length || 0) > 0 || (r.max_hints?.length || 0) > 0);

  const enrichedMonth = billingMonthKey && /^\d{4}-\d{2}$/.test(billingMonthKey) ? billingMonthKey : null;
  const processedTransactions: RawTx[] = transactions.map((t) => {
    const { cat, budget_type } = classifyTx(t.merchant_name, rememberedMappings, rules);
    return {
      ...t,
      billing_month: enrichedMonth || t.billing_month,
      cat, budget_type,
    };
  });

  // ── יצירת import_batches לצורך מעקב/דיווח ──────────────────────
  const { data: batch, error: batchErr } = await supabaseAdmin
    .from("import_batches")
    .insert({
      client_id: clientId,
      source_type: source_channel,
      provider,
      card_last4: card_last4 || null,
      total_received: processedTransactions.length,
      added: 0,
      duplicates: 0,
      status: "processing",
      billing_month: enrichedMonth || dominantBillingMonth(processedTransactions),
    })
    .select("id")
    .single();
  if (batchErr || !batch) return json({ error: "יצירת import_batch נכשלה: " + batchErr?.message }, 500);

  // ── קריאה לפונקציית הקליטה המאוחדת (כל הדדופ קורה שם, אטומית) ──
  const { data: result, error: ingestErr } = await supabaseAdmin.rpc("ingest_bank_transactions", {
    p_client_id: clientId,
    p_provider: provider,
    p_source_channel: source_channel,
    p_card_last4: card_last4 || null,
    p_import_batch_id: batch.id,
    p_rows: processedTransactions,
  });

  const now = new Date().toISOString();

  if (ingestErr) {
    await supabaseAdmin.from("import_batches").update({ status: "error" }).eq("id", batch.id);
    await supabaseAdmin.from("sync_log").insert({
      client_id: clientId, synced_at: now, status: "error",
      error_message: ingestErr.message, source: source_channel,
    });
    return json({ error: "קליטת התנועות נכשלה: " + ingestErr.message }, 500);
  }

  const added =
    (result?.inserted_by_arn || 0) + (result?.inserted_by_uid || 0) + (result?.fallback_inserted || 0);
  const updated =
    (result?.updated_by_arn || 0) + (result?.updated_by_uid || 0) + (result?.reconciled_uid_to_arn || 0);
  const duplicates = processedTransactions.length - added - updated;

  await supabaseAdmin.from("import_batches").update({
    added, duplicates: Math.max(0, duplicates), status: "done",
  }).eq("id", batch.id);

  await supabaseAdmin.from("clients").update({ max_last_sync: now }).eq("id", clientId);

  await supabaseAdmin.from("sync_log").insert({
    client_id: clientId, synced_at: now, status: "success",
    transactions_count: added, source: source_channel,
  });

  return json({ ok: true, added, updated, duplicates: Math.max(0, duplicates), batch_id: batch.id });
});
