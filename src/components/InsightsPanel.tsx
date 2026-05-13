import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Spinner, Btn } from "../ui";
import { CATEGORIES, IGNORED_CATEGORIES, classifyTx, HEBREW_MONTHS, assignBillingMonth } from "../data";
import type { CategoryRule } from "../data";

interface Props {
  clientId: string;
  clientPlan: string;
  portfolioSubs: any[];
  importedTxs: any[];
  manualTxs: any[];
  rememberedMappings: Record<string, string>;
  cycleStartDay: number;
  ignoredCats?: Set<string>;
  incomeCats?: Set<string>;
  categoryRules?: CategoryRule[];
}

const DEFAULT_INCOME_CATS = new Set<string>(CATEGORIES["💰 הכנסות"] ?? []);

export default function InsightsPanel({ clientId, clientPlan, portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats = IGNORED_CATEGORIES, incomeCats = DEFAULT_INCOME_CATS, categoryRules = [] }: Props) {
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
        if (ignoredCats.has(tx.cat)) return;
        txs.push({ mk: sub.month_key, cat: tx.cat, amount: Number(tx.amount||0) });
      });
    });
    (importedTxs||[]).forEach((tx: any) => {
      if ((tx.amount||0) <= 0) return;
      const mk = tx.billing_month || assignBillingMonth(tx.date, cycleStartDay||1);
      if (!mk) return;
      const { cat } = classifyTx(tx.name, tx.max_category, rememberedMappings||{}, categoryRules);
      if (ignoredCats.has(cat)) return;
      txs.push({ mk, cat, amount: Number(tx.amount||0) });
    });
    (manualTxs||[]).forEach((tx: any) => {
      if ((tx.amount||0) <= 0) return;
      if (ignoredCats.has(tx.cat)) return;
      txs.push({ mk: tx.billing_month, cat: tx.cat, amount: Number(tx.amount||0) });
    });
    const availableMks = [...new Set(txs.map(t => t.mk))].filter(Boolean).sort();
    const byMkCat: Record<string, Record<string, number>> = {};
    txs.forEach(t => {
      if (!byMkCat[t.mk]) byMkCat[t.mk] = {};
      byMkCat[t.mk][t.cat] = (byMkCat[t.mk][t.cat]||0) + t.amount;
    });
    return { txs, availableMks, byMkCat };
  }, [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, ignoredCats, categoryRules]);

  useEffect(() => {
    if (availableMks.length > 0 && !selectedMk)
      setSelectedMk(availableMks[availableMks.length - 1]);
  }, [availableMks]); // eslint-disable-line

  const freeInsights = useMemo(() => {
    if (!selectedMk || availableMks.length < 2) return [];
    const idx = availableMks.indexOf(selectedMk);
    if (idx < 1) return [];
    const prevMks = availableMks.slice(Math.max(0, idx - 3), idx);
    const allCats = [...new Set(txs.map(t => t.cat))];
    const insights: any[] = [];
    for (const cat of allCats) {
      if (incomeCats.has(cat)) continue;
      const current = byMkCat[selectedMk]?.[cat] || 0;
      if (current === 0) continue;
      const prevVals = prevMks.map(mk => byMkCat[mk]?.[cat] || 0);
      const avg = prevVals.reduce((a,b)=>a+b,0) / prevVals.length;
      if (avg < 200) continue;
      const pct = Math.round((current - avg) / avg * 100);
      if (pct >= 35)       insights.push({ type:"over",  cat, pct, current, avg });
      else if (pct <= -30) insights.push({ type:"under", cat, pct, current, avg });
    }
    const totalCur  = txs.filter(t => t.mk === selectedMk && !incomeCats.has(t.cat)).reduce((s,t)=>s+t.amount,0);
    const prevTotals = prevMks.map(mk => txs.filter(t => t.mk === mk && !incomeCats.has(t.cat)).reduce((s,t)=>s+t.amount,0));
    const avgTotal = prevTotals.reduce((a,b)=>a+b,0) / prevTotals.length;
    if (avgTotal > 0) {
      const pct = Math.round((totalCur - avgTotal) / avgTotal * 100);
      if (Math.abs(pct) >= 10)
        insights.unshift({ type: pct > 0 ? "total_over" : "total_under", pct, current: totalCur, avg: avgTotal });
    }
    return insights.sort((a,b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5);
  }, [selectedMk, txs, byMkCat, availableMks, incomeCats]);

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
      const { error: upsertErr } = await supabase.from("ai_insights").upsert(
        [{ client_id: clientId, month_key: selectedMk, content: data.insights }],
        { onConflict: "client_id,month_key" }
      );
      if (upsertErr) console.error("ai_insights upsert error:", upsertErr);
      // עדכן cache גם אם upsert נכשל — כדי שהמשתמש יראה את התוכן בסשן הנוכחי
      setAiCache(c => ({ ...c, [selectedMk]: data.insights }));
      setAiStatus(s => { const n={...s}; delete n[selectedMk!]; return n; });
    } catch(e) {
      setAiStatus(s => ({ ...s, [selectedMk!]: "error" }));
    }
  };

  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");
  const inputBase: React.CSSProperties = { background:"none", border:"none", borderRadius:8, padding:"10px 18px", fontSize: 15, cursor:"pointer", width:"100%", fontFamily:"inherit" };

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
        position:"fixed", left:16, bottom:160, zIndex:"var(--z-back)",
        background:"var(--green-mid)", color:"white", border:"none",
        borderRadius:"50%", width:50, height:50,
        cursor:"pointer", boxShadow:"0 4px 20px rgba(0,0,0,0.35)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg></button>

      {open && <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0, zIndex:"calc(var(--z-drop) - 1)", background:"rgba(0,0,0,0.25)" }} />}

      <div style={{
        position:"fixed", left:0, top:0, bottom:0, width:"min(340px,88vw)",
        background:"var(--surface)", borderRight:"1px solid var(--border)",
        zIndex:"var(--z-drop)", overflowY:"auto", boxShadow:"4px 0 28px rgba(0,0,0,0.22)",
        display:"flex", flexDirection:"column",
        transform: open ? "translateX(0)" : "translateX(-105%)",
        transition:"transform 0.25s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{ padding:"14px 18px", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"var(--surface)", zIndex:1 }}>
          <div style={{ fontWeight:700, fontSize: 17, display:"flex", alignItems:"center", gap:7 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>תובנות חכמות</div>
          <button onClick={() => setOpen(false)} style={{ background:"none", border:"none", fontSize: 22, cursor:"pointer", color:"var(--text-dim)", lineHeight:1 }}>×</button>
        </div>

        {availableMks.length > 0 && (
          <div style={{ padding:"10px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--surface2)" }}>
            <button onClick={() => canNext && setSelectedMk(availableMks[selIdx+1])} disabled={!canNext}
              style={{ background:"none", border:"none", fontSize: 20, cursor:canNext?"pointer":"default", color:canNext?"var(--text)":"var(--text-dim)", opacity:canNext?1:0.3 }}>‹</button>
            <div style={{ fontWeight:600, fontSize: 15 }}>{mkLabel(selectedMk)}</div>
            <button onClick={() => canPrev && setSelectedMk(availableMks[selIdx-1])} disabled={!canPrev}
              style={{ background:"none", border:"none", fontSize: 20, cursor:canPrev?"pointer":"default", color:canPrev?"var(--text)":"var(--text-dim)", opacity:canPrev?1:0.3 }}>›</button>
          </div>
        )}

        <div style={{ padding:"16px 18px", flex:1 }}>
          <div style={{ marginBottom:22 }}>
            <div style={{ fontSize: 13, fontWeight:700, color:"var(--text-dim)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>ניתוח אוטומטי</div>
            {freeInsights.length === 0 ? (
              <div style={{ color:"var(--text-dim)", fontSize: 15, lineHeight:1.6 }}>
                {availableMks.length < 2 ? "צריך לפחות 2 חודשי נתונים." : "לא נמצאו חריגות משמעותיות לחודש זה."}
              </div>
            ) : freeInsights.map((ins, i) => {
              const isGood = ins.type === "under" || ins.type === "total_under";
              return (
                <div key={i} style={{
                  background: isGood ? "var(--green-pale)" : "var(--red-light)",
                  border: `1px solid ${isGood ? "var(--green-mint)" : "var(--red)"}`,
                  borderRadius:8, padding:"10px 12px", marginBottom:8, fontSize: 15
                }}>
                  <div style={{ fontWeight:600, marginBottom:3, display:"flex", alignItems:"center", gap:6 }}>
                    {(ins.type==="total_over"||ins.type==="over") && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>}
                    {(ins.type==="total_under"||ins.type==="under") && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>}
                    {ins.type==="total_over"  && `הוצאות כוללות גבוהות ב-${ins.pct}% מהממוצע`}
                    {ins.type==="total_under" && `הוצאות כוללות נמוכות ב-${Math.abs(ins.pct)}% מהממוצע`}
                    {ins.type==="over"        && `${ins.cat} — גבוה ב-${ins.pct}%`}
                    {ins.type==="under"       && `${ins.cat} — נמוך ב-${Math.abs(ins.pct)}%`}
                  </div>
                  <div style={{ color:"var(--text-dim)", fontSize: 14 }}>
                    החודש: ₪{fmt(ins.current)} | ממוצע: ₪{fmt(ins.avg)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ borderTop:"1px solid var(--border)", marginBottom:20 }} />

          <div>
            <div style={{ fontSize: 13, fontWeight:700, color:"var(--text-dim)", letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>תובנות AI</div>

            {!isPro ? (
              <div style={{ background:"var(--surface2)", borderRadius:12, padding:"22px 18px", textAlign:"center", border:"1px solid var(--border)" }}>
                <div style={{ marginBottom:8, display:"flex", justifyContent:"center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
                <div style={{ fontWeight:700, fontSize: 16, marginBottom:6 }}>זמין בחבילת Pro</div>
                <div style={{ color:"var(--text-dim)", fontSize: 14, marginBottom:18, lineHeight:1.7 }}>ניתוח AI מעמיק עם המלצות<br/>אישיות ומותאמות לך</div>
                <Btn onClick={() => setShowUpgradeModal(true)} style={{ width:"100%", marginBottom:8 }}>הירשם למנוי חודשי</Btn>
                <Btn variant="ghost" onClick={() => setOpen(false)} style={{ width:"100%" }}>← חזור</Btn>
              </div>
            ) : aiLoading ? (
              <div style={{ textAlign:"center", padding:"24px 0" }}>
                <Spinner /><div style={{ color:"var(--text-dim)", fontSize: 14, marginTop:10 }}>מנתח את הנתונים...</div>
              </div>
            ) : aiError ? (
              <div style={{ textAlign:"center", padding:"16px 0" }}>
                <div style={{ color:"var(--red)", fontSize: 15, marginBottom:10 }}>שגיאה בטעינת תובנות</div>
                <button onClick={() => { setAiStatus(s=>{ const n={...s}; delete n[selectedMk!]; return n; }); }} style={{ fontSize: 14, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>נסה שוב</button>
              </div>
            ) : aiContent ? (
              <div>
                <div style={{ fontSize: 15, lineHeight:1.9, color:"var(--text)", whiteSpace:"pre-wrap" }}>{aiContent}</div>
                <button onClick={() => { setAiCache(c=>{ const n={...c}; delete n[selectedMk!]; return n; }); }}
                  style={{ marginTop:14, fontSize: 13, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline", display:"inline-flex", alignItems:"center", gap:5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>רענן תובנות</button>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"18px 0" }}>
                <div style={{ color:"var(--text-dim)", fontSize: 15, marginBottom:14 }}>לא נוצרו תובנות AI לחודש זה</div>
                <Btn onClick={generateAiInsights}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>צור תובנות AI</Btn>
              </div>
            )}
          </div>
        </div>
      </div>

      {showUpgradeModal && (
        <>
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", zIndex:"var(--z-top-back)" }} onClick={() => { setShowUpgradeModal(false); setShowBuilding(false); }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", borderRadius:20, padding:"36px 28px", zIndex:"var(--z-top)", width:"min(360px,90vw)", textAlign:"center", boxShadow:"0 24px 64px rgba(0,0,0,0.5)" }}>
            {!showBuilding ? (
              <>
                <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
                <div style={{ fontWeight:800, fontSize: 22, marginBottom:10 }}>שדרוג לחבילת Pro</div>
                <div style={{ color:"var(--text-dim)", fontSize: 15, lineHeight:1.8, marginBottom:24 }}>
                  קבל תובנות AI אישיות כל חודש,<br/>ניתוח מעמיק של ההרגלים הפיננסיים שלך,<br/>והמלצות מותאמות לך בלבד.
                </div>
                <Btn onClick={() => setShowBuilding(true)} style={{ width:"100%", marginBottom:10 }}>הירשם למנוי חודשי</Btn>
                <Btn variant="ghost" onClick={() => { setShowUpgradeModal(false); setShowBuilding(false); }} style={{ width:"100%" }}>← חזור</Btn>
              </>
            ) : (
              <>
                <div style={{ marginBottom:14, display:"flex", justifyContent:"center" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
                <div style={{ fontWeight:800, fontSize: 22, marginBottom:10 }}>התהליך בבנייה</div>
                <div style={{ color:"var(--text-dim)", fontSize: 15, lineHeight:1.8, marginBottom:24 }}>
                  אנחנו עובדים על זה!<br/>בקרוב תוכל להירשם ולקבל גישה מלאה<br/>לתובנות AI.
                </div>
                <Btn onClick={() => { setShowUpgradeModal(false); setShowBuilding(false); }} style={{ width:"100%" }}>← חזור</Btn>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
