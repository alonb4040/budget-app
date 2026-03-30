// Supabase Edge Function: generate-insights
// קורא לClaude API ומחזיר תובנות פיננסיות בעברית
// הגדר ANTHROPIC_API_KEY בסביבת ה-Edge Functions של Supabase

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { clientId, monthKey, summary } = await req.json();

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY לא מוגדר");

    // בנה טקסט סיכום לClaude
    const summaryLines = Object.entries(summary as Record<string, { current: number; avg: number }>)
      .map(([cat, v]) => {
        const diff = v.avg > 0 ? Math.round((v.current - v.avg) / v.avg * 100) : 0;
        const sign = diff > 0 ? `+${diff}%` : `${diff}%`;
        return `• ${cat}: ₪${v.current.toLocaleString()} (ממוצע: ₪${v.avg.toLocaleString()}, שינוי: ${sign})`;
      })
      .join("\n");

    const prompt = `אתה יועץ פיננסי אישי. הנה נתוני הוצאות של לקוח לחודש ${monthKey}:

${summaryLines}

תן 3-4 תובנות ספציפיות ומעשיות בעברית. כל תובנה בשורה נפרדת, מתחילה בסמל (📈/📉/💡/✅/⚠️).
התמקד בחריגות בולטות, מגמות, והמלצה אחת מעשית. שמור על טון חיובי ומעודד.
אל תחזור על הנתונים הגולמיים — תן פרשנות ומשמעות.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "שגיאת API");

    const insights = data.content?.[0]?.text || "לא ניתן לנתח את הנתונים";

    return new Response(
      JSON.stringify({ insights }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
