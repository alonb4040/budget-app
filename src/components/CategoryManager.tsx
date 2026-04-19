import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { CategoryRow } from "../hooks/useCategories";

// ════════════════════════════════════════════════════════════════
// CategoryManager — ניהול קטגוריות גלובליות ע"י האדמין
// ════════════════════════════════════════════════════════════════

const SEGMENTS = [
  { key: "הכנסה",  label: "הכנסות" },
  { key: "קבוע",   label: "הוצאות קבועות" },
  { key: "משתנה",  label: "הוצאות משתנות" },
] as const;

const inputS: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 6, padding: "11px 14px",
  background: "#fff", color: "var(--text)", fontSize: 15, fontFamily: "inherit",
  minHeight: 44, boxSizing: "border-box" as const,
};

const BUDGET_TYPES = ["הכנסה", "קבוע", "משתנה"] as const;
const BUDGET_TYPE_LABELS: Record<string, string> = {
  "הכנסה": "הכנסה",
  "קבוע": "הוצאה קבועה",
  "משתנה": "הוצאה משתנה",
};

// ── Toggle Switch ────────────────────────────────────────────────────────────
function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      title={checked ? "פעיל — לחץ להשבית" : "מושבת — לחץ להפעיל"}
      style={{
        width: 36, height: 44, borderRadius: 10, border: "none", padding: "12px 0",
        background: "transparent",
        cursor: "pointer", position: "relative", flexShrink: 0,
        outline: "none", boxSizing: "border-box",
      }}
    >
      <span style={{
        position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)",
        width: 36, height: 20, borderRadius: 10,
        background: checked ? "var(--green-mid)" : "rgba(180,180,180,0.35)",
        transition: "background 0.2s",
        display: "block",
      }} />
      <span style={{
        position: "absolute", top: "50%", left: 2,
        width: 16, height: 16, borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
        display: "block",
        transition: "transform 0.18s ease",
        transform: checked ? "translateY(-50%) translateX(16px)" : "translateY(-50%) translateX(0)",
      }} />
    </button>
  );
}

// ── SectionPickerDropdown — custom dropdown עם חיפוש וקיבוץ ─────────────────
function SectionPickerDropdown({
  value, onChange, sections, rows, placeholder = "בחר קבוצה...", onBudgetTypeChange, hasError,
}: {
  value: string;
  onChange: (val: string) => void;
  sections: string[];
  rows: CategoryRow[];
  placeholder?: string;
  onBudgetTypeChange?: (bt: "הכנסה" | "קבוע" | "משתנה") => void;
  hasError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  // ESC closes dropdown (capture phase — before global handler)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open]);

  // Map section → budget_type from existing rows
  const sectionBudgetMap: Record<string, string> = {};
  rows.forEach(r => { sectionBudgetMap[r.section] = r.budget_type; });

  const groups = [
    { key: "הכנסה",  label: "הכנסות" },
    { key: "קבוע",   label: "הוצאות קבועות" },
    { key: "משתנה",  label: "הוצאות משתנות" },
  ];

  const q = search.trim();
  const filteredSections = sections.filter(s => !q || s.includes(q));

  const groupedSections = groups.map(g => ({
    ...g,
    secs: filteredSections.filter(s => sectionBudgetMap[s] === g.key).sort(heSort),
  })).filter(g => g.secs.length > 0);

  const showCustom = !q || "+ קבוצה חדשה".includes(q);

  const handleSelect = (s: string) => {
    onChange(s);
    if (onBudgetTypeChange && sectionBudgetMap[s]) {
      onBudgetTypeChange(sectionBudgetMap[s] as "הכנסה" | "קבוע" | "משתנה");
    }
    setOpen(false);
    setSearch("");
  };

  const displayValue = value === "__custom__" ? "+ קבוצה חדשה" : value;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => open ? (setOpen(false), setSearch("")) : openDropdown()}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          ...inputS,
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", textAlign: "right", direction: "rtl",
          border: hasError ? "1.5px solid var(--red)" : "1px solid var(--border)",
          outline: open ? "2px solid var(--green-mid)" : undefined,
          outlineOffset: open ? 1 : undefined,
          background: "#fff",
          color: displayValue ? "var(--text)" : "var(--text-dim)",
        }}
      >
        <span style={{ flex: 1, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {displayValue || placeholder}
        </span>
        <span style={{
          fontSize: 11, color: "var(--text-dim)", marginRight: 6, flexShrink: 0,
          display: "inline-block",
          transition: "transform 0.15s ease",
          transform: open ? "rotate(180deg)" : "none",
        }}>▾</span>
      </button>

      {/* Dropdown panel — fixed positioning to escape overflow:hidden parents */}
      {open && (
        <div
          ref={containerRef}
          role="listbox"
          style={{
            ...panelStyle,
            background: "#fff", border: "1px solid var(--border)",
            borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,0.13)",
            display: "flex", flexDirection: "column",
            maxHeight: 300, overflow: "hidden",
          }}
        >
          {/* Search */}
          <div style={{ padding: "8px 8px 6px", borderBottom: "1px solid var(--border)" }}>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש קבוצה..."
              style={{
                width: "100%", padding: "7px 10px", borderRadius: 6,
                border: "1px solid var(--border)", background: "var(--surface2)",
                color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                boxSizing: "border-box", direction: "rtl", outline: "none",
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {groupedSections.length === 0 && !showCustom ? (
              <div style={{ padding: "16px 14px", fontSize: 13, color: "var(--text-dim)", textAlign: "center" }}>
                לא נמצאו קבוצות
              </div>
            ) : (
              groupedSections.map((g, gi) => (
                <div key={g.key}>
                  {/* Group header */}
                  <div style={{
                    padding: "6px 14px 4px",
                    fontSize: 11, fontWeight: 700, color: "var(--text-dim)",
                    textTransform: "uppercase" as const, letterSpacing: "0.06em",
                    borderTop: gi > 0 ? "1px solid var(--border)" : undefined,
                    background: "var(--surface2)",
                  }}>
                    {g.label}
                  </div>
                  {g.secs.map(s => (
                    <DropdownOption key={s} label={s} selected={s === value} onSelect={() => handleSelect(s)} />
                  ))}
                </div>
              ))
            )}

            {/* Custom section */}
            {showCustom && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <DropdownOption
                  label="+ קבוצה חדשה"
                  selected={value === "__custom__"}
                  onSelect={() => { onChange("__custom__"); setOpen(false); setSearch(""); }}
                  accent
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DropdownOption({ label, selected, onSelect, accent }: {
  label: string; selected: boolean; onSelect: () => void; accent?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "9px 16px", fontSize: 14, cursor: "pointer", direction: "rtl",
        background: selected ? "var(--green-pale)" : hovered ? "var(--surface2)" : "#fff",
        color: selected ? "var(--green-deep)" : accent ? "var(--green-mid)" : "var(--text)",
        fontWeight: selected ? 600 : accent ? 500 : 400,
        transition: "background 0.1s",
      }}
    >
      {label}
    </div>
  );
}

function tagsToStr(arr: string[] | null | undefined): string {
  return (arr || []).join(", ");
}
function strToTags(s: string): string[] {
  return s.split(",").map(t => t.trim()).filter(Boolean);
}

// מיון לפי טקסט עברי בלבד — ללא emoji prefix
const stripEmoji = (s: string) => s.replace(/^\P{L}+/u, "").trim();
const heSort = (a: string, b: string) => stripEmoji(a).localeCompare(stripEmoji(b), "he");

// ── CSS classes for hover states (can't use :hover with inline styles) ──────
const CAT_STYLES = `
  .cat-btn-edit { transition: background 0.15s, color 0.15s, border-color 0.15s; }
  .cat-btn-edit:hover { background: var(--surface2) !important; color: var(--text) !important; }

  .cat-btn-save { transition: background 0.15s; }
  .cat-btn-save:not(:disabled):hover { background: #255c3d !important; }

  .cat-btn-cancel { transition: background 0.15s; }
  .cat-btn-cancel:hover { background: var(--surface2) !important; }

  .cat-btn-add { transition: background 0.15s, opacity 0.15s; }
  .cat-btn-add:not(:disabled):hover { background: #255c3d !important; }

  .cat-arrow { transition: background 0.15s, color 0.15s; }
  .cat-arrow:not(:disabled):hover { background: var(--surface2) !important; color: var(--text) !important; }

  .cat-filter-tab { transition: background 0.15s, color 0.15s, border-color 0.15s; }
  .cat-filter-tab:hover { background: var(--surface2) !important; }

  /* ── Focus rings — WCAG 2.4.11 ── */
  .cat-btn-edit:focus-visible,
  .cat-btn-save:focus-visible,
  .cat-btn-cancel:focus-visible,
  .cat-btn-add:focus-visible,
  .cat-filter-tab:focus-visible {
    outline: 2px solid var(--green-mid) !important;
    outline-offset: 2px !important;
  }
  .cat-arrow:focus-visible {
    outline: 2px solid var(--green-mid) !important;
    outline-offset: 1px !important;
  }

  /* inputs & selects focus */
  .cat-input:focus, .cat-select:focus {
    outline: 2px solid var(--green-mid);
    outline-offset: 1px;
    border-color: var(--green-mid) !important;
  }

  .cat-accordion-body { overflow: hidden; transition: max-height 0.25s ease; }

  .cat-edit-form { animation: catFadeIn 0.15s ease; }
  @keyframes catFadeIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }

  /* ── Responsive — 768px ── */
  @media (max-width: 820px) {
    .cat-row { flex-wrap: wrap !important; gap: 6px !important; padding: 8px !important; }
    .cat-row-name { min-width: 100px !important; }
    .cat-row-actions { flex-wrap: wrap !important; gap: 6px !important; width: 100% !important; justify-content: flex-start !important; }
  }

  /* ── Skeleton loader ── */
  @keyframes catShimmer {
    0% { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  .cat-skeleton-row {
    background: linear-gradient(90deg, var(--surface2) 25%, var(--border) 50%, var(--surface2) 75%);
    background-size: 600px 100%;
    animation: catShimmer 1.4s infinite linear;
  }

  /* ── prefers-reduced-motion ── */
  @media (prefers-reduced-motion: reduce) {
    .cat-accordion-body, .cat-edit-form, .cat-btn-edit, .cat-btn-disable,
    .cat-btn-save, .cat-btn-cancel, .cat-btn-add, .cat-arrow, .cat-accordion-btn,
    .cat-skeleton-row {
      transition: none !important;
      animation: none !important;
    }
  }
`;

// ── Shared field label style ─────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  fontSize: 12, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500,
};

export default function CategoryManager() {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add-new state
  const [newName, setNewName] = useState("");
  const [newSection, setNewSection] = useState("");
  const [customSection, setCustomSection] = useState("");
  const [newBudgetType, setNewBudgetType] = useState<"הכנסה" | "קבוע" | "משתנה">("משתנה");
  const [newIgnored, setNewIgnored] = useState(false);
  const [newKeywords] = useState("");
  const [newMaxHints] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addSectionError, setAddSectionError] = useState(false);

  // Inline-edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editBudgetType, setEditBudgetType] = useState<"הכנסה" | "קבוע" | "משתנה">("משתנה");
  const [editIgnored, setEditIgnored] = useState(false);
  const [editKeywords] = useState("");
  const [editMaxHints] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  // Hover + drag state
  const [hoveredRowId, setHoveredRowId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // Collapsed segments — כל הסגמנטים מקובצים כברירת מחדל
  const [collapsedSegments, setCollapsedSegments] = useState<Set<string>>(
    new Set(["הכנסה", "קבוע", "משתנה"])
  );
  const toggleSegment = (key: string) => {
    setCollapsedSegments(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // One-time DB cleanup — strip emoji prefix from section names
  const cleanupDone = useRef(false);

  // Focus return — אחרי סגירת edit, מחזיר focus לכפתור "ערוך" של אותה שורה
  const editBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const prevEditId = useRef<number | null>(null);
  useEffect(() => {
    if (editId === null && prevEditId.current !== null) {
      setTimeout(() => editBtnRefs.current.get(prevEditId.current!)?.focus(), 50);
    }
    prevEditId.current = editId;
  }, [editId]);

  // Toast — מחליף inline banners
  const [toast, setToast] = useState<{msg: string; ok: boolean} | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), ok ? 2500 : 4000);
  };

  // Confirm modal — מחליף window.confirm
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .is("client_id", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) { console.error("load categories error:", error); return; }
      setRows((data || []) as CategoryRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Strip emoji from section names in DB — runs once after first load
  useEffect(() => {
    if (rows.length === 0 || cleanupDone.current) return;
    const needsCleanup = rows.some(r => /^\P{L}/u.test(r.section));
    if (!needsCleanup) { cleanupDone.current = true; return; }
    cleanupDone.current = true;
    const unique = [...new Set(rows.map(r => r.section))].filter(s => /^\P{L}/u.test(s));
    Promise.all(unique.map(old =>
      supabase.from("categories")
        .update({ section: old.replace(/^\P{L}+/u, "").trim() })
        .eq("section", old).is("client_id", null)
    )).then(() => {
      setRows(prev => prev.map(r => ({ ...r, section: r.section.replace(/^\P{L}+/u, "").trim() })));
    }).catch(err => console.error("Section cleanup error:", err));
  }, [rows.length]);

  // Escape — סוגר modal או טופס עריכה (dropdown has its own ESC handler in capture phase)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmModal) { setConfirmModal(null); return; }
      if (editId !== null) setEditId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editId, confirmModal]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const sections = [...new Set(rows.map(r => r.section))].sort(heSort);
  const active = rows.filter(r => r.is_active);
  const inactive = rows.filter(r => !r.is_active);

  // Map section → budget_type for auto-fill
  const sectionBudgetMap: Record<string, "הכנסה" | "קבוע" | "משתנה"> = {};
  rows.forEach(r => { sectionBudgetMap[r.section] = r.budget_type as any; });

  const filtered = (list: CategoryRow[]) =>
    search.trim()
      ? list.filter(r =>
          r.name.includes(search.trim()) ||
          r.section.includes(search.trim())
        )
      : list;

  // ── Actions ────────────────────────────────────────────────────────────────
  const addCategory = async () => {
    const name = newName.trim();
    const section = (newSection === "__custom__" ? customSection : newSection).trim();
    if (!name || !section) {
      if (!section) setAddSectionError(true);
      setAddMsg("יש למלא שם וקבוצה");
      return;
    }
    setAddSectionError(false);
    setAddSaving(true);
    setAddMsg("");
    const maxOrder = Math.max(0, ...rows.filter(r => r.section === section).map(r => r.sort_order));
    const { data: inserted, error } = await supabase.from("categories").insert([{
      name, section, budget_type: newBudgetType, client_id: null,
      is_active: true, is_ignored: newIgnored,
      sort_order: maxOrder + 10,
      keywords: strToTags(newKeywords),
      max_hints: strToTags(newMaxHints),
    }]).select().single();
    setAddSaving(false);
    if (error) {
      setAddMsg(error.message.includes("unique") ? "קטגוריה בשם זה כבר קיימת" : "שגיאה: " + error.message);
      return;
    }
    setAddMsg("✅ נוסף בהצלחה");
    setNewName(""); setNewSection(""); setNewIgnored(false); setNewBudgetType("משתנה");
    setTimeout(() => setAddMsg(""), 2000);
    if (inserted) setRows(prev => [...prev, inserted as CategoryRow]);
  };

  // toggleActive — פותח ConfirmModal במקום window.confirm
  const toggleActive = (row: CategoryRow) => {
    if (row.is_active) {
      setConfirmModal({
        title: "השבת קטגוריה",
        message: `להשבית את "${row.name}"?\n\nקטגוריה מושבתת לא תשמש לסיווג אוטומטי של עסקאות חדשות. ניתן להפעיל אותה מחדש בכל עת.`,
        confirmLabel: "השבת",
        danger: true,
        onConfirm: () => doToggle(row),
      });
    } else {
      doToggle(row);
    }
  };

  const doToggle = async (row: CategoryRow) => {
    setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: !row.is_active } : r));
    const { error } = await supabase.from("categories").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_active: row.is_active } : r));
      showToast("שגיאה בעדכון — " + error.message, false);
    }
  };

  const startEdit = (row: CategoryRow) => {
    setAddOpen(false);
    setEditErr("");
    setEditId(row.id);
    setEditName(row.name);
    setEditSection(row.section);
    setEditBudgetType((row.budget_type || "משתנה") as any);
    setEditIgnored(row.is_ignored);
  };

  const saveEdit = () => {
    if (!editId) return;
    const name = editName.trim();
    const section = editSection.trim();
    if (!name || !section) return;

    const originalRow = rows.find(r => r.id === editId);
    if (!originalRow) return;
    const isRename = originalRow.name !== name;
    const oldName = originalRow.name;

    if (isRename) {
      setConfirmModal({
        title: "שינוי שם קטגוריה",
        message: `שינוי שם מ-"${oldName}" ל-"${name}" ישפיע על כל נתוני הלקוחות.\nיעודכנו: תנועות מיובאות, תנועות ידניות, תנועות קבצים, תסריטים, מיפויים.\n\nהאם להמשיך?`,
        confirmLabel: "שנה שם",
        onConfirm: () => executeSaveEdit(name, section, true, oldName),
      });
    } else {
      executeSaveEdit(name, section, false, "");
    }
  };

  const executeSaveEdit = async (name: string, section: string, isRename: boolean, oldName: string) => {
    setEditSaving(true);
    setEditErr("");
    try {
      const { error: catErr } = await supabase.from("categories").update({
        name, section, budget_type: editBudgetType,
        is_ignored: editIgnored,
        keywords: strToTags(editKeywords),
        max_hints: strToTags(editMaxHints),
      }).eq("id", editId!);
      if (catErr) throw new Error("שגיאה בעדכון הקטגוריה: " + catErr.message);

      if (isRename) {
        const renameResults = await Promise.all([
          supabase.from("imported_transactions").update({ cat: name }).eq("cat", oldName),
          supabase.from("manual_transactions").update({ cat: name }).eq("cat", oldName),
          supabase.from("scenario_items").update({ category_name: name }).eq("category_name", oldName),
          supabase.from("remembered_mappings").update({ category: name }).eq("category", oldName),
        ]);
        const renameErr = renameResults.find(r => r.error);
        if (renameErr) throw new Error("שגיאה בעדכון טבלה נלווית: " + renameErr.error!.message);

        const { data: allSubs } = await supabase.from("portfolio_submissions").select("id, transactions");
        const toUpdate = (allSubs || []).filter((sub: any) =>
          (sub.transactions || []).some((tx: any) => tx.cat === oldName)
        );
        if (toUpdate.length > 0) {
          await Promise.all(toUpdate.map(async (sub: any) => {
            const updated = (sub.transactions || []).map((tx: any) =>
              tx.cat === oldName ? { ...tx, cat: name } : tx
            );
            await supabase.from("portfolio_submissions").update({ transactions: updated }).eq("id", sub.id);
          }));
        }
      }

      setRows(prev => prev.map(r => r.id === editId ? {
        ...r, name, section,
        budget_type: editBudgetType as CategoryRow["budget_type"],
        is_ignored: editIgnored,
        keywords: strToTags(editKeywords),
        max_hints: strToTags(editMaxHints),
      } : r));
      setEditId(null);
      showToast("✅ הקטגוריה עודכנה בהצלחה");
    } catch(err: any) {
      setEditErr("שגיאה בשמירה — " + (err?.message || "נסה שוב"));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Drag & drop reorder ────────────────────────────────────────────────────
  const handleDrop = async (targetRow: CategoryRow) => {
    if (!dragId || dragId === targetRow.id) { setDragId(null); setDragOverId(null); return; }
    const draggedRow = rows.find(r => r.id === dragId);
    if (!draggedRow || draggedRow.section !== targetRow.section) { setDragId(null); setDragOverId(null); return; }

    const sectionRows = rows
      .filter(r => r.section === draggedRow.section && r.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);

    const fromIdx = sectionRows.findIndex(r => r.id === dragId);
    const toIdx   = sectionRows.findIndex(r => r.id === targetRow.id);
    if (fromIdx === -1 || toIdx === -1) { setDragId(null); setDragOverId(null); return; }

    const reordered = [...sectionRows];
    const [removed] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, removed);
    const newOrders = reordered.map((r, i) => ({ id: r.id, sort_order: (i + 1) * 10 }));

    setRows(prev => prev.map(r => {
      const o = newOrders.find(x => x.id === r.id);
      return o ? { ...r, sort_order: o.sort_order } : r;
    }));
    setDragId(null);
    setDragOverId(null);

    await Promise.all(newOrders.map(({ id, sort_order }) =>
      supabase.from("categories").update({ sort_order }).eq("id", id)
    ));
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 0" }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="cat-skeleton-row" style={{ height: 60, borderRadius: 8, marginBottom: 8 }} />
      ))}
    </div>
  );

  const renderRow = (row: CategoryRow) => {
    const isEditing = editId === row.id;
    const isHovered = hoveredRowId === row.id;
    const isDragging = dragId === row.id;
    const isDragOver = dragOverId === row.id && dragId !== row.id;

    return (
      <div key={row.id}
        className="cat-row"
        draggable={!isEditing}
        onMouseEnter={() => setHoveredRowId(row.id)}
        onMouseLeave={() => setHoveredRowId(null)}
        onDragStart={() => setDragId(row.id)}
        onDragEnd={() => { setDragId(null); setDragOverId(null); }}
        onDragOver={e => { e.preventDefault(); setDragOverId(row.id); }}
        onDrop={() => handleDrop(row)}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          borderTop: isDragOver ? "2px solid var(--green-mid)" : undefined,
          background: isEditing ? "var(--surface2)" : isDragging ? "var(--green-pale)" : isHovered ? "rgba(0,0,0,0.025)" : !row.is_active ? "rgba(180,180,180,0.05)" : undefined,
          opacity: isDragging ? 0.5 : 1,
          cursor: isEditing ? undefined : "grab",
          flexWrap: "wrap",
          transition: "background 0.1s",
        }}>
        {isEditing ? (
          <div className="cat-edit-form" style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
            {/* Row 1: fields with labels */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              {/* שם קטגוריה */}
              <div style={{ flex: 2, minWidth: 130 }}>
                <div style={fieldLabel}>שם קטגוריה</div>
                <input
                  className="cat-input"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="שם הקטגוריה"
                  style={{ ...inputS, width: "100%" }}
                />
              </div>
              {/* קבוצה */}
              <div style={{ flex: 2, minWidth: 140 }}>
                <div style={fieldLabel}>קבוצה</div>
                <SectionPickerDropdown
                  value={editSection}
                  onChange={setEditSection}
                  sections={sections}
                  rows={rows}
                  onBudgetTypeChange={setEditBudgetType}
                />
              </div>
              {/* סוג תקציבי */}
              <div style={{ minWidth: 120 }}>
                <div style={fieldLabel}>סוג תקציבי</div>
                <select
                  className="cat-select"
                  value={editBudgetType}
                  onChange={e => setEditBudgetType(e.target.value as any)}
                  style={{ ...inputS, width: "100%" }}
                >
                  {BUDGET_TYPES.map(t => <option key={t} value={t}>{BUDGET_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              {/* הסתר מסיכומים */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", paddingBottom: 2 }}>
                <div style={fieldLabel}>הגדרות</div>
                <label
                  title="קטגוריה זו לא תיכלל בחישוב הסיכום החודשי והשנתי"
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, color: "var(--text-dim)", whiteSpace: "nowrap", cursor: "pointer", minHeight: 44 }}
                >
                  <input type="checkbox" checked={editIgnored} onChange={e => setEditIgnored(e.target.checked)} />
                  הסתר מסיכומים
                </label>
              </div>
            </div>
            {/* Row 2: buttons + error */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="cat-btn-save" onClick={saveEdit} disabled={editSaving}
                style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--green-mid)", color: "#fff", fontSize: 15, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, minHeight: 44 }}>
                {editSaving ? "..." : "שמור"}
              </button>
              <button className="cat-btn-cancel" onClick={() => setEditId(null)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 15, cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}>
                ביטול
              </button>
              {editErr && <span style={{ fontSize: 13, color: "var(--red)", marginRight: 4 }}>{editErr}</span>}
            </div>
          </div>
        ) : (
          <>
            {/* name */}
            <div className="cat-row-name" style={{ flex: 2, minWidth: 140 }}>
              <span style={{ fontSize: 15, color: !row.is_active ? "var(--text-dim)" : "var(--text)", textDecoration: !row.is_active ? "line-through" : "none" }}>
                {row.name}
                {row.is_ignored && <span style={{ fontSize: 12, color: "var(--text-dim)", marginRight: 6, marginLeft: 6, fontWeight: 400 }}> · מוסתר</span>}
              </span>
            </div>

            {/* actions */}
            <div className="cat-row-actions" onMouseDown={e => e.stopPropagation()} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "nowrap", flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                {BUDGET_TYPE_LABELS[row.budget_type] || row.budget_type}
              </span>

              <button className="cat-btn-edit" onClick={() => startEdit(row)}
                ref={el => { if (el) editBtnRefs.current.set(row.id, el); else editBtnRefs.current.delete(row.id); }}
                style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                ערוך
              </button>


              <ToggleSwitch
                checked={row.is_active}
                onChange={() => toggleActive(row)}
                label={row.is_active ? `השבת: ${row.name}` : `הפעל: ${row.name}`}
              />
            </div>
          </>
        )}
      </div>
    );
  };

  // filter by tab
  const displayRows = activeFilter === "all" ? rows : activeFilter === "active" ? active : inactive;

  return (
    <>
      <style>{CAT_STYLES}</style>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0, letterSpacing: "-0.01em" }}>
            קטגוריות
          </h1>
          <button
            className="cat-btn-add"
            onClick={() => setAddOpen(o => !o)}
            aria-expanded={addOpen}
            aria-controls="cat-add-form"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 16px", borderRadius: 8, border: "none",
              background: "var(--green-mid)", color: "#fff",
              fontFamily: "inherit", fontSize: 14, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            + הוסף קטגוריה
          </button>
        </div>

        {/* ── Search ── */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש שם / קבוצה..."
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "#fff",
            color: "var(--text)", fontSize: 15, fontFamily: "inherit",
            boxSizing: "border-box", marginBottom: 16, direction: "rtl",
          }}
        />

        {/* ── KPI strip ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { value: active.length, label: "קטגוריות פעילות" },
            { value: sections.length, label: "קבוצות" },
            ...(inactive.length > 0 ? [{ value: inactive.length, label: "מושבתות" }] : []),
          ].map(({ value, label }) => (
            <div key={label} style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 12, padding: "14px 20px", minWidth: 90,
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--green-deep)", lineHeight: 1, marginBottom: 4 }}>{value}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {([
            ["all", `כולם (${rows.length})`],
            ["active", `פעילות (${active.length})`],
            ...(inactive.length > 0 ? [["inactive", `מושבתות (${inactive.length})`]] : []),
          ] as [string, string][]).map(([val, label]) => (
            <button key={val} className="cat-filter-tab"
              onClick={() => setActiveFilter(val as any)}
              style={{
                padding: "7px 14px", borderRadius: 6, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit", fontWeight: 500, border: "1px solid",
                background: activeFilter === val ? "var(--green-mid)" : "transparent",
                color: activeFilter === val ? "#fff" : "var(--text-dim)",
                borderColor: activeFilter === val ? "var(--green-mid)" : "var(--border)",
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── הוסף קטגוריה — expandable form panel ── */}
        <div id="cat-add-form" className="cat-accordion-body" style={{ maxHeight: addOpen ? 1200 : 0, marginBottom: addOpen ? 20 : 0 }}>
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px", marginTop: 4 }}>
            {/* Row 1: name + section + budget_type + ignored */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
              {/* שם קטגוריה */}
              <div style={{ flex: 2, minWidth: 140 }}>
                <div style={fieldLabel}>שם הקטגוריה *</div>
                <input
                  className="cat-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="לדוגמה: ספא וטיפוחים"
                  style={{ ...inputS, width: "100%" }}
                  onKeyDown={e => e.key === "Enter" && addCategory()}
                />
              </div>
              {/* קבוצה */}
              <div style={{ flex: 2, minWidth: 160 }}>
                <div style={fieldLabel}>קבוצה *</div>
                <SectionPickerDropdown
                  value={newSection}
                  onChange={s => { setNewSection(s); setAddSectionError(false); }}
                  sections={sections}
                  rows={rows}
                  onBudgetTypeChange={setNewBudgetType}
                  hasError={addSectionError}
                />
              </div>
              {/* קבוצה חדשה */}
              {newSection === "__custom__" && (
                <div style={{ flex: 2, minWidth: 140 }}>
                  <div style={fieldLabel}>שם קבוצה חדשה *</div>
                  <input
                    className="cat-input"
                    value={customSection}
                    onChange={e => setCustomSection(e.target.value)}
                    placeholder='לדוגמה: "🏋️ ספורט"'
                    style={{ ...inputS, width: "100%" }}
                  />
                </div>
              )}
              {/* סוג תקציבי */}
              <div style={{ minWidth: 130 }}>
                <div style={fieldLabel}>סוג תקציבי</div>
                <select
                  className="cat-select"
                  value={newBudgetType}
                  onChange={e => setNewBudgetType(e.target.value as any)}
                  style={{ ...inputS, width: "100%" }}
                >
                  {BUDGET_TYPES.map(t => <option key={t} value={t}>{BUDGET_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              {/* הסתר מסיכומים */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                <div style={fieldLabel}>הגדרות</div>
                <label
                  title="קטגוריה זו לא תיכלל בחישוב הסיכום החודשי והשנתי"
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, color: "var(--text-dim)", whiteSpace: "nowrap", paddingBottom: 4, cursor: "pointer", minHeight: 44 }}
                >
                  <input type="checkbox" checked={newIgnored} onChange={e => setNewIgnored(e.target.checked)} />
                  הסתר מסיכומים
                </label>
              </div>
            </div>

            {/* Row 2: submit */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                className="cat-btn-add"
                onClick={addCategory}
                disabled={addSaving || !newName.trim()}
                style={{
                  padding: "10px 24px", borderRadius: 8, border: "none",
                  background: "var(--green-mid)", color: "#fff", fontSize: 15, fontWeight: 700,
                  cursor: !newName.trim() ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                  opacity: !newName.trim() ? 0.5 : 1,
                  minHeight: 44,
                }}>
                {addSaving ? "..." : "הוסף"}
              </button>
              {addMsg && (
                <span style={{ fontSize: 14, color: addMsg.startsWith("✅") ? "var(--green-mid)" : "var(--red)" }}>
                  {addMsg}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── 3 Segments ── */}
        {filtered(displayRows).length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "40px 32px" }}>
            <div style={{ fontSize: 15, marginBottom: 16 }}>
              {search ? "לא נמצאו קטגוריות תואמות לחיפוש" : "אין קטגוריות להצגה"}
            </div>
            {search && (
              <button onClick={() => setSearch("")} className="cat-btn-cancel"
                style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--green-mid)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                נקה חיפוש
              </button>
            )}
          </div>
        ) : (
          SEGMENTS.map(({ key, label }) => {
            const segRows = filtered(displayRows).filter(r => r.budget_type === key);
            if (segRows.length === 0) return null;

            const bySection: Record<string, CategoryRow[]> = {};
            segRows.forEach(r => {
              if (!bySection[r.section]) bySection[r.section] = [];
              bySection[r.section].push(r);
            });

            const sectionEntries = Object.entries(bySection).sort(([a], [b]) => heSort(a, b));
            const singleSection = sectionEntries.length === 1;
            const isCollapsed = !search.trim() && collapsedSegments.has(key);

            return (
              <div key={key} style={{ marginBottom: 28 }}>
                <button
                  onClick={() => toggleSegment(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    paddingBottom: 10, marginBottom: isCollapsed ? 0 : 16,
                    borderBottom: "2px solid var(--border)", borderTop: "none",
                    borderLeft: "none", borderRight: "none",
                    background: "none", cursor: "pointer", textAlign: "right",
                  }}
                >
                  <h2 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 17, fontWeight: 600, color: "var(--text)", margin: 0 }}>
                    {label}
                  </h2>
                  <span style={{ fontSize: 13, color: "var(--text-dim)" }}>· {segRows.length}</span>
                  <div style={{ flex: 1 }} />
                  <span style={{
                    fontSize: 20, color: "var(--text-dim)", lineHeight: 1,
                    display: "inline-block",
                    transition: "transform 0.2s ease",
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}>▾</span>
                </button>

                {!isCollapsed && sectionEntries.map(([section, sectionRows]) => (
                  <div key={section} style={{ marginBottom: 20 }}>
                    {!singleSection && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-mid)", whiteSpace: "nowrap" }}>
                          {section}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>· {sectionRows.length}</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                      </div>
                    )}
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      {sectionRows.sort((a, b) => a.sort_order - b.sort_order).map(renderRow)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 24, left: 24, zIndex: 1200,
            padding: "12px 20px", borderRadius: 8,
            background: toast.ok ? "var(--green-deep)" : "var(--red)",
            color: "#fff", fontSize: 14, fontWeight: 600,
            boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
            animation: "catFadeIn 0.2s ease",
            maxWidth: 320,
          }}>
          {toast.msg}
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div
          onClick={e => e.target === e.currentTarget && setConfirmModal(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
            zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}>
          <div style={{
            background: "var(--surface)", borderRadius: 12, padding: "24px 28px",
            maxWidth: 440, width: "100%",
            boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
              {confirmModal.title}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.7, whiteSpace: "pre-line", marginBottom: 24 }}>
              {confirmModal.message}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="cat-btn-save"
                onClick={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: confirmModal.danger ? "var(--red)" : "var(--green-mid)",
                  color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 700, minHeight: 44,
                }}>
                {confirmModal.confirmLabel || "המשך"}
              </button>
              <button
                className="cat-btn-cancel"
                onClick={() => setConfirmModal(null)}
                style={{
                  padding: "10px 16px", borderRadius: 8,
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-dim)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", minHeight: 44,
                }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
