import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { CategoryRow } from "../hooks/useCategories";

// ════════════════════════════════════════════════════════════════
// CategoryManager — ניהול קטגוריות גלובליות ע"י האדמין
// ════════════════════════════════════════════════════════════════

const inputS: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 6, padding: "7px 12px",
  background: "var(--surface2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit",
};

export default function CategoryManager() {
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add-new state
  const [newName, setNewName] = useState("");
  const [newSection, setNewSection] = useState("");
  const [customSection, setCustomSection] = useState("");
  const [newIgnored, setNewIgnored] = useState(false);
  const [addMsg, setAddMsg] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  // Inline-edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editIgnored, setEditIgnored] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("categories")
      .select("*")
      .is("client_id", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    setRows((data || []) as CategoryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const sections = [...new Set(rows.map(r => r.section))];
  const active = rows.filter(r => r.is_active);
  const inactive = rows.filter(r => !r.is_active);

  const filtered = (list: CategoryRow[]) =>
    search.trim()
      ? list.filter(r => r.name.includes(search.trim()) || r.section.includes(search.trim()))
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
      name, section, client_id: null, is_active: true, is_ignored: newIgnored,
      sort_order: maxOrder + 10,
    }]);
    setAddSaving(false);
    if (error) {
      setAddMsg(error.message.includes("unique") ? "קטגוריה בשם זה כבר קיימת" : "שגיאה: " + error.message);
      return;
    }
    setAddMsg("✅ נוסף בהצלחה");
    setNewName(""); setNewIgnored(false);
    setTimeout(() => setAddMsg(""), 2000);
    load();
  };

  const toggleActive = async (row: CategoryRow) => {
    await supabase.from("categories").update({ is_active: !row.is_active }).eq("id", row.id);
    load();
  };

  const startEdit = (row: CategoryRow) => {
    setEditId(row.id);
    setEditName(row.name);
    setEditSection(row.section);
    setEditIgnored(row.is_ignored);
  };

  const saveEdit = async () => {
    if (!editId) return;
    const name = editName.trim();
    const section = editSection.trim();
    if (!name || !section) return;
    setEditSaving(true);
    await supabase.from("categories").update({ name, section, is_ignored: editIgnored }).eq("id", editId);
    setEditSaving(false);
    setEditId(null);
    load();
  };

  const moveUp = async (row: CategoryRow) => {
    const sameSection = rows.filter(r => r.section === row.section && r.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameSection.findIndex(r => r.id === row.id);
    if (idx <= 0) return;
    const prev = sameSection[idx - 1];
    await Promise.all([
      supabase.from("categories").update({ sort_order: prev.sort_order }).eq("id", row.id),
      supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", prev.id),
    ]);
    load();
  };

  const moveDown = async (row: CategoryRow) => {
    const sameSection = rows.filter(r => r.section === row.section && r.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const idx = sameSection.findIndex(r => r.id === row.id);
    if (idx >= sameSection.length - 1) return;
    const next = sameSection[idx + 1];
    await Promise.all([
      supabase.from("categories").update({ sort_order: next.sort_order }).eq("id", row.id),
      supabase.from("categories").update({ sort_order: row.sort_order }).eq("id", next.id),
    ]);
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
        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: !row.is_active ? "rgba(180,180,180,0.05)" : undefined,
        flexWrap: "wrap",
      }}>
        {isEditing ? (
          <>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              style={{ ...inputS, flex: 2, minWidth: 120 }} />
            <select value={editSection} onChange={e => setEditSection(e.target.value)}
              style={{ ...inputS, flex: 2, minWidth: 120 }}>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={editIgnored} onChange={e => setEditIgnored(e.target.checked)} />
              להתעלם
            </label>
            <button onClick={saveEdit} disabled={editSaving}
              style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "var(--green-mid)", color: "#fff", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {editSaving ? "..." : "שמור"}
            </button>
            <button onClick={() => setEditId(null)}
              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              ביטול
            </button>
          </>
        ) : (
          <>
            {/* sort arrows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <button onClick={() => moveUp(row)} disabled={sectionIdx === 0}
                style={{ background: "none", border: "none", cursor: sectionIdx === 0 ? "default" : "pointer", color: sectionIdx === 0 ? "var(--border)" : "var(--text-dim)", fontSize: 10, padding: "1px 3px", lineHeight: 1 }}>▲</button>
              <button onClick={() => moveDown(row)} disabled={sectionIdx >= sameSection.length - 1}
                style={{ background: "none", border: "none", cursor: sectionIdx >= sameSection.length - 1 ? "default" : "pointer", color: sectionIdx >= sameSection.length - 1 ? "var(--border)" : "var(--text-dim)", fontSize: 10, padding: "1px 3px", lineHeight: 1 }}>▼</button>
            </div>

            {/* name */}
            <span style={{ flex: 2, fontSize: 13, color: !row.is_active ? "var(--text-dim)" : "var(--text)", textDecoration: !row.is_active ? "line-through" : "none" }}>
              {row.name}
              {row.is_ignored && <span style={{ fontSize: 10, color: "var(--text-dim)", marginRight: 4 }}>(מוסתר)</span>}
            </span>

            {/* section badge */}
            <span style={{ fontSize: 11, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "2px 8px", color: "var(--text-mid)", whiteSpace: "nowrap" }}>
              {row.section}
            </span>

            {/* actions */}
            <button onClick={() => startEdit(row)}
              style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              ✏️ ערוך
            </button>
            <button onClick={() => toggleActive(row)}
              title={row.is_active ? "השבת (soft-delete)" : "הפעל מחדש"}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
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
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, color: "var(--green-deep)" }}>
            ניהול קטגוריות
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            {active.length} קטגוריות פעילות · {inactive.length} מושבתות
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 חיפוש..."
          style={{ ...inputS, padding: "7px 14px", minWidth: 200 }} />
      </div>

      {/* ── הוסף קטגוריה חדשה ── */}
      <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>➕ הוסף קטגוריה גלובלית</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 2, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>שם הקטגוריה *</div>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="לדוגמה: ספא וטיפוחים"
              style={{ ...inputS, width: "100%", boxSizing: "border-box" }}
              onKeyDown={e => e.key === "Enter" && addCategory()}
            />
          </div>
          <div style={{ flex: 2, minWidth: 150 }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>סקציה *</div>
            <select value={newSection} onChange={e => setNewSection(e.target.value)}
              style={{ ...inputS, width: "100%", boxSizing: "border-box" }}>
              <option value="">בחר סקציה...</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="__custom__">+ סקציה חדשה</option>
            </select>
          </div>
          {newSection === "__custom__" && (
            <div style={{ flex: 2, minWidth: 150 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 4 }}>שם סקציה חדשה *</div>
              <input value={customSection} onChange={e => setCustomSection(e.target.value)}
                placeholder='לדוגמה: "🏋️ ספורט"'
                style={{ ...inputS, width: "100%", boxSizing: "border-box" }}
              />
            </div>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap", paddingBottom: 4 }}>
            <input type="checkbox" checked={newIgnored} onChange={e => setNewIgnored(e.target.checked)} />
            להתעלם בסיכומים
          </label>
          <button onClick={addCategory} disabled={addSaving || !newName.trim() || !newSection}
            style={{
              padding: "8px 18px", borderRadius: 8, border: "none",
              background: "var(--green-mid)", color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", opacity: (!newName.trim() || !newSection) ? 0.5 : 1,
            }}>
            {addSaving ? "..." : "הוסף"}
          </button>
        </div>
        {addMsg && (
          <div style={{ marginTop: 8, fontSize: 12, color: addMsg.startsWith("✅") ? "var(--green-soft)" : "var(--red)" }}>
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
            fontSize: 13, fontWeight: 700, color: "var(--green-deep)",
            padding: "8px 12px", background: "var(--surface2)",
            border: "1px solid var(--border)", borderRadius: "8px 8px 0 0",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span>{section}</span>
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 400 }}>{sectionRows.length} קטגוריות</span>
          </div>
          <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
            {sectionRows.map(renderRow)}
          </div>
        </div>
      ))}

      {/* ── Inactive (soft-deleted) ── */}
      {inactive.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-dim)", padding: "8px 0" }}>
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
