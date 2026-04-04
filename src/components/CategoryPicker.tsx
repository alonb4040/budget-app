import { useState } from "react";
import { supabase } from "../supabase";
import { CATEGORIES as FALLBACK } from "../data";

interface Props {
  current: string;
  catSearch: string;
  setCatSearch: (v: string) => void;
  onSelect: (cat: string) => void;
  /** סקציות גלובליות — אם לא מועבר, נפול חזרה לקבוע הקוד */
  categories?: Record<string, string[]>;
  /** קטגוריות אישיות של הלקוח */
  clientCats?: string[];
  /** id הלקוח — דרוש כדי להציג כפתור "הוסף קטגוריה אישית" */
  clientId?: number | string | null;
  /** נקרא לאחר הוספת קטגוריה אישית, כדי לרענן */
  onCategoryAdded?: () => void;
}

export function CategoryPicker({
  current, catSearch, setCatSearch, onSelect,
  categories, clientCats = [], clientId, onCategoryAdded,
}: Props) {
  const cats = categories || FALLBACK;

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");

  const allFlat = [...Object.values(cats).flat(), ...clientCats];
  const filtered = catSearch.trim()
    ? allFlat.filter(c => c.toLowerCase().includes(catSearch.trim().toLowerCase()))
    : null;

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || !clientId) return;
    setSaving(true);
    setAddError("");
    const { error } = await supabase.from("categories").insert([{
      name,
      section: "⭐ הקטגוריות שלי",
      client_id: Number(clientId),
      is_active: true,
      is_ignored: false,
    }]);
    setSaving(false);
    if (error) {
      setAddError(error.message.includes("unique") ? "קטגוריה בשם זה כבר קיימת" : "שגיאה בשמירה");
      return;
    }
    setAdding(false);
    setNewName("");
    onCategoryAdded?.();
    onSelect(name);
  };

  const btnStyle = (cat: string, isClient = false) => ({
    padding: "4px 11px",
    borderRadius: 14,
    fontSize: 13,
    cursor: "pointer" as const,
    fontFamily: "inherit",
    border: `1px solid ${current === cat ? (isClient ? "var(--gold)" : "var(--green-mid)") : "var(--border)"}`,
    background: current === cat ? (isClient ? "rgba(251,191,36,0.15)" : "rgba(79,142,247,0.15)") : "var(--surface2)",
    color: current === cat ? (isClient ? "var(--gold)" : "var(--green-mid)") : "var(--text)",
    fontWeight: current === cat ? 700 : 400,
  });

  return (
    <div style={{ marginTop: 8 }}>
      <input
        value={catSearch}
        onChange={e => setCatSearch(e.target.value)}
        placeholder="חפש סעיף..."
        style={{
          width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "7px 12px", color: "var(--text)", fontSize: 14,
          fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box",
        }}
      />

      {/* ── חיפוש חופשי ── */}
      {filtered ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 150, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>לא נמצאו תוצאות</span>
          )}
          {filtered.map(cat => {
            const isClient = clientCats.includes(cat);
            return (
              <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }} style={btnStyle(cat, isClient)}>
                {isClient ? "⭐ " : ""}{cat}
              </button>
            );
          })}
        </div>
      ) : (
        /* ── תצוגה לפי סקציות ── */
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {Object.entries(cats).map(([group, groupCats]) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 700, marginBottom: 5, padding: "0 2px" }}>
                {group}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {groupCats.map(cat => (
                  <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }} style={btnStyle(cat)}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* ── קטגוריות אישיות ── */}
          {clientCats.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "var(--gold)", fontWeight: 700, marginBottom: 5, padding: "0 2px" }}>
                ⭐ הקטגוריות שלי
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {clientCats.map(cat => (
                  <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }} style={btnStyle(cat, true)}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── הוסף קטגוריה אישית ── */}
          {clientId && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
              {!adding ? (
                <button
                  onClick={() => { setAdding(true); setAddError(""); }}
                  style={{
                    background: "none", border: "1px dashed var(--border)", borderRadius: 8,
                    padding: "4px 12px", fontSize: 12, color: "var(--text-dim)", cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  + הוסף קטגוריה אישית
                </button>
              ) : (
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="שם הקטגוריה"
                      maxLength={50}
                      style={{
                        padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
                        background: "var(--surface2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit",
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleAdd();
                        if (e.key === "Escape") { setAdding(false); setNewName(""); }
                      }}
                    />
                    <button
                      onClick={handleAdd}
                      disabled={!newName.trim() || saving}
                      style={{
                        padding: "5px 12px", borderRadius: 6, border: "none",
                        background: "var(--green-mid)", color: "#fff", fontSize: 13,
                        cursor: "pointer", fontFamily: "inherit", opacity: !newName.trim() ? 0.5 : 1,
                      }}
                    >
                      {saving ? "..." : "שמור"}
                    </button>
                    <button
                      onClick={() => { setAdding(false); setNewName(""); setAddError(""); }}
                      style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 18, cursor: "pointer" }}
                    >
                      ×
                    </button>
                  </div>
                  {addError && (
                    <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{addError}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
