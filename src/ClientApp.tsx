import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./supabase";
import { CATEGORIES, IGNORED_CATEGORIES, parseExcelData, classifyTx, HEBREW_MONTHS, assignBillingMonth } from "./data";
import ConnectCardScreen from "./ConnectCardScreen";
import { CategoryPicker } from "./components/CategoryPicker";
import { useCategories } from "./hooks/useCategories";
import { Card, Btn, Badge, Spinner, KpiCard, Input, C } from "./ui";
import DebtManager from "./components/DebtManager";
import GrowthTools from "./components/GrowthTools";
import InsightsPanel from "./components/InsightsPanel";
import ClientScenarioView, { periodsOverlap, periodForYear } from "./components/ClientScenarioView";
import AnalyticsTrends from "./components/AnalyticsTrends";
import AnalyticsForecast from "./components/AnalyticsForecast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line } from "recharts";

const REQUIRED_MONTHS = 3;
const EMAILJS_SERVICE_ID  = process.env.REACT_APP_EMAILJS_SERVICE_ID  || "";
const EMAILJS_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY  = process.env.REACT_APP_EMAILJS_PUBLIC_KEY  || "";

async function sendCompletionEmail(clientName) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) return;
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: "alon4040@gmail.com", client_name: clientName,
      message: `הלקוח ${clientName} סיים למלא את כל הנדרש במאזן החכם.`,
      date: new Date().toLocaleDateString("he-IL", { day:"numeric", month:"long", year:"numeric" }),
    }, EMAILJS_PUBLIC_KEY);
  } catch(e) { console.error("EmailJS:", e); }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClientApp({ session, onLogout }) {
  // ── קטגוריות דינמיות ────────────────────────────────────────────────────────
  const { sections: categories, rows: categoryRows, clientCats, ignoredCats, incomeCats, fixedCats, rules: categoryRules, reload: reloadCategories } = useCategories(session.id);

  const [screen, setScreen]               = useState("dashboard"); // dashboard | month | upload | review | summary
  const [showConnectCard, setShowConnectCard] = useState(false);
  const [monthEntries, setMonthEntries]   = useState([]);   // month_entries rows
  const [submissions, setSubmissions]     = useState([]);   // submissions rows
  const [payslips, setPayslips]           = useState([]);
  const [rememberedMappings, setRememberedMappings] = useState({});
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [portfolioMonths, setPortfolioMonths] = useState([]);
  const [portfolioSubs, setPortfolioSubs]     = useState([]);
  const [portfolioOpenedAt, setPortfolioOpenedAt] = useState(null);
  const [loadingData, setLoadingData]     = useState(true);
  const [activeTab, setActiveTab]         = useState(() => {
    const saved = sessionStorage.getItem('mazan_activeTab') || "data";
    return saved === "questionnaire" ? "data" : saved;
  });
  const switchTab = (id) => { sessionStorage.setItem('mazan_activeTab', id); setActiveTab(id); };
  const [dataSubTab, setDataSubTab]       = useState(() =>
    sessionStorage.getItem('mazan_activeTab') === "questionnaire" ? "questionnaire" : "documents"
  ); // documents | questionnaire
  const [showWelcome, setShowWelcome]     = useState(false);
  const [portfolioTab, setPortfolioTab]   = useState("control");
  const [importedTxs, setImportedTxs]     = useState([]);
  const [importedLoaded, setImportedLoaded] = useState(false);
  const [manualTxs, setManualTxs]         = useState([]);
  const [cycleStartDay, setCycleStartDay] = useState(1);
  const [clientPlan, setClientPlan]       = useState("free");
  const [clientDocs, setClientDocs]       = useState([]);
  const [submittedAt, setSubmittedAt]     = useState(null);
  const [requiredDocs, setRequiredDocs]   = useState(null);
  const [questionnaireSpouses, setQuestionnaireSpouses] = useState(null);
  const [docNotes, setDocNotes]           = useState<Record<string,string>>({});
  const [customDocs, setCustomDocs]       = useState<{id:string;label:string;icon?:string}[]>([]);
  const [hiddenCats, setHiddenCats]       = useState<string[]>([]);
  // קטגוריות מהתסריט הפעיל — null = אין תסריט פעיל (הצג הכל)
  const [scenarioCats, setScenarioCats]   = useState<string[] | null>(null);

  // active month context
  const [activeMonth, setActiveMonth]     = useState(null); // month_entry row
  const [monthSubs, setMonthSubs]         = useState([]);   // submissions for active month

  // upload flow
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sourceLabel, setSourceLabel]     = useState("");
  const [transactions, setTransactions]   = useState([]);
  const [filter, setFilter]               = useState("all");
  const [search, setSearch]               = useState("");
  const [catPanelOpen, setCatPanelOpen]   = useState(false);
  const [activeTxId, setActiveTxId]       = useState(null);
  const [catSearch, setCatSearch]         = useState("");
  const [pendingRemember, setPendingRemember] = useState(null);
  const [toast, setToast]                 = useState("");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [uploadSource, setUploadSource]       = useState("dashboard"); // "dashboard" | "month"
  const [selectedMonthKey, setSelectedMonthKey]   = useState(null);
  const [selectedMonthLabel, setSelectedMonthLabel] = useState("");
  const [analyzing, setAnalyzing]                 = useState(false);
  const [analyzeResults, setAnalyzeResults]       = useState<{name:string,count:number,error?:string}[]>([]);
  const [dragOver, setDragOver]                   = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadUserData(); }, []);

  // real-time: כשתנועה חדשה נוספת מהבוקמרקלט — טען אותה מיידית
  useEffect(() => {
    const channel = supabase
      .channel("imported_txs_realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "imported_transactions",
        filter: `client_id=eq.${session.id}`,
      }, (payload) => {
        setImportedTxs(prev => [payload.new as any, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id]);

  const loadAllImportedTxs = async (clientId: string) => {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("imported_transactions")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const loadUserData = async () => {
    setLoadingData(true);
    // Fire-and-forget: update last seen timestamp for admin visibility
    supabase.from("clients").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
    try {
      const [{ data: entries }, { data: subs }, { data: maps }, { data: clientData }, { data: pays }, { data: pMonths }, { data: pSubs }, iTxs, { data: mTxs }, { data: cDocs }] = await Promise.all([
        supabase.from("month_entries").select("*").eq("client_id", session.id).order("month_key", { ascending: false }),
        supabase.from("submissions").select("*").eq("client_id", session.id).order("created_at", { ascending: true }),
        supabase.from("remembered_mappings").select("*").eq("client_id", session.id),
        supabase.from("clients").select("portfolio_open,portfolio_opened_at,email,phone,cycle_start_day,plan,submitted_at,required_docs,questionnaire_spouses,doc_notes,custom_docs,hidden_cats").eq("id", session.id).maybeSingle(),
        supabase.from("payslips").select("*").eq("client_id", session.id).order("created_at", { ascending: false }),
        supabase.from("portfolio_months").select("*").eq("client_id", session.id).order("month_key", { ascending: false }),
        supabase.from("portfolio_submissions").select("*").eq("client_id", session.id).order("created_at", { ascending: true }),
        loadAllImportedTxs(session.id),
        supabase.from("manual_transactions").select("*").eq("client_id", session.id).order("created_at", { ascending: false }),
        supabase.from("client_documents").select("*").eq("client_id", session.id)
      ]);
      const isFirst = (entries || []).length === 0 && (pays || []).length === 0 && (subs || []).length === 0;
      const alreadyDismissed = sessionStorage.getItem('welcome_dismissed_' + session.id);
      setShowWelcome(isFirst && !alreadyDismissed);
      setMonthEntries(entries || []);
      setSubmissions(subs || []);
      setPayslips(pays || []);
      setPortfolioOpen(clientData?.portfolio_open || false);
      setPortfolioOpenedAt(clientData?.portfolio_opened_at || null);
      setCycleStartDay(clientData?.cycle_start_day || 1);
      setClientPlan(clientData?.plan || "free");
      setSubmittedAt(clientData?.submitted_at || null);
      setRequiredDocs(clientData?.required_docs ?? null);
      setQuestionnaireSpouses(clientData?.questionnaire_spouses ?? null);
      setDocNotes(clientData?.doc_notes ?? {});
      setCustomDocs(clientData?.custom_docs ?? []);
      setHiddenCats(clientData?.hidden_cats ?? []);

      // טען קטגוריות תסריט פעיל (אם קיים)
      if (clientData?.portfolio_open) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: activeScen } = await supabase
          .from("active_scenario")
          .select("scenario_id")
          .eq("client_id", session.id)
          .lte("active_from", today)
          .or(`active_until.is.null,active_until.gte.${today}`)
          .order("active_from", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeScen?.scenario_id) {
          const { data: items } = await supabase
            .from("scenario_items")
            .select("category_name")
            .eq("scenario_id", activeScen.scenario_id);
          setScenarioCats((items || []).map((r: any) => r.category_name));
        } else {
          setScenarioCats(null); // יש תיק פתוח אבל אין תסריט → הצג הכל
        }
      } else {
        setScenarioCats(null); // תיק לא פתוח → הצג הכל
      }

      setClientDocs(cDocs || []);
      setPortfolioMonths(pMonths || []);
      setPortfolioSubs(pSubs || []);
      const mappingObj = {};
      (maps || []).forEach(m => { mappingObj[m.business_name] = m.category; });
      setRememberedMappings(mappingObj);
      setImportedTxs(iTxs);
      setManualTxs(mTxs || []);
      setImportedLoaded(true);
    } catch(err) {
      console.error("loadUserData error:", err);
      // Even on error — release the loading state so app is usable
    } finally {
      setLoadingData(false);
    }
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const finalizedMonths = monthEntries.filter(e => e.is_finalized);
  const completedOnboarding = finalizedMonths.length >= REQUIRED_MONTHS && payslips.length >= REQUIRED_MONTHS;
  const isOnboarding = !completedOnboarding;
  const usedMonthKeys = monthEntries.map(e => e.month_key);

  // ── open month picker to create new month ──
  const openNewMonth = () => setShowMonthPicker(true);

  const onMonthConfirmed = async (key, monthName, year) => {
    setShowMonthPicker(false);
    const label = `${monthName} ${year}`;
    // create month_entry if not exists
    const existing = monthEntries.find(e => e.month_key === key);
    if (!existing) {
      await supabase.from("month_entries").insert([{ client_id: session.id, month_key: key, label, is_finalized: false }]);
      await loadUserData();
    }
    // open the month detail page — from there user can add sources
    const { data: entry } = await supabase.from("month_entries").select("*").eq("client_id", session.id).eq("month_key", key).maybeSingle();
    const { data: subs } = await supabase.from("submissions").select("*").eq("client_id", session.id).eq("month_key", key).order("created_at", { ascending: true });
    setActiveMonth(entry || { client_id: session.id, month_key: key, label, is_finalized: false });
    setMonthSubs(subs || []);
    setScreen("month");
  };

  const openMonth = async (entry) => {
    setActiveMonth(entry);
    const { data: subs } = await supabase.from("submissions").select("*").eq("client_id", session.id).eq("month_key", entry.month_key).order("created_at", { ascending: true });
    setMonthSubs(subs || []);
    setScreen("month");
  };

  // ── upload flow ──
  const openUpload = (monthKey, monthLabel, from = "month") => {
    setSelectedMonthKey(monthKey);
    setSelectedMonthLabel(monthLabel);
    setUploadedFiles([]);
    setTransactions([]);
    setSourceLabel("");
    setUploadSource(from);
    setScreen("upload");
  };

  const handleFiles = (files: FileList | File[]) => {
    const newFiles = Array.from(files).filter(f => !uploadedFiles.find(u => u.name === f.name));
    setUploadedFiles(p => [...p, ...newFiles]);
  };

  const NON_PARSEABLE_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx"];
  const isNonParseable = (name: string) => NON_PARSEABLE_EXTS.some(ext => name.toLowerCase().endsWith(ext));

  const analyzeFiles = async () => {
    setAnalyzing(true);
    setAnalyzeResults([]);
    const results: {name:string,count:number,error?:string}[] = [];
    let allTx: any[] = [];
    for (const file of uploadedFiles) {
      if (isNonParseable(file.name)) {
        results.push({ name: file.name, count: 0, error: "סוג קובץ זה אינו נתמך לניתוח אוטומטי — יש להמיר ל-Excel או CSV" });
        setAnalyzeResults([...results]);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        const parsed = parseExcelData(buf, file.name, rememberedMappings, categoryRules);
        allTx = allTx.concat(parsed);
        results.push({ name: file.name, count: parsed.length });
      } catch(e: any) {
        results.push({ name: file.name, count: 0, error: e?.message || "שגיאה בניתוח הקובץ" });
      }
      setAnalyzeResults([...results]);
    }
    setAnalyzing(false);
    if (allTx.length > 0) {
      setTransactions(allTx);
      setScreen("review");
    }
  };

  const saveSubmission = async () => {
    const label = sourceLabel || selectedMonthLabel;
    const { error } = await supabase.from("submissions").insert([{
      client_id: session.id,
      label,
      month_key: selectedMonthKey,
      source_label: sourceLabel,
      files: uploadedFiles.map(f => f.name),
      transactions,
      created_at: new Date().toISOString()
    }]);
    if (error) { showToast("שגיאת שמירה: " + error.message); return; }

    await loadUserData();
    // reload month subs
    const { data: freshSubs } = await supabase.from("submissions").select("*").eq("client_id", session.id).eq("month_key", selectedMonthKey).order("created_at", { ascending: true });
    setMonthSubs(freshSubs || []);
    // refresh activeMonth
    const { data: freshEntry } = await supabase.from("month_entries").select("*").eq("client_id", session.id).eq("month_key", selectedMonthKey).maybeSingle();
    if (freshEntry) setActiveMonth(freshEntry);

    showToast("✅ הפירוט נשמר!");
    setScreen("month"); // always go to month view after saving
  };

  const finalizeMonth = async () => {
    if (!activeMonth) return;
    if (!window.confirm(`לסמן את ${activeMonth.label} כהושלם?\nלא תוכל להוסיף תנועות חדשות, אך תוכל לערוך קיימות.`)) return;
    await supabase.from("month_entries").update({ is_finalized: true }).eq("client_id", session.id).eq("month_key", activeMonth.month_key);
    await loadUserData();
    // check completion
    // reload to get accurate counts
    await loadUserData();
    showToast("✅ החודש סומן כהושלם!");
    setScreen("dashboard");
  };

  const reopenMonth = async (monthKey) => {
    await supabase.from("month_entries").update({ is_finalized: false }).eq("client_id", session.id).eq("month_key", monthKey);
    await loadUserData();
    showToast("החודש נפתח מחדש לעריכה");
  };

  const saveHiddenCats = async (cats: string[]) => {
    setHiddenCats(cats);
    await supabase.from("clients").update({ hidden_cats: cats }).eq("id", session.id);
  };

  const savePortfolioTxCat = async (submissionId, txIndex, newCat) => {
    const sub = portfolioSubs.find(s => s.id === submissionId);
    if (!sub) return;
    const oldCat = sub.transactions?.[txIndex]?.cat || null;
    const businessName = sub.transactions?.[txIndex]?.name || null;
    const newTxs = [...(sub.transactions || [])];
    newTxs[txIndex] = { ...newTxs[txIndex], cat: newCat, edited: true };
    await supabase.from("portfolio_submissions").update({ transactions: newTxs }).eq("id", submissionId);
    await supabase.from("client_change_log").insert([{ client_id: session.id, event_type: "remap_business", details: { business_name: businessName, from_cat: oldCat, to_cat: newCat } }]);
    await loadUserData();
  };

  const deletePortfolioSub = async (submissionId) => {
    await supabase.from("portfolio_submissions").delete().eq("id", submissionId);
    await loadUserData();
  };

  // ── category editing ──
  const updateTxCat = (id, cat) => {
    setTransactions(p => p.map(t => t.id === id ? { ...t, cat, edited: true, conf: "high" } : t));
    if (pendingRemember?.id === id) setPendingRemember(null);
  };

  const updateTxNote = (id, note) => {
    setTransactions(p => p.map(t => t.id === id ? { ...t, note } : t));
  };

  const filteredTx = transactions.filter(t => {
    if (filter === "low" && t.conf !== "low") return false;
    if (filter === "edited" && !t.edited) return false;
    if (search) { const s = search.toLowerCase(); if (!t.name.toLowerCase().includes(s) && !t.cat.toLowerCase().includes(s)) return false; }
    return true;
  });

  if (showConnectCard) return (
    <ConnectCardScreen session={session} onBack={() => setShowConnectCard(false)} />
  );

  const chartData = [...finalizedMonths].reverse().slice(0,6).map(entry => {
    const subs = submissions.filter(s => s.month_key === entry.month_key);
    const total = subs.flatMap(s => s.transactions || []).filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + t.amount, 0);
    return { name: entry.label || "", הוצאות: Math.round(total) };
  });

  const exportMonthToExcel = (entry) => {
    const XLSX = window.XLSX;
    if (!XLSX) { showToast("ספריית Excel לא נטענה"); return; }
    const subs = submissions.filter(s => s.month_key === entry.month_key);
    const allTx = subs.flatMap(s => s.transactions || []);
    const txRows = allTx.map(t => ({ "תאריך": t.date, "שם בית עסק": t.name, "סעיף": t.cat, "סכום": t.amount, "מקור": t.source || "" }));
    const catMap: Record<string, number> = {};
    allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.amount; });
    const summaryRows = Object.entries(catMap).sort((a,b) => b[1]-a[1]).map(([cat, amt]) => ({ "סעיף": cat, "סכום כולל": Math.round(amt), "מספר עסקאות": allTx.filter(t=>t.cat===cat).length }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "תנועות");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "סיכום");
    XLSX.writeFile(wb, `מאזן_${entry.label}.xlsx`);
  };

  if (loadingData) return (
    <div style={{ background:"var(--bg)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}><Spinner /><div style={{ marginTop:16, color:"var(--text-dim)" }}>טוען...</div></div>
    </div>
  );

  return (
    <div style={{ background:"var(--bg)", minHeight:"100vh", color:"var(--text)" }}>
      {/* Navbar */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:"var(--surface)", borderBottom:"1px solid var(--border)", padding:"14px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:38, height:38, background:"var(--green-mid)", borderRadius:10, flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M6 24 L12 16 L18 20 L26 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 10 H26 V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily:"'Fraunces', serif", fontWeight:600, fontSize:18, color:"var(--green-deep)", lineHeight:1 }}>מאזן</div>
            <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:2 }}>שלום, {session.name}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {screen !== "dashboard" && <Btn variant="ghost" size="sm" onClick={() => setScreen("dashboard")}>ראשי</Btn>}
          <Btn variant="ghost" size="sm" onClick={onLogout}>יציאה</Btn>
        </div>
      </div>

      {/* Welcome modal for new clients */}
      {showWelcome && (
        <>
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:9000 }} onClick={() => { setShowWelcome(false); sessionStorage.setItem('welcome_dismissed_' + session.id, '1'); }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:20, padding:"36px 32px", zIndex:9001, width:"min(480px,90vw)", textAlign:"center", boxShadow:"0 24px 64px rgba(0,0,0,0.6)" }}>
            <div style={{ fontSize:52, marginBottom:16 }}>👋</div>
            <div style={{ fontWeight:800, fontSize:20, marginBottom:10 }}>ברוכים הבאים!</div>
            <div style={{ color:"var(--text-dim)", fontSize:13, lineHeight:1.8, marginBottom:28 }}>
              כדי שאלון יוכל לבנות לכם תכנית פיננסית מדויקת,<br/>
              נצטרך מכם מספר מסמכים. הרשימה המלאה מחכה לכם בדף הבא.
            </div>
            <Btn onClick={() => { setShowWelcome(false); sessionStorage.setItem('welcome_dismissed_' + session.id, '1'); }} style={{ width:"100%", justifyContent:"center" }}>
              מובן, בואו נתחיל! →
            </Btn>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green-deep)", color:"#fff", borderRadius:12, padding:"12px 20px", fontSize:13, zIndex:9999, boxShadow:"0 8px 32px rgba(30,77,53,0.3)" }}>
          {toast}
        </div>
      )}

      {/* Month picker modal */}
      {showMonthPicker && (
        <MonthPickerModal
          usedMonths={usedMonthKeys}
          onConfirm={onMonthConfirmed}
          onCancel={() => setShowMonthPicker(false)}
        />
      )}

      {/* ── DASHBOARD ── */}
      {screen === "dashboard" && (
        <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 20px" }}>
          {/* Tab bar — תמיד מוצג (כולל במהלך onboarding) */}
          <div style={{ display:"flex", gap:4, marginBottom:24, borderBottom:`1px solid ${"var(--border)"}` }}>
            {[
              ...(portfolioOpen ? [{ id:"portfolio", label:"📁 תיק כלכלי" }] : []),
              { id:"data", label:"📂 חומרי בסיס" },
              ...(completedOnboarding ? [{ id:"personal", label:"פרטים אישיים" }] : []),
              ...(completedOnboarding ? [{ id:"analytics-trends", label:"📊 מגמות" }] : []),
              ...(completedOnboarding ? [{ id:"analytics-forecast", label:"🔮 תחזית" }] : []),
            ].map(t => (
              <button key={t.id} onClick={() => switchTab(t.id)} style={{ padding:"10px 18px", fontSize:13, fontFamily:"inherit", fontWeight:activeTab===t.id?700:400, color:activeTab===t.id?"var(--green-mid)":"var(--text-dim)", background:"none", border:"none", borderBottom:`2px solid ${activeTab===t.id?"var(--green-mid)":"transparent"}`, cursor:"pointer", marginBottom:-1 }}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Sub-tab bar for חומרי בסיס */}
          {activeTab === "data" && (
            <div style={{ display:"flex", gap:4, marginBottom:20, borderBottom:`1px solid ${"var(--border)"}` }}>
              {[
                { id:"documents", label:"📂 מסמכים" },
                { id:"questionnaire", label:"📝 שאלון אישי" },
              ].map(t => (
                <button key={t.id} onClick={() => setDataSubTab(t.id)} style={{ padding:"8px 16px", fontSize:13, fontFamily:"inherit", fontWeight:dataSubTab===t.id?700:400, color:dataSubTab===t.id?"var(--green-mid)":"var(--text-dim)", background:"none", border:"none", borderBottom:`2px solid ${dataSubTab===t.id?"var(--green-mid)":"transparent"}`, cursor:"pointer", marginBottom:-1 }}>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Questionnaire sub-tab */}
          {activeTab === "data" && dataSubTab === "questionnaire" && (
            <CoachingQuestionnaire session={session} spousesCount={questionnaireSpouses || 1} onNavigateBack={() => setDataSubTab("documents")} />
          )}

          {/* Onboarding checklist — מוצג בטאב data לפני השלמה */}
          {!submittedAt && activeTab === "data" && dataSubTab === "documents" && (
            <OnboardingChecklist
              session={session}
              finalizedMonths={finalizedMonths}
              payslips={payslips}
              docs={clientDocs}
              submittedAt={submittedAt}
              requiredDocs={requiredDocs}
              questionnaireSpouses={questionnaireSpouses}
              docNotes={docNotes}
              customDocs={customDocs}
              onNavigateTxs={openNewMonth}
              onNavigatePayslips={() => setScreen("payslips")}
              onNavigateQuestionnaire={() => { switchTab("data"); setDataSubTab("questionnaire"); }}
              onMonthsChange={loadUserData}
              onDocsChange={async () => {
                const { data } = await supabase.from("client_documents").select("*").eq("client_id", session.id);
                setClientDocs(data || []);
              }}
              onSubmit={async () => {
                await supabase.from("clients").update({ submitted_at: new Date().toISOString(), completion_email_sent: true }).eq("id", session.id);
                await sendCompletionEmail(session.name);
                setSubmittedAt(new Date().toISOString());
                showToast("🎉 הטופס הוגש! נשלחה הודעה לאלון.");
              }}
            />
          )}

          {/* DATA TAB */}
          {activeTab === "data" && completedOnboarding && dataSubTab === "documents" && (
            <div>
              {/* KPIs */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:24 }}>
                <KpiCard icon="📁" label="חודשים שהושלמו" value={`${finalizedMonths.length} / ${REQUIRED_MONTHS}`} />
                <KpiCard icon="🧠" label="מיפויים שנזכרו" value={Object.keys(rememberedMappings).length} />
                <KpiCard icon="💰" label="הוצאות אחרונות" value={(() => {
                  const last = monthEntries[0];
                  if (!last) return "—";
                  const subs = submissions.filter(s => s.month_key === last.month_key);
                  const total = subs.flatMap(s => s.transactions||[]).filter(t => !ignoredCats.has(t.cat)).reduce((sum,t) => sum+t.amount, 0);
                  return "₪" + Math.round(total).toLocaleString();
                })()} color={"var(--red)"} />
              </div>

              {/* Chart */}
              {chartData.length > 1 && completedOnboarding && (
                <Card style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:700, marginBottom:16 }}>📈 הוצאות לאורך זמן</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={"var(--border)"} /><XAxis dataKey="name" tick={{ fill:"var(--text-dim)", fontSize:11 }} /><YAxis tick={{ fill:"var(--text-dim)", fontSize:11 }} /><Tooltip contentStyle={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, color:"var(--text)", fontFamily:"'Heebo'" }} /><Bar dataKey="הוצאות" fill={"var(--green-mid)"} radius={[4,4,0,0]} /></BarChart>
                  </ResponsiveContainer>
                </Card>
              )}


              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontWeight:700 }}>חודשים שהוזנו</div>
                <div style={{ display:"flex", gap:8 }}>
                  <Btn size="sm" variant="secondary" onClick={() => setShowConnectCard(true)}>🔗 חבר כרטיס</Btn>
                  {monthEntries.length < REQUIRED_MONTHS && <Btn size="sm" onClick={openNewMonth}>+ הוסף חודש</Btn>}
                </div>
              </div>

              {monthEntries.length === 0 ? (
                <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
                  <div>לחץ "+ הוסף חודש" כדי להתחיל</div>
                </Card>
              ) : monthEntries.map(entry => {
                const subs = submissions.filter(s => s.month_key === entry.month_key);
                const allTx = subs.flatMap(s => s.transactions || []);
                const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + t.amount, 0);
                const top3 = (Object.entries(allTx.reduce((acc: Record<string,number>,t)=>{if(!ignoredCats.has(t.cat)){acc[t.cat]=(acc[t.cat]||0)+t.amount;}return acc;},{} as Record<string,number>)) as [string,number][]).sort((a,b)=>b[1]-a[1]).slice(0,3);
                return (
                  <Card key={entry.id || entry.month_key} style={{ marginBottom:12, border:`1px solid ${entry.is_finalized?"rgba(46,204,138,0.25)":"var(--border)"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
                      <div style={{ flex:1, cursor:"pointer" }} onClick={() => openMonth(entry)}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                          <div style={{ fontWeight:700, fontSize:16 }}>{entry.label}</div>
                          {entry.is_finalized
                            ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700 }}>✓ הושלם</span>
                            : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"2px 10px", fontSize:11 }}>בתהליך</span>
                          }
                        </div>
                        <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:8 }}>{subs.length} מקורות · {allTx.length} תנועות</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {top3.map(([cat,amt]) => <span key={cat} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"2px 10px", fontSize:11 }}>{cat}: ₪{Math.round(amt).toLocaleString()}</span>)}
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                        <div style={{ fontWeight:800, fontSize:20, color:"var(--red)" }}>₪{Math.round(total).toLocaleString()}</div>
                        <div style={{ display:"flex", gap:6 }}>
                          <Btn variant="ghost" size="sm" onClick={e => { e.stopPropagation(); exportMonthToExcel(entry); }}>⬇️ Excel</Btn>
                          <button onClick={async e => { e.stopPropagation(); if (!window.confirm(`למחוק את ${entry.label}?`)) return; await supabase.from("submissions").delete().eq("client_id", session.id).eq("month_key", entry.month_key); await supabase.from("month_entries").delete().eq("client_id", session.id).eq("month_key", entry.month_key); await loadUserData(); }} style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"3px 8px", fontSize:11, color:"var(--red)", cursor:"pointer", fontFamily:"inherit" }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* PORTFOLIO TAB */}
          {completedOnboarding && activeTab === "portfolio" && portfolioOpen && (
            <PortfolioTab
              clientId={session.id}
              clientPlan={clientPlan}
              portfolioMonths={portfolioMonths}
              portfolioSubs={portfolioSubs}
              onDataChange={loadUserData}
              onMonthCreated={(newEntry) => setPortfolioMonths(p => [newEntry, ...p.filter(e => e.month_key !== newEntry.month_key)])}
              rememberedMappings={rememberedMappings}
              onRememberingAdded={(name, cat) => setRememberedMappings(p => ({ ...p, [name]: cat }))}
              cycleStartDay={cycleStartDay}
              importedTxs={importedTxs}
              manualTxs={manualTxs}
              onManualTxAdded={(rawRow) => setManualTxs(prev => [...prev, rawRow])}
              onManualTxDeleted={(dbId) => setManualTxs(prev => prev.filter(t => t.id !== dbId))}
              onUpdatePortfolioTxCat={savePortfolioTxCat}
              onDeletePortfolioSub={deletePortfolioSub}
              onCycleStartDayChange={setCycleStartDay}
              categories={categories}
              categoryRows={categoryRows}
              clientCats={clientCats}
              onCategoryAdded={reloadCategories}
              hiddenCats={hiddenCats}
              onHiddenCatsChange={saveHiddenCats}
              scenarioCats={scenarioCats}
              ignoredCats={ignoredCats}
              incomeCats={incomeCats}
              categoryRules={categoryRules}
            />
          )}

          {/* PERSONAL TAB */}
          {completedOnboarding && activeTab === "personal" && (
            <ClientPersonalTab session={session} />
          )}

          {/* ANALYTICS TRENDS TAB — מגמות */}
          {completedOnboarding && activeTab === "analytics-trends" && (
            <AnalyticsTrends
              clientId={session.id}
              portfolioSubs={portfolioSubs}
              importedTxs={importedTxs}
              manualTxs={manualTxs}
              rememberedMappings={rememberedMappings}
              cycleStartDay={cycleStartDay}
              ignoredCats={ignoredCats}
              incomeCats={incomeCats}
              categoryRules={categoryRules}
            />
          )}

          {/* ANALYTICS FORECAST TAB — תחזית */}
          {completedOnboarding && activeTab === "analytics-forecast" && (
            <AnalyticsForecast
              clientId={session.id}
              portfolioSubs={portfolioSubs}
              importedTxs={importedTxs}
              manualTxs={manualTxs}
              rememberedMappings={rememberedMappings}
              cycleStartDay={cycleStartDay}
              ignoredCats={ignoredCats}
              incomeCats={incomeCats}
              fixedCats={fixedCats}
              categoryRules={categoryRules}
            />
          )}
        </div>
      )}

      {/* ── MONTH DETAIL ── */}
      {screen === "month" && activeMonth && (
        <MonthDetailScreen
          entry={activeMonth}
          subs={monthSubs}
          categories={categories}
          categoryRows={categoryRows}
          clientCats={clientCats}
          clientId={session.id}
          onCategoryAdded={reloadCategories}
          hiddenCats={hiddenCats}
          onHiddenCatsChange={saveHiddenCats}
          scenarioCats={scenarioCats}
          ignoredCats={ignoredCats}
          onAddSource={() => openUpload(activeMonth.month_key, activeMonth.label)}
          onFinalize={finalizeMonth}
          onReopen={() => reopenMonth(activeMonth.month_key)}
          onBack={() => setScreen("dashboard")}
          onDeleteSub={async (subId) => {
            await supabase.from("submissions").delete().eq("id", subId);
            const { data: subs } = await supabase.from("submissions").select("*").eq("client_id", session.id).eq("month_key", activeMonth.month_key).order("created_at", { ascending: true });
            setMonthSubs(subs || []);
            await loadUserData();
          }}
          onUpdateSub={async (subId, newTx) => {
            await supabase.from("submissions").update({ transactions: newTx }).eq("id", subId);
            const { data: subs } = await supabase.from("submissions").select("*").eq("client_id", session.id).eq("month_key", activeMonth.month_key).order("created_at", { ascending: true });
            setMonthSubs(subs || []);
            await loadUserData();
          }}
        />
      )}

      {/* ── UPLOAD ── */}
      {screen === "upload" && (
        <div style={{ maxWidth:640, margin:"0 auto", padding:"28px 20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
            <Btn variant="ghost" size="sm" onClick={() => { if (uploadSource === "month" && activeMonth) setScreen("month"); else setScreen("dashboard"); }}>← חזור</Btn>
            <div style={{ fontWeight:700, fontSize:18 }}>📂 הוסף תנועות — {selectedMonthLabel}</div>
          </div>

          <Card style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>שם המקור</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
              {["מקס","ישראכרט","ויזה","דיינרס","עו\"ש","אחר"].map(s => (
                <button key={s} onClick={() => setSourceLabel(s)} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${sourceLabel===s?"var(--green-mid)":"var(--border)"}`, background:sourceLabel===s?"var(--green-mint)":"var(--surface2)", color:sourceLabel===s?"var(--green-mid)":"var(--text-dim)", fontWeight:sourceLabel===s?700:400 }}>{s}</button>
              ))}
            </div>
            <Input label="או הכנס שם ידני" value={sourceLabel} onChange={e => setSourceLabel(e.target.value)} placeholder='למשל "מקס - אמא"' />
          </Card>

          <div
            style={{ marginBottom:16, textAlign:"center", padding:"28px 20px",
              border:`2px dashed ${dragOver ? "var(--green-mid)" : "var(--border)"}`,
              borderRadius:12,
              background: dragOver ? "var(--green-mint)" : "var(--surface)",
              transition:"border-color 0.15s, background 0.15s" }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          >
            <div style={{ fontSize:32, marginBottom:10 }}>{dragOver ? "⬇️" : "📎"}</div>
            <div style={{ fontWeight:700, marginBottom:6 }}>{dragOver ? "שחרר להוספה" : "גרור קבצים לכאן"}</div>
            <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:16 }}>Excel, CSV, PDF, Word, תמונות וכל קובץ פיננסי רלוונטי</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.ods" multiple style={{ display:"none" }} onChange={e => handleFiles(e.target.files)} />
            <Btn onClick={() => fileInputRef.current?.click()}>בחר קבצים</Btn>
          </div>

          {uploadedFiles.length > 0 && (
            <Card style={{ marginBottom:16 }}>
              {uploadedFiles.map((f,i) => {
                const res = analyzeResults.find(r => r.name === f.name);
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<uploadedFiles.length-1?`1px solid ${"var(--border)"}22`:"none" }}>
                    <span style={{ fontSize:13 }}>📄 {f.name}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {res && (
                        <span style={{ fontSize:11, color: res.error ? "var(--red)" : res.count === 0 ? "var(--gold)" : "var(--green-soft)" }}>
                          {res.error ? `⚠️ ${res.error}` : res.count === 0 ? "⚠️ לא זוהו תנועות" : `✓ ${res.count} תנועות`}
                        </span>
                      )}
                      {analyzing && !res && <span style={{ fontSize:11, color:"var(--text-dim)" }}>מנתח...</span>}
                      <button onClick={() => setUploadedFiles(p => p.filter((_,j) => j!==i))} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {analyzeResults.length > 0 && !analyzing && analyzeResults.every(r => r.count === 0) && (
            <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid var(--gold)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:13, color:"var(--gold)" }}>
              ⚠️ לא זוהו תנועות באף קובץ. בדוק שהקבצים הם Excel/CSV עם עמודות תאריך, שם ועסק וסכום.
            </div>
          )}

          <Btn onClick={analyzeFiles} disabled={uploadedFiles.length === 0 || !sourceLabel || analyzing} style={{ width:"100%", justifyContent:"center" }}>
            {analyzing ? "⏳ מנתח..." : "🔍 נתח תנועות ←"}
          </Btn>
        </div>
      )}

      {/* ── REVIEW ── */}
      {screen === "review" && (
        <div style={{ maxWidth:800, margin:"0 auto", padding:"28px 20px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Btn variant="ghost" size="sm" onClick={() => setScreen("upload")}>← חזור</Btn>
              <div style={{ fontWeight:700, fontSize:18 }}>✏️ סיווג תנועות</div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:13, color:"var(--text-dim)", alignSelf:"center" }}>{transactions.length} תנועות</span>
              <Btn size="sm" onClick={saveSubmission}>💾 שמור ←</Btn>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
            {[["all","הכל"],["low","ביטחון נמוך"],["edited","נערך"]].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding:"6px 16px", borderRadius:20, fontSize:14, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${filter===v?"var(--green-mid)":"var(--border)"}`, background:filter===v?"var(--green-mint)":"transparent", color:filter===v?"var(--green-deep)":"var(--text-mid)" }}>{l}</button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." style={{ flex:1, minWidth:120, background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:20, padding:"6px 16px", color:"var(--text)", fontSize:14, fontFamily:"inherit", outline:"none" }} />
          </div>

          <RememberModal
            pendingRemember={pendingRemember}
            onAlways={async () => {
              const oldCat = rememberedMappings[pendingRemember.name] || null;
              await supabase.from("remembered_mappings").upsert(
                [{ client_id: session.id, business_name: pendingRemember.name, category: pendingRemember.cat }],
                { onConflict: "client_id,business_name" }
              );
              await supabase.from("client_change_log").insert([{ client_id: session.id, event_type: "remap_business", details: { business_name: pendingRemember.name, from_cat: oldCat, to_cat: pendingRemember.cat } }]);
              setRememberedMappings(p => ({ ...p, [pendingRemember.name]: pendingRemember.cat }));
              setPendingRemember(null);
            }}
            onThisSession={() => {
              const { name, cat } = pendingRemember;
              setTransactions(p => p.map(t => t.name === name ? { ...t, cat, edited: true } : t));
              setPendingRemember(null);
            }}
            onJustHere={() => setPendingRemember(null)}
          />

          {filteredTx.map(tx => {
            const isKnown = !!rememberedMappings[tx.name];
            return (
            <Card key={tx.id} style={{ marginBottom:10, padding:"14px 18px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontWeight:600, fontSize:15 }}>{tx.name}</span>
                    <span style={{ fontSize:10, padding:"2px 7px", borderRadius:10, fontWeight:600,
                      background: isKnown ? "rgba(46,204,138,0.12)" : "rgba(255,183,77,0.12)",
                      color: isKnown ? "var(--green-soft)" : "var(--gold)",
                      border: `1px solid ${isKnown ? "rgba(46,204,138,0.3)" : "rgba(255,183,77,0.3)"}`,
                    }}>{isKnown ? "מוכר" : "חדש"}</span>
                  </div>
                  <div style={{ fontSize:12, color:"var(--text-dim)" }}>{tx.date}</div>
                  {tx.note && (
                    <div style={{ fontSize:12, color:"var(--text-mid)", marginTop:3, fontStyle:"italic" }}>📝 {tx.note}</div>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontWeight:700, color:"var(--red)", fontSize:15 }}>₪{tx.amount.toLocaleString()}</span>
                  <button
                    onClick={() => { setActiveTxId(tx.id === activeTxId ? null : tx.id); setCatSearch(""); setPendingRemember(null); }}
                    style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"5px 14px", fontSize:13, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}
                  >{tx.cat}</button>
                  <button
                    onClick={() => setActiveTxId(activeTxId === `note_${tx.id}` ? null : `note_${tx.id}`)}
                    style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize:13, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                    title="הוסף הערה"
                  >📝</button>
                </div>
              </div>

              {activeTxId === tx.id && (
                <CategoryPicker
                  current={tx.cat}
                  catSearch={catSearch}
                  setCatSearch={setCatSearch}
                  categories={categories}
                  rows={categoryRows}
                  clientCats={clientCats}
                  clientId={session.id}
                  onCategoryAdded={reloadCategories}
                  hiddenCats={hiddenCats}
                  onHiddenCatsChange={saveHiddenCats}
                  onSelect={(cat) => {
                    const txName = tx.name;
                    setTransactions(prev => prev.map(t =>
                      t.name === txName ? { ...t, cat, edited: true, conf: "high" } : t
                    ));
                    setActiveTxId(null);
                    setCatSearch("");
                    setPendingRemember({ name: txName, cat });
                  }}
                />
              )}

              {activeTxId === `note_${tx.id}` && (
                <div style={{ marginTop:10 }}>
                  <input
                    autoFocus
                    value={tx.note || ""}
                    onChange={e => updateTxNote(tx.id, e.target.value)}
                    placeholder="הוסף הערה לעסקה זו..."
                    style={{ width:"100%", background:"var(--surface2)", border:"1.5px solid var(--green-soft)", borderRadius:8, padding:"8px 12px", color:"var(--text)", fontFamily:"inherit", fontSize:14, outline:"none", boxSizing:"border-box" }}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setActiveTxId(null); }}
                  />
                  <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:4 }}>Enter או Escape לסגור</div>
                </div>
              )}
            </Card>
            );
          })}

          {/* Save button at bottom too */}
          <div style={{ position:"sticky", bottom:20, display:"flex", justifyContent:"center", marginTop:16 }}>
            <Btn onClick={saveSubmission} style={{ boxShadow:"0 4px 20px rgba(45,106,79,0.3)", padding:"12px 36px", fontSize:15 }}>💾 שמור את כל הסיווגים</Btn>
          </div>
        </div>
      )}

      {/* ── PAYSLIPS ── */}
      {screen === "payslips" && (
        <PayslipsScreen
          clientId={session.id}
          payslips={payslips}
          subsCount={finalizedMonths.length}
          clientName={session.name}
          onDone={async () => {
            await loadUserData();
            setScreen("dashboard");
          }}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {/* ── כפתורי יצירת קשר צפים ── */}
      <div style={{ position:"fixed", bottom:24, left:24, display:"flex", flexDirection:"column", gap:10, zIndex:1000 }}>
        <a href="https://wa.me/972542558557" target="_blank" rel="noreferrer"
          title="שלח הודעת WhatsApp לאלון"
          style={{ width:48, height:48, borderRadius:"50%", background:"#25D366", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 14px rgba(37,211,102,0.4)", textDecoration:"none" }}>
          <svg width="26" height="26" viewBox="0 0 32 32" fill="white">
            <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.514L4 29l7.697-1.799A12.93 12.93 0 0016 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm6.406 16.594c-.27.755-1.59 1.44-2.184 1.527-.55.08-1.243.114-2.006-.126-.464-.147-1.06-.344-1.82-.674-3.196-1.38-5.287-4.603-5.447-4.815-.16-.212-1.3-1.73-1.3-3.3s.82-2.344 1.112-2.664c.291-.32.635-.4.847-.4.212 0 .423.002.608.01.195.01.457-.074.715.546.268.643.91 2.216.99 2.376.08.16.133.347.027.556-.107.212-.16.344-.32.53l-.48.558c-.16.16-.326.333-.14.653.186.32.826 1.362 1.773 2.206 1.218 1.086 2.245 1.422 2.564 1.582.32.16.507.133.694-.08.186-.212.8-.934.014-1.147-.787-.213-.16-1.067.16-1.067z"/>
          </svg>
        </a>
        <a href="mailto:alon4040@gmail.com" target="_blank" rel="noreferrer"
          title="שלח מייל לאלון"
          style={{ width:48, height:48, borderRadius:"50%", background:"var(--green-mid)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 14px rgba(46,183,124,0.4)", textDecoration:"none" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </a>
      </div>
    </div>
  );
}

// ── Month Picker Modal ────────────────────────────────────────────────────────
function MonthPickerModal({ usedMonths, onConfirm, onCancel }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear]   = useState(now.getFullYear());
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear()-2; y--) years.push(y);
  const key = `${year}-${String(month+1).padStart(2,"0")}`;
  const alreadyUsed = usedMonths.includes(key);
  return (
    <>
      <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:28, zIndex:9001, width:320, boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>📅 הוסף חודש</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>חודש</div>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width:"100%", background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontFamily:"'Heebo',sans-serif", fontSize:13, direction:"rtl" }}>
            {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>שנה</div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width:"100%", background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontFamily:"'Heebo',sans-serif", fontSize:13, direction:"rtl" }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {alreadyUsed && <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid rgba(255,183,77,0.3)", borderRadius:8, padding:"8px 12px", fontSize:12, color:"var(--gold)", marginBottom:14 }}>⚠️ חודש זה כבר קיים — לחץ עליו ברשימה</div>}
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={() => onConfirm(key, HEBREW_MONTHS[month], year)} disabled={alreadyUsed} style={{ flex:1, justifyContent:"center" }}>בחר ←</Btn>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
        </div>
      </div>
    </>
  );
}

// ── LoanFieldForm — מחוץ ל-OnboardingChecklist כדי למנוע remount בכל הקשה ──────
const LOAN_FLD_STYLE: React.CSSProperties = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"inherit", outline:"none" };

function LoanFieldForm({ cat, fields, onChange }) {
  const f = fields || {};
  const set = (k, v) => onChange(cat, k, v);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
      {[["lender","שם המלווה"],["start_date","תאריך התחלה","date"],["end_date","תאריך סיום","date"],["amount","סכום ראשוני (₪)","number"],["monthly","החזר חודשי (₪)","number"]].map(([k,lbl,t]) => (
        <div key={k}>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>{lbl}</div>
          <input type={t||"text"} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={LOAN_FLD_STYLE} placeholder="..." />
        </div>
      ))}
      <div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>ריבית</div>
        <div style={{ display:"flex", gap:14, marginTop:6 }}>
          {["כן","לא"].map(v => (
            <label key={v} style={{ display:"flex", gap:5, alignItems:"center", fontSize:13, cursor:"pointer" }}>
              <input type="radio" name={`int_${cat}`} checked={f.interest===v} onChange={()=>set("interest",v)} /> {v}
            </label>
          ))}
        </div>
      </div>
      <div style={{ gridColumn:"1/-1" }}>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>הערות</div>
        <textarea value={f.notes||""} onChange={e=>set("notes",e.target.value)} rows={2} style={{ ...LOAN_FLD_STYLE, resize:"vertical" }} placeholder="פרטים נוספים..." />
      </div>
    </div>
  );
}

// ── Onboarding Checklist ──────────────────────────────────────────────────────
// type: "file" = קובץ בלבד | "fields" = שדות בלבד | "both" = שדות + קובץ אופציונלי
const LOAN_TYPES = [
  { id:"loan_bank",     label:"הלוואת בנק",          icon:"🏦", type:"file",   fileLabel:"פרטי הלוואה מהבנק" },
  { id:"loan_car",      label:"הלוואת רכב",           icon:"🚗", type:"file",   fileLabel:"לוח סילוקין" },
  { id:"loan_mortgage", label:"משכנתה",               icon:"🏠", type:"file",   fileLabel:"דוח יתרות משכנתה" },
  { id:"loan_work",     label:"הלוואת עבודה",         icon:"💼", type:"fields" },
  { id:"loan_family",   label:"הלוואה מחבר/משפחה",   icon:"👥", type:"fields" },
  { id:"loan_other",    label:"הלוואה אחרת",          icon:"📄", type:"both" },
];

function OnboardingChecklist({ session, finalizedMonths, payslips, docs, submittedAt, requiredDocs, questionnaireSpouses, docNotes, customDocs, onNavigateTxs, onNavigatePayslips, onNavigateQuestionnaire, onDocsChange, onMonthsChange, onSubmit }) {
  docNotes = docNotes || {};
  customDocs = customDocs || [];
  const [expanded, setExpanded]       = useState(null);
  const [activeLoanTypes, setActiveLoanTypes] = useState([]);
  const [showLoanPicker, setShowLoanPicker]   = useState(false);
  const [loanFields, setLoanFields]   = useState({});
  const [pendingFiles, setPendingFiles] = useState({});
  const [saving, setSaving]           = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [questDoneMap, setQuestDoneMap] = useState({ 1: false, 2: false });
  const [editMonthEntry, setEditMonthEntry] = useState(null); // { id, month_key, label }
  const [editMonthVal, setEditMonthVal]     = useState({ month: 0, year: new Date().getFullYear() });
  const [editMonthErr, setEditMonthErr]     = useState("");
  const [editMonthSaving, setEditMonthSaving] = useState(false);
  const fileRefs                      = useRef({});

  // load questionnaire done status
  useEffect(() => {
    if (!requiredDocs || !requiredDocs.includes("questionnaire")) return;
    (async () => {
      const { data } = await supabase.from("client_questionnaire").select("spouse_index,done").eq("client_id", session.id);
      if (data) {
        const m = { 1: false, 2: false };
        data.forEach(r => { m[r.spouse_index] = r.done || false; });
        setQuestDoneMap(m);
      }
    })();
  }, [session.id, requiredDocs]);

  const txsDone      = finalizedMonths.length >= 3;
  const payslipsDone = payslips.length >= 3;

  const needsQuestionnaire = requiredDocs && requiredDocs.includes("questionnaire");
  const spousesCount       = questionnaireSpouses || 1;
  const questDone = !needsQuestionnaire || (questDoneMap[1] && (spousesCount < 2 || questDoneMap[2]));

  const getDoc    = cat => docs.find(d => d.category === cat);
  const isDone    = cat => !!getDoc(cat)?.marked_done;
  const hasFiles  = cat => (getDoc(cat)?.files || []).length > 0 || (pendingFiles[cat] || []).length > 0;

  const ALL_OPTIONAL = ["loans","provident","pl","savings","retirement","checks","debts_other"];
  const visibleOptional = requiredDocs ? ALL_OPTIONAL.filter(s => requiredDocs.includes(s)) : ALL_OPTIONAL;

  const optDoneMap = { loans: isDone("loans_section"), provident: isDone("provident_fund"), pl: isDone("profit_loss"), savings: isDone("savings_pension"), retirement: isDone("retirement_forecast"), checks: isDone("deferred_checks"), debts_other: isDone("debts_other") };
  const allOptDone    = visibleOptional.every(s => optDoneMap[s]);
  const requiredDone  = txsDone && payslipsDone && allOptDone && questDone;

  const REQUIRED_MONTHS = 3;
  const totalItems     = REQUIRED_MONTHS + REQUIRED_MONTHS + visibleOptional.length + (needsQuestionnaire ? 1 : 0);
  const completedItems = Math.min(finalizedMonths.length, REQUIRED_MONTHS)
    + Math.min(payslips.length, REQUIRED_MONTHS)
    + visibleOptional.filter(s => optDoneMap[s]).length
    + (needsQuestionnaire && questDone ? 1 : 0);
  const progressPct    = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // init active loan types from existing docs
  useEffect(() => {
    const existing = docs.filter(d => d.category.startsWith("loan_") && d.category !== "loan_section").map(d => d.category);
    if (existing.length) setActiveLoanTypes(prev => [...new Set([...prev, ...existing])]);
  }, [docs]);

  // init loanFields from saved extra_data
  useEffect(() => {
    const fields = {};
    docs.forEach(d => { if (d.category.startsWith("loan_") && d.extra_data) fields[d.category] = d.extra_data; });
    if (Object.keys(fields).length) setLoanFields(fields);
  }, [docs]);

  const loansDone = isDone("loans_section");
  const loansHasAny = activeLoanTypes.length > 0;

  const toggle = id => setExpanded(e => e === id ? null : id);

  const openEditMonth = (entry) => {
    const [y, m] = (entry.month_key || "").split("-");
    setEditMonthVal({ month: parseInt(m || 1) - 1, year: parseInt(y || new Date().getFullYear()) });
    setEditMonthErr("");
    setEditMonthEntry(entry);
  };

  const saveEditMonth = async () => {
    const newKey = `${editMonthVal.year}-${String(editMonthVal.month + 1).padStart(2, "0")}`;
    const newLabel = `${HEBREW_MONTHS[editMonthVal.month]} ${editMonthVal.year}`;
    if (newKey === editMonthEntry.month_key) { setEditMonthEntry(null); return; }
    const alreadyUsed = finalizedMonths.some(m => m.month_key === newKey && m.id !== editMonthEntry.id);
    if (alreadyUsed) { setEditMonthErr("חודש זה כבר קיים — בחר חודש אחר"); return; }
    setEditMonthSaving(true);
    await supabase.from("month_entries").update({ month_key: newKey, label: newLabel }).eq("id", editMonthEntry.id);
    await supabase.from("submissions").update({ month_key: newKey }).eq("client_id", session.id).eq("month_key", editMonthEntry.month_key);
    setEditMonthEntry(null);
    setEditMonthSaving(false);
    if (onMonthsChange) await onMonthsChange();
  };

  const pickFile = (cat) => {
    if (!fileRefs.current[cat]) return;
    fileRefs.current[cat].value = "";
    fileRefs.current[cat].click();
  };

  const onFileChange = (cat, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPendingFiles(prev => ({ ...prev, [cat]: [...(prev[cat]||[]), ...files] }));
  };

  const uploadToStorage = async (file, cat) => {
    const path = `${session.id}/${cat}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("client-documents").upload(path, file, { upsert: false });
    if (error) { console.error("Storage upload error:", error); return { filename: file.name, size: file.size }; }
    return { filename: file.name, path, size: file.size };
  };

  const saveAndDone = async (cat, label) => {
    setSaving(cat);
    const existing = getDoc(cat);
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase.from("client_documents").update({ files: allFiles, marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label, files: allFiles, marked_done: true }]);
    }
    setPendingFiles(prev => { const n={...prev}; delete n[cat]; return n; });
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const saveLoanFiles = async (cat, label) => {
    setSaving(cat);
    const existing = getDoc(cat);
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase.from("client_documents").update({ files: allFiles }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label, files: allFiles, marked_done: false }]);
    }
    setPendingFiles(prev => { const n={...prev}; delete n[cat]; return n; });
    await onDocsChange();
    setSaving(null);
  };

  const saveLoanFields = async (cat, label) => {
    setSaving(cat + "_f");
    const existing = getDoc(cat);
    const fields   = loanFields[cat] || {};
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase.from("client_documents").update({ extra_data: fields, files: allFiles, marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label, files: allFiles, extra_data: fields, marked_done: true }]);
    }
    setPendingFiles(prev => { const n={...prev}; delete n[cat]; return n; });
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const deleteFile = async (cat, idx) => {
    const existing = getDoc(cat);
    if (!existing) return;
    const file = existing.files[idx];
    if (file?.path) await supabase.storage.from("client-documents").remove([file.path]);
    const newFiles = existing.files.filter((_, i) => i !== idx);
    await supabase.from("client_documents").update({ files: newFiles }).eq("id", existing.id);
    await onDocsChange();
  };

  const markLoansDone = async () => {
    setSaving("loans_section");
    const existing = getDoc("loans_section");
    if (existing) {
      await supabase.from("client_documents").update({ marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category:"loans_section", label:"מסמכי הלוואות", files:[], marked_done: true }]);
    }
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const handleSubmit = async () => {
    if (!requiredDone || submitting) return;
    setSubmitting(true);
    await onSubmit();
    setSubmitting(false);
  };

  const NoteBar = ({ docKey }: { docKey: string }) => {
    const note = docNotes[docKey];
    if (!note) return null;
    return <div style={{ fontSize:12, color:"var(--text-mid)", background:"rgba(46,125,82,0.07)", borderRadius:6, padding:"6px 12px", marginBottom:6, borderRight:"3px solid var(--green-mid)" }}>📌 {note}</div>;
  };

  const SectionHeader = ({ id, icon, label, required = false, done, partial, onClick }) => (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background: done?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius: expanded===id?"10px 10px 0 0":10, border:`1px solid ${done?"rgba(46,204,138,0.3)":partial?"rgba(79,142,247,0.3)":"var(--border)"}`, cursor:"pointer", userSelect:"none" }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600, fontSize:14 }}>{label}</div>
        {required && <div style={{ fontSize:11, color:"var(--text-dim)" }}>חובה</div>}
      </div>
      {done && <span style={{ background:"rgba(46,204,138,0.15)", color:"#22c55e", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>✓ הושלם</span>}
      {!done && partial && <span style={{ background:"rgba(79,142,247,0.12)", color:"var(--green-mid)", borderRadius:20, padding:"3px 12px", fontSize:12 }}>בתהליך</span>}
      <span style={{ color:"var(--text-dim)", fontSize:14, marginRight:4 }}>{expanded===id?"▲":"▼"}</span>
    </div>
  );

  const DoneLine = ({ done }) => done ? <div style={{ height:3, background:"linear-gradient(90deg,#22c55e,rgba(46,204,138,0.2))", borderRadius:"0 0 6px 6px", marginBottom:2 }} /> : null;

  const openFile = async (path) => {
    if (!path) return;
    const { data } = await supabase.storage.from("client-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const FileList = ({ cat }) => {
    const saved = getDoc(cat)?.files || [];
    const pend  = pendingFiles[cat] || [];
    if (!saved.length && !pend.length) return null;
    return (
      <div style={{ marginTop:8, marginBottom:4 }}>
        {saved.map((f,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--text)", padding:"3px 0" }}>
            <span>📎 {f.filename}</span>
            {f.path && <button onClick={() => openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize:11, padding:"0 2px" }} title="צפה">👁</button>}
            <button onClick={() => deleteFile(cat, i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:11, padding:"0 2px" }} title="מחק">✕</button>
          </div>
        ))}
        {pend.map((f,i) => (
          <div key={i} style={{ fontSize:12, color:"var(--green-mid)", padding:"3px 0" }}>📎 {f.name} <span style={{ color:"var(--text-dim)" }}>(ממתין לשמירה)</span></div>
        ))}
      </div>
    );
  };

  const UploadArea = ({ cat }) => (
    <div>
      <input ref={el => fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e => onFileChange(cat, e)} />
      <FileList cat={cat} />
      <Btn size="sm" variant="secondary" onClick={() => pickFile(cat)} style={{ marginTop:6 }}>📎 הוסף קובץ</Btn>
    </div>
  );

  const fldStyle = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"inherit", outline:"none" };
  const bodyStyle = { border:"1px solid var(--border)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"16px 18px", background:"var(--surface)", marginBottom:2 };
  const descStyle = { fontSize:13, color:"var(--text)", opacity:0.8, marginBottom:12 };

  return (
    <div style={{ marginBottom:28 }}>
      {/* Edit month modal */}
      {editMonthEntry && (
        <>
          <div onClick={() => setEditMonthEntry(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:28, zIndex:9001, width:300, boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:16 }}>✏️ ערוך חודש</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>חודש</div>
              <select value={editMonthVal.month} onChange={e => { setEditMonthVal(p => ({...p, month: Number(e.target.value)})); setEditMonthErr(""); }} style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontFamily:"inherit", fontSize:13, direction:"rtl" }}>
                {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>שנה</div>
              <select value={editMonthVal.year} onChange={e => { setEditMonthVal(p => ({...p, year: Number(e.target.value)})); setEditMonthErr(""); }} style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontFamily:"inherit", fontSize:13, direction:"rtl" }}>
                {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {editMonthErr && <div style={{ fontSize:12, color:"var(--red)", marginBottom:10 }}>⚠️ {editMonthErr}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={saveEditMonth} disabled={editMonthSaving} style={{ flex:1, justifyContent:"center" }}>{editMonthSaving ? "שומר..." : "שמור"}</Btn>
              <Btn variant="ghost" onClick={() => setEditMonthEntry(null)} style={{ flex:1, justifyContent:"center" }}>ביטול</Btn>
            </div>
          </div>
        </>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-dim)", marginBottom:6 }}>
          <span>התקדמות כללית</span>
          <span style={{ fontWeight:700, color: progressPct===100?"#22c55e":"var(--text-dim)" }}>{progressPct}%</span>
        </div>
        <div style={{ background:"var(--surface2)", borderRadius:20, height:10, overflow:"hidden" }}>
          <div style={{ width:`${progressPct}%`, height:"100%", background:"linear-gradient(90deg,var(--green-mid),var(--green-soft))", borderRadius:20, transition:"width .4s" }} />
        </div>
      </div>

      <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>📋 מסמכים נדרשים</div>

      {/* 1. פירוט תנועות */}
      <div style={{ marginBottom:8 }}>
        <SectionHeader id="txs" icon="📂" label="פירוט תנועות — 3 חודשים" required done={txsDone} partial={finalizedMonths.length>0&&!txsDone} onClick={()=>toggle("txs")} />
        <DoneLine done={txsDone} />
        {expanded==="txs" && (
          <div style={bodyStyle}>
            {finalizedMonths.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:13, color:"var(--text)", padding:"3px 0" }}>
                <span>✓ {m.label}</span>
                <button onClick={() => openEditMonth(m)} style={{ background:"none", border:"none", color:"var(--text-mid)", cursor:"pointer", fontSize:12, padding:"2px 6px" }} title="ערוך שם חודש">✏️</button>
              </div>
            ))}
            <div style={{ ...descStyle, marginTop:6 }}>{txsDone ? "3 חודשי פירוט הושלמו ✓" : `הושלמו ${finalizedMonths.length} מתוך 3 חודשים`}</div>
            {!txsDone && <Btn size="sm" onClick={()=>{setExpanded(null);onNavigateTxs();}}>📂 הוסף חודש →</Btn>}
          </div>
        )}
      </div>

      {/* 2. תלושי שכר */}
      <div style={{ marginBottom:8 }}>
        <SectionHeader id="pays" icon="💼" label="תלושי שכר — 3 חודשים" required done={payslipsDone} partial={payslips.length>0&&!payslipsDone} onClick={()=>toggle("pays")} />
        <DoneLine done={payslipsDone} />
        {expanded==="pays" && (
          <div style={bodyStyle}>
            {payslips.map(p => <div key={p.id} style={{ fontSize:13, color:"var(--text)", padding:"3px 0" }}>✓ {p.month_label || p.label || new Date(p.created_at).toLocaleDateString("he-IL",{month:"long",year:"numeric"})}</div>)}
            <div style={{ ...descStyle, marginTop:6 }}>{payslipsDone ? "3 תלושים הועלו ✓" : `הועלו ${payslips.length} מתוך 3 תלושים`}</div>
            {!payslipsDone && <Btn size="sm" variant="secondary" onClick={()=>{setExpanded(null);onNavigatePayslips();}}>💼 העלה תלוש →</Btn>}
          </div>
        )}
      </div>

      {/* 3. הלוואות */}
      {visibleOptional.includes("loans") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="loans" icon="📋" label="מסמכי הלוואות" done={loansDone} partial={loansHasAny&&!loansDone} onClick={()=>toggle("loans")} />
          <NoteBar docKey="loans" />
          <DoneLine done={loansDone} />
          {expanded==="loans" && (
            <div style={bodyStyle}>
              {activeLoanTypes.map(cat => {
                const lt = LOAN_TYPES.find(l=>l.id===cat);
                if (!lt) return null;
                const isFields = lt.type==="fields";
                const isBoth   = lt.type==="both";
                const saved    = getDoc(cat)?.files || [];
                const pend     = pendingFiles[cat] || [];
                return (
                  <div key={cat} style={{ marginBottom:14, padding:"12px 14px", background:"var(--surface2)", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>{lt.icon} {lt.label}</div>
                    {lt.fileLabel && <div style={{ fontSize:12, color:"var(--text)", opacity:.7, marginBottom:8 }}>נדרש: {lt.fileLabel}</div>}
                    {(isFields||isBoth) && <LoanFieldForm cat={cat} fields={loanFields[cat]} onChange={(c,k,v) => setLoanFields(prev => ({ ...prev, [c]: { ...(prev[c]||{}), [k]:v } }))} />}
                    {!isFields && (
                      <>
                        <input ref={el=>fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e=>onFileChange(cat,e)} />
                        {[...saved.map((f,i)=>({...f,_i:i})), ...pend.map(f=>({filename:f.name,_pending:true}))].map((f,i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:f._pending?"var(--green-mid)":"var(--text)", padding:"2px 0" }}>
                            <span>📎 {f.filename}{f._pending&&" (ממתין)"}</span>
                            {!f._pending && f.path && <button onClick={()=>openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize:11 }}>👁</button>}
                            {!f._pending && <button onClick={()=>deleteFile(cat,f._i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:11 }}>✕</button>}
                          </div>
                        ))}
                        <div style={{ display:"flex", gap:8, marginTop:8 }}>
                          <Btn size="sm" variant="secondary" onClick={()=>pickFile(cat)}>{isBoth?"📎 קובץ (לא חובה)":"📎 הוסף קובץ"}</Btn>
                          {pend.length>0 && <Btn size="sm" onClick={()=>saveLoanFiles(cat,lt.label)} disabled={saving===cat}>{saving===cat?"שומר...":"שמור"}</Btn>}
                        </div>
                      </>
                    )}
                    {(isFields||isBoth) && (
                      <Btn size="sm" onClick={()=>saveLoanFields(cat,lt.label)} disabled={saving===cat+"_f"} style={{ marginTop:4 }}>{saving===cat+"_f"?"שומר...":"✓ שמור"}</Btn>
                    )}
                  </div>
                );
              })}
              {!showLoanPicker
                ? <Btn size="sm" variant="secondary" onClick={()=>setShowLoanPicker(true)} style={{ marginBottom:14 }}>+ הוסף הלוואה</Btn>
                : <div style={{ marginBottom:14, padding:12, background:"var(--surface2)", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>בחר סוג הלוואה:</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {LOAN_TYPES.filter(lt=>!activeLoanTypes.includes(lt.id)).map(lt => (
                        <button key={lt.id} onClick={()=>{setActiveLoanTypes(p=>[...p,lt.id]);setShowLoanPicker(false);}} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid var(--border)", background:"var(--surface)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{lt.icon} {lt.label}</button>
                      ))}
                    </div>
                    <button onClick={()=>setShowLoanPicker(false)} style={{ marginTop:10, fontSize:12, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer" }}>ביטול</button>
                  </div>
              }
              <Btn onClick={markLoansDone} disabled={!loansHasAny||saving==="loans_section"} style={{ width:"100%" }}>{saving==="loans_section"?"שומר...":"✓ סיימתי להוסיף הלוואות"}</Btn>
            </div>
          )}
        </div>
      )}

      {/* 4. קרן השתלמות */}
      {visibleOptional.includes("provident") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="provident" icon="💰" label="יתרת קרן השתלמות" done={isDone("provident_fund")} partial={hasFiles("provident_fund")&&!isDone("provident_fund")} onClick={()=>toggle("provident")} />
          <NoteBar docKey="provident" />
          <DoneLine done={isDone("provident_fund")} />
          {expanded==="provident" && <div style={bodyStyle}><div style={descStyle}>העלה דוח יתרה מחברת הביטוח / קרן הפנסיה</div><UploadArea cat="provident_fund" /><Btn onClick={()=>saveAndDone("provident_fund","קרן השתלמות")} disabled={!hasFiles("provident_fund")||saving==="provident_fund"} style={{ marginTop:14, width:"100%" }}>{saving==="provident_fund"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 5. דוח רווח והפסד */}
      {visibleOptional.includes("pl") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="pl" icon="📊" label="דוח רווח והפסד (לעצמאיים)" done={isDone("profit_loss")} partial={hasFiles("profit_loss")&&!isDone("profit_loss")} onClick={()=>toggle("pl")} />
          <NoteBar docKey="pl" />
          <DoneLine done={isDone("profit_loss")} />
          {expanded==="pl" && <div style={bodyStyle}><div style={descStyle}>רלוונטי לעצמאיים — העלה דוח רווח והפסד שנתי + מאזן בוחן של שנה קודמת</div><UploadArea cat="profit_loss" /><Btn onClick={()=>saveAndDone("profit_loss","דוח רווח והפסד")} disabled={!hasFiles("profit_loss")||saving==="profit_loss"} style={{ marginTop:14, width:"100%" }}>{saving==="profit_loss"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 6. חסכונות ופנסיה */}
      {visibleOptional.includes("savings") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="savings" icon="🏦" label="פירוט חסכונות ופנסיה" done={isDone("savings_pension")} partial={hasFiles("savings_pension")&&!isDone("savings_pension")} onClick={()=>toggle("savings")} />
          <NoteBar docKey="savings" />
          <DoneLine done={isDone("savings_pension")} />
          {expanded==="savings" && <div style={bodyStyle}><div style={descStyle}>כולל: פנסיה, קופות גמל, ביטוח מנהלים, חסכונות בנקאיים, השקעות. ציין גם מועדי נזילות.</div><UploadArea cat="savings_pension" /><Btn onClick={()=>saveAndDone("savings_pension","חסכונות ופנסיה")} disabled={!hasFiles("savings_pension")||saving==="savings_pension"} style={{ marginTop:14, width:"100%" }}>{saving==="savings_pension"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 7. תחזית פרישה — ממש אחרי חסכונות */}
      {visibleOptional.includes("retirement") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="retirement" icon="👴" label="דוח תחזית פרישה (מעל גיל 55)" done={isDone("retirement_forecast")} partial={hasFiles("retirement_forecast")&&!isDone("retirement_forecast")} onClick={()=>toggle("retirement")} />
          <NoteBar docKey="retirement" />
          <DoneLine done={isDone("retirement_forecast")} />
          {expanded==="retirement" && <div style={bodyStyle}><div style={descStyle}>רלוונטי למי שמעל גיל 55 — דוח תחזית פרישה מסוכן הביטוח</div><UploadArea cat="retirement_forecast" /><Btn onClick={()=>saveAndDone("retirement_forecast","דוח תחזית פרישה")} disabled={!hasFiles("retirement_forecast")||saving==="retirement_forecast"} style={{ marginTop:14, width:"100%" }}>{saving==="retirement_forecast"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 8. שיקים דחויים */}
      {visibleOptional.includes("checks") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="checks" icon="📄" label="שיקים דחויים" done={isDone("deferred_checks")} partial={hasFiles("deferred_checks")&&!isDone("deferred_checks")} onClick={()=>toggle("checks")} />
          <NoteBar docKey="checks" />
          <DoneLine done={isDone("deferred_checks")} />
          {expanded==="checks" && <div style={bodyStyle}><div style={descStyle}>שיקים דחויים שאינם חלק מהוצאה שוטפת</div><UploadArea cat="deferred_checks" /><Btn onClick={()=>saveAndDone("deferred_checks","שיקים דחויים")} disabled={!hasFiles("deferred_checks")||saving==="deferred_checks"} style={{ marginTop:14, width:"100%" }}>{saving==="deferred_checks"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 9. פיגורים וחובות */}
      {visibleOptional.includes("debts_other") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="debts_other" icon="⚠️" label="פיגורי תשלומים וחובות אחרים" done={isDone("debts_other")} partial={hasFiles("debts_other")&&!isDone("debts_other")} onClick={()=>toggle("debts_other")} />
          <NoteBar docKey="debts_other" />
          <DoneLine done={isDone("debts_other")} />
          {expanded==="debts_other" && <div style={bodyStyle}><div style={descStyle}>חובות לאנשים פרטיים, גמ"ח, מקום עבודה, פיגורים בתשלומים</div><UploadArea cat="debts_other" /><Btn onClick={()=>saveAndDone("debts_other","פיגורי תשלומים וחובות")} disabled={!hasFiles("debts_other")||saving==="debts_other"} style={{ marginTop:14, width:"100%" }}>{saving==="debts_other"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* מסמכים מותאמים אישית */}
      {customDocs.filter(cd => (requiredDocs||[]).includes(cd.id)).map(cd => {
        const cat = cd.id;
        const cdDone = isDone(cat);
        const cdPartial = hasFiles(cat) && !cdDone;
        return (
          <div key={cd.id} style={{ marginBottom:8 }}>
            <SectionHeader id={cd.id} icon={cd.icon||"📄"} label={cd.label} done={cdDone} partial={cdPartial} onClick={()=>toggle(cd.id)} />
            <NoteBar docKey={cd.id} />
            {expanded===cd.id && (
              <div style={bodyStyle}>
                <UploadArea cat={cd.id} />
                <Btn onClick={()=>saveAndDone(cd.id, cd.label)} disabled={!hasFiles(cd.id)||saving===cd.id} style={{ marginTop:14, width:"100%" }}>{saving===cd.id?"שומר...":"✓ סיימתי"}</Btn>
              </div>
            )}
          </div>
        );
      })}

      {/* שאלון אישי */}
      {needsQuestionnaire && (
        <div style={{ marginBottom:8 }}>
          <div onClick={onNavigateQuestionnaire} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background: questDone?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius:10, border:`1px solid ${questDone?"rgba(46,204,138,0.3)":"var(--border)"}`, cursor:"pointer", userSelect:"none" }}>
            <span style={{ fontSize:20 }}>📝</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14 }}>שאלון אישי</div>
              <div style={{ fontSize:11, color:"var(--text-dim)" }}>לחץ כדי למלא את השאלון</div>
            </div>
            {questDone
              ? <span style={{ background:"rgba(46,204,138,0.15)", color:"#22c55e", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>✓ הושלם</span>
              : <span style={{ color:"var(--text-dim)", fontSize:13 }}>←</span>
            }
          </div>
        </div>
      )}

      {/* הגשה */}
      <div style={{ marginTop:24, padding:"18px 20px", background:requiredDone?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius:12, border:`1px solid ${requiredDone?"rgba(46,204,138,0.3)":"var(--border)"}` }}>
        {!requiredDone && (
          <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:10, textAlign:"center", lineHeight:1.6 }}>
            להגשה יש להשלים קודם:
            {!txsDone && <span> · פירוט תנועות</span>}
            {!payslipsDone && <span> · תלושי שכר</span>}
            {!allOptDone && <span> · כל הסעיפים הנדרשים</span>}
            {!questDone && <span> · שאלון אישי</span>}
          </div>
        )}
        <Btn onClick={handleSubmit} disabled={!requiredDone||submitting} style={{ width:"100%", padding:"14px", fontSize:15, fontWeight:700, opacity:requiredDone?1:0.45 }}>{submitting?"מגיש...":"✅ הגש לאלון"}</Btn>
      </div>
    </div>
  );
}

// ── Onboarding progress ───────────────────────────────────────────────────────
function OnboardingProgress({ subsCount, payslipsCount, total }) {
  const done = subsCount >= total && payslipsCount >= total;
  const totalSteps = total * 2;
  const completedSteps = Math.min(subsCount, total) + Math.min(payslipsCount, total);
  return (
    <div style={{ background:"var(--surface2)", borderRadius:12, padding:"16px 20px", marginBottom:20, border:`1px solid ${"var(--border)"}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>📋 השלמת נתונים ראשוניים</div>
        <div style={{ fontSize:12, color:done?"var(--green-soft)":"var(--text-dim)" }}>{done?"✅ הכל הושלם!":`${completedSteps}/${totalSteps} שלבים`}</div>
      </div>
      <div style={{ background:"var(--surface)", borderRadius:20, height:8, overflow:"hidden" }}>
        <div style={{ width:`${(completedSteps/totalSteps)*100}%`, height:"100%", background:`linear-gradient(90deg,${"var(--green-mid)"},${"var(--green-soft)"})`, borderRadius:20, transition:"width .4s" }} />
      </div>
      <div style={{ display:"flex", gap:16, marginTop:10, fontSize:12 }}>
        <span style={{ color:subsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{subsCount>=total?"✓":"○"} בסיס חומרים לבניית התיק הכלכלי {subsCount}/{total}</span>
        <span style={{ color:payslipsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{payslipsCount>=total?"✓":"○"} תלושי משכורת {payslipsCount}/{total}</span>
      </div>
    </div>
  );
}

// ── Month Detail Screen ───────────────────────────────────────────────────────
function MonthDetailScreen({ entry, subs, onAddSource, onFinalize, onReopen, onBack, onDeleteSub, onUpdateSub, categories, categoryRows = [], clientCats, clientId, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, hiddenCats = [], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
  const allTx = subs.flatMap(s => s.transactions || []);
  const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + t.amount, 0);
  const catMap: Record<string, number> = {};
  allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.amount; });
  const catSummary = Object.entries(catMap).sort((a,b) => b[1]-a[1]);

  const [editingSub, setEditingSub] = useState(null); // sub being edited
  const [editTx, setEditTx]         = useState([]);
  const [editCatOpen, setEditCatOpen] = useState(null);
  const [catSearch, setCatSearch]   = useState("");

  const startEdit = (sub) => { setEditingSub(sub.id); setEditTx(sub.transactions || []); };
  const saveEdit  = () => { onUpdateSub(editingSub, editTx); setEditingSub(null); };

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 20px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← חזור</Btn>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontWeight:700, fontSize:20 }}>{entry.label}</div>
            {entry.is_finalized
              ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>✓ הושלם</span>
              : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"3px 12px", fontSize:12 }}>בתהליך</span>
            }
          </div>
          <div style={{ fontSize:12, color:"var(--text-dim)" }}>{subs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Btn size="sm" onClick={onAddSource}>+ הוסף מקור</Btn>
          {entry.is_finalized
            ? <Btn variant="ghost" size="sm" onClick={onReopen}>🔓 פתח לעריכה</Btn>
            : <Btn size="sm" onClick={onFinalize} disabled={subs.length === 0}>✅ סיימתי את החודש</Btn>
          }
        </div>
      </div>

      {subs.length === 0 ? (
        <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
          <div style={{ marginBottom:16 }}>עוד לא הוספת מקורות לחודש זה</div>
          <Btn onClick={onAddSource}>+ הוסף מקור ראשון</Btn>
        </Card>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          {/* Category summary */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📊 סיכום לפי סעיף</div>
            <div style={{ maxHeight:300, overflowY:"auto" }}>
              {catSummary.map(([cat, amt]) => (
                <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${"var(--border)"}22`, fontSize:12 }}>
                  <span>{cat}</span>
                  <span style={{ fontWeight:700, color:"var(--red)" }}>₪{Math.round(amt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Sources list */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📋 מקורות</div>
            {subs.map(sub => (
              <div key={sub.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${"var(--border)"}22` }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{sub.source_label || sub.label}</div>
                  <div style={{ fontSize:11, color:"var(--text-dim)" }}>{(sub.transactions||[]).length} תנועות</div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => startEdit(sub)} style={{ background:"none", border:`1px solid ${"var(--border)"}`, borderRadius:7, padding:"3px 10px", fontSize:11, color:"var(--green-mid)", cursor:"pointer", fontFamily:"inherit" }}>✏️ ערוך</button>
                  <button onClick={() => { if (window.confirm("למחוק מקור זה?")) onDeleteSub(sub.id); }} style={{ background:"none", border:`1px solid rgba(247,92,92,0.4)`, borderRadius:7, padding:"3px 10px", fontSize:11, color:"var(--red)", cursor:"pointer", fontFamily:"inherit" }}>🗑</button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Inline editor */}
      {editingSub && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontWeight:700 }}>✏️ עריכת תנועות</div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn size="sm" onClick={saveEdit}>שמור</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setEditingSub(null)}>ביטול</Btn>
            </div>
          </div>
          {editTx.map((tx, i) => (
            <div key={tx.id || i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${"var(--border)"}22`, flexWrap:"wrap", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:600 }}>{tx.name}</div>
                <div style={{ fontSize:11, color:"var(--text-dim)" }}>{tx.date} · ₪{tx.amount?.toLocaleString()}</div>
              </div>
              <button onClick={() => setEditCatOpen(editCatOpen === (tx.id||i) ? null : (tx.id||i))} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"4px 12px", fontSize:11, color:"var(--green-mid)", cursor:"pointer", fontFamily:"inherit" }}>{tx.cat}</button>
              {editCatOpen === (tx.id||i) && (
                <div style={{ width:"100%", marginTop:6 }}>
                  <CategoryPicker
                    current={tx.cat}
                    catSearch={catSearch}
                    setCatSearch={setCatSearch}
                    categories={categories}
                    rows={categoryRows}
                    clientCats={clientCats}
                    clientId={clientId}
                    onCategoryAdded={onCategoryAdded}
                    hiddenCats={hiddenCats}
                    onHiddenCatsChange={onHiddenCatsChange}
                    scenarioCats={scenarioCats}
                    onSelect={(cat) => { setEditTx(p => p.map((t,j) => j===i?{...t,cat,edited:true}:t)); setEditCatOpen(null); setCatSearch(""); }}
                  />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Debt Manager helpers
// ════════════════════════════════════════════════════════════════


// ── Portfolio Tab ─────────────────────────────────────────────────────────────
function PortfolioTab({ clientId, clientPlan, portfolioMonths, portfolioSubs, onDataChange, onMonthCreated, rememberedMappings, onRememberingAdded, cycleStartDay, importedTxs, manualTxs, onManualTxAdded, onManualTxDeleted, onUpdatePortfolioTxCat, onDeletePortfolioSub, onCycleStartDayChange, categories, categoryRows = [], clientCats, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, incomeCats = new Set<string>(), categoryRules = [] as any[], hiddenCats = [] as string[], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
  const [tab, setTab] = useState(() => sessionStorage.getItem('mazan_portfolioTab') || "control");
  const switchPortfolioTab = (id) => { sessionStorage.setItem('mazan_portfolioTab', id); setTab(id); };
  // Lift upload state here so re-renders don't reset it
  const [pStep, setPStep]                 = useState("list");
  const [activeEntry, setActiveEntry]     = useState(null);
  const [entrySubs, setEntrySubs]         = useState([]);

  const tabs = [
    { id:"txs",     label:"📋 פירוט תנועות" },
    { id:"control", label:"בקרת תיק כלכלי" },
    { id:"savings", label:"פירוט חסכונות" },
    { id:"balance", label:"מאזן מתוכנן" },
    { id:"debts",   label:"💳 מנהל חובות" },
    { id:"tools",   label:"🧰 כלים לצמיחה" },
  ];

  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:20, flexWrap:"wrap" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => switchPortfolioTab(t.id)} style={{ padding:"8px 16px", fontSize:12, fontFamily:"inherit", fontWeight:tab===t.id?700:400, color:tab===t.id?"var(--text)":"var(--text-dim)", background:tab===t.id?"var(--surface2)":"transparent", border:`1px solid ${tab===t.id?"var(--border)":"transparent"}`, borderRadius:8, cursor:"pointer" }}>{t.label}</button>
        ))}
      </div>

      {tab === "txs" && (
        <AllTransactionsTab
          clientId={clientId}
          importedTxs={importedTxs || []}
          portfolioSubs={portfolioSubs}
          manualTxs={manualTxs || []}
          cycleStartDay={cycleStartDay}
          onCycleStartDayChange={onCycleStartDayChange}
          rememberedMappings={rememberedMappings}
          onDataChange={onDataChange}
          onManualTxAdded={onManualTxAdded}
          onManualTxDeleted={onManualTxDeleted}
          onUpdatePortfolioTxCat={onUpdatePortfolioTxCat}
          onDeletePortfolioSub={onDeletePortfolioSub}
          onNavigateToUpload={() => switchPortfolioTab("upload")}
          categories={categories}
          categoryRows={categoryRows}
          clientCats={clientCats}
          onCategoryAdded={onCategoryAdded}
          hiddenCats={hiddenCats}
          onHiddenCatsChange={onHiddenCatsChange}
          scenarioCats={scenarioCats}
          ignoredCats={ignoredCats}
          categoryRules={categoryRules}
        />
      )}

      {/* Always keep PortfolioUploadTab mounted — just hide it when not active */}
      <div style={{ display: tab === "upload" ? "block" : "none" }}>
        <PortfolioUploadTab
          clientId={clientId}
          portfolioMonths={portfolioMonths}
          portfolioSubs={portfolioSubs}
          onDataChange={onDataChange}
          rememberedMappings={rememberedMappings}
          onRememberingAdded={onRememberingAdded}
          step={pStep} setStep={setPStep}
          activeEntry={activeEntry} setActiveEntry={setActiveEntry}
          entrySubs={entrySubs} setEntrySubs={setEntrySubs}
          onMonthCreated={onMonthCreated}
          categories={categories}
          categoryRows={categoryRows}
          clientCats={clientCats}
          onCategoryAdded={onCategoryAdded}
          hiddenCats={hiddenCats}
          onHiddenCatsChange={onHiddenCatsChange}
          scenarioCats={scenarioCats}
          ignoredCats={ignoredCats}
          categoryRules={categoryRules}
        />
      </div>
      {tab === "control" && (
        <PortfolioControlTab
          clientId={clientId}
          portfolioMonths={portfolioMonths}
          portfolioSubs={portfolioSubs}
          cycleStartDay={cycleStartDay || 1}
          importedTxs={importedTxs || []}
          manualTxs={manualTxs || []}
          rememberedMappings={rememberedMappings || {}}
          onCycleStartDayChange={onCycleStartDayChange}
          ignoredCats={ignoredCats}
          categoryRules={categoryRules}
        />
      )}
      {tab === "savings" && (
        <Card style={{ textAlign:"center", padding:"64px 32px" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🚧</div>
          <div style={{ fontWeight:700, fontSize:18, marginBottom:8 }}>פירוט חסכונות</div>
          <div style={{ color:"var(--text-dim)", fontSize:14 }}>בקרוב</div>
        </Card>
      )}
      {tab === "balance" && (
        <ClientScenarioView clientId={clientId} />
      )}
      {tab === "debts"   && <DebtManager clientId={clientId} />}
      {tab === "tools"   && <GrowthTools />}

      <InsightsPanel
        clientId={clientId}
        clientPlan={clientPlan}
        portfolioSubs={portfolioSubs}
        importedTxs={importedTxs || []}
        manualTxs={manualTxs || []}
        rememberedMappings={rememberedMappings || {}}
        cycleStartDay={cycleStartDay || 1}
        ignoredCats={ignoredCats}
        incomeCats={incomeCats}
        categoryRules={categoryRules}
      />
    </div>
  );
}

// ── Portfolio Upload Tab ──────────────────────────────────────────────────────
function PortfolioUploadTab({ clientId, portfolioMonths, portfolioSubs, onDataChange, onMonthCreated, rememberedMappings, onRememberingAdded, step, setStep, activeEntry, setActiveEntry, entrySubs, setEntrySubs, categories, categoryRows = [], clientCats, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, categoryRules = [] as any[], hiddenCats = [] as string[], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
  const [showPicker, setShowPicker]   = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter]           = useState("all");
  const [search, setSearch]           = useState("");
  const [activeTxId, setActiveTxId]   = useState(null);
  const [catSearch, setCatSearch]     = useState("");
  const [saving, setSaving]           = useState(false);
  const [pendingRemember, setPendingRemember] = useState(null);
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeResults, setAnalyzeResults] = useState<{name:string,count:number,error?:string}[]>([]);
  const [dragOver, setDragOver]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const usedKeys = portfolioMonths.map(e => e.month_key);

  // ── helpers ──
  const loadEntrySubs = async (monthKey) => {
    const { data } = await supabase
      .from("portfolio_submissions")
      .select("*")
      .eq("client_id", clientId)
      .eq("month_key", monthKey)
      .order("created_at", { ascending: true });
    return data || [];
  };

  const openMonth = async (entry) => {
    // Set activeEntry FIRST before changing step
    setActiveEntry(entry);
    const subs = await loadEntrySubs(entry.month_key);
    setEntrySubs(subs);
    // Set step last - by now activeEntry is already set
    setStep("month");
  };

  const onMonthConfirmed = async (key, monthName, year) => {
    setShowPicker(false);
    const label = `${monthName} ${year}`;
    // upsert the month entry
    await supabase.from("portfolio_months")
      .upsert([{ client_id: clientId, month_key: key, label, is_finalized: false }],
              { onConflict: "client_id,month_key" });
    // fetch fresh entry
    const { data: entry } = await supabase.from("portfolio_months")
      .select("*").eq("client_id", clientId).eq("month_key", key).maybeSingle();
    const subs = await loadEntrySubs(key);
    const resolvedEntry = entry || { client_id: clientId, month_key: key, label, is_finalized: false };
    // Update portfolioMonths list locally — no full re-render
    if (onMonthCreated) onMonthCreated(resolvedEntry);
    setActiveEntry(resolvedEntry);
    setEntrySubs(subs);
    setUploadedFiles([]);
    setSourceLabel("");
    setTransactions([]);
    setStep("upload");
  };

  const goToUpload = () => {
    setUploadedFiles([]);
    setSourceLabel("");
    setTransactions([]);
    setStep("upload");
  };

  const NON_PARSEABLE_EXTS = [".pdf", ".png", ".jpg", ".jpeg", ".doc", ".docx"];
  const isNonParseable = (name: string) => NON_PARSEABLE_EXTS.some(ext => name.toLowerCase().endsWith(ext));

  const analyzeFiles = async () => {
    setAnalyzing(true);
    setAnalyzeResults([]);
    const results: {name:string,count:number,error?:string}[] = [];
    let allTx: any[] = [];
    for (const file of uploadedFiles) {
      if (isNonParseable(file.name)) {
        results.push({ name: file.name, count: 0, error: "סוג קובץ זה אינו נתמך לניתוח אוטומטי — יש להמיר ל-Excel או CSV" });
        setAnalyzeResults([...results]);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        const parsed = parseExcelData(buf, file.name, rememberedMappings, categoryRules);
        allTx = allTx.concat(parsed);
        results.push({ name: file.name, count: parsed.length });
      } catch(e: any) {
        results.push({ name: file.name, count: 0, error: e?.message || "שגיאה בניתוח הקובץ" });
      }
      setAnalyzeResults([...results]);
    }
    setAnalyzing(false);
    if (allTx.length > 0) {
      setTransactions(allTx);
      setStep("review");
    }
  };

  const saveSource = async () => {
    setSaving(true);
    await supabase.from("portfolio_submissions").insert([{
      client_id: clientId,
      month_key: activeEntry.month_key,
      label: sourceLabel || activeEntry.label,
      source_label: sourceLabel,
      files: uploadedFiles.map(f => f.name),
      transactions,
      created_at: new Date().toISOString()
    }]);
    // reload fresh
    const subs = await loadEntrySubs(activeEntry.month_key);
    setEntrySubs(subs);
    setSaving(false);
    setUploadedFiles([]); setTransactions([]); setSourceLabel("");
    setStep("month");
    onDataChange(); // fire without await
  };

  const deleteSub = async (subId) => {
    if (!window.confirm("למחוק מקור זה?")) return;
    await supabase.from("portfolio_submissions").delete().eq("id", subId);
    const subs = await loadEntrySubs(activeEntry.month_key);
    setEntrySubs(subs);
    onDataChange(); // fire without await
  };

  const deleteMonth = async (entry, e) => {
    e.stopPropagation();
    if (!window.confirm(`למחוק את ${entry.label} וכל הנתונים שלו?`)) return;
    await supabase.from("portfolio_submissions").delete().eq("client_id", clientId).eq("month_key", entry.month_key);
    await supabase.from("portfolio_months").delete().eq("client_id", clientId).eq("month_key", entry.month_key);
    onDataChange(); // fire without await
  };

  const finalizeMonth = async () => {
    if (!window.confirm(`לסמן את ${activeEntry.label} כהושלם?`)) return;
    await supabase.from("portfolio_months")
      .update({ is_finalized: true })
      .eq("client_id", clientId).eq("month_key", activeEntry.month_key);
    setStep("list");
    onDataChange(); // fire without await
  };

  const reopenMonth = async () => {
    await supabase.from("portfolio_months")
      .update({ is_finalized: false })
      .eq("client_id", clientId).eq("month_key", activeEntry.month_key);
    setActiveEntry(p => ({ ...p, is_finalized: false }));
    onDataChange(); // fire without await
  };

  const filteredTx = transactions.filter(t => {
    if (filter === "low" && t.conf !== "low") return false;
    if (search) { const s = search.toLowerCase(); if (!t.name.toLowerCase().includes(s) && !t.cat.toLowerCase().includes(s)) return false; }
    return true;
  });

  // ══ RENDER ════════════════════════════════════════════════════════════════════
  if (step === "list") return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div style={{ fontWeight:700 }}>חודשים בתיק</div>
        <Btn size="sm" onClick={() => setShowPicker(true)}>+ הוסף חודש</Btn>
      </div>

      {portfolioMonths.length === 0 ? (
        <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
          <div style={{ marginBottom:16 }}>הוסף את החודש הראשון לתיק</div>
          <Btn onClick={() => setShowPicker(true)}>+ הוסף חודש</Btn>
        </Card>
      ) : portfolioMonths.map(entry => {
        const subs = portfolioSubs.filter(s => s.month_key === entry.month_key);
        const allTx = subs.flatMap(s => s.transactions || []);
        const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum,t) => sum+t.amount, 0);
        return (
          <Card key={entry.month_key} style={{ marginBottom:10, border:`1px solid ${entry.is_finalized?"rgba(46,204,138,0.25)":"var(--border)"}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1, cursor:"pointer" }} onClick={() => openMonth(entry)}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontWeight:700 }}>{entry.label}</span>
                  {entry.is_finalized
                    ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"2px 10px", fontSize:11 }}>✓ הושלם</span>
                    : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"2px 10px", fontSize:11 }}>בתהליך</span>
                  }
                </div>
                <div style={{ fontSize:12, color:"var(--text-dim)" }}>{subs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
              </div>
              <button
                onClick={e => deleteMonth(entry, e)}
                style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"4px 12px", fontSize:12, color:"var(--red)", cursor:"pointer", fontFamily:"inherit", flexShrink:0, marginRight:8 }}
              >🗑 מחק</button>
            </div>
          </Card>
        );
      })}
      {showPicker && <MonthPickerModal usedMonths={usedKeys} onConfirm={onMonthConfirmed} onCancel={() => setShowPicker(false)} />}
    </div>
  );

  // ══ MONTH DETAIL ══════════════════════════════════════════════════════════════
  if (step === "month") {
    if (!activeEntry) return <div style={{color:"var(--text-dim)",padding:32,textAlign:"center"}}><Spinner /></div>;
    const allTx = entrySubs.flatMap(s => s.transactions || []);
    const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum,t) => sum+t.amount, 0);
    const catMap: Record<string, number> = {};
    allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat]||0)+t.amount; });

    return (
      <div>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
          <Btn variant="ghost" size="sm" onClick={() => setStep("list")}>← חזור</Btn>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontWeight:700, fontSize:18 }}>{activeEntry.label}</span>
              {activeEntry.is_finalized
                ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"2px 10px", fontSize:12 }}>✓ הושלם</span>
                : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"2px 10px", fontSize:12 }}>בתהליך</span>
              }
            </div>
            <div style={{ fontSize:12, color:"var(--text-dim)" }}>{entrySubs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <Btn size="sm" onClick={goToUpload}>+ הוסף מקור</Btn>
            {!activeEntry.is_finalized && entrySubs.length > 0 && <Btn size="sm" onClick={finalizeMonth}>✅ סיימתי</Btn>}
            {activeEntry.is_finalized && <Btn variant="ghost" size="sm" onClick={reopenMonth}>🔓 פתח לעריכה</Btn>}
          </div>
        </div>

        {entrySubs.length === 0 ? (
          <Card style={{ textAlign:"center", padding:40, color:"var(--text-dim)" }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📂</div>
            <div style={{ marginBottom:16 }}>עוד לא הוספת מקורות לחודש זה</div>
            <Btn onClick={goToUpload}>+ הוסף מקור ראשון</Btn>
          </Card>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:16 }}>
            <Card>
              <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📊 סיכום לפי סעיף</div>
              <div style={{ maxHeight:280, overflowY:"auto" }}>
                {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => (
                  <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${"var(--border)"}22`, fontSize:12 }}>
                    <span>{cat}</span>
                    <span style={{ fontWeight:700, color:"var(--red)" }}>₪{Math.round(amt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📋 מקורות</div>
              {entrySubs.map(sub => (
                <div key={sub.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${"var(--border)"}22` }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{sub.source_label || sub.label}</div>
                    <div style={{ fontSize:11, color:"var(--text-dim)" }}>{(sub.transactions||[]).length} תנועות</div>
                  </div>
                  <button onClick={() => deleteSub(sub.id)} style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"3px 10px", fontSize:11, color:"var(--red)", cursor:"pointer", fontFamily:"inherit" }}>🗑</button>
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    );
  }

  // ══ UPLOAD ════════════════════════════════════════════════════════════════════
  if (step === "upload") {
    if (!activeEntry) { setStep("list"); return null; }
    return (
    <div style={{ maxWidth:580 }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <Btn variant="ghost" size="sm" onClick={() => setStep("month")}>← חזור</Btn>
        <div style={{ fontWeight:700, fontSize:16 }}>הוסף מקור — {activeEntry?.label}</div>
      </div>

      <Card style={{ marginBottom:14 }}>
        <div style={{ fontWeight:700, marginBottom:10, fontSize:13 }}>שם המקור</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
          {["מקס","ישראכרט","ויזה","דיינרס","עו\"ש","אחר"].map(s => (
            <button key={s} onClick={() => setSourceLabel(s)}
              style={{ padding:"5px 12px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                border:`1px solid ${sourceLabel===s?"var(--green-mid)":"var(--border)"}`,
                background:sourceLabel===s?"var(--green-mint)":"var(--surface2)",
                color:sourceLabel===s?"var(--green-mid)":"var(--text-dim)" }}>{s}</button>
          ))}
        </div>
        <Input label="או הכנס ידנית" value={sourceLabel} onChange={e => setSourceLabel(e.target.value)} placeholder="שם המקור" />
      </Card>

      <div
        style={{ textAlign:"center", padding:"24px 20px", marginBottom:14,
          border:`2px dashed ${dragOver ? "var(--green-mid)" : "var(--border)"}`,
          borderRadius:12,
          background: dragOver ? "var(--green-mint)" : "var(--surface)",
          transition:"border-color 0.15s, background 0.15s" }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const files = Array.from(e.dataTransfer.files) as File[]; setUploadedFiles(p => [...p, ...files.filter((f: File) => !p.find((u: File) => u.name===f.name))]); }}
      >
        <div style={{ fontSize:28, marginBottom:8 }}>{dragOver ? "⬇️" : "📎"}</div>
        <div style={{ fontWeight:600, fontSize:13, marginBottom:4 }}>{dragOver ? "שחרר להוספה" : "גרור קבצים לכאן"}</div>
        <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:12 }}>Excel, CSV, PDF, Word, תמונות וכל קובץ פיננסי</div>
        <input ref={fileRef} type="file"
          accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.ods"
          multiple style={{ display:"none" }}
          onChange={e => setUploadedFiles(p => [...p, ...Array.from(e.target.files as FileList).filter((f: File) => !p.find((u: File) => u.name===f.name))])} />
        <Btn size="sm" onClick={() => fileRef.current?.click()}>בחר קבצים</Btn>
      </div>

      {uploadedFiles.length > 0 && (
        <Card style={{ marginBottom:14 }}>
          {uploadedFiles.map((f,i) => {
            const res = analyzeResults.find(r => r.name === f.name);
            return (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:i<uploadedFiles.length-1?`1px solid ${"var(--border)"}22`:"none", fontSize:12 }}>
                <span>📄 {f.name}</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {res && (
                    <span style={{ fontSize:11, color: res.error ? "var(--red)" : res.count === 0 ? "var(--gold)" : "var(--green-soft)" }}>
                      {res.error ? `⚠️ ${res.error}` : res.count === 0 ? "⚠️ לא זוהו תנועות" : `✓ ${res.count} תנועות`}
                    </span>
                  )}
                  {analyzing && !res && <span style={{ fontSize:11, color:"var(--text-dim)" }}>מנתח...</span>}
                  <button onClick={() => setUploadedFiles(p => p.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:16 }}>×</button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {analyzeResults.length > 0 && !analyzing && analyzeResults.every(r => r.count === 0) && (
        <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid var(--gold)", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize:12, color:"var(--gold)" }}>
          ⚠️ לא זוהו תנועות באף קובץ. בדוק שהקבצים הם Excel/CSV עם עמודות תאריך, שם עסק וסכום.
        </div>
      )}

      <Btn onClick={analyzeFiles} disabled={uploadedFiles.length===0||!sourceLabel||analyzing} style={{ width:"100%", justifyContent:"center" }}>
        {analyzing ? "⏳ מנתח..." : "🔍 נתח תנועות ←"}
      </Btn>
    </div>
  );

  }

  // ══ REVIEW ════════════════════════════════════════════════════════════════════
  if (step === "review") return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Btn variant="ghost" size="sm" onClick={() => setStep("upload")}>← חזור</Btn>
          <div style={{ fontWeight:700 }}>✏️ סיווג תנועות — {sourceLabel}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize:12, color:"var(--text-dim)" }}>{transactions.length} תנועות</span>
          <Btn size="sm" onClick={saveSource} disabled={saving}>💾 {saving?"שומר...":"שמור"}</Btn>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        {[["all","הכל"],["low","ביטחון נמוך"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding:"4px 12px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${filter===v?"var(--green-mid)":"var(--border)"}`, background:filter===v?"var(--green-mint)":"transparent", color:filter===v?"var(--green-deep)":"var(--text-mid)" }}>{l}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
          style={{ flex:1, minWidth:120, background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:20, padding:"4px 12px", color:"var(--text)", fontSize:12, fontFamily:"inherit", outline:"none" }} />
      </div>

      <RememberModal
        pendingRemember={pendingRemember}
        onAlways={async () => {
          const oldCat = rememberedMappings[pendingRemember.name] || null;
          await supabase.from("remembered_mappings").upsert(
            [{ client_id: clientId, business_name: pendingRemember.name, category: pendingRemember.cat }],
            { onConflict: "client_id,business_name" }
          );
          await supabase.from("client_change_log").insert([{ client_id: clientId, event_type: "remap_business", details: { business_name: pendingRemember.name, from_cat: oldCat, to_cat: pendingRemember.cat } }]);
          onRememberingAdded?.(pendingRemember.name, pendingRemember.cat);
          setPendingRemember(null);
        }}
        onThisSession={() => {
          const { name, cat } = pendingRemember;
          setTransactions(p => p.map(t => t.name === name ? { ...t, cat, edited: true } : t));
          setPendingRemember(null);
        }}
        onJustHere={() => setPendingRemember(null)}
      />

      {filteredTx.map(tx => {
        const isKnown = !!rememberedMappings[tx.name];
        return (
        <Card key={tx.id} style={{ marginBottom:8, padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontWeight:600, fontSize:14 }}>{tx.name}</span>
                <span style={{ fontSize:10, padding:"2px 6px", borderRadius:10, fontWeight:600,
                  background: isKnown ? "rgba(46,204,138,0.12)" : "rgba(255,183,77,0.12)",
                  color: isKnown ? "var(--green-soft)" : "var(--gold)",
                  border: `1px solid ${isKnown ? "rgba(46,204,138,0.3)" : "rgba(255,183,77,0.3)"}`,
                }}>{isKnown ? "מוכר" : "חדש"}</span>
              </div>
              <div style={{ fontSize:12, color:"var(--text-dim)" }}>{tx.date}</div>
              {tx.note && <div style={{ fontSize:12, color:"var(--text-mid)", marginTop:3, fontStyle:"italic" }}>📝 {tx.note}</div>}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontWeight:700, color:"var(--red)", fontSize:14 }}>₪{tx.amount?.toLocaleString()}</span>
              <button
                onClick={e => { e.stopPropagation(); setActiveTxId(activeTxId===tx.id?null:tx.id); setCatSearch(""); }}
                style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"5px 12px", fontSize:13, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                {tx.cat}
              </button>
              <button
                onClick={e => { e.stopPropagation(); setActiveTxId(activeTxId===`note_${tx.id}`?null:`note_${tx.id}`); }}
                style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize:12, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                title="הוסף הערה">📝</button>
            </div>
          </div>
          {activeTxId === tx.id && (
            <CategoryPicker
              current={tx.cat}
              catSearch={catSearch}
              setCatSearch={setCatSearch}
              categories={categories}
              rows={categoryRows}
              clientCats={clientCats}
              clientId={clientId}
              onCategoryAdded={onCategoryAdded}
              hiddenCats={hiddenCats}
              onHiddenCatsChange={onHiddenCatsChange}
              onSelect={(cat) => {
                const txName = tx.name;
                setTransactions(p => p.map(t =>
                  t.name === txName ? { ...t, cat, edited: true, conf: "high" } : t
                ));
                setActiveTxId(null);
                setCatSearch("");
                setPendingRemember({ name: txName, cat });
              }}
            />
          )}
          {activeTxId === `note_${tx.id}` && (
            <div style={{ marginTop:8 }}>
              <input
                autoFocus
                value={tx.note || ""}
                onChange={e => setTransactions(p => p.map(t => t.id===tx.id?{...t,note:e.target.value}:t))}
                placeholder="הוסף הערה לעסקה זו..."
                style={{ width:"100%", background:"var(--surface2)", border:"1.5px solid var(--green-soft)", borderRadius:8, padding:"7px 12px", color:"var(--text)", fontFamily:"inherit", fontSize:13, outline:"none", boxSizing:"border-box" }}
                onKeyDown={e => { if (e.key==="Enter"||e.key==="Escape") setActiveTxId(null); }}
              />
            </div>
          )}
        </Card>
        );
      })}

      {/* Save button at bottom */}
      <div style={{ position:"sticky", bottom:20, display:"flex", justifyContent:"center", marginTop:16 }}>
        <Btn onClick={saveSource} disabled={saving} style={{ boxShadow:"0 4px 20px rgba(45,106,79,0.3)", padding:"12px 36px", fontSize:15 }}>
          💾 {saving?"שומר...":"שמור את כל הסיווגים"}
        </Btn>
      </div>
    </div>
  );

  return null;
}


// ── Portfolio Control Tab ─────────────────────────────────────────────────────
// ── assignBillingMonth ────────────────────────────────────────────────────────
// date: "DD/MM/YYYY" or "YYYY-MM-DD" → "YYYY-MM" based on cycleStartDay

function PortfolioControlTab({ clientId, portfolioMonths, portfolioSubs, cycleStartDay, importedTxs, manualTxs, rememberedMappings, onCycleStartDayChange, ignoredCats = IGNORED_CATEGORIES, categoryRules = [] as any[] }) {
  const NOW_YEAR  = new Date().getFullYear();
  const NOW_MONTH = new Date().getMonth() + 1; // 1–12
  const NOW_DAY   = new Date().getDate();

  const [editingCycleDay, setEditingCycleDay] = useState(false);
  const [tempDay, setTempDay]                 = useState(String(cycleStartDay));
  const [savingDay, setSavingDay]             = useState(false);

  const saveCycleDay = async () => {
    const d = parseInt(tempDay);
    if (isNaN(d) || d < 1 || d > 28) return;
    setSavingDay(true);
    await supabase.from("clients").update({ cycle_start_day: d }).eq("id", clientId);
    if (onCycleStartDayChange) onCycleStartDayChange(d);
    setSavingDay(false);
    setEditingCycleDay(false);
  };

  const [selectedYear, setSelectedYear]   = useState(NOW_YEAR);
  const [allPeriods, setAllPeriods]       = useState(null);  // null = loading
  const [scenarioItems, setScenarioItems] = useState(null);
  const [scenarioName, setScenarioName]   = useState("");
  const [itemsCache, setItemsCache]       = useState({});    // { scenarioId: items[] }
  const [sortCol, setSortCol]             = useState(null);  // null|"name"|"budget"|"avg"|"rem"|mk
  const [sortDir, setSortDir]             = useState("desc");
  const [collapsed, setCollapsed]         = useState<Record<string, boolean>>({});    // { income|fixed|variable: bool }
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [drillDown, setDrillDown] = useState(null); // { cat, mk } — mk=null means all months

  // Flat list of individual transactions for drill-down
  const allNormTxs = useMemo(() => {
    const result = [];
    portfolioSubs.forEach(sub => {
      const mk = sub.month_key;
      if (!mk) return;
      (sub.transactions || []).forEach(tx => {
        if (ignoredCats.has(tx.cat)) return;
        result.push({ mk, cat: tx.cat || "הוצאות לא מתוכננות", amount: Number(tx.amount || 0), name: tx.name || "", date: tx.date || "", source: sub.source_label || "קובץ" });
      });
    });
    (importedTxs || []).forEach(tx => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month || assignBillingMonth(tx.date, cycleStartDay || 1);
      if (!mk) return;
      const cat = tx.cat || classifyTx(tx.name, tx.max_category, rememberedMappings || {}, categoryRules).cat;
      if (ignoredCats.has(cat)) return;
      result.push({ mk, cat, amount: Number(tx.amount || 0), name: tx.name || "", date: tx.date || "", source: "מקס" });
    });
    (manualTxs || []).forEach(tx => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month;
      if (!mk) return;
      if (ignoredCats.has(tx.cat)) return;
      result.push({ mk, cat: tx.cat, amount: Number(tx.amount || 0), name: tx.name || "", date: tx.date || "", source: tx.payment_method ? `ידני — ${tx.payment_method}` : "ידני" });
    });
    return result;
  }, [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay]);

  const currentYear = selectedYear;

  // currentMonth = billing month elapsed (accounts for cycleStartDay)
  // e.g. March 24 + cycleStartDay=15 → billing month = April = 4
  const currentMonth = (() => {
    if (selectedYear < NOW_YEAR) return 12;
    if (selectedYear > NOW_YEAR) return 0;
    const raw = NOW_DAY >= (cycleStartDay || 1) ? NOW_MONTH + 1 : NOW_MONTH;
    return Math.min(raw, 12);
  })();

  const MONTHS_HE = ["ינ׳","פב׳","מר׳","אפ׳","מי׳","יו׳","יל׳","אוג׳","ספ׳","אוק׳","נו׳","דצ׳"];

  // ── Load all periods once ─────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: per } = await supabase
        .from("active_scenario")
        .select("id, scenario_id, active_from, active_until, scenarios(name)")
        .eq("client_id", clientId)
        .order("active_from", { ascending: false });
      setAllPeriods(per || []);
    })();
  }, [clientId]);

  // ── When year changes or periods load → find & load scenario items ────────
  useEffect(() => {
    if (allPeriods === null) return;
    const period = periodForYear(allPeriods, selectedYear);
    if (!period) { setScenarioItems([]); setScenarioName(""); return; }
    setScenarioName(period.scenarios?.name || "");
    const cached = itemsCache[period.scenario_id];
    if (cached) { setScenarioItems(cached); return; }
    supabase.from("scenario_items").select("*")
      .eq("scenario_id", period.scenario_id).order("sort_order")
      .then(({ data }) => {
        const items = data || [];
        setScenarioItems(items);
        setItemsCache(prev => ({ ...prev, [period.scenario_id]: items }));
      });
  }, [allPeriods, selectedYear]); // eslint-disable-line

  // ── Build txMap: { "YYYY-MM": { categoryName: totalAmount } } ────────────
  const txMap = useMemo(() => {
    const map = {};
    const add = (mk, cat, amt) => {
      if (!mk || !cat || !amt) return;
      if (!map[mk]) map[mk] = {};
      map[mk][cat] = (map[mk][cat] || 0) + amt;
    };
    // From portfolio submissions (already classified)
    portfolioSubs.forEach(sub => {
      const mk = sub.month_key;
      if (!mk || +mk.split('-')[0] !== currentYear) return;
      (sub.transactions || []).forEach(tx => {
        if (ignoredCats.has(tx.cat)) return;
        add(mk, tx.cat || "הוצאות לא מתוכננות", tx.amount || 0);
      });
    });
    // From imported transactions (classify on the fly)
    (importedTxs || []).forEach(tx => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month || assignBillingMonth(tx.date, cycleStartDay || 1);
      if (!mk || +mk.split('-')[0] !== currentYear) return;
      const cat = tx.cat || classifyTx(tx.name, tx.max_category, rememberedMappings || {}, categoryRules).cat;
      if (ignoredCats.has(cat)) return;
      add(mk, cat, tx.amount);
    });
    // From manual transactions
    (manualTxs || []).forEach(tx => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month;
      if (!mk || +mk.split('-')[0] !== currentYear) return;
      if (ignoredCats.has(tx.cat)) return;
      add(mk, tx.cat, tx.amount);
    });
    return map;
  }, [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, currentYear]);

  // Months this year that have any data, up to current month
  const activeMks = useMemo(() =>
    Object.keys(txMap)
      .filter(mk => { const [y, m] = mk.split('-').map(Number); return y === currentYear && m <= currentMonth; })
      .sort()
  , [txMap, currentYear, currentMonth]);

  const numActive = activeMks.length;

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getAct = (cat, mk)      => txMap[mk]?.[cat] || 0;
  const getSum = (cat)          => activeMks.reduce((s, mk) => s + getAct(cat, mk), 0);
  const getAvg = (cat)          => numActive > 0 ? getSum(cat) / numActive : 0;
  // remaining = cumulative budget up to current month − total spent
  const getRem = (cat, bud)     => currentMonth * (bud || 0) - getSum(cat);

  const fmtAmt = (n)            => n ? `₪${Math.round(n).toLocaleString()}` : "";
  const fmtZ   = (n)            => `₪${Math.round(n).toLocaleString()}`;

  const groupSum  = (grp, mk)   => grp.reduce((s, x) => s + getAct(x.category_name, mk), 0);
  const groupTotal= (grp)       => grp.reduce((s, x) => s + getSum(x.category_name), 0);
  const groupBud  = (grp)       => grp.reduce((s, x) => s + (x.amount || 0), 0);
  const groupAvg  = (grp)       => grp.reduce((s, x) => s + getAvg(x.category_name), 0);
  const groupRem  = (grp)       => grp.reduce((s, x) => s + getRem(x.category_name, x.amount || 0), 0);


  const avgOverBudget = (avg, bud) => bud > 0 && avg > bud + Math.max(bud * 0.01, 50);

  const sortItems = (items) => {
    if (!sortCol) return items;
    return [...items].sort((a, b) => {
      if (sortCol === "name") return sortDir === "asc"
        ? a.category_name.localeCompare(b.category_name, "he")
        : b.category_name.localeCompare(a.category_name, "he");
      let va, vb;
      if (sortCol === "budget")   { va = a.amount||0; vb = b.amount||0; }
      else if (sortCol === "avg") { va = getAvg(a.category_name); vb = getAvg(b.category_name); }
      else if (sortCol === "rem") { va = getRem(a.category_name, a.amount||0); vb = getRem(b.category_name, b.amount||0); }
      else { va = getAct(a.category_name, sortCol); vb = getAct(b.category_name, sortCol); }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const sortIcon = (col) => sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // ── Loading / empty states ────────────────────────────────────────────────
  if (allPeriods === null || scenarioItems === null)
    return <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>טוען...</div>;

  const noScenarioForYear = scenarioItems.length === 0;

  // ── קטגוריות עם הוצאות שאינן בתסריט ────────────────────────────────────
  const scenarioCatSet = new Set(scenarioItems.map(x => x.category_name));
  const missingCats: { cat: string; total: number }[] = (() => {
    const allCatsInTxs = new Set<string>();
    Object.values(txMap).forEach(monthData => {
      Object.keys(monthData as Record<string, number>).forEach(cat => allCatsInTxs.add(cat));
    });
    const result: { cat: string; total: number }[] = [];
    allCatsInTxs.forEach(cat => {
      if (!scenarioCatSet.has(cat)) {
        const total = getSum(cat);
        if (total > 0) result.push({ cat, total });
      }
    });
    return result.sort((a, b) => b.total - a.total);
  })();

  const income   = scenarioItems.filter(x => x.item_type === "income");
  const fixed    = scenarioItems.filter(x => x.item_type === "expense_fixed");
  const variable = scenarioItems.filter(x => x.item_type === "expense_variable");
  const allExp   = [...fixed, ...variable];

  // If "הכנסות מזדמנות" is not in the scenario but has manual transactions, add a synthetic row
  const incomeDisplay = income.some(x => x.category_name === "הכנסות מזדמנות") || getSum("הכנסות מזדמנות") === 0
    ? income
    : [...income, { id: "__occasional__", category_name: "הכנסות מזדמנות", amount: 0, item_type: "income" }];

  // ── Visible month columns ─────────────────────────────────────────────────
  const maxVisibleMonth = showAllMonths ? 12 : Math.min(currentMonth + 1, 12);
  const displayMonths   = Array.from({ length: maxVisibleMonth }, (_, i) => i + 1);
  const numCols         = 2 + displayMonths.length + 2;

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: "7px 8px", textAlign: "center", fontWeight: 700,
    borderBottom: "2px solid var(--border)", borderLeft: "1px solid var(--border)88",
    whiteSpace: "nowrap", background: "var(--surface2)", color: "var(--text-mid)", fontSize: 11,
    cursor: "pointer", userSelect: "none",
    position: "sticky", top: 0, zIndex: 2,
  };
  const TD: React.CSSProperties = {
    padding: "5px 8px", textAlign: "center",
    borderBottom: "1px solid var(--border)66", borderLeft: "1px solid var(--border)66",
    fontSize: 12, color: "var(--text)",
  };
  const TDL: React.CSSProperties = {
    ...TD, textAlign: "right", paddingRight: 14, fontWeight: 500,
    position: "sticky", right: 0, zIndex: 1, background: "var(--surface)",
  };
  const THL: React.CSSProperties = {
    ...TH, textAlign: "right", minWidth: 140,
    position: "sticky", right: 0, top: 0, zIndex: 4,
  };
  const activeMkSet = new Set(activeMks);
  const remColor = (v) => v >= 0 ? "var(--green-soft)" : "var(--red)";

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderSectionHeader = (label, key, bg) => (
    <tr onClick={() => setCollapsed(p => ({ ...p, [key]: !p[key] }))} style={{ cursor: "pointer" }}>
      <td colSpan={numCols} style={{
        padding: "7px 14px", fontWeight: 700, fontSize: 12,
        background: bg, color: "var(--text)",
        borderBottom: "1px solid var(--border)", borderTop: "2px solid var(--border)",
      }}>
        {collapsed[key] ? "▶" : "▼"} {label}
      </td>
    </tr>
  );

  const renderItemRow = (item, isIncome = false, idx = 0) => {
    const bud = item.amount || 0;
    const avg = getAvg(item.category_name);
    const sum = getSum(item.category_name);
    const rem = getRem(item.category_name, bud);
    const hasActivity = sum > 0 || bud > 0;
    const stripe = idx % 2 === 1 ? "rgba(0,0,0,0.018)" : undefined;
    const avgColor = !isIncome && numActive > 0 && bud > 0
      ? avgOverBudget(avg, bud) ? "var(--red)" : "var(--green-soft)"
      : "var(--text-mid)";
    const avgBold = !isIncome && numActive > 0 && bud > 0 && avgOverBudget(avg, bud);
    return (
      <tr key={item.id} style={{ background: stripe || "var(--surface)" }}>
        <td style={{ ...TDL, background: stripe || "var(--surface)", cursor:"pointer", textDecoration:"underline dotted" }}
          onClick={() => setDrillDown({ cat: item.category_name, mk: null })}
          title="לחץ לפירוט תנועות">
          {item.category_name}
        </td>
        <td style={{ ...TD, color: "var(--text-dim)" }}>{bud ? fmtZ(bud) : ""}</td>
        {displayMonths.map(m => {
          const mk  = `${currentYear}-${String(m).padStart(2, '0')}`;
          const val = getAct(item.category_name, mk);
          const isCur = m === currentMonth;
          const over  = !isIncome && bud > 0 && val > bud * 1.15;
          const inActive = activeMkSet.has(mk);
          return (
            <td key={m} style={{
              ...TD,
              background: isCur ? "rgba(79,142,247,0.06)" : undefined,
              color: over ? "var(--red)" : val === 0 && inActive ? "var(--text-dim)" : undefined,
              fontWeight: over ? 700 : undefined,
              ...(val > 0 ? { cursor: "pointer" } : {}),
            }}
              onClick={val > 0 ? () => setDrillDown({ cat: item.category_name, mk }) : undefined}
              title={val > 0 ? `פירוט ${item.category_name} — ${MONTHS_HE[m-1]}` : undefined}>
              {val > 0 ? fmtAmt(val) : inActive ? "₪0" : ""}
            </td>
          );
        })}
        <td style={{ ...TD, color: avgColor, fontWeight: avgBold ? 700 : undefined }}>
          {numActive > 0 ? fmtZ(avg) : ""}
        </td>
        <td style={{ ...TD, fontWeight: 700, color: !isIncome && hasActivity ? remColor(rem) : "var(--text-dim)" }}>
          {!isIncome && hasActivity ? fmtZ(rem) : ""}
        </td>
      </tr>
    );
  };

  const renderTotalRow = (label, grp, bold = false, isIncome = false) => {
    const bud = groupBud(grp);
    const rem = groupRem(grp);
    return (
      <tr style={{ background: "var(--surface2)", fontWeight: bold ? 800 : 700 }}>
        <td style={{ ...TDL, fontWeight: bold ? 800 : 700, background: "var(--surface2)" }}>{label}</td>
        <td style={TD}>{fmtZ(bud)}</td>
        {displayMonths.map(m => {
          const mk  = `${currentYear}-${String(m).padStart(2, '0')}`;
          const tot = groupSum(grp, mk);
          return (
            <td key={m} style={{ ...TD, background: m === currentMonth ? "rgba(79,142,247,0.09)" : undefined }}>
              {fmtAmt(tot)}
            </td>
          );
        })}
        <td style={TD}>{numActive > 0 ? fmtZ(groupAvg(grp)) : ""}</td>
        <td style={{ ...TD, fontWeight: 700, color: isIncome ? "var(--text-dim)" : remColor(rem) }}>
          {isIncome ? "" : fmtZ(rem)}
        </td>
      </tr>
    );
  };

  return (
    <>
    {/* ── פאנל: קטגוריות לא מתוכננות ── */}
    {missingCats.length > 0 && (
      <div style={{
        position: "fixed", left: 16, top: "50%", transform: "translateY(-50%)",
        width: 220, zIndex: 500,
        background: "var(--surface)", border: "1px solid var(--red)55",
        borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
        overflow: "hidden",
      }}>
        <div style={{
          background: "rgba(247,92,92,0.12)", padding: "10px 14px",
          borderBottom: "1px solid var(--red)33",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: 15 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>קטגוריות לא בתסריט</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 1 }}>יש הוצאות ללא תכנון</div>
          </div>
        </div>
        <div style={{ maxHeight: 280, overflowY: "auto", padding: "8px 0" }}>
          {missingCats.map(({ cat, total }) => (
            <div key={cat} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 14px", borderBottom: "1px solid var(--border)44", fontSize: 12,
            }}>
              <span style={{ color: "var(--text)", flex: 1, marginLeft: 8 }}>{cat}</span>
              <span style={{ fontWeight: 700, color: "var(--red)", whiteSpace: "nowrap" }}>
                ₪{Math.round(total).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 14px", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid var(--border)44", textAlign: "center" }}>
          עבור למאזן מתוכנן להוסיף
        </div>
      </div>
    )}

    <div>
      {/* ── יום תחילת המחזור החודשי ── */}
      <Card style={{ marginBottom:16, padding:"12px 18px", background:"var(--surface2)", border:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, color:"var(--text-mid)" }}>יום תחילת המחזור החודשי:</span>
          {editingCycleDay ? (
            <>
              <input type="number" min="1" max="28" value={tempDay}
                onChange={e => setTempDay(e.target.value)}
                style={{ width:60, padding:"5px 10px", borderRadius:8, border:"1.5px solid var(--green-mid)", fontSize:14,
                  fontFamily:"inherit", background:"var(--surface)", color:"var(--text)", textAlign:"center" }} />
              <button onClick={saveCycleDay} disabled={savingDay}
                style={{ padding:"5px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  background:"var(--green-mid)", color:"#fff", border:"none", fontWeight:700 }}>
                {savingDay ? "שומר..." : "שמור"}
              </button>
              <button onClick={() => { setEditingCycleDay(false); setTempDay(String(cycleStartDay)); }}
                style={{ padding:"5px 12px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  background:"transparent", color:"var(--text-dim)", border:"1px solid var(--border)" }}>
                ביטול
              </button>
            </>
          ) : (
            <>
              <span style={{ fontWeight:700, fontSize:15, color:"var(--green-deep)" }}>{cycleStartDay}</span>
              <button onClick={() => { setEditingCycleDay(true); setTempDay(String(cycleStartDay)); }}
                style={{ padding:"4px 12px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                  background:"transparent", color:"var(--text-dim)", border:"1px solid var(--border)" }}>
                ✏️ שנה
              </button>
              <span style={{ fontSize:12, color:"var(--text-dim)" }}>(שינוי ישפיע על החלוקה מעכשיו ואילך)</span>
            </>
          )}
        </div>
      </Card>

      {/* ── כותרת: ניווט שנה + תסריט ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setSelectedYear(y => y - 1)}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-mid)", fontSize: 16, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
            ‹
          </button>
          <div style={{ minWidth: 68, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{selectedYear}</div>
          <button onClick={() => setSelectedYear(y => Math.min(y + 1, NOW_YEAR))}
            disabled={selectedYear >= NOW_YEAR}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: selectedYear >= NOW_YEAR ? "var(--text-dim)" : "var(--text-mid)", fontSize: 16, cursor: selectedYear >= NOW_YEAR ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1, opacity: selectedYear >= NOW_YEAR ? 0.4 : 1 }}>
            ›
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {scenarioName ? (
            <div style={{ padding: "5px 12px", background: "var(--green-pale)", borderRadius: 8, border: "1px solid var(--green-mint)", fontSize: 12, color: "var(--green-deep)" }}>
              תסריט: <strong>{scenarioName}</strong>
              {numActive > 0 && <span style={{ color: "var(--text-dim)", marginRight: 8 }}>· {numActive} חודשים עם נתונים</span>}
            </div>
          ) : (
            <div style={{ padding: "5px 12px", background: "rgba(251,191,36,0.1)", borderRadius: 8, border: "1px solid rgba(251,191,36,0.4)", fontSize: 12, color: "var(--gold)", display: "flex", alignItems: "center", gap: 8 }}>
              ⚠️ לא נבחר תסריט לשנה זו
              <button onClick={() => { /* navigate to scenario tab */ const el = document.querySelector('[data-tab="scenarios"]') as HTMLElement; el?.click(); }}
                style={{ padding: "2px 10px", borderRadius: 6, border: "1px solid rgba(251,191,36,0.5)", background: "rgba(251,191,36,0.15)", color: "var(--gold)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                בחר תסריט
              </button>
            </div>
          )}
          {(cycleStartDay || 1) > 1 && (
            <div style={{ padding: "5px 12px", background: "var(--surface2)", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, color: "var(--text-dim)" }}>
              מחזור מה-<strong>{cycleStartDay}</strong> לחודש · נותר מצטבר מחושב לפי {currentMonth} חודשים
            </div>
          )}
          <button onClick={() => setShowAllMonths(v => !v)}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-mid)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            {showAllMonths ? "‹ צמצם" : "הצג כל השנה ›"}
          </button>
        </div>
      </div>

      {noScenarioForYear && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", borderRadius: 8, border: "1px solid var(--red)33", fontSize: 13, color: "var(--red)" }}>
          לא הוגדר תסריט לשנת {selectedYear} — עבור ל"מאזן מתוכנן" והוסף תקופה
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12, direction: "rtl" }}>
          <thead>
            <tr>
              <th style={{ ...THL, cursor: "pointer" }} onClick={() => handleSort("name")}>
                סעיף{sortIcon("name")}
              </th>
              <th style={{ ...TH, minWidth: 70 }} onClick={() => handleSort("budget")}>
                תקציב{sortIcon("budget")}
              </th>
              {displayMonths.map(m => {
                const mk = `${currentYear}-${String(m).padStart(2, '0')}`;
                return (
                  <th key={m} style={{
                    ...TH, minWidth: 50,
                    color:      m === currentMonth ? "var(--green-deep)"     : undefined,
                    background: m === currentMonth ? "rgba(79,142,247,0.14)" : undefined,
                  }} onClick={() => handleSort(mk)}>
                    {MONTHS_HE[m - 1]}{sortIcon(mk)}
                  </th>
                );
              })}
              <th style={{ ...TH, minWidth: 72 }} onClick={() => handleSort("avg")}>
                ממוצע{sortIcon("avg")}
              </th>
              <th style={{ ...TH, minWidth: 88, color: "var(--green-deep)" }} onClick={() => handleSort("rem")}>
                נותר מצטבר{sortIcon("rem")}
              </th>
            </tr>
          </thead>
          <tbody>
            {renderSectionHeader("📈 הכנסות", "income", "rgba(52,211,153,0.10)")}
            {!collapsed.income && sortItems(incomeDisplay).map((item, idx) => renderItemRow(item, true, idx))}
            {renderTotalRow('סה"כ הכנסות', incomeDisplay, false, true)}

            {renderSectionHeader("🏠 הוצאות קבועות", "fixed", "rgba(79,142,247,0.10)")}
            {!collapsed.fixed && sortItems(fixed).map((item, idx) => renderItemRow(item, false, idx))}
            {renderTotalRow('סה"כ הוצאות קבועות', fixed)}

            {renderSectionHeader("🛒 הוצאות משתנות", "variable", "rgba(251,191,36,0.10)")}
            {!collapsed.variable && sortItems(variable).map((item, idx) => renderItemRow(item, false, idx))}
            {renderTotalRow('סה"כ הוצאות משתנות', variable)}

            <tr style={{ height: 6 }}><td colSpan={numCols} style={{ background: "var(--bg)" }} /></tr>
            {renderTotalRow('סה"כ הכנסות', incomeDisplay, true, true)}
            {renderTotalRow('סה"כ הוצאות', allExp, true)}

            {/* פער */}
            {(() => {
              const gap    = groupBud(incomeDisplay) - groupBud(allExp);
              const gapRem = groupRem(incomeDisplay) - groupRem(allExp);
              return (
                <tr style={{ background: gap >= 0 ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)", fontWeight: 800, borderTop: "2px solid var(--border)" }}>
                  <td style={{ ...TDL, fontWeight: 800, background: gap >= 0 ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)" }}>פער (הכנסות − הוצאות)</td>
                  <td style={{ ...TD, color: gap >= 0 ? "var(--green-deep)" : "var(--red)" }}>{fmtZ(gap)}</td>
                  {displayMonths.map(m => {
                    const mk   = `${currentYear}-${String(m).padStart(2, '0')}`;
                    const inc  = groupSum(incomeDisplay, mk);
                    const exp  = groupSum(allExp, mk);
                    const diff = inc - exp;
                    return (
                      <td key={m} style={{ ...TD, background: m === currentMonth ? "rgba(79,142,247,0.09)" : undefined, color: (inc || exp) ? (diff >= 0 ? "var(--green-deep)" : "var(--red)") : undefined }}>
                        {(inc || exp) ? fmtZ(diff) : ""}
                      </td>
                    );
                  })}
                  <td style={{ ...TD, color: (groupAvg(incomeDisplay) - groupAvg(allExp)) >= 0 ? "var(--green-deep)" : "var(--red)" }}>
                    {numActive > 0 ? fmtZ(groupAvg(incomeDisplay) - groupAvg(allExp)) : ""}
                  </td>
                  <td style={{ ...TD, fontWeight: 800, color: remColor(gapRem) }}>{fmtZ(gapRem)}</td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>

    {/* Drill-down modal */}
    {drillDown && (() => {
      const filtered = allNormTxs.filter(tx =>
        tx.cat === drillDown.cat && (!drillDown.mk || tx.mk === drillDown.mk)
      ).sort((a, b) => (a.mk || "").localeCompare(b.mk || ""));
      const total = filtered.reduce((s, t) => s + t.amount, 0);
      const [, ddM] = (drillDown.mk || "").split('-').map(Number);
      const title = drillDown.cat + (drillDown.mk ? ` — ${HEBREW_MONTHS[ddM - 1]}` : "");
      return (
        <>
          <div onClick={() => setDrillDown(null)}
            style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9000 }} />
          <div style={{
            position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16,
            padding:"24px", zIndex:9001, width:"min(560px,95vw)",
            maxHeight:"80vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.5)",
            direction:"rtl",
          }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>📋 {title}</div>
              <button onClick={() => setDrillDown(null)}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 16px", fontSize:13, cursor:"pointer", fontFamily:"inherit", fontWeight:700, color:"var(--text)" }}>
                ← חזור
              </button>
            </div>
            {filtered.length === 0 ? (
              <div style={{ color:"var(--text-dim)", fontSize:13, padding:"20px 0" }}>אין תנועות</div>
            ) : (
              <div style={{ overflowY:"auto", flex:1 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead style={{ position:"sticky", top:0, background:"var(--surface2)" }}>
                    <tr>
                      {["חודש","פירוט","מקור","סכום"].map(h => (
                        <th key={h} style={{ padding:"8px 10px", textAlign:"right", fontWeight:600, color:"var(--text-dim)", borderBottom:"1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((tx, i) => {
                      const [y, m] = (tx.mk || "").split('-').map(Number);
                      return (
                        <tr key={i} style={{ borderBottom:"1px solid var(--border)44", background: i%2===0?"transparent":"rgba(0,0,0,0.02)" }}>
                          <td style={{ padding:"8px 10px", whiteSpace:"nowrap", color:"var(--text-dim)", fontSize:12 }}>{HEBREW_MONTHS[m-1]} {y}</td>
                          <td style={{ padding:"8px 10px" }}>{tx.name}</td>
                          <td style={{ padding:"8px 10px", fontSize:11, color:"var(--text-dim)" }}>{tx.source}</td>
                          <td style={{ padding:"8px 10px", fontWeight:700, color:"var(--green-soft)", textAlign:"left", whiteSpace:"nowrap" }}>₪{tx.amount.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:"var(--surface2)", borderTop:"2px solid var(--border)" }}>
                      <td colSpan={3} style={{ padding:"8px 10px", fontWeight:700 }}>סה"כ</td>
                      <td style={{ padding:"8px 10px", fontWeight:800, color:"var(--green-soft)", textAlign:"left" }}>₪{total.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      );
    })()}
    </>
  );
}


// ── Remember Modal ────────────────────────────────────────────────────────────
function RememberModal({ pendingRemember, onAlways, onThisSession, onJustHere }) {
  if (!pendingRemember) return null;
  const btnBase: React.CSSProperties = {
    display:"block", width:"100%", borderRadius:10, padding:"11px 16px", fontSize:14,
    cursor:"pointer", fontFamily:"inherit", textAlign:"right", border:"1px solid var(--border)",
    background:"var(--surface2)", color:"var(--text)", transition:"background 0.1s",
  };
  return (
    <>
      <div onClick={onJustHere} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:"24px 28px", zIndex:9001, width:"min(400px,90vw)", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🧠</div>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>לשנות את הסיווג של</div>
          <div style={{ fontSize:15, color:"var(--text-dim)", lineHeight:1.5 }}>
            <strong style={{ color:"var(--text)" }}>"{pendingRemember.name}"</strong>
            {" "}→{" "}<strong style={{ color:"var(--green-mid)" }}>{pendingRemember.cat}</strong>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={onAlways} style={{ ...btnBase, borderColor:"var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", fontWeight:700 }}>
            🔄 שנה תמיד לעסק זה
            <div style={{ fontSize:11, color:"var(--green-deep)", opacity:0.7, fontWeight:400, marginTop:2 }}>ישמר לתמיד — יחול גם על תנועות עתידיות</div>
          </button>
          <button onClick={onThisSession} style={btnBase}>
            📋 שנה לכל התנועות בהעלאה הנוכחית
            <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2 }}>עדכן את כל "{pendingRemember.name}" בסיווג הנוכחי בלבד</div>
          </button>
          <button onClick={onJustHere} style={{ ...btnBase, color:"var(--text-dim)" }}>
            ✎ שנה כאן בלבד
            <div style={{ fontSize:11, color:"var(--text-dim)", marginTop:2 }}>רק תנועה זו — בלי לשנות שאר התנועות</div>
          </button>
        </div>
      </div>
    </>
  );
}


// ════════════════════════════════════════════════════════════════
// normalizeAllTxs — ממזג תנועות משני מקורות לפורמט אחיד
// ════════════════════════════════════════════════════════════════
function normalizeAllTxs(portfolioSubs, importedTxs, rememberedMappings, cycleStartDay, manualTxs = [], categoryRules: any[] = []) {
  const result = [];
  portfolioSubs.forEach(sub => {
    (sub.transactions || []).forEach((tx, idx) => {
      const billing = sub.month_key || tx.billing_month || assignBillingMonth(tx.date, cycleStartDay);
      result.push({
        _uid: `sub-${sub.id}-${idx}`,
        date: tx.date || "",
        name: tx.name || "",
        cat: tx.cat || classifyTx(tx.name || "", tx.max_category || "", rememberedMappings, categoryRules).cat,
        amount: Number(tx.amount || 0),
        billing_month: billing,
        source: "file",
        source_label: sub.source_label || sub.label || "קובץ",
        conf: tx.conf || "med",
        edited: tx.edited || false,
        _submissionId: sub.id,
        _txIndex: idx,
        _dbId: null,
      });
    });
  });
  importedTxs.forEach(tx => {
    result.push({
      _uid: `imp-${tx.id}`,
      date: tx.date || "",
      name: tx.name || "",
      cat: classifyImported(tx, rememberedMappings, categoryRules),
      amount: Number(tx.amount || 0),
      billing_month: tx.billing_month || assignBillingMonth(tx.date, cycleStartDay),
      source: "ext",
      source_label: tx.provider || "מקס",
      conf: "high",
      edited: false,
      _submissionId: null,
      _txIndex: null,
      _dbId: tx.id,
    });
  });
  manualTxs.forEach(tx => {
    result.push({
      _uid: `man-${tx.id}`,
      date: tx.date || "",
      name: tx.name || "",
      cat: tx.cat,
      amount: Number(tx.amount || 0),
      billing_month: tx.billing_month,
      source: "manual",
      source_label: tx.payment_method ? `ידני — ${tx.payment_method}` : "ידני",
      conf: tx.conf || "high",
      edited: false,
      type: tx.type,
      _submissionId: null,
      _txIndex: null,
      _dbId: tx.id,
    });
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
// AllTransactionsTab — כל התנועות (Extension + קבצים)
// ════════════════════════════════════════════════════════════════
function AllTransactionsTab({ clientId, importedTxs, portfolioSubs, manualTxs, rememberedMappings, onDataChange,
  onManualTxAdded, onManualTxDeleted,
  cycleStartDay, onCycleStartDayChange, onUpdatePortfolioTxCat, onDeletePortfolioSub, onNavigateToUpload,
  categories, categoryRows = [], clientCats, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, categoryRules = [] as any[], hiddenCats = [] as string[], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
  // ── Derived transaction list (useMemo keeps it in sync with props automatically) ──
  const [localEdits, setLocalEdits] = useState<Map<string, string>>(new Map());
  const [deletedUids, setDeletedUids] = useState<Set<string>>(new Set());
  const allTxs = useMemo(() => {
    const fresh = normalizeAllTxs(portfolioSubs, importedTxs, rememberedMappings, cycleStartDay, manualTxs, categoryRules);
    return fresh
      .filter(t => !deletedUids.has(t._uid))
      .map(t => localEdits.has(t._uid) ? { ...t, cat: localEdits.get(t._uid)!, edited: true } : t);
  }, [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, localEdits, deletedUids]);

  const [activeTxUid, setActiveTxUid] = useState(null);
  const [catSearch, setCatSearch] = useState("");
  const [pendingRemember, setPendingRemember] = useState(null);
  const [filterSource, setFilterSource] = useState("all"); // "all" | "file" | "ext" | "manual"
  const [filterProvider, setFilterProvider] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [sortConfig, setSortConfig] = useState<{field: "date"|"amount"|"cat", dir: "asc"|"desc"}>({ field: "date", dir: "desc" });
  const [openMonthKeys, setOpenMonthKeys] = useState<Set<string>>(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return new Set([key]);
  });
  const [deletingTxUid, setDeletingTxUid] = useState(null);
  const [deletingCycleKey, setDeletingCycleKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [ignoredOpen, setIgnoredOpen] = useState({});
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const toggleSelectTx = (uid: string) => setSelectedUids(prev => { const next = new Set(prev); next.has(uid) ? next.delete(uid) : next.add(uid); return next; });
  const toggleSelectMonth = (monthTxs: any[]) => {
    const monthUids = monthTxs.map(t => t._uid);
    const allSelected = monthUids.every(uid => selectedUids.has(uid));
    setSelectedUids(prev => { const next = new Set(prev); allSelected ? monthUids.forEach(uid => next.delete(uid)) : monthUids.forEach(uid => next.add(uid)); return next; });
  };
  const deleteMonth = async (monthTxs: any[]) => {
    if (!window.confirm(`למחוק את כל ${monthTxs.length} התנועות של חודש זה?`)) return;
    const extIds = monthTxs.filter(t => t.source === "ext").map(t => t._dbId).filter(Boolean);
    const manIds = monthTxs.filter(t => t.source === "manual").map(t => t._dbId).filter(Boolean);
    if (extIds.length > 0) await supabase.from("imported_transactions").delete().in("id", extIds).eq("client_id", clientId);
    if (manIds.length > 0) { await supabase.from("manual_transactions").delete().in("id", manIds).eq("client_id", clientId); manIds.forEach(id => onManualTxDeleted && onManualTxDeleted(id)); }
    const fileTxs = monthTxs.filter(t => t.source === "file");
    if (fileTxs.length > 0) {
      const bySubmission: Record<string, number[]> = {};
      fileTxs.forEach(t => { if (!bySubmission[t._submissionId]) bySubmission[t._submissionId] = []; bySubmission[t._submissionId].push(t._txIndex); });
      for (const [subId, indices] of Object.entries(bySubmission)) {
        const sub = portfolioSubs.find((s: any) => String(s.id) === String(subId));
        if (!sub) continue;
        const idxSet = new Set(indices);
        const newTxs = (sub.transactions || []).filter((_: any, i: number) => !idxSet.has(i));
        await supabase.from("portfolio_submissions").update({ transactions: newTxs }).eq("id", sub.id);
      }
    }
    const uids = new Set(monthTxs.map(t => t._uid));
    setDeletedUids(prev => { const next = new Set(prev); uids.forEach(uid => next.add(uid)); return next; });
    setSelectedUids(prev => { const next = new Set(prev); uids.forEach(uid => next.delete(uid)); return next; });
    onDataChange();
  };
  const deleteSelected = async () => {
    if (!window.confirm(`מחק ${selectedUids.size} תנועות נבחרות?`)) return;
    const toDelete = allTxs.filter(t => selectedUids.has(t._uid));
    const extIds = toDelete.filter(t => t.source === "ext").map(t => t._dbId).filter(Boolean);
    const manIds = toDelete.filter(t => t.source === "manual").map(t => t._dbId).filter(Boolean);
    if (extIds.length > 0) await supabase.from("imported_transactions").delete().in("id", extIds).eq("client_id", clientId);
    if (manIds.length > 0) { await supabase.from("manual_transactions").delete().in("id", manIds).eq("client_id", clientId); manIds.forEach(id => onManualTxDeleted && onManualTxDeleted(id)); }
    // file txs — group by submission and patch the transactions JSON
    const fileTxs = toDelete.filter(t => t.source === "file");
    if (fileTxs.length > 0) {
      const bySubmission: Record<string, number[]> = {};
      fileTxs.forEach(t => { if (!bySubmission[t._submissionId]) bySubmission[t._submissionId] = []; bySubmission[t._submissionId].push(t._txIndex); });
      for (const [subId, indices] of Object.entries(bySubmission)) {
        const sub = portfolioSubs.find((s: any) => String(s.id) === String(subId));
        if (!sub) continue;
        const idxSet = new Set(indices);
        const newTxs = (sub.transactions || []).filter((_: any, i: number) => !idxSet.has(i));
        await supabase.from("portfolio_submissions").update({ transactions: newTxs }).eq("id", sub.id);
      }
    }
    setDeletedUids(prev => { const next = new Set(prev); selectedUids.forEach(uid => next.add(uid)); return next; });
    setSelectedUids(new Set());
    onDataChange();
  };
  // addingTx: { [billing_month]: null | "menu" | "income" | "expense-choice" | "expense-cash" | "expense-other" }
  const [addingTx, setAddingTx] = useState({});
  // addForm: per-month form fields
  const [addForm, setAddForm] = useState({});

  const setMonthAddMode = (month, mode) => setAddingTx(p => ({ ...p, [month]: mode }));
  const updateForm = (month, field, val) => setAddForm(p => ({ ...p, [month]: { ...(p[month] || {}), [field]: val } }));
  const resetAdd = (month) => { setAddingTx(p => ({ ...p, [month]: null })); setAddForm(p => ({ ...p, [month]: {} })); };

  // ── שמירת תנועה ידנית ────────────────────────────────────────────────────────
  const saveManualTx = async (billing_month, type) => {
    const form = addForm[billing_month] || {};
    const name = (form.name || "").trim();
    const amount = Number(form.amount);
    const cat = form.cat || (type === "income" ? "הכנסות מזדמנות" : "");
    if (!name || !amount || !cat) return;

    const row = {
      client_id: clientId,
      billing_month,
      name,
      amount,
      cat,
      type,
      payment_method: type === "expense" ? (form.payment_method || "מזומן") : null,
      date: form.date || null,
    };
    const { data, error } = await supabase.from("manual_transactions").insert([row]).select().single();
    if (error) { console.error(error); return; }
    await supabase.from("client_change_log").insert([{ client_id: clientId, event_type: "manual_entry", details: { category_name: data.cat, amount: data.amount, description: data.name } }]);
    // useMemo will pick up the new tx once onManualTxAdded updates the parent's manualTxs prop
    if (onManualTxAdded) onManualTxAdded(data);
    resetAdd(billing_month);
  };

  // ── מחיקת תנועה ידנית ────────────────────────────────────────────────────────
  const deleteManualTx = async (uid, dbId) => {
    setDeletingTxUid(uid);
    await supabase.from("manual_transactions").delete().eq("id", dbId).eq("client_id", clientId);
    setDeletedUids(prev => { const next = new Set(prev); next.add(uid); return next; });
    if (onManualTxDeleted) onManualTxDeleted(dbId);
    setDeletingTxUid(null);
    setConfirmDelete(null);
  };

  const toggleMonth = (key) => setOpenMonthKeys(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // ── מחיקת תנועה בודדת (imported בלבד) ──────────────────────────────────────
  const deleteTx = async (uid, dbId) => {
    setDeletingTxUid(uid);
    await supabase.from("imported_transactions").delete().eq("id", dbId).eq("client_id", clientId);
    setDeletedUids(prev => { const next = new Set(prev); next.add(uid); return next; });
    setDeletingTxUid(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת submission שלם (portfolio) ────────────────────────────────────────
  const deleteSubmission = async (submissionId) => {
    setDeletingCycleKey(`sub-${submissionId}`);
    const uidsToRemove = allTxs.filter(t => t._submissionId === submissionId).map(t => t._uid);
    await onDeletePortfolioSub(submissionId);
    setDeletedUids(prev => { const next = new Set(prev); uidsToRemove.forEach(uid => next.add(uid)); return next; });
    setDeletingCycleKey(null);
    setConfirmDelete(null);
  };

  // ── מחיקת כל התנועות המיובאות ────────────────────────────────────────────────
  const deleteAllImported = async () => {
    setDeletingCycleKey("all-imported");
    const uidsToRemove = allTxs.filter(t => t.source === "ext").map(t => t._uid);
    await supabase.from("imported_transactions").delete().eq("client_id", clientId);
    setDeletedUids(prev => { const next = new Set(prev); uidsToRemove.forEach(uid => next.add(uid)); return next; });
    setDeletingCycleKey(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת חודש שלם (imported בלבד) ─────────────────────────────────────────
  const deleteCycle = async (cycleKey) => {
    setDeletingCycleKey(cycleKey);
    const toDelete = allTxs.filter(t => t.billing_month === cycleKey && t.source === "ext");
    const ids = toDelete.map(t => t._dbId).filter(Boolean);
    if (ids.length > 0) {
      await supabase.from("imported_transactions").delete().in("id", ids).eq("client_id", clientId);
    }
    setDeletedUids(prev => { const next = new Set(prev); toDelete.forEach(t => next.add(t._uid)); return next; });
    setDeletingCycleKey(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת תנועה בודדת מקובץ (portfolio) ─────────────────────────────────────
  const deleteFileTx = async (tx) => {
    setDeletingTxUid(tx._uid);
    const sub = portfolioSubs.find((s: any) => String(s.id) === String(tx._submissionId));
    if (sub) {
      const newTxs = (sub.transactions || []).filter((_: any, i: number) => i !== tx._txIndex);
      await supabase.from("portfolio_submissions").update({ transactions: newTxs }).eq("id", sub.id);
    }
    setDeletedUids(prev => { const next = new Set(prev); next.add(tx._uid); return next; });
    setDeletingTxUid(null);
    setConfirmDelete(null);
    onDataChange();
  };

  const HEBREW_MONTHS_LOCAL = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  function getCycleLabel(cycleKey, startDay) {
    const [y, m] = cycleKey.split("-").map(Number);
    let endMonth, endYear, endDay;
    if (startDay === 1) {
      endMonth = m; endYear = y;
      endDay = new Date(y, m, 0).getDate();
    } else {
      endMonth = m + 1; endYear = y;
      if (endMonth === 13) { endMonth = 1; endYear = y + 1; }
      endDay = startDay - 1;
    }
    return `${HEBREW_MONTHS_LOCAL[m-1]} (${String(startDay).padStart(2,"0")}.${String(m).padStart(2,"0")} – ${String(endDay).padStart(2,"0")}.${String(endMonth).padStart(2,"0")})`;
  }

  // ── קיבוץ לפי חודש חיוב ─────────────────────────────────────────────────────
  const filteredTxs = allTxs.filter(t => {
    if (filterSource !== "all" && t.source !== filterSource) return false;
    if (filterProvider !== "all" && t.source_label !== filterProvider) return false;
    if (filterCat !== "all" && t.cat !== filterCat) return false;
    const q = searchText.trim().toLowerCase();
    if (q && !(t.name || "").toLowerCase().includes(q) && !(t.cat || "").toLowerCase().includes(q)) return false;
    return true;
  });
  const byCycle = {};
  filteredTxs.forEach(t => {
    const key = t.billing_month || "unknown";
    if (!byCycle[key]) byCycle[key] = [];
    byCycle[key].push(t);
  });
  const cycleKeys = Object.keys(byCycle).sort().reverse();
  const providerLabels = [...new Set(allTxs.map(t => t.source_label).filter(Boolean))];
  const totalAmount = filteredTxs.filter(t => !ignoredCats.has(t.cat)).reduce((s,t) => s + Number(t.amount||0), 0);

  // ── ייצוא Excel ──────────────────────────────────────────────────────────────
  const exportToExcel = () => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
    const wb = XLSX.utils.book_new();
    const detailRows = [];
    cycleKeys.forEach(key => {
      const label = getCycleLabel(key, cycleStartDay);
      const cycleTxs = byCycle[key] || [];
      const cycleTotal = cycleTxs.filter(t => !ignoredCats.has(t.cat)).reduce((s,t) => s + Number(t.amount||0), 0);
      detailRows.push({ "חודש": label, "שם בית עסק": "", "מקור": "", "קטגוריה": "", "סכום": "", "סה\"כ חודש": Math.round(cycleTotal) });
      cycleTxs.forEach(t => {
        detailRows.push({ "חודש": label, "שם בית עסק": t.name, "מקור": t.source_label, "קטגוריה": t.cat || "לא מסווג", "סכום": Number(t.amount), "סה\"כ חודש": "" });
      });
      detailRows.push({ "חודש": "", "שם בית עסק": "סה\"כ " + label, "מקור": "", "קטגוריה": "", "סכום": Math.round(cycleTotal), "סה\"כ חודש": "" });
      detailRows.push({});
    });
    const summaryRows = [];
    const allCats = [...new Set(filteredTxs.map(t => t.cat).filter(c => c && !ignoredCats.has(c)))].sort();
    allCats.forEach(cat => {
      const row = { "קטגוריה": cat };
      cycleKeys.forEach(k => {
        const sum = (byCycle[k]||[]).filter(t => t.cat === cat).reduce((s,t) => s + Number(t.amount||0), 0);
        row[getCycleLabel(k, cycleStartDay)] = sum > 0 ? Math.round(sum) : "";
      });
      summaryRows.push(row);
    });
    const totalRow = { "קטגוריה": "סה\"כ" };
    cycleKeys.forEach(k => {
      const sum = (byCycle[k]||[]).filter(t => !ignoredCats.has(t.cat)).reduce((s,t) => s + Number(t.amount||0), 0);
      totalRow[getCycleLabel(k, cycleStartDay)] = Math.round(sum);
    });
    summaryRows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "פירוט");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "סיכום");
    XLSX.writeFile(wb, `מאזן_כל_התנועות.xlsx`);
  };

  // תנועות מזומן שממתינות לסיווג (conf !== 'high' ומקור ידני)
  const pendingClassification = allTxs.filter(t =>
    t.source === "manual" && t.conf && t.conf !== "high"
  );

  return (
    <div>
      {/* באנר תנועות ממתינות לסיווג */}
      {pendingClassification.length > 0 && (
        <div style={{
          background: "rgba(247,92,92,0.1)", border: "1.5px solid var(--red)",
          borderRadius: 10, padding: "12px 16px", marginBottom: 16,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>🔴</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--red)", fontSize: 14 }}>
              {pendingClassification.length} תנועות מזומן ממתינות לסיווג
            </div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
              נרשמו דרך וואטסאפ ולא סווגו אוטומטית — יש לסווג אותן לפני סגירת החודש
            </div>
          </div>
          <button
            onClick={() => setFilterSource("manual")}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--red)", background: "transparent", color: "var(--red)", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
          >
            הצג →
          </button>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background:"var(--surface)", borderRadius:14, padding:"28px 32px", maxWidth:360, width:"90%", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:28, marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>
              {confirmDelete.type === "all-imported" ? "מחק את כל תנועות המקס?" :
               confirmDelete.type === "cycle" ? `מחק תנועות מקס מ-${confirmDelete.label}?` :
               confirmDelete.type === "submission" ? `מחק קובץ "${confirmDelete.label}"?` :
               `מחק את "${confirmDelete.label}"?`}
            </div>
            <div style={{ fontSize:13, color:"var(--text-dim)", marginBottom:20 }}>
              {confirmDelete.type === "all-imported" ? `${confirmDelete.count} תנועות יימחקו לצמיתות — ניתן לסנכרן מחדש` :
               confirmDelete.type === "cycle" ? `${confirmDelete.count} תנועות יימחקו לצמיתות` :
               confirmDelete.type === "submission" ? `${confirmDelete.count} תנועות יימחקו לצמיתות` :
               "התנועה תימחק לצמיתות"}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--text-mid)", fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                ביטול
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "all-imported") deleteAllImported();
                  else if (confirmDelete.type === "cycle") deleteCycle(confirmDelete.cycleKey);
                  else if (confirmDelete.type === "submission") deleteSubmission(confirmDelete.submissionId);
                  else if (confirmDelete.type === "manual") deleteManualTx(confirmDelete.uid, confirmDelete.dbId);
                  else if (confirmDelete.type === "file") deleteFileTx(confirmDelete.tx);
                  else deleteTx(confirmDelete.uid, confirmDelete.dbId);
                }}
                disabled={!!deletingTxUid || !!deletingCycleKey}
                style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#e53935", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {(deletingTxUid || deletingCycleKey) ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:600, color:"var(--green-deep)" }}>
            כל התנועות
          </div>
          <div style={{ fontSize:13, color:"var(--text-dim)", marginTop:3 }}>
            {filteredTxs.length}{filteredTxs.length !== allTxs.length ? ` מתוך ${allTxs.length}` : ""} תנועות · ₪{Math.round(totalAmount).toLocaleString()} סה"כ
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {selectedUids.size > 0 && (
            <div style={{ display:"flex", gap:6, alignItems:"center" }}>
              <span style={{ fontSize:12, color:"var(--text-dim)" }}>{selectedUids.size} נבחרו</span>
              <button onClick={() => setSelectedUids(new Set())}
                style={{ padding:"5px 10px", borderRadius:7, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                  border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)" }}>
                ✕ בטל
              </button>
              <button onClick={deleteSelected}
                style={{ padding:"7px 16px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  border:"1.5px solid #e53935", background:"#e53935", color:"#fff", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                🗑️ מחק {selectedUids.size}
              </button>
            </div>
          )}
          <button onClick={onNavigateToUpload}
            style={{ padding:"7px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
              border:"1.5px solid var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", display:"flex", alignItems:"center", gap:5 }}>
            ⬆️ הוסף תנועות
          </button>
          <button onClick={exportToExcel}
            style={{ padding:"7px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
              border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text-mid)", display:"flex", alignItems:"center", gap:5 }}>
            📥 Excel
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div style={{ marginBottom:10 }}>
        <input
          value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="🔍 חיפוש לפי שם עסק או קטגוריה..."
          style={{ width:"100%", padding:"8px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize:14, fontFamily:"inherit", boxSizing:"border-box" }}
        />
      </div>

      {/* Source filter */}
      <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:12, color:"var(--text-dim)" }}>מקור:</span>
        {[["all","הכל"], ["file","📁 קבצים"], ["ext","💳 מקס"], ["manual","✏️ ידני"]].map(([v,l]) => (
          <button key={v} onClick={() => { setFilterSource(v); setFilterProvider("all"); }}
            style={{ padding:"4px 12px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit",
              border:`1px solid ${filterSource===v?"var(--green-mid)":"var(--border)"}`,
              background:filterSource===v?"var(--green-mint)":"transparent",
              color:filterSource===v?"var(--green-deep)":"var(--text-mid)" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Category filter */}
      {(() => {
        const allCatOptions = [...new Set(allTxs.map(t => t.cat).filter(Boolean))].sort();
        if (allCatOptions.length === 0) return null;
        return (
          <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:12, color:"var(--text-dim)" }}>קטגוריה:</span>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ padding:"4px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize:12, fontFamily:"inherit" }}>
              <option value="all">הכל</option>
              {allCatOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(filterCat !== "all" || filterSource !== "all" || searchText.trim()) && (
              <button onClick={() => { setFilterCat("all"); setFilterSource("all"); setFilterProvider("all"); setSearchText(""); }}
                style={{ padding:"3px 10px", borderRadius:8, fontSize:11, cursor:"pointer", fontFamily:"inherit", border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)" }}>
                נקה פילטרים
              </button>
            )}
          </div>
        );
      })()}

      {providerLabels.length > 1 && (
        <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
          {[["all","הכל"], ...providerLabels.map(p => [p, p])].map(([v,l]) => (
            <button key={v} onClick={() => setFilterProvider(v)}
              style={{ padding:"4px 12px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                border:`1px solid ${filterProvider===v?"var(--green-mid)":"var(--border)"}`,
                background:filterProvider===v?"var(--green-mint)":"transparent",
                color:filterProvider===v?"var(--green-deep)":"var(--text-mid)" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── Unified expandable month list ── */}
      <RememberModal pendingRemember={pendingRemember}
        onAlways={async () => {
          const oldCat = rememberedMappings[pendingRemember.name] || null;
          await supabase.from("remembered_mappings").upsert(
            [{ client_id: clientId, business_name: pendingRemember.name, category: pendingRemember.cat }],
            { onConflict: "client_id,business_name" }
          );
          await supabase.from("client_change_log").insert([{ client_id: clientId, event_type: "remap_business", details: { business_name: pendingRemember.name, from_cat: oldCat, to_cat: pendingRemember.cat } }]);
          setPendingRemember(null);
        }}
        onThisSession={() => {
          const { name, cat } = pendingRemember;
          const matching = allTxs.filter(t => t.name === name);
          setLocalEdits(prev => {
            const next = new Map(prev);
            matching.forEach(t => next.set(t._uid, cat));
            return next;
          });
          setPendingRemember(null);
        }}
        onJustHere={() => setPendingRemember(null)}
      />

      {cycleKeys.map((key, idx) => {
        const cycleTxs = byCycle[key] || [];
        if (cycleTxs.length === 0) return null;
        const sortedCycleTxs = [...cycleTxs].sort((a, b) => {
          const { field, dir } = sortConfig;
          let va: any = a[field], vb: any = b[field];
          if (field === "amount") { va = Number(va || 0); vb = Number(vb || 0); }
          else { va = (va || "").toString(); vb = (vb || "").toString(); }
          if (va < vb) return dir === "asc" ? -1 : 1;
          if (va > vb) return dir === "asc" ? 1 : -1;
          return 0;
        });
        const activeTxs = sortedCycleTxs.filter(t => !ignoredCats.has(t.cat));
        const ignoredTxs = sortedCycleTxs.filter(t => ignoredCats.has(t.cat));
        const cycleTotal = activeTxs.reduce((s,t) => s + Number(t.amount||0), 0);
        const catMap: Record<string, number> = {};
        activeTxs.forEach(t => { catMap[t.cat] = (catMap[t.cat]||0) + Number(t.amount||0); });
        const top3 = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,3);
        const label = getCycleLabel(key, cycleStartDay);
        const isOpen = openMonthKeys.has(key);

        // unique submissions in this month
        const submissionIds = [...new Set(cycleTxs.filter(t => t.source === "file").map(t => t._submissionId))];
        const hasExtTxs = cycleTxs.some(t => t.source === "ext");

        const renderTxRow = (tx, isIgnored) => {
          const needsClassification = tx.source === "manual" && tx.conf && tx.conf !== "high";
          return (
          <Card key={tx._uid} style={{ marginBottom:6, padding:"10px 14px",
            background: needsClassification ? "rgba(247,92,92,0.06)" : isIgnored ? "rgba(180,180,180,0.08)" : undefined,
            borderRight: needsClassification ? "3px solid var(--red)" : isIgnored ? "3px solid var(--text-dim)" : undefined }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14,
                  textDecoration: isIgnored ? "line-through" : "none",
                  color: isIgnored ? "var(--text-dim)" : undefined }}>{tx.name}</div>
                <div style={{ fontSize:12, color:"var(--text-dim)", display:"flex", gap:6, alignItems:"center" }}>
                  <span>{tx.date}</span>
                  <span style={{ padding:"1px 6px", borderRadius:10, fontSize:11,
                    background: tx.source === "ext" ? "rgba(79,142,247,0.12)" : tx.source === "manual" ? "rgba(251,191,36,0.12)" : "rgba(46,204,138,0.12)",
                    color: tx.source === "ext" ? "var(--green-mid)" : tx.source === "manual" ? "var(--gold)" : "var(--green-deep)" }}>
                    {tx.source === "ext" ? "💳" : tx.source === "manual" ? "✏️" : "📁"} {tx.source_label}
                  </span>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontWeight:700, color: tx.type === "income" ? "var(--green-soft)" : "var(--red)", fontSize:14 }}>
                  {tx.type === "income" ? "+" : ""}₪{Number(tx.amount).toLocaleString()}
                </span>
                <button
                  onClick={() => { setActiveTxUid(tx._uid === activeTxUid ? null : tx._uid); setCatSearch(""); setPendingRemember(null); }}
                  style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"4px 12px",
                    fontSize:12, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                  {tx.cat || "לא מסווג"}
                </button>
                <input type="checkbox" checked={selectedUids.has(tx._uid)}
                  onChange={() => toggleSelectTx(tx._uid)}
                  onClick={e => e.stopPropagation()}
                  style={{ width:16, height:16, cursor:"pointer", accentColor:"var(--green-mid)" }}
                />
                <button onClick={() => {
                    if (tx.source === "manual") setConfirmDelete({ type:"manual", uid:tx._uid, dbId:tx._dbId, label:tx.name });
                    else if (tx.source === "file") setConfirmDelete({ type:"file", uid:tx._uid, tx, label:tx.name });
                    else setConfirmDelete({ type:"tx", uid:tx._uid, dbId:tx._dbId, label:tx.name });
                  }}
                  title="מחק תנועה"
                  style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                  🗑️
                </button>
              </div>
            </div>
            {activeTxUid === tx._uid && (
              <CategoryPicker current={tx.cat} catSearch={catSearch} setCatSearch={setCatSearch}
                categories={categories} rows={categoryRows} clientCats={clientCats} clientId={clientId} onCategoryAdded={onCategoryAdded}
                hiddenCats={hiddenCats} onHiddenCatsChange={onHiddenCatsChange} scenarioCats={scenarioCats}
                onSelect={async (cat) => {
                  if (tx.source === "ext") {
                    // update ALL imported txs with same business name so they all persist
                    await supabase.from("imported_transactions")
                      .update({ cat })
                      .eq("client_id", clientId)
                      .eq("name", tx.name);
                    // optimistically update all ext txs with same business name in UI
                    setLocalEdits(prev => {
                      const next = new Map(prev);
                      allTxs.filter(t => t.source === "ext" && t.name === tx.name).forEach(t => next.set(t._uid, cat));
                      return next;
                    });
                    setPendingRemember({ name: tx.name, cat });
                  } else if (tx.source === "manual") {
                    const oldCat = tx.cat;
                    await supabase.from("manual_transactions").update({ cat, conf: "high" }).eq("id", tx._dbId);
                    await supabase.from("client_change_log").insert([{ client_id: clientId, event_type: "remap_business", details: { business_name: tx.name, from_cat: oldCat, to_cat: cat } }]);
                    setLocalEdits(prev => { const next = new Map(prev); next.set(tx._uid, cat); return next; });
                  } else {
                    setLocalEdits(prev => { const next = new Map(prev); next.set(tx._uid, cat); return next; });
                    await onUpdatePortfolioTxCat(tx._submissionId, tx._txIndex, cat);
                  }
                  setActiveTxUid(null);
                }}
              />
            )}
          </Card>
          );
        };

        return (
          <div key={key} style={{ marginBottom:16 }}>
            {/* Month header — click to expand/collapse */}
            <div onClick={() => toggleMonth(key)}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                background:"var(--surface2)", border:"1.5px solid var(--border)", borderRadius: isOpen ? "10px 10px 0 0" : 10,
                padding:"12px 16px", cursor:"pointer" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>{label}</div>
                {!isOpen && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
                    {top3.map(([cat,amt]) => (
                      <span key={cat} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"2px 10px", fontSize:11 }}>
                        {cat}: ₪{Math.round(amt).toLocaleString()}
                      </span>
                    ))}
                    {ignoredTxs.length > 0 && (
                      <span style={{ fontSize:11, color:"var(--text-dim)" }}>🚫 {ignoredTxs.length} מוסתרות</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:13, color:"var(--text-dim)" }}>{activeTxs.length} תנועות</span>
                <span style={{ fontFamily:"'Fraunces', serif", fontSize:17, fontWeight:700, color:"var(--red)" }}>
                  ₪{Math.round(cycleTotal).toLocaleString()}
                </span>
                {(() => {
                  if (cycleTxs.length === 0) return null;
                  const allSel = cycleTxs.every(t => selectedUids.has(t._uid));
                  return (
                    <div style={{ display:"flex", gap:6 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleSelectMonth(cycleTxs)}
                        style={{ padding:"3px 10px", fontSize:11, borderRadius:6, fontFamily:"inherit", cursor:"pointer",
                          border:"1px solid var(--border)", background: allSel ? "rgba(229,57,53,0.08)" : "transparent",
                          color: allSel ? "#e53935" : "var(--text-dim)" }}>
                        {allSel ? "בטל בחירה" : "בחר הכל"}
                      </button>
                      <button onClick={() => deleteMonth(cycleTxs)}
                        title="מחק את כל תנועות החודש"
                        style={{ padding:"3px 10px", fontSize:11, borderRadius:6, fontFamily:"inherit", cursor:"pointer",
                          border:"1px solid rgba(229,57,53,0.4)", background:"rgba(229,57,53,0.06)", color:"#e53935" }}>
                        🗑️ מחק חודש
                      </button>
                    </div>
                  );
                })()}
                <span style={{ color:"var(--text-dim)", fontSize:16 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ border:"1.5px solid var(--border)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"12px 12px 8px" }}>
                {/* Sort controls */}
                <div style={{ display:"flex", gap:6, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, color:"var(--text-dim)" }}>מיון:</span>
                  {([["date","תאריך"], ["amount","סכום"], ["cat","קטגוריה"]] as const).map(([field, label]) => {
                    const active = sortConfig.field === field;
                    return (
                      <button key={field} onClick={() => setSortConfig(prev => ({ field, dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc" }))}
                        style={{ padding:"2px 10px", borderRadius:14, fontSize:11, cursor:"pointer", fontFamily:"inherit",
                          border:`1px solid ${active?"var(--green-mid)":"var(--border)"}`,
                          background:active?"var(--green-mint)":"transparent",
                          color:active?"var(--green-deep)":"var(--text-dim)" }}>
                        {label} {active ? (sortConfig.dir === "asc" ? "↑" : "↓") : ""}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  // קיבוץ לפי source_label
                  const groups: { label: string; source: string; txs: typeof activeTxs }[] = [];
                  activeTxs.forEach(tx => {
                    const lbl = tx.source_label || (tx.source === "ext" ? "מקס" : tx.source === "manual" ? "ידני" : "קובץ");
                    const existing = groups.find(g => g.label === lbl);
                    if (existing) existing.txs.push(tx);
                    else groups.push({ label: lbl, source: tx.source, txs: [tx] });
                  });
                  return groups.map(g => (
                    <div key={g.label}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, margin:"10px 0 6px", padding:"4px 8px", borderRadius:8,
                        background: g.source === "ext" ? "rgba(79,142,247,0.07)" : g.source === "manual" ? "rgba(251,191,36,0.07)" : "rgba(46,204,138,0.07)" }}>
                        <span style={{ fontSize:13, fontWeight:700,
                          color: g.source === "ext" ? "var(--green-mid)" : g.source === "manual" ? "var(--gold)" : "var(--green-deep)" }}>
                          {g.source === "ext" ? "💳" : g.source === "manual" ? "✏️" : "📁"} {g.label}
                        </span>
                        <span style={{ fontSize:11, color:"var(--text-dim)" }}>{g.txs.length} תנועות</span>
                        <span style={{ fontSize:12, fontWeight:600, marginRight:"auto",
                          color: g.source === "ext" ? "var(--green-mid)" : g.source === "manual" ? "var(--gold)" : "var(--green-deep)" }}>
                          ₪{Math.round(g.txs.reduce((s,t) => s + (t.type==="income"?-1:1)*Number(t.amount||0), 0)).toLocaleString()}
                        </span>
                      </div>
                      {g.txs.map(tx => renderTxRow(tx, false))}
                    </div>
                  ));
                })()}
                {/* Hidden transactions */}
                {ignoredTxs.length > 0 && (
                  <>
                    <div style={{ marginTop:8, marginBottom:4, display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, color:"var(--text-dim)" }} title={`קטגוריות מוסתרות: ${[...ignoredCats].join(", ")}`}>
                        🚫 {ignoredTxs.length} תנועות מוסתרות (קטגוריות מסוננות)
                      </span>
                      <button onClick={() => setIgnoredOpen(p => ({ ...p, [key]: !p[key] }))}
                        style={{ padding:"2px 10px", borderRadius:10, fontSize:11, cursor:"pointer", fontFamily:"inherit",
                          border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)" }}>
                        {ignoredOpen[key] ? "הסתר" : "הצג"}
                      </button>
                    </div>
                    {ignoredOpen[key] && ignoredTxs.map(tx => renderTxRow(tx, true))}
                  </>
                )}

                {/* הוסף תנועה ידנית */}
                {(() => {
                  const mode = addingTx[key];
                  const form = addForm[key] || {};
                  const allCats = [...Object.values(categories || CATEGORIES).flat(), ...(clientCats || [])];
                  const inputS = { border:"1px solid var(--border)", borderRadius:6, padding:"6px 10px", fontSize:13, fontFamily:"inherit", background:"var(--surface2)", color:"var(--text)", width:"100%" };
                  const rowS: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end", marginBottom:8 };

                  if (!mode) return (
                    <div style={{ marginTop:10, marginBottom:4 }}>
                      <button onClick={() => setMonthAddMode(key, "menu")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1.5px dashed var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", cursor:"pointer" }}>
                        ✏️ הוסף תנועה
                      </button>
                    </div>
                  );

                  if (mode === "menu") return (
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"var(--text-dim)" }}>סוג תנועה:</span>
                      <button onClick={() => setMonthAddMode(key, "income")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--green-soft)", background:"var(--green-mint)", color:"var(--green-deep)", cursor:"pointer", fontWeight:600 }}>
                        + הוסף הכנסה
                      </button>
                      <button onClick={() => setMonthAddMode(key, "expense-choice")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935", cursor:"pointer", fontWeight:600 }}>
                        − הוסף הוצאה
                      </button>
                      <button onClick={() => resetAdd(key)}
                        style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
                    </div>
                  );

                  if (mode === "income") return (
                    <div style={{ marginTop:10, background:"rgba(46,204,138,0.05)", border:"1px solid rgba(46,204,138,0.2)", borderRadius:10, padding:"14px 14px 10px" }}>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:"var(--green-deep)" }}>+ הכנסה מזדמנת</div>
                      <div style={rowS}>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>פירוט *</div>
                          <input style={inputS} value={form.name||""} onChange={e=>updateForm(key,"name",e.target.value)} placeholder="תיאור ההכנסה" />
                        </div>
                        <div style={{ flex:1, minWidth:90 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>סכום (₪) *</div>
                          <input type="number" style={inputS} value={form.amount||""} onChange={e=>updateForm(key,"amount",e.target.value)} placeholder="0" />
                        </div>
                        <div style={{ flex:1, minWidth:110 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>תאריך (אופציונלי)</div>
                          <input type="date" style={inputS} value={form.date||""} onChange={e=>updateForm(key,"date",e.target.value)} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveManualTx(key, "income")}
                          disabled={!form.name || !form.amount}
                          style={{ padding:"6px 18px", borderRadius:8, border:"none", background:"var(--green-mid)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:(!form.name||!form.amount)?0.5:1 }}>
                          שמור
                        </button>
                        <button onClick={() => resetAdd(key)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                      </div>
                    </div>
                  );

                  if (mode === "expense-choice") return (
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"var(--text-dim)" }}>צורת תשלום:</span>
                      <button onClick={() => { setMonthAddMode(key, "expense-cash"); updateForm(key, "payment_method", "מזומן"); }}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", cursor:"pointer" }}>
                        💵 מזומן
                      </button>
                      <button onClick={() => setMonthAddMode(key, "expense-other")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", cursor:"pointer" }}>
                        💳 אחר
                      </button>
                      <button onClick={() => resetAdd(key)} style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
                    </div>
                  );

                  if (mode === "expense-cash" || mode === "expense-other") return (
                    <div style={{ marginTop:10, background:"rgba(247,92,92,0.04)", border:"1px solid rgba(247,92,92,0.18)", borderRadius:10, padding:"14px 14px 10px" }}>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:"#e53935" }}>
                        − הוצאה {mode === "expense-cash" ? "במזומן" : ""}
                      </div>
                      {mode === "expense-other" && (
                        <div style={{ ...rowS, marginBottom:8 }}>
                          <div style={{ flex:1, minWidth:140 }}>
                            <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>צורת תשלום</div>
                            <input style={inputS} value={form.payment_method||""} onChange={e=>updateForm(key,"payment_method",e.target.value)} placeholder="למשל: העברה בנקאית, צ׳ק..." />
                          </div>
                        </div>
                      )}
                      <div style={rowS}>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>פירוט *</div>
                          <input style={inputS} value={form.name||""} onChange={e=>updateForm(key,"name",e.target.value)} placeholder="תיאור ההוצאה" />
                        </div>
                        <div style={{ flex:1, minWidth:90 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>סכום (₪) *</div>
                          <input type="number" style={inputS} value={form.amount||""} onChange={e=>updateForm(key,"amount",e.target.value)} placeholder="0" />
                        </div>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>סיווג *</div>
                          <select style={inputS} value={form.cat||""} onChange={e=>updateForm(key,"cat",e.target.value)}>
                            <option value="">בחר קטגוריה...</option>
                            {Object.entries(categories || CATEGORIES).map(([section, cats]) => (
                              <optgroup key={section} label={section}>
                                {(cats as string[]).map(c => <option key={c} value={c}>{c}</option>)}
                              </optgroup>
                            ))}
                            {clientCats && clientCats.length > 0 && (
                              <optgroup label="⭐ הקטגוריות שלי">
                                {clientCats.map(c => <option key={c} value={c}>{c}</option>)}
                              </optgroup>
                            )}
                          </select>
                        </div>
                        <div style={{ flex:1, minWidth:110 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>תאריך (אופציונלי)</div>
                          <input type="date" style={inputS} value={form.date||""} onChange={e=>updateForm(key,"date",e.target.value)} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveManualTx(key, "expense")}
                          disabled={!form.name || !form.amount || !form.cat}
                          style={{ padding:"6px 18px", borderRadius:8, border:"none", background:"#e53935", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:(!form.name||!form.amount||!form.cat)?0.5:1 }}>
                          שמור
                        </button>
                        <button onClick={() => resetAdd(key)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                      </div>
                    </div>
                  );

                  return null;
                })()}

                {/* Per-source management */}
                <div style={{ marginTop:12, padding:"10px 4px", borderTop:"1px solid var(--border)", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{ fontSize:12, color:"var(--text-dim)" }}>ניהול מקורות:</span>
                  {submissionIds.map(subId => {
                    const subLabel = allTxs.find(t => t._submissionId === subId)?.source_label || "קובץ";
                    const subCount = allTxs.filter(t => t._submissionId === subId).length;
                    return (
                      <span key={subId as string} style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
                        <button onClick={onNavigateToUpload}
                          title="החלף קובץ — העלה קובץ חדש לחודש זה"
                          style={{ padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                            border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text-mid)" }}>
                          📁 {subLabel} — החלף
                        </button>
                        <button onClick={() => setConfirmDelete({ type:"submission", submissionId:subId, label:subLabel, count:subCount })}
                          style={{ padding:"4px 8px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                            border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935" }}>
                          הסר
                        </button>
                      </span>
                    );
                  })}
                  {hasExtTxs && (
                    <button onClick={() => setConfirmDelete({ type:"cycle", cycleKey:key, label, count:cycleTxs.filter(t=>t.source==="ext").length })}
                      style={{ padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                        border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935" }}>
                      💳 מחק תנועות מקס מחודש זה
                    </button>
                  )}
                  <button onClick={onNavigateToUpload}
                    style={{ padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                      border:"1px solid var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)" }}>
                    ➕ הוסף מקור לחודש זה
                  </button>
                </div>

                <div style={{ textAlign:"left", padding:"6px 4px", fontSize:13, color:"var(--text-mid)", fontWeight:700 }}>
                  סה"כ {label}: ₪{Math.round(cycleTotal).toLocaleString()}
                </div>
              </div>
            )}

            {!isOpen && idx < cycleKeys.length - 1 && (
              <div style={{ textAlign:"center", padding:"4px 0 10px", fontSize:12, color:"var(--text-dim)", borderBottom:"1px dashed var(--border)", marginBottom:8 }}>
                סה"כ עד כאן: ₪{Math.round(
                  cycleKeys.slice(0, idx+1).flatMap(k => (byCycle[k]||[]).filter(t => !ignoredCats.has(t.cat)))
                    .reduce((s,t) => s + Number(t.amount||0), 0)
                ).toLocaleString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Classify imported transaction — uses same logic as file upload ─────────────
function classifyImported(tx, rememberedMappings, categoryRules = []) {
  if (tx.cat) return tx.cat; // user manually set — respect it
  const result = classifyTx(tx.name, tx.max_category || "", rememberedMappings, categoryRules);
  return result.cat;
}



// ── Payslips Screen ───────────────────────────────────────────────────────────
function PayslipsScreen({ clientId, payslips, subsCount, clientName, onDone, onBack }) {
  const currentYear = new Date().getFullYear();
  const [showPicker, setShowPicker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const usedKeys = payslips.map(p => p.month_key).filter(Boolean);
  const monthKey = `${selectedYear}-${String(selectedMonth+1).padStart(2,"0")}`;
  const alreadyUploaded = usedKeys.includes(monthKey);
  const years = [currentYear, currentYear-1, currentYear-2];

  const handleFile = (e) => { const f = e.target.files[0]; if (!f) return; setPendingFile(f); setShowPicker(true); };

  const savePayslip = async () => {
    if (!pendingFile || alreadyUploaded) return;
    setUploading(true);
    const label = `${HEBREW_MONTHS[selectedMonth]} ${selectedYear}`;
    const storagePath = `${clientId}/payslips/${monthKey}_${Date.now()}_${pendingFile.name}`;
    let savedPath = null;
    const { error: storageErr } = await supabase.storage.from("client-documents").upload(storagePath, pendingFile, { upsert: false });
    if (!storageErr) savedPath = storagePath;
    const { error } = await supabase.from("payslips").insert([{ client_id: clientId, label, month_key: monthKey, filename: pendingFile.name, path: savedPath, created_at: new Date().toISOString() }]);
    if (error) { setMsg("❌ שגיאה בשמירה"); setUploading(false); return; }
    setPendingFile(null); setShowPicker(false); setMsg("✅ תלוש נשמר!");
    setTimeout(() => setMsg(""), 2000);
    onDone();
    setUploading(false);
  };

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← חזור</Btn>
        <div style={{ fontWeight:700, fontSize:18 }}>💼 תלושי משכורת</div>
      </div>
      <Card style={{ marginBottom:20, textAlign:"center", padding:"32px 24px" }}>
        <div style={{ fontSize:36, marginBottom:12 }}>📄</div>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>העלה תלוש משכורת</div>
        <div style={{ fontSize:13, color:"var(--text-dim)", marginBottom:20 }}>צריך {3 - payslips.length} תלוש{3 - payslips.length !== 1 ? "ים" : ""} נוספים</div>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={handleFile} />
        <Btn onClick={() => fileRef.current?.click()} disabled={payslips.length >= 3}>📎 בחר קובץ</Btn>
      </Card>
      {msg && <div style={{ background:msg.startsWith("✅")?"rgba(46,204,138,0.1)":"rgba(247,92,92,0.1)", border:`1px solid ${msg.startsWith("✅")?"rgba(46,204,138,0.3)":"rgba(247,92,92,0.3)"}`, borderRadius:10, padding:"10px 16px", marginBottom:16, fontSize:13, color:msg.startsWith("✅")?"var(--green-soft)":"var(--red)" }}>{msg}</div>}
      {payslips.length > 0 && (
        <div>
          <div style={{ fontWeight:700, marginBottom:12 }}>תלושים שהועלו</div>
          {payslips.map(p => (
            <Card key={p.id} style={{ marginBottom:10, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontWeight:600 }}>📄 {p.label}</div><div style={{ fontSize:11, color:"var(--text-dim)" }}>{p.filename} · {new Date(p.created_at).toLocaleDateString("he-IL")}</div></div>
              <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>✓</span>
            </Card>
          ))}
        </div>
      )}
      {showPicker && (
        <>
          <div onClick={() => setShowPicker(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9998 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:"28px 32px", zIndex:9999, minWidth:320, textAlign:"center" }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>לאיזה חודש התלוש?</div>
            <div style={{ fontSize:13, color:"var(--text-dim)", marginBottom:20 }}>{pendingFile?.name}</div>
            <div style={{ display:"flex", gap:10, marginBottom:20, justifyContent:"center" }}>
              <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"8px 12px", color:"var(--text)", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>
                {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"8px 12px", color:"var(--text)", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {alreadyUploaded && <div style={{ color:"var(--gold)", fontSize:12, marginBottom:12 }}>⚠️ כבר העלית תלוש לחודש זה</div>}
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <Btn onClick={savePayslip} disabled={alreadyUploaded || uploading}>שמור תלוש</Btn>
              <Btn variant="ghost" onClick={() => setShowPicker(false)}>ביטול</Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Client personal tab ───────────────────────────────────────────────────────
function ClientPersonalTab({ session }) {
  const [editName, setEditName] = useState(session.name);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("email,phone").eq("id", session.id).maybeSingle()
      .then(({ data }) => { if (data) { setEditEmail(data.email||""); setEditPhone(data.phone||""); } setLoaded(true); });
  }, []);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveDetails = async () => {
    setLoading(true);
    const { error } = await supabase.from("clients").update({ name: editName, email: editEmail, phone: editPhone }).eq("id", session.id);
    if (error) showMsg("❌ שגיאה בשמירה"); else showMsg("✅ הפרטים עודכנו");
    setLoading(false);
  };

  const changePassword = async () => {
    if (newPass.length < 4) { showMsg("❌ סיסמה חייבת להיות לפחות 4 תווים"); return; }
    if (newPass !== confirmPass) { showMsg("❌ הסיסמאות לא תואמות"); return; }
    setLoading(true);
    const { error } = await supabase.from("clients").update({ password: newPass }).eq("id", session.id);
    if (error) showMsg("❌ שגיאה"); else { showMsg("✅ הסיסמה עודכנה"); setNewPass(""); setConfirmPass(""); }
    setLoading(false);
  };

  if (!loaded) return <div style={{ color:"var(--text-dim)", padding:32, textAlign:"center" }}>טוען...</div>;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:16 }}>
      <Card>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>👤 הפרטים שלי</div>
        <Input label="שם מלא" value={editName} onChange={e => setEditName(e.target.value)} />
        <Input label="מייל" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@gmail.com" />
        <Input label="טלפון" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="050-0000000" />
        <div style={{ background:"var(--surface2)", borderRadius:8, padding:"10px 12px", fontSize:12, color:"var(--text-dim)", marginBottom:14 }}>
          <div style={{ marginBottom:4 }}>שם משתמש לכניסה</div>
          <div style={{ color:"var(--text)", fontWeight:600 }}>@{session.username}</div>
        </div>
        {msg && <div style={{ fontSize:12, color:msg.startsWith("✅")?"var(--green-soft)":"var(--red)", marginBottom:12 }}>{msg}</div>}
        <Btn onClick={saveDetails} disabled={loading}>שמור שינויים</Btn>
      </Card>
      <Card>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>🔐 שינוי סיסמה</div>
        <Input label="סיסמה חדשה" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="לפחות 4 תווים" />
        <Input label="אימות סיסמה" type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="הכנס שוב" />
        {msg && <div style={{ fontSize:12, color:msg.startsWith("✅")?"var(--green-soft)":"var(--red)", marginBottom:12 }}>{msg}</div>}
        <Btn onClick={changePassword} disabled={loading||!newPass||!confirmPass}>עדכן סיסמה</Btn>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// שאלון אימון אישי — שני בני זוג
// ════════════════════════════════════════════════════════════════
const QUESTIONNAIRE_QUESTIONS = [
  "מהן החוזקות והחולשות אותן אתה/את מביא/ה עימך לתהליך?",
  "מהם הקשיים בהם אתה/את נתקל/ת בניהול התקציב?",
  "מה לדעתך הגורמים שהביאו למצב הנוכחי, ומה המחיר שאתה/את מרגיש/ה שאתה/את משלם/ת?",
  "מהי ההזדמנות שניתנה לך בתהליך?",
  "במה אתה/את מוכן/ה לפעול בדרך שונה מזו שפעלת עד היום? מהי המחויבות שלך בתהליך?",
  "על מה הכי קשה לך לוותר?",
  "מה ייחשב להצלחה עבורך בתהליך?",
  "היכן היית רוצה לראות את עצמך/עצמכם בעוד שנתיים מהיום?",
  "היכן היית רוצה לראות את עצמך/עצמכם בעוד 10 שנים קדימה?",
  "באיזה תחום אתה/את מרגיש/ה שהכי קשה לך לשלוט בהוצאות?",
  "מהי ההתנהלות הכלכלית שאתה/את הכי גאה/ה בה, ומהי ההתנהלות שאם היית חוזר/ת אחורה היית עושה אחרת?",
];

function CoachingQuestionnaire({ session, spousesCount = 1, onNavigateBack }) {
  const [spouseIndex, setSpouseIndex] = useState(1);
  const [answers, setAnswers]         = useState({ 1: {}, 2: {} });
  const [doneMap, setDoneMap]         = useState({ 1: false, 2: false });
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [doneError, setDoneError]     = useState("");
  const [loaded, setLoaded]           = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("client_questionnaire")
        .select("*")
        .eq("client_id", session.id);
      if (data && data.length > 0) {
        const merged = { 1: {}, 2: {} };
        const done   = { 1: false, 2: false };
        data.forEach(row => {
          merged[row.spouse_index] = row.answers || {};
          done[row.spouse_index]   = row.done || false;
        });
        setAnswers(merged);
        setDoneMap(done);
      }
      setLoaded(true);
    })();
  }, [session.id]);

  const updateAnswer = (qIdx, val) => {
    setAnswers(prev => ({ ...prev, [spouseIndex]: { ...prev[spouseIndex], [qIdx]: val } }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await supabase.from("client_questionnaire").upsert(
      [{ client_id: session.id, spouse_index: spouseIndex, answers: answers[spouseIndex], updated_at: new Date().toISOString() }],
      { onConflict: "client_id,spouse_index" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const markDone = async () => {
    const cur = answers[spouseIndex] || {};
    const unanswered = QUESTIONNAIRE_QUESTIONS.map((_, i) => !(cur[i] && cur[i].trim())).filter(Boolean).length;
    if (unanswered > 0) {
      setDoneError(`יש עוד ${unanswered} שאלות שלא נענו — יש לענות על כולן לפני סיום`);
      return;
    }
    setDoneError("");
    setMarkingDone(true);
    await supabase.from("client_questionnaire").upsert(
      [{ client_id: session.id, spouse_index: spouseIndex, answers: answers[spouseIndex], done: true, updated_at: new Date().toISOString() }],
      { onConflict: "client_id,spouse_index" }
    );
    setDoneMap(prev => ({ ...prev, [spouseIndex]: true }));
    setMarkingDone(false);
  };

  const countFilled = (idx) => Object.values(answers[idx] || {}).filter((v: any) => v && v.trim()).length;
  const visibleSpouses = spousesCount >= 2 ? [1, 2] : [1];

  if (!loaded) return <div style={{ color:"var(--text-dim)", padding:32, textAlign:"center" }}>טוען...</div>;

  return (
    <div>
      <div style={{ fontWeight:700, fontSize:16, marginBottom:6 }}>📝 שאלון אישי</div>
      <div style={{ fontSize:13, color:"var(--text-dim)", marginBottom:16 }}>
        ענה על השאלות הבאות — הן יעזרו לאלון להכיר אותך לעומק ולהתאים את התהליך עבורך אישית.
      </div>

      {visibleSpouses.length > 1 && (
        <div style={{ display:"inline-flex", background:"var(--surface2)", borderRadius:30, padding:4, gap:4, marginBottom:24 }}>
          {visibleSpouses.map(idx => (
            <button key={idx} onClick={() => setSpouseIndex(idx)} style={{
              padding:"8px 22px", borderRadius:24, border:"none", fontFamily:"inherit", fontSize:13,
              background: spouseIndex === idx ? "var(--green-mid)" : "transparent",
              color: spouseIndex === idx ? "white" : "var(--text-dim)",
              fontWeight: spouseIndex === idx ? 700 : 400,
              cursor:"pointer", transition:"all .15s",
            }}>
              {idx === 1 ? "בן/בת זוג ראשון" : "בן/בת זוג שני"}
              {doneMap[idx] ? <span style={{ marginRight:6 }}>✅</span> : countFilled(idx) > 0 && <span style={{ marginRight:6, fontSize:11, opacity:.8 }}>({countFilled(idx)}/{QUESTIONNAIRE_QUESTIONS.length})</span>}
            </button>
          ))}
        </div>
      )}

      {doneMap[spouseIndex] ? (
        <div style={{ padding:"24px", background:"rgba(46,183,124,0.08)", borderRadius:12, border:"1px solid rgba(46,183,124,0.25)", textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:16, color:"var(--green-deep)", marginBottom:6 }}>השאלון הושלם!</div>
          <div style={{ fontSize:13, color:"var(--text-mid)", marginBottom:20 }}>סימנת "סיימתי" עבור בן/בת הזוג הזה</div>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            {onNavigateBack && (
              <Btn onClick={onNavigateBack}>← חזור להגשת המסמכים</Btn>
            )}
            <Btn variant="ghost" onClick={() => setDoneMap(prev => ({ ...prev, [spouseIndex]: false }))}>✏️ ערוך תשובות</Btn>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {QUESTIONNAIRE_QUESTIONS.map((q, i) => {
              const isEmpty = !(answers[spouseIndex]?.[i] && answers[spouseIndex][i].trim());
              return (
                <Card key={i} style={{ padding:"16px 18px", border: isEmpty ? "1px solid var(--border)" : "1px solid rgba(46,183,124,0.3)" }}>
                  <div style={{ fontWeight:600, fontSize:13, marginBottom:10, lineHeight:1.5 }}>
                    <span style={{ color:"var(--green-mid)", marginLeft:6 }}>{i + 1}.</span>{q}
                    <span style={{ color:"var(--red)", marginRight:4 }}>*</span>
                  </div>
                  <textarea
                    value={answers[spouseIndex]?.[i] || ""}
                    onChange={e => { updateAnswer(i, e.target.value); setDoneError(""); }}
                    rows={3}
                    placeholder="כתוב/י את תשובתך כאן..."
                    style={{ width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:`1px solid ${isEmpty?"var(--border)":"rgba(46,183,124,0.3)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontSize:13, fontFamily:"inherit", resize:"vertical", outline:"none", lineHeight:1.6 }}
                  />
                </Card>
              );
            })}
          </div>

          <div style={{ marginTop:20, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <Btn onClick={save} disabled={saving} variant="ghost">{saving ? "שומר..." : "💾 שמור טיוטה"}</Btn>
            <Btn onClick={markDone} disabled={markingDone}>{markingDone ? "שומר..." : "✅ סיימתי"}</Btn>
            {saved && <span style={{ fontSize:13, color:"var(--green-soft)" }}>נשמר בהצלחה</span>}
          </div>
          {doneError && <div style={{ marginTop:10, fontSize:13, color:"var(--red)", fontWeight:600 }}>⚠️ {doneError}</div>}
        </>
      )}

      <div style={{ marginTop:28, padding:"12px 16px", background:"rgba(46,183,124,0.06)", borderRadius:10, border:"1px solid rgba(46,183,124,0.2)", fontSize:12, color:"var(--text-dim)", lineHeight:1.7 }}>
        💡 <em>"הצלחה לא באה אליך — אתה הולך אליה"</em> — מריה קולינס
      </div>
    </div>
  );
}
