import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { HEBREW_MONTHS } from "../data";
import { Btn } from "../ui";
import LoanFieldForm from "./LoanFieldForm";

// type: "file" = קובץ בלבד | "fields" = שדות בלבד | "both" = שדות + קובץ אופציונלי
export const LOAN_TYPES = [
  { id:"loan_bank",     label:"הלוואת בנק",          icon:"🏦", type:"file",   fileLabel:"פרטי הלוואה מהבנק" },
  { id:"loan_car",      label:"הלוואת רכב",           icon:"🚗", type:"file",   fileLabel:"לוח סילוקין" },
  { id:"loan_mortgage", label:"משכנתה",               icon:"🏠", type:"file",   fileLabel:"דוח יתרות משכנתה" },
  { id:"loan_work",     label:"הלוואת עבודה",         icon:"💼", type:"fields" },
  { id:"loan_family",   label:"הלוואה מחבר/משפחה",   icon:"👥", type:"fields" },
  { id:"loan_other",    label:"הלוואה אחרת",          icon:"📄", type:"both" },
];

export function OnboardingProgress({ subsCount, payslipsCount, total }) {
  const done = subsCount >= total && payslipsCount >= total;
  const totalSteps = total * 2;
  const completedSteps = Math.min(subsCount, total) + Math.min(payslipsCount, total);
  return (
    <div style={{ background:"var(--surface2)", borderRadius:12, padding:"16px 20px", marginBottom:20, border:`1px solid ${"var(--border)"}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>📋 השלמת נתונים ראשוניים</div>
        <div style={{ fontSize:12, color:done?"var(--green-soft)":"var(--text-dim)" }}>{done?"✅ הכל הושלם!":`${completedSteps}/${totalSteps} שלבים`}</div>
      </div>
      <div style={{ background:"var(--surface)", borderRadius:20, height:8, overflow:"hidden" }}>
        <div style={{ width:`${(completedSteps/totalSteps)*100}%`, height:"100%", background:`linear-gradient(90deg,${"var(--green-mid)"},${"var(--green-soft)"})`, borderRadius:20, transition:"width .4s" }} />
      </div>
      <div style={{ display:"flex", gap:16, marginTop:10, fontSize:12 }}>
        <span style={{ color:subsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{subsCount>=total?"✓":"○"} בסיס חומרים לבניית התיק הכלכלי {subsCount}/{total}</span>
        <span style={{ color:payslipsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{payslipsCount>=total?"✓":"○"} תלושי משכורת {payslipsCount}/{total}</span>
      </div>
    </div>
  );
}

export default function OnboardingChecklist({ session, finalizedMonths, payslips, docs, submittedAt, requiredDocs, questionnaireSpouses, onNavigateTxs, onNavigatePayslips, onNavigateQuestionnaire, onDocsChange, onMonthsChange, onSubmit }) {
  const [expanded, setExpanded]       = useState(null);
  const [activeLoanTypes, setActiveLoanTypes] = useState([]);
  const [showLoanPicker, setShowLoanPicker]   = useState(false);
  const [loanFields, setLoanFields]   = useState({});
  const [pendingFiles, setPendingFiles] = useState({});
  const [saving, setSaving]           = useState(null);
  const [submitting, setSubmitting]   = useState(false);
  const [questDoneMap, setQuestDoneMap] = useState({ 1: false, 2: false });
  const [editMonthEntry, setEditMonthEntry] = useState(null); // { id, month_key, label }
  const [editMonthVal, setEditMonthVal]     = useState({ month: 0, year: new Date().getFullYear() });
  const [editMonthErr, setEditMonthErr]     = useState("");
  const [editMonthSaving, setEditMonthSaving] = useState(false);
  const fileRefs                      = useRef({});

  // load questionnaire done status
  useEffect(() => {
    if (!requiredDocs || !requiredDocs.includes("questionnaire")) return;
    (async () => {
      const { data } = await supabase.from("client_questionnaire").select("spouse_index,done").eq("client_id", session.id);
      if (data) {
        const m = { 1: false, 2: false };
        data.forEach(r => { m[r.spouse_index] = r.done || false; });
        setQuestDoneMap(m);
      }
    })();
  }, [session.id, requiredDocs]);

  const txsDone      = finalizedMonths.length >= 3;
  const payslipsDone = payslips.length >= 3;

  const needsQuestionnaire = requiredDocs && requiredDocs.includes("questionnaire");
  const spousesCount       = questionnaireSpouses || 1;
  const questDone = !needsQuestionnaire || (questDoneMap[1] && (spousesCount < 2 || questDoneMap[2]));

  const getDoc    = cat => docs.find(d => d.category === cat);
  const isDone    = cat => !!getDoc(cat)?.marked_done;
  const hasFiles  = cat => (getDoc(cat)?.files || []).length > 0 || (pendingFiles[cat] || []).length > 0;

  const ALL_OPTIONAL = ["loans","provident","pl","savings","retirement","checks","debts_other"];
  const visibleOptional = requiredDocs ? ALL_OPTIONAL.filter(s => requiredDocs.includes(s)) : ALL_OPTIONAL;

  const optDoneMap = { loans: isDone("loans_section"), provident: isDone("provident_fund"), pl: isDone("profit_loss"), savings: isDone("savings_pension"), retirement: isDone("retirement_forecast"), checks: isDone("deferred_checks"), debts_other: isDone("debts_other") };
  const allOptDone    = visibleOptional.every(s => optDoneMap[s]);
  const requiredDone  = txsDone && payslipsDone && allOptDone && questDone;

  const REQUIRED_MONTHS = 3;
  const totalItems     = REQUIRED_MONTHS + REQUIRED_MONTHS + visibleOptional.length + (needsQuestionnaire ? 1 : 0);
  const completedItems = Math.min(finalizedMonths.length, REQUIRED_MONTHS)
    + Math.min(payslips.length, REQUIRED_MONTHS)
    + visibleOptional.filter(s => optDoneMap[s]).length
    + (needsQuestionnaire && questDone ? 1 : 0);
  const progressPct    = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  // init active loan types from existing docs
  useEffect(() => {
    const existing = docs.filter(d => d.category.startsWith("loan_") && d.category !== "loan_section").map(d => d.category);
    if (existing.length) setActiveLoanTypes(prev => [...new Set([...prev, ...existing])]);
  }, [docs]);

  // init loanFields from saved extra_data
  useEffect(() => {
    const fields = {};
    docs.forEach(d => { if (d.category.startsWith("loan_") && d.extra_data) fields[d.category] = d.extra_data; });
    if (Object.keys(fields).length) setLoanFields(fields);
  }, [docs]);

  const loansDone = isDone("loans_section");
  const loansHasAny = activeLoanTypes.length > 0;

  const toggle = id => setExpanded(e => e === id ? null : id);

  const openEditMonth = (entry) => {
    const [y, m] = (entry.month_key || "").split("-");
    setEditMonthVal({ month: parseInt(m || 1) - 1, year: parseInt(y || new Date().getFullYear()) });
    setEditMonthErr("");
    setEditMonthEntry(entry);
  };

  const saveEditMonth = async () => {
    const newKey = `${editMonthVal.year}-${String(editMonthVal.month + 1).padStart(2, "0")}`;
    const newLabel = `${HEBREW_MONTHS[editMonthVal.month]} ${editMonthVal.year}`;
    if (newKey === editMonthEntry.month_key) { setEditMonthEntry(null); return; }
    const alreadyUsed = finalizedMonths.some(m => m.month_key === newKey && m.id !== editMonthEntry.id);
    if (alreadyUsed) { setEditMonthErr("חודש זה כבר קיים — בחר חודש אחר"); return; }
    setEditMonthSaving(true);
    await supabase.from("month_entries").update({ month_key: newKey, label: newLabel }).eq("id", editMonthEntry.id);
    await supabase.from("submissions").update({ month_key: newKey }).eq("client_id", session.id).eq("month_key", editMonthEntry.month_key);
    setEditMonthEntry(null);
    setEditMonthSaving(false);
    if (onMonthsChange) await onMonthsChange();
  };

  const pickFile = (cat) => {
    if (!fileRefs.current[cat]) return;
    fileRefs.current[cat].value = "";
    fileRefs.current[cat].click();
  };

  const onFileChange = (cat, e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPendingFiles(prev => ({ ...prev, [cat]: [...(prev[cat]||[]), ...files] }));
  };

  const uploadToStorage = async (file, cat) => {
    const path = `${session.id}/${cat}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("client-documents").upload(path, file, { upsert: false });
    if (error) { console.error("Storage upload error:", error); return { filename: file.name, size: file.size }; }
    return { filename: file.name, path, size: file.size };
  };

  const saveAndDone = async (cat, label) => {
    setSaving(cat);
    const existing = getDoc(cat);
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase.from("client_documents").update({ files: allFiles, marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label, files: allFiles, marked_done: true }]);
    }
    setPendingFiles(prev => { const n={...prev}; delete n[cat]; return n; });
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const saveLoanFiles = async (cat, label) => {
    setSaving(cat);
    const existing = getDoc(cat);
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase.from("client_documents").update({ files: allFiles }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label, files: allFiles, marked_done: false }]);
    }
    setPendingFiles(prev => { const n={...prev}; delete n[cat]; return n; });
    await onDocsChange();
    setSaving(null);
  };

  const saveLoanFields = async (cat, label) => {
    setSaving(cat + "_f");
    const existing = getDoc(cat);
    const fields   = loanFields[cat] || {};
    const pending  = pendingFiles[cat] || [];
    const uploaded = await Promise.all(pending.map(f => uploadToStorage(f, cat)));
    const allFiles = [...(existing?.files || []), ...uploaded];
    if (existing) {
      await supabase.from("client_documents").update({ extra_data: fields, files: allFiles, marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category: cat, label, files: allFiles, extra_data: fields, marked_done: true }]);
    }
    setPendingFiles(prev => { const n={...prev}; delete n[cat]; return n; });
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const deleteFile = async (cat, idx) => {
    const existing = getDoc(cat);
    if (!existing) return;
    const file = existing.files[idx];
    if (file?.path) await supabase.storage.from("client-documents").remove([file.path]);
    const newFiles = existing.files.filter((_, i) => i !== idx);
    await supabase.from("client_documents").update({ files: newFiles }).eq("id", existing.id);
    await onDocsChange();
  };

  const markLoansDone = async () => {
    setSaving("loans_section");
    const existing = getDoc("loans_section");
    if (existing) {
      await supabase.from("client_documents").update({ marked_done: true }).eq("id", existing.id);
    } else {
      await supabase.from("client_documents").insert([{ client_id: session.id, category:"loans_section", label:"מסמכי הלוואות", files:[], marked_done: true }]);
    }
    setExpanded(null);
    await onDocsChange();
    setSaving(null);
  };

  const handleSubmit = async () => {
    if (!requiredDone || submitting) return;
    setSubmitting(true);
    await onSubmit();
    setSubmitting(false);
  };

  const SectionHeader = ({ id, icon, label, required = false, done, partial, onClick }) => (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background: done?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius: expanded===id?"10px 10px 0 0":10, border:`1px solid ${done?"rgba(46,204,138,0.3)":partial?"rgba(79,142,247,0.3)":"var(--border)"}`, cursor:"pointer", userSelect:"none" }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600, fontSize:14 }}>{label}</div>
        {required && <div style={{ fontSize:11, color:"var(--text-dim)" }}>חובה</div>}
      </div>
      {done && <span style={{ background:"rgba(46,204,138,0.15)", color:"#22c55e", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>✓ הושלם</span>}
      {!done && partial && <span style={{ background:"rgba(79,142,247,0.12)", color:"var(--green-mid)", borderRadius:20, padding:"3px 12px", fontSize:12 }}>בתהליך</span>}
      <span style={{ color:"var(--text-dim)", fontSize:14, marginRight:4 }}>{expanded===id?"▲":"▼"}</span>
    </div>
  );

  const DoneLine = ({ done }) => done ? <div style={{ height:3, background:"linear-gradient(90deg,#22c55e,rgba(46,204,138,0.2))", borderRadius:"0 0 6px 6px", marginBottom:2 }} /> : null;

  const openFile = async (path) => {
    if (!path) return;
    const { data } = await supabase.storage.from("client-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const FileList = ({ cat }) => {
    const saved = getDoc(cat)?.files || [];
    const pend  = pendingFiles[cat] || [];
    if (!saved.length && !pend.length) return null;
    return (
      <div style={{ marginTop:8, marginBottom:4 }}>
        {saved.map((f,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:"var(--text)", padding:"3px 0" }}>
            <span>📎 {f.filename}</span>
            {f.path && <button onClick={() => openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize:11, padding:"0 2px" }} title="צפה">👁</button>}
            <button onClick={() => deleteFile(cat, i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:11, padding:"0 2px" }} title="מחק">✕</button>
          </div>
        ))}
        {pend.map((f,i) => (
          <div key={i} style={{ fontSize:12, color:"var(--green-mid)", padding:"3px 0" }}>📎 {f.name} <span style={{ color:"var(--text-dim)" }}>(ממתין לשמירה)</span></div>
        ))}
      </div>
    );
  };

  const UploadArea = ({ cat }) => (
    <div>
      <input ref={el => fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e => onFileChange(cat, e)} />
      <FileList cat={cat} />
      <Btn size="sm" variant="secondary" onClick={() => pickFile(cat)} style={{ marginTop:6 }}>📎 הוסף קובץ</Btn>
    </div>
  );

  const fldStyle = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize:12, fontFamily:"inherit", outline:"none" };
  const bodyStyle = { border:"1px solid var(--border)", borderTop:"none", borderRadius:"0 0 10px 10px", padding:"16px 18px", background:"var(--surface)", marginBottom:2 };
  const descStyle = { fontSize:13, color:"var(--text)", opacity:0.8, marginBottom:12 };

  return (
    <div style={{ marginBottom:28 }}>
      {/* Edit month modal */}
      {editMonthEntry && (
        <>
          <div onClick={() => setEditMonthEntry(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:28, zIndex:9001, width:300, boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:16 }}>✏️ ערוך חודש</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:12, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>חודש</div>
              <select value={editMonthVal.month} onChange={e => { setEditMonthVal(p => ({...p, month: Number(e.target.value)})); setEditMonthErr(""); }} style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontFamily:"inherit", fontSize:13, direction:"rtl" }}>
                {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>שנה</div>
              <select value={editMonthVal.year} onChange={e => { setEditMonthVal(p => ({...p, year: Number(e.target.value)})); setEditMonthErr(""); }} style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"9px 12px", color:"var(--text)", fontFamily:"inherit", fontSize:13, direction:"rtl" }}>
                {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {editMonthErr && <div style={{ fontSize:12, color:"var(--red)", marginBottom:10 }}>⚠️ {editMonthErr}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={saveEditMonth} disabled={editMonthSaving} style={{ flex:1, justifyContent:"center" }}>{editMonthSaving ? "שומר..." : "שמור"}</Btn>
              <Btn variant="ghost" onClick={() => setEditMonthEntry(null)} style={{ flex:1, justifyContent:"center" }}>ביטול</Btn>
            </div>
          </div>
        </>
      )}

      {/* Progress bar */}
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"var(--text-dim)", marginBottom:6 }}>
          <span>התקדמות כללית</span>
          <span style={{ fontWeight:700, color: progressPct===100?"#22c55e":"var(--text-dim)" }}>{progressPct}%</span>
        </div>
        <div style={{ background:"var(--surface2)", borderRadius:20, height:10, overflow:"hidden" }}>
          <div style={{ width:`${progressPct}%`, height:"100%", background:"linear-gradient(90deg,var(--green-mid),var(--green-soft))", borderRadius:20, transition:"width .4s" }} />
        </div>
      </div>

      <div style={{ fontWeight:700, fontSize:16, marginBottom:16 }}>📋 מסמכים נדרשים</div>

      {/* 1. פירוט תנועות */}
      <div style={{ marginBottom:8 }}>
        <SectionHeader id="txs" icon="📂" label="פירוט תנועות — 3 חודשים" required done={txsDone} partial={finalizedMonths.length>0&&!txsDone} onClick={()=>toggle("txs")} />
        <DoneLine done={txsDone} />
        {expanded==="txs" && (
          <div style={bodyStyle}>
            {finalizedMonths.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:13, color:"var(--text)", padding:"3px 0" }}>
                <span>✓ {m.label}</span>
                <button onClick={() => openEditMonth(m)} style={{ background:"none", border:"none", color:"var(--text-mid)", cursor:"pointer", fontSize:12, padding:"2px 6px" }} title="ערוך שם חודש">✏️</button>
              </div>
            ))}
            <div style={{ ...descStyle, marginTop:6 }}>{txsDone ? "3 חודשי פירוט הושלמו ✓" : `הושלמו ${finalizedMonths.length} מתוך 3 חודשים`}</div>
            {!txsDone && <Btn size="sm" onClick={()=>{setExpanded(null);onNavigateTxs();}}>📂 הוסף חודש →</Btn>}
          </div>
        )}
      </div>

      {/* 2. תלושי שכר */}
      <div style={{ marginBottom:8 }}>
        <SectionHeader id="pays" icon="💼" label="תלושי שכר — 3 חודשים" required done={payslipsDone} partial={payslips.length>0&&!payslipsDone} onClick={()=>toggle("pays")} />
        <DoneLine done={payslipsDone} />
        {expanded==="pays" && (
          <div style={bodyStyle}>
            {payslips.map(p => <div key={p.id} style={{ fontSize:13, color:"var(--text)", padding:"3px 0" }}>✓ {p.month_label || p.label || new Date(p.created_at).toLocaleDateString("he-IL",{month:"long",year:"numeric"})}</div>)}
            <div style={{ ...descStyle, marginTop:6 }}>{payslipsDone ? "3 תלושים הועלו ✓" : `הועלו ${payslips.length} מתוך 3 תלושים`}</div>
            {!payslipsDone && <Btn size="sm" variant="secondary" onClick={()=>{setExpanded(null);onNavigatePayslips();}}>💼 העלה תלוש →</Btn>}
          </div>
        )}
      </div>

      {/* 3. הלוואות */}
      {visibleOptional.includes("loans") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="loans" icon="📋" label="מסמכי הלוואות" done={loansDone} partial={loansHasAny&&!loansDone} onClick={()=>toggle("loans")} />
          <DoneLine done={loansDone} />
          {expanded==="loans" && (
            <div style={bodyStyle}>
              {activeLoanTypes.map(cat => {
                const lt = LOAN_TYPES.find(l=>l.id===cat);
                if (!lt) return null;
                const isFields = lt.type==="fields";
                const isBoth   = lt.type==="both";
                const saved    = getDoc(cat)?.files || [];
                const pend     = pendingFiles[cat] || [];
                return (
                  <div key={cat} style={{ marginBottom:14, padding:"12px 14px", background:"var(--surface2)", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>{lt.icon} {lt.label}</div>
                    {lt.fileLabel && <div style={{ fontSize:12, color:"var(--text)", opacity:.7, marginBottom:8 }}>נדרש: {lt.fileLabel}</div>}
                    {(isFields||isBoth) && <LoanFieldForm cat={cat} fields={loanFields[cat]} onChange={(c,k,v) => setLoanFields(prev => ({ ...prev, [c]: { ...(prev[c]||{}), [k]:v } }))} />}
                    {!isFields && (
                      <>
                        <input ref={el=>fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e=>onFileChange(cat,e)} />
                        {[...saved.map((f,i)=>({...f,_i:i})), ...pend.map(f=>({filename:f.name,_pending:true}))].map((f,i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:f._pending?"var(--green-mid)":"var(--text)", padding:"2px 0" }}>
                            <span>📎 {f.filename}{f._pending&&" (ממתין)"}</span>
                            {!f._pending && f.path && <button onClick={()=>openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", fontSize:11 }}>👁</button>}
                            {!f._pending && <button onClick={()=>deleteFile(cat,f._i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize:11 }}>✕</button>}
                          </div>
                        ))}
                        <div style={{ display:"flex", gap:8, marginTop:8 }}>
                          <Btn size="sm" variant="secondary" onClick={()=>pickFile(cat)}>{isBoth?"📎 קובץ (לא חובה)":"📎 הוסף קובץ"}</Btn>
                          {pend.length>0 && <Btn size="sm" onClick={()=>saveLoanFiles(cat,lt.label)} disabled={saving===cat}>{saving===cat?"שומר...":"שמור"}</Btn>}
                        </div>
                      </>
                    )}
                    {(isFields||isBoth) && (
                      <Btn size="sm" onClick={()=>saveLoanFields(cat,lt.label)} disabled={saving===cat+"_f"} style={{ marginTop:4 }}>{saving===cat+"_f"?"שומר...":"✓ שמור"}</Btn>
                    )}
                  </div>
                );
              })}
              {!showLoanPicker
                ? <Btn size="sm" variant="secondary" onClick={()=>setShowLoanPicker(true)} style={{ marginBottom:14 }}>+ הוסף הלוואה</Btn>
                : <div style={{ marginBottom:14, padding:12, background:"var(--surface2)", borderRadius:8, border:"1px solid var(--border)" }}>
                    <div style={{ fontWeight:600, fontSize:13, marginBottom:10 }}>בחר סוג הלוואה:</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {LOAN_TYPES.filter(lt=>!activeLoanTypes.includes(lt.id)).map(lt => (
                        <button key={lt.id} onClick={()=>{setActiveLoanTypes(p=>[...p,lt.id]);setShowLoanPicker(false);}} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid var(--border)", background:"var(--surface)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{lt.icon} {lt.label}</button>
                      ))}
                    </div>
                    <button onClick={()=>setShowLoanPicker(false)} style={{ marginTop:10, fontSize:12, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer" }}>ביטול</button>
                  </div>
              }
              <Btn onClick={markLoansDone} disabled={!loansHasAny||saving==="loans_section"} style={{ width:"100%" }}>{saving==="loans_section"?"שומר...":"✓ סיימתי להוסיף הלוואות"}</Btn>
            </div>
          )}
        </div>
      )}

      {/* 4. קרן השתלמות */}
      {visibleOptional.includes("provident") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="provident" icon="💰" label="יתרת קרן השתלמות" done={isDone("provident_fund")} partial={hasFiles("provident_fund")&&!isDone("provident_fund")} onClick={()=>toggle("provident")} />
          <DoneLine done={isDone("provident_fund")} />
          {expanded==="provident" && <div style={bodyStyle}><div style={descStyle}>העלה דוח יתרה מחברת הביטוח / קרן הפנסיה</div><UploadArea cat="provident_fund" /><Btn onClick={()=>saveAndDone("provident_fund","קרן השתלמות")} disabled={!hasFiles("provident_fund")||saving==="provident_fund"} style={{ marginTop:14, width:"100%" }}>{saving==="provident_fund"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 5. דוח רווח והפסד */}
      {visibleOptional.includes("pl") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="pl" icon="📊" label="דוח רווח והפסד (לעצמאיים)" done={isDone("profit_loss")} partial={hasFiles("profit_loss")&&!isDone("profit_loss")} onClick={()=>toggle("pl")} />
          <DoneLine done={isDone("profit_loss")} />
          {expanded==="pl" && <div style={bodyStyle}><div style={descStyle}>רלוונטי לעצמאיים — העלה דוח רווח והפסד שנתי + מאזן בוחן של שנה קודמת</div><UploadArea cat="profit_loss" /><Btn onClick={()=>saveAndDone("profit_loss","דוח רווח והפסד")} disabled={!hasFiles("profit_loss")||saving==="profit_loss"} style={{ marginTop:14, width:"100%" }}>{saving==="profit_loss"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 6. חסכונות ופנסיה */}
      {visibleOptional.includes("savings") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="savings" icon="🏦" label="פירוט חסכונות ופנסיה" done={isDone("savings_pension")} partial={hasFiles("savings_pension")&&!isDone("savings_pension")} onClick={()=>toggle("savings")} />
          <DoneLine done={isDone("savings_pension")} />
          {expanded==="savings" && <div style={bodyStyle}><div style={descStyle}>כולל: פנסיה, קופות גמל, ביטוח מנהלים, חסכונות בנקאיים, השקעות. ציין גם מועדי נזילות.</div><UploadArea cat="savings_pension" /><Btn onClick={()=>saveAndDone("savings_pension","חסכונות ופנסיה")} disabled={!hasFiles("savings_pension")||saving==="savings_pension"} style={{ marginTop:14, width:"100%" }}>{saving==="savings_pension"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 7. תחזית פרישה */}
      {visibleOptional.includes("retirement") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="retirement" icon="👴" label="דוח תחזית פרישה (מעל גיל 55)" done={isDone("retirement_forecast")} partial={hasFiles("retirement_forecast")&&!isDone("retirement_forecast")} onClick={()=>toggle("retirement")} />
          <DoneLine done={isDone("retirement_forecast")} />
          {expanded==="retirement" && <div style={bodyStyle}><div style={descStyle}>רלוונטי למי שמעל גיל 55 — דוח תחזית פרישה מסוכן הביטוח</div><UploadArea cat="retirement_forecast" /><Btn onClick={()=>saveAndDone("retirement_forecast","דוח תחזית פרישה")} disabled={!hasFiles("retirement_forecast")||saving==="retirement_forecast"} style={{ marginTop:14, width:"100%" }}>{saving==="retirement_forecast"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 8. שיקים דחויים */}
      {visibleOptional.includes("checks") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="checks" icon="📄" label="שיקים דחויים" done={isDone("deferred_checks")} partial={hasFiles("deferred_checks")&&!isDone("deferred_checks")} onClick={()=>toggle("checks")} />
          <DoneLine done={isDone("deferred_checks")} />
          {expanded==="checks" && <div style={bodyStyle}><div style={descStyle}>שיקים דחויים שאינם חלק מהוצאה שוטפת</div><UploadArea cat="deferred_checks" /><Btn onClick={()=>saveAndDone("deferred_checks","שיקים דחויים")} disabled={!hasFiles("deferred_checks")||saving==="deferred_checks"} style={{ marginTop:14, width:"100%" }}>{saving==="deferred_checks"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 9. פיגורים וחובות */}
      {visibleOptional.includes("debts_other") && (
        <div style={{ marginBottom:8 }}>
          <SectionHeader id="debts_other" icon="⚠️" label="פיגורי תשלומים וחובות אחרים" done={isDone("debts_other")} partial={hasFiles("debts_other")&&!isDone("debts_other")} onClick={()=>toggle("debts_other")} />
          <DoneLine done={isDone("debts_other")} />
          {expanded==="debts_other" && <div style={bodyStyle}><div style={descStyle}>חובות לאנשים פרטיים, גמ"ח, מקום עבודה, פיגורים בתשלומים</div><UploadArea cat="debts_other" /><Btn onClick={()=>saveAndDone("debts_other","פיגורי תשלומים וחובות")} disabled={!hasFiles("debts_other")||saving==="debts_other"} style={{ marginTop:14, width:"100%" }}>{saving==="debts_other"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* שאלון אישי */}
      {needsQuestionnaire && (
        <div style={{ marginBottom:8 }}>
          <div onClick={onNavigateQuestionnaire} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 18px", background: questDone?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius:10, border:`1px solid ${questDone?"rgba(46,204,138,0.3)":"var(--border)"}`, cursor:"pointer", userSelect:"none" }}>
            <span style={{ fontSize:20 }}>📝</span>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:600, fontSize:14 }}>שאלון אישי</div>
              <div style={{ fontSize:11, color:"var(--text-dim)" }}>לחץ כדי למלא את השאלון</div>
            </div>
            {questDone
              ? <span style={{ background:"rgba(46,204,138,0.15)", color:"#22c55e", borderRadius:20, padding:"3px 12px", fontSize:12, fontWeight:700 }}>✓ הושלם</span>
              : <span style={{ color:"var(--text-dim)", fontSize:13 }}>←</span>
            }
          </div>
        </div>
      )}

      {/* הגשה */}
      <div style={{ marginTop:24, padding:"18px 20px", background:requiredDone?"rgba(46,204,138,0.06)":"var(--surface2)", borderRadius:12, border:`1px solid ${requiredDone?"rgba(46,204,138,0.3)":"var(--border)"}` }}>
        {!requiredDone && (
          <div style={{ fontSize:12, color:"var(--text-dim)", marginBottom:10, textAlign:"center", lineHeight:1.6 }}>
            להגשה יש להשלים קודם:
            {!txsDone && <span> · פירוט תנועות</span>}
            {!payslipsDone && <span> · תלושי שכר</span>}
            {!allOptDone && <span> · כל הסעיפים הנדרשים</span>}
            {!questDone && <span> · שאלון אישי</span>}
          </div>
        )}
        <Btn onClick={handleSubmit} disabled={!requiredDone||submitting} style={{ width:"100%", padding:"14px", fontSize:15, fontWeight:700, opacity:requiredDone?1:0.45 }}>{submitting?"מגיש...":"✅ הגש לאלון"}</Btn>
      </div>
    </div>
  );
}
