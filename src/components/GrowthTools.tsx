import { useState, useMemo } from "react";
import { Card } from "../ui";

// ── Compound Interest Calculator ──────────────────────────────────────────────

function CompoundInterestCalc() {
  const [initialDeposit, setInitialDeposit] = useState("");
  const [annualRate, setAnnualRate]         = useState("5");
  const [periods, setPeriods]               = useState([{ years: "5", monthly: "1000" }]);

  const updatePeriod = (i: number, field: string, val: string) =>
    setPeriods(ps => ps.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addPeriod    = () => setPeriods(ps => [...ps, { years: "5", monthly: ps[ps.length - 1]?.monthly || "1000" }]);
  const removePeriod = (i: number) => setPeriods(ps => ps.filter((_, idx) => idx !== i));

  const rows = useMemo(() => {
    const rate = Number(annualRate);
    if (!rate || rate <= 0) return [];
    const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
    let balance = Number(initialDeposit) || 0;
    let totalDeposited = balance;
    const result: { year: number; monthly: number; totalDeposited: number; interest: number; balance: number }[] = [];
    let yearNum = 0;
    for (const p of periods) {
      const numYears = Number(p.years) || 0;
      const dep      = Number(p.monthly) || 0;
      for (let y = 0; y < numYears; y++) {
        yearNum++;
        for (let m = 0; m < 12; m++) {
          balance = (balance + dep) * (1 + monthlyRate);
          totalDeposited += dep;
        }
        result.push({ year: yearNum, monthly: dep, totalDeposited, interest: balance - totalDeposited, balance });
      }
    }
    return result;
  }, [initialDeposit, annualRate, periods]);

  const fmt = (n: number) => "₪" + Math.round(n).toLocaleString("he-IL");

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px",
    fontSize: 14, fontFamily: "inherit", background: "var(--surface2)", color: "var(--text)",
    width: 110, textAlign: "right",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, color: "var(--text-dim)", marginBottom: 4, display: "block" };

  const last = rows[rows.length - 1];

  return (
    <div style={{ direction: "rtl", maxWidth: 720 }}>
      <Card style={{ marginBottom: 16, padding: "20px 24px" }}>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <label style={labelStyle}>הפקדה ראשונית (₪)</label>
            <input type="number" min="0" value={initialDeposit} onChange={e => setInitialDeposit(e.target.value)}
              style={inputStyle} placeholder="0" />
          </div>
          <div>
            <label style={labelStyle}>ריבית שנתית (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={annualRate} onChange={e => setAnnualRate(e.target.value)}
              style={inputStyle} placeholder="5" />
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 16, padding: "20px 24px" }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>תקופות הפקדה</div>
        {periods.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="1" max="50" value={p.years} onChange={e => updatePeriod(i, "years", e.target.value)}
                style={{ ...inputStyle, width: 60 }} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>שנים</span>
            </div>
            <span style={{ color: "var(--text-dim)" }}>×</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" min="0" value={p.monthly} onChange={e => updatePeriod(i, "monthly", e.target.value)}
                style={{ ...inputStyle, width: 90 }} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>₪/חודש</span>
            </div>
            {periods.length > 1 && (
              <button onClick={() => removePeriod(i)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text-dim)", padding: "2px 6px" }}>🗑</button>
            )}
          </div>
        ))}
        <button onClick={addPeriod} style={{ marginTop: 6, padding: "7px 14px", fontSize: 13, fontFamily: "inherit", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", color: "var(--text)" }}>
          + הוסף תקופה
        </button>
      </Card>

      {rows.length > 0 ? (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, direction: "rtl" }}>
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                  {["שנה", "הפקדה/חודש", 'סה"כ הופקד', "ריבית שנצברה", "יתרה"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.year} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.025)", borderBottom: "1px solid var(--border)44" }}>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: "var(--text-dim)" }}>{r.year}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>{fmt(r.monthly)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right" }}>{fmt(r.totalDeposited)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", color: "var(--green-soft)", fontWeight: 600 }}>{fmt(r.interest)}</td>
                    <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 700 }}>{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
              {last && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--text-dim)" }}>סיכום</td>
                    <td />
                    <td style={{ padding: "10px 14px", fontWeight: 700 }}>{fmt(last.totalDeposited)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--green-soft)" }}>{fmt(last.interest)}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: 15 }}>{fmt(last.balance)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      ) : (
        <Card style={{ textAlign: "center", padding: "32px", color: "var(--text-dim)", fontSize: 14 }}>
          הזן ריבית ותקופת הפקדה כדי לראות את הגרף
        </Card>
      )}
    </div>
  );
}

// ── Loan Calculator ───────────────────────────────────────────────────────────

function LoanCalc() {
  const [calcBy,    setCalcBy]    = useState("payment");
  const [method,    setMethod]    = useState("spitzer");
  const [indexed,   setIndexed]   = useState(false);
  const [cpiRate,   setCpiRate]   = useState("2");
  const [loanAmt,   setLoanAmt]   = useState("400000");
  const [months,    setMonths]    = useState("180");
  const [rate,      setRate]      = useState("4");
  const [monthlyPmt, setMonthlyPmt] = useState("3000");

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--border)", borderRadius: 6, padding: "7px 10px",
    fontSize: 14, fontFamily: "inherit", background: "var(--surface2)", color: "var(--text)",
    width: 120, textAlign: "right",
  };
  const toggleBtn = (active: boolean): React.CSSProperties => ({
    padding: "7px 16px", fontSize: 13, fontFamily: "inherit", cursor: "pointer", borderRadius: 6,
    border: "1px solid var(--border)",
    fontWeight: active ? 700 : 400,
    background: active ? "var(--green-mid)" : "var(--surface2)",
    color: active ? "#fff" : "var(--text)",
  });

  const { monthlyPayment, derivedAmount, rows } = useMemo(() => {
    const r      = Number(rate) / 100 / 12;
    const n      = Math.max(1, Math.round(Number(months)));
    const cpi    = indexed ? Number(cpiRate) / 100 / 12 : 0;
    const P      = calcBy === "payment" ? Number(loanAmt) : null;
    const pmt    = calcBy === "amount"  ? Number(monthlyPmt) : null;

    let spitzerPmt = 0;
    let computedP  = 0;
    if (calcBy === "payment" && P && P > 0 && r > 0) {
      spitzerPmt = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      computedP  = P;
    } else if (calcBy === "payment" && P && P > 0 && r === 0) {
      spitzerPmt = P / n;
      computedP  = P;
    } else if (calcBy === "amount" && pmt && pmt > 0 && r > 0) {
      if (method === "equal") {
        computedP  = pmt / (1 / n + r);
      } else {
        computedP  = pmt * (1 - Math.pow(1 + r, -n)) / r;
      }
      spitzerPmt = pmt;
    } else if (calcBy === "amount" && pmt && pmt > 0 && r === 0) {
      computedP  = pmt * n;
      spitzerPmt = pmt;
    }

    const tableRows: { month: number; balance: number; principal: number; interest: number; payment: number }[] = [];
    let balance = computedP;
    let totalInterest = 0;
    for (let m = 1; m <= n; m++) {
      if (cpi > 0) balance *= (1 + cpi);
      const interestPart = balance * r;
      let principalPart: number, payment: number;
      if (method === "spitzer") {
        if (cpi > 0 && r > 0) {
          payment = (balance * r * Math.pow(1 + r, n - m + 1)) / (Math.pow(1 + r, n - m + 1) - 1);
        } else {
          payment = spitzerPmt;
        }
        principalPart = payment - interestPart;
      } else {
        principalPart = computedP / n;
        payment = principalPart + interestPart;
      }
      balance -= principalPart;
      if (balance < 0.01) balance = 0;
      totalInterest += interestPart;
      tableRows.push({ month: m, balance: Math.max(0, balance), principal: principalPart, interest: interestPart, payment });
    }

    const firstPayment = tableRows[0]?.payment || 0;
    return { monthlyPayment: firstPayment, derivedAmount: computedP, rows: tableRows };
  }, [calcBy, method, indexed, cpiRate, loanAmt, months, rate, monthlyPmt]);

  const fmt  = (n: number) => Math.round(n).toLocaleString("he-IL");
  const fmtD = (n: number) => n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 16, marginBottom: 14, flexWrap: "wrap" };
  const labelStyle: React.CSSProperties = { minWidth: 170, fontSize: 13, color: "var(--text)", fontWeight: 500 };

  return (
    <div style={{ direction: "rtl", maxWidth: 760 }}>
      <Card style={{ marginBottom: 16, padding: "22px 24px" }}>
        <div style={rowStyle}>
          <span style={labelStyle}>חשב לפי</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={toggleBtn(calcBy === "payment")} onClick={() => setCalcBy("payment")}>החזר חודשי (₪)</button>
            <button style={toggleBtn(calcBy === "amount")}  onClick={() => setCalcBy("amount")}>סכום ההלוואה (₪)</button>
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>שיטת החזר</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={toggleBtn(method === "spitzer")} onClick={() => setMethod("spitzer")}>החזר קבוע (לוח שפיצר)</button>
            <button style={toggleBtn(method === "equal")}   onClick={() => setMethod("equal")}>קרן שווה</button>
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>הצמדה למדד</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={toggleBtn(!indexed)} onClick={() => setIndexed(false)}>ללא הצמדה</button>
            <button style={toggleBtn(indexed)}  onClick={() => setIndexed(true)}>עם הצמדה</button>
            {indexed && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" min="0" max="20" step="0.1" value={cpiRate} onChange={e => setCpiRate(e.target.value)}
                  style={{ ...inputStyle, width: 70 }} />
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>% עלייה שנתית</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)44", margin: "16px 0" }} />

        {calcBy === "payment" && (
          <div style={rowStyle}>
            <span style={labelStyle}>סכום ההלוואה</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, flexWrap: "wrap" }}>
              <input type="range" min="10000" max="3000000" step="10000" value={loanAmt}
                onChange={e => setLoanAmt(e.target.value)} style={{ flex: 1, minWidth: 120, accentColor: "var(--green-mid)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" value={loanAmt} onChange={e => setLoanAmt(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>₪</span>
              </div>
            </div>
          </div>
        )}

        {calcBy === "amount" && (
          <div style={rowStyle}>
            <span style={labelStyle}>החזר חודשי רצוי</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, flexWrap: "wrap" }}>
              <input type="range" min="500" max="50000" step="100" value={monthlyPmt}
                onChange={e => setMonthlyPmt(e.target.value)} style={{ flex: 1, minWidth: 120, accentColor: "var(--green-mid)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" value={monthlyPmt} onChange={e => setMonthlyPmt(e.target.value)} style={inputStyle} />
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>₪</span>
              </div>
            </div>
          </div>
        )}

        <div style={rowStyle}>
          <span style={labelStyle}>תקופת ההלוואה (חודשים)</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, flexWrap: "wrap" }}>
            <input type="range" min="12" max="360" step="6" value={months}
              onChange={e => setMonths(e.target.value)} style={{ flex: 1, minWidth: 120, accentColor: "var(--green-mid)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={months} onChange={e => setMonths(e.target.value)} style={inputStyle} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>חודשים</span>
            </div>
          </div>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>ריבית שנתית</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, flexWrap: "wrap" }}>
            <input type="range" min="0" max="15" step="0.1" value={rate}
              onChange={e => setRate(e.target.value)} style={{ flex: 1, minWidth: 120, accentColor: "var(--green-mid)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="number" value={rate} onChange={e => setRate(e.target.value)} style={inputStyle} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>%</span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)44", marginTop: 8, paddingTop: 16 }}>
          {calcBy === "payment" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ ...labelStyle, fontWeight: 700 }}>ההחזר החודשי</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--green-mid)" }}>₪ {fmtD(monthlyPayment)}</span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ ...labelStyle, fontWeight: 700 }}>סכום ההלוואה האפשרי</span>
              <span style={{ fontSize: 22, fontWeight: 800, color: "var(--green-mid)" }}>₪ {fmt(derivedAmount)}</span>
            </div>
          )}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, direction: "rtl" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr style={{ background: "var(--surface2)", borderBottom: "2px solid var(--border)" }}>
                  {["חודש", "יתרת ההלוואה", "קרן", "ריבית", "החזר חודשי"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.month} style={{ background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.025)", borderBottom: "1px solid var(--border)44" }}>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: "var(--text-dim)" }}>{r.month}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>₪ {fmtD(r.balance)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>₪ {fmtD(r.principal)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", color: "var(--red)" }}>₪ {fmtD(r.interest)}</td>
                    <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700 }}>₪ {fmtD(r.payment)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", background: "var(--surface2)" }}>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--text-dim)" }}>סיכום</td>
                  <td />
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>₪ {fmt(rows.reduce((s, r) => s + r.principal, 0))}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700, color: "var(--red)" }}>₪ {fmt(rows.reduce((s, r) => s + r.interest, 0))}</td>
                  <td style={{ padding: "10px 14px", fontWeight: 700 }}>₪ {fmt(rows.reduce((s, r) => s + r.payment, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── GrowthTools wrapper ───────────────────────────────────────────────────────

export default function GrowthTools() {
  const [tool, setTool] = useState("calc");
  const tools = [
    { id:"calc", label:"🧮 מחשבון ריבית דה ריבית" },
    { id:"loan", label:"🏦 מחשבון הלוואות" },
  ];
  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:20, flexWrap:"wrap" }}>
        {tools.map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} style={{ padding:"8px 16px", fontSize:12, fontFamily:"inherit", fontWeight:tool===t.id?700:400, color:tool===t.id?"var(--text)":"var(--text-dim)", background:tool===t.id?"var(--surface2)":"transparent", border:`1px solid ${tool===t.id?"var(--border)":"transparent"}`, borderRadius:8, cursor:"pointer" }}>{t.label}</button>
        ))}
      </div>
      {tool === "calc" && <CompoundInterestCalc />}
      {tool === "loan" && <LoanCalc />}
    </div>
  );
}
