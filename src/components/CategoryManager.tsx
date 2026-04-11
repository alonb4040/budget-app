import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { CategoryRow } from "../hooks/useCategories";

// ════════════════════════════════════════════════════════════════
// CategoryManager — ניהול קטגוריות גלובליות ע"י האדמין
// ════════════════════════════════════════════════════════════════

const inputS: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px",
  background: "var(--surface2)", color: "var(--text)", fontSize: 15, fontFamily: "inherit",
};

const BUDGET_TYPES = ["הכנסה", "קבוע", "משתנה"] as const;
const BUDGET_TYPE_LABELS: Record<string, string> = {
  "הכנסה": "💰 הכנסה",
  "קבוע": "📌 קבוע",
  "משתנה": "🔄 משתנה",
};

function tagsToStr(arr: string[] | null | undefined): string {
  return (arr || []).join(", ");
}
function strToTags(s: string): string[] {
  return s.split(",").map(t => t.trim()).filter(Boolean);
}

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
  const [newKeywords, setNewKeywords] = useState("");
  const [newMaxHints, setNewMaxHints] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Inline-edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editBudgetType, setEditBudgetType] = useState<"הכנסה" | "קבוע" | "משתנה">("משתנה");
  const [editIgnored, setEditIgnored] = useState(false);
  const [editKeywords, setEditKeywords] = useState("");
  const [editMaxHints, setEditMaxHints] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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

  // ── Derived ────────────────────────────────────────────────────────────────
  const sections = [...new Set(rows.map(r => r.section))];
  const active = rows.filter(r => r.is_active);
  const inactive = rows.filter(r => !r.is_active);

  const filtered = (list: CategoryRow[]) =>
    search.trim()
      ? list.filter(r =>
          r.name.includes(search.trim()) ||
          r.section.includes(search.trim()) ||
          (r.keywords || []).some(k => k.includes(search.trim()))
        )
      : list;

  // ── Actions ────────────────────────────────────────────────────────────────
  const addCategory = async () => {
    const name = newName.trim();
    const section = (newSection === "__custom__" ? customSection : newSection).trim();
    if (!name || !section) { setAddMsg("יש למלא שם וסקציה"); return; }
    setAddSaving(true);
    setAddMsg("");
    const maxOrder = Math.max(0, ...rows.filter(r => r.section === section).map(r => r.sort_order));
    const { error } = await supabase.from("categories").insert([{
      name,
      section,
      budget_type: newBudgetType,
      client_id: null,
      is_active: true,
      is_ignored: newIgnored,
      sort_order: maxOrder + 10,
      keywords: strToTags(newKeywords),
      max_hints: strToTags(newMaxHints),
    }]);
    setAddSaving(false);
    if (error) {
      setAddMsg(error.message.includes("unique") ? "קטגוריה בשם זה כבר קיימת" : "שגיאה: " + error.message);
      return;
    }
    setAddMsg("✅ נוסף בהצלחה");
    setNewName(""); setNewIgnored(false); setNewKeywords(""); setNewMaxHints(""); setNewBudgetType("משתנה");
    setTimeout(() => setAddMsg(""), 2000);
    load();
  };

  const toggleActive = async (row: CategoryRow) => {
    const { error } = await supabase.from("categories").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) { alert("שגיאה בעדכון — " + error.message); return; }
    load();
  };

  const startEdit = (row: CategoryRow) => {
    setEditId(row.id);
    setEditName(row.name);
    setEditSection(row.section);
    setEditBudgetType((row.budget_type || "משתנה") as any);
    setEditIgnored(row.is_ignored);
    setEditKeywords(tagsToStr(row.keywords));
    setEditMaxHints(tagsToStr(row.max_hints));
  };

  const saveEdit = async () => {
    if (!editId) return;
    const newName = editName.trim();
    const section = editSection.trim();
    if (!newName || !section) return;

    const originalRow = rows.find(r => r.id === editId);
    if (!originalRow) return; // רשומה לא נמצאה — אל תמשיך
    const oldName = originalRow.name;
    const isRename = oldName !== newName;

    // If renaming, warn and cascade-update all stored data
    if (isRename) {
      const confirmed = window.confirm(
        `שינוי שם מ-"${oldName}" ל-"${newName}" ישפיע על כל נתוני הלקוחות.\n` +
        `יעודכנו: תנועות מיובאות, תנועות ידניות, תנועות קבצים, תסריטים, מיפויים.\n\n` +
        `האם להמשיך?`
      );
      if (!confirmed) return;
    }

    setEditSaving(true);
    try {
      // 1. Update the category itself
      const { error: catErr } = await supabase.from("categories").update({
        name: newName,
        section,
        budget_type: editBudgetType,
        is_ignored: editIgnored,
        keywords: strToTags(editKeywords),
        max_hints: strToTags(editMaxHints),
      }).eq("id", editId);
      if (catErr) throw new Error("שגיאה בעדכון הקטגוריה: " + catErr.message);

      // 2. Cascade rename across all tables (only if name changed)
      if (isRename) {
        const renameResults = await Promise.all([
          supabase.from("imported_transactions").update({ cat: newName }).eq("cat", oldName),
          supabase.from("manual_transactions").update({ cat: newName }).eq("cat", oldName),
          supabase.from("scenario_items").update({ category_name: newName }).eq("category_name", oldName),
          supabase.from("remembered_mappings").update({ category: newName }).eq("category", oldName),
        ]);
        const renameErr = renameResults.find(r => r.error);
        if (renameErr) throw new Error("שגיאה בעדכון טבלה נלווית: " + renameErr.error!.message);

        const { data: allSubs } = await supabase
          .from("portfolio_submissions")
          .select("id, transactions");

        const toUpdate = (allSubs || []).filter((sub: any) =>
          (sub.transactions || []).some((tx: any) => tx.cat === oldName)
        );
        if (toUpdate.length > 0) {
          await Promise.all(toUpdate.map(async (sub: any) => {
            const updated = (sub.transactions || []).map((tx: any) =>
              tx.cat === oldName ? { ...tx, cat: newName } : tx
            );
            await supabase.from("portfolio_submissions").update({ transactions: updated }).eq("id", sub.id);
          }));
        }
      }

      setEditId(null);
      load();
    } catch(err: any) {
      alert("שגיאה בשמירה — " + (err?.message || "נסה שוב"));
    } finally {
      setEditSaving(false);
    }
  };

  const moveUp = async (row: CategoryRow) => {
    const sameSection = rows.filter(r => r.section === row.section && r.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameSection.findIndex(r => r.id === row.id);
    if (idx <= 0) return;
    const prev = sameSection[idx - 1];
    const [r1, r2] = await Promise.all([
      supabase.from("categories").update({ sort_order: prev.sort_order }).eq("id", row.id),
      supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", prev.id),
    ]);
    if (r1.error || r2.error) { console.error("moveUp error:", r1.error || r2.error); return; }
    load();
  };

  const moveDown = async (row: CategoryRow) => {
    const sameSection = rows.filter(r => r.section === row.section && r.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameSection.findIndex(r => r.id === row.id);
    if (idx >= sameSection.length - 1) return;
    const next = sameSection[idx + 1];
    const [r1, r2] = await Promise.all([
      supabase.from("categories").update({ sort_order: next.sort_order }).eq("id", row.id),
      supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", next.id),
    ]);
    if (r1.error || r2.error) { console.error("moveDown error:", r1.error || r2.error); return; }
    load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>טוען...</div>
  );

  const renderRow = (row: CategoryRow) => {
    const isEditing = editId === row.id;
    const sameSection = rows.filter(r => r.section === row.section && r.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const sectionIdx = sameSection.findIndex(r => r.id === row.id);

    return (
      <div key={row.id} style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px",
        borderBottom: "1px solid var(--border)",
        background: !row.is_active ? "rgba(180,180,180,0.05)" : undefined,
        flexWrap: "wrap",
      }}>
        {isEditing ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Row 1: name + section + budget_type */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                placeholder="שם הקטגוריה"
                style={{ ...inputS, flex: 2, minWidth: 120 }} />
              <select value={editSection} onChange={e => setEditSection(e.target.value)}
                style={{ ...inputS, flex: 2, minWidth: 120 }}>
                {sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={editBudgetType} onChange={e => setEditBudgetType(e.target.value as any)}
                style={{ ...inputS, minWidth: 110 }}>
                {BUDGET_TYPES.map(t => <option key={t} value={t}>{BUDGET_TYPE_LABELS[t]}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={editIgnored} onChange={e => setEditIgnored(e.target.checked)} />
                להתעלם
              </label>
            </div>
            {/* Row 2: keywords + max_hints */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 3 }}>מילות מפתח (keywords) — מופרדות בפסיק</div>
                <input value={editKeywords} onChange={e => setEditKeywords(e.target.value)}
                  placeholder='לדוגמה: מקס, ויזה, אמריקן אקספרס'
                  style={{ ...inputS, width: "100%", boxSizing: "border-box", fontSize: 14 }} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 3 }}>רמזים לסיווג (max_hints) — מופרדים בפסיק</div>
                <input value={editMaxHints} onChange={e => setEditMaxHints(e.target.value)}
                  placeholder='לדוגמה: תשלום, עמלה'
                  style={{ ...inputS, width: "100%", boxSizing: "border-box", fontSize: 14 }} />
              </div>
            </div>
            {/* Row 3: buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={saveEdit} disabled={editSaving}
                style={{ padding: "5px 18px", borderRadius: 6, border: "none", background: "var(--green-mid)", color: "#fff", fontSize: 15, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                {editSaving ? "..." : "שמור"}
              </button>
              <button onClick={() => setEditId(null)}
                style={{ padding: "5px 14px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* sort arrows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1, paddingTop: 2 }}>
              <button onClick={() => moveUp(row)} disabled={sectionIdx === 0}
                style={{ background: "none", border: "none", cursor: sectionIdx === 0 ? "default" : "pointer", color: sectionIdx === 0 ? "var(--border)" : "var(--text-dim)", fontSize: 12, padding: "1px 3px", lineHeight: 1 }}>▲</button>
              <button onClick={() => moveDown(row)} disabled={sectionIdx >= sameSection.length - 1}
                style={{ background: "none", border: "none", cursor: sectionIdx >= sameSection.length - 1 ? "default" : "pointer", color: sectionIdx >= sameSection.length - 1 ? "var(--border)" : "var(--text-dim)", fontSize: 12, padding: "1px 3px", lineHeight: 1 }}>▼</button>
            </div>

            {/* name + keywords preview */}
            <div style={{ flex: 2, minWidth: 120 }}>
              <span style={{ fontSize: 15, color: !row.is_active ? "var(--text-dim)" : "var(--text)", textDecoration: !row.is_active ? "line-through" : "none" }}>
                {row.name}
                {row.is_ignored && <span style={{ fontSize: 12, color: "var(--text-dim)", marginRight: 4 }}>(מוסתר)</span>}
              </span>
              {(row.keywords?.length > 0 || row.max_hints?.length > 0) && (
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                  {row.keywords?.length > 0 && <span title="מילות מפתח">🔑 {row.keywords.join(", ")}</span>}
                  {row.keywords?.length > 0 && row.max_hints?.length > 0 && "  ·  "}
                  {row.max_hints?.length > 0 && <span title="רמזי סיווג">💡 {row.max_hints.join(", ")}</span>}
                </div>
              )}
            </div>

            {/* budget_type badge */}
            <span style={{
              fontSize: 13, borderRadius: 10, padding: "2px 8px", whiteSpace: "nowrap",
              background: row.budget_type === "הכנסה" ? "rgba(79,142,247,0.12)" : row.budget_type === "קבוע" ? "rgba(255,183,77,0.12)" : "rgba(180,180,180,0.1)",
              color: row.budget_type === "הכנסה" ? "var(--green-mid)" : row.budget_type === "קבוע" ? "var(--gold)" : "var(--text-dim)",
              border: `1px solid ${row.budget_type === "הכנסה" ? "var(--green-mid)" : row.budget_type === "קבוע" ? "var(--gold)" : "var(--border)"}44`,
            }}>
              {BUDGET_TYPE_LABELS[row.budget_type] || row.budget_type}
            </span>

            {/* section badge */}
            <span style={{ fontSize: 13, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "2px 8px", color: "var(--text-mid)", whiteSpace: "nowrap" }}>
              {row.section}
            </span>

            {/* actions */}
            <button onClick={() => startEdit(row)}
              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              ✏️ ערוך
            </button>
            <button onClick={() => toggleActive(row)}
              title={row.is_active ? "השבת (soft-delete)" : "הפעל מחדש"}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
                border: row.is_active ? "1px solid #ffcdd2" : "1px solid var(--green-soft)",
                background: row.is_active ? "#fff8f8" : "var(--green-mint)",
                color: row.is_active ? "#e53935" : "var(--green-deep)",
              }}>
              {row.is_active ? "השבת" : "הפעל"}
            </button>
          </>
        )}
      </div>
    );
  };

  // group by section
  const bySectionActive: Record<string, CategoryRow[]> = {};
  filtered(active).forEach(r => {
    if (!bySectionActive[r.section]) bySectionActive[r.section] = [];
    bySectionActive[r.section].push(r);
  });

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 22, fontWeight: 600, color: "var(--green-deep)" }}>
            ניהול קטגוריות
          </div>
          <div style={{ fontSize: 15, color: "var(--text-dim)", marginTop: 3 }}>
            {active.length} קטגוריות פעילות · {inactive.length} מושבתות
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 חיפוש שם / סקציה / keyword..."
          style={{ ...inputS, padding: "7px 14px", minWidth: 240 }} />
      </div>

      {/* ── הוסף קטגוריה חדשה ── */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>➕ הוסף קטגוריה גלובלית</div>
        {/* Row 1: name + section + budget_type + ignored */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
          <div style={{ flex: 2, minWidth: 140 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>שם הקטגוריה *</div>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="לדוגמה: ספא וטיפוחים"
              style={{ ...inputS, width: "100%", boxSizing: "border-box" }}
              onKeyDown={e => e.key === "Enter" && addCategory()}
            />
          </div>
          <div style={{ flex: 2, minWidth: 140 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>סקציה *</div>
            <select value={newSection} onChange={e => setNewSection(e.target.value)}
              style={{ ...inputS, width: "100%", boxSizing: "border-box" }}>
              <option value="">בחר סקציה...</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">+ סקציה חדשה</option>
            </select>
          </div>
          {newSection === "__custom__" && (
            <div style={{ flex: 2, minWidth: 140 }}>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>שם סקציה חדשה *</div>
              <input value={customSection} onChange={e => setCustomSection(e.target.value)}
                placeholder='לדוגמה: "🏋️ ספורט"'
                style={{ ...inputS, width: "100%", boxSizing: "border-box" }}
              />
            </div>
          )}
          <div style={{ minWidth: 120 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>סוג תקציבי</div>
            <select value={newBudgetType} onChange={e => setNewBudgetType(e.target.value as any)}
              style={{ ...inputS, width: "100%", boxSizing: "border-box" }}>
              {BUDGET_TYPES.map(t => <option key={t} value={t}>{BUDGET_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 14, color: "var(--text-dim)", whiteSpace: "nowrap", paddingBottom: 4 }}>
            <input type="checkbox" checked={newIgnored} onChange={e => setNewIgnored(e.target.checked)} />
            להתעלם בסיכומים
          </label>
        </div>
        {/* Row 2: keywords + max_hints */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>🔑 מילות מפתח לסיווג אוטומטי (מופרדות בפסיק)</div>
            <input value={newKeywords} onChange={e => setNewKeywords(e.target.value)}
              placeholder='לדוגמה: סופר, מגה, רמי לוי'
              style={{ ...inputS, width: "100%", boxSizing: "border-box", fontSize: 14 }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>💡 רמזי סיווג — max_hints (מופרדים בפסיק)</div>
            <input value={newMaxHints} onChange={e => setNewMaxHints(e.target.value)}
              placeholder='לדוגמה: תשלום, חיוב'
              style={{ ...inputS, width: "100%", boxSizing: "border-box", fontSize: 14 }}
            />
          </div>
          <button onClick={addCategory} disabled={addSaving || !newName.trim() || !newSection}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: "var(--green-mid)", color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", opacity: (!newName.trim() || !newSection) ? 0.5 : 1, alignSelf: "flex-end",
            }}>
            {addSaving ? "..." : "הוסף"}
          </button>
        </div>
        {addMsg && (
          <div style={{ marginTop: 4, fontSize: 14, color: addMsg.startsWith("✅") ? "var(--green-soft)" : "var(--red)" }}>
            {addMsg}
          </div>
        )}
      </div>

      {/* ── Active categories by section ── */}
      {Object.keys(bySectionActive).length === 0 && (
        <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 32 }}>אין קטגוריות תואמות</div>
      )}
      {Object.entries(bySectionActive).map(([section, sectionRows]) => (
        <div key={section} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: "var(--green-deep)",
            padding: "8px 12px", background: "var(--surface2)",
            border: "1px solid var(--border)", borderRadius: "8px 8px 0 0",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{section}</span>
            <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 400 }}>{sectionRows.length} קטגוריות</span>
          </div>
          <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {sectionRows.map(renderRow)}
          </div>
        </div>
      ))}

      {/* ── Inactive (soft-deleted) ── */}
      {inactive.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 15, color: "var(--text-dim)", padding: "8px 0" }}>
            🚫 מושבתות ({inactive.length})
          </summary>
          <div style={{ marginTop: 8, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            {filtered(inactive).map(renderRow)}
          </div>
        </details>
      )}
    </div>
  );
}
