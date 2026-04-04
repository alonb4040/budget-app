import { useState } from "react";
import { supabase } from "../supabase";
import { CATEGORIES, IGNORED_CATEGORIES, classifyTx, assignBillingMonth } from "../data";
import { Card, Btn } from "../ui";

// ── Remember Modal ────────────────────────────────────────────────────────────
export function RememberModal({ pendingRemember, onYes, onNo }) {
  if (!pendingRemember) return null;
  return (
    <>
      <div onClick={onNo} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:"28px 32px", zIndex:9001, width:"min(420px,90vw)", boxShadow:"0 20px 60px rgba(0,0,0,0.6)", textAlign:"center" }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🧠</div>
        <div style={{ fontWeight:700, fontSize:17, marginBottom:10 }}>לזכור לפעמים הבאות?</div>
        <div style={{ fontSize:15, color:"var(--text-dim)", marginBottom:24, lineHeight:1.6 }}>
          <strong style={{ color:"var(--text)" }}>"{pendingRemember.name}"</strong><br/>
          תמיד יסווג כ<strong style={{ color:"var(--green-mid)" }}> {pendingRemember.cat}</strong>
        </div>
        <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
          <button onClick={onYes} style={{ background:`linear-gradient(135deg,${"var(--green-soft)"},#27ae60)`, border:"none", borderRadius:10, padding:"10px 28px", fontSize:15, color:"#fff", cursor:"pointer", fontFamily:"inherit", fontWeight:700 }}>✓ כן, זכור</button>
          <button onClick={onNo} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:10, padding:"10px 28px", fontSize:15, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}>✕ לא</button>
        </div>
      </div>
    </>
  );
}

// ── Classify imported transaction ─────────────────────────────────────────────
export function classifyImported(tx, rememberedMappings) {
  const result = classifyTx(tx.name, tx.max_category || "", rememberedMappings);
  return result.cat;
}

// ── Category Picker ───────────────────────────────────────────────────────────
export function CategoryPicker({ current, catSearch, setCatSearch, onSelect }) {
  const filtered = catSearch
    ? Object.values(CATEGORIES).flat().filter(c => c.includes(catSearch))
    : null;

  return (
    <div style={{ marginTop:8 }}>
      <input
        value={catSearch}
        onChange={e => setCatSearch(e.target.value)}
        placeholder="חפש סעיף..."
        style={{ width:"100%", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"7px 12px", color:"var(--text)", fontSize:14, fontFamily:"inherit", outline:"none", marginBottom:8, boxSizing:"border-box" }}
      />
      {filtered ? (
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", maxHeight:150, overflowY:"auto" }}>
          {filtered.map(cat => (
            <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }}
              style={{ padding:"5px 13px", borderRadius:16, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                border:`1px solid ${current===cat?"var(--green-mid)":"var(--border)"}`,
                background:current===cat?"rgba(79,142,247,0.15)":"var(--surface2)",
                color:current===cat?"var(--green-mid)":"var(--text)", fontWeight:current===cat?700:400 }}>
              {cat}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ maxHeight:260, overflowY:"auto" }}>
          {Object.entries(CATEGORIES).map(([group, cats]) => (
            <div key={group} style={{ marginBottom:10 }}>
              <div style={{ fontSize:12, color:"var(--text-dim)", fontWeight:700, marginBottom:5, padding:"0 2px" }}>{group}</div>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {cats.map(cat => (
                  <button key={cat} onClick={e => { e.stopPropagation(); onSelect(cat); }}
                    style={{ padding:"4px 11px", borderRadius:14, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                      border:`1px solid ${current===cat?"var(--green-mid)":"var(--border)"}`,
                      background:current===cat?"rgba(79,142,247,0.15)":"var(--surface2)",
                      color:current===cat?"var(--green-mid)":"var(--text)", fontWeight:current===cat?700:400 }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// normalizeAllTxs — ממזג תנועות משני מקורות לפורמט אחיד
// ════════════════════════════════════════════════════════════════
export function normalizeAllTxs(portfolioSubs, importedTxs, rememberedMappings, cycleStartDay, manualTxs = []) {
  const result = [];
  portfolioSubs.forEach(sub => {
    (sub.transactions || []).forEach((tx, idx) => {
      const billing = sub.month_key || tx.billing_month || assignBillingMonth(tx.date, cycleStartDay);
      result.push({
        _uid: `sub-${sub.id}-${idx}`,
        date: tx.date || "",
        name: tx.name || "",
        cat: tx.cat || classifyTx(tx.name || "", tx.max_category || "", rememberedMappings).cat,
        amount: Number(tx.amount || 0),
        billing_month: billing,
        source: "file",
        source_label: sub.source_label || sub.label || "קובץ",
        conf: tx.conf || "med",
        edited: tx.edited || false,
        _submissionId: sub.id,
        _txIndex: idx,
        _dbId: null,
      });
    });
  });
  importedTxs.forEach(tx => {
    result.push({
      _uid: `imp-${tx.id}`,
      date: tx.date || "",
      name: tx.name || "",
      cat: classifyImported(tx, rememberedMappings),
      amount: Number(tx.amount || 0),
      billing_month: tx.billing_month || assignBillingMonth(tx.date, cycleStartDay),
      source: "ext",
      source_label: tx.provider || "מקס",
      conf: "high",
      edited: false,
      _submissionId: null,
      _txIndex: null,
      _dbId: tx.id,
    });
  });
  manualTxs.forEach(tx => {
    result.push({
      _uid: `man-${tx.id}`,
      date: tx.date || "",
      name: tx.name || "",
      cat: tx.cat,
      amount: Number(tx.amount || 0),
      billing_month: tx.billing_month,
      source: "manual",
      source_label: tx.payment_method ? `ידני — ${tx.payment_method}` : "ידני",
      conf: "high",
      edited: false,
      type: tx.type,
      _submissionId: null,
      _txIndex: null,
      _dbId: tx.id,
    });
  });
  return result;
}

// ════════════════════════════════════════════════════════════════
// AllTransactionsTab — כל התנועות (Extension + קבצים)
// ════════════════════════════════════════════════════════════════
export default function AllTransactionsTab({ clientId, importedTxs, portfolioSubs, manualTxs, rememberedMappings, onDataChange,
  onManualTxAdded, onManualTxDeleted,
  cycleStartDay, onCycleStartDayChange, onUpdatePortfolioTxCat, onDeletePortfolioSub, onNavigateToUpload }) {
  const [allTxs, setAllTxs] = useState(() =>
    normalizeAllTxs(portfolioSubs, importedTxs, rememberedMappings, cycleStartDay, manualTxs)
  );
  const [activeTxUid, setActiveTxUid] = useState(null);
  const [catSearch, setCatSearch] = useState("");
  const [pendingRemember, setPendingRemember] = useState(null);
  const [filterSource, setFilterSource] = useState("all"); // "all" | "file" | "ext"
  const [filterProvider, setFilterProvider] = useState("all");
  const [editingCycleDay, setEditingCycleDay] = useState(false);
  const [tempDay, setTempDay] = useState(String(cycleStartDay));
  const [savingDay, setSavingDay] = useState(false);
  const [openMonthKeys, setOpenMonthKeys] = useState(new Set());
  const [deletingTxUid, setDeletingTxUid] = useState(null);
  const [deletingCycleKey, setDeletingCycleKey] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [ignoredOpen, setIgnoredOpen] = useState({});
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const toggleSelectTx = (uid: string) => setSelectedUids(prev => { const next = new Set(prev); next.has(uid) ? next.delete(uid) : next.add(uid); return next; });
  const toggleSelectMonth = (monthTxs: any[]) => {
    const monthUids = monthTxs.filter(t => t.source === "ext" || t.source === "manual").map(t => t._uid);
    const allSelected = monthUids.every(uid => selectedUids.has(uid));
    setSelectedUids(prev => { const next = new Set(prev); allSelected ? monthUids.forEach(uid => next.delete(uid)) : monthUids.forEach(uid => next.add(uid)); return next; });
  };
  const deleteSelected = async () => {
    if (!window.confirm(`מחק ${selectedUids.size} תנועות נבחרות?`)) return;
    const toDelete = allTxs.filter(t => selectedUids.has(t._uid));
    const extIds = toDelete.filter(t => t.source === "ext").map(t => t._dbId).filter(Boolean);
    const manIds = toDelete.filter(t => t.source === "manual").map(t => t._dbId).filter(Boolean);
    if (extIds.length > 0) await supabase.from("imported_transactions").delete().in("id", extIds).eq("client_id", clientId);
    if (manIds.length > 0) { await supabase.from("manual_transactions").delete().in("id", manIds).eq("client_id", clientId); manIds.forEach(id => onManualTxDeleted && onManualTxDeleted(id)); }
    setAllTxs(prev => prev.filter(t => !selectedUids.has(t._uid)));
    setSelectedUids(new Set());
    onDataChange();
  };
  // addingTx: { [billing_month]: null | "menu" | "income" | "expense-choice" | "expense-cash" | "expense-other" }
  const [addingTx, setAddingTx] = useState({});
  // addForm: per-month form fields
  const [addForm, setAddForm] = useState({});

  const setMonthAddMode = (month, mode) => setAddingTx(p => ({ ...p, [month]: mode }));
  const updateForm = (month, field, val) => setAddForm(p => ({ ...p, [month]: { ...(p[month] || {}), [field]: val } }));
  const resetAdd = (month) => { setAddingTx(p => ({ ...p, [month]: null })); setAddForm(p => ({ ...p, [month]: {} })); };

  // ── שמירת תנועה ידנית ────────────────────────────────────────────────────────
  const saveManualTx = async (billing_month, type) => {
    const form = addForm[billing_month] || {};
    const name = (form.name || "").trim();
    const amount = Number(form.amount);
    const cat = form.cat || (type === "income" ? "הכנסות מזדמנות" : "");
    if (!name || !amount || !cat) return;

    const row = {
      client_id: clientId,
      billing_month,
      name,
      amount,
      cat,
      type,
      payment_method: type === "expense" ? (form.payment_method || "מזומן") : null,
      date: null,
    };
    const { data, error } = await supabase.from("manual_transactions").insert([row]).select().single();
    if (error) { console.error(error); return; }
    const normalized = {
      _uid: `man-${data.id}`,
      date: "",
      name: data.name,
      cat: data.cat,
      amount: Number(data.amount),
      billing_month: data.billing_month,
      source: "manual",
      source_label: data.payment_method ? `ידני — ${data.payment_method}` : "ידני",
      conf: "high",
      edited: false,
      type: data.type,
      _submissionId: null,
      _txIndex: null,
      _dbId: data.id,
    };
    setAllTxs(prev => [...prev, normalized]);
    if (onManualTxAdded) onManualTxAdded(data);
    resetAdd(billing_month);
  };

  // ── מחיקת תנועה ידנית ────────────────────────────────────────────────────────
  const deleteManualTx = async (uid, dbId) => {
    setDeletingTxUid(uid);
    await supabase.from("manual_transactions").delete().eq("id", dbId).eq("client_id", clientId);
    setAllTxs(prev => prev.filter(t => t._uid !== uid));
    if (onManualTxDeleted) onManualTxDeleted(dbId);
    setDeletingTxUid(null);
    setConfirmDelete(null);
  };

  const toggleMonth = (key) => setOpenMonthKeys(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  // ── מחיקת תנועה בודדת (imported בלבד) ──────────────────────────────────────
  const deleteTx = async (uid, dbId) => {
    setDeletingTxUid(uid);
    await supabase.from("imported_transactions").delete().eq("id", dbId).eq("client_id", clientId);
    setAllTxs(prev => prev.filter(t => t._uid !== uid));
    setDeletingTxUid(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת submission שלם (portfolio) ────────────────────────────────────────
  const deleteSubmission = async (submissionId) => {
    setDeletingCycleKey(`sub-${submissionId}`);
    await onDeletePortfolioSub(submissionId);
    setAllTxs(prev => prev.filter(t => t._submissionId !== submissionId));
    setDeletingCycleKey(null);
    setConfirmDelete(null);
  };

  // ── מחיקת כל התנועות המיובאות ────────────────────────────────────────────────
  const deleteAllImported = async () => {
    setDeletingCycleKey("all-imported");
    await supabase.from("imported_transactions").delete().eq("client_id", clientId);
    setAllTxs(prev => prev.filter(t => t.source !== "ext"));
    setDeletingCycleKey(null);
    setConfirmDelete(null);
    onDataChange();
  };

  // ── מחיקת חודש שלם (imported בלבד) ─────────────────────────────────────────
  const deleteCycle = async (cycleKey) => {
    setDeletingCycleKey(cycleKey);
    const toDelete = allTxs.filter(t => t.billing_month === cycleKey && t.source === "ext");
    const ids = toDelete.map(t => t._dbId).filter(Boolean);
    if (ids.length > 0) {
      await supabase.from("imported_transactions").delete().in("id", ids).eq("client_id", clientId);
    }
    setAllTxs(prev => prev.filter(t => !(t.billing_month === cycleKey && t.source === "ext")));
    setDeletingCycleKey(null);
    setConfirmDelete(null);
    onDataChange();
  };

  const HEBREW_MONTHS_LOCAL = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  function getCycleLabel(cycleKey, startDay) {
    const [y, m] = cycleKey.split("-").map(Number);
    let endMonth, endYear, endDay;
    if (startDay === 1) {
      endMonth = m; endYear = y;
      endDay = new Date(y, m, 0).getDate();
    } else {
      endMonth = m + 1; endYear = y;
      if (endMonth === 13) { endMonth = 1; endYear = y + 1; }
      endDay = startDay - 1;
    }
    return `${HEBREW_MONTHS_LOCAL[m-1]} (${String(startDay).padStart(2,"0")}.${String(m).padStart(2,"0")} – ${String(endDay).padStart(2,"0")}.${String(endMonth).padStart(2,"0")})`;
  }

  // ── קיבוץ לפי חודש חיוב ─────────────────────────────────────────────────────
  const filteredTxs = allTxs.filter(t => {
    if (filterSource !== "all" && t.source !== filterSource) return false;
    if (filterProvider !== "all" && t.source_label !== filterProvider) return false;
    return true;
  });
  const byCycle = {};
  filteredTxs.forEach(t => {
    const key = t.billing_month || "unknown";
    if (!byCycle[key]) byCycle[key] = [];
    byCycle[key].push(t);
  });
  const cycleKeys = Object.keys(byCycle).sort().reverse();
  const providerLabels = [...new Set(allTxs.map(t => t.source_label).filter(Boolean))];
  const totalAmount = filteredTxs.filter(t => !IGNORED_CATEGORIES.has(t.cat)).reduce((s,t) => s + Number(t.amount||0), 0);

  // ── שמירת יום מחזור ──────────────────────────────────────────────────────────
  const saveCycleDay = async () => {
    const d = parseInt(tempDay);
    if (isNaN(d) || d < 1 || d > 28) return;
    setSavingDay(true);
    await supabase.from("clients").update({ cycle_start_day: d }).eq("id", clientId);
    onCycleStartDayChange(d);
    setSavingDay(false);
    setEditingCycleDay(false);
  };

  // ── ייצוא Excel ──────────────────────────────────────────────────────────────
  const exportToExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
    const wb = XLSX.utils.book_new();
    const detailRows = [];
    cycleKeys.forEach(key => {
      const label = getCycleLabel(key, cycleStartDay);
      const cycleTxs = byCycle[key] || [];
      const cycleTotal = cycleTxs.filter(t => !IGNORED_CATEGORIES.has(t.cat)).reduce((s,t) => s + Number(t.amount||0), 0);
      detailRows.push({ "חודש": label, "שם בית עסק": "", "מקור": "", "קטגוריה": "", "סכום": "", "סה\"כ חודש": Math.round(cycleTotal) });
      cycleTxs.forEach(t => {
        detailRows.push({ "חודש": label, "שם בית עסק": t.name, "מקור": t.source_label, "קטגוריה": t.cat || "לא מסווג", "סכום": Number(t.amount), "סה\"כ חודש": "" });
      });
      detailRows.push({ "חודש": "", "שם בית עסק": "סה\"כ " + label, "מקור": "", "קטגוריה": "", "סכום": Math.round(cycleTotal), "סה\"כ חודש": "" });
      detailRows.push({});
    });
    const summaryRows = [];
    const allCats = [...new Set(filteredTxs.map(t => t.cat).filter(c => c && !IGNORED_CATEGORIES.has(c)))].sort();
    allCats.forEach(cat => {
      const row = { "קטגוריה": cat };
      cycleKeys.forEach(k => {
        const sum = (byCycle[k]||[]).filter(t => t.cat === cat).reduce((s,t) => s + Number(t.amount||0), 0);
        row[getCycleLabel(k, cycleStartDay)] = sum > 0 ? Math.round(sum) : "";
      });
      summaryRows.push(row);
    });
    const totalRow = { "קטגוריה": "סה\"כ" };
    cycleKeys.forEach(k => {
      const sum = (byCycle[k]||[]).filter(t => !IGNORED_CATEGORIES.has(t.cat)).reduce((s,t) => s + Number(t.amount||0), 0);
      totalRow[getCycleLabel(k, cycleStartDay)] = Math.round(sum);
    });
    summaryRows.push(totalRow);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "פירוט");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "סיכום");
    XLSX.writeFile(wb, `מאזן_כל_התנועות.xlsx`);
  };

  return (
    <div>
      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setConfirmDelete(null)}>
          <div style={{ background:"var(--surface)", borderRadius:14, padding:"28px 32px", maxWidth:360, width:"90%", textAlign:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:28, marginBottom:12 }}>🗑️</div>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:8 }}>
              {confirmDelete.type === "all-imported" ? "מחק את כל תנועות המקס?" :
               confirmDelete.type === "cycle" ? `מחק תנועות מקס מ-${confirmDelete.label}?` :
               confirmDelete.type === "submission" ? `מחק קובץ "${confirmDelete.label}"?` :
               `מחק את "${confirmDelete.label}"?`}
            </div>
            <div style={{ fontSize:13, color:"var(--text-dim)", marginBottom:20 }}>
              {confirmDelete.type === "all-imported" ? `${confirmDelete.count} תנועות יימחקו לצמיתות — ניתן לסנכרן מחדש` :
               confirmDelete.type === "cycle" ? `${confirmDelete.count} תנועות יימחקו לצמיתות` :
               confirmDelete.type === "submission" ? `${confirmDelete.count} תנועות יימחקו לצמיתות` :
               "התנועה תימחק לצמיתות"}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => setConfirmDelete(null)}
                style={{ padding:"9px 20px", borderRadius:8, border:"1px solid var(--border)", background:"transparent", color:"var(--text-mid)", fontSize:14, cursor:"pointer", fontFamily:"inherit" }}>
                ביטול
              </button>
              <button
                onClick={() => {
                  if (confirmDelete.type === "all-imported") deleteAllImported();
                  else if (confirmDelete.type === "cycle") deleteCycle(confirmDelete.cycleKey);
                  else if (confirmDelete.type === "submission") deleteSubmission(confirmDelete.submissionId);
                  else if (confirmDelete.type === "manual") deleteManualTx(confirmDelete.uid, confirmDelete.dbId);
                  else deleteTx(confirmDelete.uid, confirmDelete.dbId);
                }}
                disabled={!!deletingTxUid || !!deletingCycleKey}
                style={{ padding:"9px 20px", borderRadius:8, border:"none", background:"#e53935", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                {(deletingTxUid || deletingCycleKey) ? "מוחק..." : "מחק"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Fraunces', serif", fontSize:20, fontWeight:600, color:"var(--green-deep)" }}>
            כל התנועות
          </div>
          <div style={{ fontSize:13, color:"var(--text-dim)", marginTop:3 }}>
            {allTxs.length} תנועות · ₪{Math.round(totalAmount).toLocaleString()} סה"כ
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {selectedUids.size > 0 && (
            <button onClick={deleteSelected}
              style={{ padding:"7px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                border:"1.5px solid #e53935", background:"#fff8f8", color:"#e53935", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
              🗑️ מחק {selectedUids.size} נבחרות
            </button>
          )}
          <button onClick={onNavigateToUpload}
            style={{ padding:"7px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
              border:"1.5px solid var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", display:"flex", alignItems:"center", gap:5 }}>
            ⬆️ הוסף תנועות
          </button>
          <button onClick={exportToExcel}
            style={{ padding:"7px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
              border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text-mid)", display:"flex", alignItems:"center", gap:5 }}>
            📥 Excel
          </button>
        </div>
      </div>

      {/* הגדרת יום התחלת מחזור */}
      <Card style={{ marginBottom:16, padding:"12px 18px", background:"var(--surface2)", border:"1px solid var(--border)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:13, color:"var(--text-mid)" }}>יום תחילת המחזור החודשי:</span>
          {editingCycleDay ? (
            <>
              <input type="number" min="1" max="28" value={tempDay}
                onChange={e => setTempDay(e.target.value)}
                style={{ width:60, padding:"5px 10px", borderRadius:8, border:"1.5px solid var(--green-mid)", fontSize:14,
                  fontFamily:"inherit", background:"var(--surface)", color:"var(--text)", textAlign:"center" }} />
              <button onClick={saveCycleDay} disabled={savingDay}
                style={{ padding:"5px 14px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  background:"var(--green-mid)", color:"#fff", border:"none", fontWeight:700 }}>
                {savingDay ? "שומר..." : "שמור"}
              </button>
              <button onClick={() => { setEditingCycleDay(false); setTempDay(String(cycleStartDay)); }}
                style={{ padding:"5px 12px", borderRadius:8, fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  background:"transparent", color:"var(--text-dim)", border:"1px solid var(--border)" }}>
                ביטול
              </button>
            </>
          ) : (
            <>
              <span style={{ fontWeight:700, fontSize:15, color:"var(--green-deep)" }}>{cycleStartDay}</span>
              <button onClick={() => { setEditingCycleDay(true); setTempDay(String(cycleStartDay)); }}
                style={{ padding:"4px 12px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                  background:"transparent", color:"var(--text-dim)", border:"1px solid var(--border)" }}>
                ✏️ שנה
              </button>
              <span style={{ fontSize:12, color:"var(--text-dim)" }}>
                (שינוי ישפיע על החלוקה מעכשיו ואילך)
              </span>
            </>
          )}
        </div>
      </Card>

      {/* Source filter */}
      <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
        {[["all","הכל"], ["file","📁 קבצים"], ["ext","💳 מקס"]].map(([v,l]) => (
          <button key={v} onClick={() => { setFilterSource(v); setFilterProvider("all"); }}
            style={{ padding:"5px 14px", borderRadius:20, fontSize:13, cursor:"pointer", fontFamily:"inherit",
              border:`1px solid ${filterSource===v?"var(--green-mid)":"var(--border)"}`,
              background:filterSource===v?"var(--green-mint)":"transparent",
              color:filterSource===v?"var(--green-deep)":"var(--text-mid)" }}>
            {l}
          </button>
        ))}
      </div>
      {providerLabels.length > 1 && (
        <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
          {[["all","הכל"], ...providerLabels.map(p => [p, p])].map(([v,l]) => (
            <button key={v} onClick={() => setFilterProvider(v)}
              style={{ padding:"5px 14px", borderRadius:20, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                border:`1px solid ${filterProvider===v?"var(--green-mid)":"var(--border)"}`,
                background:filterProvider===v?"var(--green-mint)":"transparent",
                color:filterProvider===v?"var(--green-deep)":"var(--text-mid)" }}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* ── Unified expandable month list ── */}
      <RememberModal pendingRemember={pendingRemember}
        onYes={async () => {
          await supabase.from("remembered_mappings").upsert(
            [{ client_id: clientId, business_name: pendingRemember.name, category: pendingRemember.cat }],
            { onConflict: "client_id,business_name" }
          );
          setPendingRemember(null);
        }}
        onNo={() => setPendingRemember(null)}
      />

      {cycleKeys.map((key, idx) => {
        const cycleTxs = byCycle[key] || [];
        if (cycleTxs.length === 0) return null;
        const activeTxs = cycleTxs.filter(t => !IGNORED_CATEGORIES.has(t.cat));
        const ignoredTxs = cycleTxs.filter(t => IGNORED_CATEGORIES.has(t.cat));
        const cycleTotal = activeTxs.reduce((s,t) => s + Number(t.amount||0), 0);
        const catMap: Record<string, number> = {};
        activeTxs.forEach(t => { catMap[t.cat] = (catMap[t.cat]||0) + Number(t.amount||0); });
        const top3 = Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,3);
        const label = getCycleLabel(key, cycleStartDay);
        const isOpen = openMonthKeys.has(key);

        // unique submissions in this month
        const submissionIds = [...new Set(cycleTxs.filter(t => t.source === "file").map(t => t._submissionId))];
        const hasExtTxs = cycleTxs.some(t => t.source === "ext");

        const renderTxRow = (tx, isIgnored) => (
          <Card key={tx._uid} style={{ marginBottom:6, padding:"10px 14px",
            background: isIgnored ? "rgba(180,180,180,0.08)" : undefined,
            borderRight: isIgnored ? "3px solid var(--text-dim)" : undefined }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14,
                  textDecoration: isIgnored ? "line-through" : "none",
                  color: isIgnored ? "var(--text-dim)" : undefined }}>{tx.name}</div>
                <div style={{ fontSize:12, color:"var(--text-dim)", display:"flex", gap:6, alignItems:"center" }}>
                  <span>{tx.date}</span>
                  <span style={{ padding:"1px 6px", borderRadius:10, fontSize:11,
                    background: tx.source === "ext" ? "rgba(79,142,247,0.12)" : tx.source === "manual" ? "rgba(251,191,36,0.12)" : "rgba(46,204,138,0.12)",
                    color: tx.source === "ext" ? "var(--green-mid)" : tx.source === "manual" ? "var(--gold)" : "var(--green-deep)" }}>
                    {tx.source === "ext" ? "💳" : tx.source === "manual" ? "✏️" : "📁"} {tx.source_label}
                  </span>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontWeight:700, color: tx.type === "income" ? "var(--green-soft)" : "var(--red)", fontSize:14 }}>
                  {tx.type === "income" ? "+" : ""}₪{Number(tx.amount).toLocaleString()}
                </span>
                <button
                  onClick={() => { setActiveTxUid(tx._uid === activeTxUid ? null : tx._uid); setCatSearch(""); setPendingRemember(null); }}
                  style={{ background:"var(--green-mint)", border:"1px solid var(--green-soft)", borderRadius:8, padding:"4px 12px",
                    fontSize:12, color:"var(--green-deep)", cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
                  {tx.cat || "לא מסווג"}
                </button>
                {(tx.source === "ext" || tx.source === "manual") && (
                  <input type="checkbox" checked={selectedUids.has(tx._uid)}
                    onChange={() => toggleSelectTx(tx._uid)}
                    onClick={e => e.stopPropagation()}
                    style={{ width:16, height:16, cursor:"pointer", accentColor:"var(--green-mid)" }}
                  />
                )}
                {(tx.source === "ext" || tx.source === "manual") && (
                  <button onClick={() => tx.source === "manual"
                    ? setConfirmDelete({ type:"manual", uid:tx._uid, dbId:tx._dbId, label:tx.name })
                    : setConfirmDelete({ type:"tx", uid:tx._uid, dbId:tx._dbId, label:tx.name })}
                    title="מחק תנועה"
                    style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                    🗑️
                  </button>
                )}
              </div>
            </div>
            {activeTxUid === tx._uid && (
              <CategoryPicker current={tx.cat} catSearch={catSearch} setCatSearch={setCatSearch}
                onSelect={async (cat) => {
                  if (tx.source === "ext") {
                    setAllTxs(p => p.map(t => t.name === tx.name && t.source === "ext" ? {...t, cat, edited:true} : t));
                    setPendingRemember({ name: tx.name, cat });
                  } else if (tx.source === "manual") {
                    await supabase.from("manual_transactions").update({ cat }).eq("id", tx._dbId);
                    setAllTxs(p => p.map(t => t._uid === tx._uid ? {...t, cat} : t));
                  } else {
                    setAllTxs(p => p.map(t => t._uid === tx._uid ? {...t, cat, edited:true} : t));
                    await onUpdatePortfolioTxCat(tx._submissionId, tx._txIndex, cat);
                  }
                  setActiveTxUid(null);
                }}
              />
            )}
          </Card>
        );

        return (
          <div key={key} style={{ marginBottom:16 }}>
            {/* Month header — click to expand/collapse */}
            <div onClick={() => toggleMonth(key)}
              style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                background:"var(--surface2)", border:"1.5px solid var(--border)", borderRadius: isOpen ? "10px 10px 0 0" : 10,
                padding:"12px 16px", cursor:"pointer" }}>
              <div>
                <div style={{ fontWeight:700, fontSize:15 }}>{label}</div>
                {!isOpen && (
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:6 }}>
                    {top3.map(([cat,amt]) => (
                      <span key={cat} style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:8, padding:"2px 10px", fontSize:11 }}>
                        {cat}: ₪{Math.round(amt).toLocaleString()}
                      </span>
                    ))}
                    {ignoredTxs.length > 0 && (
                      <span style={{ fontSize:11, color:"var(--text-dim)" }}>🚫 {ignoredTxs.length} מוסתרות</span>
                    )}
                  </div>
                )}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:13, color:"var(--text-dim)" }}>{activeTxs.length} תנועות</span>
                <span style={{ fontFamily:"'Fraunces', serif", fontSize:17, fontWeight:700, color:"var(--red)" }}>
                  ₪{Math.round(cycleTotal).toLocaleString()}
                </span>
                {(() => {
                  const deletable = cycleTxs.filter(t => t.source === "ext" || t.source === "manual");
                  if (deletable.length === 0) return null;
                  const allSel = deletable.every(t => selectedUids.has(t._uid));
                  return (
                    <button onClick={e => { e.stopPropagation(); toggleSelectMonth(cycleTxs); }}
                      style={{ padding:"3px 10px", fontSize:11, borderRadius:6, fontFamily:"inherit", cursor:"pointer",
                        border:"1px solid var(--border)", background: allSel ? "rgba(229,57,53,0.08)" : "transparent",
                        color: allSel ? "#e53935" : "var(--text-dim)" }}>
                      {allSel ? "בטל בחירה" : "בחר הכל"}
                    </button>
                  );
                })()}
                <span style={{ color:"var(--text-dim)", fontSize:16 }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{ border:"1.5px solid var(--border)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"12px 12px 8px" }}>
                {activeTxs.map(tx => renderTxRow(tx, false))}
                {ignoredTxs.map(tx => renderTxRow(tx, true))}

                {/* הוסף תנועה ידנית */}
                {(() => {
                  const mode = addingTx[key];
                  const form = addForm[key] || {};
                  const allCats = Object.values(CATEGORIES).flat();
                  const inputS = { border:"1px solid var(--border)", borderRadius:6, padding:"6px 10px", fontSize:13, fontFamily:"inherit", background:"var(--surface2)", color:"var(--text)", width:"100%" };
                  const rowS: React.CSSProperties = { display:"flex", gap:8, flexWrap:"wrap", alignItems:"flex-end", marginBottom:8 };

                  if (!mode) return (
                    <div style={{ marginTop:10, marginBottom:4 }}>
                      <button onClick={() => setMonthAddMode(key, "menu")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1.5px dashed var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)", cursor:"pointer" }}>
                        ✏️ הוסף תנועה
                      </button>
                    </div>
                  );

                  if (mode === "menu") return (
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"var(--text-dim)" }}>סוג תנועה:</span>
                      <button onClick={() => setMonthAddMode(key, "income")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--green-soft)", background:"var(--green-mint)", color:"var(--green-deep)", cursor:"pointer", fontWeight:600 }}>
                        + הוסף הכנסה
                      </button>
                      <button onClick={() => setMonthAddMode(key, "expense-choice")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935", cursor:"pointer", fontWeight:600 }}>
                        − הוסף הוצאה
                      </button>
                      <button onClick={() => resetAdd(key)}
                        style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
                    </div>
                  );

                  if (mode === "income") return (
                    <div style={{ marginTop:10, background:"rgba(46,204,138,0.05)", border:"1px solid rgba(46,204,138,0.2)", borderRadius:10, padding:"14px 14px 10px" }}>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:"var(--green-deep)" }}>+ הכנסה מזדמנת</div>
                      <div style={rowS}>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>פירוט *</div>
                          <input style={inputS} value={form.name||""} onChange={e=>updateForm(key,"name",e.target.value)} placeholder="תיאור ההכנסה" />
                        </div>
                        <div style={{ flex:1, minWidth:90 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>סכום (₪) *</div>
                          <input type="number" style={inputS} value={form.amount||""} onChange={e=>updateForm(key,"amount",e.target.value)} placeholder="0" />
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveManualTx(key, "income")}
                          disabled={!form.name || !form.amount}
                          style={{ padding:"6px 18px", borderRadius:8, border:"none", background:"var(--green-mid)", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:(!form.name||!form.amount)?0.5:1 }}>
                          שמור
                        </button>
                        <button onClick={() => resetAdd(key)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                      </div>
                    </div>
                  );

                  if (mode === "expense-choice") return (
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"var(--text-dim)" }}>צורת תשלום:</span>
                      <button onClick={() => { setMonthAddMode(key, "expense-cash"); updateForm(key, "payment_method", "מזומן"); }}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", cursor:"pointer" }}>
                        💵 מזומן
                      </button>
                      <button onClick={() => setMonthAddMode(key, "expense-other")}
                        style={{ padding:"5px 14px", fontSize:12, fontFamily:"inherit", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", cursor:"pointer" }}>
                        💳 אחר
                      </button>
                      <button onClick={() => resetAdd(key)} style={{ background:"none", border:"none", color:"var(--text-dim)", cursor:"pointer", fontSize:18, lineHeight:1 }}>×</button>
                    </div>
                  );

                  if (mode === "expense-cash" || mode === "expense-other") return (
                    <div style={{ marginTop:10, background:"rgba(247,92,92,0.04)", border:"1px solid rgba(247,92,92,0.18)", borderRadius:10, padding:"14px 14px 10px" }}>
                      <div style={{ fontWeight:700, fontSize:13, marginBottom:10, color:"#e53935" }}>
                        − הוצאה {mode === "expense-cash" ? "במזומן" : ""}
                      </div>
                      {mode === "expense-other" && (
                        <div style={{ ...rowS, marginBottom:8 }}>
                          <div style={{ flex:1, minWidth:140 }}>
                            <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>צורת תשלום</div>
                            <input style={inputS} value={form.payment_method||""} onChange={e=>updateForm(key,"payment_method",e.target.value)} placeholder="למשל: העברה בנקאית, צ׳ק..." />
                          </div>
                        </div>
                      )}
                      <div style={rowS}>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>פירוט *</div>
                          <input style={inputS} value={form.name||""} onChange={e=>updateForm(key,"name",e.target.value)} placeholder="תיאור ההוצאה" />
                        </div>
                        <div style={{ flex:1, minWidth:90 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>סכום (₪) *</div>
                          <input type="number" style={inputS} value={form.amount||""} onChange={e=>updateForm(key,"amount",e.target.value)} placeholder="0" />
                        </div>
                        <div style={{ flex:2, minWidth:140 }}>
                          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>סיווג *</div>
                          <select style={inputS} value={form.cat||""} onChange={e=>updateForm(key,"cat",e.target.value)}>
                            <option value="">בחר קטגוריה...</option>
                            {Object.entries(CATEGORIES).map(([section, cats]) => (
                              <optgroup key={section} label={section}>
                                {(cats as string[]).map(c => <option key={c} value={c}>{c}</option>)}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => saveManualTx(key, "expense")}
                          disabled={!form.name || !form.amount || !form.cat}
                          style={{ padding:"6px 18px", borderRadius:8, border:"none", background:"#e53935", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit", opacity:(!form.name||!form.amount||!form.cat)?0.5:1 }}>
                          שמור
                        </button>
                        <button onClick={() => resetAdd(key)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>ביטול</button>
                      </div>
                    </div>
                  );

                  return null;
                })()}

                {/* Per-source management */}
                <div style={{ marginTop:12, padding:"10px 4px", borderTop:"1px solid var(--border)", display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                  <span style={{ fontSize:12, color:"var(--text-dim)" }}>ניהול מקורות:</span>
                  {submissionIds.map(subId => {
                    const subLabel = allTxs.find(t => t._submissionId === subId)?.source_label || "קובץ";
                    const subCount = allTxs.filter(t => t._submissionId === subId).length;
                    return (
                      <span key={subId as string} style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
                        <button onClick={onNavigateToUpload}
                          title="החלף קובץ — העלה קובץ חדש לחודש זה"
                          style={{ padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                            border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text-mid)" }}>
                          📁 {subLabel} — החלף
                        </button>
                        <button onClick={() => setConfirmDelete({ type:"submission", submissionId:subId, label:subLabel, count:subCount })}
                          style={{ padding:"4px 8px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                            border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935" }}>
                          הסר
                        </button>
                      </span>
                    );
                  })}
                  {hasExtTxs && (
                    <button onClick={() => setConfirmDelete({ type:"cycle", cycleKey:key, label, count:cycleTxs.filter(t=>t.source==="ext").length })}
                      style={{ padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                        border:"1px solid #ffcdd2", background:"#fff8f8", color:"#e53935" }}>
                      💳 מחק תנועות מקס מחודש זה
                    </button>
                  )}
                  <button onClick={onNavigateToUpload}
                    style={{ padding:"4px 10px", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"inherit",
                      border:"1px solid var(--green-mid)", background:"var(--green-mint)", color:"var(--green-deep)" }}>
                    ➕ הוסף מקור לחודש זה
                  </button>
                </div>

                <div style={{ textAlign:"left", padding:"6px 4px", fontSize:13, color:"var(--text-mid)", fontWeight:700 }}>
                  סה"כ {label}: ₪{Math.round(cycleTotal).toLocaleString()}
                </div>
              </div>
            )}

            {!isOpen && idx < cycleKeys.length - 1 && (
              <div style={{ textAlign:"center", padding:"4px 0 10px", fontSize:12, color:"var(--text-dim)", borderBottom:"1px dashed var(--border)", marginBottom:8 }}>
                סה"כ עד כאן: ₪{Math.round(
                  cycleKeys.slice(0, idx+1).flatMap(k => (byCycle[k]||[]).filter(t => !IGNORED_CATEGORIES.has(t.cat)))
                    .reduce((s,t) => s + Number(t.amount||0), 0)
                ).toLocaleString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
