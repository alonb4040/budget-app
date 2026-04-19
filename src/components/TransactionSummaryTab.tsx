import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../supabase";
import { Card } from "../ui";

// ── helpers ───────────────────────────────────────────────────────────────────
const IGNORED = new Set(["להתעלם"]);

const HEB_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];
function monthKeyToLabel(mk: string): string {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${HEB_MONTHS[parseInt(m) - 1]} ${y}`;
}
function truncLabel(label: string, max = 14): string {
  if (!label) return "";
  return label.length > max ? label.slice(0, max) + "…" : label;
}
function fmt(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "—";
  return `₪${r.toLocaleString()}`;
}

// ── types ─────────────────────────────────────────────────────────────────────
type BudgetType = 'הכנסה' | 'קבוע' | 'משתנה';

interface TxRow   { cat: string; amount: number; }
interface Sub     { id: string; month_key: string; label?: string; transactions: TxRow[]; }
interface Estimate {
  id: string;
  category_name: string;
  monthly_amount: number;
  budget_type?: string;
}
interface TableRow {
  category:    string;
  months:      number[];
  avg:         number;
  isEstimate:  boolean;
  budgetType?: BudgetType;
}

const SECTIONS: { key: BudgetType; label: string }[] = [
  { key: 'הכנסה',  label: 'הכנסות'        },
  { key: 'קבוע',   label: 'הוצאות קבועות' },
  { key: 'משתנה',  label: 'הוצאות משתנות' },
];

// ── component ─────────────────────────────────────────────────────────────────
export default function TransactionSummaryTab({ client }: { client: any }) {
  const [notes,    setNotes]    = useState<Record<string, string>>({});
  const [saving,   setSaving]   = useState<Record<string, boolean>>({});
  const timers         = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const committedNotes = useRef<Record<string, string>>({});

  const [catTypes,       setCatTypes]       = useState<Record<string, string>>({});
  const [globalCats,     setGlobalCats]     = useState<{ name: string; budget_type: string }[]>([]);
  const [avgOverrides,   setAvgOverrides]   = useState<Record<string, number>>({});
  const [monthOverrides, setMonthOverrides] = useState<Record<string, number>>({});
  // key: `${category}|${month_key}`
  const [localEsts,      setLocalEsts]      = useState<Estimate[]>(client.estimates || []);

  // inline avg editing
  const [editingAvg, setEditingAvg] = useState<string | null>(null);
  const [editVal,    setEditVal]    = useState("");
  const editSaving = useRef(false);

  // inline month editing — key: `${category}|${mi}`
  const [editingMonth,  setEditingMonth]  = useState<string | null>(null);
  const [editMonthVal,  setEditMonthVal]  = useState("");

  // add category form
  const [addingSection, setAddingSection] = useState<BudgetType | null>(null);
  const [addName,    setAddName]    = useState("");
  const [addAmount,  setAddAmount]  = useState("");
  const [addSaving,  setAddSaving]  = useState(false);
  const [noteSaved,  setNoteSaved]  = useState<Record<string, boolean>>({});

  // edit/delete estimate name
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editNameVal, setEditNameVal] = useState("");

  // delete confirmation modal
  const [deleteTarget,   setDeleteTarget]   = useState<TableRow | null>(null);
  const [deleteHasSce,   setDeleteHasSce]   = useState(false);
  const [deleteChecking, setDeleteChecking] = useState(false);

  // collapse state per section (default: expanded)
  const [collapsed, setCollapsed] = useState<Record<BudgetType, boolean>>({
    'הכנסה': false, 'קבוע': false, 'משתנה': false,
  });


  // Sync localEsts when client changes
  useEffect(() => { setLocalEsts(client.estimates || []); }, [client.id]);

  // Sort submissions chronologically (oldest first)
  const subs: Sub[] = [...(client.submissions || [])]
    .sort((a, b) => (a.month_key || "").localeCompare(b.month_key || ""))
    .slice(0, 3);

  // ── data fetches ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!client.id) return;
    supabase
      .from("portfolio_notes")
      .select("category, note")
      .eq("client_id", client.id)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        data.forEach((r: any) => { map[r.category] = r.note || ""; });
        setNotes(map);
        committedNotes.current = map;
      });
  }, [client.id]);

  useEffect(() => {
    supabase.from("categories").select("name, budget_type, client_id").eq("is_active", true)
      .then(({ data }) => {
        if (!data) return;
        // catTypes: all active categories (global + personal) for budget_type lookup
        const m: Record<string, string> = {};
        data.forEach((r: any) => { m[r.name] = r.budget_type; });
        setCatTypes(m);
        // globalCats: only truly global categories (client_id = null) for missing chips
        setGlobalCats(
          data
            .filter((r: any) => r.client_id === null)
            .map((r: any) => ({ name: r.name, budget_type: r.budget_type }))
        );
      });
  }, []);

  useEffect(() => {
    if (!client.id) return;
    supabase.from("portfolio_avg_overrides")
      .select("category, override_avg")
      .eq("client_id", client.id)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, number> = {};
        data.forEach((r: any) => { m[r.category] = Number(r.override_avg); });
        setAvgOverrides(m);
      });
  }, [client.id]);

  useEffect(() => {
    if (!client.id) return;
    supabase.from("portfolio_month_overrides")
      .select("month_key, category, override_amount")
      .eq("client_id", client.id)
      .then(({ data }) => {
        if (!data) return;
        const m: Record<string, number> = {};
        data.forEach((r: any) => {
          m[`${r.category}|${r.month_key}`] = Number(r.override_amount);
        });
        setMonthOverrides(m);
      });
  }, [client.id]);

  // ── build table rows ────────────────────────────────────────────────────────

  const catMap: Record<string, number[]> = {};
  subs.forEach((sub, mi) => {
    (sub.transactions || [])
      .filter(t => !IGNORED.has(t.cat))
      .forEach(t => {
        if (!catMap[t.cat]) catMap[t.cat] = [0, 0, 0];
        catMap[t.cat][mi] += Number(t.amount || 0);
      });
  });

  const realRows: TableRow[] = Object.entries(catMap).map(([cat, months]) => ({
    category:   cat,
    months,
    avg:        (months[0] + months[1] + months[2]) / 3,
    isEstimate: false,
  })).sort((a, b) => b.avg - a.avg);

  const realCats = new Set(realRows.map(r => r.category));
  const estimateRows: TableRow[] = localEsts
    .filter(e => !realCats.has(e.category_name))
    .map(e => ({
      category:   e.category_name,
      months:     [0, 0, 0],
      avg:        Number(e.monthly_amount),
      isEstimate: true,
      budgetType: (e.budget_type as BudgetType) || 'משתנה',
    }))
    .sort((a, b) => b.avg - a.avg);

  const rows: TableRow[] = [...realRows, ...estimateRows];

  const getBudgetType = (cat: string): BudgetType =>
    (catTypes[cat] as BudgetType) || 'משתנה';

  const grouped: Record<BudgetType, TableRow[]> = { 'הכנסה': [], 'קבוע': [], 'משתנה': [] };
  rows.forEach(row => {
    const type = row.isEstimate
      ? (row.budgetType || 'משתנה')
      : getBudgetType(row.category);
    grouped[type].push(row);
  });

  const getEffectiveAvg = (row: TableRow): number => {
    if (avgOverrides[row.category] !== undefined) return avgOverrides[row.category];
    if (row.isEstimate || subs.length === 0) return row.avg;
    const total = subs.reduce((sum, sub, mi) => {
      const mkKey = `${row.category}|${sub.month_key}`;
      return sum + (monthOverrides[mkKey] ?? row.months[mi]);
    }, 0);
    return total / subs.length;
  };

  const sectionAvg = (key: BudgetType) =>
    grouped[key].reduce((s, r) => s + getEffectiveAvg(r), 0);
  const totalIncome  = sectionAvg('הכנסה');
  const totalExpense = sectionAvg('קבוע') + sectionAvg('משתנה');
  const balance      = totalIncome - totalExpense;

  // Missing categories = global cats not yet in transactions or estimates for this client
  const addedCats = new Set([...realCats, ...localEsts.map(e => e.category_name)]);
  const missingCats = globalCats.filter(c => !addedCats.has(c.name));

  // ── note save logic ──────────────────────────────────────────────────────────
  const saveNote = useCallback(async (category: string, value: string) => {
    setSaving(prev => ({ ...prev, [category]: true }));
    await supabase.from("portfolio_notes").upsert(
      { client_id: client.id, category, note: value, updated_at: new Date().toISOString() },
      { onConflict: "client_id,category" }
    );
    committedNotes.current[category] = value;
    setSaving(prev => ({ ...prev, [category]: false }));
    setNoteSaved(prev => ({ ...prev, [category]: true }));
    setTimeout(() => setNoteSaved(prev => ({ ...prev, [category]: false })), 1500);
  }, [client.id]);

  // debounce בזמן הקלדה
  const handleNoteChange = useCallback((category: string, value: string) => {
    setNotes(prev => ({ ...prev, [category]: value }));
    if (timers.current[category]) clearTimeout(timers.current[category]);
    timers.current[category] = setTimeout(() => saveNote(category, value), 2000);
  }, [saveNote]);

  // שמירה מיידית ב-blur (ביטול debounce + שמירה)
  const handleNoteBlur = useCallback((category: string, value: string) => {
    if (timers.current[category]) {
      clearTimeout(timers.current[category]);
      delete timers.current[category];
    }
    saveNote(category, value);
  }, [saveNote]);

  // ביטול ב-Escape — מחזיר לערך האחרון שנשמר ב-DB
  const cancelNote = useCallback((category: string) => {
    if (timers.current[category]) {
      clearTimeout(timers.current[category]);
      delete timers.current[category];
    }
    setNotes(prev => ({ ...prev, [category]: committedNotes.current[category] || "" }));
  }, []);

  // ── avg editing ─────────────────────────────────────────────────────────────
  const startEditAvg = (row: TableRow) => {
    setEditingMonth(null);
    setEditingAvg(row.category);
    setEditVal(String(Math.round(avgOverrides[row.category] ?? row.avg)));
  };

  const saveAvg = useCallback(async (row: TableRow, valStr: string) => {
    if (editSaving.current) return;
    setEditingAvg(null);
    const val = Number(valStr);
    if (isNaN(val) || val < 0) return;
    editSaving.current = true;

    if (row.isEstimate) {
      const est = localEsts.find(e => e.category_name === row.category);
      if (est) {
        await supabase.from("category_estimates")
          .update({ monthly_amount: val }).eq("id", est.id);
        setLocalEsts(prev => prev.map(e =>
          e.category_name === row.category ? { ...e, monthly_amount: val } : e));
      }
    } else {
      await supabase.from("portfolio_avg_overrides").upsert(
        { client_id: client.id, category: row.category, override_avg: val, updated_at: new Date().toISOString() },
        { onConflict: "client_id,category" }
      );
      setAvgOverrides(prev => ({ ...prev, [row.category]: val }));
    }
    editSaving.current = false;
  }, [client.id, localEsts]);

  const revertAvg = useCallback(async (row: TableRow) => {
    await supabase.from("portfolio_avg_overrides")
      .delete()
      .eq("client_id", client.id)
      .eq("category", row.category);
    setAvgOverrides(prev => {
      const next = { ...prev };
      delete next[row.category];
      return next;
    });
  }, [client.id]);

  // ── month editing ────────────────────────────────────────────────────────────
  const startEditMonth = (row: TableRow, mi: number) => {
    if (row.isEstimate) return;
    setEditingAvg(null);
    const key = `${row.category}|${mi}`;
    setEditingMonth(key);
    const mk = subs[mi]?.month_key;
    const mkKey = `${row.category}|${mk}`;
    setEditMonthVal(String(Math.round(monthOverrides[mkKey] ?? row.months[mi])));
  };

  const saveMonth = useCallback(async (row: TableRow, mi: number, valStr: string) => {
    setEditingMonth(null);
    const val = Number(valStr);
    if (isNaN(val) || val < 0) return;
    const mk = subs[mi]?.month_key;
    if (!mk) return;
    const mkKey = `${row.category}|${mk}`;
    await supabase.from("portfolio_month_overrides").upsert(
      {
        client_id:       client.id,
        month_key:       mk,
        category:        row.category,
        override_amount: val,
        original_amount: row.months[mi],
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "client_id,month_key,category" }
    );
    setMonthOverrides(prev => ({ ...prev, [mkKey]: val }));
  }, [client.id, subs]);

  const revertMonth = useCallback(async (row: TableRow, mi: number) => {
    const mk = subs[mi]?.month_key;
    if (!mk) return;
    const mkKey = `${row.category}|${mk}`;
    await supabase.from("portfolio_month_overrides")
      .delete()
      .eq("client_id", client.id)
      .eq("month_key", mk)
      .eq("category", row.category);
    setMonthOverrides(prev => {
      const next = { ...prev };
      delete next[mkKey];
      return next;
    });
  }, [client.id, subs]);

  // ── add category ────────────────────────────────────────────────────────────
  const handleAddCategory = useCallback(async () => {
    const name = addName.trim();
    const section = addingSection;
    if (!name || !addAmount.trim() || !section) return;
    const amt = Number(addAmount);
    if (isNaN(amt) || amt < 0) return;
    setAddSaving(true);

    // Optimistic update — show in table immediately regardless of DB response
    const optimistic: Estimate = {
      id: `optimistic-${Date.now()}`,
      category_name:  name,
      monthly_amount: amt,
      budget_type:    section,
    };
    setLocalEsts(prev => {
      const exists = prev.find(e => e.category_name === name);
      if (exists) return prev.map(e =>
        e.category_name === name ? { ...e, monthly_amount: amt, budget_type: section } : e);
      return [...prev, optimistic];
    });

    // Persist to DB and replace optimistic with real id
    const { data, error } = await supabase.from("category_estimates").upsert(
      { client_id: client.id, category_name: name, monthly_amount: amt, budget_type: section },
      { onConflict: "client_id,category_name" }
    ).select().maybeSingle();

    if (error) {
      console.error("category_estimates upsert error:", error);
    }
    if (data) {
      // Replace optimistic entry with real DB row (has real id)
      setLocalEsts(prev => prev.map(e =>
        e.category_name === name && e.id === optimistic.id ? data : e));
    }

    setAddingSection(null);
    setAddName("");
    setAddAmount("");
    setAddSaving(false);
  }, [client.id, addName, addAmount, addingSection]);

  // ── edit estimate name ──────────────────────────────────────────────────────
  const startEditName = (row: TableRow) => {
    setEditingName(row.category);
    setEditNameVal(row.category);
  };

  const saveEditName = useCallback(async (row: TableRow, newName: string) => {
    const trimmed = newName.trim();
    setEditingName(null);
    if (!trimmed || trimmed === row.category) return;

    const est = localEsts.find(e => e.category_name === row.category);
    if (!est) return;

    // Update category_estimates
    await supabase.from("category_estimates")
      .update({ category_name: trimmed })
      .eq("id", est.id);

    setLocalEsts(prev => prev.map(e =>
      e.category_name === row.category ? { ...e, category_name: trimmed } : e));
  }, [client.id, localEsts]);

  // ── delete estimate row — shows confirmation modal ────────────────────────────
  const deleteEstimate = useCallback(async (row: TableRow) => {
    setDeleteChecking(true);
    setDeleteTarget(row);
    // Check if category has scenario entries
    const { data } = await supabase
      .from("portfolio_scenario_entries")
      .select("scenario_id")
      .eq("client_id", client.id)
      .eq("category", row.category)
      .limit(1);
    setDeleteHasSce(!!(data && data.length > 0));
    setDeleteChecking(false);
  }, [client.id]);

  const confirmDelete = useCallback(async () => {
    const row = deleteTarget;
    if (!row) return;
    setDeleteTarget(null);

    const est = localEsts.find(e => e.category_name === row.category);
    if (!est) return;

    // Remove from category_estimates
    await supabase.from("category_estimates")
      .delete()
      .eq("id", est.id);

    // Remove from local state → if global category, it reappears in chips automatically
    setLocalEsts(prev => prev.filter(e => e.category_name !== row.category));
  }, [client.id, localEsts, deleteTarget]);

  // ── add from global chip — opens the section form pre-filled ──────────────
  const handleAddChip = useCallback((cat: { name: string; budget_type: string }) => {
    const sectionKey = cat.budget_type as BudgetType;
    // Expand the section if collapsed
    setCollapsed(prev => ({ ...prev, [sectionKey]: false }));
    // Open the add form with the name pre-filled
    setAddingSection(sectionKey);
    setAddName(cat.name);
    setAddAmount("");
    // Scroll to the section after a short delay (to allow expansion render)
    setTimeout(() => {
      document.getElementById(`section-header-${sectionKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }, []);

  // ── empty state ─────────────────────────────────────────────────────────────
  if (subs.length === 0) {
    return (
      <Card style={{ textAlign: "center", padding: "56px 32px" }}>
        <div style={{ fontSize: 36, marginBottom: 14, opacity: 0.18 }}>—</div>
        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-dim)" }}>
          אין הגשות עדיין
        </div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 6 }}>
          הטבלה תופיע לאחר שהלקוח יגיש לפחות חודש אחד
        </div>
      </Card>
    );
  }

  // ── styles ──────────────────────────────────────────────────────────────────
  const TH: React.CSSProperties = {
    padding: "12px 16px",
    fontWeight: 600,
    fontSize: 13,
    color: "var(--text-dim)",
    whiteSpace: "nowrap",
    textAlign: "center",
  };
  const moneyCell = (val: number): React.CSSProperties => ({
    padding: "12px 16px",
    textAlign: "center",
    fontWeight: val === 0 ? 400 : 500,
    fontSize: 14,
    color: val === 0 ? "var(--text-dim)" : "var(--text)",
    opacity: val === 0 ? 0.35 : 1,
  });

  return (
    <>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            direction: "rtl",
            minWidth: 680,
          }}>
            {/* ── HEADER ── */}
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                <th style={{ ...TH, textAlign: "right", paddingRight: 16, minWidth: 150 }}>
                  קטגוריה
                </th>

                {subs.map((s, i) => {
                  const monthDate    = monthKeyToLabel(s.month_key);
                  const displayLabel = truncLabel(s.label || monthDate);
                  const showSub      = s.label && s.label !== monthDate;
                  return (
                    <th key={i} style={TH} title={s.label || monthDate}>
                      <div>{displayLabel}</div>
                      {showSub && (
                        <div style={{ fontSize: 10, fontWeight: 400, color: "var(--text-dim)", marginTop: 2, opacity: 0.8 }}>
                          {monthDate}
                        </div>
                      )}
                    </th>
                  );
                })}

                {Array.from({ length: 3 - subs.length }).map((_, i) => (
                  <th key={`ph-${i}`} style={{ ...TH, opacity: 0.25 }}>—</th>
                ))}

                <th style={{
                  ...TH,
                  fontWeight: 700,
                  color: "var(--text)",
                  borderLeft: "1px solid var(--border)",
                }}>
                  ממוצע חודשי
                </th>

                <th style={{ ...TH, textAlign: "right", paddingRight: 16, minWidth: 170 }}>
                  הערות
                </th>
              </tr>
            </thead>

            {/* ── BODY ── */}
            <tbody>
              {SECTIONS.map(section => (
                <SectionBlock
                  key={section.key}
                  section={section}
                  rows={grouped[section.key]}
                  subs={subs}
                  notes={notes}
                  saving={saving}
                  noteSaved={noteSaved}
                  avgOverrides={avgOverrides}
                  monthOverrides={monthOverrides}
                  editingAvg={editingAvg}
                  editVal={editVal}
                  editingMonth={editingMonth}
                  editMonthVal={editMonthVal}
                  addingSection={addingSection}
                  addName={addName}
                  addAmount={addAmount}
                  addSaving={addSaving}
                  collapsed={collapsed[section.key]}
                  moneyCell={moneyCell}
                  onNoteChange={handleNoteChange}
                  onNoteBlur={handleNoteBlur}
                  onNoteCancel={cancelNote}
                  onStartEditAvg={startEditAvg}
                  onSaveAvg={saveAvg}
                  onCancelEdit={() => setEditingAvg(null)}
                  onEditValChange={setEditVal}
                  onRevertAvg={revertAvg}
                  onStartEditMonth={startEditMonth}
                  onSaveMonth={saveMonth}
                  onCancelEditMonth={() => setEditingMonth(null)}
                  onEditMonthValChange={setEditMonthVal}
                  onRevertMonth={revertMonth}
                  onOpenAddForm={(key) => { setAddingSection(key); setAddName(""); setAddAmount(""); }}
                  onCancelAdd={() => setAddingSection(null)}
                  onAddNameChange={setAddName}
                  onAddAmountChange={setAddAmount}
                  onAddSave={handleAddCategory}
                  onToggleCollapse={() =>
                    setCollapsed(prev => ({ ...prev, [section.key]: !prev[section.key] }))
                  }
                  editingName={editingName}
                  editNameVal={editNameVal}
                  onStartEditName={startEditName}
                  onSaveEditName={saveEditName}
                  onCancelEditName={() => setEditingName(null)}
                  onEditNameValChange={setEditNameVal}
                  onDeleteEstimate={deleteEstimate}
                  sectionAvg={sectionAvg(section.key)}
                  getEffectiveAvg={getEffectiveAvg}
                />
              ))}

              {/* ── BALANCE ROW ── */}
              <tr style={{ borderTop: "2px solid var(--border)", background: balance >= 0 ? "rgba(22,163,74,0.05)" : "rgba(239,68,68,0.04)" }}>
                <td style={{ padding: "14px 16px", fontWeight: 700, fontSize: 14, color: "var(--text-dim)", letterSpacing: "0.03em" }}>
                  שורה תחתונה
                </td>
                <td colSpan={3} style={{ textAlign: "center", fontSize: 12, color: "var(--text-dim)", padding: "14px 8px", letterSpacing: "0.01em" }}>
                  {totalIncome !== 0 && <span style={{ marginLeft: 12 }}>הכנסות <strong>{fmt(totalIncome)}</strong></span>}
                  <span>הוצאות <strong>{fmt(totalExpense)}</strong></span>
                </td>
                <td style={{
                  textAlign: "center",
                  fontWeight: 800,
                  fontSize: 18,
                  borderLeft: "1px solid var(--border)",
                  padding: "14px 16px",
                  color: balance >= 0 ? "var(--green, #16a34a)" : "var(--red, #ef4444)",
                }}>
                  {fmt(balance)}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── MISSING CATEGORIES PANEL ── */}
      {missingCats.length > 0 && (
        <MissingCatsPanel
          missingCats={missingCats}
          onAddChip={handleAddChip}
        />
      )}

      {/* ── DELETE CONFIRMATION MODAL ── */}
      {(deleteTarget || deleteChecking) && (
        <div
          onClick={() => !deleteChecking && setDeleteTarget(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--surface)", borderRadius: 14,
              padding: "28px 32px", maxWidth: 400, width: "90%",
              boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
              direction: "rtl", textAlign: "right",
            }}
          >
            {deleteChecking ? (
              <div style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 14, padding: "8px 0" }}>
                בודק...
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
                  מחיקת קטגוריה — {deleteTarget?.category}
                </div>
                <div style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 16 }}>
                  {deleteHasSce ? (
                    <>
                      <span style={{ color: "var(--red, #ef4444)", fontWeight: 600 }}>שים לב: </span>
                      לקטגוריה זו יש ערכים בתסריטים. מחיקתה תסיר אותה גם מכל התסריטים.
                    </>
                  ) : (
                    "האם למחוק את הקטגוריה? פעולה זו אינה הפיכה."
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setDeleteTarget(null)}
                    style={{
                      padding: "8px 18px", borderRadius: 7, border: "1px solid var(--border)",
                      background: "transparent", color: "var(--text)", cursor: "pointer",
                      fontSize: 14, fontFamily: "inherit",
                    }}
                  >
                    ביטול
                  </button>
                  <button
                    onClick={confirmDelete}
                    style={{
                      padding: "8px 18px", borderRadius: 7, border: "none",
                      background: "var(--red, #ef4444)", color: "#fff", cursor: "pointer",
                      fontSize: 14, fontFamily: "inherit", fontWeight: 600,
                    }}
                  >
                    מחק
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── SectionBlock sub-component ────────────────────────────────────────────────
interface SectionBlockProps {
  section:             { key: BudgetType; label: string };
  rows:                TableRow[];
  subs:                any[];
  notes:               Record<string, string>;
  saving:              Record<string, boolean>;
  noteSaved:           Record<string, boolean>;
  avgOverrides:        Record<string, number>;
  monthOverrides:      Record<string, number>;
  editingAvg:          string | null;
  editVal:             string;
  editingMonth:        string | null;
  editMonthVal:        string;
  addingSection:       BudgetType | null;
  addName:             string;
  addAmount:           string;
  addSaving:           boolean;
  collapsed:           boolean;
  moneyCell:           (val: number) => React.CSSProperties;
  onNoteChange:        (cat: string, val: string) => void;
  onNoteBlur:          (cat: string, val: string) => void;
  onNoteCancel:        (cat: string) => void;
  onStartEditAvg:      (row: TableRow) => void;
  onSaveAvg:           (row: TableRow, val: string) => void;
  onCancelEdit:        () => void;
  onEditValChange:     (val: string) => void;
  onRevertAvg:         (row: TableRow) => void;
  onStartEditMonth:    (row: TableRow, mi: number) => void;
  onSaveMonth:         (row: TableRow, mi: number, val: string) => void;
  onCancelEditMonth:   () => void;
  onEditMonthValChange:(val: string) => void;
  onRevertMonth:       (row: TableRow, mi: number) => void;
  onOpenAddForm:       (key: BudgetType) => void;
  onCancelAdd:         () => void;
  onAddNameChange:     (val: string) => void;
  onAddAmountChange:   (val: string) => void;
  onAddSave:           () => void;
  onToggleCollapse:    () => void;
  editingName:         string | null;
  editNameVal:         string;
  onStartEditName:     (row: TableRow) => void;
  onSaveEditName:      (row: TableRow, newName: string) => void;
  onCancelEditName:    () => void;
  onEditNameValChange: (val: string) => void;
  onDeleteEstimate:    (row: TableRow) => void;
  sectionAvg:          number;
  getEffectiveAvg:     (row: TableRow) => number;
}

function SectionBlock({
  section, rows, subs, notes, saving, noteSaved, avgOverrides, monthOverrides,
  editingAvg, editVal, editingMonth, editMonthVal, addingSection, addName, addAmount, addSaving,
  collapsed, moneyCell, onNoteChange, onNoteBlur, onNoteCancel, onStartEditAvg, onSaveAvg, onCancelEdit,
  onEditValChange, onRevertAvg, onStartEditMonth, onSaveMonth, onCancelEditMonth,
  onEditMonthValChange, onRevertMonth, onOpenAddForm, onCancelAdd, onAddNameChange,
  onAddAmountChange, onAddSave, onToggleCollapse, editingName, editNameVal,
  onStartEditName, onSaveEditName, onCancelEditName, onEditNameValChange,
  onDeleteEstimate, sectionAvg, getEffectiveAvg,
}: SectionBlockProps) {
  const isIncome = section.key === 'הכנסה';
  const [hoveredCat,  setHoveredCat]  = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [noteOpen,    setNoteOpen]    = useState<string | null>(null);

  const accentColor = isIncome ? "#16a34a" : "#64748b";

  // Section subtotals per month — respects monthOverrides
  const monthTotals = [0, 1, 2].map(mi => {
    if (mi >= subs.length) return 0;
    const mk = subs[mi]?.month_key;
    return rows.reduce((s, r) => {
      if (r.isEstimate) return s;
      const mkKey = `${r.category}|${mk}`;
      return s + (monthOverrides[mkKey] ?? r.months[mi]);
    }, 0);
  });

  return (
    <>
      {/* Section header — click to collapse */}
      <tr
        id={`section-header-${section.key}`}
        onClick={onToggleCollapse}
        style={{
          background: isIncome ? "rgba(22,163,74,0.07)" : "rgba(0,0,0,0.04)",
          borderTop: "2px solid var(--border)",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <td colSpan={6} style={{
          padding: "10px 16px",
          fontWeight: 700,
          fontSize: 14,
          color: accentColor,
          letterSpacing: 0.4,
          borderRight: `3px solid ${accentColor}`,
        }}>
          <span>{section.label}</span>
          <span style={{ marginRight: 8, opacity: 0.5, fontSize: 11 }}>
            {collapsed ? "▸" : "▾"}
          </span>
          {collapsed && (
            <span style={{
              marginRight: 12, fontSize: 13, color: "var(--text)",
              fontWeight: 800, opacity: 0.85,
            }}>
              {fmt(sectionAvg)}
            </span>
          )}
        </td>
      </tr>

      {/* Category rows + add button — hidden when collapsed */}
      {!collapsed && (
        <>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{
                padding: "10px 20px",
                fontSize: 13,
                color: "var(--text-dim)",
                opacity: 0.5,
                fontStyle: "italic",
              }}>
                אין קטגוריות בסעיף זה
              </td>
            </tr>
          )}

          {rows.map((row, idx) => {
            const displayAvg     = getEffectiveAvg(row);
            const isEditingAvg   = editingAvg === row.category;
            const hasAvgOverride = !row.isEstimate && avgOverrides[row.category] !== undefined;
            const isRowHovered   = hoveredCat === row.category;
            const avgCellKey     = `${row.category}|avg`;
            const isAvgCellHovered = hoveredCell === avgCellKey;

            return (
              <tr
                key={row.category}
                onMouseEnter={(e) => { setHoveredCat(row.category); if (!row.isEstimate) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.022)"; }}
                onMouseLeave={(e) => { setHoveredCat(null); if (!row.isEstimate) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: row.isEstimate ? "rgba(251,191,36,0.04)" : "transparent",
                  transition: "background 0.1s",
                }}
              >
                {/* Category name */}
                <td style={{ padding: "10px 16px", verticalAlign: "middle" }}>
                  {row.isEstimate && editingName === row.category ? (
                    <input
                      autoFocus
                      value={editNameVal}
                      onChange={e => onEditNameValChange(e.target.value)}
                      onBlur={() => onSaveEditName(row, editNameVal)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.currentTarget.blur(); }
                        if (e.key === "Escape") { onCancelEditName(); }
                      }}
                      style={{
                        fontSize: 14, fontWeight: 500, padding: "3px 7px",
                        border: "1px solid var(--border)", borderRadius: 5,
                        background: "var(--surface2)", color: "var(--text)",
                        outline: "none", fontFamily: "inherit", width: "90%",
                        direction: "rtl",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{row.category}</span>
                      {row.isEstimate && (
                        <>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: "var(--gold)",
                            background: "rgba(251,191,36,0.15)", borderRadius: 4,
                            padding: "1px 6px", flexShrink: 0, letterSpacing: 0.2,
                          }}>
                            הערכה
                          </span>
                          {isRowHovered && (
                            <>
                              <button
                                onClick={() => onStartEditName(row)}
                                title="ערוך שם"
                                style={{
                                  fontSize: 12, padding: "1px 5px", border: "1px solid var(--border)",
                                  borderRadius: 4, background: "transparent", color: "var(--text-dim)",
                                  cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                                }}
                              >✎</button>
                              <button
                                onClick={() => onDeleteEstimate(row)}
                                title="מחק קטגוריה"
                                style={{
                                  fontSize: 12, padding: "1px 5px", border: "1px solid var(--border)",
                                  borderRadius: 4, background: "transparent", color: "var(--red, #ef4444)",
                                  cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                                }}
                              >✕</button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </td>

                {/* Per-month cells */}
                {[0, 1, 2].map(mi => {
                  const hasMonth = mi < subs.length;
                  if (!hasMonth) {
                    return <td key={mi} style={{ ...moneyCell(0), opacity: 0.22 }}>—</td>;
                  }
                  if (row.isEstimate) {
                    return <td key={mi} style={moneyCell(0)}>—</td>;
                  }

                  const mk             = subs[mi]?.month_key;
                  const mkKey          = `${row.category}|${mk}`;
                  const hasMonthOvr    = monthOverrides[mkKey] !== undefined;
                  const displayMonth   = monthOverrides[mkKey] ?? row.months[mi];
                  const editKey        = `${row.category}|${mi}`;
                  const isEditingMonth = editingMonth === editKey;
                  const cellHoverKey   = `${row.category}|month|${mi}`;
                  const isCellHovered  = hoveredCell === cellHoverKey;

                  return (
                    <td
                      key={mi}
                      onClick={() => !isEditingMonth && onStartEditMonth(row, mi)}
                      title={isEditingMonth ? undefined : "לחץ לעריכה"}
                      onMouseEnter={() => setHoveredCell(cellHoverKey)}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        ...moneyCell(displayMonth),
                        cursor: isEditingMonth ? "default" : "pointer",
                        position: "relative",
                        padding: isEditingMonth ? "4px 8px" : "10px 14px",
                        transition: "background 0.1s",
                        background: isCellHovered && !isEditingMonth ? "rgba(0,0,0,0.04)" : undefined,
                      }}
                    >
                      {isEditingMonth ? (
                        <input
                          autoFocus
                          value={editMonthVal}
                          onChange={e => onEditMonthValChange(e.target.value)}
                          onBlur={() => onSaveMonth(row, mi, editMonthVal)}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.currentTarget.blur(); }
                            if (e.key === "Escape") { onCancelEditMonth(); }
                          }}
                          style={{
                            width: 80, textAlign: "center", fontSize: 14, fontWeight: 500,
                            padding: "4px 6px", border: "1px solid var(--border)",
                            borderRadius: 5, background: "var(--surface2)",
                            color: "var(--text)", outline: "none", fontFamily: "inherit",
                          }}
                        />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>
                          <span
                            title={hasMonthOvr ? `מקור: ${fmt(row.months[mi])}` : undefined}
                            style={{
                              color:               hasMonthOvr ? "var(--green-mid, #2d6a4f)" : undefined,
                              fontWeight:          hasMonthOvr ? 600 : undefined,
                              textDecoration:      hasMonthOvr ? "underline" : undefined,
                              textDecorationStyle: hasMonthOvr ? "dashed" as const : undefined,
                              textDecorationColor: hasMonthOvr ? "var(--green-mid, #2d6a4f)" : undefined,
                              textUnderlineOffset: hasMonthOvr ? "3px" : undefined,
                              cursor:              hasMonthOvr ? "help" : undefined,
                            }}
                          >
                            {fmt(displayMonth)}
                          </span>
                          {hasMonthOvr && isCellHovered && (
                            <button
                              onClick={e => { e.stopPropagation(); onRevertMonth(row, mi); }}
                              title="איפוס לערך מקורי"
                              style={{
                                fontSize: 10, lineHeight: 1, padding: "1px 4px",
                                border: "1px solid var(--border)", borderRadius: 3,
                                background: "transparent", color: "var(--text-dim)",
                                cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                              }}
                            >↩</button>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* Average — editable */}
                <td
                  onClick={() => !isEditingAvg && onStartEditAvg(row)}
                  title={isEditingAvg ? undefined : "לחץ לעריכה"}
                  onMouseEnter={() => setHoveredCell(avgCellKey)}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    padding: isEditingAvg ? "4px 8px" : "10px 14px",
                    textAlign: "center",
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--text)",
                    borderLeft: "1px solid var(--border)",
                    cursor: isEditingAvg ? "default" : "pointer",
                    userSelect: "none",
                    position: "relative",
                    transition: "background 0.1s",
                    background: isAvgCellHovered && !isEditingAvg ? "rgba(0,0,0,0.04)" : undefined,
                  }}
                >
                  {isEditingAvg ? (
                    <input
                      autoFocus
                      value={editVal}
                      onChange={e => onEditValChange(e.target.value)}
                      onBlur={() => onSaveAvg(row, editVal)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.currentTarget.blur(); }
                        if (e.key === "Escape") { onCancelEdit(); }
                      }}
                      style={{
                        width: 80, textAlign: "center", fontSize: 14, fontWeight: 700,
                        padding: "4px 6px", border: "1px solid var(--border)",
                        borderRadius: 5, background: "var(--surface2)",
                        color: "var(--text)", outline: "none", fontFamily: "inherit",
                      }}
                    />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span
                          title={hasAvgOverride ? `מקור: ${fmt(row.avg)}` : undefined}
                          style={{
                            color:               hasAvgOverride ? "var(--green-mid, #2d6a4f)" : undefined,
                            textDecoration:      hasAvgOverride ? "underline" : undefined,
                            textDecorationStyle: hasAvgOverride ? "dashed" as const : undefined,
                            textDecorationColor: hasAvgOverride ? "var(--green-mid, #2d6a4f)" : undefined,
                            textUnderlineOffset: hasAvgOverride ? "3px" : undefined,
                            cursor:              hasAvgOverride ? "help" : undefined,
                          }}
                        >
                          {fmt(displayAvg)}
                        </span>
                        {row.isEstimate && (
                          <div style={{
                            fontSize: 10, color: "var(--gold)", fontWeight: 600,
                            marginTop: 2, letterSpacing: 0.2,
                          }}>
                            הערכה
                          </div>
                        )}
                      </div>
                      {hasAvgOverride && isAvgCellHovered && (
                        <button
                          onClick={e => { e.stopPropagation(); onRevertAvg(row); }}
                          title="איפוס לערך מקורי"
                          style={{
                            fontSize: 10, lineHeight: 1, padding: "1px 4px",
                            border: "1px solid var(--border)", borderRadius: 3,
                            background: "transparent", color: "var(--text-dim)",
                            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                          }}
                        >↩</button>
                      )}
                    </div>
                  )}
                </td>

                {/* Notes — inline text, click to edit */}
                <td style={{ padding: "6px 12px", verticalAlign: "middle", minWidth: 160 }}>
                  {noteOpen === row.category ? (
                    <div>
                      <textarea
                        autoFocus
                        value={notes[row.category] || ""}
                        onChange={e => onNoteChange(row.category, e.target.value)}
                        placeholder="הוסף הערה..."
                        rows={2}
                        style={{
                          width: "100%", resize: "none", border: "1px solid var(--border)",
                          borderRadius: 6, padding: "5px 8px", fontSize: 13,
                          fontFamily: "inherit", background: "var(--surface2)", color: "var(--text)",
                          lineHeight: 1.5, outline: "none", direction: "rtl", minHeight: 48,
                        }}
                        onBlur={() => {
                          onNoteBlur(row.category, notes[row.category] || "");
                          setNoteOpen(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            onNoteCancel(row.category);
                            setNoteOpen(null);
                          }
                        }}
                      />
                      {saving[row.category] && (
                        <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>שומר...</div>
                      )}
                    </div>
                  ) : (
                    <div
                      onClick={() => setNoteOpen(row.category)}
                      title="לחץ לעריכה"
                      style={{ cursor: "text", direction: "rtl" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = notes[row.category] ? "1" : "0.4"; }}
                    >
                      <div style={{
                        fontSize: 13,
                        color: notes[row.category] ? "var(--text)" : "var(--text-dim)",
                        opacity: notes[row.category] ? 1 : 0.4,
                        lineHeight: 1.45,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                        overflow: "hidden",
                        minHeight: 20,
                        transition: "opacity 0.1s",
                      }}>
                        {notes[row.category] || "הוסף הערה..."}
                      </div>
                      {noteSaved[row.category] && (
                        <div style={{ fontSize: 11, color: "var(--green, #16a34a)", marginTop: 2, fontWeight: 600 }}>
                          ✓ נשמר
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}

          {/* Add category row */}
          <tr>
            <td colSpan={6} style={{ padding: "3px 16px 6px" }}>
              {addingSection === section.key ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <input
                    autoFocus
                    value={addName}
                    onChange={e => onAddNameChange(e.target.value)}
                    placeholder="שם קטגוריה"
                    onKeyDown={e => { if (e.key === "Enter") onAddSave(); if (e.key === "Escape") onCancelAdd(); }}
                    style={{
                      fontSize: 13, padding: "4px 8px", border: "1px solid var(--border)",
                      borderRadius: 5, background: "var(--surface2)", color: "var(--text)",
                      outline: "none", fontFamily: "inherit", width: 140, direction: "rtl",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>₪</span>
                  <input
                    value={addAmount}
                    onChange={e => onAddAmountChange(e.target.value)}
                    placeholder="סכום חודשי"
                    type="number"
                    min="0"
                    onKeyDown={e => { if (e.key === "Enter") onAddSave(); if (e.key === "Escape") onCancelAdd(); }}
                    style={{
                      fontSize: 13, padding: "4px 8px", border: "1px solid var(--border)",
                      borderRadius: 5, background: "var(--surface2)", color: "var(--text)",
                      outline: "none", fontFamily: "inherit", width: 100, textAlign: "center",
                    }}
                  />
                  <button
                    onClick={onAddSave}
                    disabled={addSaving || !addName.trim() || !addAmount.trim()}
                    style={{
                      fontSize: 12, padding: "4px 12px", borderRadius: 5, border: "none",
                      background: "var(--green-mid, #2d6a4f)", color: "#fff",
                      cursor: addSaving ? "wait" : "pointer", fontFamily: "inherit",
                      opacity: (!addName.trim() || !addAmount.trim()) ? 0.5 : 1,
                    }}
                  >
                    {addSaving ? "שומר..." : "הוסף"}
                  </button>
                  <button
                    onClick={onCancelAdd}
                    style={{
                      fontSize: 12, padding: "4px 8px", borderRadius: 5,
                      border: "1px solid var(--border)", background: "transparent",
                      color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    ביטול
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onOpenAddForm(section.key)}
                  style={{
                    fontSize: 13, color: "var(--text-dim)", background: "transparent",
                    border: "1px dashed var(--border)", borderRadius: 6, cursor: "pointer",
                    padding: "5px 14px", fontFamily: "inherit", opacity: 1,
                    transition: "background 0.1s, border-color 0.1s, color 0.1s",
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = "rgba(0,0,0,0.03)";
                    e.currentTarget.style.borderColor = "var(--text-dim)";
                    e.currentTarget.style.color = "var(--text)";
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-dim)";
                  }}
                >
                  + הוסף קטגוריה
                </button>
              )}
            </td>
          </tr>
        </>
      )}

      {/* Subtotal row — BOTTOM of section (always visible) */}
      <tr style={{
        background: isIncome ? "rgba(22,163,74,0.05)" : "rgba(0,0,0,0.025)",
        borderTop: "1px solid var(--border)",
        borderBottom: "2px solid var(--border)",
      }}>
        <td style={{ padding: "9px 16px", fontSize: 13, color: "var(--text-dim)", fontWeight: 700 }}>
          סה"כ {section.label}
        </td>
        {[0, 1, 2].map(mi => (
          <td key={mi} style={{
            textAlign: "center",
            fontSize: 13,
            fontWeight: 600,
            padding: "9px 14px",
            color: monthTotals[mi] === 0 ? "var(--text-dim)" : "var(--text)",
            opacity: monthTotals[mi] === 0 ? 0.4 : 1,
          }}>
            {mi < subs.length ? fmt(monthTotals[mi]) : "—"}
          </td>
        ))}
        <td style={{
          textAlign: "center",
          fontWeight: 700,
          fontSize: 14,
          borderLeft: "1px solid var(--border)",
          padding: "9px 14px",
          color: "var(--text)",
        }}>
          {fmt(sectionAvg)}
        </td>
        <td />
      </tr>
    </>
  );
}

// ── MissingCatsPanel ──────────────────────────────────────────────────────────
interface MissingCatsPanelProps {
  missingCats: { name: string; budget_type: string }[];
  onAddChip:   (cat: { name: string; budget_type: string }) => void;
}

const SECTION_LABELS: Record<string, string> = {
  'הכנסה': 'הכנסות', 'קבוע': 'הוצאות קבועות', 'משתנה': 'הוצאות משתנות',
};

function MissingCatsPanel({ missingCats, onAddChip }: MissingCatsPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const grouped: Record<string, { name: string; budget_type: string }[]> = {
    'הכנסה': [], 'קבוע': [], 'משתנה': [],
  };
  missingCats.forEach(c => {
    const key = c.budget_type as BudgetType;
    if (grouped[key]) grouped[key].push(c);
  });

  return (
    <div style={{
      marginTop: 12,
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      direction: "rtl",
      overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded(prev => !prev)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "10px 18px", background: "transparent", border: "none",
          cursor: "pointer", fontFamily: "inherit", textAlign: "right",
          direction: "rtl", transition: "background 0.1s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,0,0,0.03)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
          {expanded ? "▾" : "▸"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
          הוסף קטגוריות מהרשימה
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: "var(--text-dim)",
          background: "var(--surface2)", borderRadius: 10, padding: "1px 7px",
        }}>
          {missingCats.length}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "4px 18px 14px", borderTop: "1px solid var(--border)" }}>
          {(['הכנסה', 'קבוע', 'משתנה'] as BudgetType[]).map(key => {
            const cats = grouped[key];
            if (cats.length === 0) return null;
            return (
              <div key={key} style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 6 }}>
                  {SECTION_LABELS[key]}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {cats.map(cat => (
                    <button
                      key={cat.name}
                      onClick={() => onAddChip(cat)}
                      style={{
                        fontSize: 12, padding: "4px 10px",
                        border: "1px solid var(--border)", borderRadius: 16,
                        background: "transparent", color: "var(--text)",
                        cursor: "pointer", fontFamily: "inherit",
                        transition: "background 0.1s, border-color 0.1s",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = "var(--surface2)";
                        e.currentTarget.style.borderColor = "var(--text-dim)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      {`+ ${cat.name}`}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
