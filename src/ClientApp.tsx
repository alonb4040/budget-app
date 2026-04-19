import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./supabase";
import { CATEGORIES, IGNORED_CATEGORIES, parseExcelData, parseBankPDF, classifyTx, HEBREW_MONTHS, assignBillingMonth } from "./data";
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
import BankTutorial from "./components/BankTutorial";
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
  const TAB_KEY      = `mazan_activeTab_${session.id}`;
  const PORT_KEY     = `mazan_portfolioOpen_${session.id}`;
  const PORT_TAB_KEY = `mazan_portfolioTab_${session.id}`;
  const [activeTab, setActiveTab]         = useState(() => {
    const saved = sessionStorage.getItem(TAB_KEY);
    if (saved && saved !== "questionnaire") return saved;
    const portfolioWasOpen = sessionStorage.getItem(PORT_KEY) === "1";
    return portfolioWasOpen ? "portfolio" : "data";
  });
  // visitedTabs — tracks which tabs have been mounted at least once (lazy mount)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem(TAB_KEY);
    const initial = (saved && saved !== "questionnaire") ? saved
      : sessionStorage.getItem(PORT_KEY) === "1" ? "portfolio" : "data";
    return new Set([initial]);
  });
  const switchTab = (id) => {
    sessionStorage.setItem(TAB_KEY, id);
    setActiveTab(id);
    setVisitedTabs(prev => { const next = new Set(prev); next.add(id); return next; });
  };
  const [dataSubTab, setDataSubTab]       = useState(() =>
    sessionStorage.getItem(TAB_KEY) === "questionnaire" ? "questionnaire" : "documents"
  ); // documents | questionnaire
  const [portfolioSubTab, setPortfolioSubTab] = useState(() => sessionStorage.getItem(PORT_TAB_KEY) || "control");
  const [visitedPortfolioSubTabs, setVisitedPortfolioSubTabs] = useState<Set<string>>(() =>
    new Set([sessionStorage.getItem(PORT_TAB_KEY) || "control"])
  );
  const switchPortfolioSubTab = (id: string) => {
    sessionStorage.setItem(PORT_TAB_KEY, id);
    setPortfolioSubTab(id);
    setVisitedPortfolioSubTabs(prev => { const next = new Set(prev); next.add(id); return next; });
  };
  const [showWelcome, setShowWelcome]     = useState(false);
  const dismissWelcome = () => { setShowWelcome(false); sessionStorage.setItem('welcome_dismissed_' + session.id, '1'); };
  useEffect(() => {
    if (!showWelcome) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissWelcome(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showWelcome]);
  const [showUserMenu, setShowUserMenu]   = useState(false);
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
  // שמות בני הזוג לפי טופס פגישה ראשונה
  const [spouseNames, setSpouseNames]     = useState<{s1: string|null, s2: string|null}>({ s1: null, s2: null });
  // סוג עיסוק לפי טופס פגישה ראשונה
  const [employmentTypes, setEmploymentTypes] = useState<{s1: string|null, s2: string|null}>({ s1: null, s2: null });
  // סיבות "אין תלושים" לכל בן/בת זוג
  const [noPayslipReasons, setNoPayslipReasons] = useState<{s1: string|null, s2: string|null}>({ s1: null, s2: null });
  // מי מהספאוסים נמצא במסך תלושי השכר
  const [activePayslipSpouse, setActivePayslipSpouse] = useState<1|2>(1);

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
  const [prevCatMap, setPrevCatMap]       = useState<Record<string,string>>({});
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
  const [selectedTxIds, setSelectedTxIds]         = useState<Set<any>>(new Set());

  // ── בדיקת כיסוי קטגוריות — מודלים ────────────────────────────────────────────
  const [finalizeModal, setFinalizeModal]         = useState<null | 'month1' | 'month2' | 'month3'>(null);
  const [pendingFinalize, setPendingFinalize]     = useState(false);
  const [estimates, setEstimates]                 = useState<Record<string, string>>({});
  const [openSections, setOpenSections]           = useState<Record<string, boolean>>({});
  const [finalizeNote, setFinalizeNote]           = useState("");  // הערה לפני סיום חודש (משימה 4א)
  const [showSubmissionNoteModal, setShowSubmissionNoteModal] = useState(false);
  const [submissionNote, setSubmissionNote]       = useState("");
  const [submittingNote, setSubmittingNote]       = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadUserData(); }, []);

  // real-time: עדכון שמות בני זוג כשהאדמין משנה את טופס הפגישה הראשונה
  useEffect(() => {
    const channel = supabase
      .channel(`intake_names_${session.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_intake", filter: `client_id=eq.${session.id}` }, (payload) => {
        const data = (payload.new as any)?.data;
        if (data) setSpouseNames({ s1: data.spouse1_name || null, s2: data.spouse2_name || null });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id]);

  // פונקציה לרענון scenarioCats — משותפת לטעינה ראשונית ולreal-time
  const reloadScenarioCats = async (portfolioOpen: boolean) => {
    if (!portfolioOpen) { setScenarioCats(null); return; }
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
      // ודא שהתסריט עדיין קיים — אם נמחק, נקה את רשומת active_scenario העזובה
      const { data: scenario } = await supabase
        .from("scenarios").select("id").eq("id", activeScen.scenario_id).maybeSingle();
      if (!scenario) {
        supabase.from("active_scenario").delete()
          .eq("client_id", session.id).eq("scenario_id", activeScen.scenario_id);
        setScenarioCats(null);
        return;
      }
      const { data: items } = await supabase
        .from("scenario_items").select("category_name").eq("scenario_id", activeScen.scenario_id);
      const scenarioNames = (items || []).map((r: any) => r.category_name);
      // כלול גם קטגוריות אישיות של הלקוח — תמיד חלק מהתצוגה
      const { data: personalRows } = await supabase
        .from("categories").select("name")
        .eq("client_id", session.id).eq("is_active", true);
      const personalNames = (personalRows || []).map((r: any) => r.name);
      setScenarioCats([...new Set([...scenarioNames, ...personalNames])]);
    } else {
      setScenarioCats(null);
    }
  };

  // real-time: כשתסריט פעיל משתנה — רענן scenarioCats מיידית
  useEffect(() => {
    const channel = supabase
      .channel("active_scenario_realtime")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "active_scenario",
        filter: `client_id=eq.${session.id}`,
      }, () => {
        reloadScenarioCats(portfolioOpen);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session.id, portfolioOpen]); // eslint-disable-line

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

  // פונקציה פנימית שמרענת נתונים ומעדכנת state — אפשר לקרוא לה עם או בלי spinner
  const fetchAndApplyData = async () => {
    const [{ data: entries }, { data: subs }, { data: maps }, { data: clientData }, { data: pays }, { data: pMonths }, { data: pSubs }, iTxs, { data: mTxs }, { data: cDocs }] = await Promise.all([
      supabase.from("month_entries").select("*").eq("client_id", session.id).order("month_key", { ascending: false }),
      supabase.from("submissions").select("*").eq("client_id", session.id).order("created_at", { ascending: true }),
      supabase.from("remembered_mappings").select("*").eq("client_id", session.id),
      supabase.from("clients").select("portfolio_open,portfolio_opened_at,email,phone,cycle_start_day,plan,submitted_at,required_docs,questionnaire_spouses,doc_notes,custom_docs,hidden_cats,no_payslip_reason_s1,no_payslip_reason_s2").eq("id", session.id).maybeSingle(),
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
    const isPortfolioOpen = clientData?.portfolio_open || false;
    setPortfolioOpen(isPortfolioOpen);
    const wasTabSaved = !!sessionStorage.getItem(TAB_KEY);
    sessionStorage.setItem(PORT_KEY, isPortfolioOpen ? "1" : "0");
    if (isPortfolioOpen && !wasTabSaved) {
      sessionStorage.setItem(TAB_KEY, 'portfolio');
      sessionStorage.setItem(PORT_TAB_KEY, 'control');
      setActiveTab('portfolio');
      setPortfolioSubTab('control');
      setVisitedTabs(prev => { const next = new Set(prev); next.add('portfolio'); return next; });
      setVisitedPortfolioSubTabs(new Set(['control']));
    }
    setPortfolioOpenedAt(clientData?.portfolio_opened_at || null);
    setCycleStartDay(clientData?.cycle_start_day || 1);
    setClientPlan(clientData?.plan || "free");
    setSubmittedAt(clientData?.submitted_at || null);
    setRequiredDocs(clientData?.required_docs ?? null);
    setQuestionnaireSpouses(clientData?.questionnaire_spouses ?? null);
    setDocNotes(clientData?.doc_notes ?? {});
    setCustomDocs(clientData?.custom_docs ?? []);
    setHiddenCats(clientData?.hidden_cats ?? []);
    setNoPayslipReasons({ s1: clientData?.no_payslip_reason_s1 ?? null, s2: clientData?.no_payslip_reason_s2 ?? null });
    // טעינת שמות בני הזוג מטופס פגישה ראשונה
    const { data: intakeData } = await supabase.from("client_intake").select("data").eq("client_id", session.id).maybeSingle();
    if (intakeData?.data) {
      setSpouseNames({ s1: intakeData.data.spouse1_name || null, s2: intakeData.data.spouse2_name || null });
      setEmploymentTypes({ s1: intakeData.data.spouse1_employment_type || null, s2: intakeData.data.spouse2_employment_type || null });
    }
    await reloadScenarioCats(!!clientData?.portfolio_open).catch(() => {});
    setClientDocs(cDocs || []);
    setPortfolioMonths(pMonths || []);
    setPortfolioSubs(pSubs || []);
    const mappingObj = {};
    (maps || []).forEach(m => { mappingObj[m.business_name] = m.category; });
    setRememberedMappings(mappingObj);
    setImportedTxs(iTxs);
    setManualTxs(mTxs || []);
    setImportedLoaded(true);
  };

  const loadUserData = async () => {
    setLoadingData(true);
    // Fire-and-forget: update last seen timestamp for admin visibility
    supabase.from("clients").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
    try {
      await fetchAndApplyData();
    } catch(err) {
      console.error("loadUserData error:", err);
    } finally {
      setLoadingData(false);
    }
  };

  // רענון ברקע — ללא spinner, לא הורס state של רכיבי ילדים
  const reloadSilent = () => { fetchAndApplyData().catch(err => console.error("reloadSilent error:", err)); };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const finalizedMonths = monthEntries.filter(e => e.is_finalized);
  // completedOnboarding — בודק האם הלקוח עבר את שלב האיסוף הבסיסי (3 חודשים + לפחות 3 תלושים כלשהם)
  // מכוון: לא משתמש בלוגיקת per-spouse כדי לא לשבור לקוחות קיימים
  const completedOnboarding = finalizedMonths.length >= REQUIRED_MONTHS && payslips.length >= REQUIRED_MONTHS;
  const isOnboarding = !completedOnboarding;

  // ── קטגוריות ריקות — לבדיקת כיסוי ──────────────────────────────────────────
  // קטגוריות גלובליות ריקות בחודש הנוכחי (popup A / B חודשים 1-2)
  const emptyCatsCurrentMonth = useMemo(() => {
    if (!activeMonth || !categoryRows.length) return [];
    const usedCats = new Set(monthSubs.flatMap(s => (s.transactions || []).map(t => t.cat)));
    return categoryRows.filter(r => r.client_id === null && !usedCats.has(r.name));
  }, [activeMonth, monthSubs, categoryRows]);

  // קטגוריות גלובליות ריקות לאורך כל 3 החודשים (popup B — חודש 3)
  const emptyCatsAllMonths = useMemo(() => {
    if (!categoryRows.length) return [];
    const allUsedCats = new Set(submissions.flatMap(s => (s.transactions || []).map(t => t.cat)));
    return categoryRows.filter(r => r.client_id === null && !allUsedCats.has(r.name));
  }, [submissions, categoryRows]);
  // חודש נחשב "תפוס" רק אם יש לו לפחות submission אחד — ghost entries (month_entry ללא submissions) לא חוסמים בחירה מחדש
  const usedMonthKeys = monthEntries
    .filter(e => submissions.some(s => s.month_key === e.month_key))
    .map(e => e.month_key);

  // ── open month picker to create new month ──
  const openNewMonth = () => setShowMonthPicker(true);

  const onMonthConfirmed = async (key, monthName, year) => {
    setShowMonthPicker(false);
    const label = `${monthName} ${year}`;
    // create month_entry if not exists
    const existing = monthEntries.find(e => e.month_key === key);
    if (!existing) {
      await supabase.from("month_entries").insert([{ client_id: session.id, month_key: key, label, is_finalized: false }]);
      setMonthEntries(prev => [{ client_id: session.id, month_key: key, label, is_finalized: false }, ...prev]);
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

  const NON_PARSEABLE_EXTS = [".png", ".jpg", ".jpeg", ".doc", ".docx"];
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
        let parsed: any[];
        if (file.name.toLowerCase().endsWith('.pdf')) {
          parsed = await parseBankPDF(buf, file.name, rememberedMappings, categoryRules);
        } else {
          parsed = parseExcelData(buf, file.name, rememberedMappings, categoryRules);
        }
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

    // reload month subs ואת activeMonth — ללא spinner
    const [{ data: freshSubs }, { data: freshEntry }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", session.id).eq("month_key", selectedMonthKey).order("created_at", { ascending: true }),
      supabase.from("month_entries").select("*").eq("client_id", session.id).eq("month_key", selectedMonthKey).maybeSingle(),
    ]);
    setMonthSubs(freshSubs || []);
    if (freshEntry) setActiveMonth(freshEntry);
    reloadSilent(); // רענן שאר הנתונים ברקע

    setScreen("month"); // go to month view (fallback if modal is dismissed)
    finalizeMonth();   // קפוץ ישירות למודל "רגע לפני שמסמנים הושלם"
  };

  const finalizeMonth = () => {
    if (!activeMonth) return;
    // קבע איזה מודל להציג לפי מספר החודשים שכבר הושלמו
    const doneCount = finalizedMonths.length;
    const modalType = doneCount >= 2 ? 'month3' : doneCount === 1 ? 'month2' : 'month1';
    setEstimates({});
    setOpenSections({});
    setFinalizeNote("");
    setFinalizeModal(modalType);
  };

  const doFinalize = async (saveEstimatesFirst = false) => {
    if (!activeMonth) return;
    setPendingFinalize(true);
    try {
      if (saveEstimatesFirst) {
        const entries = Object.entries(estimates)
          .filter(([, v]) => v && Number(v) > 0)
          .map(([category_name, monthly_amount]) => ({
            client_id: session.id,
            category_name,
            monthly_amount: Number(monthly_amount),
          }));
        if (entries.length > 0) {
          // מחיקת הערכות קיימות קודם, לאחר מכן הכנסה מחדש
          await supabase.from("category_estimates").delete().eq("client_id", session.id);
          await supabase.from("category_estimates").insert(entries);
        }
      }
      const updatePayload: Record<string, any> = { is_finalized: true };
      if (finalizeNote.trim()) updatePayload.finalize_note = finalizeNote.trim();
      await supabase
        .from("month_entries")
        .update(updatePayload)
        .eq("client_id", session.id)
        .eq("month_key", activeMonth.month_key);
      setMonthEntries(prev =>
        prev.map(e => e.month_key === activeMonth.month_key ? { ...e, is_finalized: true } : e)
      );
      reloadSilent();
      showToast("✅ החודש סומן כהושלם!");
      setScreen("dashboard");
    } finally {
      setPendingFinalize(false);
      setFinalizeModal(null);
    }
  };

  const reopenMonth = async (monthKey) => {
    await supabase.from("month_entries").update({ is_finalized: false }).eq("client_id", session.id).eq("month_key", monthKey);
    setMonthEntries(prev => prev.map(e => e.month_key === monthKey ? { ...e, is_finalized: false } : e));
    reloadSilent();
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
    supabase.from("client_change_log").insert([{ client_id: session.id, event_type: "remap_business", details: { business_name: businessName, from_cat: oldCat, to_cat: newCat } }]);
    // עדכון ישיר של portfolioSubs — ללא loadUserData כדי לא להרוס localEdits
    setPortfolioSubs(prev => prev.map(s => s.id === submissionId ? { ...s, transactions: newTxs } : s));
  };

  const deletePortfolioSub = async (submissionId) => {
    await supabase.from("portfolio_submissions").delete().eq("id", submissionId);
    setPortfolioSubs(prev => prev.filter(s => s.id !== submissionId));
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
    const total = subs.flatMap(s => s.transactions || []).filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + (incomeCats.has(t.cat) ? -t.amount : t.amount), 0);
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
      <div style={{ position:"sticky", top:0, zIndex:100, background:"#fdfcf9", borderBottom:"1px solid var(--border)", padding:"0 28px", display:"flex", alignItems:"stretch", justifyContent:"space-between", height:62, boxShadow:"0 1px 0 var(--border), 0 4px 20px rgba(30,77,53,0.05)" }}>
        {/* Right: Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:10, flexShrink:0, paddingLeft:20, borderLeft:"1.5px solid var(--border)" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:34, height:34, background:"var(--green-mid)", borderRadius:9, flexShrink:0, boxShadow:"0 2px 8px rgba(45,106,79,0.25)" }}>
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path d="M6 24 L12 16 L18 20 L26 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 10 H26 V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontFamily:"'Frank Ruhl Libre', serif", fontWeight:700, fontSize: 24, color:"var(--green-deep)", lineHeight:1, letterSpacing:"-0.3px" }}>מאזן</span>
        </div>

        {/* Center: Main tabs (only on dashboard) */}
        {screen === "dashboard" && (
          <div style={{ display:"flex", alignItems:"stretch" }}>
            {[
              ...(portfolioOpen ? [{ id:"portfolio", label:"תיק כלכלי" }] : []),
              ...(!portfolioOpen ? [{ id:"data", label:"חומרי בסיס" }] : []),
              ...(completedOnboarding ? [{ id:"personal", label:"פרטים אישיים" }] : []),
              ...(portfolioOpen ? [{ id:"analytics-trends", label:"מגמות" }] : []),
              ...(portfolioOpen ? [{ id:"analytics-forecast", label:"תחזית" }] : []),
            ].map(t => (
              <button key={t.id} onClick={() => switchTab(t.id)}
                onMouseEnter={e => { if (activeTab !== t.id) (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
                onMouseLeave={e => { if (activeTab !== t.id) (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
                style={{
                  padding: "0 20px",
                  fontSize: 17,
                  fontFamily: "inherit",
                  fontWeight: activeTab===t.id ? 700 : 400,
                  letterSpacing: "0.01em",
                  color: activeTab===t.id ? "var(--green-mid)" : "var(--text-dim)",
                  background: "none",
                  border: "none",
                  borderBottom: `3px solid ${activeTab===t.id ? "var(--green-mid)" : "transparent"}`,
                  borderTop: "3px solid transparent",
                  cursor: "pointer",
                  transition: "color 0.15s, border-color 0.15s",
                  whiteSpace: "nowrap",
                }}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Left: Avatar chip + dropdown */}
        <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
          {screen !== "dashboard" && <Btn variant="ghost" size="sm" onClick={() => setScreen("dashboard")}>ראשי</Btn>}
          <div style={{ position:"relative" }}>
            {/* Chip */}
            <button onClick={() => setShowUserMenu(v => !v)}
              style={{ display:"flex", alignItems:"center", gap:8, borderRadius:20, padding:"4px 10px 4px 4px", border:`1px solid ${showUserMenu ? "var(--green-soft)" : "var(--border)"}`, background: showUserMenu ? "var(--green-pale)" : "var(--surface)", cursor:"pointer", transition:"all 0.15s", fontFamily:"inherit" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"linear-gradient(135deg, var(--green-mid), var(--green-deep))", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 14, fontWeight:700, color:"#fff", flexShrink:0, letterSpacing:"0.02em" }}>
                {(session.name||"?").charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 15, fontWeight:500, color:"var(--text-mid)", letterSpacing:"0.01em" }}>{session.name}</span>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transition:"transform 0.2s", transform: showUserMenu ? "rotate(180deg)" : "rotate(0deg)", color:"var(--text-dim)" }}>
                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {/* Dropdown */}
            {showUserMenu && (
              <>
                <div onClick={() => setShowUserMenu(false)} style={{ position:"fixed", inset:0, zIndex:199 }} />
                <div style={{ position:"absolute", left:0, top:"calc(100% + 8px)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, boxShadow:"0 8px 32px rgba(30,77,53,0.12)", zIndex:200, minWidth:140, overflow:"hidden" }}>
                  <button onClick={() => { setShowUserMenu(false); onLogout(); }}
                    style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"11px 16px", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize: 16, color:"var(--text-mid)", textAlign:"right", transition:"background 0.12s" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface2)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    התנתק
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Welcome modal for new clients */}
      {showWelcome && (
        <>
          <style>{`@keyframes welcomeModalIn { from { transform: translate(-50%,-48%) scale(0.96); opacity:0; } to { transform: translate(-50%,-50%) scale(1); opacity:1; } }`}</style>
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:9000 }} onClick={dismissWelcome} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, padding:"36px 32px", zIndex:9001, width:"min(480px,90vw)", textAlign:"center", boxShadow:"0 24px 60px rgba(0,0,0,0.25)", animation:"welcomeModalIn 250ms cubic-bezier(0.16,1,0.3,1)" }}>
            {/* Close button */}
            <button onClick={dismissWelcome} style={{ position:"absolute", top:14, left:16, background:"none", border:"none", cursor:"pointer", color:"var(--text-dim)", display:"flex", alignItems:"center", padding:6, borderRadius:8 }}>
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            {/* Icon */}
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16, color:"var(--green-mid)" }}>
              <svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                <path d="M20 3v4"/><path d="M22 5h-4"/>
                <path d="M4 17v2"/><path d="M5 18H3"/>
              </svg>
            </div>
            <div style={{ fontWeight:700, fontSize:22, marginBottom:10 }}>ברוכים הבאים!</div>
            <div style={{ color:"var(--text-dim)", fontSize:15, lineHeight:1.8, marginBottom:28, textAlign:"right" }}>
              כדי שיוכל אלון לבנות לכם תכנית פיננסית מדויקת,<br/>
              נצטרך מכם מספר מסמכים. הרשימה המלאה מחכה לכם בדף הבא.
            </div>
            <Btn onClick={dismissWelcome} style={{ width:"100%", justifyContent:"center" }}>
              ← מובן, בואו נתחיל!
            </Btn>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position:"fixed", bottom:24, right:24, background:"var(--green-deep)", color:"#fff", borderRadius:12, padding:"12px 20px", fontSize: 15, zIndex:9999, boxShadow:"0 8px 32px rgba(30,77,53,0.3)" }}>
          {toast}
        </div>
      )}

      {/* ── מודל בדיקת כיסוי קטגוריות (popup A — חודשים 1-2) ────────────────── */}
      {(finalizeModal === 'month1' || finalizeModal === 'month2') && (
        <FinalizeCheckModal
          monthLabel={activeMonth?.label || ""}
          emptyCats={emptyCatsCurrentMonth}
          isMonth3={false}
          estimates={estimates}
          onEstimateChange={() => {}}
          openSections={openSections}
          onToggleSection={(s) => setOpenSections(p => ({ ...p, [s]: !p[s] }))}
          finalizeNote={finalizeNote}
          onFinalizeNoteChange={setFinalizeNote}
          pending={pendingFinalize}
          onBack={() => setFinalizeModal(null)}
          onConfirm={() => doFinalize(false)}
        />
      )}

      {/* ── מודל בדיקת כיסוי קטגוריות (popup B — חודש 3) ──────────────────────── */}
      {finalizeModal === 'month3' && (
        <FinalizeCheckModal
          monthLabel={activeMonth?.label || ""}
          emptyCats={emptyCatsAllMonths}
          isMonth3={true}
          estimates={estimates}
          onEstimateChange={(cat, val) => setEstimates(p => ({ ...p, [cat]: val }))}
          openSections={openSections}
          onToggleSection={(s) => setOpenSections(p => ({ ...p, [s]: !p[s] }))}
          finalizeNote={finalizeNote}
          onFinalizeNoteChange={setFinalizeNote}
          pending={pendingFinalize}
          onBack={() => setFinalizeModal(null)}
          onConfirm={() => doFinalize(true)}
        />
      )}

      {/* ── מודל הערת הגשה (popup C) ─────────────────────────────────────────── */}
      {showSubmissionNoteModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:"var(--surface)", borderRadius:18, padding:"32px 28px", maxWidth:500, width:"100%", boxShadow:"0 24px 64px rgba(0,0,0,0.35)", direction:"rtl" }}>
            <div style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>רגע לפני ההגשה ✋</div>
            <div style={{ fontSize:15, color:"var(--text-dim)", marginBottom:20, lineHeight:1.7 }}>
              לעיתים יש חודשים חריגים — נסיעה גדולה לחו"ל, קנייה חד-פעמית, הוצאה יוצאת דופן.
              אם יש משהו שאלון צריך לדעת כדי להבין את התמונה נכון — כתוב כאן.
            </div>
            <textarea
              value={submissionNote}
              onChange={e => setSubmissionNote(e.target.value)}
              placeholder='לדוגמה: "הייתה לנו נסיעה לתאילנד בעלות ₪40,000 — לא אופייני בכלל"'
              rows={4}
              style={{
                width:"100%", boxSizing:"border-box", resize:"vertical",
                background:"var(--surface2)", border:"1px solid var(--border)",
                borderRadius:10, padding:"12px 14px", fontSize:15, color:"var(--text)",
                fontFamily:"inherit", lineHeight:1.6, marginBottom:20, outline:"none",
              }}
            />
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <Btn variant="ghost" onClick={async () => {
                setSubmittingNote(true);
                await supabase.from("clients").update({ submitted_at: new Date().toISOString(), completion_email_sent: true }).eq("id", session.id);
                await sendCompletionEmail(session.name);
                setSubmittedAt(new Date().toISOString());
                setShowSubmissionNoteModal(false);
                setSubmittingNote(false);
                showToast("🎉 הטופס הוגש! נשלחה הודעה לאלון.");
              }} disabled={submittingNote}>הגש בלי הערה</Btn>
              <Btn onClick={async () => {
                setSubmittingNote(true);
                if (submissionNote.trim()) {
                  await supabase.from("clients").update({ submission_notes: submissionNote.trim() }).eq("id", session.id);
                }
                await supabase.from("clients").update({ submitted_at: new Date().toISOString(), completion_email_sent: true }).eq("id", session.id);
                await sendCompletionEmail(session.name);
                setSubmittedAt(new Date().toISOString());
                setShowSubmissionNoteModal(false);
                setSubmittingNote(false);
                showToast("🎉 הטופס הוגש! נשלחה הודעה לאלון.");
              }} disabled={submittingNote}>{submittingNote ? "מגיש..." : "הגש עם הערה"}</Btn>
            </div>
          </div>
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
        <>
          {/* Full-width sticky sub-tab strip */}
          {(activeTab === "data" || activeTab === "portfolio") && (
            <div style={{ background:"var(--surface2)", borderBottom:"1px solid var(--border)", position:"sticky", top:62, zIndex:90 }}>
              <div style={{ maxWidth:960, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", height:46, gap:2 }}>
                {activeTab === "data" && (
                  [
                    { id:"documents", label:"מסמכים" },
                    { id:"questionnaire", label:"שאלון אישי" },
                  ].map(t => (
                    <button key={t.id} onClick={() => setDataSubTab(t.id)}
                      onMouseEnter={e => { if (dataSubTab !== t.id) (e.currentTarget as HTMLElement).style.background = "rgba(216,243,220,0.5)"; }}
                      onMouseLeave={e => { if (dataSubTab !== t.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      style={{
                        padding:"5px 18px", fontSize: 15, fontFamily:"inherit",
                        fontWeight: dataSubTab===t.id ? 700 : 400,
                        color: dataSubTab===t.id ? "#fff" : "var(--text-dim)",
                        background: dataSubTab===t.id ? "var(--green-mid)" : "transparent",
                        border:"none", borderRadius:20,
                        cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap",
                        letterSpacing:"0.01em",
                        boxShadow: dataSubTab===t.id ? "0 2px 8px rgba(45,106,79,0.25)" : "none",
                      }}>
                      {t.label}
                    </button>
                  ))
                )}
                {activeTab === "portfolio" && (
                  [
                    { id:"txs",     label:"פירוט תנועות" },
                    { id:"control", label:"בקרת תיק כלכלי" },
                    { id:"savings", label:"פירוט חסכונות" },
                    { id:"balance", label:"מאזן מתוכנן" },
                    { id:"debts",   label:"מנהל חובות" },
                    { id:"tools",   label:"כלים לצמיחה" },
                  ].map(t => (
                    <button key={t.id} onClick={() => switchPortfolioSubTab(t.id)}
                      onMouseEnter={e => { if (portfolioSubTab !== t.id) (e.currentTarget as HTMLElement).style.background = "rgba(216,243,220,0.5)"; }}
                      onMouseLeave={e => { if (portfolioSubTab !== t.id) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      style={{
                        padding:"5px 16px", fontSize: 15, fontFamily:"inherit",
                        fontWeight: portfolioSubTab===t.id ? 600 : 400,
                        color: portfolioSubTab===t.id ? "var(--green-deep)" : "var(--text-dim)",
                        background: portfolioSubTab===t.id ? "var(--green-mint)" : "transparent",
                        border:"none", borderRadius:20,
                        cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap",
                        letterSpacing:"0.01em",
                      }}>
                      {t.label}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          <div style={{ maxWidth:960, margin:"0 auto", padding:"24px 20px" }}>

          {/* Questionnaire sub-tab */}
          {activeTab === "data" && dataSubTab === "questionnaire" && (
            <CoachingQuestionnaire session={session} spousesCount={questionnaireSpouses || 1} onNavigateBack={() => setDataSubTab("documents")} />
          )}

          {/* Onboarding checklist — מוצג בטאב data לפני השלמה */}
          {!submittedAt && activeTab === "data" && dataSubTab === "documents" && (
            <OnboardingChecklist
              session={session}
              finalizedMonths={finalizedMonths}
              inProgressMonths={monthEntries.filter(e => !e.is_finalized && submissions.some(s => s.month_key === e.month_key))}
              payslips={payslips}
              docs={clientDocs}
              submittedAt={submittedAt}
              requiredDocs={requiredDocs}
              questionnaireSpouses={questionnaireSpouses}
              docNotes={docNotes}
              customDocs={customDocs}
              spouseNames={spouseNames}
              employmentTypes={employmentTypes}
              noPayslipReasons={noPayslipReasons}
              onNavigateTxs={openNewMonth}
              onOpenExistingMonth={openMonth}
              onNavigatePayslips={(spouseIdx: 1|2) => { setActivePayslipSpouse(spouseIdx); setScreen("payslips"); }}
              onNoPayslipReasonSave={async (spouseIdx: 1|2, reason: string) => {
                const col = spouseIdx === 1 ? "no_payslip_reason_s1" : "no_payslip_reason_s2";
                await supabase.from("clients").update({ [col]: reason || null }).eq("id", session.id);
                setNoPayslipReasons(prev => ({ ...prev, [spouseIdx === 1 ? "s1" : "s2"]: reason || null }));
              }}
              onNavigateQuestionnaire={() => { switchTab("data"); setDataSubTab("questionnaire"); }}
              onMonthsChange={reloadSilent}
              onDocsChange={async () => {
                const { data } = await supabase.from("client_documents").select("*").eq("client_id", session.id);
                setClientDocs(data || []);
              }}
              onSubmit={(existingNote?: string) => {
                setSubmissionNote(existingNote || "");
                setShowSubmissionNoteModal(true);
              }}
            />
          )}

          {/* DATA TAB */}
          {activeTab === "data" && completedOnboarding && dataSubTab === "documents" && (
            <div>
              {/* KPIs */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:24 }}>
                <KpiCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 16 11 18 15 14"/></svg>} label={finalizedMonths.length >= REQUIRED_MONTHS ? "חודשים שהועלו" : `חודשים שהועלו (נדרש: ${REQUIRED_MONTHS})`} value={finalizedMonths.length >= REQUIRED_MONTHS ? `✓ ${finalizedMonths.length}` : `${finalizedMonths.length} / ${REQUIRED_MONTHS}`} />
                <KpiCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>} label="מיפויים שנזכרו" value={Object.keys(rememberedMappings).length} />
                <KpiCard icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>} label="הוצאות אחרונות" value={(() => {
                  const last = monthEntries[0];
                  if (!last) return "—";
                  const subs = submissions.filter(s => s.month_key === last.month_key);
                  const total = subs.flatMap(s => s.transactions||[]).filter(t => !ignoredCats.has(t.cat)).reduce((sum,t) => sum+(incomeCats.has(t.cat)?-t.amount:t.amount), 0);
                  return "₪" + Math.round(total).toLocaleString();
                })()} color={"var(--red)"} />
              </div>

              {/* Chart */}
              {chartData.length > 1 && completedOnboarding && (
                <Card style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:700, marginBottom:16, fontSize: 17, color:"var(--green-deep)", letterSpacing:"-0.1px" }}>הוצאות לאורך זמן</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={"var(--border)"} /><XAxis dataKey="name" tick={{ fill:"var(--text-dim)", fontSize: 13 }} /><YAxis tick={{ fill:"var(--text-dim)", fontSize: 13 }} /><Tooltip contentStyle={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, color:"var(--text)", fontFamily:"'Heebo'" }} /><Bar dataKey="הוצאות" fill={"var(--green-mid)"} radius={[4,4,0,0]} /></BarChart>
                  </ResponsiveContainer>
                </Card>
              )}


              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontWeight:700, fontSize: 17, color:"var(--green-deep)", letterSpacing:"-0.1px" }}>חודשים שהוזנו</div>
                <div style={{ display:"flex", gap:8 }}>
                  {monthEntries.length < REQUIRED_MONTHS && <Btn size="sm" onClick={openNewMonth}>+ הוסף חודש</Btn>}
                </div>
              </div>

              {monthEntries.length === 0 ? (
                <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
                  <div style={{ display:"flex", justifyContent:"center", marginBottom:12, opacity:0.4 }}><DocIcon name="folder" color="var(--text-dim)" size={36} /></div>
                  <div>לחץ "+ הוסף חודש" כדי להתחיל</div>
                </Card>
              ) : monthEntries.map(entry => {
                const subs = submissions.filter(s => s.month_key === entry.month_key);
                const allTx = subs.flatMap(s => s.transactions || []);
                const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + (incomeCats.has(t.cat)?-t.amount:t.amount), 0);
                const top3 = (Object.entries(allTx.reduce((acc: Record<string,number>,t)=>{if(!ignoredCats.has(t.cat)){acc[t.cat]=(acc[t.cat]||0)+(incomeCats.has(t.cat)?-t.amount:t.amount);}return acc;},{} as Record<string,number>)) as [string,number][]).sort((a,b)=>b[1]-a[1]).slice(0,3);
                return (
                  <Card key={entry.id || entry.month_key} style={{ marginBottom:12, border:`1px solid ${entry.is_finalized?"rgba(46,204,138,0.25)":"var(--border)"}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
                      <div style={{ flex:1, cursor:"pointer", transition:"opacity 0.15s" }} onClick={() => openMonth(entry)} onMouseEnter={e=>(e.currentTarget as HTMLElement).style.opacity="0.8"} onMouseLeave={e=>(e.currentTarget as HTMLElement).style.opacity="1"}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                          <div style={{ fontWeight:700, fontSize: 18 }}>{entry.label}</div>
                          {entry.is_finalized
                            ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"2px 10px", fontSize: 13, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><DocIcon name="check-circle" color="var(--green-soft)" size={13} /> הושלם</span>
                            : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"2px 10px", fontSize: 13 }}>בתהליך</span>
                          }
                        </div>
                        <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:8 }}>{subs.length} מקורות · {allTx.length} תנועות</div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          {top3.map(([cat,amt]) => <span key={cat} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:20, padding:"2px 10px", fontSize: 14, color:"var(--text-mid)" }}>{cat}: ₪{Math.round(amt).toLocaleString()}</span>)}
                        </div>
                        <div style={{ fontSize: 13, color:"var(--text-dim)", marginTop:6, display:"flex", alignItems:"center", gap:4 }}>לחץ לפרטים <span style={{ fontSize:16 }}>←</span></div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                        <div style={{ fontWeight:800, fontSize: 22, color:"var(--red)" }}>₪{Math.round(total).toLocaleString()}</div>
                        <div style={{ display:"flex", gap:6 }}>
                          <Btn variant="ghost" size="sm" onClick={e => { e.stopPropagation(); exportMonthToExcel(entry); }}>Excel ↓</Btn>
                          <button onClick={async e => { e.stopPropagation(); if (!window.confirm(`למחוק את ${entry.label}?`)) return; await supabase.from("submissions").delete().eq("client_id", session.id).eq("month_key", entry.month_key); await supabase.from("month_entries").delete().eq("client_id", session.id).eq("month_key", entry.month_key); await loadUserData(); }} style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"3px 8px", fontSize: 13, color:"var(--red)", cursor:"pointer", fontFamily:"inherit" }}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* PORTFOLIO TAB */}
          {activeTab === "portfolio" && portfolioOpen && (
            <PortfolioTab
              clientId={session.id}
              clientPlan={clientPlan}
              portfolioMonths={portfolioMonths}
              portfolioSubs={portfolioSubs}
              onDataChange={reloadSilent}
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
              activeSubTab={portfolioSubTab}
              visitedSubTabs={visitedPortfolioSubTabs}
              onSubTabChange={switchPortfolioSubTab}
            />
          )}

          {/* PERSONAL TAB */}
          {completedOnboarding && activeTab === "personal" && (
            <ClientPersonalTab session={session} />
          )}

          {/* ANALYTICS TRENDS TAB — מגמות (lazy mount) */}
          {portfolioOpen && visitedTabs.has("analytics-trends") && (
            <div style={{ display: activeTab === "analytics-trends" ? "block" : "none" }}>
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
            </div>
          )}

          {/* ANALYTICS FORECAST TAB — תחזית (lazy mount) */}
          {portfolioOpen && visitedTabs.has("analytics-forecast") && (
            <div style={{ display: activeTab === "analytics-forecast" ? "block" : "none" }}>
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
            </div>
          )}
          </div>
        </>
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
          incomeCats={incomeCats}
          onAddSource={() => openUpload(activeMonth.month_key, activeMonth.label)}
          onFinalize={finalizeMonth}
          onReopen={() => reopenMonth(activeMonth.month_key)}
          onBack={() => setScreen("dashboard")}
          onDeleteSub={async (subId) => {
            await supabase.from("submissions").delete().eq("id", subId);
            setMonthSubs(prev => prev.filter(s => s.id !== subId));
            reloadSilent();
          }}
          onUpdateSub={async (subId, newTx) => {
            await supabase.from("submissions").update({ transactions: newTx }).eq("id", subId);
            setMonthSubs(prev => prev.map(s => s.id === subId ? { ...s, transactions: newTx } : s));
            reloadSilent();
          }}
        />
      )}

      {/* ── UPLOAD ── */}
      {screen === "upload" && (
        <div style={{ maxWidth:640, margin:"0 auto", padding:"28px 20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
            <Btn variant="ghost" size="sm" onClick={() => { if (uploadSource === "month" && activeMonth) setScreen("month"); else setScreen("dashboard"); }}>← חזור</Btn>
            <div style={{ fontWeight:700, fontSize: 20, color:"var(--green-deep)", letterSpacing:"-0.3px" }}>הוסף תנועות — {selectedMonthLabel}</div>
          </div>

          <Card style={{ marginBottom:16 }}>
            <div style={{ fontWeight:600, marginBottom:8, fontSize: 16, color:"var(--text-mid)" }}>שם המקור</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:10 }}>
              {["כלול בכרטיס","עו\"ש","אחר"].map(s => (
                <button type="button" key={s} onClick={() => setSourceLabel(s)} style={{ padding:"12px 28px", borderRadius:12, fontSize: 18, fontWeight:700, cursor:"pointer", fontFamily:"inherit", border:`2px solid ${sourceLabel===s?"var(--green-mid)":"var(--border)"}`, background:sourceLabel===s?"var(--green-mint)":"var(--surface2)", color:sourceLabel===s?"var(--green-deep)":"var(--text-dim)", boxShadow: sourceLabel===s?"0 2px 8px rgba(45,106,79,0.2)":"none", transition:"all 0.15s" }}>{s}</button>
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
            <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:16 }}>Excel, CSV, PDF, Word, תמונות וכל קובץ פיננסי רלוונטי</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.ods" multiple style={{ display:"none" }} onChange={e => handleFiles(e.target.files)} />
            <Btn onClick={() => fileInputRef.current?.click()}>בחר קבצים</Btn>
          </div>

          {uploadedFiles.length > 0 && (
            <Card style={{ marginBottom:16 }}>
              {uploadedFiles.map((f,i) => {
                const res = analyzeResults.find(r => r.name === f.name);
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<uploadedFiles.length-1?`1px solid ${"var(--border)"}22`:"none" }}>
                    <span style={{ fontSize: 15 }}>📄 {f.name}</span>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {res && (
                        <span style={{ fontSize: 13, color: res.error ? "var(--red)" : res.count === 0 ? "var(--gold)" : "var(--green-soft)" }}>
                          {res.error ? `⚠️ ${res.error}` : res.count === 0 ? "⚠️ לא זוהו תנועות" : `✓ ${res.count} תנועות`}
                        </span>
                      )}
                      {analyzing && !res && <span style={{ fontSize: 13, color:"var(--text-dim)" }}>מנתח...</span>}
                      <button onClick={() => setUploadedFiles(p => p.filter((_,j) => j!==i))} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize: 18 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {analyzeResults.length > 0 && !analyzing && analyzeResults.every(r => r.count === 0) && (
            <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid var(--gold)", borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize: 15, color:"var(--gold)" }}>
              ⚠️ לא זוהו תנועות באף קובץ. בדוק שהקבצים הם Excel/CSV עם עמודות תאריך, שם ועסק וסכום.
            </div>
          )}

          <Btn onClick={analyzeFiles} disabled={uploadedFiles.length === 0 || !sourceLabel || analyzing} style={{ width:"100%", justifyContent:"center" }}>
            {analyzing ? "מנתח..." : "נתח תנועות ←"}
          </Btn>
        </div>
      )}

      {/* ── REVIEW ── */}
      {screen === "review" && (
        <div style={{ maxWidth:800, margin:"0 auto", padding:"28px 20px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Btn variant="ghost" size="sm" onClick={() => setScreen("upload")}>← חזור</Btn>
              <div style={{ fontWeight:700, fontSize: 20, color:"var(--green-deep)", letterSpacing:"-0.3px" }}>סיווג תנועות</div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize: 15, color:"var(--text-dim)", alignSelf:"center" }}>{transactions.length} תנועות</span>
              <Btn size="sm" onClick={saveSubmission}>שמור ←</Btn>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
            {[["all","הכל"],["low","ביטחון נמוך"],["edited","נערך"]].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding:"6px 16px", borderRadius:20, fontSize: 16, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${filter===v?"var(--green-mid)":"var(--border)"}`, background:filter===v?"var(--green-mint)":"transparent", color:filter===v?"var(--green-deep)":"var(--text-mid)" }}>{l}</button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." style={{ flex:1, minWidth:120, background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:20, padding:"6px 16px", color:"var(--text)", fontSize: 16, fontFamily:"inherit", outline:"none" }} />
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

          {(() => {
            const isPdf = (tx: any) => (tx.source || '').toLowerCase().endsWith('.pdf');
            const toggleFlowType = (id: any) => {
              setTransactions(prev => prev.map(t =>
                t.id === id
                  ? { ...t, flow_type: t.flow_type === 'credit_transfer' ? 'expense' : 'credit_transfer' }
                  : t
              ));
            };

            const incomeTxs        = filteredTx.filter(tx => tx.maxCat === 'הכנסות');
            const creditTransferTxs = filteredTx.filter(tx => tx.maxCat !== 'הכנסות' && tx.flow_type === 'credit_transfer');
            const expenseTxs       = filteredTx.filter(tx => tx.maxCat !== 'הכנסות' && tx.flow_type !== 'credit_transfer');
            const hasIncome         = incomeTxs.length > 0;
            const hasTransfers      = creditTransferTxs.length > 0;

            const toggleSelect = (id: any) => setSelectedTxIds(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });

            const renderTxCard = (tx: any, inTransferSection = false) => {
              const isKnown  = !!rememberedMappings[tx.name];
              const needsCat = tx.conf === 'low' && tx.cat === 'הוצאות לא מתוכננות' && isPdf(tx) && !inTransferSection;
              const isSelected = selectedTxIds.has(tx.id);
              return (
              <Card key={tx.id} onClick={() => { if (activeTxId === tx.id || activeTxId === `note_${tx.id}`) { setActiveTxId(null); } else { toggleSelect(tx.id); } }} style={{ marginBottom:10, padding:"14px 18px", opacity: inTransferSection ? 0.85 : 1, cursor:"pointer", border: isSelected ? "2px solid var(--green-mid)" : "1px solid var(--border)", background: isSelected ? "var(--green-pale)" : "var(--surface)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                  <div style={{ flex:1, display:"flex", alignItems:"flex-start", gap:10 }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(tx.id)} onClick={e => e.stopPropagation()}
                      style={{ marginTop:3, width:16, height:16, cursor:"pointer", accentColor:"var(--green-mid)", flexShrink:0 }} />
                    <div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:600, fontSize: 17 }}>{tx.name}</span>
                      <span style={{ fontSize: 12, padding:"2px 8px", borderRadius:20, fontWeight:600,
                        background: isKnown ? "rgba(46,204,138,0.12)" : "rgba(255,183,77,0.12)",
                        color: isKnown ? "var(--green-soft)" : "var(--gold)",
                        border: `1px solid ${isKnown ? "rgba(46,204,138,0.3)" : "rgba(255,183,77,0.3)"}`,
                      }}>{isKnown ? "מוכר" : "חדש"}</span>
                    </div>
                    <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{tx.date}</div>
                    {tx.note && <div style={{ fontSize: 14, color:"var(--text-mid)", marginTop:3, fontStyle:"italic" }}>{tx.note}</div>}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontWeight:700, color: tx.maxCat === 'הכנסות' ? "var(--green-mid)" : "var(--red)", fontSize: 17 }}>
                      {tx.maxCat === 'הכנסות' ? '+' : ''}₪{tx.amount.toLocaleString()}
                    </span>
                    {!inTransferSection && (
                      <>
                        <button type="button"
                          onClick={e => { e.stopPropagation(); setActiveTxId(tx.id === activeTxId ? null : tx.id); setCatSearch(""); setPendingRemember(null); }}
                          style={{ background: needsCat ? "rgba(192,57,43,0.08)" : "var(--green-mint)", border:`1px solid ${needsCat ? "var(--red)" : "var(--green-soft)"}`, borderRadius:20, padding:"5px 14px", fontSize: 15, color: needsCat ? "var(--red)" : "var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}
                        >{needsCat ? '⚠️ דרוש סיווג' : tx.cat}</button>
                        {tx.cat !== 'להתעלם' ? (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); setPrevCatMap(p => ({...p, [tx.id]: tx.cat})); setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, cat:"להתעלם", edited:true, conf:"high" } : t)); setActiveTxId(null); }}
                            title="התעלם מתנועה זו — לא תיספר"
                            style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize: 15, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                          >⊘</button>
                        ) : prevCatMap[tx.id] ? (
                          <button type="button"
                            onClick={e => { e.stopPropagation(); const prev = prevCatMap[tx.id]; setTransactions(p => p.map(t => t.id === tx.id ? { ...t, cat:prev, edited:true, conf:"high" } : t)); setPrevCatMap(p => { const n={...p}; delete n[tx.id]; return n; }); }}
                            title="בטל התעלמות"
                            style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"5px 10px", fontSize:13, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}
                          >↩️ {prevCatMap[tx.id]}</button>
                        ) : null}
                      </>
                    )}
                    <button
                      onClick={() => setActiveTxId(activeTxId === `note_${tx.id}` ? null : `note_${tx.id}`)}
                      style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize: 15, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                      title="הוסף הערה"
                    >✎</button>
                    {isPdf(tx) && (
                      <button
                        onClick={() => toggleFlowType(tx.id)}
                        title={inTransferSection ? "הזז להוצאות רגילות" : "סמן כחיוב אשראי — לא ייספר בהוצאות"}
                        style={{ background: inTransferSection ? "var(--green-mint)" : "transparent", border:`1px solid ${inTransferSection ? "var(--green-soft)" : "var(--border)"}`, borderRadius:8, padding:"5px 10px", fontSize: 14, color: inTransferSection ? "var(--green-deep)" : "var(--text-dim)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}
                      >{inTransferSection ? "↩ הוצאה" : "כלול בכרטיס"}</button>
                    )}
                  </div>
                </div>
                {!inTransferSection && activeTxId === tx.id && (
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
                      setTransactions(prev => prev.map(t =>
                        t.id === tx.id ? { ...t, cat, edited: true, conf: "high" } : t
                      ));
                      setActiveTxId(null); setCatSearch("");
                      setPendingRemember({ name: tx.name, cat });
                    }}
                  />
                )}
                {activeTxId === `note_${tx.id}` && (
                  <div style={{ marginTop:10 }}>
                    <input autoFocus value={tx.note || ""} onChange={e => updateTxNote(tx.id, e.target.value)}
                      placeholder="הוסף הערה לעסקה זו..."
                      style={{ width:"100%", background:"var(--surface2)", border:"1.5px solid var(--green-soft)", borderRadius:8, padding:"8px 12px", color:"var(--text)", fontFamily:"inherit", fontSize: 16, outline:"none", boxSizing:"border-box" }}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setActiveTxId(null); }}
                    />
                    <div style={{ fontSize: 13, color:"var(--text-dim)", marginTop:4 }}>Enter או Escape לסגור</div>
                  </div>
                )}
              </Card>
              );
            };

            return (
              <>
                {hasIncome && (
                  <>
                    <div style={{ fontWeight:800, fontSize: 20, color:"var(--green-deep)", marginBottom:10, marginTop:8, padding:"10px 14px", background:"var(--green-mint)", borderRadius:10, display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid var(--green-soft)" }}>
                      הכנסות <span style={{ fontWeight:500, color:"var(--green-mid)", fontSize: 16 }}>({incomeTxs.length})</span>
                    </div>
                    {incomeTxs.map(tx => renderTxCard(tx, false))}
                  </>
                )}
                {expenseTxs.length > 0 && (
                  <div style={{ fontWeight:800, fontSize: 20, color:"var(--red)", marginBottom:10, marginTop: hasIncome ? 16 : 8, padding:"10px 14px", background:"var(--red-light)", borderRadius:10, display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid var(--red)" }}>
                    הוצאות <span style={{ fontWeight:500, color:"var(--text-dim)", fontSize: 16 }}>({expenseTxs.length})</span>
                  </div>
                )}
                {expenseTxs.map(tx => renderTxCard(tx, false))}
                {hasTransfers && (
                  <>
                    <div style={{ fontWeight:800, fontSize: 20, color:"var(--text-dim)", marginBottom:6, marginTop:20, padding:"10px 14px", background:"var(--surface2)", borderRadius:10, display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid var(--border)" }}>
                      חיובי אשראי <span style={{ fontWeight:500, color:"var(--text-dim)", fontSize: 16 }}>({creditTransferTxs.length})</span>
                    </div>
                    <div style={{ fontSize: 15, color:"var(--text-dim)", background:"rgba(255,183,77,0.08)", border:"1px solid rgba(255,183,77,0.25)", borderRadius:8, padding:"8px 14px", marginBottom:10 }}>
                      תנועות אלו הן תשלומי כרטיס אשראי — <strong>לא נספרות כהוצאה</strong> כדי למנוע כפילות עם נתוני מקס/ישראכרט. לחץ על ↩ כדי להעביר להוצאות.
                    </div>
                    {creditTransferTxs.map(tx => renderTxCard(tx, true))}
                  </>
                )}
              </>
            );
          })()}

          {/* Bulk action bar */}
          {selectedTxIds.size > 0 && (
            <div style={{ position:"sticky", bottom:72, display:"flex", justifyContent:"center", marginTop:12, zIndex:100 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, background:"var(--green-deep)", color:"#fff", borderRadius:14, padding:"10px 20px", boxShadow:"0 4px 24px rgba(30,77,53,0.45)", fontSize: 16 }}>
                <span style={{ fontWeight:700 }}>{selectedTxIds.size} נבחרו</span>
                <button type="button" onClick={() => { setTransactions(prev => prev.map(t => selectedTxIds.has(t.id) ? { ...t, cat:"להתעלם", edited:true, conf:"high" } : t)); setSelectedTxIds(new Set()); }}
                  style={{ background:"rgba(255,255,255,0.15)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:8, padding:"5px 14px", fontSize: 15, color:"#fff", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                  ⊘ התעלם מנבחרים
                </button>
                <button type="button" onClick={() => { setTransactions(prev => prev.filter(t => !selectedTxIds.has(t.id))); setSelectedTxIds(new Set()); }}
                  style={{ background:"rgba(192,57,43,0.7)", border:"1px solid rgba(255,255,255,0.2)", borderRadius:8, padding:"5px 14px", fontSize: 15, color:"#fff", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                  מחק נבחרים
                </button>
                <button type="button" onClick={() => setSelectedTxIds(new Set())}
                  style={{ background:"transparent", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize: 20, padding:"0 4px" }}>×</button>
              </div>
            </div>
          )}

          {/* Save button at bottom too */}
          <div style={{ position:"sticky", bottom:20, display:"flex", justifyContent:"center", marginTop:8 }}>
            <Btn onClick={saveSubmission} style={{ boxShadow:"0 4px 20px rgba(45,106,79,0.3)", padding:"12px 36px", fontSize: 17 }}>שמור את כל הסיווגים ←</Btn>
          </div>
        </div>
      )}

      {/* ── PAYSLIPS ── */}
      {screen === "payslips" && (
        <PayslipsScreen
          clientId={session.id}
          payslips={payslips}
          spouseIndex={activePayslipSpouse}
          spouseName={activePayslipSpouse === 1 ? spouseNames.s1 : spouseNames.s2}
          subsCount={finalizedMonths.length}
          clientName={session.name}
          onDone={async () => {
            await loadUserData();
            setScreen("dashboard");
          }}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {/* ── פס צד יצירת קשר ── */}
      <a
        className="wa-sidebar-btn"
        href="https://wa.me/972542558557"
        target="_blank"
        rel="noreferrer"
        title="שלח הודעת WhatsApp"
        style={{
          position: "fixed",
          left: 0,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          background: "var(--green-mid)",
          borderRadius: "0 12px 12px 0",
          padding: "16px 10px",
          textDecoration: "none",
          boxShadow: "2px 0 18px rgba(45,106,79,0.18)",
          transition: "background 0.2s, box-shadow 0.2s",
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--green-deep)";
          (e.currentTarget as HTMLElement).style.boxShadow = "2px 0 24px rgba(45,106,79,0.3)";
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = "var(--green-mid)";
          (e.currentTarget as HTMLElement).style.boxShadow = "2px 0 18px rgba(45,106,79,0.18)";
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="white">
          <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.514L4 29l7.697-1.799A12.93 12.93 0 0016 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm6.406 16.594c-.27.755-1.59 1.44-2.184 1.527-.55.08-1.243.114-2.006-.126-.464-.147-1.06-.344-1.82-.674-3.196-1.38-5.287-4.603-5.447-4.815-.16-.212-1.3-1.73-1.3-3.3s.82-2.344 1.112-2.664c.291-.32.635-.4.847-.4.212 0 .423.002.608.01.195.01.457-.074.715.546.268.643.91 2.216.99 2.376.08.16.133.347.027.556-.107.212-.16.344-.32.53l-.48.558c-.16.16-.326.333-.14.653.186.32.826 1.362 1.773 2.206 1.218 1.086 2.245 1.422 2.564 1.582.32.16.507.133.694-.08.186-.212.8-.934.014-1.147-.787-.213-.16-1.067.16-1.067z"/>
        </svg>
        <span style={{
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
          fontSize: 12,
          color: "rgba(255,255,255,0.75)",
          letterSpacing: "0.06em",
          fontWeight: 500,
        }}>
          צור קשר
        </span>
      </a>
    </div>
  );
}

// ── Shared SVG Icon Component ─────────────────────────────────────────────────
function DocIcon({ name, color = "var(--green-mid)", size = 20 }: { name: string; color?: string; size?: number }) {
  const s: React.SVGProps<SVGSVGElement> = { width:size, height:size, viewBox:"0 0 24 24", fill:"none", stroke:color, strokeWidth:"1.75", strokeLinecap:"round", strokeLinejoin:"round" };
  if (name==="folder")       return <svg {...s}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
  if (name==="payslip")      return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
  if (name==="clipboard")    return <svg {...s}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="12" y1="11" x2="16" y2="11"/><line x1="12" y1="15" x2="16" y2="15"/></svg>;
  if (name==="coins")        return <svg {...s}><circle cx="8" cy="8" r="5"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><line x1="16.71" y1="13.88" x2="17" y2="18"/></svg>;
  if (name==="bar-chart")    return <svg {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>;
  if (name==="building")     return <svg {...s}><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 9l9-6 9 6"/><line x1="9" y1="21" x2="9" y2="12"/><line x1="15" y1="21" x2="15" y2="12"/></svg>;
  if (name==="user")         return <svg {...s}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
  if (name==="file")         return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
  if (name==="alert")        return <svg {...s} stroke={color||"var(--gold)"}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (name==="note")         return <svg {...s}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
  if (name==="pencil")       return <svg {...s}><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>;
  if (name==="link")         return <svg {...s}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>;
  if (name==="save")         return <svg {...s}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>;
  if (name==="check-circle") return <svg {...s}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
  if (name==="lightbulb")    return <svg {...s}><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>;
  if (name==="trash")        return <svg {...s}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>;
  if (name==="paperclip")    return <svg {...s}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
  if (name==="bank")         return <svg {...s}><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>;
  if (name==="car")          return <svg {...s}><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
  if (name==="home")         return <svg {...s}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (name==="briefcase")    return <svg {...s}><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
  if (name==="users")        return <svg {...s}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  if (name==="pin")          return <svg {...s}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
  if (name==="eye")          return <svg {...s}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
  if (name==="unlock")       return <svg {...s}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>;
  return <svg {...s}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;
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
        <div style={{ fontWeight:700, fontSize: 18, marginBottom:20, color:"var(--green-deep)" }}>הוסף חודש</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>חודש</div>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width:"100%", background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontFamily:"'Heebo',sans-serif", fontSize: 15, direction:"rtl" }}>
            {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>שנה</div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width:"100%", background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontFamily:"'Heebo',sans-serif", fontSize: 15, direction:"rtl" }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {alreadyUsed && <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid rgba(255,183,77,0.3)", borderRadius:8, padding:"8px 12px", fontSize: 14, color:"var(--gold)", marginBottom:14 }}>⚠️ חודש זה כבר קיים — לחץ עליו ברשימה</div>}
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={() => onConfirm(key, HEBREW_MONTHS[month], year)} disabled={alreadyUsed} style={{ flex:1, justifyContent:"center" }}>בחר ←</Btn>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
        </div>
      </div>
    </>
  );
}

// ── ConfirmModal — modal אישור מעוצב ──────────────────────────────────────────
function ConfirmModal({ title, body, confirmText = "אשר", danger = false, onConfirm, onCancel }: {
  title: string; body?: string; confirmText?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:28, zIndex:9001, width:340, boxShadow:"0 20px 60px rgba(0,0,0,0.4)", direction:"rtl" }}>
        <div style={{ fontWeight:700, fontSize:18, marginBottom: body ? 12 : 20, color: danger ? "var(--red)" : "var(--green-deep)" }}>{title}</div>
        {body && <div style={{ fontSize:15, color:"var(--text-dim)", marginBottom:20, lineHeight:1.6 }}>{body}</div>}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onConfirm} style={{ flex:1, padding:"10px 0", borderRadius:8, border:"none", background: danger ? "var(--red)" : "var(--green-mid)", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>{confirmText}</button>
          <button onClick={onCancel} style={{ padding:"10px 18px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)", fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
        </div>
      </div>
    </>
  );
}

// ── LoanFieldForm — מחוץ ל-OnboardingChecklist כדי למנוע remount בכל הקשה ──────
const LOAN_FLD_STYLE: React.CSSProperties = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize: 14, fontFamily:"inherit", outline:"none" };

function LoanFieldForm({ cat, fields, onChange }) {
  const f = fields || {};
  const set = (k, v) => onChange(cat, k, v);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
      {[["lender","שם המלווה"],["start_date","תאריך התחלה","date"],["end_date","תאריך סיום","date"],["amount","סכום ראשוני (₪)","number"],["monthly","החזר חודשי (₪)","number"]].map(([k,lbl,t]) => (
        <div key={k}>
          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>{lbl}</div>
          <input type={t||"text"} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={LOAN_FLD_STYLE} placeholder="..." />
        </div>
      ))}
      <div>
        <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>ריבית</div>
        <div style={{ display:"flex", gap:14, marginTop:6 }}>
          {["כן","לא"].map(v => (
            <label key={v} style={{ display:"flex", gap:5, alignItems:"center", fontSize: 15, cursor:"pointer" }}>
              <input type="radio" name={`int_${cat}`} checked={f.interest===v} onChange={()=>set("interest",v)} /> {v}
            </label>
          ))}
        </div>
      </div>
      <div style={{ gridColumn:"1/-1" }}>
        <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>הערות</div>
        <textarea value={f.notes||""} onChange={e=>set("notes",e.target.value)} rows={2} style={{ ...LOAN_FLD_STYLE, resize:"vertical" }} placeholder="פרטים נוספים..." />
      </div>
    </div>
  );
}

// ── Onboarding Checklist ──────────────────────────────────────────────────────
// type: "file" = קובץ בלבד | "fields" = שדות בלבד | "both" = שדות + קובץ אופציונלי
const LOAN_TYPES = [
  { id:"loan_bank",     label:"הלוואת בנק",          icon:"bank",       type:"file",   fileLabel:"פרטי הלוואה מהבנק" },
  { id:"loan_car",      label:"הלוואת רכב",           icon:"car",        type:"file",   fileLabel:"לוח סילוקין" },
  { id:"loan_mortgage", label:"משכנתה",               icon:"home",       type:"file",   fileLabel:"דוח יתרות משכנתה" },
  { id:"loan_work",     label:"הלוואת עבודה",         icon:"briefcase",  type:"fields" },
  { id:"loan_family",   label:"הלוואה מחבר/משפחה",   icon:"users",      type:"fields" },
  { id:"loan_other",    label:"הלוואה אחרת",          icon:"file",       type:"both" },
];

function OnboardingChecklist({ session, finalizedMonths, inProgressMonths, payslips, docs, submittedAt, requiredDocs, questionnaireSpouses, docNotes, customDocs, spouseNames, employmentTypes, noPayslipReasons, onNavigateTxs, onOpenExistingMonth, onNavigatePayslips, onNoPayslipReasonSave, onNavigateQuestionnaire, onDocsChange, onMonthsChange, onSubmit }) {
  spouseNames = spouseNames || { s1: null, s2: null };
  employmentTypes = employmentTypes || { s1: null, s2: null };
  noPayslipReasons = noPayslipReasons || { s1: null, s2: null };
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
  const [noPayslipInput, setNoPayslipInput]   = useState<{spouse: 1|2, val: string}|null>(null);
  const [cancelConfirmSpouse, setCancelConfirmSpouse] = useState<1|2|null>(null);
  const [summaryNote, setSummaryNote]         = useState("");  // הערות מסכמות לאחר 3 חודשים (משימה 4ב)
  const [summaryNoteSaving, setSummaryNoteSaving] = useState(false);
  const [bankAccountCount, setBankAccountCount] = useState(1);
  const [bankParseWarnings, setBankParseWarnings] = useState<Record<number,string>>({});
  const [bankTutorialSeen, setBankTutorialSeen] = useState(() =>
    !!localStorage.getItem(`bank_tutorial_seen_${session.id}`)
  );
  const fileRefs                      = useRef({});
  const summaryNoteTimerRef           = useRef<any>(null);

  // load submission_notes (summary note) on mount
  useEffect(() => {
    supabase.from("clients").select("submission_notes").eq("id", session.id).maybeSingle()
      .then(({ data }) => { if (data?.submission_notes) setSummaryNote(data.submission_notes); });
  }, [session.id]);

  const handleSummaryNoteChange = (val: string) => {
    setSummaryNote(val);
    clearTimeout(summaryNoteTimerRef.current);
    summaryNoteTimerRef.current = setTimeout(async () => {
      setSummaryNoteSaving(true);
      await supabase.from("clients").update({ submission_notes: val.trim() || null }).eq("id", session.id);
      setSummaryNoteSaving(false);
    }, 1200);
  };

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

  const txsDone = finalizedMonths.length >= 3;

  // תלושי שכר — מעקב לפי בן/בת זוג
  const hasSpouse2 = !!spouseNames.s2;
  // דוח רווח והפסד — לפי סוג עיסוק
  const needsPL = (type: string|null) => type === "עצמאי" || type === "גם וגם";
  const s1NeedsPL = needsPL(employmentTypes.s1);
  const s2NeedsPL = hasSpouse2 && needsPL(employmentTypes.s2);
  const s1Payslips = payslips.filter(p => !p.spouse_index || p.spouse_index === 1);
  const s2Payslips = payslips.filter(p => p.spouse_index === 2);
  const s1PayslipsDone = s1Payslips.length >= 3 || !!noPayslipReasons.s1;
  const s2PayslipsDone = !hasSpouse2 || s2Payslips.length >= 3 || !!noPayslipReasons.s2;
  const payslipsDone = s1PayslipsDone && s2PayslipsDone;

  const needsQuestionnaire = requiredDocs && requiredDocs.includes("questionnaire");
  const spousesCount       = questionnaireSpouses || 1;
  const questDone = !needsQuestionnaire || (questDoneMap[1] && (spousesCount < 2 || questDoneMap[2]));

  const getDoc    = cat => docs.find(d => d.category === cat);
  const isDone    = cat => !!getDoc(cat)?.marked_done;
  const hasFiles  = cat => (getDoc(cat)?.files || []).length > 0 || (pendingFiles[cat] || []).length > 0;

  const ALL_OPTIONAL = ["loans","provident","pl","savings","retirement","checks","debts_other"];
  const visibleOptional = requiredDocs ? ALL_OPTIONAL.filter(s => requiredDocs.includes(s)) : ALL_OPTIONAL;

  const optDoneMap = { loans: isDone("loans_section"), provident: isDone("provident_fund"), pl: (s1NeedsPL || s2NeedsPL) ? ((!s1NeedsPL || isDone("profit_loss_1")) && (!s2NeedsPL || isDone("profit_loss_2"))) : isDone("profit_loss"), savings: isDone("savings_pension"), retirement: isDone("retirement_forecast"), checks: isDone("deferred_checks"), debts_other: isDone("debts_other") };
  const allOptDone    = visibleOptional.every(s => optDoneMap[s]);

  const needsBankStmt = !!(requiredDocs && requiredDocs.includes("bank_stmt"));
  const bankAcctsDone = Array.from({ length: bankAccountCount }, (_, i) => i + 1).every(n => isDone(`bank_stmt_${n}`));
  const bankStmtDone  = !needsBankStmt || bankAcctsDone;
  const bankStmtPartial = needsBankStmt && !bankStmtDone &&
    Array.from({ length: bankAccountCount }, (_, i) => i + 1).some(n => hasFiles(`bank_stmt_${n}`) || isDone(`bank_stmt_${n}`));

  const requiredDone  = txsDone && payslipsDone && allOptDone && questDone && bankStmtDone;

  const REQUIRED_MONTHS = 3;
  const payslipPersonCount = hasSpouse2 ? 2 : 1;
  const totalItems     = REQUIRED_MONTHS + payslipPersonCount + visibleOptional.length + (needsQuestionnaire ? 1 : 0) + (needsBankStmt ? 1 : 0);
  const completedItems = Math.min(finalizedMonths.length, REQUIRED_MONTHS)
    + (s1PayslipsDone ? 1 : 0) + (hasSpouse2 && s2PayslipsDone ? 1 : 0)
    + visibleOptional.filter(s => optDoneMap[s]).length
    + (needsQuestionnaire && questDone ? 1 : 0)
    + (needsBankStmt && bankStmtDone ? 1 : 0);
  const progressPct    = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // load bankAccountCount from bank_stmt_meta extra_data
  useEffect(() => {
    const meta = docs.find(d => d.category === "bank_stmt_meta");
    if (meta?.extra_data?.num_accounts) setBankAccountCount(meta.extra_data.num_accounts);
  }, [docs]);

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

  const toggle = id => {
    setExpanded(e => e === id ? null : id);
    if (id !== "pays") setNoPayslipInput(null);
  };

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
    const { error: err1 } = await supabase.from("month_entries").update({ month_key: newKey, label: newLabel }).eq("id", editMonthEntry.id);
    if (err1) { setEditMonthErr("שגיאה בשמירה — " + err1.message); setEditMonthSaving(false); return; }
    const { error: err2 } = await supabase.from("submissions").update({ month_key: newKey }).eq("client_id", session.id).eq("month_key", editMonthEntry.month_key);
    if (err2) { setEditMonthErr("שגיאה בעדכון הגשות — " + err2.message); setEditMonthSaving(false); return; }
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

  const saveBankAccount = async (n: number) => {
    const cat = `bank_stmt_${n}`;
    setSaving(cat);
    // upload files
    const existing = getDoc(cat);
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    // try to detect bank from PDF files (best-effort — never block upload)
    const pdfFile = pending.find(f => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFile) {
      try {
        const buf = await pdfFile.arrayBuffer();
        await parseBankPDF(buf, pdfFile.name, {}, []);
        setBankParseWarnings(prev => { const n2 = {...prev}; delete n2[n]; return n2; });
      } catch (err: any) {
        setBankParseWarnings(prev => ({ ...prev, [n]: `הבנק לא זוהה אוטומטית — הקובץ הועלה, אבל לא ניתן לנתח אותו. ${err?.message || ""}` }));
      }
    }
    // save account doc as done
    if (existing) {
      await supabase.from("client_documents").update({ files: allFiles, marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label: `פירוט עו"ש — חשבון ${n}`, files: allFiles, marked_done: true }]);
    }
    setPendingFiles(prev => { const nv={...prev}; delete nv[cat]; return nv; });
    // upsert bank_stmt_meta with num_accounts
    const metaExisting = getDoc("bank_stmt_meta");
    const allNDone = Array.from({ length: bankAccountCount }, (_, i) => i + 1)
      .every(idx => idx === n ? true : isDone(`bank_stmt_${idx}`));
    if (metaExisting) {
      await supabase.from("client_documents").update({ extra_data: { num_accounts: bankAccountCount }, marked_done: allNDone }).eq("id", metaExisting.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: "bank_stmt_meta", label: `פירוט עו"ש`, files: [], extra_data: { num_accounts: bankAccountCount }, marked_done: allNDone }]);
    }
    await onDocsChange();
    if (allNDone) setExpanded(null);
    setSaving(null);
  };

  const addBankAccount = async () => {
    const newCount = bankAccountCount + 1;
    setBankAccountCount(newCount);
    // persist new count in meta
    const metaExisting = getDoc("bank_stmt_meta");
    if (metaExisting) {
      await supabase.from("client_documents").update({ extra_data: { num_accounts: newCount }, marked_done: false }).eq("id", metaExisting.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: "bank_stmt_meta", label: `פירוט עו"ש`, files: [], extra_data: { num_accounts: newCount }, marked_done: false }]);
    }
    await onDocsChange();
  };

  const handleSubmit = async () => {
    if (!requiredDone || submitting) return;
    setSubmitting(true);
    await onSubmit(summaryNote);
    setSubmitting(false);
  };

  const NoteBar = ({ docKey }: { docKey: string }) => {
    const note = docNotes[docKey];
    if (!note) return null;
    return <div style={{ fontSize: 14, color:"var(--text-mid)", background:"rgba(46,125,82,0.07)", borderRadius:6, padding:"6px 12px", marginBottom:6, borderRight:"3px solid var(--green-mid)", display:"flex", alignItems:"center", gap:6 }}><DocIcon name="pin" color="var(--green-mid)" size={14} />{note}</div>;
  };


  const SectionHeader = ({ id, icon, label, required = false, done, partial, onClick, onInfo = null }) => (
    <div
      role="button" tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background: done?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius: expanded===id?"10px 10px 0 0":10, border:`1px solid ${done?"rgba(46,204,138,0.3)":partial?"rgba(79,142,247,0.3)":"var(--border)"}`, cursor:"pointer", userSelect:"none" }}>
      <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>{icon}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600, fontSize: 16 }}>{label}</div>
        {required && <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", background: "rgba(220,38,38,0.1)", borderRadius: 20, padding: "2px 8px", display: "inline-block" }}>חובה</div>}
      </div>
      {done && <span style={{ background:"rgba(46,204,138,0.15)", color:"#22c55e", borderRadius:20, padding:"3px 12px", fontSize: 14, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><DocIcon name="check-circle" color="#22c55e" size={14} /> הושלם</span>}
      {!done && partial && <span style={{ background:"rgba(79,142,247,0.12)", color:"var(--green-mid)", borderRadius:20, padding:"3px 12px", fontSize: 14 }}>בתהליך</span>}
      {onInfo && (
        <button
          onClick={e => { e.stopPropagation(); onInfo(); }}
          title="צפה שוב בהדרכה"
          aria-label="צפה שוב בהדרכה"
          style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-dim)", padding:"4px", borderRadius:6, display:"flex", alignItems:"center", flexShrink:0, transition:"color 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "var(--green-mid)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
        >
          <DocIcon name="play-circle" size={15} color="currentColor" />
        </button>
      )}
      <span style={{ color:"var(--text-dim)", fontSize: 16, marginRight:4 }}>{expanded===id?"▲":"▼"}</span>
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
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize: 14, color:"var(--text)", padding:"3px 0" }}>
            <span style={{ display:"flex", alignItems:"center", gap:4 }}><DocIcon name="paperclip" color="var(--text-dim)" size={14} />{f.filename}</span>
            {f.path && <button onClick={() => openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize: 13, padding:"0 2px", display:"inline-flex", alignItems:"center" }} title="צפה"><DocIcon name="eye" color="var(--green-mid)" size={13} /></button>}
            <button onClick={() => deleteFile(cat, i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize: 13, padding:"0 2px" }} title="מחק">✕</button>
          </div>
        ))}
        {pend.map((f,i) => (
          <div key={i} style={{ fontSize: 14, color:"var(--green-mid)", padding:"3px 0", display:"flex", alignItems:"center", gap:4 }}><DocIcon name="paperclip" color="var(--green-mid)" size={14} />{f.name} <span style={{ color:"var(--text-dim)" }}>(ממתין לשמירה)</span></div>
        ))}
      </div>
    );
  };

  const UploadArea = ({ cat, accept = ".pdf,.jpg,.jpeg,.png" }) => (
    <div>
      <input ref={el => fileRefs.current[cat]=el} type="file" multiple accept={accept} style={{ display:"none" }} onChange={e => onFileChange(cat, e)} />
      <FileList cat={cat} />
      <Btn size="sm" variant="secondary" onClick={() => pickFile(cat)} style={{ marginTop:6, display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="paperclip" color="var(--green-deep)" size={15} />הוסף קובץ</Btn>
    </div>
  );

  const fldStyle = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize: 14, fontFamily:"inherit", outline:"none" };
  const bodyStyle = { border:"1px solid var(--border)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"16px 18px", background:"var(--surface)", marginBottom:2, animation:"accordionIn 0.18s ease-out" };
  const descStyle = { fontSize: 15, color:"var(--text)", opacity:0.8, marginBottom:12 };

  return (
    <div style={{ marginBottom:28 }}>
      <style>{`@keyframes accordionIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>
      {/* Edit month modal */}
      {editMonthEntry && (
        <>
          <div onClick={() => setEditMonthEntry(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:28, zIndex:9001, width:300, boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ fontWeight:700, fontSize: 18, marginBottom:16, display:"flex", alignItems:"center", gap:8 }}><DocIcon name="pencil" color="var(--green-deep)" />ערוך חודש</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize: 14, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>חודש</div>
              <select value={editMonthVal.month} onChange={e => { setEditMonthVal(p => ({...p, month: Number(e.target.value)})); setEditMonthErr(""); }} style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontFamily:"inherit", fontSize: 15, direction:"rtl" }}>
                {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize: 14, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>שנה</div>
              <select value={editMonthVal.year} onChange={e => { setEditMonthVal(p => ({...p, year: Number(e.target.value)})); setEditMonthErr(""); }} style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontFamily:"inherit", fontSize: 15, direction:"rtl" }}>
                {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {editMonthErr && <div style={{ fontSize: 14, color:"var(--red)", marginBottom:10 }}>⚠️ {editMonthErr}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={saveEditMonth} disabled={editMonthSaving} style={{ flex:1, justifyContent:"center" }}>{editMonthSaving ? "שומר..." : "שמור"}</Btn>
              <Btn variant="ghost" onClick={() => setEditMonthEntry(null)} style={{ flex:1, justifyContent:"center" }}>ביטול</Btn>
            </div>
          </div>
        </>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize: 15, color:"var(--text-dim)", marginBottom:6 }}>
          <span>התקדמות כללית</span>
          <span style={{ fontWeight:700, color: progressPct===100?"#22c55e":"var(--text-dim)" }}>{progressPct}%</span>
        </div>
        <div style={{ background:"var(--surface2)", borderRadius:20, height:10, overflow:"hidden" }}>
          <div style={{ width:`${progressPct}%`, height:"100%", background:"linear-gradient(90deg,var(--green-mid),var(--green-soft))", borderRadius:20, transition:"width .4s" }} />
        </div>
        <div style={{ fontSize: 13, color:"var(--text-dim)", marginTop:6, display:"flex", gap:12, flexWrap:"wrap" }}>
          <span style={{ color: txsDone ? "var(--green-soft)" : "var(--text-dim)" }}>{txsDone ? "✓" : "○"} תנועות {Math.min(finalizedMonths.length, REQUIRED_MONTHS)}/{REQUIRED_MONTHS}</span>
          {needsBankStmt && <span style={{ color: bankStmtDone ? "var(--green-soft)" : "var(--text-dim)" }}>{bankStmtDone ? "✓" : "○"} פירוט עו"ש</span>}
          <span style={{ color: payslipsDone ? "var(--green-soft)" : "var(--text-dim)" }}>{payslipsDone ? "✓" : "○"} תלושי שכר {Math.min(payslips.length, REQUIRED_MONTHS)}/{REQUIRED_MONTHS}</span>
          {needsQuestionnaire && <span style={{ color: questDone ? "var(--green-soft)" : "var(--text-dim)" }}>{questDone ? "✓" : "○"} שאלון אישי</span>}
        </div>
      </div>

      <div style={{ fontWeight:700, fontSize: 18, marginBottom:16, display:"flex", alignItems:"center", gap:8 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green-deep)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        מסמכים נדרשים
      </div>

      {/* 1. פירוט תנועות */}
      <div style={{ marginBottom:8 }}>
        <SectionHeader id="txs" icon={<DocIcon name="folder" />} label="פירוט תנועות — 3 חודשים" required done={txsDone} partial={finalizedMonths.length>0&&!txsDone} onClick={()=>toggle("txs")} />
        <DoneLine done={txsDone} />
        {expanded==="txs" && (
          <div style={bodyStyle}>
            {finalizedMonths.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize: 15, color:"var(--text)", padding:"3px 0" }}>
                <span>✓ {m.label}</span>
                <button onClick={() => openEditMonth(m)} style={{ background:"none", border:"none", color:"var(--text-mid)", cursor:"pointer", padding:"2px 6px", display:"inline-flex", alignItems:"center" }} title="ערוך שם חודש"><DocIcon name="pencil" color="var(--text-dim)" size={14} /></button>
              </div>
            ))}
            {(inProgressMonths||[]).map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize: 15, color:"var(--text-mid)", padding:"3px 0" }}>
                <span>⏳ {m.label} — בתהליך</span>
                <Btn size="sm" variant="ghost" onClick={()=>{setExpanded(null);onOpenExistingMonth&&onOpenExistingMonth(m);}} style={{ fontSize:12, padding:"2px 8px" }}>המשך וסיים →</Btn>
              </div>
            ))}
            <div style={{ ...descStyle, marginTop:6 }}>{txsDone ? "3 חודשי פירוט הושלמו ✓" : `הושלמו ${finalizedMonths.length} מתוך 3 חודשים`}</div>
            {!txsDone && <Btn size="sm" onClick={()=>{setExpanded(null);onNavigateTxs();}} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="folder" color="#fff" /> הוסף חודש →</Btn>}
          </div>
        )}
      </div>

      {/* 2. פירוט עו"ש */}
      {needsBankStmt && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="bank_stmt" icon={<DocIcon name="building" />} label='פירוט עו"ש' required done={bankStmtDone} partial={bankStmtPartial} onClick={()=>toggle("bank_stmt")} />
          <DoneLine done={bankStmtDone} />
          {expanded==="bank_stmt" && !bankTutorialSeen && (
            <BankTutorial onDone={() => {
              localStorage.setItem(`bank_tutorial_seen_${session.id}`, "1");
              setBankTutorialSeen(true);
            }} />
          )}
          {expanded==="bank_stmt" && bankTutorialSeen && (
            <div style={bodyStyle}>
              <div style={{ marginBottom:12 }}>
                <div style={descStyle}>העלה פירוט עו"ש מהבנק — PDF או Excel. אם יש לך יותר מחשבון בנק אחד, הוסף חשבון נוסף.</div>
                <button
                  onClick={() => setBankTutorialSeen(false)}
                  style={{ display:"flex", alignItems:"center", gap:10, width:"100%", marginTop:10, padding:"12px 14px", background:"rgba(45,106,79,0.05)", border:"1px solid rgba(82,183,136,0.22)", borderRight:"3px solid var(--green-soft)", borderRadius:10, cursor:"pointer", direction:"rtl" as const, transition:"background 0.15s, box-shadow 0.15s" }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(45,106,79,0.1)"; el.style.boxShadow = "0 2px 8px rgba(45,106,79,0.1)"; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = "rgba(45,106,79,0.05)"; el.style.boxShadow = "none"; }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" stroke="var(--green-soft)" strokeWidth="1.75"/><polygon points="10 8 16 12 10 16 10 8" fill="var(--green-mid)"/></svg>
                  <span style={{ fontSize:13, color:"var(--green-mid)", fontWeight:500 }}>לא בטוח איך להעלות? צפה שוב בהדרכה</span>
                </button>
              </div>
              {Array.from({ length: bankAccountCount }, (_, i) => i + 1).map(n => (
                <div key={n} style={{ marginBottom: n < bankAccountCount ? 16 : 0, paddingBottom: n < bankAccountCount ? 16 : 0, borderBottom: n < bankAccountCount ? "1px solid var(--border)" : "none" }}>
                  {bankAccountCount > 1 && (
                    <div style={{ fontSize:14, fontWeight:600, color:"var(--text-mid)", marginBottom:8, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span>חשבון {n}</span>
                      {!isDone(`bank_stmt_${n}`) && n === bankAccountCount && n > 1 && (
                        <button
                          onClick={async () => {
                            const newCount = bankAccountCount - 1;
                            setBankAccountCount(newCount);
                            setPendingFiles(prev => { const nv={...prev}; delete nv[`bank_stmt_${n}`]; return nv; });
                            const metaEx = getDoc("bank_stmt_meta");
                            if (metaEx) await supabase.from("client_documents").update({ extra_data: { num_accounts: newCount } }).eq("id", metaEx.id);
                            await onDocsChange();
                          }}
                          style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-dim)", fontSize:16, lineHeight:1, padding:"0 4px" }}
                          title="הסר חשבון"
                        >×</button>
                      )}
                    </div>
                  )}
                  {isDone(`bank_stmt_${n}`) ? (
                    <div style={{ fontSize:14, color:"var(--green-mid)", display:"flex", alignItems:"center", gap:6 }}>✓ {bankAccountCount > 1 ? `חשבון ${n} הושלם` : "הועלה ואושר"}</div>
                  ) : (
                    <>
                      {bankParseWarnings[n] && (
                        <div style={{ fontSize:13, color:"#d97706", background:"rgba(217,119,6,0.1)", borderRadius:6, padding:"6px 10px", marginBottom:8, borderRight:"3px solid #d97706" }}>
                          ⚠️ הבנק לא זוהה אוטומטית — הקובץ הועלה בהצלחה, אך לא ניתן לנתח אותו בצורה אוטומטית. אלון יבדוק אותו ידנית.
                        </div>
                      )}
                      <UploadArea cat={`bank_stmt_${n}`} accept=".pdf,.xlsx,.xls,.csv,.jpg,.jpeg,.png" />
                      <Btn
                        onClick={() => saveBankAccount(n)}
                        disabled={!hasFiles(`bank_stmt_${n}`) || saving === `bank_stmt_${n}`}
                        style={{ marginTop:10, width:"100%" }}
                      >
                        {saving === `bank_stmt_${n}` ? "שומר..." : bankAccountCount > 1 ? `סיימתי חשבון ${n}` : "סיימתי"}
                      </Btn>
                    </>
                  )}
                </div>
              ))}
              {!bankStmtDone && (
                <Btn size="sm" variant="ghost" onClick={addBankAccount} style={{ marginTop:12, display:"inline-flex", alignItems:"center", gap:6 }}>
                  + הוסף חשבון נוסף
                </Btn>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. תלושי שכר */}
      <div style={{ marginBottom:8 }}>
        <SectionHeader id="pays" icon={<DocIcon name="payslip" />} label={hasSpouse2 ? "תלושי שכר — 3 חודשים לכל אחד" : "תלושי שכר — 3 חודשים"} required done={payslipsDone} partial={(s1Payslips.length>0||s2Payslips.length>0||!!noPayslipReasons.s1||!!noPayslipReasons.s2)&&!payslipsDone} onClick={()=>toggle("pays")} />
        <DoneLine done={payslipsDone} />
        {expanded==="pays" && (
          <div style={bodyStyle}>
            {/* שורה לכל בן/בת זוג */}
            {[
              { idx: 1 as 1|2, name: spouseNames.s1, slips: s1Payslips, done: s1PayslipsDone, reason: noPayslipReasons.s1 },
              ...(hasSpouse2 ? [{ idx: 2 as 1|2, name: spouseNames.s2, slips: s2Payslips, done: s2PayslipsDone, reason: noPayslipReasons.s2 }] : [])
            ].map(({ idx, name, slips, done, reason }) => (
              <div key={idx} style={{ marginBottom:12 }}>
                <div style={{ fontWeight:600, fontSize:14, marginBottom:4, color:"var(--text)" }}>
                  {name ? `תלושי משכורת — ${name}` : "תלושי משכורת"}
                </div>
                {reason ? (
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, color:"var(--text-mid)", background:"var(--surface2)", borderRadius:6, padding:"3px 10px" }}>אין תלושים: {reason}</span>
                    {cancelConfirmSpouse === idx ? (
                      <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                        <span style={{ fontSize:12, color:"var(--text-mid)" }}>לבטל את ההצהרה?</span>
                        <Btn size="sm" variant="ghost" onClick={() => { onNoPayslipReasonSave(idx, ""); setCancelConfirmSpouse(null); }} style={{ fontSize:12, color:"var(--red)" }}>כן, בטל</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setCancelConfirmSpouse(null)} style={{ fontSize:12 }}>שמור</Btn>
                      </div>
                    ) : (
                      <button onClick={() => setCancelConfirmSpouse(idx)} style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:12 }}>× בטל</button>
                    )}
                  </div>
                ) : (
                  <>
                    {slips.slice(0, 3).map(p => <div key={p.id} style={{ fontSize:14, color:"var(--text)", padding:"2px 0" }}>✓ {p.month_label || p.label || new Date(p.created_at).toLocaleDateString("he-IL",{month:"long",year:"numeric"})}</div>)}
                    {slips.length > 3 && <div style={{ fontSize:13, color:"var(--text-dim)", padding:"2px 0" }}>ועוד {slips.length - 3} תלושים</div>}
                    <div style={{ ...descStyle, marginTop:2 }}>{done ? "3 תלושים הועלו ✓" : `הועלו ${slips.length} מתוך 3`}</div>
                    {!done && (
                      <div style={{ marginTop:8 }}>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <Btn size="sm" variant="secondary" onClick={()=>{setExpanded(null);onNavigatePayslips(idx);}} style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green-deep)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                            העלה תלוש →
                          </Btn>
                          {noPayslipInput?.spouse !== idx && (
                            <Btn size="sm" variant="ghost" onClick={() => setNoPayslipInput({ spouse: idx, val: "" })} style={{ fontSize:13, color:"var(--text-dim)" }}>אין לי תלושים</Btn>
                          )}
                        </div>
                        {noPayslipInput?.spouse === idx && (
                          <div style={{ marginTop:10, padding:"14px 14px", background:"var(--surface2)", borderRadius:10, border:"1px solid var(--border)" }}>
                            <div style={{ fontSize:13, color:"var(--text-mid)", marginBottom:8, fontWeight:600 }}>נא לפרט את הסיבה:</div>
                            <textarea
                              autoFocus
                              value={noPayslipInput.val}
                              onChange={e => setNoPayslipInput({ spouse: idx, val: e.target.value })}
                              placeholder="למשל: אני עצמאי / חל הוראה מתקנת / יצאתי לחופשת לידה..."
                              rows={3}
                              maxLength={400}
                              style={{ width:"100%", fontSize:14, padding:"10px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", color:"var(--text)", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box", direction:"rtl", outline:"none" }}
                            />
                            <div style={{ display:"flex", gap:8, marginTop:10, justifyContent:"flex-end" }}>
                              <Btn size="sm" variant="ghost" onClick={() => setNoPayslipInput(null)}>ביטול</Btn>
                              <Btn size="sm" onClick={() => { if (noPayslipInput.val.trim()) { onNoPayslipReasonSave(idx, noPayslipInput.val.trim()); setNoPayslipInput(null); } }} disabled={!noPayslipInput.val.trim()}>שמור</Btn>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. הלוואות */}
      {visibleOptional.includes("loans") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="loans" icon={<DocIcon name="clipboard" />} label="מסמכי הלוואות" done={loansDone} partial={loansHasAny&&!loansDone} onClick={()=>toggle("loans")} />
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
                    <div style={{ fontWeight:600, fontSize: 15, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><DocIcon name={lt.icon} />{lt.label}</div>
                    {lt.fileLabel && <div style={{ fontSize: 14, color:"var(--text)", opacity:.7, marginBottom:8 }}>נדרש: {lt.fileLabel}</div>}
                    {(isFields||isBoth) && <LoanFieldForm cat={cat} fields={loanFields[cat]} onChange={(c,k,v) => setLoanFields(prev => ({ ...prev, [c]: { ...(prev[c]||{}), [k]:v } }))} />}
                    {!isFields && (
                      <>
                        <input ref={el=>fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e=>onFileChange(cat,e)} />
                        {[...saved.map((f,i)=>({...f,_i:i})), ...pend.map(f=>({filename:f.name,_pending:true}))].map((f,i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize: 14, color:f._pending?"var(--green-mid)":"var(--text)", padding:"2px 0" }}>
                            <span style={{ display:"flex", alignItems:"center", gap:4 }}><DocIcon name="paperclip" color={f._pending?"var(--green-mid)":"var(--text-dim)"} size={14} />{f.filename}{f._pending&&" (ממתין)"}</span>
                            {!f._pending && f.path && <button onClick={()=>openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize: 13, display:"inline-flex", alignItems:"center" }}><DocIcon name="eye" color="var(--green-mid)" size={13} /></button>}
                            {!f._pending && <button onClick={()=>deleteFile(cat,f._i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize: 13 }}>✕</button>}
                          </div>
                        ))}
                        <div style={{ display:"flex", gap:8, marginTop:8 }}>
                          <Btn size="sm" variant="secondary" onClick={()=>pickFile(cat)} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="paperclip" color="var(--green-deep)" size={15} />{isBoth?"קובץ (לא חובה)":"הוסף קובץ"}</Btn>
                          {pend.length>0 && <Btn size="sm" onClick={()=>saveLoanFiles(cat,lt.label)} disabled={saving===cat}>{saving===cat?"שומר...":"שמור"}</Btn>}
                        </div>
                      </>
                    )}
                    {(isFields||isBoth) && (
                      <Btn size="sm" onClick={()=>saveLoanFields(cat,lt.label)} disabled={saving===cat+"_f"} style={{ marginTop:4 }}>{saving===cat+"_f"?"שומר...":"שמור"}</Btn>
                    )}
                  </div>
                );
              })}
              {!showLoanPicker
                ? <Btn size="sm" variant="secondary" onClick={()=>setShowLoanPicker(true)} style={{ marginBottom:14 }}>+ הוסף הלוואה</Btn>
                : <div style={{ marginBottom:14, padding:12, background:"var(--surface2)", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontWeight:600, fontSize: 15, marginBottom:10 }}>בחר סוג הלוואה:</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {LOAN_TYPES.filter(lt=>!activeLoanTypes.includes(lt.id)).map(lt => (
                        <button key={lt.id} onClick={()=>{setActiveLoanTypes(p=>[...p,lt.id]);setShowLoanPicker(false);}} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid var(--border)", background:"var(--surface)", fontSize: 14, cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name={lt.icon} color="var(--text-mid)" size={16} />{lt.label}</button>
                      ))}
                    </div>
                    <button onClick={()=>setShowLoanPicker(false)} style={{ marginTop:10, fontSize: 15, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer" }}>ביטול</button>
                  </div>
              }
              <Btn onClick={markLoansDone} disabled={!loansHasAny||saving==="loans_section"} style={{ width:"100%" }}>{saving==="loans_section"?"שומר...":"סיימתי להוסיף הלוואות"}</Btn>
            </div>
          )}
        </div>
      )}

      {/* 4. קרן השתלמות */}
      {visibleOptional.includes("provident") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="provident" icon={<DocIcon name="coins" />} label="יתרת קרן השתלמות" done={isDone("provident_fund")} partial={hasFiles("provident_fund")&&!isDone("provident_fund")} onClick={()=>toggle("provident")} />
          <NoteBar docKey="provident" />
          <DoneLine done={isDone("provident_fund")} />
          {expanded==="provident" && <div style={bodyStyle}><div style={descStyle}>העלה דוח יתרה מחברת הביטוח / קרן הפנסיה</div><UploadArea cat="provident_fund" /><Btn onClick={()=>saveAndDone("provident_fund","קרן השתלמות")} disabled={!hasFiles("provident_fund")||saving==="provident_fund"} style={{ marginTop:14, width:"100%" }}>{saving==="provident_fund"?"שומר...":"סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 5. דוח רווח והפסד */}
      {visibleOptional.includes("pl") && (
        <>
          {[
            { idx: 1, show: s1NeedsPL, name: spouseNames.s1, cat: "profit_loss_1" },
            { idx: 2, show: s2NeedsPL, name: spouseNames.s2, cat: "profit_loss_2" },
          ].filter(sp => sp.show).map(sp => (
            <div key={sp.idx} style={{ marginBottom: 8 }}>
              <SectionHeader id={`pl_${sp.idx}`} icon={<DocIcon name="bar-chart" />} label={sp.name ? `דוח רווח והפסד — ${sp.name}` : "דוח רווח והפסד"} done={isDone(sp.cat)} partial={hasFiles(sp.cat)&&!isDone(sp.cat)} onClick={()=>toggle(`pl_${sp.idx}`)} />
              <NoteBar docKey="pl" />
              <DoneLine done={isDone(sp.cat)} />
              {expanded===`pl_${sp.idx}` && <div style={bodyStyle}><div style={descStyle}>העלה דוח רווח והפסד שנתי + מאזן בוחן של שנה קודמת</div><UploadArea cat={sp.cat} /><Btn onClick={()=>saveAndDone(sp.cat,"דוח רווח והפסד")} disabled={!hasFiles(sp.cat)||saving===sp.cat} style={{ marginTop:14, width:"100%" }}>{saving===sp.cat?"שומר...":"סיימתי"}</Btn></div>}
            </div>
          ))}
          {/* Fallback: employment_type לא הוגדר — שורה כללית */}
          {!s1NeedsPL && !s2NeedsPL && (
            <div style={{ marginBottom:8 }}>
              <SectionHeader id="pl" icon={<DocIcon name="bar-chart" />} label="דוח רווח והפסד (לעצמאיים)" done={isDone("profit_loss")} partial={hasFiles("profit_loss")&&!isDone("profit_loss")} onClick={()=>toggle("pl")} />
              <NoteBar docKey="pl" />
              <DoneLine done={isDone("profit_loss")} />
              {expanded==="pl" && <div style={bodyStyle}><div style={descStyle}>רלוונטי לעצמאיים — העלה דוח רווח והפסד שנתי + מאזן בוחן של שנה קודמת</div><UploadArea cat="profit_loss" /><Btn onClick={()=>saveAndDone("profit_loss","דוח רווח והפסד")} disabled={!hasFiles("profit_loss")||saving==="profit_loss"} style={{ marginTop:14, width:"100%" }}>{saving==="profit_loss"?"שומר...":"סיימתי"}</Btn></div>}
            </div>
          )}
        </>
      )}

      {/* 6. חסכונות ופנסיה */}
      {visibleOptional.includes("savings") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="savings" icon={<DocIcon name="building" />} label="פירוט חסכונות ופנסיה" done={isDone("savings_pension")} partial={hasFiles("savings_pension")&&!isDone("savings_pension")} onClick={()=>toggle("savings")} />
          <NoteBar docKey="savings" />
          <DoneLine done={isDone("savings_pension")} />
          {expanded==="savings" && <div style={bodyStyle}><div style={descStyle}>כולל: פנסיה, קופות גמל, ביטוח מנהלים, חסכונות בנקאיים, השקעות. ציין גם מועדי נזילות.</div><UploadArea cat="savings_pension" /><Btn onClick={()=>saveAndDone("savings_pension","חסכונות ופנסיה")} disabled={!hasFiles("savings_pension")||saving==="savings_pension"} style={{ marginTop:14, width:"100%" }}>{saving==="savings_pension"?"שומר...":"סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 7. תחזית פרישה — ממש אחרי חסכונות */}
      {visibleOptional.includes("retirement") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="retirement" icon={<DocIcon name="user" />} label="דוח תחזית פרישה (מעל גיל 55)" done={isDone("retirement_forecast")} partial={hasFiles("retirement_forecast")&&!isDone("retirement_forecast")} onClick={()=>toggle("retirement")} />
          <NoteBar docKey="retirement" />
          <DoneLine done={isDone("retirement_forecast")} />
          {expanded==="retirement" && <div style={bodyStyle}><div style={descStyle}>רלוונטי למי שמעל גיל 55 — דוח תחזית פרישה מסוכן הביטוח</div><UploadArea cat="retirement_forecast" /><Btn onClick={()=>saveAndDone("retirement_forecast","דוח תחזית פרישה")} disabled={!hasFiles("retirement_forecast")||saving==="retirement_forecast"} style={{ marginTop:14, width:"100%" }}>{saving==="retirement_forecast"?"שומר...":"סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 8. שיקים דחויים */}
      {visibleOptional.includes("checks") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="checks" icon={<DocIcon name="file" />} label="שיקים דחויים" done={isDone("deferred_checks")} partial={hasFiles("deferred_checks")&&!isDone("deferred_checks")} onClick={()=>toggle("checks")} />
          <NoteBar docKey="checks" />
          <DoneLine done={isDone("deferred_checks")} />
          {expanded==="checks" && <div style={bodyStyle}><div style={descStyle}>שיקים דחויים שאינם חלק מהוצאה שוטפת</div><UploadArea cat="deferred_checks" /><Btn onClick={()=>saveAndDone("deferred_checks","שיקים דחויים")} disabled={!hasFiles("deferred_checks")||saving==="deferred_checks"} style={{ marginTop:14, width:"100%" }}>{saving==="deferred_checks"?"שומר...":"סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 9. פיגורים וחובות */}
      {visibleOptional.includes("debts_other") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="debts_other" icon={<DocIcon name="alert" />} label="פיגורי תשלומים וחובות אחרים" done={isDone("debts_other")} partial={hasFiles("debts_other")&&!isDone("debts_other")} onClick={()=>toggle("debts_other")} />
          <NoteBar docKey="debts_other" />
          <DoneLine done={isDone("debts_other")} />
          {expanded==="debts_other" && <div style={bodyStyle}><div style={descStyle}>חובות לאנשים פרטיים, גמ"ח, מקום עבודה, פיגורים בתשלומים</div><UploadArea cat="debts_other" /><Btn onClick={()=>saveAndDone("debts_other","פיגורי תשלומים וחובות")} disabled={!hasFiles("debts_other")||saving==="debts_other"} style={{ marginTop:14, width:"100%" }}>{saving==="debts_other"?"שומר...":"סיימתי"}</Btn></div>}
        </div>
      )}

      {/* מסמכים מותאמים אישית */}
      {customDocs.filter(cd => (requiredDocs||[]).includes(cd.id)).map(cd => {
        const cat = cd.id;
        const cdDone = isDone(cat);
        const cdPartial = hasFiles(cat) && !cdDone;
        return (
          <div key={cd.id} style={{ marginBottom:8 }}>
            <SectionHeader id={cd.id} icon={<DocIcon name="file" />} label={cd.label} done={cdDone} partial={cdPartial} onClick={()=>toggle(cd.id)} />
            <NoteBar docKey={cd.id} />
            {expanded===cd.id && (
              <div style={bodyStyle}>
                <UploadArea cat={cd.id} />
                <Btn onClick={()=>saveAndDone(cd.id, cd.label)} disabled={!hasFiles(cd.id)||saving===cd.id} style={{ marginTop:14, width:"100%" }}>{saving===cd.id?"שומר...":"סיימתי"}</Btn>
              </div>
            )}
          </div>
        );
      })}

      {/* שאלון אישי */}
      {needsQuestionnaire && (
        <div style={{ marginBottom:8 }}>
          <div onClick={onNavigateQuestionnaire} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background: questDone?"rgba(46,204,138,0.06)":"rgba(46,204,138,0.03)", borderRadius:10, border:`1px solid ${questDone?"rgba(46,204,138,0.3)":"var(--green-mint)"}`, cursor:"pointer", userSelect:"none" }}>
            <span style={{ display:"flex", alignItems:"center", flexShrink:0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize: 16 }}>שאלון אישי</div>
              <div style={{ fontSize: 13, color:"var(--text-dim)" }}>לחץ כדי למלא את השאלון</div>
            </div>
            {questDone
              ? <span style={{ background:"rgba(46,204,138,0.15)", color:"#22c55e", borderRadius:20, padding:"3px 12px", fontSize: 14, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><DocIcon name="check-circle" color="#22c55e" size={14} /> הושלם</span>
              : <span style={{ display:"flex", alignItems:"center", color:"var(--green-mid)" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></span>
            }
          </div>
        </div>
      )}

      {/* הערות מסכמות — מוצג אחרי השלמת 3 חודשים (משימה 4ב) */}
      {txsDone && (
        <div style={{ marginTop: 20, padding: "18px 20px", background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>הערות מסכמות לאלון</div>
            {summaryNoteSaving && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>שומר...</span>}
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, lineHeight: 1.6 }}>
            אם היה חודש חריג, הוצאה חד-פעמית, או משהו שאלון צריך לדעת כדי להבין את התמונה — כתוב כאן.
          </div>
          <textarea
            value={summaryNote}
            onChange={e => handleSummaryNoteChange(e.target.value)}
            placeholder='לדוגמה: "חודש פברואר אינו מייצג כי אירחנו משפחה — הוצאות יוצאות דופן של ₪8,000"'
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", fontSize: 14, lineHeight: 1.6,
              borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text)",
              fontFamily: "inherit", resize: "vertical", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => { e.target.style.borderColor = "var(--green-mid)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--border)"; }}
          />
        </div>
      )}

      {/* הגשה */}
      <div style={{ marginTop:24, padding:"18px 20px", background:requiredDone?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius:12, border:`1px solid ${requiredDone?"rgba(46,204,138,0.3)":"var(--border)"}` }}>
        {!requiredDone && (
          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:10, textAlign:"center", lineHeight:1.6 }}>
            להגשה יש להשלים קודם:
            {!txsDone && <span> · פירוט תנועות</span>}
            {needsBankStmt && !bankStmtDone && <span> · פירוט עו"ש</span>}
            {!payslipsDone && <span> · תלושי שכר</span>}
            {!allOptDone && <span> · כל הסעיפים הנדרשים</span>}
            {!questDone && <span> · שאלון אישי</span>}
          </div>
        )}
        <Btn onClick={handleSubmit} disabled={!requiredDone||submitting} title={!requiredDone?"השלם את כל הסעיפים הנדרשים כדי להגיש":undefined} style={{ width:"100%", padding:"14px", fontSize: 17, fontWeight:700, opacity:requiredDone?1:0.45 }}>{submitting?"מגיש...":"הגש לאלון"}</Btn>
      </div>
    </div>
  );
}

// ── FinalizeCheckModal — popup A (חודשים 1-2) ו-B (חודש 3) ─────────────────────
function FinalizeCheckModal({ monthLabel, emptyCats, isMonth3, estimates, onEstimateChange, openSections, onToggleSection, finalizeNote, onFinalizeNoteChange, pending, onBack, onConfirm }) {
  const grouped: Record<string, typeof emptyCats> = {};
  emptyCats.forEach(r => {
    const sec = r.section || "כללי";
    if (!grouped[sec]) grouped[sec] = [];
    grouped[sec].push(r);
  });
  const sections = Object.keys(grouped);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:20, overflowY:"auto" }}>
      <div style={{ background:"var(--surface)", borderRadius:18, padding:"32px 28px", maxWidth:560, width:"100%", boxShadow:"0 24px 64px rgba(0,0,0,0.35)", direction:"rtl", maxHeight:"85vh", display:"flex", flexDirection:"column" }}>

        {/* כותרת */}
        <div style={{ marginBottom:18 }}>
          <div style={{ fontSize:22, fontWeight:700, marginBottom:6 }}>
            {isMonth3 ? "סיכום 3 חודשים — לפני שמגישים 📋" : "רגע לפני שמסמנים הושלם 🔍"}
          </div>
          <div style={{ fontSize:15, color:"var(--text-dim)", lineHeight:1.7 }}>
            {isMonth3
              ? <>הקטגוריות הבאות לא קיבלו אף תנועה לאורך 3 חודשים. אם יש לך הוצאה שקיימת בחייך אבל לא הופיעה בתקופה זו — כדאי להוסיף הערכה חודשית.<br/><span style={{ fontSize:13, color:"var(--text-dim)", display:"block", marginTop:6 }}>לדוגמה: טיסות לחו"ל בתקציב ₪12,000 בשנה = ₪1,000 לחודש</span></>
              : <>עבור על הקטגוריות הריקות וודא שלא פספסת כלום. אם קטגוריה לא הייתה רלוונטית החודש — זה בסדר, היא עשויה להופיע בחודשים הבאים.</>
            }
          </div>
        </div>

        {/* רשימת קטגוריות */}
        {emptyCats.length === 0 ? (
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:8, color:"var(--green-soft)", padding:"24px 0" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <div style={{ fontWeight:600, fontSize:16 }}>כל הקטגוריות כוסו!</div>
          </div>
        ) : (
          <div style={{ flex:1, overflowY:"auto", marginBottom:20, marginTop:4 }}>
            {sections.map(sec => {
              const isOpen = openSections[sec] !== false; // פתוח כברירת מחדל
              return (
                <div key={sec} style={{ marginBottom:8, border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
                  {/* accordion header */}
                  <button
                    onClick={() => onToggleSection(sec)}
                    style={{ width:"100%", padding:"10px 14px", background:"var(--surface2)", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", fontFamily:"inherit", fontSize:14, fontWeight:600, color:"var(--text)" }}
                  >
                    <span>{sec}</span>
                    <span style={{ display:"flex", alignItems:"center", gap:6, color:"var(--text-dim)", fontWeight:400, fontSize:13 }}>
                      {grouped[sec].length} קטגוריות
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s" }}><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                  </button>
                  {/* accordion body */}
                  {isOpen && (
                    <div style={{ padding:"4px 0" }}>
                      {grouped[sec].map(cat => (
                        <div key={cat.name} style={{ padding:"10px 14px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:600, fontSize:14 }}>{cat.name}</div>
                            {cat.description && <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:2 }}>{cat.description}</div>}
                          </div>
                          {isMonth3 && (
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
                              {estimates[cat.name] ? (
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  <span style={{ fontSize:13, color:"var(--green-soft)", fontWeight:600 }}>✓ ₪{Number(estimates[cat.name]).toLocaleString()}/חודש</span>
                                  <button onClick={() => onEstimateChange(cat.name, "")} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-dim)", fontSize:12, padding:"2px 4px" }}>✕</button>
                                </div>
                              ) : (
                                <EstimateInlineInput catName={cat.name} onChange={onEstimateChange} />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* הערה חופשית לפני סיום חודש — משימה 4א */}
        <div style={{ marginTop: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6 }}>
            הערה לאלון (אופציונלי)
          </div>
          <textarea
            value={finalizeNote}
            onChange={e => onFinalizeNoteChange(e.target.value)}
            placeholder='לדוגמה: "לא היה לי סעיף גינון אז שמתי תחת שכר דירה — התשלום החודשי הוא ₪300 לגנן"'
            rows={3}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "10px 12px", fontSize: 14, lineHeight: 1.6,
              borderRadius: 10, border: "1px solid var(--border)",
              background: "var(--surface2)", color: "var(--text)",
              fontFamily: "inherit", resize: "vertical", outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={e => { e.target.style.borderColor = "var(--green-mid)"; }}
            onBlur={e => { e.target.style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* כפתורים */}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", borderTop:"1px solid var(--border)", paddingTop:16, marginTop:"auto" }}>
          <Btn variant="ghost" onClick={onBack} disabled={pending}>חזור לעריכה</Btn>
          <Btn onClick={onConfirm} disabled={pending}>
            {pending ? "שומר..." : isMonth3 ? "סיימתי" : "הכל בסדר, המשך"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function EstimateInlineInput({ catName, onChange }) {
  const [open, setOpen]   = useState(false);
  const [val, setVal]     = useState("");
  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ background:"none", border:"1px dashed var(--border)", borderRadius:6, padding:"3px 8px", fontSize:12, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}>+ הוסף הערכה</button>
  );
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <input
        autoFocus
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="₪ לחודש"
        style={{ width:90, padding:"3px 8px", fontSize:13, borderRadius:6, border:"1px solid var(--green-mid)", background:"var(--surface2)", color:"var(--text)", fontFamily:"inherit", outline:"none" }}
        onKeyDown={e => { if (e.key === "Enter" && val) { onChange(catName, val); setOpen(false); } if (e.key === "Escape") setOpen(false); }}
      />
      <button onClick={() => { if (val) { onChange(catName, val); setOpen(false); } }} disabled={!val} style={{ background:"var(--green-mid)", border:"none", borderRadius:6, padding:"3px 8px", fontSize:12, color:"#fff", cursor:"pointer", opacity: val ? 1 : 0.4 }}>✓</button>
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
        <div style={{ fontWeight:700, fontSize: 18, display:"flex", alignItems:"center", gap:8 }}><DocIcon name="clipboard" color="var(--green-deep)" size={18} /> השלמת נתונים ראשוניים</div>
        <div style={{ fontSize: 14, color:done?"var(--green-soft)":"var(--text-dim)", display:"flex", alignItems:"center", gap:4 }}>{done ? <><DocIcon name="check-circle" color="var(--green-soft)" size={14} /> הכל הושלם!</> : `${completedSteps}/${totalSteps} שלבים`}</div>
      </div>
      <div style={{ background:"var(--surface)", borderRadius:20, height:8, overflow:"hidden" }}>
        <div style={{ width:`${(completedSteps/totalSteps)*100}%`, height:"100%", background:`linear-gradient(90deg,${"var(--green-mid)"},${"var(--green-soft)"})`, borderRadius:20, transition:"width .4s" }} />
      </div>
      <div style={{ display:"flex", gap:16, marginTop:10, fontSize: 14 }}>
        <span style={{ color:subsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{subsCount>=total?"✓":"○"} בסיס חומרים לבניית התיק הכלכלי {subsCount}/{total}</span>
        <span style={{ color:payslipsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{payslipsCount>=total?"✓":"○"} תלושי משכורת {payslipsCount}/{total}</span>
      </div>
    </div>
  );
}

// ── Month Detail Screen ───────────────────────────────────────────────────────
function MonthDetailScreen({ entry, subs, onAddSource, onFinalize, onReopen, onBack, onDeleteSub, onUpdateSub, categories, categoryRows = [], clientCats, clientId, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, incomeCats = new Set<string>(), hiddenCats = [], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
  const allTx = subs.flatMap(s => s.transactions || []);
  const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + (incomeCats.has(t.cat) ? -Number(t.amount||0) : Number(t.amount||0)), 0);
  const catMap: Record<string, number> = {};
  allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + (incomeCats.has(t.cat) ? -Number(t.amount||0) : Number(t.amount||0)); });
  const catSummary = Object.entries(catMap).sort((a,b) => b[1]-a[1]);

  const [editingSub, setEditingSub] = useState(null); // sub being edited
  const [editTx, setEditTx]         = useState([]);
  const [editCatOpen, setEditCatOpen] = useState(null);
  const [catSearch, setCatSearch]   = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string|null>(null);

  const startEdit = (sub) => { setEditingSub(sub.id); setEditTx(sub.transactions || []); };
  const saveEdit  = async () => {
    try {
      await onUpdateSub(editingSub, editTx);
      setEditingSub(null);
    } catch(e) {
      alert("שגיאה בשמירה — נסה שוב");
    }
  };

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 20px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← חזור</Btn>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontWeight:700, fontSize: 22 }}>{entry.label}</div>
            {entry.is_finalized
              ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"3px 12px", fontSize: 14, fontWeight:700, display:"inline-flex", alignItems:"center", gap:4 }}><DocIcon name="check-circle" color="var(--green-soft)" size={14} /> הושלם</span>
              : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"3px 12px", fontSize: 14 }}>בתהליך</span>
            }
          </div>
          <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{subs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Btn size="sm" onClick={onAddSource}>+ הוסף מקור</Btn>
          {entry.is_finalized
            ? <Btn variant="ghost" size="sm" onClick={onReopen}>פתח לעריכה</Btn>
            : <Btn size="sm" onClick={onFinalize} disabled={subs.length === 0} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="check-circle" color="#fff" size={15} />סיימתי את החודש</Btn>
          }
        </div>
      </div>

      {subs.length === 0 ? (
        <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:12, opacity:0.4 }}><DocIcon name="folder" color="var(--text-dim)" size={36} /></div>
          <div style={{ marginBottom:16 }}>עוד לא הוספת מקורות לחודש זה</div>
          <Btn onClick={onAddSource}>+ הוסף מקור ראשון</Btn>
        </Card>
      ) : (
        <>
          {/* Category summary — compact */}
          <Card style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, marginBottom:10, fontSize: 18, display:"flex", alignItems:"center", gap:8 }}><DocIcon name="bar-chart" color="var(--green-deep)" size={18} /> סיכום לפי סעיף</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 16px" }}>
              {catSummary.filter(([cat]) => !ignoredCats.has(cat)).slice(0,10).map(([cat, amt]) => (
                <div key={cat} style={{ display:"flex", gap:6, fontSize: 14, alignItems:"center" }}>
                  <span style={{ color:"var(--text-dim)" }}>{cat}</span>
                  <span style={{ fontWeight:700, color:"var(--red)" }}>₪{Math.round(amt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Sources — expandable inline */}
          {subs.map(sub => {
            const isOpen = editingSub === sub.id;
            const subTotal = (sub.transactions||[])
              .filter(t => !ignoredCats.has(t.cat))
              .reduce((s, t) => s + (incomeCats.has(t.cat) ? -Number(t.amount||0) : Number(t.amount||0)), 0);
            return (
              <div key={sub.id} style={{ marginBottom:12 }}>
                {/* Source header */}
                <div
                  onClick={() => isOpen ? setEditingSub(null) : startEdit(sub)}
                  style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    background:"var(--surface)", border:`2px solid ${isOpen ? "var(--green-mid)" : "var(--border)"}`,
                    borderRadius: isOpen ? "12px 12px 0 0" : 12,
                    padding:"14px 18px", cursor:"pointer",
                    transition:"border-color 0.15s" }}
                >
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize: 20 }}>{isOpen ? "▾" : "▸"}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize: 16 }}>{sub.source_label || sub.label}</div>
                      <div style={{ fontSize: 15, color:"var(--text-dim)" }}>
                        {(sub.transactions||[]).length} תנועות
                        {subTotal > 0 && <> · <span style={{ color:"var(--red)", fontWeight:600 }}>₪{Math.round(subTotal).toLocaleString()}</span></>}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }} onClick={e => e.stopPropagation()}>
                    <Btn size="sm" onClick={() => isOpen ? setEditingSub(null) : startEdit(sub)} style={{ display:"inline-flex", alignItems:"center", gap:6 }}>
                      {isOpen ? "סגור ▲" : <><DocIcon name="pencil" color="#fff" size={14} /> ערוך תנועות</>}
                    </Btn>
                    <button
                      onClick={() => setConfirmDeleteId(sub.id)}
                      style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"5px 10px", fontSize: 14, color:"var(--red)", cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", justifyContent:"center" }}
                    ><DocIcon name="trash" color="var(--red)" size={15} /></button>
                  </div>
                </div>

                {/* Inline editor — opens directly under header */}
                {isOpen && (
                  <div style={{ border:"2px solid var(--green-mid)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:"16px 16px 12px", background:"var(--surface)" }}>
                    {editTx.map((tx, i) => {
                      const isIgnored = tx.cat === 'להתעלם';
                      return (
                      <div key={tx.id || i} onClick={() => { if (editCatOpen === (tx.id||i) || editCatOpen === `note_${tx.id||i}`) setEditCatOpen(null); }} style={{ marginBottom:8, padding:"10px 14px",
                        background: isIgnored ? "var(--surface2)" : "var(--surface)",
                        border:`1px solid ${isIgnored ? "var(--border)" : "var(--border)"}`,
                        borderRadius:10, opacity: isIgnored ? 0.55 : 1,
                        cursor: (editCatOpen === (tx.id||i) || editCatOpen === `note_${tx.id||i}`) ? "pointer" : "default" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
                          <div style={{ flex:1, minWidth:120 }}>
                            <div style={{ fontWeight:600, fontSize: 15, textDecoration: isIgnored ? "line-through" : "none", color: isIgnored ? "var(--text-dim)" : "var(--text)" }}>{tx.name}</div>
                            <div style={{ fontSize: 13, color:"var(--text-dim)" }}>{tx.date}</div>
                            {tx.note && <div style={{ fontSize: 13, color:"var(--text-mid)", fontStyle:"italic", marginTop:2, display:"flex", alignItems:"center", gap:4 }}><DocIcon name="pencil" color="var(--text-dim)" size={12} />{tx.note}</div>}
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }} onClick={e => e.stopPropagation()}>
                            <span style={{ fontWeight:700, fontSize: 15, color: isIgnored ? "var(--text-dim)" : "var(--red)" }}>₪{tx.amount?.toLocaleString()}</span>
                            {!isIgnored && (
                              <button
                                onClick={() => { const next = editCatOpen === (tx.id||i) ? null : (tx.id||i); if (next !== null) setCatSearch(""); setEditCatOpen(next); }}
                                style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"4px 12px", fontSize: 14, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}
                              >{tx.cat}</button>
                            )}
                            <button
                              onClick={() => isIgnored
                                ? setEditTx(p => p.map((t,j) => j===i ? { ...t, cat:"הוצאות לא מתוכננות", edited:true } : t))
                                : setEditTx(p => p.map((t,j) => j===i ? { ...t, cat:"להתעלם", edited:true } : t))
                              }
                              title={isIgnored ? "בטל התעלמות" : "התעלם — לא ייספר"}
                              style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"4px 8px", fontSize: 14, color: isIgnored ? "var(--green-mid)" : "var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                            >{isIgnored ? "↩️" : "⊘"}</button>
                            <button
                              onClick={() => setEditCatOpen(editCatOpen === `note_${tx.id||i}` ? null : `note_${tx.id||i}`)}
                              title="הערה"
                              style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"4px 8px", display:"inline-flex", alignItems:"center", justifyContent:"center", color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                            ><DocIcon name="pencil" color="var(--text-dim)" size={14} /></button>
                          </div>
                        </div>
                        {editCatOpen === (tx.id||i) && (
                          <div style={{ marginTop:8 }}>
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
                        {editCatOpen === `note_${tx.id||i}` && (
                          <div style={{ marginTop:8 }}>
                            <input autoFocus value={tx.note || ""}
                              onChange={e => setEditTx(p => p.map((t,j) => j===i ? { ...t, note:e.target.value } : t))}
                              placeholder="הוסף הערה..."
                              style={{ width:"100%", background:"var(--surface2)", border:"1.5px solid var(--green-soft)", borderRadius:8, padding:"7px 12px", color:"var(--text)", fontFamily:"inherit", fontSize: 15, outline:"none", boxSizing:"border-box" }}
                              onKeyDown={e => { if (e.key==="Enter"||e.key==="Escape") setEditCatOpen(null); }}
                            />
                          </div>
                        )}
                      </div>
                      );
                    })}
                    <div style={{ display:"flex", justifyContent:"center", gap:10, marginTop:12, paddingTop:12, borderTop:"1px solid var(--border)" }}>
                      <Btn onClick={saveEdit} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="save" color="#fff" size={15} /> שמור שינויים</Btn>
                      <Btn variant="ghost" onClick={() => setEditingSub(null)}>ביטול</Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      {confirmDeleteId && (
        <ConfirmModal
          title="מחיקת מקור"
          body="האם למחוק מקור זה ואת כל התנועות שלו? פעולה זו אינה הפיכה."
          confirmText="מחק"
          danger
          onConfirm={() => { onDeleteSub(confirmDeleteId); setConfirmDeleteId(null); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Debt Manager helpers
// ════════════════════════════════════════════════════════════════


// ── Portfolio Tab ─────────────────────────────────────────────────────────────
function PortfolioTab({ clientId, clientPlan, portfolioMonths, portfolioSubs, onDataChange, onMonthCreated, rememberedMappings, onRememberingAdded, cycleStartDay, importedTxs, manualTxs, onManualTxAdded, onManualTxDeleted, onUpdatePortfolioTxCat, onDeletePortfolioSub, onCycleStartDayChange, categories, categoryRows = [], clientCats, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, incomeCats = new Set<string>(), categoryRules = [] as any[], hiddenCats = [] as string[], onHiddenCatsChange = undefined as any, scenarioCats = null as any, activeSubTab = "control", visitedSubTabs = new Set(["control"]) as Set<string>, onSubTabChange = (_id: string) => {} }) {
  // Lift upload state here so re-renders don't reset it
  const [pStep, setPStep]                 = useState("list");
  const [activeEntry, setActiveEntry]     = useState(null);
  const [entrySubs, setEntrySubs]         = useState([]);

  return (
    <div>

      {visitedSubTabs.has("txs") && (
        <div style={{ display: activeSubTab === "txs" ? "block" : "none" }}>
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
            onNavigateToUpload={() => { setPStep("list"); onSubTabChange("upload"); }}
            categories={categories}
            categoryRows={categoryRows}
            clientCats={clientCats}
            onCategoryAdded={onCategoryAdded}
            hiddenCats={hiddenCats}
            onHiddenCatsChange={onHiddenCatsChange}
            scenarioCats={scenarioCats}
            ignoredCats={ignoredCats}
            incomeCats={incomeCats}
            categoryRules={categoryRules}
          />
        </div>
      )}

      {/* PortfolioUploadTab — lazy mount, then stay mounted to preserve upload state */}
      {visitedSubTabs.has("upload") && (
      <div style={{ display: activeSubTab === "upload" ? "block" : "none" }}>
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
          cycleStartDay={cycleStartDay || 1}
          incomeCats={incomeCats}
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
      )}
      {visitedSubTabs.has("control") && (
        <div style={{ display: activeSubTab === "control" ? "block" : "none" }}>
          <PortfolioControlTab
            key={`control-${clientId}`}
            clientId={clientId}
            portfolioMonths={portfolioMonths}
            portfolioSubs={portfolioSubs}
            cycleStartDay={cycleStartDay || 1}
            importedTxs={importedTxs || []}
            manualTxs={manualTxs || []}
            rememberedMappings={rememberedMappings || {}}
            onCycleStartDayChange={onCycleStartDayChange}
            ignoredCats={ignoredCats}
            incomeCats={incomeCats}
            categoryRules={categoryRules}
          />
        </div>
      )}
      {activeSubTab === "savings" && (
        <Card style={{ textAlign:"center", padding:"64px 32px" }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🚧</div>
          <div style={{ fontWeight:700, fontSize: 20, marginBottom:8 }}>פירוט חסכונות</div>
          <div style={{ color:"var(--text-dim)", fontSize: 16 }}>בקרוב</div>
        </Card>
      )}
      {visitedSubTabs.has("balance") && (
        <div style={{ display: activeSubTab === "balance" ? "block" : "none" }}>
          <ClientScenarioView clientId={clientId} />
        </div>
      )}
      {visitedSubTabs.has("debts") && (
        <div style={{ display: activeSubTab === "debts" ? "block" : "none" }}>
          <DebtManager clientId={clientId} />
        </div>
      )}
      {visitedSubTabs.has("tools") && (
        <div style={{ display: activeSubTab === "tools" ? "block" : "none" }}>
          <GrowthTools />
        </div>
      )}

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
function PortfolioUploadTab({ clientId, portfolioMonths, portfolioSubs, onDataChange, onMonthCreated, rememberedMappings, onRememberingAdded, step, setStep, activeEntry, setActiveEntry, entrySubs, setEntrySubs, cycleStartDay = 1, incomeCats = new Set<string>(), categories, categoryRows = [], clientCats, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, categoryRules = [] as any[], hiddenCats = [] as string[], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
  // ── פונקציית עזר: חישוב טווח חיוב לפי מפתח חודש ────────────────────────────
  function getBillingRange(monthKey: string): { startDate: Date; endDate: Date; rangeLabel: string } | null {
    if (!monthKey) return null;
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return null;
    const sd = (!cycleStartDay || cycleStartDay < 1 || cycleStartDay > 28) ? 1 : cycleStartDay;
    let sMonth = m, sYear = y, eMonth = m, eYear = y, eDayNum: number;
    if (sd === 1) {
      eDayNum = new Date(y, m, 0).getDate();
    } else {
      sMonth = m - 1; sYear = y;
      if (sMonth === 0) { sMonth = 12; sYear = y - 1; }
      eDayNum = sd - 1;
    }
    const startDate = new Date(sYear, sMonth - 1, sd);
    const endDate = new Date(eYear, eMonth - 1, eDayNum);
    const rangeLabel = `${String(sd).padStart(2,"0")}.${String(sMonth).padStart(2,"0")} – ${String(eDayNum).padStart(2,"0")}.${String(eMonth).padStart(2,"0")}`;
    return { startDate, endDate, rangeLabel };
  }

  function parseTxDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (s.includes('/')) {
      const p = s.split('/');
      let yr = +p[2];
      if (yr < 100) yr += 2000;
      return new Date(yr, +p[1] - 1, +p[0]);
    } else if (s.includes('-') && s.split('-').length === 3) {
      const p = s.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    return null;
  }
  const [showPicker, setShowPicker]   = useState(false);
  const [deletedMonthKeys, setDeletedMonthKeys] = useState<Set<string>>(new Set());
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sourceType, setSourceType]       = useState("");
  const [sourceNickname, setSourceNickname] = useState("");
  const [editingSubId, setEditingSubId]   = useState<string|null>(null);
  const [confirmModal, setConfirmModal]   = useState<{title:string;body?:string;confirmText?:string;danger?:boolean;onConfirm:()=>void}|null>(null);
  const sourceLabel = sourceType
    ? (sourceNickname.trim() ? `${sourceType} — ${sourceNickname.trim()}` : sourceType)
    : sourceNickname.trim();
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter]           = useState("all");
  const [search, setSearch]           = useState("");
  const [activeTxId, setActiveTxId]   = useState(null);
  const [prevCatMapP, setPrevCatMapP] = useState<Record<string,string>>({});
  const [catSearch, setCatSearch]     = useState("");
  const [saving, setSaving]           = useState(false);
  const [pendingRemember, setPendingRemember] = useState(null);
  const [analyzing, setAnalyzing]     = useState(false);
  const [analyzeResults, setAnalyzeResults] = useState<{name:string,count:number,outOfRange?:number,rangeLabel?:string,error?:string}[]>([]);
  const [dragOver, setDragOver]       = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // חודש נחשב "תפוס" רק אם יש לו לפחות submission אחד — ghost entries לא חוסמים בחירה מחדש
  const usedKeys = portfolioMonths
    .filter(e => !deletedMonthKeys.has(e.month_key) && portfolioSubs.some(s => s.month_key === e.month_key))
    .map(e => e.month_key);

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
    setSourceType("");
    setSourceNickname("");
    setEditingSubId(null);
    setTransactions([]);
    setStep("upload");
  };

  const goToUpload = () => {
    setUploadedFiles([]);
    setSourceType("");
    setSourceNickname("");
    setEditingSubId(null);
    setTransactions([]);
    setStep("upload");
  };

  const NON_PARSEABLE_EXTS = [".png", ".jpg", ".jpeg", ".doc", ".docx"];
  const isNonParseable = (name: string) => NON_PARSEABLE_EXTS.some(ext => name.toLowerCase().endsWith(ext));

  const analyzeFiles = async () => {
    setAnalyzing(true);
    setAnalyzeResults([]);
    const results: {name:string,count:number,outOfRange?:number,rangeLabel?:string,error?:string}[] = [];
    let allTx: any[] = [];
    const range = activeEntry ? getBillingRange(activeEntry.month_key) : null;
    for (const file of uploadedFiles) {
      if (isNonParseable(file.name)) {
        results.push({ name: file.name, count: 0, error: "סוג קובץ זה אינו נתמך לניתוח אוטומטי — יש להמיר ל-Excel או CSV" });
        setAnalyzeResults([...results]);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        let parsed: any[];
        if (file.name.toLowerCase().endsWith('.pdf')) {
          parsed = await parseBankPDF(buf, file.name, rememberedMappings, categoryRules);
        } else {
          parsed = parseExcelData(buf, file.name, rememberedMappings, categoryRules);
        }
        // סנן לפי טווח החודש הנבחר
        let outOfRange = 0;
        if (range) {
          const before = parsed.length;
          parsed = parsed.filter(tx => {
            const d = parseTxDate(tx.date);
            if (!d) return true; // שמור אם לא ניתן לנתח את התאריך
            return d >= range.startDate && d <= range.endDate;
          });
          outOfRange = before - parsed.length;
        }
        allTx = allTx.concat(parsed);
        results.push({ name: file.name, count: parsed.length, outOfRange, rangeLabel: range?.rangeLabel });
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
    if (editingSubId) {
      // עדכון מקור קיים
      const { error } = await supabase.from("portfolio_submissions").update({
        transactions,
        source_label: sourceLabel,
        source_type: sourceType,
        source_nickname: sourceNickname,
      }).eq("id", editingSubId);
      setSaving(false);
      if (error) { alert("שגיאה בשמירה — " + error.message); return; }
    } else {
      // הוספת מקור חדש
      const { error } = await supabase.from("portfolio_submissions").insert([{
        client_id: clientId,
        month_key: activeEntry.month_key,
        label: sourceLabel || activeEntry.label,
        source_label: sourceLabel,
        source_type: sourceType,
        source_nickname: sourceNickname,
        files: uploadedFiles.map(f => f.name),
        transactions,
        created_at: new Date().toISOString()
      }]);
      setSaving(false);
      if (error) { alert("שגיאה בשמירה — " + error.message); return; }
    }
    // reload fresh
    const subs = await loadEntrySubs(activeEntry.month_key);
    setEntrySubs(subs);
    setUploadedFiles([]); setTransactions([]); setSourceType(""); setSourceNickname(""); setEditingSubId(null);
    setStep("month");
    onDataChange(); // fire without await
  };

  const confirmDeleteSub = (sub) => {
    const txCount = (sub.transactions || []).length;
    setConfirmModal({
      title: "מחיקת מקור",
      body: `האם למחוק את "${sub.source_label || sub.label}" ואת כל ${txCount} התנועות שלו?\nפעולה זו אינה הפיכה.`,
      confirmText: "מחק",
      danger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        await supabase.from("portfolio_submissions").delete().eq("id", sub.id);
        const subs = await loadEntrySubs(activeEntry.month_key);
        setEntrySubs(subs);
        onDataChange();
      }
    });
  };

  const editSub = (sub) => {
    const label = sub.source_label || sub.label || "";
    const type = sub.source_type || "";
    const nick = sub.source_nickname || (type ? "" : label);
    setConfirmModal({
      title: "עריכת סיווגי תנועות",
      body: `כניסה לעריכת הסיווגים של "${label}".\nתוכל לשנות קטגוריה לכל תנועה ולשמור בסיום.`,
      confirmText: "ערוך",
      danger: false,
      onConfirm: () => {
        setConfirmModal(null);
        setEditingSubId(sub.id);
        setSourceType(type);
        setSourceNickname(nick);
        setTransactions(sub.transactions || []);
        setFilter("all");
        setSearch("");
        setActiveTxId(null);
        setStep("review");
      }
    });
  };

  const deleteMonth = async (entry, e) => {
    e.stopPropagation();
    if (!window.confirm(`למחוק את ${entry.label} וכל הנתונים שלו?`)) return;
    // הסר מיידית מה-UI
    setDeletedMonthKeys(prev => { const next = new Set(prev); next.add(entry.month_key); return next; });
    // מחק מה-DB — שניהם במקביל
    await Promise.all([
      supabase.from("portfolio_submissions").delete().eq("client_id", clientId).eq("month_key", entry.month_key),
      supabase.from("portfolio_months").delete().eq("client_id", clientId).eq("month_key", entry.month_key),
    ]);
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
          <div style={{ display:"flex", justifyContent:"center", marginBottom:12, opacity:0.4 }}><DocIcon name="folder" color="var(--text-dim)" size={36} /></div>
          <div style={{ marginBottom:16 }}>הוסף את החודש הראשון לתיק</div>
          <Btn onClick={() => setShowPicker(true)}>+ הוסף חודש</Btn>
        </Card>
      ) : portfolioMonths.filter(entry => !deletedMonthKeys.has(entry.month_key)).map(entry => {
        const subs = portfolioSubs.filter(s => s.month_key === entry.month_key);
        const allTx = subs.flatMap(s => s.transactions || []);
        const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum,t) => sum+(incomeCats.has(t.cat)?-t.amount:t.amount), 0);
        return (
          <Card key={entry.month_key} style={{ marginBottom:10, border:`1px solid ${entry.is_finalized?"rgba(46,204,138,0.25)":"var(--border)"}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ flex:1, cursor:"pointer" }} onClick={() => openMonth(entry)}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                  <span style={{ fontWeight:700 }}>{entry.label}</span>
                  {entry.is_finalized
                    ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"2px 10px", fontSize: 13, display:"inline-flex", alignItems:"center", gap:4 }}><DocIcon name="check-circle" color="var(--green-soft)" size={13} /> הושלם</span>
                    : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"2px 10px", fontSize: 13 }}>בתהליך</span>
                  }
                </div>
                <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{subs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
              </div>
              <button
                onClick={e => deleteMonth(entry, e)}
                style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"4px 12px", fontSize: 14, color:"var(--red)", cursor:"pointer", fontFamily:"inherit", flexShrink:0, marginRight:8 }}
              >מחק</button>
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
    const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum,t) => sum+(incomeCats.has(t.cat)?-t.amount:t.amount), 0);
    const catMap: Record<string, number> = {};
    allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat]||0)+(incomeCats.has(t.cat)?-t.amount:t.amount); });

    return (
      <div>
        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            body={confirmModal.body}
            confirmText={confirmModal.confirmText}
            danger={confirmModal.danger}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
          <Btn variant="ghost" size="sm" onClick={() => setStep("list")}>← חזור</Btn>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontWeight:700, fontSize: 20 }}>{activeEntry.label}</span>
              {activeEntry.is_finalized
                ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"2px 10px", fontSize: 14, display:"inline-flex", alignItems:"center", gap:4 }}><DocIcon name="check-circle" color="var(--green-soft)" size={14} /> הושלם</span>
                : entrySubs.length === 0
                  ? <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"2px 10px", fontSize: 14 }}>בתהליך</span>
                  : null
              }
            </div>
            <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{entrySubs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
          </div>
          {activeEntry.is_finalized && (
            <Btn variant="ghost" size="sm" onClick={reopenMonth}><DocIcon name="unlock" size={13} /> פתח לעריכה</Btn>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:16 }}>
          {/* סיכום לפי סעיף */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:12, fontSize: 18, display:"flex", alignItems:"center", gap:6 }}><DocIcon name="bar-chart" size={16} /> סיכום לפי סעיף</div>
            {allTx.length === 0 ? (
              <div style={{ color:"var(--text-dim)", fontSize:14, textAlign:"center", padding:"16px 0" }}>אין תנועות עדיין</div>
            ) : (
              <div style={{ maxHeight:280, overflowY:"auto" }}>
                {Object.entries(catMap).sort((a,b)=>b[1]-a[1]).map(([cat,amt]) => (
                  <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:`1px solid ${"var(--border)"}22`, fontSize: 14 }}>
                    <span>{cat}</span>
                    <span style={{ fontWeight:700, color:"var(--red)" }}>₪{Math.round(amt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* מקורות */}
          <Card>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize: 18, display:"flex", alignItems:"center", gap:8 }}><DocIcon name="folder" color="var(--green-deep)" size={18} /> מקורות</div>
              <Btn size="sm" onClick={goToUpload}>+ הוסף מקור</Btn>
            </div>
            {entrySubs.length === 0 ? (
              <div style={{ textAlign:"center", color:"var(--text-dim)", fontSize:14, padding:"20px 0" }}>
                עוד לא הוספת מקורות לחודש זה
              </div>
            ) : (
              entrySubs.map(sub => (
                <div key={sub.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${"var(--border)"}22` }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight:600 }}>{sub.source_label || sub.label}</div>
                    <div style={{ fontSize: 13, color:"var(--text-dim)" }}>{(sub.transactions||[]).length} תנועות</div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button
                      onClick={() => editSub(sub)}
                      style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:7, padding:"3px 10px", fontSize:13, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4 }}
                    ><DocIcon name="pencil" color="var(--text-dim)" size={13} /> ערוך</button>
                    <button
                      onClick={() => confirmDeleteSub(sub)}
                      style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:7, padding:"3px 10px", fontSize:13, color:"var(--red)", cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", justifyContent:"center" }}
                    ><DocIcon name="trash" color="var(--red)" size={13} /></button>
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    );
  }

  // ══ UPLOAD ════════════════════════════════════════════════════════════════════
  if (step === "upload") {
    if (!activeEntry) { setStep("list"); return null; }
    return (
    <div style={{ maxWidth:580, margin:"0 auto" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
        <Btn variant="ghost" size="sm" onClick={() => setStep("month")}>← חזור</Btn>
        <div style={{ fontWeight:700, fontSize: 18 }}>הוסף מקור — {activeEntry?.label}</div>
      </div>

      <Card style={{ marginBottom:14 }}>
        <div style={{ fontWeight:700, marginBottom:10, fontSize: 15 }}>שם המקור</div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom: sourceType ? 12 : 0 }}>
          {["כלול בכרטיס","עו\"ש","אחר"].map(s => (
            <button type="button" key={s}
              onClick={() => { setSourceType(s === sourceType ? "" : s); setSourceNickname(""); }}
              style={{ padding:"12px 28px", borderRadius:12, fontSize: 18, fontWeight:700, cursor:"pointer", fontFamily:"inherit",
                border:`2px solid ${sourceType===s?"var(--green-mid)":"var(--border)"}`,
                background:sourceType===s?"var(--green-mint)":"var(--surface2)",
                color:sourceType===s?"var(--green-deep)":"var(--text-dim)",
                boxShadow: sourceType===s?"0 2px 8px rgba(45,106,79,0.2)":"none",
                transition:"all 0.15s" }}>{s}</button>
          ))}
        </div>
        {sourceType && (
          <div>
            <div style={{ fontSize: 14, color:"var(--text-dim)", marginBottom:5 }}>
              {sourceType === "אחר" ? "שם חופשי (אופציונלי)" : `כינוי (אופציונלי) — למשל: לאומי, פועלים, כאל`}
            </div>
            <input
              value={sourceNickname}
              onChange={e => setSourceNickname(e.target.value)}
              placeholder={sourceType === "אחר" ? "למשל: קופת גמל, ביטקוין..." : `למשל: ${sourceType} לאומי`}
              style={{ width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontSize:15, fontFamily:"inherit", outline:"none" }}
            />
            {sourceLabel && (
              <div style={{ fontSize:13, color:"var(--text-dim)", marginTop:5 }}>
                שם המקור: <strong style={{ color:"var(--green-deep)" }}>{sourceLabel}</strong>
              </div>
            )}
          </div>
        )}
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
        <div style={{ fontSize: 30, marginBottom:8 }}>{dragOver ? "⬇️" : "📎"}</div>
        <div style={{ fontWeight:600, fontSize: 15, marginBottom:4 }}>{dragOver ? "שחרר להוספה" : "גרור קבצים לכאן"}</div>
        <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:12 }}>Excel, CSV, PDF, Word, תמונות וכל קובץ פיננסי</div>
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
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:i<uploadedFiles.length-1?`1px solid ${"var(--border)"}22`:"none", fontSize: 14 }}>
                <span>📄 {f.name}</span>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {res && (
                    <span style={{ fontSize: 13, color: res.error ? "var(--red)" : res.count === 0 ? "var(--gold)" : "var(--green-soft)" }}>
                      {res.error ? `⚠️ ${res.error}` : res.count === 0 ? "⚠️ לא זוהו תנועות" : (
                        res.rangeLabel
                          ? `✓ ${res.count} תנועות נוספו לטווח ${res.rangeLabel}${(res.outOfRange || 0) > 0 ? ` • ${res.outOfRange} מחוץ לטווח` : ""}`
                          : `✓ ${res.count} תנועות`
                      )}
                    </span>
                  )}
                  {analyzing && !res && <span style={{ fontSize: 13, color:"var(--text-dim)" }}>מנתח...</span>}
                  <button onClick={() => setUploadedFiles(p => p.filter((_,j)=>j!==i))} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize: 18 }}>×</button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {analyzeResults.length > 0 && !analyzing && analyzeResults.every(r => r.count === 0) && (
        <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid var(--gold)", borderRadius:8, padding:"10px 14px", marginBottom:12, fontSize: 14, color:"var(--gold)" }}>
          ⚠️ לא זוהו תנועות באף קובץ. בדוק שהקבצים הם Excel/CSV עם עמודות תאריך, שם עסק וסכום.
        </div>
      )}

      <Btn onClick={analyzeFiles} disabled={uploadedFiles.length===0||!sourceType||analyzing} style={{ width:"100%", justifyContent:"center" }}>
        {analyzing ? "⏳ מנתח..." : "🔍 נתח תנועות ←"}
      </Btn>
    </div>
  );

  }

  // ══ REVIEW ════════════════════════════════════════════════════════════════════
  if (step === "review") return (
    <div>
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          body={confirmModal.body}
          confirmText={confirmModal.confirmText}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Btn variant="ghost" size="sm" onClick={() => { const wasEditing = !!editingSubId; setEditingSubId(null); setStep(wasEditing ? "month" : "upload"); }}>← חזור</Btn>
          <div style={{ fontWeight:700, display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="pencil" color="var(--text)" size={15} /> {editingSubId ? "עריכת" : "סיווג"} תנועות — {sourceLabel}</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ fontSize: 15, color:"var(--text-dim)" }}>{transactions.length} תנועות</span>
          <Btn size="sm" onClick={saveSource} disabled={saving}><DocIcon name="save" color="#fff" size={13} /> {saving?"שומר...":"שמור"}</Btn>
        </div>
      </div>

      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        {[["all","הכל"],["low","ביטחון נמוך"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ padding:"4px 12px", borderRadius:20, fontSize: 14, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${filter===v?"var(--green-mid)":"var(--border)"}`, background:filter===v?"var(--green-mint)":"transparent", color:filter===v?"var(--green-deep)":"var(--text-mid)" }}>{l}</button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
          style={{ flex:1, minWidth:120, background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:20, padding:"4px 12px", color:"var(--text)", fontSize: 14, fontFamily:"inherit", outline:"none" }} />
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

      {(() => {
        const isPdf = (tx: any) => (tx.source || '').toLowerCase().endsWith('.pdf');
        const toggleFlowType = (id: any) => {
          setTransactions(prev => prev.map(t =>
            t.id === id
              ? { ...t, flow_type: t.flow_type === 'credit_transfer' ? 'expense' : 'credit_transfer' }
              : t
          ));
        };

        const incomeTxs         = filteredTx.filter(tx => tx.maxCat === 'הכנסות');
        const creditTransferTxs = filteredTx.filter(tx => tx.maxCat !== 'הכנסות' && tx.flow_type === 'credit_transfer');
        const expenseTxs        = filteredTx.filter(tx => tx.maxCat !== 'הכנסות' && tx.flow_type !== 'credit_transfer');
        const hasIncome         = incomeTxs.length > 0;
        const hasTransfers      = creditTransferTxs.length > 0;

        const renderCard = (tx: any, inTransferSection = false) => {
          const isKnown  = !!rememberedMappings[tx.name];
          const needsCat = tx.conf === 'low' && tx.cat === 'הוצאות לא מתוכננות' && isPdf(tx) && !inTransferSection;
          return (
          <Card key={tx.id} style={{ marginBottom:8, padding:"12px 16px", opacity: inTransferSection ? 0.85 : 1 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontWeight:600, fontSize: 16 }}>{tx.name}</span>
                  <span style={{ fontSize: 12, padding:"2px 6px", borderRadius:10, fontWeight:600,
                    background: isKnown ? "rgba(46,204,138,0.12)" : "rgba(255,183,77,0.12)",
                    color: isKnown ? "var(--green-soft)" : "var(--gold)",
                    border: `1px solid ${isKnown ? "rgba(46,204,138,0.3)" : "rgba(255,183,77,0.3)"}`,
                  }}>{isKnown ? "מוכר" : "חדש"}</span>
                </div>
                <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{tx.date}</div>
                {tx.note && <div style={{ fontSize: 14, color:"var(--text-mid)", marginTop:3, fontStyle:"italic", display:"flex", alignItems:"center", gap:4 }}><DocIcon name="pencil" color="var(--text-dim)" size={12} />{tx.note}</div>}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <span style={{ fontWeight:700, color: tx.maxCat === 'הכנסות' ? "var(--green-mid)" : "var(--red)", fontSize: 16 }}>
                  {tx.maxCat === 'הכנסות' ? '+' : ''}₪{tx.amount?.toLocaleString()}
                </span>
                {!inTransferSection && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); setActiveTxId(activeTxId===tx.id?null:tx.id); setCatSearch(""); }}
                      style={{ background: needsCat ? "rgba(192,57,43,0.08)" : "var(--green-mint)", border:`1px solid ${needsCat ? "var(--red)" : "var(--green-soft)"}`, borderRadius:8, padding:"5px 12px", fontSize: 15, color: needsCat ? "var(--red)" : "var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                      {needsCat ? '⚠️ דרוש סיווג' : tx.cat}
                    </button>
                    {tx.cat !== 'להתעלם' ? (
                      <button
                        onClick={e => { e.stopPropagation(); setPrevCatMapP(p => ({...p, [tx.id]: tx.cat})); setTransactions(p => p.map(t => t.id===tx.id ? { ...t, cat:"להתעלם", edited:true, conf:"high" } : t)); setActiveTxId(null); }}
                        title="התעלם מתנועה זו — לא תיספר"
                        style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", fontSize: 15, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                      >⊘</button>
                    ) : prevCatMapP[tx.id] ? (
                      <button
                        onClick={e => { e.stopPropagation(); const prev = prevCatMapP[tx.id]; setTransactions(p => p.map(t => t.id===tx.id ? { ...t, cat:prev, edited:true, conf:"high" } : t)); setPrevCatMapP(p => { const n={...p}; delete n[tx.id]; return n; }); }}
                        title="בטל התעלמות"
                        style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"5px 10px", fontSize:13, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}
                      >↩️ {prevCatMapP[tx.id]}</button>
                    ) : null}
                  </>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setActiveTxId(activeTxId===`note_${tx.id}`?null:`note_${tx.id}`); }}
                  style={{ background:"transparent", border:"1px solid var(--border)", borderRadius:8, padding:"5px 10px", display:"inline-flex", alignItems:"center", justifyContent:"center", color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}
                  title="הוסף הערה"><DocIcon name="pencil" color="var(--text-dim)" size={14} /></button>
                {isPdf(tx) && (
                  <button
                    onClick={e => { e.stopPropagation(); toggleFlowType(tx.id); }}
                    title={inTransferSection ? "הזז להוצאות רגילות" : "סמן כחיוב אשראי — לא ייספר בהוצאות"}
                    style={{ background: inTransferSection ? "var(--green-mint)" : "transparent", border:`1px solid ${inTransferSection ? "var(--green-soft)" : "var(--border)"}`, borderRadius:8, padding:"5px 10px", fontSize: 14, color: inTransferSection ? "var(--green-deep)" : "var(--text-dim)", cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}
                  >{inTransferSection ? "↩ הוצאה" : "כלול בכרטיס"}</button>
                )}
              </div>
            </div>
            {!inTransferSection && activeTxId === tx.id && (
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
                  setTransactions(p => p.map(t =>
                    t.id === tx.id ? { ...t, cat, edited: true, conf: "high" } : t
                  ));
                  setActiveTxId(null); setCatSearch("");
                  setPendingRemember({ name: tx.name, cat });
                }}
              />
            )}
            {activeTxId === `note_${tx.id}` && (
              <div style={{ marginTop:8 }}>
                <input autoFocus value={tx.note || ""}
                  onChange={e => setTransactions(p => p.map(t => t.id===tx.id?{...t,note:e.target.value}:t))}
                  placeholder="הוסף הערה לעסקה זו..."
                  style={{ width:"100%", background:"var(--surface2)", border:"1.5px solid var(--green-soft)", borderRadius:8, padding:"7px 12px", color:"var(--text)", fontFamily:"inherit", fontSize: 15, outline:"none", boxSizing:"border-box" }}
                  onKeyDown={e => { if (e.key==="Enter"||e.key==="Escape") setActiveTxId(null); }}
                />
              </div>
            )}
          </Card>
          );
        };

        return (
          <>
            {hasIncome && (
              <>
                <div style={{ fontWeight:800, fontSize: 20, color:"var(--green-deep)", marginBottom:10, marginTop:8, padding:"10px 14px", background:"var(--green-mint)", borderRadius:10, display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid var(--green-soft)" }}>
                  💰 הכנסות <span style={{ fontWeight:500, color:"var(--green-mid)", fontSize: 16 }}>({incomeTxs.length})</span>
                </div>
                {incomeTxs.map(tx => renderCard(tx, false))}
              </>
            )}
            {expenseTxs.length > 0 && (
              <div style={{ fontWeight:800, fontSize: 20, color:"var(--red)", marginBottom:10, marginTop: hasIncome ? 16 : 8, padding:"10px 14px", background:"var(--red-light)", borderRadius:10, display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid var(--red)" }}>
                💸 הוצאות <span style={{ fontWeight:500, color:"var(--text-dim)", fontSize: 16 }}>({expenseTxs.length})</span>
              </div>
            )}
            {expenseTxs.map(tx => renderCard(tx, false))}
            {hasTransfers && (
              <>
                <div style={{ fontWeight:800, fontSize: 20, color:"var(--text-dim)", marginBottom:6, marginTop:20, padding:"10px 14px", background:"var(--surface2)", borderRadius:10, display:"flex", alignItems:"center", gap:8, borderBottom:"2px solid var(--border)" }}>
                  חיובי אשראי <span style={{ fontWeight:500, color:"var(--text-dim)", fontSize: 16 }}>({creditTransferTxs.length})</span>
                </div>
                <div style={{ fontSize: 15, color:"var(--text-dim)", background:"rgba(255,183,77,0.08)", border:"1px solid rgba(255,183,77,0.25)", borderRadius:8, padding:"8px 14px", marginBottom:10 }}>
                  ℹ️ תנועות אלו הן תשלומי כרטיס אשראי — <strong>לא נספרות כהוצאה</strong> כדי למנוע כפילות עם נתוני מקס/ישראכרט. לחץ על ↩️ כדי להעביר להוצאות.
                </div>
                {creditTransferTxs.map(tx => renderCard(tx, true))}
              </>
            )}
          </>
        );
      })()}

      {/* Save button at bottom */}
      <div style={{ position:"sticky", bottom:20, display:"flex", justifyContent:"center", marginTop:16 }}>
        <Btn onClick={saveSource} disabled={saving} style={{ boxShadow:"0 4px 20px rgba(45,106,79,0.3)", padding:"12px 36px", fontSize: 17 }}>
          <DocIcon name="save" color="#fff" size={15} /> {saving?"שומר...":"שמור את כל הסיווגים"}
        </Btn>
      </div>
    </div>
  );

  return null;
}


// ── Portfolio Control Tab ─────────────────────────────────────────────────────
// ── assignBillingMonth ────────────────────────────────────────────────────────
// date: "DD/MM/YYYY" or "YYYY-MM-DD" → "YYYY-MM" based on cycleStartDay

function PortfolioControlTab({ clientId, portfolioMonths, portfolioSubs, cycleStartDay, importedTxs, manualTxs, rememberedMappings, onCycleStartDayChange, ignoredCats = IGNORED_CATEGORIES, incomeCats = new Set<string>(), categoryRules = [] as any[] }) {
  const NOW_YEAR  = new Date().getFullYear();
  const NOW_MONTH = new Date().getMonth() + 1; // 1–12
  const NOW_DAY   = new Date().getDate();

  const [editingCycleDay, setEditingCycleDay] = useState(false);
  const [tempDay, setTempDay]                 = useState(String(cycleStartDay));
  const [savingDay, setSavingDay]             = useState(false);

  const saveCycleDay = async () => {
    const d = parseInt(tempDay);
    if (isNaN(d) || d < 1 || d > 31) return;
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

  // ── Load all periods ─────────────────────────────────────────────────────
  const loadPeriods = async () => {
    const { data: per } = await supabase
      .from("active_scenario")
      .select("id, scenario_id, active_from, active_until, scenarios(name)")
      .eq("client_id", clientId)
      .order("active_from", { ascending: false });
    // סנן רשומות שהתסריט שלהן נמחק (join החזיר null)
    setAllPeriods((per || []).filter(p => p.scenario_id && p.scenarios));
  };

  useEffect(() => { loadPeriods(); }, [clientId]); // eslint-disable-line

  // ── Real-time: כשתסריט פעיל משתנה — רענן מיידית ──────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`portfolio_control_scenario_${clientId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "active_scenario",
        filter: `client_id=eq.${clientId}`,
      }, () => { loadPeriods(); setItemsCache({}); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId]); // eslint-disable-line

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
      .then(({ data, error }) => {
        if (error) { console.error("scenario_items load error:", error); return; }
        const items = data || [];
        setScenarioItems(items);
        setItemsCache(prev => ({ ...prev, [period.scenario_id]: items }));
      });
  }, [allPeriods, selectedYear]); // eslint-disable-line

  // ── Build txMap: שני מפות נפרדות — הכנסות והוצאות ────────────────────────
  const { incomeMap, expenseMap } = useMemo(() => {
    const inc = {};
    const exp = {};
    const add = (map, mk, cat, amt) => {
      if (!mk || !cat || !amt) return;
      if (!map[mk]) map[mk] = {};
      map[mk][cat] = (map[mk][cat] || 0) + amt;
    };
    // From portfolio submissions
    portfolioSubs.forEach(sub => {
      const mk = sub.month_key;
      if (!mk || +mk.split('-')[0] !== currentYear) return;
      (sub.transactions || []).forEach(tx => {
        if (ignoredCats.has(tx.cat)) return;
        if (tx.flow_type === 'credit_transfer') return;
        const cat = tx.cat || "הוצאות לא מתוכננות";
        if (incomeCats.has(cat)) add(inc, mk, cat, tx.amount || 0);
        else add(exp, mk, cat, tx.amount || 0);
      });
    });
    // From imported transactions
    (importedTxs || []).forEach(tx => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month || assignBillingMonth(tx.date, cycleStartDay || 1);
      if (!mk || +mk.split('-')[0] !== currentYear) return;
      const cat = tx.cat || classifyTx(tx.name, tx.max_category, rememberedMappings || {}, categoryRules).cat;
      if (ignoredCats.has(cat)) return;
      if (incomeCats.has(cat)) add(inc, mk, cat, tx.amount);
      else add(exp, mk, cat, tx.amount);
    });
    // From manual transactions — type קובע להכנסה או הוצאה
    (manualTxs || []).forEach(tx => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month;
      if (!mk || +mk.split('-')[0] !== currentYear) return;
      if (ignoredCats.has(tx.cat)) return;
      if (tx.type === 'income') add(inc, mk, tx.cat, tx.amount);
      else add(exp, mk, tx.cat, tx.amount);
    });
    return { incomeMap: inc, expenseMap: exp };
  }, [portfolioSubs, importedTxs, manualTxs, rememberedMappings, cycleStartDay, currentYear, incomeCats, ignoredCats]);

  // txMap משולב — לשימוש ב-missingCats ובכל מקום שלא מבחין בין סוגים
  const txMap = useMemo(() => {
    const map = {};
    [incomeMap, expenseMap].forEach(src => {
      Object.entries(src).forEach(([mk, cats]: [string, any]) => {
        if (!map[mk]) map[mk] = {};
        Object.entries(cats).forEach(([cat, amt]: [string, any]) => {
          map[mk][cat] = (map[mk][cat] || 0) + amt;
        });
      });
    });
    return map;
  }, [incomeMap, expenseMap]);

  // Months this year that have any data, up to current month
  const activeMks = useMemo(() =>
    Object.keys(txMap)
      .filter(mk => { const [y, m] = mk.split('-').map(Number); return y === currentYear && m <= currentMonth; })
      .sort()
  , [txMap, currentYear, currentMonth]);

  const numActive = activeMks.length;

  // ── Helpers ──────────────────────────────────────────────────────────────
  // getAct — item_type קובע מאיזו מפה לשלוף
  const getAct = (cat, mk, itemType?: string) => {
    if (itemType === 'income') return incomeMap[mk]?.[cat] || 0;
    if (itemType === 'expense_fixed' || itemType === 'expense_variable') return expenseMap[mk]?.[cat] || 0;
    return txMap[mk]?.[cat] || 0;
  };
  const getSum = (cat, itemType?: string) => activeMks.reduce((s, mk) => s + getAct(cat, mk, itemType), 0);
  const getAvg = (cat, itemType?: string) => numActive > 0 ? getSum(cat, itemType) / numActive : 0;
  // remaining = cumulative budget up to current month − total spent
  const getRem = (cat, bud, itemType?: string) => currentMonth * (bud || 0) - getSum(cat, itemType);

  const fmtAmt = (n)            => n ? `₪${Math.round(n).toLocaleString()}` : "";
  const fmtZ   = (n)            => `₪${Math.round(n).toLocaleString()}`;

  const groupSum  = (grp, mk)   => grp.reduce((s, x) => s + getAct(x.category_name, mk, x.item_type), 0);
  const groupTotal= (grp)       => grp.reduce((s, x) => s + getSum(x.category_name, x.item_type), 0);
  const groupBud  = (grp)       => grp.reduce((s, x) => s + (x.amount || 0), 0);
  const groupAvg  = (grp)       => grp.reduce((s, x) => s + getAvg(x.category_name, x.item_type), 0);
  const groupRem  = (grp)       => grp.reduce((s, x) => s + getRem(x.category_name, x.amount || 0, x.item_type), 0);


  const avgOverBudget = (avg, bud) => bud > 0 && avg > bud + Math.max(bud * 0.01, 50);

  const sortItems = (items) => {
    if (!sortCol) return items;
    return [...items].sort((a, b) => {
      if (sortCol === "name") return sortDir === "asc"
        ? a.category_name.localeCompare(b.category_name, "he")
        : b.category_name.localeCompare(a.category_name, "he");
      let va, vb;
      if (sortCol === "budget")   { va = a.amount||0; vb = b.amount||0; }
      else if (sortCol === "avg") { va = getAvg(a.category_name, a.item_type); vb = getAvg(b.category_name, b.item_type); }
      else if (sortCol === "rem") { va = getRem(a.category_name, a.amount||0, a.item_type); vb = getRem(b.category_name, b.amount||0, b.item_type); }
      else { va = getAct(a.category_name, sortCol, a.item_type); vb = getAct(b.category_name, sortCol, b.item_type); }
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
  const incomeDisplay = income.some(x => x.category_name === "הכנסות מזדמנות") || getSum("הכנסות מזדמנות", "income") === 0
    ? income
    : [...income, { id: "__occasional__", category_name: "הכנסות מזדמנות", amount: 0, item_type: "income" }];

  // ── Visible month columns ─────────────────────────────────────────────────
  const maxVisibleMonth = showAllMonths ? 12 : Math.min(currentMonth + 1, 12);
  const displayMonths   = Array.from({ length: maxVisibleMonth }, (_, i) => i + 1);
  const numCols         = 2 + displayMonths.length + 2;

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: "10px 8px", textAlign: "center", fontWeight: 700,
    borderBottom: "2px solid var(--border)", borderLeft: "1px solid var(--border)88",
    whiteSpace: "nowrap", background: "var(--surface2)", color: "var(--text-mid)", fontSize: 14,
    cursor: "pointer", userSelect: "none",
    position: "sticky", top: 0, zIndex: 2,
  };
  const TD: React.CSSProperties = {
    padding: "8px 8px", textAlign: "center",
    borderBottom: "1px solid var(--border)66", borderLeft: "1px solid var(--border)66",
    fontSize: 14, color: "var(--text)",
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
        padding: "10px 14px", fontWeight: 700, fontSize: 15,
        background: bg, color: "var(--text)",
        borderBottom: "1px solid var(--border)", borderTop: "2px solid var(--border)",
        letterSpacing: "0.01em",
      }}>
        {collapsed[key] ? "▶" : "▼"} {label}
      </td>
    </tr>
  );

  const renderItemRow = (item, isIncome = false, idx = 0) => {
    const bud = item.amount || 0;
    const itype = item.item_type;
    const avg = getAvg(item.category_name, itype);
    const sum = getSum(item.category_name, itype);
    const rem = getRem(item.category_name, bud, itype);
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
          const val = getAct(item.category_name, mk, itype);
          const isCur = m === currentMonth;
          const over  = !isIncome && bud > 0 && val > bud * 1.15;
          const inActive = activeMkSet.has(mk);
          return (
            <td key={m} style={{
              ...TD,
              background: isCur ? "rgba(45,106,79,0.05)" : undefined,
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
    const totalBg = bold ? "var(--green-pale)" : "var(--surface2)";
    return (
      <tr style={{ background: totalBg, fontWeight: bold ? 800 : 700, borderTop: bold ? "2px solid var(--green-mint)" : undefined }}>
        <td style={{ ...TDL, fontWeight: bold ? 800 : 700, background: totalBg, fontSize: bold ? 13 : 12 }}>{label}</td>
        <td style={TD}>{fmtZ(bud)}</td>
        {displayMonths.map(m => {
          const mk  = `${currentYear}-${String(m).padStart(2, '0')}`;
          const tot = groupSum(grp, mk);
          return (
            <td key={m} style={{ ...TD, background: m === currentMonth ? "rgba(45,106,79,0.07)" : undefined }}>
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
    {/* ── באנר: קטגוריות לא מתוכננות ── */}

    <div>
      {/* ── באנר: קטגוריות לא מתוכננות ── */}
      {missingCats.length > 0 && (
        <div style={{
          marginBottom: 16,
          background: "rgba(192,57,43,0.06)",
          border: "1px solid rgba(192,57,43,0.2)",
          borderRadius: 10,
          padding: "12px 16px",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--red)", marginBottom: 8 }}>
              {missingCats.length} קטגוריות עם הוצאות אינן מוגדרות בתסריט
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {missingCats.map(({ cat, total }) => (
                <span key={cat} style={{
                  background: "rgba(192,57,43,0.1)", border: "1px solid rgba(192,57,43,0.25)",
                  borderRadius: 20, padding: "3px 10px", fontSize: 14, color: "var(--red)",
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  {cat}
                  <strong>₪{Math.round(total).toLocaleString()}</strong>
                </span>
              ))}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              עבור לטאב <strong>מאזן מתוכנן</strong> כדי להוסיף קטגוריות אלו לתסריט
            </div>
          </div>
        </div>
      )}

      {/* ── יום תחילת המחזור החודשי ── */}
      <Card style={{ marginBottom:16, padding:"12px 18px", background:"var(--surface2)", border:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize: 15, color:"var(--text-mid)" }}>יום תחילת המחזור החודשי:</span>
          {editingCycleDay ? (
            <>
              <input type="number" min="1" max="28" value={tempDay}
                onChange={e => setTempDay(e.target.value)}
                style={{ width:60, padding:"5px 10px", borderRadius:8, border:"1.5px solid var(--green-mid)", fontSize: 16,
                  fontFamily:"inherit", background:"var(--surface)", color:"var(--text)", textAlign:"center" }} />
              <button onClick={saveCycleDay} disabled={savingDay}
                style={{ padding:"5px 14px", borderRadius:8, fontSize: 15, cursor:"pointer", fontFamily:"inherit",
                  background:"var(--green-mid)", color:"#fff", border:"none", fontWeight:700 }}>
                {savingDay ? "שומר..." : "שמור"}
              </button>
              <button onClick={() => { setEditingCycleDay(false); setTempDay(String(cycleStartDay)); }}
                style={{ padding:"5px 12px", borderRadius:8, fontSize: 15, cursor:"pointer", fontFamily:"inherit",
                  background:"transparent", color:"var(--text-dim)", border:"1px solid var(--border)" }}>
                ביטול
              </button>
            </>
          ) : (
            <>
              <span style={{ fontWeight:700, fontSize: 17, color:"var(--green-deep)" }}>{cycleStartDay}</span>
              <button onClick={() => { setEditingCycleDay(true); setTempDay(String(cycleStartDay)); }}
                style={{ padding:"4px 12px", borderRadius:8, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
                  background:"transparent", color:"var(--text-dim)", border:"1px solid var(--border)", display:"inline-flex", alignItems:"center", gap:5 }}>
                <DocIcon name="pencil" color="var(--text-dim)" size={13} /> שנה
              </button>
              <span style={{ fontSize: 15, color:"var(--text-dim)" }}>(שינוי ישפיע על החלוקה מעכשיו ואילך)</span>
            </>
          )}
        </div>
      </Card>

      {/* ── כותרת: ניווט שנה + תסריט ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => setSelectedYear(y => y - 1)}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-mid)", fontSize: 18, cursor: "pointer", fontFamily: "inherit", lineHeight: 1 }}>
            ‹
          </button>
          <div style={{ minWidth: 68, textAlign: "center", fontWeight: 700, fontSize: 18 }}>{selectedYear}</div>
          <button onClick={() => setSelectedYear(y => Math.min(y + 1, NOW_YEAR))}
            disabled={selectedYear >= NOW_YEAR}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: selectedYear >= NOW_YEAR ? "var(--text-dim)" : "var(--text-mid)", fontSize: 18, cursor: selectedYear >= NOW_YEAR ? "default" : "pointer", fontFamily: "inherit", lineHeight: 1, opacity: selectedYear >= NOW_YEAR ? 0.4 : 1 }}>
            ›
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {scenarioName ? (
            <div style={{ padding: "5px 12px", background: "var(--green-pale)", borderRadius: 8, border: "1px solid var(--green-mint)", fontSize: 14, color: "var(--green-deep)" }}>
              תסריט: <strong>{scenarioName}</strong>
              {numActive > 0 && <span style={{ color: "var(--text-dim)", marginRight: 8 }}>· {numActive} חודשים עם נתונים</span>}
            </div>
          ) : null}
          {(cycleStartDay || 1) > 1 && (
            <div style={{ padding: "4px 12px", background: "var(--surface2)", borderRadius: 20, border: "1px solid var(--border)", fontSize: 14, color: "var(--text-dim)" }}>
              מחזור מה-<strong>{cycleStartDay}</strong> לחודש
            </div>
          )}
          {numActive > 0 && (
            <div style={{ padding: "4px 12px", background: "var(--surface2)", borderRadius: 20, border: "1px solid var(--border)", fontSize: 14, color: "var(--text-dim)" }}>
              <strong>{numActive}</strong> חודשים פעילים
            </div>
          )}
          <button onClick={() => setShowAllMonths(v => !v)}
            style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-mid)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
            {showAllMonths ? "‹ צמצם" : "הצג כל השנה ›"}
          </button>
        </div>
      </div>

      {noScenarioForYear && (
        <div style={{ marginBottom: 12, padding: "10px 14px", background: "rgba(248,113,113,0.08)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.33)", fontSize: 15, color: "var(--red)" }}>
          לא הוגדר תסריט לשנת {selectedYear} — פנה ליועץ שלך להגדרת תסריט
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, direction: "rtl" }}>
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
                    background: m === currentMonth ? "rgba(45,106,79,0.13)" : undefined,
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
                      <td key={m} style={{ ...TD, background: m === currentMonth ? "rgba(45,106,79,0.07)" : undefined, color: (inc || exp) ? (diff >= 0 ? "var(--green-deep)" : "var(--red)") : undefined }}>
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
              <div style={{ fontWeight:700, fontSize: 18, display:"flex", alignItems:"center", gap:8 }}><DocIcon name="bar-chart" color="var(--green-deep)" size={18} /> {title}</div>
              <button onClick={() => setDrillDown(null)}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 16px", fontSize: 15, cursor:"pointer", fontFamily:"inherit", fontWeight:700, color:"var(--text)" }}>
                ← חזור
              </button>
            </div>
            {filtered.length === 0 ? (
              <div style={{ color:"var(--text-dim)", fontSize: 15, padding:"20px 0" }}>אין תנועות</div>
            ) : (
              <div style={{ overflowY:"auto", flex:1 }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize: 15 }}>
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
                          <td style={{ padding:"8px 10px", whiteSpace:"nowrap", color:"var(--text-dim)", fontSize: 14 }}>{HEBREW_MONTHS[m-1]} {y}</td>
                          <td style={{ padding:"8px 10px" }}>{tx.name}</td>
                          <td style={{ padding:"8px 10px", fontSize: 13, color:"var(--text-dim)" }}>{tx.source}</td>
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
    display:"block", width:"100%", borderRadius:10, padding:"11px 16px", fontSize: 16,
    cursor:"pointer", fontFamily:"inherit", textAlign:"right", border:"1px solid var(--border)",
    background:"var(--surface2)", color:"var(--text)", transition:"background 0.1s",
  };
  return (
    <>
      <div onClick={onJustHere} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:"24px 28px", zIndex:9001, width:"min(400px,90vw)", boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🧠</div>
          <div style={{ fontWeight:700, fontSize: 18, marginBottom:6 }}>לשנות את הסיווג של</div>
          <div style={{ fontSize: 17, color:"var(--text-dim)", lineHeight:1.5 }}>
            <strong style={{ color:"var(--text)" }}>"{pendingRemember.name}"</strong>
            {" "}→{" "}<strong style={{ color:"var(--green-mid)" }}>{pendingRemember.cat}</strong>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={onAlways} style={{ ...btnBase, borderColor:"var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", fontWeight:700 }}>
            שנה תמיד לעסק זה
            <div style={{ fontSize: 13, color:"var(--green-deep)", opacity:0.7, fontWeight:400, marginTop:2 }}>ישמר לתמיד — יחול גם על תנועות עתידיות</div>
          </button>
          <button onClick={onThisSession} style={btnBase}>
            שנה לכל התנועות בהעלאה הנוכחית
            <div style={{ fontSize: 13, color:"var(--text-dim)", marginTop:2 }}>עדכן את כל "{pendingRemember.name}" בסיווג הנוכחי בלבד</div>
          </button>
          <button onClick={onJustHere} style={{ ...btnBase, color:"var(--text-dim)" }}>
            שנה כאן בלבד
            <div style={{ fontSize: 13, color:"var(--text-dim)", marginTop:2 }}>רק תנועה זו — בלי לשנות שאר התנועות</div>
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
        flow_type: tx.flow_type || null,
        type: tx.type || null,
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
      flow_type: tx.flow_type || null,
      type: tx.type || null,
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
  categories, categoryRows = [], clientCats, onCategoryAdded, ignoredCats = IGNORED_CATEGORIES, incomeCats = new Set<string>(), categoryRules = [] as any[], hiddenCats = [] as string[], onHiddenCatsChange = undefined as any, scenarioCats = null as any }) {
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
  const filterBarRef = useRef<HTMLDivElement>(null);
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
  const ignoreSelected = async () => {
    const count = selectedUids.size;
    if (!window.confirm(`להתעלם מ-${count} התנועות שבחרת?\nהן לא ייספרו בניתוח אך יישארו במערכת.`)) return;
    const toIgnore = allTxs.filter(t => selectedUids.has(t._uid));
    // עדכון מיידי ב-localEdits (ללא reload)
    setLocalEdits(prev => {
      const next = new Map(prev);
      toIgnore.forEach(t => next.set(t._uid, "להתעלם"));
      return next;
    });
    setSelectedUids(new Set());
    // שמירה ב-DB ברקע
    const fileTxs = toIgnore.filter(t => t.source === "file");
    if (fileTxs.length > 0) {
      const bySubmission: Record<string, number[]> = {};
      fileTxs.forEach(t => { if (!bySubmission[t._submissionId]) bySubmission[t._submissionId] = []; bySubmission[t._submissionId].push(t._txIndex); });
      for (const [subId, indices] of Object.entries(bySubmission)) {
        const sub = portfolioSubs.find((s: any) => String(s.id) === String(subId));
        if (!sub) continue;
        const idxSet = new Set(indices);
        const newTxs = (sub.transactions || []).map((tx: any, i: number) => idxSet.has(i) ? { ...tx, cat: "להתעלם", edited: true } : tx);
        supabase.from("portfolio_submissions").update({ transactions: newTxs }).eq("id", sub.id);
      }
    }
    const extTxs = toIgnore.filter(t => t.source === "ext");
    extTxs.forEach(tx => { if (tx._dbId) supabase.from("imported_transactions").update({ cat: "להתעלם" }).eq("id", tx._dbId); });
  };
  const deleteSelected = async () => {
    const count = selectedUids.size;
    if (!window.confirm(`למחוק ${count} ${count === 1 ? "תנועה" : "תנועות"} שבחרת?\nפעולה זו אינה ניתנת לביטול.`)) return;
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
    let startMonth: number, startYear: number, endMonth: number, endDay: number;
    if (!startDay || startDay === 1) {
      // חודש קלנדרי רגיל: 1.MM – אחרון.MM
      startMonth = m; startYear = y;
      endMonth = m;
      endDay = new Date(y, m, 0).getDate();
    } else {
      // מחזור: startDay של חודש קודם עד startDay-1 של חודש ה-key
      // לדוגמה: key="2025-04", startDay=16 → 16.03 – 15.04
      startMonth = m - 1; startYear = y;
      if (startMonth === 0) { startMonth = 12; startYear = y - 1; }
      endMonth = m;
      endDay = startDay - 1;
    }
    return `${HEBREW_MONTHS_LOCAL[m-1]} (${String(startDay).padStart(2,"0")}.${String(startMonth).padStart(2,"0")} – ${String(endDay).padStart(2,"0")}.${String(endMonth).padStart(2,"0")})`;
  }

  // ── קיבוץ לפי חודש חיוב ─────────────────────────────────────────────────────
  const filteredTxs = allTxs.filter(t => {
    if (t.flow_type === 'credit_transfer') return false;
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
  const totalAmount = filteredTxs.filter(t => !ignoredCats.has(t.cat) && t.flow_type !== 'credit_transfer').reduce((s,t) => s + (incomeCats.has(t.cat)?-Number(t.amount||0):Number(t.amount||0)), 0);

  // ── ייצוא Excel ──────────────────────────────────────────────────────────────
  const exportToExcel = () => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
    const wb = XLSX.utils.book_new();
    const detailRows = [];
    cycleKeys.forEach(key => {
      const label = getCycleLabel(key, cycleStartDay);
      const cycleTxs = byCycle[key] || [];
      const cycleTotal = cycleTxs.filter(t => !ignoredCats.has(t.cat)).reduce((s,t) => s + (incomeCats.has(t.cat)?-Number(t.amount||0):Number(t.amount||0)), 0);
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
      const sum = (byCycle[k]||[]).filter(t => !ignoredCats.has(t.cat)).reduce((s,t) => s + (incomeCats.has(t.cat)?-Number(t.amount||0):Number(t.amount||0)), 0);
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
          <span style={{ fontSize: 22 }}>🔴</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--red)", fontSize: 16 }}>
              {pendingClassification.length} תנועות מזומן ממתינות לסיווג
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>
              נרשמו דרך וואטסאפ ולא סווגו אוטומטית — יש לסווג אותן לפני סגירת החודש
            </div>
          </div>
          <button
            onClick={() => {
              setFilterSource("manual");
              setTimeout(() => filterBarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
            }}
            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--red)", background: "transparent", color: "var(--red)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
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
            <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><DocIcon name="trash" color="var(--red)" size={30} /></div>
            <div style={{ fontWeight:700, fontSize: 18, marginBottom:8 }}>
              {confirmDelete.type === "all-imported" ? "מחק את כל תנועות המקס?" :
               confirmDelete.type === "cycle" ? `מחק תנועות מקס מ-${confirmDelete.label}?` :
               confirmDelete.type === "submission" ? `מחק קובץ "${confirmDelete.label}"?` :
               `מחק את "${confirmDelete.label}"?`}
            </div>
            <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:20 }}>
              {confirmDelete.type === "all-imported" ? `${confirmDelete.count} תנועות יימחקו לצמיתות — ניתן לסנכרן מחדש` :
               confirmDelete.type === "cycle" ? `${confirmDelete.count} תנועות יימחקו לצמיתות` :
               confirmDelete.type === "submission" ? `${confirmDelete.count} תנועות יימחקו לצמיתות` :
               "התנועה תימחק לצמיתות"}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--text-mid)", fontSize: 16, cursor:"pointer", fontFamily:"inherit" }}>
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
                style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#e53935", color:"#fff", fontSize: 16, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {(deletingTxUid || deletingCycleKey) ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Frank Ruhl Libre', serif", fontSize: 28, fontWeight:700, color:"var(--green-deep)", lineHeight:1.1 }}>
            כל התנועות
          </div>
          <div style={{ fontSize: 15, color:"var(--text-dim)", marginTop:5 }}>
            {filteredTxs.length}{filteredTxs.length !== allTxs.length ? ` מתוך ${allTxs.length}` : ""} תנועות · <span style={{direction:"ltr", unicodeBidi:"embed", color: totalAmount <= 0 ? "var(--green-mid)" : "inherit"}}>{totalAmount <= 0 ? `+₪${Math.abs(Math.round(totalAmount)).toLocaleString()}` : `₪−${Math.round(totalAmount).toLocaleString()}`}</span> סה"כ
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={onNavigateToUpload}
            style={{ padding:"7px 14px", borderRadius:8, fontSize: 15, cursor:"pointer", fontFamily:"inherit",
              border:"1.5px solid var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", display:"flex", alignItems:"center", gap:5 }}>
            ⬆️ הוסף תנועות
          </button>
          <button onClick={exportToExcel}
            style={{ padding:"7px 14px", borderRadius:8, fontSize: 15, cursor:"pointer", fontFamily:"inherit",
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
          style={{ width:"100%", padding:"8px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize: 16, fontFamily:"inherit", boxSizing:"border-box" }}
        />
      </div>

      {/* Source filter */}
      <div ref={filterBarRef} style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize: 15, color:"var(--text-dim)" }}>מקור:</span>
        {[["all","הכל"], ["file","קבצים"], ["ext","מקס"], ["manual","ידני"]].map(([v,l]) => (
          <button key={v} onClick={() => { setFilterSource(v); setFilterProvider("all"); }}
            style={{ padding:"4px 12px", borderRadius:20, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
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
            <span style={{ fontSize: 15, color:"var(--text-dim)" }}>קטגוריה:</span>
            <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
              style={{ padding:"4px 10px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize: 14, fontFamily:"inherit" }}>
              <option value="all">הכל</option>
              {allCatOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(filterCat !== "all" || filterSource !== "all" || searchText.trim()) && (
              <button onClick={() => { setFilterCat("all"); setFilterSource("all"); setFilterProvider("all"); setSearchText(""); }}
                style={{ padding:"3px 10px", borderRadius:8, fontSize: 13, cursor:"pointer", fontFamily:"inherit", border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)" }}>
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
              style={{ padding:"4px 12px", borderRadius:20, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
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
          const { name, cat } = pendingRemember;
          const oldCat = rememberedMappings[name] || null;
          // עדכן כל ext txs עם אותו שם ב-DB + localEdits
          await supabase.from("imported_transactions").update({ cat }).eq("client_id", clientId).eq("name", name);
          setLocalEdits(prev => {
            const next = new Map(prev);
            allTxs.filter(t => t.source === "ext" && t.name === name).forEach(t => next.set(t._uid, cat));
            return next;
          });
          await supabase.from("remembered_mappings").upsert(
            [{ client_id: clientId, business_name: name, category: cat }],
            { onConflict: "client_id,business_name" }
          );
          await supabase.from("client_change_log").insert([{ client_id: clientId, event_type: "remap_business", details: { business_name: name, from_cat: oldCat, to_cat: cat } }]);
          setPendingRemember(null);
          onDataChange();
        }}
        onThisSession={async () => {
          const { name, cat } = pendingRemember;
          await supabase.from("imported_transactions").update({ cat }).eq("client_id", clientId).eq("name", name);
          setLocalEdits(prev => {
            const next = new Map(prev);
            allTxs.filter(t => t.source === "ext" && t.name === name).forEach(t => next.set(t._uid, cat));
            return next;
          });
          setPendingRemember(null);
          onDataChange();
        }}
        onJustHere={async () => {
          const { singleUid, cat } = pendingRemember;
          const tx = allTxs.find(t => t._uid === singleUid);
          if (tx?._dbId) await supabase.from("imported_transactions").update({ cat }).eq("id", tx._dbId);
          setPendingRemember(null);
          onDataChange();
        }}
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
        const cycleTotal = activeTxs.filter(t => t.flow_type !== 'credit_transfer').reduce((s,t) => s + (incomeCats.has(t.cat)?-Number(t.amount||0):Number(t.amount||0)), 0);
        const catMap: Record<string, number> = {};
        activeTxs.forEach(t => { catMap[t.cat] = (catMap[t.cat]||0) + (incomeCats.has(t.cat)?-Number(t.amount||0):Number(t.amount||0)); });
        const top3 = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,3);
        const label = getCycleLabel(key, cycleStartDay);
        const isOpen = openMonthKeys.has(key);

        // unique submissions in this month
        const submissionIds = [...new Set(cycleTxs.filter(t => t.source === "file").map(t => t._submissionId))];
        const hasExtTxs = cycleTxs.some(t => t.source === "ext");

        const renderTxRow = (tx, isIgnored) => {
          const needsClassification = tx.source === "manual" && tx.conf && tx.conf !== "high";
          return (
          <Card key={tx._uid} style={{ marginBottom:6, padding:"14px 18px",
            background: needsClassification ? "rgba(247,92,92,0.04)" : isIgnored ? "rgba(180,180,180,0.06)" : "var(--surface)",
            borderRight: needsClassification ? "3px solid var(--red)" : isIgnored ? "3px solid var(--text-dim)" : "none",
            boxShadow: "0 1px 3px rgba(30,77,53,0.05)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize: 17, lineHeight:1.3,
                  textDecoration: isIgnored ? "line-through" : "none",
                  color: isIgnored ? "var(--text-dim)" : "var(--text)" }}>{tx.name}</div>
                <div style={{ fontSize: 15, color:"var(--text-dim)", display:"flex", gap:6, alignItems:"center", marginTop:3 }}>
                  <span>{tx.date}</span>
                  <span style={{ padding:"1px 6px", borderRadius:10, fontSize: 13,
                    background: tx.source === "ext" ? "rgba(79,142,247,0.12)" : tx.source === "manual" ? "rgba(251,191,36,0.12)" : "rgba(46,204,138,0.12)",
                    color: tx.source === "ext" ? "var(--green-mid)" : tx.source === "manual" ? "var(--gold)" : "var(--green-deep)" }}>
                    {tx.source_label}
                  </span>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontFamily:"'Frank Ruhl Libre', serif", fontWeight:700, color: (tx.type === "income" || incomeCats.has(tx.cat)) ? "var(--green-mid)" : "var(--red)", fontSize: 19, letterSpacing:"-0.3px" }}>
                  {(tx.type === "income" || incomeCats.has(tx.cat)) ? "+" : ""}₪{Number(tx.amount).toLocaleString()}
                </span>
                <button
                  onClick={() => { setActiveTxUid(tx._uid === activeTxUid ? null : tx._uid); setCatSearch(""); setPendingRemember(null); }}
                  style={{ background:"var(--green-pale)", border:"1px solid var(--green-mint)", borderRadius:20, padding:"4px 14px",
                    fontSize: 14, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600, whiteSpace:"nowrap" }}>
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
                  style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935", fontSize: 14, cursor:"pointer", fontFamily:"inherit" }}>
                  <DocIcon name="trash" color="#e53935" size={14} />
                </button>
              </div>
            </div>
            {activeTxUid === tx._uid && (
              <CategoryPicker current={tx.cat} catSearch={catSearch} setCatSearch={setCatSearch}
                categories={categories} rows={categoryRows} clientCats={clientCats} clientId={clientId} onCategoryAdded={onCategoryAdded}
                hiddenCats={hiddenCats} onHiddenCatsChange={onHiddenCatsChange} scenarioCats={scenarioCats}
                onSelect={async (cat) => {
                  if (tx.source === "ext") {
                    // קודם שנה רק את התנועה הבודדת ב-localEdits
                    setLocalEdits(prev => { const next = new Map(prev); next.set(tx._uid, cat); return next; });
                    // שאל את המשתמש מה לעשות — ה-modal יטפל בהמשך
                    setPendingRemember({ name: tx.name, cat, singleUid: tx._uid });
                  } else if (tx.source === "manual") {
                    const oldCat = tx.cat;
                    await supabase.from("manual_transactions").update({ cat, conf: "high" }).eq("id", tx._dbId);
                    await supabase.from("client_change_log").insert([{ client_id: clientId, event_type: "remap_business", details: { business_name: tx.name, from_cat: oldCat, to_cat: cat } }]);
                    setLocalEdits(prev => { const next = new Map(prev); next.set(tx._uid, cat); return next; });
                    onDataChange();
                  } else {
                    setLocalEdits(prev => { const next = new Map(prev); next.set(tx._uid, cat); return next; });
                    await onUpdatePortfolioTxCat(tx._submissionId, tx._txIndex, cat);
                    onDataChange();
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
                background: "linear-gradient(135deg, var(--green-pale) 0%, #e4f5e9 100%)",
                border:"1.5px solid var(--green-mint)",
                borderRadius: isOpen ? "12px 12px 0 0" : 12,
                padding:"16px 20px", cursor:"pointer",
                boxShadow: isOpen ? "none" : "0 2px 12px rgba(45,106,79,0.08)",
                transition:"box-shadow 0.2s" }}>
              <div>
                <div style={{ fontFamily:"'Frank Ruhl Libre', serif", fontWeight:700, fontSize: 22, color:"var(--green-deep)", lineHeight:1.2 }}>{label}</div>
                {!isOpen && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                    {top3.map(([cat,amt]) => (
                      <span key={cat} style={{ background:"rgba(45,106,79,0.08)", border:"1px solid rgba(45,106,79,0.15)", borderRadius:20, padding:"2px 10px", fontSize: 14, color:"var(--green-deep)" }}>
                        {cat}: ₪{Math.round(amt).toLocaleString()}
                      </span>
                    ))}
                    {ignoredTxs.length > 0 && (
                      <span style={{ fontSize: 15, color:"var(--text-dim)", fontWeight:600 }}>🚫 {ignoredTxs.length} מוסתרות</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                <span style={{ fontSize: 15, color:"var(--text-dim)" }}>{activeTxs.length} תנועות</span>
                <span style={{ fontFamily:"'Frank Ruhl Libre', serif", fontSize: 28, fontWeight:700, color: cycleTotal <= 0 ? "var(--green-mid)" : "var(--red)", letterSpacing:"-0.5px", direction:"ltr", unicodeBidi:"embed" }}>
                  {cycleTotal <= 0 ? "+" : "₪−"}{cycleTotal <= 0 ? `₪${Math.abs(Math.round(cycleTotal)).toLocaleString()}` : `${Math.round(cycleTotal).toLocaleString()}`}
                </span>
                {(() => {
                  if (cycleTxs.length === 0) return null;
                  const allSel = cycleTxs.every(t => selectedUids.has(t._uid));
                  const monthSelectedCount = cycleTxs.filter(t => selectedUids.has(t._uid)).length;
                  return (
                    <div style={{ display:"flex", gap:6, alignItems:"center" }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => toggleSelectMonth(cycleTxs)}
                        style={{ padding:"4px 12px", fontSize: 14, borderRadius:7, fontFamily:"inherit", cursor:"pointer",
                          border:"1px solid var(--border)", background: allSel ? "rgba(229,57,53,0.08)" : "transparent",
                          color: allSel ? "#e53935" : "var(--text-dim)" }}>
                        {allSel ? "בטל בחירה" : "בחר הכל"}
                      </button>
                      {monthSelectedCount > 0 ? (
                        <>
                          <button onClick={ignoreSelected}
                            style={{ padding:"6px 16px", fontSize: 15, borderRadius:8, fontFamily:"inherit", cursor:"pointer",
                              border:"1.5px solid var(--border)", background:"var(--surface)", color:"var(--text-mid)", fontWeight:700,
                              display:"flex", alignItems:"center", gap:5 }}>
                            ⊘ התעלם ({monthSelectedCount})
                          </button>
                          <button onClick={deleteSelected}
                            style={{ padding:"6px 16px", fontSize: 15, borderRadius:8, fontFamily:"inherit", cursor:"pointer",
                              border:"1.5px solid #e53935", background:"#e53935", color:"#fff", fontWeight:700,
                              display:"flex", alignItems:"center", gap:5 }}>
                            מחק ({monthSelectedCount})
                          </button>
                          <button onClick={() => setSelectedUids(new Set())}
                            style={{ background:"transparent", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize: 20, padding:"0 4px", lineHeight:1 }}>×</button>
                        </>
                      ) : (
                        <button onClick={() => deleteMonth(cycleTxs)}
                          title="מחק את כל תנועות החודש"
                          style={{ padding:"4px 12px", fontSize: 14, borderRadius:7, fontFamily:"inherit", cursor:"pointer",
                            border:"1px solid rgba(229,57,53,0.4)", background:"rgba(229,57,53,0.06)", color:"#e53935" }}>
                          מחק חודש
                        </button>
                      )}
                    </div>
                  );
                })()}
                <span style={{ color:"var(--text-dim)", fontSize: 18 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ border:"1.5px solid var(--green-mint)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:"14px 14px 10px", background:"var(--surface)" }}>
                {/* Sort controls */}
                <div style={{ display:"flex", gap:6, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
                  <span style={{ fontSize: 13, color:"var(--text-dim)" }}>מיון:</span>
                  {([["date","תאריך"], ["amount","סכום"], ["cat","קטגוריה"]] as const).map(([field, label]) => {
                    const active = sortConfig.field === field;
                    return (
                      <button key={field} onClick={() => setSortConfig(prev => ({ field, dir: prev.field === field && prev.dir === "asc" ? "desc" : "asc" }))}
                        style={{ padding:"2px 10px", borderRadius:14, fontSize: 13, cursor:"pointer", fontFamily:"inherit",
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
                  return groups.map(g => {
                    const groupColor = g.source === "ext" ? "var(--green-mid)" : g.source === "manual" ? "var(--gold)" : "var(--green-deep)";
                    const groupBg = g.source === "ext" ? "rgba(79,142,247,0.07)" : g.source === "manual" ? "rgba(251,191,36,0.07)" : "rgba(46,204,138,0.07)";
                    const groupTotal = Math.round(g.txs.filter(t => t.flow_type !== 'credit_transfer').reduce((s,t) => s + (incomeCats.has(t.cat)?-1:1)*Number(t.amount||0), 0));
                    const groupUids = g.txs.map(t => t._uid);
                    const allGroupSel = groupUids.every(uid => selectedUids.has(uid));
                    const deleteGroup = async () => {
                      if (!window.confirm(`למחוק את כל ${g.txs.length} התנועות של המקור "${g.label}"?`)) return;
                      const toDelete = g.txs;
                      const extIds = toDelete.filter(t => t.source === "ext").map(t => t._dbId).filter(Boolean);
                      const manIds = toDelete.filter(t => t.source === "manual").map(t => t._dbId).filter(Boolean);
                      if (extIds.length > 0) await supabase.from("imported_transactions").delete().in("id", extIds).eq("client_id", clientId);
                      if (manIds.length > 0) { await supabase.from("manual_transactions").delete().in("id", manIds).eq("client_id", clientId); manIds.forEach(id => onManualTxDeleted && onManualTxDeleted(id)); }
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
                      setDeletedUids(prev => { const next = new Set(prev); groupUids.forEach(uid => next.add(uid)); return next; });
                      setSelectedUids(prev => { const next = new Set(prev); groupUids.forEach(uid => next.delete(uid)); return next; });
                      onDataChange();
                    };
                    return (
                    <div key={g.label}>
                      <div style={{ display:"flex", alignItems:"center", gap:10, margin:"14px 0 8px", padding:"12px 16px", borderRadius:10,
                        background: groupBg, border:`1.5px solid ${groupColor}33`, boxShadow:"0 1px 4px rgba(30,77,53,0.06)" }}>
                        <span style={{ fontSize: 17, fontWeight:700, color: groupColor }}>
                          {g.label}
                        </span>
                        <span style={{ fontSize: 15, color:"var(--text-dim)", fontWeight:500 }}>{g.txs.length} תנועות</span>
                        <span style={{ fontFamily:"'Frank Ruhl Libre', serif", fontSize: 20, fontWeight:700, marginRight:"auto", color: groupTotal <= 0 ? "var(--green-mid)" : "var(--red)", letterSpacing:"-0.3px", direction:"ltr", unicodeBidi:"embed" }}>
                          {groupTotal <= 0 ? "+" : "₪−"}{groupTotal <= 0 ? `₪${Math.abs(groupTotal).toLocaleString()}` : `${groupTotal.toLocaleString()}`}
                        </span>
                        <button onClick={() => setSelectedUids(prev => {
                          const next = new Set(prev);
                          if (allGroupSel) groupUids.forEach(uid => next.delete(uid));
                          else groupUids.forEach(uid => next.add(uid));
                          return next;
                        })} style={{ padding:"4px 12px", fontSize: 14, borderRadius:7, fontFamily:"inherit", cursor:"pointer",
                          border:"1px solid var(--border)", background: allGroupSel ? "rgba(229,57,53,0.08)" : "transparent",
                          color: allGroupSel ? "#e53935" : "var(--text-dim)" }}>
                          {allGroupSel ? "בטל בחירה" : "בחר הכל"}
                        </button>
                        <button onClick={deleteGroup}
                          style={{ padding:"4px 12px", fontSize: 14, borderRadius:7, fontFamily:"inherit", cursor:"pointer",
                            border:"1px solid rgba(229,57,53,0.4)", background:"rgba(229,57,53,0.06)", color:"#e53935", fontWeight:600 }}>
                          מחק מקור
                        </button>
                      </div>
                      {g.txs.map(tx => renderTxRow(tx, false))}
                    </div>
                    );
                  });
                })()}
                {/* Hidden transactions */}
                {ignoredTxs.length > 0 && (
                  <>
                    <div style={{ marginTop:12, marginBottom:6, display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"var(--surface2)", borderRadius:8 }}>
                      <span style={{ fontSize: 16, color:"var(--text-dim)", fontWeight:600 }} title={`קטגוריות מוסתרות: ${[...ignoredCats].join(", ")}`}>
                        🚫 {ignoredTxs.length} תנועות מוסתרות (קטגוריות מסוננות)
                      </span>
                      <button onClick={() => setIgnoredOpen(p => ({ ...p, [key]: !p[key] }))}
                        style={{ padding:"4px 14px", borderRadius:10, fontSize: 15, cursor:"pointer", fontFamily:"inherit",
                          border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)", fontWeight:600 }}>
                        {ignoredOpen[key] ? "הסתר ▲" : "הצג ▼"}
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
                  const inputS = { border:"1px solid var(--border)", borderRadius:6, padding:"6px 10px", fontSize: 15, fontFamily:"inherit", background:"var(--surface2)", color:"var(--text)", width:"100%" };
                  const rowS: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end", marginBottom:8 };

                  if (!mode) return (
                    <div style={{ marginTop:10, marginBottom:4 }}>
                      <button onClick={() => setMonthAddMode(key, "menu")}
                        style={{ padding:"5px 14px", fontSize: 14, fontFamily:"inherit", borderRadius:8, border:"1.5px dashed var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", cursor:"pointer" }}>
                        + הוסף תנועה
                      </button>
                    </div>
                  );

                  if (mode === "menu") return (
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize: 15, color:"var(--text-dim)" }}>סוג תנועה:</span>
                      <button onClick={() => setMonthAddMode(key, "income")}
                        style={{ padding:"5px 14px", fontSize: 14, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--green-soft)", background:"var(--green-mint)", color:"var(--green-deep)", cursor:"pointer", fontWeight:600 }}>
                        + הוסף הכנסה
                      </button>
                      <button onClick={() => setMonthAddMode(key, "expense-choice")}
                        style={{ padding:"5px 14px", fontSize: 14, fontFamily:"inherit", borderRadius:8, border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935", cursor:"pointer", fontWeight:600 }}>
                        − הוסף הוצאה
                      </button>
                      <button onClick={() => resetAdd(key)}
                        style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize: 20, lineHeight:1 }}>×</button>
                    </div>
                  );

                  if (mode === "income") return (
                    <div style={{ marginTop:10, background:"rgba(46,204,138,0.05)", border:"1px solid rgba(46,204,138,0.2)", borderRadius:10, padding:"14px 14px 10px" }}>
                      <div style={{ fontWeight:700, fontSize: 15, marginBottom:10, color:"var(--green-deep)" }}>+ הכנסה מזדמנת</div>
                      <div style={rowS}>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>פירוט *</div>
                          <input style={inputS} value={form.name||""} onChange={e=>updateForm(key,"name",e.target.value)} placeholder="תיאור ההכנסה" />
                        </div>
                        <div style={{ flex:1, minWidth:90 }}>
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>סכום (₪) *</div>
                          <input type="number" style={inputS} value={form.amount||""} onChange={e=>updateForm(key,"amount",e.target.value)} placeholder="0" />
                        </div>
                        <div style={{ flex:1, minWidth:110 }}>
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>תאריך (אופציונלי)</div>
                          <input type="date" style={inputS} value={form.date||""} onChange={e=>updateForm(key,"date",e.target.value)} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveManualTx(key, "income")}
                          disabled={!form.name || !form.amount}
                          style={{ padding:"6px 18px", borderRadius:8, border:"none", background:"var(--green-mid)", color:"#fff", fontSize: 15, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:(!form.name||!form.amount)?0.5:1 }}>
                          שמור
                        </button>
                        <button onClick={() => resetAdd(key)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize: 15, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                      </div>
                    </div>
                  );

                  if (mode === "expense-choice") return (
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize: 15, color:"var(--text-dim)" }}>צורת תשלום:</span>
                      <button onClick={() => { setMonthAddMode(key, "expense-cash"); updateForm(key, "payment_method", "מזומן"); }}
                        style={{ padding:"5px 14px", fontSize: 14, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", cursor:"pointer" }}>
                        מזומן
                      </button>
                      <button onClick={() => setMonthAddMode(key, "expense-other")}
                        style={{ padding:"5px 14px", fontSize: 14, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", cursor:"pointer" }}>
                        אחר
                      </button>
                      <button onClick={() => resetAdd(key)} style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize: 20, lineHeight:1 }}>×</button>
                    </div>
                  );

                  if (mode === "expense-cash" || mode === "expense-other") return (
                    <div style={{ marginTop:10, background:"rgba(247,92,92,0.04)", border:"1px solid rgba(247,92,92,0.18)", borderRadius:10, padding:"14px 14px 10px" }}>
                      <div style={{ fontWeight:700, fontSize: 15, marginBottom:10, color:"#e53935" }}>
                        − הוצאה {mode === "expense-cash" ? "במזומן" : ""}
                      </div>
                      {mode === "expense-other" && (
                        <div style={{ ...rowS, marginBottom:8 }}>
                          <div style={{ flex:1, minWidth:140 }}>
                            <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>צורת תשלום</div>
                            <input style={inputS} value={form.payment_method||""} onChange={e=>updateForm(key,"payment_method",e.target.value)} placeholder="למשל: העברה בנקאית, צ׳ק..." />
                          </div>
                        </div>
                      )}
                      <div style={rowS}>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>פירוט *</div>
                          <input style={inputS} value={form.name||""} onChange={e=>updateForm(key,"name",e.target.value)} placeholder="תיאור ההוצאה" />
                        </div>
                        <div style={{ flex:1, minWidth:90 }}>
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>סכום (₪) *</div>
                          <input type="number" style={inputS} value={form.amount||""} onChange={e=>updateForm(key,"amount",e.target.value)} placeholder="0" />
                        </div>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>סיווג *</div>
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
                          <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:3 }}>תאריך (אופציונלי)</div>
                          <input type="date" style={inputS} value={form.date||""} onChange={e=>updateForm(key,"date",e.target.value)} />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveManualTx(key, "expense")}
                          disabled={!form.name || !form.amount || !form.cat}
                          style={{ padding:"6px 18px", borderRadius:8, border:"none", background:"#e53935", color:"#fff", fontSize: 15, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:(!form.name||!form.amount||!form.cat)?0.5:1 }}>
                          שמור
                        </button>
                        <button onClick={() => resetAdd(key)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize: 15, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                      </div>
                    </div>
                  );

                  return null;
                })()}

                {/* Per-source management */}
                <div style={{ marginTop:12, padding:"10px 4px", borderTop:"1px solid var(--border)", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{ fontSize: 15, color:"var(--text-dim)" }}>ניהול מקורות:</span>
                  {submissionIds.map(subId => {
                    const subLabel = allTxs.find(t => t._submissionId === subId)?.source_label || "קובץ";
                    const subCount = allTxs.filter(t => t._submissionId === subId).length;
                    return (
                      <span key={subId as string} style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
                        <button onClick={onNavigateToUpload}
                          title="החלף קובץ — העלה קובץ חדש לחודש זה"
                          style={{ padding:"4px 10px", borderRadius:8, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
                            border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text-mid)" }}>
                          {subLabel} — החלף
                        </button>
                        <button onClick={() => setConfirmDelete({ type:"submission", submissionId:subId, label:subLabel, count:subCount })}
                          style={{ padding:"4px 8px", borderRadius:8, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
                            border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935" }}>
                          הסר
                        </button>
                      </span>
                    );
                  })}
                  {hasExtTxs && (
                    <button onClick={() => setConfirmDelete({ type:"cycle", cycleKey:key, label, count:cycleTxs.filter(t=>t.source==="ext").length })}
                      style={{ padding:"4px 10px", borderRadius:8, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
                        border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935" }}>
                      מחק תנועות מקס מחודש זה
                    </button>
                  )}
                  <button onClick={onNavigateToUpload}
                    style={{ padding:"4px 10px", borderRadius:8, fontSize: 14, cursor:"pointer", fontFamily:"inherit",
                      border:"1px solid var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)" }}>
                    ➕ הוסף מקור לחודש זה
                  </button>
                </div>

                <div style={{ textAlign:"left", padding:"6px 4px", fontSize: 15, color:"var(--text-mid)", fontWeight:700 }}>
                  סה"כ {label}: ₪{Math.round(cycleTotal).toLocaleString()}
                </div>
              </div>
            )}

            {!isOpen && idx < cycleKeys.length - 1 && (
              <div style={{ textAlign:"center", padding:"4px 0 10px", fontSize: 15, color:"var(--text-dim)", borderBottom:"1px dashed var(--border)", marginBottom:8 }}>
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
function PayslipsScreen({ clientId, payslips, spouseIndex, spouseName, subsCount, clientName, onDone, onBack }) {
  const currentYear = new Date().getFullYear();
  const [showPicker, setShowPicker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // סינון תלושים לפי בן/בת הזוג הנוכחי
  // spouse_index === null = רשומות ישנות (לפני הפיצ'ר) — נחשבות כספאוס 1
  const myPayslips = spouseIndex === 2
    ? payslips.filter(p => p.spouse_index === 2)
    : payslips.filter(p => !p.spouse_index || p.spouse_index === 1);
  const usedKeys = myPayslips.map(p => p.month_key).filter(Boolean);
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
    if (storageErr) { setMsg("❌ שגיאה בהעלאת הקובץ — נסה שנית"); setUploading(false); return; }
    savedPath = storagePath;
    const { error } = await supabase.from("payslips").insert([{ client_id: clientId, label, month_key: monthKey, filename: pendingFile.name, path: savedPath, spouse_index: spouseIndex || null, created_at: new Date().toISOString() }]);
    if (error) { setMsg("❌ שגיאה בשמירה"); setUploading(false); return; }
    setPendingFile(null); setShowPicker(false); setMsg("✅ תלוש נשמר!");
    setTimeout(() => setMsg(""), 2000);
    onDone();
    setUploading(false);
  };

  const screenTitle = spouseName ? `💼 תלושי משכורת — ${spouseName}` : "💼 תלושי משכורת";
  const remaining = 3 - myPayslips.length;

  return (
    <div style={{ maxWidth:700, margin:"0 auto", padding:"28px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← חזור</Btn>
        <div style={{ fontWeight:700, fontSize: 20 }}>{screenTitle}</div>
      </div>
      <Card style={{ marginBottom:20, textAlign:"center", padding:"32px 24px" }}>
        <div style={{ fontSize:36, marginBottom:12 }}>📄</div>
        <div style={{ fontWeight:700, fontSize: 18, marginBottom:8 }}>העלה תלוש משכורת</div>
        <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:20 }}>צריך {remaining} תלוש{remaining !== 1 ? "ים" : ""} נוספים</div>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={handleFile} />
        <Btn onClick={() => fileRef.current?.click()} disabled={myPayslips.length >= 3}>📎 בחר קובץ</Btn>
      </Card>
      {msg && <div style={{ background:msg.startsWith("✅")?"rgba(46,204,138,0.1)":"rgba(247,92,92,0.1)", border:`1px solid ${msg.startsWith("✅")?"rgba(46,204,138,0.3)":"rgba(247,92,92,0.3)"}`, borderRadius:10, padding:"10px 16px", marginBottom:16, fontSize: 15, color:msg.startsWith("✅")?"var(--green-soft)":"var(--red)" }}>{msg}</div>}
      {myPayslips.length > 0 && (
        <div>
          <div style={{ fontWeight:700, marginBottom:12 }}>תלושים שהועלו</div>
          {myPayslips.map(p => (
            <Card key={p.id} style={{ marginBottom:10, padding:"14px 20px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontWeight:600 }}>📄 {p.label}</div><div style={{ fontSize: 13, color:"var(--text-dim)" }}>{p.filename} · {new Date(p.created_at).toLocaleDateString("he-IL")}</div></div>
              <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"3px 12px", fontSize: 14, fontWeight:700, display:"inline-flex", alignItems:"center" }}><DocIcon name="check-circle" color="var(--green-soft)" size={14} /></span>
            </Card>
          ))}
        </div>
      )}
      {showPicker && (
        <>
          <div onClick={() => setShowPicker(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9998 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:"28px 32px", zIndex:9999, minWidth:320, textAlign:"center" }}>
            <div style={{ fontWeight:700, fontSize: 18, marginBottom:6 }}>לאיזה חודש התלוש?</div>
            <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:20 }}>{pendingFile?.name}</div>
            <div style={{ display:"flex", gap:10, marginBottom:20, justifyContent:"center" }}>
              <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"8px 12px", color:"var(--text)", fontSize: 15, fontFamily:"inherit", cursor:"pointer" }}>
                {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"8px 12px", color:"var(--text)", fontSize: 15, fontFamily:"inherit", cursor:"pointer" }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {alreadyUploaded && <div style={{ color:"var(--gold)", fontSize: 14, marginBottom:12 }}>⚠️ כבר העלית תלוש לחודש זה</div>}
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
        <div style={{ fontWeight:700, fontSize: 18, marginBottom:16 }}>👤 הפרטים שלי</div>
        <Input label="שם מלא" value={editName} onChange={e => setEditName(e.target.value)} />
        <Input label="מייל" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@gmail.com" />
        <Input label="טלפון" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="050-0000000" />
        <div style={{ background:"var(--surface2)", borderRadius:8, padding:"10px 12px", fontSize: 15, color:"var(--text-dim)", marginBottom:14 }}>
          <div style={{ marginBottom:4 }}>שם משתמש לכניסה</div>
          <div style={{ color:"var(--text)", fontWeight:600 }}>@{session.username}</div>
        </div>
        {msg && <div style={{ fontSize: 14, color:msg.startsWith("✅")?"var(--green-soft)":"var(--red)", marginBottom:12 }}>{msg}</div>}
        <Btn onClick={saveDetails} disabled={loading}>שמור שינויים</Btn>
      </Card>
      <Card>
        <div style={{ fontWeight:700, fontSize: 18, marginBottom:16 }}>🔐 שינוי סיסמה</div>
        <Input label="סיסמה חדשה" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="לפחות 4 תווים" />
        <Input label="אימות סיסמה" type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="הכנס שוב" />
        {msg && <div style={{ fontSize: 14, color:msg.startsWith("✅")?"var(--green-soft)":"var(--red)", marginBottom:12 }}>{msg}</div>}
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

const QUESTIONNAIRE_PLACEHOLDERS = [
  "לדוגמה: חוזקה — אני עקבי בביצוע; חולשה — קשה לי לסרב לבזבוזים ספונטניים...",
  "לדוגמה: ההוצאות עולות על ההכנסות בסוף החודש, קושי לחסוך לטווח ארוך...",
  "לדוגמה: הרגלי ילדות, הכנסה לא יציבה, חוסר מודעות לאן הכסף הולך...",
  "לדוגמה: לבנות בסיס כלכלי יציב שיאפשר לי לחיות ללא דאגות כסף...",
  "לדוגמה: מוכן לעקוב אחרי תקציב חודשי, לדחות סיפוקים, להפסיק לקנות בהגעלה...",
  "לדוגמה: קפה יומי, בגדים, ארוחות בחוץ, מנויים שלא משתמש בהם...",
  "לדוגמה: לסיים את התהליך עם תוכנית כתובה ומספר חיסכון קבוע כל חודש...",
  "לדוגמה: עם כרית ביטחון של 3 משכורות, ללא חובות צרכניים, עם השקעה קטנה...",
  "לדוגמה: פנסיה מסודרת, ילדים שלי לא ייקחו הלוואות, חופש כלכלי אמיתי...",
  "לדוגמה: אוכל בחוץ, קניות אונליין, בילויים — כל פעם שיש רגש שלילי...",
  "לדוגמה: גאה ב: לא לקחתי הלוואה נוספת למרות הלחץ. הייתי עושה אחרת: מתחיל לחסוך בגיל 25...",
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
      <div style={{ fontWeight:700, fontSize: 18, marginBottom:6, display:"flex", alignItems:"center", gap:8 }}><DocIcon name="pencil" color="var(--green-mid)" />שאלון אישי</div>
      <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:16 }}>
        ענה על השאלות הבאות — הן יעזרו לאלון להכיר אותך לעומק ולהתאים את התהליך עבורך אישית.
      </div>

      {visibleSpouses.length > 1 && (
        <div style={{ display:"inline-flex", background:"var(--surface2)", borderRadius:30, padding:4, gap:4, marginBottom:24 }}>
          {visibleSpouses.map(idx => (
            <button key={idx} onClick={() => setSpouseIndex(idx)} style={{
              padding:"8px 22px", borderRadius:24, border:"none", fontFamily:"inherit", fontSize: 15,
              background: spouseIndex === idx ? "var(--green-mid)" : "transparent",
              color: spouseIndex === idx ? "white" : "var(--text-dim)",
              fontWeight: spouseIndex === idx ? 700 : 400,
              cursor:"pointer", transition:"all .15s",
            }}>
              {idx === 1 ? "בן/בת זוג ראשון" : "בן/בת זוג שני"}
              {doneMap[idx] ? <span style={{ marginRight:6, display:"inline-flex", verticalAlign:"middle" }}><DocIcon name="check-circle" color={spouseIndex===idx?"#fff":"var(--green-soft)"} size={14} /></span> : countFilled(idx) > 0 && <span style={{ marginRight:6, fontSize: 13, opacity:.8 }}>({countFilled(idx)}/{QUESTIONNAIRE_QUESTIONS.length})</span>}
            </button>
          ))}
        </div>
      )}

      {doneMap[spouseIndex] ? (
        <div style={{ padding:"24px", background:"rgba(46,183,124,0.08)", borderRadius:12, border:"1px solid rgba(46,183,124,0.25)", textAlign:"center", marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:10 }}><DocIcon name="check-circle" color="var(--green-soft)" size={40} /></div>
          <div style={{ fontWeight:700, fontSize: 18, color:"var(--green-deep)", marginBottom:6 }}>השאלון הושלם!</div>
          <div style={{ fontSize: 15, color:"var(--text-mid)", marginBottom:20 }}>סימנת "סיימתי" עבור בן/בת הזוג הזה</div>
          <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
            {onNavigateBack && (
              <Btn onClick={onNavigateBack}>← חזור להגשת המסמכים</Btn>
            )}
            <Btn variant="ghost" onClick={() => setDoneMap(prev => ({ ...prev, [spouseIndex]: false }))} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="pencil" color="var(--text-mid)" />ערוך תשובות</Btn>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {QUESTIONNAIRE_QUESTIONS.map((q, i) => {
              const isEmpty = !(answers[spouseIndex]?.[i] && answers[spouseIndex][i].trim());
              return (
                <Card key={i} style={{ padding:"16px 18px", border: isEmpty ? "1px solid var(--border)" : "1px solid rgba(46,183,124,0.3)" }}>
                  <div style={{ fontWeight:600, fontSize: 15, marginBottom:10, lineHeight:1.5 }}>
                    <span style={{ color:"var(--green-mid)", marginLeft:6 }}>{i + 1}.</span>{q}
                    <span style={{ color:"var(--red)", marginRight:4 }}>*</span>
                  </div>
                  <textarea
                    value={answers[spouseIndex]?.[i] || ""}
                    onChange={e => { updateAnswer(i, e.target.value); setDoneError(""); }}
                    rows={3}
                    placeholder={QUESTIONNAIRE_PLACEHOLDERS[i]}
                    style={{ width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:`1px solid ${isEmpty?"var(--border)":"rgba(46,183,124,0.3)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontSize: 15, fontFamily:"inherit", resize:"vertical", outline:"none", lineHeight:1.6 }}
                  />
                </Card>
              );
            })}
          </div>

          <div style={{ marginTop:20, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <Btn onClick={save} disabled={saving} variant="ghost" style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="save" color="var(--text-mid)" />{saving ? "שומר..." : "שמור טיוטה"}</Btn>
            <Btn onClick={markDone} disabled={markingDone} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><DocIcon name="check-circle" color="#fff" />{markingDone ? "שומר..." : "סיימתי"}</Btn>
            {saved && <span style={{ fontSize: 14, color:"var(--green-deep)", background:"rgba(46,183,124,0.12)", border:"1px solid rgba(46,183,124,0.3)", borderRadius:8, padding:"5px 14px", fontWeight:600 }}>✓ הטיוטה נשמרה</span>}
          </div>
          {doneError && <div style={{ marginTop:10, fontSize: 15, color:"var(--red)", fontWeight:600, display:"flex", alignItems:"center", gap:6 }}><DocIcon name="alert" color="var(--red)" />{doneError}</div>}
        </>
      )}

      <div style={{ marginTop:28, padding:"12px 16px", background:"rgba(46,183,124,0.06)", borderRadius:10, border:"1px solid rgba(46,183,124,0.2)", fontSize: 15, color:"var(--text-dim)", lineHeight:1.7 }}>
        <span style={{ display:"inline-flex", alignItems:"center", gap:6, verticalAlign:"middle" }}><DocIcon name="lightbulb" color="var(--text-dim)" /></span> <em>"כשאתה יודע טוב יותר — אתה עושה טוב יותר."</em> — מאיה אנג'לו
      </div>
    </div>
  );
}
