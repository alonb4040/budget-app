import React from "react";

export const LOAN_FLD_STYLE: React.CSSProperties = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"inherit", outline:"none" };

export default function LoanFieldForm({ cat, fields, onChange }) {
  const f = fields || {};
  const set = (k, v) => onChange(cat, k, v);
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
      {[["lender","שם המלווה"],["start_date","תאריך התחלה","date"],["end_date","תאריך סיום","date"],["amount","סכום ראשוני (₪)","number"],["monthly","החזר חודשי (₪)","number"]].map(([k,lbl,t]) => (
        <div key={k}>
          <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>{lbl}</div>
          <input type={t||"text"} value={f[k]||""} onChange={e=>set(k,e.target.value)} style={LOAN_FLD_STYLE} placeholder="..." />
        </div>
      ))}
      <div>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>ריבית</div>
        <div style={{ display:"flex", gap:14, marginTop:6 }}>
          {["כן","לא"].map(v => (
            <label key={v} style={{ display:"flex", gap:5, alignItems:"center", fontSize:13, cursor:"pointer" }}>
              <input type="radio" name={`int_${cat}`} checked={f.interest===v} onChange={()=>set("interest",v)} /> {v}
            </label>
          ))}
        </div>
      </div>
      <div style={{ gridColumn:"1/-1" }}>
        <div style={{ fontSize:11, color:"var(--text-dim)", marginBottom:3 }}>הערות</div>
        <textarea value={f.notes||""} onChange={e=>set("notes",e.target.value)} rows={2} style={{ ...LOAN_FLD_STYLE, resize:"vertical" }} placeholder="פרטים נוספים..." />
      </div>
    </div>
  );
}
