import { useState, useMemo } from "react";
import { supabase } from "../supabase";
import { CATEGORIES as FALLBACK } from "../data";
import type { CategoryRow } from "../hooks/useCategories";

type BudgetType = 'הכנסה' | 'קבוע' | 'משתנה';

interface Props {
  current: string;
  catSearch: string;
  setCatSearch: (v: string) => void;
  onSelect: (cat: string) => void;
  /** סקציות גלובליות — אם לא מועבר, נפול חזרה לקבוע הקוד */
  categories?: Record<string, string[]>;
  /** שורות גולמיות מה-DB — לצורך חלוקה לקבוע/משתנה/הכנסה */
  rows?: CategoryRow[];
  /** קטגוריות אישיות של הלקח */
  clientCats?: string[];
  /** id הלקוח — דרוש כדי להציג כפתור "הוסף קטגוריה אישית" */
  clientId?: number | string | null;
  /** נקרא לאחר הוספת קטגוריה אישית, כדי לרענן */
  onCategoryAdded?: () => void;
  /** קטגוריות מוסתרות */
  hiddenCats?: string[];
  /** נקרא עם הרשימה המעודכנת אחרי שינוי הסתרה */
  onHiddenCatsChange?: (cats: string[]) => void;
  /** אם מועבר — מציג רק קטגוריות אלה (מהתסריט הפעיל) + קטגוריות אישיות */
  scenarioCats?: string[] | null;
}

export function CategoryPicker({
  current, catSearch, setCatSearch, onSelect,
  categories, rows, clientCats = [], clientId, onCategoryAdded,
  hiddenCats = [], onHiddenCatsChange, scenarioCats,
}: Props) {
  // אם יש תסריט פעיל — הצג רק קטגוריות מהתסריט (לפי sections)
  // אחרת — הצג הכל
  const baseCats = useMemo(() => {
    const allCats = categories || FALLBACK;
    if (!scenarioCats) return allCats;
    const scenSet = new Set(scenarioCats);
    const result: Record<string, string[]> = {};
    Object.entries(allCats).forEach(([section, names]) => {
      const filtered = names.filter(n => scenSet.has(n));
      if (filtered.length > 0) result[section] = filtered;
    });
    return result;
  }, [categories, scenarioCats]);

  const cats = baseCats;

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState("");
  const [selectedType, setSelectedType] = useState<BudgetType | null>(null);
  const [managing, setManaging] = useState(false);
  const [manageTab, setManageTab] = useState<"builtin"|"personal">("builtin");
  const [showHidden, setShowHidden] = useState(false);
  const [deleteCheck, setDeleteCheck] = useState<{
    cat: string;
    usages: {monthLabel:string;date:string;name:string;amount:number;submissionId:string;txIndex:number}[];
    subTransactions: Record<string, any[]>;
  } | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [reclassOpenFor, setReclassOpenFor] = useState<string|null>(null);
  const [reclassSearch, setReclassSearch] = useState("");

  const hiddenSet = useMemo(() => new Set(hiddenCats), [hiddenCats]);

  // קטגוריות מסוננות לפי סוג נבחר + ללא המוסתרות (אלא אם במצב ניהול)
  const visibleCats = useMemo(() => {
    let base = cats;
    if (rows && selectedType) {
      const typeNames = new Set(rows.filter(r => r.budget_type === selectedType).map(r => r.name));
      const result: Record<string, string[]> = {};
      Object.entries(cats).forEach(([section, names]) => {
        const filtered = names.filter(n => typeNames.has(n));
        if (filtered.length > 0) result[section] = filtered;
      });
      base = result;
    }
    if (managing) return base; // במצב ניהול רואים הכל
    const result: Record<string, string[]> = {};
    Object.entries(base).forEach(([section, names]) => {
      const filtered = names.filter(n => !hiddenSet.has(n));
      if (filtered.length > 0) result[section] = filtered;
    });
    return result;
  }, [cats, rows, selectedType, hiddenSet, managing]);

  // מפה שם → budget_type לתצוגה בחיפוש
  const budgetTypeMap = useMemo(() => {
    const m: Record<string, string> = {};
    (rows || []).forEach(r => { m[r.name] = r.budget_type; });
    return m;
  }, [rows]);

  // חיפוש — תמיד על כל הקטגוריות (ללא תלות בסוג נבחר), ובלי המוסתרות
  const allCatsFlat = useMemo(() => {
    const global = Object.values(cats).flat().filter(n => !hiddenSet.has(n));
    const personal = clientCats.filter(n => !hiddenSet.has(n));
    return [...global, ...personal];
  }, [cats, clientCats, hiddenSet]);

  const filtered = catSearch.trim()
    ? allCatsFlat.filter(c => c.toLowerCase().includes(catSearch.trim().toLowerCase()))
    : null;

  const hideCategory = (cat: string) => {
    const next = [...hiddenCats, cat];
    onHiddenCatsChange?.(next);
  };

  const restoreCategory = (cat: string) => {
    const next = hiddenCats.filter(c => c !== cat);
    onHiddenCatsChange?.(next);
  };

  const handleDeletePersonalCat = async (cat: string) => {
    if (!clientId) return;
    setDeleteChecking(true);
    const { data: subs } = await supabase
      .from("portfolio_submissions")
      .select("id, label, transactions")
      .eq("client_id", Number(clientId));
    setDeleteChecking(false);
    const usages: {monthLabel:string;date:string;name:string;amount:number;submissionId:string;txIndex:number}[] = [];
    const subTransactions: Record<string, any[]> = {};
    (subs || []).forEach((sub: any) => {
      subTransactions[sub.id] = sub.transactions || [];
      (sub.transactions || []).forEach((tx: any, txIndex: number) => {
        if (tx.cat === cat) usages.push({ monthLabel: sub.label, date: tx.date, name: tx.name, amount: tx.amount, submissionId: sub.id, txIndex });
      });
    });
    setDeleteCheck({ cat, usages, subTransactions });
  };

  const reclassifyUsage = async (submissionId: string, txIndex: number, newCat: string) => {
    if (!deleteCheck) return;
    const txs = [...deleteCheck.subTransactions[submissionId]];
    txs[txIndex] = { ...txs[txIndex], cat: newCat };
    await supabase.from("portfolio_submissions").update({ transactions: txs }).eq("id", submissionId);
    const newSubTxs = { ...deleteCheck.subTransactions, [submissionId]: txs };
    const newUsages = deleteCheck.usages.filter(u => !(u.submissionId === submissionId && u.txIndex === txIndex));
    setDeleteCheck({ ...deleteCheck, usages: newUsages, subTransactions: newSubTxs });
  };

  const confirmDeletePersonalCat = async (cat: string) => {
    await supabase.from("categories").delete().eq("client_id", Number(clientId)).eq("name", cat);
    setDeleteCheck(null);
    onCategoryAdded?.();
  };

  const allCategoryOptions = useMemo(() => {
    const global = Object.values(cats).flat();
    const personal = clientCats.filter(c => c !== deleteCheck?.cat);
    return [...new Set([...global, ...personal])].sort();
  }, [cats, clientCats, deleteCheck?.cat]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || !clientId) return;
    setSaving(true);
    setAddError("");
    // חשב sort_order גבוה מכל הקטגוריות האישיות הקיימות
    const { data: maxOrdRow } = await supabase
      .from("categories").select("sort_order")
      .eq("client_id", Number(clientId))
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextOrder = ((maxOrdRow as any)?.sort_order || 0) + 10;

    const { error } = await supabase.from("categories").insert([{
      name,
      section: "⭐ הקטגוריות שלי",
      budget_type: selectedType || 'משתנה',
      client_id: Number(clientId),
      is_active: true,
      is_ignored: false,
      sort_order: nextOrder,
    }]);
    setSaving(false);
    if (error) {
      setAddError(error.message.includes("unique") ? "קטגוריה בשם זה כבר קיימת — חפש אותה ברשימת הקטגוריות" : "שגיאה בשמירה");
      return;
    }
    // רשום ב-change_log — כישלון לא ימנע הוספת הקטגוריה
    supabase.from("client_change_log").insert([{
      client_id: Number(clientId),
      event_type: "category_created",
      details: { category_name: name, budget_type: selectedType || 'משתנה' },
    }]).then(({ error }) => { if (error) console.error("change_log insert error:", error); });
    setAdding(false);
    setNewName("");
    onCategoryAdded?.();
    onSelect(name);
  };

  const btnStyle = (cat: string, isClient = false, isHiding = false) => ({
    padding: "4px 11px",
    borderRadius: 14,
    fontSize: 15,
    cursor: "pointer" as const,
    fontFamily: "inherit",
    border: `1px solid ${current === cat ? (isClient ? "var(--gold)" : "var(--green-mid)") : isHiding ? "var(--red)" : "var(--border)"}`,
    background: current === cat ? (isClient ? "rgba(251,191,36,0.15)" : "rgba(79,142,247,0.15)") : isHiding ? "rgba(247,92,92,0.08)" : "var(--surface2)",
    color: current === cat ? (isClient ? "var(--gold)" : "var(--green-mid)") : isHiding ? "var(--red)" : "var(--text)",
    fontWeight: current === cat ? 700 : 400,
    opacity: isHiding ? 0.7 : 1,
  });

  const typeLabels: { type: BudgetType; label: string; color: string }[] = [
    { type: 'הכנסה',  label: '💰 הכנסות',         color: 'var(--green-mid)' },
    { type: 'קבוע',   label: '🔒 הוצאות קבועות',  color: 'var(--gold)' },
    { type: 'משתנה',  label: '🔀 הוצאות משתנות',  color: 'var(--red)' },
  ];

  const canManage = !!onHiddenCatsChange;

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── מודל מחיקת קטגוריה אישית ── */}
      {deleteCheck && (
        <>
          <div onClick={() => setDeleteCheck(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:24, zIndex:9001, width:360, maxHeight:"70vh", overflow:"auto", direction:"rtl" }}>
            {deleteCheck.usages.length === 0 ? (
              <>
                <div style={{ fontWeight:700, fontSize:17, marginBottom:10, color:"var(--red)" }}>מחיקת קטגוריה</div>
                <div style={{ fontSize:15, color:"var(--text-dim)", marginBottom:20, lineHeight:1.6 }}>
                  למחוק לצמיתות את הקטגוריה <strong>"{deleteCheck.cat}"</strong>?<br/>
                  הקטגוריה אינה בשימוש בשום תנועה.
                </div>
                <div style={{ display:"flex", gap:10 }}>
                  <button onClick={() => confirmDeletePersonalCat(deleteCheck.cat)} style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", background:"var(--red)", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>🗑 מחק</button>
                  <button onClick={() => setDeleteCheck(null)} style={{ padding:"9px 16px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--text-dim)", fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight:700, fontSize:17, marginBottom:6, color:"var(--red)" }}>הקטגוריה בשימוש</div>
                <div style={{ fontSize:14, color:"var(--text-dim)", marginBottom:12 }}>
                  הקטגוריה <strong>"{deleteCheck.cat}"</strong> בשימוש ב-{deleteCheck.usages.length} תנועות.<br/>
                  שנה את הסיווג לכל תנועה כדי לאפשר מחיקה.
                </div>
                <div style={{ maxHeight:300, overflowY:"auto", border:"1px solid var(--border)", borderRadius:8 }}>
                  {(() => {
                    const byMonth: Record<string, typeof deleteCheck.usages> = {};
                    deleteCheck.usages.forEach(u => { (byMonth[u.monthLabel] = byMonth[u.monthLabel] || []).push(u); });
                    return Object.entries(byMonth).map(([month, txs]) => (
                      <div key={month}>
                        <div style={{ padding:"6px 12px", background:"var(--green-pale)", fontWeight:700, fontSize:13, color:"var(--green-deep)", position:"sticky", top:0 }}>{month}</div>
                        {txs.map((u, i) => {
                            const uid = `${u.submissionId}-${u.txIndex}`;
                            const isOpen = reclassOpenFor === uid;
                            const opts = allCategoryOptions.filter(c => c !== deleteCheck.cat && (!reclassSearch.trim() || c.toLowerCase().includes(reclassSearch.trim().toLowerCase())));
                            return (
                              <div key={i} style={{ padding:"8px 12px", borderBottom:"1px solid var(--border)22" }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                                  <div>
                                    <div style={{ fontWeight:600, fontSize:13 }}>{u.name}</div>
                                    <div style={{ color:"var(--text-dim)", fontSize:12 }}>{u.date}</div>
                                  </div>
                                  <span style={{ fontWeight:700, color:"var(--red)", fontSize:13 }}>₪{Number(u.amount).toLocaleString()}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => { setReclassOpenFor(isOpen ? null : uid); setReclassSearch(""); }}
                                  style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 10px", borderRadius:8, border:`1px solid ${isOpen ? "var(--green-mid)" : "var(--border)"}`, background: isOpen ? "rgba(79,142,247,0.08)" : "var(--surface2)", color:"var(--text)", fontSize:13, fontFamily:"inherit", cursor:"pointer" }}
                                >
                                  <span>🔄 שנה סיווג מ<strong> {deleteCheck.cat}</strong></span>
                                  <span style={{ color:"var(--text-dim)" }}>{isOpen ? "▲" : "▼"}</span>
                                </button>
                                {isOpen && (
                                  <div style={{ marginTop:6, border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
                                    <input
                                      autoFocus
                                      value={reclassSearch}
                                      onChange={e => setReclassSearch(e.target.value)}
                                      placeholder="חפש קטגוריה..."
                                      style={{ width:"100%", boxSizing:"border-box", padding:"7px 10px", border:"none", borderBottom:"1px solid var(--border)", background:"var(--surface)", color:"var(--text)", fontSize:13, fontFamily:"inherit", outline:"none" }}
                                    />
                                    <div style={{ maxHeight:140, overflowY:"auto", padding:"6px 8px", display:"flex", flexWrap:"wrap", gap:5 }}>
                                      {opts.length === 0 && <span style={{ fontSize:13, color:"var(--text-dim)" }}>לא נמצאו תוצאות</span>}
                                      {opts.map(c => (
                                        <button key={c} type="button"
                                          onClick={() => { reclassifyUsage(u.submissionId, u.txIndex, c); setReclassOpenFor(null); setReclassSearch(""); }}
                                          style={{ padding:"4px 11px", borderRadius:14, fontSize:13, cursor:"pointer", fontFamily:"inherit", border:`1px solid ${clientCats.includes(c) ? "var(--gold)" : "var(--border)"}`, background: clientCats.includes(c) ? "rgba(251,191,36,0.1)" : "var(--surface2)", color: clientCats.includes(c) ? "var(--gold)" : "var(--text)", fontWeight:400 }}
                                        >
                                          {c}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    ));
                  })()}
                </div>
                <button onClick={() => setDeleteCheck(null)} style={{ marginTop:14, width:"100%", padding:"9px 0", borderRadius:8, border:"none", background:"var(--green-mid)", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>סגור</button>
              </>
            )}
          </div>
        </>
      )}

      {/* ── כותרת עם כפתור ניהול ── */}
      {canManage && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
          <button
            type="button"
            onClick={() => { setManaging(m => !m); setShowHidden(false); setManageTab("builtin"); }}
            style={{
              background: managing ? "rgba(247,92,92,0.1)" : "transparent",
              border: `1px solid ${managing ? "var(--red)" : "var(--border)"}`,
              borderRadius: 8, padding: "3px 10px", fontSize: 13,
              color: managing ? "var(--red)" : "var(--text-dim)",
              cursor: "pointer", fontFamily: "inherit", fontWeight: managing ? 700 : 400,
            }}
          >
            {managing ? "✓ סיום ניהול" : "⚙ נהל קטגוריות"}
          </button>
        </div>
      )}

      {/* ── בחירת סוג ── */}
      {rows && !adding && (!managing || manageTab === "builtin") && (
        <>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 5, fontWeight: 600 }}>בחר סוג קטגוריה</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {typeLabels.map(({ type, label, color }) => (
              <button
                type="button"
                key={type}
                onClick={() => setSelectedType(prev => prev === type ? null : type)}
                style={{
                  flex: 1, padding: "6px 4px", fontSize: 14, fontFamily: "inherit",
                  border: `1px solid ${selectedType === type ? color : "var(--border)"}`,
                  borderRadius: 8, cursor: "pointer",
                  background: selectedType === type ? `color-mix(in srgb, ${color} 15%, transparent)` : "var(--surface2)",
                  color: selectedType === type ? color : "var(--text-dim)",
                  fontWeight: selectedType === type ? 700 : 400,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── חיפוש — מוסתר בעת הוספת קטגוריה ── */}
      {!adding && (
        <input
          value={catSearch}
          onChange={e => setCatSearch(e.target.value)}
          placeholder="חפש סעיף..."
          style={{
            width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "7px 12px", color: "var(--text)", fontSize: 16,
            fontFamily: "inherit", outline: "none", marginBottom: 8, boxSizing: "border-box",
          }}
        />
      )}

      {/* ── הוסף קטגוריה אישית — תמיד מוצג ── */}
      {clientId && !managing && (
        <div style={{ marginBottom: 8 }}>
          {!adding ? (
            <button
              type="button"
              onClick={() => { setAdding(true); setAddError(""); setSelectedType(null); setNewName(""); }}
              style={{
                background: "rgba(251,191,36,0.12)", border: "1px dashed var(--gold)", borderRadius: 8,
                padding: "7px 14px", fontSize: 14, color: "var(--gold)", cursor: "pointer",
                fontFamily: "inherit", width: "100%", fontWeight: 600,
              }}
            >
              ⭐ הוסף קטגוריה אישית
            </button>
          ) : (
            <div style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, padding: "12px 12px 10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>⭐ קטגוריה אישית חדשה</span>
                <button type="button" onClick={() => { setAdding(false); setNewName(""); setAddError(""); setSelectedType(null); }}
                  style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>×</button>
              </div>

              {/* שלב 1 — בחר סוג */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>1. בחר סוג:</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {([
                    { type: 'הכנסה' as BudgetType,  label: '💰 הכנסה',         color: 'var(--green-mid)' },
                    { type: 'קבוע'  as BudgetType,  label: '🔒 הוצאה קבועה',  color: 'var(--gold)' },
                    { type: 'משתנה' as BudgetType,  label: '🔀 הוצאה משתנה',  color: 'var(--red)' },
                  ]).map(({ type, label, color }) => (
                    <button type="button" key={type} onClick={() => setSelectedType(type)}
                      style={{ flex: 1, padding: "6px 4px", fontSize: 13, fontFamily: "inherit", cursor: "pointer",
                        border: `1.5px solid ${selectedType === type ? color : "var(--border)"}`,
                        borderRadius: 8,
                        background: selectedType === type ? `color-mix(in srgb, ${color} 15%, transparent)` : "var(--surface2)",
                        color: selectedType === type ? color : "var(--text-dim)",
                        fontWeight: selectedType === type ? 700 : 400 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* שלב 2 — שם (רק אחרי בחירת סוג) */}
              {selectedType && (
                <div>
                  <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>2. שם הקטגוריה:</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="למשל: טיפולי שיניים"
                      maxLength={50}
                      style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
                        background: "var(--surface)", color: "var(--text)", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                      onKeyDown={e => {
                        if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
                        if (e.key === "Escape") { setAdding(false); setNewName(""); }
                      }}
                    />
                    <button type="button" onClick={handleAdd} disabled={!newName.trim() || saving}
                      style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "var(--green-mid)", color: "#fff",
                        fontSize: 15, cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                        opacity: !newName.trim() ? 0.5 : 1 }}>
                      {saving ? "..." : "שמור"}
                    </button>
                  </div>
                  {addError && <div style={{ fontSize: 13, color: "var(--red)", marginTop: 4 }}>{addError}</div>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── טאבים במצב ניהול ── */}
      {managing && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {(["builtin", "personal"] as const).map(tab => {
              const label = tab === "builtin" ? "מובנות" : "אישיות";
              const active = manageTab === tab;
              return (
                <button key={tab} type="button" onClick={() => setManageTab(tab)}
                  style={{
                    flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 14, fontFamily: "inherit",
                    cursor: "pointer", fontWeight: active ? 700 : 400,
                    border: `1.5px solid ${active ? "var(--green-mid)" : "var(--border)"}`,
                    background: active ? "rgba(79,142,247,0.12)" : "var(--surface2)",
                    color: active ? "var(--green-mid)" : "var(--text-dim)",
                  }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 13, color: manageTab === "builtin" ? "var(--red)" : "var(--gold)", marginBottom: 2, padding: "6px 10px", background: manageTab === "builtin" ? "rgba(247,92,92,0.08)" : "rgba(251,191,36,0.08)", borderRadius: 8 }}>
            {manageTab === "builtin" ? "לחץ על קטגוריה להסתרה / הצגה שלה" : "לחץ על קטגוריה למחיקה שלה"}
          </div>
        </div>
      )}

      {/* ── חיפוש חופשי ── */}
      {filtered ? (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <span style={{ fontSize: 14, color: "var(--text-dim)" }}>לא נמצאו תוצאות</span>
          )}
          {filtered.length > 0 && (() => {
            const groups: { label: string; color: string; cats: string[] }[] = [
              { label: '💰 הכנסות',        color: 'var(--green-mid)', cats: filtered.filter(c => budgetTypeMap[c] === 'הכנסה') },
              { label: '🔒 הוצאות קבועות', color: 'var(--gold)',      cats: filtered.filter(c => budgetTypeMap[c] === 'קבוע') },
              { label: '🔀 הוצאות משתנות', color: 'var(--red)',       cats: filtered.filter(c => budgetTypeMap[c] === 'משתנה') },
              { label: '⭐ הקטגוריות שלי', color: 'var(--gold)',      cats: filtered.filter(c => clientCats.includes(c)) },
            ];
            return groups.filter(g => g.cats.length > 0).map(g => (
              <div key={g.label} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: g.color, fontWeight: 700, marginBottom: 5, padding: "0 2px" }}>{g.label}</div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {g.cats.map(cat => (
                    <button type="button" key={cat}
                      onClick={e => { e.stopPropagation(); managing ? hideCategory(cat) : onSelect(cat); }}
                      style={btnStyle(cat, clientCats.includes(cat), managing)}>
                      {managing ? `× ${cat}` : cat}
                    </button>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>
      ) : (
        /* ── תצוגה לפי סקציות ── */
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {/* גלובליות — תמיד כשלא מנהל, או כשמנהל + טאב מובנות */}
          {(!managing || manageTab === "builtin") && Object.entries(visibleCats).map(([group, groupCats]) => (
            <div key={group} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 14, color: "var(--text-dim)", fontWeight: 700, marginBottom: 5, padding: "0 2px" }}>
                {group}
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {groupCats.map(cat => {
                  const isHidden = hiddenSet.has(cat);
                  if (managing) {
                    return (
                      <button type="button" key={cat}
                        onClick={e => { e.stopPropagation(); isHidden ? restoreCategory(cat) : hideCategory(cat); }}
                        title={isHidden ? "לחץ להחזיר לתצוגה" : "לחץ להסתיר"}
                        style={{
                          padding: "4px 11px", borderRadius: 14, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
                          border: `1px solid ${isHidden ? "var(--border)" : "var(--green-soft)"}`,
                          background: isHidden ? "var(--surface2)" : "var(--green-mint)",
                          color: isHidden ? "var(--text-dim)" : "var(--green-deep)",
                          textDecoration: isHidden ? "line-through" : "none",
                          opacity: isHidden ? 0.6 : 1,
                        }}>
                        {isHidden ? `✕ ${cat}` : cat}
                      </button>
                    );
                  }
                  return (
                    <button type="button" key={cat}
                      onClick={e => { e.stopPropagation(); onSelect(cat); }}
                      style={btnStyle(cat, false, false)}>
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── קטגוריות אישיות — תמיד כשלא מנהל, או כשמנהל + טאב אישיות ── */}
          {clientCats.length > 0 && (!managing || manageTab === "personal") && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 14, color: "var(--gold)", fontWeight: 700, marginBottom: 5, padding: "0 2px" }}>
                ⭐ הקטגוריות שלי
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {clientCats.map(cat => {
                  if (managing) {
                    return (
                      <button type="button" key={cat}
                        onClick={e => { e.stopPropagation(); handleDeletePersonalCat(cat); }}
                        title="מחק קטגוריה"
                        style={{
                          padding: "4px 11px", borderRadius: 14, fontSize: 15, cursor: deleteChecking ? "wait" : "pointer",
                          fontFamily: "inherit", border: "1px solid rgba(247,92,92,0.4)",
                          background: "rgba(247,92,92,0.06)", color: "var(--red)",
                        }}>
                        🗑 {cat}
                      </button>
                    );
                  }
                  if (hiddenSet.has(cat)) return null;
                  return (
                    <button type="button" key={cat}
                      onClick={e => { e.stopPropagation(); onSelect(cat); }}
                      style={btnStyle(cat, true, false)}>
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── קטגוריות מוסתרות (רק כשלא במצב ניהול) ── */}
      {canManage && !managing && hiddenCats.length > 0 && (
        <div style={{ marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowHidden(h => !h)}
            style={{ background: "none", border: "none", fontSize: 13, color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit", padding: 0, marginBottom: 6 }}
          >
            {showHidden ? "▲" : "▼"} קטגוריות מוסתרות ({hiddenCats.length})
          </button>
          {showHidden && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {hiddenCats.map(cat => (
                <button type="button" key={cat} onClick={() => restoreCategory(cat)}
                  style={{ padding: "4px 11px", borderRadius: 14, fontSize: 14, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text-dim)", opacity: 0.7 }}
                  title="לחץ להחזיר">↩ {cat}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
