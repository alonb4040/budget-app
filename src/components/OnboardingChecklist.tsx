import { useState, useEffect, useRef } from "react";
import { supabase } from "../supabase";
import { HEBREW_MONTHS } from "../data";
import { Btn, CustomSelect } from "../ui";
import LoanFieldForm from "./LoanFieldForm";

// type: "file" = קובץ בלבד | "fields" = שדות בלבד | "both" = שדות + קובץ אופציונלי
export const LOAN_TYPES = [
  { id:"loan_bank",     label:"הלוואת בנק",          icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>, type:"file",   fileLabel:"פרטי הלוואה מהבנק" },
  { id:"loan_car",      label:"הלוואת רכב",           icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>, type:"file",   fileLabel:"לוח סילוקין" },
  { id:"loan_mortgage", label:"משכנתה",               icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, type:"file",   fileLabel:"דוח יתרות משכנתה" },
  { id:"loan_work",     label:"הלוואת עבודה",         icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>, type:"fields" },
  { id:"loan_family",   label:"הלוואה מחבר/משפחה",   icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, type:"fields" },
  { id:"loan_other",    label:"הלוואה אחרת",          icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, type:"both" },
];

export function OnboardingProgress({ subsCount, payslipsCount, total }) {
  const done = subsCount >= total && payslipsCount >= total;
  const totalSteps = total * 2;
  const completedSteps = Math.min(subsCount, total) + Math.min(payslipsCount, total);
  return (
    <div style={{ background:"var(--surface2)", borderRadius:12, padding:"16px 20px", marginBottom:20, border:`1px solid ${"var(--border)"}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontWeight:700, fontSize: 17, color:"var(--green-deep)" }}>השלמת נתונים ראשוניים</div>
        <div style={{ fontSize: 14, color:done?"var(--green-soft)":"var(--text-dim)" }}>{done ? "הכל הושלם!" : `${completedSteps}/${totalSteps} שלבים`}</div>
      </div>
      <div style={{ background:"var(--surface)", borderRadius:20, height:8, overflow:"hidden" }}>
        <div style={{ width:`${(completedSteps/totalSteps)*100}%`, height:"100%", background:`linear-gradient(90deg,${"var(--green-mid)"},${"var(--green-soft)"})`, borderRadius:20, transition:"width .4s" }} />
      </div>
      <div style={{ display:"flex", gap:16, marginTop:10, fontSize: 14 }}>
        <span style={{ color:subsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{subsCount>=total?"✓":"○"} בסיס חומרים לבניית התיק הכלכלי {subsCount}/{total}</span>
        <span style={{ color:payslipsCount>=total?"var(--green-soft)":"var(--text-dim)" }}>{payslipsCount>=total?"✓":"○"} תלושי משכורת {payslipsCount}/{total}</span>
      </div>
    </div>
  );
}

export default function OnboardingChecklist({ session, finalizedMonths, payslips, docs, submittedAt, requiredDocs, questionnaireSpouses, maxSessionActive, maxLastSync, onNavigateTxs, onNavigatePayslips, onNavigateQuestionnaire, onDocsChange, onMonthsChange, onSubmit }: { session: any; finalizedMonths: any[]; payslips: any[]; docs: any[]; submittedAt?: string; requiredDocs?: string[]; questionnaireSpouses?: number; maxSessionActive?: boolean; maxLastSync?: string | null; onNavigateTxs: () => void; onNavigatePayslips: () => void; onNavigateQuestionnaire: () => void; onDocsChange: () => void | Promise<void>; onMonthsChange: () => void | Promise<void>; onSubmit: () => Promise<void> }) {
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

  // ── visual helpers ────────────────────────────────────────────────────────
  const chipSt = (done: boolean) => ({
    fontSize:12.5, color: done?"var(--green-deep)":"var(--text-dim)",
    background: done?"var(--green-mint)":"var(--surface2)",
    border:`1px solid ${done?"var(--green-mint)":"var(--border)"}`,
    padding:"4px 9px", borderRadius:99, display:"inline-flex" as const, alignItems:"center", gap:5,
  });
  const dotSt = (done: boolean) => ({
    width:6, height:6, borderRadius:"50%" as const,
    background: done?"var(--green-mid)":"var(--text-dim)", opacity: done?1:0.5,
    flexShrink:0, display:"inline-block" as const,
  });
  const optLabels: Record<string,string> = { loans:"הלוואות", provident:"קרן השתלמות", pl:"רווח והפסד", savings:"חסכונות ופנסיה", retirement:"תחזית פרישה", checks:"שיקים דחויים", debts_other:"פיגורים וחובות" };

  const SectionHeader = ({ id, icon, label, required = false, progressText, done, partial, onClick }: { id:string; icon:any; label:string; required?:boolean; progressText?:string; done:boolean; partial:boolean; onClick:()=>void }) => {
    const isExp = expanded === id;
    const statusLabel = done ? "הושלם" : partial ? "בתהליך" : "להעלאה";
    const statusSt = done
      ? { color:"var(--green-deep)", background:"var(--green-mint)", border:"1px solid var(--green-mint)" }
      : partial
      ? { color:"var(--gold)", background:"var(--gold-light)", border:"1px solid var(--gold-light)" }
      : { color:"var(--text-dim)", background:"var(--surface2)", border:"1px solid var(--border)" };
    const sublabel = [required && "חובה", progressText].filter(Boolean).join(" • ");
    return (
      <div onClick={onClick}
        onMouseEnter={e => { if (!isExp) { const el = e.currentTarget as HTMLElement; el.style.boxShadow="0 4px 16px rgba(0,0,0,0.07)"; el.style.transform="translateY(-1px)"; el.style.borderColor="var(--green-mid)"; } }}
        onMouseLeave={e => { if (!isExp) { const el = e.currentTarget as HTMLElement; el.style.boxShadow="none"; el.style.transform="none"; el.style.borderColor=done?"var(--green-mint)":partial?"var(--gold-light)":"var(--border)"; } }}
        style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:"var(--surface)", border:`1px solid ${done?"var(--green-mint)":partial?"var(--gold-light)":"var(--border)"}`, borderRadius: isExp?"12px 12px 0 0":12, cursor:"pointer", userSelect:"none", transition:"box-shadow 0.18s, transform 0.18s, border-color 0.18s" }}>
        <div style={{ width:38, height:38, borderRadius:10, background:"var(--green-pale)", color:"var(--green-mid)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{icon}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15, fontWeight:600, color:"var(--text)" }}>{label}</div>
          {sublabel && <div style={{ fontSize:12.5, color:"var(--text-dim)", marginTop:3 }}>{sublabel}</div>}
        </div>
        <span style={{ fontSize:12, fontWeight:600, padding:"4px 10px", borderRadius:99, flexShrink:0, ...statusSt }}>{statusLabel}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color:"var(--text-dim)", flexShrink:0, transform:isExp?"rotate(180deg)":"rotate(0deg)", transition:"transform 0.15s" }}><polyline points="6 9 12 15 18 9"/></svg>
      </div>
    );
  };

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
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize: 14, color:"var(--text)", padding:"3px 0" }}>
            <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>{f.filename}</span>
            {f.path && <button onClick={() => openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", padding:"0 2px", display:"flex", alignItems:"center" }} title="צפה"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>}
            <button onClick={() => deleteFile(cat, i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", padding:"0 2px", display:"flex", alignItems:"center" }} title="מחק"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
        ))}
        {pend.map((f,i) => (
          <div key={i} style={{ fontSize: 14, color:"var(--green-mid)", padding:"3px 0", display:"flex", alignItems:"center", gap:4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>{f.name} <span style={{ color:"var(--text-dim)" }}>(ממתין לשמירה)</span></div>
        ))}
      </div>
    );
  };

  const UploadArea = ({ cat }) => (
    <div>
      <input ref={el => fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e => onFileChange(cat, e)} />
      <FileList cat={cat} />
      <Btn size="sm" variant="secondary" onClick={() => pickFile(cat)} style={{ marginTop:6, display:"inline-flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>הוסף קובץ</Btn>
    </div>
  );

  const fldStyle = { width:"100%", boxSizing:"border-box", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px 10px", color:"var(--text)", fontSize: 14, fontFamily:"inherit", outline:"none" };
  const bodyStyle = { border:"1px solid var(--border)", borderTop:"none", borderRadius:"0 0 12px 12px", padding:"16px 18px", background:"var(--surface)", marginBottom:2 };
  const descStyle = { fontSize: 15, color:"var(--text)", opacity:0.8, marginBottom:12 };

  return (
    <div style={{ marginBottom:28 }}>
      {/* Edit month modal */}
      {editMonthEntry && (
        <>
          <div onClick={() => setEditMonthEntry(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:"var(--z-back)" }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:"var(--surface)", border:"1px solid var(--border)", borderRadius:16, padding:28, zIndex:"var(--z-modal)", width:300, boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ fontWeight:700, fontSize: 17, marginBottom:16, display:"flex", alignItems:"center", gap:8 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>ערוך חודש</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize: 14, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>חודש</div>
              <CustomSelect
                value={editMonthVal.month}
                onChange={v => { setEditMonthVal(p => ({...p, month: Number(v)})); setEditMonthErr(""); }}
                options={HEBREW_MONTHS.map((m, i) => ({ value: i, label: m }))}
                dropdownZIndex={9010}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize: 14, color:"var(--text-mid)", marginBottom:5, fontWeight:600 }}>שנה</div>
              <CustomSelect
                value={editMonthVal.year}
                onChange={v => { setEditMonthVal(p => ({...p, year: Number(v)})); setEditMonthErr(""); }}
                options={[2023,2024,2025,2026,2027].map(y => ({ value: y, label: String(y) }))}
                dropdownZIndex={9010}
                style={{ width: "100%" }}
              />
            </div>
            {editMonthErr && <div style={{ fontSize: 14, color:"var(--red)", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>{editMonthErr}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <Btn onClick={saveEditMonth} disabled={editMonthSaving} style={{ flex:1, justifyContent:"center" }}>{editMonthSaving ? "שומר..." : "שמור"}</Btn>
              <Btn variant="ghost" onClick={() => setEditMonthEntry(null)} style={{ flex:1, justifyContent:"center" }}>ביטול</Btn>
            </div>
          </div>
        </>
      )}

      {/* Progress card */}
      <div style={{ marginBottom:20, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, padding:"16px 18px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:8 }}>
          <span style={{ fontSize:14, color:"var(--text-dim)" }}>התקדמות כללית</span>
          <span style={{ fontFamily:"'Frank Ruhl Libre', serif", fontSize:22, fontWeight:700, color:"var(--green-deep)", lineHeight:1 }}>{progressPct}%</span>
        </div>
        <div style={{ height:8, background:"var(--surface2)", borderRadius:99, overflow:"hidden", marginBottom:14 }}>
          <div style={{ width:`${progressPct}%`, height:"100%", background:"linear-gradient(90deg,var(--green-soft),var(--green-mid))", borderRadius:99, transition:"width .4s" }} />
        </div>
        <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6 }}>
          <span style={chipSt(txsDone)}><span style={dotSt(txsDone)} />תנועות</span>
          <span style={chipSt(payslipsDone)}><span style={dotSt(payslipsDone)} />תלושים</span>
          {visibleOptional.map(s => (
            <span key={s} style={chipSt(optDoneMap[s])}><span style={dotSt(optDoneMap[s])} />{optLabels[s]}</span>
          ))}
          {needsQuestionnaire && <span style={chipSt(questDone)}><span style={dotSt(questDone)} />שאלון</span>}
        </div>
      </div>

      {/* מסמכים נדרשים header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, paddingBottom:2 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color:"var(--green-mid)", flexShrink:0 }}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
        <span style={{ fontSize:15, fontWeight:600, color:"var(--text-mid)" }}>מסמכים נדרשים</span>
      </div>

      {/* 1. פירוט תנועות */}
      <div style={{ marginBottom: expanded==="txs" ? 0 : 10 }}>
        <SectionHeader id="txs"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
          label="פירוט תנועות — 3 חודשים" required progressText={`${finalizedMonths.length} מתוך 3 הועלו`} done={txsDone} partial={finalizedMonths.length>0&&!txsDone} onClick={()=>toggle("txs")} />
        {expanded==="txs" && (
          <div style={bodyStyle}>
            {finalizedMonths.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize: 15, color:"var(--text)", padding:"3px 0" }}>
                <span>✓ {m.label}</span>
                <button onClick={() => openEditMonth(m)} style={{ background:"none", border:"none", color:"var(--text-mid)", cursor:"pointer", padding:"2px 6px", display:"flex", alignItems:"center" }} title="ערוך שם חודש"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
              </div>
            ))}
            <div style={{ ...descStyle, marginTop:6 }}>{txsDone ? "3 חודשי פירוט הושלמו ✓" : `הושלמו ${finalizedMonths.length} מתוך 3 חודשים`}</div>
            {!txsDone && <Btn size="sm" onClick={()=>{setExpanded(null);onNavigateTxs();}} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>הוסף חודש ←</Btn>}
          </div>
        )}
      </div>

      {/* 2. תלושי שכר */}
      <div style={{ marginBottom: expanded==="pays" ? 0 : 10 }}>
        <SectionHeader id="pays"
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>}
          label="תלושי שכר — 3 חודשים" required progressText={`${payslips.length} מתוך 3 הועלו`} done={payslipsDone} partial={payslips.length>0&&!payslipsDone} onClick={()=>toggle("pays")} />
        {expanded==="pays" && (
          <div style={bodyStyle}>
            {payslips.map(p => <div key={p.id} style={{ fontSize: 15, color:"var(--text)", padding:"3px 0" }}>✓ {p.month_label || p.label || new Date(p.created_at).toLocaleDateString("he-IL",{month:"long",year:"numeric"})}</div>)}
            <div style={{ ...descStyle, marginTop:6 }}>{payslipsDone ? "3 תלושים הועלו ✓" : `הועלו ${payslips.length} מתוך 3 תלושים`}</div>
            {!payslipsDone && <Btn size="sm" variant="secondary" onClick={()=>{setExpanded(null);onNavigatePayslips();}} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>העלה תלוש ←</Btn>}
          </div>
        )}
      </div>

      {/* 3. הלוואות */}
      {visibleOptional.includes("loans") && (
        <div style={{ marginBottom: expanded==="loans" ? 0 : 10 }}>
          <SectionHeader id="loans"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>}
            label="מסמכי הלוואות" done={loansDone} partial={loansHasAny&&!loansDone} onClick={()=>toggle("loans")} />
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
                    <div style={{ fontWeight:600, fontSize: 15, marginBottom:8 }}>{lt.icon} {lt.label}</div>
                    {lt.fileLabel && <div style={{ fontSize: 14, color:"var(--text)", opacity:.7, marginBottom:8 }}>נדרש: {lt.fileLabel}</div>}
                    {(isFields||isBoth) && <LoanFieldForm cat={cat} fields={loanFields[cat]} onChange={(c,k,v) => setLoanFields(prev => ({ ...prev, [c]: { ...(prev[c]||{}), [k]:v } }))} />}
                    {!isFields && (
                      <>
                        <input ref={el=>fileRefs.current[cat]=el} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display:"none" }} onChange={e=>onFileChange(cat,e)} />
                        {[...saved.map((f,i)=>({...f,_i:i})), ...pend.map(f=>({filename:f.name,_pending:true}))].map((f,i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, fontSize: 14, color:f._pending?"var(--green-mid)":"var(--text)", padding:"2px 0" }}>
                            <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>{f.filename}{f._pending&&" (ממתין)"}</span>
                            {!f._pending && f.path && <button onClick={()=>openFile(f.path)} style={{ background:"none", border:"none", color:"var(--green-mid)", cursor:"pointer", display:"flex", alignItems:"center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>}
                            {!f._pending && <button onClick={()=>deleteFile(cat,f._i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", display:"flex", alignItems:"center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                          </div>
                        ))}
                        <div style={{ display:"flex", gap:8, marginTop:8 }}>
                          <Btn size="sm" variant="secondary" onClick={()=>pickFile(cat)} style={{ display:"inline-flex", alignItems:"center", gap:6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>{isBoth?"קובץ (לא חובה)":"הוסף קובץ"}</Btn>
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
                    <div style={{ fontWeight:600, fontSize: 15, marginBottom:10 }}>בחר סוג הלוואה:</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {LOAN_TYPES.filter(lt=>!activeLoanTypes.includes(lt.id)).map(lt => (
                        <button key={lt.id} onClick={()=>{setActiveLoanTypes(p=>[...p,lt.id]);setShowLoanPicker(false);}} style={{ padding:"6px 14px", borderRadius:20, border:"1px solid var(--border)", background:"var(--surface)", fontSize: 14, cursor:"pointer", fontFamily:"'Heebo',sans-serif", display:"inline-flex", alignItems:"center", gap:6 }}>{lt.icon} {lt.label}</button>
                      ))}
                    </div>
                    <Btn variant="ghost" size="sm" onClick={()=>setShowLoanPicker(false)} style={{ marginTop:10 }}>ביטול</Btn>
                  </div>
              }
              <Btn onClick={markLoansDone} disabled={!loansHasAny||saving==="loans_section"} style={{ width:"100%" }}>{saving==="loans_section"?"שומר...":"✓ סיימתי להוסיף הלוואות"}</Btn>
            </div>
          )}
        </div>
      )}

      {/* 4. קרן השתלמות */}
      {visibleOptional.includes("provident") && (
        <div style={{ marginBottom: expanded==="provident" ? 0 : 10 }}>
          <SectionHeader id="provident"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
            label="יתרת קרן השתלמות" done={isDone("provident_fund")} partial={hasFiles("provident_fund")&&!isDone("provident_fund")} onClick={()=>toggle("provident")} />
          {expanded==="provident" && <div style={bodyStyle}><div style={descStyle}>העלה דוח יתרה מחברת הביטוח / קרן הפנסיה</div><UploadArea cat="provident_fund" /><Btn onClick={()=>saveAndDone("provident_fund","קרן השתלמות")} disabled={!hasFiles("provident_fund")||saving==="provident_fund"} style={{ marginTop:14, width:"100%" }}>{saving==="provident_fund"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 5. דוח רווח והפסד */}
      {visibleOptional.includes("pl") && (
        <div style={{ marginBottom: expanded==="pl" ? 0 : 10 }}>
          <SectionHeader id="pl"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>}
            label="דוח רווח והפסד (לעצמאיים)" done={isDone("profit_loss")} partial={hasFiles("profit_loss")&&!isDone("profit_loss")} onClick={()=>toggle("pl")} />
          {expanded==="pl" && <div style={bodyStyle}><div style={descStyle}>רלוונטי לעצמאיים — העלה דוח רווח והפסד שנתי + מאזן בוחן של שנה קודמת</div><UploadArea cat="profit_loss" /><Btn onClick={()=>saveAndDone("profit_loss","דוח רווח והפסד")} disabled={!hasFiles("profit_loss")||saving==="profit_loss"} style={{ marginTop:14, width:"100%" }}>{saving==="profit_loss"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 6. חסכונות ופנסיה */}
      {visibleOptional.includes("savings") && (
        <div style={{ marginBottom: expanded==="savings" ? 0 : 10 }}>
          <SectionHeader id="savings"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>}
            label="פירוט חסכונות ופנסיה" done={isDone("savings_pension")} partial={hasFiles("savings_pension")&&!isDone("savings_pension")} onClick={()=>toggle("savings")} />
          {expanded==="savings" && <div style={bodyStyle}><div style={descStyle}>כולל: פנסיה, קופות גמל, ביטוח מנהלים, חסכונות בנקאיים, השקעות. ציין גם מועדי נזילות.</div><UploadArea cat="savings_pension" /><Btn onClick={()=>saveAndDone("savings_pension","חסכונות ופנסיה")} disabled={!hasFiles("savings_pension")||saving==="savings_pension"} style={{ marginTop:14, width:"100%" }}>{saving==="savings_pension"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 7. תחזית פרישה */}
      {visibleOptional.includes("retirement") && (
        <div style={{ marginBottom: expanded==="retirement" ? 0 : 10 }}>
          <SectionHeader id="retirement"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            label="דוח תחזית פרישה (מעל גיל 55)" done={isDone("retirement_forecast")} partial={hasFiles("retirement_forecast")&&!isDone("retirement_forecast")} onClick={()=>toggle("retirement")} />
          {expanded==="retirement" && <div style={bodyStyle}><div style={descStyle}>רלוונטי למי שמעל גיל 55 — דוח תחזית פרישה מסוכן הביטוח</div><UploadArea cat="retirement_forecast" /><Btn onClick={()=>saveAndDone("retirement_forecast","דוח תחזית פרישה")} disabled={!hasFiles("retirement_forecast")||saving==="retirement_forecast"} style={{ marginTop:14, width:"100%" }}>{saving==="retirement_forecast"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 8. שיקים דחויים */}
      {visibleOptional.includes("checks") && (
        <div style={{ marginBottom: expanded==="checks" ? 0 : 10 }}>
          <SectionHeader id="checks"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
            label="שיקים דחויים" done={isDone("deferred_checks")} partial={hasFiles("deferred_checks")&&!isDone("deferred_checks")} onClick={()=>toggle("checks")} />
          {expanded==="checks" && <div style={bodyStyle}><div style={descStyle}>שיקים דחויים שאינם חלק מהוצאה שוטפת</div><UploadArea cat="deferred_checks" /><Btn onClick={()=>saveAndDone("deferred_checks","שיקים דחויים")} disabled={!hasFiles("deferred_checks")||saving==="deferred_checks"} style={{ marginTop:14, width:"100%" }}>{saving==="deferred_checks"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* 9. פיגורים וחובות */}
      {visibleOptional.includes("debts_other") && (
        <div style={{ marginBottom: expanded==="debts_other" ? 0 : 10 }}>
          <SectionHeader id="debts_other"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
            label="פיגורי תשלומים וחובות אחרים" done={isDone("debts_other")} partial={hasFiles("debts_other")&&!isDone("debts_other")} onClick={()=>toggle("debts_other")} />
          {expanded==="debts_other" && <div style={bodyStyle}><div style={descStyle}>חובות לאנשים פרטיים, גמ"ח, מקום עבודה, פיגורים בתשלומים</div><UploadArea cat="debts_other" /><Btn onClick={()=>saveAndDone("debts_other","פיגורי תשלומים וחובות")} disabled={!hasFiles("debts_other")||saving==="debts_other"} style={{ marginTop:14, width:"100%" }}>{saving==="debts_other"?"שומר...":"✓ סיימתי"}</Btn></div>}
        </div>
      )}

      {/* שאלון אישי */}
      {needsQuestionnaire && (
        <div style={{ marginBottom:10 }}>
          <div onClick={onNavigateQuestionnaire}
            onMouseEnter={e => { const el=e.currentTarget as HTMLElement; el.style.boxShadow="0 4px 16px rgba(0,0,0,0.07)"; el.style.transform="translateY(-1px)"; el.style.borderColor="var(--green-mid)"; }}
            onMouseLeave={e => { const el=e.currentTarget as HTMLElement; el.style.boxShadow="none"; el.style.transform="none"; el.style.borderColor=questDone?"var(--green-mint)":"var(--border)"; }}
            style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:"var(--surface)", border:`1px solid ${questDone?"var(--green-mint)":"var(--border)"}`, borderRadius:12, cursor:"pointer", userSelect:"none" as const, transition:"box-shadow 0.18s, transform 0.18s, border-color 0.18s" }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"var(--green-pale)", color:"var(--green-mid)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:600, color:"var(--text)" }}>שאלון אישי</div>
              <div style={{ fontSize:12.5, color:"var(--text-dim)", marginTop:3 }}>לחץ כדי למלא את השאלון</div>
            </div>
            <span style={{ fontSize:12, fontWeight:600, padding:"4px 10px", borderRadius:99, flexShrink:0, ...(questDone ? { color:"var(--green-deep)", background:"var(--green-mint)", border:"1px solid var(--green-mint)" } : { color:"var(--text-dim)", background:"var(--surface2)", border:"1px solid var(--border)" }) }}>{questDone?"הושלם":"להשלמה"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color:"var(--text-dim)", flexShrink:0 }}><polyline points="15 18 9 12 15 6"/></svg>
          </div>
        </div>
      )}

      {/* MAX Extension */}
      <div style={{ marginBottom:10 }}>
        <div
          onMouseEnter={e => { const el=e.currentTarget as HTMLElement; el.style.boxShadow="0 4px 16px rgba(0,0,0,0.07)"; el.style.transform="translateY(-1px)"; el.style.borderColor="var(--green-mid)"; }}
          onMouseLeave={e => { const el=e.currentTarget as HTMLElement; el.style.boxShadow="none"; el.style.transform="none"; el.style.borderColor=maxLastSync?"var(--green-mint)":"var(--border)"; }}
          style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", background:"var(--surface)", border:`1px solid ${maxLastSync?"var(--green-mint)":"var(--border)"}`, borderRadius:12, transition:"box-shadow 0.18s, transform 0.18s, border-color 0.18s" }}>
          <div style={{ width:38, height:38, borderRadius:10, background:"var(--green-pale)", color:"var(--green-mid)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:600, color:"var(--text)" }}>תוסף MAX</div>
            <div style={{ fontSize:12.5, color:"var(--text-dim)", marginTop:3 }}>{maxLastSync ? `סנכרון אחרון: ${new Date(maxLastSync).toLocaleDateString('he-IL')}` : "אופציונלי — התקן את תוסף מאזן MAX"}</div>
          </div>
          <span style={{ fontSize:12, fontWeight:600, padding:"4px 10px", borderRadius:99, flexShrink:0, ...(maxLastSync ? { color:"var(--green-deep)", background:"var(--green-mint)", border:"1px solid var(--green-mint)" } : { color:"var(--text-dim)", background:"var(--surface2)", border:"1px solid var(--border)" }) }}>{maxLastSync?"פעיל":"אופציונלי"}</span>
        </div>
      </div>

      {/* הגשה */}
      <div style={{ marginTop:22, padding:"22px 20px", display:"flex", flexDirection:"column" as const, alignItems:"center", gap:12 }}>
        {!requiredDone && (
          <div style={{ fontSize:13.5, color:"var(--text-dim)", textAlign:"center" as const, lineHeight:1.6 }}>
            להגשה יש להשלים:
            {!txsDone && <span> · פירוט תנועות</span>}
            {!payslipsDone && <span> · תלושי שכר</span>}
            {!allOptDone && <span> · כל הסעיפים הנדרשים</span>}
            {!questDone && <span> · שאלון אישי</span>}
          </div>
        )}
        <Btn onClick={handleSubmit} disabled={!requiredDone||submitting} style={{ padding:"12px 32px", fontSize:16, fontWeight:700, opacity:requiredDone?1:0.45 }}>{submitting?"מגיש...":"הגש לאלון"}</Btn>
      </div>
    </div>
  );
}
