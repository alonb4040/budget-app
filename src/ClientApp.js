import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { CATEGORIES, parseExcelData } from "./data";
import { Card, Btn, Badge, Spinner, KpiCard, C } from "./ui";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const REQUIRED_MONTHS = 3;
const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

const EMAILJS_SERVICE_ID  = process.env.REACT_APP_EMAILJS_SERVICE_ID  || "";
const EMAILJS_TEMPLATE_ID = process.env.REACT_APP_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY  = process.env.REACT_APP_EMAILJS_PUBLIC_KEY  || "";

async function sendCompletionEmail(clientName) {
  if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID || !EMAILJS_PUBLIC_KEY) return;
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: "alon4040@gmail.com", client_name: clientName,
      message: `הלקוח ${clientName} סיים למלא את כל 3 החודשים הנדרשים במאזן החכם.`,
      date: new Date().toLocaleDateString("he-IL", { day:"numeric", month:"long", year:"numeric" }),
    }, EMAILJS_PUBLIC_KEY);
  } catch(e) { console.error("EmailJS:", e); }
}

function MonthPickerModal({ usedMonths, onConfirm, onCancel }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year,  setYear]  = useState(now.getFullYear());
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 2; y--) years.push(y);
  const key = `${year}-${String(month+1).padStart(2,"0")}`;
  const alreadyUsed = usedMonths.includes(key);
  return (
    <>
      <div onClick={onCancel} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9000 }} />
      <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:28, zIndex:9001, width:320, boxShadow:"0 20px 60px rgba(0,0,0,0.6)" }}>
        <div style={{ fontWeight:700, fontSize:16, marginBottom:20 }}>📅 בחר חודש ושנה</div>
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:12, color:C.dim, marginBottom:5, fontWeight:600 }}>חודש</div>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", color:"#e8eaf6", fontFamily:"'Heebo',sans-serif", fontSize:13, direction:"rtl" }}>
            {HEBREW_MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, color:C.dim, marginBottom:5, fontWeight:600 }}>שנה</div>
          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 12px", color:"#e8eaf6", fontFamily:"'Heebo',sans-serif", fontSize:13, direction:"rtl" }}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {alreadyUsed && <div style={{ background:"rgba(247,92,92,0.1)", border:"1px solid rgba(247,92,92,0.3)", borderRadius:8, padding:"8px 12px", fontSize:12, color:C.red, marginBottom:14 }}>⚠️ כבר העלית קובץ עבור {HEBREW_MONTHS[month]} {year}</div>}
        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={() => onConfirm(key, HEBREW_MONTHS[month], year)} disabled={alreadyUsed} style={{ flex:1, justifyContent:"center" }}>אישור ←</Btn>
          <Btn variant="ghost" onClick={onCancel}>ביטול</Btn>
        </div>
      </div>
    </>
  );
}

function OnboardingProgress({ current, total }) {
  return (
    <div style={{ background:C.surface2, borderRadius:12, padding:"16px 20px", marginBottom:20, border:`1px solid ${C.border}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div style={{ fontWeight:700, fontSize:14 }}>📋 השלמת נתונים ראשוניים</div>
        <div style={{ fontSize:13, color:C.dim }}>{current} / {total} חודשים</div>
      </div>
      <div style={{ background:C.surface, borderRadius:20, height:8, overflow:"hidden" }}>
        <div style={{ width:`${(current/total)*100}%`, height:"100%", background:`linear-gradient(90deg,${C.accent},${C.accent2})`, borderRadius:20, transition:"width .4s" }} />
      </div>
      <div style={{ fontSize:12, color:C.dim, marginTop:8 }}>
        {current < total ? `נשאר עוד ${total-current} חודש${total-current>1?"ים":""}` : "✅ כל החודשים הושלמו!"}
      </div>
    </div>
  );
}

export default function ClientApp({ session, onLogout }) {
  const [screen, setScreen] = useState("dashboard");
  const [submissions, setSubmissions] = useState([]);
  const [rememberedMappings, setRememberedMappings] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [catPanelOpen, setCatPanelOpen] = useState(false);
  const [activeTxId, setActiveTxId] = useState(null);
  const [catSearch, setCatSearch] = useState("");
  const [pendingRemember, setPendingRemember] = useState(null);
  const [toast, setToast] = useState("");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [selectedMonthLabel, setSelectedMonthLabel] = useState("");
  const fileInputRef = useRef();

  useEffect(() => { loadUserData(); }, []);

  const loadUserData = async () => {
    setLoadingData(true);
    const [{ data: subs }, { data: maps }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", session.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", session.id)
    ]);
    setSubmissions(subs || []);
    const mappingObj = {};
    (maps || []).forEach(m => { mappingObj[m.business_name] = m.category; });
    setRememberedMappings(mappingObj);
    setLoadingData(false);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3500); };
  const usedMonthKeys = submissions.map(s => s.month_key).filter(Boolean);
  const isOnboarding = submissions.length < REQUIRED_MONTHS;

  const handleFiles = (files) => {
    const newFiles = Array.from(files).filter(f => !uploadedFiles.find(u => u.name === f.name));
    setUploadedFiles(p => [...p, ...newFiles]);
  };

  const openUpload = () => { setUploadedFiles([]); setTransactions([]); setSelectedMonthKey(null); setSelectedMonthLabel(""); setScreen("upload"); };

  const startAnalysis = () => setShowMonthPicker(true);

  const onMonthConfirmed = async (key, monthName, year) => {
    setShowMonthPicker(false);
    setSelectedMonthKey(key);
    setSelectedMonthLabel(`${monthName} ${year}`);
    setScreen("loading");
    try {
      const allTx = [];
      for (const file of uploadedFiles) {
        const buf = await file.arrayBuffer();
        const parsed = parseExcelData(buf, file.name, rememberedMappings);
        parsed.forEach(tx => { tx.id = allTx.length; allTx.push(tx); });
      }
      if (allTx.length === 0) { showToast("לא נמצאו עסקאות"); setScreen("upload"); return; }
      setTransactions(allTx);
      setTimeout(() => setScreen("review"), 1400);
    } catch (e) { showToast("שגיאה: " + e.message); setScreen("upload"); }
  };

  const applyCategory = (txId, newCat) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx || newCat === tx.cat) { setCatPanelOpen(false); return; }
    setTransactions(p => p.map(t => t.id === txId ? { ...t, cat: newCat, edited: newCat !== t.originalCat, conf: "high" } : t));
    setCatPanelOpen(false);
    setPendingRemember({ txId, bizName: tx.name, cat: newCat });
  };

  const confirmRemember = async () => {
    if (!pendingRemember) return;
    const { bizName, cat } = pendingRemember;
    await supabase.from("remembered_mappings").upsert({ client_id: session.id, business_name: bizName, category: cat }, { onConflict: "client_id,business_name" });
    setRememberedMappings(p => ({ ...p, [bizName]: cat }));
    let count = 0;
    setTransactions(p => p.map(t => { if (t.name===bizName && t.id!==pendingRemember.txId) { count++; return {...t, cat, edited: cat!==t.originalCat, conf:"high"}; } return t; }));
    showToast(`✅ נזכר! ${bizName} → ${cat}${count>0?` (${count+1} עסקאות)`:""}`);
    setPendingRemember(null);
  };

  const saveSubmission = async () => {
    const label = selectedMonthLabel || uploadedFiles.map(f => f.name.replace(/\.[^.]+$/,"")).join(" + ");
    const { error } = await supabase.from("submissions").insert([{ client_id: session.id, label, month_key: selectedMonthKey, files: uploadedFiles.map(f=>f.name), transactions, created_at: new Date().toISOString() }]);
    if (error) { showToast("שגיאת שמירה: " + error.message); return; }
    const newCount = submissions.length + 1;
    await loadUserData();
    if (newCount === REQUIRED_MONTHS) {
      await sendCompletionEmail(session.name);
      showToast("🎉 סיימת את כל 3 החודשים! נשלחה הודעה לכלכלן.");
    }
    setScreen("summary");
  };

  const filteredTx = transactions.filter(t => {
    if (filter==="low" && t.conf!=="low") return false;
    if (filter==="edited" && !t.edited) return false;
    if (search) { const s=search.toLowerCase(); if (!t.name.toLowerCase().includes(s) && !t.cat.toLowerCase().includes(s)) return false; }
    return true;
  });

  const chartData = [...submissions].reverse().slice(0,6).map(s => ({ name: s.label||"", הוצאות: Math.round((s.transactions||[]).reduce((sum,t)=>sum+t.amount,0)) }));

  const exportToExcel = () => {
    const XLSX = window.XLSX;
    if (!XLSX) { showToast("ספריית Excel לא נטענה"); return; }
    const txRows = transactions.map(t => ({ "תאריך": t.date, "שם בית עסק": t.name, "סעיף": t.cat, "סכום": t.amount, "מקור": t.source || "", "ביטחון": t.conf === "high" ? "גבוה" : t.conf === "med" ? "בינוני" : "נמוך" }));
    const catMap = {};
    transactions.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.amount; });
    const summaryRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({ "סעיף": cat, "סכום כולל": Math.round(amt), "מספר עסקאות": transactions.filter(t => t.cat === cat).length }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "עסקאות");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "סיכום לפי סעיף");
    XLSX.writeFile(wb, `מאזן_${selectedMonthLabel || "דוח"}.xlsx`);
  };

  const summaryGroups = () => {
    const result = {};
    Object.entries(CATEGORIES).forEach(([group,items]) => { items.forEach(item => { const txs=transactions.filter(t=>t.cat===item); if (!txs.length) return; if (!result[group]) result[group]={}; result[group][item]=txs; }); });
    return result;
  };

  if (loadingData) return <div style={{ background:C.bg, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ textAlign:"center" }}><Spinner /><div style={{ marginTop:16, color:C.dim }}>טוען...</div></div></div>;

  return (
    <div style={{ background:C.bg, minHeight:"100vh", color:"#e8eaf6", fontFamily:"'Heebo',sans-serif" }}>
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:8, background:`linear-gradient(135deg,${C.accent},${C.accent2})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>📊</div>
          <div><div style={{ fontWeight:700, fontSize:14 }}>מאזן חכם</div><div style={{ fontSize:11, color:C.dim }}>שלום, {session.name}</div></div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {screen!=="dashboard" && <Btn variant="ghost" size="sm" onClick={() => setScreen("dashboard")}>🏠 דשבורד</Btn>}
          <Btn variant="ghost" size="sm" onClick={onLogout}>יציאה</Btn>
        </div>
      </div>

      {screen==="dashboard" && (
        <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 20px" }}>
          {isOnboarding && <OnboardingProgress current={submissions.length} total={REQUIRED_MONTHS} />}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:12, marginBottom:24 }}>
            <KpiCard icon="📁" label="חודשים שהוגשו" value={`${submissions.length} / ${REQUIRED_MONTHS}`} />
            <KpiCard icon="🧠" label="מיפויים שנזכרו" value={Object.keys(rememberedMappings).length} />
            <KpiCard icon="💰" label="הוצאות אחרונות" value={submissions[0]?"₪"+Math.round((submissions[0].transactions||[]).reduce((s,t)=>s+t.amount,0)).toLocaleString():"—"} color={C.red} />
          </div>
          {chartData.length>1 && !isOnboarding && (
            <Card style={{ marginBottom:24 }}>
              <div style={{ fontWeight:700, marginBottom:16 }}>📈 הוצאות לאורך זמן</div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke={C.border} /><XAxis dataKey="name" tick={{ fill:C.dim, fontSize:11 }} /><YAxis tick={{ fill:C.dim, fontSize:11 }} /><Tooltip contentStyle={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, color:"#e8eaf6", fontFamily:"'Heebo'" }} /><Bar dataKey="הוצאות" fill={C.accent} radius={[4,4,0,0]} /></BarChart>
              </ResponsiveContainer>
            </Card>
          )}
          {submissions.length < REQUIRED_MONTHS ? (
            <Card style={{ marginBottom:24, border:`1px solid rgba(79,142,247,0.3)`, background:"rgba(79,142,247,0.05)" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>📂 העלה חודש {submissions.length+1} מתוך {REQUIRED_MONTHS}</div>
              <div style={{ fontSize:13, color:C.dim, marginBottom:16 }}>{submissions.length===0?"התחל בהעלאת קובץ האשראי עבור החודש הראשון":`כמעט סיימת! עוד ${REQUIRED_MONTHS-submissions.length} חודש${REQUIRED_MONTHS-submissions.length>1?"ים":""}`}</div>
              <Btn onClick={openUpload}>📂 העלה קובץ →</Btn>
            </Card>
          ) : (
            <Btn style={{ marginBottom:24 }} onClick={openUpload}>📂 העלה חודש נוסף</Btn>
          )}
          <div style={{ fontWeight:700, marginBottom:12 }}>היסטוריית הגשות</div>
          {submissions.length===0 ? (
            <Card style={{ textAlign:"center", padding:48, color:C.dim }}><div style={{ fontSize:36, marginBottom:12 }}>📂</div><div>התחל בהעלאת הקובץ הראשון</div></Card>
          ) : submissions.map(s => {
            const txs=s.transactions||[]; const total=txs.reduce((sum,t)=>sum+t.amount,0);
            const top3=Object.entries(txs.reduce((acc,t)=>{acc[t.cat]=(acc[t.cat]||0)+t.amount;return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,3);
            return (
              <Card key={s.id} style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:10 }}>
                  <div>
                    <div style={{ fontWeight:700 }}>{s.label}</div>
                    <div style={{ fontSize:12, color:C.dim }}>{new Date(s.created_at).toLocaleDateString("he-IL",{day:"numeric",month:"long",year:"numeric"})} · {txs.length} עסקאות</div>
                    <div style={{ display:"flex", gap:8, marginTop:8, flexWrap:"wrap" }}>
                      {top3.map(([cat,amt]) => <span key={cat} style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"3px 10px", fontSize:11 }}>{cat}: ₪{Math.round(amt).toLocaleString()}</span>)}
                    </div>
                  </div>
                  <div style={{ fontWeight:800, fontSize:20, color:C.red }}>₪{Math.round(total).toLocaleString()}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {screen==="upload" && (
        <div style={{ maxWidth:640, margin:"0 auto", padding:"28px 20px" }}>
          {isOnboarding && <OnboardingProgress current={submissions.length} total={REQUIRED_MONTHS} />}
          <Card style={{ marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>📁 העלאת קבצי עסקאות — חודש {submissions.length+1}</div>
            <div style={{ fontSize:13, color:C.dim, marginBottom:20 }}>אפשר להעלות כמה קבצים בו-זמנית — כרטיס אחד או יותר</div>
            <div onClick={() => fileInputRef.current?.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFiles(e.dataTransfer.files);}} style={{ border:`2px dashed ${C.border}`, borderRadius:12, padding:"40px 24px", textAlign:"center", cursor:"pointer", background:C.surface2 }}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display:"none" }} onChange={e=>handleFiles(e.target.files)} />
              <div style={{ fontSize:40, marginBottom:10 }}>📂</div>
              <div style={{ fontWeight:600, marginBottom:4 }}>גרור קבצים או לחץ לבחירה</div>
              <div style={{ fontSize:12, color:C.dim }}>מקס · ישראכרד · ויזה כ.א.ל</div>
            </div>
            <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:8 }}>
              {uploadedFiles.map(f => (
                <div key={f.name} style={{ background:"rgba(46,204,138,0.07)", border:"1px solid rgba(46,204,138,0.2)", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{ fontSize:20 }}>📄</span>
                  <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:13 }}>{f.name}</div><div style={{ fontSize:11, color:C.dim }}>{(f.size/1024).toFixed(0)} KB</div></div>
                  <button onClick={() => setUploadedFiles(p=>p.filter(u=>u.name!==f.name))} style={{ background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:18 }}>✕</button>
                </div>
              ))}
            </div>
          </Card>
          <div style={{ display:"flex", gap:10 }}>
            <Btn onClick={startAnalysis} disabled={uploadedFiles.length===0}>🔍 נתח עסקאות</Btn>
            <Btn variant="ghost" onClick={() => setScreen("dashboard")}>ביטול</Btn>
          </div>
        </div>
      )}

      {screen==="loading" && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:16 }}>
          <Spinner size={52} /><div style={{ fontSize:16, fontWeight:600 }}>מנתח עסקאות...</div><div style={{ fontSize:13, color:C.dim }}>מסווג כל עסקה לסעיף המתאים</div>
        </div>
      )}

      {screen==="review" && (
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"20px" }}>
          <Card style={{ marginBottom:14 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>✏️ עריכה ואישור — {selectedMonthLabel}</div>
            <div style={{ fontSize:12, color:C.dim }}>בדוק את הסיווג ותקן לפי הצורך</div>
          </Card>
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap", alignItems:"center" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔎 חיפוש..." style={{ background:C.surface2, border:`1px solid ${C.border}`, borderRadius:8, padding:"7px 12px", color:"#e8eaf6", fontFamily:"inherit", fontSize:12, direction:"rtl", width:180, outline:"none" }} />
            {[["all","הכל"],["low","⚠️ לבדיקה"],["edited","✏️ נערך"]].map(([f,label]) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontFamily:"inherit", cursor:"pointer", border:`1px solid ${filter===f?C.accent:C.border}`, background:filter===f?"rgba(79,142,247,0.12)":C.surface2, color:filter===f?C.accent:C.dim }}>{label}</button>
            ))}
            <span style={{ marginRight:"auto", fontSize:11, color:C.dim }}>{filteredTx.length} / {transactions.length}</span>
          </div>
          <Card style={{ padding:0, overflow:"hidden", marginBottom:16 }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr style={{ background:C.surface2 }}>{["תאריך","שם בית עסק","סכום","סעיף","ביטחון","מקור"].map(h=><th key={h} style={{ padding:"10px 14px", textAlign:"right", fontSize:11, fontWeight:600, color:C.dim, borderBottom:`1px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredTx.map(tx => (
                    <tr key={tx.id} style={{ background:tx.edited?"rgba(247,201,72,0.04)":"transparent" }}>
                      <td style={{ padding:"9px 14px", color:C.dim, whiteSpace:"nowrap", borderBottom:`1px solid ${C.border}22` }}>{tx.date}</td>
                      <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.border}22` }}><strong>{tx.name}</strong>{tx.maxCat&&<div style={{ fontSize:11, color:C.dim }}>{tx.maxCat}</div>}</td>
                      <td style={{ padding:"9px 14px", color:C.red, fontWeight:600, whiteSpace:"nowrap", borderBottom:`1px solid ${C.border}22` }}>₪{tx.amount.toLocaleString()}</td>
                      <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.border}22` }}>
                        <div onClick={() => { setActiveTxId(tx.id); setCatSearch(""); setCatPanelOpen(true); }} style={{ background:C.surface2, border:`1px solid ${tx.edited?C.yellow:C.border}`, borderRadius:8, padding:"6px 10px", cursor:"pointer", fontSize:12, display:"flex", justifyContent:"space-between", alignItems:"center", gap:6, minWidth:180, maxWidth:220 }}>
                          <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tx.cat}</span><span style={{ color:C.dim, fontSize:10 }}>▼</span>
                        </div>
                      </td>
                      <td style={{ padding:"9px 14px", borderBottom:`1px solid ${C.border}22` }}><Badge conf={tx.conf} /></td>
                      <td style={{ padding:"9px 14px", fontSize:11, color:C.dim, maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderBottom:`1px solid ${C.border}22` }}>{tx.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12 }}>
            <div style={{ fontSize:13, color:C.dim }}>{transactions.length} עסקאות · סה"כ: <strong style={{ color:C.red }}>₪{transactions.reduce((s,t)=>s+t.amount,0).toLocaleString()}</strong></div>
            <div style={{ display:"flex", gap:10 }}><Btn variant="ghost" onClick={() => setScreen("upload")}>← חזור</Btn><Btn onClick={saveSubmission}>💾 שמור והפק מאזן ←</Btn></div>
          </div>
        </div>
      )}

      {screen==="summary" && (
        <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 20px" }}>
          <Card style={{ marginBottom:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:16 }}>📋 סיכום מאזן — {selectedMonthLabel}</div>
              <Btn variant="ghost" size="sm" onClick={exportToExcel}>⬇️ ייצוא לאקסל</Btn>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:12 }}>
              {[{l:'סה"כ הוצאות',v:"₪"+transactions.reduce((s,t)=>s+t.amount,0).toLocaleString(),c:C.red},{l:"עסקאות",v:transactions.length},{l:"קטגוריות",v:new Set(transactions.map(t=>t.cat)).size},{l:"לבדיקה",v:transactions.filter(t=>t.conf==="low"&&!t.edited).length,c:C.yellow}].map(k=>(
                <div key={k.l} style={{ background:C.surface2, borderRadius:10, padding:"14px 16px" }}><div style={{ fontSize:11, color:C.dim, marginBottom:4 }}>{k.l}</div><div style={{ fontSize:20, fontWeight:800, color:k.c }}>{k.v}</div></div>
              ))}
            </div>
          </Card>
          {submissions.length < REQUIRED_MONTHS && (
            <Card style={{ marginBottom:20, border:`1px solid rgba(79,142,247,0.3)`, background:"rgba(79,142,247,0.05)" }}>
              <div style={{ fontWeight:700, marginBottom:8 }}>✅ חודש {submissions.length} נשמר!</div>
              <div style={{ fontSize:13, color:C.dim, marginBottom:14 }}>נשאר עוד {REQUIRED_MONTHS-submissions.length} חודש{REQUIRED_MONTHS-submissions.length>1?"ים":""}</div>
              <Btn onClick={openUpload}>📂 העלה חודש {submissions.length+1} →</Btn>
            </Card>
          )}
          {submissions.length >= REQUIRED_MONTHS && (
            <Card style={{ marginBottom:20, border:`1px solid rgba(46,204,138,0.3)`, background:"rgba(46,204,138,0.05)" }}>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>🎉 סיימת את כל {REQUIRED_MONTHS} החודשים!</div>
              <div style={{ fontSize:13, color:C.dim }}>הכלכלן קיבל הודעה ויצור איתך קשר בקרוב.</div>
            </Card>
          )}
          {Object.entries(summaryGroups()).map(([group,items]) => {
            const total=Object.values(items).flat().reduce((s,t)=>s+t.amount,0);
            return (
              <Card key={group} style={{ marginBottom:12, padding:0, overflow:"hidden" }}>
                <div style={{ padding:"12px 16px", background:C.surface2, display:"flex", justifyContent:"space-between", fontWeight:700, fontSize:13 }}><span>{group}</span><span style={{ color:C.red }}>₪{Math.round(total).toLocaleString()}</span></div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}><tbody>
                  {Object.entries(items).map(([cat,txs]) => (
                    <tr key={cat}><td style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}22` }}>{cat}</td><td style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}22`, color:C.red, fontWeight:600 }}>₪{Math.round(txs.reduce((s,t)=>s+t.amount,0)).toLocaleString()}</td><td style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}22`, color:C.dim }}>{txs.length} עסקאות</td><td style={{ padding:"8px 16px", borderBottom:`1px solid ${C.border}22`, color:C.dim, fontSize:11 }}>{[...new Set(txs.map(t=>t.name))].slice(0,2).join("، ")}</td></tr>
                  ))}
                </tbody></table>
              </Card>
            );
          })}
          <Btn onClick={() => setScreen("dashboard")} style={{ marginTop:8 }}>← חזור לדשבורד</Btn>
        </div>
      )}

      {showMonthPicker && <MonthPickerModal usedMonths={usedMonthKeys} onConfirm={onMonthConfirmed} onCancel={() => setShowMonthPicker(false)} />}

      {catPanelOpen && (
        <>
          <div onClick={() => setCatPanelOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9998 }} />
          <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:320, background:C.surface, border:`1px solid ${C.border}`, borderRadius:"14px 14px 0 0", boxShadow:"0 -8px 40px rgba(0,0,0,0.6)", zIndex:9999, display:"flex", flexDirection:"column", maxHeight:420 }}>
            <div style={{ padding:"12px 14px 6px", borderBottom:`1px solid ${C.border}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
              <span style={{ fontWeight:700, fontSize:13 }}>בחר סעיף</span>
              <button onClick={() => setCatPanelOpen(false)} style={{ background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <div style={{ padding:"8px 10px 4px", flexShrink:0 }}>
              <input autoFocus value={catSearch} onChange={e=>setCatSearch(e.target.value)} placeholder="🔎 חפש סעיף..." style={{ width:"100%", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:7, padding:"7px 10px", color:"#e8eaf6", fontFamily:"inherit", fontSize:12, direction:"rtl", boxSizing:"border-box", outline:"none" }} />
            </div>
            <div style={{ overflowY:"auto", flex:1 }}>
              {Object.entries(CATEGORIES).map(([group,items]) => {
                const q=catSearch.toLowerCase(); const matched=items.filter(item=>!q||item.toLowerCase().includes(q)||group.toLowerCase().includes(q)); if (!matched.length) return null;
                const currentCat=transactions.find(t=>t.id===activeTxId)?.cat;
                return (<div key={group}><div style={{ padding:"5px 12px 2px", fontSize:10, fontWeight:700, color:C.dim, letterSpacing:"0.5px" }}>{group}</div>{matched.map(item=>(<div key={item} onMouseDown={e=>{e.preventDefault();applyCategory(activeTxId,item);}} style={{ padding:"8px 14px", fontSize:12, cursor:"pointer", color:item===currentCat?C.green:"#e8eaf6", fontWeight:item===currentCat?700:400 }} onMouseEnter={e=>e.currentTarget.style.background="rgba(79,142,247,0.1)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{item===currentCat?"✓ ":""}{item}</div>))}</div>);
              })}
            </div>
          </div>
        </>
      )}

      {pendingRemember && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:9996 }} onClick={() => setPendingRemember(null)} />
          <div style={{ position:"fixed", bottom:80, left:"50%", transform:"translateX(-50%)", background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:"14px 18px", boxShadow:"0 8px 32px rgba(0,0,0,0.5)", zIndex:9997, maxWidth:380, width:"90%" }}>
            <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>💾 לזכור לפעם הבאה?</div>
            <div style={{ fontSize:12, color:C.dim, marginBottom:12 }}>לשייך <strong style={{ color:"#e8eaf6" }}>{pendingRemember.bizName}</strong> תמיד לסעיף <strong style={{ color:C.accent }}>{pendingRemember.cat}</strong>?</div>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}><Btn variant="ghost" size="sm" onClick={() => setPendingRemember(null)}>לא תודה</Btn><Btn size="sm" onClick={confirmRemember}>כן, זכור 👍</Btn></div>
          </div>
        </>
      )}

      {toast && <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:C.green, color:"#000", padding:"9px 20px", borderRadius:20, fontSize:13, fontWeight:600, zIndex:99999, whiteSpace:"nowrap" }}>{toast}</div>}
    </div>
  );
}
