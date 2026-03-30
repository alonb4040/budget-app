import { useState, useEffect } from "react";
import ScenarioTab from "./ScenarioTab";
import { supabase } from "./supabase";
import { Card, Btn, Input, C } from "./ui";

const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function monthKeyToLabel(mk) {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${HEB_MONTHS[parseInt(m)-1]} ${y}`;
}

export default function AdminPanel({ onLogout }) {
  const [clients, setClients] = useState([]);
  const [view, setView] = useState("list"); // list | new | detail
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    try {
      const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
      setClients(data || []);
    } catch(err) {
      console.error("loadClients error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClients(); }, []);

  const createClient = async () => {
    if (!form.name || !form.username || !form.password) return;
    // 1. Insert the client row
    const { data: newClient, error } = await supabase
      .from("clients")
      .insert([{ ...form, created_at: new Date().toISOString() }])
      .select("id")
      .single();
    if (error) { setMsg("❌ " + (error.message.includes("unique") ? "שם משתמש תפוס" : error.message)); return; }

    // 2. Create Supabase Auth user and link auth_id via Edge Function
    const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
      body: { action: "create", username: form.username, password: form.password, clientId: (newClient as any).id },
    });
    if (fnErr || !authResult?.ok) {
      setMsg("⚠️ לקוח נוצר אך חשבון Auth נכשל: " + (authResult?.error || fnErr?.message || "שגיאה"));
    } else {
      setMsg("✅ לקוח נוצר בהצלחה");
    }
    setForm({ name: "", username: "", password: "" });
    loadClients();
    setView("list");
  };

  const deleteClient = async (id, name) => {
    if (!window.confirm(`למחוק את ${name}?`)) return;
    // Delete Supabase Auth user first (so DB cascade doesn't orphan auth.users)
    await supabase.functions.invoke("manage-auth", { body: { action: "delete", clientId: id } });
    await supabase.from("submissions").delete().eq("client_id", id);
    await supabase.from("remembered_mappings").delete().eq("client_id", id);
    await supabase.from("clients").delete().eq("id", id);
    loadClients();
  };

  const migrateAllClients = async () => {
    setMsg("⏳ מגיר לקוחות...");
    const { data, error } = await supabase.functions.invoke("manage-auth", { body: { action: "migrate_all" } });
    if (error || !data?.ok) { setMsg("❌ " + (data?.error || error?.message)); return; }
    setMsg(`✅ הגירה הושלמה — ${data.migrated} לקוחות עודכנו`);
    loadClients();
  };

  const openClient = async (client) => {
    const [{ data: subs }, { data: maps }, { data: freshClient }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id),
      supabase.from("clients").select("required_docs,questionnaire_spouses").eq("id", client.id).maybeSingle(),
    ]);
    setSelected({ ...client, required_docs: freshClient?.required_docs ?? client.required_docs, questionnaire_spouses: freshClient?.questionnaire_spouses ?? client.questionnaire_spouses, submissions: subs || [], mappings: maps || [] });
    setView("detail");
  };

  const openPortfolio = async (client) => {
    const [{ data: subs }, { data: maps }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id)
    ]);
    setSelected({ ...client, submissions: subs || [], mappings: maps || [], startTab: "portfolio" });
    setView("detail");
  };

  const completedClients = clients.filter(c => {
    // We'll check submission count in the detail view
    return true;
  });

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: "var(--text)" }}>
      {/* Header */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:38, height:38, background:"var(--green-mid)", borderRadius:10 }}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M6 24 L12 16 L18 20 L26 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 10 H26 V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <div style={{ fontFamily:"'Fraunces', serif", fontWeight:600, fontSize:18, color:"var(--green-deep)", lineHeight:1 }}>מאזן</div>
            <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:2 }}>פאנל ניהול — אלון</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "list" && <Btn variant="ghost" size="sm" onClick={() => { setView("list"); setMsg(""); setSelected(null); }}>← חזור</Btn>}
          <Btn variant="ghost" size="sm" onClick={onLogout}>יציאה</Btn>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>
        {msg && (
          <div style={{ background: msg.startsWith("✅") ? "rgba(46,204,138,0.1)" : "rgba(247,92,92,0.1)", border: `1px solid ${msg.startsWith("✅") ? "rgba(46,204,138,0.3)" : "rgba(247,92,92,0.3)"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: msg.startsWith("✅") ? "var(--green-soft)" : "var(--red)" }}>
            {msg}
          </div>
        )}

        {/* LIST */}
        {view === "list" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>לקוחות ({clients.length})</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="ghost" size="sm" onClick={migrateAllClients}>🔄 מגר Auth</Btn>
                <Btn size="sm" onClick={() => { setView("new"); setMsg(""); }}>+ לקוח חדש</Btn>
              </div>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>טוען...</div>
            ) : clients.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ color: "var(--text-dim)" }}>אין לקוחות עדיין</div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {clients.map(c => (
                  <ClientRow key={c.id} client={c} onOpen={openClient} onPortfolio={openPortfolio} onDelete={deleteClient} />
                ))}
              </div>
            )}
          </>
        )}

        {/* NEW CLIENT */}
        {view === "new" && (
          <Card style={{ maxWidth: 440 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>➕ לקוח חדש</div>
            <Input label="שם מלא" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ישראל ישראלי" />
            <Input label="שם משתמש" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, "").toLowerCase() }))} placeholder="israel123" />
            <Input label="סיסמה" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="לפחות 6 תווים" />
            {msg && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={createClient} disabled={!form.name || !form.username || form.password.length < 4}>צור לקוח</Btn>
              <Btn variant="ghost" onClick={() => setView("list")}>ביטול</Btn>
            </div>
          </Card>
        )}

        {/* CLIENT DETAIL */}
        {view === "detail" && selected && (
          <ClientDetail client={selected} onRefresh={() => openClient(selected)} />
        )}
      </div>
    </div>
  );
}

// ── Client row in list ────────────────────────────────────────────────────────
function ClientRow({ client, onOpen, onPortfolio, onDelete }) {
  const [subCount, setSubCount] = useState(null);
  const [portfolioOpen, setPortfolioOpen] = useState(false);

  useEffect(() => {
    supabase.from("submissions").select("id", { count: "exact" }).eq("client_id", client.id)
      .then(({ count }) => {
        setSubCount(count || 0);
        setPortfolioOpen(client.portfolio_open || false);
      });
  }, [client.id]);

  const REQUIRED = 3;
  const done = subCount >= REQUIRED;

  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", flexWrap: "wrap" }}>
      <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{client.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", display:"flex", flexWrap:"wrap", gap:"0 12px" }}>
          <span>@{client.username}</span>
          <span>הצטרף {new Date(client.created_at).toLocaleDateString("he-IL")}</span>
          {subCount !== null && (
            <span style={{ color: done ? "var(--green-soft)" : "var(--gold)" }}>
              {done ? "✅ 3/3 חודשים" : `⏳ ${subCount}/3 חודשים`}
            </span>
          )}
          {client.portfolio_open
            ? <span style={{ color: "var(--green-mid)" }}>📁 תיק פעיל</span>
            : done ? <span style={{ color: "var(--gold)" }}>ממתין לפתיחת תיק</span> : null
          }
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn variant="ghost" size="sm" onClick={() => onOpen(client)}>👁 פרטים</Btn>
        {done && !client.portfolio_open && (
          <Btn variant="success" size="sm" onClick={async () => {
            await supabase.from("clients").update({ portfolio_open: true }).eq("id", client.id);
            onOpen(client);
          }}>📁 פתח תיק כלכלי</Btn>
        )}
        {client.portfolio_open && (
          <Btn size="sm" onClick={() => onPortfolio(client)}>📁 תיק כלכלי</Btn>
        )}
        <Btn variant="danger" size="sm" onClick={() => onDelete(client.id, client.name)}>מחק</Btn>
      </div>
    </Card>
  );
}

// ── shared download helper ────────────────────────────────────────────────────
async function downloadStorageFile(path, filename) {
  const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) { alert("שגיאה ביצירת קישור הורדה"); return; }
  const a = document.createElement("a");
  a.href = data.signedUrl; a.download = filename; a.target = "_blank"; a.click();
}

// ── AllFilesSection — כל הקבצים עם בחירה מרובה ───────────────────────────────
function AllFilesSection({ clientId }) {
  const [docs, setDocs]       = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("client_documents").select("*").eq("client_id", clientId),
      supabase.from("payslips").select("*").eq("client_id", clientId).order("month_key", { ascending: false }),
    ]).then(([{ data: d }, { data: p }]) => {
      setDocs(d || []); setPayslips(p || []); setLoading(false);
    });
  }, [clientId]);

  // Build flat list of all downloadable items
  const items = [
    ...payslips.filter(p => p.path).map(p => ({
      key: `p_${p.id}`, label: `💼 ${monthKeyToLabel(p.month_key) || p.label || "תלוש"}`,
      sub: p.filename, path: p.path, filename: p.filename,
    })),
    ...docs.flatMap(doc =>
      (doc.files || []).filter(f => f.path).map((f, i) => ({
        key: `d_${doc.id}_${i}`, label: `📎 ${doc.label}`,
        sub: f.filename, path: f.path, filename: f.filename,
        extra: doc.extra_data,
      }))
    ),
  ];

  if (loading) return null;
  if (!items.length) return <div style={{ fontSize:13, color:"var(--text-dim)", marginBottom:16 }}>אין קבצים שהועלו עדיין</div>;

  const toggleItem = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => setSelected(selected.size === items.length ? new Set() : new Set(items.map(i => i.key)));

  const downloadSelected = async () => {
    const toDownload = items.filter(i => selected.has(i.key));
    if (!toDownload.length) return;
    setBulkLoading(true);
    for (const item of toDownload) {
      await downloadStorageFile(item.path, item.filename);
      await new Promise(r => setTimeout(r, 300));
    }
    setBulkLoading(false);
  };

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div style={{ fontWeight: 700 }}>📁 קבצים שהועלו</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={toggleAll} style={{ background:"none", border:"1px solid var(--border)", borderRadius:7, padding:"5px 12px", fontSize:12, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}>
            {selected.size === items.length ? "בטל הכל" : "בחר הכל"}
          </button>
          {selected.size > 0 && (
            <Btn size="sm" onClick={downloadSelected} disabled={bulkLoading}>
              {bulkLoading ? "מוריד..." : `⬇ הורד נבחרים (${selected.size})`}
            </Btn>
          )}
        </div>
      </div>
      {items.map(item => (
        <div key={item.key} onClick={() => toggleItem(item.key)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", marginBottom:6, background: selected.has(item.key) ? "rgba(46,183,124,0.06)" : "var(--surface2)", border:`1px solid ${selected.has(item.key) ? "rgba(46,183,124,0.3)" : "var(--border)"}`, borderRadius:10, cursor:"pointer" }}>
          <input type="checkbox" checked={selected.has(item.key)} onChange={() => {}} style={{ accentColor:"var(--green-mid)", width:16, height:16, flexShrink:0 }} />
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600 }}>{item.label}</div>
            <div style={{ fontSize:11, color:"var(--text-dim)" }}>{item.sub}</div>
          </div>
          <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); downloadStorageFile(item.path, item.filename); }}>⬇ הורד</Btn>
        </div>
      ))}
    </div>
  );
}

// ── Payslips section (stub — used only if no storage path) ────────────────────
function PayslipsSection({ clientId }) {
  const [payslips, setPayslips] = useState([]);
  useEffect(() => {
    supabase.from("payslips").select("*").eq("client_id", clientId).order("month_key", { ascending: false })
      .then(({ data }) => setPayslips((data || []).filter(p => !p.path))); // only show if no path (old records)
  }, [clientId]);
  if (!payslips.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color:"var(--text-mid)" }}>💼 תלושים ישנים (ללא קובץ)</div>
      {payslips.map(p => (
        <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px", background:"var(--surface2)", borderRadius:8, marginBottom:4, fontSize:12 }}>
          <span>{monthKeyToLabel(p.month_key) || p.label}</span>
          <span style={{ color:"var(--text-dim)" }}>📎 {p.filename} (אין קובץ)</span>
        </div>
      ))}
    </div>
  );
}

// ── Questionnaire viewer ─────────────────────────────────────────────────────
const QUESTIONNAIRE_QUESTIONS = [
  "ספר/י לי על עצמך — מה התפקיד שלך, מה המצב המשפחתי שלך, ואיפה אתה/את גר/ה?",
  "מה המטרה הכלכלית הכי חשובה לך בשנה הקרובה? ובעשר השנים הקרובות?",
  "מה הכי מדאיג אותך כלכלית בזמן הנוכחי?",
  "איך אתה/את מרגיש/ה לגבי מצבך הכלכלי הנוכחי — בסולם 1-10, ולמה?",
  "האם יש אירועים עתידיים שצפויים לשנות את ההוצאות שלך? (חתונה, ילד, רכישת דירה...)",
  "האם יש הלוואות, משכנתה, או חובות שמכבידים עליך?",
  "באיזה תחום אתה/את מרגיש/ה שהכי קשה לך לשלוט בהוצאות?",
  "מהי ההתנהלות הכלכלית שאתה/את הכי גאה/ה בה, ומהי ההתנהלות שאם היית חוזר/ת אחורה היית עושה אחרת?",
];

function QuestionnaireViewer({ clientId, spousesCount }) {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    supabase.from("client_questionnaire").select("*").eq("client_id", clientId)
      .then(({ data: rows }) => { setData(rows || []); setLoaded(true); });
  }, [clientId]);

  if (!loaded) return <div style={{ color: "var(--text-dim)", padding: 24 }}>טוען...</div>;
  if (!data.length) return <Card style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>הלקוח טרם מילא שאלון</Card>;

  const visibleSpouses = spousesCount >= 2 ? [1, 2] : [1];
  return (
    <div>
      {visibleSpouses.map(idx => {
        const row = data.find(r => r.spouse_index === idx);
        const answers = row?.answers || {};
        const done = row?.done || false;
        return (
          <div key={idx} style={{ marginBottom: 32 }}>
            {visibleSpouses.length > 1 && (
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                {idx === 1 ? "👤 בן/בת זוג ראשון/ה" : "👥 בן/בת זוג שני/ה"}
                {done && <span style={{ background: "rgba(46,204,138,0.15)", color: "#22c55e", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>✓ הושלם</span>}
              </div>
            )}
            {!row ? (
              <div style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 8 }}>טרם מולאו תשובות</div>
            ) : (
              QUESTIONNAIRE_QUESTIONS.map((q, i) => (
                <Card key={i} style={{ marginBottom: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 12, color: "var(--text-mid)", fontWeight: 600, marginBottom: 6 }}>{i + 1}. {q}</div>
                  <div style={{ fontSize: 13, color: answers[i] ? "var(--text)" : "var(--text-dim)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {answers[i] || <em>לא נענה</em>}
                  </div>
                </Card>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Client detail with tabs ───────────────────────────────────────────────────
function ClientDetail({ client, onRefresh }) {
  const REQUIRED = 3;
  const done = client.submissions.length >= REQUIRED;
  const [activeTab, setActiveTab] = useState(client.startTab || "intake");
  const [portfolioTab, setPortfolioTab] = useState("control");

  const tabs = [
    { id: "intake", label: "📋 פגישה ראשונה" },
    { id: "required_docs", label: "📌 מסמכים נדרשים" },
    { id: "data", label: "תיק מסמכים" },
    { id: "questionnaire", label: "📝 שאלון" },
    ...(client.portfolio_open ? [{ id: "portfolio", label: "📁 תיק כלכלי" }] : []),
    { id: "scenario", label: "📊 תסריט תקציבי" },
    { id: "log", label: "📋 לוג שינויים" },
    { id: "personal", label: "פרטים אישיים" },
  ];

  const portfolioTabs = [
    { id: "control", label: "בקרת תיק כלכלי" },
    { id: "savings", label: "פירוט חסכונות" },
    { id: "balance", label: "מאזן מתוכנן" },
  ];

  return (
    <div>
      {/* Client header */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{client.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>@{client.username} · {client.submissions.length} הגשות · {client.mappings.length} מיפויים</div>
          </div>
          {done && !client.portfolio_open && (
            <Btn onClick={async () => {
              await supabase.from("clients").update({ portfolio_open: true }).eq("id", client.id);
              onRefresh();
            }}>📁 פתח תיק כלכלי</Btn>
          )}
        </div>
      </Card>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "10px 18px", fontSize: 13, fontFamily: "inherit", fontWeight: activeTab === t.id ? 700 : 400, color: activeTab === t.id ? "var(--green-mid)" : "var(--text-dim)", background: "none", border: "none", borderBottom: `2px solid ${activeTab === t.id ? "var(--green-mid)" : "transparent"}`, cursor: "pointer", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* INTAKE TAB */}
      {activeTab === "intake" && (
        <IntakeForm client={client} />
      )}

      {/* REQUIRED DOCS TAB */}
      {activeTab === "required_docs" && (
        <RequiredDocsTab client={client} onRefresh={onRefresh} />
      )}

      {/* QUESTIONNAIRE TAB */}
      {activeTab === "questionnaire" && (
        <QuestionnaireViewer clientId={client.id} spousesCount={client.questionnaire_spouses || 1} />
      )}

      {/* DATA TAB */}
      {activeTab === "data" && (
        <div>
          <AllFilesSection clientId={client.id} />
          <PayslipsSection clientId={client.id} />
          <div style={{ fontWeight: 700, marginBottom: 12, marginTop: 8 }}>📊 היסטוריית הגשות (תנועות)</div>
          {client.submissions.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32, color: "var(--text-dim)" }}>טרם הוגשו קבצים</Card>
          ) : client.submissions.map(s => {
            const txs = s.transactions || [];
            const total = txs.reduce((sum, t) => sum + t.amount, 0);
            const monthLabel = monthKeyToLabel(s.month_key);
            const exportOne = () => {
              const XLSX = window.XLSX;
              if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
              const rows = txs.map(t => ({ "תאריך": t.date, "שם בית עסק": t.name, "סעיף": t.cat, "סכום": t.amount, "מקור": t.source || "" }));
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), (s.label || "חודש").substring(0,31));
              XLSX.writeFile(wb, `מאזן_${client.name}_${s.label || monthLabel}.xlsx`);
            };
            return (
              <Card key={s.id} style={{ marginBottom: 10, padding: "14px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.label}{monthLabel && <span style={{ fontWeight: 400, color: "var(--text-mid)", marginRight: 8 }}>— {monthLabel}</span>}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{new Date(s.created_at).toLocaleDateString("he-IL")} · {txs.length} עסקאות</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ fontWeight: 700, color: "var(--red)", fontSize: 16 }}>₪{Math.round(total).toLocaleString()}</div>
                    <Btn size="sm" variant="secondary" onClick={exportOne}>📥 Excel</Btn>
                  </div>
                </div>
              </Card>
            );
          })}

          {client.mappings.length > 0 && (
            <>
              <div style={{ fontWeight: 700, margin: "20px 0 12px" }}>🧠 מיפויים שנזכרו</div>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--surface2)" }}>
                      <th style={{ padding: "8px 14px", textAlign: "right", color: "var(--text-dim)" }}>בית עסק</th>
                      <th style={{ padding: "8px 14px", textAlign: "right", color: "var(--text-dim)" }}>סעיף</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.mappings.map(m => (
                      <tr key={m.id}>
                        <td style={{ padding: "8px 14px", borderTop: `1px solid ${"var(--border)"}22` }}>{m.business_name}</td>
                        <td style={{ padding: "8px 14px", borderTop: `1px solid ${"var(--border)"}22`, color: "var(--green-mid)" }}>{m.category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* PORTFOLIO TAB */}
      {activeTab === "portfolio" && (
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
            {portfolioTabs.map(t => (
              <button key={t.id} onClick={() => setPortfolioTab(t.id)} style={{ padding: "8px 16px", fontSize: 12, fontFamily: "inherit", fontWeight: portfolioTab === t.id ? 700 : 400, color: portfolioTab === t.id ? "var(--text)" : "var(--text-dim)", background: portfolioTab === t.id ? "var(--surface2)" : "transparent", border: `1px solid ${portfolioTab === t.id ? "var(--border)" : "transparent"}`, borderRadius: 8, cursor: "pointer" }}>
                {t.label}
              </button>
            ))}
          </div>
          <ComingSoon label={portfolioTabs.find(t => t.id === portfolioTab)?.label} />
        </div>
      )}

      {/* SCENARIO TAB */}
      {activeTab === "scenario" && (
        <ScenarioTab client={client} />
      )}

      {/* LOG TAB */}
      {activeTab === "log" && (
        <ChangeLogTab clientId={client.id} />
      )}

      {/* PERSONAL TAB */}
      {activeTab === "personal" && (
        <PersonalTab client={client} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ── Coming soon placeholder ───────────────────────────────────────────────────
function ComingSoon({ label }) {
  return (
    <Card style={{ textAlign: "center", padding: "64px 32px" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 14, marginBottom: 6 }}>הסעיף הזה נמצא בפיתוח ובבנייה</div>
      <div style={{ color: "var(--text-dim)", fontSize: 12 }}>בקרוב תוכל לנהל כאן את כל הנתונים הפיננסיים של הלקוח</div>
    </Card>
  );
}

// ── Personal tab ─────────────────────────────────────────────────────────────
function PersonalTab({ client, onRefresh }) {
  const [editName, setEditName] = useState(client.name);
  const [editEmail, setEditEmail] = useState(client.email || "");
  const [editPhone, setEditPhone] = useState(client.phone || "");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveDetails = async () => {
    setLoading(true);
    const { error } = await supabase.from("clients").update({ name: editName, email: editEmail, phone: editPhone }).eq("id", client.id);
    if (error) showMsg("❌ שגיאה בשמירה");
    else { showMsg("✅ הפרטים עודכנו בהצלחה"); onRefresh(); }
    setLoading(false);
  };

  const changePassword = async () => {
    if (newPass.length < 4) { showMsg("❌ סיסמה חייבת להיות לפחות 4 תווים"); return; }
    if (newPass !== confirmPass) { showMsg("❌ הסיסמאות לא תואמות"); return; }
    setLoading(true);
    // Update plaintext password in clients table (kept for legacy / admin reference)
    const { error } = await supabase.from("clients").update({ password: newPass }).eq("id", client.id);
    if (error) { showMsg("❌ שגיאה בעדכון סיסמה"); setLoading(false); return; }
    // Sync to Supabase Auth via Edge Function
    const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
      body: { action: "update_password", clientId: client.id, password: newPass },
    });
    if (fnErr || !authResult?.ok) {
      showMsg("⚠️ הסיסמה עודכנה בDB אך Auth נכשל: " + (authResult?.error || fnErr?.message));
    } else {
      showMsg("✅ הסיסמה עודכנה"); setNewPass(""); setConfirmPass("");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {/* Details card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>👤 פרטי לקוח</div>
        <Input label="שם מלא" value={editName} onChange={e => setEditName(e.target.value)} />
        <Input label="מייל" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@gmail.com" />
        <Input label="טלפון" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="050-0000000" />
        <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "var(--text-dim)", marginBottom: 14 }}>
          <div style={{ marginBottom: 4 }}>שם משתמש לכניסה</div>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>@{client.username}</div>
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith("✅") ? "var(--green-soft)" : "var(--red)", marginBottom: 12 }}>{msg}</div>}
        <Btn onClick={saveDetails} disabled={loading}>שמור שינויים</Btn>
      </Card>

      {/* Password card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>🔐 שינוי סיסמה</div>
        <Input label="סיסמה חדשה" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="לפחות 4 תווים" />
        <Input label="אימות סיסמה" type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="הכנס שוב את הסיסמה" />
        {msg && <div style={{ fontSize: 12, color: msg.startsWith("✅") ? "var(--green-soft)" : "var(--red)", marginBottom: 12 }}>{msg}</div>}
        <Btn onClick={changePassword} disabled={loading || !newPass || !confirmPass}>עדכן סיסמה</Btn>
      </Card>

      {/* Info card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>📋 מידע נוסף</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "תאריך הצטרפות", value: new Date(client.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) },
            { label: "הגשות", value: `${client.submissions.length} / 3` },
            { label: "מיפויים שנזכרו", value: client.mappings.length },
            { label: "סטטוס תיק", value: client.portfolio_open ? "פעיל 📁" : "טרם נפתח" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${"var(--border)"}22`, fontSize: 13 }}>
              <span style={{ color: "var(--text-dim)" }}>{item.label}</span>
              <span style={{ fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Export section with month selection ──────────────────────────────────────
function ExportSection({ submissions, clientName }) {
  const [selected, setSelected] = useState([]);
  const [exporting, setExporting] = useState(false);

  const toggle = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const allSelected = submissions.length > 0 && selected.length === submissions.length;
  const toggleAll = () => setSelected(allSelected ? [] : submissions.map(s => s.id));

  const doExport = () => {
    const XLSX = window.XLSX;
    if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
    const chosenSubs = submissions.filter(s => selected.includes(s.id));
    if (!chosenSubs.length) return;

    const wb = XLSX.utils.book_new();

    // One sheet per month
    chosenSubs.forEach(s => {
      const txs = s.transactions || [];
      const txRows = txs.map(t => ({
        "תאריך": t.date, "שם בית עסק": t.name, "סעיף": t.cat,
        "סכום": t.amount, "מקור": t.source || "",
        "ביטחון": t.conf === "high" ? "גבוה" : t.conf === "med" ? "בינוני" : "נמוך",
      }));
      const sheetName = (s.label || "חודש").substring(0, 31);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), sheetName);
    });

    // Summary sheet — all selected months combined
    if (chosenSubs.length > 1) {
      const allTx = chosenSubs.flatMap(s => s.transactions || []);
      const catMap: Record<string, number> = {};
      allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.amount; });
      const summaryRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({
        "סעיף": cat,
        "סכום כולל": Math.round(amt as number),
        "מספר עסקאות": allTx.filter(t => t.cat === cat).length,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "סיכום משולב");
    }

    XLSX.writeFile(wb, `מאזן_${clientName}_${chosenSubs.map(s => s.label).join("_")}.xlsx`);
  };

  if (submissions.length === 0) return null;

  return (
    <Card style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>⬇️ ייצוא לאקסל</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={toggleAll} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 12px", fontSize: 12, color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit" }}>
            {allSelected ? "בטל הכל" : "בחר הכל"}
          </button>
          <Btn size="sm" onClick={doExport} disabled={selected.length === 0}>
            ייצוא {selected.length > 0 ? `(${selected.length})` : ""}
          </Btn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {submissions.map(s => (
          <div key={s.id} onClick={() => toggle(s.id)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: `1px solid ${selected.includes(s.id) ? "var(--green-mid)" : "var(--border)"}`, background: selected.includes(s.id) ? "rgba(79,142,247,0.12)" : "var(--surface2)", color: selected.includes(s.id) ? "var(--green-mid)" : "var(--text-dim)", fontWeight: selected.includes(s.id) ? 600 : 400 }}>
            {selected.includes(s.id) ? "✓ " : ""}{s.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── לוג שינויים ──────────────────────────────────────────────────────────────
function ChangeLogTab({ clientId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    supabase.from("client_change_log")
      .select("*").eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => { setLogs(data || []); setLoading(false); });
  }, [clientId]);

  const EVENT_LABELS = {
    remap_business: "שינוי שיוך",
    add_category:   "הוספת סעיף",
    edit_budget:    "שינוי יעד",
    reset_balance:  "איפוס יתרה",
    manual_entry:   "הזנה ידנית",
  };

  const EVENT_COLORS = {
    remap_business: "var(--green-mint)",
    add_category:   "var(--gold-light)",
    edit_budget:    "rgba(79,142,247,0.1)",
    reset_balance:  "var(--red-light)",
    manual_entry:   "var(--surface2)",
  };

  const filtered = filter === "all" ? logs : logs.filter(l => l.event_type === filter);

  const renderDetails = (log) => {
    const d = log.details || {};
    switch (log.event_type) {
      case "remap_business":
        return <span>בית עסק: <strong>{d.business_name}</strong> | {d.from_cat} → <strong>{d.to_cat}</strong></span>;
      case "add_category":
        return <span>סעיף חדש: <strong>{d.category_name}</strong> | יעד: ₪{d.amount}</span>;
      case "edit_budget":
        return <span>סעיף: <strong>{d.category_name}</strong> | ₪{d.old_amount} → <strong>₪{d.new_amount}</strong></span>;
      case "reset_balance":
        return <span>סעיף: <strong>{d.category_name || "כלל"}</strong> | יתרה שאופסה: ₪{d.balance} | {d.note}</span>;
      case "manual_entry":
        return <span>סעיף: <strong>{d.category_name}</strong> | ₪{d.amount} | {d.description}</span>;
      default:
        return <span>{JSON.stringify(d)}</span>;
    }
  };

  if (loading) return <div style={{ color: "var(--text-dim)", padding: 32 }}>טוען...</div>;

  return (
    <div>
      {/* פילטר */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[["all", "הכל"], ...Object.entries(EVENT_LABELS)].map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ padding: "5px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${filter === k ? "var(--green-mid)" : "var(--border)"}`,
              background: filter === k ? "var(--green-mint)" : "transparent",
              color: filter === k ? "var(--green-deep)" : "var(--text-mid)", fontWeight: filter === k ? 600 : 400 }}>
            {v}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}>אין שינויים</div>
      ) : filtered.map(log => (
        <div key={log.id} style={{ marginBottom: 8, padding: "12px 16px", borderRadius: 12, background: EVENT_COLORS[log.event_type] || "var(--surface2)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--green-deep)", marginLeft: 8 }}>
                {EVENT_LABELS[log.event_type] || log.event_type}
              </span>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{renderDetails(log)}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
              {new Date(log.created_at).toLocaleString("he-IL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// מסמכים נדרשים — המאמן בוחר אילו מסמכים הלקוח צריך להביא
// ════════════════════════════════════════════════════════════════
const ALL_REQUIRED_DOC_OPTIONS = [
  { id: "loans",       label: "מסמכי הלוואות",                   icon: "📋" },
  { id: "provident",   label: "יתרת קרן השתלמות",                icon: "💰" },
  { id: "pl",          label: "דוח רווח והפסד (לעצמאיים)",       icon: "📊" },
  { id: "savings",     label: "פירוט חסכונות ופנסיה",            icon: "🏦" },
  { id: "retirement",  label: "דוח תחזית פרישה (מעל גיל 55)",   icon: "👴" },
  { id: "checks",      label: "שיקים דחויים",                    icon: "📄" },
  { id: "debts_other", label: "פיגורי תשלומים וחובות אחרים",    icon: "⚠️" },
];

function RequiredDocsTab({ client, onRefresh }) {
  const [selected, setSelected]         = useState(client.required_docs || null);
  const [spouses, setSpouses]           = useState(client.questionnaire_spouses || null);
  const [showSpouseModal, setShowSpouseModal] = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  const questionnaireSelected = (selected || []).includes("questionnaire");

  const toggle = (id) => {
    if (id === "questionnaire") {
      if (questionnaireSelected) {
        setSelected(prev => (prev || []).filter(x => x !== "questionnaire"));
        setSpouses(null);
      } else {
        setShowSpouseModal(true);
      }
      setSaved(false);
      return;
    }
    setSelected(prev => {
      const cur = prev || [];
      return cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    });
    setSaved(false);
  };

  const selectSpouses = (n) => {
    setSpouses(n);
    setSelected(prev => [...(prev || []), "questionnaire"]);
    setShowSpouseModal(false);
    setSaved(false);
  };

  const selectAll = () => {
    setSelected([...ALL_REQUIRED_DOC_OPTIONS.map(o => o.id), "questionnaire"]);
    if (!spouses) setShowSpouseModal(true);
    setSaved(false);
  };
  const clearAll = () => { setSelected([]); setSpouses(null); setSaved(false); };

  const [saveError, setSaveError] = useState("");

  const save = async () => {
    if (!(selected || []).includes("questionnaire")) {
      setSaveError("חובה לבחור גם שאלון אישי (ולסמן כמה בני זוג)");
      return;
    }
    setSaveError("");
    setSaving(true);
    const { error } = await supabase.from("clients").update({ required_docs: selected, questionnaire_spouses: spouses }).eq("id", client.id);
    setSaving(false);
    if (error) { setSaveError("שגיאה בשמירה: " + error.message); return; }
    setSaved(true);
    onRefresh();
    setTimeout(() => setSaved(false), 3000);
  };

  const cur = selected || [];
  const isNull = selected === null;
  const allOptions = [...ALL_REQUIRED_DOC_OPTIONS, { id: "questionnaire", label: "שאלון אישי", icon: "📝" }];

  return (
    <div>
      {/* Spouse count modal */}
      {showSpouseModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:16, padding:32, maxWidth:360, width:"90%", textAlign:"center" }}>
            <div style={{ fontWeight:700, fontSize:17, marginBottom:8 }}>📝 שאלון אישי</div>
            <div style={{ fontSize:14, color:"var(--text-dim)", marginBottom:24 }}>כמה בני זוג ממלאים שאלון?</div>
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={() => selectSpouses(1)} style={{ padding:"14px 28px", borderRadius:12, border:"2px solid var(--green-mid)", background:"transparent", color:"var(--green-mid)", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
                👤 בן/בת זוג אחד/ת
              </button>
              <button onClick={() => selectSpouses(2)} style={{ padding:"14px 28px", borderRadius:12, border:"2px solid var(--green-mid)", background:"var(--green-mid)", color:"white", fontWeight:700, fontSize:15, cursor:"pointer", fontFamily:"inherit" }}>
                👥 שני בני זוג
              </button>
            </div>
            <button onClick={() => setShowSpouseModal(false)} style={{ marginTop:16, fontSize:13, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer" }}>ביטול</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>📌 מסמכים נדרשים — {client.name}</div>
          <div style={{ fontSize:12, color:"var(--text-dim)", marginTop:4 }}>
            {isNull ? "לא הוגדר — הלקוח רואה הכל (ברירת מחדל)" : cur.length === 0 ? "לא נבחרו — הלקוח לא רואה אף סעיף" : `נבחרו ${cur.length} סעיפים`}
            {spouses && <span style={{ marginRight:8, color:"var(--green-mid)" }}>· שאלון: {spouses === 1 ? "בן/בת זוג אחד/ת" : "שני בני זוג"}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {saved && <span style={{ fontSize:13, color:"var(--green-soft)" }}>✅ נשמר</span>}
          {saveError && <span style={{ fontSize:13, color:"var(--red)" }}>⚠️ {saveError}</span>}
          <Btn variant="secondary" size="sm" onClick={selectAll}>בחר הכל</Btn>
          <Btn variant="secondary" size="sm" onClick={clearAll}>נקה הכל</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? "שומר..." : "💾 שמור"}</Btn>
        </div>
      </div>

      <Card>
        {allOptions.map((opt, i) => (
          <div key={opt.id} onClick={() => toggle(opt.id)} style={{
            display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
            borderBottom: i < allOptions.length-1 ? "1px solid var(--border)22" : "none",
            cursor:"pointer",
            background: cur.includes(opt.id) ? "rgba(46,204,138,0.04)" : "transparent",
          }}>
            <div style={{
              width:22, height:22, borderRadius:6, border:`2px solid ${cur.includes(opt.id) ? "var(--green-mid)" : "var(--border)"}`,
              background: cur.includes(opt.id) ? "var(--green-mid)" : "transparent",
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            }}>
              {cur.includes(opt.id) && <span style={{ color:"white", fontSize:13, fontWeight:700 }}>✓</span>}
            </div>
            <span style={{ fontSize:18 }}>{opt.icon}</span>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:14, fontWeight: cur.includes(opt.id) ? 600 : 400 }}>{opt.label}</span>
              {opt.id === "questionnaire" && cur.includes("questionnaire") && spouses && (
                <span style={{ fontSize:12, color:"var(--green-mid)", marginRight:8 }}>({spouses === 1 ? "בן/בת זוג אחד/ת" : "שני בני זוג"}) <button onClick={e=>{e.stopPropagation();setShowSpouseModal(true);}} style={{ fontSize:11, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>שנה</button></span>
              )}
            </div>
          </div>
        ))}
      </Card>

      <div style={{ marginTop:16, fontSize:12, color:"var(--text-dim)" }}>
        הלקוח יראה <strong>רק</strong> את הסעיפים שסומנו. פירוט תנועות ותלושי שכר תמיד מוצגים.
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// טופס פגישה ראשונה — ממולא על ידי המאמן
// ════════════════════════════════════════════════════════════════
const INTAKE_SECTIONS = [
  {
    id: "why",
    title: "📌 רקע ומניע",
    fields: [
      { key: "why_came", label: "למה הגיעו אליך?", type: "textarea" },
      { key: "why_situation", label: "למה לדעתם הגיעו למצב הנוכחי?", type: "textarea" },
      { key: "emotional_state", label: "מצב רגשי ורמת מוטיבציה", type: "textarea" },
    ],
  },
  {
    id: "family",
    title: "👨‍👩‍👧 פרטי המשפחה",
    fields: [
      { key: "_spouse1_header", label: "", type: "header", text: "בן/בת זוג ראשון" },
      { key: "spouse1_name",   label: "שם",                                  type: "text" },
      { key: "spouse1_age",    label: "גיל",                                  type: "text" },
      { key: "spouse1_job",    label: "עיסוק",                                type: "text" },
      { key: "spouse1_salary", label: "שכר חודשי ברוטו",                     type: "text" },
      { key: "spouse1_salary_net", label: "שכר חודשי נטו",                   type: "text" },
      { key: "spouse1_notes",  label: "הערות (תואר, תנאים מיוחדים וכו')",   type: "textarea" },
      { key: "_spouse2_header", label: "", type: "header", text: "בן/בת זוג שני" },
      { key: "spouse2_name",   label: "שם",                                  type: "text" },
      { key: "spouse2_age",    label: "גיל",                                  type: "text" },
      { key: "spouse2_job",    label: "עיסוק",                                type: "text" },
      { key: "spouse2_salary", label: "שכר חודשי ברוטו",                     type: "text" },
      { key: "spouse2_salary_net", label: "שכר חודשי נטו",                   type: "text" },
      { key: "spouse2_notes",  label: "הערות",                               type: "textarea" },
      { key: "_children_header", label: "", type: "header", text: "ילדים וכללי" },
      { key: "children",       label: "ילדים — גילים ומיוחד כלכלי",          type: "textarea" },
      { key: "pets",           label: "חיות מחמד — סוג ומצב בריאותי",       type: "text" },
    ],
  },
  {
    id: "assets",
    title: "🏠 נכסים",
    fields: [
      { key: "apt1", label: "דירה ראשונה — חדרים, מיקום, שווי, מצב, משכנתה", type: "textarea" },
      { key: "apt2", label: "דירה נוספת (אם יש)", type: "textarea" },
      { key: "car", label: "רכב — שנה, מצב כללי, תדירות תיקונים", type: "textarea" },
      { key: "investments", label: "השקעות, קרנות השתלמות, קופות גמל", type: "textarea" },
      { key: "other_assets", label: "נכסים נוספים", type: "textarea" },
    ],
  },
  {
    id: "debts",
    title: "💳 חובות ואשראי",
    fields: [
      { key: "overdraft", label: "אוברדראפט — כמה ומאיפה", type: "text" },
      { key: "monthly_deficit", label: "גרעון חודשי משוער (לפי תחושתם)", type: "text" },
      { key: "credit_cards_count", label: "כמה כרטיסי אשראי", type: "text" },
      { key: "loans_summary", label: "סיכום הלוואות (בנוסף לפירוט המסמכים)", type: "textarea" },
    ],
  },
  {
    id: "goals",
    title: "🎯 יעדים ותכנונים",
    fields: [
      { key: "goals_short", label: "יעדים לטווח קצר (עד שנה)", type: "textarea" },
      { key: "goals_long", label: "יעדים לטווח ארוך (3-10 שנים)", type: "textarea" },
      { key: "planned_expenses", label: "הוצאות עתידיות צפויות (רכב, חתונה, שיפוץ...)", type: "textarea" },
      { key: "expected_changes", label: "שינויים צפויים בהכנסה/הוצאות", type: "textarea" },
      { key: "earning_potential", label: "פוטנציאל השתכרות נוסף", type: "textarea" },
    ],
  },
  {
    id: "insurance",
    title: "🛡️ ביטוחים ופנסיה",
    fields: [
      { key: "last_pension_agent", label: "מתי היו לאחרונה אצל סוכן פנסיוני?", type: "text" },
      { key: "insurance_notes", label: "ביטוחים קיימים והערות", type: "textarea" },
    ],
  },
  {
    id: "coach_notes",
    title: "📝 הערות המאמן",
    fields: [
      { key: "first_impression", label: "רושם ראשוני", type: "textarea" },
      { key: "key_challenges", label: "אתגרים מרכזיים שזוהו", type: "textarea" },
      { key: "action_items", label: "צעדי פעולה מיידיים", type: "textarea" },
      { key: "misc", label: "הערות נוספות", type: "textarea" },
    ],
  },
];

function IntakeForm({ client }) {
  const [data, setData]       = useState({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [openSection, setOpenSection] = useState("why");

  useEffect(() => {
    supabase.from("client_intake").select("data").eq("client_id", client.id).maybeSingle()
      .then(({ data: row }) => { if (row?.data) setData(row.data); setLoaded(true); });
  }, [client.id]);

  const update = (key, val) => { setData(prev => ({ ...prev, [key]: val })); setSaved(false); };

  const save = async () => {
    setSaving(true);
    await supabase.from("client_intake").upsert(
      [{ client_id: client.id, data, updated_at: new Date().toISOString() }],
      { onConflict: "client_id" }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const filledCount = (section) => section.fields.filter(f => f.type !== "header" && data[f.key] && String(data[f.key]).trim()).length;

  if (!loaded) return <div style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}>טוען...</div>;

  const fieldStyle = { width: "100%", boxSizing: "border-box", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>📋 טופס פגישה ראשונה — {client.name}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved && <span style={{ fontSize: 13, color: "var(--green-soft)" }}>✅ נשמר</span>}
          <Btn onClick={save} disabled={saving}>{saving ? "שומר..." : "💾 שמור"}</Btn>
        </div>
      </div>

      {INTAKE_SECTIONS.map(section => {
        const filled = filledCount(section);
        const isOpen = openSection === section.id;
        return (
          <div key={section.id} style={{ marginBottom: 8 }}>
            <div onClick={() => setOpenSection(isOpen ? null : section.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "13px 18px",
              background: filled > 0 ? "rgba(46,204,138,0.06)" : "var(--surface2)",
              borderRadius: isOpen ? "10px 10px 0 0" : 10,
              border: `1px solid ${filled > 0 ? "rgba(46,204,138,0.25)" : "var(--border)"}`,
              cursor: "pointer", userSelect: "none",
            }}>
              <span style={{ fontSize: 17 }}>{section.title.split(" ")[0]}</span>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>{section.title.slice(section.title.indexOf(" ") + 1)}</div>
              {filled > 0 && <span style={{ fontSize: 11, color: "var(--green-mid)", background: "rgba(46,204,138,0.12)", borderRadius: 20, padding: "2px 10px" }}>{filled}/{section.fields.length}</span>}
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {isOpen && (
              <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", background: "var(--surface)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {section.fields.map((field, fi) => {
                    if (field.type === "header") return (
                      <div key={field.key} style={{ gridColumn:"1/-1", fontWeight:700, fontSize:13, color:"var(--green-mid)", borderBottom:"2px solid var(--green-mid)", paddingBottom:6, marginTop: fi === 0 ? 0 : 18, marginBottom:10 }}>
                        {field.text}
                      </div>
                    );
                    if (field.type === "textarea") return (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500 }}>{field.label}</div>
                        <textarea value={data[field.key] || ""} onChange={e => update(field.key, e.target.value)} rows={3} style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5, width:"100%", boxSizing:"border-box" }} placeholder="..." />
                      </div>
                    );
                    return (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500 }}>{field.label}</div>
                        <input type="text" value={data[field.key] || ""} onChange={e => update(field.key, e.target.value)} style={{ ...fieldStyle, width:"100%", boxSizing:"border-box" }} placeholder="..." />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ marginTop: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <Btn onClick={save} disabled={saving}>{saving ? "שומר..." : "💾 שמור הכל"}</Btn>
        {saved && <span style={{ fontSize: 13, color: "var(--green-soft)" }}>✅ נשמר בהצלחה</span>}
      </div>
    </div>
  );
}
