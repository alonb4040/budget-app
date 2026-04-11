import { useState } from "react";
import { HEBREW_MONTHS } from "../data";
import { Btn } from "../ui";

export default function MonthPickerModal({ usedMonths, onConfirm, onCancel }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear]   = useState(now.getFullYear());
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear()-2; y--) years.push(y);
  const key = `${year}-${String(month+1).padStart(2,"0")}`;
  const alreadyUsed = usedMonths.includes(key);
  return (
    <>
      <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:28, zIndex:9001, width:320, boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontWeight:700, fontSize: 18, marginBottom:20 }}>📅 הוסף חודש</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize: 14, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>חודש</div>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width:"100%", background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontFamily:"'Heebo',sans-serif", fontSize: 15, direction:"rtl" }}>
            {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize: 14, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>שנה</div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width:"100%", background:"var(--surface2)", border:`1px solid ${"var(--border)"}`, borderRadius:8, padding:"10px 12px", color:"var(--text)", fontFamily:"'Heebo',sans-serif", fontSize: 15, direction:"rtl" }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {alreadyUsed && <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid rgba(255,183,77,0.3)", borderRadius:8, padding:"8px 12px", fontSize: 14, color:"var(--gold)", marginBottom:14 }}>⚠️ חודש זה כבר קיים — לחץ עליו ברשימה</div>}
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={() => onConfirm(key, HEBREW_MONTHS[month], year)} disabled={alreadyUsed} style={{ flex:1, justifyContent:"center" }}>בחר ←</Btn>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
        </div>
      </div>
    </>
  );
}
