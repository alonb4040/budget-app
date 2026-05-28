import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Card, Btn } from "../ui";

const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function mkLabel(mk: string): string {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${HEB_MONTHS[parseInt(m) - 1]} ${y}`;
}

function fmt(n: number): string {
  return `₪${Math.round(n).toLocaleString()}`;
}

const IGNORED = new Set(["להתעלם"]);

const DOC_LABELS: Record<string, string> = {
  bank_stmt:    'פירוט עו"ש',
  loans:        "מסמכי הלוואות",
  provident:    "קרן השתלמות",
  pension:      "קרנות פנסיה",
  savings_cash: "חסכונות כספיים",
  assets:       "נכסים פיזיים",
  pl:           "דוח רווח והפסד",
  retirement:   "תחזית פרישה",
  // legacy IDs
  savings:      "חסכונות ופנסיה",
  checks:       "שיקים דחויים",
  debts_other:  "חובות אחרים",
};
const DOC_CAT_MAP: Record<string, string> = {
  bank_stmt:    "bank_stmt_meta",
  loans:        "loans_section",
  provident:    "provident_fund",
  pension:      "pension_fund",
  savings_cash: "savings_cash_section",
  assets:       "assets_section",
  pl:           "profit_loss",
  retirement:   "retirement_forecast",
  // legacy IDs
  savings:      "savings_pension",
  checks:       "deferred_checks",
  debts_other:  "debts_other",
};

type BudgetType = "הכנסה" | "קבוע" | "משתנה";

interface Tx {
  _uid: string;
  _table: "submissions" | "portfolio_submissions";
  _subId: string;
  _txIndex: number;
  month_key: string;
  srcLabel: string;
  date: string;
  name: string;
  cat: string;
  amount: number;
  note?: string;
}

interface EditSummary { type: "avg" | "month"; cat: string; mk?: string; }

const SECS: { key: BudgetType; label: string; color: string }[] = [
  { key: "הכנסה",  label: "הכנסות",           color: "var(--green-mid)" },
  { key: "קבוע",   label: "הוצאות קבועות",    color: "#457b9d" },
  { key: "משתנה",  label: "הוצאות משתנות",    color: "var(--gold)" },
];

// ── Section header styles matching ScenarioPlanTab ───────────────────────────
const SEC_BG: Record<BudgetType, string> = {
  הכנסה:  "rgba(46,204,138,0.07)",
  קבוע:   "rgba(69,123,157,0.07)",
  משתנה:  "rgba(247,194,56,0.07)",
};

function IcoFile({ color = "var(--text-dim)", size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}
function IcoCheck({ color = "var(--green-mid)", size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IcoDown({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

const CAT_COLORS = [
  "#2d6a4f","#52b788","#1a759f","#d62828","#f77f00","#7b2d8b",
  "#0077b6","#6a994e","#e63946","#457b9d","#a8dadc","#f4a261",
];
function catColor(cat: string, all: string[]): string {
  const i = all.indexOf(cat);
  return CAT_COLORS[i % CAT_COLORS.length] || "#888";
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function DataCenterTab({ client, refreshKey }: { client: any; refreshKey?: number }) {
  const [pSubs,        setPSubs]        = useState<any[]>([]);
  const [allTxs,       setAllTxs]       = useState<Tx[]>([]);
  const [payslips,     setPayslips]     = useState<any[]>([]);
  const [clientDocs,   setClientDocs]   = useState<any[]>([]);
  const [months,       setMonths]       = useState<any[]>([]);
  const [categories,   setCategories]   = useState<string[]>([]);
  const [catTypes,     setCatTypes]     = useState<Record<string, BudgetType>>({});
  const [clientCatRows,setClientCatRows]= useState<{ name: string; budget_type: BudgetType }[]>([]);
  const [avgOverrides, setAvgOverrides] = useState<Record<string, number>>({});
  const [monthOvr,     setMonthOvr]     = useState<Record<string, number>>({});
  const [clientIntake, setClientIntake] = useState<any>(null);
  const [clientQuestionnaire, setClientQuestionnaire] = useState<any[]>([]);
  const [questAdminNotes, setQuestAdminNotes] = useState<Record<number, string>>({});
  const [questNotesSaving, setQuestNotesSaving] = useState<Record<number, boolean>>({});
  const [loading,      setLoading]      = useState(true);
  const [notesBannerDismissed, setNotesBannerDismissed] = useState(false);
  const refreshIntake = () =>
    supabase.from("client_intake").select("data").eq("client_id", client.id).maybeSingle()
      .then(({ data }) => setClientIntake((data as any)?.data || null));

  const [bankSubs,      setBankSubs]      = useState<any[]>([]);
  const [txsView,       setTxsViewRaw]    = useState<"credit" | "bank">(() => (sessionStorage.getItem(`dc_txsview_${client.id}`) as any) || "credit");
  const setTxsView = (v: "credit" | "bank") => { sessionStorage.setItem(`dc_txsview_${client.id}`, v); setTxsViewRaw(v); };
  const [selBankCat,    setSelBankCat]    = useState<string | null>(null);
  const [selBankMonth,  setSelBankMonth]  = useState("all");
  const [selBankAcct,   setSelBankAcct]   = useState<number | "all">("all");
  const [bankSearch,    setBankSearch]    = useState("");

  const [view,          setViewRaw]       = useState<"txs" | "docs" | "balance" | "categories">(() => (sessionStorage.getItem(`dc_view_${client.id}`) as any) || "txs");
  const setView = (v: "txs" | "docs" | "balance" | "categories") => {
    sessionStorage.setItem(`dc_view_${client.id}`, v);
    setViewRaw(v);
    window.history.replaceState(null, "", `/client/${client.id}/data_center/${v}`);
  };
  const [selMonth,      setSelMonth]      = useState("all");
  const [selCat,        setSelCat]        = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [editUid,       setEditUid]       = useState<string | null>(null);
  const [editCat,       setEditCat]       = useState("");
  const [expandedMk,    setExpandedMk]    = useState<string | null>(null);
  const [showAllTxs,    setShowAllTxs]    = useState<Record<string, boolean>>({});
  const [editSummary,   setEditSummary]   = useState<EditSummary | null>(null);
  const [editSummaryVal,setEditSummaryVal]= useState("");
  const [hoverSumRow,   setHoverSumRow]   = useState<string | null>(null);
  const [catNotes,      setCatNotes]      = useState<Record<string, string>>({});
  const [editingNote,   setEditingNote]   = useState<string | null>(null);
  const [noteVal,       setNoteVal]       = useState("");

  // balance-tab state
  const [hiddenCats,    setHiddenCats]    = useState<Set<string>>(new Set());
  const [catOrder,      setCatOrder]      = useState<Record<string, number>>({});
  const [catTypeOvr,    setCatTypeOvr]    = useState<Record<string, BudgetType>>({});
  const [catRenames,    setCatRenames]    = useState<Record<string, string>>({});
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [newCatName,    setNewCatName]    = useState("");
  const [newCatType,    setNewCatType]    = useState<BudgetType>("משתנה");
  const [confirmDelCat, setConfirmDelCat] = useState<string | null>(null);
  const [dragCat,       setDragCat]       = useState<string | null>(null);
  const [dragOverCat,   setDragOverCat]   = useState<string | null>(null);
  const [dragOverSec,   setDragOverSec]   = useState<BudgetType | null>(null);
  const [highlightCat,  setHighlightCat]  = useState<string | null>(null);
  const [editingCatName,setEditingCatName]= useState<string | null>(null);
  const [catNameVal,    setCatNameVal]    = useState("");
  const [showDebug,     setShowDebug]     = useState(false);

  // ── admin override editing (loans / savings / assets tiles) ─────────────────
  const [adminEditing,  setAdminEditing]  = useState<string | null>(null); // docId
  const [adminDrafts,   setAdminDrafts]   = useState<Record<string, Record<string, string>>>({});
  const [adminSavingIds,setAdminSavingIds]= useState<Set<string>>(new Set());

  const notesKey    = `dcnotes_${client.id}`;
  const hiddenKey   = `dcbalance_hidden_${client.id}`;
  const orderKey    = `dcbalance_order_${client.id}`;
  const typeOvrKey  = `dcbalance_type_${client.id}`;
  const renameKey   = `dcbalance_rename_${client.id}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(notesKey);
      if (saved) setCatNotes(JSON.parse(saved));
      const o = localStorage.getItem(orderKey);
      if (o) setCatOrder(JSON.parse(o));
    } catch {}
  }, [notesKey, orderKey]);

  const saveNote = (cat: string, val: string) => {
    setCatNotes(prev => {
      const next = { ...prev };
      if (val.trim()) next[cat] = val.trim(); else delete next[cat];
      try { localStorage.setItem(notesKey, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const saveBalanceSettings = (updates: Partial<{ cat_type_ovr: Record<string, BudgetType>; cat_renames: Record<string, string>; hidden_cats: string[] }>) => {
    supabase.from("portfolio_balance_settings").upsert(
      { client_id: client.id, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "client_id" }
    );
  };

  const saveHidden = (s: Set<string>) => {
    setHiddenCats(s);
    saveBalanceSettings({ hidden_cats: [...s] });
  };
  const saveOrder = (o: Record<string, number>) => {
    setCatOrder(o);
    try { localStorage.setItem(orderKey, JSON.stringify(o)); } catch {}
  };
  const saveTypeOvr = (t: Record<string, BudgetType>) => {
    setCatTypeOvr(t);
    saveBalanceSettings({ cat_type_ovr: t });
  };
  const saveRename = (r: Record<string, string>) => {
    setCatRenames(r);
    saveBalanceSettings({ cat_renames: r });
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      supabase.from("portfolio_submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: true }),
      supabase.from("payslips").select("*").eq("client_id", client.id).order("month_key", { ascending: false }),
      supabase.from("client_documents").select("*").eq("client_id", client.id),
      supabase.from("month_entries").select("*").eq("client_id", client.id).order("month_key", { ascending: false }),
      supabase.from("categories").select("name, budget_type").eq("is_active", true).is("client_id", null).order("name"),
      supabase.from("categories").select("name, budget_type").eq("is_active", true).eq("client_id", client.id).order("name"),
      supabase.from("portfolio_avg_overrides").select("category, override_avg").eq("client_id", client.id),
      supabase.from("portfolio_month_overrides").select("month_key, category, override_amount").eq("client_id", client.id),
      supabase.from("client_intake").select("data").eq("client_id", client.id).maybeSingle(),
      supabase.from("bank_submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: true }),
      supabase.from("client_questionnaire").select("*").eq("client_id", client.id).order("spouse_index"),
      supabase.from("portfolio_balance_settings").select("*").eq("client_id", client.id).maybeSingle(),
    ]).then(([
      { data: ps }, { data: pays }, { data: docs }, { data: me }, { data: cats },
      { data: clientCats },
      { data: avgOvr }, { data: mkOvr }, { data: intake }, { data: bSubs }, { data: questData },
      { data: balSettings },
    ]) => {
      setPSubs(ps || []);
      setBankSubs(bSubs || []);
      setClientCatRows((clientCats || []) as { name: string; budget_type: BudgetType }[]);

      const merged: Tx[] = [];
      (client.submissions || []).forEach((s: any) => {
        (s.transactions || []).forEach((t: any, i: number) => {
          merged.push({
            _uid: `sub_${s.id}_${i}`, _table: "submissions",
            _subId: s.id, _txIndex: i,
            month_key: s.month_key || "",
            srcLabel: s.label || mkLabel(s.month_key),
            date: t.date || "", name: t.name || "",
            cat: t.cat || "שונות",
            amount: Number(t.amount || 0),
            note: t.note || undefined,
          });
        });
      });
      (ps || []).forEach((s: any) => {
        (s.transactions || []).forEach((t: any, i: number) => {
          merged.push({
            _uid: `psub_${s.id}_${i}`, _table: "portfolio_submissions",
            _subId: s.id, _txIndex: i,
            month_key: s.month_key || "",
            srcLabel: s.label || mkLabel(s.month_key),
            date: t.date || "", name: t.name || "",
            cat: t.cat || "שונות",
            amount: Number(t.amount || 0),
            note: t.note || undefined,
          });
        });
      });

      setAllTxs(merged);
      setPayslips(pays || []);
      setClientDocs(docs || []);
      setMonths(me || []);
      setCategories([...new Set((cats || []).map((c: any) => c.name as string))].sort());

      const typeMap: Record<string, BudgetType> = {};
      (cats || []).forEach((c: any) => { if (c.budget_type) typeMap[c.name] = c.budget_type as BudgetType; });
      (clientCats || []).forEach((c: any) => { if (c.budget_type) typeMap[c.name] = c.budget_type as BudgetType; });
      setCatTypes(typeMap);

      const avgMap: Record<string, number> = {};
      (avgOvr || []).forEach((r: any) => { avgMap[r.category] = Number(r.override_avg); });
      setAvgOverrides(avgMap);

      const mkMap: Record<string, number> = {};
      (mkOvr || []).forEach((r: any) => { mkMap[`${r.category}|${r.month_key}`] = Number(r.override_amount); });
      setMonthOvr(mkMap);

      setClientIntake((intake as any)?.data || null);
      const qRows = questData || [];
      setClientQuestionnaire(qRows);
      const initNotes: Record<number, string> = {};
      qRows.forEach((r: any) => { initNotes[r.spouse_index] = r.admin_notes || ""; });
      setQuestAdminNotes(initNotes);

      // Load balance settings: prefer DB, fall back to localStorage
      if (balSettings) {
        if (balSettings.cat_type_ovr) setCatTypeOvr(balSettings.cat_type_ovr);
        if (balSettings.cat_renames) setCatRenames(balSettings.cat_renames);
        if (Array.isArray(balSettings.hidden_cats)) setHiddenCats(new Set(balSettings.hidden_cats));
      } else {
        try {
          const t = localStorage.getItem(`dcbalance_type_${client.id}`);
          if (t) setCatTypeOvr(JSON.parse(t));
          const r = localStorage.getItem(`dcbalance_rename_${client.id}`);
          if (r) setCatRenames(JSON.parse(r));
          const h = localStorage.getItem(`dcbalance_hidden_${client.id}`);
          if (h) setHiddenCats(new Set(JSON.parse(h)));
        } catch {}
      }

      setLoading(false);
    });
  }, [client.id, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── real-time sync: global categories ───────────────────────────────────────
  useEffect(() => {
    const reloadCats = () =>
      supabase.from("categories").select("name, budget_type").eq("is_active", true).is("client_id", null).order("name")
        .then(({ data: cats }) => {
          if (!cats) return;
          setCategories([...new Set(cats.map((c: any) => c.name as string))].sort());
          const typeMap: Record<string, BudgetType> = {};
          cats.forEach((c: any) => { if (c.budget_type) typeMap[c.name] = c.budget_type as BudgetType; });
          setCatTypes(typeMap);
        });

    const channel = supabase
      .channel("global_categories_watch")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: "client_id=is.null" }, reloadCats)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── admin override helpers ───────────────────────────────────────────────────
  const refreshDocs = async () => {
    const { data: docs } = await supabase.from("client_documents").select("*").eq("client_id", client.id);
    setClientDocs(docs || []);
  };

  const startAdminEdit = (docId: string, currentAdminData: Record<string, any>) => {
    setAdminDrafts(prev => ({ ...prev, [docId]: { ...currentAdminData } }));
    setAdminEditing(docId);
  };

  const cancelAdminEdit = (docId: string) => {
    setAdminEditing(null);
    setAdminDrafts(prev => { const n = { ...prev }; delete n[docId]; return n; });
  };

  const saveAdminEdit = async (docId: string) => {
    const draft = adminDrafts[docId] || {};
    setAdminSavingIds(prev => new Set(prev).add(docId));
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v !== null && v !== undefined && String(v).trim() !== "") cleaned[k] = String(v).trim();
    }
    await supabase.from("client_documents").update({ admin_data: cleaned }).eq("id", docId);
    await refreshDocs();
    setAdminSavingIds(prev => { const s = new Set(prev); s.delete(docId); return s; });
    setAdminEditing(null);
    setAdminDrafts(prev => { const n = { ...prev }; delete n[docId]; return n; });
  };

  const revertAdminField = async (docId: string, field: string) => {
    const doc = clientDocs.find((d: any) => d.id === docId);
    const updated = { ...(doc?.admin_data || {}) };
    delete updated[field];
    await supabase.from("client_documents").update({ admin_data: updated }).eq("id", docId);
    await refreshDocs();
    setAdminDrafts(prev => {
      const n = { ...prev };
      if (n[docId]) { n[docId] = { ...n[docId] }; delete n[docId][field]; }
      return n;
    });
  };

  // ── derived ─────────────────────────────────────────────────────────────────
  const uniqueMonths = [...new Set(allTxs.map(t => t.month_key).filter(Boolean))].sort().reverse();

  // ── shared balance computation — consumed by both "balance" and "categories" views ──
  const balanceData = useMemo(() => {
    const tableMonths = uniqueMonths.slice(0, 3).reverse();
    const nMonths = tableMonths.length || 1;

    const elecBills: { amount: string; months: number }[] = (clientIntake as any)?.electricity_bills || [];
    const elecTotalMonths = elecBills.reduce((s: number, b: any) => s + (b.months || 0), 0);
    const elecMonthlyAvg = elecTotalMonths > 0
      ? elecBills.reduce((s: number, b: any) => s + Number(b.amount || 0), 0) / elecTotalMonths
      : 0;
    const hasElecBills = elecTotalMonths > 0;

    const rawByMk: Record<string, Record<string, number>> = {};
    allTxs
      .filter(t => !IGNORED.has(t.cat) && tableMonths.includes(t.month_key) && !(hasElecBills && t.cat === "חשמל"))
      .forEach(t => {
        if (!rawByMk[t.cat]) rawByMk[t.cat] = {};
        rawByMk[t.cat][t.month_key] = (rawByMk[t.cat][t.month_key] || 0) + Math.abs(t.amount);
      });

    const creditCats = new Set(Object.keys(rawByMk));
    const creditRawSnapshot: Record<string, Record<string, number>> = {};
    Object.entries(rawByMk).forEach(([cat, byMk]) => { creditRawSnapshot[cat] = { ...byMk }; });

    const normBankDate = (d: string): string => {
      if (!d) return "";
      if (d.includes("-")) return d.slice(0, 10);
      const parts = d.split("/");
      if (parts.length === 3) {
        const [dd, mm, yy] = parts;
        return `${yy.length === 2 ? "20" + yy : yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
      }
      return d;
    };

    const bankDatesByMk: Record<string, string[]> = {};
    const bankTxsByBankMk: Record<string, { cat: string; amount: number }[]> = {};
    bankSubs.forEach((s: any) => {
      (s.transactions || []).forEach((t: any) => {
        if (!t.date) return;
        if (t.flow_type === "credit_transfer" || t.cat === "להתעלם") return;
        const iso = normBankDate(t.date as string);
        const bMk = iso.slice(0, 7);
        if (!bMk || bMk.length < 7) return;
        if (!bankDatesByMk[bMk]) bankDatesByMk[bMk] = [];
        bankDatesByMk[bMk].push(iso);
        if (!bankTxsByBankMk[bMk]) bankTxsByBankMk[bMk] = [];
        bankTxsByBankMk[bMk].push({ cat: t.cat || "שונות", amount: Number(t.amount || 0) });
      });
    });

    const allBankDates = Object.values(bankDatesByMk).flat().sort();
    const minBankDate = allBankDates[0] ?? "";
    const maxBankDate = allBankDates[allBankDates.length - 1] ?? "";
    const fullBankMonths: string[] = Object.keys(bankDatesByMk)
      .filter(mk => {
        const [y, m] = mk.split("-").map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        return minBankDate <= `${mk}-01` && maxBankDate >= `${mk}-${String(lastDay).padStart(2, "0")}`;
      })
      .sort();

    const columnBankMonth: Record<string, string | "avg" | null> = {};
    tableMonths.forEach(mk => { columnBankMonth[mk] = null; });
    const usedBankMks = new Set<string>();
    fullBankMonths.forEach(bMk => {
      if (tableMonths.includes(bMk) && columnBankMonth[bMk] === null) {
        columnBankMonth[bMk] = bMk;
        usedBankMks.add(bMk);
      }
    });
    const unmatchedBank = fullBankMonths.filter(mk => !usedBankMks.has(mk));
    const unmatchedCredit = [...tableMonths].reverse().filter(mk => columnBankMonth[mk] === null);
    unmatchedBank.forEach((bMk, i) => {
      if (i < unmatchedCredit.length) {
        columnBankMonth[unmatchedCredit[i]] = bMk;
        usedBankMks.add(bMk);
      }
    });
    tableMonths.forEach(mk => { if (columnBankMonth[mk] === null) columnBankMonth[mk] = "avg"; });

    const bankCatByMk: Record<string, Record<string, number>> = {};
    Object.entries(bankTxsByBankMk).forEach(([bMk, txs]) => {
      bankCatByMk[bMk] = {};
      txs.forEach(t => {
        bankCatByMk[bMk][t.cat] = (bankCatByMk[bMk][t.cat] || 0) + Math.abs(t.amount);
      });
    });
    const bankCatAvg: Record<string, number> = {};
    if (fullBankMonths.length > 0) {
      const bankAllCats = new Set<string>();
      fullBankMonths.forEach(mk => Object.keys(bankCatByMk[mk] || {}).forEach(c => bankAllCats.add(c)));
      bankAllCats.forEach(cat => {
        bankCatAvg[cat] = fullBankMonths.reduce((s, mk) => s + (bankCatByMk[mk]?.[cat] || 0), 0) / fullBankMonths.length;
      });
    }

    const bankByCol: Record<string, Record<string, number>> = {};
    tableMonths.forEach(mk => {
      const assigned = columnBankMonth[mk];
      if (assigned === "avg") bankByCol[mk] = bankCatAvg;
      else if (assigned) bankByCol[mk] = bankCatByMk[assigned] || {};
      else bankByCol[mk] = {};
    });

    const colBankNotes: Record<string, string | null> = {};
    tableMonths.forEach(mk => {
      const assigned = columnBankMonth[mk];
      if (fullBankMonths.length === 0) {
        colBankNotes[mk] = null;
      } else if (assigned === "avg") {
        colBankNotes[mk] = `ממוצע עו"ש (${fullBankMonths.map(mkLabel).join(", ")})`;
      } else if (assigned && assigned !== mk) {
        colBankNotes[mk] = `עו"ש: ${mkLabel(assigned as string)}`;
      } else {
        colBankNotes[mk] = null;
      }
    });

    if (fullBankMonths.length > 0) {
      tableMonths.forEach(creditMk => {
        Object.entries(bankByCol[creditMk] || {}).forEach(([cat, amt]) => {
          if (IGNORED.has(cat)) return;
          if (avgOverrides[cat] !== undefined && !creditCats.has(cat)) return;
          if (!rawByMk[cat]) rawByMk[cat] = {};
          rawByMk[cat][creditMk] = (rawByMk[cat][creditMk] || 0) + amt;
        });
      });
      Object.values(bankTxsByBankMk).forEach(txs => {
        txs.forEach(t => {
          if (IGNORED.has(t.cat)) return;
          if (avgOverrides[t.cat] !== undefined && !creditCats.has(t.cat)) return;
          if (!rawByMk[t.cat]) rawByMk[t.cat] = {};
        });
      });
    }

    const allRows = Object.entries(rawByMk).map(([cat, byMk]) => {
      const rawVals = tableMonths.map(mk => byMk[mk] || 0);
      const rawAvg = rawVals.reduce((s, v) => s + v, 0) / nMonths;
      const effVals = tableMonths.map((mk, mi) => {
        const k = `${cat}|${mk}`;
        return monthOvr[k] !== undefined ? monthOvr[k] : rawVals[mi];
      });
      const effAvg = avgOverrides[cat] !== undefined
        ? avgOverrides[cat]
        : effVals.reduce((s, v) => s + v, 0) / nMonths;
      return { cat, budgetType: (catTypes[cat] || "משתנה") as BudgetType, rawVals, rawAvg, effVals, effAvg };
    });

    if (!allRows.some(r => r.cat === "חשמל")) {
      const effElecVals = tableMonths.map(mk => {
        const k = `חשמל|${mk}`;
        return monthOvr[k] !== undefined ? monthOvr[k] : elecMonthlyAvg;
      });
      const effElecAvg = avgOverrides["חשמל"] !== undefined
        ? avgOverrides["חשמל"]
        : effElecVals.reduce((s, v) => s + v, 0) / nMonths;
      allRows.push({
        cat: "חשמל",
        budgetType: "קבוע",
        rawVals: tableMonths.map(() => elecMonthlyAvg),
        rawAvg: elecMonthlyAvg,
        effVals: effElecVals,
        effAvg: effElecAvg,
      });
    }

    Object.keys(avgOverrides).forEach(cat => {
      if (!allRows.some(r => r.cat === cat)) {
        const effValsAdded = tableMonths.map(mk => {
          const k = `${cat}|${mk}`;
          return monthOvr[k] !== undefined ? monthOvr[k] : 0;
        });
        allRows.push({
          cat,
          budgetType: (catTypes[cat] || "משתנה") as BudgetType,
          rawVals: tableMonths.map(() => 0),
          rawAvg: 0,
          effVals: effValsAdded,
          effAvg: avgOverrides[cat],
        });
      }
    });

    allRows.forEach(r => { if (catTypeOvr[r.cat]) r.budgetType = catTypeOvr[r.cat]; });

    return {
      tableMonths, nMonths, allRows,
      elecMonthlyAvg, hasElecBills,
      creditCats, creditRawSnapshot,
      columnBankMonth, colBankNotes,
      bankCatByMk, bankCatAvg, bankByCol,
      fullBankMonths, bankTxsByBankMk,
      minBankDate, maxBankDate,
    };
  }, [uniqueMonths, clientIntake, allTxs, bankSubs, avgOverrides, monthOvr, catTypes, catTypeOvr]);

  const summaryTxs = allTxs.filter(t =>
    !IGNORED.has(t.cat) &&
    (selMonth === "all" || t.month_key === selMonth)
  );
  const catMap: Record<string, number> = {};
  summaryTxs.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + Math.abs(t.amount); });
  const totalAmt   = Object.values(catMap).reduce((s, v) => s + v, 0);
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const allCatsSorted = catEntries.map(([c]) => c);

  const visibleTxs = allTxs.filter(t => {
    if (IGNORED.has(t.cat)) return false;
    if (selMonth !== "all" && t.month_key !== selMonth) return false;
    if (selCat && t.cat !== selCat) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !t.cat.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const totalVisible = visibleTxs.reduce((s, t) => s + Math.abs(t.amount), 0);

  // ── update tx category ───────────────────────────────────────────────────────
  const updateCat = async (tx: Tx, newCat: string) => {
    const subList: any[] = tx._table === "submissions" ? (client.submissions || []) : pSubs;
    const sub = subList.find((s: any) => s.id === tx._subId);
    if (!sub) return;
    const newTxs = (sub.transactions || []).map((t: any, i: number) =>
      i === tx._txIndex ? { ...t, cat: newCat } : t
    );
    await supabase.from(tx._table).update({ transactions: newTxs }).eq("id", tx._subId);
    if (tx._table === "portfolio_submissions") {
      setPSubs(prev => prev.map(s => s.id === tx._subId ? { ...s, transactions: newTxs } : s));
    }
    setAllTxs(prev => prev.map(t => t._uid === tx._uid ? { ...t, cat: newCat } : t));
    setEditUid(null);
  };

  // ── summary table overrides ──────────────────────────────────────────────────
  const saveSummaryAvg = async (cat: string, valStr: string) => {
    const val = Number(valStr);
    if (isNaN(val) || val < 0) return;
    await supabase.from("portfolio_avg_overrides").upsert(
      { client_id: client.id, category: cat, override_avg: val, updated_at: new Date().toISOString() },
      { onConflict: "client_id,category" }
    );
    setAvgOverrides(prev => ({ ...prev, [cat]: val }));
  };
  const revertSummaryAvg = async (cat: string) => {
    await supabase.from("portfolio_avg_overrides").delete().eq("client_id", client.id).eq("category", cat);
    setAvgOverrides(prev => { const n = { ...prev }; delete n[cat]; return n; });
  };
  const saveSummaryMonth = async (cat: string, mk: string, valStr: string) => {
    const val = Number(valStr);
    if (isNaN(val) || val < 0) return;
    await supabase.from("portfolio_month_overrides").upsert(
      { client_id: client.id, month_key: mk, category: cat, override_amount: val, updated_at: new Date().toISOString() },
      { onConflict: "client_id,month_key,category" }
    );
    setMonthOvr(prev => ({ ...prev, [`${cat}|${mk}`]: val }));
  };
  const revertSummaryMonth = async (cat: string, mk: string) => {
    await supabase.from("portfolio_month_overrides").delete().eq("client_id", client.id).eq("month_key", mk).eq("category", cat);
    setMonthOvr(prev => { const n = { ...prev }; delete n[`${cat}|${mk}`]; return n; });
  };

  // ── excel export ─────────────────────────────────────────────────────────────
  const exportExcel = (txList: Tx[], filename: string) => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
    const rows = txList.map(t => ({
      "תאריך": t.date, "שם עסק": t.name, "קטגוריה": t.cat,
      "סכום": Math.abs(t.amount), "חודש": mkLabel(t.month_key), "מקור": t.srcLabel,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "תנועות");
    XLSX.writeFile(wb, filename);
  };

  // ── file download ────────────────────────────────────────────────────────────
  const downloadFile = async (path: string, filename: string) => {
    const { data } = await supabase.storage.from("client-documents").createSignedUrl(path, 3600);
    if (!data?.signedUrl) { alert("שגיאה בהורדה"); return; }
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)", fontSize: 15 }}>טוען נתונים...</div>
  );

  // ── RENDER ───────────────────────────────────────────────────────────────────

  // ── Notes panel data ──────────────────────────────────────────────────────
  const noteRows: { type: string; label: string; text: string; sub?: string }[] = [];
  if (client.submission_notes) {
    noteRows.push({ type: "general", label: "הערה כללית", text: client.submission_notes });
  }
  months.forEach((m: any) => {
    if (m.finalize_note) {
      noteRows.push({ type: "month", label: m.label || mkLabel(m.month_key), text: m.finalize_note, sub: m.month_key });
    }
  });
  allTxs.forEach(t => {
    if (t.note) {
      noteRows.push({ type: "tx", label: t.name, text: t.note, sub: `${t.date} · ${t.srcLabel}` });
    }
  });

  // ── Bank notes panel data ──────────────────────────────────────────────────
  const bankNoteRows: { label: string; text: string; sub?: string }[] = [];
  bankSubs.forEach((s: any) => {
    const acct = s.account_index || 1;
    (s.transactions || []).forEach((t: any) => {
      if (t.note) {
        bankNoteRows.push({ label: t.name || "", text: t.note, sub: `${t.date || ""} · חשבון ${acct}` });
      }
    });
  });

  return (
    <div style={{ direction: "rtl" }}>

      {/* Sub-view tabs */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
        {([
          ["txs",  "תנועות"],
          ["balance", "בסיס למאזן"],
          ["docs", "מסמכים ותלושים"],
          ["categories", "רשימת קטגוריות"],
        ] as [string, string][]).map(([id, label]) => {
          const isActive = view === id;
          return (
            <button key={id}
              onClick={() => { setView(id as any); if (id === "balance") refreshIntake(); }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(216,243,220,0.5)"; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              style={{
                padding: "5px 16px", fontSize: 14, fontFamily: "inherit",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--green-deep)" : "var(--text-dim)",
                background: isActive ? "var(--green-mint)" : "transparent",
                border: "none", borderRadius: 20,
                cursor: "pointer", transition: "all 0.15s",
                whiteSpace: "nowrap", position: "relative",
              }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ══════════════════ TRANSACTIONS VIEW ══════════════════ */}
      {(view === "txs" || view === "balance") && (
        <div>
          {/* Inner sub-tabs for txs view */}
          {view === "txs" && (
            <div style={{ display: "flex", gap: 2, marginBottom: 16 }}>
              {([
                ["credit", `תנועות אשראי (${allTxs.filter(t => !IGNORED.has(t.cat)).length})`],
                ["bank",   `תנועות עו"ש (${bankSubs.reduce((n: number, s: any) => n + (s.transactions||[]).length, 0)})`],
              ] as [string, string][]).map(([id, label]) => {
                const isActive = txsView === id;
                return (
                  <button key={id}
                    onClick={() => setTxsView(id as any)}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(216,243,220,0.5)"; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    style={{
                      padding: "4px 14px", fontSize: 13, fontFamily: "inherit",
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "var(--green-deep)" : "var(--text-dim)",
                      background: isActive ? "var(--green-mint)" : "transparent",
                      border: "none", borderRadius: 20,
                      cursor: "pointer", transition: "all 0.15s",
                      whiteSpace: "nowrap", position: "relative",
                    }}>
                    {label}
                    {id === "credit" && noteRows.length > 0 && (
                      <span style={{ position: "absolute", top: 0, right: 0, minWidth: 15, height: 15, borderRadius: 8, background: "var(--gold)", color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                        {noteRows.length}
                      </span>
                    )}
                    {id === "bank" && bankNoteRows.length > 0 && (
                      <span style={{ position: "absolute", top: 0, right: 0, minWidth: 15, height: 15, borderRadius: 8, background: "var(--gold)", color: "#fff", fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>
                        {bankNoteRows.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Controls */}
          {view === "txs" && txsView === "credit" && <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
            {["all", ...uniqueMonths].map(mk => (
              <button key={mk} onClick={() => { setSelMonth(mk); setSelCat(null); }} style={{
                padding: "5px 13px", fontSize: 13, borderRadius: 20, fontFamily: "inherit",
                border: `1px solid ${selMonth === mk ? "var(--green-mid)" : "var(--border)"}`,
                background: selMonth === mk ? "var(--green-pale)" : "var(--surface2)",
                color: selMonth === mk ? "var(--green-deep)" : "var(--text-mid)",
                fontWeight: selMonth === mk ? 700 : 400, cursor: "pointer",
              }}>
                {mk === "all" ? "כל החודשים" : mkLabel(mk)}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש שם עסק..."
              style={{
                padding: "6px 12px", fontSize: 13, borderRadius: 8,
                border: "1px solid var(--border)", background: "var(--surface2)",
                color: "var(--text)", fontFamily: "inherit", outline: "none",
                direction: "rtl", minWidth: 160,
              }}
            />
            <div style={{ display: "flex", gap: 10, marginRight: "auto", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{visibleTxs.length} תנועות</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--red)" }}>
                ₪{Math.round(totalVisible).toLocaleString()}
              </span>
              {selCat && (
                <button onClick={() => setSelCat(null)} style={{
                  fontSize: 12, padding: "3px 10px", borderRadius: 12,
                  border: "1px solid var(--border)", background: "var(--surface2)",
                  color: "var(--text-mid)", cursor: "pointer", fontFamily: "inherit",
                }}>
                  {selCat} ✕
                </button>
              )}
              <Btn size="sm" variant="secondary" onClick={() => exportExcel(visibleTxs, `מאזן_${client.name}_תנועות.xlsx`)}>
                <IcoDown /> Excel
              </Btn>
            </div>
          </div>}

          {/* ══ Notes panel — txs/credit tab only (filtered by selected month) ══ */}
          {view === "txs" && txsView === "credit" && noteRows.length > 0 && (() => {
            const visibleNoteRows = selMonth === "all" ? noteRows : noteRows.filter(r => r.type === "general" || r.sub === selMonth);
            return (
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden", border: "1.5px solid rgba(255,193,7,0.35)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "rgba(255,193,7,0.07)", borderBottom: "1px solid rgba(255,193,7,0.2)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--gold)" }}>הערות הלקוח ({visibleNoteRows.length})</span>
              </div>
              {visibleNoteRows.length === 0 ? (
                <div style={{ padding: "16px 20px", fontSize: 13, color: "var(--text-dim)", textAlign: "center", fontStyle: "italic" }}>לא הוזנו הערות בטווח זמן זה</div>
              ) : (
                <div style={{ overflowY: visibleNoteRows.length > 3 ? "auto" : "visible", maxHeight: visibleNoteRows.length > 3 ? 148 : "none" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--surface2)" }}>
                        <th style={{ padding: "6px 14px", fontWeight: 600, color: "var(--text-dim)", textAlign: "right", width: 100, borderBottom: "1px solid var(--border)" }}>סוג</th>
                        <th style={{ padding: "6px 14px", fontWeight: 600, color: "var(--text-dim)", textAlign: "right", width: 155, borderBottom: "1px solid var(--border)" }}>מקור</th>
                        <th style={{ padding: "6px 14px", fontWeight: 600, color: "var(--text-dim)", textAlign: "right", borderBottom: "1px solid var(--border)" }}>הערה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleNoteRows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: i < visibleNoteRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <td style={{ padding: "7px 14px", verticalAlign: "top" }}>
                            <span style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600,
                              background: r.type === "general" ? "rgba(46,204,138,0.12)" : r.type === "month" ? "rgba(69,123,157,0.12)" : "rgba(255,193,7,0.12)",
                              color: r.type === "general" ? "var(--green-mid)" : r.type === "month" ? "#457b9d" : "var(--gold)",
                            }}>
                              {r.type === "general" ? "כללי" : r.type === "month" ? "סיום חודש" : "עסקה"}
                            </span>
                          </td>
                          <td style={{ padding: "7px 14px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.label}</div>
                            {r.sub && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{r.sub}</div>}
                          </td>
                          <td style={{ padding: "7px 14px", verticalAlign: "top", color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            );
          })()}

          {/* ══ Notes reminder banner — balance tab ══ */}
          {view === "balance" && noteRows.length > 0 && !notesBannerDismissed && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", marginBottom: 16, background: "rgba(255,193,7,0.10)", border: "1.5px solid rgba(255,193,7,0.4)", borderRadius: 10 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span style={{ fontSize: 13, color: "var(--gold)", fontWeight: 600, flex: 1 }}>
                ללקוח {noteRows.length === 1 ? "הערה אחת" : `${noteRows.length} הערות`} — ראה טאב תנועות
              </span>
              <button onClick={() => { setView("txs"); setNotesBannerDismissed(true); }} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, border: "1px solid var(--gold)", background: "transparent", color: "var(--gold)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                עבור להערות
              </button>
              <button onClick={() => setNotesBannerDismissed(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 16, lineHeight: 1, padding: "0 2px" }} title="סגור">×</button>
            </div>
          )}

          {/* ── MONTHLY SUMMARY TABLE ── */}
          {view === "balance" && allTxs.length > 0 && (() => {
            const {
              tableMonths, nMonths, allRows,
              elecMonthlyAvg, hasElecBills,
              creditCats, creditRawSnapshot,
              columnBankMonth, colBankNotes,
              bankCatByMk, bankCatAvg, bankByCol,
              fullBankMonths, bankTxsByBankMk,
              minBankDate, maxBankDate,
            } = balanceData;
            const empty = 3 - tableMonths.length;

            // Split into visible and removed (hidden by admin).
            // Also exclude all-zero rows that weren't explicitly added by admin (no avgOverride).
            const removedRows = allRows.filter(r => hiddenCats.has(r.cat));
            const visibleRows = allRows.filter(r =>
              !hiddenCats.has(r.cat) &&
              !(r.effAvg === 0 && r.effVals.every(v => v === 0) && avgOverrides[r.cat] === undefined)
            );

            // Sort by custom drag-order, then alphabetically
            visibleRows.sort((a, b) => {
              const oa = catOrder[a.cat] ?? 9999;
              const ob = catOrder[b.cat] ?? 9999;
              return oa !== ob ? oa - ob : a.cat.localeCompare(b.cat, "he");
            });

            // Categories with no-data indicator
            const noDataCats = new Set<string>();
            if (!hasElecBills) {
              const elecRow = visibleRows.find(r => r.cat === "חשמל");
              if (!elecRow || elecRow.rawAvg === 0) noDataCats.add("חשמל");
            }

            const grouped: Record<BudgetType, typeof allRows> = { הכנסה: [], קבוע: [], משתנה: [] };
            visibleRows.forEach(r => grouped[r.budgetType].push(r));

            const incTotal = grouped["הכנסה"].reduce((s, r) => s + r.effAvg, 0);
            const expTotal = [...grouped["קבוע"], ...grouped["משתנה"]].reduce((s, r) => s + r.effAvg, 0);
            const balance  = incTotal - expTotal;

            // ── Drag handlers ──────────────────────────────────────────────────
            const handleDropOnRow = (targetCat: string) => {
              if (!dragCat || dragCat === targetCat) { setDragCat(null); setDragOverCat(null); return; }
              const targetBt = (catTypeOvr[targetCat] || catTypes[targetCat] || "משתנה") as BudgetType;
              const draggedBt = (catTypeOvr[dragCat] || catTypes[dragCat] || "משתנה") as BudgetType;
              const secCats = visibleRows.filter(r => r.budgetType === targetBt).map(r => r.cat).filter(c => c !== dragCat);
              const ti = secCats.indexOf(targetCat);
              secCats.splice(ti, 0, dragCat);
              const newOrd = { ...catOrder };
              secCats.forEach((c, i) => { newOrd[c] = i * 10; });
              saveOrder(newOrd);
              if (draggedBt !== targetBt) saveTypeOvr({ ...catTypeOvr, [dragCat]: targetBt });
              setDragCat(null); setDragOverCat(null); setDragOverSec(null);
            };
            const handleDropOnSec = (sec: BudgetType) => {
              if (!dragCat) return;
              const draggedBt = (catTypeOvr[dragCat] || catTypes[dragCat] || "משתנה") as BudgetType;
              const secCats = visibleRows.filter(r => r.budgetType === sec).map(r => r.cat).filter(c => c !== dragCat);
              secCats.push(dragCat);
              const newOrd = { ...catOrder };
              secCats.forEach((c, i) => { newOrd[c] = i * 10; });
              saveOrder(newOrd);
              if (draggedBt !== sec) saveTypeOvr({ ...catTypeOvr, [dragCat]: sec });
              setDragCat(null); setDragOverSec(null); setDragOverCat(null);
            };

            // ── Remove handler ─────────────────────────────────────────────────
            const handleRemoveCat = (cat: string) => {
              const hasTxs = allTxs.some(t => t.cat === cat && !IGNORED.has(t.cat));
              const isGlobal = categories.includes(cat);
              if (!hasTxs && !isGlobal) {
                setConfirmDelCat(cat);
              } else if (!hasTxs && isGlobal) {
                revertSummaryAvg(cat);
              } else {
                const s = new Set(hiddenCats); s.add(cat); saveHidden(s);
              }
            };

            const editInputSt: React.CSSProperties = {
              width: 76, textAlign: "center", fontSize: 13,
              border: "1px solid var(--green-mid)", borderRadius: 6,
              padding: "4px 6px", fontFamily: "inherit",
              background: "var(--surface)", color: "var(--text)", outline: "none",
            };

            // Override pill style
            const ovrSpan = (hasOvr: boolean): React.CSSProperties => hasOvr ? {
              background: "rgba(46,204,138,0.15)",
              border: "1px solid rgba(46,204,138,0.35)",
              borderRadius: 5, padding: "2px 7px",
              color: "var(--green-deep)", fontWeight: 700,
            } : {};

            const renderSummaryRow = (row: typeof allRows[0]) => {
              const isHov         = hoverSumRow === row.cat;
              const needsInd      = noDataCats.has(row.cat);
              const isDraggedOver = dragOverCat === row.cat && dragCat !== row.cat;
              const isBeingDragged = dragCat === row.cat;
              const isHighlighted = highlightCat === row.cat;
              const isEditingName = editingCatName === row.cat;
              const displayName   = catRenames[row.cat] || row.cat;
              const rowBg = isHighlighted ? "rgba(46,204,138,0.12)" : "transparent";
              const catBg = isHighlighted ? "rgba(46,204,138,0.12)" : "#f7f2e9";

              return (
                <tr
                  key={row.cat}
                  id={`brow-${row.cat}`}
                  draggable
                  onDragStart={() => setDragCat(row.cat)}
                  onDragOver={e => { e.preventDefault(); setDragOverCat(row.cat); setDragOverSec(null); }}
                  onDrop={() => handleDropOnRow(row.cat)}
                  onDragEnd={() => { setDragCat(null); setDragOverCat(null); setDragOverSec(null); }}
                  onMouseEnter={() => setHoverSumRow(row.cat)}
                  onMouseLeave={() => setHoverSumRow(null)}
                  style={{
                    borderBottom: "1px solid rgba(30,40,30,0.05)",
                    borderTop: isDraggedOver ? "2px solid var(--green-mid)" : undefined,
                    cursor: "pointer", background: rowBg, transition: "background 0.1s",
                    opacity: isBeingDragged ? 0.4 : 1,
                  }}
                >
                  {/* Category — sticky */}
                  <td style={{
                    position: "sticky", right: 0, zIndex: 2,
                    background: catBg, color: selCat === row.cat ? "var(--green-deep)" : "#3a2f1f",
                    padding: "10px 14px 10px 10px", fontSize: 14, fontWeight: 500,
                    whiteSpace: "nowrap",
                    boxShadow: "-6px 0 12px -8px rgba(0,0,0,0.15)",
                    borderBottom: "1px solid rgba(30,40,30,0.05)",
                    transition: "background 0.1s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ cursor: "grab", color: "var(--text-dim)", opacity: isHov ? 0.5 : 0, fontSize: 13, lineHeight: 1, flexShrink: 0, transition: "opacity 0.1s" }}>⠿</span>
                      {isEditingName ? (
                        <input
                          autoFocus
                          value={catNameVal}
                          onChange={e => setCatNameVal(e.target.value)}
                          onFocus={e => e.target.select()}
                          onBlur={() => {
                            const v = catNameVal.trim();
                            const next = { ...catRenames };
                            if (v && v !== row.cat) next[row.cat] = v; else delete next[row.cat];
                            saveRename(next);
                            setEditingCatName(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                            if (e.key === "Escape") setEditingCatName(null);
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{ flex: 1, fontSize: 13, padding: "2px 6px", borderRadius: 5, border: "1px solid var(--green-mid)", background: "var(--surface)", fontFamily: "inherit", outline: "none", color: "var(--text)", minWidth: 0 }}
                        />
                      ) : (
                        <span
                          style={{ flex: 1 }}
                          onDoubleClick={e => { e.stopPropagation(); setEditingCatName(row.cat); setCatNameVal(displayName); }}
                          title="לחץ פעמיים לעריכת שם"
                        >{displayName}</span>
                      )}
                      {needsInd && !isEditingName && (
                        <span title="הלקוח טרם העלה נתוני חשמל" style={{ fontSize: 12, color: "var(--gold)", lineHeight: 1 }}>⚠</span>
                      )}
                      {isHov && !isEditingName && (
                        <button
                          onClick={e => { e.stopPropagation(); handleRemoveCat(row.cat); }}
                          title="הסר מהטבלה"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#c0392b", fontSize: 15, opacity: 0.7, padding: "0 2px", lineHeight: 1, flexShrink: 0 }}
                        >×</button>
                      )}
                    </div>
                  </td>

                  {/* Month cells */}
                  {tableMonths.map((mk, mi) => {
                    const mkKey = `${row.cat}|${mk}`;
                    const hasOvr = monthOvr[mkKey] !== undefined;
                    const isEdit = editSummary?.type === "month" && editSummary.cat === row.cat && editSummary.mk === mk;
                    const effVal = row.effVals[mi];
                    return (
                      <td key={mk} style={{ padding: "12px 14px", textAlign: "center", fontVariantNumeric: "tabular-nums", background: "#f8f9f7", borderLeft: "1px solid rgba(45,106,79,0.1)", borderRight: "1px solid rgba(45,106,79,0.1)", borderBottom: "1px solid rgba(30,40,30,0.05)" }} onClick={e => e.stopPropagation()}>
                        {isEdit ? (
                          <input autoFocus value={editSummaryVal}
                            onChange={e => setEditSummaryVal(e.target.value)}
                            onFocus={e => e.target.select()}
                            onBlur={() => { saveSummaryMonth(row.cat, mk, editSummaryVal); setEditSummary(null); }}
                            onKeyDown={e => {
                              if (e.key === "Enter")  { saveSummaryMonth(row.cat, mk, editSummaryVal); setEditSummary(null); }
                              if (e.key === "Escape") setEditSummary(null);
                            }}
                            style={editInputSt}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                            <span
                              onClick={() => { setEditSummary({ type: "month", cat: row.cat, mk }); setEditSummaryVal(String(Math.round(effVal))); }}
                              title={hasOvr ? `ערך מקורי: ${fmt(row.rawVals[mi])}` : "לחץ לעריכה"}
                              style={{ cursor: "text", fontSize: 14, ...ovrSpan(hasOvr) }}
                            >
                              {fmt(effVal)}
                            </span>
                            {hasOvr && isHov && (
                              <button onClick={e => { e.stopPropagation(); revertSummaryMonth(row.cat, mk); }}
                                title="חזור לערך מקורי"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "0 1px", fontSize: 12, opacity: 0.7, lineHeight: 1, flexShrink: 0 }}>↩</button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Empty placeholders */}
                  {Array.from({ length: empty }).map((_, i) => (
                    <td key={`ph-${i}`} style={{ padding: "12px 14px", textAlign: "center", color: "var(--text-dim)", fontSize: 14, background: "#f8f9f7", borderLeft: "1px solid rgba(45,106,79,0.1)", borderRight: "1px solid rgba(45,106,79,0.1)", borderBottom: "1px solid rgba(30,40,30,0.05)" }}>₪0</td>
                  ))}

                  {/* Avg cell */}
                  {(() => {
                    const hasOvr = avgOverrides[row.cat] !== undefined;
                    const isEdit = editSummary?.type === "avg" && editSummary.cat === row.cat;
                    return (
                      <td style={{
                        padding: "12px 14px", textAlign: "center", fontWeight: 700,
                        borderLeft: "1px solid rgba(45,106,79,0.18)", borderRight: "1px solid rgba(45,106,79,0.18)",
                        borderBottom: "1px solid rgba(30,40,30,0.05)",
                        background: "#f1f3f3",
                        fontVariantNumeric: "tabular-nums",
                      }} onClick={e => e.stopPropagation()}>
                        {isEdit ? (
                          <input autoFocus value={editSummaryVal}
                            onChange={e => setEditSummaryVal(e.target.value)}
                            onFocus={e => e.target.select()}
                            onBlur={() => { saveSummaryAvg(row.cat, editSummaryVal); setEditSummary(null); }}
                            onKeyDown={e => {
                              if (e.key === "Enter")  { saveSummaryAvg(row.cat, editSummaryVal); setEditSummary(null); }
                              if (e.key === "Escape") setEditSummary(null);
                            }}
                            style={editInputSt}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                            <span
                              onClick={() => { setEditSummary({ type: "avg", cat: row.cat }); setEditSummaryVal(String(Math.round(row.effAvg))); }}
                              title={hasOvr ? `ממוצע מקורי: ${fmt(row.rawAvg)}` : "לחץ לעריכה"}
                              style={{ cursor: "text", fontSize: 14, ...ovrSpan(hasOvr) }}
                            >
                              {fmt(row.effAvg)}
                            </span>
                            {hasOvr && isHov && (
                              <button onClick={e => { e.stopPropagation(); revertSummaryAvg(row.cat); }}
                                title="חזור לממוצע מקורי"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: "0 1px", fontSize: 12, opacity: 0.7, lineHeight: 1, flexShrink: 0 }}>↩</button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })()}

                  {/* Notes cell */}
                  {(() => {
                    const autoNotes: { text: string; color: string; bg: string }[] = [];
                    if (avgOverrides[row.cat] !== undefined)
                      autoNotes.push({
                        text: `✏ ממוצע ידני: ₪${Math.round(row.effAvg).toLocaleString()} (מקור: ₪${Math.round(row.rawAvg).toLocaleString()})`,
                        color: "var(--green-deep)", bg: "rgba(46,204,138,0.12)",
                      });
                    const changedMks = tableMonths.filter(mk => monthOvr[`${row.cat}|${mk}`] !== undefined);
                    changedMks.forEach(mk => {
                      const mi = tableMonths.indexOf(mk);
                      const oldVal = row.rawVals[mi];
                      const newVal = monthOvr[`${row.cat}|${mk}`];
                      autoNotes.push({
                        text: `${mkLabel(mk)}: ₪${Math.round(newVal).toLocaleString()} (מקור: ₪${Math.round(oldVal).toLocaleString()})`,
                        color: "#1a759f", bg: "rgba(26,117,159,0.1)",
                      });
                    });
                    if (noDataCats.has(row.cat))
                      autoNotes.push({ text: "⚠ חסר נתוני חשמל", color: "#7a5c1e", bg: "rgba(247,194,56,0.15)" });
                    const isEditNote = editingNote === row.cat;
                    const manualNote = catNotes[row.cat];
                    const noteBorder = "1px solid rgba(180,160,120,0.22)";
                    return (
                      <td
                        style={{ padding: "8px 14px", background: "#f8f6f0", borderBottom: noteBorder, borderLeft: noteBorder, borderRight: noteBorder, verticalAlign: "top" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {autoNotes.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 5 }}>
                            {autoNotes.map((n, i) => (
                              <span key={i} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 10, background: n.bg, color: n.color, fontWeight: 600, whiteSpace: "nowrap" }}>
                                {n.text}
                              </span>
                            ))}
                          </div>
                        )}
                        {isEditNote ? (
                          <textarea
                            autoFocus
                            value={noteVal}
                            onChange={e => setNoteVal(e.target.value)}
                            onBlur={() => { saveNote(row.cat, noteVal); setEditingNote(null); }}
                            onKeyDown={e => { if (e.key === "Escape") setEditingNote(null); if (e.key === "Enter" && !e.shiftKey) { saveNote(row.cat, noteVal); setEditingNote(null); e.preventDefault(); } }}
                            rows={2}
                            placeholder="הוסף הערה..."
                            style={{ width: "100%", fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(180,160,120,0.4)", background: "#fff", fontFamily: "inherit", resize: "none", outline: "none", color: "var(--text)", boxSizing: "border-box" }}
                          />
                        ) : manualNote ? (
                          <div
                            onClick={() => { setEditingNote(row.cat); setNoteVal(manualNote); }}
                            style={{ fontSize: 12, color: "var(--text-mid)", cursor: "text", lineHeight: 1.5, whiteSpace: "pre-wrap" }}
                          >
                            {manualNote}
                          </div>
                        ) : isHov ? (
                          <button
                            onClick={() => { setEditingNote(row.cat); setNoteVal(""); }}
                            style={{ fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit", opacity: 0.6 }}
                          >
                            + הוסף הערה
                          </button>
                        ) : null}
                      </td>
                    );
                  })()}
                </tr>
              );
            };

            const secMonthTotal = (rows: typeof allRows, mi: number) =>
              rows.reduce((s, r) => s + r.effVals[mi], 0);

            const accentOf = (key: BudgetType) => key === "הכנסה" ? "var(--green-deep)" : "#7a8a82";
            const colBorder = "1px solid rgba(45,106,79,0.13)";
            const avgBorder = "1px solid rgba(45,106,79,0.18)";
            const rowBorder = "1px solid rgba(30,40,30,0.05)";

            // Categories available to add (global list minus those already shown)
            const shownCats = new Set(allRows.map(r => r.cat));
            const missingBySec: Record<BudgetType, string[]> = { הכנסה: [], קבוע: [], משתנה: [] };
            categories.forEach(cat => {
              if (!shownCats.has(cat) && !IGNORED.has(cat)) {
                const bt = (catTypes[cat] || "משתנה") as BudgetType;
                missingBySec[bt].push(cat);
              }
            });
            const addCat = async (cat: string) => {
              await saveSummaryAvg(cat, "0");
            };
            const SEC_LABELS: Record<BudgetType, string> = { הכנסה: "הכנסות", קבוע: "קבועות", משתנה: "משתנות" };

            return (
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", direction: "rtl" }}>
              {/* Main table */}
              <div style={{ flex: 1, minWidth: 0 }}>

              {/* Add category button + form */}
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
                {showAddForm ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--surface2)", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", flexWrap: "wrap" }}>
                    <input
                      autoFocus
                      value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          if (!newCatName.trim()) return;
                          const cat = newCatName.trim();
                          saveSummaryAvg(cat, "0").then(() => {
                            if (newCatType !== (catTypes[cat] || "משתנה")) saveTypeOvr({ ...catTypeOvr, [cat]: newCatType });
                            setHighlightCat(cat);
                            setTimeout(() => {
                              const el = document.getElementById(`brow-${cat}`);
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, 100);
                            setTimeout(() => setHighlightCat(null), 2500);
                          });
                          setNewCatName(""); setShowAddForm(false);
                        }
                        if (e.key === "Escape") setShowAddForm(false);
                      }}
                      placeholder="שם הקטגוריה..."
                      style={{ padding: "5px 10px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "inherit", direction: "rtl", outline: "none", minWidth: 180 }}
                    />
                    <select
                      value={newCatType}
                      onChange={e => setNewCatType(e.target.value as BudgetType)}
                      style={{ padding: "5px 8px", fontSize: 13, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontFamily: "inherit", outline: "none" }}
                    >
                      <option value="הכנסה">הכנסה</option>
                      <option value="קבוע">הוצאה קבועה</option>
                      <option value="משתנה">הוצאה משתנה</option>
                    </select>
                    <button
                      onClick={() => {
                        if (!newCatName.trim()) return;
                        const cat = newCatName.trim();
                        saveSummaryAvg(cat, "0").then(() => {
                          if (newCatType !== (catTypes[cat] || "משתנה")) saveTypeOvr({ ...catTypeOvr, [cat]: newCatType });
                          setHighlightCat(cat);
                          setTimeout(() => {
                            const el = document.getElementById(`brow-${cat}`);
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                          }, 100);
                          setTimeout(() => setHighlightCat(null), 2500);
                        });
                        setNewCatName(""); setShowAddForm(false);
                      }}
                      style={{ padding: "5px 14px", fontSize: 13, borderRadius: 6, background: "var(--green-mid)", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}
                    >הוסף</button>
                    <button onClick={() => setShowAddForm(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-dim)", lineHeight: 1 }}>✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddForm(true)}
                    style={{ padding: "6px 14px", fontSize: 13, borderRadius: 8, background: "var(--green-pale)", color: "var(--green-deep)", border: "1px solid rgba(46,204,138,0.3)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> הוספת קטגוריה
                  </button>
                )}
              </div>

              <Card style={{ marginBottom: 20, padding: 0, overflow: "hidden", background: "var(--surface)" }}>
                <div style={{ overflowX: "auto", borderRadius: 14 }}>
                  <table style={{
                    borderCollapse: "separate", borderSpacing: "6px 0",
                    fontSize: 14, direction: "rtl",
                    width: "100%", tableLayout: "fixed",
                    fontFamily: "'Rubik', sans-serif",
                    background: "var(--surface)",
                  }}>
                    <colgroup>
                      <col style={{ width: 190 }} />
                      {tableMonths.map(mk => <col key={mk} style={{ width: 140 }} />)}
                      {Array.from({ length: empty }).map((_, i) => <col key={`ph-col-${i}`} style={{ width: 140 }} />)}
                      <col style={{ width: 140 }} />
                      {/* Notes column — takes remaining space */}
                      <col />
                    </colgroup>
                    <thead>
                      <tr style={{ background: "transparent" }}>
                        <th style={{
                          position: "sticky", right: 0, zIndex: 5,
                          background: "var(--green-mid)", color: "#fff",
                          padding: "16px 22px", fontSize: 15, fontWeight: 700,
                          textAlign: "right", whiteSpace: "nowrap",
                          boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                          borderRadius: "14px 0 0 0",
                          height: 64, verticalAlign: "bottom",
                        }}>קטגוריה</th>
                        {tableMonths.map(mk => (
                          <th key={mk} style={{
                            padding: "12px 14px 8px", fontSize: 14, fontWeight: 600,
                            color: "var(--text-dim)", textAlign: "center",
                            background: "#f8f9f7",
                            borderRadius: "12px 12px 0 0",
                            border: "1px solid rgba(45,106,79,0.14)", borderBottom: "none",
                            height: 64, verticalAlign: "bottom",
                          }}>
                            <div style={{ whiteSpace: "nowrap" }}>{mkLabel(mk)}</div>
                            {colBankNotes[mk] && (
                              <div style={{
                                fontSize: 10, fontWeight: 500, marginTop: 4,
                                color: columnBankMonth[mk] === "avg" ? "#b45309" : "#1a759f",
                                whiteSpace: "normal", lineHeight: 1.3,
                              }}>
                                {colBankNotes[mk]}
                              </div>
                            )}
                          </th>
                        ))}
                        {Array.from({ length: empty }).map((_, i) => (
                          <th key={`ph-${i}`} style={{
                            padding: "16px 14px", textAlign: "center",
                            background: "#f8f9f7", color: "var(--text-dim)", opacity: 0.4,
                            borderRadius: "12px 12px 0 0",
                            border: "1px solid rgba(45,106,79,0.14)", borderBottom: "none",
                            height: 64, verticalAlign: "bottom",
                          }}>—</th>
                        ))}
                        <th style={{
                          padding: "16px 14px", fontSize: 14, fontWeight: 700,
                          color: "var(--text-dim)", textAlign: "center",
                          background: "#f1f3f3", whiteSpace: "nowrap",
                          borderRadius: "12px 12px 0 0",
                          border: avgBorder, borderBottom: "none",
                          height: 64, verticalAlign: "bottom",
                        }}>ממוצע חודשי</th>
                        <th style={{
                          padding: "16px 18px", fontSize: 14, fontWeight: 700,
                          color: "var(--text-dim)", textAlign: "right",
                          background: "#f8f6f0", whiteSpace: "nowrap",
                          borderRadius: "12px 12px 0 0",
                          border: "1px solid rgba(180,160,120,0.2)", borderBottom: "none",
                          height: 64, verticalAlign: "bottom",
                        }}>הערות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SECS.map(sec => {
                        const secRows = grouped[sec.key];
                        const secAvgTotal = secRows.reduce((s, r) => s + r.effAvg, 0);
                        const accent = accentOf(sec.key);
                        return (
                          <React.Fragment key={sec.key}>
                            {/* Section header — drag target + ScenarioPlanTab style */}
                            <tr
                              onDragOver={e => { e.preventDefault(); setDragOverSec(sec.key); setDragOverCat(null); }}
                              onDrop={() => handleDropOnSec(sec.key)}
                              onDragLeave={() => setDragOverSec(null)}
                            >
                              <td style={{
                                position: "sticky", right: 0, zIndex: 2,
                                background: dragOverSec === sec.key ? "rgba(46,204,138,0.1)" : "#f1ead9",
                                color: "#3a2f1f",
                                padding: "14px 22px 10px",
                                fontSize: 15, fontWeight: 700,
                                boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                                whiteSpace: "nowrap",
                              }}>
                                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, zIndex: 3 }} />
                                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "99px", background: accent, marginLeft: 10, verticalAlign: "middle" }} />
                                {sec.label}
                              </td>
                              {tableMonths.map(mk => (
                                <td key={mk} style={{ position: "relative", background: "#f8f9f7", padding: "14px 22px 10px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#9aada4", borderLeft: colBorder, borderRight: colBorder }}>
                                  <div style={{ position: "absolute", top: 0, left: -6, right: 0, height: 3, background: accent, zIndex: 1 }} />
                                  {sec.label}
                                </td>
                              ))}
                              {Array.from({ length: empty }).map((_, i) => (
                                <td key={`ph-sec-${i}`} style={{ position: "relative", background: "#f8f9f7", borderLeft: colBorder, borderRight: colBorder }}>
                                  <div style={{ position: "absolute", top: 0, left: -6, right: 0, height: 3, background: accent, zIndex: 1 }} />
                                </td>
                              ))}
                              <td style={{ position: "relative", background: "#f1f3f3", padding: "14px 22px 10px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#9aada4", borderLeft: avgBorder, borderRight: avgBorder }}>
                                <div style={{ position: "absolute", top: 0, left: -6, right: 0, height: 3, background: accent, zIndex: 1 }} />
                                {sec.label}
                              </td>
                              <td style={{ position: "relative", background: "#f8f6f0", borderLeft: "1px solid rgba(180,160,120,0.22)", borderRight: "1px solid rgba(180,160,120,0.22)", borderBottom: "1px solid rgba(180,160,120,0.22)" }}>
                                <div style={{ position: "absolute", top: 0, left: -6, right: 0, height: 3, background: accent, zIndex: 1 }} />
                              </td>
                            </tr>

                            {secRows.map(r => renderSummaryRow(r))}

                            {/* Section subtotal */}
                            {(() => {
                              const topLine = <div style={{ position: "absolute", top: -2, left: -6, right: 0, height: 2, background: "#b8bdb8", zIndex: 1 }} />;
                              return (
                                <tr>
                                  <td style={{
                                    position: "sticky", right: 0, zIndex: 3,
                                    background: "#f1ead9", color: "#3a2f1f",
                                    padding: "12px 22px", fontSize: 13, fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                                  }}>סה"כ {sec.label}</td>
                                  {tableMonths.map((_, mi) => (
                                    <td key={mi} style={{ position: "relative", padding: "12px 16px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" as const, fontSize: 14, color: "#5b6660", background: "#f1ead9", borderLeft: colBorder, borderRight: colBorder }}>
                                      {topLine}
                                      {fmt(secMonthTotal(secRows, mi))}
                                    </td>
                                  ))}
                                  {Array.from({ length: empty }).map((_, i) => (
                                    <td key={i} style={{ position: "relative", padding: "12px 16px", textAlign: "center", opacity: 0.3, fontSize: 13, background: "#f1ead9", borderLeft: colBorder, borderRight: colBorder }}>
                                      {topLine}₪0
                                    </td>
                                  ))}
                                  <td style={{ position: "relative", padding: "12px 16px", textAlign: "center", fontWeight: 700, fontSize: 14, borderLeft: avgBorder, borderRight: avgBorder, fontVariantNumeric: "tabular-nums" as const, color: "#5b6660", background: "#f1ead9" }}>
                                    {topLine}
                                    {fmt(secAvgTotal)}
                                  </td>
                                  <td style={{ position: "relative", background: "#f8f6f0", borderLeft: "1px solid rgba(180,160,120,0.22)", borderRight: "1px solid rgba(180,160,120,0.22)", borderBottom: "1px solid rgba(180,160,120,0.22)" }}>
                                    {topLine}
                                  </td>
                                </tr>
                              );
                            })()}
                          </React.Fragment>
                        );
                      })}

                      {/* Balance row */}
                      {(() => {
                        const monthBals = tableMonths.map((_, mi) => {
                          const inc = grouped["הכנסה"].reduce((s, r) => s + r.effVals[mi], 0);
                          const exp = [...grouped["קבוע"], ...grouped["משתנה"]].reduce((s, r) => s + r.effVals[mi], 0);
                          return inc - exp;
                        });
                        const balColor = (v: number) => v >= 0 ? "var(--green-mid)" : "var(--red)";
                        const fmtBal = (v: number) => {
                          const r = Math.round(v);
                          if (r === 0) return "₪0";
                          return `${r > 0 ? "+" : ""}₪${Math.abs(r).toLocaleString()}`;
                        };
                        const bottomBg = "#fdf3f1";
                        return (
                          <tr>
                            <td style={{
                              position: "sticky", right: 0, zIndex: 3,
                              background: bottomBg,
                              padding: "16px 22px", fontWeight: 700, fontSize: 14,
                              color: "var(--red)", whiteSpace: "nowrap",
                              letterSpacing: "0.1em", textAlign: "center",
                              textTransform: "uppercase" as const,
                              boxShadow: `${bottomBg} -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px`,
                            }}>
                              שורה תחתונה
                            </td>
                            {monthBals.map((bal, mi) => (
                              <td key={mi} style={{
                                padding: "16px 14px", textAlign: "center", fontWeight: 600, fontSize: 18,
                                fontVariantNumeric: "tabular-nums" as const, color: balColor(bal),
                                background: bottomBg,
                                borderTop: `2px solid ${balColor(bal)}33`,
                                borderLeft: colBorder, borderRight: colBorder,
                                borderRadius: "0 0 12px 12px",
                              }}>
                                {fmtBal(bal)}
                              </td>
                            ))}
                            {Array.from({ length: empty }).map((_, i) => (
                              <td key={i} style={{ padding: "16px 14px", textAlign: "center", color: "var(--text-dim)", background: bottomBg, borderRadius: "0 0 12px 12px", borderLeft: colBorder, borderRight: colBorder }}>₪0</td>
                            ))}
                            <td style={{
                              padding: "16px 14px", textAlign: "center",
                              fontWeight: 800, fontSize: 20,
                              borderTop: `2px solid ${balColor(balance)}33`,
                              borderLeft: avgBorder, borderRight: avgBorder,
                              fontVariantNumeric: "tabular-nums" as const,
                              color: balColor(balance),
                              background: bottomBg,
                              borderRadius: "0 0 12px 12px",
                            }}>
                              {fmtBal(balance)}
                            </td>
                            <td style={{ background: bottomBg, borderLeft: "1px solid rgba(180,160,120,0.22)", borderRight: "1px solid rgba(180,160,120,0.22)", borderTop: "1px solid rgba(180,160,120,0.22)", borderRadius: "0 0 12px 12px" }} />
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* ── Debug Panel ── */}
              <div style={{ marginTop: 10, marginBottom: 4 }}>
                <button
                  onClick={() => setShowDebug(v => !v)}
                  style={{
                    fontSize: 12, padding: "4px 12px", borderRadius: 6,
                    border: "1px solid rgba(0,0,0,0.13)",
                    background: showDebug ? "#dde3ec" : "var(--surface2)",
                    color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <span style={{ fontSize: 10 }}>{showDebug ? "▲" : "▼"}</span>
                  דיבאג — בסיס למאזן
                </button>
                {showDebug && (
                  <div style={{
                    marginTop: 8, padding: "14px 18px", borderRadius: 10,
                    background: "#1a2233", color: "#c8d8e8", fontFamily: "monospace",
                    fontSize: 12, lineHeight: 1.55, overflowX: "auto",
                    direction: "ltr",
                  }}>
                    {/* Column assignment */}
                    <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: 13, marginBottom: 8, direction: "rtl" }}>שיוך עמודות</div>
                    <table style={{ borderCollapse: "collapse", marginBottom: 18, width: "100%", direction: "rtl" }}>
                      <thead>
                        <tr style={{ color: "#94a3b8", borderBottom: "1px solid #2d3f55" }}>
                          <td style={{ padding: "3px 14px 3px 0" }}>עמודת אשראי</td>
                          <td style={{ padding: "3px 14px 3px 0" }}>עו&quot;ש משויך</td>
                          <td style={{ padding: "3px 0" }}>שיטה</td>
                        </tr>
                      </thead>
                      <tbody>
                        {tableMonths.map(mk => {
                          const assigned = columnBankMonth[mk];
                          let method: string;
                          let assignedLabel: string;
                          let methodColor: string;
                          if (fullBankMonths.length === 0) {
                            method = "אין עו\"ש"; assignedLabel = "—"; methodColor = "#64748b";
                          } else if (assigned === "avg") {
                            method = `ממוצע (${fullBankMonths.length} חודשים)`;
                            assignedLabel = `avg(${fullBankMonths.map(mkLabel).join(", ")})`;
                            methodColor = "#fcd34d";
                          } else if (assigned === mk) {
                            method = "ישיר"; assignedLabel = mkLabel(assigned as string); methodColor = "#34d399";
                          } else if (assigned) {
                            method = "nearest"; assignedLabel = mkLabel(assigned as string); methodColor = "#60a5fa";
                          } else {
                            method = "—"; assignedLabel = "—"; methodColor = "#64748b";
                          }
                          return (
                            <tr key={mk} style={{ borderBottom: "1px solid #1e293b" }}>
                              <td style={{ padding: "4px 14px 4px 0", color: "#e2e8f0" }}>{mkLabel(mk)}</td>
                              <td style={{ padding: "4px 14px 4px 0", color: "#86efac" }}>{assignedLabel}</td>
                              <td style={{ padding: "4px 0", color: methodColor }}>{method}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Per-column breakdown */}
                    {tableMonths.map(mk => {
                      const assigned = columnBankMonth[mk];
                      const bankForCol = bankByCol[mk] || {};
                      const allColCats = [...new Set([
                        ...Object.keys(creditRawSnapshot),
                        ...Object.keys(bankForCol),
                      ])].filter(cat => {
                        return ((creditRawSnapshot[cat] || {})[mk] || 0) > 0 || (bankForCol[cat] || 0) > 0;
                      }).sort((a, b) => {
                        const tot = (c: string) => ((creditRawSnapshot[c]||{})[mk]||0) + (bankForCol[c]||0);
                        return tot(b) - tot(a);
                      });

                      const assignedLabel = assigned === "avg"
                        ? `ממוצע (${fullBankMonths.map(mkLabel).join(", ")})`
                        : assigned ? mkLabel(assigned as string) : "—";

                      return (
                        <div key={mk} style={{ marginBottom: 18 }}>
                          <div style={{ color: "#7dd3fc", fontWeight: 700, marginBottom: 6, direction: "rtl" }}>
                            {mkLabel(mk)} ← {assignedLabel}
                          </div>
                          {allColCats.length === 0 ? (
                            <div style={{ color: "#475569" }}>אין נתונים</div>
                          ) : (
                            <table style={{ borderCollapse: "collapse", width: "100%", direction: "rtl" }}>
                              <thead>
                                <tr style={{ color: "#64748b", borderBottom: "1px solid #2d3f55" }}>
                                  <td style={{ padding: "2px 14px 2px 0" }}>קטגוריה</td>
                                  <td style={{ padding: "2px 14px 2px 0", textAlign: "right" }}>עו&quot;ש</td>
                                  <td style={{ padding: "2px 14px 2px 0", textAlign: "right" }}>אשראי</td>
                                  <td style={{ padding: "2px 0", textAlign: "right" }}>סה&quot;כ</td>
                                </tr>
                              </thead>
                              <tbody>
                                {allColCats.map(cat => {
                                  const bankAmt   = bankForCol[cat] || 0;
                                  const creditAmt = (creditRawSnapshot[cat] || {})[mk] || 0;
                                  const combined  = bankAmt + creditAmt;
                                  return (
                                    <tr key={cat} style={{ borderBottom: "1px solid #1e293b" }}>
                                      <td style={{ padding: "3px 14px 3px 0", color: "#e2e8f0" }}>{cat}</td>
                                      <td style={{ padding: "3px 14px 3px 0", textAlign: "right", color: bankAmt > 0 ? "#86efac" : "#334155" }}>
                                        {bankAmt > 0 ? `₪${Math.round(bankAmt).toLocaleString()}` : "—"}
                                      </td>
                                      <td style={{ padding: "3px 14px 3px 0", textAlign: "right", color: creditAmt > 0 ? "#60a5fa" : "#334155" }}>
                                        {creditAmt > 0 ? `₪${Math.round(creditAmt).toLocaleString()}` : "—"}
                                      </td>
                                      <td style={{ padding: "3px 0", textAlign: "right", color: "#f1f5f9", fontWeight: 600 }}>
                                        ₪{Math.round(combined).toLocaleString()}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}

                    {/* Bank range summary */}
                    <div style={{ marginTop: 4, color: "#475569", fontSize: 11, direction: "rtl" }}>
                      חודשי עו&quot;ש מלאים: {fullBankMonths.length > 0 ? fullBankMonths.map(mkLabel).join(", ") : "אין"}
                      {" · "}טווח: {minBankDate || "—"} עד {maxBankDate || "—"}
                    </div>
                  </div>
                )}
              </div>

              </div>

              {/* Left panel — removed + missing categories */}
              <div style={{ width: 196, flexShrink: 0, position: "sticky", top: 16, alignSelf: "flex-start" }}>

                {/* Removed categories — compact, above "להוספה" */}
                {removedRows.length > 0 && (
                  <Card style={{ marginBottom: 8, padding: 0, overflow: "hidden", background: "var(--surface)" }}>
                    <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
                      הוסרו ({removedRows.length})
                    </div>
                    <div style={{ maxHeight: 200, overflowY: "auto" }}>
                      {removedRows.map(r => (
                        <div key={r.cat} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                          <span style={{ fontSize: 12, color: "var(--text)", fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cat}</span>
                          <button
                            onClick={() => { const s = new Set(hiddenCats); s.delete(r.cat); saveHidden(s); }}
                            style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: "var(--green-pale)", color: "var(--green-deep)", border: "1px solid rgba(46,204,138,0.3)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, flexShrink: 0 }}
                          >שחזר</button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Missing categories panel */}
                <Card style={{ padding: 0, overflow: "hidden", background: "var(--surface)" }}>
                  <div style={{ padding: "11px 14px", fontWeight: 700, fontSize: 13, borderBottom: "1px solid var(--border)", color: "var(--text-dim)", letterSpacing: "0.04em" }}>
                    קטגוריות להוספה
                  </div>
                  <div style={{ maxHeight: 520, overflowY: "auto" }}>
                    {SECS.map(sec => {
                      const cats = missingBySec[sec.key];
                      if (cats.length === 0) return null;
                      return (
                        <div key={sec.key}>
                          <div style={{ padding: "7px 14px 4px", fontSize: 11, fontWeight: 700, color: sec.color, letterSpacing: "0.06em", textTransform: "uppercase" as const, background: "var(--surface2)" }}>
                            {SEC_LABELS[sec.key]}
                          </div>
                          {cats.map(cat => (
                            <div
                              key={cat}
                              onClick={() => addCat(cat)}
                              title={`הוסף "${cat}" לטבלה`}
                              style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.04)", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background 0.1s" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "var(--green-pale)")}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              <span style={{ color: "var(--text)", fontWeight: 500 }}>{cat}</span>
                              <span style={{ fontSize: 16, color: "var(--green-mid)", fontWeight: 700, lineHeight: 1 }}>+</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {Object.values(missingBySec).every(a => a.length === 0) && (
                      <div style={{ padding: "20px 14px", fontSize: 12, color: "var(--text-dim)", textAlign: "center" }}>
                        כל הקטגוריות כבר בטבלה
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              </div>
            );
          })()}
          {view === "balance" && allTxs.length === 0 && (
            <Card style={{ textAlign: "center", padding: 56, color: "var(--text-dim)" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.15 }}>—</div>
              אין תנועות עדיין
            </Card>
          )}

          {/* ══ Bank transactions sub-tab ══ */}
          {view === "txs" && txsView === "bank" && (() => {
            if (bankSubs.length === 0) return (
              <Card style={{ textAlign: "center", padding: 56, color: "var(--text-dim)" }}>
                <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.15 }}>—</div>
                אין תנועות עו"ש עדיין
              </Card>
            );

            const bankActive = (t: any) => t.cat !== "להתעלם" && t.flow_type !== "credit_transfer";
            // Bank PDFs store amounts as absolute values — income is identified by category, not sign
            const isBankIncome = (t: any) => t.cat === "הכנסות" || t.maxCat === "הכנסות";
            const accountNums = [...new Set(bankSubs.map((s: any) => s.account_index || 1))].sort() as number[];
            const allBankTxs = bankSubs.flatMap((s: any) => {
              const acct = s.account_index || 1;
              return (s.transactions || []).map((t: any) => ({ ...t, _acct: acct }));
            });
            const activeTxs = allBankTxs.filter(bankActive);

            // Month filter helper — applied consistently to all bank tables
            const applyBankMonthFilter = (t: any) => {
              if (selBankMonth === "all") return true;
              const mk = t.date ? t.date.replace(/(\d{2})\/(\d{2})\/(\d{2,4})/, (_: any, d: string, m: string, y: string) => `20${y.length === 2 ? y : y.slice(2)}-${m}`) : "";
              return mk.startsWith(selBankMonth);
            };
            const monthFilteredActive = activeTxs.filter(applyBankMonthFilter);

            // Account labels from bank_label field
            const acctLabels: Record<number, string> = {};
            bankSubs.forEach((s: any) => {
              const idx = s.account_index || 1;
              if (!acctLabels[idx] && s.bank_label) acctLabels[idx] = s.bank_label;
            });

            // Apply account filter on top of month filter
            const filteredActive = selBankAcct === "all"
              ? monthFilteredActive
              : monthFilteredActive.filter((t: any) => t._acct === selBankAcct);

            // Category totals — built from account+month-filtered active txs so sidebar matches filter
            const bankCatData: Record<string, { income: number; expense: number }> = {};
            filteredActive.forEach(t => {
              const c = t.cat || "אחר";
              const amt = Number(t.amount || 0);
              if (!bankCatData[c]) bankCatData[c] = { income: 0, expense: 0 };
              if (isBankIncome(t)) bankCatData[c].income += amt;
              else bankCatData[c].expense += amt;
            });
            const totalIncome  = filteredActive.filter(t => isBankIncome(t)).reduce((s,t) => s + Number(t.amount||0), 0);
            const totalExpense = filteredActive.filter(t => !isBankIncome(t)).reduce((s,t) => s + Number(t.amount||0), 0);
            const netBalance   = totalIncome - totalExpense;
            const bankTotalAmt = totalIncome + totalExpense;
            const bankCatEntries = Object.entries(bankCatData)
              .map(([cat, v]) => ({ cat, income: v.income, expense: v.expense, total: v.income + v.expense }))
              .sort((a, b) => b.total - a.total);
            const allBankCatNames = bankCatEntries.map(e => e.cat);

            // Split into income / fixed expense / variable expense
            const incomeCatEntries  = bankCatEntries.filter(e => e.income > 0 && e.expense === 0);
            const expenseCatEntries = bankCatEntries.filter(e => e.expense > 0 && e.income === 0);
            // Categories appearing in 2+ months = fixed (uses all accounts so "fixed" is stable)
            const catMonthSet: Record<string, Set<string>> = {};
            allBankTxs.filter(t => bankActive(t) && !isBankIncome(t)).forEach(t => {
              const c = t.cat || "אחר";
              if (!catMonthSet[c]) catMonthSet[c] = new Set();
              const mk = t.date ? t.date.replace(/(\d{2})\/(\d{2})\/(\d{2,4})/, (_: any, d: string, m: string, y: string) => `20${y.length === 2 ? y : y.slice(2)}-${m}`) : "?";
              catMonthSet[c].add(mk);
            });
            const fixedExpCats    = expenseCatEntries.filter(e => (catMonthSet[e.cat]?.size || 0) >= 2);
            const variableExpCats = expenseCatEntries.filter(e => (catMonthSet[e.cat]?.size || 0) < 2);

            const bankMonths = [...new Set(bankSubs.map((s: any) => s.month_key))].sort().reverse();
            const visibleBankTxs = filteredActive.filter(t => {
              if (selBankCat && (t.cat || "אחר") !== selBankCat) return false;
              if (bankSearch && !(t.name || "").toLowerCase().includes(bankSearch.toLowerCase())) return false;
              return true;
            });
            const visibleIncome  = visibleBankTxs.filter(t => isBankIncome(t)).reduce((s,t) => s + Number(t.amount||0), 0);
            const visibleExpense = visibleBankTxs.filter(t => !isBankIncome(t)).reduce((s,t) => s + Number(t.amount||0), 0);

            // Unique file paths per account (deduplicated — same file saved per month row)
            const acctFilePaths = accountNums.map(acct => {
              const acctSubs = bankSubs.filter((s: any) => (s.account_index || 1) === acct);
              const seen = new Set<string>();
              const paths: string[] = [];
              acctSubs.forEach((sub: any) => {
                (sub.files || []).filter((f: string) => f.includes("/")).forEach((f: string) => {
                  if (!seen.has(f)) { seen.add(f); paths.push(f); }
                });
              });
              return { acct, paths };
            }).filter(a => a.paths.length > 0);

            const creditTransferTxs = allBankTxs.filter((t: any) => t.flow_type === "credit_transfer" && applyBankMonthFilter(t) && (selBankAcct === "all" || t._acct === selBankAcct));
            const ignoredBankTxs    = allBankTxs.filter((t: any) => t.cat === "להתעלם" && applyBankMonthFilter(t) && (selBankAcct === "all" || t._acct === selBankAcct));

            return (
              <div>
              {/* ── Bank filter toolbar ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {/* שורה 1: חודשים + חיפוש + סטטיסטיקה */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {["all", ...bankMonths].map(mk => {
                    const label = mk === "all" ? "כל החודשים" : mkLabel(mk);
                    const isActive = selBankMonth === mk;
                    return (
                      <button key={mk}
                        onClick={() => setSelBankMonth(mk)}
                        style={{
                          padding: "5px 13px", fontSize: 13, fontFamily: "inherit", borderRadius: 20,
                          border: `1px solid ${isActive ? "var(--green-mid)" : "var(--border)"}`,
                          background: isActive ? "var(--green-pale)" : "var(--surface2)",
                          color: isActive ? "var(--green-deep)" : "var(--text-mid)",
                          fontWeight: isActive ? 700 : 400, cursor: "pointer",
                        }}>
                        {label}
                      </button>
                    );
                  })}
                  <input
                    type="text" value={bankSearch} onChange={e => setBankSearch(e.target.value)}
                    placeholder="חיפוש שם עסק..."
                    style={{
                      padding: "6px 12px", fontSize: 13, borderRadius: 8,
                      border: "1px solid var(--border)", background: "var(--surface2)",
                      color: "var(--text)", fontFamily: "inherit", outline: "none",
                      direction: "rtl", minWidth: 160,
                    }}
                  />
                  <div style={{ display: "flex", gap: 10, marginRight: "auto", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{visibleBankTxs.length} תנועות</span>
                    <span style={{ fontSize: 13, color: "var(--green-mid)", fontWeight: 600 }}>הכנסות ₪{Math.round(visibleIncome).toLocaleString()}</span>
                    <span style={{ fontSize: 13, color: "var(--red)", fontWeight: 600 }}>הוצאות ₪{Math.round(visibleExpense).toLocaleString()}</span>
                    <Btn size="sm" variant="secondary" onClick={() => exportExcel(
                      visibleBankTxs.map(t => ({ ...t, srcLabel: `חשבון ${t._acct}` })) as any,
                      `עו"ש_${client.name}.xlsx`
                    )}>
                      <IcoDown /> Excel
                    </Btn>
                  </div>
                </div>
                {/* שורה 2: חשבונות — רק אם יש יותר מאחד */}
                {accountNums.length > 1 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {(["all", ...accountNums] as (number | "all")[]).map(acct => {
                      const label = acct === "all" ? "כל החשבונות" : (acctLabels[acct] || `חשבון ${acct}`);
                      const isActive = selBankAcct === acct;
                      return (
                        <button key={acct}
                          onClick={() => setSelBankAcct(acct)}
                          style={{
                            padding: "5px 13px", fontSize: 13, fontFamily: "inherit", borderRadius: 20,
                            border: `1px solid ${isActive ? "var(--green-mid)" : "var(--border)"}`,
                            background: isActive ? "var(--green-pale)" : "var(--surface2)",
                            color: isActive ? "var(--green-deep)" : "var(--text-mid)",
                            fontWeight: isActive ? 700 : 400, cursor: "pointer",
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Notes panel — bank (filtered by selected month) */}
              {bankNoteRows.length > 0 && (() => {
                const visibleBankNoteRows = selBankMonth === "all" ? bankNoteRows : bankNoteRows.filter(r => {
                  const dateStr = (r.sub || "").split(" · ")[0];
                  const mk = dateStr.replace(/(\d{2})\/(\d{2})\/(\d{2,4})/, (_: any, d: string, m: string, y: string) => `20${y.length === 2 ? y : y.slice(2)}-${m}`);
                  return mk.startsWith(selBankMonth);
                });
                return (
                  <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden", border: "1.5px solid rgba(255,193,7,0.35)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: "rgba(255,193,7,0.07)", borderBottom: "1px solid rgba(255,193,7,0.2)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span style={{ fontWeight: 700, fontSize: 13, color: "var(--gold)" }}>הערות הלקוח — עו"ש ({visibleBankNoteRows.length})</span>
                    </div>
                    {visibleBankNoteRows.length === 0 ? (
                      <div style={{ padding: "16px 20px", fontSize: 13, color: "var(--text-dim)", textAlign: "center", fontStyle: "italic" }}>לא הוזנו הערות בטווח זמן זה</div>
                    ) : (
                      <div style={{ overflowY: visibleBankNoteRows.length > 3 ? "auto" : "visible", maxHeight: visibleBankNoteRows.length > 3 ? 148 : "none" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: "var(--surface2)" }}>
                              <th style={{ padding: "6px 14px", fontWeight: 600, color: "var(--text-dim)", textAlign: "right", width: 155, borderBottom: "1px solid var(--border)" }}>תנועה</th>
                              <th style={{ padding: "6px 14px", fontWeight: 600, color: "var(--text-dim)", textAlign: "right", borderBottom: "1px solid var(--border)" }}>הערה</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleBankNoteRows.map((r, i) => (
                              <tr key={i} style={{ borderBottom: i < visibleBankNoteRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                                <td style={{ padding: "7px 14px", verticalAlign: "top" }}>
                                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.label}</div>
                                  {r.sub && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>{r.sub}</div>}
                                </td>
                                <td style={{ padding: "7px 14px", verticalAlign: "top", color: "var(--text)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{r.text}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                );
              })()}
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

                {/* LEFT: Category sidebar */}
                <div style={{ width: 240, flexShrink: 0 }}>
                  <Card style={{ padding: 0, overflow: "hidden", position: "sticky", top: 16 }}>
                    {/* Sidebar header — net + income/expense breakdown */}
                    <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 10, fontSize: 12, flexWrap: "wrap" }}>
                        <span style={{ color: "var(--green-mid)", fontWeight: 700 }}>הכנסות ₪{Math.round(totalIncome).toLocaleString()}</span>
                        <span style={{ color: "var(--text-dim)", opacity: 0.4 }}>|</span>
                        <span style={{ color: "var(--red)", fontWeight: 700 }}>הוצאות ₪{Math.round(totalExpense).toLocaleString()}</span>
                      </div>
                    </div>
                    {selBankCat && (
                      <div
                        onClick={() => setSelBankCat(null)}
                        style={{ padding: "6px 14px", fontSize: 12, color: "var(--green-mid)", cursor: "pointer", borderBottom: "1px solid var(--border)", background: "var(--green-pale)" }}
                      >
                        ✕ נקה סינון
                      </div>
                    )}
                    <div style={{ maxHeight: 540, overflowY: "auto" }}>
                      {(() => {
                        const renderCatRow = ({ cat, income, expense, total }: { cat: string; income: number; expense: number; total: number }) => {
                          const pct = bankTotalAmt > 0 ? (total / bankTotalAmt) * 100 : 0;
                          const isSel = selBankCat === cat;
                          const isInc = income > 0 && expense === 0;
                          const isExp = expense > 0 && income === 0;
                          const net = income - expense;
                          const amtColor = isInc ? "var(--green-mid)" : isExp ? "var(--red)" : net >= 0 ? "var(--green-mid)" : "var(--red)";
                          const barColor = isInc ? "var(--green-mid)" : isExp ? "var(--red)" : "var(--text-dim)";
                          const amtDisplay = isInc ? `+₪${Math.round(income).toLocaleString()}` : isExp ? `₪${Math.round(expense).toLocaleString()}` : `${net >= 0 ? "+" : "−"}₪${Math.round(Math.abs(net)).toLocaleString()}`;
                          return (
                            <div key={cat} onClick={() => setSelBankCat(isSel ? null : cat)}
                              style={{ padding: "9px 14px", cursor: "pointer", borderBottom: "1px solid rgba(0,0,0,0.04)", background: isSel ? "var(--green-pale)" : "transparent", transition: "background 0.1s" }}
                              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
                              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "baseline" }}>
                                <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: isSel ? "var(--green-deep)" : "var(--text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: amtColor, flexShrink: 0 }}>{amtDisplay}</span>
                              </div>
                              <div style={{ height: 3, borderRadius: 3, background: "rgba(0,0,0,0.07)", overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${pct}%`, background: isSel ? amtColor : barColor, borderRadius: 3, transition: "width 0.35s", opacity: isSel ? 1 : 0.7 }} />
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{Math.round(pct)}%</div>
                            </div>
                          );
                        };
                        const sectionHeader = (label: string, color: string) => (
                          <div style={{ padding: "5px 14px 4px", fontSize: 11, fontWeight: 700, color, background: "var(--surface2)", borderBottom: "1px solid var(--border)", letterSpacing: "0.05em" }}>
                            {label}
                          </div>
                        );
                        return (
                          <>
                            {incomeCatEntries.length > 0 && <>{sectionHeader("הכנסות", "var(--green-mid)")}{incomeCatEntries.map(renderCatRow)}</>}
                            {fixedExpCats.length > 0 && <>{sectionHeader("הוצאות קבועות", "var(--text-dim)")}{fixedExpCats.map(renderCatRow)}</>}
                            {variableExpCats.length > 0 && <>{sectionHeader("הוצאות משתנות", "var(--text-dim)")}{variableExpCats.map(renderCatRow)}</>}
                          </>
                        );
                      })()}
                    </div>
                    {/* Net balance footer */}
                    <div style={{ padding: "10px 16px", borderTop: "2px solid var(--border)", background: "var(--surface2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>הכנסות − הוצאות</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: netBalance >= 0 ? "var(--green-mid)" : "var(--red)" }}>
                        {netBalance >= 0 ? "+" : "−"}₪{Math.round(Math.abs(netBalance)).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                </div>

                {/* RIGHT: Transaction table + file downloads */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Card style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ maxHeight: 620, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, direction: "rtl" }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                          <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                            <th style={TH}>תאריך</th>
                            <th style={{ ...TH, textAlign: "right", width: "35%" }}>שם</th>
                            <th style={{ ...TH, textAlign: "right" }}>קטגוריה</th>
                            <th style={{ ...TH, textAlign: "left" }}>סכום</th>
                            <th style={{ ...TH, textAlign: "right" }}>חשבון</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleBankTxs.length === 0 ? (
                            <tr>
                              <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
                                אין תנועות תואמות לסינון
                              </td>
                            </tr>
                          ) : visibleBankTxs.map((t: any, i: number) => {
                            const amt = Number(t.amount || 0);
                            const color = catColor(t.cat || "אחר", allBankCatNames);
                            return (
                              <tr
                                key={i}
                                style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", transition: "background 0.08s" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.018)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                              >
                                <td style={{ padding: "7px 12px", color: "var(--text-dim)", whiteSpace: "nowrap", fontSize: 12 }}>{t.date || ""}</td>
                                <td style={{ padding: "7px 12px", fontWeight: 500, maxWidth: 220 }}>
                                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || ""}</div>
                                  {t.note && <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.note}</div>}
                                </td>
                                <td style={{ padding: "7px 12px" }}>
                                  {t.cat ? (
                                    <span style={{
                                      fontSize: 11, padding: "2px 9px", borderRadius: 12,
                                      background: `${color}18`, color, border: `1px solid ${color}44`,
                                      display: "inline-block", fontWeight: 600, whiteSpace: "nowrap",
                                    }}>{t.cat}</span>
                                  ) : <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>}
                                </td>
                                <td style={{ padding: "7px 12px", fontWeight: 700, color: amt >= 0 ? "var(--green-mid)" : "var(--red)", textAlign: "left", whiteSpace: "nowrap" }}>
                                  {amt >= 0 ? "+" : ""}₪{Math.round(Math.abs(amt)).toLocaleString()}
                                </td>
                                <td style={{ padding: "7px 12px", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                                  חשבון {t._acct}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Total row — outside scroll, always visible */}
                    <div style={{ padding: "8px 14px", borderTop: "2px solid var(--border)", background: "var(--surface2)", display: "flex", gap: 18, alignItems: "center", direction: "rtl" }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text-dim)" }}>סה"כ ({visibleBankTxs.length} תנועות)</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--green-mid)" }}>הכנסות ₪{Math.round(visibleIncome).toLocaleString()}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--red)" }}>הוצאות ₪{Math.round(visibleExpense).toLocaleString()}</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: (visibleIncome - visibleExpense) >= 0 ? "var(--green-mid)" : "var(--red)", marginRight: "auto" }}>
                        נטו {(visibleIncome - visibleExpense) >= 0 ? "+" : "−"}₪{Math.round(Math.abs(visibleIncome - visibleExpense)).toLocaleString()}
                      </span>
                    </div>
                  </Card>

                </div>
              </div>

              {/* Credit transfers — כלול בכרטיס */}
              {creditTransferTxs.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-mid)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-mid)" }}>
                      חיובי אשראי — כלול בכרטיס ({creditTransferTxs.length})
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)" }}>תנועות אלו אינן נספרות כהוצאה (ימנע כפילות עם נתוני כרטיס האשראי)</span>
                  </div>
                  <Card style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ maxHeight: 320, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, direction: "rtl" }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                          <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                            <th style={TH}>תאריך</th>
                            <th style={{ ...TH, textAlign: "right", width: "40%" }}>שם</th>
                            <th style={{ ...TH, textAlign: "left" }}>סכום</th>
                            <th style={{ ...TH, textAlign: "right" }}>חשבון</th>
                          </tr>
                        </thead>
                        <tbody>
                          {creditTransferTxs.map((t: any, i: number) => {
                            const amt = Number(t.amount || 0);
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.018)"; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                                <td style={{ padding: "6px 12px", color: "var(--text-dim)", whiteSpace: "nowrap", fontSize: 12 }}>{t.date || ""}</td>
                                <td style={{ padding: "6px 12px", fontWeight: 500, maxWidth: 260 }}>
                                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name || ""}</div>
                                  {t.note && <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", marginTop: 2 }}>{t.note}</div>}
                                </td>
                                <td style={{ padding: "6px 12px", fontWeight: 700, color: "var(--text-mid)", textAlign: "left", whiteSpace: "nowrap" }}>
                                  ₪{Math.round(Math.abs(amt)).toLocaleString()}
                                </td>
                                <td style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                                  חשבון {t._acct}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Total row — outside scroll */}
                    <div style={{ padding: "8px 14px", borderTop: "2px solid var(--border)", background: "var(--surface2)", display: "flex", gap: 14, alignItems: "center", direction: "rtl" }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text-dim)" }}>סה"כ ({creditTransferTxs.length} תנועות)</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text-mid)" }}>
                        ₪{Math.round(creditTransferTxs.reduce((s: number, t: any) => s + Number(t.amount || 0), 0)).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                </div>
              )}

              {/* Ignored transactions — להתעלם */}
              {ignoredBankTxs.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                    </svg>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-dim)" }}>
                      תנועות מוסתרות — להתעלם ({ignoredBankTxs.length})
                    </span>
                    <span style={{ fontSize: 12, color: "var(--text-dim)", opacity: 0.7 }}>לא נספרות בחישוב ולא ב"כלול בכרטיס"</span>
                  </div>
                  <Card style={{ padding: 0, overflow: "hidden", opacity: 0.8 }}>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, direction: "rtl" }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                          <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                            <th style={TH}>תאריך</th>
                            <th style={{ ...TH, textAlign: "right", width: "40%" }}>שם</th>
                            <th style={{ ...TH, textAlign: "right" }}>קטגוריה</th>
                            <th style={{ ...TH, textAlign: "left" }}>סכום</th>
                            <th style={{ ...TH, textAlign: "right" }}>חשבון</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ignoredBankTxs.map((t: any, i: number) => {
                            const amt = Number(t.amount || 0);
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", opacity: 0.7 }}>
                                <td style={{ padding: "6px 12px", color: "var(--text-dim)", whiteSpace: "nowrap", fontSize: 12 }}>{t.date || ""}</td>
                                <td style={{ padding: "6px 12px", maxWidth: 260 }}>
                                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: "line-through", color: "var(--text-dim)" }}>{t.name || ""}</div>
                                  {t.note && <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", marginTop: 2 }}>{t.note}</div>}
                                </td>
                                <td style={{ padding: "6px 12px" }}>
                                  <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: "rgba(0,0,0,0.06)", color: "var(--text-dim)", fontWeight: 600 }}>להתעלם</span>
                                </td>
                                <td style={{ padding: "6px 12px", color: "var(--text-dim)", textAlign: "left", whiteSpace: "nowrap", textDecoration: "line-through" }}>
                                  ₪{Math.round(Math.abs(amt)).toLocaleString()}
                                </td>
                                <td style={{ padding: "6px 12px", fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                                  חשבון {t._acct}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {/* Total row — outside scroll */}
                    <div style={{ padding: "8px 14px", borderTop: "2px solid var(--border)", background: "var(--surface2)", display: "flex", gap: 14, alignItems: "center", direction: "rtl", opacity: 0.75 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text-dim)" }}>סה"כ ({ignoredBankTxs.length} תנועות)</span>
                      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--text-dim)", textDecoration: "line-through" }}>
                        ₪{Math.round(ignoredBankTxs.reduce((s: number, t: any) => s + Number(t.amount || 0), 0)).toLocaleString()}
                      </span>
                    </div>
                  </Card>
                </div>
              )}
              </div>
            );
          })()}

          {view === "txs" && txsView === "credit" && (allTxs.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 56, color: "var(--text-dim)" }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.15 }}>—</div>
              אין תנועות עדיין
            </Card>
          ) : (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

              {/* LEFT: Category summary */}
              <div style={{ width: 240, flexShrink: 0 }}>
                <Card style={{ padding: 0, overflow: "hidden", position: "sticky", top: 16 }}>
                  <div style={{
                    padding: "12px 16px", fontWeight: 700, fontSize: 13,
                    borderBottom: "1px solid var(--border)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    color: "var(--text-dim)", letterSpacing: "0.04em",
                  }}>
                    <span>קטגוריות</span>
                    <span style={{ fontWeight: 600, color: "var(--text-mid)", fontSize: 13 }}>
                      ₪{Math.round(totalAmt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ maxHeight: 560, overflowY: "auto" }}>
                    {catEntries.map(([cat, total]) => {
                      const pct = totalAmt > 0 ? (total / totalAmt) * 100 : 0;
                      const isSel = selCat === cat;
                      const color = catColor(cat, allCatsSorted);
                      return (
                        <div
                          key={cat}
                          onClick={() => setSelCat(isSel ? null : cat)}
                          style={{
                            padding: "9px 14px", cursor: "pointer",
                            borderBottom: "1px solid rgba(0,0,0,0.04)",
                            background: isSel ? "var(--green-pale)" : "transparent",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
                          onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "baseline" }}>
                            <span style={{
                              fontSize: 13, fontWeight: isSel ? 700 : 500,
                              color: isSel ? "var(--green-deep)" : "var(--text)",
                              maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{cat}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-mid)", flexShrink: 0 }}>
                              ₪{Math.round(total).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ height: 3, borderRadius: 3, background: "rgba(0,0,0,0.07)", overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${pct}%`,
                              background: isSel ? "var(--green-mid)" : color,
                              borderRadius: 3, transition: "width 0.35s",
                              opacity: isSel ? 1 : 0.7,
                            }} />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{Math.round(pct)}%</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* RIGHT: Transaction table */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{ maxHeight: 620, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, direction: "rtl" }}>
                      <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                        <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                          <th style={TH}>תאריך</th>
                          <th style={{ ...TH, textAlign: "right", width: "35%" }}>שם עסק</th>
                          <th style={{ ...TH, textAlign: "right" }}>קטגוריה</th>
                          <th style={{ ...TH, textAlign: "left" }}>סכום</th>
                          <th style={{ ...TH, textAlign: "right" }}>מקור</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTxs.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
                              אין תנועות תואמות לסינון
                            </td>
                          </tr>
                        ) : (() => {
                          const elecBillsCheck = ((clientIntake as any)?.electricity_bills || []);
                          const hasElecBillsCheck = elecBillsCheck.reduce((s: number, b: any) => s + (b.months || 0), 0) > 0;
                          return visibleTxs.map(tx => {
                          const isEditing = editUid === tx._uid;
                          const color = catColor(tx.cat, allCatsSorted);
                          const isElecExcluded = tx.cat === "חשמל" && hasElecBillsCheck;
                          return (
                            <tr
                              key={tx._uid}
                              style={{ borderBottom: "1px solid rgba(0,0,0,0.04)", transition: "background 0.08s" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.018)"; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                            >
                              <td style={{ padding: "7px 12px", color: "var(--text-dim)", whiteSpace: "nowrap", fontSize: 12 }}>{tx.date}</td>
                              <td style={{ padding: "7px 12px", fontWeight: 500, maxWidth: 220 }}>
                                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.name}</div>
                                {tx.note && <div style={{ fontSize: 11, color: "var(--text-dim)", fontStyle: "italic", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.note}</div>}
                              </td>
                              <td style={{ padding: "7px 12px" }}>
                                {isEditing ? (
                                  <select
                                    autoFocus value={editCat}
                                    onChange={e => setEditCat(e.target.value)}
                                    onBlur={() => { if (editCat !== tx.cat) updateCat(tx, editCat); else setEditUid(null); }}
                                    onKeyDown={e => { if (e.key === "Escape") setEditUid(null); if (e.key === "Enter") updateCat(tx, editCat); }}
                                    style={{
                                      fontSize: 12, padding: "3px 7px", borderRadius: 6,
                                      border: "1.5px solid var(--green-mid)", background: "var(--surface)",
                                      color: "var(--text)", fontFamily: "inherit", direction: "rtl",
                                      outline: "none", maxWidth: 160,
                                    }}
                                  >
                                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                ) : (
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <span
                                      onClick={() => { setEditUid(tx._uid); setEditCat(tx.cat); }}
                                      title="לחץ לשינוי קטגוריה"
                                      style={{
                                        fontSize: 11, padding: "2px 9px", borderRadius: 12,
                                        background: `${color}18`, color, border: `1px solid ${color}44`,
                                        cursor: "pointer", display: "inline-block", fontWeight: 600,
                                        whiteSpace: "nowrap",
                                      }}
                                    >{tx.cat}</span>
                                    {isElecExcluded && (
                                      <span title="מוחרגת מבסיס למאזן — נכללת בממוצע חשבונות חשמל" style={{ fontSize: 10, color: "var(--text-dim)", cursor: "help" }}>⚡</span>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "7px 12px", fontWeight: 700, color: "var(--red)", textAlign: "left", whiteSpace: "nowrap" }}>
                                ₪{Math.round(Math.abs(tx.amount)).toLocaleString()}
                              </td>
                              <td style={{ padding: "7px 12px", fontSize: 11, color: "var(--text-dim)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {tx.srcLabel}
                              </td>
                            </tr>
                          );
                        });})()}
                      </tbody>
                    </table>
                  </div>
                  {/* Total row — outside scroll */}
                  <div style={{ padding: "8px 14px", borderTop: "2px solid var(--border)", background: "var(--surface2)", display: "flex", gap: 14, alignItems: "center", direction: "rtl" }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "var(--text-dim)" }}>סה"כ ({visibleTxs.length} תנועות)</span>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "var(--red)" }}>₪{Math.round(totalVisible).toLocaleString()}</span>
                  </div>
                </Card>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════ DOCS VIEW ══════════════════ */}
      {view === "docs" && (
        <div>
          {/* ── Document checklist ─────────────────────────────────── */}
          {(() => {
            const finalizedMonths = months.filter((m: any) => m.is_finalized);
            const s1Payslips = payslips.filter((p: any) => !p.spouse_index || p.spouse_index === 1);
            const s2Payslips = payslips.filter((p: any) => p.spouse_index === 2);
            const hasSpouse2 = !!(client.questionnaire_spouses && client.questionnaire_spouses >= 2);
            const noSlipS1   = !!client.no_payslip_reason_s1;
            const noSlipS2   = !!client.no_payslip_reason_s2;
            const s1Name = clientIntake?.spouse1_first_name || clientIntake?.spouse1_name || null;
            const s2Name = clientIntake?.spouse2_name || null;
            const reqDocIds: string[]                   = client.required_docs || [];
            const customDocs: { id: string; label: string }[] = client.custom_docs || [];

            const submitted: string[] = [];
            const remaining: string[] = [];

            // months — summary row
            const finCount = finalizedMonths.length;
            if (finCount >= 3) submitted.push(`פירוט תנועות — ${finCount} מתוך 3`);
            else remaining.push(`פירוט תנועות — ${finCount} מתוך 3`);

            // payslips s1 — summary row
            const s1Label = s1Name ? `תלושי שכר — ${s1Name}` : "תלושי שכר";
            if (noSlipS1) {
              submitted.push(`${s1Label} — אין תלושים: ${client.no_payslip_reason_s1}`);
            } else {
              const s1Count = s1Payslips.length;
              if (s1Count >= 3) submitted.push(`${s1Label} — ${s1Count} מתוך 3`);
              else remaining.push(`${s1Label} — ${s1Count} מתוך 3`);
            }

            // payslips s2 — summary row
            if (hasSpouse2) {
              const s2Label = s2Name ? `תלושי שכר — ${s2Name}` : 'תלושי שכר ב"ז 2';
              if (noSlipS2) {
                submitted.push(`${s2Label} — אין תלושים: ${client.no_payslip_reason_s2}`);
              } else {
                const s2Count = s2Payslips.length;
                if (s2Count >= 3) submitted.push(`${s2Label} — ${s2Count} מתוך 3`);
                else remaining.push(`${s2Label} — ${s2Count} מתוך 3`);
              }
            }

            // required docs — skip "questionnaire", legacy IDs, and unmapped IDs
            const CURRENT_DOC_IDS = new Set(["bank_stmt","loans","provident","pension","savings_cash","assets","pl","retirement"]);
            reqDocIds.filter((id: string) => id !== "questionnaire" && DOC_LABELS[id] && CURRENT_DOC_IDS.has(id)).forEach((id: string) => {
              const label = DOC_LABELS[id];
              // bank_stmt is stored in bank_submissions, not client_documents
              if (id === "bank_stmt") {
                const bankAccountCount = client.bank_account_count || 1;
                const required = bankAccountCount * 3;
                const acctNums = Array.from({ length: bankAccountCount }, (_, i) => i + 1);
                const allAcctsDone = acctNums.every(n => bankSubs.filter((s: any) => (s.account_index || 1) === n).length >= 3);
                const uploadedLabel = `${label} — ${bankSubs.length} מתוך ${required} חודשים`;
                if (allAcctsDone) submitted.push(uploadedLabel);
                else remaining.push(uploadedLabel);
                return;
              }
              const cat = DOC_CAT_MAP[id] || id;
              const doc = clientDocs.find((d: any) => d.category === cat);
              // a doc with files is "done" only if at least one file was actually uploaded (has path)
              const docDone = (d: any) => {
                const files = d.files || [];
                if (files.length === 0) return d.marked_done; // no files expected — marked_done is enough
                return files.some((f: any) => f.path);        // files required — need at least one uploaded
              };
              // for fund types, also check individual sub-docs (pension_fund_1 etc.)
              const hasSubDocs = clientDocs.some((d: any) =>
                d.category.startsWith(cat + "_") && docDone(d)
              );
              if ((doc && docDone(doc)) || hasSubDocs) submitted.push(label);
              else remaining.push(label);
            });

            // custom docs
            customDocs.forEach((cd) => {
              const doc = clientDocs.find((d: any) => d.category === cd.id || d.label === cd.label);
              const files = doc?.files || [];
              const done = files.length === 0 ? doc?.marked_done : files.some((f: any) => f.path);
              if (done) submitted.push(cd.label);
              else remaining.push(cd.label);
            });

            const allDone = remaining.length === 0;
            return (
              <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
                {/* הוגשו */}
                <Card style={{ flex: 1, minWidth: 220, padding: "14px 18px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "var(--green-mid)", display: "flex", alignItems: "center", gap: 6 }}>
                    <IcoCheck size={14} /> הוגשו ({submitted.length})
                  </div>
                  {submitted.length === 0
                    ? <div style={{ fontSize: 13, color: "var(--text-dim)" }}>עדיין לא הוגשו מסמכים</div>
                    : submitted.map((label, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 13, color: "var(--text)" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-mid)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        {label}
                      </div>
                    ))
                  }
                </Card>
                {/* נותרו */}
                <Card style={{ flex: 1, minWidth: 220, padding: "14px 18px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: allDone ? "var(--green-mid)" : "var(--gold)", display: "flex", alignItems: "center", gap: 6 }}>
                    {allDone ? <><IcoCheck size={14} /> הכל הוגש!</> : `נותרו (${remaining.length})`}
                  </div>
                  {allDone
                    ? <div style={{ fontSize: 13, color: "var(--green-mid)" }}>כל המסמכים הוגשו ✓</div>
                    : remaining.map((label, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 0", fontSize: 13, color: "var(--text-mid)" }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, border: "1.5px solid var(--border)", display: "inline-flex", flexShrink: 0 }} />
                        {label}
                      </div>
                    ))
                  }
                </Card>
              </div>
            );
          })()}

          {/* ══ Grid of document tiles ══ */}
          {(() => {
            const T: React.CSSProperties = {
              border: "1px solid var(--border)", borderRadius: 10,
              overflow: "hidden", display: "flex", flexDirection: "column",
              background: "var(--surface)",
            };
            const TH: React.CSSProperties = {
              padding: "11px 14px", fontWeight: 700, fontSize: 14,
              background: "var(--surface2)", borderBottom: "1px solid var(--border)",
              color: "var(--text-mid)", textAlign: "center",
            };
            const TB: React.CSSProperties = { overflowY: "auto", maxHeight: 165 };
            const TR: React.CSSProperties = {
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 13px", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 13,
            };
            const TE: React.CSSProperties = {
              padding: "14px 13px", fontSize: 13, color: "var(--text-dim)", textAlign: "center" as const,
            };
            const fmtCcy = (v: any) => v ? `₪${Number(v).toLocaleString()}` : null;

            const tiles: React.ReactNode[] = [];

            // ── תנועות עו"ש ──
            if (months.length > 0) tiles.push(
              <div key="months" style={T}>
                <div style={TH}>פירוט תנועות לפי חודש</div>
                <div style={TB}>
                  {months.filter((m: any) => m.is_finalized).map((m: any) => {
                    const mSubs = [
                      ...(client.submissions || []).filter((s: any) => s.month_key === m.month_key),
                      ...pSubs.filter((s: any) => s.month_key === m.month_key),
                    ];
                    const txCount = mSubs.reduce((n: number, s: any) => n + (s.transactions || []).length, 0);
                    const txTotal = mSubs.reduce((sum: number, s: any) => sum + (s.transactions || []).reduce((a: number, t: any) => a + Math.abs(Number(t.amount || 0)), 0), 0);
                    const monthTxs = allTxs.filter((t: any) => t.month_key === m.month_key && !IGNORED.has(t.cat));
                    return (
                      <div key={m.id} style={TR}>
                        <IcoCheck color="var(--green-mid)" size={12} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{txCount} תנועות · <span style={{ color: "var(--red)" }}>₪{Math.round(txTotal).toLocaleString()}</span></div>
                        </div>
                        {mSubs.length > 0 && (
                          <Btn size="sm" variant="secondary" onClick={() => exportExcel(monthTxs, `${client.name}_${m.label}.xlsx`)}>
                            <IcoDown size={11} /> Excel
                          </Btn>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            // ── תלושי שכר ──
            {
              const s1Name = clientIntake?.spouse1_first_name || clientIntake?.spouse1_name || null;
              const s2Name = clientIntake?.spouse2_name || null;
              const hasSpouse2 = !!(client.questionnaire_spouses && client.questionnaire_spouses >= 2);
              const noSlipS1 = !!client.no_payslip_reason_s1;
              const noSlipS2 = !!client.no_payslip_reason_s2;
              const s1Slips = payslips.filter((p: any) => !p.spouse_index || p.spouse_index === 1);
              const s2Slips = payslips.filter((p: any) => p.spouse_index === 2);
              const slipRow = (p: any, dlSuffix: string) => (
                <div key={p.id} style={TR}>
                  <IcoFile color="var(--green-mid)" size={13} />
                  <span style={{ flex: 1, fontWeight: 600 }}>{p.label || mkLabel(p.month_key)}</span>
                  {p.path && (
                    <Btn size="sm" variant="secondary" onClick={() => downloadFile(p.path, `${client.name} תלוש שכר ${dlSuffix} ${p.label || mkLabel(p.month_key)}.${(p.filename || "pdf").split(".").pop()}`)}>
                      <IcoDown size={11} /> הורד
                    </Btn>
                  )}
                </div>
              );
              tiles.push(
                <div key="pays1" style={T}>
                  <div style={TH}>{s1Name ? `תלושי שכר — ${s1Name}` : "תלושי שכר"}</div>
                  <div style={TB}>
                    {noSlipS1 ? <div style={TE}>אין תלושים — {client.no_payslip_reason_s1}</div>
                      : s1Slips.length === 0 ? <div style={TE}>לא הועלו תלושים</div>
                      : s1Slips.map((p: any) => slipRow(p, s1Name || ""))}
                  </div>
                </div>
              );
              if (hasSpouse2) tiles.push(
                <div key="pays2" style={T}>
                  <div style={TH}>{s2Name ? `תלושי שכר — ${s2Name}` : 'תלושי שכר — בן/בת זוג 2'}</div>
                  <div style={TB}>
                    {noSlipS2 ? <div style={TE}>אין תלושים — {client.no_payslip_reason_s2}</div>
                      : s2Slips.length === 0 ? <div style={TE}>לא הועלו תלושים</div>
                      : s2Slips.map((p: any) => slipRow(p, s2Name || ""))}
                  </div>
                </div>
              );
            }

            // ── קבצי עו"ש ──
            {
              const acctNums = [...new Set(bankSubs.map((s: any) => s.account_index || 1))].sort() as number[];
              const rows = acctNums.flatMap((acct: number) => {
                const acctSubs = bankSubs.filter((s: any) => (s.account_index || 1) === acct);
                const seen = new Set<string>();
                const paths: string[] = [];
                acctSubs.forEach((sub: any) => {
                  (sub.files || []).filter((f: string) => f.includes("/")).forEach((f: string) => {
                    if (!seen.has(f)) { seen.add(f); paths.push(f); }
                  });
                });
                const bankLabel = acctSubs.find((s: any) => s.bank_label)?.bank_label || null;
                return paths.map((path, pi) => ({
                  path,
                  label: bankLabel ? (paths.length > 1 ? `${bankLabel} — קובץ ${pi + 1}` : bankLabel)
                    : (paths.length > 1 ? `חשבון ${acct} — קובץ ${pi + 1}` : `חשבון ${acct}`),
                  dlName: `${client.name} ${bankLabel || "חשבון " + acct} עו"ש.${path.split(".").pop() || "pdf"}`,
                }));
              });
              if (rows.length > 0) tiles.push(
                <div key="bank-files" style={T}>
                  <div style={TH}>קבצי עו"ש שהועלו</div>
                  <div style={TB}>
                    {rows.map((r: any, i: number) => (
                      <div key={i} style={TR}>
                        <IcoFile color="var(--green-mid)" size={13} />
                        <span style={{ flex: 1, fontWeight: 600 }}>{r.label}</span>
                        <Btn size="sm" variant="secondary" onClick={() => downloadFile(r.path, r.dlName)}>
                          <IcoDown size={11} /> הורד
                        </Btn>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }

            // ── קרנות פנסיה ──
            {
              const pensionCount: number = client.pension_count || 0;
              if (pensionCount > 0) {
                const pensionDescs: any[] = client.pension_descriptions || [];
                const rows = Array.from({ length: pensionCount }, (_, i) => {
                  const n = i + 1;
                  const desc = (pensionDescs[i] && typeof pensionDescs[i] === "object") ? pensionDescs[i] : {};
                  const doc = clientDocs.find((d: any) => d.category === `pension_fund_${n}`);
                  const file = (doc?.files || []).find((f: any) => f.path);
                  return { n, owner: (desc.owner || "") as string, company: (desc.company || "") as string, file };
                });
                tiles.push(
                  <div key="pension" style={T}>
                    <div style={TH}>קרנות פנסיה</div>
                    <div style={TB}>
                      {rows.map((r: any) => (
                        <div key={r.n} style={TR}>
                          <IcoFile color={r.file ? "var(--green-mid)" : "var(--text-dim)"} size={13} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>קרן {r.n}{r.owner ? ` — ${r.owner}` : ""}</div>
                            {r.company && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{r.company}</div>}
                          </div>
                          {r.file ? (
                            <Btn size="sm" variant="secondary" onClick={() => downloadFile(r.file.path, `${client.name} קרן פנסיה ${r.n}${r.owner ? " " + r.owner : ""}.${r.file.path.split(".").pop() || "pdf"}`)}>
                              <IcoDown size={11} /> הורד
                            </Btn>
                          ) : <span style={{ fontSize: 11, color: "var(--text-dim)" }}>לא הועלה</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            }

            // ── קרן השתלמות ──
            {
              const subDocCount = clientDocs.filter((d: any) => /^provident_fund_\d+$/.test(d.category)).length;
              const providentCount: number = client.provident_count || subDocCount;
              if (providentCount > 0) {
                const providentDescs: any[] = client.provident_descriptions || [];
                const rows = Array.from({ length: providentCount }, (_, i) => {
                  const n = i + 1;
                  const desc = (providentDescs[i] && typeof providentDescs[i] === "object") ? providentDescs[i] : {};
                  const doc = clientDocs.find((d: any) => d.category === `provident_fund_${n}`);
                  const file = (doc?.files || []).find((f: any) => f.path);
                  return { n, owner: (desc.owner || "") as string, company: (desc.company || "") as string, file };
                });
                tiles.push(
                  <div key="provident" style={T}>
                    <div style={TH}>קרן השתלמות</div>
                    <div style={TB}>
                      {rows.map((r: any) => (
                        <div key={r.n} style={TR}>
                          <IcoFile color={r.file ? "var(--green-mid)" : "var(--text-dim)"} size={13} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>קרן {r.n}{r.owner ? ` — ${r.owner}` : ""}</div>
                            {r.company && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{r.company}</div>}
                          </div>
                          {r.file ? (
                            <Btn size="sm" variant="secondary" onClick={() => downloadFile(r.file.path, `${client.name} קרן השתלמות ${r.n}${r.owner ? " " + r.owner : ""}.${r.file.path.split(".").pop() || "pdf"}`)}>
                              <IcoDown size={11} /> הורד
                            </Btn>
                          ) : <span style={{ fontSize: 11, color: "var(--text-dim)" }}>לא הועלה</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
            }

            // ── helper: admin field input ──
            const adminFieldInput = (
              docId: string, doc: any,
              label: string, field: string,
              isNumber = false,
            ) => {
              const ed = doc.extra_data || {};
              const ad = doc.admin_data || {};
              const draft = adminDrafts[docId] || {};
              const clientV = ed[field] != null ? String(ed[field]) : null;
              const adminV = ad[field] !== undefined && ad[field] !== "" ? String(ad[field]) : null;
              const draftV = draft[field] !== undefined ? String(draft[field]) : (adminV ?? "");
              return (
                <div key={field}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", marginBottom: 2 }}>{label}</div>
                  <input
                    type={isNumber ? "number" : "text"}
                    value={draftV}
                    placeholder={clientV ?? "—"}
                    onChange={(e) =>
                      setAdminDrafts((prev) => ({
                        ...prev,
                        [docId]: { ...(prev[docId] || {}), [field]: e.target.value },
                      }))
                    }
                    style={{
                      width: "100%",
                      fontSize: 12,
                      padding: "4px 6px",
                      boxSizing: "border-box" as const,
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      background: "var(--surface)",
                      color: "var(--text)",
                    }}
                  />
                  {clientV && (
                    <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 1 }}>
                      לקוח:{" "}
                      {isNumber ? `₪${Number(clientV).toLocaleString()}` : clientV}
                    </div>
                  )}
                </div>
              );
            };

            // ── effective value + override indicator helpers ──
            const eff = (doc: any, field: string): string | null => {
              const ad = doc.admin_data || {};
              const ed = doc.extra_data || {};
              const v =
                ad[field] !== undefined && ad[field] !== "" ? ad[field] : (ed[field] ?? null);
              return v != null ? String(v) : null;
            };
            const hasOvr = (doc: any): boolean =>
              Object.entries(doc.admin_data || {}).some(
                ([k, v]) =>
                  v !== "" && String(v) !== String((doc.extra_data || {})[k] ?? ""),
              );

            // ── הלוואות ──
            {
              const loanDocs = clientDocs.filter(
                (d: any) =>
                  d.category.startsWith("loan_") &&
                  d.category !== "loans_section" &&
                  ((d.files || []).some((f: any) => f.path) || d.extra_data || d.marked_done),
              );
              if (loanDocs.length > 0) {
                const loanEditActive = loanDocs.some((d: any) => d.id === adminEditing);
                const totalPrincipal = loanDocs.reduce((s: number, d: any) => {
                  const v = eff(d, "amount");
                  return s + (v ? Number(v) : 0);
                }, 0);
                const totalMonthly = loanDocs.reduce((s: number, d: any) => {
                  const v = eff(d, "monthly");
                  return s + (v ? Number(v) : 0);
                }, 0);

                tiles.push(
                  <div key="loans" style={T}>
                    <div style={TH}>הלוואות</div>
                    <div style={{ ...TB, maxHeight: loanEditActive ? "none" : 165 }}>
                      {loanDocs.map((doc: any) => {
                        const file = (doc.files || []).find((f: any) => f.path);
                        const ext = file
                          ? (file.filename || file.path || "pdf").split(".").pop()
                          : "pdf";
                        const isEditing = adminEditing === doc.id;
                        const isSaving = adminSavingIds.has(doc.id);
                        const docHasOvr = hasOvr(doc);
                        const effLender = eff(doc, "lender");
                        const effAmount = eff(doc, "amount");
                        const effMonthly = eff(doc, "monthly");
                        const effDescription = eff(doc, "description");
                        const effBalance = eff(doc, "balance");
                        return (
                          <div key={doc.id}>
                            <div style={{ ...TR, alignItems: "flex-start" }}>
                              <IcoFile
                                color={file ? "var(--green-mid)" : "var(--text-dim)"}
                                size={13}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {effDescription || effLender || doc.label || doc.category}
                                  </span>
                                  {docHasOvr && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        background: "var(--gold)",
                                        color: "#fff",
                                        borderRadius: 3,
                                        padding: "0 3px",
                                        fontWeight: 700,
                                        flexShrink: 0,
                                      }}
                                    >
                                      ע
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                  {[
                                    effAmount
                                      ? `סכום: ₪${Number(effAmount).toLocaleString()}`
                                      : effBalance
                                      ? `יתרה: ₪${Number(effBalance).toLocaleString()}`
                                      : null,
                                    effMonthly
                                      ? `חודשי: ₪${Number(effMonthly).toLocaleString()}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                                {file && (
                                  <Btn
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      downloadFile(
                                        file.path,
                                        `${client.name} ${doc.label || doc.category}.${ext}`,
                                      )
                                    }
                                  >
                                    <IcoDown size={11} />
                                  </Btn>
                                )}
                                <Btn
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    isEditing
                                      ? cancelAdminEdit(doc.id)
                                      : startAdminEdit(doc.id, doc.admin_data || {})
                                  }
                                >
                                  {isEditing ? "✕" : "✏"}
                                </Btn>
                              </div>
                            </div>
                            {isEditing && (
                              <div
                                style={{
                                  padding: "10px 13px 12px",
                                  background: "rgba(247,194,56,0.05)",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "8px 10px",
                                    marginBottom: 10,
                                  }}
                                >
                                  <div style={{ gridColumn: "1/-1" }}>
                                    {adminFieldInput(doc.id, doc, "מלווה", "lender")}
                                  </div>
                                  {adminFieldInput(doc.id, doc, "סכום ראשוני ₪", "amount", true)}
                                  {adminFieldInput(doc.id, doc, "החזר חודשי ₪", "monthly", true)}
                                  {adminFieldInput(doc.id, doc, "תאריך פתיחה", "start_date")}
                                  {adminFieldInput(doc.id, doc, "תאריך סיום", "end_date")}
                                  {adminFieldInput(doc.id, doc, "ריבית %", "interest", true)}
                                  {adminFieldInput(
                                    doc.id,
                                    doc,
                                    "יתרה נוכחית ₪",
                                    "balance",
                                    true,
                                  )}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Btn
                                    size="sm"
                                    onClick={() => saveAdminEdit(doc.id)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? "שומר..." : "שמור"}
                                  </Btn>
                                  <Btn
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => cancelAdminEdit(doc.id)}
                                  >
                                    ביטול
                                  </Btn>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {(totalPrincipal > 0 || totalMonthly > 0) && (
                      <div
                        style={{
                          padding: "7px 13px",
                          background: "rgba(69,123,157,0.08)",
                          borderTop: "1.5px solid var(--border)",
                          fontSize: 12,
                          fontWeight: 700,
                          display: "flex",
                          gap: 14,
                          color: "var(--text-mid)",
                        }}
                      >
                        {totalPrincipal > 0 && (
                          <span>
                            סה"כ סכום: ₪{Math.round(totalPrincipal).toLocaleString()}
                          </span>
                        )}
                        {totalMonthly > 0 && (
                          <span>
                            סה"כ חודשי: ₪{Math.round(totalMonthly).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}
                  </div>,
                );
              }
            }

            // ── חסכונות כספיים ──
            {
              const scDocs = clientDocs.filter(
                (d: any) =>
                  d.category.startsWith("sc_") &&
                  (d.extra_data || (d.files || []).some((f: any) => f.path) || d.marked_done),
              );
              if (scDocs.length > 0) {
                const scEditActive = scDocs.some((d: any) => d.id === adminEditing);
                const totalAmount = scDocs.reduce((s: number, d: any) => {
                  const v = eff(d, "amount");
                  return s + (v ? Number(v) : 0);
                }, 0);

                tiles.push(
                  <div key="savings" style={T}>
                    <div style={TH}>חסכונות כספיים</div>
                    <div style={{ ...TB, maxHeight: scEditActive ? "none" : 165 }}>
                      {scDocs.map((doc: any) => {
                        const file = (doc.files || []).find((f: any) => f.path);
                        const ext = file
                          ? (file.filename || file.path || "pdf").split(".").pop()
                          : "pdf";
                        const isEditing = adminEditing === doc.id;
                        const isSaving = adminSavingIds.has(doc.id);
                        const docHasOvr = hasOvr(doc);
                        const effDesc = eff(doc, "description");
                        const effAmt = eff(doc, "amount");
                        return (
                          <div key={doc.id}>
                            <div style={{ ...TR, alignItems: "flex-start" }}>
                              <IcoFile
                                color={file ? "var(--green-mid)" : "var(--text-dim)"}
                                size={13}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {effDesc || doc.label || doc.category}
                                  </span>
                                  {docHasOvr && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        background: "var(--gold)",
                                        color: "#fff",
                                        borderRadius: 3,
                                        padding: "0 3px",
                                        fontWeight: 700,
                                        flexShrink: 0,
                                      }}
                                    >
                                      ע
                                    </span>
                                  )}
                                </div>
                                {effAmt && (
                                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                    ₪{Number(effAmt).toLocaleString()}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                                {file && (
                                  <Btn
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      downloadFile(
                                        file.path,
                                        `${client.name} ${doc.label || doc.category}.${ext}`,
                                      )
                                    }
                                  >
                                    <IcoDown size={11} />
                                  </Btn>
                                )}
                                <Btn
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    isEditing
                                      ? cancelAdminEdit(doc.id)
                                      : startAdminEdit(doc.id, doc.admin_data || {})
                                  }
                                >
                                  {isEditing ? "✕" : "✏"}
                                </Btn>
                              </div>
                            </div>
                            {isEditing && (
                              <div
                                style={{
                                  padding: "10px 13px 12px",
                                  background: "rgba(247,194,56,0.05)",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "8px 10px",
                                    marginBottom: 10,
                                  }}
                                >
                                  <div style={{ gridColumn: "1/-1" }}>
                                    {adminFieldInput(doc.id, doc, "תיאור", "description")}
                                  </div>
                                  {adminFieldInput(doc.id, doc, "סכום ₪", "amount", true)}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Btn
                                    size="sm"
                                    onClick={() => saveAdminEdit(doc.id)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? "שומר..." : "שמור"}
                                  </Btn>
                                  <Btn
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => cancelAdminEdit(doc.id)}
                                  >
                                    ביטול
                                  </Btn>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {totalAmount > 0 && (
                      <div
                        style={{
                          padding: "7px 13px",
                          background: "rgba(69,123,157,0.08)",
                          borderTop: "1.5px solid var(--border)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--text-mid)",
                        }}
                      >
                        סה"כ: ₪{Math.round(totalAmount).toLocaleString()}
                      </div>
                    )}
                  </div>,
                );
              }
            }

            // ── נכסים פיזיים ──
            {
              const assetDocs = clientDocs.filter(
                (d: any) =>
                  d.category.startsWith("asset_") &&
                  d.category !== "assets_section" &&
                  (d.extra_data || d.marked_done),
              );
              if (assetDocs.length > 0) {
                const assetEditActive = assetDocs.some((d: any) => d.id === adminEditing);
                const totalValue = assetDocs.reduce((s: number, d: any) => {
                  const v = eff(d, "value");
                  return s + (v ? Number(v) : 0);
                }, 0);

                tiles.push(
                  <div key="assets" style={T}>
                    <div style={TH}>נכסים פיזיים</div>
                    <div style={{ ...TB, maxHeight: assetEditActive ? "none" : 165 }}>
                      {assetDocs.map((doc: any) => {
                        const isEditing = adminEditing === doc.id;
                        const isSaving = adminSavingIds.has(doc.id);
                        const docHasOvr = hasOvr(doc);
                        const effDesc = eff(doc, "description");
                        const effValue = eff(doc, "value");
                        return (
                          <div key={doc.id}>
                            <div style={{ ...TR, alignItems: "flex-start" }}>
                              <IcoFile color="var(--text-dim)" size={13} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                  }}
                                >
                                  <span
                                    style={{
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {effDesc || doc.label || doc.category}
                                  </span>
                                  {docHasOvr && (
                                    <span
                                      style={{
                                        fontSize: 9,
                                        background: "var(--gold)",
                                        color: "#fff",
                                        borderRadius: 3,
                                        padding: "0 3px",
                                        fontWeight: 700,
                                        flexShrink: 0,
                                      }}
                                    >
                                      ע
                                    </span>
                                  )}
                                </div>
                                {effValue && (
                                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                    ₪{Number(effValue).toLocaleString()}
                                  </div>
                                )}
                                {doc.category.replace(/_\d+$/, "") === "asset_car" && eff(doc, "year") && (
                                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                                    שנת ייצור: {eff(doc, "year")}
                                  </div>
                                )}
                              </div>
                              <Btn
                                size="sm"
                                variant="secondary"
                                onClick={() =>
                                  isEditing
                                    ? cancelAdminEdit(doc.id)
                                    : startAdminEdit(doc.id, doc.admin_data || {})
                                }
                              >
                                {isEditing ? "✕" : "✏"}
                              </Btn>
                            </div>
                            {isEditing && (
                              <div
                                style={{
                                  padding: "10px 13px 12px",
                                  background: "rgba(247,194,56,0.05)",
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "8px 10px",
                                    marginBottom: 10,
                                  }}
                                >
                                  <div style={{ gridColumn: "1/-1" }}>
                                    {adminFieldInput(doc.id, doc, "תיאור", "description")}
                                  </div>
                                  {adminFieldInput(doc.id, doc, "שווי ₪", "value", true)}
                                  {doc.category.replace(/_\d+$/, "") === "asset_car" &&
                                    adminFieldInput(doc.id, doc, "שנת ייצור", "year")}
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <Btn
                                    size="sm"
                                    onClick={() => saveAdminEdit(doc.id)}
                                    disabled={isSaving}
                                  >
                                    {isSaving ? "שומר..." : "שמור"}
                                  </Btn>
                                  <Btn
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => cancelAdminEdit(doc.id)}
                                  >
                                    ביטול
                                  </Btn>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {totalValue > 0 && (
                      <div
                        style={{
                          padding: "7px 13px",
                          background: "rgba(69,123,157,0.08)",
                          borderTop: "1.5px solid var(--border)",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--text-mid)",
                        }}
                      >
                        סה"כ שווי: ₪{Math.round(totalValue).toLocaleString()}
                      </div>
                    )}
                  </div>,
                );
              }
            }

            // ── שאר המסמכים ──
            {
              const plS1Name = clientIntake?.spouse1_first_name || clientIntake?.spouse1_name || null;
              const plS2Name = clientIntake?.spouse2_name || null;
              const getPLLabel = (cat: string): string | null => {
                if (cat === "profit_loss_1") return plS1Name ? `דוח רווח והפסד — ${plS1Name}` : "דוח רווח והפסד — בן/בת זוג 1";
                if (cat === "profit_loss_2") return plS2Name ? `דוח רווח והפסד — ${plS2Name}` : "דוח רווח והפסד — בן/בת זוג 2";
                return null;
              };
              const getGroupLabel = (cat: string): string => {
                if (cat.startsWith("profit_loss")) return "דוח רווח והפסד";
                if (cat === "retirement_forecast") return "תחזית פרישה";
                if (cat === "deferred_checks") return "שיקים דחויים";
                if (cat === "debts_other") return "חובות אחרים";
                if (cat === "loans_section") return "מסמכי הלוואות";
                return "מסמכים נוספים";
              };
              const docRows = clientDocs
                .filter((d: any) => {
                  if (/^pension_fund/.test(d.category)) return false;
                  if (/^provident_fund/.test(d.category)) return false;
                  if (d.category.startsWith("loan_") && d.category !== "loans_section") return false;
                  if (d.category.startsWith("sc_")) return false;
                  if (d.category.startsWith("asset_")) return false;
                  return (d.files || []).length > 0;
                })
                .flatMap((doc: any) =>
                  (doc.files as any[]).filter((f: any) => f.path).map((f: any, fi: number) => ({
                    key: `${doc.id}-${fi}`,
                    label: getPLLabel(doc.category) ||
                           (f.owner_name ? `${doc.label || doc.category} — ${f.owner_name}` : (doc.label || doc.category)),
                    category: doc.category as string,
                    path: f.path,
                    ext: (f.filename || f.name || f.path || "pdf").split(".").pop(),
                  }))
                );
              const groupMap = new Map<string, any[]>();
              docRows.forEach((r: any) => {
                const g = getGroupLabel(r.category);
                if (!groupMap.has(g)) groupMap.set(g, []);
                groupMap.get(g)!.push(r);
              });
              groupMap.forEach((rows, groupLabel) => {
                tiles.push(
                  <div key={groupLabel} style={T}>
                    <div style={TH}>{groupLabel}</div>
                    <div style={TB}>
                      {rows.map((r: any) => (
                        <div key={r.key} style={TR}>
                          <IcoFile color="var(--green-mid)" size={13} />
                          <span style={{ flex: 1, fontWeight: 600 }}>{r.label}</span>
                          <Btn size="sm" variant="secondary" onClick={() => downloadFile(r.path, `${client.name} ${r.label}.${r.ext}`)}>
                            <IcoDown size={11} /> הורד
                          </Btn>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            }

            // ── שאלון אישי ──
            {(() => {
              if (clientQuestionnaire.length === 0) return;
              tiles.push(
                <div key="quest-divider" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "10px 0 6px", borderTop: "2px solid var(--green-mid)", marginTop: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--green-deep)", letterSpacing: "0.03em" }}>שאלון אישי</span>
                </div>
              );
              const QUEST_QS = [
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
              const s1Name = clientIntake?.spouse1_first_name || clientIntake?.spouse1_name || null;
              const s2Name = clientIntake?.spouse2_name || null;
              clientQuestionnaire.forEach((row: any) => {
                const spouseName = row.spouse_index === 1 ? (s1Name || "בן/בת זוג 1") : (s2Name || "בן/בת זוג 2");
                const answers = row.answers || {};
                const spouseIdx: number = row.spouse_index;
                tiles.push(
                  <div key={`quest-${spouseIdx}`} style={{ ...T, gridColumn: "1 / -1" }}>
                    <div style={{ ...TH, textAlign: "right" }}>שאלון אישי — {spouseName}</div>
                    <div style={{ overflowY: "auto", maxHeight: 380 }}>
                      {QUEST_QS.map((q, i) => {
                        const ans = (answers[i] ?? answers[String(i)] ?? "") as string;
                        return (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 0, borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                            <div style={{ padding: "9px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", lineHeight: 1.5, borderLeft: "1px solid rgba(0,0,0,0.05)" }}>{i + 1}. {q}</div>
                            <div style={{ padding: "9px 14px", fontSize: 13, color: ans ? "var(--text)" : "var(--text-dim)", fontStyle: ans ? "normal" : "italic", lineHeight: 1.5 }}>{ans || "—"}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", background: "var(--surface2)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>הערות מנחה</div>
                      <textarea
                        value={questAdminNotes[spouseIdx] ?? ""}
                        onChange={e => setQuestAdminNotes(prev => ({ ...prev, [spouseIdx]: e.target.value }))}
                        placeholder="כתוב כאן דגשים, תובנות או נקודות מהשאלון..."
                        style={{ width: "100%", boxSizing: "border-box", minHeight: 80, padding: "8px 10px", fontSize: 13, fontFamily: "inherit", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", resize: "vertical", outline: "none", lineHeight: 1.5 }}
                      />
                      <Btn
                        size="sm"
                        style={{ marginTop: 8 }}
                        disabled={!!questNotesSaving[spouseIdx]}
                        onClick={async () => {
                          setQuestNotesSaving(prev => ({ ...prev, [spouseIdx]: true }));
                          await supabase.from("client_questionnaire")
                            .update({ admin_notes: questAdminNotes[spouseIdx] ?? "" })
                            .eq("client_id", client.id)
                            .eq("spouse_index", spouseIdx);
                          setQuestNotesSaving(prev => ({ ...prev, [spouseIdx]: false }));
                        }}
                      >
                        {questNotesSaving[spouseIdx] ? "שומר..." : "שמור הערות"}
                      </Btn>
                    </div>
                  </div>
                );
              });
            })()}

            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, alignItems: "start", marginTop: 20 }}>
                {tiles}
              </div>
            );
          })()}

        </div>
      )}

      {/* ══ Categories view ══ */}
      {view === "categories" && (() => {
        const { allRows: bdAllRows, hasElecBills } = balanceData;
        const allRowsMap = new Map(bdAllRows.map(r => [r.cat, r]));

        const txCatSet = new Set([
          ...allTxs.map((t) => t.cat),
          ...bankSubs.flatMap((s: any) => (s.transactions || []).map((t: any) => t.cat as string)),
        ]);
        const adminCatNames = Object.keys(avgOverrides).filter((cat) => !txCatSet.has(cat));
        const clientNames = clientCatRows.map((r) => r.name);

        const usedCats = Array.from(new Set([
          ...txCatSet,
          ...adminCatNames,
          ...clientNames,
          ...(hasElecBills ? ["חשמל"] : []),
        ].filter(Boolean)));

        const getType = (cat: string): BudgetType => {
          if (catTypeOvr[cat]) return catTypeOvr[cat];
          if (catTypes[cat]) return catTypes[cat];
          const clientRow = clientCatRows.find((r) => r.name === cat);
          if (clientRow?.budget_type) return clientRow.budget_type;
          return "משתנה";
        };

        const getAvg = (cat: string): number | null => allRowsMap.get(cat)?.effAvg ?? null;
        const fmtAvg = (cat: string) => {
          const v = getAvg(cat);
          if (v === null) return <span style={{ color: "var(--text-dim)", fontSize: 12 }}>—</span>;
          return <span style={{ fontVariantNumeric: "tabular-nums" }}>₪{Math.round(v).toLocaleString()}</span>;
        };

        const groupCats = (cats: string[]) => {
          const income: string[] = [], fixed: string[] = [], variable: string[] = [];
          cats.forEach((c) => {
            const t = getType(c);
            if (t === "הכנסה") income.push(c);
            else if (t === "קבוע") fixed.push(c);
            else variable.push(c);
          });
          return { income, fixed, variable };
        };

        const usedGrouped = groupCats(usedCats);
        const clientGrouped = groupCats(clientNames);
        const adminGrouped = groupCats(adminCatNames);

        const SEC_CONFIG = [
          { key: "income",   label: "הכנסות",  color: "var(--green-mid)", bg: "rgba(46,204,138,0.07)" },
          { key: "fixed",    label: "קבועות",  color: "#457b9d",          bg: "rgba(69,123,157,0.07)" },
          { key: "variable", label: "משתנות",  color: "var(--gold)",      bg: "rgba(247,194,56,0.07)" },
        ] as const;

        const secTotal = (cats: string[]): number =>
          cats.reduce((s, c) => s + (getAvg(c) ?? 0), 0);
        const fmtTotal = (n: number) =>
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>₪{Math.round(n).toLocaleString()}</span>;

        const renderTable = (grouped: { income: string[]; fixed: string[]; variable: string[] }) => {
          const incomeTotal = secTotal(grouped.income);
          const expTotal = secTotal(grouped.fixed) + secTotal(grouped.variable);
          const balance = incomeTotal - expTotal;
          const balColor = balance >= 0 ? "var(--green-mid)" : "var(--red)";
          return (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>קטגוריה</th>
                <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-dim)", width: 110, whiteSpace: "nowrap" }}>ממוצע חודשי</th>
              </tr>
            </thead>
            <tbody>
              {SEC_CONFIG.map(({ key, label, color, bg }) => {
                const cats = [...grouped[key]].sort();
                if (cats.length === 0) return null;
                const total = secTotal(cats);
                return (
                  <React.Fragment key={key}>
                    <tr>
                      <td colSpan={2} style={{ padding: "10px 14px 4px", background: bg }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
                      </td>
                    </tr>
                    {cats.map((cat, i) => (
                      <tr key={cat} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.018)", borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "9px 14px", fontSize: 13, color: "var(--text)" }}>{cat}</td>
                        <td style={{ padding: "9px 14px", fontSize: 13, textAlign: "left", color: "var(--text)" }}>{fmtAvg(cat)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: bg, borderTop: `1px solid ${color}22`, borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, color }}>סה"כ {label}</td>
                      <td style={{ padding: "7px 14px", fontSize: 13, textAlign: "left", color }}>{fmtTotal(total)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
              <tr style={{ background: "var(--surface2)", borderTop: "2px solid var(--border)" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>שורה תחתונה</td>
                <td style={{ padding: "10px 14px", fontSize: 14, textAlign: "left", fontWeight: 700, color: balColor }}>
                  {balance >= 0 ? "+" : ""}₪{Math.round(Math.abs(balance)).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
          );
        };

        return (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <Card style={{ flex: 1, minWidth: 0, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>כל הקטגוריות בשימוש</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>מתנועות אשראי + עו"ש + ידניות</div>
              </div>
              {usedCats.length === 0
                ? <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 13 }}>אין נתונים עדיין</div>
                : renderTable(usedGrouped)
              }
            </Card>
            <Card style={{ flex: 1, minWidth: 0, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>קטגוריות שיצר הלקוח</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>קטגוריות אישיות שהלקוח הוסיף</div>
              </div>
              {clientNames.length === 0
                ? <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 13 }}>הלקוח לא יצר קטגוריות עדיין</div>
                : renderTable(clientGrouped)
              }
            </Card>
            <Card style={{ flex: 1, minWidth: 0, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>קטגוריות שיצר האדמין</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>נוספו ידנית בבסיס למאזן</div>
              </div>
              {adminCatNames.length === 0
                ? <div style={{ padding: "20px 16px", color: "var(--text-dim)", fontSize: 13 }}>לא נוספו קטגוריות ידנית</div>
                : renderTable(adminGrouped)
              }
            </Card>
          </div>
        );
      })()}

      {/* ══ Confirmation popup for custom category deletion ══ */}
      {confirmDelCat && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConfirmDelCat(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "28px 32px", maxWidth: 380, width: "90%", boxShadow: "0 12px 40px rgba(0,0,0,0.25)", direction: "rtl" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: "var(--text)" }}>מחיקת קטגוריה</div>
            <div style={{ fontSize: 14, color: "var(--text-mid)", marginBottom: 20, lineHeight: 1.6 }}>
              מחיקת <strong>"{confirmDelCat}"</strong> תסיר אותה לחלוטין מהמאזן של לקוח זה, כולל הסכום שהוגדר. פעולה זו אינה ניתנת לביטול.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
              <button
                onClick={() => { revertSummaryAvg(confirmDelCat); setConfirmDelCat(null); }}
                style={{ padding: "8px 20px", borderRadius: 8, background: "#c0392b", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}
              >מחק לחלוטין</button>
              <button
                onClick={() => setConfirmDelCat(null)}
                style={{ padding: "8px 20px", borderRadius: 8, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}
              >ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── tiny helpers ──────────────────────────────────────────────────────────────
const TH: React.CSSProperties = {
  padding: "9px 12px",
  fontWeight: 600,
  fontSize: 12,
  color: "var(--text-dim)",
  whiteSpace: "nowrap",
  textAlign: "center",
};

function SectionHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, ...style }}>{children}</div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card style={{ textAlign: "center", padding: "28px 20px", color: "var(--text-dim)", fontSize: 14, marginBottom: 8 }}>
      {text}
    </Card>
  );
}
