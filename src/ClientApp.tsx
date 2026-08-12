import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { supabase } from "./supabase";
import {
  CATEGORIES,
  IGNORED_CATEGORIES,
  parseExcelData,
  parseBankPDF,
  classifyTx,
  HEBREW_MONTHS,
  assignBillingMonth,
} from "./data";
import ConnectCardScreen from "./ConnectCardScreen";
import { CategoryPicker } from "./components/CategoryPicker";
import ScenarioPlanTab from "./components/ScenarioPlanTab";
import { useCategories } from "./hooks/useCategories";
import { useCategoryOrder } from "./hooks/useCategoryOrder";
import { Card, Btn, Badge, Spinner, KpiCard, Input, CustomSelect } from "./ui";
import { C } from "./colors";
import DebtManager from "./components/DebtManager";
import GrowthTools from "./components/GrowthTools";
import InsightsPanel from "./components/InsightsPanel";
import ClientScenarioView, {
  periodsOverlap,
  periodForYear,
} from "./components/ClientScenarioView";
import AnalyticsTrends from "./components/AnalyticsTrends";
import AnalyticsForecast from "./components/AnalyticsForecast";
import BankTutorial from "./components/BankTutorial";
import MyCategoriesScreen from "./components/MyCategoriesScreen";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

const REQUIRED_MONTHS = 3;
const EMAILJS_SERVICE_ID = process.env.REACT_APP_EMAILJS_SERVICE_ID || "";
const EMAILJS_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY = process.env.REACT_APP_EMAILJS_PUBLIC_KEY || "";

async function sendCompletionEmail(clientName) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY)
    return;
  try {
    await window.emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email: "alon4040@gmail.com",
        client_name: clientName,
        message: `הלקוח ${clientName} סיים למלא את כל הנדרש במאזן החכם.`,
        date: new Date().toLocaleDateString("he-IL", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      },
      EMAILJS_PUBLIC_KEY,
    );
  } catch (e) {
    console.error("EmailJS:", e);
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClientApp({ session, onLogout }) {
  // ── קטגוריות דינמיות ────────────────────────────────────────────────────────
  const {
    sections: categories,
    rows: categoryRows,
    clientCats,
    ignoredCats,
    incomeCats,
    fixedCats,
    rules: categoryRules,
    reload: reloadCategories,
  } = useCategories(session.id);

  const [screen, setScreen] = useState("dashboard"); // dashboard | month | upload | review | summary
  const [showConnectCard, setShowConnectCard] = useState(false);
  const [maxSessionActive, setMaxSessionActive] = useState(false);
  const [maxLastSync, setMaxLastSync] = useState<string | null>(null);
  const [monthEntries, setMonthEntries] = useState([]); // month_entries rows
  const [submissions, setSubmissions] = useState([]); // submissions rows (אשראי)
  const [bankSubs, setBankSubs] = useState([]); // bank_submissions rows (עו"ש)
  const [activeBankAccount, setActiveBankAccount] = useState(1); // איזה חשבון מעלים כרגע
  const [payslips, setPayslips] = useState([]);
  const [rememberedMappings, setRememberedMappings] = useState({});
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [isScenarioPublished, setIsScenarioPublished] = useState(false);
  const [portfolioMonths, setPortfolioMonths] = useState([]);
  const [portfolioSubs, setPortfolioSubs] = useState([]);
  const [portfolioOpenedAt, setPortfolioOpenedAt] = useState(null);
  const [loadingData, setLoadingData] = useState(true);
  const TAB_KEY = `mazan_activeTab_${session.id}`;
  const PORT_KEY = `mazan_portfolioOpen_${session.id}`;
  const PORT_TAB_KEY = `mazan_portfolioTab_${session.id}`;
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem(TAB_KEY);
    if (saved && saved !== "questionnaire") return saved;
    const portfolioWasOpen = sessionStorage.getItem(PORT_KEY) === "1";
    return portfolioWasOpen ? "portfolio" : "data";
  });
  // visitedTabs — tracks which tabs have been mounted at least once (lazy mount)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => {
    const saved = sessionStorage.getItem(TAB_KEY);
    const initial =
      saved && saved !== "questionnaire"
        ? saved
        : sessionStorage.getItem(PORT_KEY) === "1"
          ? "portfolio"
          : "data";
    return new Set([initial]);
  });
  const switchTab = (id) => {
    sessionStorage.setItem(TAB_KEY, id);
    setActiveTab(id);
    setVisitedTabs((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const [dataSubTab, setDataSubTab] = useState(() =>
    sessionStorage.getItem(TAB_KEY) === "questionnaire"
      ? "questionnaire"
      : "documents",
  ); // documents | questionnaire
  const [portfolioSubTab, setPortfolioSubTab] = useState(
    () => sessionStorage.getItem(PORT_TAB_KEY) || "control",
  );
  const [visitedPortfolioSubTabs, setVisitedPortfolioSubTabs] = useState<
    Set<string>
  >(() => new Set([sessionStorage.getItem(PORT_TAB_KEY) || "control"]));
  const switchPortfolioSubTab = (id: string) => {
    sessionStorage.setItem(PORT_TAB_KEY, id);
    setPortfolioSubTab(id);
    setVisitedPortfolioSubTabs((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };
  const [showWelcome, setShowWelcome] = useState(false);
  const dismissWelcome = () => {
    setShowWelcome(false);
    sessionStorage.setItem("welcome_dismissed_" + session.id, "1");
  };
  useEffect(() => {
    if (!showWelcome) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissWelcome();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showWelcome]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [importedTxs, setImportedTxs] = useState([]);
  const [importedLoaded, setImportedLoaded] = useState(false);
  const [manualTxs, setManualTxs] = useState([]);
  const [bankTxs, setBankTxs] = useState([]);
  const [cycleStartDay, setCycleStartDay] = useState(1);
  const [clientPlan, setClientPlan] = useState("free");
  const [clientDocs, setClientDocs] = useState([]);
  const [submittedAt, setSubmittedAt] = useState(null);
  const [requiredDocs, setRequiredDocs] = useState(null);
  const [questionnaireSpouses, setQuestionnaireSpouses] = useState(null);
  const [docNotes, setDocNotes] = useState<Record<string, string>>({});
  const [customDocs, setCustomDocs] = useState<
    { id: string; label: string; icon?: string }[]
  >([]);
  const [bankLabelDrafts, setBankLabelDrafts] = useState<
    Record<number, string>
  >({});
  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  // קטגוריות מהתסריט הפעיל — null = אין תסריט פעיל (הצג הכל)
  const [scenarioCats, setScenarioCats] = useState<string[] | null>(null);
  // שמות בני הזוג לפי טופס פגישה ראשונה
  const [spouseNames, setSpouseNames] = useState<{
    s1: string | null;
    s2: string | null;
  }>({ s1: null, s2: null });
  // סוג עיסוק לפי טופס פגישה ראשונה
  const [employmentTypes, setEmploymentTypes] = useState<{
    s1: string | null;
    s2: string | null;
  }>({ s1: null, s2: null });
  // חשבוניות חשמל — הזנת נתונים מובנית
  const [electricityBills, setElectricityBills] = useState<
    { amount: string; months: number }[]
  >([]);
  const elecSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [electricityConfirmed, setElectricityConfirmed] = useState(
    () => !!localStorage.getItem(`elec_confirmed_${session.id}`),
  );
  const saveElecConfirmed = (val: boolean) => {
    setElectricityConfirmed(val);
    if (val) localStorage.setItem(`elec_confirmed_${session.id}`, "1");
    else localStorage.removeItem(`elec_confirmed_${session.id}`);
  };
  // סיבות "אין תלושים" לכל בן/בת זוג
  const [noPayslipReasons, setNoPayslipReasons] = useState<{
    s1: string | null;
    s2: string | null;
  }>({ s1: null, s2: null });
  // מי מהספאוסים נמצא במסך תלושי השכר
  const [activePayslipSpouse, setActivePayslipSpouse] = useState<1 | 2>(1);

  // active month context
  const [activeMonth, setActiveMonth] = useState(null); // month_entry row
  const [monthSubs, setMonthSubs] = useState([]); // submissions for active month

  // upload flow
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [cardNickname, setCardNickname] = useState("");
  const [transactions, setTransactions] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCatTx, setFilterCatTx] = useState("all");
  const [catDropdownOpenTx, setCatDropdownOpenTx] = useState(false);
  const [advFilterOpenTx, setAdvFilterOpenTx] = useState(false);
  const [filterSourceTx, setFilterSourceTx] = useState("all");
  const [filterMonthTx, setFilterMonthTx] = useState(-1); // -1 = all
  const [filterYearTx, setFilterYearTx] = useState(0); // 0 = all
  const [econInfoOpen, setEconInfoOpen] = useState(false);
  const [econInfoPos, setEconInfoPos] = useState({ top: 0, left: 0 });
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [activeTxId, setActiveTxId] = useState(null);
  const [prevCatMap, setPrevCatMap] = useState<Record<string, string>>({});
  const [catSearch, setCatSearch] = useState("");
  const [pendingRemember, setPendingRemember] = useState(null);
  const [toast, setToast] = useState("");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [uploadSource, setUploadSource] = useState("dashboard"); // "dashboard" | "month"
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [selectedMonthLabel, setSelectedMonthLabel] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResults, setAnalyzeResults] = useState<
    { name: string; count: number; error?: string }[]
  >([]);
  const [dragOver, setDragOver] = useState(false);
  const [selectedTxIds, setSelectedTxIds] = useState<Set<any>>(new Set());

  // ── בדיקת כיסוי קטגוריות — מודלים ────────────────────────────────────────────
  const [finalizeModal, setFinalizeModal] = useState<
    null | "month1" | "month2" | "month3"
  >(null);
  const [pendingFinalize, setPendingFinalize] = useState(false);
  const [estimates, setEstimates] = useState<Record<string, string>>({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [finalizeNote, setFinalizeNote] = useState(""); // הערה לפני סיום חודש (משימה 4א)
  const [showSubmissionNoteModal, setShowSubmissionNoteModal] = useState(false);
  const [submissionNote, setSubmissionNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  // ניתוח אוטומטי כשמועלה קובץ וסוג מקור נבחר
  useEffect(() => {
    if (uploadedFiles.length > 0 && sourceLabel && !analyzing) {
      analyzeFiles();
    }
  }, [uploadedFiles, sourceLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // real-time: עדכון שמות בני זוג כשהאדמין משנה את טופס הפגישה הראשונה
  useEffect(() => {
    const channel = supabase
      .channel(`intake_names_${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "client_intake",
          filter: `client_id=eq.${session.id}`,
        },
        (payload) => {
          const data = (payload.new as any)?.data;
          if (data) {
            setSpouseNames({
              s1: data.spouse1_first_name || data.spouse1_name || null,
              s2: data.spouse2_name || null,
            });
            if (data.electricity_bills !== undefined)
              setElectricityBills(data.electricity_bills || []);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  // טעינת מצב פרסום תסריטים
  useEffect(() => {
    supabase.from("portfolio_balance_settings")
      .select("is_scenario_published")
      .eq("client_id", session.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsScenarioPublished(!!(data as any)?.is_scenario_published);
      });
  }, [session.id]);

  // פונקציה לרענון scenarioCats — משותפת לטעינה ראשונית ולreal-time
  const reloadScenarioCats = async (portfolioOpen: boolean) => {
    if (!portfolioOpen) {
      setScenarioCats(null);
      return;
    }
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
        .from("scenarios")
        .select("id")
        .eq("id", activeScen.scenario_id)
        .maybeSingle();
      if (!scenario) {
        supabase
          .from("active_scenario")
          .delete()
          .eq("client_id", session.id)
          .eq("scenario_id", activeScen.scenario_id);
        setScenarioCats(null);
        return;
      }
      const { data: items } = await supabase
        .from("scenario_items")
        .select("category_name")
        .eq("scenario_id", activeScen.scenario_id);
      const scenarioNames = (items || []).map((r: any) => r.category_name);
      // כלול גם קטגוריות אישיות של הלקוח — תמיד חלק מהתצוגה
      const { data: personalRows } = await supabase
        .from("categories")
        .select("name")
        .eq("client_id", session.id)
        .eq("is_active", true);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_scenario",
          filter: `client_id=eq.${session.id}`,
        },
        () => {
          reloadScenarioCats(portfolioOpen);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id, portfolioOpen]); // eslint-disable-line

  // real-time: כשתנועה חדשה נוספת מהבוקמרקלט — טען אותה מיידית
  useEffect(() => {
    const channel = supabase
      .channel("imported_txs_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "imported_transactions",
          filter: `client_id=eq.${session.id}`,
        },
        (payload) => {
          setImportedTxs((prev) => [payload.new as any, ...prev]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session.id]);

  // real-time: תנועות מ-bank_transactions — גם INSERT (סנכרון חדש) וגם UPDATE (למשל
  // "קליטה" של תנועה מ-pending ל-completed) צריכים לרענן מיד בלי לחכות לרענון ידני
  useEffect(() => {
    const channel = supabase
      .channel("bank_txs_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bank_transactions",
          filter: `client_id=eq.${session.id}`,
        },
        (payload) => {
          setBankTxs((prev) => [payload.new as any, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bank_transactions",
          filter: `client_id=eq.${session.id}`,
        },
        (payload) => {
          setBankTxs((prev) =>
            prev.map((t: any) => (t.id === (payload.new as any).id ? (payload.new as any) : t)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
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

  // bank_transactions (v39) — סנכרון MAX חי (תוסף/סקריפט), מחליף את imported_transactions
  // לתנועות חדשות. יש לה גם status: "pending"/"completed" — טופל בנפרד ב-AllTransactionsTab.
  const loadAllBankTxs = async (clientId: string) => {
    const PAGE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("bank_transactions")
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
    const [
      { data: entries },
      { data: subs },
      { data: bSubs },
      { data: maps },
      { data: clientData },
      { data: pays },
      { data: pMonths },
      { data: pSubs },
      iTxs,
      { data: mTxs },
      { data: cDocs },
      bTxs,
    ] = await Promise.all([
      supabase
        .from("month_entries")
        .select("*")
        .eq("client_id", session.id)
        .order("month_key", { ascending: false }),
      supabase
        .from("submissions")
        .select("*")
        .eq("client_id", session.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("bank_submissions")
        .select("*")
        .eq("client_id", session.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("remembered_mappings")
        .select("*")
        .eq("client_id", session.id),
      supabase
        .from("clients")
        .select(
          "portfolio_open,portfolio_opened_at,email,phone,cycle_start_day,plan,submitted_at,required_docs,questionnaire_spouses,doc_notes,custom_docs,hidden_cats,no_payslip_reason_s1,no_payslip_reason_s2,max_session_active,max_last_sync,max_session_expires_at",
        )
        .eq("id", session.id)
        .maybeSingle(),
      supabase
        .from("payslips")
        .select("*")
        .eq("client_id", session.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("portfolio_months")
        .select("*")
        .eq("client_id", session.id)
        .order("month_key", { ascending: false }),
      supabase
        .from("portfolio_submissions")
        .select("*")
        .eq("client_id", session.id)
        .order("created_at", { ascending: true }),
      loadAllImportedTxs(session.id),
      supabase
        .from("manual_transactions")
        .select("*")
        .eq("client_id", session.id)
        .order("created_at", { ascending: false }),
      supabase.from("client_documents").select("*").eq("client_id", session.id),
      loadAllBankTxs(session.id),
    ]);
    const isFirst =
      (entries || []).length === 0 &&
      (pays || []).length === 0 &&
      (subs || []).length === 0;
    const alreadyDismissed = sessionStorage.getItem(
      "welcome_dismissed_" + session.id,
    );
    setShowWelcome(isFirst && !alreadyDismissed);
    setMonthEntries(entries || []);
    setSubmissions(subs || []);
    setBankSubs(bSubs || []);
    const drafts: Record<number, string> = {};
    (bSubs || []).forEach((s: any) => {
      if (s.bank_label) drafts[s.account_index || 1] = s.bank_label;
    });
    setBankLabelDrafts(drafts);
    setPayslips(pays || []);
    const isPortfolioOpen = clientData?.portfolio_open || false;
    setPortfolioOpen(isPortfolioOpen);
    const wasTabSaved = !!sessionStorage.getItem(TAB_KEY);
    sessionStorage.setItem(PORT_KEY, isPortfolioOpen ? "1" : "0");
    if (isPortfolioOpen && !wasTabSaved) {
      sessionStorage.setItem(TAB_KEY, "portfolio");
      sessionStorage.setItem(PORT_TAB_KEY, "control");
      setActiveTab("portfolio");
      setPortfolioSubTab("control");
      setVisitedTabs((prev) => {
        const next = new Set(prev);
        next.add("portfolio");
        return next;
      });
      setVisitedPortfolioSubTabs(new Set(["control"]));
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
    setNoPayslipReasons({
      s1: clientData?.no_payslip_reason_s1 ?? null,
      s2: clientData?.no_payslip_reason_s2 ?? null,
    });
    setMaxSessionActive(clientData?.max_session_active ?? false);
    setMaxLastSync(clientData?.max_last_sync ?? null);
    // טעינת שמות בני הזוג מטופס פגישה ראשונה
    const { data: intakeData } = await supabase
      .from("client_intake")
      .select("data")
      .eq("client_id", session.id)
      .maybeSingle();
    if (intakeData?.data) {
      setSpouseNames({
        s1:
          intakeData.data.spouse1_first_name ||
          intakeData.data.spouse1_name ||
          null,
        s2: intakeData.data.spouse2_name || null,
      });
      setEmploymentTypes({
        s1: intakeData.data.spouse1_employment_type || null,
        s2: intakeData.data.spouse2_employment_type || null,
      });
      setElectricityBills(intakeData.data.electricity_bills || []);
    }
    await reloadScenarioCats(!!clientData?.portfolio_open).catch(() => {});
    setClientDocs(cDocs || []);
    setPortfolioMonths(pMonths || []);
    setPortfolioSubs(pSubs || []);
    const mappingObj = {};
    (maps || []).forEach((m) => {
      mappingObj[m.business_name] = m.category;
    });
    setRememberedMappings(mappingObj);
    setImportedTxs(iTxs);
    setManualTxs(mTxs || []);
    setBankTxs(bTxs || []);
    setImportedLoaded(true);
  };

  const updateElectricityBills = (
    bills: { amount: string; months: number }[],
  ) => {
    setElectricityBills(bills);
    if (elecSaveRef.current) clearTimeout(elecSaveRef.current);
    elecSaveRef.current = setTimeout(async () => {
      const { data: existing } = await supabase
        .from("client_intake")
        .select("data")
        .eq("client_id", session.id)
        .maybeSingle();
      const merged = { ...(existing?.data || {}), electricity_bills: bills };
      await supabase
        .from("client_intake")
        .upsert(
          [
            {
              client_id: session.id,
              data: merged,
              updated_at: new Date().toISOString(),
            },
          ],
          { onConflict: "client_id" },
        );
    }, 2000);
  };
  const saveElectricityNow = async (
    bills: { amount: string; months: number }[],
  ) => {
    if (elecSaveRef.current) {
      clearTimeout(elecSaveRef.current);
      elecSaveRef.current = null;
    }
    const { data: existing } = await supabase
      .from("client_intake")
      .select("data")
      .eq("client_id", session.id)
      .maybeSingle();
    const merged = { ...(existing?.data || {}), electricity_bills: bills };
    const { error } = await supabase
      .from("client_intake")
      .upsert(
        [
          {
            client_id: session.id,
            data: merged,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "client_id" },
      );
    if (error) console.error("saveElectricityNow error:", error);
  };

  const loadUserData = async () => {
    setLoadingData(true);
    // Fire-and-forget: update last seen timestamp for admin visibility
    supabase
      .from("clients")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.id);
    try {
      await fetchAndApplyData();
    } catch (err) {
      console.error("loadUserData error:", err);
    } finally {
      setLoadingData(false);
    }
  };

  // רענון ברקע — ללא spinner, לא הורס state של רכיבי ילדים
  const reloadSilent = () => {
    fetchAndApplyData().catch((err) =>
      console.error("reloadSilent error:", err),
    );
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const finalizedMonths = monthEntries.filter((e) => e.is_finalized);
  // completedOnboarding — בודק האם הלקוח עבר את שלב האיסוף הבסיסי (3 חודשים + לפחות 3 תלושים כלשהם)
  // מכוון: לא משתמש בלוגיקת per-spouse כדי לא לשבור לקוחות קיימים
  const completedOnboarding =
    finalizedMonths.length >= REQUIRED_MONTHS &&
    payslips.length >= REQUIRED_MONTHS;
  const isOnboarding = !completedOnboarding;

  // ── קטגוריות ריקות — לבדיקת כיסוי ──────────────────────────────────────────
  // קטגוריות גלובליות ריקות בחודש הנוכחי (popup A / B חודשים 1-2)
  const emptyCatsCurrentMonth = useMemo(() => {
    if (!activeMonth || !categoryRows.length) return [];
    const usedCats = new Set(
      monthSubs.flatMap((s) => (s.transactions || []).map((t) => t.cat)),
    );
    return categoryRows.filter(
      (r) => r.client_id === null && !usedCats.has(r.name),
    );
  }, [activeMonth, monthSubs, categoryRows]);

  // קטגוריות גלובליות ריקות לאורך כל 3 החודשים (popup B — חודש 3)
  const emptyCatsAllMonths = useMemo(() => {
    if (!categoryRows.length) return [];
    const allUsedCats = new Set(
      submissions.flatMap((s) => (s.transactions || []).map((t) => t.cat)),
    );
    return categoryRows.filter(
      (r) => r.client_id === null && !allUsedCats.has(r.name),
    );
  }, [submissions, categoryRows]);
  // חודש נחשב "תפוס" רק אם יש לו לפחות submission אחד — ghost entries (month_entry ללא submissions) לא חוסמים בחירה מחדש
  const usedMonthKeys = monthEntries
    .filter((e) => submissions.some((s) => s.month_key === e.month_key))
    .map((e) => e.month_key);

  // ── open month picker to create new month ──
  const openNewMonth = () => {
    if (usedMonthKeys.length >= 3) return;
    setShowMonthPicker(true);
  };

  const onMonthConfirmed = async (key, monthName, year) => {
    setShowMonthPicker(false);
    const label = `${monthName} ${year}`;
    // create month_entry if not exists
    const existing = monthEntries.find((e) => e.month_key === key);
    if (!existing) {
      await supabase
        .from("month_entries")
        .insert([
          { client_id: session.id, month_key: key, label, is_finalized: false },
        ]);
      setMonthEntries((prev) => [
        { client_id: session.id, month_key: key, label, is_finalized: false },
        ...prev,
      ]);
    }
    // open the month detail page — from there user can add sources
    const { data: entry } = await supabase
      .from("month_entries")
      .select("*")
      .eq("client_id", session.id)
      .eq("month_key", key)
      .maybeSingle();
    const { data: subs } = await supabase
      .from("submissions")
      .select("*")
      .eq("client_id", session.id)
      .eq("month_key", key)
      .order("created_at", { ascending: true });
    setActiveMonth(
      entry || {
        client_id: session.id,
        month_key: key,
        label,
        is_finalized: false,
      },
    );
    setMonthSubs(subs || []);
    setScreen("month");
  };

  const openMonth = async (entry) => {
    setActiveMonth(entry);
    const { data: subs } = await supabase
      .from("submissions")
      .select("*")
      .eq("client_id", session.id)
      .eq("month_key", entry.month_key)
      .order("created_at", { ascending: true });
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
    const newFiles = Array.from(files).filter(
      (f) => !uploadedFiles.find((u) => u.name === f.name),
    );
    setUploadedFiles((p) => [...p, ...newFiles]);
  };

  const NON_PARSEABLE_EXTS = [".png", ".jpg", ".jpeg", ".doc", ".docx"];
  const isNonParseable = (name: string) =>
    NON_PARSEABLE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

  const analyzeFiles = async () => {
    setAnalyzing(true);
    setAnalyzeResults([]);
    const results: { name: string; count: number; error?: string }[] = [];
    let allTx: any[] = [];
    for (const file of uploadedFiles) {
      if (isNonParseable(file.name)) {
        results.push({
          name: file.name,
          count: 0,
          error:
            "סוג קובץ זה אינו נתמך לניתוח אוטומטי — יש להמיר ל-Excel או CSV",
        });
        setAnalyzeResults([...results]);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        let parsed: any[];
        if (file.name.toLowerCase().endsWith(".pdf")) {
          parsed = await parseBankPDF(
            buf,
            file.name,
            rememberedMappings,
            categoryRules,
          );
        } else {
          parsed = parseExcelData(
            buf,
            file.name,
            rememberedMappings,
            categoryRules,
          );
        }
        allTx = allTx.concat(parsed);
        results.push({ name: file.name, count: parsed.length });
      } catch (e: any) {
        results.push({
          name: file.name,
          count: 0,
          error: e?.message || "שגיאה בניתוח הקובץ",
        });
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
    // upload files to storage
    const storagePaths: string[] = [];
    for (const file of uploadedFiles) {
      const path = `${session.id}/credit-submissions/${selectedMonthKey}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: true });
      if (!upErr) storagePaths.push(path);
      else console.error("storage upload error:", upErr);
    }
    const { error } = await supabase.from("submissions").insert([
      {
        client_id: session.id,
        label,
        month_key: selectedMonthKey,
        source_label: sourceLabel,
        files:
          storagePaths.length > 0
            ? storagePaths
            : uploadedFiles.map((f) => f.name),
        transactions,
        created_at: new Date().toISOString(),
      },
    ]);
    if (error) {
      showToast("שגיאת שמירה: " + error.message);
      return;
    }

    // reload month subs ואת activeMonth — ללא spinner
    const [{ data: freshSubs }, { data: freshEntry }] = await Promise.all([
      supabase
        .from("submissions")
        .select("*")
        .eq("client_id", session.id)
        .eq("month_key", selectedMonthKey)
        .order("created_at", { ascending: true }),
      supabase
        .from("month_entries")
        .select("*")
        .eq("client_id", session.id)
        .eq("month_key", selectedMonthKey)
        .maybeSingle(),
    ]);
    setMonthSubs(freshSubs || []);
    if (freshEntry) setActiveMonth(freshEntry);
    reloadSilent(); // רענן שאר הנתונים ברקע

    setScreen("month"); // go to month view (fallback if modal is dismissed)
    finalizeMonth(); // קפוץ ישירות למודל "רגע לפני שמסמנים הושלם"
  };

  const finalizeMonth = () => {
    if (!activeMonth) return;
    // קבע איזה מודל להציג לפי מספר החודשים שכבר הושלמו
    const doneCount = finalizedMonths.length;
    const modalType =
      doneCount >= 2 ? "month3" : doneCount === 1 ? "month2" : "month1";
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
          await supabase
            .from("category_estimates")
            .delete()
            .eq("client_id", session.id);
          await supabase.from("category_estimates").insert(entries);
        }
      }
      const updatePayload: Record<string, any> = { is_finalized: true };
      if (finalizeNote.trim())
        updatePayload.finalize_note = finalizeNote.trim();
      await supabase
        .from("month_entries")
        .update(updatePayload)
        .eq("client_id", session.id)
        .eq("month_key", activeMonth.month_key);
      setMonthEntries((prev) =>
        prev.map((e) =>
          e.month_key === activeMonth.month_key
            ? { ...e, is_finalized: true }
            : e,
        ),
      );
      reloadSilent();
      showToast("החודש סומן כהושלם!");
      setScreen("dashboard");
    } finally {
      setPendingFinalize(false);
      setFinalizeModal(null);
    }
  };

  const reopenMonth = async (monthKey) => {
    await supabase
      .from("month_entries")
      .update({ is_finalized: false })
      .eq("client_id", session.id)
      .eq("month_key", monthKey);
    setMonthEntries((prev) =>
      prev.map((e) =>
        e.month_key === monthKey ? { ...e, is_finalized: false } : e,
      ),
    );
    reloadSilent();
    showToast("החודש נפתח מחדש לעריכה");
  };

  const saveHiddenCats = async (cats: string[]) => {
    setHiddenCats(cats);
    await supabase
      .from("clients")
      .update({ hidden_cats: cats })
      .eq("id", session.id);
  };

  const savePortfolioTxCat = async (submissionId, txIndex, newCat, newBudgetType?: string) => {
    const sub = portfolioSubs.find((s) => s.id === submissionId);
    if (!sub) return;
    const oldCat = sub.transactions?.[txIndex]?.cat || null;
    const businessName = sub.transactions?.[txIndex]?.name || null;
    const newTxs = [...(sub.transactions || [])];
    newTxs[txIndex] = { ...newTxs[txIndex], cat: newCat, budget_type: newBudgetType, edited: true };
    await supabase
      .from("portfolio_submissions")
      .update({ transactions: newTxs })
      .eq("id", submissionId);
    supabase
      .from("client_change_log")
      .insert([
        {
          client_id: session.id,
          event_type: "remap_business",
          details: {
            business_name: businessName,
            from_cat: oldCat,
            to_cat: newCat,
          },
        },
      ]);
    // עדכון ישיר של portfolioSubs — ללא loadUserData כדי לא להרוס localEdits
    setPortfolioSubs((prev) =>
      prev.map((s) =>
        s.id === submissionId ? { ...s, transactions: newTxs } : s,
      ),
    );
  };

  const deletePortfolioSub = async (submissionId) => {
    await supabase
      .from("portfolio_submissions")
      .delete()
      .eq("id", submissionId);
    setPortfolioSubs((prev) => prev.filter((s) => s.id !== submissionId));
  };

  // ── category editing ──
  const updateTxCat = (id, cat) => {
    setTransactions((p) =>
      p.map((t) =>
        t.id === id ? { ...t, cat, edited: true, conf: "high" } : t,
      ),
    );
    if (pendingRemember?.id === id) setPendingRemember(null);
  };

  const updateTxNote = (id, note) => {
    setTransactions((p) => p.map((t) => (t.id === id ? { ...t, note } : t)));
  };

  const filteredTx = transactions.filter((t) => {
    if (search) {
      const s = search.toLowerCase();
      if (!t.name.toLowerCase().includes(s) && !t.cat.toLowerCase().includes(s))
        return false;
    }
    if (filterCatTx !== "all" && t.cat !== filterCatTx) return false;
    if (filterSourceTx !== "all" && (t.source || "") !== filterSourceTx)
      return false;
    if (filterYearTx > 0 || filterMonthTx >= 0) {
      if (!t.date) return false;
      if (filterYearTx > 0 && !t.date.includes(String(filterYearTx)))
        return false;
      if (filterMonthTx >= 0) {
        const mm = String(filterMonthTx + 1).padStart(2, "0");
        if (!t.date.includes(`-${mm}-`) && !t.date.includes(`/${mm}/`))
          return false;
      }
    }
    return true;
  });

  if (showConnectCard)
    return (
      <ConnectCardScreen
        session={{
          ...session,
          max_session_active: maxSessionActive,
          max_last_sync: maxLastSync,
        }}
        onBack={() => setShowConnectCard(false)}
      />
    );

  const chartData = [...finalizedMonths]
    .reverse()
    .slice(0, 6)
    .map((entry) => {
      const subs = submissions.filter((s) => s.month_key === entry.month_key);
      const total = subs
        .flatMap((s) => s.transactions || [])
        .filter((t) => !ignoredCats.has(t.cat))
        .reduce(
          (sum, t) => sum + (incomeCats.has(t.cat) ? -t.amount : t.amount),
          0,
        );
      return { name: entry.label || "", הוצאות: Math.round(total) };
    });

  const exportMonthToExcel = (entry) => {
    const XLSX = window.XLSX;
    if (!XLSX) {
      showToast("ספריית Excel לא נטענה");
      return;
    }
    const subs = submissions.filter((s) => s.month_key === entry.month_key);
    const allTx = subs.flatMap((s) => s.transactions || []);
    const txRows = allTx.map((t) => ({
      תאריך: t.date,
      "שם בית עסק": t.name,
      סעיף: t.cat,
      סכום: t.amount,
      מקור: t.source || "",
    }));
    const catMap: Record<string, number> = {};
    allTx.forEach((t) => {
      catMap[t.cat] = (catMap[t.cat] || 0) + t.amount;
    });
    const summaryRows = Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => ({
        סעיף: cat,
        "סכום כולל": Math.round(amt),
        "מספר עסקאות": allTx.filter((t) => t.cat === cat).length,
      }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(txRows),
      "תנועות",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "סיכום",
    );
    XLSX.writeFile(wb, `מאזן_${entry.label}.xlsx`);
  };

  if (loadingData)
    return (
      <div
        style={{
          background: "var(--bg)",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Spinner />
          <div style={{ marginTop: 16, color: "var(--text-dim)" }}>טוען...</div>
        </div>
      </div>
    );

  return (
    <div
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        display: "flex",
        minHeight: "100vh",
      }}
    >
      {/* Welcome modal for new clients */}
      {showWelcome && (
        <>
          <style>{`@keyframes welcomeModalIn { from { transform: translate(-50%,-48%) scale(0.96); opacity:0; } to { transform: translate(-50%,-50%) scale(1); opacity:1; } }`}</style>
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.7)",
              zIndex: "var(--z-back)",
            }}
            onClick={dismissWelcome}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: "36px 32px",
              zIndex: "var(--z-modal)",
              width: "min(480px,90vw)",
              textAlign: "center",
              boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
              animation: "welcomeModalIn 250ms cubic-bezier(0.16,1,0.3,1)",
            }}
          >
            {/* Close button */}
            <button
              onClick={dismissWelcome}
              style={{
                position: "absolute",
                top: 14,
                left: 16,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-dim)",
                display: "flex",
                alignItems: "center",
                padding: 6,
                borderRadius: 8,
              }}
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            {/* Icon */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 16,
                color: "var(--green-mid)",
              }}
            >
              <svg
                width={46}
                height={46}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                <path d="M20 3v4" />
                <path d="M22 5h-4" />
                <path d="M4 17v2" />
                <path d="M5 18H3" />
              </svg>
            </div>
            <div style={{ fontWeight: 700, fontSize: 22, marginBottom: 10 }}>
              ברוכים הבאים!
            </div>
            <div
              style={{
                color: "var(--text-dim)",
                fontSize: 15,
                lineHeight: 1.8,
                marginBottom: 28,
                textAlign: "right",
              }}
            >
              כדי שיוכל אלון לבנות לכם תכנית פיננסית מדויקת,
              <br />
              נצטרך מכם מספר מסמכים. הרשימה המלאה מחכה לכם בדף הבא.
            </div>
            <Btn
              onClick={dismissWelcome}
              style={{ width: "100%", justifyContent: "center" }}
            >
              מובן, בואו נתחיל! ←
            </Btn>
          </div>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "var(--green-deep)",
            color: "#fff",
            borderRadius: 12,
            padding: "12px 20px",
            fontSize: 15,
            zIndex: "var(--z-toast)",
            boxShadow: "0 8px 32px rgba(30,77,53,0.3)",
          }}
        >
          {toast}
        </div>
      )}

      {/* ── מודל בדיקת כיסוי קטגוריות (popup A — חודשים 1-2) ────────────────── */}
      {(finalizeModal === "month1" || finalizeModal === "month2") && (
        <FinalizeCheckModal
          monthLabel={activeMonth?.label || ""}
          emptyCats={emptyCatsCurrentMonth}
          isMonth3={false}
          estimates={estimates}
          onEstimateChange={() => {}}
          openSections={openSections}
          onToggleSection={(s) =>
            setOpenSections((p) => ({ ...p, [s]: !p[s] }))
          }
          finalizeNote={finalizeNote}
          onFinalizeNoteChange={setFinalizeNote}
          pending={pendingFinalize}
          onBack={() => setFinalizeModal(null)}
          onConfirm={() => doFinalize(false)}
        />
      )}

      {/* ── מודל בדיקת כיסוי קטגוריות (popup B — חודש 3) ──────────────────────── */}
      {finalizeModal === "month3" && (
        <FinalizeCheckModal
          monthLabel={activeMonth?.label || ""}
          emptyCats={emptyCatsAllMonths}
          isMonth3={true}
          estimates={estimates}
          onEstimateChange={(cat, val) =>
            setEstimates((p) => ({ ...p, [cat]: val }))
          }
          openSections={openSections}
          onToggleSection={(s) =>
            setOpenSections((p) => ({ ...p, [s]: !p[s] }))
          }
          finalizeNote={finalizeNote}
          onFinalizeNoteChange={setFinalizeNote}
          pending={pendingFinalize}
          onBack={() => setFinalizeModal(null)}
          onConfirm={() => doFinalize(true)}
        />
      )}

      {/* ── מודל הערת הגשה (popup C) ─────────────────────────────────────────── */}
      {showSubmissionNoteModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: "var(--z-top)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 18,
              padding: "32px 28px",
              maxWidth: 500,
              width: "100%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
              direction: "rtl",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
              רגע לפני ההגשה
            </div>
            <div
              style={{
                fontSize: 15,
                color: "var(--text-dim)",
                marginBottom: 20,
                lineHeight: 1.7,
              }}
            >
              לעיתים יש חודשים חריגים — נסיעה גדולה לחו"ל, קנייה חד-פעמית, הוצאה
              יוצאת דופן. אם יש משהו שאלון צריך לדעת כדי להבין את התמונה נכון —
              כתוב כאן.
            </div>
            <textarea
              value={submissionNote}
              onChange={(e) => setSubmissionNote(e.target.value)}
              placeholder='לדוגמה: "הייתה לנו נסיעה לתאילנד בעלות ₪40,000 — לא אופייני בכלל"'
              rows={4}
              style={{
                width: "100%",
                boxSizing: "border-box",
                resize: "vertical",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 15,
                color: "var(--text)",
                fontFamily: "inherit",
                lineHeight: 1.6,
                marginBottom: 20,
                outline: "none",
              }}
            />
            <div
              style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
            >
              <Btn
                variant="ghost"
                onClick={async () => {
                  setSubmittingNote(true);
                  await supabase
                    .from("clients")
                    .update({
                      submitted_at: new Date().toISOString(),
                      completion_email_sent: true,
                    })
                    .eq("id", session.id);
                  await sendCompletionEmail(session.name);
                  setSubmittedAt(new Date().toISOString());
                  setShowSubmissionNoteModal(false);
                  setSubmittingNote(false);
                  showToast("הטופס הוגש! נשלחה הודעה לאלון.");
                }}
                disabled={submittingNote}
              >
                הגש בלי הערה
              </Btn>
              <Btn
                onClick={async () => {
                  setSubmittingNote(true);
                  if (submissionNote.trim()) {
                    await supabase
                      .from("clients")
                      .update({ submission_notes: submissionNote.trim() })
                      .eq("id", session.id);
                  }
                  await supabase
                    .from("clients")
                    .update({
                      submitted_at: new Date().toISOString(),
                      completion_email_sent: true,
                    })
                    .eq("id", session.id);
                  await sendCompletionEmail(session.name);
                  setSubmittedAt(new Date().toISOString());
                  setShowSubmissionNoteModal(false);
                  setSubmittingNote(false);
                  showToast("הטופס הוגש! נשלחה הודעה לאלון.");
                }}
                disabled={submittingNote}
              >
                {submittingNote ? "מגיש..." : "הגש עם הערה"}
              </Btn>
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
      {/* ── Sidebar ── */}
      <aside
        style={{
          width: 240,
          flexShrink: 0,
          background: "linear-gradient(rgb(13,34,24) 0%, rgb(30,77,53) 100%)",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          alignSelf: "flex-start",
          height: "100vh",
          overflowY: "auto",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "28px 24px 20px" }}>
          <div
            style={{
              fontFamily: "'Frank Ruhl Libre', serif",
              fontWeight: 700,
              fontSize: 26,
              color: "#fff",
              lineHeight: 1,
              letterSpacing: "-0.02em",
              marginBottom: 4,
            }}
          >
            מאזן
          </div>
          <div
            style={{
              fontSize: 12,
              color: "rgb(255,245,245)",
              letterSpacing: "0.02em",
            }}
          >
            אזור אישי
          </div>
        </div>
        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.08)",
            margin: "0 18px 10px",
          }}
        />
        {/* Nav */}
        <nav style={{ flex: 1, padding: "4px 12px", overflowY: "auto" }}>
          {!portfolioOpen && (
            <>
              {(
                [
                  {
                    subtab: "documents",
                    label: "חומרי בסיס",
                    icon: (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" />
                      </svg>
                    ),
                  },
                  {
                    subtab: "questionnaire",
                    label: "שאלון אישי",
                    icon: (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    ),
                  },
                ] as { subtab: string; label: string; icon: React.ReactNode }[]
              ).map((item) => {
                const isActive =
                  activeTab === "data" && dataSubTab === item.subtab;
                return (
                  <button
                    key={item.subtab}
                    onClick={() => {
                      setScreen("dashboard");
                      switchTab("data");
                      setDataSubTab(item.subtab);
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          "rgba(255,255,255,0.06)";
                        (e.currentTarget as HTMLElement).style.color = "#fff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                        (e.currentTarget as HTMLElement).style.color =
                          "rgba(255,255,255,0.78)";
                      }
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      borderRight: `3px solid ${isActive ? "var(--green-soft)" : "transparent"}`,
                      cursor: "pointer",
                      background: isActive
                        ? "rgba(255,255,255,0.12)"
                        : "transparent",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
                      fontFamily: "inherit",
                      fontSize: 15,
                      fontWeight: isActive ? 600 : 500,
                      textAlign: "right",
                      marginBottom: 2,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </>
          )}
          {portfolioOpen && (
            <>
              {(() => {
                const isActive = activeTab === "portfolio";
                return (
                  <>
                    <button
                      onClick={() => {
                        setScreen("dashboard");
                        switchTab("portfolio");
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background =
                            "rgba(255,255,255,0.06)";
                          (e.currentTarget as HTMLElement).style.color = "#fff";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.background =
                            "transparent";
                          (e.currentTarget as HTMLElement).style.color =
                            "rgba(255,255,255,0.78)";
                        }
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 11,
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "none",
                        borderRight: `3px solid ${isActive ? "var(--green-soft)" : "transparent"}`,
                        cursor: "pointer",
                        background: isActive
                          ? "rgba(255,255,255,0.12)"
                          : "transparent",
                        color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
                        fontFamily: "inherit",
                        fontSize: 15,
                        fontWeight: isActive ? 600 : 500,
                        textAlign: "right",
                        marginBottom: 2,
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <path d="M8 21h8" />
                        <path d="M12 17v4" />
                      </svg>
                      <span style={{ flex: 1 }}>תיק כלכלי</span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        style={{
                          transform: isActive
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                          transition: "transform 0.2s",
                          flexShrink: 0,
                        }}
                      >
                        <path
                          d="M2 4l4 4 4-4"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {isActive && (
                      <div style={{ paddingRight: 8, marginBottom: 4 }}>
                        {(
                          [
                            { id: "txs", label: "פירוט תנועות" },
                            { id: "control", label: "בקרת תיק כלכלי" },
                            { id: "savings", label: "פירוט חסכונות" },
                            { id: "balance", label: "מאזן מתוכנן" },
                            { id: "debts", label: "מנהל חובות" },
                            { id: "tools", label: "כלים לצמיחה" },
                            ...(isScenarioPublished ? [{ id: "scenario_plan", label: "מאזן מבוסס תסריטים" }] : []),
                          ] as { id: string; label: string }[]
                        ).map((t) => {
                          const subActive = portfolioSubTab === t.id;
                          return (
                            <button
                              key={t.id}
                              onClick={() => switchPortfolioSubTab(t.id)}
                              onMouseEnter={(e) => {
                                if (!subActive) {
                                  (
                                    e.currentTarget as HTMLElement
                                  ).style.background = "rgba(255,255,255,0.05)";
                                  (e.currentTarget as HTMLElement).style.color =
                                    "rgba(255,255,255,0.85)";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!subActive) {
                                  (
                                    e.currentTarget as HTMLElement
                                  ).style.background = "transparent";
                                  (e.currentTarget as HTMLElement).style.color =
                                    "rgba(255,255,255,0.6)";
                                }
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "7px 14px 7px 8px",
                                borderRadius: 8,
                                border: "none",
                                cursor: "pointer",
                                background: subActive
                                  ? "rgba(255,255,255,0.10)"
                                  : "transparent",
                                color: subActive
                                  ? "#fff"
                                  : "rgba(255,255,255,0.6)",
                                fontFamily: "inherit",
                                fontSize: 13.5,
                                fontWeight: subActive ? 600 : 400,
                                textAlign: "right",
                                marginBottom: 1,
                                transition: "background 0.12s, color 0.12s",
                              }}
                            >
                              <span
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: "50%",
                                  background: subActive
                                    ? "var(--green-soft)"
                                    : "rgba(255,255,255,0.3)",
                                  flexShrink: 0,
                                  display: "inline-block",
                                }}
                              />
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
              {(
                [
                  {
                    id: "analytics-trends",
                    label: "מגמות",
                    icon: (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                      </svg>
                    ),
                  },
                  {
                    id: "analytics-forecast",
                    label: "תחזית",
                    icon: (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ),
                  },
                ] as { id: string; label: string; icon: React.ReactNode }[]
              ).map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setScreen("dashboard");
                      switchTab(item.id);
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          "rgba(255,255,255,0.06)";
                        (e.currentTarget as HTMLElement).style.color = "#fff";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background =
                          "transparent";
                        (e.currentTarget as HTMLElement).style.color =
                          "rgba(255,255,255,0.78)";
                      }
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 11,
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      borderRight: `3px solid ${isActive ? "var(--green-soft)" : "transparent"}`,
                      cursor: "pointer",
                      background: isActive
                        ? "rgba(255,255,255,0.12)"
                        : "transparent",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
                      fontFamily: "inherit",
                      fontSize: 15,
                      fontWeight: isActive ? 600 : 500,
                      textAlign: "right",
                      marginBottom: 2,
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                );
              })}
            </>
          )}
          {completedOnboarding &&
            (() => {
              const isActive = activeTab === "categories";
              return (
                <button
                  onClick={() => {
                    setScreen("dashboard");
                    switchTab("categories");
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLElement).style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                      (e.currentTarget as HTMLElement).style.color =
                        "rgba(255,255,255,0.78)";
                    }
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    borderRight: `3px solid ${isActive ? "var(--green-soft)" : "transparent"}`,
                    cursor: "pointer",
                    background: isActive
                      ? "rgba(255,255,255,0.12)"
                      : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
                    fontFamily: "inherit",
                    fontSize: 15,
                    fontWeight: isActive ? 600 : 500,
                    textAlign: "right",
                    marginBottom: 2,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                  הקטגוריות שלי
                </button>
              );
            })()}
          {completedOnboarding &&
            (() => {
              const isActive = activeTab === "personal";
              return (
                <button
                  onClick={() => {
                    setScreen("dashboard");
                    switchTab("personal");
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background =
                        "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLElement).style.color = "#fff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLElement).style.background =
                        "transparent";
                      (e.currentTarget as HTMLElement).style.color =
                        "rgba(255,255,255,0.78)";
                    }
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    borderRight: `3px solid ${isActive ? "var(--green-soft)" : "transparent"}`,
                    cursor: "pointer",
                    background: isActive
                      ? "rgba(255,255,255,0.12)"
                      : "transparent",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.78)",
                    fontFamily: "inherit",
                    fontSize: 15,
                    fontWeight: isActive ? 600 : 500,
                    textAlign: "right",
                    marginBottom: 2,
                    transition: "background 0.15s, color 0.15s",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  פרטים אישיים
                </button>
              );
            })()}
        </nav>
        {/* Footer: user + logout */}
        <div
          style={{
            padding: "14px 14px 18px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.04)",
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: "rgb(82,183,136)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {(session.name || "?").charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  lineHeight: 1.2,
                }}
              >
                {session.name}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "#fff";
              (e.currentTarget as HTMLElement).style.background =
                "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color =
                "rgba(255,255,255,0.65)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              flexDirection: "row-reverse",
              gap: 8,
              padding: "8px 12px",
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.65)",
              fontFamily: "inherit",
              fontSize: 13.5,
              cursor: "pointer",
              borderRadius: 8,
              transition: "all 0.15s",
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            יציאה
          </button>
        </div>
      </aside>
      {/* ── Main content ── */}
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {screen === "dashboard" && (
          <div
            style={{ maxWidth: 960, margin: "0 auto", padding: "24px 20px" }}
          >
            {/* Questionnaire sub-tab */}
            {activeTab === "data" && dataSubTab === "questionnaire" && (
              <CoachingQuestionnaire
                session={session}
                spousesCount={questionnaireSpouses || 1}
                onNavigateBack={() => setDataSubTab("documents")}
              />
            )}

            {/* Onboarding checklist — מוצג בטאב data לפני השלמה */}
            {!submittedAt &&
              activeTab === "data" &&
              dataSubTab === "documents" && (
                <OnboardingChecklist
                  session={session}
                  finalizedMonths={finalizedMonths}
                  inProgressMonths={monthEntries.filter(
                    (e) =>
                      !e.is_finalized &&
                      submissions.some((s) => s.month_key === e.month_key),
                  )}
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
                  submissions={submissions}
                  bankSubs={bankSubs}
                  bankLabelDrafts={bankLabelDrafts}
                  onBankLabelChange={(n: number, val: string) =>
                    setBankLabelDrafts((prev) => ({ ...prev, [n]: val }))
                  }
                  onNavigateBank={(n: number) => {
                    setActiveBankAccount(n);
                    setScreen("bank_upload");
                  }}
                  onNavigateBankEdit={(n: number) => {
                    setActiveBankAccount(n);
                    setScreen("bank_edit");
                  }}
                  electricityBills={electricityBills}
                  electricityConfirmed={electricityConfirmed}
                  onElectricityChange={updateElectricityBills}
                  onElectricitySaveNow={saveElectricityNow}
                  onElecConfirmed={saveElecConfirmed}
                  onNavigateTxs={openNewMonth}
                  onOpenExistingMonth={openMonth}
                  onNavigatePayslips={(spouseIdx: 1 | 2) => {
                    setActivePayslipSpouse(spouseIdx);
                    setScreen("payslips");
                  }}
                  onNoPayslipReasonSave={async (
                    spouseIdx: 1 | 2,
                    reason: string,
                  ) => {
                    const col =
                      spouseIdx === 1
                        ? "no_payslip_reason_s1"
                        : "no_payslip_reason_s2";
                    await supabase
                      .from("clients")
                      .update({ [col]: reason || null })
                      .eq("id", session.id);
                    setNoPayslipReasons((prev) => ({
                      ...prev,
                      [spouseIdx === 1 ? "s1" : "s2"]: reason || null,
                    }));
                  }}
                  onNavigateQuestionnaire={() => {
                    switchTab("data");
                    setDataSubTab("questionnaire");
                  }}
                  onMonthsChange={reloadSilent}
                  onDocsChange={async () => {
                    const { data } = await supabase
                      .from("client_documents")
                      .select("*")
                      .eq("client_id", session.id);
                    setClientDocs(data || []);
                  }}
                  onSubmit={(existingNote?: string) => {
                    setSubmissionNote(existingNote || "");
                    setShowSubmissionNoteModal(true);
                  }}
                />
              )}

            {/* הגשה בהצלחה — מוצג בטאב data אחרי הגשה ולפני פתיחת תיק */}
            {submittedAt && !portfolioOpen && activeTab === "data" && dataSubTab === "documents" && (
              <div style={{
                background: "var(--green-mint)", border: "1.5px solid var(--green-soft)",
                borderRadius: 14, padding: "24px 28px", textAlign: "center", direction: "rtl",
              }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "var(--green-deep)", marginBottom: 6 }}>
                  הגשת בהצלחה!
                </div>
                <div style={{ fontSize: 14, color: "var(--green-deep)", opacity: 0.85 }}>
                  החומרים נשלחו לייעוץ — ממתין לפתיחת התיק הכלכלי
                </div>
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
                onMonthCreated={(newEntry) =>
                  setPortfolioMonths((p) => [
                    newEntry,
                    ...p.filter((e) => e.month_key !== newEntry.month_key),
                  ])
                }
                rememberedMappings={rememberedMappings}
                onRememberingAdded={(name, cat) =>
                  setRememberedMappings((p) => ({ ...p, [name]: cat }))
                }
                cycleStartDay={cycleStartDay}
                importedTxs={importedTxs}
                manualTxs={manualTxs}
                bankTxs={bankTxs}
                onManualTxAdded={(rawRow) =>
                  setManualTxs((prev) => [...prev, rawRow])
                }
                onManualTxDeleted={(dbId) =>
                  setManualTxs((prev) => prev.filter((t) => t.id !== dbId))
                }
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
                maxSessionActive={maxSessionActive}
                maxLastSync={maxLastSync}
              />
            )}

            {/* SCENARIO PLAN TAB — מאזן מבוסס תסריטים (מפורסם ע"י האדמין) */}
            {activeTab === "portfolio" && portfolioOpen && isScenarioPublished &&
              visitedPortfolioSubTabs.has("scenario_plan") && (
              <div style={{ display: portfolioSubTab === "scenario_plan" ? "block" : "none" }}>
                <ScenarioPlanTab client={{ id: session.id }} dataSource="published" />
              </div>
            )}

            {/* PERSONAL TAB */}
            {completedOnboarding && activeTab === "personal" && (
              <ClientPersonalTab
                session={session}
                onOpenConnectCard={() => setShowConnectCard(true)}
                maxLastSync={maxLastSync}
              />
            )}

            {/* MY CATEGORIES TAB */}
            {completedOnboarding && activeTab === "categories" && (
              <MyCategoriesScreen
                clientId={session.id}
                hiddenCats={hiddenCats}
                onHiddenCatsChange={saveHiddenCats}
              />
            )}

            {/* ANALYTICS TRENDS TAB — מגמות (lazy mount) */}
            {portfolioOpen && visitedTabs.has("analytics-trends") && (
              <div
                style={{
                  display: activeTab === "analytics-trends" ? "block" : "none",
                }}
              >
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
              <div
                style={{
                  display:
                    activeTab === "analytics-forecast" ? "block" : "none",
                }}
              >
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
            onAddSource={() =>
              openUpload(activeMonth.month_key, activeMonth.label)
            }
            onFinalize={finalizeMonth}
            onReopen={() => reopenMonth(activeMonth.month_key)}
            onBack={() => setScreen("dashboard")}
            onDeleteSub={async (subId) => {
              await supabase.from("submissions").delete().eq("id", subId);
              setMonthSubs((prev) => prev.filter((s) => s.id !== subId));
              reloadSilent();
            }}
            onUpdateSub={async (subId, newTx) => {
              await supabase
                .from("submissions")
                .update({ transactions: newTx })
                .eq("id", subId);
              setMonthSubs((prev) =>
                prev.map((s) =>
                  s.id === subId ? { ...s, transactions: newTx } : s,
                ),
              );
              reloadSilent();
            }}
          />
        )}

        {/* ── UPLOAD ── */}
        {screen === "upload" && (
          <div
            style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 24,
              }}
            >
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (uploadSource === "month" && activeMonth)
                    setScreen("month");
                  else setScreen("dashboard");
                }}
              >
                חזור ←
              </Btn>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 20,
                  color: "var(--green-deep)",
                  letterSpacing: "-0.3px",
                }}
              >
                הוסף תנועות — {selectedMonthLabel}
              </div>
            </div>

            <Card style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 8,
                  fontSize: 16,
                  color: "var(--text-mid)",
                }}
              >
                שם המקור
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {["כרטיס אשראי", 'עו"ש', "אחר"].map((s) => {
                  const isActive =
                    s === "כרטיס אשראי"
                      ? sourceLabel === "כרטיס אשראי" ||
                        sourceLabel.startsWith("כרטיס אשראי — ")
                      : sourceLabel === s;
                  return (
                    <button
                      type="button"
                      key={s}
                      onClick={() => {
                        setSourceLabel(s);
                        setCardNickname("");
                      }}
                      style={{
                        padding: "9px 20px",
                        borderRadius: 10,
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        border: `2px solid ${isActive ? "var(--green-mid)" : "var(--border)"}`,
                        background: isActive
                          ? "var(--green-mint)"
                          : "var(--surface2)",
                        color: isActive
                          ? "var(--green-deep)"
                          : "var(--text-dim)",
                        boxShadow: isActive
                          ? "0 2px 8px rgba(45,106,79,0.2)"
                          : "none",
                        transition: "all 0.15s",
                      }}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {sourceLabel === "כרטיס אשראי" ||
              sourceLabel.startsWith("כרטיס אשראי — ") ? (
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "var(--text-dim)",
                      marginBottom: 5,
                    }}
                  >
                    כינוי הכרטיס (אופציונלי) — למשל: ויזה לאומי, מאסטרקארד עבודה
                  </div>
                  <input
                    value={cardNickname}
                    onChange={(e) => {
                      const n = e.target.value;
                      setCardNickname(n);
                      setSourceLabel(
                        "כרטיס אשראי" + (n.trim() ? " — " + n.trim() : ""),
                      );
                    }}
                    placeholder="משה אשראי עבודה"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "9px 12px",
                      color: "var(--text)",
                      fontSize: 15,
                      fontFamily: "inherit",
                      outline: "none",
                    }}
                  />
                  {sourceLabel && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-dim)",
                        marginTop: 5,
                      }}
                    >
                      שם המקור:{" "}
                      <strong style={{ color: "var(--green-deep)" }}>
                        {sourceLabel}
                      </strong>
                    </div>
                  )}
                </div>
              ) : (
                <Input
                  label="או הכנס שם ידני"
                  value={sourceLabel}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  placeholder='למשל "מקס - משה"'
                />
              )}
            </Card>

            <div
              style={{
                marginBottom: 16,
                textAlign: "center",
                padding: "28px 20px",
                border: `2px dashed ${dragOver ? "var(--green-mid)" : "var(--border)"}`,
                borderRadius: 12,
                background: dragOver ? "var(--green-mint)" : "var(--surface)",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
            >
              <div style={{ marginBottom: 10 }}>
                {dragOver ? (
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green-mid)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                ) : (
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green-mid)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="16 16 12 12 8 16" />
                    <line x1="12" y1="12" x2="12" y2="21" />
                    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                  </svg>
                )}
              </div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {dragOver ? "שחרר להוספה" : "גרור קבצים לכאן"}
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: "var(--text-dim)",
                  marginBottom: 16,
                }}
              >
                Excel, CSV, PDF
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.ods"
                multiple
                style={{ display: "none" }}
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Btn onClick={() => fileInputRef.current?.click()}>בחר קבצים</Btn>
            </div>

            {uploadedFiles.length > 0 && (
              <Card style={{ marginBottom: 16 }}>
                {uploadedFiles.map((f, i) => {
                  const res = analyzeResults.find((r) => r.name === f.name);
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom:
                          i < uploadedFiles.length - 1
                            ? `1px solid ${"var(--border)"}22`
                            : "none",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--text-dim)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        {f.name}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        {res && (
                          <span
                            style={{
                              fontSize: 13,
                              color: res.error
                                ? "var(--red)"
                                : res.count === 0
                                  ? "var(--gold)"
                                  : "var(--green-soft)",
                            }}
                          >
                            {res.error
                              ? res.error
                              : res.count === 0
                                ? "לא זוהו תנועות"
                                : `✓ ${res.count} תנועות`}
                          </span>
                        )}
                        {analyzing && !res && (
                          <span
                            style={{ fontSize: 13, color: "var(--text-dim)" }}
                          >
                            מנתח...
                          </span>
                        )}
                        <button
                          onClick={() =>
                            setUploadedFiles((p) => p.filter((_, j) => j !== i))
                          }
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--red)",
                            cursor: "pointer",
                            fontSize: 18,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}

            {analyzeResults.length > 0 &&
              !analyzing &&
              analyzeResults.every((r) => r.count === 0) && (
                <div
                  style={{
                    background: "rgba(255,183,77,0.1)",
                    border: "1px solid var(--gold)",
                    borderRadius: 8,
                    padding: "10px 14px",
                    marginBottom: 14,
                    fontSize: 15,
                    color: "var(--gold)",
                  }}
                >
                  לא זוהו תנועות באף קובץ. בדוק שהקבצים הם Excel/CSV עם עמודות
                  תאריך, שם ועסק וסכום.
                </div>
              )}

            <Btn
              onClick={analyzeFiles}
              disabled={uploadedFiles.length === 0 || !sourceLabel || analyzing}
              style={{ width: "100%", justifyContent: "center" }}
            >
              {analyzing ? "מנתח..." : "נתח תנועות ←"}
            </Btn>
          </div>
        )}

        {/* ── REVIEW ── */}
        {screen === "review" &&
          (() => {
            const reviewTotalAll = transactions.reduce(
              (s, t) => s + Number(t.amount || 0),
              0,
            );
            const reviewTotalEconomic = transactions
              .filter(
                (t) => t.cat !== "להתעלם" && t.flow_type !== "credit_transfer",
              )
              .reduce((s, t) => s + Number(t.amount || 0), 0);
            const reviewIgnoredCount = transactions.filter(
              (t) => t.cat === "להתעלם",
            ).length;
            const reviewIncomeTotal = transactions
              .filter((t) => t.cat === "הכנסות")
              .reduce((s, t) => s + Number(t.amount || 0), 0);
            const reviewExpenseTotal = transactions
              .filter((t) => t.cat !== "הכנסות")
              .reduce((s, t) => s + Number(t.amount || 0), 0);
            const reviewIsNetNegative = reviewExpenseTotal > reviewIncomeTotal;
            return (
              <div
                style={{
                  maxWidth: 800,
                  margin: "0 auto",
                  padding: "28px 20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 20,
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <Btn
                      variant="ghost"
                      size="sm"
                      onClick={() => setScreen("upload")}
                    >
                      חזור ←
                    </Btn>
                    <div>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 20,
                          color: "var(--green-deep)",
                          letterSpacing: "-0.3px",
                        }}
                      >
                        סיווג תנועות
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-dim)",
                          marginTop: 2,
                        }}
                      >
                        {transactions.length} תנועות
                      </div>
                    </div>
                  </div>
                  <Btn size="sm" onClick={saveSubmission}>
                    שמור ←
                  </Btn>
                </div>
                {/* Filter bar */}
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: "12px 16px",
                    boxShadow: "0 1px 4px rgba(30,77,53,0.05)",
                    marginBottom: 16,
                  }}
                >
                  {/* Row 1: search */}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ flex: 1, minWidth: 120, position: "relative" }}
                    >
                      <svg
                        style={{
                          position: "absolute",
                          right: 10,
                          top: "50%",
                          transform: "translateY(-50%)",
                          width: 14,
                          height: 14,
                          opacity: 0.45,
                          pointerEvents: "none",
                        }}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="M21 21l-4.3-4.3" />
                      </svg>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="חיפוש..."
                        style={{
                          width: "100%",
                          background: "var(--surface2)",
                          border: "1px solid var(--border)",
                          borderRadius: 20,
                          padding: "6px 14px 6px 14px",
                          paddingRight: 32,
                          color: "var(--text)",
                          fontSize: 14,
                          fontFamily: "inherit",
                          outline: "none",
                          boxSizing: "border-box" as any,
                        }}
                      />
                    </div>
                  </div>
                  {/* Row 2: category + advanced toggle */}
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginTop: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-dim)",
                        fontWeight: 500,
                        whiteSpace: "nowrap",
                      }}
                    >
                      קטגוריה:
                    </span>
                    {(() => {
                      const cats = [
                        ...new Set(
                          transactions.map((t: any) => t.cat).filter(Boolean),
                        ),
                      ].sort();
                      const allOpts = ["all", ...cats];
                      return (
                        <div style={{ position: "relative" }}>
                          <button
                            onClick={() => setCatDropdownOpenTx((p) => !p)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 140,
                              background:
                                filterCatTx !== "all"
                                  ? "var(--green-mint)"
                                  : "var(--surface2)",
                              border: `1px solid ${filterCatTx !== "all" ? "var(--green-soft)" : "var(--border)"}`,
                              borderRadius: 10,
                              padding: "7px 12px",
                              fontFamily: "inherit",
                              fontSize: 13,
                              color:
                                filterCatTx !== "all"
                                  ? "var(--green-deep)"
                                  : "var(--text)",
                              cursor: "pointer",
                              fontWeight: filterCatTx !== "all" ? 600 : 400,
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                textAlign: "right",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {filterCatTx === "all" ? "הכל" : filterCatTx}
                            </span>
                            <svg
                              style={{
                                width: 11,
                                height: 11,
                                flexShrink: 0,
                                transition: "transform 0.2s",
                                transform: catDropdownOpenTx
                                  ? "rotate(180deg)"
                                  : "none",
                              }}
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M2 4l4 4 4-4" />
                            </svg>
                          </button>
                          {catDropdownOpenTx && (
                            <>
                              <div
                                onClick={() => setCatDropdownOpenTx(false)}
                                style={{
                                  position: "fixed",
                                  inset: 0,
                                  zIndex: "calc(var(--z-drop) - 1)",
                                }}
                              />
                              <div
                                style={{
                                  position: "absolute",
                                  top: "calc(100% + 4px)",
                                  right: 0,
                                  zIndex: "var(--z-drop)",
                                  background: "var(--surface)",
                                  border: "1px solid var(--border)",
                                  borderRadius: 12,
                                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                                  minWidth: 180,
                                  maxHeight: 260,
                                  overflowY: "auto",
                                  padding: 4,
                                }}
                              >
                                {allOpts.map((c) => (
                                  <button
                                    key={c}
                                    onClick={() => {
                                      setFilterCatTx(c);
                                      setCatDropdownOpenTx(false);
                                    }}
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      textAlign: "right",
                                      padding: "8px 12px",
                                      borderRadius: 8,
                                      border: "none",
                                      fontFamily: "inherit",
                                      fontSize: 13,
                                      cursor: "pointer",
                                      background:
                                        filterCatTx === c
                                          ? "var(--green-mint)"
                                          : "transparent",
                                      color:
                                        filterCatTx === c
                                          ? "var(--green-deep)"
                                          : "var(--text)",
                                      fontWeight: filterCatTx === c ? 600 : 400,
                                    }}
                                  >
                                    {c === "all" ? "הכל" : c}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}
                    <button
                      onClick={() => setAdvFilterOpenTx((p) => !p)}
                      style={{
                        marginRight: "auto",
                        padding: "7px 14px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-mid)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="4" y1="6" x2="20" y2="6" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="18" x2="20" y2="18" />
                        <circle cx="8" cy="6" r="2" fill="currentColor" />
                        <circle cx="15" cy="12" r="2" fill="currentColor" />
                        <circle cx="10" cy="18" r="2" fill="currentColor" />
                      </svg>
                      סינון מתקדם
                      <svg
                        style={{
                          width: 11,
                          height: 11,
                          transition: "transform 0.2s",
                          transform: advFilterOpenTx
                            ? "rotate(180deg)"
                            : "none",
                        }}
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M2 4l4 4 4-4" />
                      </svg>
                    </button>
                    {(filterCatTx !== "all" ||
                      filterSourceTx !== "all" ||
                      filterMonthTx >= 0 ||
                      filterYearTx > 0) && (
                      <button
                        onClick={() => {
                          setFilterCatTx("all");
                          setFilterSourceTx("all");
                          setFilterMonthTx(-1);
                          setFilterYearTx(0);
                        }}
                        style={{
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontSize: 13,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-dim)",
                        }}
                      >
                        נקה פילטרים
                      </button>
                    )}
                  </div>
                  {/* Advanced panel */}
                  {advFilterOpenTx &&
                    (() => {
                      const sourceLabels = [
                        ...new Set(
                          transactions
                            .map((t: any) => t.source)
                            .filter(Boolean),
                        ),
                      ] as string[];
                      return (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 12,
                            borderTop: "1px dashed var(--border)",
                          }}
                        >
                          {sourceLabels.length > 1 && (
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "center",
                                flexWrap: "wrap",
                                marginBottom: 10,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 13,
                                  color: "var(--text-dim)",
                                  fontWeight: 500,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                מקור:
                              </span>
                              <div
                                style={{
                                  display: "inline-flex",
                                  background: "var(--surface2)",
                                  borderRadius: 10,
                                  padding: 3,
                                  gap: 2,
                                }}
                              >
                                {[
                                  ["all", "הכל"] as [string, string],
                                  ...sourceLabels.map(
                                    (s) =>
                                      [s, s.split(/[/\\]/).pop() || s] as [
                                        string,
                                        string,
                                      ],
                                  ),
                                ].map(([v, l]) => (
                                  <button
                                    key={v}
                                    onClick={() => setFilterSourceTx(v)}
                                    style={{
                                      background:
                                        filterSourceTx === v
                                          ? "var(--surface)"
                                          : "transparent",
                                      border: 0,
                                      padding: "5px 11px",
                                      borderRadius: 8,
                                      fontFamily: "inherit",
                                      fontSize: 12,
                                      fontWeight:
                                        filterSourceTx === v ? 600 : 500,
                                      color:
                                        filterSourceTx === v
                                          ? "var(--green-deep)"
                                          : "var(--text-mid)",
                                      cursor: "pointer",
                                      boxShadow:
                                        filterSourceTx === v
                                          ? "0 1px 2px rgba(0,0,0,0.04)"
                                          : "none",
                                    }}
                                  >
                                    {l}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                color: "var(--text-dim)",
                                fontWeight: 500,
                                whiteSpace: "nowrap",
                              }}
                            >
                              תאריך:
                            </span>
                            <CustomSelect
                              value={filterYearTx}
                              onChange={(v) => setFilterYearTx(Number(v))}
                              options={[
                                { value: 0, label: "כל השנים" },
                                ...[2023, 2024, 2025, 2026, 2027].map((y) => ({
                                  value: y,
                                  label: String(y),
                                })),
                              ]}
                              size="sm"
                              style={{ minWidth: 110 }}
                            />
                            <CustomSelect
                              value={filterMonthTx}
                              onChange={(v) => setFilterMonthTx(Number(v))}
                              options={[
                                { value: -1, label: "כל החודשים" },
                                ...HEBREW_MONTHS.map((m, i) => ({
                                  value: i,
                                  label: m,
                                })),
                              ]}
                              size="sm"
                              style={{ minWidth: 120 }}
                            />
                            {(filterMonthTx >= 0 || filterYearTx > 0) && (
                              <button
                                onClick={() => {
                                  setFilterMonthTx(-1);
                                  setFilterYearTx(0);
                                }}
                                style={{
                                  border: "none",
                                  background: "none",
                                  color: "var(--text-dim)",
                                  cursor: "pointer",
                                  fontSize: 18,
                                  lineHeight: 1,
                                  padding: 0,
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                </div>

                <RememberModal
                  pendingRemember={pendingRemember}
                  onAlways={async () => {
                    const oldCat =
                      rememberedMappings[pendingRemember.name] || null;
                    const { name, cat, budgetType } = pendingRemember;
                    await supabase
                      .from("remembered_mappings")
                      .upsert(
                        [
                          {
                            client_id: session.id,
                            business_name: name,
                            category: cat,
                            budget_type: budgetType,
                          },
                        ],
                        { onConflict: "client_id,business_name" },
                      );
                    await supabase
                      .from("client_change_log")
                      .insert([
                        {
                          client_id: session.id,
                          event_type: "remap_business",
                          details: {
                            business_name: name,
                            from_cat: oldCat,
                            to_cat: cat,
                          },
                        },
                      ]);
                    setRememberedMappings((p) => ({ ...p, [name]: cat }));
                    setTransactions((p) =>
                      p.map((t) =>
                        t.name === name
                          ? { ...t, cat, budget_type: budgetType, edited: true }
                          : t,
                      ),
                    );
                    setPendingRemember(null);
                  }}
                  onJustHere={() => setPendingRemember(null)}
                />

                {(() => {
                  const isPdf = (tx: any) =>
                    (tx.source || "").toLowerCase().endsWith(".pdf");
                  const clearRememberedHere = async (businessName: string) => {
                    await supabase
                      .from("remembered_mappings")
                      .delete()
                      .eq("client_id", session.id)
                      .eq("business_name", businessName);
                    setRememberedMappings((p: any) => {
                      const n = { ...p };
                      delete n[businessName];
                      return n;
                    });
                  };
                  const toggleFlowType = (id: any) => {
                    setTransactions((prev) =>
                      prev.map((t) =>
                        t.id === id
                          ? {
                              ...t,
                              flow_type:
                                t.flow_type === "credit_transfer"
                                  ? "expense"
                                  : "credit_transfer",
                            }
                          : t,
                      ),
                    );
                  };

                  const incomeTxs = filteredTx.filter(
                    (tx) => tx.maxCat === "הכנסות",
                  );
                  const creditTransferTxs = filteredTx.filter(
                    (tx) =>
                      tx.maxCat !== "הכנסות" &&
                      tx.flow_type === "credit_transfer",
                  );
                  const expenseTxs = filteredTx.filter(
                    (tx) =>
                      tx.maxCat !== "הכנסות" &&
                      tx.flow_type !== "credit_transfer",
                  );
                  const hasIncome = incomeTxs.length > 0;
                  const hasTransfers = creditTransferTxs.length > 0;

                  const toggleSelect = (id: any) =>
                    setSelectedTxIds((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    });

                  const renderTxCard = (tx: any, inTransferSection = false) => {
                    const isKnown = !!rememberedMappings[tx.name];
                    const needsCat =
                      tx.conf === "low" &&
                      (tx.cat === "הוצאות לא מתוכננות" || tx.cat === "דרוש סיווג") &&
                      isPdf(tx) &&
                      !inTransferSection;
                    const isSelected = selectedTxIds.has(tx.id);
                    return (
                      <div
                        key={tx.id}
                        style={{ position: "relative", marginBottom: 10 }}
                      >
                        <Card
                          onClick={() => {
                            if (
                              activeTxId === tx.id ||
                              activeTxId === `note_${tx.id}`
                            ) {
                              setActiveTxId(null);
                            } else if (portfolioOpen) {
                              toggleSelect(tx.id);
                            }
                          }}
                          style={{
                            padding: "14px 18px",
                            opacity: inTransferSection ? 0.85 : 1,
                            cursor: "pointer",
                            border: isSelected
                              ? "2px solid var(--green-mid)"
                              : "1px solid var(--border)",
                            background: isSelected
                              ? "var(--green-pale)"
                              : "var(--surface)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                              }}
                            >
                              {portfolioOpen && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(tx.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    marginTop: 3,
                                    width: 16,
                                    height: 16,
                                    cursor: "pointer",
                                    accentColor: "var(--green-mid)",
                                    flexShrink: 0,
                                  }}
                                />
                              )}
                              <div>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <span
                                    style={{ fontWeight: 600, fontSize: 17 }}
                                  >
                                    {tx.name}
                                  </span>
                                </div>
                                <div
                                  style={{
                                    fontSize: 15,
                                    color: "var(--text-dim)",
                                  }}
                                >
                                  {tx.date}
                                </div>
                                {tx.note && (
                                  <div
                                    style={{
                                      fontSize: 14,
                                      color: "var(--text-mid)",
                                      marginTop: 3,
                                      fontStyle: "italic",
                                    }}
                                  >
                                    {tx.note}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  color:
                                    tx.maxCat === "הכנסות"
                                      ? "var(--green-mid)"
                                      : "var(--red)",
                                  fontSize: 17,
                                }}
                              >
                                {tx.maxCat === "הכנסות" ? "+" : ""}₪
                                {tx.amount.toLocaleString()}
                              </span>
                              {!inTransferSection && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setActiveTxId(
                                        tx.id === activeTxId ? null : tx.id,
                                      );
                                      setCatSearch("");
                                      setPendingRemember(null);
                                    }}
                                    style={{
                                      background: needsCat
                                        ? "rgba(255,193,7,0.12)"
                                        : "var(--green-mint)",
                                      border: `1px solid ${needsCat ? "rgba(255,193,7,0.6)" : "var(--green-soft)"}`,
                                      borderRadius: 20,
                                      padding: "5px 14px",
                                      fontSize: 15,
                                      color: needsCat
                                        ? "var(--gold)"
                                        : "var(--green-deep)",
                                      cursor: "pointer",
                                      fontFamily: "inherit",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {needsCat ? "דרוש סיווג" : tx.cat}
                                  </button>
                                  {tx.cat !== "להתעלם" ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPrevCatMap((p) => ({
                                          ...p,
                                          [tx.id]: tx.cat,
                                        }));
                                        setTransactions((prev) =>
                                          prev.map((t) =>
                                            t.id === tx.id
                                              ? {
                                                  ...t,
                                                  cat: "להתעלם",
                                                  edited: true,
                                                  conf: "high",
                                                }
                                              : t,
                                          ),
                                        );
                                        setActiveTxId(null);
                                      }}
                                      title="התעלם מתנועה זו — לא תיספר"
                                      style={{
                                        background: "transparent",
                                        border: "1px solid var(--border)",
                                        borderRadius: 8,
                                        padding: "5px 8px",
                                        color: "var(--text-dim)",
                                        cursor: "pointer",
                                        display: "inline-flex",
                                        alignItems: "center",
                                      }}
                                    >
                                      <DocIcon
                                        name="ban"
                                        color="var(--text-dim)"
                                        size={15}
                                      />
                                    </button>
                                  ) : prevCatMap[tx.id] ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const prev = prevCatMap[tx.id];
                                        setTransactions((p) =>
                                          p.map((t) =>
                                            t.id === tx.id
                                              ? {
                                                  ...t,
                                                  cat: prev,
                                                  edited: true,
                                                  conf: "high",
                                                }
                                              : t,
                                          ),
                                        );
                                        setPrevCatMap((p) => {
                                          const n = { ...p };
                                          delete n[tx.id];
                                          return n;
                                        });
                                      }}
                                      title="בטל התעלמות"
                                      style={{
                                        background: "var(--green-mint)",
                                        border: "1px solid var(--green-soft)",
                                        borderRadius: 8,
                                        padding: "5px 10px",
                                        fontSize: 13,
                                        color: "var(--green-deep)",
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        whiteSpace: "nowrap",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 5,
                                      }}
                                    >
                                      <DocIcon
                                        name="undo"
                                        color="var(--green-deep)"
                                        size={13}
                                      />
                                      {prevCatMap[tx.id]}
                                    </button>
                                  ) : null}
                                </>
                              )}
                              <button
                                onClick={() =>
                                  setActiveTxId(
                                    activeTxId === `note_${tx.id}`
                                      ? null
                                      : `note_${tx.id}`,
                                  )
                                }
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--border)",
                                  borderRadius: 8,
                                  padding: "5px 8px",
                                  color: "var(--text-dim)",
                                  cursor: "pointer",
                                  display: "inline-flex",
                                  alignItems: "center",
                                }}
                                title="הוסף הערה"
                              >
                                <DocIcon
                                  name="pencil"
                                  color="var(--text-dim)"
                                  size={14}
                                />
                              </button>
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
                              onSelect={(cat, budgetType) => {
                                setTransactions((prev) =>
                                  prev.map((t) =>
                                    t.id === tx.id
                                      ? {
                                          ...t,
                                          cat,
                                          budget_type: budgetType,
                                          edited: true,
                                          conf: "high",
                                        }
                                      : t,
                                  ),
                                );
                                setActiveTxId(null);
                                setCatSearch("");
                                setPendingRemember({ name: tx.name, cat, budgetType });
                              }}
                            />
                          )}
                          {activeTxId === `note_${tx.id}` && (
                            <div style={{ marginTop: 10 }}>
                              <input
                                autoFocus
                                value={tx.note || ""}
                                onChange={(e) =>
                                  updateTxNote(tx.id, e.target.value)
                                }
                                placeholder="הוסף הערה לעסקה זו..."
                                style={{
                                  width: "100%",
                                  background: "var(--surface2)",
                                  border: "1.5px solid var(--green-soft)",
                                  borderRadius: 8,
                                  padding: "8px 12px",
                                  color: "var(--text)",
                                  fontFamily: "inherit",
                                  fontSize: 16,
                                  outline: "none",
                                  boxSizing: "border-box",
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Escape")
                                    setActiveTxId(null);
                                }}
                              />
                              <div
                                style={{
                                  fontSize: 13,
                                  color: "var(--text-dim)",
                                  marginTop: 4,
                                }}
                              >
                                Enter או Escape לסגור
                              </div>
                            </div>
                          )}
                        </Card>
                        {isKnown && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearRememberedHere(tx.name);
                            }}
                            title={`סיווג שמור: "${rememberedMappings[tx.name]}". לחץ לביטול`}
                            style={{
                              position: "absolute",
                              left: -8,
                              top: "50%",
                              transform: "translate(-100%,-50%)",
                              background: "rgba(46,160,67,0.08)",
                              border: "1px solid rgba(46,160,67,0.25)",
                              borderRadius: 20,
                              padding: "4px 10px",
                              cursor: "pointer",
                              fontSize: 11,
                              color: "var(--green-deep)",
                              whiteSpace: "nowrap",
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              fontFamily: "inherit",
                            }}
                          >
                            <span style={{ fontSize: 13 }}>✓</span>
                            <span>סיווג שמור</span>
                            <span style={{ fontSize: 13, opacity: 0.6 }}>
                              ×
                            </span>
                          </button>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      {/* Summary card */}
                      <div
                        style={{
                          display: "flex",
                          gap: 1,
                          borderRadius: 14,
                          overflow: "hidden",
                          border: "1px solid var(--border)",
                          marginBottom: 16,
                          boxShadow: "0 1px 4px rgba(30,77,53,0.06)",
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            background: "var(--surface)",
                            padding: "14px 20px",
                            textAlign: "center",
                            borderLeft: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-dim)",
                              fontWeight: 500,
                              marginBottom: 4,
                            }}
                          >
                            סה"כ תנועות
                          </div>
                          <div
                            style={{
                              fontFamily: "'Frank Ruhl Libre',serif",
                              fontSize: 22,
                              fontWeight: 700,
                              letterSpacing: "-0.5px",
                              color: reviewIsNetNegative
                                ? "var(--red)"
                                : "var(--green-mid)",
                            }}
                          >
                            {reviewIsNetNegative ? "-" : ""}₪
                            {Math.round(reviewTotalAll).toLocaleString()}
                          </div>
                        </div>
                        <div
                          style={{
                            flex: 1,
                            background: "var(--surface)",
                            padding: "14px 20px",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--text-dim)",
                              fontWeight: 500,
                              marginBottom: 4,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 5,
                            }}
                          >
                            {reviewIgnoredCount > 0
                              ? `סה"כ אחרי ניכויים (ללא ${reviewIgnoredCount})`
                              : `סה"כ אחרי ניכויים`}
                            <span
                              style={{
                                position: "relative",
                                display: "inline-flex",
                              }}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  const rect =
                                    e.currentTarget.getBoundingClientRect();
                                  setEconInfoPos({
                                    top: rect.top,
                                    left: rect.left + rect.width / 2,
                                  });
                                  setEconInfoOpen((p) => !p);
                                }}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: 0,
                                  color: "var(--text-dim)",
                                  display: "inline-flex",
                                  lineHeight: 1,
                                }}
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="12" y1="8" x2="12" y2="12" />
                                  <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                              </button>
                              {econInfoOpen && (
                                <>
                                  <div
                                    onClick={() => setEconInfoOpen(false)}
                                    style={{
                                      position: "fixed",
                                      inset: 0,
                                      zIndex: "calc(var(--z-drop) - 1)",
                                    }}
                                  />
                                  <div
                                    style={{
                                      position: "fixed",
                                      bottom: `calc(100vh - ${econInfoPos.top}px + 8px)`,
                                      left: econInfoPos.left,
                                      transform: "translateX(-50%)",
                                      background: "var(--green-deep)",
                                      color: "#fff",
                                      borderRadius: 10,
                                      padding: "10px 14px",
                                      fontSize: 13,
                                      lineHeight: 1.55,
                                      whiteSpace: "nowrap",
                                      zIndex: "var(--z-drop)",
                                      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                                      textAlign: "right",
                                    }}
                                  >
                                    הסכום הכולל בניכוי תנועות שסומנו
                                    <br />
                                    כ"התעלם" (למשל: העברות פנימיות,
                                    <br />
                                    הוצאות שממומנות בידי גורם חיצוני).
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: -5,
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        width: 10,
                                        height: 10,
                                        background: "var(--green-deep)",
                                        clipPath:
                                          "polygon(50% 100%,0 0,100% 0)",
                                      }}
                                    />
                                  </div>
                                </>
                              )}
                            </span>
                          </div>
                          <div
                            style={{
                              fontFamily: "'Frank Ruhl Libre',serif",
                              fontSize: 22,
                              fontWeight: 700,
                              color: "var(--red)",
                              letterSpacing: "-0.5px",
                            }}
                          >
                            ₪{Math.round(reviewTotalEconomic).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Help strip */}
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-dim)",
                          background: "var(--surface2)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "8px 14px",
                          marginBottom: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 14,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <DocIcon
                            name="pencil"
                            color="var(--text-dim)"
                            size={13}
                          />
                          <span>הוספת הערה ליועץ</span>
                        </span>
                        <span style={{ opacity: 0.3 }}>|</span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <DocIcon
                            name="ban"
                            color="var(--text-dim)"
                            size={13}
                          />
                          <span>
                            התעלם — לא ייספר בסה"כ (למשל: הוצאה שאין להתייחס
                            אליה, תשלום לימודים במימון ההורים)
                          </span>
                        </span>
                      </div>

                      {hasIncome && (
                        <>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 16,
                              color: "var(--green-deep)",
                              marginBottom: 10,
                              marginTop: 8,
                              padding: "10px 16px",
                              background: "var(--green-mint)",
                              borderRadius: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              border: "1px solid var(--green-soft)",
                            }}
                          >
                            <DocIcon
                              name="bar-chart"
                              color="var(--green-deep)"
                              size={15}
                            />
                            הכנסות{" "}
                            <span
                              style={{
                                fontWeight: 500,
                                color: "var(--green-mid)",
                                fontSize: 14,
                              }}
                            >
                              ({incomeTxs.length})
                            </span>
                          </div>
                          {incomeTxs.map((tx) => renderTxCard(tx, false))}
                        </>
                      )}
                      {expenseTxs.length > 0 && (
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 16,
                            color: "var(--red)",
                            marginBottom: 10,
                            marginTop: hasIncome ? 16 : 8,
                            padding: "10px 16px",
                            background: "var(--red-light)",
                            borderRadius: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            border: "1px solid rgba(192,57,43,0.2)",
                          }}
                        >
                          <DocIcon
                            name="bar-chart"
                            color="var(--red)"
                            size={15}
                          />
                          פירוט תנועות{" "}
                          <span
                            style={{
                              fontWeight: 500,
                              color: "var(--text-dim)",
                              fontSize: 14,
                            }}
                          >
                            ({expenseTxs.length})
                          </span>
                        </div>
                      )}
                      {expenseTxs.map((tx) => renderTxCard(tx, false))}
                      {hasTransfers && (
                        <>
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 16,
                              color: "var(--text-mid)",
                              marginBottom: 6,
                              marginTop: 20,
                              padding: "10px 16px",
                              background: "var(--surface2)",
                              borderRadius: 12,
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              border: "1px solid var(--border)",
                            }}
                          >
                            <DocIcon
                              name="credit-card"
                              color="var(--text-mid)"
                              size={15}
                            />
                            חיובי אשראי{" "}
                            <span
                              style={{
                                fontWeight: 500,
                                color: "var(--text-dim)",
                                fontSize: 14,
                              }}
                            >
                              ({creditTransferTxs.length})
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 14,
                              color: "var(--text-dim)",
                              background: "var(--gold-light)",
                              border: "1px solid rgba(255,183,77,0.35)",
                              borderRadius: 10,
                              padding: "9px 14px",
                              marginBottom: 10,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 8,
                            }}
                          >
                            <DocIcon
                              name="alert"
                              color="var(--gold)"
                              size={15}
                            />
                            <span>
                              תנועות אלו הן תשלומי כרטיס אשראי —{" "}
                              <strong>לא נספרות כהוצאה</strong> כדי למנוע כפילות
                              עם נתוני מקס/ישראכרט. לחץ על "הוצאה" כדי להעביר.
                            </span>
                          </div>
                          {creditTransferTxs.map((tx) =>
                            renderTxCard(tx, true),
                          )}
                        </>
                      )}
                    </>
                  );
                })()}

                {/* Bulk action bar */}
                {selectedTxIds.size > 0 && (
                  <div
                    style={{
                      position: "sticky",
                      bottom: 72,
                      display: "flex",
                      justifyContent: "center",
                      marginTop: 12,
                      zIndex: 100,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        background: "var(--green-deep)",
                        color: "#fff",
                        borderRadius: 14,
                        padding: "10px 20px",
                        boxShadow: "0 4px 24px rgba(30,77,53,0.45)",
                        fontSize: 16,
                      }}
                    >
                      <span style={{ fontWeight: 700 }}>
                        {selectedTxIds.size} נבחרו
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setTransactions((prev) =>
                            prev.map((t) =>
                              selectedTxIds.has(t.id)
                                ? {
                                    ...t,
                                    cat: "להתעלם",
                                    edited: true,
                                    conf: "high",
                                  }
                                : t,
                            ),
                          );
                          setSelectedTxIds(new Set());
                        }}
                        style={{
                          background: "rgba(255,255,255,0.15)",
                          border: "1px solid rgba(255,255,255,0.3)",
                          borderRadius: 8,
                          padding: "5px 14px",
                          fontSize: 15,
                          color: "#fff",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 600,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <DocIcon name="ban" color="#fff" size={14} /> התעלם
                        מנבחרים
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTransactions((prev) =>
                            prev.filter((t) => !selectedTxIds.has(t.id)),
                          );
                          setSelectedTxIds(new Set());
                        }}
                        style={{
                          background: "rgba(192,57,43,0.7)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: 8,
                          padding: "5px 14px",
                          fontSize: 15,
                          color: "#fff",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 600,
                        }}
                      >
                        מחק נבחרים
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTxIds(new Set())}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "rgba(255,255,255,0.6)",
                          cursor: "pointer",
                          fontSize: 20,
                          padding: "0 4px",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )}

                {/* Save button at bottom too */}
                <div
                  style={{
                    position: "sticky",
                    bottom: 20,
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 8,
                  }}
                >
                  <Btn
                    onClick={saveSubmission}
                    style={{
                      boxShadow: "0 4px 20px rgba(45,106,79,0.3)",
                      padding: "12px 36px",
                      fontSize: 17,
                    }}
                  >
                    שמור את כל הסיווגים ←
                  </Btn>
                </div>
              </div>
            );
          })()}

        {/* ── BANK UPLOAD ── */}
        {screen === "bank_upload" && (
          <BankUploadScreen
            clientId={session.id}
            accountIndex={activeBankAccount}
            rememberedMappings={rememberedMappings}
            categoryRules={categoryRules}
            categories={categories}
            categoryRows={categoryRows}
            clientCats={clientCats}
            hiddenCats={hiddenCats}
            onHiddenCatsChange={saveHiddenCats}
            onCategoryAdded={reloadCategories}
            onDone={() => {
              reloadSilent();
              setScreen("dashboard");
              window.scrollTo(0, 0);
            }}
            onBack={() => {
              setScreen("dashboard");
              window.scrollTo(0, 0);
            }}
          />
        )}

        {/* ── BANK EDIT (edit existing transactions analysis) ── */}
        {screen === "bank_edit" && (
          <BankUploadScreen
            clientId={session.id}
            accountIndex={activeBankAccount}
            editMode={true}
            rememberedMappings={rememberedMappings}
            categoryRules={categoryRules}
            categories={categories}
            categoryRows={categoryRows}
            clientCats={clientCats}
            hiddenCats={hiddenCats}
            onHiddenCatsChange={saveHiddenCats}
            onCategoryAdded={reloadCategories}
            onDone={() => {
              reloadSilent();
              setScreen("dashboard");
              window.scrollTo(0, 0);
            }}
            onBack={() => {
              setScreen("dashboard");
              window.scrollTo(0, 0);
            }}
          />
        )}

        {/* ── PAYSLIPS ── */}
        {screen === "payslips" && (
          <PayslipsScreen
            clientId={session.id}
            payslips={payslips}
            spouseIndex={activePayslipSpouse}
            spouseName={
              activePayslipSpouse === 1 ? spouseNames.s1 : spouseNames.s2
            }
            subsCount={finalizedMonths.length}
            clientName={session.name}
            onDone={() => {
              reloadSilent();
            }}
            onBack={() => setScreen("dashboard")}
          />
        )}
      </main>

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
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--green-deep)";
          (e.currentTarget as HTMLElement).style.boxShadow =
            "2px 0 24px rgba(45,106,79,0.3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--green-mid)";
          (e.currentTarget as HTMLElement).style.boxShadow =
            "2px 0 18px rgba(45,106,79,0.18)";
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="white">
          <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.514L4 29l7.697-1.799A12.93 12.93 0 0016 27c6.627 0 12-5.373 12-12S22.627 3 16 3zm6.406 16.594c-.27.755-1.59 1.44-2.184 1.527-.55.08-1.243.114-2.006-.126-.464-.147-1.06-.344-1.82-.674-3.196-1.38-5.287-4.603-5.447-4.815-.16-.212-1.3-1.73-1.3-3.3s.82-2.344 1.112-2.664c.291-.32.635-.4.847-.4.212 0 .423.002.608.01.195.01.457-.074.715.546.268.643.91 2.216.99 2.376.08.16.133.347.027.556-.107.212-.16.344-.32.53l-.48.558c-.16.16-.326.333-.14.653.186.32.826 1.362 1.773 2.206 1.218 1.086 2.245 1.422 2.564 1.582.32.16.507.133.694-.08.186-.212.8-.934.014-1.147-.787-.213-.16-1.067.16-1.067z" />
        </svg>
        <span
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 12,
            color: "rgba(255,255,255,0.75)",
            letterSpacing: "0.06em",
            fontWeight: 500,
          }}
        >
          צור קשר
        </span>
      </a>
    </div>
  );
}

// ── Shared SVG Icon Component ─────────────────────────────────────────────────
function DocIcon({
  name,
  color = "var(--green-mid)",
  size = 20,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const s: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "1.75",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  if (name === "folder")
    return (
      <svg {...s}>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    );
  if (name === "payslip")
    return (
      <svg {...s}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    );
  if (name === "clipboard")
    return (
      <svg {...s}>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <line x1="12" y1="11" x2="16" y2="11" />
        <line x1="12" y1="15" x2="16" y2="15" />
      </svg>
    );
  if (name === "coins")
    return (
      <svg {...s}>
        <circle cx="8" cy="8" r="5" />
        <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
        <path d="M7 6h1v4" />
        <line x1="16.71" y1="13.88" x2="17" y2="18" />
      </svg>
    );
  if (name === "bar-chart")
    return (
      <svg {...s}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
      </svg>
    );
  if (name === "building")
    return (
      <svg {...s}>
        <rect x="3" y="9" width="18" height="12" rx="2" />
        <path d="M3 9l9-6 9 6" />
        <line x1="9" y1="21" x2="9" y2="12" />
        <line x1="15" y1="21" x2="15" y2="12" />
      </svg>
    );
  if (name === "user")
    return (
      <svg {...s}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  if (name === "file")
    return (
      <svg {...s}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  if (name === "alert")
    return (
      <svg {...s} stroke={color || "var(--gold)"}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  if (name === "note")
    return (
      <svg {...s}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  if (name === "pencil")
    return (
      <svg {...s}>
        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
      </svg>
    );
  if (name === "link")
    return (
      <svg {...s}>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    );
  if (name === "save")
    return (
      <svg {...s}>
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    );
  if (name === "check-circle")
    return (
      <svg {...s}>
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  if (name === "lightbulb")
    return (
      <svg {...s}>
        <line x1="9" y1="18" x2="15" y2="18" />
        <line x1="10" y1="22" x2="14" y2="22" />
        <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
      </svg>
    );
  if (name === "trash")
    return (
      <svg {...s}>
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    );
  if (name === "paperclip")
    return (
      <svg {...s}>
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
      </svg>
    );
  if (name === "bank")
    return (
      <svg {...s}>
        <line x1="3" y1="22" x2="21" y2="22" />
        <line x1="6" y1="18" x2="6" y2="11" />
        <line x1="10" y1="18" x2="10" y2="11" />
        <line x1="14" y1="18" x2="14" y2="11" />
        <line x1="18" y1="18" x2="18" y2="11" />
        <polygon points="12 2 20 7 4 7" />
      </svg>
    );
  if (name === "car")
    return (
      <svg {...s}>
        <rect x="1" y="3" width="15" height="13" rx="2" />
        <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" />
        <circle cx="18.5" cy="18.5" r="2.5" />
      </svg>
    );
  if (name === "home")
    return (
      <svg {...s}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    );
  if (name === "briefcase")
    return (
      <svg {...s}>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    );
  if (name === "users")
    return (
      <svg {...s}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  if (name === "pin")
    return (
      <svg {...s}>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    );
  if (name === "eye")
    return (
      <svg {...s}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  if (name === "unlock")
    return (
      <svg {...s}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 9.9-1" />
      </svg>
    );
  if (name === "ban")
    return (
      <svg {...s}>
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    );
  if (name === "undo")
    return (
      <svg {...s}>
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 .49-3.96" />
      </svg>
    );
  if (name === "credit-card")
    return (
      <svg {...s}>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    );
  return (
    <svg {...s}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ── Month Picker Modal ────────────────────────────────────────────────────────
function MonthPickerModal({ usedMonths, onConfirm, onCancel }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--)
    years.push(y);
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  const alreadyUsed = usedMonths.includes(key);
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: "var(--z-back)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          background: "var(--surface)",
          border: `1px solid ${"var(--border)"}`,
          borderRadius: 16,
          padding: 28,
          zIndex: "var(--z-modal)",
          width: 320,
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 18,
            marginBottom: 20,
            color: "var(--green-deep)",
          }}
        >
          הוסף חודש
        </div>
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 15,
              color: "var(--text-dim)",
              marginBottom: 5,
              fontWeight: 600,
            }}
          >
            חודש
          </div>
          <CustomSelect
            value={month}
            onChange={(v) => setMonth(Number(v))}
            options={HEBREW_MONTHS.map((m, i) => ({ value: i, label: m }))}
            dropdownZIndex={9010}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 15,
              color: "var(--text-dim)",
              marginBottom: 5,
              fontWeight: 600,
            }}
          >
            שנה
          </div>
          <CustomSelect
            value={year}
            onChange={(v) => setYear(Number(v))}
            options={years.map((y) => ({ value: y, label: String(y) }))}
            dropdownZIndex={9010}
            style={{ width: "100%" }}
          />
        </div>
        {alreadyUsed && (
          <div
            style={{
              background: "rgba(255,183,77,0.1)",
              border: "1px solid rgba(255,183,77,0.3)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 14,
              color: "var(--gold)",
              marginBottom: 14,
            }}
          >
            חודש זה כבר קיים — לחץ עליו ברשימה
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <Btn
            onClick={() => onConfirm(key, HEBREW_MONTHS[month], year)}
            disabled={alreadyUsed}
            style={{ flex: 1, justifyContent: "center" }}
          >
            בחר ←
          </Btn>
          <Btn variant="ghost" onClick={onCancel}>
            ביטול
          </Btn>
        </div>
      </div>
    </>
  );
}

// ── ConfirmModal — modal אישור מעוצב ──────────────────────────────────────────
function ConfirmModal({
  title,
  body,
  confirmText = "אשר",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: "var(--z-back)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 28,
          zIndex: "var(--z-modal)",
          width: 340,
          boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
          direction: "rtl",
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 18,
            marginBottom: body ? 12 : 20,
            color: danger ? "var(--red)" : "var(--green-deep)",
          }}
        >
          {title}
        </div>
        {body && (
          <div
            style={{
              fontSize: 15,
              color: "var(--text-dim)",
              marginBottom: 20,
              lineHeight: 1.6,
            }}
          >
            {body}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: danger ? "var(--red)" : "var(--green-mid)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {confirmText}
          </button>
          <button
            onClick={onCancel}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-dim)",
              fontSize: 15,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ביטול
          </button>
        </div>
      </div>
    </>
  );
}

// ── LoanFieldForm — מחוץ ל-OnboardingChecklist כדי למנוע remount בכל הקשה ──────
const LOAN_FLD_STYLE: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  color: "var(--text)",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};
const REQUIRED_LOAN_FIELDS = new Set([
  "lender",
  "start_date",
  "amount",
  "monthly",
  "balance",
]);

function LoanFieldForm({ cat, fields, onChange }) {
  const f = fields || {};
  const set = (k, v) => onChange(cat, k, v);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
        marginBottom: 12,
      }}
    >
      {[
        ["lender", "שם המלווה"],
        ["start_date", "תאריך התחלה", "date"],
        ["amount", "סכום ראשוני (₪)", "number"],
        ["monthly", "החזר חודשי (₪)", "number"],
        ["balance", "יתרה לתשלום (₪)", "number"],
        ["end_date", "תאריך סיום", "date"],
      ].map(([k, lbl, t]) => {
        const req = REQUIRED_LOAN_FIELDS.has(k);
        const empty = req && !(f[k] || "").toString().trim();
        return (
          <div key={k}>
            <div
              style={{
                fontSize: 15,
                color: "var(--text-dim)",
                marginBottom: 3,
              }}
            >
              {lbl}
              {req && <span style={{ color: "#E53E3E" }}> *</span>}
            </div>
            <input
              type={t || "text"}
              value={f[k] || ""}
              onChange={(e) => set(k, e.target.value)}
              style={{
                ...LOAN_FLD_STYLE,
                border: empty ? "1px solid #E53E3E" : "1px solid var(--border)",
              }}
              placeholder="..."
            />
          </div>
        );
      })}
      <div>
        <div
          style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 3 }}
        >
          ריבית
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
          {["כן", "לא"].map((v) => (
            <label
              key={v}
              style={{
                display: "flex",
                gap: 5,
                alignItems: "center",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name={`int_${cat}`}
                checked={f.interest === v}
                onChange={() => set("interest", v)}
              />{" "}
              {v}
            </label>
          ))}
        </div>
      </div>
      <div style={{ gridColumn: "1/-1" }}>
        <div
          style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 3 }}
        >
          הערות
        </div>
        <textarea
          value={f.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={2}
          style={{ ...LOAN_FLD_STYLE, resize: "vertical" }}
          placeholder="פרטים נוספים..."
        />
      </div>
    </div>
  );
}

// ── Onboarding Checklist ──────────────────────────────────────────────────────
// type: "file" = קובץ בלבד | "fields" = שדות בלבד | "both" = שדות + קובץ אופציונלי
const LOAN_TYPES = [
  {
    id: "loan_mortgage",
    label: "הלוואת משכנתה",
    icon: "home",
    type: "file",
    fileLabel: "לוח סילוקין / מסמך משכנתה",
    bankNameField: true,
  },
  {
    id: "loan_bank",
    label: "הלוואת בנק",
    icon: "bank",
    type: "file",
    fileLabel: "פרטי הלוואה מהבנק",
  },
  {
    id: "loan_car",
    label: "הלוואת רכב",
    icon: "car",
    type: "file",
    fileLabel: "לוח סילוקין",
  },
  { id: "loan_work", label: "הלוואת עבודה", icon: "briefcase", type: "fields" },
  {
    id: "loan_family",
    label: "הלוואה מחבר/משפחה",
    icon: "users",
    type: "fields",
  },
  { id: "loan_other", label: "הלוואה אחרת", icon: "file", type: "both" },
];

const SAVINGS_CASH_TYPES = [
  { id: "sc_pakam", label: 'פק"מ / קרן כספית', icon: "bank" },
  { id: "sc_bank", label: "חיסכון בנקאי", icon: "bank" },
  { id: "sc_portfolio", label: "תיק השקעות", icon: "bar-chart" },
  { id: "sc_gemel", label: "קופת גמל להשקעה", icon: "building" },
  { id: "sc_bituach", label: "ביטוח מנהלים", icon: "shield" },
  { id: "sc_other", label: "אחר", icon: "file" },
];

const ASSET_TYPES = [
  { id: "asset_apartment", label: "דירה", icon: "home" },
  { id: "asset_inv_apartment", label: "דירה להשקעה", icon: "home" },
  { id: "asset_land", label: "קרקע", icon: "map-pin" },
  { id: "asset_car", label: "רכב", icon: "car" },
  { id: "asset_business", label: "עסק / חברה", icon: "briefcase" },
  { id: "asset_other", label: "אחר", icon: "file" },
];

function OnboardingChecklist({
  session,
  finalizedMonths,
  inProgressMonths,
  submissions = [],
  bankSubs = [],
  bankLabelDrafts = {},
  onBankLabelChange,
  payslips,
  docs,
  submittedAt,
  requiredDocs,
  questionnaireSpouses,
  docNotes,
  customDocs,
  spouseNames,
  employmentTypes,
  noPayslipReasons,
  electricityBills,
  electricityConfirmed = false,
  onElectricityChange,
  onElectricitySaveNow,
  onElecConfirmed,
  onNavigateTxs,
  onOpenExistingMonth,
  onNavigatePayslips,
  onNoPayslipReasonSave,
  onNavigateQuestionnaire,
  onDocsChange,
  onMonthsChange,
  onNavigateBank,
  onNavigateBankEdit,
  onSubmit,
}) {
  spouseNames = spouseNames || { s1: null, s2: null };
  employmentTypes = employmentTypes || { s1: null, s2: null };
  noPayslipReasons = noPayslipReasons || { s1: null, s2: null };
  electricityBills = electricityBills || [];
  docNotes = docNotes || {};
  customDocs = customDocs || [];
  const [expanded, setExpanded] = useState(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [activeLoanTypes, setActiveLoanTypes] = useState([]);
  const [showLoanPicker, setShowLoanPicker] = useState(false);
  const [loanFields, setLoanFields] = useState({});
  const [pendingFiles, setPendingFiles] = useState({});
  const [retirementCount, setRetirementCount] = useState<number | null>(null);
  const [retirementNames, setRetirementNames] = useState<string[]>(["", ""]);
  const [retirementPendingFiles, setRetirementPendingFiles] = useState<(File | null)[]>([null, null]);
  const retirementFileRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const mortFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [loanFileReplace, setLoanFileReplace] = useState<{
    [cat: string]: number;
  }>({});
  const [loanFileExtra, setLoanFileExtra] = useState<Record<string, {balance?: string; year?: string; description?: string; bank_name?: string}>>({});
  const [loanUploading, setLoanUploading] = useState<Set<string>>(new Set());
  type MortgageProperty = { id: string; name: string; banks: { bankName: string; pendingFile: File | null }[] };
  const [mortgageProps, setMortgageProps] = useState<MortgageProperty[]>([]);
  const [saving, setSaving] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [questDoneMap, setQuestDoneMap] = useState({ 1: false, 2: false });
  const [editMonthEntry, setEditMonthEntry] = useState(null); // { id, month_key, label }
  const [editMonthVal, setEditMonthVal] = useState({
    month: 0,
    year: new Date().getFullYear(),
  });
  const [editMonthErr, setEditMonthErr] = useState("");
  const [editMonthSaving, setEditMonthSaving] = useState(false);
  const [noPayslipInput, setNoPayslipInput] = useState<{
    spouse: 1 | 2;
    val: string;
  } | null>(null);
  const [cancelConfirmSpouse, setCancelConfirmSpouse] = useState<1 | 2 | null>(
    null,
  );
  const [editMenuAccount, setEditMenuAccount] = useState<number | null>(null);
  const [summaryNote, setSummaryNote] = useState(""); // הערות מסכמות לאחר 3 חודשים (משימה 4ב)
  const [summaryNoteSaving, setSummaryNoteSaving] = useState(false);
  const [bankAccountCount, setBankAccountCount] = useState<1 | 2 | 3>(1);
  const [bankParseWarnings, setBankParseWarnings] = useState<
    Record<number, string>
  >({});
  const [bankLabelError, setBankLabelError] = useState<number | null>(null);
  const [providentCount, setProvidentCount] = useState<number>(1);
  const [providentDescs, setProvidentDescs] = useState<string[]>([]);
  const [providentReady, setProvidentReady] = useState<boolean>(false);
  const [pensionCount, setPensionCount] = useState<number>(1);
  const [pensionDescs, setPensionDescs] = useState<any[]>([]);
  const [pensionReady, setPensionReady] = useState<boolean>(false);
  const [activeSavingsCash, setActiveSavingsCash] = useState<string[]>([]);
  const [showSavingsCashPicker, setShowSavingsCashPicker] = useState(false);
  const [savingsCashFields, setSavingsCashFields] = useState<
    Record<string, { description: string; amount: string }>
  >({});
  const [activeAssets, setActiveAssets] = useState<string[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetFields, setAssetFields] = useState<
    Record<string, { description: string; value: string; year?: string }>
  >({});
  const [bankTutorialSeen, setBankTutorialSeen] = useState(
    () => !!localStorage.getItem(`bank_tutorial_seen_${session.id}`),
  );
  const fileRefs = useRef({});
  const summaryNoteTimerRef = useRef<any>(null);

  // load submission_notes (summary note) on mount
  useEffect(() => {
    supabase
      .from("clients")
      .select("submission_notes")
      .eq("id", session.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.submission_notes) setSummaryNote(data.submission_notes);
      });
  }, [session.id]);

  const handleSummaryNoteChange = (val: string) => {
    setSummaryNote(val);
    clearTimeout(summaryNoteTimerRef.current);
    summaryNoteTimerRef.current = setTimeout(async () => {
      setSummaryNoteSaving(true);
      await supabase
        .from("clients")
        .update({ submission_notes: val.trim() || null })
        .eq("id", session.id);
      setSummaryNoteSaving(false);
    }, 1200);
  };

  // load questionnaire done status
  useEffect(() => {
    if (!requiredDocs || !requiredDocs.includes("questionnaire")) return;
    (async () => {
      const { data } = await supabase
        .from("client_questionnaire")
        .select("spouse_index,done")
        .eq("client_id", session.id);
      if (data) {
        const m = { 1: false, 2: false };
        data.forEach((r) => {
          m[r.spouse_index] = r.done || false;
        });
        setQuestDoneMap(m);
      }
    })();
  }, [session.id, requiredDocs]);

  const txsDone = finalizedMonths.length >= 3;

  // תלושי שכר — מעקב לפי בן/בת זוג
  const hasSpouse2 = !!spouseNames.s2;
  // דוח רווח והפסד — לפי סוג עיסוק
  const needsPL = (type: string | null) =>
    type === "עצמאי" || type === "גם וגם";
  const s1NeedsPL = needsPL(employmentTypes.s1);
  const s2NeedsPL = hasSpouse2 && needsPL(employmentTypes.s2);
  const s1Payslips = payslips.filter(
    (p) => !p.spouse_index || p.spouse_index === 1,
  );
  const s2Payslips = payslips.filter((p) => p.spouse_index === 2);
  const s1PayslipsDone = s1Payslips.length >= 3 || !!noPayslipReasons.s1;
  const s2PayslipsDone =
    !hasSpouse2 || s2Payslips.length >= 3 || !!noPayslipReasons.s2;
  const payslipsDone = s1PayslipsDone && s2PayslipsDone;

  const needsQuestionnaire =
    requiredDocs && requiredDocs.includes("questionnaire");
  const spousesCount = questionnaireSpouses || 1;
  const questDone =
    !needsQuestionnaire ||
    (questDoneMap[1] && (spousesCount < 2 || questDoneMap[2]));

  const getDoc = (cat) => docs.find((d) => d.category === cat);
  const isDone = (cat) => !!getDoc(cat)?.marked_done;
  const hasFiles = (cat) =>
    (getDoc(cat)?.files || []).length > 0 ||
    (pendingFiles[cat] || []).length > 0;

  const ALL_OPTIONAL = [
    "loans",
    "mortgage",
    "provident",
    "pl",
    "pension",
    "savings_cash",
    "assets",
    "retirement",
  ];
  const visibleOptional = requiredDocs
    ? ALL_OPTIONAL.filter((s) => requiredDocs.includes(s))
    : ALL_OPTIONAL;

  const providentCats = Array.from(
    { length: providentCount },
    (_, i) => `provident_fund_${i + 1}`,
  );
  const providentAllDone =
    providentReady &&
    providentCats.every((cat) => isDone(cat) && hasFiles(cat));
  const providentAnyFiles = providentCats.some(hasFiles);
  const providentAnyStuck = providentCats.some(
    (cat) => isDone(cat) && !hasFiles(cat),
  );
  const showProvidentUndo = providentAllDone || providentAnyStuck;

  const pensionCats = Array.from(
    { length: pensionCount },
    (_, i) => `pension_fund_${i + 1}`,
  );
  const pensionAllDone =
    pensionReady && pensionCats.every((cat) => isDone(cat) && hasFiles(cat));
  const pensionAnyStuck = pensionCats.some(
    (cat) => isDone(cat) && !hasFiles(cat),
  );
  const showPensionUndo = pensionAllDone || pensionAnyStuck;

  const providentFieldsComplete = providentCats.every((_, i) => {
    const raw = providentDescs[i];
    const d =
      raw && typeof raw === "object"
        ? (raw as any)
        : { owner: "", company: "" };
    return d.owner?.trim() && d.company?.trim();
  });
  const pensionFieldsComplete = pensionCats.every((_, i) => {
    const raw = pensionDescs[i];
    const d =
      raw && typeof raw === "object"
        ? (raw as any)
        : { owner: "", company: "" };
    return d.owner?.trim() && d.company?.trim();
  });
  const savingsCashFieldsComplete = activeSavingsCash.every((cat) => {
    const f = savingsCashFields[cat];
    return f?.description?.trim() && String(f?.amount ?? "").trim();
  });
  const assetsFieldsComplete = activeAssets.every((cat) => {
    const f = assetFields[cat];
    const baseId = cat.replace(/_\d+$/, "");
    const isCar = baseId === "asset_car";
    return f?.description?.trim() && String(f?.value ?? "").trim() && (!isCar || (f?.year || "").trim());
  });

  const optDoneMap = {
    loans: isDone("loans_section"),
    mortgage: isDone("mortgage"),
    provident: providentAllDone,
    pl:
      s1NeedsPL || s2NeedsPL
        ? (!s1NeedsPL || isDone("profit_loss_1")) &&
          (!s2NeedsPL || isDone("profit_loss_2"))
        : isDone("profit_loss"),
    pension: pensionAllDone,
    savings_cash:
      isDone("savings_cash_section") && activeSavingsCash.length > 0,
    assets: isDone("assets_section") && activeAssets.length > 0,
    retirement: isDone("retirement_forecast"),
  };
  const allOptDone = visibleOptional.every((s) => optDoneMap[s]);

  const elecTotalMonths = electricityBills.reduce(
    (s, r) => s + (r.months || 0),
    0,
  );
  const electricityDone = elecTotalMonths >= 12;
  const electricityPartial = electricityBills.length > 0 && !electricityDone;

  const requiredDone =
    txsDone && payslipsDone && allOptDone && questDone && electricityDone;

  const REQUIRED_MONTHS = 3;
  const payslipPersonCount = hasSpouse2 ? 2 : 1;
  const totalItems =
    REQUIRED_MONTHS +
    payslipPersonCount +
    visibleOptional.length +
    (needsQuestionnaire ? 1 : 0) +
    1;
  const completedItems =
    Math.min(finalizedMonths.length, REQUIRED_MONTHS) +
    (s1PayslipsDone ? 1 : 0) +
    (hasSpouse2 && s2PayslipsDone ? 1 : 0) +
    visibleOptional.filter((s) => optDoneMap[s]).length +
    (needsQuestionnaire && questDone ? 1 : 0) +
    (electricityDone ? 1 : 0);
  const progressPct =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // load bankAccountCount from clients.bank_account_count
  useEffect(() => {
    supabase
      .from("clients")
      .select("bank_account_count")
      .eq("id", session.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.bank_account_count)
          setBankAccountCount(data.bank_account_count as 1 | 2 | 3);
      });
  }, [session.id]);

  const saveBankAccountCount = async (n: 1 | 2 | 3) => {
    setBankAccountCount(n);
    await supabase
      .from("clients")
      .update({ bank_account_count: n })
      .eq("id", session.id);
  };

  // load provident + pension count + descriptions
  useEffect(() => {
    Promise.all([
      supabase.from("clients")
        .select("provident_count,provident_descriptions,pension_count,pension_descriptions")
        .eq("id", session.id).maybeSingle(),
      supabase.from("client_documents")
        .select("category").eq("client_id", session.id),
    ]).then(([{ data }, { data: fundDocs }]) => {
      const inferCount = (prefix: string) => {
        const nums = (fundDocs || [])
          .map(d => { const m = d.category.match(new RegExp(`^${prefix}_(\\d+)$`)); return m ? parseInt(m[1]) : 0; })
          .filter(n => n > 0);
        return nums.length > 0 ? Math.max(...nums) : 0;
      };

      const pCount = data?.provident_count || inferCount("provident_fund");
      if (pCount) { setProvidentCount(pCount); setProvidentReady(true); }
      if (data?.provident_descriptions) setProvidentDescs(data.provident_descriptions);

      const penCount = data?.pension_count || inferCount("pension_fund");
      if (penCount) { setPensionCount(penCount); setPensionReady(true); }
      if (data?.pension_descriptions) setPensionDescs(data.pension_descriptions);
    });
  }, [session.id]);

  const saveProvidentCount = async (n: number) => {
    setProvidentCount(n);
    await supabase
      .from("clients")
      .update({ provident_count: n })
      .eq("id", session.id)
      .then(({ error }) => {
        if (error)
          console.warn(
            "[provident] saveProvidentCount failed (migration not applied?)",
            error.message,
          );
      });
  };

  // providentDescs: [{ owner, company }, ...]
  const saveProvidentField = async (
    idx: number,
    field: "owner" | "company",
    value: string,
  ) => {
    const next: { owner: string; company: string }[] = providentDescs.map(
      (d: any) =>
        typeof d === "object" && d !== null ? d : { owner: "", company: "" },
    );
    while (next.length <= idx) next.push({ owner: "", company: "" });
    next[idx] = { ...next[idx], [field]: value };
    setProvidentDescs(next as any);
    await supabase
      .from("clients")
      .update({ provident_descriptions: next })
      .eq("id", session.id)
      .then(({ error }) => {
        if (error)
          console.warn(
            "[provident] saveProvidentField failed (migration not applied?)",
            error.message,
          );
      });
  };

  // עדכון provident_fund (summary) — נדרש כדי שהאדמין יראה done/partial נכון
  // מאגד את כל הקבצים מהקרנות הבודדות לרשומת master אחת
  const syncProvidentMaster = async (updatedDocs: any[]) => {
    const allCats = Array.from(
      { length: providentCount },
      (_, i) => `provident_fund_${i + 1}`,
    );
    const allDone = allCats.every((cat) =>
      updatedDocs.find((d) => d.category === cat && d.marked_done),
    );
    const allFiles = allCats.flatMap(
      (cat) => updatedDocs.find((d) => d.category === cat)?.files || [],
    );
    // delete all existing master rows (prevents duplicates from prior failed saves)
    await supabase
      .from("client_documents")
      .delete()
      .eq("client_id", session.id)
      .eq("category", "provident_fund");
    if (allFiles.length > 0 || allDone) {
      await supabase
        .from("client_documents")
        .insert({
          client_id: session.id,
          category: "provident_fund",
          label: "קרן השתלמות",
          files: allFiles,
          marked_done: allDone,
        });
    }
  };

  // שמירה + סיום לקרן ספציפית (ללא setExpanded כדי שהסעיף ישאר פתוח)
  const saveAndDoneProvident = async (fundIdx: number) => {
    const cat = `provident_fund_${fundIdx}`;
    setSaving(cat);
    const existing = getDoc(cat);
    const pending = pendingFiles[cat] || [];
    const uploaded = await Promise.all(
      pending.map((f) => uploadToStorage(f, cat)),
    );
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ files: allFiles, marked_done: true })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([
          {
            client_id: session.id,
            category: cat,
            label: `קרן השתלמות ${fundIdx}`,
            files: allFiles,
            marked_done: true,
          },
        ]);
    }
    setPendingFiles((prev) => {
      const n = { ...prev };
      delete n[cat];
      return n;
    });
    await onDocsChange();
    const { data: freshDocs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", session.id);
    if (freshDocs) await syncProvidentMaster(freshDocs);
    setSaving(null);
  };

  const undoDoneProvident = async (fundIdx: number) => {
    const cat = `provident_fund_${fundIdx}`;
    setSaving(cat);
    const existing = getDoc(cat);
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ marked_done: false })
        .eq("id", existing.id);
    }
    await onDocsChange();
    const { data: freshDocs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", session.id);
    if (freshDocs) await syncProvidentMaster(freshDocs);
    setSaving(null);
  };

  const saveAllProvident = async () => {
    setSaving("provident_all");
    for (let n = 1; n <= providentCount; n++) {
      const cat = `provident_fund_${n}`;
      const existing = getDoc(cat);
      const pending = pendingFiles[cat] || [];
      const uploaded = await Promise.all(
        pending.map((f) => uploadToStorage(f, cat)),
      );
      const allFiles = [...(existing?.files || []), ...uploaded];
      if (existing) {
        await supabase
          .from("client_documents")
          .update({ files: allFiles, marked_done: true })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("client_documents")
          .insert([
            {
              client_id: session.id,
              category: cat,
              label: `קרן השתלמות ${n}`,
              files: allFiles,
              marked_done: true,
            },
          ]);
      }
      setPendingFiles((prev) => {
        const nx = { ...prev };
        delete nx[cat];
        return nx;
      });
    }
    await onDocsChange();
    const { data: freshDocs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", session.id);
    if (freshDocs) await syncProvidentMaster(freshDocs);
    setSaving(null);
  };

  const undoAllProvident = async () => {
    setSaving("provident_all");
    for (let n = 1; n <= providentCount; n++) {
      const existing = getDoc(`provident_fund_${n}`);
      if (existing) {
        await supabase
          .from("client_documents")
          .update({ marked_done: false })
          .eq("id", existing.id);
      }
    }
    await onDocsChange();
    const { data: freshDocs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", session.id);
    if (freshDocs) await syncProvidentMaster(freshDocs);
    setSaving(null);
  };

  // ── pension (mirror of provident) ──────────────────────────────
  const savePensionCount = async (n: number) => {
    setPensionCount(n);
    await supabase
      .from("clients")
      .update({ pension_count: n })
      .eq("id", session.id)
      .then(({ error }) => {
        if (error)
          console.warn("[pension] savePensionCount failed", error.message);
      });
  };

  const savePensionField = async (
    idx: number,
    field: "owner" | "company",
    value: string,
  ) => {
    const next: { owner: string; company: string }[] = pensionDescs.map(
      (d: any) =>
        typeof d === "object" && d !== null ? d : { owner: "", company: "" },
    );
    while (next.length <= idx) next.push({ owner: "", company: "" });
    next[idx] = { ...next[idx], [field]: value };
    setPensionDescs(next);
    await supabase
      .from("clients")
      .update({ pension_descriptions: next })
      .eq("id", session.id)
      .then(({ error }) => {
        if (error)
          console.warn("[pension] savePensionField failed", error.message);
      });
  };

  const syncPensionMaster = async (updatedDocs: any[]) => {
    const allCats = Array.from(
      { length: pensionCount },
      (_, i) => `pension_fund_${i + 1}`,
    );
    const allDone = allCats.every((cat) =>
      updatedDocs.find((d) => d.category === cat && d.marked_done),
    );
    const allFiles = allCats.flatMap(
      (cat) => updatedDocs.find((d) => d.category === cat)?.files || [],
    );
    // delete all existing master rows (prevents duplicates from prior failed saves)
    await supabase
      .from("client_documents")
      .delete()
      .eq("client_id", session.id)
      .eq("category", "pension_fund");
    if (allFiles.length > 0 || allDone) {
      await supabase
        .from("client_documents")
        .insert({
          client_id: session.id,
          category: "pension_fund",
          label: "קרנות פנסיה",
          files: allFiles,
          marked_done: allDone,
        });
    }
  };

  const saveAllPension = async () => {
    setSaving("pension_all");
    for (let n = 1; n <= pensionCount; n++) {
      const cat = `pension_fund_${n}`;
      const existing = getDoc(cat);
      const pending = pendingFiles[cat] || [];
      const uploaded = await Promise.all(
        pending.map((f) => uploadToStorage(f, cat)),
      );
      const allFiles = [...(existing?.files || []), ...uploaded];
      if (existing) {
        await supabase
          .from("client_documents")
          .update({ files: allFiles, marked_done: true })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("client_documents")
          .insert([
            {
              client_id: session.id,
              category: cat,
              label: `קרן פנסיה ${n}`,
              files: allFiles,
              marked_done: true,
            },
          ]);
      }
      setPendingFiles((prev) => {
        const nx = { ...prev };
        delete nx[cat];
        return nx;
      });
    }
    await onDocsChange();
    const { data: freshDocs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", session.id);
    if (freshDocs) await syncPensionMaster(freshDocs);
    setSaving(null);
  };

  const undoAllPension = async () => {
    setSaving("pension_all");
    for (let n = 1; n <= pensionCount; n++) {
      const existing = getDoc(`pension_fund_${n}`);
      if (existing)
        await supabase
          .from("client_documents")
          .update({ marked_done: false })
          .eq("id", existing.id);
    }
    await onDocsChange();
    const { data: freshDocs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("client_id", session.id);
    if (freshDocs) await syncPensionMaster(freshDocs);
    setSaving(null);
  };

  // ── savings cash ─────────────────────────────────────────────────
  const saveSavingsCashDone = async () => {
    setSaving("savings_cash_all");
    for (const cat of activeSavingsCash) {
      const st = SAVINGS_CASH_TYPES.find((s) => s.id === cat);
      const existing = getDoc(cat);
      const fields = savingsCashFields[cat] || { description: "", amount: "" };
      const pending = pendingFiles[cat] || [];
      const uploaded = await Promise.all(
        pending.map((f) => uploadToStorage(f, cat)),
      );
      const allFiles = [...(existing?.files || []), ...uploaded];
      if (existing) {
        await supabase
          .from("client_documents")
          .update({ files: allFiles, extra_data: fields, marked_done: true })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("client_documents")
          .insert([
            {
              client_id: session.id,
              category: cat,
              label: st?.label || cat,
              files: allFiles,
              extra_data: fields,
              marked_done: true,
            },
          ]);
      }
      setPendingFiles((prev) => {
        const nx = { ...prev };
        delete nx[cat];
        return nx;
      });
    }
    const sec = getDoc("savings_cash_section");
    if (sec) {
      await supabase
        .from("client_documents")
        .update({ marked_done: true })
        .eq("id", sec.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([
          {
            client_id: session.id,
            category: "savings_cash_section",
            label: "חסכונות כספיים",
            files: [],
            marked_done: true,
          },
        ]);
    }
    await onDocsChange();
    setSaving(null);
  };

  const undoSavingsCashDone = async () => {
    setSaving("savings_cash_all");
    const sec = getDoc("savings_cash_section");
    if (sec)
      await supabase
        .from("client_documents")
        .update({ marked_done: false })
        .eq("id", sec.id);
    await onDocsChange();
    setSaving(null);
  };

  // ── assets ───────────────────────────────────────────────────────
  const saveAssetsDone = async () => {
    setSaving("assets_all");
    for (const cat of activeAssets) {
      const at = ASSET_TYPES.find((a) => a.id === cat);
      const existing = getDoc(cat);
      const fields = assetFields[cat] || { description: "", value: "" };
      if (existing) {
        await supabase
          .from("client_documents")
          .update({ extra_data: fields, marked_done: true })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("client_documents")
          .insert([
            {
              client_id: session.id,
              category: cat,
              label: at?.label || cat,
              files: [],
              extra_data: fields,
              marked_done: true,
            },
          ]);
      }
    }
    const sec = getDoc("assets_section");
    if (sec) {
      await supabase
        .from("client_documents")
        .update({ marked_done: true })
        .eq("id", sec.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([
          {
            client_id: session.id,
            category: "assets_section",
            label: "נכסים פיזיים",
            files: [],
            marked_done: true,
          },
        ]);
    }
    await onDocsChange();
    setSaving(null);
  };

  const undoAssetsDone = async () => {
    setSaving("assets_all");
    const sec = getDoc("assets_section");
    if (sec)
      await supabase
        .from("client_documents")
        .update({ marked_done: false })
        .eq("id", sec.id);
    await onDocsChange();
    setSaving(null);
  };

  // init active loan types from existing docs
  useEffect(() => {
    const existing = docs
      .filter(
        (d) => d.category.startsWith("loan_") && d.category !== "loan_section",
      )
      .map((d) => d.category);
    if (existing.length)
      setActiveLoanTypes((prev) => [...new Set([...prev, ...existing])]);
  }, [docs]);

  // init loanFields from saved extra_data
  useEffect(() => {
    const fields = {};
    docs.forEach((d) => {
      if (d.category.startsWith("loan_") && d.extra_data)
        fields[d.category] = d.extra_data;
    });
    if (Object.keys(fields).length) setLoanFields(fields);
  }, [docs]);

  // init loanFileExtra (balance/description) for file-type loans
  useEffect(() => {
    const extra: Record<string, {balance?: string; year?: string; description?: string; bank_name?: string}> = {};
    docs.forEach((d: any) => {
      const lt = LOAN_TYPES.find(t => d.category === t.id || d.category.startsWith(t.id + "_"));
      if (lt && lt.type === "file" && d.extra_data) extra[d.category] = d.extra_data;
    });
    if (Object.keys(extra).length) setLoanFileExtra(extra);
  }, [docs]);

  // init mortgageProps from DB
  useEffect(() => {
    const doc = docs.find((d: any) => d.category === "mortgage");
    if (!doc) return;
    const propNames: string[] = doc.extra_data?.properties || [];
    const filesByProp: Record<string, any[]> = {};
    (doc.files || []).forEach((f: any) => {
      if (!filesByProp[f.property_name]) filesByProp[f.property_name] = [];
      filesByProp[f.property_name].push(f);
    });
    const rebuilt: MortgageProperty[] = propNames.map(name => ({
      id: name + "_" + Math.random().toString(36).slice(2,6),
      name,
      banks: (filesByProp[name] || []).map((f: any) => ({ bankName: f.bank_name, pendingFile: null }))
    }));
    if (rebuilt.length) setMortgageProps(rebuilt);
  }, [docs]);

  // init savings cash types + fields from existing docs
  useEffect(() => {
    const existing = docs
      .filter((d) => d.category.startsWith("sc_"))
      .map((d) => d.category);
    if (existing.length)
      setActiveSavingsCash((prev) => [...new Set([...prev, ...existing])]);
    const fields: Record<string, { description: string; amount: string }> = {};
    docs.forEach((d) => {
      if (d.category.startsWith("sc_") && d.extra_data)
        fields[d.category] = { ...d.extra_data, amount: String(d.extra_data?.amount ?? "") };
    });
    if (Object.keys(fields).length) setSavingsCashFields(fields);
  }, [docs]);

  // init asset types + fields from existing docs
  useEffect(() => {
    const existing = docs
      .filter(
        (d) =>
          d.category.startsWith("asset_") && d.category !== "assets_section",
      )
      .map((d) => d.category);
    if (existing.length)
      setActiveAssets((prev) => [...new Set([...prev, ...existing])]);
    const fields: Record<string, { description: string; value: string }> = {};
    docs.forEach((d) => {
      if (
        d.category.startsWith("asset_") &&
        d.category !== "assets_section" &&
        d.extra_data
      )
        fields[d.category] = { ...d.extra_data, value: String(d.extra_data?.value ?? ""), year: d.extra_data?.year || "" };
    });
    if (Object.keys(fields).length) setAssetFields(fields);
  }, [docs]);

  // load retirement doc state
  useEffect(() => {
    const doc = docs.find((d: any) => d.category === "retirement_forecast");
    if (doc?.extra_data?.spouse_count) setRetirementCount(doc.extra_data.spouse_count);
    if (doc?.files?.length) {
      setRetirementNames([doc.files[0]?.owner_name || "", doc.files[1]?.owner_name || ""]);
    }
  }, [docs]);

  const getLoanType = (cat: string) =>
    LOAN_TYPES.find((lt) => cat === lt.id || cat.startsWith(lt.id + "_"));
  const loansDone = isDone("loans_section");
  const loansHasAny =
    activeLoanTypes.length > 0 &&
    activeLoanTypes.every((cat) => {
      const lt = getLoanType(cat);
      if (!lt) return false;
      if (lt.type === "fields")
        return Object.values(loanFields[cat] || {}).some((v) => !!v);
      if (lt.type === "both")
        return (
          hasFiles(cat) || Object.values(loanFields[cat] || {}).some((v) => !!v)
        );
      return hasFiles(cat);
    });

  const toggle = (id) => {
    setExpanded((e) => (e === id ? null : id));
    if (id !== "pays") setNoPayslipInput(null);
  };

  const openEditMonth = (entry) => {
    const [y, m] = (entry.month_key || "").split("-");
    setEditMonthVal({
      month: parseInt(m || 1) - 1,
      year: parseInt(y || new Date().getFullYear()),
    });
    setEditMonthErr("");
    setEditMonthEntry(entry);
  };

  const saveEditMonth = async () => {
    const newKey = `${editMonthVal.year}-${String(editMonthVal.month + 1).padStart(2, "0")}`;
    const newLabel = `${HEBREW_MONTHS[editMonthVal.month]} ${editMonthVal.year}`;
    if (newKey === editMonthEntry.month_key) {
      setEditMonthEntry(null);
      return;
    }
    const alreadyUsed = finalizedMonths.some(
      (m) => m.month_key === newKey && m.id !== editMonthEntry.id,
    );
    if (alreadyUsed) {
      setEditMonthErr("חודש זה כבר קיים — בחר חודש אחר");
      return;
    }
    setEditMonthSaving(true);
    const { error: err1 } = await supabase
      .from("month_entries")
      .update({ month_key: newKey, label: newLabel })
      .eq("id", editMonthEntry.id);
    if (err1) {
      setEditMonthErr("שגיאה בשמירה — " + err1.message);
      setEditMonthSaving(false);
      return;
    }
    const { error: err2 } = await supabase
      .from("submissions")
      .update({ month_key: newKey })
      .eq("client_id", session.id)
      .eq("month_key", editMonthEntry.month_key);
    if (err2) {
      setEditMonthErr("שגיאה בעדכון הגשות — " + err2.message);
      setEditMonthSaving(false);
      return;
    }
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
    setPendingFiles((prev) => ({
      ...prev,
      [cat]: [...(prev[cat] || []), ...files],
    }));
  };

  const removePendingFile = (cat, idx) => {
    setPendingFiles((prev) => ({
      ...prev,
      [cat]: (prev[cat] || []).filter((_, i) => i !== idx),
    }));
  };

  const uploadToStorage = async (file, cat) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${session.id}/${cat}/${Date.now()}_${safeName}`;
    const { data, error } = await supabase.storage
      .from("client-documents")
      .upload(filePath, file, { upsert: true });
    if (error) {
      console.error("[upload] FAILED:", error.message, "path:", filePath);
      setUploadError(`שגיאה בהעלאת "${file.name}": ${error.message}`);
      return { filename: file.name, size: file.size };
    }
    return { filename: file.name, path: filePath, size: file.size };
  };

  const saveAndDone = async (cat, label) => {
    setSaving(cat);
    const existing = getDoc(cat);
    const pending = pendingFiles[cat] || [];
    const uploaded = await Promise.all(
      pending.map((f) => uploadToStorage(f, cat)),
    );
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ files: allFiles, marked_done: true })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([
          {
            client_id: session.id,
            category: cat,
            label,
            files: allFiles,
            marked_done: true,
          },
        ]);
    }
    setPendingFiles((prev) => {
      const n = { ...prev };
      delete n[cat];
      return n;
    });
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const handleRetirementCountSelect = async (count: number) => {
    setRetirementCount(count);
    const existing = getDoc("retirement_forecast");
    if (existing) {
      await supabase.from("client_documents").update({ extra_data: { ...(existing.extra_data || {}), spouse_count: count } }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: "retirement_forecast", label: "דוח תחזית פרישה", files: [], extra_data: { spouse_count: count }, marked_done: false }]);
    }
    await onDocsChange();
  };

  const handleRetirementFileChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRetirementPendingFiles(prev => { const a = [...prev]; a[idx] = file; return a; });
    if (retirementFileRefs.current[idx]) retirementFileRefs.current[idx]!.value = "";
  };

  const handleRetirementRemoveSaved = async (idx: number) => {
    const existing = getDoc("retirement_forecast");
    if (!existing) return;
    const file = existing.files?.[idx];
    if (file?.path) await supabase.storage.from("client-documents").remove([file.path]);
    const newFiles = (existing.files || []).filter((_: any, i: number) => i !== idx);
    await supabase.from("client_documents").update({ files: newFiles, marked_done: false }).eq("id", existing.id);
    await onDocsChange();
  };

  const retirementReadyToSave = () => {
    if (!retirementCount) return false;
    for (let i = 0; i < retirementCount; i++) {
      if (!(retirementNames[i] || "").trim()) return false;
      if (!getDoc("retirement_forecast")?.files?.[i] && !retirementPendingFiles[i]) return false;
    }
    return true;
  };

  const saveRetirementDone = async () => {
    setSaving("retirement_forecast");
    const existing = getDoc("retirement_forecast");
    const currentFiles = existing?.files || [];
    const newFiles: any[] = [];
    for (let i = 0; i < (retirementCount || 0); i++) {
      const pending = retirementPendingFiles[i];
      if (pending) {
        const uploaded = await uploadToStorage(pending, "retirement_forecast");
        newFiles.push({ ...uploaded, owner_name: (retirementNames[i] || "").trim() });
      } else if (currentFiles[i]) {
        newFiles.push({ ...currentFiles[i], owner_name: (retirementNames[i] || "").trim() });
      }
    }
    if (existing) {
      await supabase.from("client_documents").update({ files: newFiles, extra_data: { spouse_count: retirementCount }, marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: "retirement_forecast", label: "דוח תחזית פרישה", files: newFiles, extra_data: { spouse_count: retirementCount }, marked_done: true }]);
    }
    setRetirementPendingFiles([null, null]);
    await onDocsChange();
    setSaving(null);
  };

  const undoDone = async (cat: string) => {
    setSaving(cat);
    const existing = getDoc(cat);
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ marked_done: false })
        .eq("id", existing.id);
    }
    await onDocsChange();
    setSaving(null);
  };

  const saveLoanFiles = async (cat, label) => {
    setSaving(cat);
    const existing = getDoc(cat);
    const pending = pendingFiles[cat] || [];
    const replaceIdx = loanFileReplace[cat];
    let baseFiles = [...(existing?.files || [])];
    if (replaceIdx !== undefined) {
      const old = baseFiles[replaceIdx];
      if (old?.path)
        await supabase.storage.from("client-documents").remove([old.path]);
      baseFiles = baseFiles.filter((_, i) => i !== replaceIdx);
      setLoanFileReplace((p) => {
        const n = { ...p };
        delete n[cat];
        return n;
      });
    }
    const uploaded = await Promise.all(
      pending.map((f) => uploadToStorage(f, cat)),
    );
    const allFiles = [...baseFiles, ...uploaded];
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ files: allFiles, extra_data: loanFileExtra[cat] || {} })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([
          {
            client_id: session.id,
            category: cat,
            label,
            files: allFiles,
            extra_data: loanFileExtra[cat] || {},
            marked_done: false,
          },
        ]);
    }
    setPendingFiles((prev) => {
      const n = { ...prev };
      delete n[cat];
      return n;
    });
    await onDocsChange();
    setSaving(null);
  };

  const saveLoanFields = async (cat, label) => {
    setSaving(cat + "_f");
    const existing = getDoc(cat);
    const fields = loanFields[cat] || {};
    const pending = pendingFiles[cat] || [];
    const uploaded = await Promise.all(
      pending.map((f) => uploadToStorage(f, cat)),
    );
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ extra_data: fields, files: allFiles, marked_done: true })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([
          {
            client_id: session.id,
            category: cat,
            label,
            files: allFiles,
            extra_data: fields,
            marked_done: true,
          },
        ]);
    }
    setPendingFiles((prev) => {
      const n = { ...prev };
      delete n[cat];
      return n;
    });
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const saveMortgageDone = async () => {
    setSaving("mortgage");
    const existing = getDoc("mortgage");
    const allFiles: any[] = [];
    for (const prop of mortgageProps) {
      for (const bank of prop.banks) {
        if (bank.pendingFile) {
          const uploaded = await uploadToStorage(bank.pendingFile, "mortgage");
          allFiles.push({ ...uploaded, property_name: prop.name, bank_name: bank.bankName });
        } else {
          const saved = (existing?.files || []).find(
            (f: any) => f.property_name === prop.name && f.bank_name === bank.bankName
          );
          if (saved) allFiles.push(saved);
        }
      }
    }
    const extraData = { properties: mortgageProps.map(p => p.name) };
    if (existing) {
      await supabase.from("client_documents").update({
        files: allFiles, extra_data: extraData, marked_done: true
      }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{
        client_id: session.id, category: "mortgage", label: "משכנתה",
        files: allFiles, extra_data: extraData, marked_done: true
      }]);
    }
    await onDocsChange();
    setSaving(null);
  };

  const mortgageReadyToSave = () => {
    if (!mortgageProps.length) return false;
    for (const prop of mortgageProps) {
      if (!prop.name.trim()) return false;
      if (!prop.banks.length) return false;
      for (const bank of prop.banks) {
        if (!bank.bankName.trim()) return false;
        const existing = getDoc("mortgage");
        const hasSaved = (existing?.files || []).some(
          (f: any) => f.property_name === prop.name && f.bank_name === bank.bankName
        );
        if (!hasSaved && !bank.pendingFile) return false;
      }
    }
    return true;
  };

  const deleteFile = async (cat, idx) => {
    const existing = getDoc(cat);
    if (!existing) return;
    const file = existing.files[idx];
    if (file?.path)
      await supabase.storage.from("client-documents").remove([file.path]);
    const newFiles = existing.files.filter((_, i) => i !== idx);
    await supabase
      .from("client_documents")
      .update({ files: newFiles })
      .eq("id", existing.id);
    await onDocsChange();
  };

  const removeLoan = async (cat: string) => {
    setActiveLoanTypes((p) => p.filter((c) => c !== cat));
    const existing = getDoc(cat);
    if (existing?.id) {
      const paths = (existing.files || [])
        .map((f: any) => f.path)
        .filter(Boolean);
      if (paths.length)
        await supabase.storage.from("client-documents").remove(paths);
      await supabase.from("client_documents").delete().eq("id", existing.id);
      await onDocsChange();
    }
  };

  const handleLoanFileEdit = async (cat: string, idx: number) => {
    if (loansDone) {
      const loansSec = getDoc("loans_section");
      if (loansSec)
        await supabase
          .from("client_documents")
          .update({ marked_done: false })
          .eq("id", loansSec.id);
      await onDocsChange();
    }
    setLoanFileReplace((p) => ({ ...p, [cat]: idx }));
    pickFile(cat);
  };

  const autoSaveLoanFile = async (cat: string, file: File) => {
    const lt = getLoanType(cat);
    if (!lt) return;
    setLoanUploading((prev) => new Set(prev).add(cat));
    const existing = getDoc(cat);
    const label = existing?.label || lt.label;
    const replaceIdx = loanFileReplace[cat];
    let baseFiles = [...(existing?.files || [])];
    if (replaceIdx !== undefined) {
      const old = baseFiles[replaceIdx];
      if (old?.path) await supabase.storage.from("client-documents").remove([old.path]);
      baseFiles = baseFiles.filter((_, i) => i !== replaceIdx);
      setLoanFileReplace((p) => { const n = { ...p }; delete n[cat]; return n; });
    }
    const uploaded = await uploadToStorage(file, cat);
    const allFiles = [...baseFiles, uploaded];
    const extra = loanFileExtra[cat] || {};
    if (existing) {
      await supabase.from("client_documents")
        .update({ files: allFiles, extra_data: extra })
        .eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{
        client_id: session.id, category: cat, label,
        files: allFiles, extra_data: extra, marked_done: false,
      }]);
    }
    await onDocsChange();
    setLoanUploading((prev) => { const s = new Set(prev); s.delete(cat); return s; });
  };

  const onLoanFileChange = (cat: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    files.forEach((f) => autoSaveLoanFile(cat, f));
  };

  const markBankDone = async () => {
    setSaving("bank_stmt_meta");
    const existing = getDoc("bank_stmt_meta");
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ marked_done: true })
        .eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([
        {
          client_id: session.id,
          category: "bank_stmt_meta",
          label: 'תנועות עו"ש',
          files: [],
          marked_done: true,
        },
      ]);
    }
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const markLoansDone = async () => {
    setSaving("loans_section");

    // Save all individual loan data first (in case user didn't click שמור per card)
    for (const cat of activeLoanTypes) {
      const lt = getLoanType(cat);
      if (!lt) continue;
      const existingLoan = getDoc(cat);
      const loanLabel = existingLoan?.label || lt.label;

      if (lt.type === "fields" || lt.type === "both") {
        const fields = loanFields[cat] || {};
        const pending = pendingFiles[cat] || [];
        const uploaded = pending.length > 0
          ? await Promise.all(pending.map((f) => uploadToStorage(f, cat)))
          : [];
        const allFiles = [...(existingLoan?.files || []), ...uploaded];
        if (existingLoan) {
          await supabase.from("client_documents")
            .update({ extra_data: fields, files: allFiles, marked_done: true })
            .eq("id", existingLoan.id);
        } else if (Object.values(fields).some((v) => !!v)) {
          await supabase.from("client_documents").insert([{
            client_id: session.id, category: cat, label: loanLabel,
            files: allFiles, extra_data: fields, marked_done: true,
          }]);
        }
      } else {
        // file-type: files are auto-saved on upload, just update extra_data + mark done
        const allFiles = existingLoan?.files || [];
        const extra = loanFileExtra[cat] || {};
        if (existingLoan) {
          await supabase.from("client_documents")
            .update({ extra_data: extra, marked_done: true })
            .eq("id", existingLoan.id);
        } else if (allFiles.length > 0 || Object.values(extra).some((v) => !!v)) {
          await supabase.from("client_documents").insert([{
            client_id: session.id, category: cat, label: loanLabel,
            files: allFiles, extra_data: extra, marked_done: true,
          }]);
        }
      }
    }

    // Clear pending files for all loan types
    setPendingFiles((prev) => {
      const n = { ...prev };
      activeLoanTypes.forEach((cat) => delete n[cat]);
      return n;
    });

    // Mark section as done
    const existing = getDoc("loans_section");
    if (existing) {
      await supabase
        .from("client_documents")
        .update({ marked_done: true })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("client_documents")
        .insert([{
          client_id: session.id,
          category: "loans_section",
          label: "מסמכי הלוואות",
          files: [],
          marked_done: true,
        }]);
    }
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
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
    return (
      <div
        style={{
          fontSize: 14,
          color: "var(--text-mid)",
          background: "rgba(46,125,82,0.07)",
          borderRadius: 6,
          padding: "6px 12px",
          marginBottom: 6,
          borderRight: "3px solid var(--green-mid)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <DocIcon name="pin" color="var(--green-mid)" size={14} />
        {note}
      </div>
    );
  };

  const SectionHeader = ({
    id,
    icon,
    label,
    required = false,
    progressText = null,
    done,
    partial,
    confirmed = false,
    onClick,
    onInfo = null,
  }) => {
    const isExp = expanded === id;
    const statusLabel = confirmed
      ? "עריכה"
      : done
        ? "הושלם"
        : partial
          ? "בתהליך"
          : "להעלאה";
    const statusSt = confirmed
      ? {
          color: "var(--gold)",
          background: "var(--gold-light)",
          border: "1px solid var(--gold-light)",
        }
      : done
        ? {
            color: "var(--green-deep)",
            background: "var(--green-mint)",
            border: "1px solid var(--green-mint)",
          }
        : partial
          ? {
              color: "var(--gold)",
              background: "var(--gold-light)",
              border: "1px solid var(--gold-light)",
            }
          : {
              color: "var(--text-dim)",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
            };
    const borderColor = confirmed
      ? "rgba(183,146,76,0.2)"
      : done
        ? "rgba(45,106,79,0.2)"
        : partial
          ? "rgba(183,146,76,0.2)"
          : "var(--border)";
    const sublabel = [required && "חובה", progressText]
      .filter(Boolean)
      .join(" • ");
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        onMouseEnter={(e) => {
          if (!isExp) {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow = "0 4px 16px rgba(0,0,0,0.07)";
            el.style.transform = "translateY(-1px)";
            el.style.borderColor = confirmed
              ? "rgba(183,146,76,0.35)"
              : "rgba(45,106,79,0.25)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isExp) {
            const el = e.currentTarget as HTMLElement;
            el.style.boxShadow = "none";
            el.style.transform = "none";
            el.style.borderColor = borderColor;
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          background: "var(--surface)",
          border: `1px solid ${borderColor}`,
          borderRadius: isExp ? "12px 12px 0 0" : 12,
          cursor: "pointer",
          userSelect: "none" as const,
          transition: "box-shadow 0.18s, transform 0.18s, border-color 0.18s",
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: "var(--green-pale)",
            color: "var(--green-mid)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {label}
          </div>
          {sublabel && (
            <div
              style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}
            >
              {sublabel}
            </div>
          )}
        </div>
        {onInfo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onInfo();
            }}
            title="צפה שוב בהדרכה"
            aria-label="צפה שוב בהדרכה"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-dim)",
              padding: "4px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--green-mid)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = "var(--text-dim)";
            }}
          >
            <DocIcon name="play-circle" size={15} color="currentColor" />
          </button>
        )}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 99,
            flexShrink: 0,
            ...statusSt,
          }}
        >
          {statusLabel}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            color: "var(--text-dim)",
            flexShrink: 0,
            transform: isExp ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    );
  };

  const DoneLine = ({ done }) => null;

  const openFile = async (path) => {
    if (!path) return;
    const { data } = await supabase.storage
      .from("client-documents")
      .createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const FileList = ({ cat }) => {
    const saved = getDoc(cat)?.files || [];
    const pend = pendingFiles[cat] || [];
    if (!saved.length && !pend.length) return null;
    return (
      <div style={{ marginTop: 8, marginBottom: 4 }}>
        {saved.map((f, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 14,
              color: "var(--text)",
              padding: "3px 0",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <DocIcon name="paperclip" color={f.path ? "var(--text-dim)" : "#D97706"} size={14} />
              {f.filename}
              {!f.path && (
                <span style={{ fontSize: 10, color: "#D97706", fontWeight: 600, background: "rgba(217,119,6,0.1)", borderRadius: 3, padding: "1px 5px" }}>יש להעלות מחדש</span>
              )}
            </span>
            {f.path && (
              <button
                onClick={() => openFile(f.path)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--green-mid)",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "0 2px",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                title="צפה"
              >
                <DocIcon name="eye" color="var(--green-mid)" size={13} />
              </button>
            )}
            <button
              onClick={() => deleteFile(cat, i)}
              style={{
                background: "none",
                border: "none",
                color: "var(--red)",
                cursor: "pointer",
                fontSize: 13,
                padding: "0 2px",
              }}
              title="מחק"
            >
              ×
            </button>
          </div>
        ))}
        {pend.map((f, i) => (
          <div
            key={i}
            style={{
              fontSize: 14,
              color: "var(--green-mid)",
              padding: "3px 0",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <DocIcon name="paperclip" color="var(--green-mid)" size={14} />
            <span style={{ flex: 1 }}>{f.name}{" "}
            <span style={{ color: "var(--text-dim)" }}>(ממתין לשמירה)</span></span>
            <button
              onClick={() => removePendingFile(cat, i)}
              style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 13, padding: "0 2px" }}
              title="הסר"
            >×</button>
          </div>
        ))}
      </div>
    );
  };

  const UploadArea = ({
    cat,
    accept = ".pdf,.jpg,.jpeg,.png",
    label = "הוסף קובץ",
    done = false,
  }: {
    cat: string;
    accept?: string;
    label?: string;
    done?: boolean;
  }) => (
    <div>
      <input
        ref={(el) => (fileRefs.current[cat] = el)}
        type="file"
        multiple
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => onFileChange(cat, e)}
      />
      <FileList cat={cat} />
      {!done && (
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => pickFile(cat)}
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <DocIcon name="paperclip" color="var(--green-deep)" size={15} />
          {label}
        </Btn>
      )}
    </div>
  );

  const fldStyle = {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    color: "var(--text)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };
  const bodyStyle = {
    border: "1px solid var(--border)",
    borderTop: "none",
    borderRadius: "0 0 12px 12px",
    padding: "16px 18px",
    background: "var(--surface)",
    marginBottom: 2,
    animation: "accordionIn 0.18s ease-out",
  };
  const descStyle = {
    fontSize: 15,
    color: "var(--text)",
    opacity: 0.8,
    marginBottom: 12,
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <style>{`@keyframes accordionIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }`}</style>
      {uploadError && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 13, color: "#991B1B" }}>
          <span>⚠ {uploadError}</span>
          <button onClick={() => setUploadError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#991B1B", fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      {/* Edit month modal */}
      {editMonthEntry && (
        <>
          <div
            onClick={() => setEditMonthEntry(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: "var(--z-back)",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 28,
              zIndex: "var(--z-modal)",
              width: 300,
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 18,
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <DocIcon name="pencil" color="var(--green-deep)" />
              ערוך חודש
            </div>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-mid)",
                  marginBottom: 5,
                  fontWeight: 600,
                }}
              >
                חודש
              </div>
              <CustomSelect
                value={editMonthVal.month}
                onChange={(v) => {
                  setEditMonthVal((p) => ({ ...p, month: Number(v) }));
                  setEditMonthErr("");
                }}
                options={HEBREW_MONTHS.map((m, i) => ({ value: i, label: m }))}
                dropdownZIndex={9010}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-mid)",
                  marginBottom: 5,
                  fontWeight: 600,
                }}
              >
                שנה
              </div>
              <CustomSelect
                value={editMonthVal.year}
                onChange={(v) => {
                  setEditMonthVal((p) => ({ ...p, year: Number(v) }));
                  setEditMonthErr("");
                }}
                options={[2023, 2024, 2025, 2026, 2027].map((y) => ({
                  value: y,
                  label: String(y),
                }))}
                dropdownZIndex={9010}
                style={{ width: "100%" }}
              />
            </div>
            {editMonthErr && (
              <div
                style={{ fontSize: 14, color: "var(--red)", marginBottom: 10 }}
              >
                {editMonthErr}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <Btn
                onClick={saveEditMonth}
                disabled={editMonthSaving}
                style={{ flex: 1, justifyContent: "center" }}
              >
                {editMonthSaving ? "שומר..." : "שמור"}
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => setEditMonthEntry(null)}
                style={{ flex: 1, justifyContent: "center" }}
              >
                ביטול
              </Btn>
            </div>
          </div>
        </>
      )}

      {/* Page title */}
      <h1
        style={{
          fontFamily: "'Frank Ruhl Libre', serif",
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text)",
          textAlign: "center",
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        חומרי בסיס
      </h1>
      <div
        style={{ height: 1, background: "var(--border)", marginBottom: 20 }}
      />

      {/* Progress card */}
      <div
        style={{
          marginBottom: 20,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "12px 16px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 14, color: "var(--text-dim)" }}>
            התקדמות כללית
          </span>
          <span
            style={{
              fontFamily: "'Frank Ruhl Libre', serif",
              fontSize: 24,
              fontWeight: 700,
              color: "var(--green-deep)",
              lineHeight: 1,
            }}
          >
            {progressPct}%
          </span>
        </div>
        <div
          style={{
            height: 8,
            background: "var(--surface2)",
            borderRadius: 99,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background:
                "linear-gradient(90deg,var(--green-soft),var(--green-mid))",
              borderRadius: 99,
              transition: "width .4s",
            }}
          />
        </div>
      </div>

      <div
        style={{
          fontWeight: 700,
          fontSize: 18,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--green-deep)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        </svg>
        מסמכים נדרשים
      </div>

      {/* 1. פירוט תנועות */}
      <div style={{ marginBottom: 8 }}>
        <SectionHeader
          id="txs"
          icon={<DocIcon name="folder" />}
          label="פירוט תנועות — 3 חודשים"
          required
          progressText={`${finalizedMonths.length} מתוך 3 הועלו`}
          done={txsDone}
          partial={finalizedMonths.length > 0 && !txsDone}
          onClick={() => toggle("txs")}
        />
        <DoneLine done={txsDone} />
        {expanded === "txs" && (
          <div style={bodyStyle}>
            {finalizedMonths.map((m) => {
              const monthSubs = submissions.filter(
                (s) => s.month_key === m.month_key,
              );
              const txCount = monthSubs.reduce(
                (n, s) => n + (s.transactions || []).length,
                0,
              );
              const txTotal = monthSubs.reduce(
                (sum, s) =>
                  sum +
                  (s.transactions || []).reduce(
                    (a, t) => a + Number(t.amount || 0),
                    0,
                  ),
                0,
              );
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green-mid)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: 14,
                      color: "var(--text)",
                    }}
                  >
                    {m.label}
                  </span>
                  {txCount > 0 && (
                    <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                      · {txCount} תנועות ·{" "}
                      <span style={{ color: "var(--red)", fontWeight: 600 }}>
                        ₪{Math.round(txTotal).toLocaleString()}
                      </span>
                    </span>
                  )}
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setExpanded(null);
                      onOpenExistingMonth && onOpenExistingMonth(m);
                    }}
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      marginRight: "auto",
                    }}
                  >
                    פתח ←
                  </Btn>
                </div>
              );
            })}
            {(inProgressMonths || []).map((m) => (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  fontSize: 15,
                  color: "var(--text-mid)",
                  padding: "4px 0",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#F0A500",
                    display: "inline-block",
                    flexShrink: 0,
                  }}
                />
                {m.label}
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setExpanded(null);
                    onOpenExistingMonth && onOpenExistingMonth(m);
                  }}
                  style={{ fontSize: 12, padding: "3px 10px" }}
                >
                  המשך ←
                </Btn>
              </div>
            ))}
            <div style={{ ...descStyle, marginTop: 6 }}>
              {txsDone
                ? "3 חודשי פירוט הושלמו ✓"
                : `הושלמו ${finalizedMonths.length} מתוך 3 חודשים`}
            </div>
            {!txsDone && (
              <Btn
                size="sm"
                onClick={() => {
                  setExpanded(null);
                  onNavigateTxs();
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <DocIcon name="folder" color="#fff" /> הוסף חודש ←
              </Btn>
            )}
          </div>
        )}
      </div>

      {/* 1b. תנועות עו"ש */}
      {(() => {
        const acctNums = Array.from(
          { length: bankAccountCount },
          (_, i) => i + 1,
        );
        const bankAllDone = acctNums.every(
          (n) =>
            (bankSubs as any[]).filter((s) => (s.account_index || 1) === n)
              .length >= 3,
        );
        const bankAllLabeled = acctNums.every(
          (n) => !!(bankLabelDrafts[n] || "").trim(),
        );
        const bankSectionDone = isDone("bank_stmt_meta");
        const bankCanFinish = bankAllDone && bankAllLabeled;
        const bankAnyUploaded = bankSubs.length > 0;
        const bankProgressText = bankAnyUploaded
          ? `${bankSubs.length} חודשים הועלו`
          : "";
        return (
          <div style={{ marginBottom: 8 }}>
            <SectionHeader
              id="bank_txs"
              icon={<DocIcon name="building" />}
              label='תנועות עו"ש'
              progressText={bankProgressText}
              done={bankSectionDone}
              partial={bankAnyUploaded && !bankSectionDone}
              onClick={() => toggle("bank_txs")}
            />
            <DoneLine done={bankSectionDone} />
            {expanded === "bank_txs" && !bankTutorialSeen && (
              <BankTutorial
                onDone={() => {
                  localStorage.setItem(`bank_tutorial_seen_${session.id}`, "1");
                  setBankTutorialSeen(true);
                }}
              />
            )}
            {expanded === "bank_txs" && bankTutorialSeen && (
              <div style={bodyStyle}>
                {/* כפתור "צפה שוב בהדרכה" */}
                <button
                  onClick={() => setBankTutorialSeen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    marginBottom: 16,
                    padding: "12px 14px",
                    background: "rgba(45,106,79,0.05)",
                    border: "1px solid rgba(82,183,136,0.22)",
                    borderRight: "3px solid var(--green-soft)",
                    borderRadius: 10,
                    cursor: "pointer",
                    direction: "rtl" as const,
                    transition: "background 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "rgba(45,106,79,0.1)";
                    el.style.boxShadow = "0 2px 8px rgba(45,106,79,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "rgba(45,106,79,0.05)";
                    el.style.boxShadow = "none";
                  }}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="var(--green-soft)"
                      strokeWidth="1.75"
                    />
                    <polygon
                      points="10 8 16 12 10 16 10 8"
                      fill="var(--green-mid)"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: 13,
                      color: "var(--green-mid)",
                      fontWeight: 500,
                    }}
                  >
                    לא בטוח איך להעלות? צפה שוב בהדרכה
                  </span>
                </button>

                {/* שאלת מספר חשבונות */}
                <div
                  style={{
                    marginBottom: 16,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <label
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    כמה חשבונות בנק יש לך?
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={bankAccountCount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const v = Math.max(
                        1,
                        Math.min(10, parseInt(e.target.value) || 1),
                      );
                      saveBankAccountCount(v as 1 | 2 | 3);
                    }}
                    style={{
                      width: 48,
                      padding: "6px 10px",
                      fontSize: 15,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: "1.5px solid var(--border)",
                      background: "var(--surface2)",
                      color: "var(--text)",
                      fontFamily: "inherit",
                      textAlign: "center",
                      outline: "none",
                    }}
                  />
                </div>

                {/* שורה לכל חשבון */}
                {bankSectionDone ? (
                  <Btn
                    onClick={() => undoDone("bank_stmt_meta")}
                    disabled={saving === "bank_stmt_meta"}
                    style={{
                      width: "100%",
                      background: "#FFF8E7",
                      border: "1px solid var(--gold)",
                      color: "var(--gold)",
                      marginBottom: 10,
                    }}
                  >
                    ערוך הגשה
                  </Btn>
                ) : null}

                {Array.from({ length: bankAccountCount }, (_, i) => i + 1).map(
                  (n) => {
                    const acctSubs = (bankSubs as any[]).filter(
                      (s) => (s.account_index || 1) === n,
                    );
                    const monthsDone = acctSubs.length;
                    const done3 = monthsDone >= 3;
                    return (
                      <div
                        key={n}
                        style={{ borderBottom: "1px solid var(--border)" }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 0",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              color: done3
                                ? "var(--green-mid)"
                                : "var(--text-dim)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {done3 ? "✓ 3 חודשים" : `${monthsDone}/3`}
                          </div>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                              שם בנק ותיאור{" "}
                              <span style={{ color: "#E53E3E" }}>*</span>
                            </div>
                            <input
                              type="text"
                              placeholder="שם בנק ותיאור"
                              value={bankLabelDrafts[n] || ""}
                              onChange={(e) => {
                                onBankLabelChange &&
                                  onBankLabelChange(n, e.target.value);
                                if (bankLabelError === n) setBankLabelError(null);
                              }}
                              onBlur={async (e) => {
                                const val = e.target.value.trim() || null;
                                const ids = (bankSubs as any[])
                                  .filter((s) => (s.account_index || 1) === n)
                                  .map((s: any) => s.id);
                                for (const id of ids)
                                  await supabase
                                    .from("bank_submissions")
                                    .update({ bank_label: val })
                                    .eq("id", id);
                              }}
                              style={{
                                width: "100%",
                                padding: "6px 10px",
                                fontSize: 13,
                                borderRadius: 8,
                                border: !(bankLabelDrafts[n] || "").trim()
                                  ? "1px solid #E53E3E"
                                  : "1px solid var(--border)",
                                background: "var(--surface2)",
                                fontFamily: "inherit",
                                outline: "none",
                                direction: "rtl",
                                color: "var(--text)",
                              }}
                            />
                          </div>
                          {done3 ? (
                            <div style={{ position: "relative" }}>
                              <Btn
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  setEditMenuAccount(
                                    editMenuAccount === n ? null : n,
                                  )
                                }
                              >
                                עריכה ←
                              </Btn>
                              {editMenuAccount === n && (
                                <div
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    top: "calc(100% + 6px)",
                                    background: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 10,
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                                    zIndex: 100,
                                    minWidth: 200,
                                    overflow: "hidden",
                                  }}
                                >
                                  <button
                                    onClick={() => {
                                      setEditMenuAccount(null);
                                      setExpanded(null);
                                      onNavigateBank && onNavigateBank(n);
                                    }}
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: "11px 16px",
                                      textAlign: "right",
                                      background: "none",
                                      border: "none",
                                      borderBottom: "1px solid var(--border)",
                                      cursor: "pointer",
                                      fontSize: 13,
                                      color: "var(--text)",
                                      fontFamily: "inherit",
                                    }}
                                    onMouseEnter={(e) =>
                                      (e.currentTarget.style.background =
                                        "var(--surface2)")
                                    }
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.background =
                                        "none")
                                    }
                                  >
                                    <div style={{ fontWeight: 600 }}>
                                      העלאת קובץ אחר
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: "var(--text-dim)",
                                        marginTop: 2,
                                      }}
                                    >
                                      להחליף את הקובץ שהועלה
                                    </div>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditMenuAccount(null);
                                      setExpanded(null);
                                      onNavigateBankEdit &&
                                        onNavigateBankEdit(n);
                                    }}
                                    style={{
                                      display: "block",
                                      width: "100%",
                                      padding: "11px 16px",
                                      textAlign: "right",
                                      background: "none",
                                      border: "none",
                                      cursor: "pointer",
                                      fontSize: 13,
                                      color: "var(--text)",
                                      fontFamily: "inherit",
                                    }}
                                    onMouseEnter={(e) =>
                                      (e.currentTarget.style.background =
                                        "var(--surface2)")
                                    }
                                    onMouseLeave={(e) =>
                                      (e.currentTarget.style.background =
                                        "none")
                                    }
                                  >
                                    <div style={{ fontWeight: 600 }}>
                                      עריכת ניתוח התנועות
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 11,
                                        color: "var(--text-dim)",
                                        marginTop: 2,
                                      }}
                                    >
                                      לשנות סיווגים ללא העלאה מחדש
                                    </div>
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <Btn
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                if (!(bankLabelDrafts[n] || "").trim()) {
                                  setBankLabelError(n);
                                  setTimeout(
                                    () => setBankLabelError(null),
                                    3000,
                                  );
                                  return;
                                }
                                setExpanded(null);
                                onNavigateBank && onNavigateBank(n);
                              }}
                            >
                              העלה ←
                            </Btn>
                          )}
                        </div>
                        {bankLabelError === n && (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--red, #e53e3e)",
                              padding: "0 0 8px",
                              textAlign: "right",
                            }}
                          >
                            יש למלא שם בנק ותיאור לפני העלאת הקובץ
                          </div>
                        )}
                      </div>
                    );
                  },
                )}

              {/* כפתור סיימתי */}
              {!bankSectionDone && (
                <Btn
                  onClick={markBankDone}
                  disabled={!bankCanFinish || saving === "bank_stmt_meta"}
                  style={{ width: "100%", marginTop: 12 }}
                >
                  סיימתי
                </Btn>
              )}
            </div>
          )}
        </div>
      );
      })()}

      {/* 3. תלושי שכר */}
      <div style={{ marginBottom: 8 }}>
        <SectionHeader
          id="pays"
          icon={<DocIcon name="payslip" />}
          label={
            hasSpouse2
              ? spouseNames.s1 && spouseNames.s2
                ? `תלושי שכר — ${spouseNames.s1} ו${spouseNames.s2}`
                : "תלושי שכר — 3 חודשים לכל אחד"
              : "תלושי שכר — 3 חודשים"
          }
          required
          progressText={`${payslips.length} מתוך ${hasSpouse2 ? 6 : 3} הועלו`}
          done={payslipsDone}
          partial={
            (s1Payslips.length > 0 ||
              s2Payslips.length > 0 ||
              !!noPayslipReasons.s1 ||
              !!noPayslipReasons.s2) &&
            !payslipsDone
          }
          onClick={() => toggle("pays")}
        />
        <DoneLine done={payslipsDone} />
        {expanded === "pays" && (
          <div style={bodyStyle}>
            {/* שורה לכל בן/בת זוג */}
            {[
              {
                idx: 1 as 1 | 2,
                name: spouseNames.s1,
                slips: s1Payslips,
                done: s1PayslipsDone,
                reason: noPayslipReasons.s1,
              },
              ...(hasSpouse2
                ? [
                    {
                      idx: 2 as 1 | 2,
                      name: spouseNames.s2,
                      slips: s2Payslips,
                      done: s2PayslipsDone,
                      reason: noPayslipReasons.s2,
                    },
                  ]
                : []),
            ].map(({ idx, name, slips, done, reason }) => (
              <div key={idx} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    marginBottom: 4,
                    color: "var(--text)",
                  }}
                >
                  {name ? `תלושי משכורת — ${name}` : "תלושי משכורת"}
                </div>
                {reason ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--text-mid)",
                        background: "var(--surface2)",
                        borderRadius: 6,
                        padding: "3px 10px",
                      }}
                    >
                      אין תלושים: {reason}
                    </span>
                    {cancelConfirmSpouse === idx ? (
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{ fontSize: 12, color: "var(--text-mid)" }}
                        >
                          לבטל את ההצהרה?
                        </span>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            onNoPayslipReasonSave(idx, "");
                            setCancelConfirmSpouse(null);
                          }}
                          style={{ fontSize: 12, color: "var(--red)" }}
                        >
                          כן, בטל
                        </Btn>
                        <Btn
                          size="sm"
                          variant="ghost"
                          onClick={() => setCancelConfirmSpouse(null)}
                          style={{ fontSize: 12 }}
                        >
                          שמור
                        </Btn>
                      </div>
                    ) : (
                      <button
                        onClick={() => setCancelConfirmSpouse(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-dim)",
                          cursor: "pointer",
                          fontSize: 12,
                        }}
                      >
                        × בטל
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {slips.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "5px 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--green-mid)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ flexShrink: 0 }}
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: "var(--text)",
                          }}
                        >
                          {p.month_label ||
                            p.label ||
                            new Date(p.created_at).toLocaleDateString("he-IL", {
                              month: "long",
                              year: "numeric",
                            })}
                        </span>
                        {p.filename && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--text-dim)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            · {p.filename}
                          </span>
                        )}
                      </div>
                    ))}
                    {slips.length > 3 && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "var(--text-dim)",
                          padding: "2px 0",
                        }}
                      >
                        ועוד {slips.length - 3} תלושים
                      </div>
                    )}
                    <div style={{ ...descStyle, marginTop: 2 }}>
                      {done
                        ? "3 תלושים הועלו ✓"
                        : `הועלו ${slips.length} מתוך 3`}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {done ? (
                          <Btn
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setExpanded(null);
                              onNavigatePayslips(idx);
                            }}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            עריכה ←
                          </Btn>
                        ) : (
                          <>
                            <Btn
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setExpanded(null);
                                onNavigatePayslips(idx);
                              }}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                              }}
                            >
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="var(--green-deep)"
                                strokeWidth="2.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="16 16 12 12 8 16" />
                                <line x1="12" y1="12" x2="12" y2="21" />
                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                              </svg>
                              העלה תלוש ←
                            </Btn>
                            {noPayslipInput?.spouse !== idx && (
                              <Btn
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setNoPayslipInput({ spouse: idx, val: "" })
                                }
                                style={{
                                  fontSize: 13,
                                  color: "var(--text-dim)",
                                }}
                              >
                                אין לי תלושים
                              </Btn>
                            )}
                          </>
                        )}
                      </div>
                      {noPayslipInput?.spouse === idx && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: "14px 14px",
                            background: "var(--surface2)",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text-mid)",
                              marginBottom: 8,
                              fontWeight: 600,
                            }}
                          >
                            נא לפרט את הסיבה:
                          </div>
                          <textarea
                            autoFocus
                            value={noPayslipInput.val}
                            onChange={(e) =>
                              setNoPayslipInput({
                                spouse: idx,
                                val: e.target.value,
                              })
                            }
                            placeholder="למשל: אני עצמאי / חל הוראה מתקנת / יצאתי לחופשת לידה..."
                            rows={3}
                            maxLength={400}
                            style={{
                              width: "100%",
                              fontSize: 14,
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              fontFamily: "inherit",
                              resize: "vertical",
                              boxSizing: "border-box",
                              direction: "rtl",
                              outline: "none",
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginTop: 10,
                              justifyContent: "flex-end",
                            }}
                          >
                            <Btn
                              size="sm"
                              variant="ghost"
                              onClick={() => setNoPayslipInput(null)}
                            >
                              ביטול
                            </Btn>
                            <Btn
                              size="sm"
                              onClick={() => {
                                if (noPayslipInput.val.trim()) {
                                  onNoPayslipReasonSave(
                                    idx,
                                    noPayslipInput.val.trim(),
                                  );
                                  setNoPayslipInput(null);
                                }
                              }}
                              disabled={!noPayslipInput.val.trim()}
                            >
                              שמור
                            </Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. פירוט חשבון חשמל */}
      <div style={{ marginBottom: 8 }}>
        <SectionHeader
          id="electricity"
          icon={<DocIcon name="doc" />}
          label="פירוט חשבון חשמל שנתי"
          required
          done={electricityDone}
          partial={electricityPartial}
          onClick={() => toggle("electricity")}
        />
        <DoneLine done={electricityDone} />
        {expanded === "electricity" &&
          (() => {
            const isElecLocked = electricityDone && electricityConfirmed;
            return (
              <div style={bodyStyle}>
                <div style={descStyle}>
                  הזן את חשבונות החשמל שלך לשנה האחרונה. לכל חשבון ציין את הסכום
                  וכמה חודשים הוא מכסה.
                </div>
                {electricityBills.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      marginBottom: 12,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        background: "var(--surface2)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        minWidth: 90,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-dim)",
                          marginBottom: 2,
                        }}
                      >
                        חודשים שמולאו
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700 }}>
                        {elecTotalMonths}
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--text-dim)",
                            marginRight: 2,
                          }}
                        >
                          /12
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        flex: 1,
                        background: "var(--surface2)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        minWidth: 90,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text-dim)",
                          marginBottom: 2,
                        }}
                      >
                        חודשים שנותרו
                      </div>
                      <div
                        style={{
                          fontSize: 20,
                          fontWeight: 700,
                          color:
                            elecTotalMonths >= 12
                              ? "var(--green)"
                              : "var(--text)",
                        }}
                      >
                        {Math.max(0, 12 - elecTotalMonths)}
                      </div>
                    </div>
                    {elecTotalMonths > 0 && (
                      <div
                        style={{
                          flex: 1,
                          background: "var(--surface2)",
                          borderRadius: 8,
                          padding: "8px 12px",
                          minWidth: 90,
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-dim)",
                            marginBottom: 2,
                          }}
                        >
                          ממוצע חודשי
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700 }}>
                          ₪
                          {Math.round(
                            electricityBills.reduce(
                              (s, r) => s + (parseFloat(r.amount) || 0),
                              0,
                            ) / elecTotalMonths,
                          ).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {electricityBills.length > 0 &&
                  (() => {
                    let cumulative = 0;
                    const rowErrors: (number | null)[] = electricityBills.map(
                      (row) => {
                        const remaining = 12 - cumulative;
                        const months = row.months || 0;
                        const err =
                          months > 0 && months > remaining ? remaining : null;
                        cumulative += months;
                        return err;
                      },
                    );
                    return (
                      <table
                        style={{
                          width: "100%",
                          borderCollapse: "separate",
                          borderSpacing: "0 4px",
                          marginBottom: 8,
                        }}
                      >
                        <thead>
                          <tr
                            style={{ fontSize: 13, color: "var(--text-dim)" }}
                          >
                            <th
                              style={{
                                textAlign: "right",
                                paddingBottom: 4,
                                fontWeight: 500,
                              }}
                            >
                              סכום (₪)
                            </th>
                            <th
                              style={{
                                textAlign: "right",
                                paddingBottom: 4,
                                fontWeight: 500,
                                paddingRight: 8,
                              }}
                            >
                              מספר חודשים
                            </th>
                            {!isElecLocked && <th style={{ width: 32 }} />}
                          </tr>
                        </thead>
                        <tbody>
                          {electricityBills.map((row, i) => {
                            const hasError = rowErrors[i] !== null;
                            const maxForRow = rowErrors[i] as number;
                            return (
                              <>
                                <tr key={i}>
                                  <td style={{ paddingLeft: 8 }}>
                                    <input
                                      type="number"
                                      value={row.amount}
                                      disabled={isElecLocked}
                                      onChange={(e) =>
                                        onElectricityChange(
                                          electricityBills.map((r, idx) =>
                                            idx === i
                                              ? { ...r, amount: e.target.value }
                                              : r,
                                          ),
                                        )
                                      }
                                      style={{
                                        padding: "6px 8px",
                                        background: "var(--surface2)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 6,
                                        color: isElecLocked
                                          ? "var(--text-dim)"
                                          : "var(--text)",
                                        fontSize: 15,
                                        fontFamily: "inherit",
                                        width: "100%",
                                      }}
                                      placeholder="0"
                                      min="0"
                                    />
                                  </td>
                                  <td style={{ paddingRight: 8, width: 140 }}>
                                    <input
                                      type="number"
                                      value={row.months || ""}
                                      disabled={isElecLocked}
                                      onChange={(e) =>
                                        onElectricityChange(
                                          electricityBills.map((r, idx) =>
                                            idx === i
                                              ? {
                                                  ...r,
                                                  months:
                                                    parseInt(e.target.value) ||
                                                    0,
                                                }
                                              : r,
                                          ),
                                        )
                                      }
                                      style={{
                                        padding: "6px 8px",
                                        background: "var(--surface2)",
                                        border: `1px solid ${hasError && !isElecLocked ? "var(--red)" : "var(--border)"}`,
                                        borderRadius: 6,
                                        color: isElecLocked
                                          ? "var(--text-dim)"
                                          : hasError
                                            ? "var(--red)"
                                            : "var(--text)",
                                        fontSize: 15,
                                        fontFamily: "inherit",
                                        width: "100%",
                                      }}
                                      placeholder="חודשים"
                                      min="1"
                                    />
                                  </td>
                                  {!isElecLocked && (
                                    <td
                                      style={{ width: 32, textAlign: "center" }}
                                    >
                                      <button
                                        onClick={() =>
                                          onElectricityChange(
                                            electricityBills.filter(
                                              (_, idx) => idx !== i,
                                            ),
                                          )
                                        }
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: "var(--red)",
                                          cursor: "pointer",
                                          fontSize: 18,
                                          padding: "0 4px",
                                        }}
                                      >
                                        ×
                                      </button>
                                    </td>
                                  )}
                                </tr>
                                {hasError && !isElecLocked && (
                                  <tr key={`err-${i}`}>
                                    <td
                                      colSpan={3}
                                      style={{ paddingBottom: 6 }}
                                    >
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 6,
                                          color: "var(--red)",
                                          fontSize: 13,
                                          padding: "6px 12px",
                                          background: "rgba(239,68,68,0.07)",
                                          borderRadius: 8,
                                          border:
                                            "1px solid rgba(239,68,68,0.25)",
                                        }}
                                      >
                                        <svg
                                          width="16"
                                          height="16"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          style={{ flexShrink: 0 }}
                                        >
                                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                          <line
                                            x1="12"
                                            y1="9"
                                            x2="12"
                                            y2="13"
                                          />
                                          <line
                                            x1="12"
                                            y1="17"
                                            x2="12.01"
                                            y2="17"
                                          />
                                        </svg>
                                        <span>
                                          חרגת — נשאר
                                          {maxForRow === 1 ? "" : "ו"} רק{" "}
                                          <strong>{maxForRow}</strong> חודש
                                          {maxForRow === 1 ? "" : "ים"} פנוי
                                          {maxForRow === 1 ? "" : "ים"}. הזן{" "}
                                          {maxForRow} לכל היותר.
                                        </span>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                {!isElecLocked && !electricityDone && (
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onElectricityChange([
                        ...electricityBills,
                        { amount: "", months: 0 },
                      ])
                    }
                    style={{ marginTop: 4 }}
                  >
                    + הוסף חשבון
                  </Btn>
                )}
                {electricityDone && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      background: "rgba(34,197,94,0.1)",
                      borderRadius: 8,
                      color: "var(--green)",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    ✓ כיסית 12 חודשים — ממוצע חודשי: ₪
                    {Math.round(
                      electricityBills.reduce(
                        (s, r) => s + (parseFloat(r.amount) || 0),
                        0,
                      ) / 12,
                    ).toLocaleString()}
                  </div>
                )}
                {isElecLocked ? (
                  <Btn
                    onClick={() => onElecConfirmed && onElecConfirmed(false)}
                    style={{
                      marginTop: 12,
                      width: "100%",
                      background: "#FFF8E7",
                      border: "1px solid #F0C040",
                      color: "#A67C00",
                    }}
                  >
                    ערוך הגשה
                  </Btn>
                ) : (
                  <button
                    disabled={!electricityDone}
                    onClick={async () => {
                      await onElectricitySaveNow(electricityBills);
                      onElecConfirmed && onElecConfirmed(true);
                      toggle("electricity");
                    }}
                    style={{
                      marginTop: 12,
                      display: "block",
                      margin: "12px auto 0",
                      padding: "8px 28px",
                      background: "var(--green-mint)",
                      border: "1px solid var(--green-mid)",
                      borderRadius: 8,
                      color: "var(--green-deep)",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: electricityDone ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                      opacity: electricityDone ? 1 : 0.45,
                      transition: "opacity 0.15s",
                    }}
                  >
                    סיימתי
                  </button>
                )}
              </div>
            );
          })()}
      </div>

      {/* 5. הלוואות */}
      {visibleOptional.includes("loans") && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader
            id="loans"
            icon={<DocIcon name="clipboard" />}
            label="מסמכי הלוואות"
            done={loansDone}
            partial={loansHasAny && !loansDone}
            onClick={() => toggle("loans")}
          />
          <NoteBar docKey="loans" />
          <DoneLine done={loansDone} />
          {expanded === "loans" && (
            <div style={bodyStyle}>
              {/* כרטיסיות קובץ בגריד קומפקטי */}
              {activeLoanTypes.some((c) => {
                const lt = getLoanType(c);
                return lt && lt.type === "file";
              }) && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  {activeLoanTypes.map((cat) => {
                    const lt = getLoanType(cat);
                    if (!lt || lt.type !== "file") return null;
                    const saved = getDoc(cat)?.files || [];
                    const isUploading = loanUploading.has(cat);
                    return (
                      <div
                        key={cat}
                        style={{
                          padding: "10px 12px",
                          background: "var(--surface2)",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 0,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            marginBottom: 6,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <DocIcon name={lt.icon} size={14} />
                          <span style={{ flex: 1 }}>{lt.label}</span>
                          <button
                            onClick={() => removeLoan(cat)}
                            title="הסר הלוואה"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-dim)",
                              cursor: "pointer",
                              fontSize: 15,
                              lineHeight: 1,
                              padding: "0 2px",
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                        {/* fields: bank name only (mortgage) OR balance + description (other file loans) */}
                        {lt.bankNameField ? (
                          <div style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 3 }}>
                              שם בנק / מוסד <span style={{ color: "#E53E3E" }}>*</span>
                            </div>
                            <input
                              type="text"
                              dir="rtl"
                              value={loanFileExtra[cat]?.bank_name || ""}
                              placeholder="למשל: בנק לאומי"
                              disabled={loansDone}
                              style={{ width:"100%", padding:"5px 8px", fontSize:12, borderRadius:6,
                                border: `1px solid ${(!loanFileExtra[cat]?.bank_name && !loansDone) ? "#E53E3E" : "var(--border)"}`,
                                background: loansDone ? "var(--surface2)" : "var(--surface)",
                                color: loansDone ? "var(--text-dim)" : "var(--text)", fontFamily:"inherit",
                                boxSizing:"border-box" as const, outline:"none" }}
                              onChange={e => {
                                setLoanFileExtra(p => ({ ...p, [cat]: { ...p[cat], bank_name: e.target.value } }));
                              }}
                            />
                          </div>
                        ) : (
                          <>
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 3 }}>
                                יתרה לתשלום (₪) <span style={{ color: "#E53E3E" }}>*</span>
                              </div>
                              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                <input
                                  type="text"
                                  dir="ltr"
                                  value={loanFileExtra[cat]?.balance ? Number(loanFileExtra[cat].balance).toLocaleString() : ""}
                                  placeholder="0"
                                  disabled={loansDone}
                                  style={{ flex:1, padding:"5px 8px", fontSize:12, borderRadius:6,
                                    border: `1px solid ${(!loanFileExtra[cat]?.balance && !loansDone) ? "#E53E3E" : "var(--border)"}`,
                                    background: loansDone ? "var(--surface2)" : "var(--surface)",
                                    color: loansDone ? "var(--text-dim)" : "var(--text)", fontFamily:"inherit",
                                    boxSizing:"border-box" as const, outline:"none" }}
                                  onChange={e => {
                                    const raw = e.target.value.replace(/\D/g, "");
                                    setLoanFileExtra(p => ({ ...p, [cat]: { ...p[cat], balance: raw } }));
                                  }}
                                />
                                <span style={{ fontSize:12, color:"var(--text-dim)", flexShrink:0 }}>₪</span>
                              </div>
                            </div>
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 3 }}>
                                תיאור <span style={{ color: "#E53E3E" }}>*</span>
                              </div>
                              <input
                                type="text"
                                dir="rtl"
                                value={loanFileExtra[cat]?.description || ""}
                                placeholder="תיאור קצר של ההלוואה"
                                disabled={loansDone}
                                style={{ width:"100%", padding:"5px 8px", fontSize:12, borderRadius:6,
                                  border: `1px solid ${(!loanFileExtra[cat]?.description && !loansDone) ? "#E53E3E" : "var(--border)"}`,
                                  background: loansDone ? "var(--surface2)" : "var(--surface)",
                                  color: loansDone ? "var(--text-dim)" : "var(--text)", fontFamily:"inherit",
                                  boxSizing:"border-box" as const, outline:"none" }}
                                onChange={e => {
                                  setLoanFileExtra(p => ({ ...p, [cat]: { ...p[cat], description: e.target.value } }));
                                }}
                              />
                            </div>
                          </>
                        )}
                        {lt.fileLabel && saved.length === 0 && !isUploading && (
                          <div style={{ display:"flex", justifyContent:"center", marginBottom:6 }}>
                            <span style={{ fontSize:10, fontWeight:600, color:"#C53030", background:"rgba(197,48,48,0.09)", border:"1px solid rgba(197,48,48,0.22)", borderRadius:4, padding:"2px 8px" }}>נדרש קובץ</span>
                          </div>
                        )}
                        <input
                          ref={(el) => (fileRefs.current[cat] = el)}
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png"
                          style={{ display: "none" }}
                          onChange={(e) => onLoanFileChange(cat, e)}
                        />
                        {isUploading && (
                          <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>מעלה...</div>
                        )}
                        {saved.map((f, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:"var(--text)", padding:"2px 0" }}>
                            <DocIcon name="paperclip" color={f.path ? "var(--text-dim)" : "#D97706"} size={12} />
                            <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {f.filename}
                              {!f.path && <span style={{ fontSize:9, color:"#D97706", fontWeight:600, background:"rgba(217,119,6,0.1)", borderRadius:3, padding:"1px 4px", marginRight:4 }}>יש להעלות מחדש</span>}
                            </span>
                            {f.path && (
                              <button onClick={() => openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize:12, display:"inline-flex", alignItems:"center", flexShrink:0 }}>
                                <DocIcon name="eye" color="var(--green-mid)" size={12} />
                              </button>
                            )}
                            {!loansDone && (
                              <button onClick={() => handleLoanFileEdit(cat, i)} title="החלף קובץ" style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", display:"inline-flex", alignItems:"center", flexShrink:0 }}>
                                <DocIcon name="pencil" color="var(--text-dim)" size={11} />
                              </button>
                            )}
                          </div>
                        ))}
                        {!loansDone && (
                          <div style={{ marginTop: 8 }}>
                            <Btn size="sm" variant="secondary" onClick={() => pickFile(cat)} style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:12 }} disabled={isUploading}>
                              <DocIcon name="paperclip" color="var(--green-deep)" size={13} />
                              {saved.length > 0 ? "הוסף קובץ נוסף" : "העלה קובץ"}
                            </Btn>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* כרטיסיות טופס — גריד 2 עמודות */}
              {activeLoanTypes.some((c) => {
                const lt = getLoanType(c);
                return lt && lt.type !== "file";
              }) && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  {activeLoanTypes.map((cat) => {
                    const lt = getLoanType(cat);
                    if (!lt || lt.type === "file") return null;
                    const isFields = lt.type === "fields";
                    const isBoth = lt.type === "both";
                    const saved = getDoc(cat)?.files || [];
                    const isBothUploading = loanUploading.has(cat);
                    return (
                      <div
                        key={cat}
                        style={{
                          padding: "14px 16px",
                          background: "var(--surface2)",
                          borderRadius: 8,
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            marginBottom: 10,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <DocIcon name={lt.icon} size={14} />
                          <span style={{ flex: 1 }}>{lt.label}</span>
                          <button
                            onClick={() => removeLoan(cat)}
                            title="הסר הלוואה"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--text-dim)",
                              cursor: "pointer",
                              fontSize: 15,
                              lineHeight: 1,
                              padding: "0 2px",
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                        {(isFields || isBoth) && (
                          <LoanFieldForm
                            cat={cat}
                            fields={loanFields[cat]}
                            onChange={(c, k, v) =>
                              setLoanFields((prev) => ({
                                ...prev,
                                [c]: { ...(prev[c] || {}), [k]: v },
                              }))
                            }
                          />
                        )}
                        {isBoth && (
                          <>
                            <input
                              ref={(el) => (fileRefs.current[cat] = el)}
                              type="file"
                              multiple
                              accept=".pdf,.jpg,.jpeg,.png"
                              style={{ display: "none" }}
                              onChange={(e) => onLoanFileChange(cat, e)}
                            />
                            {isBothUploading && (
                              <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>מעלה...</div>
                            )}
                            {saved.map((f, i) => (
                              <div
                                key={i}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 12,
                                  color: "var(--text)",
                                  padding: "2px 0",
                                }}
                              >
                                <span style={{ display: "flex", alignItems: "center", gap: 3, flex: 1, minWidth: 0 }}>
                                  <DocIcon name="paperclip" color={f.path ? "var(--text-dim)" : "#D97706"} size={12} />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {f.filename}
                                    {!f.path && (
                                      <span style={{ fontSize: 9, color: "#D97706", fontWeight: 600, background: "rgba(217,119,6,0.1)", borderRadius: 3, padding: "1px 4px", marginRight: 4 }}>יש להעלות מחדש</span>
                                    )}
                                  </span>
                                </span>
                                {f.path && (
                                  <button onClick={() => openFile(f.path)} style={{ background: "none", border: "none", color: "var(--green-mid)", cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                                    <DocIcon name="eye" color="var(--green-mid)" size={12} />
                                  </button>
                                )}
                                <button onClick={() => handleLoanFileEdit(cat, i)} title="החלף קובץ" style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
                                  <DocIcon name="pencil" color="var(--text-dim)" size={11} />
                                </button>
                              </div>
                            ))}
                            <div style={{ marginTop: 4, marginBottom: 8 }}>
                              <Btn
                                size="sm"
                                variant="secondary"
                                onClick={() => pickFile(cat)}
                                disabled={isBothUploading}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}
                              >
                                <DocIcon name="paperclip" color="var(--green-deep)" size={13} />
                                קובץ (לא חובה)
                              </Btn>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {!loansDone &&
                (!showLoanPicker ? (
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowLoanPicker(true)}
                    style={{ marginBottom: 14 }}
                  >
                    + הוסף הלוואה
                  </Btn>
                ) : (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      background: "var(--surface2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        marginBottom: 10,
                      }}
                    >
                      בחר סוג הלוואה:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {LOAN_TYPES.map((lt) => (
                        <button
                          key={lt.id}
                          onClick={() => {
                            const existing = activeLoanTypes.filter(
                              (c) => c === lt.id || c.startsWith(lt.id + "_"),
                            );
                            const newKey =
                              existing.length === 0
                                ? lt.id
                                : `${lt.id}_${existing.length + 1}`;
                            setActiveLoanTypes((p) => [...p, newKey]);
                            setShowLoanPicker(false);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 20,
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <DocIcon
                            name={lt.icon}
                            color="var(--text-mid)"
                            size={16}
                          />
                          {lt.label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowLoanPicker(false)}
                      style={{
                        marginTop: 10,
                        fontSize: 15,
                        color: "var(--text-dim)",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      ביטול
                    </button>
                  </div>
                ))}
              {loansDone ? (
                <Btn
                  onClick={() => undoDone("loans_section")}
                  disabled={saving === "loans_section"}
                  style={{
                    width: "100%",
                    background: "#FFF8E7",
                    border: "1px solid #F0C040",
                    color: "#A67C00",
                  }}
                >
                  {saving === "loans_section" ? "מעדכן..." : "ערוך הגשה"}
                </Btn>
              ) : (
                <Btn
                  onClick={markLoansDone}
                  disabled={!loansHasAny || saving === "loans_section"}
                  style={{ width: "100%" }}
                >
                  {saving === "loans_section" ? "שומר..." : "סיימתי"}
                </Btn>
              )}
            </div>
          )}
        </div>
      )}

      {/* משכנתה */}
      {visibleOptional.includes("mortgage") && (() => {
        const mortDone = isDone("mortgage");
        const eyeSvg = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
        const xSvg = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
        const mortPartial = mortgageProps.some(p => p.banks.some(b => b.pendingFile || (getDoc("mortgage")?.files || []).some((f: any) => f.property_name === p.name && f.bank_name === b.bankName)));
        return (
          <div style={{ marginBottom: 8 }}>
            <SectionHeader
              id="mortgage"
              icon={<DocIcon name="home" />}
              label="משכנתה"
              done={mortDone}
              partial={mortPartial && !mortDone}
              onClick={() => toggle("mortgage")}
            />
            <NoteBar docKey="mortgage" />
            <DoneLine done={mortDone} />
            {expanded === "mortgage" && (
              <div style={bodyStyle}>
                {mortgageProps.map((prop, pi) => (
                  <div key={prop.id} style={{ marginBottom: 12, padding: "12px 14px", background: "var(--surface2)", borderRadius: 10, border: "1px solid var(--border)" }}>
                    {/* Property header */}
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <div style={{ fontSize:12, color:"var(--text-dim)", flexShrink:0 }}>שם הנכס <span style={{ color:"#E53E3E" }}>*</span></div>
                      <input
                        type="text"
                        value={prop.name}
                        disabled={mortDone}
                        placeholder="דירה ראשית / דירה להשקעה..."
                        onChange={e => setMortgageProps(prev => prev.map((p,i) => i===pi ? {...p, name: e.target.value} : p))}
                        style={{ flex:1, padding:"5px 10px", fontSize:13, borderRadius:6,
                          border:`1px solid ${!prop.name.trim()&&!mortDone?"#E53E3E":"var(--border)"}`,
                          background: mortDone?"var(--surface2)":"var(--surface)", color:"var(--text)", fontFamily:"inherit", outline:"none" }}
                      />
                      {!mortDone && (
                        <button onClick={() => setMortgageProps(prev => prev.filter((_,i) => i!==pi))}
                          style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:16, padding:"0 4px" }}>×</button>
                      )}
                    </div>
                    {/* Bank rows */}
                    {prop.banks.map((bank, bi) => {
                      const savedFile = (getDoc("mortgage")?.files || []).find(
                        (f: any) => f.property_name === prop.name && f.bank_name === bank.bankName
                      );
                      const refKey = `${pi}_${bi}`;
                      return (
                        <div key={bi} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, padding:"6px 10px", background:"var(--surface)", borderRadius:7, border:"1px solid var(--border)" }}>
                          <input
                            type="text"
                            value={bank.bankName}
                            disabled={mortDone}
                            placeholder="שם הבנק *"
                            onChange={e => setMortgageProps(prev => prev.map((p,pi2) => pi2!==pi ? p : { ...p, banks: p.banks.map((b,bi2) => bi2!==bi ? b : {...b, bankName: e.target.value}) }))}
                            style={{ width:140, padding:"5px 8px", fontSize:12, borderRadius:6,
                              border:`1px solid ${!bank.bankName.trim()&&!mortDone?"#E53E3E":"var(--border)"}`,
                              background: mortDone?"var(--surface2)":"var(--surface)", color:"var(--text)", fontFamily:"inherit", outline:"none" }}
                          />
                          {/* File display */}
                          <div style={{ flex:1, fontSize:12, color:"var(--text-dim)", display:"flex", alignItems:"center", gap:6 }}>
                            {savedFile && !bank.pendingFile && (
                              <>
                                <DocIcon name="paperclip" size={11} color="var(--green-mid)" />
                                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{savedFile.filename}</span>
                                {savedFile.path && <button onClick={() => openFile(savedFile.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer" }}>{eyeSvg}</button>}
                                {!mortDone && <button onClick={async () => {
                                  const existing = getDoc("mortgage");
                                  if (!existing) return;
                                  const newFiles = (existing.files || []).filter((f:any) => !(f.property_name === prop.name && f.bank_name === bank.bankName));
                                  await supabase.from("client_documents").update({ files: newFiles }).eq("id", existing.id);
                                  await onDocsChange();
                                }} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer" }}>{xSvg}</button>}
                              </>
                            )}
                            {bank.pendingFile && (
                              <>
                                <DocIcon name="paperclip" size={11} color="var(--green-mid)" />
                                <span style={{ flex:1 }}>{bank.pendingFile.name} <span style={{ color:"var(--text-dim)" }}>(ממתין)</span></span>
                                <button onClick={() => setMortgageProps(prev => prev.map((p,pi2) => pi2!==pi ? p : { ...p, banks: p.banks.map((b,bi2) => bi2!==bi ? b : {...b, pendingFile: null}) }))}
                                  style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer" }}>{xSvg}</button>
                              </>
                            )}
                            {!savedFile && !bank.pendingFile && !mortDone && (
                              <>
                                <input ref={el => mortFileRefs.current[refKey] = el} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }}
                                  onChange={e => {
                                    const file = e.target.files?.[0];
                                    if (file) setMortgageProps(prev => prev.map((p,pi2) => pi2!==pi ? p : { ...p, banks: p.banks.map((b,bi2) => bi2!==bi ? b : {...b, pendingFile: file}) }));
                                  }} />
                                <button onClick={() => mortFileRefs.current[refKey]?.click()}
                                  style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"3px 10px", fontSize:11, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4 }}>
                                  <DocIcon name="paperclip" color="var(--text-dim)" size={11} /> צרף קובץ
                                </button>
                                <span style={{ fontSize:11, color:"#E53E3E" }}>נדרש קובץ</span>
                              </>
                            )}
                          </div>
                          {!mortDone && (
                            <button onClick={() => setMortgageProps(prev => prev.map((p,pi2) => pi2!==pi ? p : { ...p, banks: p.banks.filter((_,bi2) => bi2!==bi) }))}
                              style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:14, padding:"0 2px", flexShrink:0 }}>×</button>
                          )}
                        </div>
                      );
                    })}
                    {!mortDone && (
                      <button onClick={() => setMortgageProps(prev => prev.map((p,i) => i!==pi ? p : { ...p, banks: [...p.banks, { bankName:"", pendingFile:null }] }))}
                        style={{ fontSize:12, color:"var(--green-mid)", background:"none", border:"none", cursor:"pointer", padding:"4px 0", fontFamily:"inherit" }}>
                        + הוסף משכנתה נוספת לנכס זה
                      </button>
                    )}
                  </div>
                ))}
                {!mortDone && (
                  <Btn size="sm" variant="secondary" onClick={() => setMortgageProps(prev => [...prev, { id: Math.random().toString(36).slice(2,8), name:"", banks:[] }])}
                    style={{ marginBottom:14 }}>
                    + הוסף נכס
                  </Btn>
                )}
                {mortDone ? (
                  <Btn onClick={() => undoDone("mortgage")} disabled={saving==="mortgage"}
                    style={{ width:"100%", background:"#FFF8E7", border:"1px solid #F0C040", color:"#A67C00" }}>
                    {saving==="mortgage" ? "מעדכן..." : "ערוך הגשה"}
                  </Btn>
                ) : (
                  <Btn onClick={saveMortgageDone} disabled={!mortgageReadyToSave() || saving==="mortgage"} style={{ width:"100%" }}>
                    {saving==="mortgage" ? "שומר..." : "סיימתי"}
                  </Btn>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 4. קרן השתלמות */}
      {visibleOptional.includes("provident") && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader
            id="provident"
            icon={<DocIcon name="coins" />}
            label="יתרת קרן השתלמות"
            done={providentAllDone}
            partial={providentAnyFiles && !providentAllDone}
            onClick={() => toggle("provident")}
          />
          <NoteBar docKey="provident" />
          <DoneLine done={providentAllDone} />
          {expanded === "provident" && (
            <div style={bodyStyle}>
              {/* כמה קרנות השתלמות */}
              <div
                style={{
                  marginBottom: providentReady ? 24 : 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  כמה קרנות השתלמות יש לכם?
                </span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={providentCount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= 8) {
                      setProvidentReady(true);
                      saveProvidentCount(v);
                    }
                  }}
                  style={{
                    width: 56,
                    padding: "6px 10px",
                    fontSize: 15,
                    fontWeight: 700,
                    textAlign: "center",
                    borderRadius: 8,
                    border: "1.5px solid var(--border)",
                    background: "var(--surface2)",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>

              {providentReady && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 12,
                  }}
                >
                  {Array.from({ length: providentCount }, (_, i) => i + 1).map(
                    (n) => {
                      const cat = `provident_fund_${n}`;
                      const done = isDone(cat);
                      const hasF = hasFiles(cat);
                      const raw = providentDescs[n - 1];
                      const raw_obj =
                        raw && typeof raw === "object" ? (raw as any) : {};
                      const ownerVal = (raw_obj.owner || "") as string;
                      const companyVal = (raw_obj.company || "") as string;
                      const ownerErr = !done && !ownerVal.trim();
                      const companyErr = !done && !companyVal.trim();
                      const baseInp: React.CSSProperties = {
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: 13,
                        borderRadius: 7,
                        background: done ? "var(--surface2)" : "var(--surface)",
                        color: done ? "var(--text-dim)" : "var(--text)",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                        outline: "none",
                      };
                      return (
                        <div
                          key={n}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: 14,
                            background: "var(--surface2)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: "var(--text)",
                            }}
                          >
                            קרן {n}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr",
                              gap: 8,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-dim)",
                                  marginBottom: 3,
                                }}
                              >
                                של מי הקרן?{" "}
                                <span style={{ color: "#E53E3E" }}>*</span>
                              </div>
                              <input
                                type="text"
                                value={ownerVal}
                                placeholder="אלון / שרה"
                                onChange={(e) =>
                                  saveProvidentField(
                                    n - 1,
                                    "owner",
                                    e.target.value,
                                  )
                                }
                                disabled={done}
                                style={{
                                  ...baseInp,
                                  border: ownerErr
                                    ? "1px solid #E53E3E"
                                    : "1px solid var(--border)",
                                }}
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-dim)",
                                  marginBottom: 3,
                                }}
                              >
                                חברת הביטוח{" "}
                                <span style={{ color: "#E53E3E" }}>*</span>
                              </div>
                              <input
                                type="text"
                                value={companyVal}
                                placeholder="הראל, מנורה..."
                                onChange={(e) =>
                                  saveProvidentField(
                                    n - 1,
                                    "company",
                                    e.target.value,
                                  )
                                }
                                disabled={done}
                                style={{
                                  ...baseInp,
                                  border: companyErr
                                    ? "1px solid #E53E3E"
                                    : "1px solid var(--border)",
                                }}
                              />
                            </div>
                          </div>
                          <UploadArea
                            cat={cat}
                            label="הוסף דוח יתרות"
                            done={done && hasF}
                          />
                        </div>
                      );
                    },
                  )}
                </div>
              )}
              {providentReady &&
                (showProvidentUndo ? (
                  <Btn
                    onClick={undoAllProvident}
                    disabled={saving === "provident_all"}
                    style={{
                      marginTop: 14,
                      width: "100%",
                      background: "#FFF8E7",
                      border: "1px solid #F0C040",
                      color: "#A67C00",
                    }}
                  >
                    {saving === "provident_all" ? "מעדכן..." : "ערוך הגשה"}
                  </Btn>
                ) : (
                  <Btn
                    onClick={saveAllProvident}
                    disabled={
                      saving === "provident_all" ||
                      !providentCats.every(hasFiles) ||
                      !providentFieldsComplete
                    }
                    style={{ marginTop: 14, width: "100%" }}
                  >
                    {saving === "provident_all" ? "שומר..." : "סיימתי"}
                  </Btn>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 5. דוח רווח והפסד */}
      {visibleOptional.includes("pl") && (
        <>
          {[
            {
              idx: 1,
              show: s1NeedsPL,
              name: spouseNames.s1,
              cat: "profit_loss_1",
            },
            {
              idx: 2,
              show: s2NeedsPL,
              name: spouseNames.s2,
              cat: "profit_loss_2",
            },
          ]
            .filter((sp) => sp.show)
            .map((sp) => (
              <div key={sp.idx} style={{ marginBottom: 8 }}>
                <SectionHeader
                  id={`pl_${sp.idx}`}
                  icon={<DocIcon name="bar-chart" />}
                  label="דוח רווח והפסד"
                  done={isDone(sp.cat)}
                  partial={hasFiles(sp.cat) && !isDone(sp.cat)}
                  onClick={() => toggle(`pl_${sp.idx}`)}
                />
                <NoteBar docKey="pl" />
                <DoneLine done={isDone(sp.cat)} />
                {expanded === `pl_${sp.idx}` && (
                  <div style={bodyStyle}>
                    {sp.name && (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--text)",
                          marginBottom: 6,
                        }}
                      >
                        {sp.name}
                      </div>
                    )}
                    <div style={descStyle}>
                      העלה דוח רווח והפסד שנתי + מאזן בוחן של שנה קודמת
                    </div>
                    <UploadArea cat={sp.cat} done={isDone(sp.cat)} />
                    {isDone(sp.cat) ? (
                      <Btn
                        onClick={() => undoDone(sp.cat)}
                        disabled={saving === sp.cat}
                        style={{
                          marginTop: 14,
                          width: "100%",
                          background: "#FFF8E7",
                          border: "1px solid #F0C040",
                          color: "#A67C00",
                        }}
                      >
                        {saving === sp.cat ? "מעדכן..." : "ערוך הגשה"}
                      </Btn>
                    ) : (
                      <Btn
                        onClick={() => saveAndDone(sp.cat, sp.name ? `דוח רווח והפסד — ${sp.name}` : "דוח רווח והפסד")}
                        disabled={!hasFiles(sp.cat) || saving === sp.cat}
                        style={{ marginTop: 14, width: "100%" }}
                      >
                        {saving === sp.cat ? "שומר..." : "סיימתי"}
                      </Btn>
                    )}
                  </div>
                )}
              </div>
            ))}
          {/* Fallback: employment_type לא הוגדר — שורה כללית */}
          {!s1NeedsPL && !s2NeedsPL && (
            <div style={{ marginBottom: 8 }}>
              <SectionHeader
                id="pl"
                icon={<DocIcon name="bar-chart" />}
                label="דוח רווח והפסד (לעצמאיים)"
                done={isDone("profit_loss")}
                partial={hasFiles("profit_loss") && !isDone("profit_loss")}
                onClick={() => toggle("pl")}
              />
              <NoteBar docKey="pl" />
              <DoneLine done={isDone("profit_loss")} />
              {expanded === "pl" && (
                <div style={bodyStyle}>
                  <div style={descStyle}>
                    רלוונטי לעצמאיים — העלה דוח רווח והפסד שנתי + מאזן בוחן של
                    שנה קודמת
                  </div>
                  <UploadArea cat="profit_loss" done={isDone("profit_loss")} />
                  {isDone("profit_loss") ? (
                    <Btn
                      onClick={() => undoDone("profit_loss")}
                      disabled={saving === "profit_loss"}
                      style={{
                        marginTop: 14,
                        width: "100%",
                        background: "#FFF8E7",
                        border: "1px solid #F0C040",
                        color: "#A67C00",
                      }}
                    >
                      {saving === "profit_loss" ? "מעדכן..." : "ערוך הגשה"}
                    </Btn>
                  ) : (
                    <Btn
                      onClick={() =>
                        saveAndDone("profit_loss", "דוח רווח והפסד")
                      }
                      disabled={
                        !hasFiles("profit_loss") || saving === "profit_loss"
                      }
                      style={{ marginTop: 14, width: "100%" }}
                    >
                      {saving === "profit_loss" ? "שומר..." : "סיימתי"}
                    </Btn>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 6. פנסיה */}
      {visibleOptional.includes("pension") && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader
            id="pension"
            icon={<DocIcon name="building" />}
            label="קרנות פנסיה"
            done={pensionAllDone}
            partial={pensionCats.some(hasFiles) && !pensionAllDone}
            onClick={() => toggle("pension")}
          />
          <NoteBar docKey="pension" />
          <DoneLine done={pensionAllDone} />
          {expanded === "pension" && (
            <div style={bodyStyle}>
              <div
                style={{
                  marginBottom: pensionReady ? 24 : 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--text)",
                  }}
                >
                  כמה קרנות פנסיה יש לכם?
                </span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={pensionCount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 1 && v <= 8) {
                      setPensionReady(true);
                      savePensionCount(v);
                    }
                  }}
                  style={{
                    width: 56,
                    padding: "6px 10px",
                    fontSize: 15,
                    fontWeight: 700,
                    textAlign: "center",
                    borderRadius: 8,
                    border: "1.5px solid var(--border)",
                    background: "var(--surface2)",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
              </div>
              {pensionReady && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: 12,
                  }}
                >
                  {Array.from({ length: pensionCount }, (_, i) => i + 1).map(
                    (n) => {
                      const cat = `pension_fund_${n}`;
                      const done = isDone(cat);
                      const hasF = hasFiles(cat);
                      const raw = pensionDescs[n - 1];
                      const pensRaw =
                        raw && typeof raw === "object" ? (raw as any) : {};
                      const ownV = (pensRaw.owner || "") as string;
                      const cmpV = (pensRaw.company || "") as string;
                      const ownErr = !done && !ownV.trim();
                      const cmpErr = !done && !cmpV.trim();
                      const pBase: React.CSSProperties = {
                        width: "100%",
                        padding: "6px 10px",
                        fontSize: 13,
                        borderRadius: 7,
                        background: done ? "var(--surface2)" : "var(--surface)",
                        color: done ? "var(--text-dim)" : "var(--text)",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                        outline: "none",
                      };
                      return (
                        <div
                          key={n}
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: 14,
                            background: "var(--surface2)",
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 700,
                              fontSize: 13,
                              color: "var(--text)",
                            }}
                          >
                            קרן {n}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr",
                              gap: 8,
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-dim)",
                                  marginBottom: 3,
                                }}
                              >
                                של מי הקרן?{" "}
                                <span style={{ color: "#E53E3E" }}>*</span>
                              </div>
                              <input
                                type="text"
                                value={ownV}
                                placeholder="אלון / שרה"
                                disabled={done}
                                style={{
                                  ...pBase,
                                  border: ownErr
                                    ? "1px solid #E53E3E"
                                    : "1px solid var(--border)",
                                }}
                                onChange={(e) =>
                                  savePensionField(
                                    n - 1,
                                    "owner",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-dim)",
                                  marginBottom: 3,
                                }}
                              >
                                חברת ביטוח / קרן{" "}
                                <span style={{ color: "#E53E3E" }}>*</span>
                              </div>
                              <input
                                type="text"
                                value={cmpV}
                                placeholder="הראל, מנורה..."
                                disabled={done}
                                style={{
                                  ...pBase,
                                  border: cmpErr
                                    ? "1px solid #E53E3E"
                                    : "1px solid var(--border)",
                                }}
                                onChange={(e) =>
                                  savePensionField(
                                    n - 1,
                                    "company",
                                    e.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>
                          <UploadArea
                            cat={cat}
                            label="הוסף דוח יתרות"
                            done={done && hasF}
                          />
                        </div>
                      );
                    },
                  )}
                </div>
              )}
              {pensionReady &&
                (showPensionUndo ? (
                  <Btn
                    onClick={undoAllPension}
                    disabled={saving === "pension_all"}
                    style={{
                      marginTop: 14,
                      width: "100%",
                      background: "#FFF8E7",
                      border: "1px solid #F0C040",
                      color: "#A67C00",
                    }}
                  >
                    {saving === "pension_all" ? "מעדכן..." : "ערוך הגשה"}
                  </Btn>
                ) : (
                  <Btn
                    onClick={saveAllPension}
                    disabled={
                      saving === "pension_all" ||
                      !pensionCats.every(hasFiles) ||
                      !pensionFieldsComplete
                    }
                    style={{ marginTop: 14, width: "100%" }}
                  >
                    {saving === "pension_all" ? "שומר..." : "סיימתי"}
                  </Btn>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 7. חסכונות כספיים */}
      {visibleOptional.includes("savings_cash") && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader
            id="savings_cash"
            icon={<DocIcon name="bank" />}
            label="חסכונות כספיים"
            done={
              isDone("savings_cash_section") && activeSavingsCash.length > 0
            }
            partial={
              activeSavingsCash.some((c) => hasFiles(c)) &&
              !isDone("savings_cash_section")
            }
            onClick={() => toggle("savings_cash")}
          />
          <NoteBar docKey="savings_cash" />
          <DoneLine done={isDone("savings_cash_section")} />
          {expanded === "savings_cash" && (
            <div style={bodyStyle}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:12, marginBottom:12 }}>
              {activeSavingsCash.map((cat) => {
                const baseId = cat.replace(/_\d+$/, "");
                const st = SAVINGS_CASH_TYPES.find((s) => s.id === baseId);
                const done = isDone("savings_cash_section");
                const flds = savingsCashFields[cat] || {
                  description: "",
                  amount: "",
                };
                const fldStyle = (empty: boolean): React.CSSProperties => ({
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 7,
                  border:
                    !done && empty
                      ? "1px solid #E53E3E"
                      : "1px solid var(--border)",
                  background: done ? "var(--surface2)" : "var(--surface)",
                  color: done ? "var(--text-dim)" : "var(--text)",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                });
                return (
                  <div
                    key={cat}
                    style={{
                      padding: 14,
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--surface2)",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text)",
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <DocIcon
                        name={st?.icon || "file"}
                        size={14}
                        color="var(--text-mid)"
                      />
                      <span style={{ flex: 1 }}>{st?.label || cat}</span>
                      {!done && (
                        <button
                          onClick={() => {
                            setActiveSavingsCash((p) =>
                              p.filter((c) => c !== cat),
                            );
                            setSavingsCashFields((p) => {
                              const n = { ...p };
                              delete n[cat];
                              return n;
                            });
                          }}
                          title="הסר"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: "0 2px",
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-dim)",
                            marginBottom: 3,
                          }}
                        >
                          שם המוסד / הבנק{" "}
                          <span style={{ color: "#E53E3E" }}>*</span>
                        </div>
                        <input
                          type="text"
                          value={flds.description}
                          placeholder="לדוגמה: בנק הפועלים"
                          disabled={done}
                          style={fldStyle(!flds.description.trim())}
                          onChange={(e) =>
                            setSavingsCashFields((p) => ({
                              ...p,
                              [cat]: { ...flds, description: e.target.value },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-dim)",
                            marginBottom: 3,
                          }}
                        >
                          סכום משוער (₪){" "}
                          <span style={{ color: "#E53E3E" }}>*</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <input
                            type="text"
                            dir="ltr"
                            value={flds.amount ? Number(flds.amount).toLocaleString() : ""}
                            placeholder="0"
                            disabled={done}
                            style={{ ...fldStyle(!String(flds.amount ?? "").trim()), textAlign:"left", flex:1 }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              setSavingsCashFields((p) => ({ ...p, [cat]: { ...flds, amount: raw } }));
                            }}
                          />
                          <span style={{ color:"var(--text-dim)", fontSize:13, fontWeight:500, flexShrink:0 }}>₪</span>
                        </div>
                      </div>
                    </div>
                    <UploadArea
                      cat={cat}
                      label="הוסף מסמך (אופציונלי)"
                      done={isDone("savings_cash_section")}
                    />
                  </div>
                );
              })}
              </div>
              {!isDone("savings_cash_section") &&
                (!showSavingsCashPicker ? (
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowSavingsCashPicker(true)}
                    style={{ marginBottom: 14 }}
                  >
                    + הוסף חיסכון
                  </Btn>
                ) : (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      background: "var(--surface2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}
                    >
                      בחר סוג חיסכון:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {SAVINGS_CASH_TYPES.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => {
                            const existing = activeSavingsCash.filter(
                              (c) => c === s.id || c.startsWith(s.id + "_"),
                            );
                            const newKey =
                              existing.length === 0
                                ? s.id
                                : `${s.id}_${existing.length + 1}`;
                            setActiveSavingsCash((p) => [...p, newKey]);
                            setShowSavingsCashPicker(false);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 20,
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <DocIcon
                            name={s.icon}
                            color="var(--text-mid)"
                            size={14}
                          />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              {activeSavingsCash.length > 0 &&
                (isDone("savings_cash_section") ? (
                  <Btn
                    onClick={undoSavingsCashDone}
                    disabled={saving === "savings_cash_all"}
                    style={{
                      marginTop: 4,
                      width: "100%",
                      background: "#FFF8E7",
                      border: "1px solid #F0C040",
                      color: "#A67C00",
                    }}
                  >
                    {saving === "savings_cash_all" ? "מעדכן..." : "ערוך הגשה"}
                  </Btn>
                ) : (
                  <Btn
                    onClick={saveSavingsCashDone}
                    disabled={
                      saving === "savings_cash_all" ||
                      !savingsCashFieldsComplete
                    }
                    style={{ marginTop: 4, width: "100%" }}
                  >
                    {saving === "savings_cash_all" ? "שומר..." : "סיימתי"}
                  </Btn>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 8. נכסים פיזיים */}
      {visibleOptional.includes("assets") && (
        <div style={{ marginBottom: 8 }}>
          <SectionHeader
            id="assets"
            icon={<DocIcon name="home" />}
            label="נכסים פיזיים"
            done={isDone("assets_section") && activeAssets.length > 0}
            partial={activeAssets.length > 0 && !isDone("assets_section")}
            onClick={() => toggle("assets")}
          />
          <NoteBar docKey="assets" />
          <DoneLine done={isDone("assets_section")} />
          {expanded === "assets" && (
            <div style={bodyStyle}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:12 }}>
              {activeAssets.map((cat) => {
                const baseId = cat.replace(/_\d+$/, "");
                const at = ASSET_TYPES.find((a) => a.id === baseId);
                const isCar = baseId === "asset_car";
                const done = isDone("assets_section");
                const flds = assetFields[cat] || { description: "", value: "", year: "" };
                const fldStyle = (empty: boolean): React.CSSProperties => ({
                  width: "100%",
                  padding: "6px 10px",
                  fontSize: 13,
                  borderRadius: 7,
                  border:
                    !done && empty
                      ? "1px solid #E53E3E"
                      : "1px solid var(--border)",
                  background: done ? "var(--surface2)" : "var(--surface)",
                  color: done ? "var(--text-dim)" : "var(--text)",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  outline: "none",
                });
                return (
                  <div
                    key={cat}
                    style={{
                      padding: 14,
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      background: "var(--surface2)",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 13,
                        color: "var(--text)",
                        marginBottom: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <DocIcon
                        name={at?.icon || "home"}
                        size={14}
                        color="var(--text-mid)"
                      />
                      <span style={{ flex: 1 }}>{at?.label || cat}</span>
                      {!done && (
                        <button
                          onClick={() => {
                            setActiveAssets((p) => p.filter((c) => c !== cat));
                            setAssetFields((p) => {
                              const n = { ...p };
                              delete n[cat];
                              return n;
                            });
                          }}
                          title="הסר"
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: 16,
                            lineHeight: 1,
                            padding: "0 2px",
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 8,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-dim)",
                            marginBottom: 3,
                          }}
                        >
                          {isCar ? "סוג הרכב" : "תיאור"} <span style={{ color: "#E53E3E" }}>*</span>
                        </div>
                        <input
                          type="text"
                          value={flds.description}
                          placeholder={isCar ? "למשל: טויוטה קורולה" : ""}
                          disabled={done}
                          style={fldStyle(!flds.description.trim())}
                          onChange={(e) =>
                            setAssetFields((p) => ({
                              ...p,
                              [cat]: { ...flds, description: e.target.value },
                            }))
                          }
                        />
                      </div>
                      {isCar && (
                        <div>
                          <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:3 }}>
                            שנת ייצור <span style={{ color:"#E53E3E" }}>*</span>
                          </div>
                          <input
                            type="text"
                            dir="ltr"
                            value={flds.year || ""}
                            placeholder="2020"
                            maxLength={4}
                            disabled={done}
                            style={fldStyle(!((flds.year || "").trim()))}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
                              setAssetFields((p) => ({ ...p, [cat]: { ...flds, year: raw } }));
                            }}
                          />
                        </div>
                      )}
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-dim)",
                            marginBottom: 3,
                          }}
                        >
                          שווי מוערך (₪){" "}
                          <span style={{ color: "#E53E3E" }}>*</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <input
                            type="text"
                            dir="ltr"
                            value={flds.value ? Number(flds.value).toLocaleString() : ""}
                            placeholder="0"
                            disabled={done}
                            style={{ ...fldStyle(!String(flds.value ?? "").trim()), textAlign:"left", flex:1 }}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/\D/g, "");
                              setAssetFields((p) => ({ ...p, [cat]: { ...flds, value: raw } }));
                            }}
                          />
                          <span style={{ color:"var(--text-dim)", fontSize:13, fontWeight:500, flexShrink:0 }}>₪</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              {!isDone("assets_section") &&
                (!showAssetPicker ? (
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowAssetPicker(true)}
                    style={{ marginBottom: 14 }}
                  >
                    + הוסף נכס
                  </Btn>
                ) : (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: 12,
                      background: "var(--surface2)",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}
                    >
                      בחר סוג נכס:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {ASSET_TYPES.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            const existing = activeAssets.filter(
                              (c) => c === a.id || c.startsWith(a.id + "_"),
                            );
                            const newKey =
                              existing.length === 0
                                ? a.id
                                : `${a.id}_${existing.length + 1}`;
                            setActiveAssets((p) => [...p, newKey]);
                            setShowAssetPicker(false);
                          }}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 20,
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <DocIcon
                            name={a.icon}
                            color="var(--text-mid)"
                            size={14}
                          />
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              {activeAssets.length > 0 &&
                (isDone("assets_section") ? (
                  <Btn
                    onClick={undoAssetsDone}
                    disabled={saving === "assets_all"}
                    style={{
                      marginTop: 4,
                      width: "100%",
                      background: "#FFF8E7",
                      border: "1px solid #F0C040",
                      color: "#A67C00",
                    }}
                  >
                    {saving === "assets_all" ? "מעדכן..." : "ערוך הגשה"}
                  </Btn>
                ) : (
                  <Btn
                    onClick={saveAssetsDone}
                    disabled={saving === "assets_all" || !assetsFieldsComplete}
                    style={{ marginTop: 4, width: "100%" }}
                  >
                    {saving === "assets_all" ? "שומר..." : "סיימתי"}
                  </Btn>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 7. תחזית פרישה — ממש אחרי חסכונות */}
      {visibleOptional.includes("retirement") && (() => {
        const retDone = isDone("retirement_forecast");
        const retPartial = !!retirementCount && !retDone;
        const clipSvg = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
        const eyeSvg = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
        const xSvg = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
        return (
          <div style={{ marginBottom: 8 }}>
            <SectionHeader
              id="retirement"
              icon={<DocIcon name="user" />}
              label="דוח תחזית פרישה (מעל גיל 55)"
              done={retDone}
              partial={retPartial}
              onClick={() => toggle("retirement")}
            />
            <NoteBar docKey="retirement" />
            <DoneLine done={retDone} />
            {expanded === "retirement" && (
              <div style={bodyStyle}>
                <div style={descStyle}>רלוונטי למי שמעל גיל 55 — דוח תחזית פרישה מסוכן הביטוח</div>

                {/* בחירת מספר בני זוג */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:8 }}>כמה בני זוג מעל גיל 55?</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {[1,2].map(n => (
                      <button key={n} onClick={() => !retDone && handleRetirementCountSelect(n)} disabled={retDone}
                        style={{ padding:"8px 24px", borderRadius:8, border:`1px solid ${retirementCount===n?"var(--green-mid)":"var(--border)"}`, background:retirementCount===n?"var(--green-pale)":"var(--surface)", color:retirementCount===n?"var(--green-deep)":"var(--text)", fontWeight:retirementCount===n?700:400, cursor:retDone?"default":"pointer", fontSize:15, fontFamily:"inherit", transition:"all .15s" }}>{n}</button>
                    ))}
                  </div>
                </div>

                {/* איזורי העלאה */}
                {retirementCount && (<>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:4 }}>
                {Array.from({ length: retirementCount }).map((_, zoneIdx) => {
                  const savedFile = getDoc("retirement_forecast")?.files?.[zoneIdx];
                  const pendingFile = retirementPendingFiles[zoneIdx];
                  const name = retirementNames[zoneIdx] || "";
                  const hasFile = !!(savedFile || pendingFile);
                  return (
                    <div key={zoneIdx} style={{ padding:"12px 14px", background:"var(--surface2)", borderRadius:8, border:"1px solid var(--border)" }}>
                      {retirementCount > 1 && (
                        <div style={{ fontSize:12, fontWeight:700, color:"var(--text-dim)", marginBottom:10, letterSpacing:"0.04em" }}>בן/בת זוג {zoneIdx+1}</div>
                      )}
                      <div style={{ marginBottom:10 }}>
                        <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:4 }}>שם פרטי <span style={{ color:"var(--red)" }}>*</span></div>
                        <input type="text" value={name} disabled={retDone}
                          onChange={e => setRetirementNames(prev => { const a=[...prev]; a[zoneIdx]=e.target.value; return a; })}
                          placeholder="הכנס שם..."
                          style={{ maxWidth:160, width:"100%", boxSizing:"border-box", padding:"6px 10px", fontSize:13, borderRadius:6, border:`1px solid ${!name.trim()&&!retDone?"var(--red)":"var(--border)"}`, background:"var(--surface)", color:"var(--text)", fontFamily:"inherit", outline:"none" }} />
                        {!name.trim() && !retDone && <div style={{ fontSize:11, color:"var(--red)", marginTop:2 }}>שדה חובה</div>}
                      </div>
                      <input ref={el => retirementFileRefs.current[zoneIdx]=el} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e => handleRetirementFileChange(zoneIdx, e)} />
                      {savedFile && !pendingFile && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--text)", padding:"4px 0" }}>
                          {clipSvg}
                          <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{savedFile.filename}</span>
                          {savedFile.path && <button onClick={()=>openFile(savedFile.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", display:"flex", alignItems:"center" }} title="צפה">{eyeSvg}</button>}
                          {!retDone && <button onClick={()=>handleRetirementRemoveSaved(zoneIdx)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", display:"flex", alignItems:"center" }} title="הסר">{xSvg}</button>}
                        </div>
                      )}
                      {pendingFile && (
                        <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--green-mid)", padding:"4px 0" }}>
                          {clipSvg}
                          <span style={{ flex:1 }}>{pendingFile.name} <span style={{ color:"var(--text-dim)" }}>(ממתין לשמירה)</span></span>
                          <button onClick={()=>setRetirementPendingFiles(prev=>{const a=[...prev];a[zoneIdx]=null;return a;})} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", display:"flex", alignItems:"center" }} title="הסר">{xSvg}</button>
                        </div>
                      )}
                      {!hasFile && !retDone && (
                        <Btn size="sm" variant="secondary" onClick={()=>retirementFileRefs.current[zoneIdx]?.click()} style={{ marginTop:6, display:"inline-flex", alignItems:"center", gap:6 }}>{clipSvg} הוסף קובץ</Btn>
                      )}
                      {hasFile && !retDone && !pendingFile && (
                        <button onClick={()=>retirementFileRefs.current[zoneIdx]?.click()} style={{ marginTop:6, background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:12, fontFamily:"inherit", padding:0 }}>החלף קובץ</button>
                      )}
                      {!hasFile && !retDone && <div style={{ fontSize:11, color:"var(--red)", marginTop:4 }}>יש להעלות קובץ</div>}
                    </div>
                  );
                })}
                </div>

                {retDone ? (
                  <Btn onClick={()=>undoDone("retirement_forecast")} disabled={saving==="retirement_forecast"}
                    style={{ marginTop:14, width:"100%", background:"#FFF8E7", border:"1px solid #F0C040", color:"#A67C00" }}>
                    {saving==="retirement_forecast"?"מעדכן...":"ערוך הגשה"}
                  </Btn>
                ) : (
                  <Btn onClick={saveRetirementDone} disabled={!retirementReadyToSave()||saving==="retirement_forecast"} style={{ marginTop:14, width:"100%" }}>
                    {saving==="retirement_forecast"?"שומר...":"סיימתי"}
                  </Btn>
                )}
              </>)}
              </div>
            )}

          </div>
        );
      })()}

      {/* מסמכים מותאמים אישית */}
      {customDocs
        .filter((cd) => (requiredDocs || []).includes(cd.id))
        .map((cd) => {
          const cat = cd.id;
          const cdDone = isDone(cat);
          const cdPartial = hasFiles(cat) && !cdDone;
          return (
            <div key={cd.id} style={{ marginBottom: 8 }}>
              <SectionHeader
                id={cd.id}
                icon={<DocIcon name="file" />}
                label={cd.label}
                done={cdDone}
                partial={cdPartial}
                onClick={() => toggle(cd.id)}
              />
              <NoteBar docKey={cd.id} />
              {expanded === cd.id && (
                <div style={bodyStyle}>
                  <UploadArea cat={cd.id} done={cdDone} />
                  {isDone(cd.id) ? (
                    <Btn
                      onClick={() => undoDone(cd.id)}
                      disabled={saving === cd.id}
                      style={{
                        marginTop: 14,
                        width: "100%",
                        background: "#FFF8E7",
                        border: "1px solid #F0C040",
                        color: "#A67C00",
                      }}
                    >
                      {saving === cd.id ? "מעדכן..." : "ערוך הגשה"}
                    </Btn>
                  ) : (
                    <Btn
                      onClick={() => saveAndDone(cd.id, cd.label)}
                      disabled={!hasFiles(cd.id) || saving === cd.id}
                      style={{ marginTop: 14, width: "100%" }}
                    >
                      {saving === cd.id ? "שומר..." : "סיימתי"}
                    </Btn>
                  )}
                </div>
              )}
            </div>
          );
        })}

      {/* שאלון אישי */}
      {needsQuestionnaire && (
        <div style={{ marginBottom: 8 }}>
          <div
            onClick={onNavigateQuestionnaire}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 18px",
              background: questDone
                ? "rgba(46,204,138,0.06)"
                : "rgba(46,204,138,0.03)",
              borderRadius: 10,
              border: `1px solid ${questDone ? "rgba(46,204,138,0.3)" : "var(--green-mint)"}`,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <span
              style={{ display: "flex", alignItems: "center", flexShrink: 0 }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--green-mid)"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>שאלון אישי</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                לחץ כדי למלא את השאלון
              </div>
            </div>
            {questDone ? (
              <span
                style={{
                  background: "rgba(46,204,138,0.15)",
                  color: "var(--green-soft)",
                  borderRadius: 20,
                  padding: "3px 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <DocIcon
                  name="check-circle"
                  color="var(--green-soft)"
                  size={14}
                />{" "}
                הושלם
              </span>
            ) : (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "var(--green-mid)",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </span>
            )}
          </div>
        </div>
      )}

      {/* הערות מסכמות — מוצג אחרי השלמת 3 חודשים (משימה 4ב) */}
      {txsDone && (
        <div
          style={{
            marginTop: 20,
            padding: "18px 20px",
            background: "var(--surface2)",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <div
              style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}
            >
              הערות מסכמות לאלון
            </div>
            {summaryNoteSaving && (
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                שומר...
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-dim)",
              marginBottom: 10,
              lineHeight: 1.6,
            }}
          >
            אם היה חודש חריג, הוצאה חד-פעמית, או משהו שאלון צריך לדעת כדי להבין
            את התמונה — כתוב כאן.
          </div>
          <textarea
            value={summaryNote}
            onChange={(e) => handleSummaryNoteChange(e.target.value)}
            placeholder='לדוגמה: "חודש פברואר אינו מייצג כי אירחנו משפחה — הוצאות יוצאות דופן של ₪8,000"'
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 14,
              lineHeight: 1.6,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--green-mid)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--border)";
            }}
          />
        </div>
      )}

      {/* הגשה */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        {!requiredDone && (
          <div
            style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 12 }}
          >
            להגשה יש להשלים את כל המסמכים הדרושים
          </div>
        )}
        <Btn
          onClick={handleSubmit}
          disabled={!requiredDone || submitting}
          title={
            !requiredDone ? "השלם את כל המסמכים הדרושים כדי להגיש" : undefined
          }
          style={{
            padding: "10px 32px",
            fontSize: 15,
            fontWeight: 600,
            opacity: requiredDone ? 1 : 0.45,
          }}
        >
          {submitting ? "מגיש..." : "הגש"}
        </Btn>
      </div>
    </div>
  );
}

// ── FinalizeCheckModal — popup A (חודשים 1-2) ו-B (חודש 3) ─────────────────────
function FinalizeCheckModal({
  monthLabel,
  emptyCats,
  isMonth3,
  estimates,
  onEstimateChange,
  openSections,
  onToggleSection,
  finalizeNote,
  onFinalizeNoteChange,
  pending,
  onBack,
  onConfirm,
}) {
  const grouped: Record<string, typeof emptyCats> = {};
  emptyCats.forEach((r) => {
    const sec = r.section || "כללי";
    if (!grouped[sec]) grouped[sec] = [];
    grouped[sec].push(r);
  });
  const sections = Object.keys(grouped);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: "var(--z-top)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 18,
          padding: "32px 28px",
          maxWidth: 560,
          width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          direction: "rtl",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* כותרת */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            {isMonth3
              ? "סיכום 3 חודשים — לפני שמגישים"
              : "רגע לפני שמסמנים הושלם"}
          </div>
          <div
            style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7 }}
          >
            {isMonth3 ? (
              <>
                הקטגוריות הבאות לא קיבלו אף תנועה לאורך 3 חודשים. אם יש לך הוצאה
                שקיימת בחייך אבל לא הופיעה בתקופה זו — כדאי להוסיף הערכה חודשית.
                <br />
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    display: "block",
                    marginTop: 6,
                  }}
                >
                  לדוגמה: טיסות לחו"ל בתקציב ₪12,000 בשנה = ₪1,000 לחודש
                </span>
              </>
            ) : (
              <>
                עבור על הקטגוריות הריקות וודא שלא פספסת כלום. אם קטגוריה לא
                הייתה רלוונטית החודש — זה בסדר, היא עשויה להופיע בחודשים הבאים.
              </>
            )}
          </div>
        </div>

        {/* רשימת קטגוריות */}
        {emptyCats.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 8,
              color: "var(--green-soft)",
              padding: "24px 0",
            }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <div style={{ fontWeight: 600, fontSize: 16 }}>
              כל הקטגוריות כוסו!
            </div>
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              marginBottom: 20,
              marginTop: 4,
              direction: "ltr",
            }}
          >
            <div style={{ direction: "rtl" }}>
              {sections.map((sec) => {
                const isOpen = openSections[sec] !== false; // פתוח כברירת מחדל
                return (
                  <div
                    key={sec}
                    style={{
                      marginBottom: 8,
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}
                  >
                    {/* accordion header */}
                    <button
                      onClick={() => onToggleSection(sec)}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        background: "var(--surface2)",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontFamily: "inherit",
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      <span>{sec}</span>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--text-dim)",
                          fontWeight: 400,
                          fontSize: 13,
                        }}
                      >
                        {grouped[sec].length} קטגוריות
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{
                            transform: isOpen
                              ? "rotate(180deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.2s",
                          }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>
                    {/* accordion body */}
                    {isOpen && (
                      <div style={{ padding: "4px 0" }}>
                        {grouped[sec].map((cat) => (
                          <div
                            key={cat.name}
                            style={{
                              padding: "10px 14px",
                              borderTop: "1px solid var(--border)",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 12,
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>
                                {cat.name}
                              </div>
                              {cat.description && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-dim)",
                                    marginTop: 2,
                                  }}
                                >
                                  {cat.description}
                                </div>
                              )}
                            </div>
                            {isMonth3 && (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  flexShrink: 0,
                                }}
                              >
                                {estimates[cat.name] ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 6,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: 13,
                                        color: "var(--green-soft)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      ✓ ₪
                                      {Number(
                                        estimates[cat.name],
                                      ).toLocaleString()}
                                      /חודש
                                    </span>
                                    <button
                                      onClick={() =>
                                        onEstimateChange(cat.name, "")
                                      }
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "var(--text-dim)",
                                        fontSize: 12,
                                        padding: "2px 4px",
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                ) : (
                                  <EstimateInlineInput
                                    catName={cat.name}
                                    onChange={onEstimateChange}
                                  />
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
          </div>
        )}

        {/* הערה חופשית לפני סיום חודש — משימה 4א */}
        <div style={{ marginTop: 4, marginBottom: 16 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-mid)",
              marginBottom: 6,
            }}
          >
            הערה לאלון (אופציונלי)
          </div>
          <textarea
            value={finalizeNote}
            onChange={(e) => onFinalizeNoteChange(e.target.value)}
            placeholder='לדוגמה: "לא היה לי סעיף גינון אז שמתי תחת שכר דירה — התשלום החודשי הוא ₪300 לגנן"'
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              fontSize: 14,
              lineHeight: 1.6,
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              color: "var(--text)",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--green-mid)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "var(--border)";
            }}
          />
        </div>

        {/* כפתורים */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
            marginTop: "auto",
          }}
        >
          <Btn variant="ghost" onClick={onBack} disabled={pending}>
            חזור לעריכה
          </Btn>
          <Btn onClick={onConfirm} disabled={pending}>
            {pending ? "שומר..." : isMonth3 ? "סיימתי" : "הכל בסדר, המשך"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function EstimateInlineInput({ catName, onChange }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "none",
          border: "1px dashed var(--border)",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 12,
          color: "var(--text-dim)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        + הוסף הערכה
      </button>
    );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <input
        autoFocus
        type="number"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="₪ לחודש"
        style={{
          width: 90,
          padding: "3px 8px",
          fontSize: 13,
          borderRadius: 6,
          border: "1px solid var(--green-mid)",
          background: "var(--surface2)",
          color: "var(--text)",
          fontFamily: "inherit",
          outline: "none",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val) {
            onChange(catName, val);
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button
        onClick={() => {
          if (val) {
            onChange(catName, val);
            setOpen(false);
          }
        }}
        disabled={!val}
        style={{
          background: "var(--green-mid)",
          border: "none",
          borderRadius: 6,
          padding: "3px 8px",
          fontSize: 12,
          color: "#fff",
          cursor: "pointer",
          opacity: val ? 1 : 0.4,
        }}
      >
        ✓
      </button>
    </div>
  );
}

// ── Onboarding progress ───────────────────────────────────────────────────────
function OnboardingProgress({ subsCount, payslipsCount, total }) {
  const done = subsCount >= total && payslipsCount >= total;
  const totalSteps = total * 2;
  const completedSteps =
    Math.min(subsCount, total) + Math.min(payslipsCount, total);
  return (
    <div
      style={{
        background: "var(--surface2)",
        borderRadius: 12,
        padding: "16px 20px",
        marginBottom: 20,
        border: `1px solid ${"var(--border)"}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <DocIcon name="clipboard" color="var(--green-deep)" size={18} /> השלמת
          נתונים ראשוניים
        </div>
        <div
          style={{
            fontSize: 14,
            color: done ? "var(--green-soft)" : "var(--text-dim)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {done ? (
            <>
              <DocIcon
                name="check-circle"
                color="var(--green-soft)"
                size={14}
              />{" "}
              הכל הושלם!
            </>
          ) : (
            `${completedSteps}/${totalSteps} שלבים`
          )}
        </div>
      </div>
      <div
        style={{
          background: "var(--surface)",
          borderRadius: 20,
          height: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${(completedSteps / totalSteps) * 100}%`,
            height: "100%",
            background: `linear-gradient(90deg,${"var(--green-mid)"},${"var(--green-soft)"})`,
            borderRadius: 20,
            transition: "width .4s",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 14 }}>
        <span
          style={{
            color: subsCount >= total ? "var(--green-soft)" : "var(--text-dim)",
          }}
        >
          {subsCount >= total ? "✓" : "○"} בסיס חומרים לבניית התיק הכלכלי{" "}
          {subsCount}/{total}
        </span>
        <span
          style={{
            color:
              payslipsCount >= total ? "var(--green-soft)" : "var(--text-dim)",
          }}
        >
          {payslipsCount >= total ? "✓" : "○"} תלושי משכורת {payslipsCount}/
          {total}
        </span>
      </div>
    </div>
  );
}

// ── Month Detail Screen ───────────────────────────────────────────────────────
function MonthDetailScreen({
  entry,
  subs,
  onAddSource,
  onFinalize,
  onReopen,
  onBack,
  onDeleteSub,
  onUpdateSub,
  categories,
  categoryRows = [],
  clientCats,
  clientId,
  onCategoryAdded,
  ignoredCats = IGNORED_CATEGORIES,
  incomeCats = new Set<string>(),
  hiddenCats = [],
  onHiddenCatsChange = undefined as any,
  scenarioCats = null as any,
}) {
  const allTx = subs.flatMap((s) => s.transactions || []);
  const total = allTx
    .filter((t) => !ignoredCats.has(t.cat))
    .reduce(
      (sum, t) =>
        sum +
        (incomeCats.has(t.cat)
          ? -Number(t.amount || 0)
          : Number(t.amount || 0)),
      0,
    );
  const catMap: Record<string, number> = {};
  allTx.forEach((t) => {
    catMap[t.cat] =
      (catMap[t.cat] || 0) +
      (incomeCats.has(t.cat) ? -Number(t.amount || 0) : Number(t.amount || 0));
  });
  const catSummary = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  const [editingSub, setEditingSub] = useState(null); // sub being edited
  const [editTx, setEditTx] = useState([]);
  const [editCatOpen, setEditCatOpen] = useState(null);
  const [catSearch, setCatSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingRemember, setPendingRemember] = useState<{
    name: string;
    cat: string;
    budgetType?: string;
  } | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const startEdit = (sub) => {
    setEditingSub(sub.id);
    setEditTx(sub.transactions || []);
  };
  const saveEdit = async () => {
    try {
      await onUpdateSub(editingSub, editTx);
      setEditingSub(null);
    } catch (e) {
      alert("שגיאה בשמירה — נסה שוב");
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
      <RememberModal
        pendingRemember={pendingRemember}
        onAlways={async () => {
          const { name, cat, budgetType } = pendingRemember!;
          await supabase
            .from("remembered_mappings")
            .upsert(
              [{ client_id: clientId, business_name: name, category: cat, budget_type: budgetType }],
              { onConflict: "client_id,business_name" },
            );
          await supabase.from("client_change_log").insert([
            {
              client_id: clientId,
              event_type: "remap_business",
              details: { business_name: name, to_cat: cat },
            },
          ]);
          setEditTx((p) =>
            p.map((t) =>
              t.name === name
                ? { ...t, cat, budget_type: budgetType, edited: true }
                : t,
            ),
          );
          setPendingRemember(null);
        }}
        onJustHere={() => setPendingRemember(null)}
      />
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 22 }}>{entry.label}</div>
            {entry.is_finalized ? (
              <span
                style={{
                  background: "rgba(46,204,138,0.15)",
                  color: "var(--green-soft)",
                  borderRadius: 20,
                  padding: "3px 12px",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <DocIcon
                  name="check-circle"
                  color="var(--green-soft)"
                  size={14}
                />{" "}
                הושלם
              </span>
            ) : (
              <span
                style={{
                  background: "rgba(255,183,77,0.12)",
                  color: "var(--gold)",
                  borderRadius: 20,
                  padding: "3px 12px",
                  fontSize: 14,
                }}
              >
                בתהליך
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, color: "var(--text-dim)" }}>
            {subs.length} מקורות · {allTx.length} תנועות · ₪
            {Math.round(total).toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn size="sm" onClick={onAddSource}>
            + הוסף מקור
          </Btn>
          {entry.is_finalized ? (
            <Btn
              size="sm"
              onClick={onBack}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <DocIcon name="check-circle" color="#fff" size={15} />
              סיימתי
            </Btn>
          ) : (
            <Btn
              size="sm"
              onClick={onFinalize}
              disabled={subs.length === 0}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <DocIcon name="check-circle" color="#fff" size={15} />
              סיימתי את החודש
            </Btn>
          )}
        </div>
      </div>

      {subs.length === 0 ? (
        <Card
          style={{ textAlign: "center", padding: 48, color: "var(--text-dim)" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 12,
              opacity: 0.4,
            }}
          >
            <DocIcon name="folder" color="var(--text-dim)" size={36} />
          </div>
          <div style={{ marginBottom: 16 }}>עוד לא הוספת מקורות לחודש זה</div>
          <Btn onClick={onAddSource}>+ הוסף מקור ראשון</Btn>
        </Card>
      ) : (
        <>
          {/* Sources — expandable inline */}
          {subs.map((sub) => {
            const isOpen = editingSub === sub.id;
            const subTotal = (sub.transactions || [])
              .filter((t) => !ignoredCats.has(t.cat))
              .reduce(
                (s, t) =>
                  s +
                  (incomeCats.has(t.cat)
                    ? -Number(t.amount || 0)
                    : Number(t.amount || 0)),
                0,
              );
            return (
              <div key={sub.id} style={{ marginBottom: 12 }}>
                {/* Source header */}
                <div
                  onClick={() =>
                    isOpen ? setEditingSub(null) : startEdit(sub)
                  }
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "var(--surface)",
                    border: `2px solid ${isOpen ? "var(--green-mid)" : "var(--border)"}`,
                    borderRadius: isOpen ? "12px 12px 0 0" : 12,
                    padding: "14px 18px",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <span style={{ fontSize: 20 }}>{isOpen ? "▾" : "▸"}</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>
                        {sub.source_label || sub.label}
                      </div>
                      <div style={{ fontSize: 15, color: "var(--text-dim)" }}>
                        {(sub.transactions || []).length} תנועות
                        {subTotal > 0 && (
                          <>
                            {" "}
                            ·{" "}
                            <span
                              style={{ color: "var(--red)", fontWeight: 600 }}
                            >
                              ₪{Math.round(subTotal).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Btn
                      size="sm"
                      onClick={() =>
                        isOpen ? setEditingSub(null) : startEdit(sub)
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {isOpen ? (
                        "סגור ▲"
                      ) : (
                        <>
                          <DocIcon name="pencil" color="#fff" size={14} /> ערוך
                          תנועות
                        </>
                      )}
                    </Btn>
                    <button
                      onClick={() => setConfirmDeleteId(sub.id)}
                      style={{
                        background: "none",
                        border: "1px solid rgba(247,92,92,0.4)",
                        borderRadius: 7,
                        padding: "5px 10px",
                        fontSize: 14,
                        color: "var(--red)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <DocIcon name="trash" color="var(--red)" size={15} />
                    </button>
                  </div>
                </div>

                {/* Inline editor — opens directly under header */}
                {isOpen && (
                  <div
                    style={{
                      border: "2px solid var(--green-mid)",
                      borderTop: "none",
                      borderRadius: "0 0 12px 12px",
                      padding: "16px 16px 12px",
                      background: "var(--surface)",
                    }}
                  >
                    {editTx.map((tx, i) => {
                      const isIgnored = tx.cat === "להתעלם";
                      return (
                        <div
                          key={tx.id || i}
                          onClick={() => {
                            if (
                              editCatOpen === (tx.id || i) ||
                              editCatOpen === `note_${tx.id || i}`
                            )
                              setEditCatOpen(null);
                          }}
                          style={{
                            marginBottom: 4,
                            padding: "6px 10px",
                            background: isIgnored
                              ? "var(--surface2)"
                              : "var(--surface)",
                            border: `1px solid var(--border)`,
                            borderRadius: 8,
                            opacity: isIgnored ? 0.55 : 1,
                            cursor:
                              editCatOpen === (tx.id || i) ||
                              editCatOpen === `note_${tx.id || i}`
                                ? "pointer"
                                : "default",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              flexWrap: "wrap",
                              gap: 6,
                            }}
                          >
                            <div
                              style={{
                                flex: 1,
                                minWidth: 120,
                                display: "flex",
                                alignItems: "baseline",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  fontSize: 14,
                                  textDecoration: isIgnored
                                    ? "line-through"
                                    : "none",
                                  color: isIgnored
                                    ? "var(--text-dim)"
                                    : "var(--text)",
                                }}
                              >
                                {tx.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: "var(--text-dim)",
                                }}
                              >
                                {tx.date}
                              </div>
                              {tx.note && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-mid)",
                                    fontStyle: "italic",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 3,
                                  }}
                                >
                                  <DocIcon
                                    name="note"
                                    color="var(--text-dim)"
                                    size={11}
                                  />
                                  {tx.note}
                                </div>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                flexWrap: "wrap",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontSize: 14,
                                  color: isIgnored
                                    ? "var(--text-dim)"
                                    : "var(--red)",
                                }}
                              >
                                ₪{tx.amount?.toLocaleString()}
                              </span>
                              {!isIgnored && (
                                <button
                                  onClick={() => {
                                    const next =
                                      editCatOpen === (tx.id || i)
                                        ? null
                                        : tx.id || i;
                                    if (next !== null) setCatSearch("");
                                    setEditCatOpen(next);
                                  }}
                                  style={{
                                    background: "var(--green-mint)",
                                    border: "1px solid var(--green-soft)",
                                    borderRadius: 6,
                                    padding: "2px 9px",
                                    fontSize: 13,
                                    color: "var(--green-deep)",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    fontWeight: 600,
                                  }}
                                >
                                  {tx.cat}
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  isIgnored
                                    ? setEditTx((p) =>
                                        p.map((t, j) =>
                                          j === i
                                            ? {
                                                ...t,
                                                cat: "דרוש סיווג",
                                                edited: true,
                                              }
                                            : t,
                                        ),
                                      )
                                    : setEditTx((p) =>
                                        p.map((t, j) =>
                                          j === i
                                            ? {
                                                ...t,
                                                cat: "להתעלם",
                                                edited: true,
                                              }
                                            : t,
                                        ),
                                      )
                                }
                                title={
                                  isIgnored ? "בטל התעלמות" : "התעלם — לא ייספר"
                                }
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  padding: "2px 6px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                <DocIcon
                                  name={isIgnored ? "undo" : "ban"}
                                  color={
                                    isIgnored
                                      ? "var(--green-mid)"
                                      : "var(--text-dim)"
                                  }
                                  size={12}
                                />
                              </button>
                              <button
                                onClick={() =>
                                  setEditCatOpen(
                                    editCatOpen === `note_${tx.id || i}`
                                      ? null
                                      : `note_${tx.id || i}`,
                                  )
                                }
                                title="הערה"
                                style={{
                                  background: "transparent",
                                  border: "1px solid var(--border)",
                                  borderRadius: 6,
                                  padding: "2px 6px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "var(--text-dim)",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                <DocIcon
                                  name="note"
                                  color="var(--text-dim)"
                                  size={12}
                                />
                              </button>
                            </div>
                          </div>
                          {editCatOpen === (tx.id || i) && (
                            <div style={{ marginTop: 8 }}>
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
                                onSelect={(cat, budgetType) => {
                                  setEditTx((p) =>
                                    p.map((t, j) =>
                                      j === i
                                        ? { ...t, cat, budget_type: budgetType, edited: true }
                                        : t,
                                    ),
                                  );
                                  setEditCatOpen(null);
                                  setCatSearch("");
                                  setPendingRemember({ name: tx.name, cat, budgetType });
                                }}
                              />
                            </div>
                          )}
                          {editCatOpen === `note_${tx.id || i}` && (
                            <div
                              style={{ marginTop: 8 }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                autoFocus
                                value={tx.note || ""}
                                onChange={(e) =>
                                  setEditTx((p) =>
                                    p.map((t, j) =>
                                      j === i
                                        ? { ...t, note: e.target.value }
                                        : t,
                                    ),
                                  )
                                }
                                placeholder="הוסף הערה..."
                                style={{
                                  width: "100%",
                                  background: "var(--surface2)",
                                  border: "1.5px solid var(--green-soft)",
                                  borderRadius: 8,
                                  padding: "7px 12px",
                                  color: "var(--text)",
                                  fontFamily: "inherit",
                                  fontSize: 15,
                                  outline: "none",
                                  boxSizing: "border-box",
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === "Escape")
                                    setEditCatOpen(null);
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        gap: 10,
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <Btn
                        onClick={saveEdit}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <DocIcon name="save" color="#fff" size={15} /> שמור
                        שינויים
                      </Btn>
                      <Btn variant="ghost" onClick={() => setEditingSub(null)}>
                        ביטול
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Category summary — table */}
          <Card style={{ marginBottom: 16 }}>
            <div
              style={{
                fontWeight: 700,
                marginBottom: 16,
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <DocIcon name="bar-chart" color="var(--green-deep)" size={18} />{" "}
              סיכום לפי סעיף
            </div>
            {(() => {
              const visible = catSummary.filter(
                ([cat]) => !ignoredCats.has(cat),
              );
              const totalAmt = visible.reduce((s, [, a]) => s + Math.abs(a), 0);
              const headerCell: React.CSSProperties = {
                fontSize: 11,
                color: "var(--text-dim)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
              };
              return (
                <>
                  {/* Rows */}
                  <div>
                    {visible.map(([cat, amt], i) => {
                      const isIncome = amt < 0;
                      const absAmt = Math.abs(amt);
                      const pct =
                        totalAmt > 0
                          ? Math.round((absAmt / totalAmt) * 100)
                          : 0;
                      const exactPct =
                        totalAmt > 0 ? (absAmt / totalAmt) * 100 : 0;
                      const isTop = i === 0;
                      const barColor = isIncome
                        ? "var(--green-mid)"
                        : isTop
                          ? "var(--red)"
                          : `rgba(247,92,92,${0.25 + (exactPct / 100) * 0.55})`;
                      const isExpanded = expandedCat === cat;
                      const catTxs = allTx
                        .filter((t) => t.cat === cat)
                        .sort((a, b) =>
                          (a.date || "").localeCompare(b.date || ""),
                        );
                      return (
                        <div
                          key={cat}
                          style={{
                            borderBottom:
                              i < visible.length - 1
                                ? "1px solid var(--border)"
                                : "none",
                          }}
                        >
                          <div
                            onClick={() =>
                              setExpandedCat(isExpanded ? null : cat)
                            }
                            style={{
                              padding: "10px 10px 8px",
                              transition: "background 0.12s",
                              cursor: "pointer",
                              borderRadius: isExpanded ? "8px 8px 0 0" : 8,
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background =
                                "rgba(247,92,92,0.04)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = isExpanded
                                ? "rgba(247,92,92,0.04)"
                                : "transparent")
                            }
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                marginBottom: 5,
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                  flex: 1,
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "var(--text-dim)",
                                    transition: "transform 0.2s",
                                    display: "inline-block",
                                    transform: isExpanded
                                      ? "rotate(90deg)"
                                      : "rotate(0deg)",
                                  }}
                                >
                                  ▶
                                </span>
                                <span
                                  style={{
                                    fontSize: 14,
                                    color: isTop
                                      ? "var(--text)"
                                      : "var(--text-dim)",
                                    fontWeight: isTop ? 600 : 400,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {cat}
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-dim)",
                                    flexShrink: 0,
                                  }}
                                >
                                  {catTxs.length} תנועות
                                </span>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 12,
                                  alignItems: "baseline",
                                  flexShrink: 0,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: isIncome
                                      ? "var(--green-mid)"
                                      : "var(--red)",
                                  }}
                                >
                                  {isIncome ? "+" : ""}₪
                                  {absAmt.toLocaleString()}
                                </span>
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-dim)",
                                    minWidth: 28,
                                    textAlign: "center",
                                  }}
                                >
                                  {pct}%
                                </span>
                              </div>
                            </div>
                            {/* Progress bar */}
                            <div
                              style={{
                                height: 4,
                                borderRadius: 4,
                                background: "var(--border)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  height: "100%",
                                  borderRadius: 4,
                                  width: `${exactPct}%`,
                                  background: barColor,
                                  transition: "width 0.4s ease",
                                }}
                              />
                            </div>
                          </div>
                          {/* Expanded transaction list */}
                          {isExpanded && (
                            <div
                              style={{
                                borderLeft: `3px solid ${barColor}`,
                                marginLeft: 10,
                                marginBottom: 6,
                                paddingLeft: 12,
                              }}
                            >
                              {catTxs.map((tx, j) => (
                                <div
                                  key={j}
                                  style={{
                                    display: "flex",
                                    alignItems: "baseline",
                                    gap: 10,
                                    padding: "6px 4px",
                                    borderBottom:
                                      j < catTxs.length - 1
                                        ? "1px solid var(--border)"
                                        : "none",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: "var(--text-dim)",
                                      whiteSpace: "nowrap",
                                      flexShrink: 0,
                                      minWidth: 72,
                                    }}
                                  >
                                    {tx.date || "—"}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 600,
                                      color: "var(--text)",
                                      flex: 1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {tx.name}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 700,
                                      color: isIncome
                                        ? "var(--green-mid)"
                                        : "var(--red)",
                                      flexShrink: 0,
                                      minWidth: 64,
                                      textAlign: "left",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {isIncome ? "+" : ""}₪
                                    {Number(tx.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                              ))}
                              {catTxs.length > 1 && (
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    padding: "7px 4px 2px",
                                    marginTop: 2,
                                    borderTop: `1px solid ${barColor}`,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: "var(--text-dim)",
                                      fontWeight: 600,
                                    }}
                                  >
                                    סה"כ
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 14,
                                      fontWeight: 800,
                                      color: isIncome
                                        ? "var(--green-mid)"
                                        : "var(--red)",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {isIncome ? "+" : ""}₪
                                    {absAmt.toLocaleString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {/* Total row */}
                  {visible.length > 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 10px 2px",
                        borderTop: "1.5px solid var(--border)",
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--text-dim)",
                          fontWeight: 700,
                        }}
                      >
                        סה"כ הוצאות
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: "var(--red)",
                        }}
                      >
                        ₪{Math.round(totalAmt).toLocaleString()}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </Card>
        </>
      )}
      {confirmDeleteId && (
        <ConfirmModal
          title="מחיקת מקור"
          body="האם למחוק מקור זה ואת כל התנועות שלו? פעולה זו אינה הפיכה."
          confirmText="מחק"
          danger
          onConfirm={() => {
            onDeleteSub(confirmDeleteId);
            setConfirmDeleteId(null);
          }}
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
function PortfolioTab({
  clientId,
  clientPlan,
  portfolioMonths,
  portfolioSubs,
  onDataChange,
  onMonthCreated,
  rememberedMappings,
  onRememberingAdded,
  cycleStartDay,
  importedTxs,
  manualTxs,
  bankTxs = [] as any[],
  onManualTxAdded,
  onManualTxDeleted,
  onUpdatePortfolioTxCat,
  onDeletePortfolioSub,
  onCycleStartDayChange,
  categories,
  categoryRows = [],
  clientCats,
  onCategoryAdded,
  ignoredCats = IGNORED_CATEGORIES,
  incomeCats = new Set<string>(),
  categoryRules = [] as any[],
  hiddenCats = [] as string[],
  onHiddenCatsChange = undefined as any,
  scenarioCats = null as any,
  activeSubTab = "control",
  visitedSubTabs = new Set(["control"]) as Set<string>,
  onSubTabChange = (_id: string) => {},
  maxSessionActive = false as boolean,
  maxLastSync = null as string | null,
}) {
  // Lift upload state here so re-renders don't reset it
  const [pStep, setPStep] = useState("list");
  const [activeEntry, setActiveEntry] = useState(null);
  const [entrySubs, setEntrySubs] = useState([]);

  return (
    <div>
      {visitedSubTabs.has("txs") && (
        <div style={{ display: activeSubTab === "txs" ? "block" : "none" }}>
          <AllTransactionsTab
            clientId={clientId}
            importedTxs={importedTxs || []}
            portfolioSubs={portfolioSubs}
            manualTxs={manualTxs || []}
            bankTxs={bankTxs || []}
            cycleStartDay={cycleStartDay}
            onCycleStartDayChange={onCycleStartDayChange}
            rememberedMappings={rememberedMappings}
            onDataChange={onDataChange}
            onManualTxAdded={onManualTxAdded}
            onManualTxDeleted={onManualTxDeleted}
            onUpdatePortfolioTxCat={onUpdatePortfolioTxCat}
            onDeletePortfolioSub={onDeletePortfolioSub}
            onNavigateToUpload={() => {
              setPStep("list");
              onSubTabChange("upload");
            }}
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
            maxSessionActive={maxSessionActive}
            maxLastSync={maxLastSync}
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
            step={pStep}
            setStep={setPStep}
            activeEntry={activeEntry}
            setActiveEntry={setActiveEntry}
            entrySubs={entrySubs}
            setEntrySubs={setEntrySubs}
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
            bankTxs={bankTxs || []}
            rememberedMappings={rememberedMappings || {}}
            onCycleStartDayChange={onCycleStartDayChange}
            ignoredCats={ignoredCats}
            incomeCats={incomeCats}
            categoryRules={categoryRules}
          />
        </div>
      )}
      {activeSubTab === "savings" && (
        <>
          <h1
            style={{
              fontFamily: "'Frank Ruhl Libre', serif",
              fontSize: 32,
              fontWeight: 700,
              color: "var(--text)",
              textAlign: "center",
              marginBottom: 16,
              marginTop: 0,
            }}
          >
            פירוט חסכונות
          </h1>
          <div
            style={{ height: 1, background: "var(--border)", marginBottom: 20 }}
          />
          <Card style={{ textAlign: "center", padding: "64px 32px" }}>
            <div style={{ color: "var(--text-dim)", fontSize: 16 }}>בקרוב</div>
          </Card>
        </>
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
function PortfolioUploadTab({
  clientId,
  portfolioMonths,
  portfolioSubs,
  onDataChange,
  onMonthCreated,
  rememberedMappings,
  onRememberingAdded,
  step,
  setStep,
  activeEntry,
  setActiveEntry,
  entrySubs,
  setEntrySubs,
  cycleStartDay = 1,
  incomeCats = new Set<string>(),
  categories,
  categoryRows = [],
  clientCats,
  onCategoryAdded,
  ignoredCats = IGNORED_CATEGORIES,
  categoryRules = [] as any[],
  hiddenCats = [] as string[],
  onHiddenCatsChange = undefined as any,
  scenarioCats = null as any,
}) {
  // ── פונקציית עזר: חישוב טווח חיוב לפי מפתח חודש ────────────────────────────
  function getBillingRange(
    monthKey: string,
  ): { startDate: Date; endDate: Date; rangeLabel: string } | null {
    if (!monthKey) return null;
    const [y, m] = monthKey.split("-").map(Number);
    if (!y || !m) return null;
    const sd =
      !cycleStartDay || cycleStartDay < 1 || cycleStartDay > 28
        ? 1
        : cycleStartDay;
    let sMonth = m,
      sYear = y,
      eMonth = m,
      eYear = y,
      eDayNum: number;
    if (sd === 1) {
      eDayNum = new Date(y, m, 0).getDate();
    } else {
      sMonth = m - 1;
      sYear = y;
      if (sMonth === 0) {
        sMonth = 12;
        sYear = y - 1;
      }
      eDayNum = sd - 1;
    }
    const startDate = new Date(sYear, sMonth - 1, sd);
    const endDate = new Date(eYear, eMonth - 1, eDayNum);
    const rangeLabel = `${String(sd).padStart(2, "0")}.${String(sMonth).padStart(2, "0")} – ${String(eDayNum).padStart(2, "0")}.${String(eMonth).padStart(2, "0")}`;
    return { startDate, endDate, rangeLabel };
  }

  function parseTxDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (s.includes("/")) {
      const p = s.split("/");
      let yr = +p[2];
      if (yr < 100) yr += 2000;
      return new Date(yr, +p[1] - 1, +p[0]);
    } else if (s.includes("-") && s.split("-").length === 3) {
      const p = s.split("-");
      return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    return null;
  }
  const [showPicker, setShowPicker] = useState(false);
  const [deletedMonthKeys, setDeletedMonthKeys] = useState<Set<string>>(
    new Set(),
  );
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [sourceType, setSourceType] = useState("");
  const [sourceNickname, setSourceNickname] = useState("");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    body?: string;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const sourceLabel = sourceType
    ? sourceNickname.trim()
      ? `${sourceType} — ${sourceNickname.trim()}`
      : sourceType
    : sourceNickname.trim();
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTxId, setActiveTxId] = useState(null);
  const [prevCatMapP, setPrevCatMapP] = useState<Record<string, string>>({});
  const [catSearch, setCatSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingRemember, setPendingRemember] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResults, setAnalyzeResults] = useState<
    {
      name: string;
      count: number;
      outOfRange?: number;
      rangeLabel?: string;
      error?: string;
    }[]
  >([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ניתוח אוטומטי כשמועלה קובץ וסוג מקור נבחר
  useEffect(() => {
    if (uploadedFiles.length > 0 && sourceType && !analyzing) {
      analyzeFiles();
    }
  }, [uploadedFiles, sourceType]); // eslint-disable-line react-hooks/exhaustive-deps

  // חודש נחשב "תפוס" רק אם יש לו לפחות submission אחד — ghost entries לא חוסמים בחירה מחדש
  const usedKeys = portfolioMonths
    .filter(
      (e) =>
        !deletedMonthKeys.has(e.month_key) &&
        portfolioSubs.some((s) => s.month_key === e.month_key),
    )
    .map((e) => e.month_key);

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
    await supabase
      .from("portfolio_months")
      .upsert(
        [{ client_id: clientId, month_key: key, label, is_finalized: false }],
        { onConflict: "client_id,month_key" },
      );
    // fetch fresh entry
    const { data: entry } = await supabase
      .from("portfolio_months")
      .select("*")
      .eq("client_id", clientId)
      .eq("month_key", key)
      .maybeSingle();
    const subs = await loadEntrySubs(key);
    const resolvedEntry = entry || {
      client_id: clientId,
      month_key: key,
      label,
      is_finalized: false,
    };
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
  const isNonParseable = (name: string) =>
    NON_PARSEABLE_EXTS.some((ext) => name.toLowerCase().endsWith(ext));

  const analyzeFiles = async () => {
    setAnalyzing(true);
    setAnalyzeResults([]);
    const results: {
      name: string;
      count: number;
      outOfRange?: number;
      rangeLabel?: string;
      error?: string;
    }[] = [];
    let allTx: any[] = [];
    const range = activeEntry ? getBillingRange(activeEntry.month_key) : null;
    for (const file of uploadedFiles) {
      if (isNonParseable(file.name)) {
        results.push({
          name: file.name,
          count: 0,
          error:
            "סוג קובץ זה אינו נתמך לניתוח אוטומטי — יש להמיר ל-Excel או CSV",
        });
        setAnalyzeResults([...results]);
        continue;
      }
      try {
        const buf = await file.arrayBuffer();
        let parsed: any[];
        if (file.name.toLowerCase().endsWith(".pdf")) {
          parsed = await parseBankPDF(
            buf,
            file.name,
            rememberedMappings,
            categoryRules,
          );
        } else {
          parsed = parseExcelData(
            buf,
            file.name,
            rememberedMappings,
            categoryRules,
          );
        }
        // סנן לפי טווח החודש הנבחר
        let outOfRange = 0;
        if (range) {
          const before = parsed.length;
          parsed = parsed.filter((tx) => {
            const d = parseTxDate(tx.date);
            if (!d) return true; // שמור אם לא ניתן לנתח את התאריך
            return d >= range.startDate && d <= range.endDate;
          });
          outOfRange = before - parsed.length;
        }
        allTx = allTx.concat(parsed);
        results.push({
          name: file.name,
          count: parsed.length,
          outOfRange,
          rangeLabel: range?.rangeLabel,
        });
      } catch (e: any) {
        results.push({
          name: file.name,
          count: 0,
          error: e?.message || "שגיאה בניתוח הקובץ",
        });
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
      const { error } = await supabase
        .from("portfolio_submissions")
        .update({
          transactions,
          source_label: sourceLabel,
          source_type: sourceType,
          source_nickname: sourceNickname,
        })
        .eq("id", editingSubId);
      setSaving(false);
      if (error) {
        alert("שגיאה בשמירה — " + error.message);
        return;
      }
    } else {
      // upload files to storage
      const storagePaths: string[] = [];
      for (const file of uploadedFiles) {
        const path = `${clientId}/portfolio-submissions/${activeEntry.month_key}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("client-documents")
          .upload(path, file, { upsert: true });
        if (!upErr) storagePaths.push(path);
        else console.error("storage upload error:", upErr);
      }
      // הוספת מקור חדש
      const { error } = await supabase.from("portfolio_submissions").insert([
        {
          client_id: clientId,
          month_key: activeEntry.month_key,
          label: sourceLabel || activeEntry.label,
          source_label: sourceLabel,
          source_type: sourceType,
          source_nickname: sourceNickname,
          files:
            storagePaths.length > 0
              ? storagePaths
              : uploadedFiles.map((f) => f.name),
          transactions,
          created_at: new Date().toISOString(),
        },
      ]);
      setSaving(false);
      if (error) {
        alert("שגיאה בשמירה — " + error.message);
        return;
      }
    }
    // reload fresh
    const subs = await loadEntrySubs(activeEntry.month_key);
    setEntrySubs(subs);
    setUploadedFiles([]);
    setTransactions([]);
    setSourceType("");
    setSourceNickname("");
    setEditingSubId(null);
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
      },
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
      },
    });
  };

  const deleteMonth = async (entry, e) => {
    e.stopPropagation();
    if (!window.confirm(`למחוק את ${entry.label} וכל הנתונים שלו?`)) return;
    // הסר מיידית מה-UI
    setDeletedMonthKeys((prev) => {
      const next = new Set(prev);
      next.add(entry.month_key);
      return next;
    });
    // מחק מה-DB — שניהם במקביל
    await Promise.all([
      supabase
        .from("portfolio_submissions")
        .delete()
        .eq("client_id", clientId)
        .eq("month_key", entry.month_key),
      supabase
        .from("portfolio_months")
        .delete()
        .eq("client_id", clientId)
        .eq("month_key", entry.month_key),
    ]);
  };

  const finalizeMonth = async () => {
    if (!window.confirm(`לסמן את ${activeEntry.label} כהושלם?`)) return;
    await supabase
      .from("portfolio_months")
      .update({ is_finalized: true })
      .eq("client_id", clientId)
      .eq("month_key", activeEntry.month_key);
    setStep("list");
    onDataChange(); // fire without await
  };

  const reopenMonth = async () => {
    await supabase
      .from("portfolio_months")
      .update({ is_finalized: false })
      .eq("client_id", clientId)
      .eq("month_key", activeEntry.month_key);
    setActiveEntry((p) => ({ ...p, is_finalized: false }));
    onDataChange(); // fire without await
  };

  const filteredTx = transactions.filter((t) => {
    if (filter === "low" && t.conf !== "low") return false;
    if (search) {
      const s = search.toLowerCase();
      if (!t.name.toLowerCase().includes(s) && !t.cat.toLowerCase().includes(s))
        return false;
    }
    return true;
  });

  // ══ RENDER ════════════════════════════════════════════════════════════════════
  if (step === "list")
    return (
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div style={{ fontWeight: 700 }}>חודשים בתיק</div>
          <Btn size="sm" onClick={() => setShowPicker(true)}>
            + הוסף חודש
          </Btn>
        </div>

        {portfolioMonths.length === 0 ? (
          <Card
            style={{
              textAlign: "center",
              padding: 48,
              color: "var(--text-dim)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 12,
                opacity: 0.4,
              }}
            >
              <DocIcon name="folder" color="var(--text-dim)" size={36} />
            </div>
            <div style={{ marginBottom: 16 }}>הוסף את החודש הראשון לתיק</div>
            <Btn onClick={() => setShowPicker(true)}>+ הוסף חודש</Btn>
          </Card>
        ) : (
          portfolioMonths
            .filter((entry) => !deletedMonthKeys.has(entry.month_key))
            .map((entry) => {
              const subs = portfolioSubs.filter(
                (s) => s.month_key === entry.month_key,
              );
              const allTx = subs.flatMap((s) => s.transactions || []);
              const total = allTx
                .filter((t) => !ignoredCats.has(t.cat))
                .reduce(
                  (sum, t) =>
                    sum + (incomeCats.has(t.cat) ? -t.amount : t.amount),
                  0,
                );
              return (
                <Card
                  key={entry.month_key}
                  style={{
                    marginBottom: 10,
                    border: `1px solid ${entry.is_finalized ? "rgba(46,204,138,0.25)" : "var(--border)"}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ flex: 1, cursor: "pointer" }}
                      onClick={() => openMonth(entry)}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{entry.label}</span>
                        {entry.is_finalized ? (
                          <span
                            style={{
                              background: "rgba(46,204,138,0.15)",
                              color: "var(--green-soft)",
                              borderRadius: 20,
                              padding: "2px 10px",
                              fontSize: 13,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <DocIcon
                              name="check-circle"
                              color="var(--green-soft)"
                              size={13}
                            />{" "}
                            הושלם
                          </span>
                        ) : (
                          <span
                            style={{
                              background: "rgba(255,183,77,0.12)",
                              color: "var(--gold)",
                              borderRadius: 20,
                              padding: "2px 10px",
                              fontSize: 13,
                            }}
                          >
                            בתהליך
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, color: "var(--text-dim)" }}>
                        {subs.length} מקורות · {allTx.length} תנועות · ₪
                        {Math.round(total).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteMonth(entry, e)}
                      style={{
                        background: "none",
                        border: "1px solid rgba(247,92,92,0.4)",
                        borderRadius: 7,
                        padding: "4px 12px",
                        fontSize: 14,
                        color: "var(--red)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        flexShrink: 0,
                        marginRight: 8,
                      }}
                    >
                      מחק
                    </button>
                  </div>
                </Card>
              );
            })
        )}
        {showPicker && (
          <MonthPickerModal
            usedMonths={usedKeys}
            onConfirm={onMonthConfirmed}
            onCancel={() => setShowPicker(false)}
          />
        )}
      </div>
    );

  // ══ MONTH DETAIL ══════════════════════════════════════════════════════════════
  if (step === "month") {
    if (!activeEntry)
      return (
        <div
          style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}
        >
          <Spinner />
        </div>
      );
    const allTx = entrySubs.flatMap((s) => s.transactions || []);
    const total = allTx
      .filter((t) => !ignoredCats.has(t.cat))
      .reduce(
        (sum, t) => sum + (incomeCats.has(t.cat) ? -t.amount : t.amount),
        0,
      );
    const catMap: Record<string, number> = {};
    allTx.forEach((t) => {
      catMap[t.cat] =
        (catMap[t.cat] || 0) + (incomeCats.has(t.cat) ? -t.amount : t.amount);
    });

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <Btn variant="ghost" size="sm" onClick={() => setStep("list")}>
            חזור ←
          </Btn>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 20 }}>
                {activeEntry.label}
              </span>
              {activeEntry.is_finalized ? (
                <span
                  style={{
                    background: "rgba(46,204,138,0.15)",
                    color: "var(--green-soft)",
                    borderRadius: 20,
                    padding: "2px 10px",
                    fontSize: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <DocIcon
                    name="check-circle"
                    color="var(--green-soft)"
                    size={14}
                  />{" "}
                  הושלם
                </span>
              ) : entrySubs.length === 0 ? (
                <span
                  style={{
                    background: "rgba(255,183,77,0.12)",
                    color: "var(--gold)",
                    borderRadius: 20,
                    padding: "2px 10px",
                    fontSize: 14,
                  }}
                >
                  בתהליך
                </span>
              ) : null}
            </div>
            <div style={{ fontSize: 15, color: "var(--text-dim)" }}>
              {entrySubs.length} מקורות · {allTx.length} תנועות · ₪
              {Math.round(total).toLocaleString()}
            </div>
          </div>
          {activeEntry.is_finalized && (
            <Btn variant="ghost" size="sm" onClick={reopenMonth}>
              <DocIcon name="unlock" size={13} /> פתח לעריכה
            </Btn>
          )}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
            gap: 16,
          }}
        >
          {/* סיכום לפי סעיף */}
          <Card>
            <div
              style={{
                fontWeight: 700,
                marginBottom: 12,
                fontSize: 18,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <DocIcon name="bar-chart" size={16} /> סיכום לפי סעיף
            </div>
            {allTx.length === 0 ? (
              <div
                style={{
                  color: "var(--text-dim)",
                  fontSize: 14,
                  textAlign: "center",
                  padding: "16px 0",
                }}
              >
                אין תנועות עדיין
              </div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {Object.entries(catMap)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => (
                    <div
                      key={cat}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 0",
                        borderBottom: `1px solid ${"var(--border)"}22`,
                        fontSize: 14,
                      }}
                    >
                      <span>{cat}</span>
                      <span style={{ fontWeight: 700, color: "var(--red)" }}>
                        ₪{Math.round(amt).toLocaleString()}
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </Card>

          {/* מקורות */}
          <Card>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <DocIcon name="folder" color="var(--green-deep)" size={18} />{" "}
                מקורות
              </div>
              <Btn size="sm" onClick={goToUpload}>
                + הוסף מקור
              </Btn>
            </div>
            {entrySubs.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-dim)",
                  fontSize: 14,
                  padding: "20px 0",
                }}
              >
                עוד לא הוספת מקורות לחודש זה
              </div>
            ) : (
              entrySubs.map((sub) => (
                <div
                  key={sub.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: `1px solid ${"var(--border)"}22`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>
                      {sub.source_label || sub.label}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                      {(sub.transactions || []).length} תנועות
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => editSub(sub)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 7,
                        padding: "3px 10px",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <DocIcon
                        name="pencil"
                        color="var(--text-dim)"
                        size={13}
                      />{" "}
                      ערוך
                    </button>
                    <button
                      onClick={() => confirmDeleteSub(sub)}
                      style={{
                        background: "none",
                        border: "1px solid rgba(247,92,92,0.4)",
                        borderRadius: 7,
                        padding: "3px 10px",
                        fontSize: 13,
                        color: "var(--red)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <DocIcon name="trash" color="var(--red)" size={13} />
                    </button>
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
    if (!activeEntry) {
      setStep("list");
      return null;
    }
    return (
      <div style={{ maxWidth: 580, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <Btn variant="ghost" size="sm" onClick={() => setStep("month")}>
            חזור ←
          </Btn>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            הוסף מקור — {activeEntry?.label}
          </div>
        </div>

        <Card style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>
            שם המקור
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: sourceType ? 12 : 0,
            }}
          >
            {["כרטיס אשראי", 'עו"ש', "אחר"].map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => {
                  setSourceType(s === sourceType ? "" : s);
                  setSourceNickname("");
                }}
                style={{
                  padding: "12px 28px",
                  borderRadius: 12,
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  border: `2px solid ${sourceType === s ? "var(--green-mid)" : "var(--border)"}`,
                  background:
                    sourceType === s ? "var(--green-mint)" : "var(--surface2)",
                  color:
                    sourceType === s ? "var(--green-deep)" : "var(--text-dim)",
                  boxShadow:
                    sourceType === s ? "0 2px 8px rgba(45,106,79,0.2)" : "none",
                  transition: "all 0.15s",
                }}
              >
                {s}
              </button>
            ))}
          </div>
          {sourceType && (
            <div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-dim)",
                  marginBottom: 5,
                }}
              >
                {sourceType === "כרטיס אשראי"
                  ? "כינוי הכרטיס (אופציונלי) — למשל: ויזה לאומי, מאסטרקארד עבודה"
                  : sourceType === "אחר"
                    ? "שם חופשי (אופציונלי)"
                    : "כינוי (אופציונלי) — למשל: לאומי, פועלים"}
              </div>
              <input
                value={sourceNickname}
                onChange={(e) => setSourceNickname(e.target.value)}
                placeholder={
                  sourceType === "כרטיס אשראי"
                    ? "משה אשראי עבודה"
                    : sourceType === "אחר"
                      ? "למשל: קופת גמל, ביטקוין..."
                      : `למשל: ${sourceType} לאומי`
                }
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "9px 12px",
                  color: "var(--text)",
                  fontSize: 15,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              {sourceLabel && (
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    marginTop: 5,
                  }}
                >
                  שם המקור:{" "}
                  <strong style={{ color: "var(--green-deep)" }}>
                    {sourceLabel}
                  </strong>
                </div>
              )}
            </div>
          )}
        </Card>

        <div
          style={{
            textAlign: "center",
            padding: "24px 20px",
            marginBottom: 14,
            border: `2px dashed ${dragOver ? "var(--green-mid)" : "var(--border)"}`,
            borderRadius: 12,
            background: dragOver ? "var(--green-mint)" : "var(--surface)",
            transition: "border-color 0.15s, background 0.15s",
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const files = Array.from(e.dataTransfer.files) as File[];
            setUploadedFiles((p) => [
              ...p,
              ...files.filter(
                (f: File) => !p.find((u: File) => u.name === f.name),
              ),
            ]);
          }}
        >
          <div style={{ marginBottom: 8 }}>
            {dragOver ? (
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--green-mid)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            ) : (
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--green-mid)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
            )}
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
            {dragOver ? "שחרר להוספה" : "גרור קבצים לכאן"}
          </div>
          <div
            style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 12 }}
          >
            Excel, CSV, PDF
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.doc,.docx,.txt,.ods"
            multiple
            style={{ display: "none" }}
            onChange={(e) =>
              setUploadedFiles((p) => [
                ...p,
                ...Array.from(e.target.files as FileList).filter(
                  (f: File) => !p.find((u: File) => u.name === f.name),
                ),
              ])
            }
          />
          <Btn size="sm" onClick={() => fileRef.current?.click()}>
            בחר קבצים
          </Btn>
        </div>

        {uploadedFiles.length > 0 && (
          <Card style={{ marginBottom: 14 }}>
            {uploadedFiles.map((f, i) => {
              const res = analyzeResults.find((r) => r.name === f.name);
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "6px 0",
                    borderBottom:
                      i < uploadedFiles.length - 1
                        ? `1px solid ${"var(--border)"}22`
                        : "none",
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-dim)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {f.name}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    {res && (
                      <span
                        style={{
                          fontSize: 13,
                          color: res.error
                            ? "var(--red)"
                            : res.count === 0
                              ? "var(--gold)"
                              : "var(--green-soft)",
                        }}
                      >
                        {res.error
                          ? res.error
                          : res.count === 0
                            ? "לא זוהו תנועות"
                            : res.rangeLabel
                              ? `✓ ${res.count} תנועות נוספו לטווח ${res.rangeLabel}${(res.outOfRange || 0) > 0 ? ` • ${res.outOfRange} מחוץ לטווח` : ""}`
                              : `✓ ${res.count} תנועות`}
                      </span>
                    )}
                    {analyzing && !res && (
                      <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                        מנתח...
                      </span>
                    )}
                    <button
                      onClick={() =>
                        setUploadedFiles((p) => p.filter((_, j) => j !== i))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--red)",
                        cursor: "pointer",
                        fontSize: 18,
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {analyzeResults.length > 0 &&
          !analyzing &&
          analyzeResults.every((r) => r.count === 0) && (
            <div
              style={{
                background: "rgba(255,183,77,0.1)",
                border: "1px solid var(--gold)",
                borderRadius: 8,
                padding: "10px 14px",
                marginBottom: 12,
                fontSize: 14,
                color: "var(--gold)",
              }}
            >
              לא זוהו תנועות באף קובץ. בדוק שהקבצים הם Excel/CSV עם עמודות
              תאריך, שם עסק וסכום.
            </div>
          )}

        <Btn
          onClick={analyzeFiles}
          disabled={uploadedFiles.length === 0 || !sourceType || analyzing}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {analyzing ? "מנתח..." : "נתח תנועות ←"}
        </Btn>
      </div>
    );
  }

  // ══ REVIEW ════════════════════════════════════════════════════════════════════
  if (step === "review")
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => {
                const wasEditing = !!editingSubId;
                setEditingSubId(null);
                setStep(wasEditing ? "month" : "upload");
              }}
            >
              חזור ←
            </Btn>
            <div
              style={{
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <DocIcon name="pencil" color="var(--text)" size={15} />{" "}
              {editingSubId ? "עריכת" : "סיווג"} תנועות — {sourceLabel}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, color: "var(--text-dim)" }}>
              {transactions.length} תנועות
            </span>
            <Btn size="sm" onClick={saveSource} disabled={saving}>
              <DocIcon name="save" color="#fff" size={13} />{" "}
              {saving ? "שומר..." : "שמור"}
            </Btn>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          {[
            ["all", "הכל"],
            ["low", "ביטחון נמוך"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
                border: `1px solid ${filter === v ? "var(--green-mid)" : "var(--border)"}`,
                background: filter === v ? "var(--green-mint)" : "transparent",
                color: filter === v ? "var(--green-deep)" : "var(--text-mid)",
              }}
            >
              {l}
            </button>
          ))}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש..."
            style={{
              flex: 1,
              minWidth: 120,
              background: "var(--surface2)",
              border: `1px solid ${"var(--border)"}`,
              borderRadius: 20,
              padding: "4px 12px",
              color: "var(--text)",
              fontSize: 14,
              fontFamily: "inherit",
              outline: "none",
            }}
          />
        </div>

        <RememberModal
          pendingRemember={pendingRemember}
          onAlways={async () => {
            const { name, cat, budgetType } = pendingRemember;
            const oldCat = rememberedMappings[name] || null;
            await supabase
              .from("remembered_mappings")
              .upsert(
                [{ client_id: clientId, business_name: name, category: cat, budget_type: budgetType }],
                { onConflict: "client_id,business_name" },
              );
            await supabase
              .from("client_change_log")
              .insert([
                {
                  client_id: clientId,
                  event_type: "remap_business",
                  details: {
                    business_name: name,
                    from_cat: oldCat,
                    to_cat: cat,
                  },
                },
              ]);
            onRememberingAdded?.(name, cat);
            setTransactions((p) =>
              p.map((t) =>
                t.name === name
                  ? { ...t, cat, budget_type: budgetType, edited: true }
                  : t,
              ),
            );
            setPendingRemember(null);
          }}
          onJustHere={() => setPendingRemember(null)}
        />

        {(() => {
          const isPdf = (tx: any) =>
            (tx.source || "").toLowerCase().endsWith(".pdf");
          const toggleFlowType = (id: any) => {
            setTransactions((prev) =>
              prev.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      flow_type:
                        t.flow_type === "credit_transfer"
                          ? "expense"
                          : "credit_transfer",
                    }
                  : t,
              ),
            );
          };

          const incomeTxs = filteredTx.filter((tx) => tx.maxCat === "הכנסות");
          const creditTransferTxs = filteredTx.filter(
            (tx) =>
              tx.maxCat !== "הכנסות" && tx.flow_type === "credit_transfer",
          );
          const expenseTxs = filteredTx.filter(
            (tx) =>
              tx.maxCat !== "הכנסות" && tx.flow_type !== "credit_transfer",
          );
          const hasIncome = incomeTxs.length > 0;
          const hasTransfers = creditTransferTxs.length > 0;

          const clearKnown = async (businessName: string) => {
            await supabase
              .from("remembered_mappings")
              .delete()
              .eq("client_id", clientId)
              .eq("business_name", businessName);
            onRememberingAdded(businessName, "");
          };
          const renderCard = (tx: any, inTransferSection = false) => {
            const isKnown = !!rememberedMappings[tx.name];
            const needsCat =
              tx.conf === "low" &&
              (tx.cat === "הוצאות לא מתוכננות" || tx.cat === "דרוש סיווג") &&
              isPdf(tx) &&
              !inTransferSection;
            return (
              <div
                key={tx.id}
                style={{ position: "relative", marginBottom: 8 }}
              >
                <Card
                  style={{
                    padding: "12px 16px",
                    opacity: inTransferSection ? 0.85 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span style={{ fontWeight: 600, fontSize: 16 }}>
                          {tx.name}
                        </span>
                        {!isKnown && (
                          <span
                            style={{
                              fontSize: 12,
                              padding: "2px 6px",
                              borderRadius: 10,
                              fontWeight: 600,
                              background: "rgba(255,183,77,0.12)",
                              color: "var(--gold)",
                              border: "1px solid rgba(255,183,77,0.3)",
                            }}
                          >
                            חדש
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 15, color: "var(--text-dim)" }}>
                        {tx.date}
                      </div>
                      {tx.note && (
                        <div
                          style={{
                            fontSize: 14,
                            color: "var(--text-mid)",
                            marginTop: 3,
                            fontStyle: "italic",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <DocIcon
                            name="pencil"
                            color="var(--text-dim)"
                            size={12}
                          />
                          {tx.note}
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          color:
                            tx.maxCat === "הכנסות"
                              ? "var(--green-mid)"
                              : "var(--red)",
                          fontSize: 16,
                        }}
                      >
                        {tx.maxCat === "הכנסות" ? "+" : ""}₪
                        {tx.amount?.toLocaleString()}
                      </span>
                      {!inTransferSection && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTxId(
                                activeTxId === tx.id ? null : tx.id,
                              );
                              setCatSearch("");
                            }}
                            style={{
                              background: needsCat
                                ? "rgba(255,193,7,0.12)"
                                : "var(--green-mint)",
                              border: `1px solid ${needsCat ? "rgba(255,193,7,0.6)" : "var(--green-soft)"}`,
                              borderRadius: 8,
                              padding: "5px 12px",
                              fontSize: 15,
                              color: needsCat
                                ? "var(--gold)"
                                : "var(--green-deep)",
                              cursor: "pointer",
                              fontFamily: "inherit",
                              fontWeight: 600,
                            }}
                          >
                            {needsCat ? "דרוש סיווג" : tx.cat}
                          </button>
                          {tx.cat !== "להתעלם" ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPrevCatMapP((p) => ({
                                  ...p,
                                  [tx.id]: tx.cat,
                                }));
                                setTransactions((p) =>
                                  p.map((t) =>
                                    t.id === tx.id
                                      ? {
                                          ...t,
                                          cat: "להתעלם",
                                          edited: true,
                                          conf: "high",
                                        }
                                      : t,
                                  ),
                                );
                                setActiveTxId(null);
                              }}
                              title="התעלם מתנועה זו — לא תיספר"
                              style={{
                                background: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 15,
                                color: "var(--text-dim)",
                                cursor: "pointer",
                                fontFamily: "inherit",
                              }}
                            >
                              ⊘
                            </button>
                          ) : prevCatMapP[tx.id] ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const prev = prevCatMapP[tx.id];
                                setTransactions((p) =>
                                  p.map((t) =>
                                    t.id === tx.id
                                      ? {
                                          ...t,
                                          cat: prev,
                                          edited: true,
                                          conf: "high",
                                        }
                                      : t,
                                  ),
                                );
                                setPrevCatMapP((p) => {
                                  const n = { ...p };
                                  delete n[tx.id];
                                  return n;
                                });
                              }}
                              title="בטל התעלמות"
                              style={{
                                background: "var(--green-mint)",
                                border: "1px solid var(--green-soft)",
                                borderRadius: 8,
                                padding: "5px 10px",
                                fontSize: 13,
                                color: "var(--green-deep)",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                whiteSpace: "nowrap",
                              }}
                            >
                              ↩️ {prevCatMapP[tx.id]}
                            </button>
                          ) : null}
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTxId(
                            activeTxId === `note_${tx.id}`
                              ? null
                              : `note_${tx.id}`,
                          );
                        }}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "5px 10px",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text-dim)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                        title="הוסף הערה"
                      >
                        <DocIcon
                          name="note"
                          color="var(--text-dim)"
                          size={14}
                        />
                      </button>
                      {isPdf(tx) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFlowType(tx.id);
                          }}
                          title={
                            inTransferSection
                              ? "הזז להוצאות רגילות"
                              : "סמן כחיוב אשראי — לא ייספר בהוצאות"
                          }
                          style={{
                            background: inTransferSection
                              ? "var(--green-mint)"
                              : "transparent",
                            border: `1px solid ${inTransferSection ? "var(--green-soft)" : "var(--border)"}`,
                            borderRadius: 8,
                            padding: "5px 10px",
                            fontSize: 14,
                            color: inTransferSection
                              ? "var(--green-deep)"
                              : "var(--text-dim)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {inTransferSection ? "↩ הוצאה" : "כלול בכרטיס"}
                        </button>
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
                      onSelect={(cat, budgetType) => {
                        setTransactions((p) =>
                          p.map((t) =>
                            t.id === tx.id
                              ? { ...t, cat, budget_type: budgetType, edited: true, conf: "high" }
                              : t,
                          ),
                        );
                        setActiveTxId(null);
                        setCatSearch("");
                        setPendingRemember({ name: tx.name, cat, budgetType });
                      }}
                    />
                  )}
                  {activeTxId === `note_${tx.id}` && (
                    <div style={{ marginTop: 8 }}>
                      <input
                        autoFocus
                        value={tx.note || ""}
                        onChange={(e) =>
                          setTransactions((p) =>
                            p.map((t) =>
                              t.id === tx.id
                                ? { ...t, note: e.target.value }
                                : t,
                            ),
                          )
                        }
                        placeholder="הוסף הערה לעסקה זו..."
                        style={{
                          width: "100%",
                          background: "var(--surface2)",
                          border: "1.5px solid var(--green-soft)",
                          borderRadius: 8,
                          padding: "7px 12px",
                          color: "var(--text)",
                          fontFamily: "inherit",
                          fontSize: 15,
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === "Escape")
                            setActiveTxId(null);
                        }}
                      />
                    </div>
                  )}
                </Card>
                {isKnown && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearKnown(tx.name);
                    }}
                    title={`סיווג שמור: "${rememberedMappings[tx.name]}". לחץ לביטול`}
                    style={{
                      position: "absolute",
                      left: -8,
                      top: "50%",
                      transform: "translate(-100%,-50%)",
                      background: "rgba(46,160,67,0.08)",
                      border: "1px solid rgba(46,160,67,0.25)",
                      borderRadius: 20,
                      padding: "4px 10px",
                      cursor: "pointer",
                      fontSize: 11,
                      color: "var(--green-deep)",
                      whiteSpace: "nowrap",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 13 }}>✓</span>
                    <span>סיווג שמור</span>
                    <span style={{ fontSize: 13, opacity: 0.6 }}>×</span>
                  </button>
                )}
              </div>
            );
          };

          return (
            <>
              {hasIncome && (
                <>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 20,
                      color: "var(--green-deep)",
                      marginBottom: 10,
                      marginTop: 8,
                      padding: "10px 14px",
                      background: "var(--green-mint)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "2px solid var(--green-soft)",
                    }}
                  >
                    הכנסות{" "}
                    <span
                      style={{
                        fontWeight: 500,
                        color: "var(--green-mid)",
                        fontSize: 16,
                      }}
                    >
                      ({incomeTxs.length})
                    </span>
                  </div>
                  {incomeTxs.map((tx) => renderCard(tx, false))}
                </>
              )}
              {expenseTxs.length > 0 && (
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 20,
                    color: "var(--red)",
                    marginBottom: 10,
                    marginTop: hasIncome ? 16 : 8,
                    padding: "10px 14px",
                    background: "var(--red-light)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderBottom: "2px solid var(--red)",
                  }}
                >
                  הוצאות{" "}
                  <span
                    style={{
                      fontWeight: 500,
                      color: "var(--text-dim)",
                      fontSize: 16,
                    }}
                  >
                    ({expenseTxs.length})
                  </span>
                </div>
              )}
              {expenseTxs.map((tx) => renderCard(tx, false))}
              {hasTransfers && (
                <>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 20,
                      color: "var(--text-dim)",
                      marginBottom: 6,
                      marginTop: 20,
                      padding: "10px 14px",
                      background: "var(--surface2)",
                      borderRadius: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      borderBottom: "2px solid var(--border)",
                    }}
                  >
                    חיובי אשראי{" "}
                    <span
                      style={{
                        fontWeight: 500,
                        color: "var(--text-dim)",
                        fontSize: 16,
                      }}
                    >
                      ({creditTransferTxs.length})
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      color: "var(--text-dim)",
                      background: "rgba(255,183,77,0.08)",
                      border: "1px solid rgba(255,183,77,0.25)",
                      borderRadius: 8,
                      padding: "8px 14px",
                      marginBottom: 10,
                    }}
                  >
                    תנועות אלו הן תשלומי כרטיס אשראי —{" "}
                    <strong>לא נספרות כהוצאה</strong> כדי למנוע כפילות עם נתוני
                    מקס/ישראכרט. לחץ על "הוצאה" כדי להעביר להוצאות.
                  </div>
                  {creditTransferTxs.map((tx) => renderCard(tx, true))}
                </>
              )}
            </>
          );
        })()}

        {/* Save button at bottom */}
        <div
          style={{
            position: "sticky",
            bottom: 20,
            display: "flex",
            justifyContent: "center",
            marginTop: 16,
          }}
        >
          <Btn
            onClick={saveSource}
            disabled={saving}
            style={{
              boxShadow: "0 4px 20px rgba(45,106,79,0.3)",
              padding: "12px 36px",
              fontSize: 17,
            }}
          >
            <DocIcon name="save" color="#fff" size={15} />{" "}
            {saving ? "שומר..." : "שמור את כל הסיווגים"}
          </Btn>
        </div>
      </div>
    );

  return null;
}

// ── Portfolio Control Tab ─────────────────────────────────────────────────────
// ── assignBillingMonth ────────────────────────────────────────────────────────
// date: "DD/MM/YYYY" or "YYYY-MM-DD" → "YYYY-MM" based on cycleStartDay

// מחזיר את התסריט שחל על חודש נתון (year, month 1-12).
// "year" → ינואר של אותה שנה. "month_year" → החודש הספציפי. "free" → מדולג.
// אם אין תסריט מתאים — מחזיר is_base. אם אין בכלל — null.
function scenarioCmp(s: any): number | null {
  if (s.date_type === "month_year") {
    const val = s.date_value || "";
    let m: number, y: number;
    if (val.includes("/")) {
      const p = val.split("/").map(Number);
      [m, y] = [p[0], p[1]];
    } else {
      const p = val.split("-").map(Number);
      [y, m] = [p[0], p[1]];
    }
    if (!m || !y || isNaN(m) || isNaN(y)) return null;
    return y * 12 + m;
  }
  if (s.date_type === "year") {
    const y = parseInt(s.date_value);
    return isNaN(y) ? null : y * 12 + 1;
  }
  return null;
}

function scenarioForMonth(scenarios: any[], year: number, month: number): any | null {
  if (!scenarios || scenarios.length === 0) return null;
  const target = year * 12 + month;
  let best: any = null;
  let bestCmp = -Infinity;
  for (const s of scenarios) {
    const cmp = scenarioCmp(s);
    if (cmp !== null && cmp <= target && cmp > bestCmp) { best = s; bestCmp = cmp; }
  }
  return best ?? scenarios.find((s) => s.is_base) ?? null;
}

const BT_TO_ITYPE: Record<string, string> = {
  "הכנסה": "income",
  "קבוע": "expense_fixed",
  "משתנה": "expense_variable",
};

function PortfolioControlTab({
  clientId,
  portfolioMonths,
  portfolioSubs,
  cycleStartDay,
  importedTxs,
  manualTxs,
  bankTxs = [] as any[],
  rememberedMappings,
  onCycleStartDayChange,
  ignoredCats = IGNORED_CATEGORIES,
  incomeCats = new Set<string>(),
  categoryRules = [] as any[],
}) {
  const NOW_YEAR = new Date().getFullYear();
  const NOW_MONTH = new Date().getMonth() + 1; // 1–12
  const NOW_DAY = new Date().getDate();

  const [editingCycleDay, setEditingCycleDay] = useState(false);
  const [tempDay, setTempDay] = useState(String(cycleStartDay));
  const [savingDay, setSavingDay] = useState(false);

  const saveCycleDay = async () => {
    const d = parseInt(tempDay);
    if (isNaN(d) || d < 1 || d > 31) return;
    setSavingDay(true);
    await supabase
      .from("clients")
      .update({ cycle_start_day: d })
      .eq("id", clientId);
    if (onCycleStartDayChange) onCycleStartDayChange(d);
    setSavingDay(false);
    setEditingCycleDay(false);
  };

  const [selectedYear, setSelectedYear] = useState(NOW_YEAR);
  const [publishedRows, setPublishedRows] = useState<any[] | null>(null);
  const [publishedScenarios, setPublishedScenarios] = useState<any[] | null>(null);
  const [publishedEntries, setPublishedEntries] = useState<any[] | null>(null);
  const [sortCol, setSortCol] = useState(null); // null|"name"|"budget"|"avg"|"rem"|mk
  const [sortDir, setSortDir] = useState("desc");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // { income|fixed|variable: bool }
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [drillDown, setDrillDown] = useState(null); // { cat, mk } — mk=null means all months

  // Flat list of individual transactions for drill-down
  const allNormTxs = useMemo(() => {
    const result = [];
    portfolioSubs.forEach((sub) => {
      const mk = sub.month_key;
      if (!mk) return;
      (sub.transactions || []).forEach((tx) => {
        if (ignoredCats.has(tx.cat)) return;
        result.push({
          mk,
          cat: tx.cat || "דרוש סיווג",
          amount: Number(tx.amount || 0),
          name: tx.name || "",
          date: tx.date || "",
          source: sub.source_label || "קובץ",
        });
      });
    });
    (importedTxs || []).forEach((tx) => {
      if ((tx.amount || 0) <= 0) return;
      const mk =
        tx.billing_month || assignBillingMonth(tx.date, cycleStartDay || 1);
      if (!mk) return;
      const cat =
        tx.cat ||
        classifyTx(
          tx.name,
          tx.max_category,
          rememberedMappings || {},
          categoryRules,
        ).cat;
      if (ignoredCats.has(cat)) return;
      result.push({
        mk,
        cat,
        amount: Number(tx.amount || 0),
        name: tx.name || "",
        date: tx.date || "",
        source: "מקס",
      });
    });
    (manualTxs || []).forEach((tx) => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month;
      if (!mk) return;
      if (ignoredCats.has(tx.cat)) return;
      result.push({
        mk,
        cat: tx.cat,
        amount: Number(tx.amount || 0),
        name: tx.name || "",
        date: tx.date || "",
        source: tx.payment_method ? `ידני — ${tx.payment_method}` : "ידני",
      });
    });
    return result;
  }, [
    portfolioSubs,
    importedTxs,
    manualTxs,
    rememberedMappings,
    cycleStartDay,
  ]);

  const currentYear = selectedYear;

  // ── Published scenario helpers ────────────────────────────────────────────
  const entriesLookup = useMemo(() => {
    const lk: Record<string, Record<string, Record<string, number>>> = {};
    (publishedEntries || []).forEach((e: any) => {
      if (!lk[e.scenario_id]) lk[e.scenario_id] = {};
      if (!lk[e.scenario_id][e.category]) lk[e.scenario_id][e.category] = {};
      lk[e.scenario_id][e.category][e.budget_type] = Number(e.amount || 0);
    });
    return lk;
  }, [publishedEntries]);

  const getBudgetForMonth = (cat: string, budgetType: string, m: number): number => {
    if (!publishedScenarios || publishedScenarios.length === 0) return 0;
    const sc = scenarioForMonth(publishedScenarios, currentYear, m);
    if (!sc) return 0;
    return entriesLookup[sc.id]?.[cat]?.[budgetType] ?? 0;
  };

  const getWeightedBudget = (cat: string, budgetType: string): number => {
    if (!publishedScenarios || publishedScenarios.length === 0) return 0;
    return Array.from({ length: 12 }, (_, i) => i + 1)
      .reduce((s, m) => s + getBudgetForMonth(cat, budgetType, m), 0) / 12;
  };

  const getCumBudget = (cat: string, budgetType: string): number =>
    Array.from({ length: Math.max(0, currentMonth - firstScenarioMonth + 1) }, (_, i) => i + firstScenarioMonth)
      .reduce((s, m) => s + getBudgetForMonth(cat, budgetType, m), 0);

  const { applyOrder } = useCategoryOrder(Number(clientId));

  const scenarioItems = useMemo(() => {
    if (publishedRows === null) return null;
    const raw = publishedRows.map((r: any) => ({
      id: `${r.category}__${r.budget_type}`,
      category_name: r.category,
      budget_type: r.budget_type,
      item_type: BT_TO_ITYPE[r.budget_type] || "expense_variable",
      amount: 0,
    }));
    // החל סדר שמור — אותו סדר כמו בלשונית מאזן מבוסס תסריטים
    const order = (bt: string) =>
      applyOrder(
        raw.filter(r => r.budget_type === bt).map(r => ({ category: r.category_name })),
        bt as any,
      ).map(o => o.category);
    return ["הכנסה", "קבוע", "משתנה"].flatMap(bt =>
      order(bt).map(cat => raw.find(r => r.category_name === cat && r.budget_type === bt)!)
    ).filter(Boolean);
  }, [publishedRows, applyOrder]);

  // currentMonth = billing month elapsed (accounts for cycleStartDay)
  // e.g. March 24 + cycleStartDay=15 → billing month = April = 4
  const currentMonth = (() => {
    if (selectedYear < NOW_YEAR) return 12;
    if (selectedYear > NOW_YEAR) return 0;
    const raw = NOW_DAY >= (cycleStartDay || 1) ? NOW_MONTH + 1 : NOW_MONTH;
    return Math.min(raw, 12);
  })();

  const MONTHS_HE = [
    "ינ׳",
    "פב׳",
    "מר׳",
    "אפ׳",
    "מי׳",
    "יו׳",
    "יל׳",
    "אוג׳",
    "ספ׳",
    "אוק׳",
    "נו׳",
    "דצ׳",
  ];

  // ── Load published scenario data (+ Realtime sync) ───────────────────────
  useEffect(() => {
    const fetchPublished = () =>
      Promise.all([
        supabase.from("portfolio_scenario_published_rows")
          .select("category, budget_type")
          .eq("client_id", clientId),
        supabase.from("portfolio_scenario_published_scenarios")
          .select("id, date_type, date_value, is_base, sort_order, title")
          .eq("client_id", clientId)
          .order("sort_order"),
        supabase.from("portfolio_scenario_published_entries")
          .select("scenario_id, category, budget_type, amount")
          .eq("client_id", clientId),
      ]).then(([{ data: rows }, { data: sc }, { data: en }]) => {
        setPublishedRows(rows || []);
        setPublishedScenarios(sc || []);
        setPublishedEntries(en || []);
      });

    setPublishedRows(null);
    setPublishedScenarios(null);
    setPublishedEntries(null);
    fetchPublished();

    const channel = supabase
      .channel(`portfolio-published-${clientId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_scenario_published_scenarios", filter: `client_id=eq.${clientId}` }, fetchPublished)
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_scenario_published_entries", filter: `client_id=eq.${clientId}` }, fetchPublished)
      .on("postgres_changes", { event: "*", schema: "public", table: "portfolio_scenario_published_rows", filter: `client_id=eq.${clientId}` }, fetchPublished)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [clientId]); // eslint-disable-line

  // ── Build txMap: שני מפות נפרדות — הכנסות והוצאות ────────────────────────
  const { incomeMap, expenseMap, expenseMapTyped } = useMemo(() => {
    const inc = {};
    const exp = {};
    const expTyped = {};
    const add = (map, mk, cat, amt) => {
      if (!mk || !cat || !amt) return;
      if (!map[mk]) map[mk] = {};
      map[mk][cat] = (map[mk][cat] || 0) + amt;
    };
    // הוצאות ידניות עם budget_type ידוע (קבוע/משתנה) — נצברות בנפרד לפי
    // `${cat}::${budget_type}` כדי שקטגוריה שקיימת גם כקבוע וגם כמשתנה
    // (אותו שם, שני budget_type) לא "תדלוף" לשתי השורות. ר' v44_manual_tx_budget_type.
    const addTyped = (mk, cat, bt, amt) => {
      if (!mk || !cat || !bt || !amt) return;
      if (!expTyped[mk]) expTyped[mk] = {};
      const key = `${cat}::${bt}`;
      expTyped[mk][key] = (expTyped[mk][key] || 0) + amt;
    };
    // From portfolio submissions — budget_type ידוע (קבוע/משתנה) הולך ל-bucket
    // המסווג בלבד, כמו manual, כדי שלא "יידלוף" לשתי השורות (ר' v45).
    portfolioSubs.forEach((sub) => {
      const mk = sub.month_key;
      if (!mk || +mk.split("-")[0] !== currentYear) return;
      (sub.transactions || []).forEach((tx) => {
        if (ignoredCats.has(tx.cat)) return;
        if (tx.flow_type === "credit_transfer") return;
        const cat = tx.cat || "דרוש סיווג";
        if (incomeCats.has(cat)) {
          add(inc, mk, cat, tx.amount || 0);
        } else if (tx.budget_type === "קבוע" || tx.budget_type === "משתנה") {
          addTyped(mk, cat, tx.budget_type, tx.amount || 0);
        } else {
          add(exp, mk, cat, tx.amount || 0);
        }
      });
    });
    // From imported transactions — אותו עיקרון
    (importedTxs || []).forEach((tx) => {
      if ((tx.amount || 0) <= 0) return;
      const mk =
        tx.billing_month || assignBillingMonth(tx.date, cycleStartDay || 1);
      if (!mk || +mk.split("-")[0] !== currentYear) return;
      const cat =
        tx.cat ||
        classifyTx(
          tx.name,
          tx.max_category,
          rememberedMappings || {},
          categoryRules,
        ).cat;
      if (ignoredCats.has(cat)) return;
      if (incomeCats.has(cat)) {
        add(inc, mk, cat, tx.amount);
      } else if (tx.budget_type === "קבוע" || tx.budget_type === "משתנה") {
        addTyped(mk, cat, tx.budget_type, tx.amount);
      } else {
        add(exp, mk, cat, tx.amount);
      }
    });
    // From bank_transactions (סנכרון MAX חי) — אותו עיקרון כמו imported. תנועות
    // pending (טרם נקלטו סופית) לא נכללות בכלל, כמו ב-AllTransactionsTab — לא
    // רוצים להציג למשתמש הוצאה שעוד עשויה להתבטל/להשתנות.
    (bankTxs || []).forEach((tx) => {
      if (tx.status === "pending") return;
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month;
      if (!mk || +mk.split("-")[0] !== currentYear) return;
      const cat =
        tx.cat ||
        classifyTx(
          tx.merchant_name,
          tx.category_raw,
          rememberedMappings || {},
          categoryRules,
        ).cat;
      if (ignoredCats.has(cat)) return;
      if (incomeCats.has(cat)) {
        add(inc, mk, cat, tx.amount);
      } else if (tx.budget_type === "קבוע" || tx.budget_type === "משתנה") {
        addTyped(mk, cat, tx.budget_type, tx.amount);
      } else {
        add(exp, mk, cat, tx.amount);
      }
    });
    // From manual transactions — type קובע להכנסה או הוצאה.
    // הוצאה עם budget_type ידוע (קבוע/משתנה) הולכת ל-bucket המסווג בלבד —
    // לא גם ל-exp הכללי — כדי שלא תיספר פעמיים כשמצרפים ב-getAct.
    (manualTxs || []).forEach((tx) => {
      if ((tx.amount || 0) <= 0) return;
      const mk = tx.billing_month;
      if (!mk || +mk.split("-")[0] !== currentYear) return;
      if (ignoredCats.has(tx.cat)) return;
      if (tx.type === "income") {
        add(inc, mk, tx.cat, tx.amount);
      } else if (tx.budget_type === "קבוע" || tx.budget_type === "משתנה") {
        addTyped(mk, tx.cat, tx.budget_type, tx.amount);
      } else {
        add(exp, mk, tx.cat, tx.amount);
      }
    });
    return { incomeMap: inc, expenseMap: exp, expenseMapTyped: expTyped };
  }, [
    portfolioSubs,
    importedTxs,
    manualTxs,
    bankTxs,
    rememberedMappings,
    cycleStartDay,
    currentYear,
    incomeCats,
    ignoredCats,
  ]);

  // txMap משולב — לשימוש ב-missingCats ובכל מקום שלא מבחין בין סוגים
  const txMap = useMemo(() => {
    const map = {};
    [incomeMap, expenseMap].forEach((src) => {
      Object.entries(src).forEach(([mk, cats]: [string, any]) => {
        if (!map[mk]) map[mk] = {};
        Object.entries(cats).forEach(([cat, amt]: [string, any]) => {
          map[mk][cat] = (map[mk][cat] || 0) + amt;
        });
      });
    });
    // expenseMapTyped מפתח לפי `${cat}::${budget_type}` — כאן מצרפים לפי שם
    // הקטגוריה בלבד, לתצוגה כללית שלא מבחינה בין קבוע/משתנה (כמו קודם).
    Object.entries(expenseMapTyped).forEach(([mk, cats]: [string, any]) => {
      if (!map[mk]) map[mk] = {};
      Object.entries(cats).forEach(([key, amt]: [string, any]) => {
        const cat = key.split("::")[0];
        map[mk][cat] = (map[mk][cat] || 0) + amt;
      });
    });
    return map;
  }, [incomeMap, expenseMap, expenseMapTyped]);

  // Months this year that have any data, up to current month
  const activeMks = useMemo(
    () =>
      Object.keys(txMap)
        .filter((mk) => {
          const [y, m] = mk.split("-").map(Number);
          return y === currentYear && m <= currentMonth;
        })
        .sort(),
    [txMap, currentYear, currentMonth],
  );

  const numActive = activeMks.length;
  // החודש הראשון בשנה הנוכחית שמכוסה על-ידי תסריט עם תאריך מפורש.
  // תסריטי בסיס ללא תאריך (date_value ריק) לא קובעים את נקודת ההתחלה —
  // אחרת fallback על הבסיס מצטבר תקציב מינואר גם כשהתסריט מתחיל מאוחר יותר.
  const firstScenarioMonth = useMemo(() => {
    if (!publishedScenarios || publishedScenarios.length === 0) return currentMonth + 1;
    let earliest = Infinity;
    for (const sc of publishedScenarios) {
      const cmp = scenarioCmp(sc);
      if (cmp === null) continue; // תסריט ללא תאריך — לא משפיע על נקודת ההתחלה
      // חילוץ שנה/חודש מ-cmp = year*12+month (month ∈ 1–12)
      const scYear = Math.floor((cmp - 1) / 12);
      const scMonth = cmp - scYear * 12;
      if (scYear < currentYear) earliest = Math.min(earliest, 1);
      else if (scYear === currentYear) earliest = Math.min(earliest, scMonth);
    }
    return isFinite(earliest) ? earliest : currentMonth + 1;
  }, [publishedScenarios, currentYear, currentMonth]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  // getAct — item_type קובע מאיזו מפה לשלוף
  const getAct = (cat, mk, itemType?: string) => {
    if (itemType === "income") return incomeMap[mk]?.[cat] || 0;
    if (itemType === "expense_fixed" || itemType === "expense_variable") {
      const bt = itemType === "expense_fixed" ? "קבוע" : "משתנה";
      const untyped = expenseMap[mk]?.[cat] || 0;
      const typed = expenseMapTyped[mk]?.[`${cat}::${bt}`] || 0;
      return untyped + typed;
    }
    return txMap[mk]?.[cat] || 0;
  };
  const getSum = (cat, itemType?: string) =>
    activeMks.reduce((s, mk) => s + getAct(cat, mk, itemType), 0);
  const getAvg = (cat, itemType?: string) =>
    numActive > 0 ? getSum(cat, itemType) / numActive : 0;
  // remaining = cumulative scenario budget up to current month − total spent
  const getRem = (cat: string, budgetType: string, itemType?: string) =>
    getCumBudget(cat, budgetType) - getSum(cat, itemType);

  const fmtAmt = (n) => (n ? `₪${Math.round(n).toLocaleString()}` : "");
  const fmtZ = (n) => `₪${Math.round(n).toLocaleString()}`;

  const groupSum = (grp, mk) =>
    grp.reduce((s, x) => s + getAct(x.category_name, mk, x.item_type), 0);
  const groupTotal = (grp) =>
    grp.reduce((s, x) => s + getSum(x.category_name, x.item_type), 0);
  const groupBud = (grp) => grp.reduce((s, x) => s + getWeightedBudget(x.category_name, x.budget_type || ""), 0);
  const groupAvg = (grp) =>
    grp.reduce((s, x) => s + getAvg(x.category_name, x.item_type), 0);
  const groupRem = (grp) =>
    grp.reduce(
      (s, x) => s + getRem(x.category_name, x.budget_type || "", x.item_type),
      0,
    );

  const avgOverBudget = (avg, bud) =>
    bud > 0 && avg > bud + Math.max(bud * 0.01, 50);

  const sortItems = (items) => {
    if (!sortCol) return items;
    return [...items].sort((a, b) => {
      if (sortCol === "name")
        return sortDir === "asc"
          ? a.category_name.localeCompare(b.category_name, "he")
          : b.category_name.localeCompare(a.category_name, "he");
      let va, vb;
      if (sortCol === "budget") {
        va = getWeightedBudget(a.category_name, a.budget_type || "");
        vb = getWeightedBudget(b.category_name, b.budget_type || "");
      } else if (sortCol === "avg") {
        va = getAvg(a.category_name, a.item_type);
        vb = getAvg(b.category_name, b.item_type);
      } else if (sortCol === "rem") {
        va = getRem(a.category_name, a.budget_type || "", a.item_type);
        vb = getRem(b.category_name, b.budget_type || "", b.item_type);
      } else {
        va = getAct(a.category_name, sortCol, a.item_type);
        vb = getAct(b.category_name, sortCol, b.item_type);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const sortIcon = (col) =>
    sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  // ── Loading / empty states ────────────────────────────────────────────────
  if (publishedRows === null || publishedScenarios === null || publishedEntries === null)
    return (
      <div
        style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}
      >
        טוען...
      </div>
    );

  const noScenarioForYear = (scenarioItems || []).length === 0;

  // ── קטגוריות עם הוצאות שאינן בתסריט ────────────────────────────────────
  const scenarioCatSet = new Set((scenarioItems || []).map((x) => x.category_name));
  const missingCats: { cat: string; total: number }[] = (() => {
    const allCatsInTxs = new Set<string>();
    Object.values(txMap).forEach((monthData) => {
      Object.keys(monthData as Record<string, number>).forEach((cat) =>
        allCatsInTxs.add(cat),
      );
    });
    const result: { cat: string; total: number }[] = [];
    allCatsInTxs.forEach((cat) => {
      if (!scenarioCatSet.has(cat)) {
        const total = getSum(cat);
        if (total > 0) result.push({ cat, total });
      }
    });
    return result.sort((a, b) => b.total - a.total);
  })();

  const income = (scenarioItems || []).filter((x) => x.item_type === "income");
  const fixed = (scenarioItems || []).filter((x) => x.item_type === "expense_fixed");
  const variable = (scenarioItems || []).filter(
    (x) => x.item_type === "expense_variable",
  );
  const allExp = [...fixed, ...variable];

  // If "הכנסות מזדמנות" is not in the scenario but has manual transactions, add a synthetic row
  const incomeDisplay =
    income.some((x) => x.category_name === "הכנסות מזדמנות") ||
    getSum("הכנסות מזדמנות", "income") === 0
      ? income
      : [
          ...income,
          {
            id: "__occasional__",
            category_name: "הכנסות מזדמנות",
            amount: 0,
            budget_type: "הכנסה",
            item_type: "income",
          },
        ];

  // ── Visible month columns ─────────────────────────────────────────────────
  const maxVisibleMonth = showAllMonths ? 12 : Math.min(currentMonth + 1, 12);
  const displayMonths = Array.from(
    { length: maxVisibleMonth },
    (_, i) => i + 1,
  );
  const numCols = 2 + displayMonths.length + 2;

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: "10px 8px",
    textAlign: "center",
    fontWeight: 700,
    borderBottom: "2px solid var(--border)",
    borderLeft: "1px solid var(--border)88",
    whiteSpace: "nowrap",
    background: "var(--surface2)",
    color: "var(--text-mid)",
    fontSize: 14,
    cursor: "pointer",
    userSelect: "none",
    position: "sticky",
    top: 0,
    zIndex: 2,
  };
  const TD: React.CSSProperties = {
    padding: "8px 8px",
    textAlign: "center",
    borderBottom: "1px solid var(--border)66",
    borderLeft: "1px solid var(--border)66",
    fontSize: 14,
    color: "var(--text)",
  };
  const TDL: React.CSSProperties = {
    ...TD,
    textAlign: "right",
    paddingRight: 14,
    fontWeight: 500,
    position: "sticky",
    right: 0,
    zIndex: 1,
    background: "var(--surface)",
  };
  const THL: React.CSSProperties = {
    ...TH,
    textAlign: "right",
    minWidth: 140,
    position: "sticky",
    right: 0,
    top: 0,
    zIndex: 4,
  };
  const activeMkSet = new Set(activeMks);
  const remColor = (v) => (v >= 0 ? "var(--green-soft)" : "var(--red)");

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderSectionHeader = (label, key, bg) => (
    <tr
      onClick={() => setCollapsed((p) => ({ ...p, [key]: !p[key] }))}
      style={{ cursor: "pointer" }}
    >
      <td
        colSpan={numCols}
        style={{
          padding: "10px 14px",
          fontWeight: 700,
          fontSize: 15,
          background: bg,
          color: "var(--text)",
          borderBottom: "1px solid var(--border)",
          borderTop: "2px solid var(--border)",
          letterSpacing: "0.01em",
        }}
      >
        {collapsed[key] ? "▶" : "▼"} {label}
      </td>
    </tr>
  );

  const renderItemRow = (item, isIncome = false, idx = 0) => {
    const bud = getWeightedBudget(item.category_name, item.budget_type || "");
    const itype = item.item_type;
    const avg = getAvg(item.category_name, itype);
    const sum = getSum(item.category_name, itype);
    const rem = getRem(item.category_name, item.budget_type || "", itype);
    const hasActivity = sum > 0 || bud > 0;
    const stripe = idx % 2 === 1 ? "rgba(0,0,0,0.018)" : undefined;
    const avgColor =
      !isIncome && numActive > 0 && bud > 0
        ? avgOverBudget(avg, bud)
          ? "var(--red)"
          : "var(--green-soft)"
        : "var(--text-mid)";
    const avgBold =
      !isIncome && numActive > 0 && bud > 0 && avgOverBudget(avg, bud);
    return (
      <tr key={item.id} style={{ background: stripe || "var(--surface)" }}>
        <td
          style={{
            ...TDL,
            background: stripe || "var(--surface)",
            cursor: "pointer",
            textDecoration: "underline dotted",
          }}
          onClick={() => setDrillDown({ cat: item.category_name, mk: null })}
          title="לחץ לפירוט תנועות"
        >
          {item.category_name}
        </td>
        <td style={{ ...TD, color: "var(--text-dim)" }}>
          {bud ? fmtZ(bud) : ""}
        </td>
        {displayMonths.map((m) => {
          const mk = `${currentYear}-${String(m).padStart(2, "0")}`;
          const val = getAct(item.category_name, mk, itype);
          const isCur = m === currentMonth;
          const mBud = getBudgetForMonth(item.category_name, item.budget_type || "", m);
          const over = !isIncome && mBud > 0 && val > mBud * 1.15;
          const inActive = activeMkSet.has(mk);
          return (
            <td
              key={m}
              style={{
                ...TD,
                background: isCur ? "rgba(45,106,79,0.05)" : undefined,
                color: over
                  ? "var(--red)"
                  : val === 0 && inActive
                    ? "var(--text-dim)"
                    : undefined,
                fontWeight: over ? 700 : undefined,
                ...(val > 0 ? { cursor: "pointer" } : {}),
              }}
              onClick={
                val > 0
                  ? () => setDrillDown({ cat: item.category_name, mk })
                  : undefined
              }
              title={
                val > 0
                  ? `פירוט ${item.category_name} — ${MONTHS_HE[m - 1]}`
                  : undefined
              }
            >
              {val > 0 ? fmtAmt(val) : inActive ? "₪0" : ""}
            </td>
          );
        })}
        <td
          style={{
            ...TD,
            color: avgColor,
            fontWeight: avgBold ? 700 : undefined,
          }}
        >
          {numActive > 0 ? fmtZ(avg) : ""}
        </td>
        <td
          style={{
            ...TD,
            fontWeight: 700,
            color: !isIncome && hasActivity ? remColor(rem) : "var(--text-dim)",
          }}
        >
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
      <tr
        style={{
          background: totalBg,
          fontWeight: bold ? 800 : 700,
          borderTop: bold ? "2px solid var(--green-mint)" : undefined,
        }}
      >
        <td
          style={{
            ...TDL,
            fontWeight: bold ? 800 : 700,
            background: totalBg,
            fontSize: bold ? 13 : 12,
          }}
        >
          {label}
        </td>
        <td style={TD}>{fmtZ(bud)}</td>
        {displayMonths.map((m) => {
          const mk = `${currentYear}-${String(m).padStart(2, "0")}`;
          const tot = groupSum(grp, mk);
          return (
            <td
              key={m}
              style={{
                ...TD,
                background:
                  m === currentMonth ? "rgba(45,106,79,0.07)" : undefined,
              }}
            >
              {fmtAmt(tot)}
            </td>
          );
        })}
        <td style={TD}>{numActive > 0 ? fmtZ(groupAvg(grp)) : ""}</td>
        <td
          style={{
            ...TD,
            fontWeight: 700,
            color: isIncome ? "var(--text-dim)" : remColor(rem),
          }}
        >
          {isIncome ? "" : fmtZ(rem)}
        </td>
      </tr>
    );
  };

  return (
    <>
      <h1
        style={{
          fontFamily: "'Frank Ruhl Libre', serif",
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text)",
          textAlign: "center",
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        בקרת תיק כלכלי
      </h1>
      <div
        style={{ height: 1, background: "var(--border)", marginBottom: 20 }}
      />
      {/* ── באנר: קטגוריות לא מתוכננות ── */}

      <div>
        {/* ── באנר: קטגוריות לא מתוכננות ── */}
        {missingCats.length > 0 && (
          <div
            style={{
              marginBottom: 16,
              background: "rgba(192,57,43,0.06)",
              border: "1px solid rgba(192,57,43,0.2)",
              borderRadius: 10,
              padding: "12px 16px",
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--red)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--red)",
                  marginBottom: 8,
                }}
              >
                {missingCats.length} קטגוריות עם הוצאות אינן מוגדרות בתסריט
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {missingCats.map(({ cat, total }) => (
                  <span
                    key={cat}
                    style={{
                      background: "rgba(192,57,43,0.1)",
                      border: "1px solid rgba(192,57,43,0.25)",
                      borderRadius: 20,
                      padding: "3px 10px",
                      fontSize: 14,
                      color: "var(--red)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {cat}
                    <strong>₪{Math.round(total).toLocaleString()}</strong>
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                עבור לטאב <strong>מאזן מבוסס תסריטים</strong> כדי להוסיף קטגוריות אלו
                לתסריט
              </div>
            </div>
          </div>
        )}

        {/* ── יום תחילת המחזור החודשי ── */}
        <Card
          style={{
            marginBottom: 16,
            padding: "12px 18px",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 15, color: "var(--text-mid)" }}>
              יום תחילת המחזור החודשי:
            </span>
            {editingCycleDay ? (
              <>
                <input
                  autoFocus
                  type="number"
                  min="1"
                  max="28"
                  value={tempDay}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setTempDay(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveCycleDay();
                    if (e.key === "Escape") { setEditingCycleDay(false); setTempDay(String(cycleStartDay)); }
                  }}
                  style={{
                    width: 60,
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: "1.5px solid var(--green-mid)",
                    fontSize: 16,
                    fontFamily: "inherit",
                    background: "var(--surface)",
                    color: "var(--text)",
                    textAlign: "center",
                  }}
                />
                <button
                  onClick={saveCycleDay}
                  disabled={savingDay}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 8,
                    fontSize: 15,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background: "var(--green-mid)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                  }}
                >
                  {savingDay ? "שומר..." : "שמור"}
                </button>
                <button
                  onClick={() => {
                    setEditingCycleDay(false);
                    setTempDay(String(cycleStartDay));
                  }}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 8,
                    fontSize: 15,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background: "transparent",
                    color: "var(--text-dim)",
                    border: "1px solid var(--border)",
                  }}
                >
                  ביטול
                </button>
              </>
            ) : (
              <>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 17,
                    color: "var(--green-deep)",
                  }}
                >
                  {cycleStartDay}
                </span>
                <button
                  onClick={() => {
                    setEditingCycleDay(true);
                    setTempDay(String(cycleStartDay));
                  }}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    background: "transparent",
                    color: "var(--text-dim)",
                    border: "1px solid var(--border)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <DocIcon name="pencil" color="var(--text-dim)" size={13} />{" "}
                  שנה
                </button>
                <span style={{ fontSize: 15, color: "var(--text-dim)" }}>
                  (שינוי ישפיע על החלוקה מעכשיו ואילך)
                </span>
              </>
            )}
          </div>
        </Card>

        {/* ── כותרת: ניווט שנה + תסריט ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => setSelectedYear((y) => y - 1)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text-mid)",
                fontSize: 18,
                cursor: "pointer",
                fontFamily: "inherit",
                lineHeight: 1,
              }}
            >
              ‹
            </button>
            <div
              style={{
                minWidth: 68,
                textAlign: "center",
                fontWeight: 700,
                fontSize: 18,
              }}
            >
              {selectedYear}
            </div>
            <button
              onClick={() => setSelectedYear((y) => Math.min(y + 1, NOW_YEAR))}
              disabled={selectedYear >= NOW_YEAR}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color:
                  selectedYear >= NOW_YEAR
                    ? "var(--text-dim)"
                    : "var(--text-mid)",
                fontSize: 18,
                cursor: selectedYear >= NOW_YEAR ? "default" : "pointer",
                fontFamily: "inherit",
                lineHeight: 1,
                opacity: selectedYear >= NOW_YEAR ? 0.4 : 1,
              }}
            >
              ›
            </button>
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {(cycleStartDay || 1) > 1 && (
              <div
                style={{
                  padding: "4px 12px",
                  background: "var(--surface2)",
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  fontSize: 14,
                  color: "var(--text-dim)",
                }}
              >
                מחזור מה-<strong>{cycleStartDay}</strong> לחודש
              </div>
            )}
            {numActive > 0 && (
              <div
                style={{
                  padding: "4px 12px",
                  background: "var(--surface2)",
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  fontSize: 14,
                  color: "var(--text-dim)",
                }}
              >
                <strong>{numActive}</strong> חודשים פעילים
              </div>
            )}
            <button
              onClick={() => setShowAllMonths((v) => !v)}
              style={{
                padding: "5px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text-mid)",
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {showAllMonths ? "‹ צמצם" : "הצג כל השנה ›"}
            </button>
          </div>
        </div>

        {noScenarioForYear && (
          <div
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              background: "rgba(248,113,113,0.08)",
              borderRadius: 8,
              border: "1px solid rgba(248,113,113,0.33)",
              fontSize: 15,
              color: "var(--red)",
            }}
          >
            לא פורסם תסריט עבור לקוח זה — פנה ליועץ שלך
          </div>
        )}

        {/* Table */}
        <div
          style={{
            overflowX: "auto",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
        >
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              fontSize: 14,
              direction: "rtl",
            }}
          >
            <thead>
              <tr>
                <th
                  style={{ ...THL, cursor: "pointer" }}
                  onClick={() => handleSort("name")}
                >
                  סעיף{sortIcon("name")}
                </th>
                <th
                  style={{ ...TH, minWidth: 70 }}
                  onClick={() => handleSort("budget")}
                >
                  תקציב{sortIcon("budget")}
                </th>
                {displayMonths.map((m) => {
                  const mk = `${currentYear}-${String(m).padStart(2, "0")}`;
                  return (
                    <th
                      key={m}
                      style={{
                        ...TH,
                        minWidth: 50,
                        color:
                          m === currentMonth ? "var(--green-deep)" : undefined,
                        background:
                          m === currentMonth
                            ? "rgba(45,106,79,0.13)"
                            : undefined,
                      }}
                      onClick={() => handleSort(mk)}
                    >
                      {MONTHS_HE[m - 1]}
                      {sortIcon(mk)}
                    </th>
                  );
                })}
                <th
                  style={{ ...TH, minWidth: 72 }}
                  onClick={() => handleSort("avg")}
                >
                  ממוצע{sortIcon("avg")}
                </th>
                <th
                  style={{ ...TH, minWidth: 88, color: "var(--green-deep)" }}
                  onClick={() => handleSort("rem")}
                >
                  נותר מצטבר{sortIcon("rem")}
                </th>
              </tr>
            </thead>
            <tbody>
              {renderSectionHeader("הכנסות", "income", "rgba(52,211,153,0.10)")}
              {!collapsed.income &&
                sortItems(incomeDisplay).map((item, idx) =>
                  renderItemRow(item, true, idx),
                )}
              {renderTotalRow('סה"כ הכנסות', incomeDisplay, false, true)}

              {renderSectionHeader(
                "הוצאות קבועות",
                "fixed",
                "rgba(79,142,247,0.10)",
              )}
              {!collapsed.fixed &&
                sortItems(fixed).map((item, idx) =>
                  renderItemRow(item, false, idx),
                )}
              {renderTotalRow('סה"כ הוצאות קבועות', fixed)}

              {renderSectionHeader(
                "הוצאות משתנות",
                "variable",
                "rgba(251,191,36,0.10)",
              )}
              {!collapsed.variable &&
                sortItems(variable).map((item, idx) =>
                  renderItemRow(item, false, idx),
                )}
              {renderTotalRow('סה"כ הוצאות משתנות', variable)}

              <tr style={{ height: 6 }}>
                <td colSpan={numCols} style={{ background: "var(--bg)" }} />
              </tr>
              {renderTotalRow('סה"כ הכנסות', incomeDisplay, true, true)}
              {renderTotalRow('סה"כ הוצאות', allExp, true)}

              {/* פער */}
              {(() => {
                const gap = groupBud(incomeDisplay) - groupBud(allExp);
                const gapRem = groupRem(incomeDisplay) - groupRem(allExp);
                return (
                  <tr
                    style={{
                      background:
                        gap >= 0
                          ? "rgba(52,211,153,0.08)"
                          : "rgba(248,113,113,0.08)",
                      fontWeight: 800,
                      borderTop: "2px solid var(--border)",
                    }}
                  >
                    <td
                      style={{
                        ...TDL,
                        fontWeight: 800,
                        background:
                          gap >= 0
                            ? "rgba(52,211,153,0.08)"
                            : "rgba(248,113,113,0.08)",
                      }}
                    >
                      פער (הכנסות − הוצאות)
                    </td>
                    <td
                      style={{
                        ...TD,
                        color: gap >= 0 ? "var(--green-deep)" : "var(--red)",
                      }}
                    >
                      {fmtZ(gap)}
                    </td>
                    {displayMonths.map((m) => {
                      const mk = `${currentYear}-${String(m).padStart(2, "0")}`;
                      const inc = groupSum(incomeDisplay, mk);
                      const exp = groupSum(allExp, mk);
                      const diff = inc - exp;
                      return (
                        <td
                          key={m}
                          style={{
                            ...TD,
                            background:
                              m === currentMonth
                                ? "rgba(45,106,79,0.07)"
                                : undefined,
                            color:
                              inc || exp
                                ? diff >= 0
                                  ? "var(--green-deep)"
                                  : "var(--red)"
                                : undefined,
                          }}
                        >
                          {inc || exp ? fmtZ(diff) : ""}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        ...TD,
                        color:
                          groupAvg(incomeDisplay) - groupAvg(allExp) >= 0
                            ? "var(--green-deep)"
                            : "var(--red)",
                      }}
                    >
                      {numActive > 0
                        ? fmtZ(groupAvg(incomeDisplay) - groupAvg(allExp))
                        : ""}
                    </td>
                    <td
                      style={{
                        ...TD,
                        fontWeight: 800,
                        color: remColor(gapRem),
                      }}
                    >
                      {fmtZ(gapRem)}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down modal */}
      {drillDown &&
        (() => {
          const filtered = allNormTxs
            .filter(
              (tx) =>
                tx.cat === drillDown.cat &&
                (!drillDown.mk || tx.mk === drillDown.mk),
            )
            .sort((a, b) => (a.mk || "").localeCompare(b.mk || ""));
          const total = filtered.reduce((s, t) => s + t.amount, 0);
          const [, ddM] = (drillDown.mk || "").split("-").map(Number);
          const title =
            drillDown.cat +
            (drillDown.mk ? ` — ${HEBREW_MONTHS[ddM - 1]}` : "");
          return (
            <>
              <div
                onClick={() => setDrillDown(null)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.45)",
                  zIndex: "var(--z-back)",
                }}
              />
              <div
                style={{
                  position: "fixed",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%,-50%)",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  padding: "24px",
                  zIndex: "var(--z-modal)",
                  width: "min(560px,95vw)",
                  maxHeight: "80vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                  direction: "rtl",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 18,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <DocIcon
                      name="bar-chart"
                      color="var(--green-deep)"
                      size={18}
                    />{" "}
                    {title}
                  </div>
                  <button
                    onClick={() => setDrillDown(null)}
                    style={{
                      background: "var(--surface2)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "6px 16px",
                      fontSize: 15,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      fontWeight: 700,
                      color: "var(--text)",
                    }}
                  >
                    חזור ←
                  </button>
                </div>
                {filtered.length === 0 ? (
                  <div
                    style={{
                      color: "var(--text-dim)",
                      fontSize: 15,
                      padding: "20px 0",
                    }}
                  >
                    אין תנועות
                  </div>
                ) : (
                  <div style={{ overflowY: "auto", flex: 1 }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: 15,
                      }}
                    >
                      <thead
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "var(--surface2)",
                        }}
                      >
                        <tr>
                          {["חודש", "פירוט", "מקור", "סכום"].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontWeight: 600,
                                color: "var(--text-dim)",
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((tx, i) => {
                          const [y, m] = (tx.mk || "").split("-").map(Number);
                          return (
                            <tr
                              key={i}
                              style={{
                                borderBottom: "1px solid var(--border)44",
                                background:
                                  i % 2 === 0
                                    ? "transparent"
                                    : "rgba(0,0,0,0.02)",
                              }}
                            >
                              <td
                                style={{
                                  padding: "8px 10px",
                                  whiteSpace: "nowrap",
                                  color: "var(--text-dim)",
                                  fontSize: 14,
                                }}
                              >
                                {HEBREW_MONTHS[m - 1]} {y}
                              </td>
                              <td style={{ padding: "8px 10px" }}>{tx.name}</td>
                              <td
                                style={{
                                  padding: "8px 10px",
                                  fontSize: 13,
                                  color: "var(--text-dim)",
                                }}
                              >
                                {tx.source}
                              </td>
                              <td
                                style={{
                                  padding: "8px 10px",
                                  fontWeight: 700,
                                  color: "var(--green-soft)",
                                  textAlign: "left",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                ₪{tx.amount.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr
                          style={{
                            background: "var(--surface2)",
                            borderTop: "2px solid var(--border)",
                          }}
                        >
                          <td
                            colSpan={3}
                            style={{ padding: "8px 10px", fontWeight: 700 }}
                          >
                            סה"כ
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              fontWeight: 800,
                              color: "var(--green-soft)",
                              textAlign: "left",
                            }}
                          >
                            ₪{total.toLocaleString()}
                          </td>
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
function RememberModal({
  pendingRemember,
  onAlways,
  onJustHere,
}) {
  if (!pendingRemember) return null;
  const btnBase: React.CSSProperties = {
    display: "block",
    width: "100%",
    borderRadius: 10,
    padding: "11px 16px",
    fontSize: 16,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "right",
    border: "1px solid var(--border)",
    background: "var(--surface2)",
    color: "var(--text)",
    transition: "background 0.1s",
  };
  return (
    <>
      <div
        onClick={onJustHere}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: "var(--z-back)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          background: "var(--surface)",
          border: `1px solid ${"var(--border)"}`,
          borderRadius: 16,
          padding: "24px 28px",
          zIndex: "var(--z-modal)",
          width: "min(400px,90vw)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--green-mid)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
            לשנות את הסיווג של
          </div>
          <div
            style={{ fontSize: 17, color: "var(--text-dim)", lineHeight: 1.5 }}
          >
            <strong style={{ color: "var(--text)" }}>
              "{pendingRemember.name}"
            </strong>{" "}
            →{" "}
            <strong style={{ color: "var(--green-mid)" }}>
              {pendingRemember.cat}
            </strong>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={onAlways} style={btnBase}>
            שנה תמיד לעסק זה
            <div
              style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}
            >
              ישמר לתמיד — יחול גם על תנועות עתידיות
            </div>
          </button>
          <button
            onClick={onJustHere}
            style={{ ...btnBase, color: "var(--text-dim)" }}
          >
            שנה כאן בלבד
            <div
              style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}
            >
              רק תנועה זו — בלי לשנות שאר התנועות
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// normalizeAllTxs — ממזג תנועות משני מקורות לפורמט אחיד
// ════════════════════════════════════════════════════════════════
function normalizeAllTxs(
  portfolioSubs,
  importedTxs,
  rememberedMappings,
  cycleStartDay,
  manualTxs = [],
  categoryRules: any[] = [],
  bankTxs: any[] = [],
) {
  const result = [];
  portfolioSubs.forEach((sub) => {
    (sub.transactions || []).forEach((tx, idx) => {
      const billing =
        sub.month_key ||
        tx.billing_month ||
        assignBillingMonth(tx.date, cycleStartDay);
      result.push({
        _uid: `sub-${sub.id}-${idx}`,
        date: tx.date || "",
        name: tx.name || "",
        cat:
          tx.cat ||
          classifyTx(
            tx.name || "",
            tx.max_category || "",
            rememberedMappings,
            categoryRules,
          ).cat,
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
  importedTxs.forEach((tx) => {
    result.push({
      _uid: `imp-${tx.id}`,
      date: tx.date || "",
      name: tx.name || "",
      cat: classifyImported(tx, rememberedMappings, categoryRules),
      amount: Number(tx.amount || 0),
      billing_month:
        tx.billing_month || assignBillingMonth(tx.date, cycleStartDay),
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
  manualTxs.forEach((tx) => {
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
  bankTxs.forEach((tx) => {
    result.push({
      _uid: `bank-${tx.id}`,
      date: tx.date || "",
      name: tx.merchant_name || "",
      cat: classifyImported(
        { cat: tx.cat, name: tx.merchant_name, max_category: tx.category_raw },
        rememberedMappings,
        categoryRules,
      ),
      amount: Number(tx.amount || 0),
      billing_month: tx.billing_month,
      source: "bank",
      source_label: tx.provider === "max" ? "מקס" : tx.provider || "בנק",
      conf: "high",
      edited: false,
      flow_type: null,
      type: null,
      // pending: תנועה שעדיין לא "נקלטה" סופית אצל הספק (יש uid, אין ARN עדיין) —
      // מטופלת בנפרד ב-AllTransactionsTab: לא נכללת בסכומים, מוצגת ברובריקה נפרדת.
      status: tx.status || "completed",
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
function AllTransactionsTab({
  clientId,
  importedTxs,
  portfolioSubs,
  manualTxs,
  bankTxs = [] as any[],
  rememberedMappings,
  onDataChange,
  onManualTxAdded,
  onManualTxDeleted,
  cycleStartDay,
  onCycleStartDayChange,
  onUpdatePortfolioTxCat,
  onDeletePortfolioSub,
  onNavigateToUpload,
  categories,
  categoryRows = [],
  clientCats,
  onCategoryAdded,
  ignoredCats = IGNORED_CATEGORIES,
  incomeCats = new Set<string>(),
  categoryRules = [] as any[],
  hiddenCats = [] as string[],
  onHiddenCatsChange = undefined as any,
  scenarioCats = null as any,
  maxSessionActive = false as boolean,
  maxLastSync = null as string | null,
}) {
  // ── Derived transaction list (useMemo keeps it in sync with props automatically) ──
  const [localEdits, setLocalEdits] = useState<Map<string, string>>(new Map());
  const [deletedUids, setDeletedUids] = useState<Set<string>>(new Set());
  const allTxs = useMemo(() => {
    const fresh = normalizeAllTxs(
      portfolioSubs,
      importedTxs,
      rememberedMappings,
      cycleStartDay,
      manualTxs,
      categoryRules,
      bankTxs,
    );
    return fresh
      .filter((t) => !deletedUids.has(t._uid))
      .map((t) =>
        localEdits.has(t._uid)
          ? { ...t, cat: localEdits.get(t._uid)!, edited: true }
          : t,
      );
  }, [
    portfolioSubs,
    importedTxs,
    manualTxs,
    bankTxs,
    rememberedMappings,
    cycleStartDay,
    localEdits,
    deletedUids,
  ]);

  // שם קטגוריה -> סוגי תקציב (קבוע/משתנה/הכנסה) שקיימים לו. כששם מוגדר גם
  // כ"קבוע" וגם כ"משתנה", תנועות ידניות חייבות לבחור באיזה מהם מדובר —
  // אחרת אין דרך להבחין ביניהם בסיכומים (ר' v44_manual_tx_budget_type).
  const catBudgetTypes = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    (categoryRows || []).forEach((r: any) => {
      if (!m[r.name]) m[r.name] = new Set();
      m[r.name].add(r.budget_type);
    });
    return m;
  }, [categoryRows]);

  const [activeTxUid, setActiveTxUid] = useState(null);
  const [catSearch, setCatSearch] = useState("");
  const [pendingRemember, setPendingRemember] = useState(null);
  const [filterSource, setFilterSource] = useState("all"); // "all" | "file" | "ext" | "manual"
  const filterBarRef = useRef<HTMLDivElement>(null);
  const [filterProvider, setFilterProvider] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [advFilterOpen, setAdvFilterOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    field: "date" | "amount" | "cat";
    dir: "asc" | "desc";
  }>({ field: "date", dir: "desc" });
  const [openMonthKeys, setOpenMonthKeys] = useState<Set<string>>(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return new Set([key]);
  });
  const [openYears, setOpenYears] = useState<Set<number>>(
    () => new Set([new Date().getFullYear()]),
  );
  const [deletingTxUid, setDeletingTxUid] = useState(null);
  const [deletingCycleKey, setDeletingCycleKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [ignoredOpen, setIgnoredOpen] = useState({});
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const toggleSelectTx = (uid: string) =>
    setSelectedUids((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  const toggleSelectMonth = (monthTxs: any[]) => {
    const monthUids = monthTxs.map((t) => t._uid);
    const allSelected = monthUids.every((uid) => selectedUids.has(uid));
    setSelectedUids((prev) => {
      const next = new Set(prev);
      allSelected
        ? monthUids.forEach((uid) => next.delete(uid))
        : monthUids.forEach((uid) => next.add(uid));
      return next;
    });
  };
  const deleteMonth = async (monthTxs: any[]) => {
    if (!window.confirm(`למחוק את כל ${monthTxs.length} התנועות של חודש זה?`))
      return;
    const extIds = monthTxs
      .filter((t) => t.source === "ext")
      .map((t) => t._dbId)
      .filter(Boolean);
    const manIds = monthTxs
      .filter((t) => t.source === "manual")
      .map((t) => t._dbId)
      .filter(Boolean);
    if (extIds.length > 0)
      await supabase
        .from("imported_transactions")
        .delete()
        .in("id", extIds)
        .eq("client_id", clientId);
    if (manIds.length > 0) {
      await supabase
        .from("manual_transactions")
        .delete()
        .in("id", manIds)
        .eq("client_id", clientId);
      manIds.forEach((id) => onManualTxDeleted && onManualTxDeleted(id));
    }
    const fileTxs = monthTxs.filter((t) => t.source === "file");
    if (fileTxs.length > 0) {
      const bySubmission: Record<string, number[]> = {};
      fileTxs.forEach((t) => {
        if (!bySubmission[t._submissionId]) bySubmission[t._submissionId] = [];
        bySubmission[t._submissionId].push(t._txIndex);
      });
      for (const [subId, indices] of Object.entries(bySubmission)) {
        const sub = portfolioSubs.find(
          (s: any) => String(s.id) === String(subId),
        );
        if (!sub) continue;
        const idxSet = new Set(indices);
        const newTxs = (sub.transactions || []).filter(
          (_: any, i: number) => !idxSet.has(i),
        );
        await supabase
          .from("portfolio_submissions")
          .update({ transactions: newTxs })
          .eq("id", sub.id);
      }
    }
    const uids = new Set(monthTxs.map((t) => t._uid));
    setDeletedUids((prev) => {
      const next = new Set(prev);
      uids.forEach((uid) => next.add(uid));
      return next;
    });
    setSelectedUids((prev) => {
      const next = new Set(prev);
      uids.forEach((uid) => next.delete(uid));
      return next;
    });
    onDataChange();
  };
  const ignoreSelected = async () => {
    const count = selectedUids.size;
    if (
      !window.confirm(
        `להתעלם מ-${count} התנועות שבחרת?\nהן לא ייספרו בניתוח אך יישארו במערכת.`,
      )
    )
      return;
    const toIgnore = allTxs.filter((t) => selectedUids.has(t._uid));
    // עדכון מיידי ב-localEdits (ללא reload)
    setLocalEdits((prev) => {
      const next = new Map(prev);
      toIgnore.forEach((t) => next.set(t._uid, "להתעלם"));
      return next;
    });
    setSelectedUids(new Set());
    // שמירה ב-DB ברקע
    const fileTxs = toIgnore.filter((t) => t.source === "file");
    if (fileTxs.length > 0) {
      const bySubmission: Record<string, number[]> = {};
      fileTxs.forEach((t) => {
        if (!bySubmission[t._submissionId]) bySubmission[t._submissionId] = [];
        bySubmission[t._submissionId].push(t._txIndex);
      });
      for (const [subId, indices] of Object.entries(bySubmission)) {
        const sub = portfolioSubs.find(
          (s: any) => String(s.id) === String(subId),
        );
        if (!sub) continue;
        const idxSet = new Set(indices);
        const newTxs = (sub.transactions || []).map((tx: any, i: number) =>
          idxSet.has(i) ? { ...tx, cat: "להתעלם", edited: true } : tx,
        );
        supabase
          .from("portfolio_submissions")
          .update({ transactions: newTxs })
          .eq("id", sub.id);
      }
    }
    const extTxs = toIgnore.filter((t) => t.source === "ext");
    extTxs.forEach((tx) => {
      if (tx._dbId)
        supabase
          .from("imported_transactions")
          .update({ cat: "להתעלם" })
          .eq("id", tx._dbId);
    });
  };
  const deleteSelected = async () => {
    const count = selectedUids.size;
    if (
      !window.confirm(
        `למחוק ${count} ${count === 1 ? "תנועה" : "תנועות"} שבחרת?\nפעולה זו אינה ניתנת לביטול.`,
      )
    )
      return;
    const toDelete = allTxs.filter((t) => selectedUids.has(t._uid));
    const extIds = toDelete
      .filter((t) => t.source === "ext")
      .map((t) => t._dbId)
      .filter(Boolean);
    const manIds = toDelete
      .filter((t) => t.source === "manual")
      .map((t) => t._dbId)
      .filter(Boolean);
    if (extIds.length > 0)
      await supabase
        .from("imported_transactions")
        .delete()
        .in("id", extIds)
        .eq("client_id", clientId);
    if (manIds.length > 0) {
      await supabase
        .from("manual_transactions")
        .delete()
        .in("id", manIds)
        .eq("client_id", clientId);
      manIds.forEach((id) => onManualTxDeleted && onManualTxDeleted(id));
    }
    // file txs — group by submission and patch the transactions JSON
    const fileTxs = toDelete.filter((t) => t.source === "file");
    if (fileTxs.length > 0) {
      const bySubmission: Record<string, number[]> = {};
      fileTxs.forEach((t) => {
        if (!bySubmission[t._submissionId]) bySubmission[t._submissionId] = [];
        bySubmission[t._submissionId].push(t._txIndex);
      });
      for (const [subId, indices] of Object.entries(bySubmission)) {
        const sub = portfolioSubs.find(
          (s: any) => String(s.id) === String(subId),
        );
        if (!sub) continue;
        const idxSet = new Set(indices);
        const newTxs = (sub.transactions || []).filter(
          (_: any, i: number) => !idxSet.has(i),
        );
        await supabase
          .from("portfolio_submissions")
          .update({ transactions: newTxs })
          .eq("id", sub.id);
      }
    }
    setDeletedUids((prev) => {
      const next = new Set(prev);
      selectedUids.forEach((uid) => next.add(uid));
      return next;
    });
    setSelectedUids(new Set());
    onDataChange();
  };
  // addingTx: { [billing_month]: null | "menu" | "income" | "expense-choice" | "expense-cash" | "expense-other" }
  const [addingTx, setAddingTx] = useState({});
  // addForm: per-month form fields
  const [addForm, setAddForm] = useState({});

  const setMonthAddMode = (month, mode) =>
    setAddingTx((p) => ({ ...p, [month]: mode }));
  const updateForm = (month, field, val) =>
    setAddForm((p) => ({
      ...p,
      [month]: { ...(p[month] || {}), [field]: val },
    }));
  const resetAdd = (month) => {
    setAddingTx((p) => ({ ...p, [month]: null }));
    setAddForm((p) => ({ ...p, [month]: {} }));
  };

  // ── שמירת תנועה ידנית ────────────────────────────────────────────────────────
  const saveManualTx = async (billing_month, type) => {
    const form = addForm[billing_month] || {};
    const name = (form.name || "").trim();
    const amount = Number(form.amount);
    const cat = form.cat || (type === "income" ? "הכנסות מזדמנות" : "");
    if (!name || !amount || !cat) return;

    // budget_type: הכנסה תמיד חד-משמעי. בהוצאה — אם השם קיים גם כ"קבוע" וגם
    // כ"משתנה", חובה שהמשתמש יבחר (ר' הבורר שמופיע בטופס); שם לא-דו-משמעי
    // נגזר אוטומטית מ-catBudgetTypes.
    let budget_type: string | null = null;
    if (type === "income") {
      budget_type = "הכנסה";
    } else {
      const types = catBudgetTypes[cat];
      if (types && types.size > 1) {
        budget_type = form.budgetTypeChoice || null;
        if (!budget_type) return;
      } else if (types && types.size === 1) {
        budget_type = Array.from(types)[0] as string;
      }
    }

    const row = {
      client_id: clientId,
      billing_month,
      name,
      amount,
      cat,
      type,
      budget_type,
      payment_method:
        type === "expense" ? form.payment_method || "מזומן" : null,
      date: form.date || null,
    };
    const { data, error } = await supabase
      .from("manual_transactions")
      .insert([row])
      .select()
      .single();
    if (error) {
      console.error(error);
      return;
    }
    await supabase
      .from("client_change_log")
      .insert([
        {
          client_id: clientId,
          event_type: "manual_entry",
          details: {
            category_name: data.cat,
            amount: data.amount,
            description: data.name,
          },
        },
      ]);
    // useMemo will pick up the new tx once onManualTxAdded updates the parent's manualTxs prop
    if (onManualTxAdded) onManualTxAdded(data);
    resetAdd(billing_month);
  };

  // ── מחיקת תנועה ידנית ────────────────────────────────────────────────────────
  const deleteManualTx = async (uid, dbId) => {
    setDeletingTxUid(uid);
    await supabase
      .from("manual_transactions")
      .delete()
      .eq("id", dbId)
      .eq("client_id", clientId);
    setDeletedUids((prev) => {
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
    if (onManualTxDeleted) onManualTxDeleted(dbId);
    setDeletingTxUid(null);
    setConfirmDelete(null);
  };

  const toggleMonth = (key) =>
    setOpenMonthKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const toggleYear = (year: number) =>
    setOpenYears((prev) => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });

  // ── מחיקת תנועה בודדת (imported בלבד) ──────────────────────────────────────
  const deleteTx = async (uid, dbId) => {
    setDeletingTxUid(uid);
    await supabase
      .from("imported_transactions")
      .delete()
      .eq("id", dbId)
      .eq("client_id", clientId);
    setDeletedUids((prev) => {
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
    setDeletingTxUid(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת submission שלם (portfolio) ────────────────────────────────────────
  const deleteSubmission = async (submissionId) => {
    setDeletingCycleKey(`sub-${submissionId}`);
    const uidsToRemove = allTxs
      .filter((t) => t._submissionId === submissionId)
      .map((t) => t._uid);
    await onDeletePortfolioSub(submissionId);
    setDeletedUids((prev) => {
      const next = new Set(prev);
      uidsToRemove.forEach((uid) => next.add(uid));
      return next;
    });
    setDeletingCycleKey(null);
    setConfirmDelete(null);
  };

  // ── מחיקת כל התנועות המיובאות ────────────────────────────────────────────────
  const deleteAllImported = async () => {
    setDeletingCycleKey("all-imported");
    const uidsToRemove = allTxs
      .filter((t) => t.source === "ext")
      .map((t) => t._uid);
    await supabase
      .from("imported_transactions")
      .delete()
      .eq("client_id", clientId);
    setDeletedUids((prev) => {
      const next = new Set(prev);
      uidsToRemove.forEach((uid) => next.add(uid));
      return next;
    });
    setDeletingCycleKey(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת חודש שלם (imported בלבד) ─────────────────────────────────────────
  const deleteCycle = async (cycleKey) => {
    setDeletingCycleKey(cycleKey);
    const toDelete = allTxs.filter(
      (t) => t.billing_month === cycleKey && t.source === "ext",
    );
    const ids = toDelete.map((t) => t._dbId).filter(Boolean);
    if (ids.length > 0) {
      await supabase
        .from("imported_transactions")
        .delete()
        .in("id", ids)
        .eq("client_id", clientId);
    }
    setDeletedUids((prev) => {
      const next = new Set(prev);
      toDelete.forEach((t) => next.add(t._uid));
      return next;
    });
    setDeletingCycleKey(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת תנועה בודדת מקובץ (portfolio) ─────────────────────────────────────
  const deleteFileTx = async (tx) => {
    setDeletingTxUid(tx._uid);
    const sub = portfolioSubs.find(
      (s: any) => String(s.id) === String(tx._submissionId),
    );
    if (sub) {
      const newTxs = (sub.transactions || []).filter(
        (_: any, i: number) => i !== tx._txIndex,
      );
      await supabase
        .from("portfolio_submissions")
        .update({ transactions: newTxs })
        .eq("id", sub.id);
    }
    setDeletedUids((prev) => {
      const next = new Set(prev);
      next.add(tx._uid);
      return next;
    });
    setDeletingTxUid(null);
    setConfirmDelete(null);
    onDataChange();
  };

  const HEBREW_MONTHS_LOCAL = [
    "ינואר",
    "פברואר",
    "מרץ",
    "אפריל",
    "מאי",
    "יוני",
    "יולי",
    "אוגוסט",
    "ספטמבר",
    "אוקטובר",
    "נובמבר",
    "דצמבר",
  ];

  function getCycleLabel(cycleKey, startDay) {
    const [y, m] = cycleKey.split("-").map(Number);
    let startMonth: number, startYear: number, endMonth: number, endDay: number;
    if (!startDay || startDay === 1) {
      // חודש קלנדרי רגיל: 1.MM – אחרון.MM
      startMonth = m;
      startYear = y;
      endMonth = m;
      endDay = new Date(y, m, 0).getDate();
    } else {
      // מחזור: startDay של חודש קודם עד startDay-1 של חודש ה-key
      // לדוגמה: key="2025-04", startDay=16 → 16.03 – 15.04
      startMonth = m - 1;
      startYear = y;
      if (startMonth === 0) {
        startMonth = 12;
        startYear = y - 1;
      }
      endMonth = m;
      endDay = startDay - 1;
    }
    return `${HEBREW_MONTHS_LOCAL[m - 1]} ${y} (${String(startDay).padStart(2, "0")}.${String(startMonth).padStart(2, "0")} – ${String(endDay).padStart(2, "0")}.${String(endMonth).padStart(2, "0")})`;
  }

  // ── קיבוץ לפי חודש חיוב ─────────────────────────────────────────────────────
  const filteredTxs = allTxs.filter((t) => {
    if (t.flow_type === "credit_transfer") return false;
    if (filterSource !== "all" && t.source !== filterSource) return false;
    if (filterProvider !== "all" && t.source_label !== filterProvider)
      return false;
    if (filterCat !== "all" && t.cat !== filterCat) return false;
    const q = searchText.trim().toLowerCase();
    if (q && !(t.name || "").toLowerCase().includes(q)) return false;
    if (filterDate && t.date !== filterDate) return false;
    return true;
  });
  const byCycle = {};
  filteredTxs.forEach((t) => {
    const key = t.billing_month || "unknown";
    if (!byCycle[key]) byCycle[key] = [];
    byCycle[key].push(t);
  });
  const cycleKeys = Object.keys(byCycle).sort().reverse();
  const yearStats: Record<
    number,
    { count: number; income: number; expense: number }
  > = {};
  cycleKeys.forEach((k) => {
    const y = Number(k.split("-")[0]);
    if (!yearStats[y]) yearStats[y] = { count: 0, income: 0, expense: 0 };
    const txs = (byCycle[k] || []).filter(
      (t) => !ignoredCats.has(t.cat) && t.flow_type !== "credit_transfer",
    );
    yearStats[y].count += txs.length;
    txs.forEach((t) => {
      if (incomeCats.has(t.cat)) yearStats[y].income += Number(t.amount || 0);
      else yearStats[y].expense += Number(t.amount || 0);
    });
  });
  const providerLabels = [
    ...new Set(allTxs.map((t) => t.source_label).filter(Boolean)),
  ];
  const totalAmount = filteredTxs
    .filter(
      (t) =>
        !ignoredCats.has(t.cat) &&
        t.flow_type !== "credit_transfer" &&
        t.status !== "pending",
    )
    .reduce(
      (s, t) =>
        s +
        (incomeCats.has(t.cat)
          ? -Number(t.amount || 0)
          : Number(t.amount || 0)),
      0,
    );

  // ── ייצוא Excel ──────────────────────────────────────────────────────────────
  const exportToExcel = () => {
    const XLSX = window.XLSX;
    if (!XLSX) {
      alert("ספריית Excel לא נטענה");
      return;
    }
    const wb = XLSX.utils.book_new();
    const detailRows = [];
    cycleKeys.forEach((key) => {
      const label = getCycleLabel(key, cycleStartDay);
      const cycleTxs = byCycle[key] || [];
      const cycleTotal = cycleTxs
        .filter((t) => !ignoredCats.has(t.cat))
        .reduce(
          (s, t) =>
            s +
            (incomeCats.has(t.cat)
              ? -Number(t.amount || 0)
              : Number(t.amount || 0)),
          0,
        );
      detailRows.push({
        חודש: label,
        "שם בית עסק": "",
        מקור: "",
        קטגוריה: "",
        סכום: "",
        'סה"כ חודש': Math.round(cycleTotal),
      });
      cycleTxs.forEach((t) => {
        detailRows.push({
          חודש: label,
          "שם בית עסק": t.name,
          מקור: t.source_label,
          קטגוריה: t.cat || "לא מסווג",
          סכום: Number(t.amount),
          'סה"כ חודש': "",
        });
      });
      detailRows.push({
        חודש: "",
        "שם בית עסק": 'סה"כ ' + label,
        מקור: "",
        קטגוריה: "",
        סכום: Math.round(cycleTotal),
        'סה"כ חודש': "",
      });
      detailRows.push({});
    });
    const summaryRows = [];
    const allCats = [
      ...new Set(
        filteredTxs.map((t) => t.cat).filter((c) => c && !ignoredCats.has(c)),
      ),
    ].sort();
    allCats.forEach((cat) => {
      const row = { קטגוריה: cat };
      cycleKeys.forEach((k) => {
        const sum = (byCycle[k] || [])
          .filter((t) => t.cat === cat)
          .reduce((s, t) => s + Number(t.amount || 0), 0);
        row[getCycleLabel(k, cycleStartDay)] = sum > 0 ? Math.round(sum) : "";
      });
      summaryRows.push(row);
    });
    const totalRow = { קטגוריה: 'סה"כ' };
    cycleKeys.forEach((k) => {
      const sum = (byCycle[k] || [])
        .filter((t) => !ignoredCats.has(t.cat))
        .reduce(
          (s, t) =>
            s +
            (incomeCats.has(t.cat)
              ? -Number(t.amount || 0)
              : Number(t.amount || 0)),
          0,
        );
      totalRow[getCycleLabel(k, cycleStartDay)] = Math.round(sum);
    });
    summaryRows.push(totalRow);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(detailRows),
      "פירוט",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(summaryRows),
      "סיכום",
    );
    XLSX.writeFile(wb, `מאזן_כל_התנועות.xlsx`);
  };

  // תנועות מזומן שממתינות לסיווג (conf !== 'high' ומקור ידני)
  const pendingClassification = allTxs.filter(
    (t) => t.source === "manual" && t.conf && t.conf !== "high",
  );

  return (
    <div>
      {/* באנר תנועות ממתינות לסיווג */}
      {pendingClassification.length > 0 && (
        <div
          style={{
            background: "rgba(247,92,92,0.1)",
            border: "1.5px solid var(--red)",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--red)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "var(--red)", fontSize: 16 }}>
              {pendingClassification.length} תנועות מזומן ממתינות לסיווג
            </div>
            <div
              style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}
            >
              נרשמו דרך וואטסאפ ולא סווגו אוטומטית — יש לסווג אותן לפני סגירת
              החודש
            </div>
          </div>
          <button
            onClick={() => {
              setFilterSource("manual");
              setTimeout(
                () =>
                  filterBarRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  }),
                50,
              );
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid var(--red)",
              background: "transparent",
              color: "var(--red)",
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              fontWeight: 600,
            }}
          >
            הצג ←
          </button>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setConfirmDelete(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 14,
              padding: "28px 32px",
              maxWidth: 360,
              width: "90%",
              textAlign: "center",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "center",
              }}
            >
              <DocIcon name="trash" color="var(--red)" size={30} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
              {confirmDelete.type === "all-imported"
                ? "מחק את כל תנועות המקס?"
                : confirmDelete.type === "cycle"
                  ? `מחק תנועות מקס מ-${confirmDelete.label}?`
                  : confirmDelete.type === "submission"
                    ? `מחק קובץ "${confirmDelete.label}"?`
                    : `מחק את "${confirmDelete.label}"?`}
            </div>
            <div
              style={{
                fontSize: 15,
                color: "var(--text-dim)",
                marginBottom: 20,
              }}
            >
              {confirmDelete.type === "all-imported"
                ? `${confirmDelete.count} תנועות יימחקו לצמיתות — ניתן לסנכרן מחדש`
                : confirmDelete.type === "cycle"
                  ? `${confirmDelete.count} תנועות יימחקו לצמיתות`
                  : confirmDelete.type === "submission"
                    ? `${confirmDelete.count} תנועות יימחקו לצמיתות`
                    : "התנועה תימחק לצמיתות"}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text-mid)",
                  fontSize: 16,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                ביטול
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "all-imported")
                    deleteAllImported();
                  else if (confirmDelete.type === "cycle")
                    deleteCycle(confirmDelete.cycleKey);
                  else if (confirmDelete.type === "submission")
                    deleteSubmission(confirmDelete.submissionId);
                  else if (confirmDelete.type === "manual")
                    deleteManualTx(confirmDelete.uid, confirmDelete.dbId);
                  else if (confirmDelete.type === "file")
                    deleteFileTx(confirmDelete.tx);
                  else deleteTx(confirmDelete.uid, confirmDelete.dbId);
                }}
                disabled={!!deletingTxUid || !!deletingCycleKey}
                style={{
                  padding: "9px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--red)",
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {deletingTxUid || deletingCycleKey ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "var(--green-deep)",
            letterSpacing: "-0.01em",
            lineHeight: 1.15,
            marginBottom: 6,
            marginTop: 0,
          }}
        >
          פירוט תנועות
        </h1>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-dim)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {maxLastSync && (
            <>
              <span>
                עדכון אחרון:{" "}
                <b style={{ color: "var(--text-mid)", fontWeight: 600 }}>
                  {new Date(maxLastSync).toLocaleDateString("he-IL")}
                </b>
              </span>
              <span style={{ color: "var(--border)" }}>·</span>
            </>
          )}
          <span>
            {filteredTxs.length}
            {filteredTxs.length !== allTxs.length
              ? ` מתוך ${allTxs.length}`
              : ""}{" "}
            תנועות
          </span>
          <span style={{ color: "var(--border)" }}>·</span>
          <span>
            סה"כ{" "}
            <span
              style={{
                fontFamily: "'Frank Ruhl Libre', serif",
                color: "var(--red)",
                fontWeight: 600,
                direction: "ltr",
                unicodeBidi: "embed",
                fontSize: 16,
              }}
            >
              {totalAmount <= 0
                ? `+₪${Math.abs(Math.round(totalAmount)).toLocaleString()}`
                : `₪−${Math.round(totalAmount).toLocaleString()}`}
            </span>
          </span>
        </div>
      </div>
      {/* Toolbar card */}
      <div
        ref={filterBarRef}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: "14px 18px",
          boxShadow: "0 1px 4px rgba(30,77,53,0.06)",
          marginBottom: 18,
        }}
      >
        {/* Row 1: search + actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Search */}
          <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
            <svg
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 16,
                height: 16,
                opacity: 0.55,
                pointerEvents: "none",
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="חיפוש לפי שם עסק או קטגוריה..."
              style={{
                width: "100%",
                padding: "10px 38px 10px 14px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "var(--surface2)",
                color: "var(--text)",
                fontSize: 14,
                fontFamily: "inherit",
                outline: "none",
                direction: "rtl",
                textAlign: "right",
                boxSizing: "border-box",
              }}
            />
          </div>
          {/* Excel — secondary */}
          <button
            onClick={exportToExcel}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              border: "1px solid var(--green-mint)",
              background: "var(--green-pale)",
              color: "var(--green-deep)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            Excel
          </button>
          {/* הוסף תנועות — primary */}
          <button
            onClick={onNavigateToUpload}
            style={{
              padding: "9px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              border: "1px solid transparent",
              background: "var(--green-mid)",
              color: "#fff",
              boxShadow: "0 4px 16px rgba(45,106,79,0.18)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            הוסף תנועות
          </button>
        </div>

        {/* Row 2: category filter + advanced toggle */}
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "var(--text-dim)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            קטגוריה:
          </span>
          {(() => {
            const allCatOptions = [
              ...new Set(allTxs.map((t) => t.cat).filter(Boolean)),
            ].sort();
            const allOpts = ["all", ...allCatOptions];
            return (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setCatDropdownOpen((p) => !p)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 140,
                    background:
                      filterCat !== "all"
                        ? "var(--green-mint)"
                        : "var(--surface2)",
                    border: `1px solid ${filterCat !== "all" ? "var(--green-soft)" : "var(--border)"}`,
                    borderRadius: 10,
                    padding: "8px 14px",
                    fontFamily: "inherit",
                    fontSize: 13,
                    color:
                      filterCat !== "all" ? "var(--green-deep)" : "var(--text)",
                    cursor: "pointer",
                    fontWeight: filterCat !== "all" ? 600 : 400,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      textAlign: "right",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filterCat === "all" ? "הכל" : filterCat}
                  </span>
                  <svg
                    style={{
                      width: 11,
                      height: 11,
                      flexShrink: 0,
                      transition: "transform 0.2s",
                      transform: catDropdownOpen ? "rotate(180deg)" : "none",
                    }}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </button>
                {catDropdownOpen && (
                  <>
                    <div
                      onClick={() => setCatDropdownOpen(false)}
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: "calc(var(--z-drop) - 1)",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        zIndex: "var(--z-drop)",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        minWidth: 180,
                        maxHeight: 260,
                        overflowY: "auto",
                        padding: 4,
                      }}
                    >
                      {allOpts.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setFilterCat(c);
                            setCatDropdownOpen(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "right",
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "none",
                            fontFamily: "inherit",
                            fontSize: 13,
                            cursor: "pointer",
                            background:
                              filterCat === c
                                ? "var(--green-mint)"
                                : "transparent",
                            color:
                              filterCat === c
                                ? "var(--green-deep)"
                                : "var(--text)",
                            fontWeight: filterCat === c ? 600 : 400,
                          }}
                        >
                          {c === "all" ? "הכל" : c}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          <button
            onClick={() => setAdvFilterOpen((p) => !p)}
            style={{
              marginRight: "auto",
              padding: "9px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-mid)",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              lineHeight: 1,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="8" cy="6" r="2" fill="currentColor" />
              <circle cx="15" cy="12" r="2" fill="currentColor" />
              <circle cx="10" cy="18" r="2" fill="currentColor" />
            </svg>
            סינון מתקדם
            <svg
              style={{
                width: 12,
                height: 12,
                transition: "transform 0.2s",
                transform: advFilterOpen ? "rotate(180deg)" : "none",
              }}
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 4l4 4 4-4" />
            </svg>
          </button>
          {(filterCat !== "all" ||
            filterSource !== "all" ||
            searchText.trim() ||
            filterDate ||
            filterProvider !== "all") && (
            <button
              onClick={() => {
                setFilterCat("all");
                setFilterSource("all");
                setFilterProvider("all");
                setSearchText("");
                setFilterDate("");
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-dim)",
              }}
            >
              נקה פילטרים
            </button>
          )}
        </div>

        {/* Advanced panel */}
        {advFilterOpen && (
          <div
            style={{
              marginTop: 14,
              paddingTop: 14,
              borderTop: "1px dashed var(--border)",
            }}
          >
            {/* מקור — pill-grp */}
            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                מקור:
              </span>
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--surface2)",
                  borderRadius: 10,
                  padding: 3,
                  gap: 2,
                }}
              >
                {[
                  ["all", "הכל"],
                  ["file", "קבצים"],
                  ["ext", "מקס"],
                  ["manual", "ידני"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    onClick={() => {
                      setFilterSource(v);
                      setFilterProvider("all");
                    }}
                    style={{
                      background:
                        filterSource === v ? "var(--surface)" : "transparent",
                      border: 0,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontFamily: "inherit",
                      fontSize: 13,
                      fontWeight: filterSource === v ? 600 : 500,
                      color:
                        filterSource === v
                          ? "var(--green-deep)"
                          : "var(--text-mid)",
                      cursor: "pointer",
                      boxShadow:
                        filterSource === v
                          ? "0 1px 2px rgba(0,0,0,0.04)"
                          : "none",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {/* Provider sub-filter */}
            {providerLabels.length > 1 && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  ספק:
                </span>
                <div
                  style={{
                    display: "inline-flex",
                    background: "var(--surface2)",
                    borderRadius: 10,
                    padding: 3,
                    gap: 2,
                  }}
                >
                  {[["all", "הכל"], ...providerLabels.map((p) => [p, p])].map(
                    ([v, l]) => (
                      <button
                        key={v}
                        onClick={() => setFilterProvider(v)}
                        style={{
                          background:
                            filterProvider === v
                              ? "var(--surface)"
                              : "transparent",
                          border: 0,
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontFamily: "inherit",
                          fontSize: 13,
                          fontWeight: filterProvider === v ? 600 : 500,
                          color:
                            filterProvider === v
                              ? "var(--green-deep)"
                              : "var(--text-mid)",
                          cursor: "pointer",
                          boxShadow:
                            filterProvider === v
                              ? "0 1px 2px rgba(0,0,0,0.04)"
                              : "none",
                        }}
                      >
                        {l}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}
            {/* Date filter */}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-dim)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                תאריך:
              </span>
              {filterDate ? (
                <>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      color: "var(--text)",
                      fontSize: 13,
                      fontFamily: "inherit",
                    }}
                  />
                  <button
                    onClick={() => setFilterDate("")}
                    style={{
                      padding: "5px 8px",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-dim)",
                    }}
                  >
                    ×
                  </button>
                </>
              ) : (
                <button
                  onClick={() =>
                    setFilterDate(new Date().toISOString().slice(0, 10))
                  }
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-dim)",
                  }}
                >
                  + בחר תאריך
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Unified expandable month list ── */}
      <RememberModal
        pendingRemember={pendingRemember}
        onAlways={async () => {
          const { name, cat, budgetType } = pendingRemember;
          const oldCat = rememberedMappings[name] || null;
          // עדכן ext txs ב-DB + localEdits (כולל file source)
          await supabase
            .from("imported_transactions")
            .update({ cat, budget_type: budgetType })
            .eq("client_id", clientId)
            .eq("name", name);
          setLocalEdits((prev) => {
            const next = new Map(prev);
            allTxs
              .filter(
                (t) =>
                  (t.source === "ext" || t.source === "file") &&
                  t.name === name,
              )
              .forEach((t) => next.set(t._uid, cat));
            return next;
          });
          // עדכן file-source txs ב-portfolio_submissions
          const fileTxsBySubmission: Record<string, number[]> = {};
          allTxs
            .filter((t) => t.source === "file" && t.name === name)
            .forEach((t) => {
              if (!fileTxsBySubmission[t._submissionId])
                fileTxsBySubmission[t._submissionId] = [];
              fileTxsBySubmission[t._submissionId].push(t._txIndex);
            });
          for (const [subId, indices] of Object.entries(fileTxsBySubmission)) {
            const sub = portfolioSubs.find(
              (s: any) => String(s.id) === String(subId),
            );
            if (!sub) continue;
            const newTxs = (sub.transactions || []).map((t: any, i: number) =>
              indices.includes(i) ? { ...t, cat, budget_type: budgetType } : t,
            );
            await supabase
              .from("portfolio_submissions")
              .update({ transactions: newTxs })
              .eq("id", sub.id);
          }
          await supabase
            .from("remembered_mappings")
            .upsert(
              [{ client_id: clientId, business_name: name, category: cat, budget_type: budgetType }],
              { onConflict: "client_id,business_name" },
            );
          await supabase
            .from("client_change_log")
            .insert([
              {
                client_id: clientId,
                event_type: "remap_business",
                details: { business_name: name, from_cat: oldCat, to_cat: cat },
              },
            ]);
          setPendingRemember(null);
          onDataChange();
        }}
        onJustHere={async () => {
          const { singleUid, cat, budgetType } = pendingRemember;
          const tx = allTxs.find((t) => t._uid === singleUid);
          if (tx?._dbId)
            await supabase
              .from("imported_transactions")
              .update({ cat, budget_type: budgetType })
              .eq("id", tx._dbId);
          setPendingRemember(null);
          onDataChange();
        }}
      />

      {cycleKeys.map((key, idx) => {
        const cycleTxs = byCycle[key] || [];
        if (cycleTxs.length === 0) return null;
        const cardYear = Number(key.split("-")[0]);
        const prevYear =
          idx > 0 ? Number(cycleKeys[idx - 1].split("-")[0]) : null;
        const isFirstOfYear = cardYear !== prevYear;
        const yearOpen = openYears.has(cardYear);
        const ys = yearStats[cardYear] || { count: 0, income: 0, expense: 0 };
        // תנועות pending (טרם נקלטו סופית אצל הספק — אין עדיין ARN) לא נכללות בשום
        // סכום/רשימה רגילה, רק ברובריקה הייעודית למטה. ברגע שהן "נקלטות" (הופכות
        // completed בסנכרון מחדש) הן עוברות אוטומטית לרשימה הרגילה — אין צורך במעקב
        // ידני, כי זו אותה שורה ב-DB שפשוט מתעדכנת (ר' ingest_bank_transactions).
        const pendingTxs = cycleTxs.filter((t) => t.status === "pending");
        const cycleTxsFinal = cycleTxs.filter((t) => t.status !== "pending");
        const sortedCycleTxs = [...cycleTxsFinal].sort((a, b) => {
          const { field, dir } = sortConfig;
          let va: any = a[field],
            vb: any = b[field];
          if (field === "amount") {
            va = Number(va || 0);
            vb = Number(vb || 0);
          } else {
            va = (va || "").toString();
            vb = (vb || "").toString();
          }
          if (va < vb) return dir === "asc" ? -1 : 1;
          if (va > vb) return dir === "asc" ? 1 : -1;
          return 0;
        });
        const activeTxs = sortedCycleTxs.filter((t) => !ignoredCats.has(t.cat));
        const ignoredTxs = sortedCycleTxs.filter((t) => ignoredCats.has(t.cat));
        const cycleTotal = activeTxs
          .filter((t) => t.flow_type !== "credit_transfer")
          .reduce(
            (s, t) =>
              s +
              (incomeCats.has(t.cat)
                ? -Number(t.amount || 0)
                : Number(t.amount || 0)),
            0,
          );
        const catMap: Record<string, number> = {};
        activeTxs.forEach((t) => {
          catMap[t.cat] =
            (catMap[t.cat] || 0) +
            (incomeCats.has(t.cat)
              ? -Number(t.amount || 0)
              : Number(t.amount || 0));
        });
        const top3 = Object.entries(catMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        const label = getCycleLabel(key, cycleStartDay);
        const isOpen = openMonthKeys.has(key);

        // unique submissions in this month
        const submissionIds = [
          ...new Set(
            cycleTxs
              .filter((t) => t.source === "file")
              .map((t) => t._submissionId),
          ),
        ];
        const hasExtTxs = cycleTxs.some((t) => t.source === "ext");

        const renderTxRow = (tx, isIgnored) => {
          const needsClassification =
            tx.source === "manual" && tx.conf && tx.conf !== "high";
          const isUncat = !tx.cat || tx.cat === "לא מסווג";
          const isIncome = tx.type === "income" || incomeCats.has(tx.cat);
          return (
            <div
              key={tx._uid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                background: needsClassification
                  ? "rgba(247,92,92,0.04)"
                  : isIgnored
                    ? "rgba(180,180,180,0.06)"
                    : "var(--surface)",
                border: `1px solid ${selectedUids.has(tx._uid) ? "var(--green-mid)" : needsClassification ? "rgba(192,57,43,0.25)" : "var(--border)"}`,
                borderRadius: 12,
                padding: "12px 16px",
                flexWrap: "wrap",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <input
                type="checkbox"
                checked={selectedUids.has(tx._uid)}
                onChange={() => toggleSelectTx(tx._uid)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 18,
                  height: 18,
                  cursor: "pointer",
                  flexShrink: 0,
                  accentColor: "var(--green-mid)",
                  borderRadius: 4,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    color: isIgnored ? "var(--text-dim)" : "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    marginBottom: 3,
                    textDecoration: isIgnored ? "line-through" : "none",
                  }}
                >
                  {tx.name}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-dim)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {tx.date && (
                    <span style={{ direction: "ltr", unicodeBidi: "embed" }}>
                      {tx.date}
                    </span>
                  )}
                  {tx.date && tx.source_label && (
                    <span style={{ color: "var(--border)" }}>·</span>
                  )}
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      background: "var(--surface2)",
                      color: "var(--text-mid)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    {tx.source_label}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveTxUid(tx._uid === activeTxUid ? null : tx._uid);
                  setCatSearch("");
                  setPendingRemember(null);
                }}
                style={{
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 500,
                  background: "var(--surface2)",
                  border: `1px solid ${isUncat ? "rgba(192,57,43,0.2)" : "var(--border)"}`,
                  color: isUncat ? "var(--red)" : "var(--text-mid)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {tx.cat || "לא מסווג"}
              </button>
              {!isIgnored && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const cat = "להתעלם";
                    setLocalEdits((prev) => {
                      const next = new Map(prev);
                      next.set(tx._uid, cat);
                      return next;
                    });
                    if (tx.source === "manual") {
                      await supabase
                        .from("manual_transactions")
                        .update({ cat, conf: "high" })
                        .eq("id", tx._dbId);
                      onDataChange();
                    } else if (tx.source === "ext") {
                      if (tx._dbId)
                        await supabase
                          .from("imported_transactions")
                          .update({ cat })
                          .eq("id", tx._dbId);
                    } else {
                      await onUpdatePortfolioTxCat(
                        tx._submissionId,
                        tx._txIndex,
                        cat,
                      );
                      onDataChange();
                    }
                  }}
                  title="התעלם מתנועה זו — לא תיספר"
                  style={{
                    width: 28,
                    height: 28,
                    display: "grid",
                    placeItems: "center",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 15,
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    flexShrink: 0,
                  }}
                >
                  ⊘
                </button>
              )}
              <span
                style={{
                  fontFamily: "'Frank Ruhl Libre', serif",
                  fontWeight: 600,
                  fontSize: 17,
                  letterSpacing: "-0.2px",
                  color: isIncome
                    ? "var(--green-mid)"
                    : isIgnored
                      ? "var(--text-dim)"
                      : "var(--red)",
                  direction: "ltr",
                  unicodeBidi: "embed",
                  minWidth: 90,
                  textAlign: "left",
                  whiteSpace: "nowrap",
                }}
              >
                {isIncome ? "+" : ""}₪{Number(tx.amount).toLocaleString()}
              </span>
              <button
                onClick={() => {
                  if (tx.source === "manual")
                    setConfirmDelete({
                      type: "manual",
                      uid: tx._uid,
                      dbId: tx._dbId,
                      label: tx.name,
                    });
                  else if (tx.source === "file")
                    setConfirmDelete({
                      type: "file",
                      uid: tx._uid,
                      tx,
                      label: tx.name,
                    });
                  else
                    setConfirmDelete({
                      type: "tx",
                      uid: tx._uid,
                      dbId: tx._dbId,
                      label: tx.name,
                    });
                }}
                title="מחק תנועה"
                style={{
                  width: 32,
                  height: 32,
                  display: "grid",
                  placeItems: "center",
                  background: "transparent",
                  border: "1px solid transparent",
                  borderRadius: 8,
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--red)";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--red-light)";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "rgba(192,57,43,0.18)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--text-dim)";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "transparent";
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
              {activeTxUid === tx._uid && (
                <div style={{ width: "100%" }}>
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
                    onSelect={async (cat, budgetType) => {
                      if (tx.source === "ext") {
                        setLocalEdits((prev) => {
                          const next = new Map(prev);
                          next.set(tx._uid, cat);
                          return next;
                        });
                        setPendingRemember({
                          name: tx.name,
                          cat,
                          singleUid: tx._uid,
                          budgetType,
                        });
                      } else if (tx.source === "manual") {
                        const oldCat = tx.cat;
                        await supabase
                          .from("manual_transactions")
                          .update({ cat, budget_type: budgetType, conf: "high" })
                          .eq("id", tx._dbId);
                        await supabase
                          .from("client_change_log")
                          .insert([
                            {
                              client_id: clientId,
                              event_type: "remap_business",
                              details: {
                                business_name: tx.name,
                                from_cat: oldCat,
                                to_cat: cat,
                              },
                            },
                          ]);
                        setLocalEdits((prev) => {
                          const next = new Map(prev);
                          next.set(tx._uid, cat);
                          return next;
                        });
                        onDataChange();
                      } else {
                        setLocalEdits((prev) => {
                          const next = new Map(prev);
                          next.set(tx._uid, cat);
                          return next;
                        });
                        await onUpdatePortfolioTxCat(
                          tx._submissionId,
                          tx._txIndex,
                          cat,
                          budgetType,
                        );
                        onDataChange();
                      }
                      setActiveTxUid(null);
                    }}
                  />
                </div>
              )}
            </div>
          );
        };

        const cycleExpenses = activeTxs
          .filter(
            (t) => t.flow_type !== "credit_transfer" && !incomeCats.has(t.cat),
          )
          .reduce((s, t) => s + Number(t.amount || 0), 0);
        const cycleIncome = activeTxs
          .filter(
            (t) => t.flow_type !== "credit_transfer" && incomeCats.has(t.cat),
          )
          .reduce((s, t) => s + Number(t.amount || 0), 0);
        const cycleBalance = cycleIncome - cycleExpenses;

        return (
          <Fragment key={key}>
            {isFirstOfYear && (
              <div
                onClick={() => toggleYear(cardYear)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  marginTop: idx === 0 ? 0 : 22,
                  marginBottom: 14,
                  cursor: "pointer",
                  borderBottom: "2px solid var(--green-mint)",
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    transform: yearOpen ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                    display: "inline-block",
                  }}
                >
                  ▸
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 20,
                    color: "var(--green-deep)",
                  }}
                >
                  {cardYear}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                  {ys.count} תנועות · הוצאות ₪{Math.round(ys.expense).toLocaleString()} · הכנסות +₪{Math.round(ys.income).toLocaleString()}
                </span>
              </div>
            )}
            {yearOpen && (
          <div style={{ marginBottom: 14 }}>
            {/* Month header — click to expand/collapse */}
            <div
              onClick={() => toggleMonth(key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderBottom: isOpen
                  ? "1px solid var(--border)"
                  : "1px solid var(--border)",
                borderRadius: isOpen ? "14px 14px 0 0" : 14,
                padding: "16px 20px",
                cursor: "pointer",
                boxShadow: "0 1px 4px rgba(30,77,53,0.06)",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
            >
              {/* Month name */}
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  color: "var(--green-deep)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.2,
                  flexShrink: 0,
                }}
              >
                {label}
              </div>
              {/* Summary */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  fontSize: 13,
                  color: "var(--text-dim)",
                  flex: 1,
                }}
              >
                <span>
                  <b style={{ color: "var(--text-mid)", fontWeight: 600 }}>
                    {activeTxs.length}
                  </b>{" "}
                  תנועות
                </span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span>
                  הוצאות{" "}
                  <span
                    style={{
                      fontFamily: "'Frank Ruhl Libre', serif",
                      fontWeight: 600,
                      fontSize: 17,
                      lineHeight: 1,
                      letterSpacing: "-0.3px",
                      direction: "ltr",
                      unicodeBidi: "embed",
                      color: "var(--red)",
                    }}
                  >
                    ₪−{Math.round(cycleExpenses).toLocaleString()}
                  </span>
                </span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span>
                  הכנסות{" "}
                  <span
                    style={{
                      fontFamily: "'Frank Ruhl Libre', serif",
                      fontWeight: 600,
                      fontSize: 17,
                      lineHeight: 1,
                      letterSpacing: "-0.3px",
                      direction: "ltr",
                      unicodeBidi: "embed",
                      color: "var(--green-mid)",
                    }}
                  >
                    +₪{Math.round(cycleIncome).toLocaleString()}
                  </span>
                </span>
                <span style={{ color: "var(--border)" }}>·</span>
                <span>
                  מאזן{" "}
                  <span
                    style={{
                      fontFamily: "'Frank Ruhl Libre', serif",
                      fontWeight: 600,
                      fontSize: 17,
                      lineHeight: 1,
                      letterSpacing: "-0.3px",
                      direction: "ltr",
                      unicodeBidi: "embed",
                      color:
                        cycleBalance >= 0 ? "var(--green-mid)" : "var(--red)",
                    }}
                  >
                    {cycleBalance >= 0
                      ? `+₪${Math.round(cycleBalance).toLocaleString()}`
                      : `₪−${Math.abs(Math.round(cycleBalance)).toLocaleString()}`}
                  </span>
                </span>
              </div>
              {/* Actions */}
              {(() => {
                if (cycleTxs.length === 0) return null;
                const allSel = cycleTxs.every((t) => selectedUids.has(t._uid));
                const monthSelectedCount = cycleTxs.filter((t) =>
                  selectedUids.has(t._uid),
                ).length;
                return (
                  <div
                    style={{ display: "flex", gap: 6, alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => toggleSelectMonth(cycleTxs)}
                      style={{
                        padding: "7px 12px",
                        fontSize: 13,
                        borderRadius: 8,
                        fontFamily: "inherit",
                        cursor: "pointer",
                        fontWeight: 600,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text-mid)",
                      }}
                    >
                      {allSel ? "בטל בחירה" : "בחר הכל"}
                    </button>
                    {monthSelectedCount > 0 ? (
                      <>
                        <button
                          onClick={ignoreSelected}
                          style={{
                            padding: "6px 14px",
                            fontSize: 13,
                            borderRadius: 8,
                            fontFamily: "inherit",
                            cursor: "pointer",
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            color: "var(--text-mid)",
                            fontWeight: 600,
                          }}
                        >
                          ⊘ התעלם ({monthSelectedCount})
                        </button>
                        <button
                          onClick={deleteSelected}
                          style={{
                            padding: "6px 14px",
                            fontSize: 13,
                            borderRadius: 8,
                            fontFamily: "inherit",
                            cursor: "pointer",
                            border: "1px solid #e53935",
                            background: "var(--red)",
                            color: "#fff",
                            fontWeight: 600,
                          }}
                        >
                          מחק ({monthSelectedCount})
                        </button>
                        <button
                          onClick={() => setSelectedUids(new Set())}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: 18,
                            padding: "0 4px",
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </>
                    ) : isOpen ? (
                      <button
                        onClick={() => deleteMonth(cycleTxs)}
                        style={{
                          padding: "7px 12px",
                          fontSize: 13,
                          borderRadius: 8,
                          fontFamily: "inherit",
                          cursor: "pointer",
                          fontWeight: 600,
                          border: "1px solid var(--red-light)",
                          background: "transparent",
                          color: "var(--red)",
                        }}
                      >
                        מחק חודש
                      </button>
                    ) : null}
                  </div>
                );
              })()}
              {/* Chevron */}
              <svg
                style={{
                  width: 20,
                  height: 20,
                  color: "var(--text-dim)",
                  transition: "transform 0.2s",
                  transform: isOpen ? "rotate(180deg)" : "none",
                  flexShrink: 0,
                }}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderTop: "none",
                  borderRadius: "0 0 14px 14px",
                  background: "var(--surface)",
                  padding: "14px 18px 18px",
                }}
              >
                {/* תנועות שטרם נקלטו סופית — לא נכללות בסכומים */}
                {pendingTxs.length > 0 && (
                  <div
                    style={{
                      background: "rgba(230,126,34,0.06)",
                      border: "1px solid rgba(230,126,34,0.25)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      marginBottom: 14,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#b9660b",
                        marginBottom: 4,
                      }}
                    >
                      ⏳ {pendingTxs.length} תנועות טרם נקלטו סופית
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-dim)",
                        marginBottom: 8,
                      }}
                    >
                      התנועות האלה עדיין לא אושרו סופית מול חברת האשראי, ולכן לא
                      נכללות בסכומי החודש. סנכרן שוב בהמשך — ברגע שהן ייקלטו הן
                      יתווספו אוטומטית לרשימה הרגילה וההודעה הזו תיעלם.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {pendingTxs.map((t) => (
                        <div
                          key={t._uid}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 12.5,
                            color: "var(--text-mid)",
                          }}
                        >
                          <span>{t.name}</span>
                          <span style={{ direction: "ltr" }}>₪{Number(t.amount).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sort bar */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 12,
                    paddingBottom: 12,
                    borderBottom: "1px dashed var(--border)",
                  }}
                >
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    מיון:
                  </span>
                  {(
                    [
                      ["date", "תאריך"],
                      ["amount", "סכום"],
                      ["cat", "קטגוריה"],
                    ] as const
                  ).map(([field, label]) => {
                    const active = sortConfig.field === field;
                    return (
                      <button
                        key={field}
                        onClick={() =>
                          setSortConfig((prev) => ({
                            field,
                            dir:
                              prev.field === field && prev.dir === "asc"
                                ? "desc"
                                : "asc",
                          }))
                        }
                        style={{
                          padding: "4px 12px",
                          borderRadius: 14,
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 500,
                          border: `1px solid ${active ? "var(--green-mid)" : "var(--border)"}`,
                          background: active
                            ? "var(--green-mint)"
                            : "transparent",
                          color: active
                            ? "var(--green-deep)"
                            : "var(--text-mid)",
                          transition: "all 0.15s",
                        }}
                      >
                        {label}
                        {active ? (sortConfig.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  // קיבוץ לפי source_label
                  const groups: {
                    label: string;
                    source: string;
                    txs: typeof activeTxs;
                  }[] = [];
                  activeTxs.forEach((tx) => {
                    const lbl =
                      tx.source_label ||
                      (tx.source === "ext"
                        ? "מקס"
                        : tx.source === "manual"
                          ? "ידני"
                          : "קובץ");
                    const existing = groups.find((g) => g.label === lbl);
                    if (existing) existing.txs.push(tx);
                    else
                      groups.push({ label: lbl, source: tx.source, txs: [tx] });
                  });
                  return groups.map((g) => {
                    const groupColor =
                      g.source === "ext"
                        ? "var(--green-mid)"
                        : g.source === "manual"
                          ? "var(--gold)"
                          : "var(--green-deep)";
                    const groupBg =
                      g.source === "ext"
                        ? "rgba(79,142,247,0.07)"
                        : g.source === "manual"
                          ? "rgba(251,191,36,0.07)"
                          : "rgba(46,204,138,0.07)";
                    const groupTotal = Math.round(
                      g.txs
                        .filter((t) => t.flow_type !== "credit_transfer")
                        .reduce(
                          (s, t) =>
                            s +
                            (incomeCats.has(t.cat) ? -1 : 1) *
                              Number(t.amount || 0),
                          0,
                        ),
                    );
                    const groupUids = g.txs.map((t) => t._uid);
                    const allGroupSel = groupUids.every((uid) =>
                      selectedUids.has(uid),
                    );
                    const deleteGroup = async () => {
                      if (
                        !window.confirm(
                          `למחוק את כל ${g.txs.length} התנועות של המקור "${g.label}"?`,
                        )
                      )
                        return;
                      const toDelete = g.txs;
                      const extIds = toDelete
                        .filter((t) => t.source === "ext")
                        .map((t) => t._dbId)
                        .filter(Boolean);
                      const manIds = toDelete
                        .filter((t) => t.source === "manual")
                        .map((t) => t._dbId)
                        .filter(Boolean);
                      if (extIds.length > 0)
                        await supabase
                          .from("imported_transactions")
                          .delete()
                          .in("id", extIds)
                          .eq("client_id", clientId);
                      if (manIds.length > 0) {
                        await supabase
                          .from("manual_transactions")
                          .delete()
                          .in("id", manIds)
                          .eq("client_id", clientId);
                        manIds.forEach(
                          (id) => onManualTxDeleted && onManualTxDeleted(id),
                        );
                      }
                      const fileTxs = toDelete.filter(
                        (t) => t.source === "file",
                      );
                      if (fileTxs.length > 0) {
                        const bySubmission: Record<string, number[]> = {};
                        fileTxs.forEach((t) => {
                          if (!bySubmission[t._submissionId])
                            bySubmission[t._submissionId] = [];
                          bySubmission[t._submissionId].push(t._txIndex);
                        });
                        for (const [subId, indices] of Object.entries(
                          bySubmission,
                        )) {
                          const sub = portfolioSubs.find(
                            (s: any) => String(s.id) === String(subId),
                          );
                          if (!sub) continue;
                          const idxSet = new Set(indices);
                          const newTxs = (sub.transactions || []).filter(
                            (_: any, i: number) => !idxSet.has(i),
                          );
                          await supabase
                            .from("portfolio_submissions")
                            .update({ transactions: newTxs })
                            .eq("id", sub.id);
                        }
                      }
                      setDeletedUids((prev) => {
                        const next = new Set(prev);
                        groupUids.forEach((uid) => next.add(uid));
                        return next;
                      });
                      setSelectedUids((prev) => {
                        const next = new Set(prev);
                        groupUids.forEach((uid) => next.delete(uid));
                        return next;
                      });
                      onDataChange();
                    };
                    return (
                      <div key={g.label} style={{ marginTop: 14 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            marginBottom: 8,
                            padding: "10px 14px",
                            background: "var(--surface2)",
                            borderRadius: 10,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: "var(--green-deep)",
                            }}
                          >
                            {g.label}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              color: "var(--text-dim)",
                              fontWeight: 500,
                            }}
                          >
                            {g.txs.length} תנועות
                          </span>
                          <span
                            style={{
                              marginRight: "auto",
                              fontFamily: "'Frank Ruhl Libre', serif",
                              fontSize: 16,
                              fontWeight: 600,
                              letterSpacing: "-0.2px",
                              direction: "ltr",
                              unicodeBidi: "embed",
                              color:
                                groupTotal <= 0
                                  ? "var(--green-mid)"
                                  : "var(--red)",
                            }}
                          >
                            {groupTotal <= 0
                              ? `+₪${Math.abs(groupTotal).toLocaleString()}`
                              : `₪−${groupTotal.toLocaleString()}`}
                          </span>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() =>
                                setSelectedUids((prev) => {
                                  const next = new Set(prev);
                                  if (allGroupSel)
                                    groupUids.forEach((uid) =>
                                      next.delete(uid),
                                    );
                                  else
                                    groupUids.forEach((uid) => next.add(uid));
                                  return next;
                                })
                              }
                              style={{
                                padding: "7px 12px",
                                fontSize: 13,
                                borderRadius: 8,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                fontWeight: 600,
                                border: "1px solid var(--border)",
                                background: "transparent",
                                color: "var(--text-mid)",
                              }}
                            >
                              {allGroupSel ? "בטל בחירה" : "בחר הכל"}
                            </button>
                            <button
                              onClick={deleteGroup}
                              style={{
                                padding: "7px 12px",
                                fontSize: 13,
                                borderRadius: 8,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                fontWeight: 600,
                                border: "1px solid var(--red-light)",
                                background: "transparent",
                                color: "var(--red)",
                              }}
                            >
                              מחק מקור
                            </button>
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                          }}
                        >
                          {g.txs.map((tx) => renderTxRow(tx, false))}
                        </div>
                      </div>
                    );
                  });
                })()}
                {/* Hidden transactions */}
                {ignoredTxs.length > 0 && (
                  <>
                    <div
                      style={{
                        marginTop: 12,
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 12px",
                        background: "var(--surface2)",
                        borderRadius: 8,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 16,
                          color: "var(--text-dim)",
                          fontWeight: 600,
                        }}
                        title={`קטגוריות מוסתרות: ${[...ignoredCats].join(", ")}`}
                      >
                        {ignoredTxs.length} תנועות מוסתרות (קטגוריות מסוננות)
                      </span>
                      <button
                        onClick={() =>
                          setIgnoredOpen((p) => ({ ...p, [key]: !p[key] }))
                        }
                        style={{
                          padding: "4px 14px",
                          borderRadius: 10,
                          fontSize: 15,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-dim)",
                          fontWeight: 600,
                        }}
                      >
                        {ignoredOpen[key] ? "הסתר ▲" : "הצג ▼"}
                      </button>
                    </div>
                    {ignoredOpen[key] &&
                      ignoredTxs.map((tx) => renderTxRow(tx, true))}
                  </>
                )}

                {/* הוסף תנועה ידנית */}
                {(() => {
                  const mode = addingTx[key];
                  const form = addForm[key] || {};
                  const allCats = [
                    ...Object.values(categories || CATEGORIES).flat(),
                    ...(clientCats || []),
                  ];
                  const inputS = {
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "6px 10px",
                    fontSize: 15,
                    fontFamily: "inherit",
                    background: "var(--surface2)",
                    color: "var(--text)",
                    width: "100%",
                  };
                  const rowS: React.CSSProperties = {
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "flex-end",
                    marginBottom: 8,
                  };

                  if (!mode)
                    return (
                      <div style={{ marginTop: 10, marginBottom: 4 }}>
                        <button
                          onClick={() => setMonthAddMode(key, "menu")}
                          style={{
                            padding: "5px 14px",
                            fontSize: 14,
                            fontFamily: "inherit",
                            borderRadius: 8,
                            border: "1.5px dashed var(--green-mid)",
                            background: "var(--green-mint)",
                            color: "var(--green-deep)",
                            cursor: "pointer",
                          }}
                        >
                          + הוסף תנועה
                        </button>
                      </div>
                    );

                  if (mode === "menu")
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{ fontSize: 15, color: "var(--text-dim)" }}
                        >
                          סוג תנועה:
                        </span>
                        <button
                          onClick={() => setMonthAddMode(key, "income")}
                          style={{
                            padding: "5px 14px",
                            fontSize: 14,
                            fontFamily: "inherit",
                            borderRadius: 8,
                            border: "1px solid var(--green-soft)",
                            background: "var(--green-mint)",
                            color: "var(--green-deep)",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          + הוסף הכנסה
                        </button>
                        <button
                          onClick={() => setMonthAddMode(key, "expense-choice")}
                          style={{
                            padding: "5px 14px",
                            fontSize: 14,
                            fontFamily: "inherit",
                            borderRadius: 8,
                            border: "1px solid var(--red)",
                            background: "var(--red-light)",
                            color: "var(--red)",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          − הוסף הוצאה
                        </button>
                        <button
                          onClick={() => resetAdd(key)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: 20,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );

                  if (mode === "income")
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          background: "rgba(46,204,138,0.05)",
                          border: "1px solid rgba(46,204,138,0.2)",
                          borderRadius: 10,
                          padding: "14px 14px 10px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 15,
                            marginBottom: 10,
                            color: "var(--green-deep)",
                          }}
                        >
                          + הכנסה מזדמנת
                        </div>
                        <div style={rowS}>
                          <div style={{ flex: 2, minWidth: 140 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              פירוט *
                            </div>
                            <input
                              style={inputS}
                              value={form.name || ""}
                              onChange={(e) =>
                                updateForm(key, "name", e.target.value)
                              }
                              placeholder="תיאור ההכנסה"
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 90 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              סכום (₪) *
                            </div>
                            <input
                              type="number"
                              style={inputS}
                              value={form.amount || ""}
                              onChange={(e) =>
                                updateForm(key, "amount", e.target.value)
                              }
                              placeholder="0"
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 110 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              תאריך (אופציונלי)
                            </div>
                            <input
                              type="date"
                              style={inputS}
                              value={form.date || ""}
                              onChange={(e) =>
                                updateForm(key, "date", e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => saveManualTx(key, "income")}
                            disabled={!form.name || !form.amount}
                            style={{
                              padding: "6px 18px",
                              borderRadius: 8,
                              border: "none",
                              background: "var(--green-mid)",
                              color: "#fff",
                              fontSize: 15,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              opacity: !form.name || !form.amount ? 0.5 : 1,
                            }}
                          >
                            שמור
                          </button>
                          <button
                            onClick={() => resetAdd(key)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface2)",
                              color: "var(--text)",
                              fontSize: 15,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    );

                  if (mode === "expense-choice")
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{ fontSize: 15, color: "var(--text-dim)" }}
                        >
                          צורת תשלום:
                        </span>
                        <button
                          onClick={() => {
                            setMonthAddMode(key, "expense-cash");
                            updateForm(key, "payment_method", "מזומן");
                          }}
                          style={{
                            padding: "5px 14px",
                            fontSize: 14,
                            fontFamily: "inherit",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--surface2)",
                            color: "var(--text)",
                            cursor: "pointer",
                          }}
                        >
                          מזומן
                        </button>
                        <button
                          onClick={() => setMonthAddMode(key, "expense-other")}
                          style={{
                            padding: "5px 14px",
                            fontSize: 14,
                            fontFamily: "inherit",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--surface2)",
                            color: "var(--text)",
                            cursor: "pointer",
                          }}
                        >
                          אחר
                        </button>
                        <button
                          onClick={() => resetAdd(key)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-dim)",
                            cursor: "pointer",
                            fontSize: 20,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    );

                  if (mode === "expense-cash" || mode === "expense-other")
                    return (
                      <div
                        style={{
                          marginTop: 10,
                          background: "rgba(247,92,92,0.04)",
                          border: "1px solid rgba(247,92,92,0.18)",
                          borderRadius: 10,
                          padding: "14px 14px 10px",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 15,
                            marginBottom: 10,
                            color: "var(--red)",
                          }}
                        >
                          − הוצאה {mode === "expense-cash" ? "במזומן" : ""}
                        </div>
                        {mode === "expense-other" && (
                          <div style={{ ...rowS, marginBottom: 8 }}>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <div
                                style={{
                                  fontSize: 15,
                                  color: "var(--text-dim)",
                                  marginBottom: 3,
                                }}
                              >
                                צורת תשלום
                              </div>
                              <input
                                style={inputS}
                                value={form.payment_method || ""}
                                onChange={(e) =>
                                  updateForm(
                                    key,
                                    "payment_method",
                                    e.target.value,
                                  )
                                }
                                placeholder="למשל: העברה בנקאית, צ׳ק..."
                              />
                            </div>
                          </div>
                        )}
                        <div style={rowS}>
                          <div style={{ flex: 2, minWidth: 140 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              פירוט *
                            </div>
                            <input
                              style={inputS}
                              value={form.name || ""}
                              onChange={(e) =>
                                updateForm(key, "name", e.target.value)
                              }
                              placeholder="תיאור ההוצאה"
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 90 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              סכום (₪) *
                            </div>
                            <input
                              type="number"
                              style={inputS}
                              value={form.amount || ""}
                              onChange={(e) =>
                                updateForm(key, "amount", e.target.value)
                              }
                              placeholder="0"
                            />
                          </div>
                          <div style={{ flex: 2, minWidth: 140 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              סיווג *
                            </div>
                            <CustomSelect
                              value={form.cat || ""}
                              onChange={(v) => {
                                updateForm(key, "cat", v as string);
                                updateForm(key, "budgetTypeChoice", "");
                              }}
                              groups={[
                                ...Object.entries(categories || CATEGORIES).map(
                                  ([section, cats]) => ({
                                    label: section,
                                    options: (cats as string[]).map((c) => ({
                                      value: c,
                                      label: c,
                                    })),
                                  }),
                                ),
                                ...(clientCats && clientCats.length > 0
                                  ? [
                                      {
                                        label: "הקטגוריות שלי",
                                        options: clientCats.map((c) => ({
                                          value: c,
                                          label: c,
                                        })),
                                      },
                                    ]
                                  : []),
                              ]}
                              placeholder="בחר קטגוריה..."
                              style={{ width: "100%" }}
                            />
                            {form.cat && catBudgetTypes[form.cat]?.size > 1 && (
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                {["קבוע", "משתנה"].filter(bt => catBudgetTypes[form.cat].has(bt)).map((bt) => (
                                  <button
                                    key={bt}
                                    type="button"
                                    onClick={() => updateForm(key, "budgetTypeChoice", bt)}
                                    style={{
                                      padding: "4px 12px",
                                      borderRadius: 8,
                                      fontSize: 13,
                                      fontFamily: "inherit",
                                      cursor: "pointer",
                                      border: `1.5px solid ${form.budgetTypeChoice === bt ? "var(--green-mid)" : "var(--border)"}`,
                                      background: form.budgetTypeChoice === bt ? "var(--green-pale)" : "var(--surface2)",
                                      color: form.budgetTypeChoice === bt ? "var(--green-mid)" : "var(--text-dim)",
                                      fontWeight: form.budgetTypeChoice === bt ? 700 : 400,
                                    }}
                                  >
                                    {bt}
                                  </button>
                                ))}
                                {!form.budgetTypeChoice && (
                                  <span style={{ fontSize: 12, color: "var(--red)", alignSelf: "center" }}>
                                    "{form.cat}" קיימת גם כקבוע וגם כמשתנה — יש לבחור
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 110 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: "var(--text-dim)",
                                marginBottom: 3,
                              }}
                            >
                              תאריך (אופציונלי)
                            </div>
                            <input
                              type="date"
                              style={inputS}
                              value={form.date || ""}
                              onChange={(e) =>
                                updateForm(key, "date", e.target.value)
                              }
                            />
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => saveManualTx(key, "expense")}
                            disabled={
                              !form.name ||
                              !form.amount ||
                              !form.cat ||
                              (catBudgetTypes[form.cat]?.size > 1 &&
                                !form.budgetTypeChoice)
                            }
                            style={{
                              padding: "6px 18px",
                              borderRadius: 8,
                              border: "none",
                              background: "var(--red)",
                              color: "#fff",
                              fontSize: 15,
                              fontWeight: 700,
                              cursor: "pointer",
                              fontFamily: "inherit",
                              opacity:
                                !form.name ||
                                !form.amount ||
                                !form.cat ||
                                (catBudgetTypes[form.cat]?.size > 1 &&
                                  !form.budgetTypeChoice)
                                  ? 0.5
                                  : 1,
                            }}
                          >
                            שמור
                          </button>
                          <button
                            onClick={() => resetAdd(key)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                              background: "var(--surface2)",
                              color: "var(--text)",
                              fontSize: 15,
                              cursor: "pointer",
                              fontFamily: "inherit",
                            }}
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    );

                  return null;
                })()}

                {/* Per-source management */}
                <div
                  style={{
                    marginTop: 12,
                    padding: "10px 4px",
                    borderTop: "1px solid var(--border)",
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 15, color: "var(--text-dim)" }}>
                    ניהול מקורות:
                  </span>
                  {submissionIds.map((subId) => {
                    const subLabel =
                      allTxs.find((t) => t._submissionId === subId)
                        ?.source_label || "קובץ";
                    const subCount = allTxs.filter(
                      (t) => t._submissionId === subId,
                    ).length;
                    return (
                      <span
                        key={subId as string}
                        style={{
                          display: "inline-flex",
                          gap: 4,
                          alignItems: "center",
                        }}
                      >
                        <button
                          onClick={onNavigateToUpload}
                          title="החלף קובץ — העלה קובץ חדש לחודש זה"
                          style={{
                            padding: "4px 10px",
                            borderRadius: 8,
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            border: "1px solid var(--border)",
                            background: "var(--surface2)",
                            color: "var(--text-mid)",
                          }}
                        >
                          {subLabel} — החלף
                        </button>
                        <button
                          onClick={() =>
                            setConfirmDelete({
                              type: "submission",
                              submissionId: subId,
                              label: subLabel,
                              count: subCount,
                            })
                          }
                          style={{
                            padding: "4px 8px",
                            borderRadius: 8,
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            border: "1px solid var(--red)",
                            background: "var(--red-light)",
                            color: "var(--red)",
                          }}
                        >
                          הסר
                        </button>
                      </span>
                    );
                  })}
                  {hasExtTxs && (
                    <button
                      onClick={() =>
                        setConfirmDelete({
                          type: "cycle",
                          cycleKey: key,
                          label,
                          count: cycleTxs.filter((t) => t.source === "ext")
                            .length,
                        })
                      }
                      style={{
                        padding: "4px 10px",
                        borderRadius: 8,
                        fontSize: 14,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        border: "1px solid var(--red)",
                        background: "var(--red-light)",
                        color: "var(--red)",
                      }}
                    >
                      מחק תנועות מקס מחודש זה
                    </button>
                  )}
                  <button
                    onClick={onNavigateToUpload}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      border: "1px solid var(--green-mid)",
                      background: "var(--green-mint)",
                      color: "var(--green-deep)",
                    }}
                  >
                    + הוסף מקור לחודש זה
                  </button>
                </div>

                <div
                  style={{
                    textAlign: "left",
                    padding: "6px 4px",
                    fontSize: 15,
                    color: "var(--text-mid)",
                    fontWeight: 700,
                  }}
                >
                  סה"כ {label}: ₪{Math.round(cycleTotal).toLocaleString()}
                </div>
              </div>
            )}

            {!isOpen && idx < cycleKeys.length - 1 && (
              <div
                style={{
                  textAlign: "center",
                  padding: "4px 0 10px",
                  fontSize: 15,
                  color: "var(--text-dim)",
                  borderBottom: "1px dashed var(--border)",
                  marginBottom: 8,
                }}
              >
                סה"כ עד כאן: ₪
                {Math.round(
                  cycleKeys
                    .slice(0, idx + 1)
                    .flatMap((k) =>
                      (byCycle[k] || []).filter(
                        (t) => !ignoredCats.has(t.cat) && t.status !== "pending",
                      ),
                    )
                    .reduce((s, t) => s + Number(t.amount || 0), 0),
                ).toLocaleString()}
              </div>
            )}
          </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Bank Upload Screen — תנועות עו"ש ────────────────────────────────────────
const HEB_MONTHS_SHORT = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];
function mkMonthKey(y: number, m: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function mkMonthLabel(mk: string) {
  const [y, m] = mk.split("-");
  return `${HEB_MONTHS_SHORT[parseInt(m) - 1]} ${y}`;
}
function txMonthKey(dateStr: string) {
  const parts = dateStr?.split("/");
  if (!parts || parts.length < 3) return null;
  const d = parseInt(parts[0]),
    mo = parseInt(parts[1]),
    yr = parseInt(parts[2]);
  if (isNaN(d) || isNaN(mo) || isNaN(yr)) return null;
  const fullYear = yr < 100 ? 2000 + yr : yr;
  return mkMonthKey(fullYear, mo - 1);
}

function BankUploadScreen({
  clientId,
  accountIndex = 1,
  editMode = false,
  rememberedMappings: initMappings,
  categoryRules,
  categories,
  categoryRows,
  clientCats,
  hiddenCats,
  onHiddenCatsChange,
  onCategoryAdded,
  onDone,
  onBack,
}) {
  const [step, setStep] = useState<"choose" | "upload" | "review">(
    editMode ? "review" : "upload",
  );
  const [mode, setMode] = useState<"3months" | "specific" | null>(
    editMode ? "3months" : "3months",
  );
  const [selMk, setSelMk] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResults, setAnalyzeResults] = useState<
    { name: string; count: number; error?: string }[]
  >([]);
  const [txs, setTxs] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [bankLabel, setBankLabel] = useState("");
  const [loadedSubs, setLoadedSubs] = useState<any[]>([]); // for editMode: existing submissions
  const [editLoading, setEditLoading] = useState(editMode);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef(false);

  // editMode: load existing submissions on mount
  useEffect(() => {
    if (!editMode) return;
    supabase
      .from("bank_submissions")
      .select("*")
      .eq("client_id", clientId)
      .eq("account_index", accountIndex)
      .order("month_key", { ascending: true })
      .then(({ data }) => {
        const subs = data || [];
        setLoadedSubs(subs);
        const allTxs = subs.flatMap((s: any) => s.transactions || []);
        setTxs(allTxs);
        const existingLabel =
          subs.find((s: any) => s.bank_label)?.bank_label || "";
        setBankLabel(existingLabel);
        setEditLoading(false);
      });
  }, [editMode, clientId, accountIndex]);

  // review states
  const [activeTxId, setActiveTxId] = useState<number | string | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [pendingRemember, setPendingRemember] = useState<{
    name: string;
    cat: string;
    budgetType?: string;
  } | null>(null);
  const [prevCatMap, setPrevCatMap] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [localMappings, setLocalMappings] = useState<Record<string, string>>(
    initMappings || {},
  );
  const [econInfoOpen, setEconInfoOpen] = useState(false);
  const [econInfoPos, setEconInfoPos] = useState({ top: 0, left: 0 });
  const [uncatModal, setUncatModal] = useState<number | null>(null);
  const [reviewingUncategorized, setReviewingUncategorized] = useState(false);

  const now = new Date();
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return {
      mk: mkMonthKey(d.getFullYear(), d.getMonth()),
      label: mkMonthLabel(mkMonthKey(d.getFullYear(), d.getMonth())),
    };
  });

  const updateTxCat = (id: number, cat: string, budgetType?: string) =>
    setTxs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, cat, budget_type: budgetType, edited: true, conf: "high" }
          : t,
      ),
    );

  const updateTxNote = (id: number, note: string) =>
    setTxs((prev) => prev.map((t) => (t.id === id ? { ...t, note } : t)));

  const toggleFlowType = (id: number) =>
    setTxs((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              flow_type:
                t.flow_type === "credit_transfer"
                  ? "expense"
                  : "credit_transfer",
            }
          : t,
      ),
    );

  const isPdf = (tx: any) => (tx.source || "").toLowerCase().endsWith(".pdf");

  const analyzeFiles = async () => {
    setAnalyzing(true);
    setAnalyzeResults([]);
    const results: { name: string; count: number; error?: string }[] = [];
    let all: any[] = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        let parsed: any[];
        if (file.name.toLowerCase().endsWith(".pdf")) {
          parsed = await parseBankPDF(
            buf,
            file.name,
            localMappings,
            categoryRules,
          );
        } else {
          parsed = parseExcelData(buf, file.name, localMappings, categoryRules);
        }
        all = all.concat(parsed);
        results.push({ name: file.name, count: parsed.length });
      } catch (e: any) {
        results.push({
          name: file.name,
          count: 0,
          error: e?.message || "שגיאה בניתוח",
        });
      }
      setAnalyzeResults([...results]);
    }
    setAnalyzing(false);
    if (all.length > 0) {
      setTxs(all);
      setStep("review");
    }
  };

  const save = async () => {
    const uncategorized = txs.filter(
      (t) =>
        t.conf === "low" &&
        (t.cat === "הוצאות לא מתוכננות" || t.cat === "דרוש סיווג") &&
        t.cat !== "להתעלם" &&
        t.flow_type !== "credit_transfer",
    );
    if (uncategorized.length > 0) {
      setUncatModal(uncategorized.length);
      return;
    }

    setSaving(true);
    let saveError: any = null;

    // editMode: UPDATE each existing submission with new transaction data
    if (editMode) {
      const byMonth: Record<string, any[]> = {};
      txs.forEach((t) => {
        const mk = txMonthKey(t.date) || "unknown";
        if (!byMonth[mk]) byMonth[mk] = [];
        byMonth[mk].push(t);
      });
      for (const sub of loadedSubs) {
        const updatedTxs = byMonth[sub.month_key] || [];
        const { error } = await supabase
          .from("bank_submissions")
          .update({
            transactions: updatedTxs,
            bank_label: bankLabel.trim() || null,
          })
          .eq("id", sub.id);
        if (error) {
          saveError = error;
          break;
        }
      }
      setSaving(false);
      if (saveError) {
        alert(`שגיאה בשמירה: ${saveError.message}`);
        return;
      }
      onDone();
      return;
    }

    // upload files to Supabase Storage
    const storagePaths: string[] = [];
    for (const file of files) {
      const path = `${clientId}/bank-${accountIndex}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("client-documents")
        .upload(path, file, { upsert: true });
      if (!upErr) storagePaths.push(path);
      else console.error("bank storage upload error:", upErr);
    }

    if (mode === "3months") {
      const byMonth: Record<string, any[]> = {};
      txs.forEach((t) => {
        const mk = txMonthKey(t.date) || "unknown";
        if (!byMonth[mk]) byMonth[mk] = [];
        byMonth[mk].push(t);
      });
      const validMonths = Object.keys(byMonth).filter((mk) => mk !== "unknown");
      if (validMonths.length === 0) {
        setSaving(false);
        alert(
          "לא זוהו חודשים תקינים מהתנועות — בדוק שפורמט התאריך בקובץ הוא dd/mm/yy",
        );
        return;
      }
      for (const mk of validMonths) {
        // delete existing rows for this account+month before inserting
        await supabase
          .from("bank_submissions")
          .delete()
          .eq("client_id", clientId)
          .eq("account_index", accountIndex)
          .eq("month_key", mk);
        const { error } = await supabase.from("bank_submissions").insert([
          {
            client_id: clientId,
            month_key: mk,
            account_index: accountIndex,
            label: mkMonthLabel(mk),
            bank_label: bankLabel.trim() || null,
            transactions: byMonth[mk],
            files:
              storagePaths.length > 0 ? storagePaths : files.map((f) => f.name),
            created_at: new Date().toISOString(),
          },
        ]);
        if (error) {
          saveError = error;
          break;
        }
      }
    }
    setSaving(false);
    if (saveError) {
      alert(`שגיאה בשמירה: ${saveError.message}`);
      console.error("bank_submissions save error:", saveError);
      return;
    }
    onDone();
  };

  const income = txs
    .filter(
      (t) =>
        !["להתעלם", "credit_transfer"].includes(t.cat) &&
        Number(t.amount || 0) > 0,
    )
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = txs
    .filter(
      (t) =>
        !["להתעלם", "credit_transfer"].includes(t.cat) &&
        Number(t.amount || 0) < 0,
    )
    .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);

  if (step === "upload")
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px" }}>
        <Btn
          variant="ghost"
          size="sm"
          onClick={onBack}
          style={{ marginBottom: 20 }}
        >
          ← חזור
        </Btn>
        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 6 }}>
          העלאת פירוט עו"ש — חשבון {accountIndex}
        </div>
        <div
          style={{
            background: "rgba(69,123,157,0.08)",
            border: "1.5px solid rgba(69,123,157,0.25)",
            borderRadius: 10,
            padding: "10px 14px",
            marginBottom: 18,
            fontSize: 13,
            color: "var(--text-mid)",
            lineHeight: 1.6,
          }}
        >
          נדרשים <strong>3 חודשים</strong> של פירוט עו"ש — ניתן להעלות קובץ אחד
          הכולל את כולם או קובץ נפרד לכל חודש.
        </div>

        <div style={{ marginBottom: 18 }}>
          <label
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              display: "block",
              marginBottom: 8,
            }}
          >
            שם הבנק ותיאור החשבון
          </label>
          <input
            type="text"
            placeholder="למשל: מזרחי — חשבון משותף"
            value={bankLabel}
            onChange={(e) => setBankLabel(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 14px",
              fontSize: 14,
              borderRadius: 10,
              border: "1.5px solid var(--border)",
              background: "var(--surface)",
              fontFamily: "inherit",
              outline: "none",
              direction: "rtl",
            }}
          />
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>
            זה יעזור למנהל לזהות את החשבון בקלות
          </div>
        </div>

        <input
          id="bank-file-input"
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.ods"
          style={{ display: "none" }}
          onChange={(e) => {
            const picked = Array.from(e.target.files || []);
            if (picked.length)
              setFiles((p) => [
                ...p,
                ...picked.filter((f) => !p.find((x) => x.name === f.name)),
              ]);
            e.target.value = "";
          }}
        />
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const fs = Array.from(e.dataTransfer.files);
            setFiles((p) => [
              ...p,
              ...fs.filter((f) => !p.find((x) => x.name === f.name)),
            ]);
          }}
          style={{
            border: "2px dashed var(--border)",
            borderRadius: 12,
            padding: "28px 20px",
            textAlign: "center",
            marginBottom: 12,
            background: "var(--surface2)",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--green-mid)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: "0 auto 10px", display: "block" }}
          >
            <polyline points="16 16 12 12 8 16" />
            <line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          <div style={{ fontSize: 14, color: "var(--text-mid)" }}>
            גרור קבצים לכאן
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
            PDF, Excel, CSV
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 16,
          }}
        >
          <label
            htmlFor="bank-file-input"
            style={{
              display: "inline-block",
              padding: "10px 32px",
              textAlign: "center",
              background: "var(--green-mid)",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              fontFamily: "inherit",
            }}
          >
            + העלה קובץ
          </label>
        </div>
        {files.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {files.map((f, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 12px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  marginBottom: 6,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--green-mid)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {f.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((p) => p.filter((_, j) => j !== i));
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-dim)",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {analyzeResults.map((r, i) => (
          <div
            key={i}
            style={{
              fontSize: 13,
              color: r.error ? "var(--red)" : "var(--green-mid)",
              marginBottom: 4,
            }}
          >
            {r.error
              ? `❌ ${r.name}: ${r.error}`
              : `✓ ${r.name}: ${r.count} תנועות`}
          </div>
        ))}
        <div
          style={{ display: "flex", justifyContent: "center", marginTop: 8 }}
        >
          <Btn
            onClick={analyzeFiles}
            disabled={files.length === 0 || analyzing}
            style={{ padding: "10px 40px" }}
          >
            {analyzing ? "מנתח..." : "נתח קובץ ←"}
          </Btn>
        </div>
      </div>
    );

  // Review step
  // PDF parser stores amount as Math.abs — maxCat='הכנסות' marks income, ''=expense
  // Excel keeps signed amounts — use sign directly
  const isIncomeTx = (tx: any) =>
    isPdf(tx) ? tx.maxCat === "הכנסות" : Number(tx.amount || 0) > 0;

  const reviewIncome = txs
    .filter(
      (t) =>
        isIncomeTx(t) &&
        t.cat !== "להתעלם" &&
        t.flow_type !== "credit_transfer",
    )
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const reviewExpense = txs
    .filter(
      (t) =>
        !isIncomeTx(t) &&
        t.cat !== "להתעלם" &&
        t.flow_type !== "credit_transfer",
    )
    .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
  const reviewIgnoredCount = txs.filter((t) => t.cat === "להתעלם").length;

  const filteredTxs = txs.filter((t) => {
    if (search) {
      const s = search.toLowerCase();
      if (!t.name.toLowerCase().includes(s) && !t.cat.toLowerCase().includes(s))
        return false;
    }
    if (filterCat === "__needs_cat__")
      return (
        t.conf === "low" &&
        (t.cat === "הוצאות לא מתוכננות" || t.cat === "דרוש סיווג") &&
        t.flow_type !== "credit_transfer"
      );
    if (filterCat !== "all" && t.cat !== filterCat) return false;
    return true;
  });

  // Group by month
  const byMonth: Record<string, any[]> = {};
  filteredTxs.forEach((tx) => {
    const mk = txMonthKey(tx.date) || "unknown";
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(tx);
  });
  const sortedMonths = Object.keys(byMonth)
    .filter((m) => m !== "unknown")
    .sort()
    .reverse();
  if (byMonth["unknown"]) sortedMonths.push("unknown");

  const clearRemembered = async (businessName: string) => {
    await supabase
      .from("remembered_mappings")
      .delete()
      .eq("client_id", clientId)
      .eq("business_name", businessName);
    setLocalMappings((p) => {
      const n = { ...p };
      delete n[businessName];
      return n;
    });
    setTxs((p) =>
      p.map((t) =>
        t.name === businessName
          ? { ...t, cat: "דרוש סיווג", conf: "low", edited: false }
          : t,
      ),
    );
  };

  const renderTxCard = (tx: any, inTransferSection = false) => {
    const needsCat =
      tx.conf === "low" &&
      (tx.cat === "הוצאות לא מתוכננות" || tx.cat === "דרוש סיווג") &&
      !inTransferSection;
    const amtColor = isIncomeTx(tx) ? "var(--green-mid)" : "var(--red)";
    const isRemembered = !!localMappings[tx.name];
    return (
      <div key={tx.id} style={{ position: "relative", marginBottom: 6 }}>
        <Card
          onClick={() => {
            if (activeTxId === `note_${tx.id}` || activeTxId === tx.id)
              setActiveTxId(null);
          }}
          style={{ padding: "8px 12px", opacity: inTransferSection ? 0.85 : 1 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tx.name}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-dim)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tx.date}
                </span>
              </div>
              {tx.note && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-mid)",
                    marginTop: 2,
                    fontStyle: "italic",
                  }}
                >
                  {tx.note}
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                flexWrap: "wrap",
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 700, color: amtColor, fontSize: 14 }}>
                ₪{Math.abs(Number(tx.amount || 0)).toLocaleString()}
              </span>
              {!inTransferSection && (
                <>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTxId(tx.id === activeTxId ? null : tx.id);
                        setCatSearch("");
                        setPendingRemember(null);
                      }}
                      style={{
                        background: needsCat
                          ? "rgba(255,193,7,0.12)"
                          : "var(--green-mint)",
                        border: `1px solid ${needsCat ? "rgba(255,193,7,0.6)" : "var(--green-soft)"}`,
                        borderRadius: 16,
                        padding: "3px 10px",
                        fontSize: 12,
                        color: needsCat ? "var(--gold)" : "var(--green-deep)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontWeight: 600,
                      }}
                    >
                      {needsCat ? "דרוש סיווג" : tx.cat}
                    </button>
                  </div>
                  {tx.cat !== "להתעלם" ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPrevCatMap((p) => ({ ...p, [tx.id]: tx.cat }));
                        updateTxCat(tx.id, "להתעלם");
                        setActiveTxId(null);
                      }}
                      title="התעלם מתנועה זו — לא תיספר"
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: 6,
                        padding: "3px 6px",
                        color: "var(--text-dim)",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <DocIcon name="ban" color="var(--text-dim)" size={13} />
                    </button>
                  ) : prevCatMap[tx.id] ? (
                    <button
                      type="button"
                      onClick={() => {
                        const prev = prevCatMap[tx.id];
                        updateTxCat(tx.id, prev);
                        setPrevCatMap((p) => {
                          const n = { ...p };
                          delete n[tx.id];
                          return n;
                        });
                      }}
                      title="בטל התעלמות"
                      style={{
                        background: "var(--green-mint)",
                        border: "1px solid var(--green-soft)",
                        borderRadius: 6,
                        padding: "3px 8px",
                        fontSize: 12,
                        color: "var(--green-deep)",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <DocIcon
                        name="undo"
                        color="var(--green-deep)"
                        size={12}
                      />
                      {prevCatMap[tx.id]}
                    </button>
                  ) : null}
                </>
              )}
              <button
                onClick={() =>
                  setActiveTxId(
                    activeTxId === `note_${tx.id}` ? null : `note_${tx.id}`,
                  )
                }
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "3px 6px",
                  color: "var(--text-dim)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                }}
                title="הוסף הערה"
              >
                <DocIcon name="pencil" color="var(--text-dim)" size={12} />
              </button>
              <button
                onClick={() => toggleFlowType(tx.id)}
                title={
                  inTransferSection
                    ? "הזז חזרה"
                    : "סמן כחיוב/זיכוי אשראי — לא ייספר"
                }
                style={{
                  background: inTransferSection
                    ? "var(--green-mint)"
                    : "transparent",
                  border: `1px solid ${inTransferSection ? "var(--green-soft)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 12,
                  color: inTransferSection
                    ? "var(--green-deep)"
                    : "var(--text-dim)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  whiteSpace: "nowrap",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontWeight: 600,
                }}
              >
                {inTransferSection ? (
                  <>
                    <DocIcon name="undo" color="var(--green-deep)" size={12} />
                    חזור
                  </>
                ) : (
                  <>
                    <DocIcon
                      name="credit-card"
                      color="var(--text-dim)"
                      size={12}
                    />
                    כלול בכרטיס
                  </>
                )}
              </button>
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
              onSelect={(cat, budgetType) => {
                updateTxCat(tx.id, cat, budgetType);
                setActiveTxId(null);
                setCatSearch("");
                setPendingRemember({ name: tx.name, cat, budgetType });
              }}
            />
          )}
          {activeTxId === `note_${tx.id}` && (
            <div style={{ marginTop: 10 }}>
              <input
                autoFocus
                value={tx.note || ""}
                onChange={(e) => updateTxNote(tx.id, e.target.value)}
                placeholder="הוסף הערה לעסקה זו..."
                style={{
                  width: "100%",
                  background: "var(--surface2)",
                  border: "1.5px solid var(--green-soft)",
                  borderRadius: 8,
                  padding: "5px 10px",
                  color: "var(--text)",
                  fontFamily: "inherit",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape")
                    setActiveTxId(null);
                }}
              />
              <div
                style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}
              >
                Enter או Escape לסגור
              </div>
            </div>
          )}
        </Card>
        {isRemembered && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              clearRemembered(tx.name);
            }}
            title={`סיווג שמור: "${localMappings[tx.name]}". לחץ לביטול`}
            style={{
              position: "absolute",
              left: -8,
              top: "50%",
              transform: "translate(-100%,-50%)",
              background: "rgba(46,160,67,0.08)",
              border: "1px solid rgba(46,160,67,0.25)",
              borderRadius: 20,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 11,
              color: "var(--green-deep)",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: 13 }}>✓</span>
            <span>סיווג שמור</span>
            <span style={{ fontSize: 13, opacity: 0.6 }}>×</span>
          </button>
        )}
      </div>
    );
  };

  if (editLoading)
    return (
      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "60px 20px",
          textAlign: "center",
          color: "var(--text-dim)",
        }}
      >
        טוען תנועות...
      </div>
    );

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 20px" }}>
      {/* Uncategorized warning modal */}
      {uncatModal !== null && (
        <>
          <div
            onClick={() => setUncatModal(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: "var(--z-back)" as any,
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              padding: "32px 28px",
              zIndex: "var(--z-modal)" as any,
              width: "min(400px,90vw)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              direction: "rtl",
              textAlign: "center",
            }}
          >
            <div style={{ marginBottom: 14 }}>
              <svg
                width="44"
                height="44"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--orange,#f59e0b)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 18,
                marginBottom: 10,
                color: "var(--text)",
              }}
            >
              לא ניתן לשמור עדיין
            </div>
            <div
              style={{
                fontSize: 14,
                color: "var(--text-dim)",
                lineHeight: 1.7,
                marginBottom: 24,
              }}
            >
              יש{" "}
              <strong style={{ color: "var(--text)" }}>
                {uncatModal} תנועות
              </strong>{" "}
              שעדיין מסומנות כ"דרוש סיווג".
              <br />
              יש לסווג אותן לפני השמירה, או לסמן אותן כ"התעלם".
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Btn
                onClick={() => {
                  setUncatModal(null);
                  setFilterCat("__needs_cat__");
                  setReviewingUncategorized(true);
                }}
              >
                הצג תנועות לסיווג
              </Btn>
              <Btn variant="ghost" onClick={() => setUncatModal(null)}>
                סגור
              </Btn>
            </div>
          </div>
        </>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Btn
            variant="ghost"
            size="sm"
            onClick={editMode ? onBack : () => setStep("upload")}
          >
            ← חזור
          </Btn>
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 20,
                color: "var(--green-deep)",
                letterSpacing: "-0.3px",
              }}
            >
              {editMode
                ? `עריכת תנועות — חשבון ${accountIndex}`
                : 'סיווג תנועות עו"ש'}
            </div>
            <div
              style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}
            >
              {txs.length} תנועות
            </div>
          </div>
        </div>
        <Btn
          size="sm"
          onClick={save}
          disabled={saving || reviewingUncategorized}
          style={
            reviewingUncategorized
              ? { opacity: 0.4, cursor: "not-allowed" }
              : {}
          }
        >
          {saving ? "שומר..." : "שמור ←"}
        </Btn>
      </div>

      {/* Reviewing-uncategorized banner */}
      {reviewingUncategorized &&
        (() => {
          const remaining = txs.filter(
            (t) =>
              t.conf === "low" &&
              (t.cat === "הוצאות לא מתוכננות" || t.cat === "דרוש סיווג") &&
              t.flow_type !== "credit_transfer",
          ).length;
          return (
            <div
              style={{
                background: "rgba(245,158,11,0.08)",
                border: "1px solid rgba(245,158,11,0.35)",
                borderRadius: 12,
                padding: "14px 18px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span
                  style={{
                    fontSize: 14,
                    color: "var(--text)",
                    fontWeight: 500,
                  }}
                >
                  {remaining > 0
                    ? `נותרו ${remaining} תנועות לסיווג — סווג אותן ואז עבור לבדיקה כוללת`
                    : "כל התנועות סווגו! עבור לבדיקה הכוללת לפני השמירה"}
                </span>
              </div>
              <Btn
                size="sm"
                onClick={() => {
                  setFilterCat("all");
                  setReviewingUncategorized(false);
                }}
              >
                עבור לבדיקה כוללת ←
              </Btn>
            </div>
          );
        })()}

      {/* Filter bar */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "12px 16px",
          boxShadow: "0 1px 4px rgba(30,77,53,0.05)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: 1, minWidth: 120, position: "relative" }}>
            <svg
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 14,
                height: 14,
                opacity: 0.45,
                pointerEvents: "none",
              }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש..."
              style={{
                width: "100%",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: "6px 14px 6px 14px",
                paddingRight: 32,
                color: "var(--text)",
                fontSize: 14,
                fontFamily: "inherit",
                outline: "none",
                boxSizing: "border-box" as const,
              }}
            />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: "var(--text-dim)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            קטגוריה:
          </span>
          {(() => {
            const cats = [
              ...new Set(txs.map((t: any) => t.cat).filter(Boolean)),
            ].sort() as string[];
            const allOpts = ["all", ...cats];
            return (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setCatDropdownOpen((p) => !p)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 140,
                    background:
                      filterCat !== "all"
                        ? "var(--green-mint)"
                        : "var(--surface2)",
                    border: `1px solid ${filterCat !== "all" ? "var(--green-soft)" : "var(--border)"}`,
                    borderRadius: 10,
                    padding: "7px 12px",
                    fontFamily: "inherit",
                    fontSize: 13,
                    color:
                      filterCat !== "all" ? "var(--green-deep)" : "var(--text)",
                    cursor: "pointer",
                    fontWeight: filterCat !== "all" ? 600 : 400,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      textAlign: "right",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filterCat === "all" ? "הכל" : filterCat}
                  </span>
                  <svg
                    style={{
                      width: 11,
                      height: 11,
                      flexShrink: 0,
                      transition: "transform 0.2s",
                      transform: catDropdownOpen ? "rotate(180deg)" : "none",
                    }}
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </button>
                {catDropdownOpen && (
                  <>
                    <div
                      onClick={() => setCatDropdownOpen(false)}
                      style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: "calc(var(--z-drop) - 1)" as any,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        zIndex: "var(--z-drop)" as any,
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                        minWidth: 180,
                        maxHeight: 260,
                        overflowY: "auto",
                        padding: 4,
                      }}
                    >
                      {allOpts.map((c) => (
                        <button
                          key={c}
                          onClick={() => {
                            setFilterCat(c);
                            setCatDropdownOpen(false);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "right",
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "none",
                            fontFamily: "inherit",
                            fontSize: 13,
                            cursor: "pointer",
                            background:
                              filterCat === c
                                ? "var(--green-mint)"
                                : "transparent",
                            color:
                              filterCat === c
                                ? "var(--green-deep)"
                                : "var(--text)",
                            fontWeight: filterCat === c ? 600 : 400,
                          }}
                        >
                          {c === "all" ? "הכל" : c}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          {filterCat !== "all" && (
            <button
              onClick={() => setFilterCat("all")}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-dim)",
              }}
            >
              נקה פילטר
            </button>
          )}
        </div>
      </div>

      <RememberModal
        pendingRemember={pendingRemember}
        onAlways={async () => {
          const oldCat = localMappings[pendingRemember.name] || null;
          const { name, cat, budgetType } = pendingRemember;
          await supabase
            .from("remembered_mappings")
            .upsert(
              [{ client_id: clientId, business_name: name, category: cat, budget_type: budgetType }],
              { onConflict: "client_id,business_name" },
            );
          await supabase
            .from("client_change_log")
            .insert([
              {
                client_id: clientId,
                event_type: "remap_business",
                details: { business_name: name, from_cat: oldCat, to_cat: cat },
              },
            ]);
          setLocalMappings((p) => ({ ...p, [name]: cat }));
          setTxs((p) =>
            p.map((t) =>
              t.name === name
                ? { ...t, cat, budget_type: budgetType, edited: true }
                : t,
            ),
          );
          setPendingRemember(null);
        }}
        onJustHere={() => setPendingRemember(null)}
      />

      {/* Overall summary */}
      <div
        style={{
          display: "flex",
          gap: 1,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--border)",
          marginBottom: 16,
          boxShadow: "0 1px 4px rgba(30,77,53,0.06)",
        }}
      >
        <div
          style={{
            flex: 1,
            background: "var(--surface)",
            padding: "12px 16px",
            textAlign: "center",
            borderLeft: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--green-mid)",
              fontWeight: 500,
              marginBottom: 3,
            }}
          >
            הכנסות
          </div>
          <div
            style={{
              fontFamily: "'Frank Ruhl Libre',serif",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--green-mid)",
            }}
          >
            ₪{Math.round(reviewIncome).toLocaleString()}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: "var(--surface)",
            padding: "12px 16px",
            textAlign: "center",
            borderLeft: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--red)",
              fontWeight: 500,
              marginBottom: 3,
            }}
          >
            הוצאות
          </div>
          <div
            style={{
              fontFamily: "'Frank Ruhl Libre',serif",
              fontSize: 20,
              fontWeight: 700,
              color: "var(--red)",
            }}
          >
            ₪{Math.round(reviewExpense).toLocaleString()}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: "var(--surface)",
            padding: "12px 16px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              fontWeight: 500,
              marginBottom: 3,
            }}
          >
            הפרש{reviewIgnoredCount > 0 ? ` (ללא ${reviewIgnoredCount})` : ""}
          </div>
          <div
            style={{
              fontFamily: "'Frank Ruhl Libre',serif",
              fontSize: 20,
              fontWeight: 700,
              color:
                reviewIncome - reviewExpense >= 0
                  ? "var(--green-mid)"
                  : "var(--red)",
            }}
          >
            ₪
            {Math.abs(
              Math.round(reviewIncome - reviewExpense),
            ).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Help strip */}
      <div
        style={{
          fontSize: 13,
          color: "var(--text-dim)",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "8px 14px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <DocIcon name="pencil" color="var(--text-dim)" size={13} />
          <span>הוספת הערה ליועץ</span>
        </span>
        <span style={{ opacity: 0.3 }}>|</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <DocIcon name="ban" color="var(--text-dim)" size={13} />
          <span>התעלם — לא ייספר בסה"כ (למשל: העברה חד פעמית מההורים)</span>
        </span>
      </div>

      {/* Transactions grouped by month */}
      {sortedMonths.map((mk) => {
        const monthTxs = byMonth[mk];
        const mIncome = monthTxs
          .filter(
            (t) =>
              isIncomeTx(t) &&
              t.cat !== "להתעלם" &&
              t.flow_type !== "credit_transfer",
          )
          .reduce((s, t) => s + Number(t.amount || 0), 0);
        const mExpense = monthTxs
          .filter(
            (t) =>
              !isIncomeTx(t) &&
              t.cat !== "להתעלם" &&
              t.flow_type !== "credit_transfer",
          )
          .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
        const mBalance = mIncome - mExpense;
        const mTransfers = monthTxs.filter(
          (t) => !isIncomeTx(t) && t.flow_type === "credit_transfer",
        );
        const mRegular = monthTxs.filter(
          (t) => t.flow_type !== "credit_transfer",
        );
        return (
          <div key={mk} style={{ marginBottom: 24 }}>
            {/* Month header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
                padding: "10px 16px",
                background: "var(--surface2)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                marginBottom: 10,
              }}
            >
              <span
                style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}
              >
                {mk === "unknown" ? "תאריך לא ידוע" : mkMonthLabel(mk)}
                <span
                  style={{
                    fontWeight: 400,
                    fontSize: 13,
                    color: "var(--text-dim)",
                    marginRight: 8,
                  }}
                >
                  ({monthTxs.length} תנועות)
                </span>
              </span>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--green-mid)",
                    fontWeight: 600,
                  }}
                >
                  הכנסות ₪{Math.round(mIncome).toLocaleString()}
                </span>
                <span
                  style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}
                >
                  הוצאות ₪{Math.round(mExpense).toLocaleString()}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: mBalance >= 0 ? "var(--green-deep)" : "var(--red)",
                  }}
                >
                  הפרש ₪{Math.abs(Math.round(mBalance)).toLocaleString()}
                </span>
              </div>
            </div>
            {mRegular.map((tx) => renderTxCard(tx, false))}
            {mTransfers.length > 0 && (
              <>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    color: "var(--text-mid)",
                    marginTop: 12,
                    marginBottom: 6,
                    padding: "8px 14px",
                    background: "var(--surface2)",
                    borderRadius: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid var(--border)",
                  }}
                >
                  <DocIcon
                    name="credit-card"
                    color="var(--text-mid)"
                    size={14}
                  />
                  חיובי אשראי{" "}
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: 13,
                      color: "var(--text-dim)",
                    }}
                  >
                    ({mTransfers.length})
                  </span>
                </div>
                {mTransfers.map((tx) => renderTxCard(tx, true))}
              </>
            )}
          </div>
        );
      })}

      {/* Sticky save / review button */}
      <div
        style={{
          position: "sticky",
          bottom: 20,
          display: "flex",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        {reviewingUncategorized ? (
          <Btn
            onClick={() => {
              setFilterCat("all");
              setReviewingUncategorized(false);
            }}
            style={{
              boxShadow: "0 4px 20px rgba(245,158,11,0.3)",
              padding: "12px 36px",
              fontSize: 17,
              background: "#f59e0b",
              border: "none",
            }}
          >
            עבור לבדיקה כוללת ←
          </Btn>
        ) : (
          <Btn
            onClick={save}
            disabled={saving}
            style={{
              boxShadow: "0 4px 20px rgba(45,106,79,0.3)",
              padding: "12px 36px",
              fontSize: 17,
            }}
          >
            {saving ? "שומר..." : "שמור את כל הסיווגים ←"}
          </Btn>
        )}
      </div>
    </div>
  );
}

// ── Classify imported transaction — uses same logic as file upload ─────────────
function classifyImported(tx, rememberedMappings, categoryRules = []) {
  if (tx.cat) return tx.cat; // user manually set — respect it
  const result = classifyTx(
    tx.name,
    tx.max_category || "",
    rememberedMappings,
    categoryRules,
  );
  return result.cat;
}

// ── Payslips Screen ───────────────────────────────────────────────────────────
function PayslipsScreen({
  clientId,
  payslips,
  spouseIndex,
  spouseName,
  subsCount,
  clientName,
  onDone,
  onBack,
}) {
  const currentYear = new Date().getFullYear();
  const [localPayslips, setLocalPayslips] = useState(payslips);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalPayslips(payslips);
  }, [payslips]);

  // סינון תלושים לפי בן/בת הזוג הנוכחי
  // spouse_index === null = רשומות ישנות (לפני הפיצ'ר) — נחשבות כספאוס 1
  const myPayslips =
    spouseIndex === 2
      ? localPayslips.filter((p) => p.spouse_index === 2)
      : localPayslips.filter((p) => !p.spouse_index || p.spouse_index === 1);
  const usedKeys = myPayslips.map((p) => p.month_key).filter(Boolean);
  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
  const alreadyUploaded = usedKeys.includes(monthKey);
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setPendingFile(f);
    setShowPicker(true);
  };

  const savePayslip = async () => {
    if (!pendingFile || alreadyUploaded) return;
    setUploading(true);
    const label = `${HEBREW_MONTHS[selectedMonth]} ${selectedYear}`;
    const ext = pendingFile.name.split(".").pop() || "pdf";
    const safeName = pendingFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${clientId}/payslips/${monthKey}_${Date.now()}_${safeName}`;
    const { error: storageErr } = await supabase.storage
      .from("client-documents")
      .upload(storagePath, pendingFile, { upsert: true });
    if (storageErr) {
      console.error("storage upload error:", storageErr);
      setMsg("err:שגיאה בהעלאת הקובץ — נסה שנית");
      setUploading(false);
      return;
    }
    const { data: newRow, error } = await supabase
      .from("payslips")
      .insert([
        {
          client_id: clientId,
          label,
          month_key: monthKey,
          filename: pendingFile.name,
          path: storagePath,
          spouse_index: spouseIndex || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();
    if (error) {
      console.error("payslips insert error:", error);
      setMsg("err:שגיאה בשמירה");
      setUploading(false);
      return;
    }
    setLocalPayslips((prev) => [...prev, newRow]);
    setPendingFile(null);
    setShowPicker(false);
    setMsg("ok:תלוש נשמר!");
    setTimeout(() => setMsg(""), 2000);
    onDone();
    setUploading(false);
  };

  const deletePayslip = async (p) => {
    setDeleting(p.id);
    setConfirmDelete(null);
    if (p.path)
      await supabase.storage.from("client-documents").remove([p.path]);
    const { error } = await supabase.from("payslips").delete().eq("id", p.id);
    if (error) {
      setMsg("err:שגיאה בהסרת התלוש");
      setDeleting(null);
      return;
    }
    setLocalPayslips((prev) => prev.filter((x) => x.id !== p.id));
    setDeleting(null);
    setMsg("ok:התלוש הוסר");
    setTimeout(() => setMsg(""), 2000);
    onDone();
  };

  const screenTitle = spouseName
    ? `תלושי משכורת — ${spouseName}`
    : "תלושי משכורת";
  const remaining = 3 - myPayslips.length;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "28px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 24,
        }}
      >
        <Btn variant="ghost" size="sm" onClick={onBack}>
          חזור ←
        </Btn>
        <div style={{ fontWeight: 700, fontSize: 20 }}>{screenTitle}</div>
      </div>
      <Card
        style={{ marginBottom: 20, textAlign: "center", padding: "32px 24px" }}
      >
        <div style={{ marginBottom: 12 }}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--green-mid)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
          העלה תלוש משכורת
        </div>
        <div
          style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 20 }}
        >
          צריך {remaining} תלוש{remaining !== 1 ? "ים" : ""} נוספים
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          style={{ display: "none" }}
          onChange={handleFile}
        />
        <Btn
          onClick={() => fileRef.current?.click()}
          disabled={myPayslips.length >= 3}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
          בחר קובץ
        </Btn>
      </Card>
      {msg && (
        <div
          style={{
            background: msg.startsWith("ok:")
              ? "var(--green-pale)"
              : "var(--red-light)",
            border: `1px solid ${msg.startsWith("ok:") ? "var(--green-mint)" : "var(--red)"}`,
            borderRadius: 10,
            padding: "10px 16px",
            marginBottom: 16,
            fontSize: 15,
            color: msg.startsWith("ok:") ? "var(--green-mid)" : "var(--red)",
          }}
        >
          {msg.replace(/^(ok:|err:)/, "")}
        </div>
      )}
      {myPayslips.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>תלושים שהועלו</div>
          {myPayslips.map((p) => (
            <Card
              key={p.id}
              style={{
                marginBottom: 10,
                padding: "14px 20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-dim)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {p.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-dim)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.filename} ·{" "}
                  {new Date(p.created_at).toLocaleDateString("he-IL")}
                </div>
              </div>
              <button
                onClick={() => setConfirmDelete(p)}
                disabled={deleting === p.id}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "5px 12px",
                  fontSize: 13,
                  color: "var(--red)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  flexShrink: 0,
                  opacity: deleting === p.id ? 0.5 : 1,
                }}
              >
                {deleting === p.id ? "מוחק..." : "הסר"}
              </button>
            </Card>
          ))}
        </div>
      )}
      {confirmDelete && (
        <>
          <div
            onClick={() => setConfirmDelete(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: "var(--z-back)",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: "28px 32px",
              zIndex: "var(--z-modal)",
              minWidth: 300,
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>
              הסרת תלוש
            </div>
            <div
              style={{
                fontSize: 15,
                color: "var(--text-mid)",
                marginBottom: 20,
              }}
            >
              בטוח שברצונך להסיר את התלוש של{" "}
              <strong>{confirmDelete.label}</strong>?
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Btn
                onClick={() => deletePayslip(confirmDelete)}
                style={{
                  background: "var(--red)",
                  borderColor: "var(--red)",
                  color: "#fff",
                }}
              >
                כן, הסר
              </Btn>
              <Btn variant="ghost" onClick={() => setConfirmDelete(null)}>
                ביטול
              </Btn>
            </div>
          </div>
        </>
      )}
      {showPicker && (
        <>
          <div
            onClick={() => setShowPicker(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
              zIndex: "var(--z-back)",
            }}
          />
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              background: "var(--surface)",
              border: `1px solid ${"var(--border)"}`,
              borderRadius: 16,
              padding: "28px 32px",
              zIndex: "var(--z-modal)",
              minWidth: 320,
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6 }}>
              לאיזה חודש התלוש?
            </div>
            <div
              style={{
                fontSize: 15,
                color: "var(--text-dim)",
                marginBottom: 20,
              }}
            >
              {pendingFile?.name}
            </div>
            <div
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 20,
                justifyContent: "center",
              }}
            >
              <CustomSelect
                value={selectedMonth}
                onChange={(v) => setSelectedMonth(Number(v))}
                options={HEBREW_MONTHS.map((m, i) => ({ value: i, label: m }))}
                dropdownZIndex={10010}
                style={{ minWidth: 120 }}
              />
              <CustomSelect
                value={selectedYear}
                onChange={(v) => setSelectedYear(Number(v))}
                options={years.map((y) => ({ value: y, label: String(y) }))}
                dropdownZIndex={10010}
                style={{ minWidth: 90 }}
              />
            </div>
            {alreadyUploaded && (
              <div
                style={{ color: "var(--gold)", fontSize: 14, marginBottom: 12 }}
              >
                כבר העלית תלוש לחודש זה
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <Btn
                onClick={savePayslip}
                disabled={alreadyUploaded || uploading}
              >
                שמור תלוש
              </Btn>
              <Btn variant="ghost" onClick={() => setShowPicker(false)}>
                ביטול
              </Btn>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Client personal tab ───────────────────────────────────────────────────────
function ClientPersonalTab({
  session,
  onOpenConnectCard = undefined as any,
  maxLastSync = null as string | null,
}) {
  const [editName, setEditName] = useState(session.name);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("clients")
      .select("email,phone")
      .eq("id", session.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEditEmail(data.email || "");
          setEditPhone(data.phone || "");
        }
        setLoaded(true);
      });
  }, []);

  const showMsg = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(""), 3000);
  };

  const saveDetails = async () => {
    setLoading(true);
    const { error } = await supabase
      .from("clients")
      .update({ name: editName, email: editEmail, phone: editPhone })
      .eq("id", session.id);
    if (error) showMsg("err:שגיאה בשמירה");
    else showMsg("ok:הפרטים עודכנו");
    setLoading(false);
  };

  const changePassword = async () => {
    if (newPass.length < 4) {
      showMsg("err:סיסמה חייבת להיות לפחות 4 תווים");
      return;
    }
    if (newPass !== confirmPass) {
      showMsg("err:הסיסמאות לא תואמות");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from("clients")
      .update({ password: newPass, password_changed: true })
      .eq("id", session.id);
    if (error) showMsg("err:שגיאה");
    else {
      showMsg("ok:הסיסמה עודכנה");
      setNewPass("");
      setConfirmPass("");
    }
    setLoading(false);
  };

  if (!loaded)
    return (
      <div
        style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}
      >
        טוען...
      </div>
    );

  return (
    <>
      <h1
        style={{
          fontFamily: "'Frank Ruhl Libre', serif",
          fontSize: 32,
          fontWeight: 700,
          color: "var(--text)",
          textAlign: "center",
          marginBottom: 16,
          marginTop: 0,
        }}
      >
        פרטים אישיים
      </h1>
      <div
        style={{ height: 1, background: "var(--border)", marginBottom: 20 }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 16,
        }}
      >
        {onOpenConnectCard && (
          <Card
            style={{
              gridColumn: "1/-1",
              cursor: "pointer",
              border: maxLastSync
                ? "2px solid var(--green-soft)"
                : "2px solid var(--border)",
            }}
            onClick={onOpenConnectCard}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: maxLastSync
                    ? "var(--green-mint)"
                    : "var(--surface2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                }}
              >
                {maxLastSync ? (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--green-mid)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-dim)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 2v6M8 3l2 5M16 3l-2 5M6.5 19.5C4.5 17.5 4 15 4 12a8 8 0 0 1 16 0c0 3-0.5 5.5-2.5 7.5" />
                    <path d="M9 19v3M15 19v3" />
                  </svg>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>
                  חיבור כרטיסי אשראי
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "var(--text-dim)",
                    marginTop: 2,
                  }}
                >
                  {maxLastSync
                    ? `סנכרון MAX אחרון: ${new Date(maxLastSync).toLocaleDateString("he-IL")}`
                    : "הגדר תוסף מאזן MAX לסנכרון ישיר"}
                </div>
              </div>
              <div style={{ color: "var(--text-dim)", fontSize: 18 }}>←</div>
            </div>
          </Card>
        )}
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-mid)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            הפרטים שלי
          </div>
          <Input
            label="שם מלא"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
          <Input
            label="מייל"
            type="email"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
            placeholder="example@gmail.com"
          />
          <Input
            label="טלפון"
            value={editPhone}
            onChange={(e) => setEditPhone(e.target.value)}
            placeholder="050-0000000"
          />
          <div
            style={{
              background: "var(--surface2)",
              borderRadius: 8,
              padding: "10px 12px",
              fontSize: 15,
              color: "var(--text-dim)",
              marginBottom: 14,
            }}
          >
            <div style={{ marginBottom: 4 }}>שם משתמש לכניסה</div>
            <div style={{ color: "var(--text)", fontWeight: 600 }}>
              @{session.username}
            </div>
          </div>
          {msg && (
            <div
              style={{
                fontSize: 14,
                color: msg.startsWith("ok:")
                  ? "var(--green-mid)"
                  : "var(--red)",
                marginBottom: 12,
              }}
            >
              {msg.replace(/^(ok:|err:)/, "")}
            </div>
          )}
          <Btn onClick={saveDetails} disabled={loading}>
            שמור שינויים
          </Btn>
        </Card>
        <Card>
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-mid)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            שינוי סיסמה
          </div>
          <Input
            label="סיסמה חדשה"
            type="password"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            placeholder="לפחות 4 תווים"
          />
          <Input
            label="אימות סיסמה"
            type="password"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            placeholder="הכנס שוב"
          />
          {msg && (
            <div
              style={{
                fontSize: 14,
                color: msg.startsWith("ok:")
                  ? "var(--green-mid)"
                  : "var(--red)",
                marginBottom: 12,
              }}
            >
              {msg.replace(/^(ok:|err:)/, "")}
            </div>
          )}
          <Btn
            onClick={changePassword}
            disabled={loading || !newPass || !confirmPass}
          >
            עדכן סיסמה
          </Btn>
        </Card>
      </div>
    </>
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
  const [answers, setAnswers] = useState({ 1: {}, 2: {} });
  const [doneMap, setDoneMap] = useState({ 1: false, 2: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [doneError, setDoneError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("client_questionnaire")
        .select("*")
        .eq("client_id", session.id);
      if (data && data.length > 0) {
        const merged = { 1: {}, 2: {} };
        const done = { 1: false, 2: false };
        data.forEach((row) => {
          merged[row.spouse_index] = row.answers || {};
          done[row.spouse_index] = row.done || false;
        });
        setAnswers(merged);
        setDoneMap(done);
      }
      setLoaded(true);
    })();
  }, [session.id]);

  const updateAnswer = (qIdx, val) => {
    setAnswers((prev) => ({
      ...prev,
      [spouseIndex]: { ...prev[spouseIndex], [qIdx]: val },
    }));
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    await supabase
      .from("client_questionnaire")
      .upsert(
        [
          {
            client_id: session.id,
            spouse_index: spouseIndex,
            answers: answers[spouseIndex],
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "client_id,spouse_index" },
      );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const markDone = async () => {
    const cur = answers[spouseIndex] || {};
    const unanswered = QUESTIONNAIRE_QUESTIONS.map(
      (_, i) => !(cur[i] && cur[i].trim()),
    ).filter(Boolean).length;
    if (unanswered > 0) {
      setDoneError(
        `יש עוד ${unanswered} שאלות שלא נענו — יש לענות על כולן לפני סיום`,
      );
      return;
    }
    setDoneError("");
    setMarkingDone(true);
    await supabase
      .from("client_questionnaire")
      .upsert(
        [
          {
            client_id: session.id,
            spouse_index: spouseIndex,
            answers: answers[spouseIndex],
            done: true,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "client_id,spouse_index" },
      );
    setDoneMap((prev) => ({ ...prev, [spouseIndex]: true }));
    setMarkingDone(false);
  };

  const countFilled = (idx) =>
    Object.values(answers[idx] || {}).filter((v: any) => v && v.trim()).length;
  const visibleSpouses = spousesCount >= 2 ? [1, 2] : [1];

  if (!loaded)
    return (
      <div
        style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}
      >
        טוען...
      </div>
    );

  return (
    <div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 18,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <DocIcon name="pencil" color="var(--green-mid)" />
        שאלון אישי
      </div>
      <div style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 16 }}>
        ענה על השאלות הבאות — הן יעזרו לאלון להכיר אותך לעומק ולהתאים את התהליך
        עבורך אישית.
      </div>

      {visibleSpouses.length > 1 && (
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface2)",
            borderRadius: 30,
            padding: 4,
            gap: 4,
            marginBottom: 24,
          }}
        >
          {visibleSpouses.map((idx) => (
            <button
              key={idx}
              onClick={() => setSpouseIndex(idx)}
              style={{
                padding: "8px 22px",
                borderRadius: 24,
                border: "none",
                fontFamily: "inherit",
                fontSize: 15,
                background:
                  spouseIndex === idx ? "var(--green-mid)" : "transparent",
                color: spouseIndex === idx ? "white" : "var(--text-dim)",
                fontWeight: spouseIndex === idx ? 700 : 400,
                cursor: "pointer",
                transition: "all .15s",
              }}
            >
              {idx === 1 ? "בן/בת זוג ראשון" : "בן/בת זוג שני"}
              {doneMap[idx] ? (
                <span
                  style={{
                    marginRight: 6,
                    display: "inline-flex",
                    verticalAlign: "middle",
                  }}
                >
                  <DocIcon
                    name="check-circle"
                    color={spouseIndex === idx ? "#fff" : "var(--green-soft)"}
                    size={14}
                  />
                </span>
              ) : (
                countFilled(idx) > 0 && (
                  <span style={{ marginRight: 6, fontSize: 13, opacity: 0.8 }}>
                    ({countFilled(idx)}/{QUESTIONNAIRE_QUESTIONS.length})
                  </span>
                )
              )}
            </button>
          ))}
        </div>
      )}

      {doneMap[spouseIndex] ? (
        <div
          style={{
            padding: "24px",
            background: "rgba(46,183,124,0.08)",
            borderRadius: 12,
            border: "1px solid rgba(46,183,124,0.25)",
            textAlign: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 10,
            }}
          >
            <DocIcon name="check-circle" color="var(--green-soft)" size={40} />
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: "var(--green-deep)",
              marginBottom: 6,
            }}
          >
            השאלון הושלם!
          </div>
          <div
            style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 20 }}
          >
            סימנת "סיימתי" עבור בן/בת הזוג הזה
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {onNavigateBack && (
              <Btn onClick={onNavigateBack}>חזור להגשת המסמכים ←</Btn>
            )}
            <Btn
              variant="ghost"
              onClick={() =>
                setDoneMap((prev) => ({ ...prev, [spouseIndex]: false }))
              }
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <DocIcon name="pencil" color="var(--text-mid)" />
              ערוך תשובות
            </Btn>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {QUESTIONNAIRE_QUESTIONS.map((q, i) => {
              const isEmpty = !(
                answers[spouseIndex]?.[i] && answers[spouseIndex][i].trim()
              );
              return (
                <Card
                  key={i}
                  style={{
                    padding: "16px 18px",
                    border: isEmpty
                      ? "1px solid var(--border)"
                      : "1px solid rgba(46,183,124,0.3)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: 15,
                      marginBottom: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: "var(--green-mid)", marginLeft: 6 }}>
                      {i + 1}.
                    </span>
                    {q}
                    <span style={{ color: "var(--red)", marginRight: 4 }}>
                      *
                    </span>
                  </div>
                  <textarea
                    value={answers[spouseIndex]?.[i] || ""}
                    onChange={(e) => {
                      updateAnswer(i, e.target.value);
                      setDoneError("");
                    }}
                    rows={3}
                    placeholder={QUESTIONNAIRE_PLACEHOLDERS[i]}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      background: "var(--surface2)",
                      border: `1px solid ${isEmpty ? "var(--border)" : "rgba(46,183,124,0.3)"}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      color: "var(--text)",
                      fontSize: 15,
                      fontFamily: "inherit",
                      resize: "vertical",
                      outline: "none",
                      lineHeight: 1.6,
                    }}
                  />
                </Card>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Btn
              onClick={save}
              disabled={saving}
              variant="ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <DocIcon name="save" color="var(--text-mid)" />
              {saving ? "שומר..." : "שמור טיוטה"}
            </Btn>
            <Btn
              onClick={markDone}
              disabled={markingDone}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <DocIcon name="check-circle" color="#fff" />
              {markingDone ? "שומר..." : "סיימתי"}
            </Btn>
            {saved && (
              <span
                style={{
                  fontSize: 14,
                  color: "var(--green-deep)",
                  background: "rgba(46,183,124,0.12)",
                  border: "1px solid rgba(46,183,124,0.3)",
                  borderRadius: 8,
                  padding: "5px 14px",
                  fontWeight: 600,
                }}
              >
                ✓ הטיוטה נשמרה
              </span>
            )}
          </div>
          {doneError && (
            <div
              style={{
                marginTop: 10,
                fontSize: 15,
                color: "var(--red)",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <DocIcon name="alert" color="var(--red)" />
              {doneError}
            </div>
          )}
        </>
      )}

      <div
        style={{
          marginTop: 28,
          padding: "12px 16px",
          background: "rgba(46,183,124,0.06)",
          borderRadius: 10,
          border: "1px solid rgba(46,183,124,0.2)",
          fontSize: 15,
          color: "var(--text-dim)",
          lineHeight: 1.7,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            verticalAlign: "middle",
          }}
        >
          <DocIcon name="lightbulb" color="var(--text-dim)" />
        </span>{" "}
        <em>"כשאתה יודע טוב יותר — אתה עושה טוב יותר."</em> — מאיה אנג'לו
      </div>
    </div>
  );
}
