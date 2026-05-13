import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { Card, Btn, CustomSelect } from "../ui";

// ── Helper functions ──────────────────────────────────────────────────────────

function periodsOverlap(periods: any[], newFrom: string, newUntil: string | null, excludeId: any = null): boolean {
  const nf = new Date(newFrom);
  const nu = newUntil ? new Date(newUntil) : new Date('9999-12-31');
  return periods
    .filter(p => p.id !== excludeId)
    .some(p => {
      const pf = new Date(p.active_from);
      const pu = p.active_until ? new Date(p.active_until) : new Date('9999-12-31');
      return nf <= pu && nu >= pf;
    });
}

function periodForYear(periods: any[], year: number): any | null {
  const overlapping = (periods || []).filter(p => {
    if (!p.scenario_id) return false; // סנן רשומות יתומות ללא תסריט
    const fy = new Date(p.active_from).getFullYear();
    const uy = p.active_until ? new Date(p.active_until).getFullYear() : 9999;
    return fy <= year && uy >= year;
  });
  if (!overlapping.length) return null;
  return overlapping.sort((a: any, b: any) => new Date(b.active_from).getTime() - new Date(a.active_from).getTime())[0];
}

// Export for use in other components if needed
export { periodsOverlap, periodForYear };

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { clientId: string; }

export default function ClientScenarioView({ clientId }: Props) {
  const today = new Date().toISOString().split('T')[0];

  const [scenarios, setScenarios] = useState<any[]>([]);
  const [periods, setPeriods]     = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<any>(null);
  const [items, setItems]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScId, setNewScId]     = useState("");
  const [newFrom, setNewFrom]     = useState("");
  const [newUntil, setNewUntil]   = useState("");
  const [overlapWarn, setOverlapWarn] = useState("");
  const [saving, setSaving]       = useState(false);

  const load = async () => {
    const [{ data: sc }, { data: per }] = await Promise.all([
      supabase.from("scenarios").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false }),
      supabase.from("active_scenario").select("id, scenario_id, active_from, active_until, scenarios(name)")
        .eq("client_id", clientId).order("active_from", { ascending: false }),
    ]);
    const list = sc || [];
    const perList = per || [];
    setScenarios(list);
    setPeriods(perList);
    const curPeriod = perList.find((p: any) => p.active_from <= today && (!p.active_until || p.active_until >= today));
    const defaultId = curPeriod?.scenario_id || list[0]?.id || null;
    setSelectedId((prev: any) => prev || defaultId);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]); // eslint-disable-line

  useEffect(() => {
    if (!selectedId) return;
    supabase.from("scenario_items").select("*").eq("scenario_id", selectedId).order("sort_order")
      .then(({ data }) => setItems(data || []));
  }, [selectedId]);

  const addPeriod = async () => {
    if (!newScId || !newFrom) { setOverlapWarn("יש לבחור תסריט ותאריך התחלה"); return; }
    if (periodsOverlap(periods, newFrom, newUntil || null)) {
      setOverlapWarn("קיימת חפיפה עם תקופה אחרת — ערוך את התאריכים");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("active_scenario").insert([{
      client_id: clientId,
      scenario_id: parseInt(newScId),
      active_from: newFrom,
      active_until: newUntil || null,
      activated_at: new Date().toISOString(),
    }]);
    setSaving(false);
    if (error) { setOverlapWarn("שגיאה בשמירה — " + error.message); return; }
    setShowAddForm(false);
    setNewScId(""); setNewFrom(""); setNewUntil(""); setOverlapWarn("");
    await load();
  };

  const deletePeriod = async (id: any) => {
    if (!window.confirm("למחוק תקופה זו?")) return;
    const { error } = await supabase.from("active_scenario").delete().eq("id", id);
    if (error) { alert("שגיאה במחיקה — " + error.message); return; }
    await load();
  };

  const income   = items.filter(i => i.item_type === "income");
  const fixed    = items.filter(i => i.item_type === "expense_fixed");
  const variable = items.filter(i => i.item_type === "expense_variable");
  const totalIn  = income.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOut = [...fixed, ...variable].reduce((s, i) => s + Number(i.amount || 0), 0);
  const balance  = totalIn - totalOut;

  const inputSt: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit",
    fontSize: 15, outline: "none",
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>טוען...</div>;

  if (scenarios.length === 0) return (
    <Card style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{ marginBottom: 12, display:"flex", justifyContent:"center" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>
      <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>התסריט התקציבי שלך עוד לא הוכן</div>
      <div style={{ color: "var(--text-dim)", fontSize: 16 }}>אלון יעלה עבורך את התסריט בקרוב</div>
    </Card>
  );

  return (
    <div>
      <h1 style={{ fontFamily:"'Frank Ruhl Libre', serif", fontSize:32, fontWeight:700, color:"var(--text)", textAlign:"center", marginBottom:16, marginTop:0 }}>מאזן מתוכנן</h1>
      <div style={{ height:1, background:"var(--border)", marginBottom:20 }} />
      {/* ── תקופות פעילות ── */}
      <Card style={{ marginBottom: 16, padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>תקופות תסריט פעיל</div>
          <Btn size="sm" onClick={() => { setShowAddForm(v => !v); setOverlapWarn(""); }}>
            {showAddForm ? "✕ ביטול" : "+ הוסף תקופה"}
          </Btn>
        </div>

        {showAddForm && (
          <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "14px 16px", marginBottom: 12, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>תסריט</div>
                <CustomSelect
                  value={newScId}
                  onChange={v => setNewScId(v as string)}
                  options={[
                    { value: "", label: "בחר תסריט..." },
                    ...scenarios.map(sc => ({ value: sc.id, label: sc.name })),
                  ]}
                  style={{ minWidth: 140 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>מתאריך</div>
                <input type="date" value={newFrom} onChange={e => { setNewFrom(e.target.value); setOverlapWarn(""); }}
                  style={inputSt} />
              </div>
              <div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>עד תאריך (אופציונלי)</div>
                <input type="date" value={newUntil} onChange={e => { setNewUntil(e.target.value); setOverlapWarn(""); }}
                  style={inputSt} />
              </div>
              <Btn onClick={addPeriod} disabled={saving}>
                {saving ? "שומר..." : "שמור"}
              </Btn>
            </div>
            {overlapWarn && (
              <div style={{ marginTop: 8, fontSize: 14, color: "var(--red)", fontWeight: 600, display:"flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>{overlapWarn}</div>
            )}
          </div>
        )}

        {periods.length === 0 ? (
          <div style={{ fontSize: 15, color: "var(--text-dim)", textAlign: "center", padding: "12px 0" }}>
            לא הוגדרו תקופות — לחץ "הוסף תקופה"
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {periods.map((p: any) => {
              const isCurrent = p.active_from <= today && (!p.active_until || p.active_until >= today);
              return (
                <div key={p.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 12px", borderRadius: 8,
                  background: isCurrent ? "var(--green-pale)" : "var(--surface2)",
                  border: `1px solid ${isCurrent ? "var(--green-mint)" : "var(--border)"}`,
                  fontSize: 15,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isCurrent && <span style={{ fontSize: 12, background: "var(--green-mid)", color: "#fff", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>פעיל</span>}
                    <strong style={{ color: isCurrent ? "var(--green-deep)" : "var(--text)" }}>
                      {p.scenarios?.name || "תסריט לא זמין"}
                    </strong>
                    <span style={{ color: "var(--text-dim)", fontSize: 14 }}>
                      {p.active_from} — {p.active_until || "ללא תאריך סיום"}
                    </span>
                  </div>
                  <Btn variant="danger" size="sm" onClick={() => deletePeriod(p.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></Btn>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── תצוגת תסריט ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, color: "var(--text-dim)" }}>הצג תסריט:</div>
        {scenarios.map(sc => (
          <button key={sc.id} onClick={() => setSelectedId(sc.id)}
            style={{
              padding: "7px 18px", borderRadius: 20, fontSize: 16,
              fontWeight: selectedId === sc.id ? 700 : 500,
              cursor: "pointer", fontFamily: "inherit",
              border: `2px solid ${selectedId === sc.id ? "var(--green-mid)" : "var(--border)"}`,
              background: selectedId === sc.id ? "var(--green-mid)" : "var(--surface2)",
              color: selectedId === sc.id ? "#fff" : "var(--text-mid)",
            }}>
            {sc.name}
          </button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "2px solid var(--border)" }}>
          {[
            { label: 'סה"כ הכנסות', val: totalIn, color: "var(--green-deep)", bg: "var(--green-pale)" },
            { label: 'סה"כ הוצאות', val: totalOut, color: "var(--red)", bg: "var(--surface2)" },
            { label: "יתרה חודשית", val: balance, color: balance >= 0 ? "var(--green-deep)" : "var(--red)", bg: balance >= 0 ? "var(--green-pale)" : "var(--surface2)" },
          ].map(k => (
            <div key={k.label} style={{ padding: "14px 20px", background: k.bg, textAlign: "center", borderLeft: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 24, fontWeight: 700, color: k.color }}>
                ₪{Math.round(k.val).toLocaleString()}
              </div>
              <div style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 3 }}>{k.label}</div>
            </div>
          ))}
        </div>
        <div style={{ overflowY: "auto", maxHeight: 480 }}>
          {[
            { title: "הכנסות", items: income, bg: "var(--green-pale)", titleBg: "var(--green-mint)", titleColor: "var(--green-deep)" },
            { title: "הוצאות קבועות", items: fixed, bg: "var(--surface)", titleBg: "var(--surface2)", titleColor: "var(--text-mid)" },
            { title: "הוצאות משתנות", items: variable, bg: "var(--surface)", titleBg: "var(--gold-light)", titleColor: "var(--gold)" },
          ].map(section => (
            <div key={section.title}>
              <div style={{ padding: "8px 20px", background: section.titleBg, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: section.titleColor }}>{section.title}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: section.titleColor }}>
                  ₪{Math.round(section.items.reduce((s, i) => s + Number(i.amount || 0), 0)).toLocaleString()}
                </div>
              </div>
              {section.items.filter(i => Number(i.amount) > 0).map((item: any, idx: number) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 20px", background: idx % 2 === 0 ? section.bg : "var(--surface)", borderBottom: "1px solid var(--border)", fontSize: 16 }}>
                  <span style={{ color: "var(--text-mid)" }}>{item.category_name}</span>
                  <span style={{ fontWeight: 600, fontFamily: "'Frank Ruhl Libre', serif" }}>₪{Math.round(item.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
