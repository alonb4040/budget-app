import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Spinner } from "../ui";
import { IGNORED_CATEGORIES, classifyTx, HEBREW_MONTHS, assignBillingMonth } from "../data";

interface Props {
  clientId: string;
  clientPlan: string;
  portfolioSubs: any[];
  importedTxs: any[];
  manualTxs: any[];
  rememberedMappings: Record<string, string>;
  cycleStartDay: number;
}

export default function InsightsPanel({ clientId, clientPlan, portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay }: Props) {
  const [open, setOpen]                         = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBuilding, setShowBuilding]         = useState(false);
  const [aiCache, setAiCache]                   = useState<Record<string, string>>({});
  const [aiStatus, setAiStatus]                 = useState<Record<string, string>>({});
  const [selectedMk, setSelectedMk]             = useState<string | null>(null);
  const isPro = clientPlan === "pro";

  const { txs, availableMks, byMkCat } = useMemo(() => {
    const txs: { mk: string; cat: string; amount: number }[] = [];
    portfolioSubs.forEach(sub => {
      (sub.transactions || []).forEach((tx: any) => {
        if (IGNORED_CATEGORIES.has(tx.cat)) return;
        txs.push({ mk: sub.month_key, cat: tx.cat, amount: Number(tx.amount||0) });
      });
    });
    (importedTxs||[]).forEach((tx: any) => {
      if ((tx.amount||0) <= 0) return;
      const mk = tx.billing_month || assignBillingMonth(tx.date, cycleStartDay||1);
      if (!mk) return;
      const { cat } = classifyTx(tx.name, tx.max_category, rememberedMappings||{});
      if (IGNORED_CATEGORIES.has(cat)) return;
      txs.push({ mk, cat, amount: Number(tx.amount||0) });
    });
    (manualTxs||[]).forEach((tx: any) => {
      if ((tx.amount||0) <= 0) return;
      if (IGNORED_CATEGORIES.has(tx.cat)) return;
      txs.push({ mk: tx.billing_month, cat: tx.cat, amount: Number(tx.amount||0) });
    });
    const availableMks = [...new Set(txs.map(t => t.mk))].filter(Boolean).sort();
    const byMkCat: Record<string, Record<string, number>> = {};
    txs.forEach(t => {
      if (!byMkCat[t.mk]) byMkCat[t.mk] = {};
      byMkCat[t.mk][t.cat] = (byMkCat[t.mk][t.cat]||0) + t.amount;
    });
    return { txs, availableMks, byMkCat };
  }, [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay]);

  useEffect(() => {
    if (availableMks.length > 0 && !selectedMk)
      setSelectedMk(availableMks[availableMks.length - 1]);
  }, [availableMks]); // eslint-disable-line

  const freeInsights = useMemo(() => {
    if (!selectedMk || availableMks.length < 2) return [];
    const idx = availableMks.indexOf(selectedMk);
    if (idx < 1) return [];
    const prevMks = availableMks.slice(Math.max(0, idx - 3), idx);
    const INCOME_CATS = new Set(["הכנסה בן/ת זוג נטו","קצבת ילדים","שכירות","הכנסה מההורים","תן ביס/סיבוס","הכנסות מזדמנות","אחר-הכנסה"]);
    const allCats = [...new Set(txs.map(t => t.cat))];
    const insights: any[] = [];
    for (const cat of allCats) {
      if (INCOME_CATS.has(cat)) continue;
      const current = byMkCat[selectedMk]?.[cat] || 0;
      if (current === 0) continue;
      const prevVals = prevMks.map(mk => byMkCat[mk]?.[cat] || 0);
      const avg = prevVals.reduce((a,b)=>a+b,0) / prevVals.length;
      if (avg < 200) continue;
      const pct = Math.round((current - avg) / avg * 100);
      if (pct >= 35)       insights.push({ type:"over",  cat, pct, current, avg });
      else if (pct <= -30) insights.push({ type:"under", cat, pct, current, avg });
    }
    const totalCur  = txs.filter(t => t.mk === selectedMk && !INCOME_CATS.has(t.cat)).reduce((s,t)=>s+t.amount,0);
    const prevTotals = prevMks.map(mk => txs.filter(t => t.mk === mk && !INCOME_CATS.has(t.cat)).reduce((s,t)=>s+t.amount,0));
    const avgTotal = prevTotals.reduce((a,b)=>a+b,0) / prevTotals.length;
    if (avgTotal > 0) {
      const pct = Math.round((totalCur - avgTotal) / avgTotal * 100);
      if (Math.abs(pct) >= 10)
        insights.unshift({ type: pct > 0 ? "total_over" : "total_under", pct, current: totalCur, avg: avgTotal });
    }
    return insights.sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5);
  }, [selectedMk, txs, byMkCat, availableMks]);

  useEffect(() => {
    if (!open || !isPro) return;
    (async () => {
      const { data } = await supabase.from("ai_insights")
        .select("month_key,content").eq("client_id", clientId).order("month_key", { ascending: false });
      if (data) {
        const cache: Record<string, string> = {};
        data.forEach((r: any) => { cache[r.month_key] = r.content; });
        setAiCache(cache);
      }
    })();
  }, [open, isPro]); // eslint-disable-line

  const generateAiInsights = async () => {
    if (!selectedMk) return;
    setAiStatus(s => ({ ...s, [selectedMk]: "loading" }));
    try {
      const idx = availableMks.indexOf(selectedMk);
      const prevMks = availableMks.slice(Math.max(0, idx - 3), idx);
      const summary: Record<string, { current: number; avg: number }> = {};
      Object.entries(byMkCat[selectedMk] || {}).forEach(([cat, cur]) => {
        const prevVals = prevMks.map(mk => byMkCat[mk]?.[cat]||0);
        const avg = prevVals.length ? prevVals.reduce((a,b)=>a+b,0)/prevVals.length : 0;
        summary[cat] = { current: Math.round(cur as number), avg: Math.round(avg as number) };
      });
      const { data, error } = await supabase.functions.invoke("generate-insights", {
        body: { clientId, monthKey: selectedMk, summary }
      });
      if (error || !data?.insights) throw new Error(error?.message || "שגיאה");
      await supabase.from("ai_insights").upsert(
        [{ client_id: clientId, month_key: selectedMk, content: data.insights }],
        { onConflict: "client_id,month_key" }
      );
      setAiCache(c => ({ ...c, [selectedMk]: data.insights }));
      setAiStatus(s => { const n={...s}; delete n[selectedMk!]; return n; });
    } catch(e) {
      setAiStatus(s => ({ ...s, [selectedMk!]: "error" }));
    }
  };

  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");
  const inputBase: React.CSSProperties = { background:"none", border:"none", borderRadius:8, padding:"10px 18px", fontSize:13, cursor:"pointer", width:"100%", fontFamily:"inherit" };

  const mkLabel = (mk: string | null) => {
    if (!mk) return "";
    const [y, m] = mk.split("-");
    return `${HEBREW_MONTHS[+m-1]} ${y}`;
  };

  const selIdx     = selectedMk ? availableMks.indexOf(selectedMk) : -1;
  const canPrev    = selIdx > 0;
  const canNext    = selIdx < availableMks.length - 1;
  const aiContent  = selectedMk ? aiCache[selectedMk] : null;
  const aiLoading  = selectedMk ? aiStatus[selectedMk] === "loading" : false;
  const aiError    = selectedMk ? aiStatus[selectedMk] === "error"   : false;

  return (
    <>
      <button onClick={() => setOpen(p => !p)} title="תובנות חכמות" style={{
        position:"fixed", left:16, bottom:160, zIndex:1000,
        background:"var(--green-mid)", color:"white", border:"none",
        borderRadius:"50%", width:50, height:50, fontSize:22,
        cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.35)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}>✨</button>

      {open && <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, zIndex:998, background:"rgba(0,0,0,0.25)" }} />}

      <div style={{
        position:"fixed", left:0, top:0, bottom:0, width:"min(340px,88vw)",
        background:"var(--surface)", borderRight:"1px solid var(--border)",
        zIndex:999, overflowY:"auto", boxShadow:"4px 0 28px rgba(0,0,0,0.22)",
        display:"flex", flexDirection:"column",
        transform: open ? "translateX(0)" : "translateX(-105%)",
        transition:"transform 0.25s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"var(--surface)", zIndex:1 }}>
          <div style={{ fontWeight:700, fontSize:15 }}>✨ תובנות חכמות</div>
          <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"var(--text-dim)", lineHeight:1 }}>×</button>
        </div>

        {availableMks.length > 0 && (
          <div style={{ padding:"10px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--surface2)" }}>
            <button onClick={() => canNext && setSelectedMk(availableMks[selIdx+1])} disabled={!canNext}
              style={{ background:"none", border:"none", fontSize:18, cursor:canNext?"pointer":"default", color:canNext?"var(--text)":"var(--text-dim)", opacity:canNext?1:0.3 }}>‹</button>
            <div style={{ fontWeight:600, fontSize:13 }}>{mkLabel(selectedMk)}</div>
            <button onClick={() => canPrev && setSelectedMk(availableMks[selIdx-1])} disabled={!canPrev}
              style={{ background:"none", border:"none", fontSize:18, cursor:canPrev?"pointer":"default", color:canPrev?"var(--text)":"var(--text-dim)", opacity:canPrev?1:0.3 }}>›</button>
          </div>
        )}

        <div style={{ padding:"16px 18px", flex:1 }}>
          <div style={{ marginBottom:22 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text-dim)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>📊 ניתוח אוטומטי</div>
            {freeInsights.length === 0 ? (
              <div style={{ color:"var(--text-dim)", fontSize:13, lineHeight:1.6 }}>
                {availableMks.length < 2 ? "צריך לפחות 2 חודשי נתונים." : "לא נמצאו חריגות משמעותיות לחודש זה."}
              </div>
            ) : freeInsights.map((ins, i) => {
              const isGood = ins.type === "under" || ins.type === "total_under";
              return (
                <div key={i} style={{
                  background: isGood ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${isGood ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)"}`,
                  borderRadius:8, padding:"10px 12px", marginBottom:8, fontSize:13
                }}>
                  <div style={{ fontWeight:600, marginBottom:3 }}>
                    {ins.type==="total_over"  && `📈 הוצאות כוללות גבוהות ב-${ins.pct}% מהממוצע`}
                    {ins.type==="total_under" && `📉 הוצאות כוללות נמוכות ב-${Math.abs(ins.pct)}% מהממוצע`}
                    {ins.type==="over"        && `📈 ${ins.cat} — גבוה ב-${ins.pct}%`}
                    {ins.type==="under"       && `✅ ${ins.cat} — נמוך ב-${Math.abs(ins.pct)}%`}
                  </div>
                  <div style={{ color:"var(--text-dim)", fontSize:12 }}>
                    החודש: ₪{fmt(ins.current)} | ממוצע: ₪{fmt(ins.avg)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop:"1px solid var(--border)", marginBottom:20 }} />

          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--text-dim)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>🤖 תובנות AI</div>

            {!isPro ? (
              <div style={{ background:"var(--surface2)", borderRadius:12, padding:"22px 18px", textAlign:"center", border:"1px solid var(--border)" }}>
                <div style={{ fontSize:32, marginBottom:8 }}>🔒</div>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:6 }}>זמין בחבילת Pro</div>
                <div style={{ color:"var(--text-dim)", fontSize:12, marginBottom:18, lineHeight:1.7 }}>ניתוח AI מעמיק עם המלצות<br/>אישיות ומותאמות לך</div>
                <button onClick={() => setShowUpgradeModal(true)} style={{ ...inputBase, background:"var(--green-mid)", color:"white", fontWeight:700, marginBottom:8 }}>הירשם למנוי חודשי</button>
                <button onClick={() => setOpen(false)} style={{ ...inputBase, color:"var(--text-dim)", border:"1px solid var(--border)" }}>← חזור</button>
              </div>
            ) : aiLoading ? (
              <div style={{ textAlign:"center", padding:"24px 0" }}>
                <Spinner /><div style={{ color:"var(--text-dim)", fontSize:12, marginTop:10 }}>מנתח את הנתונים...</div>
              </div>
            ) : aiError ? (
              <div style={{ textAlign:"center", padding:"16px 0" }}>
                <div style={{ color:"var(--red,#ef4444)", fontSize:13, marginBottom:10 }}>שגיאה בטעינת תובנות</div>
                <button onClick={() => { setAiStatus(s=>{ const n={...s}; delete n[selectedMk!]; return n; }); }} style={{ fontSize:12, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>נסה שוב</button>
              </div>
            ) : aiContent ? (
              <div>
                <div style={{ fontSize:13, lineHeight:1.9, color:"var(--text)", whiteSpace:"pre-wrap" }}>{aiContent}</div>
                <button onClick={() => { setAiCache(c=>{ const n={...c}; delete n[selectedMk!]; return n; }); }}
                  style={{ marginTop:14, fontSize:11, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>🔄 רענן תובנות</button>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"18px 0" }}>
                <div style={{ color:"var(--text-dim)", fontSize:13, marginBottom:14 }}>לא נוצרו תובנות AI לחודש זה</div>
                <button onClick={generateAiInsights} style={{ ...inputBase, background:"var(--green-mid)", color:"white", fontWeight:700, width:"auto", padding:"10px 20px" }}>✨ צור תובנות AI</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <>
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:2000 }} onClick={() => { setShowUpgradeModal(false); setShowBuilding(false); }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", borderRadius:20, padding:"36px 28px", zIndex:2001, width:"min(360px,90vw)", textAlign:"center", boxShadow:"0 24px 64px rgba(0,0,0,0.5)" }}>
            {!showBuilding ? (
              <>
                <div style={{ fontSize:48, marginBottom:14 }}>🚀</div>
                <div style={{ fontWeight:800, fontSize:20, marginBottom:10 }}>שדרוג לחבילת Pro</div>
                <div style={{ color:"var(--text-dim)", fontSize:13, lineHeight:1.8, marginBottom:24 }}>
                  קבל תובנות AI אישיות כל חודש,<br/>ניתוח מעמיק של ההרגלים הפיננסיים שלך,<br/>והמלצות מותאמות לך בלבד.
                </div>
                <button onClick={() => setShowBuilding(true)} style={{ ...inputBase, background:"var(--green-mid)", color:"white", fontWeight:700, fontSize:15, padding:"14px 28px", marginBottom:10, borderRadius:10 }}>הירשם למנוי חודשי</button>
                <button onClick={() => { setShowUpgradeModal(false); setShowBuilding(false); }} style={{ ...inputBase, color:"var(--text-dim)", border:"1px solid var(--border)", borderRadius:10, padding:"12px 28px" }}>← חזור</button>
              </>
            ) : (
              <>
                <div style={{ fontSize:48, marginBottom:14 }}>🔧</div>
                <div style={{ fontWeight:800, fontSize:20, marginBottom:10 }}>התהליך בבנייה</div>
                <div style={{ color:"var(--text-dim)", fontSize:13, lineHeight:1.8, marginBottom:24 }}>
                  אנחנו עובדים על זה!<br/>בקרוב תוכל להירשם ולקבל גישה מלאה<br/>לתובנות AI.
                </div>
                <button onClick={() => { setShowUpgradeModal(false); setShowBuilding(false); }} style={{ ...inputBase, background:"var(--green-mid)", color:"white", fontWeight:700, fontSize:14, padding:"14px 28px", borderRadius:10 }}>← חזור</button>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
