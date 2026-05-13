import React, { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../supabase";
import { Btn } from "../ui";


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
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: "var(--z-top-back)" }} />
      <div role="dialog" aria-modal="true" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 360, background: "var(--surface)", borderRadius: 16,
        boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
        zIndex: "var(--z-top)", padding: "28px 28px 22px", textAlign: "center",
        animation: "scenarioModalIn 180ms cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>אישור מחיקה</div>
        <div style={{ fontSize: 16, color: "var(--text-mid)", marginBottom: 24, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: message }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
          <Btn variant="danger" onClick={onConfirm}>מחק</Btn>
        </div>
      </div>
      <style>{`@keyframes scenarioModalIn { from { transform:translate(-50%,-48%) scale(0.96); opacity:0; } to { transform:translate(-50%,-50%) scale(1); opacity:1; } } @keyframes toastIn { from { transform:translate(-50%,-12px); opacity:0; } to { transform:translate(-50%,0); opacity:1; } }`}</style>
    </>
  );
}

// ── Add scenario between two scenarios modal ──────────────────────────────────
function AddScenarioBetweenModal({ curr, next, onConfirm, onCancel }: {
  curr: { date_type: string; date_value: string; title: string };
  next: { date_type: string; date_value: string; title: string } | undefined;
  onConfirm: (title: string, date_type: DateType, date_value: string) => void;
  onCancel: () => void;
}) {
  const defaultDate = (() => {
    if (!next) return { date_type: curr.date_type as DateType, date_value: curr.date_value };
    // Pick middle date between curr and next
    const co = scenarioDateOrder(curr as any), no = scenarioDateOrder(next as any);
    const mid = Math.floor((co + no) / 2);
    if (mid <= co) return { date_type: "month_year" as DateType, date_value: `${MONTH_NOW + 1}/${YEAR_NOW}` };
    const year = Math.floor(mid / 12);
    const month = mid - year * 12;
    if (month === 0) return { date_type: "year" as DateType, date_value: String(year) };
    return { date_type: "month_year" as DateType, date_value: `${month}/${year}` };
  })();

  const [title, setTitle] = useState("תסריט חדש");
  const [dateType, setDateType] = useState<DateType>(defaultDate.date_type);
  const [dateValue, setDateValue] = useState(defaultDate.date_value);
  const [error, setError] = useState("");
  const titleRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.select(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleSubmit = () => {
    if (!title.trim()) { setError("יש להזין שם לתסריט"); return; }
    const newOrder = scenarioDateOrder({ date_type: dateType, date_value: dateValue } as any);
    const currOrder = scenarioDateOrder(curr as any);
    const nextOrder = next ? scenarioDateOrder(next as any) : Infinity;
    if (newOrder <= currOrder) {
      setError(`התאריך חייב להיות אחרי "${curr.title}" (${curr.date_value})`);
      return;
    }
    if (nextOrder !== Infinity && newOrder >= nextOrder) {
      setError(`התאריך חייב להיות לפני "${next!.title}" (${next!.date_value})`);
      return;
    }
    onConfirm(title.trim(), dateType, dateValue);
  };

  const inputSt: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 9,
    border: "1.5px solid var(--border)", background: "var(--surface2)",
    color: "var(--text)", fontFamily: "inherit", fontSize: 16, outline: "none",
    boxSizing: "border-box" as const,
  };

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = YEARS;

  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: "var(--z-top-back)" }} />
      <div role="dialog" aria-modal="true" style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%,-50%)",
        width: 380, background: "var(--surface)", borderRadius: 18,
        boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
        zIndex: "var(--z-top)", padding: "28px 28px 22px",
        animation: "scenarioModalIn 180ms cubic-bezier(0.16,1,0.3,1)",
        direction: "rtl",
      }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>הוסף תסריט</div>

        {/* Title */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 6 }}>שם התסריט</label>
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            style={inputSt}
            placeholder="לדוגמה: נועם מתחתן"
          />
        </div>

        {/* Date type toggle */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 8 }}>סוג תאריך</label>
          <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {(["month_year", "year"] as DateType[]).map(dt => (
              <button key={dt} onClick={() => {
                setDateType(dt);
                if (dt === "year") {
                  const [, y] = dateValue.split("/");
                  setDateValue(y || String(YEAR_NOW));
                } else {
                  setDateValue(`${MONTH_NOW + 1}/${dateValue || YEAR_NOW}`);
                }
                setError("");
              }} style={{
                padding: "7px 18px", fontSize: 14, fontFamily: "inherit", cursor: "pointer", border: "none",
                background: dateType === dt ? "var(--green-mid)" : "transparent",
                color: dateType === dt ? "#fff" : "var(--text-mid)",
                fontWeight: dateType === dt ? 700 : 400,
              }}>
                {dt === "month_year" ? "חודש + שנה" : "שנה"}
              </button>
            ))}
          </div>
        </div>

        {/* Date value */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600, display: "block", marginBottom: 8 }}>תאריך</label>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, direction: "ltr", background: "#f5f7f5", border: "1.5px solid var(--border)", borderRadius: 9, padding: "6px 12px" }}>
            {dateType === "month_year" ? (() => {
              const [m, y] = dateValue ? dateValue.split("/") : [`${MONTH_NOW + 1}`, `${YEAR_NOW}`];
              return <>
                <select value={m} onChange={e => { setDateValue(`${e.target.value}/${y || YEAR_NOW}`); setError(""); }}
                  style={{ fontSize: 15, border: "none", background: "transparent", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                  {months.map(mo => <option key={mo} value={mo}>{String(mo).padStart(2, "0")}</option>)}
                </select>
                <span style={{ color: "var(--text-dim)", opacity: 0.5 }}>/</span>
                <select value={y} onChange={e => { setDateValue(`${m || MONTH_NOW + 1}/${e.target.value}`); setError(""); }}
                  style={{ fontSize: 15, border: "none", background: "transparent", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                  {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
                </select>
              </>;
            })() : (
              <select value={dateValue || YEAR_NOW} onChange={e => { setDateValue(e.target.value); setError(""); }}
                style={{ fontSize: 15, border: "none", background: "transparent", fontFamily: "inherit", cursor: "pointer", outline: "none" }}>
                {years.map(yr => <option key={yr} value={yr}>{yr}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 14, padding: "8px 12px", borderRadius: 8, background: "var(--red-light)", border: "1px solid var(--red)", fontSize: 14, color: "var(--red)", fontWeight: 500, display:"flex", alignItems:"center", gap:6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {error}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
          <Btn onClick={handleSubmit}>+ הוסף תסריט</Btn>
        </div>
      </div>
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
        fontSize: "inherit", border: "none", borderRadius: 6, padding: "0 2px",
        background: "transparent", fontFamily: "inherit", color: "inherit", fontWeight: "inherit",
        height: "1.4em",
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

// ── Plus zone — covers full column gap height, button follows cursor ──────────
function PlusZone({ onInsert }: { onInsert: () => void }) {
  const [h, setH] = useState(false);
  const [pos, setPos] = useState({ top: -9999, left: -9999 });
  const ref = useRef<HTMLDivElement>(null);

  const track = useCallback((clientY: number) => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: clientY - 9, left: Math.round(r.left + r.width / 2 - 9) });
    }
  }, []);

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={e => { track(e.clientY); setH(true); }}
        onMouseMove={e => { if (h) track(e.clientY); }}
        onMouseLeave={() => setH(false)}
        style={{ position: "absolute", top: 0, bottom: -3000, left: -12, width: 16, zIndex: 10, pointerEvents: "auto" }}
      />
      {h && (
        <button
          onMouseEnter={() => setH(true)}
          onMouseLeave={() => setH(false)}
          onClick={e => { e.stopPropagation(); setH(false); onInsert(); }}
          title="הוסף תסריט כאן"
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: "var(--z-drop)",
            width: 18, height: 18, borderRadius: 99,
            background: "var(--green-mid)", color: "#fff",
            border: "none", cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 12px rgba(45,106,79,0.4)",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M5 1v8M1 5h8" stroke="#fff" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </>
  );
}

// ── Date input for scenario header ────────────────────────────────────────────
const MONTHS_NUM = Array.from({ length: 12 }, (_, i) => i + 1);

function DateInput({ dateType, dateValue, onChange }: {
  dateType: DateType; dateValue: string;
  onChange: (type: DateType, value: string) => void;
}) {
  const cardStyle: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 3,
    direction: "ltr",
    background: "var(--surface)", border: "1px solid rgba(30,40,30,0.08)",
    borderRadius: 8, padding: "4px 9px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    lineHeight: 1,
    fontSize: 13, color: "var(--text-mid)", fontWeight: 700,
  };

  if (dateType === "month_year") {
    const [m, y] = dateValue ? dateValue.split("/") : [`${MONTH_NOW + 1}`, `${YEAR_NOW}`];
    return (
      <div style={cardStyle}>
        <HoverSelect value={m || `${MONTH_NOW + 1}`}
          onChange={e => onChange("month_year", `${e.target.value}/${y || YEAR_NOW}`)}>
          {MONTHS_NUM.map(mo => <option key={mo} value={mo}>{String(mo).padStart(2, "0")}</option>)}
        </HoverSelect>
        <span style={{ color: "var(--text-dim)", opacity: 0.55, margin: "0 1px", userSelect: "none" }}>/</span>
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
function ScenarioHeader({ scenario, isActive, onUpdate, onDelete, onAddAfter, onToggleHide, onCopyFromRight, hasRightNeighbor }: {
  scenario: Scenario;
  isActive: boolean;
  onUpdate: (id: string, patch: Partial<Scenario>) => void;
  onDelete: (id: string) => void;
  onAddAfter: () => void;
  onToggleHide: () => void;
  onCopyFromRight: () => void;
  hasRightNeighbor: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(scenario.title);
  const [editDateType, setEditDateType] = useState<DateType>(scenario.date_type);
  const [editDateValue, setEditDateValue] = useState(scenario.date_value);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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

  const openEdit = () => {
    setEditTitle(scenario.title);
    setEditDateType(scenario.date_type);
    setEditDateValue(scenario.date_value);
    setEditOpen(true);
  };

  const saveEdit = () => {
    const patch: Partial<Scenario> = {};
    if (editTitle !== scenario.title) patch.title = editTitle;
    if (editDateType !== scenario.date_type) patch.date_type = editDateType;
    if (editDateValue !== scenario.date_value) patch.date_value = editDateValue;
    if (Object.keys(patch).length > 0) onUpdate(scenario.id, patch);
    setEditOpen(false);
  };

  return (
    <>
      <div style={{ padding: `${isActive ? 32 : 10}px 14px 14px`, position: "relative", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", minHeight: 70 }}>
        {/* Title row with ⋯ menu */}
        <div style={{ position: "relative", width: "100%", marginBottom: 10, minHeight: 28 }}>
          <div style={{ textAlign: "center", fontSize: 15, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingTop: 4 }}>
            {scenario.title}
          </div>
          {/* ⋯ absolutely positioned — out of flow so title stays centered */}
          <div ref={menuRef} style={{ position: "absolute", left: 0, top: 2 }}>
            <button
              ref={btnRef}
              onClick={() => {
                if (!menuOpen && btnRef.current) {
                  const r = btnRef.current.getBoundingClientRect();
                  setMenuPos({ top: r.bottom + 4, left: r.left });
                }
                setMenuOpen(p => !p);
              }}
              aria-label="אפשרויות תסריט"
              style={{ fontSize: 18, lineHeight: 1, color: "var(--text-dim)", background: "none", border: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4 }}
            >⋯</button>
            {menuOpen && (
              <div style={{
                position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: "var(--z-drop)",
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                minWidth: 130, padding: "4px 0",
              }}>
                {(["עריכה","הסתר",...(hasRightNeighbor ? ["העתק מהימני"] : []),"מחק"] as string[]).map(action => (
                  <button key={action}
                    onClick={() => {
                      setMenuOpen(false);
                      if (action === "עריכה") openEdit();
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
        <DateInput dateType={scenario.date_type} dateValue={scenario.date_value}
          onChange={(type, value) => onUpdate(scenario.id, { date_type: type, date_value: value })} />
      </div>

      {/* Edit modal — rendered via portal to escape table constraints */}
      {editOpen && ReactDOM.createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: "var(--z-top)", background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setEditOpen(false); }}>
          <div style={{ background: "var(--surface)", borderRadius: 14, padding: "28px 32px", minWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", direction: "rtl" }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 20, color: "var(--text)" }}>עריכת תסריט</div>

            {/* Name */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>שם התסריט</div>
              <input
                autoFocus
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditOpen(false); }}
                style={{ width: "100%", fontSize: 15, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontFamily: "inherit", background: "var(--surface2)", color: "var(--text)", outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Period type */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>סוג תקופה</div>
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8 }}>
                {(["month_year", "year"] as DateType[]).map((dt, idx) => (
                  <button key={dt}
                    onClick={() => {
                      setEditDateType(dt);
                      setEditDateValue(dt === "year" ? String(YEAR_NOW) : `${MONTH_NOW + 1}/${YEAR_NOW}`);
                    }}
                    style={{
                      fontSize: 14, padding: "6px 16px", border: "none",
                      borderLeft: idx === 0 ? "none" : "1px solid var(--border)",
                      borderRadius: idx === 0 ? "0 7px 7px 0" : "7px 0 0 7px",
                      background: editDateType === dt ? "var(--green-mint)" : "transparent",
                      color: editDateType === dt ? "var(--green-deep)" : "var(--text-dim)",
                      fontWeight: editDateType === dt ? 700 : 400,
                      cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                    }}>
                    {dt === "month_year" ? "חודש + שנה" : "שנה"}
                  </button>
                ))}
              </div>
            </div>

            {/* Period value */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>תקופה</div>
              <DateInput dateType={editDateType} dateValue={editDateValue} onChange={(type, value) => { setEditDateType(type); setEditDateValue(value); }} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setEditOpen(false)}>ביטול</Btn>
              <Btn onClick={saveEdit}>שמור</Btn>
            </div>
          </div>
        </div>
      , document.body)}
    </>
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
  const [addBetweenModal, setAddBetweenModal] = useState<{ curr: Scenario; next: Scenario | undefined } | null>(null);
  const [addEndModal, setAddEndModal] = useState(false);
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
  const addScenario = async (title: string, date_type: DateType, date_value: string) => {
    setAddingScenario(true);
    const sortOrder = Math.max(0, ...scenarios.map(s => s.sort_order)) + 1;
    const { data } = await supabase
      .from("portfolio_scenarios")
      .insert({ client_id: clientId, title, date_type, date_value, sort_order: sortOrder, is_base: false })
      .select()
      .maybeSingle();
    if (data) setScenarios(prev => [...prev, data as Scenario]);
    setAddingScenario(false);
  };

  const addScenarioBetween = useCallback(async (afterId: string, title: string, date_type: DateType, date_value: string) => {
    const idx = scenarios.findIndex(s => s.id === afterId);
    if (idx < 0) return;
    const newSortOrder = Math.max(...scenarios.map(s => s.sort_order)) + 1;
    setAddingScenario(true);
    const { data } = await supabase
      .from("portfolio_scenarios")
      .insert({ client_id: clientId, title, date_type, date_value, sort_order: newSortOrder, is_base: false })
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
    if (leftDiv)  leftDiv.style.opacity  = canStart ? "1" : "0";
    if (rightDiv) rightDiv.style.opacity = canEnd   ? "1" : "0";
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
  // cardBorder = full card perimeter (header card + bottom balance row)
  // colBorder  = body cell left/right (column divider inside table body)
  const cardBorder = (sId: string) =>
    `1px solid ${sId === activeScenarioId ? "var(--green-mid)" : "rgba(0,0,0,0.22)"}`;
  const colBorder = (sId: string) =>
    `1px solid ${sId === activeScenarioId ? "var(--green-mid)" : "rgba(0,0,0,0.22)"}`;

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

      {addBetweenModal && (
        <AddScenarioBetweenModal
          curr={addBetweenModal.curr}
          next={addBetweenModal.next}
          onCancel={() => setAddBetweenModal(null)}
          onConfirm={(title, date_type, date_value) => {
            setAddBetweenModal(null);
            addScenarioBetween(addBetweenModal.curr.id, title, date_type, date_value);
          }}
        />
      )}

      {addEndModal && (() => {
        const last = scenarios[scenarios.length - 1];
        const defaultDate = last
          ? nextDateAfter(last)
          : { date_type: "month_year" as DateType, date_value: `${MONTH_NOW + 1}/${YEAR_NOW}` };
        const fakeCurr = last ?? { title: "", date_type: defaultDate.date_type, date_value: defaultDate.date_value, id: "", sort_order: -1 };
        return (
          <AddScenarioBetweenModal
            curr={fakeCurr}
            next={undefined}
            onCancel={() => setAddEndModal(false)}
            onConfirm={(title, date_type, date_value) => {
              setAddEndModal(false);
              addScenario(title, date_type, date_value);
            }}
          />
        );
      })()}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>
            מאזן מבוסס תסריטים
            <small style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)", marginRight: 10 }}>תכננו את העתיד הפיננסי שלכם</small>
          </div>
        </div>
        <button onClick={() => setAddEndModal(true)} disabled={addingScenario}
          style={{
            fontSize: 14, padding: "9px 18px 9px 14px", borderRadius: 99,
            border: "none", background: "var(--green-mid)",
            color: "#fff", cursor: addingScenario ? "default" : "pointer", fontFamily: "inherit",
            fontWeight: 600, opacity: addingScenario ? 0.6 : 1,
            display: "inline-flex", alignItems: "center", gap: 8,
            boxShadow: "0 1px 0 rgba(255,255,255,0.2) inset, 0 2px 8px rgba(45,106,79,0.25)",
            transition: "transform 0.12s ease, box-shadow 0.12s ease",
          }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ display: "block" }}>
            <path d="M6.5 1.5v10M1.5 6.5h10" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          תסריט חדש
        </button>
      </div>

      {dateOrderError && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: "var(--z-drop)", background: "var(--surface)", border: "1px solid #fde68a",
          borderRadius: 14, padding: "14px 20px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          display: "flex", alignItems: "center", gap: 12, direction: "rtl",
          animation: "toastIn 0.2s cubic-bezier(0.16,1,0.3,1)",
          minWidth: 300, maxWidth: 440,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--gold)" }}>שגיאת כרונולוגיה</div>
            <div style={{ fontSize: 15, color: "var(--gold)", marginTop: 3, lineHeight: 1.4 }}>{dateOrderError}</div>
          </div>
          <button onClick={() => setDateOrderError(null)}
            style={{ fontSize: 20, background: "none", border: "none", cursor: "pointer", color: "var(--gold)", padding: "2px 6px", opacity: 0.5, flexShrink: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div style={{ position: "relative" }}>
        {/* Left fade + arrow — scroll further into scenarios */}
        <div ref={arrowLeftRef} data-arrow-left style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: 64, zIndex: 10,
          pointerEvents: "none", opacity: 0,
          transition: "opacity 0.18s ease",
          display: "flex", alignItems: "flex-start", justifyContent: "flex-start",
          paddingLeft: 8, paddingTop: 96,
        }}>
          <button
            onClick={() => { if (scrollContainerRef.current) { scrollContainerRef.current.scrollLeft += 320; checkScroll(); } }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; (e.currentTarget as HTMLElement).style.color = "var(--green-deep)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.color = "var(--text-mid)"; }}
            style={{
              pointerEvents: "all", background: "var(--surface)", border: "1px solid rgba(30,40,30,0.08)",
              borderRadius: 99, width: 34, height: 34, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(0,0,0,0.12)", color: "var(--text-mid)",
              fontSize: 18, lineHeight: 1, flexShrink: 0,
              transition: "transform 0.12s ease, color 0.12s ease",
            }}
            aria-label="גלול ימינה"
          >›</button>
        </div>

        {/* Right fade + arrow — scroll further into scenarios (left in RTL) */}
        <div ref={arrowRightRef} data-arrow-right style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 64, zIndex: 10,
          pointerEvents: "none", opacity: 0,
          transition: "opacity 0.18s ease",
          display: "flex", alignItems: "flex-start", justifyContent: "flex-end",
          paddingRight: 8, paddingTop: 96,
        }}>
          <button
            onClick={() => { if (scrollContainerRef.current) { scrollContainerRef.current.scrollLeft -= 320; checkScroll(); } }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; (e.currentTarget as HTMLElement).style.color = "var(--green-deep)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.color = "var(--text-mid)"; }}
            style={{
              pointerEvents: "all", background: "var(--surface)", border: "1px solid rgba(30,40,30,0.08)",
              borderRadius: 99, width: 34, height: 34, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 14px rgba(0,0,0,0.12)", color: "var(--text-mid)",
              fontSize: 18, lineHeight: 1, flexShrink: 0,
              transition: "transform 0.12s ease, color 0.12s ease",
            }}
            aria-label="גלול שמאלה"
          >‹</button>
        </div>

      <div ref={scrollContainerRef} data-scenario-scroll style={{ overflowX: "auto", borderRadius: 14 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: "8px 0", minWidth: "100%", width: "max-content", tableLayout: "fixed", fontSize: 15, background: "var(--surface)", fontFamily: "'Rubik', sans-serif" }}>
          <colgroup>
            <col style={{ width: 230 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 150 }} />
            {scenarios.map(s => (
              <col key={s.id} style={{ width: hiddenScenarios.has(s.id) ? 28 : 188 }} />
            ))}
          </colgroup>

          <thead>
            <tr style={{ background: "transparent" }}>
              <th style={{
                position: "sticky", right: 0, zIndex: 5, background: "var(--green-mid)",
                color: "#fff", textAlign: "center",
                padding: "14px 22px",
                fontSize: 15, fontWeight: 600,
                boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                borderRadius: "14px 0 0 0",
                height: 118, verticalAlign: "top",
              }}>
                <span style={{ fontSize: 18, fontWeight: 700 }}>קטגוריה</span>
              </th>
              <th style={{
                padding: "14px 12px", fontSize: 15, fontWeight: 700, color: "var(--text-dim)",
                textAlign: "center", background: "#f1f3f3",
                height: 118, verticalAlign: "top",
                borderRadius: "12px 12px 0 0",
                border: "1px solid rgba(45,106,79,0.18)", borderBottom: "none",
                letterSpacing: "0.02em",
              }}>
                ממוצע חודשי
              </th>
              <th style={{
                padding: "14px 12px", fontSize: 15, fontWeight: 700, color: "var(--text-mid)",
                textAlign: "center", background: "#f8f9f7",
                height: 118, verticalAlign: "top",
                borderRadius: "12px 12px 0 0",
                border: "1px solid rgba(45,106,79,0.18)", borderBottom: "none",
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
                    borderRadius: "12px 12px 0 0",
                    background: isActiveScenario ? "#d3e9d9" : "#f8f9f7",
                    position: "relative", zIndex: 0,
                    height: 118,
                    overflow: "visible",
                  }}>
                    {idx < scenarios.length - 1 && (
                      <PlusZone onInsert={() => setAddBetweenModal({ curr: s, next: scenarios[idx + 1] })} />
                    )}
                    {isActiveScenario && (
                      <div style={{
                        position: "absolute", top: 0, left: 0, right: 0,
                        background: "var(--green-mid)",
                        color: "#fff",
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
                        textAlign: "center", padding: "5px 0",
                        textTransform: "uppercase" as const,
                        borderRadius: "12px 12px 0 0",
                        userSelect: "none",
                        zIndex: 1,
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
                      onAddAfter={() => setAddBetweenModal({ curr: s, next: scenarios[idx + 1] })}
                      onToggleHide={() => toggleHideScenario(s.id)}
                      onCopyFromRight={() => copyFromRight(s.id)}
                      hasRightNeighbor={idx > 0}
                    />
                  </th>
                );
                return th;
              })}
            </tr>
          </thead>

          <tbody>
            {/* Balance row — top */}
            {(() => {
              const incAvg  = sectionSum("הכנסה", "avg");
              const expAvg  = sectionSum("קבוע", "avg") + sectionSum("משתנה", "avg");
              const balAvg  = incAvg - expAvg;
              const incRb   = sectionSum("הכנסה", "rebudget");
              const expRb   = sectionSum("קבוע", "rebudget") + sectionSum("משתנה", "rebudget");
              const balRb   = incRb - expRb;
              const bottomBg = "#fdf3f1";
              const valColor = (val: number) => val >= 0 ? "var(--green-mid)" : "var(--red)";
              return (
                <tr>
                  <td style={{
                    position: "sticky", right: 0, zIndex: 1, background: bottomBg,
                    padding: "14px 14px", fontSize: 14, fontWeight: 700,
                    color: "var(--red)", letterSpacing: "0.16em",
                    textAlign: "center",
                    textTransform: "uppercase" as const,
                    boxShadow: `${bottomBg} -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px`,
                  }}>שורה תחתונה</td>
                  <td style={{
                    textAlign: "center", fontSize: 20, fontWeight: 600,
                    padding: "14px 14px", fontVariantNumeric: "tabular-nums" as const,
                    background: bottomBg, color: valColor(balAvg),
                    borderTop: "2px solid rgba(45,106,79,0.18)",
                    borderLeft: "1px solid rgba(45,106,79,0.18)",
                    borderRight: "1px solid rgba(45,106,79,0.18)",
                    borderRadius: 0,
                  }}>{fmtFull(balAvg)}</td>
                  <td style={{
                    textAlign: "center", fontSize: 20, fontWeight: 600,
                    padding: "14px 14px", fontVariantNumeric: "tabular-nums" as const,
                    background: bottomBg, color: valColor(balRb),
                    borderTop: "2px solid rgba(45,106,79,0.18)",
                    borderLeft: "1px solid rgba(45,106,79,0.18)",
                    borderRight: "1px solid rgba(45,106,79,0.18)",
                    borderRadius: 0,
                  }}>{fmtFull(balRb)}</td>
                  {scenarioCols(s => {
                    if (hiddenScenarios.has(s.id)) return <td key={s.id} style={{ background: bottomBg }} />;
                    const inc = sectionSum("הכנסה", s.id);
                    const exp = sectionSum("קבוע", s.id) + sectionSum("משתנה", s.id);
                    const bal = inc - exp;
                    const isActive = s.id === activeScenarioId;
                    const topLineColor = isActive ? "var(--green-mid)" : "rgba(0,0,0,0.22)";
                    return (
                      <td key={s.id} style={{
                        textAlign: "center", fontSize: 20, fontWeight: 600,
                        padding: "14px 14px", fontVariantNumeric: "tabular-nums" as const,
                        background: bottomBg, color: valColor(bal),
                        borderTop: `2px solid ${topLineColor}`,
                        borderLeft: `1px solid ${topLineColor}`,
                        borderRight: `1px solid ${topLineColor}`,
                        borderRadius: 0,
                      }}>{fmtFull(bal)}</td>
                    );
                  })}
                </tr>
              );
            })()}

            {SECTIONS.map(section => {
              const rows = grouped[section.key];
              const isCollapsed = collapsedSections.has(section.key);
              const accentColor = section.key === "הכנסה" ? "var(--green-deep)" : "#7a8a82";
              const avgTotal      = sectionSum(section.key, "avg");
              const rebudgetTotal = sectionSum(section.key, "rebudget");

              return (
                <React.Fragment key={section.key}>
                  <tr
                    onClick={() => setCollapsedSections(prev => { const next = new Set(prev); if (next.has(section.key)) next.delete(section.key); else next.add(section.key); return next; })}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Cat sticky td — accent line covers cell width only (gap covered by next cell's div) */}
                    <td style={{
                      position: "sticky", right: 0, zIndex: 2,
                      background: "#f1ead9",
                      color: "#3a2f1f",
                      padding: "18px 22px 14px",
                      fontSize: 16, fontWeight: 700, letterSpacing: "0.02em",
                      boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                      userSelect: "none",
                    }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accentColor, zIndex: 3 }} />
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "99px", background: accentColor, marginLeft: 10, verticalAlign: "middle" }} />
                      {section.label}
                      {isCollapsed && <span style={{ marginRight: 8, fontSize: 13, fontWeight: 400, color: "var(--text-dim)" }}>({rows.length} קטגוריות)</span>}
                      <span style={{ marginRight: 8, fontSize: 12, opacity: 0.45 }}>{isCollapsed ? "◂" : "▾"}</span>
                    </td>
                    {/* avg — bleeds left 8px into gap */}
                    <td style={{ position: "relative", background: "#f1f3f3", padding: "18px 22px 14px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#9aada4", userSelect: "none", borderLeft: "1px solid rgba(45,106,79,0.18)", borderRight: "1px solid rgba(45,106,79,0.18)" }}>
                      <div style={{ position: "absolute", top: 0, left: -8, right: 0, height: 3, background: accentColor, zIndex: 1 }} />
                      {section.label}
                    </td>
                    {/* rebud — bleeds left 8px into gap */}
                    <td style={{ position: "relative", background: "#f8f9f7", padding: "18px 22px 14px", textAlign: "center", fontSize: 13, fontWeight: 600, color: "#9aada4", userSelect: "none", borderLeft: "1px solid rgba(45,106,79,0.18)", borderRight: "1px solid rgba(45,106,79,0.18)" }}>
                      <div style={{ position: "absolute", top: 0, left: -8, right: 0, height: 3, background: accentColor, zIndex: 1 }} />
                      {section.label}
                    </td>
                    {scenarios.map((s, idx) => {
                      const isLastScen = idx === scenarios.length - 1;
                      const accentLeft = isLastScen ? 0 : -8;
                      return hiddenScenarios.has(s.id) ? (
                        <td key={s.id} style={{ position: "relative", background: "rgba(0,0,0,0.02)" }}>
                          <div style={{ position: "absolute", top: 0, left: accentLeft, right: 0, height: 3, background: accentColor, zIndex: 1 }} />
                        </td>
                      ) : (
                        <td key={s.id} style={{
                          position: "relative",
                          background: s.id === activeScenarioId ? "#e7f1ea" : "#f8f9f7",
                          borderLeft: colBorder(s.id), borderRight: colBorder(s.id),
                          padding: "18px 22px 14px",
                          textAlign: "center",
                          fontSize: 13, fontWeight: 600,
                          color: s.id === activeScenarioId ? "var(--green-deep)" : "#9aada4",
                          userSelect: "none",
                        }}>
                          <div style={{ position: "absolute", top: 0, left: accentLeft, right: 0, height: 3, background: accentColor, zIndex: 1 }} />
                          {section.label}
                        </td>
                      );
                    })}
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
                      onDelete={cat => {
                        const hasSceEntries = Object.keys(entries).some(k => k.endsWith(`|${cat}`));
                        setDeleteConfirm({ type: "category", id: cat, hasSceEntries });
                      }}
                    />
                  )))}

                  {/* Add category row */}
                  {!isCollapsed && (addingSection === section.key ? (
                    <tr>
                      <td colSpan={totalCols} style={{ padding: "8px 18px", background: "#f7f2e9", borderBottom: "none" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input autoFocus value={addName}
                            onChange={e => setAddName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleAddCategory(addName, section.key); if (e.key === "Escape") { setAddingSection(null); setAddName(""); } }}
                            placeholder="שם הקטגוריה"
                            style={{ fontSize: 15, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--green-mid)", outline: "none", fontFamily: "inherit", background: "var(--surface2)", color: "var(--text)" }} />
                          <button onClick={() => handleAddCategory(addName, section.key)} disabled={addSaving || !addName.trim()}
                            style={{ fontSize: 14, padding: "5px 12px", borderRadius: 7, border: "none", background: "var(--green-mid)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                            הוסף
                          </button>
                          <button onClick={() => { setAddingSection(null); setAddName(""); }}
                            style={{ fontSize: 14, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(45,106,79,0.3)", background: "none", cursor: "pointer", fontFamily: "inherit", color: "var(--text-dim)" }}>
                            ביטול
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td style={{ position: "sticky", right: 0, zIndex: 1, background: "#f7f2e9", padding: "8px 18px", borderBottom: "none", boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)" }}>
                        <button onClick={() => { setAddingSection(section.key); setAddName(""); }}
                          style={{ fontSize: 13, color: "var(--green-deep)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "5px 10px", borderRadius: 6, fontWeight: 600, transition: "background 0.12s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(45,106,79,0.08)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}>
                          + הוסף קטגוריה
                        </button>
                      </td>
                      <td style={{ background: "#f1f3f3", borderBottom: "none" }} />
                      <td style={{ background: "#f8f9f7", borderBottom: "none" }} />
                      {scenarios.map(s => hiddenScenarios.has(s.id) ? (
                        <td key={s.id} style={{ background: "rgba(0,0,0,0.02)", borderBottom: "none" }} />
                      ) : (
                        <td key={s.id} style={{ background: s.id === activeScenarioId ? "#e7f1ea" : "#f8f9f7", borderLeft: colBorder(s.id), borderRight: colBorder(s.id), borderBottom: "none" }} />
                      ))}
                    </tr>
                  ))}

                  {/* Section subtotal */}
                  {(() => {
                    const totalNumColor = section.key === "הכנסה" ? "#063318" : "#5b6660";
                    const totalNumWeight = section.key === "הכנסה" ? 700 : 800;
                    const totalBg = "#f1ead9";
                    const colDiv = "1px solid rgba(45,106,79,0.18)";
                    const topLine = <div style={{ position: "absolute", top: -2, left: -8, right: 0, height: 2, background: "#b8bdb8", zIndex: 1 }} />;
                    const topLineLast = <div style={{ position: "absolute", top: -2, left: 0, right: 0, height: 2, background: "#b8bdb8", zIndex: 1 }} />;
                    return (
                      <tr>
                        <td style={{
                          position: "sticky", right: 0, zIndex: 3,
                          background: totalBg, color: "#3a2f1f",
                          padding: "14px 20px", fontSize: 14, fontWeight: 700,
                          boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                        }}>סה״כ {section.label}</td>
                        <td style={{
                          position: "relative",
                          textAlign: "center", fontSize: 15, fontWeight: totalNumWeight, padding: "14px 14px",
                          color: totalNumColor, background: totalBg,
                          fontVariantNumeric: "tabular-nums" as const,
                          borderLeft: colDiv, borderRight: colDiv,
                        }}>
                          {topLine}
                          {fmt(avgTotal)}
                          {section.key === "הכנסה" && avgTotal === 0 && (
                            <span title="לא נמצאו עסקאות הכנסה — בדוק מיפויים" style={{ marginRight: 6, fontSize: 13, fontWeight: 700, color: "#f59e0b", cursor: "help" }}>!</span>
                          )}
                        </td>
                        <td style={{
                          position: "relative",
                          textAlign: "center", fontSize: 15, fontWeight: totalNumWeight, padding: "14px 14px",
                          color: totalNumColor, background: totalBg,
                          fontVariantNumeric: "tabular-nums" as const,
                          borderLeft: colDiv, borderRight: colDiv,
                        }}>{topLine}{fmt(rebudgetTotal)}</td>
                        {scenarioCols((s, idx) => {
                          const isLast = idx === scenarios.filter(sc => !hiddenScenarios.has(sc.id)).length - 1;
                          const line = isLast ? topLineLast : topLine;
                          return hiddenScenarios.has(s.id) ? (
                            <td key={s.id} style={{ position: "relative", background: "rgba(0,0,0,0.02)" }}>{line}</td>
                          ) : (
                            <td key={s.id} style={{
                              position: "relative",
                              textAlign: "center", fontSize: 15, fontWeight: totalNumWeight, padding: "14px 14px",
                              color: totalNumColor, background: totalBg,
                              borderLeft: colBorder(s.id), borderRight: colBorder(s.id),
                              fontVariantNumeric: "tabular-nums" as const,
                            }}>
                              {topLine}
                              {fmt(sectionSum(section.key, s.id))}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })()}
                </React.Fragment>
              );
            })}

            {/* Total expenses row */}
            {(() => {
              const expAvg = sectionSum("קבוע", "avg") + sectionSum("משתנה", "avg");
              const expRb  = sectionSum("קבוע", "rebudget") + sectionSum("משתנה", "rebudget");
              const bg = "#f5ede4";
              const colDiv = "1px solid #d6cab8";
              return (
                <tr>
                  <td style={{
                    position: "sticky", right: 0, zIndex: 3,
                    background: bg, color: "#5b3a1f",
                    padding: "12px 20px", fontSize: 14, fontWeight: 700,
                    boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
                    borderTop: "2px solid #c9bba8",
                  }}>סה״כ הוצאות</td>
                  <td style={{
                    textAlign: "center", fontSize: 15, fontWeight: 700,
                    padding: "12px 14px", background: bg,
                    color: "#7a3a1f", fontVariantNumeric: "tabular-nums" as const,
                    borderTop: "2px solid #c9bba8", borderLeft: colDiv, borderRight: colDiv,
                  }}>{fmt(expAvg)}</td>
                  <td style={{
                    textAlign: "center", fontSize: 15, fontWeight: 700,
                    padding: "12px 14px", background: bg,
                    color: "#7a3a1f", fontVariantNumeric: "tabular-nums" as const,
                    borderTop: "2px solid #c9bba8", borderLeft: colDiv, borderRight: colDiv,
                  }}>{fmt(expRb)}</td>
                  {scenarioCols(s => {
                    if (hiddenScenarios.has(s.id)) return <td key={s.id} style={{ background: "rgba(0,0,0,0.02)", borderTop: "2px solid #c9bba8" }} />;
                    const exp = sectionSum("קבוע", s.id) + sectionSum("משתנה", s.id);
                    const isActive = s.id === activeScenarioId;
                    return (
                      <td key={s.id} style={{
                        textAlign: "center", fontSize: 15, fontWeight: 700,
                        padding: "12px 14px", background: isActive ? "#edd9cc" : bg,
                        color: "#7a3a1f", fontVariantNumeric: "tabular-nums" as const,
                        borderTop: "2px solid #c9bba8",
                        borderLeft: isActive ? "1.5px solid #c9bba8" : colDiv,
                        borderRight: isActive ? "1.5px solid #c9bba8" : colDiv,
                      }}>{fmt(exp)}</td>
                    );
                  })}
                </tr>
              );
            })()}

            {/* Balance row */}
            {(() => {
              const incAvg  = sectionSum("הכנסה", "avg");
              const expAvg  = sectionSum("קבוע", "avg") + sectionSum("משתנה", "avg");
              const balAvg  = incAvg - expAvg;
              const incRb   = sectionSum("הכנסה", "rebudget");
              const expRb   = sectionSum("קבוע", "rebudget") + sectionSum("משתנה", "rebudget");
              const balRb   = incRb - expRb;
              const bottomBg = "#fdf3f1";
              const colDiv = "rgba(45,106,79,0.18)";
              const valColor = (val: number) => val >= 0 ? "var(--green-mid)" : "var(--red)";

              return (
                <tr>
                  <td style={{
                    position: "sticky", right: 0, zIndex: 1, background: bottomBg,
                    padding: "18px 22px", fontSize: 14, fontWeight: 700,
                    color: "var(--red)", letterSpacing: "0.16em",
                    textAlign: "center",
                    textTransform: "uppercase" as const,
                    boxShadow: `${bottomBg} -8px 0 0 0, rgba(0,0,0,0.12) -1px 0 6px`,
                    borderRadius: "0 0 14px 14px",
                  }}>שורה תחתונה</td>
                  <td title="מאזן ממוצע חודשי" style={{
                    textAlign: "center", fontSize: 20, fontWeight: 600,
                    padding: "18px 14px", fontVariantNumeric: "tabular-nums" as const,
                    background: bottomBg,
                    borderTop: "2px solid rgba(45,106,79,0.18)",
                    borderLeft: "1px solid rgba(45,106,79,0.18)",
                    borderRight: "1px solid rgba(45,106,79,0.18)",
                    borderBottom: "1px solid rgba(45,106,79,0.18)",
                    borderRadius: "0 0 12px 12px",
                    color: valColor(balAvg),
                  }}>
                    {fmtFull(balAvg)}
                  </td>
                  <td title="מאזן תקצוב מחדש" style={{
                    textAlign: "center", fontSize: 20, fontWeight: 600,
                    padding: "18px 14px", fontVariantNumeric: "tabular-nums" as const,
                    background: bottomBg,
                    borderTop: "2px solid rgba(45,106,79,0.18)",
                    borderLeft: "1px solid rgba(45,106,79,0.18)",
                    borderRight: "1px solid rgba(45,106,79,0.18)",
                    borderBottom: "1px solid rgba(45,106,79,0.18)",
                    borderRadius: "0 0 12px 12px",
                    color: valColor(balRb),
                  }}>
                    {fmtFull(balRb)}
                  </td>
                  {scenarioCols(s => {
                    if (hiddenScenarios.has(s.id)) {
                      return <td key={s.id} style={{ background: bottomBg, borderRadius: "0 0 6px 6px" }} />;
                    }
                    const inc = sectionSum("הכנסה", s.id);
                    const exp = sectionSum("קבוע", s.id) + sectionSum("משתנה", s.id);
                    const bal = inc - exp;
                    return (
                      <td key={s.id} title={`מאזן תסריט "${s.title}"`} style={{
                        textAlign: "center", fontSize: 20, fontWeight: 600,
                        padding: "18px 14px", fontVariantNumeric: "tabular-nums" as const,
                        background: bottomBg,
                        borderLeft: colBorder(s.id), borderRight: colBorder(s.id),
                        borderTop: colBorder(s.id).replace("1px", "2px"),
                        borderBottom: colBorder(s.id),
                        borderRadius: "0 0 12px 12px",
                        color: valColor(bal),
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
  activeScenarioId, onRebudgetChange, onCopyAvg, onSaveEntry, onDelete,
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

  const rowBorder = "1px solid rgba(30,40,30,0.05)";

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: "transparent", transition: "background 0.12s" }}
    >
      {/* Category name — sticky */}
      <td style={{
        position: "sticky", right: 0, zIndex: 2,
        background: "#f7f2e9",
        color: "#3a2f1f",
        padding: "13px 22px", fontSize: 15, fontWeight: 500,
        whiteSpace: "nowrap",
        boxShadow: "-8px 0 16px -10px rgba(0,0,0,0.18)",
        borderBottom: rowBorder,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{row.category}</span>
          {row.isEstimate && hovered && (
            <button onClick={() => onDelete(row.category)} aria-label="מחק קטגוריה"
              style={{ color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", opacity: 0.7, flexShrink: 0, display:"inline-flex", alignItems:"center" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </td>

      {/* Avg — read-only with tooltip when overridden */}
      <td style={{
        textAlign: "center", fontSize: 15, padding: "13px 14px",
        background: "#f1f3f3", color: "var(--text-dim)",
        fontVariantNumeric: "tabular-nums" as const, borderBottom: rowBorder,
        borderLeft: "1px solid rgba(45,106,79,0.18)", borderRight: "1px solid rgba(45,106,79,0.18)",
      }}>
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
      <td style={{
        textAlign: "center", padding: "6px 14px",
        background: "#f8f9f7",
        borderLeft: "1px solid rgba(45,106,79,0.18)", borderRight: "1px solid rgba(45,106,79,0.18)",
        borderBottom: rowBorder,
      }}>
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
          const baseBg = isActiveCol ? "#e7f1ea" : "#f8f9f7";
          const cellBg = flashCell === s.id ? "rgba(22,163,74,0.2)" : (hovered ? (isActiveCol ? "#d3e9d9" : "#edf0ec") : baseBg);
          const cellColor = isActiveCol ? "var(--green-deep)" : "var(--text-mid)";
          const cellBorder = isActiveCol ? "1px solid var(--green-mid)" : "1px solid rgba(0,0,0,0.22)";
          return (
            <td key={s.id} style={{
              textAlign: "center", padding: "4px 12px",
              borderLeft: cellBorder, borderRight: cellBorder,
              background: cellBg, color: cellColor,
              transition: "background 0.15s",
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
                    style={{ fontSize: 16, fontWeight: cur !== undefined && cur !== 0 ? 600 : 500, cursor: "text", minHeight: 24, display: "flex", alignItems: "center", justifyContent: "center", color: cur !== undefined && cur !== 0 ? "var(--text)" : "var(--text-dim)", opacity: isSaving ? 0.5 : 1 }}>
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
