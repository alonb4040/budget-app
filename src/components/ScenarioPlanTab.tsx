import React, { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { Card } from "../ui";

// ── helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "—";
  return `₪${r.toLocaleString()}`;
}
function fmtFull(n: number): string {
  return `₪${Math.round(n).toLocaleString()}`;
}

// Returns numeric order for chronological comparison; -1 means "unparseable"
function scenarioDateOrder(s: Scenario): number {
  if (s.date_type === "month_year") {
    const [m, y] = (s.date_value || "").split("/");
    const year = Number(y), month = Number(m);
    if (!year || !month) return -1;
    return year * 12 + month;
  }
  if (s.date_type === "year") {
    const year = Number(s.date_value) || YEAR_NOW; // match UI fallback
    return year * 12;
  }
  return -1;
}

// Returns the next chronological date after a given scenario
function nextDateAfter(s: Scenario): { date_type: DateType; date_value: string } {
  if (s.date_type === "year") {
    const y = Number(s.date_value);
    return { date_type: "year", date_value: String(y + 1) };
  }
  if (s.date_type === "month_year") {
    const [m, y] = s.date_value.split("/").map(Number);
    if (m >= 12) return { date_type: "month_year", date_value: `1/${y + 1}` };
    return { date_type: "month_year", date_value: `${m + 1}/${y}` };
  }
  return { date_type: "month_year", date_value: `${MONTH_NOW + 1}/${YEAR_NOW}` };
}

// Returns a date between two scenarios (or after prev if no next)
function dateBetween(prev: Scenario, next: Scenario | undefined): { date_type: DateType; date_value: string } {
  if (!next) return nextDateAfter(prev);
  const po = scenarioDateOrder(prev), no = scenarioDateOrder(next);
  if (po < 0 || no < 0) return nextDateAfter(prev);
  const mid = Math.floor((po + no) / 2);
  if (mid <= po) return nextDateAfter(prev); // no room — use next after prev
  const year = Math.floor(mid / 12);
  const month = mid - year * 12;
  if (month === 0) return { date_type: "year", date_value: String(year) };
  return { date_type: "month_year", date_value: `${month}/${year}` };
}

const YEAR_NOW = new Date().getFullYear();
const MONTH_NOW = new Date().getMonth(); // 0-based
const YEARS = Array.from({ length: 10 }, (_, i) => YEAR_NOW + i);

// ── types ─────────────────────────────────────────────────────────────────────
type BudgetType = "הכנסה" | "קבוע" | "משתנה";
type DateType = "month_year" | "year";

interface Scenario {
  id: string;
  title: string;
  date_type: DateType;
  date_value: string;
  sort_order: number;
}

interface AvgRow {
  category: string;
  avg: number;
  originalAvg?: number; // present when avg is overridden — used for tooltip
  budgetType: BudgetType;
  isEstimate: boolean;
}

interface EntryMap {
  [key: string]: number; // `${scenario_id}|${category}` → amount
}

interface RebudgetMap {
  [key: string]: string; // category → string amount (for controlled input)
}

const SECTIONS: { key: BudgetType; label: string }[] = [
  { key: "הכנסה",  label: "הכנסות"          },
  { key: "קבוע",   label: "הוצאות קבועות"   },
  { key: "משתנה",  label: "הוצאות משתנות"   },
];

// ── Delete confirm modal ───────────────────────────────────────────────────────
function DeleteConfirm({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1200 }} />
      <div role="dialog" aria-modal="true" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 360, background: "var(--surface)", borderRadius: 16,
        boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
        zIndex: 1201, padding: "28px 28px 22px", textAlign: "center",
        animation: "scenarioModalIn 180ms cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>אישור מחיקה</div>
        <div style={{ fontSize: 16, color: "var(--text-mid)", marginBottom: 24, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: message }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onCancel} style={{
            padding: "9px 20px", borderRadius: 9, border: "1px solid var(--border)",
            background: "none", fontFamily: "inherit", fontSize: 16, cursor: "pointer", color: "var(--text-mid)",
          }}>ביטול</button>
          <button onClick={onConfirm} style={{
            padding: "9px 20px", borderRadius: 9, border: "none",
            background: "var(--red)", color: "#fff", fontFamily: "inherit", fontSize: 16, fontWeight: 600, cursor: "pointer",
          }}>מחק</button>
        </div>
      </div>
      <style>{`@keyframes scenarioModalIn { from { transform:translate(-50%,-48%) scale(0.96); opacity:0; } to { transform:translate(-50%,-50%) scale(1); opacity:1; } } @keyframes toastIn { from { transform:translate(-50%,-12px); opacity:0; } to { transform:translate(-50%,0); opacity:1; } }`}</style>
    </>
  );
}

// ── Select that shows arrow only on hover ─────────────────────────────────────
function HoverSelect({ value, onChange, children }: {
  value: any;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <select
      value={value}
      onChange={onChange}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontSize: 14, border: "none", borderRadius: 6, padding: "4px 6px",
        background: "transparent", fontFamily: "inherit", color: "var(--text)",
        cursor: "pointer", outline: "none",
        WebkitAppearance: hovered ? undefined : "none" as any,
        MozAppearance: hovered ? undefined : "none" as any,
        appearance: hovered ? "auto" : ("none" as any),
        paddingLeft: hovered ? "20px" : "4px",
        transition: "padding 0.1s",
      }}
    >
      {children}
    </select>
  );
}

// ── Insert scenario gap columns (rounded white bars between scenarios) ─────────
const PlusSVG = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ display: "block" }}>
    <circle cx="9" cy="9" r="8" fill="#16a34a"/>
    <path d="M9 5v8M5 9h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

function InsertColTh({ onInsert }: { onInsert: () => void }) {
  const [h, setH] = useState(false);
  return (
    <th
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onInsert}
      title="הוסף תסריט כאן"
      style={{ width: 1, padding: 0, background: "transparent", cursor: "pointer", verticalAlign: "middle", whiteSpace: "nowrap" }}
    >
      <div style={{
        width: 16, minHeight: 56,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 4,
        background: h ? "rgba(22,163,74,0.1)" : "transparent",
        transition: "background 0.15s",
      }}>
        {h && <PlusSVG />}
      </div>
    </th>
  );
}

function InsertColTd({ onInsert }: { onInsert: () => void }) {
  const [h, setH] = useState(false);
  return (
    <td
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={onInsert}
      style={{ width: 1, padding: 0, background: "transparent", cursor: "pointer", whiteSpace: "nowrap" }}
    >
      <div style={{
        width: 16, minHeight: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 4,
        background: h ? "rgba(22,163,74,0.1)" : "transparent",
        transition: "background 0.15s",
      }}>
        {h && <PlusSVG />}
      </div>
    </td>
  );
}

// ── Date input for scenario header ────────────────────────────────────────────
const MONTHS_NUM = Array.from({ length: 12 }, (_, i) => i + 1);

function DateInput({ dateType, dateValue, onChange }: {
  dateType: DateType; dateValue: string;
  onChange: (type: DateType, value: string) => void;
}) {
  const cardStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 2,
    direction: "ltr",  // keeps 04/2026 order regardless of RTL context
    background: "#fff", border: "1px solid rgba(0,0,0,0.1)",
    borderRadius: 8, padding: "3px 8px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
    lineHeight: 1,
  };

  if (dateType === "month_year") {
    const [m, y] = dateValue ? dateValue.split("/") : [`${MONTH_NOW + 1}`, `${YEAR_NOW}`];
    return (
      <div style={cardStyle}>
        <HoverSelect value={m || `${MONTH_NOW + 1}`}
          onChange={e => onChange("month_year", `${e.target.value}/${y || YEAR_NOW}`)}>
          {MONTHS_NUM.map(mo => <option key={mo} value={mo}>{String(mo).padStart(2, "0")}</option>)}
        </HoverSelect>
        <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, userSelect: "none", opacity: 0.6 }}>/</span>
        <HoverSelect value={y || YEAR_NOW}
          onChange={e => onChange("month_year", `${m || MONTH_NOW + 1}/${e.target.value}`)}>
          {YEARS.map(yr => <option key={yr} value={yr}>{yr}</option>)}
        </HoverSelect>
      </div>
    );
  }
  // dateType === "year"
  return (
    <div style={cardStyle}>
      <HoverSelect value={dateValue || YEAR_NOW}
        onChange={e => onChange("year", e.target.value)}>
        {YEARS.map(yr => <option key={yr} value={yr}>{yr}</option>)}
      </HoverSelect>
    </div>
  );
}

// ── Scenario column header ────────────────────────────────────────────────────
function ScenarioHeader({ scenario, isActive, onUpdate, onDelete, onAddAfter, onToggleHide, onCopyFromRight, hasRightNeighbor, onInsertLeft }: {
  scenario: Scenario;
  isActive: boolean;
  onUpdate: (id: string, patch: Partial<Scenario>) => void;
  onDelete: (id: string) => void;
  onAddAfter: () => void;
  onToggleHide: () => void;
  onCopyFromRight: () => void;
  hasRightNeighbor: boolean;
  onInsertLeft?: () => void;
}) {
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState(scenario.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [hovered, setHovered] = useState(false);
  const [plusPos, setPlusPos] = useState({ top: 0, left: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouse = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onMouse); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const save = useCallback(() => {
    setEditTitle(false);
    if (title !== scenario.title) onUpdate(scenario.id, { title });
  }, [title, scenario.id, scenario.title, onUpdate]);

  return (
    <div
      ref={containerRef}
      style={{ minWidth: 130, padding: "0 12px 8px", position: "relative", marginLeft: -8, paddingLeft: 20 }}
      onMouseEnter={() => {
        setHovered(true);
        if (containerRef.current) {
          const r = containerRef.current.getBoundingClientRect();
          // Center the + in the 8px gap: 4px left of the th's left edge, adjusted for padding
          setPlusPos({ top: r.top + 20, left: r.left - 4 });
        }
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {onInsertLeft && hovered && (
        <button
          onClick={e => { e.stopPropagation(); onInsertLeft(); }}
          title="הוסף תסריט כאן"
          style={{
            position: "fixed", top: plusPos.top, left: plusPos.left,
            transform: "translateY(-50%)",
            zIndex: 30, background: "none", border: "none", padding: 0, cursor: "pointer",
            opacity: 0.85,
          }}
        >
          <PlusSVG />
        </button>
      )}
      <div style={{ height: 8 }} />
      {/* Title row with ⋯ menu */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4, marginBottom: 2 }}>
        {editTitle ? (
          <input autoFocus value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setTitle(scenario.title); setEditTitle(false); } }}
            style={{ flex: 1, fontSize: 15, fontWeight: 700, border: "none", borderBottom: "2px solid var(--green-mid)", background: "transparent", fontFamily: "inherit", color: "var(--text)", outline: "none" }} />
        ) : (
          <div onClick={() => setEditTitle(true)}
            style={{ fontSize: 15, fontWeight: 700, cursor: "text", color: "var(--text)", flex: 1 }}>
            {scenario.title}
          </div>
        )}
        {/* ⋯ dropdown menu */}
        <div ref={menuRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            ref={btnRef}
            onClick={() => {
              if (!menuOpen && btnRef.current) {
                const r = btnRef.current.getBoundingClientRect();
                setMenuPos({ top: r.bottom + 4, left: r.left });
              }
              setMenuOpen(p => !p);
            }}
            title="אפשרויות"
            aria-label="אפשרויות תסריט"
            style={{ fontSize: 18, lineHeight: 1, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, opacity: 0.5, transition: "opacity 0.1s" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "0.5"}
          >⋯</button>
          {menuOpen && (
            <div style={{
              position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              minWidth: 130, padding: "4px 0",
            }}>
              {(["שנה שם","הסתר",...(hasRightNeighbor ? ["העתק מהימני"] : []),"מחק"] as string[]).map(action => (
                <button key={action}
                  onClick={() => {
                    setMenuOpen(false);
                    if (action === "שנה שם") setEditTitle(true);
                    else if (action === "הסתר") onToggleHide();
                    else if (action === "העתק מהימני") onCopyFromRight();
                    else if (action === "מחק") onDelete(scenario.id);
                  }}
                  style={{ display: "block", width: "100%", textAlign: "right", padding: "7px 14px", fontSize: 15, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: action === "מחק" ? "var(--red)" : "var(--text)" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "var(--surface2)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
                >{action}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", minHeight: 26, marginBottom: 4, opacity: hovered ? 1 : 0, transition: "opacity 0.15s", pointerEvents: hovered ? "auto" : "none", alignItems: "center" }}>
      <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {(["month_year", "year"] as DateType[]).map((dt, idx) => (
          <button key={dt}
            onClick={() => onUpdate(scenario.id, { date_type: dt, date_value: dt === "year" ? String(YEAR_NOW) : `${MONTH_NOW + 1}/${YEAR_NOW}` })}
            style={{
              fontSize: 12, padding: "3px 9px", border: "none",
              borderLeft: idx === 1 ? "1px solid var(--border)" : "none",
              background: scenario.date_type === dt ? "var(--green-mint, #dcfce7)" : "transparent",
              color: scenario.date_type === dt ? "var(--green-deep, #166534)" : "var(--text-dim)",
              fontWeight: scenario.date_type === dt ? 700 : 400,
              cursor: "pointer", fontFamily: "inherit", transition: "background 0.12s",
            }}>
            {dt === "month_year" ? "חו׳+שנה" : "שנה"}
          </button>
        ))}
      </div>
      </div>
      <DateInput dateType={scenario.date_type} dateValue={scenario.date_value}
        onChange={(type, value) => onUpdate(scenario.id, { date_type: type, date_value: value })} />
    </div>
  );
}

// ── Missing categories chip panel ─────────────────────────────────────────────
function MissingCatsPanel({ globalCats, presentCats, onAdd }: {
  globalCats: { name: string; budget_type: string }[];
  presentCats: Set<string>;
  onAdd: (name: string, budgetType: BudgetType) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const missing = globalCats.filter(c => !presentCats.has(c.name));
  if (missing.length === 0) return null;

  return (
    <div style={{ marginBottom: 16, direction: "rtl" }}>
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          fontSize: 15, color: "var(--text-dim)", background: "none", border: "1px solid var(--border)",
          borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <span style={{ fontSize: 13, opacity: 0.7 }}>{expanded ? "▾" : "▸"}</span>
        {expanded ? "קטגוריות להוספה" : `${missing.length} קטגוריות נוספות`}
      </button>
      {expanded && (
        <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {missing.map(c => (
            <button
              key={c.name}
              onClick={() => onAdd(c.name, (c.budget_type as BudgetType) || "משתנה")}
              style={{
                fontSize: 15, padding: "4px 12px", borderRadius: 20,
                border: "1px solid var(--border)", background: "var(--surface2)",
                color: "var(--text)", cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.12s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--green-mid)"; (e.currentTarget as HTMLElement).style.color = "var(--green-mid)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
            >
              + {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ScenarioPlanTab({ client }: { client: any }) {
  const [loading, setLoading] = useState(true);
  const [avgRows, setAvgRows] = useState<AvgRow[]>([]);
  const [globalCats, setGlobalCats] = useState<{ name: string; budget_type: string }[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [entries, setEntries] = useState<EntryMap>({});
  const [rebudget, setRebudget] = useState<RebudgetMap>({});
  const [baseScenarioId, setBaseScenarioId] = useState<string | null>(null);
  const [savingEntry, setSavingEntry] = useState<string | null>(null);
  const rebudgetTimer = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const baseScenarioCreating = useRef(false);

  // cleanup debounce timers on unmount
  useEffect(() => {
    return () => { Object.values(rebudgetTimer.current).forEach(clearTimeout); };
  }, []);

  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "scenario" | "category"; id: string; hasSceEntries?: boolean } | null>(null);
  const [addingSection, setAddingSection] = useState<BudgetType | null>(null);
  const [addName, setAddName] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addingScenario, setAddingScenario] = useState(false);
  const [hiddenScenarios, setHiddenScenarios] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<BudgetType>>(new Set());
  const [dateOrderError, setDateOrderError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const arrowLeftRef  = useRef<HTMLDivElement>(null);
  const arrowRightRef = useRef<HTMLDivElement>(null);

  const clientId = client.id;

  // ── Load avg rows ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data: cats } = await supabase
        .from("categories")
        .select("name, budget_type, client_id")
        .or(`client_id.is.null,client_id.eq.${clientId}`)
        .eq("is_active", true);

      const catTypeMap: Record<string, string> = {};
      const allGlobal: { name: string; budget_type: string }[] = [];
      (cats || []).forEach((c: any) => {
        catTypeMap[c.name] = c.budget_type;
        if (!c.client_id) allGlobal.push({ name: c.name, budget_type: c.budget_type });
      });

      const { data: avgOvr } = await supabase
        .from("portfolio_avg_overrides")
        .select("category, override_avg")
        .eq("client_id", clientId);

      const avgOvrMap: Record<string, number> = {};
      (avgOvr || []).forEach((r: any) => { avgOvrMap[r.category] = Number(r.override_avg); });

      const { data: subs } = await supabase
        .from("submissions")
        .select("id, month_key, label, transactions")
        .eq("client_id", clientId)
        .order("month_key", { ascending: false })
        .limit(3);

      const subList = (subs || []) as Array<{ id: string; month_key: string; label?: string; transactions: any[] }>;

      const catTotals: Record<string, number> = {};
      const catMonths: Record<string, Set<string>> = {};
      subList.forEach(sub => {
        (sub.transactions || []).forEach((tx: any) => {
          const cat = tx.cat;
          if (!cat || cat === "להתעלם") return;
          catTotals[cat] = (catTotals[cat] || 0) + tx.amount;
          if (!catMonths[cat]) catMonths[cat] = new Set();
          catMonths[cat].add(sub.month_key);
        });
      });

      const realCats = new Set(Object.keys(catTotals));

      const realRows: AvgRow[] = Object.keys(catTotals).map(cat => {
        const months = catMonths[cat].size || 1;
        const rawAvg = catTotals[cat] / months;
        const hasOvr = avgOvrMap[cat] !== undefined;
        return {
          category: cat,
          avg: hasOvr ? avgOvrMap[cat] : rawAvg,
          originalAvg: hasOvr ? rawAvg : undefined,
          budgetType: (catTypeMap[cat] as BudgetType) || "משתנה",
          isEstimate: false,
        };
      });

      const estimates = (client.estimates || []) as Array<{ id: string; category_name: string; monthly_amount: number; budget_type?: string }>;
      const estRows: AvgRow[] = estimates
        .filter(e => !realCats.has(e.category_name))
        .map(e => {
          const hasOvr = avgOvrMap[e.category_name] !== undefined;
          const rawAvg = Number(e.monthly_amount);
          return {
            category: e.category_name,
            avg: hasOvr ? avgOvrMap[e.category_name] : rawAvg,
            originalAvg: hasOvr ? rawAvg : undefined,
            budgetType: (e.budget_type as BudgetType) || "משתנה",
            isEstimate: true,
          };
        });

      const estNames = new Set(estimates.map(e => e.category_name));
      const { data: personalCats } = await supabase
        .from("categories")
        .select("name, budget_type")
        .eq("client_id", clientId)
        .eq("is_active", true);

      const personalRows: AvgRow[] = (personalCats || [])
        .filter((c: any) => !realCats.has(c.name) && !estNames.has(c.name))
        .map((c: any) => {
          const hasOvr = avgOvrMap[c.name] !== undefined;
          return {
            category: c.name,
            avg: hasOvr ? avgOvrMap[c.name] : 0,
            originalAvg: undefined,
            budgetType: (c.budget_type as BudgetType) || "משתנה",
            isEstimate: true,
          };
        });

      if (!cancelled) {
        setAvgRows([...realRows, ...estRows, ...personalRows]);
        setGlobalCats(allGlobal);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [clientId, client.estimates]);

  // ── Load scenarios + entries + base scenario ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadScenarios() {
      const [{ data: sc }, { data: en }, { data: baseSc }] = await Promise.all([
        supabase.from("portfolio_scenarios")
          .select("id, title, date_type, date_value, sort_order")
          .eq("client_id", clientId)
          .eq("is_base", false)
          .order("sort_order", { ascending: true }),
        supabase.from("portfolio_scenario_entries")
          .select("scenario_id, category, amount")
          .eq("client_id", clientId),
        supabase.from("portfolio_scenarios")
          .select("id")
          .eq("client_id", clientId)
          .eq("is_base", true)
          .maybeSingle(),
      ]);

      if (!cancelled) {
        const sorted = (sc || []).slice().sort((a, b) => {
          const oa = scenarioDateOrder(a as Scenario), ob = scenarioDateOrder(b as Scenario);
          if (oa < 0 && ob < 0) return 0;
          if (oa < 0) return 1;
          if (ob < 0) return -1;
          return oa - ob;
        });
        setScenarios(sorted as Scenario[]);

        const baseId = (baseSc as any)?.id as string | undefined;
        setBaseScenarioId(baseId || null);

        // Split entries: base entries → rebudget, scenario entries → entries map
        const map: EntryMap = {};
        const rb: RebudgetMap = {};
        (en || []).forEach((e: any) => {
          if (baseId && e.scenario_id === baseId) {
            if (Number(e.amount) !== 0) rb[e.category] = String(Math.round(Number(e.amount)));
          } else {
            map[`${e.scenario_id}|${e.category}`] = Number(e.amount);
          }
        });
        setEntries(map);
        setRebudget(rb);
      }
    }

    loadScenarios();
    return () => { cancelled = true; };
  }, [clientId]);

  // ── Save rebudget (debounced, persisted via base scenario) ────────────────────
  const saveRebudgetEntry = useCallback(async (category: string, val: string) => {
    const amount = val === "" ? 0 : Number(val);
    if (isNaN(amount)) return;

    let bsId = baseScenarioId;
    if (!bsId) {
      // Guard against concurrent inserts — only one creation at a time
      if (baseScenarioCreating.current) return;
      baseScenarioCreating.current = true;
      const { data } = await supabase
        .from("portfolio_scenarios")
        .insert({ client_id: clientId, title: "תקצוב מחדש", is_base: true, date_type: "year", date_value: "", sort_order: -1 })
        .select("id")
        .maybeSingle();
      baseScenarioCreating.current = false;
      if (!data) return;
      bsId = (data as any).id;
      setBaseScenarioId(bsId);
    }

    await supabase.from("portfolio_scenario_entries").upsert(
      { scenario_id: bsId, client_id: clientId, category, amount },
      { onConflict: "scenario_id,category" }
    );
  }, [baseScenarioId, clientId]);

  const handleRebudgetChange = useCallback((cat: string, val: string) => {
    setRebudget(prev => ({ ...prev, [cat]: val }));
    if (rebudgetTimer.current[cat]) clearTimeout(rebudgetTimer.current[cat]);
    rebudgetTimer.current[cat] = setTimeout(() => saveRebudgetEntry(cat, val), 800);
  }, [saveRebudgetEntry]);

  // ── Grouped rows ──────────────────────────────────────────────────────────────
  const grouped = (() => {
    const g: Record<BudgetType, AvgRow[]> = { הכנסה: [], קבוע: [], משתנה: [] };
    avgRows.forEach(r => { g[r.budgetType].push(r); });
    return g;
  })();

  const getRebudget = (cat: string) => {
    const v = rebudget[cat];
    return v !== undefined && v !== "" ? Number(v) : null;
  };
  const effectiveAvg = (cat: string) => getRebudget(cat) ?? avgRows.find(r => r.category === cat)?.avg ?? 0;

  const sectionSum = (key: BudgetType, col: "avg" | "rebudget" | string) => {
    if (col === "avg") return grouped[key].reduce((s, r) => s + r.avg, 0);
    if (col === "rebudget") return grouped[key].reduce((s, r) => s + effectiveAvg(r.category), 0);
    return grouped[key].reduce((s, r) => s + (entries[`${col}|${r.category}`] ?? 0), 0);
  };

  // ── Add scenario ──────────────────────────────────────────────────────────────
  const addScenario = async () => {
    setAddingScenario(true);
    const sortOrder = scenarios.length;
    const lastScenario = scenarios[scenarios.length - 1];
    const defaultDate = lastScenario
      ? nextDateAfter(lastScenario)
      : { date_type: "month_year" as DateType, date_value: `${MONTH_NOW + 1}/${YEAR_NOW}` };
    const { data } = await supabase
      .from("portfolio_scenarios")
      .insert({ client_id: clientId, title: "תסריט חדש", ...defaultDate, sort_order: sortOrder, is_base: false })
      .select()
      .maybeSingle();
    if (data) setScenarios(prev => [...prev, data as Scenario]);
    setAddingScenario(false);
  };

  const addScenarioBetween = useCallback(async (afterId: string) => {
    const idx = scenarios.findIndex(s => s.id === afterId);
    if (idx < 0) return;
    const curr = scenarios[idx];
    const next = scenarios[idx + 1];
    const newSortOrder = next ? (curr.sort_order + next.sort_order) / 2 : curr.sort_order + 1;
    const defaultDate = dateBetween(curr, next);
    setAddingScenario(true);
    const { data } = await supabase
      .from("portfolio_scenarios")
      .insert({ client_id: clientId, title: "תסריט חדש", ...defaultDate, sort_order: newSortOrder, is_base: false })
      .select()
      .maybeSingle();
    if (data) {
      setScenarios(prev => {
        const next2 = [...prev];
        next2.splice(idx + 1, 0, data as Scenario);
        return next2;
      });
    }
    setAddingScenario(false);
  }, [scenarios, clientId]);

  const copyFromRight = useCallback(async (id: string) => {
    const idx = scenarios.findIndex(s => s.id === id);
    // In RTL: scenarios[0] is rightmost visually → right neighbor of scenarios[i] is scenarios[i-1]
    if (idx <= 0) return;
    const rightNeighbor = scenarios[idx - 1];
    if (hiddenScenarios.has(rightNeighbor.id)) {
      setDateOrderError("התסריט הימני מוסתר — הצג אותו תחילה כדי להעתיק ממנו");
      setTimeout(() => setDateOrderError(null), 3500);
      return;
    }
    const newEntries: EntryMap = { ...entries };
    const upserts: any[] = [];
    avgRows.forEach(row => {
      const srcKey = `${rightNeighbor.id}|${row.category}`;
      const dstKey = `${id}|${row.category}`;
      const val = entries[srcKey] ?? 0;
      newEntries[dstKey] = val;
      if (val !== 0) upserts.push({ scenario_id: id, client_id: clientId, category: row.category, amount: val });
    });
    setEntries(newEntries);
    if (upserts.length > 0) {
      await supabase.from("portfolio_scenario_entries").upsert(upserts, { onConflict: "scenario_id,category" });
    }
  }, [scenarios, entries, avgRows, clientId, hiddenScenarios]);

  const toggleHideScenario = useCallback((id: string) => {
    setHiddenScenarios(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const updateScenario = useCallback(async (id: string, patch: Partial<Scenario>) => {
    // Chronological validation when date changes — check only against neighbors
    if (patch.date_type !== undefined || patch.date_value !== undefined) {
      const idx = scenarios.findIndex(s => s.id === id);
      const updatedS = { ...scenarios[idx], ...patch };
      const updOrd = scenarioDateOrder(updatedS);
      if (updOrd >= 0) {
        const prev = idx > 0 ? scenarios[idx - 1] : null;
        const next = idx < scenarios.length - 1 ? scenarios[idx + 1] : null;
        const prevOrd = prev ? scenarioDateOrder(prev) : -1;
        const nextOrd = next ? scenarioDateOrder(next) : -1;
        if (prevOrd >= 0 && updOrd <= prevOrd) {
          setDateOrderError(`התאריך חייב להיות אחרי "${prev!.title}" (${prev!.date_value})`);
          return;
        }
        if (nextOrd >= 0 && updOrd >= nextOrd) {
          setDateOrderError(`התאריך חייב להיות לפני "${next!.title}" (${next!.date_value})`);
          return;
        }
      }
      setDateOrderError(null);
    }
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    await supabase.from("portfolio_scenarios").update(patch).eq("id", id);
  }, [scenarios]);

  const deleteScenario = async (id: string) => {
    await supabase.from("portfolio_scenarios").delete().eq("id", id);
    setScenarios(prev => prev.filter(s => s.id !== id));
    setEntries(prev => {
      const next = { ...prev };
      Object.keys(next).filter(k => k.startsWith(`${id}|`)).forEach(k => delete next[k]);
      return next;
    });
    setDeleteConfirm(null);
  };

  // ── Delete category ───────────────────────────────────────────────────────────
  const deleteCategory = async (cat: string) => {
    await supabase.from("category_estimates").delete().eq("client_id", clientId).eq("category_name", cat);
    setAvgRows(prev => prev.filter(r => r.category !== cat));
    setEntries(prev => {
      const next = { ...prev };
      Object.keys(next).filter(k => k.endsWith(`|${cat}`)).forEach(k => delete next[k]);
      return next;
    });
    setDeleteConfirm(null);
  };

  // ── Save scenario entry ───────────────────────────────────────────────────────
  const saveEntry = useCallback(async (scenarioId: string, category: string, rawVal: string) => {
    const val = rawVal === "" ? 0 : Number(rawVal);
    if (isNaN(val) || val < 0) return;
    const key = `${scenarioId}|${category}`;
    setSavingEntry(key);
    setEntries(prev => ({ ...prev, [key]: val }));
    await supabase.from("portfolio_scenario_entries").upsert(
      { scenario_id: scenarioId, client_id: clientId, category, amount: val },
      { onConflict: "scenario_id,category" }
    );
    setSavingEntry(null);
  }, [clientId]);

  // ── Scroll overflow indicator — direct DOM, no React state ───────────────────
  const checkScroll = useCallback(() => {
    const el = document.querySelector<HTMLDivElement>("[data-scenario-scroll]");
    if (!el) return;
    const sl = el.scrollLeft;
    const canEnd   = Math.abs(sl) + el.clientWidth < el.scrollWidth - 5;
    const canStart = sl < -5;
    const leftDiv  = document.querySelector<HTMLDivElement>("[data-arrow-left]");
    const rightDiv = document.querySelector<HTMLDivElement>("[data-arrow-right]");
    if (leftDiv)  leftDiv.style.opacity  = canEnd   ? "1" : "0";
    if (rightDiv) rightDiv.style.opacity = canStart ? "1" : "0";
  }, []);

  useEffect(() => {
    if (loading) return;
    const el = document.querySelector<HTMLDivElement>("[data-scenario-scroll]");
    if (!el) return;
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    const table = el.querySelector("table");
    const ro = new ResizeObserver(checkScroll);
    if (table) ro.observe(table);
    requestAnimationFrame(() => requestAnimationFrame(checkScroll));
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, scenarios, loading]);

  // ── Add category ──────────────────────────────────────────────────────────────
  const handleAddCategory = useCallback(async (name: string, budgetType: BudgetType) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAddSaving(true);

    // Persist to category_estimates so the category survives page reload
    await supabase.from("category_estimates").upsert(
      { client_id: clientId, category_name: trimmed, monthly_amount: 0, budget_type: budgetType },
      { onConflict: "client_id,category_name" }
    );

    const exists = avgRows.find(r => r.category === trimmed);
    if (!exists) {
      setAvgRows(prev => [...prev, { category: trimmed, avg: 0, budgetType, isEstimate: true }]);
    }
    setAddName("");
    setAddingSection(null);
    setAddSaving(false);
  }, [clientId, avgRows]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) {
    return <div style={{ padding: 32, color: "var(--text-dim)", textAlign: "center" }}>טוען...</div>;
  }

  const presentCats = new Set(avgRows.map(r => r.category));
  const totalCols = 3 + scenarios.length;

  // Active scenario = last scenario whose date has passed (≤ today).
  // If all are future, pick the nearest upcoming one.
  const todayOrder = YEAR_NOW * 12 + (MONTH_NOW + 1);
  const activeScenarioId = (() => {
    if (scenarios.length === 0) return null;
    let bestId: string | null = null;
    let bestOrd = -Infinity;
    for (const s of scenarios) {
      const ord = scenarioDateOrder(s);
      if (ord < 0) continue;
      if (ord <= todayOrder && ord > bestOrd) { bestOrd = ord; bestId = s.id; }
    }
    if (!bestId) {
      let minDist = Infinity;
      for (const s of scenarios) {
        const ord = scenarioDateOrder(s);
        if (ord < 0) continue;
        const dist = ord - todayOrder;
        if (dist > 0 && dist < minDist) { minDist = dist; bestId = s.id; }
      }
    }
    return bestId;
  })();

  // Card border helpers for scenario columns
  const cardBorder = (sId: string) =>
    `1px solid ${sId === activeScenarioId ? "rgba(22,163,74,0.5)" : "rgba(0,0,0,0.13)"}`;

  // Render scenario cells (no insert columns — gaps come from borderSpacing)
  const scenarioCols = (renderFn: (s: Scenario, idx: number) => React.ReactNode) =>
    scenarios.map((s, i) => renderFn(s, i));

  return (
    <div style={{ direction: "rtl" }}>

      {deleteConfirm && (
        <DeleteConfirm
          message={
            deleteConfirm.type === "scenario"
              ? "למחוק את התסריט הזה?<br/><span style='font-size:12px;color:var(--text-dim)'>כל הנתונים שהוזנו יאבדו</span>"
              : deleteConfirm.hasSceEntries
                ? "למחוק את הקטגוריה?<br/><span style='font-size:12px;color:var(--text-dim)'>הקטגוריה מופיעה בתסריטים — המחיקה תסיר אותה מכולם</span>"
                : "למחוק את הקטגוריה?"
          }
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            if (deleteConfirm.type === "scenario") deleteScenario(deleteConfirm.id);
            else deleteCategory(deleteConfirm.id);
          }}
        />
      )}

      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
        <button onClick={addScenario} disabled={addingScenario}
          style={{
            fontSize: 15, padding: "6px 16px", borderRadius: 20,
            border: "none", background: "var(--green-mid)",
            color: "#fff", cursor: "pointer", fontFamily: "inherit",
            fontWeight: 600, opacity: addingScenario ? 0.6 : 1, transition: "opacity 0.15s",
          }}>
          + תסריט
        </button>
      </div>

      {dateOrderError && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "#fff", border: "1px solid #fde68a",
          borderRadius: 14, padding: "14px 20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex", alignItems: "center", gap: 12, direction: "rtl",
          animation: "toastIn 0.2s cubic-bezier(0.16,1,0.3,1)",
          minWidth: 300, maxWidth: 440,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#92400e" }}>שגיאת כרונולוגיה</div>
            <div style={{ fontSize: 15, color: "#78350f", marginTop: 3, lineHeight: 1.4 }}>{dateOrderError}</div>
          </div>
          <button onClick={() => setDateOrderError(null)}
            style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "#78350f", padding: "2px 6px", opacity: 0.5, flexShrink: 0, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        {/* Left fade + arrow — scroll further into scenarios */}
        <div ref={arrowLeftRef} data-arrow-left style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: 56, zIndex: 10,
          background: "linear-gradient(to right, rgba(240,244,240,0.97) 0%, transparent 100%)",
          pointerEvents: "none", opacity: 0,
          transition: "opacity 0.2s ease",
          display: "flex", alignItems: "flex-start", justifyContent: "flex-start",
          paddingLeft: 6, paddingTop: 56,
        }}>
          <button
            onClick={() => { if (scrollContainerRef.current) { scrollContainerRef.current.scrollLeft -= 320; checkScroll(); } }}
            style={{
              pointerEvents: "all", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 99, width: 30, height: 30, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)", color: "var(--text-dim)",
              fontSize: 18, lineHeight: 1, flexShrink: 0,
            }}
            aria-label="גלול שמאלה"
          >‹</button>
        </div>

        {/* Right fade + arrow — scroll back toward categories */}
        <div ref={arrowRightRef} data-arrow-right style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 56, zIndex: 10,
          background: "linear-gradient(to left, rgba(240,244,240,0.97) 0%, transparent 100%)",
          pointerEvents: "none", opacity: 0,
          transition: "opacity 0.2s ease",
          display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
          paddingRight: 6, paddingTop: 56,
        }}>
          <button
            onClick={() => { if (scrollContainerRef.current) { scrollContainerRef.current.scrollLeft += 320; checkScroll(); } }}
            style={{
              pointerEvents: "all", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 99, width: 30, height: 30, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.12)", color: "var(--text-dim)",
              fontSize: 18, lineHeight: 1, flexShrink: 0,
            }}
            aria-label="גלול ימינה"
          >›</button>
        </div>

      <div ref={scrollContainerRef} data-scenario-scroll style={{ overflowX: "auto" }}>
      <Card style={{ padding: 0 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: "8px 0", minWidth: "100%", width: "max-content", tableLayout: "fixed", fontSize: 16, background: "var(--surface)" }}>
          <colgroup>
            <col style={{ width: 190 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 140 }} />
            {scenarios.map(s => (
              <col key={s.id} style={{ width: hiddenScenarios.has(s.id) ? 28 : 210 }} />
            ))}
          </colgroup>

          <thead>
            <tr style={{ background: "transparent" }}>
              <th style={{
                position: "sticky", right: 0, zIndex: 2, background: "#dde8dd",
                padding: "13px 20px", fontSize: 18, fontWeight: 700, color: "#2d5a2d",
                textAlign: "right",
                boxShadow: "#dde8dd -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px",
                borderTop: "2px solid #b8d4b8", borderBottom: "2px solid #b8d4b8",
                borderRight: "2px solid #b8d4b8",
                borderRadius: "0 10px 0 0",
              }}>קטגוריה</th>
              <th style={{
                padding: "13px 20px", fontSize: 16, fontWeight: 600, color: "#4a7a4a",
                textAlign: "center", background: "#dde8dd",
                borderTop: "2px solid #b8d4b8", borderBottom: "2px solid #b8d4b8",
                borderLeft: "2px solid #b8d4b8", borderRight: "2px solid #b8d4b8",
                borderRadius: "10px 10px 0 0", overflow: "hidden",
              }}>
                ממוצע חודשי
              </th>
              <th style={{
                padding: "13px 20px", fontSize: 16, fontWeight: 600, color: "#4a7a4a",
                textAlign: "center", background: "#dde8dd",
                borderTop: "2px solid #b8d4b8", borderBottom: "2px solid #b8d4b8",
                borderLeft: "2px solid #b8d4b8", borderRight: "2px solid #b8d4b8",
                borderRadius: "10px 10px 0 0", overflow: "hidden",
              }}>
                תקצוב מחדש
              </th>
              {scenarios.map((s, idx) => {
                const isHidden = hiddenScenarios.has(s.id);
                const isActiveScenario = s.id === activeScenarioId;
                const th = isHidden ? (
                  <th key={s.id} style={{
                    width: 28, padding: "4px 0", textAlign: "center", verticalAlign: "middle",
                    background: "rgba(0,0,0,0.02)",
                    borderTop: "1px solid rgba(0,0,0,0.1)", borderBottom: "1px solid rgba(0,0,0,0.1)",
                    borderLeft: "1px solid rgba(0,0,0,0.1)", borderRight: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: "8px 8px 0 0", overflow: "hidden",
                  }}>
                    <button
                      title={`הצג "${s.title}"`}
                      aria-label={`הצג תסריט ${s.title}`}
                      onClick={() => toggleHideScenario(s.id)}
                      style={{ writingMode: "vertical-rl", fontSize: 12, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: "8px 4px", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden", maxHeight: 80, opacity: 0.6 }}
                    >
                      {s.title}
                    </button>
                  </th>
                ) : (
                  <th key={s.id} style={{
                    padding: 0, fontWeight: 400, textAlign: "center", verticalAlign: "top",
                    borderTop: cardBorder(s.id),
                    borderLeft: cardBorder(s.id),
                    borderRight: cardBorder(s.id),
                    borderBottom: "none",
                    borderRadius: "10px 10px 0 0",
                    background: isActiveScenario ? "rgba(22,163,74,0.06)" : "rgba(0,0,0,0.015)",
                    position: "relative", zIndex: 0,
                  }}>
                    {isActiveScenario && (
                      <div style={{
                        background: "var(--green-mid, #16a34a)",
                        color: "#fff",
                        fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
                        textAlign: "center", padding: "5px 0",
                        textTransform: "uppercase" as const,
                        userSelect: "none",
                      }}>
                        תסריט פעיל
                      </div>
                    )}
                    <ScenarioHeader
                      scenario={s}
                      isActive={isActiveScenario}
                      onUpdate={updateScenario}
                      onDelete={id => {
                        const hasEntries = Object.keys(entries).some(k => k.startsWith(`${id}|`));
                        setDeleteConfirm({ type: "scenario", id, hasSceEntries: hasEntries });
                      }}
                      onAddAfter={() => addScenarioBetween(s.id)}
                      onToggleHide={() => toggleHideScenario(s.id)}
                      onCopyFromRight={() => copyFromRight(s.id)}
                      hasRightNeighbor={idx > 0}
                      onInsertLeft={idx < scenarios.length - 1 ? () => addScenarioBetween(s.id) : undefined}
                    />
                  </th>
                );
                return th;
              })}
            </tr>
          </thead>

          <tbody>
            {SECTIONS.map(section => {
              const rows = grouped[section.key];
              const isCollapsed = collapsedSections.has(section.key);
              const accentColor = section.key === "הכנסה" ? "#16a34a" : "#64748b";
              const avgTotal      = sectionSum(section.key, "avg");
              const rebudgetTotal = sectionSum(section.key, "rebudget");

              return (
                <React.Fragment key={section.key}>
                  <tr
                    onClick={() => setCollapsedSections(prev => { const next = new Set(prev); if (next.has(section.key)) next.delete(section.key); else next.add(section.key); return next; })}
                    style={{ background: "transparent", cursor: "pointer" }}
                  >
                    <td colSpan={totalCols} style={{
                      padding: "9px 20px", fontWeight: 700, fontSize: 15,
                      color: accentColor, borderRight: `3px solid ${accentColor}`,
                      background: "#eef4ee",
                      borderTop: "2px solid #b8d4b8", borderBottom: "1px solid rgba(0,0,0,0.06)",
                      userSelect: "none",
                    }}>
                      <span style={{ marginLeft: 8, fontSize: 13, opacity: 0.6 }}>{isCollapsed ? "▸" : "▾"}</span>
                      {section.label}
                      {isCollapsed && <span style={{ marginRight: 8, fontSize: 13, fontWeight: 400, color: "var(--text-dim)" }}>({rows.length} קטגוריות)</span>}
                    </td>
                  </tr>

                  {!isCollapsed && (rows.length === 0 ? (
                    <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <td style={{
                        position: "sticky", right: 0, zIndex: 1, background: "var(--surface)",
                        padding: "14px 20px", fontSize: 15, color: "var(--text-dim)",
                        boxShadow: "rgb(255,255,255) -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px", whiteSpace: "nowrap",
                      }}>
                        {section.key === "הכנסה" ? "לא נמצאו עסקאות הכנסה · בדוק מיפויים" : "אין קטגוריות"}
                      </td>
                      <td colSpan={totalCols - 1} />
                    </tr>
                  ) : rows.map(row => (
                    <CategoryRow
                      key={row.category}
                      row={row}
                      rebudgetVal={rebudget[row.category] ?? ""}
                      scenarios={scenarios}
                      hiddenScenarios={hiddenScenarios}
                      entries={entries}
                      savingEntry={savingEntry}
                      activeScenarioId={activeScenarioId}
                      onRebudgetChange={handleRebudgetChange}
                      onCopyAvg={() => handleRebudgetChange(row.category, String(Math.round(row.avg)))}
                      onSaveEntry={saveEntry}
                      onAddBetween={addScenarioBetween}
                      onDelete={cat => {
                        const hasSceEntries = Object.keys(entries).some(k => k.endsWith(`|${cat}`));
                        setDeleteConfirm({ type: "category", id: cat, hasSceEntries });
                      }}
                    />
                  )))}

                  {/* Add category row */}
                  {!isCollapsed && <tr>
                    <td colSpan={totalCols} style={{ padding: "4px 16px" }}>
                      {addingSection === section.key ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0" }}>
                          <input autoFocus value={addName}
                            onChange={e => setAddName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleAddCategory(addName, section.key); if (e.key === "Escape") { setAddingSection(null); setAddName(""); } }}
                            placeholder="שם הקטגוריה"
                            style={{ fontSize: 15, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--green-mid)", outline: "none", fontFamily: "inherit", background: "var(--surface)", color: "var(--text)" }} />
                          <button onClick={() => handleAddCategory(addName, section.key)} disabled={addSaving || !addName.trim()}
                            style={{ fontSize: 15, padding: "5px 12px", borderRadius: 7, border: "none", background: "var(--green-mid)", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                            הוסף
                          </button>
                          <button onClick={() => { setAddingSection(null); setAddName(""); }}
                            style={{ fontSize: 15, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--text-dim)" }}>
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingSection(section.key); setAddName(""); }}
                          style={{ fontSize: 15, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "5px 8px", opacity: 0.5, borderRadius: 6, transition: "opacity 0.15s, background 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "0.5"; (e.currentTarget as HTMLElement).style.background = "none"; }}>
                          + הוסף קטגוריה
                        </button>
                      )}
                    </td>
                  </tr>}

                  {/* Section subtotal */}
                  <tr style={{ background: "transparent" }}>
                    <td style={{
                      position: "sticky", right: 0, zIndex: 1, background: "var(--surface)",
                      padding: "7px 20px", fontSize: 14, fontWeight: 600, color: accentColor,
                      boxShadow: "rgb(255,255,255) -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px",
                      borderTop: "1px solid rgba(0,0,0,0.07)", borderBottom: "1px solid rgba(0,0,0,0.07)",
                    }}>סה״כ {section.label}</td>
                    <td style={{
                      textAlign: "center", fontSize: 15, fontWeight: 700, padding: "7px 20px",
                      color: accentColor, background: "rgba(0,0,0,0.015)", fontVariantNumeric: "tabular-nums" as const,
                      borderTop: "1px solid rgba(0,0,0,0.07)", borderBottom: "1px solid rgba(0,0,0,0.07)",
                    }}>
                      {fmt(avgTotal)}
                      {section.key === "הכנסה" && avgTotal === 0 && (
                        <span title="לא נמצאו עסקאות הכנסה — בדוק מיפויים" style={{ marginRight: 6, fontSize: 13, fontWeight: 700, color: "#f59e0b", cursor: "help" }}>!</span>
                      )}
                    </td>
                    <td style={{
                      textAlign: "center", fontSize: 15, fontWeight: 700, padding: "7px 20px",
                      color: accentColor, fontVariantNumeric: "tabular-nums" as const,
                      borderTop: "1px solid rgba(0,0,0,0.07)", borderBottom: "1px solid rgba(0,0,0,0.07)",
                      borderLeft: "2px solid #b8d4b8",
                    }}>{fmt(rebudgetTotal)}</td>
                    {scenarioCols((s) => hiddenScenarios.has(s.id) ? (
                      <td key={s.id} style={{ background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.07)", borderBottom: "1px solid rgba(0,0,0,0.07)" }} />
                    ) : (
                      <td key={s.id} style={{
                        textAlign: "center", fontSize: 15, fontWeight: 700, padding: "7px 20px",
                        color: accentColor,
                        borderLeft: cardBorder(s.id), borderRight: cardBorder(s.id),
                        borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)",
                        background: s.id === activeScenarioId ? "rgba(22,163,74,0.06)" : "rgba(0,0,0,0.015)",
                        fontVariantNumeric: "tabular-nums" as const,
                      }}>
                        {fmt(sectionSum(section.key, s.id))}
                      </td>
                    ))}
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Balance row */}
            {(() => {
              const incAvg  = sectionSum("הכנסה", "avg");
              const expAvg  = sectionSum("קבוע", "avg") + sectionSum("משתנה", "avg");
              const balAvg  = incAvg - expAvg;
              const incRb   = sectionSum("הכנסה", "rebudget");
              const expRb   = sectionSum("קבוע", "rebudget") + sectionSum("משתנה", "rebudget");
              const balRb   = incRb - expRb;
              const isPos = balAvg >= 0;
              const bannerBg = isPos ? "#16a34a" : "#fef2f2";
              const stickyBg = isPos ? "#16a34a" : "#fef2f2";
              const labelColor = isPos ? "rgba(255,255,255,0.8)" : "#991b1b";
              const numColor   = isPos ? "#fff" : "#dc2626";
              const divColor   = isPos ? "rgba(255,255,255,0.2)" : "rgba(220,38,38,0.15)";

              const cellNum = (val: number) => {
                const pos = val >= 0;
                return { color: isPos ? "#fff" : (pos ? "#15803d" : "#dc2626") };
              };

              return (
                <tr style={{ background: "transparent" }}>
                  <td style={{
                    position: "sticky", right: 0, zIndex: 1, background: stickyBg,
                    padding: "16px 20px", fontSize: 13, fontWeight: 700,
                    color: labelColor, letterSpacing: 2,
                    textTransform: "uppercase" as const,
                    boxShadow: `${stickyBg} -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px`,
                    borderTop: isPos ? "none" : "1px solid #fecaca",
                    borderRight: "2px solid #b8d4b8",
                    borderBottom: "2px solid #b8d4b8",
                    borderRadius: "0 0 10px 0",
                  }}>שורה תחתונה</td>
                  <td title="מאזן ממוצע חודשי" style={{
                    textAlign: "center", fontSize: 24, fontWeight: 800,
                    padding: "16px 20px", fontVariantNumeric: "tabular-nums" as const,
                    background: bannerBg,
                    borderTop: isPos ? "none" : "1px solid #fecaca",
                    borderLeft: "2px solid #b8d4b8", borderRight: "2px solid #b8d4b8",
                    borderBottom: "2px solid #b8d4b8",
                    borderRadius: "0 0 10px 10px", overflow: "hidden",
                    ...cellNum(balAvg),
                  }}>
                    {fmtFull(balAvg)}
                  </td>
                  <td title="מאזן תקצוב מחדש" style={{
                    textAlign: "center", fontSize: 24, fontWeight: 800,
                    padding: "16px 20px", fontVariantNumeric: "tabular-nums" as const,
                    background: bannerBg,
                    borderTop: isPos ? "none" : "1px solid #fecaca",
                    borderLeft: "2px solid #b8d4b8",
                    borderBottom: "2px solid #b8d4b8",
                    borderRadius: "0 0 0 10px",
                    ...cellNum(balRb),
                  }}>
                    {fmtFull(balRb)}
                  </td>
                  {scenarioCols(s => {
                    if (hiddenScenarios.has(s.id)) {
                      return <td key={s.id} style={{
                        background: isPos ? "rgba(0,0,0,0.02)" : "#fde8e8",
                        borderTop: "1px solid rgba(0,0,0,0.06)",
                        borderLeft: "1px solid rgba(0,0,0,0.1)", borderRight: "1px solid rgba(0,0,0,0.1)",
                        borderBottom: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: "0 0 6px 6px", overflow: "hidden",
                      }} />;
                    }
                    const inc = sectionSum("הכנסה", s.id);
                    const exp = sectionSum("קבוע", s.id) + sectionSum("משתנה", s.id);
                    const bal = inc - exp;
                    return (
                      <td key={s.id} title={`מאזן תסריט "${s.title}"`} style={{
                        textAlign: "center", fontSize: 24, fontWeight: 800,
                        padding: "16px 20px", fontVariantNumeric: "tabular-nums" as const,
                        background: bannerBg,
                        borderTop: "1px solid rgba(0,0,0,0.07)",
                        borderLeft: cardBorder(s.id), borderRight: cardBorder(s.id),
                        borderBottom: cardBorder(s.id),
                        borderRadius: "0 0 10px 10px", overflow: "hidden",
                        ...cellNum(bal),
                      }}>
                        {fmtFull(bal)}
                      </td>
                    );
                  })}
                </tr>
              );
            })()}
          </tbody>
        </table>
      </Card>
      </div>
      </div>

      {/* Chip bank — moved below table */}
      <div style={{ marginTop: 12 }}>
        <MissingCatsPanel
          globalCats={globalCats}
          presentCats={presentCats}
          onAdd={(name, bt) => handleAddCategory(name, bt)}
        />
      </div>
    </div>
  );
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryRow({
  row, rebudgetVal, scenarios, hiddenScenarios, entries, savingEntry,
  activeScenarioId, onRebudgetChange, onCopyAvg, onSaveEntry, onAddBetween, onDelete,
}: {
  row: AvgRow;
  rebudgetVal: string;
  scenarios: Scenario[];
  hiddenScenarios: Set<string>;
  entries: EntryMap;
  savingEntry: string | null;
  activeScenarioId: string | null;
  onRebudgetChange: (cat: string, val: string) => void;
  onCopyAvg: () => void;
  onSaveEntry: (scenarioId: string, category: string, val: string) => void;
  onAddBetween: (afterId: string) => void;
  onDelete: (cat: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [flashCell, setFlashCell] = useState<string | null>(null);
  const [rbFocused, setRbFocused] = useState(false);

  const hasRb = rebudgetVal !== "" && rebudgetVal !== String(Math.round(row.avg));

  const startEditEntry = (scenarioId: string) => {
    const cur = entries[`${scenarioId}|${row.category}`];
    setEditingCell(scenarioId);
    setEditVal(cur !== undefined ? String(Math.round(cur)) : "");
  };

  const saveAndClose = (scenarioId: string) => {
    onSaveEntry(scenarioId, row.category, editVal);
    setEditingCell(null);
    setFlashCell(scenarioId);
    setTimeout(() => setFlashCell(null), 700);
  };

  const rowBorder = "1px solid rgba(0,0,0,0.06)";
  const cardBorderColor = (sId: string) =>
    `1px solid ${sId === activeScenarioId ? "rgba(22,163,74,0.5)" : "rgba(0,0,0,0.13)"}`;

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: "transparent", transition: "background 0.12s" }}
    >
      {/* Category name — sticky */}
      <td style={{
        position: "sticky", right: 0, zIndex: 1,
        background: row.isEstimate ? "rgba(251,191,36,0.04)" : (hovered ? "rgba(22,163,74,0.04)" : "var(--surface)"),
        padding: "12px 20px", fontSize: 16, fontWeight: 600,
        whiteSpace: "nowrap",
        boxShadow: "rgb(255,255,255) -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px",
        borderBottom: rowBorder,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{row.category}</span>
          {row.isEstimate && hovered && (
            <button onClick={() => onDelete(row.category)} aria-label="מחק קטגוריה"
              style={{ fontSize: 15, color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", opacity: 0.7, flexShrink: 0 }}>
              ✕
            </button>
          )}
        </div>
      </td>

      {/* Avg — read-only with tooltip when overridden */}
      <td style={{ textAlign: "center", fontSize: 16, padding: "12px 20px", background: "rgba(0,0,0,0.015)", fontVariantNumeric: "tabular-nums" as const, borderBottom: rowBorder }}>
        <span
          title={row.originalAvg !== undefined ? `ממוצע מקורי: ${fmt(row.originalAvg)}` : undefined}
          style={{
            color: row.originalAvg !== undefined ? "var(--green-mid)" : "var(--text-dim)",
            cursor: row.originalAvg !== undefined ? "help" : "default",
            textDecoration: row.originalAvg !== undefined ? "underline" : undefined,
            textDecorationStyle: row.originalAvg !== undefined ? "dashed" as const : undefined,
            textDecorationColor: row.originalAvg !== undefined ? "var(--green-mid)" : undefined,
            textUnderlineOffset: "3px",
          }}
        >
          {fmt(row.avg)}
        </span>
      </td>

      {/* Rebudget — click to edit, displays clean fmt() value at rest */}
      <td style={{ textAlign: "center", padding: "6px 20px", borderRight: "1px solid rgba(0,0,0,0.07)", borderLeft: "2px solid #b8d4b8", borderBottom: rowBorder }}>
        {rbFocused ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
            <input
              autoFocus
              value={rebudgetVal}
              onChange={e => onRebudgetChange(row.category, e.target.value)}
              onBlur={() => setRbFocused(false)}
              onKeyDown={e => { if (e.key === "Escape") setRbFocused(false); }}
              placeholder={row.avg > 0 ? String(Math.round(row.avg)) : "0"}
              style={{
                width: 72, textAlign: "center", fontSize: 16,
                border: "1px solid var(--green-mid)",
                borderRadius: 6, padding: "6px 8px", fontFamily: "inherit",
                background: "var(--surface)", color: "var(--text)", outline: "none",
              }}
            />
            {hovered && !hasRb && row.avg > 0 && (
              <button title="העתק מממוצע" aria-label="העתק ממוצע לתקצוב" onClick={onCopyAvg}
                style={{ fontSize: 14, padding: "3px 6px", borderRadius: 5, border: "1px solid var(--border)", background: "none", color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                ↓
              </button>
            )}
          </div>
        ) : (
          <div
            onClick={() => setRbFocused(true)}
            style={{ cursor: "text", minHeight: 28, padding: "6px 0", display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity 0.1s" }}
          >
            {hasRb
              ? <span style={{ fontSize: 16, fontWeight: 600, color: "var(--green-mid)" }}>{fmt(Number(rebudgetVal))}</span>
              : row.avg > 0
                ? <span style={{ fontSize: 16, color: "var(--text-dim)" }}>{fmt(row.avg)}</span>
                : <span style={{ fontSize: 15, color: "var(--text-dim)", opacity: 0.4 }}>{hovered ? "לחץ להזנה" : "—"}</span>
            }
          </div>
        )}
      </td>

      {/* Scenario cells interspersed with insert columns */}
      {scenarios.flatMap((s, i) => {
        const scenarioCell = hiddenScenarios.has(s.id) ? (
          <td key={s.id} style={{ background: "rgba(0,0,0,0.02)" }} />
        ) : (() => {
          const key = `${s.id}|${row.category}`;
          const cur = entries[key];
          const isSaving = savingEntry === key;
          const isEditing = editingCell === s.id;
          const isActiveCol = s.id === activeScenarioId;
          const cellBg = flashCell === s.id
            ? "rgba(22,163,74,0.15)"
            : hovered
              ? (isActiveCol ? "rgba(22,163,74,0.1)" : "rgba(22,163,74,0.05)")
              : (isActiveCol ? "rgba(22,163,74,0.04)" : "transparent");
          return (
            <td key={s.id} style={{
              textAlign: "center", padding: "4px 12px",
              borderLeft: cardBorderColor(s.id), borderRight: cardBorderColor(s.id),
              background: cellBg,
              transition: "background 0.7s",
              fontVariantNumeric: "tabular-nums" as const,
            }}>
              {isEditing ? (
                <input autoFocus value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => saveAndClose(s.id)}
                  onKeyDown={e => { if (e.key === "Enter") saveAndClose(s.id); if (e.key === "Escape") setEditingCell(null); }}
                  style={{ width: 80, textAlign: "center", fontSize: 16, border: "1px solid var(--green-mid)", borderRadius: 6, padding: "7px 8px", fontFamily: "inherit", background: "var(--surface)", color: "var(--text)", outline: "none" }} />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div onClick={() => startEditEntry(s.id)}
                    style={{ fontSize: 16, fontWeight: cur !== undefined && cur !== 0 ? 600 : 400, cursor: "text", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center", color: cur !== undefined && cur !== 0 ? "var(--text)" : "var(--text-dim)", opacity: isSaving ? 0.5 : 1 }}>
                    {isSaving ? "..." : (cur !== undefined && cur !== 0 ? fmt(cur) : (hovered ? <span style={{ fontSize: 20, opacity: 0.2, lineHeight: 1, fontWeight: 300 }}>+</span> : "—"))}
                  </div>
                  {hovered && !isSaving && i > 0 && !hiddenScenarios.has(scenarios[i - 1].id) && (() => {
                    const srcVal = entries[`${scenarios[i - 1].id}|${row.category}`];
                    if (!srcVal) return null;
                    return (
                      <button
                        onClick={e => { e.stopPropagation(); onSaveEntry(s.id, row.category, String(Math.round(srcVal))); }}
                        title={`העתק מ"${scenarios[i - 1].title}": ${fmt(srcVal)}`}
                        style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 4, padding: "1px 5px", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.4, whiteSpace: "nowrap", opacity: 0.75 }}
                      >← {fmt(srcVal)}</button>
                    );
                  })()}
                </div>
              )}
            </td>
          );
        })();
        return scenarioCell;
      })}
    </tr>
  );
}
