import { useState } from "react";
import { HEBREW_MONTHS } from "../data";
import { Btn, CustomSelect } from "../ui";

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
      <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:"var(--z-back)" }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:`1px solid ${"var(--border)"}`, borderRadius:16, padding:28, zIndex:"var(--z-modal)", width:320, boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontWeight:700, fontSize: 18, marginBottom:20, display:"flex", alignItems:"center", gap:8 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>הוסף חודש</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize: 14, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>חודש</div>
          <CustomSelect
            value={month}
            onChange={v => setMonth(Number(v))}
            options={HEBREW_MONTHS.map((m, i) => ({ value: i, label: m }))}
            dropdownZIndex={9010}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize: 14, color:"var(--text-dim)", marginBottom:5, fontWeight:600 }}>שנה</div>
          <CustomSelect
            value={year}
            onChange={v => setYear(Number(v))}
            options={years.map(y => ({ value: y, label: String(y) }))}
            dropdownZIndex={9010}
            style={{ width: "100%" }}
          />
        </div>
        {alreadyUsed && <div style={{ background:"rgba(255,183,77,0.1)", border:"1px solid rgba(255,183,77,0.3)", borderRadius:8, padding:"8px 12px", fontSize: 14, color:"var(--gold)", marginBottom:14, display:"flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>חודש זה כבר קיים — לחץ עליו ברשימה</div>}
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={() => onConfirm(key, HEBREW_MONTHS[month], year)} disabled={alreadyUsed} style={{ flex:1, justifyContent:"center" }}>בחר ←</Btn>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
        </div>
      </div>
    </>
  );
}
