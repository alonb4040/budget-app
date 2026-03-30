import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { Card, Btn, Spinner } from "../ui";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

// ── Utility functions ─────────────────────────────────────────────────────────

function debtMonthsDiff(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
}

function payoffDateLabel(months: number): string {
  if (months <= 0) return "כבר שולם";
  const d = new Date();
  d.setMonth(d.getMonth() + Math.round(months));
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

function calcCurrentBalance(debt: any): number {
  const P = Number(debt.original_balance) || 0;
  const pmt = Number(debt.min_payment) || 0;
  const r = Number(debt.interest_rate) / 100 / 12;
  if (!debt.start_date || !P) return P;
  const k = debtMonthsDiff(debt.start_date);
  if (k === 0) return P;
  if (r === 0) return Math.max(0, P - pmt * k);
  const balance = P * Math.pow(1 + r, k) - (r > 0 ? pmt * (Math.pow(1 + r, k) - 1) / r : pmt * k);
  return Math.max(0, balance);
}

function calculatePayoffPlan(debtsWithBal: any[], extraMonthly: string, strategy: string) {
  const extra = Number(extraMonthly) || 0;
  const sorted = [...debtsWithBal]
    .filter(d => d.currentBalance > 0)
    .sort((a, b) => strategy === "snowball"
      ? a.currentBalance - b.currentBalance
      : Number(b.interest_rate) - Number(a.interest_rate));
  if (!sorted.length) return null;

  const state = sorted.map(d => ({
    id: d.id, name: d.name, rate: Number(d.interest_rate) / 100 / 12,
    minPmt: Number(d.min_payment) || 0,
    left: d.currentBalance, totalInterest: 0, payoffMonth: 0,
  }));

  const timeline: { month: number; total: number }[] = [{ month: 0, total: state.reduce((s, d) => s + d.left, 0) }];
  let month = 0;

  while (state.some(d => d.left > 0) && month < 600) {
    month++;
    for (const d of state) {
      if (d.left <= 0) continue;
      const interest = d.left * d.rate;
      const pay = Math.min(d.minPmt, d.left + interest);
      d.left = Math.max(0, d.left + interest - pay);
      d.totalInterest += interest;
      if (d.left <= 0 && !d.payoffMonth) d.payoffMonth = month;
    }
    let rem = extra;
    for (const d of state) {
      if (d.left > 0 && rem > 0) {
        const pay = Math.min(rem, d.left);
        d.left -= pay; rem -= pay;
        if (d.left <= 0 && !d.payoffMonth) d.payoffMonth = month;
        break;
      }
    }
    timeline.push({ month, total: state.reduce((s, d) => s + d.left, 0) });
  }
  state.forEach(d => { if (!d.payoffMonth) d.payoffMonth = month; });

  return {
    debts: sorted.map((orig, i) => ({ ...orig, payoffMonth: state[i].payoffMonth, totalInterestPaid: state[i].totalInterest })),
    timeline,
    totalMonths: month,
    totalInterest: state.reduce((s, d) => s + d.totalInterest, 0),
  };
}

const DEBT_TYPE_LABEL: Record<string, string> = { loan:"הלוואה", mortgage:"משכנתה", credit_card:"אשראי", overdraft:"אוברדראפט", other:"אחר" };
const DEBT_TYPE_COLOR: Record<string, string> = { loan:"var(--green-mid)", mortgage:"#6366f1", credit_card:"var(--red)", overdraft:"var(--gold)", other:"var(--text-dim)" };

// ── Component ─────────────────────────────────────────────────────────────────

interface Props { clientId: string; }

export default function DebtManager({ clientId }: Props) {
  const [debts, setDebts]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [form, setForm]           = useState<any>(null);
  const [saving, setSaving]       = useState(false);
  const [extra, setExtra]         = useState("500");
  const [strategy, setStrategy]   = useState("avalanche");

  const inpS: React.CSSProperties = {
    border:"1px solid var(--border)", borderRadius:6, padding:"6px 10px",
    fontSize:13, fontFamily:"inherit", background:"var(--surface2)", color:"var(--text)",
    width:"100%", boxSizing:"border-box",
  };

  useEffect(() => { loadDebts(); }, [clientId]); // eslint-disable-line

  const loadDebts = async () => {
    setLoading(true);
    const { data } = await supabase.from("debts").select("*").eq("client_id", clientId).order("created_at");
    setDebts(data || []);
    setLoading(false);
  };

  const openNew = () => setForm({ name:"", type:"loan", original_balance:"", interest_rate:"", min_payment:"", start_date:"", due_day:"", notes:"" });
  const openEdit = (d: any) => setForm({ ...d,
    original_balance: String(d.original_balance), interest_rate: String(d.interest_rate),
    min_payment: String(d.min_payment), due_day: String(d.due_day || ""),
    start_date: d.start_date ? d.start_date.slice(0,10) : "",
  });

  const saveDebt = async () => {
    if (!form.name || !form.original_balance) return;
    setSaving(true);
    const row = {
      client_id: clientId, name: form.name, type: form.type || "loan",
      original_balance: Number(form.original_balance) || 0,
      interest_rate: Number(form.interest_rate) || 0,
      min_payment: Number(form.min_payment) || 0,
      start_date: form.start_date || null,
      due_day: form.due_day ? Number(form.due_day) : null,
      notes: form.notes || null,
    };
    if (form.id) {
      await supabase.from("debts").update(row).eq("id", form.id).eq("client_id", clientId);
    } else {
      await supabase.from("debts").insert([row]);
    }
    setSaving(false);
    setForm(null);
    loadDebts();
  };

  const deleteDebt = async (id: any) => {
    if (!window.confirm("למחוק חוב זה?")) return;
    await supabase.from("debts").delete().eq("id", id).eq("client_id", clientId);
    setDebts(prev => prev.filter(d => d.id !== id));
  };

  const debtsWB = useMemo(() => debts.map(d => ({ ...d, currentBalance: calcCurrentBalance(d) })), [debts]);
  const totalDebt = debtsWB.reduce((s, d) => s + d.currentBalance, 0);
  const plan = useMemo(() => debtsWB.length ? calculatePayoffPlan(debtsWB, extra, strategy) : null, [debtsWB, extra, strategy]);

  if (loading) return <div style={{ padding:40, textAlign:"center" }}><Spinner /></div>;

  return (
    <div style={{ direction:"rtl" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:18 }}>💳 מנהל חובות</div>
          {debts.length > 0 && (
            <div style={{ color:"var(--text-dim)", fontSize:13, marginTop:4 }}>
              {debts.length} חובות · יתרה כוללת: <strong style={{ color:"var(--red)" }}>₪{Math.round(totalDebt).toLocaleString()}</strong>
            </div>
          )}
        </div>
        {!form && <Btn size="sm" onClick={openNew}>+ הוסף חוב</Btn>}
      </div>

      {/* Form */}
      {form && (
        <Card style={{ marginBottom:20, padding:"20px 24px" }}>
          <div style={{ fontWeight:700, marginBottom:14 }}>{form.id ? "עריכת חוב" : "הוספת חוב חדש"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:16 }}>
            {[
              { label:"שם החוב", key:"name", type:"text", ph:"ויזה, הלוואת רכב..." },
              { label:"ריבית שנתית (%)", key:"interest_rate", type:"number", ph:"6" },
              { label:"תשלום חודשי (₪)", key:"min_payment", type:"number", ph:"1,500" },
              { label:"יתרה מקורית (₪)", key:"original_balance", type:"number", ph:"100,000" },
              { label:"תאריך תחילה", key:"start_date", type:"date" },
              { label:"יום חיוב בחודש", key:"due_day", type:"number", ph:"15" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:4 }}>{f.label}</div>
                <input type={f.type} value={form[f.key] || ""} placeholder={f.ph}
                  onChange={e => setForm((p: any) => ({...p, [f.key]: e.target.value}))} style={inpS} />
              </div>
            ))}
            <div>
              <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:4 }}>סוג</div>
              <select value={form.type||"loan"} onChange={e => setForm((p: any) =>({...p,type:e.target.value}))} style={inpS}>
                <option value="loan">הלוואה</option>
                <option value="mortgage">משכנתה</option>
                <option value="credit_card">כרטיס אשראי</option>
                <option value="overdraft">אוברדראפט</option>
                <option value="other">אחר</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:4 }}>הערות (אופציונלי)</div>
            <input value={form.notes||""} onChange={e=>setForm((p: any)=>({...p,notes:e.target.value}))} style={inpS} placeholder="פרטים נוספים..." />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={saveDebt} disabled={!form.name || !form.original_balance || saving}>{saving ? "שומר..." : "שמור"}</Btn>
            <Btn variant="secondary" onClick={() => setForm(null)}>ביטול</Btn>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {debts.length === 0 && !form ? (
        <Card style={{ textAlign:"center", padding:"56px 32px", color:"var(--text-dim)" }}>
          <div style={{ fontSize:52, marginBottom:16 }}>💳</div>
          <div style={{ fontWeight:700, fontSize:16, marginBottom:8, color:"var(--text)" }}>אין חובות רשומים</div>
          <div style={{ fontSize:13, marginBottom:20 }}>הוסף הלוואות, משכנתה, או אשראי כדי לראות תוכנית פירעון</div>
          <Btn onClick={openNew}>+ הוסף חוב ראשון</Btn>
        </Card>
      ) : debts.length > 0 && (
        <>
          {/* Debt cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:12, marginBottom:24 }}>
            {debtsWB.map(d => {
              const pct = d.original_balance > 0 ? Math.max(0, Math.min(100, Math.round((1 - d.currentBalance / d.original_balance) * 100))) : 0;
              const color = DEBT_TYPE_COLOR[d.type] || "var(--text-dim)";
              const isAutoCalc = !!d.start_date && (d.type === "loan" || d.type === "mortgage");
              return (
                <Card key={d.id} style={{ padding:"16px 18px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{d.name}</div>
                      <span style={{ background:`${color}22`, color, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>
                        {DEBT_TYPE_LABEL[d.type]||"אחר"}
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={() => openEdit(d)} style={{ background:"none", border:"1px solid var(--border)", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer", color:"var(--text-dim)", fontFamily:"inherit" }}>✏️</button>
                      <button onClick={() => deleteDebt(d.id)} style={{ background:"none", border:"1px solid rgba(247,92,92,0.4)", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer", color:"var(--red)", fontFamily:"inherit" }}>🗑</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12, fontSize:13 }}>
                    <div>
                      <div style={{ color:"var(--text-dim)", fontSize:11 }}>יתרה {isAutoCalc ? "מחושבת" : "נוכחית"}</div>
                      <div style={{ fontWeight:700, color:"var(--red)", fontSize:16 }}>₪{Math.round(d.currentBalance).toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ color:"var(--text-dim)", fontSize:11 }}>תשלום חודשי</div>
                      <div style={{ fontWeight:600 }}>₪{Number(d.min_payment).toLocaleString()}</div>
                    </div>
                    <div>
                      <div style={{ color:"var(--text-dim)", fontSize:11 }}>ריבית שנתית</div>
                      <div style={{ fontWeight:600 }}>{d.interest_rate}%</div>
                    </div>
                    {d.due_day && (
                      <div>
                        <div style={{ color:"var(--text-dim)", fontSize:11 }}>יום חיוב</div>
                        <div style={{ fontWeight:600 }}>{d.due_day} לחודש</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:11, color:"var(--text-dim)", display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span>שולם {pct}%</span>
                    <span>מתוך ₪{Math.round(d.original_balance).toLocaleString()}</span>
                  </div>
                  <div style={{ height:6, background:"var(--surface2)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:"var(--green-soft)", borderRadius:3, transition:"width 0.5s" }} />
                  </div>
                  {isAutoCalc && <div style={{ fontSize:10, color:"var(--text-dim)", marginTop:6 }}>✦ יתרה מחושבת אוטומטית מתאריך תחילה</div>}
                </Card>
              );
            })}
          </div>

          {/* Payoff strategy */}
          <Card style={{ padding:"20px 24px" }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:16 }}>📅 תוכנית פירעון</div>
            <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap", marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
                <span style={{ color:"var(--text-dim)" }}>תשלום נוסף מעל המינימום:</span>
                <input type="number" value={extra} onChange={e => setExtra(e.target.value)}
                  style={{ ...inpS, width:90 }} />
                <span style={{ color:"var(--text-dim)" }}>₪/חודש</span>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                {[
                  { id:"avalanche", label:"🔥 מפולת", sub:"חוסך ריבית", color:"var(--red)", bg:"rgba(248,113,113,0.12)" },
                  { id:"snowball",  label:"❄️ כדור שלג", sub:"קל פסיכולוגית", color:"var(--green-mid)", bg:"rgba(79,142,247,0.12)" },
                ].map(s => (
                  <button key={s.id} onClick={() => setStrategy(s.id)} style={{
                    padding:"7px 14px", borderRadius:8, fontSize:12, fontFamily:"inherit", cursor:"pointer",
                    background: strategy===s.id ? s.bg : "var(--surface2)",
                    border:`1px solid ${strategy===s.id ? s.color : "var(--border)"}`,
                    color: strategy===s.id ? s.color : "var(--text-dim)", fontWeight: strategy===s.id ? 700 : 400,
                    lineHeight:1.3,
                  }}>
                    <div>{s.label}</div>
                    <div style={{ fontSize:10, fontWeight:400, opacity:0.8 }}>{s.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {plan && (
              <>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:10, marginBottom:20 }}>
                  {[
                    { label:"תאריך כיבוי כולל", val: payoffDateLabel(plan.totalMonths), color:"var(--green-soft)" },
                    { label:'סה"כ ריבית שתשולם', val: `₪${Math.round(plan.totalInterest).toLocaleString()}`, color:"var(--red)" },
                    { label:"תשלום חודשי כולל", val: `₪${(debtsWB.reduce((s,d)=>s+Number(d.min_payment),0)+(Number(extra)||0)).toLocaleString()}`, color:"var(--text)" },
                  ].map(k => (
                    <div key={k.label} style={{ background:"var(--surface2)", borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:4 }}>{k.label}</div>
                      <div style={{ fontWeight:700, fontSize:15, color:k.color }}>{k.val}</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX:"auto", marginBottom:20 }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, direction:"rtl" }}>
                    <thead>
                      <tr style={{ background:"var(--surface2)" }}>
                        {["#","חוב","יתרה","ריבית","תשלום/חודש","תאריך כיבוי",'סה"כ ריבית'].map(h => (
                          <th key={h} style={{ padding:"8px 12px", textAlign:"right", fontWeight:600, color:"var(--text-dim)", borderBottom:"1px solid var(--border)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {plan.debts.map((d, i) => (
                        <tr key={d.id} style={{ borderBottom:"1px solid var(--border)44", background:i%2===0?"transparent":"rgba(0,0,0,0.02)" }}>
                          <td style={{ padding:"8px 12px", color:"var(--text-dim)", fontSize:11 }}>{i+1}</td>
                          <td style={{ padding:"8px 12px", fontWeight:600 }}>{d.name}</td>
                          <td style={{ padding:"8px 12px", color:"var(--red)" }}>₪{Math.round(d.currentBalance).toLocaleString()}</td>
                          <td style={{ padding:"8px 12px" }}>{d.interest_rate}%</td>
                          <td style={{ padding:"8px 12px" }}>₪{Number(d.min_payment).toLocaleString()}{i===0&&Number(extra)>0?<span style={{color:"var(--green-soft)",fontSize:10}}> +₪{Number(extra).toLocaleString()}</span>:""}</td>
                          <td style={{ padding:"8px 12px", color:"var(--green-soft)", fontWeight:600 }}>{payoffDateLabel(d.payoffMonth)}</td>
                          <td style={{ padding:"8px 12px", color:"var(--text-dim)" }}>₪{Math.round(d.totalInterestPaid).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {plan.timeline.length > 2 && (() => {
                  const step = Math.max(1, Math.floor(plan.timeline.length / 30));
                  const chartData = plan.timeline
                    .filter((_, i, a) => i % step === 0 || i === a.length - 1)
                    .map(p => ({ ...p, label: p.month === 0 ? "עכשיו" : `${p.month}m` }));
                  return (
                    <div>
                      <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:8 }}>יתרת חוב כוללת לאורך הזמן</div>
                      <ResponsiveContainer width="100%" height={170}>
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="label" tick={{ fill:"var(--text-dim)", fontSize:10 }} />
                          <YAxis tick={{ fill:"var(--text-dim)", fontSize:10 }} tickFormatter={v => `₪${Math.round(v/1000)}k`} />
                          <Tooltip contentStyle={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, fontFamily:"inherit" }}
                            formatter={(v: number) => [`₪${Math.round(v).toLocaleString()}`, "יתרה"]} />
                          <Line type="monotone" dataKey="total" stroke="var(--red)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
