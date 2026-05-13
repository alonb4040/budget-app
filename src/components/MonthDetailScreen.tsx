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
              ? <span style={{ background:"var(--green-mint)", color:"var(--green-deep)", borderRadius:20, padding:"3px 12px", fontSize: 14, fontWeight:700 }}>✓ הושלם</span>
              : <span style={{ background:"var(--gold-light)", color:"var(--gold)", borderRadius:20, padding:"3px 12px", fontSize: 14 }}>בתהליך</span>
            }
          </div>
          <div style={{ fontSize: 15, color:"var(--text-dim)" }}>{subs.length} מקורות · {allTx.length} תנועות · ₪{Math.round(total).toLocaleString()}</div>
        </div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <Btn size="sm" onClick={onAddSource}>+ הוסף מקור</Btn>
          {entry.is_finalized
            ? <Btn variant="ghost" size="sm" onClick={onReopen} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>פתח לעריכה</Btn>
            : <Btn size="sm" onClick={onFinalize} disabled={subs.length === 0}>סיימתי את החודש</Btn>
          }
        </div>
      </div>

      {subs.length === 0 ? (
        <Card style={{ textAlign:"center", padding:48, color:"var(--text-dim)" }}>
          <div style={{ marginBottom:12, display:"flex", justifyContent:"center" }}><svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
          <div style={{ marginBottom:16 }}>עוד לא הוספת מקורות לחודש זה</div>
          <Btn onClick={onAddSource}>+ הוסף מקור ראשון</Btn>
        </Card>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
          {/* Category summary — horizontal bars */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:14, fontSize: 17, color:"var(--green-deep)", letterSpacing:"-0.1px" }}>סיכום לפי סעיף</div>
            <div style={{ maxHeight:340, overflowY:"auto" }}>
              {(() => {
                const visible = catSummary.filter(([cat]) => !ignoredCats.has(cat));
                const maxAmt = visible[0]?.[1] || 1;
                return visible.map(([cat, amt]) => (
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", fontSize:13, marginBottom:4 }}>
                      <span style={{ color:"var(--text-dim)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"70%" }}>{cat}</span>
                      <span style={{ fontWeight:700, color:"var(--red)", flexShrink:0 }}>₪{Math.round(amt).toLocaleString()}</span>
                    </div>
                    <div style={{ height:6, borderRadius:3, background:"var(--border)", overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:3, background:"var(--red)", width:`${(amt / maxAmt) * 100}%` }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </Card>

          {/* Sources list */}
          <Card>
            <div style={{ fontWeight:700, marginBottom:12, fontSize: 17, color:"var(--green-deep)", letterSpacing:"-0.1px" }}>מקורות</div>
            {subs.map(sub => (
              <div key={sub.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight:600 }}>{sub.source_label || sub.label}</div>
                  <div style={{ fontSize: 14, color:"var(--text-dim)" }}>{(sub.transactions||[]).length} תנועות</div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <Btn variant="ghost" size="sm" onClick={() => startEdit(sub)}>ערוך</Btn>
                  <Btn variant="danger" size="sm" onClick={() => { if (window.confirm("למחוק מקור זה?")) onDeleteSub(sub.id); }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></Btn>
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
            <div key={tx.id || i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid var(--border)", flexWrap:"wrap", gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize: 15, fontWeight:600 }}>{tx.name}</div>
                <div style={{ fontSize: 14, color:"var(--text-dim)" }}>{tx.date} · ₪{tx.amount?.toLocaleString()}</div>
                {tx.note && (
                  <div style={{ fontSize: 13, color:"var(--green-deep)", background:"var(--green-pale)", border:"1px solid var(--green-mint)", borderRadius:6, padding:"3px 8px", marginTop:4, display:"inline-flex", alignItems:"center", gap:4 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    {tx.note}
                  </div>
                )}
              </div>
              <button type="button" onClick={() => { const next = editCatOpen === (tx.id||i) ? null : (tx.id||i); if (next !== null) setCatSearch(""); setEditCatOpen(next); }} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"4px 12px", fontSize: 13, color:"var(--green-mid)", cursor:"pointer", fontFamily:"'Heebo',sans-serif", fontWeight:500 }}>{tx.cat}</button>
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
