import { useState } from "react";
import { IGNORED_CATEGORIES } from "../data";
import { Card, Btn } from "../ui";
import { CategoryPicker } from "./CategoryPicker";

export default function MonthDetailScreen({ entry, subs, onAddSource, onFinalize, onReopen, onBack, onDeleteSub, onUpdateSub, ignoredCats = IGNORED_CATEGORIES, categories, categoryRows, clientCats = [], clientId, onCategoryAdded, hiddenCats = [] as string[], onHiddenCatsChange = undefined as any }) {
  const allTx = subs.flatMap(s => s.transactions || []);
  const total = allTx.filter(t => !ignoredCats.has(t.cat)).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const catMap: Record<string, number> = {};
  allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + Number(t.amount || 0); });
  const catSummary = Object.entries(catMap).sort((a,b) => b[1]-a[1]);

  const [editingSub, setEditingSub] = useState(null); // sub being edited
  const [editTx, setEditTx]         = useState([]);
  const [editCatOpen, setEditCatOpen] = useState(null);
  const [catSearch, setCatSearch]   = useState("");

  const startEdit = (sub) => { setEditingSub(sub.id); setEditTx(sub.transactions || []); };
  const saveEdit  = async () => {
    try {
      await onUpdateSub(editingSub, editTx);
      setEditingSub(null);
    } catch(e) {
      alert("שגיאה בשמירה — נסה שוב");
    }
  };

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"28px 20px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
        <Btn variant="ghost" size="sm" onClick={onBack}>← חזור</Btn>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ fontWeight:700, fontSize: 22 }}>{entry.label}</div>
            {entry.is_finalized
              ? <span style={{ background:"rgba(46,204,138,0.15)", color:"var(--green-soft)", borderRadius:20, padding:"3px 12px", fontSize: 14, fontWeight:700 }}>✓ הושלם</span>
              : <span style={{ background:"rgba(255,183,77,0.12)", color:"var(--gold)", borderRadius:20, padding:"3px 12px", fontSize: 14 }}>בתהליך</span>
            }
          </div>
          <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{subs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Btn size="sm" onClick={onAddSource}>+ הוסף מקור</Btn>
          {entry.is_finalized
            ? <Btn variant="ghost" size="sm" onClick={onReopen}>🔓 פתח לעריכה</Btn>
            : <Btn size="sm" onClick={onFinalize} disabled={subs.length === 0}>✅ סיימתי את החודש</Btn>
          }
        </div>
      </div>

      {subs.length === 0 ? (
        <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📂</div>
          <div style={{ marginBottom:16 }}>עוד לא הוספת מקורות לחודש זה</div>
          <Btn onClick={onAddSource}>+ הוסף מקור ראשון</Btn>
        </Card>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          {/* Category summary */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:12, fontSize: 17, color:"var(--green-deep)", letterSpacing:"-0.1px" }}>סיכום לפי סעיף</div>
            <div style={{ maxHeight:300, overflowY:"auto" }}>
              {catSummary.map(([cat, amt]) => (
                <div key={cat} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:`1px solid ${"var(--border)"}22`, fontSize: 15 }}>
                  <span>{cat}</span>
                  <span style={{ fontWeight:700, color:"var(--red)" }}>₪{Math.round(amt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Sources list */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:12, fontSize: 17, color:"var(--green-deep)", letterSpacing:"-0.1px" }}>מקורות</div>
            {subs.map(sub => (
              <div key={sub.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${"var(--border)"}22` }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight:600 }}>{sub.source_label || sub.label}</div>
                  <div style={{ fontSize: 14, color:"var(--text-dim)" }}>{(sub.transactions||[]).length} תנועות</div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button type="button" onClick={() => startEdit(sub)} style={{ background:"none", border:`1px solid ${"var(--border)"}`, borderRadius:7, padding:"3px 10px", fontSize: 14, color:"var(--green-mid)", cursor:"pointer", fontFamily:"inherit" }}>ערוך</button>
                  <button type="button" onClick={() => { if (window.confirm("למחוק מקור זה?")) onDeleteSub(sub.id); }} style={{ background:"none", border:`1px solid rgba(247,92,92,0.4)`, borderRadius:7, padding:"3px 10px", fontSize: 13, color:"var(--red)", cursor:"pointer", fontFamily:"inherit" }}>🗑</button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Inline editor */}
      {editingSub && (
        <Card style={{ marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontWeight:700, fontSize: 17, color:"var(--green-deep)" }}>עריכת תנועות</div>
            <div style={{ display:"flex", gap:8 }}>
              <Btn size="sm" onClick={saveEdit}>שמור</Btn>
              <Btn variant="ghost" size="sm" onClick={() => setEditingSub(null)}>ביטול</Btn>
            </div>
          </div>
          {editTx.map((tx, i) => (
            <div key={tx.id || i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:`1px solid ${"var(--border)"}22`, flexWrap:"wrap", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize: 15, fontWeight:600 }}>{tx.name}</div>
                <div style={{ fontSize: 14, color:"var(--text-dim)" }}>{tx.date} · ₪{tx.amount?.toLocaleString()}</div>
              </div>
              <button type="button" onClick={() => { const next = editCatOpen === (tx.id||i) ? null : (tx.id||i); if (next !== null) setCatSearch(""); setEditCatOpen(next); }} style={{ background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"4px 12px", fontSize: 13, color:"var(--green-mid)", cursor:"pointer", fontFamily:"inherit" }}>{tx.cat}</button>
              {editCatOpen === (tx.id||i) && (
                <div style={{ width:"100%", marginTop:6 }}>
                  <CategoryPicker
                    current={tx.cat}
                    catSearch={catSearch}
                    setCatSearch={setCatSearch}
                    categories={categories}
                    rows={categoryRows}
                    clientCats={clientCats}
                    clientId={clientId}
                    onCategoryAdded={onCategoryAdded}
                    hiddenCats={hiddenCats}
                    onHiddenCatsChange={onHiddenCatsChange}
                    onSelect={(cat) => { setEditTx(p => p.map((t,j) => j===i?{...t,cat,edited:true}:t)); setEditCatOpen(null); setCatSearch(""); }}
                  />
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
