import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

// ── helpers ───────────────────────────────────────────────────────────────────
const HEB_MONTHS = [
  "ינואר","פברואר","מרץ","אפריל","מאי","יוני",
  "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר",
];

function monthKeyToLabel(mk: string): string {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${HEB_MONTHS[parseInt(m) - 1]} ${y}`;
}

function fmt(n: number): string {
  if (n === 0) return "—";
  return `₪${Math.round(n).toLocaleString()}`;
}

function fmtSigned(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "—";
  const sign = r > 0 ? "+" : "";
  return `${sign}₪${r.toLocaleString()}`;
}

// ── types ─────────────────────────────────────────────────────────────────────
interface MachsanCategory {
  name: string;
  monthlyBudget: number;      // from scenario_items
  initialBalance: number;     // from machsan_initial_balance
  initialBalanceLocked: boolean; // true = already set, read-only
}

interface MonthData {
  monthKey: string;
  label: string;
  actual: number;       // sum of real transactions
  budgetRow: number;    // בקרה שנתית
  deficit: number;      // accumulated deficit at END of this month (negative = owed, positive = saved)
}

interface MachsanRow {
  cat: MachsanCategory;
  months: MonthData[];
  yearBalance: number;  // final accumulated deficit/surplus
}

// ── compute budget row logic ──────────────────────────────────────────────────
function computeMonths(
  monthlyBudget: number,
  initialBalance: number,
  monthActuals: { monthKey: string; actual: number }[]
): MonthData[] {
  let acc = initialBalance; // positive = surplus carry-in, negative = deficit carry-in
  const result: MonthData[] = [];

  for (const { monthKey, actual } of monthActuals) {
    const label = monthKeyToLabel(monthKey);
    let budgetRow: number;

    if (actual > monthlyBudget) {
      // Overspent: charge full actual, reduce acc by overage
      budgetRow = actual;
      acc -= (actual - monthlyBudget);
    } else {
      const surplus = monthlyBudget - actual;
      if (acc < 0) {
        // Has deficit: apply surplus towards payback
        const payback = Math.min(surplus, -acc);
        budgetRow = actual + payback;
        acc += payback;
      } else {
        // No deficit: charge full budget, accumulate surplus
        budgetRow = monthlyBudget;
        acc += surplus;
      }
    }

    result.push({ monthKey, label, actual, budgetRow, deficit: acc });
  }

  return result;
}

// ── initial balance cell ──────────────────────────────────────────────────────
function InitialBalanceCell({
  catName, clientId, value, locked, onSaved,
}: {
  catName: string;
  clientId: string | number;
  value: number;
  locked: boolean;
  onSaved: (val: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const num = parseFloat(draft.replace(/,/g, ""));
    if (isNaN(num)) { setEditing(false); return; }
    setSaving(true);
    await supabase.from("machsan_initial_balance").upsert(
      { client_id: clientId, category: catName, balance: num, set_at: new Date().toISOString() },
      { onConflict: "client_id,category" }
    );
    setSaving(false);
    setEditing(false);
    onSaved(num);
  };

  if (locked) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-dim)", fontSize: 13 }}>
        {fmt(value)}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}><title>יתרה ראשונית נעולה</title><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </span>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
        disabled={saving}
        style={{
          width: 80, fontSize: 13, textAlign: "center",
          border: "1px solid var(--green-mid)", borderRadius: 4,
          padding: "2px 4px", fontFamily: "inherit",
          outline: "none",
        }}
        placeholder="0"
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value !== 0 ? String(Math.round(value)) : ""); setEditing(true); }}
      title="לחץ להגדרת יתרת פתיחה (פעם אחת בלבד)"
      style={{
        background: "none", border: "1px dashed var(--border)", borderRadius: 4,
        padding: "2px 8px", fontSize: 13, cursor: "pointer",
        color: value !== 0 ? "var(--text)" : "var(--text-dim)",
        fontFamily: "inherit",
      }}
    >
      {value !== 0 ? fmt(value) : "הגדר"}
    </button>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function MachsanotTab({ client }: { client: any }) {
  const [loading, setLoading]           = useState(true);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [activeScenarioName, setActiveScenarioName] = useState("");
  const [machsanCats, setMachsanCats]   = useState<MachsanCategory[]>([]);
  const [monthKeys, setMonthKeys]       = useState<string[]>([]);
  const [txMap, setTxMap]               = useState<Record<string, Record<string, number>>>({});
  // localBalances: category → { value, locked }
  const [localBalances, setLocalBalances] = useState<Record<string, { value: number; locked: boolean }>>({});

  const clientId = client.id;

  const load = useCallback(async () => {
    setLoading(true);

    // 1. Fetch active scenario for this client
    const today = new Date().toISOString().slice(0, 10);
    const { data: activeSce } = await supabase
      .from("active_scenario")
      .select("scenario_id, scenarios(name)")
      .eq("client_id", clientId)
      .lte("active_from", today)
      .or(`active_until.is.null,active_until.gte.${today}`)
      .order("active_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeSce?.scenario_id) {
      setLoading(false);
      return;
    }

    const scenId = activeSce.scenario_id as string;
    setActiveScenarioId(scenId);
    setActiveScenarioName((activeSce as any).scenarios?.name || "");

    // 2. Fetch machsan categories + their budget from scenario_items (parallel)
    const [{ data: cats }, { data: items }, { data: initBals }] = await Promise.all([
      supabase.from("categories")
        .select("name")
        .eq("is_machsan", true)
        .eq("is_active", true)
        .is("client_id", null),
      supabase.from("scenario_items")
        .select("category_name, amount")
        .eq("scenario_id", scenId),
      supabase.from("machsan_initial_balance")
        .select("category, balance, set_at")
        .eq("client_id", clientId),
    ]);

    const machsanNames = new Set((cats || []).map((c: any) => c.name));
    if (machsanNames.size === 0) { setLoading(false); return; }

    // Build budget map from scenario_items
    const budgetMap: Record<string, number> = {};
    (items || []).forEach((it: any) => {
      if (machsanNames.has(it.category_name)) {
        budgetMap[it.category_name] = Number(it.amount) || 0;
      }
    });

    // Build initial balance map
    const initMap: Record<string, { value: number; locked: boolean }> = {};
    (initBals || []).forEach((b: any) => {
      initMap[b.category] = { value: Number(b.balance) || 0, locked: true };
    });
    setLocalBalances(initMap);

    // Build machsanCats list
    const catList: MachsanCategory[] = [...machsanNames].map(name => ({
      name,
      monthlyBudget: budgetMap[name] || 0,
      initialBalance: initMap[name]?.value || 0,
      initialBalanceLocked: initMap[name]?.locked || false,
    }));
    setMachsanCats(catList);

    // 3. Build transaction map from portfolio_submissions
    //    txMap[monthKey][categoryName] = total
    const txMapBuilt: Record<string, Record<string, number>> = {};
    const IGNORED = new Set(["להתעלם"]);
    const allMonthKeys = new Set<string>();

    (client.submissions || []).forEach((sub: any) => {
      const mk = sub.month_key;
      if (!mk) return;
      allMonthKeys.add(mk);
      if (!txMapBuilt[mk]) txMapBuilt[mk] = {};
      (sub.transactions || []).forEach((tx: any) => {
        if (IGNORED.has(tx.cat)) return;
        if (tx.flow_type === "credit_transfer") return;
        if (!machsanNames.has(tx.cat)) return;
        txMapBuilt[mk][tx.cat] = (txMapBuilt[mk][tx.cat] || 0) + Number(tx.amount || 0);
      });
    });

    const sortedMonthKeys = [...allMonthKeys].sort();
    setMonthKeys(sortedMonthKeys);
    setTxMap(txMapBuilt);
    setLoading(false);
  }, [clientId, client.submissions]);

  useEffect(() => { load(); }, [load]);

  // ── empty / loading states ────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 32, color: "var(--text-dim)", textAlign: "center" }}>טוען...</div>;
  }

  if (!activeScenarioId) {
    return (
      <div style={{
        padding: "48px 24px", textAlign: "center", color: "var(--text-dim)",
        background: "var(--surface2)", borderRadius: 12, marginTop: 8,
      }}>
        <div style={{ marginBottom: 16, opacity: 0.4, display: "flex", justifyContent: "center" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: "var(--text)" }}>
          אין תסריט פעיל
        </div>
        <div style={{ fontSize: 14 }}>
          שורות מחסנית רלוונטיות רק כאשר קיים תסריט תקציבי פעיל.
          <br />עבור לטאב "תסריט תקציבי" כדי להגדיר תסריט פעיל.
        </div>
      </div>
    );
  }

  if (machsanCats.length === 0) {
    return (
      <div style={{
        padding: "48px 24px", textAlign: "center", color: "var(--text-dim)",
        background: "var(--surface2)", borderRadius: 12, marginTop: 8,
      }}>
        <div style={{ marginBottom: 16, opacity: 0.4, display: "flex", justifyContent: "center" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, color: "var(--text)" }}>
          אין מחסניות מוגדרות
        </div>
        <div style={{ fontSize: 14 }}>
          כדי להגדיר קטגוריה כמחסנית — עבור ל"ניהול קטגוריות" ›  ערוך קטגוריה › סמן "מחסנית".
        </div>
      </div>
    );
  }

  // ── build rows ────────────────────────────────────────────────────────────
  const rows: MachsanRow[] = machsanCats.map(cat => {
    const balInfo = localBalances[cat.name];
    const initBal = balInfo?.value || 0;
    const locked  = balInfo?.locked || false;

    const monthActuals = monthKeys.map(mk => ({
      monthKey: mk,
      actual: txMap[mk]?.[cat.name] || 0,
    }));

    const months = computeMonths(cat.monthlyBudget, initBal, monthActuals);
    const yearBalance = months.length > 0 ? months[months.length - 1].deficit : initBal;

    return {
      cat: { ...cat, initialBalance: initBal, initialBalanceLocked: locked },
      months,
      yearBalance,
    };
  });

  // ── totals per month ──────────────────────────────────────────────────────
  const totalBudgetRow = monthKeys.map((_, mi) =>
    rows.reduce((s, r) => s + (r.months[mi]?.budgetRow || 0), 0)
  );
  const totalActual = monthKeys.map((_, mi) =>
    rows.reduce((s, r) => s + (r.months[mi]?.actual || 0), 0)
  );
  const totalYearBalance = rows.reduce((s, r) => s + r.yearBalance, 0);

  // ── cell styles ────────────────────────────────────────────────────────────
  const th: React.CSSProperties = {
    padding: "10px 14px", fontSize: 13, fontWeight: 600,
    color: "var(--text-dim)", textAlign: "center",
    borderBottom: "2px solid var(--border)", background: "var(--surface2)",
    whiteSpace: "nowrap",
  };
  const thFirst: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = {
    padding: "8px 12px", fontSize: 14, textAlign: "center",
    borderBottom: "1px solid var(--border)", verticalAlign: "middle",
  };
  const tdFirst: React.CSSProperties = { ...td, textAlign: "right", fontWeight: 600 };
  const tdSub: React.CSSProperties = {
    ...td, fontSize: 13, color: "var(--text-dim)",
  };

  const balanceColor = (n: number) =>
    n > 0 ? "var(--green-mid)" : n < 0 ? "var(--red)" : "var(--text-dim)";

  return (
    <div style={{ direction: "rtl" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h2 style={{
          fontFamily: "'Frank Ruhl Libre', serif", fontSize: 20,
          fontWeight: 700, margin: 0, color: "var(--text)",
        }}>
          ניהול מחסניות
        </h2>
        <span style={{
          fontSize: 13, color: "var(--green-mid)",
          background: "var(--green-pale)", borderRadius: 6,
          padding: "2px 10px", fontWeight: 600,
        }}>
          תסריט: {activeScenarioName}
        </span>
      </div>

      {/* Explainer */}
      <div style={{
        marginBottom: 20, padding: "12px 16px",
        background: "rgba(45,106,79,0.06)", border: "1px solid rgba(45,106,79,0.18)",
        borderRadius: 10, fontSize: 13, color: "var(--text-mid)", lineHeight: 1.65,
      }}>
        מחסנית = קטגוריה שהלקוח חוסך עבורה מדי חודש. גם חודש ללא הוצאה נחשב כ"הוכנס לקופה".{" "}
        <strong>שורת בקרה שנתית</strong> מחשבת מה צריך לספור לצורך יעד שנתי (כולל החזר גרעון מחודשים קודמים).{" "}
        <strong>שורת ניצול בפועל</strong> היא סכום התנועות האמיתי.
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--border)", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ ...thFirst, minWidth: 180 }}>קטגוריה</th>
              <th style={th}>יתרת פתיחה</th>
              {monthKeys.map(mk => (
                <th key={mk} style={th}>{monthKeyToLabel(mk)}</th>
              ))}
              <th style={{ ...th, color: "var(--text)" }}>יתרה שנתית</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const isLast = ri === rows.length - 1;
              const initBal = row.cat.initialBalance;
              const locked  = row.cat.initialBalanceLocked;

              return (
                <React.Fragment key={row.cat.name}>
                  {/* ── row: בקרה שנתית ── */}
                  <tr style={{ background: ri % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                    <td style={{ ...tdFirst, borderBottom: "none", paddingBottom: 2 }}>
                      {row.cat.name}
                      <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 400, marginTop: 1 }}>
                        תקציב: {fmt(row.cat.monthlyBudget)}/חודש
                      </div>
                    </td>
                    {/* יתרת פתיחה — editable first time */}
                    <td style={{ ...td, borderBottom: "none", paddingBottom: 2 }}>
                      <InitialBalanceCell
                        catName={row.cat.name}
                        clientId={clientId}
                        value={initBal}
                        locked={locked}
                        onSaved={val => {
                          setLocalBalances(prev => ({
                            ...prev,
                            [row.cat.name]: { value: val, locked: true },
                          }));
                        }}
                      />
                    </td>
                    {row.months.map(m => (
                      <td key={m.monthKey} style={{ ...td, borderBottom: "none", paddingBottom: 2, fontWeight: 600 }}>
                        {fmt(m.budgetRow)}
                      </td>
                    ))}
                    {/* שים לב: yearBalance מחושב מחדש בזמן render */}
                    <td style={{
                      ...td, borderBottom: "none", paddingBottom: 2,
                      fontWeight: 700, fontSize: 15,
                      color: balanceColor(row.yearBalance),
                    }}>
                      {fmtSigned(row.yearBalance)}
                    </td>
                  </tr>

                  {/* ── row: ניצול בפועל ── */}
                  <tr style={{ background: ri % 2 === 0 ? "var(--surface)" : "var(--surface2)", borderBottom: isLast ? "none" : "2px solid var(--border)" }}>
                    <td style={{ ...tdSub, paddingTop: 2, color: "var(--text-dim)", fontSize: 12 }}>
                      ניצול בפועל
                    </td>
                    <td style={{ ...tdSub, paddingTop: 2 }} />
                    {row.months.map(m => (
                      <td key={m.monthKey} style={{ ...tdSub, paddingTop: 2, color: m.actual > row.cat.monthlyBudget ? "var(--red)" : "var(--text-dim)" }}>
                        {fmt(m.actual)}
                      </td>
                    ))}
                    <td style={{ ...tdSub, paddingTop: 2 }} />
                  </tr>
                </React.Fragment>
              );
            })}

            {/* ── totals row ── */}
            <tr style={{ background: "rgba(45,106,79,0.06)", borderTop: "2px solid var(--border)" }}>
              <td style={{ ...tdFirst, fontWeight: 700, fontSize: 14 }}>סה"כ בקרה שנתית</td>
              <td style={td} />
              {totalBudgetRow.map((total, mi) => (
                <td key={mi} style={{ ...td, fontWeight: 700, fontSize: 14 }}>
                  {fmt(total)}
                </td>
              ))}
              <td style={{ ...td, fontWeight: 800, fontSize: 15, color: balanceColor(totalYearBalance) }}>
                {fmtSigned(totalYearBalance)}
              </td>
            </tr>
            <tr style={{ background: "rgba(45,106,79,0.03)" }}>
              <td style={{ ...tdSub, color: "var(--text-dim)", fontSize: 12 }}>סה"כ ניצול בפועל</td>
              <td style={td} />
              {totalActual.map((total, mi) => (
                <td key={mi} style={{ ...tdSub }}>
                  {fmt(total)}
                </td>
              ))}
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: "flex", gap: 20, fontSize: 12, color: "var(--text-dim)", flexWrap: "wrap" }}>
        <span>
          <strong style={{ color: "var(--green-mid)" }}>יתרה שנתית חיובית</strong> = עודף חיסכון
        </span>
        <span>
          <strong style={{ color: "var(--red)" }}>יתרה שנתית שלילית</strong> = גרעון מצטבר
        </span>
        <span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            יתרת פתיחה ניתנת להגדרה פעם אחת בלבד
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </span>
        </span>
      </div>
    </div>
  );
}
