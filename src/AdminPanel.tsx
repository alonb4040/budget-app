import { useState, useEffect, useMemo, useRef } from "react";
import ScenarioTab from "./ScenarioTab";
import { supabase } from "./supabase";
import { Card, Btn, Input, C } from "./ui";
import CategoryManager from "./components/CategoryManager";

const HEB_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
function monthKeyToLabel(mk) {
  if (!mk) return "";
  const [y, m] = mk.split("-");
  return `${HEB_MONTHS[parseInt(m)-1]} ${y}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRelativeTime(isoDate: string): string {
  const diffDays = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (diffDays === 0) return "היום";
  if (diffDays === 1) return "אתמול";
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  if (diffDays < 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`;
  if (diffDays < 365) return `לפני ${Math.floor(diffDays / 30)} חודשים`;
  return `לפני ${Math.floor(diffDays / 365)} שנים`;
}

const EMAILJS_SVC  = process.env.REACT_APP_EMAILJS_SERVICE_ID  || "";
const EMAILJS_WELCOME_TPL = process.env.REACT_APP_EMAILJS_WELCOME_TEMPLATE_ID || "";
const EMAILJS_KEY  = process.env.REACT_APP_EMAILJS_PUBLIC_KEY  || "";

const INACTIVITY_DAYS = 5;

// ── Reminder email button ─────────────────────────────────────────────────────
function ReminderEmailBtn({ client }: { client: any }) {
  const [status, setStatus] = useState<"idle"|"sending"|"sent"|"error">("idle");
  if (!client.email) return null;

  const sendReminder = async () => {
    setStatus("sending");
    try {
      const res = await supabase.functions.invoke("manage-auth", {
        body: { action: "send_reminder", clientId: client.id },
      });
      if (res.error || !res.data?.ok) throw new Error(res.data?.error || "שגיאה");
      setStatus("sent");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <Btn
      size="sm"
      variant="ghost"
      onClick={sendReminder}
      disabled={status === "sending" || status === "sent"}
    >
      {status === "sending" ? "שולח..." : status === "sent" ? "✅ נשלח!" : status === "error" ? "❌ שגיאה" : "📨 שלח תזכורת"}
    </Btn>
  );
}

// ── Welcome email card ────────────────────────────────────────────────────────
function WelcomeEmailCard({ name, last_name, username, password, email, clientId, onSent }: {
  name: string; last_name?: string; username: string; password?: string;
  email?: string; clientId?: number; onSent?: () => void;
}) {
  const [status, setStatus] = useState<"idle"|"sending"|"sent"|"error">("idle");

  const family_greeting = last_name
    ? `ברוכים הבאים משפחת ${last_name}!`
    : `היי ${name}!`;
  const subject_family = last_name ? ` משפחת ${last_name}` : "";

  const sendEmail = async () => {
    if (!email) return;
    setStatus("sending");
    try {
      await (window as any).emailjs.send(
        EMAILJS_SVC, EMAILJS_WELCOME_TPL,
        { to_email: email, to_name: name, last_name: last_name || "", family_greeting, subject_family, username, password: password || "", site_url: "https://www.alonb.com" },
        EMAILJS_KEY,
      );
      if (clientId) {
        await supabase.from("clients").update({ welcome_sent_at: new Date().toISOString() }).eq("id", clientId);
      }
      setStatus("sent");
      if (onSent) onSent();
    } catch (e) {
      console.error("EmailJS welcome:", e);
      setStatus("error");
    }
  };

  const notConfigured = !EMAILJS_SVC || !EMAILJS_WELCOME_TPL || !EMAILJS_KEY;

  return (
    <div style={{ background: "var(--surface2)", borderRadius: 12, padding: 16, border: "1px solid var(--border)" }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>📧 שלח הוראות כניסה במייל</div>
      {!email ? (
        <div style={{ fontSize: 15, color: "var(--text-dim)" }}>לא הוזנה כתובת מייל — הוסף בפרטי הלקוח ושלח משם</div>
      ) : notConfigured ? (
        <div style={{ fontSize: 14, color: "var(--gold)" }}>⚠️ חסר <code>REACT_APP_EMAILJS_WELCOME_TEMPLATE_ID</code> ב-.env</div>
      ) : (
        <>
          <div style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 14 }}>
            ישלח אל: <strong style={{ color: "var(--text)" }}>{email}</strong>
          </div>
          <Btn onClick={sendEmail} disabled={status === "sending" || status === "sent"}>
            {status === "idle" ? "📧 שלח מייל" : status === "sending" ? "שולח..." : status === "sent" ? "✅ נשלח!" : "❌ שגיאה — נסה שוב"}
          </Btn>
          {status === "error" && (
            <div style={{ fontSize: 14, color: "var(--red)", marginTop: 8 }}>שגיאה — בדוק שהתבנית ב-EmailJS מוגדרת נכון</div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminPanel({ onLogout }) {
  const [clients, setClients] = useState([]);
  const [subCounts, setSubCounts] = useState<Record<number, number>>({});
  const [clientFilter, setClientFilter] = useState<"all"|"active"|"waiting"|"collecting"|"blocked">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created"|"last_active"|"name">("created");
  const [sortAsc, setSortAsc] = useState(false);
  const [view, setView] = useState("list"); // list | new | detail | categories
  const [visitedAdminViews, setVisitedAdminViews] = useState<Set<string>>(() => new Set(["list"]));
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "", last_name: "", username: "", password: "", email: "", phone: "" });
  const [justCreated, setJustCreated] = useState<{id:number;name:string;last_name:string;username:string;password:string;email:string}|null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const [{ data, error }, { data: allSubs }] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }).abortSignal(controller.signal),
        supabase.from("submissions").select("client_id"),
      ]);
      clearTimeout(timer);
      if (error) console.error("loadClients error:", error.message);
      setClients(data || []);
      const counts: Record<number, number> = {};
      (allSubs || []).forEach((s: any) => { counts[s.client_id] = (counts[s.client_id] || 0) + 1; });
      setSubCounts(counts);
    } catch(err: any) {
      if (err?.name !== "AbortError") console.error("loadClients error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClients(); }, []);

  const createClient = async () => {
    if (!form.name || !form.username || !form.password) return;
    // 1. Insert the client row (without password — credentials are managed by Supabase Auth only)
    const { data: newClient, error } = await supabase
      .from("clients")
      .insert([{ name: form.name, last_name: form.last_name || null, username: form.username, email: form.email || null, phone: form.phone || null, created_at: new Date().toISOString() }])
      .select("id")
      .single();
    if (error) { setMsg("❌ " + (error.message.includes("unique") ? "שם משתמש תפוס" : error.message)); return; }

    // 2. Create Supabase Auth user and link auth_id via Edge Function
    const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
      body: { action: "create", username: form.username, password: form.password, clientId: (newClient as any).id },
    });
    const saved = { id: (newClient as any).id, name: form.name, last_name: form.last_name, username: form.username, password: form.password, email: form.email };
    setForm({ name: "", last_name: "", username: "", password: "", email: "", phone: "" });
    loadClients();
    if (fnErr || !authResult?.ok) {
      setMsg("⚠️ לקוח נוצר אך חשבון Auth נכשל: " + (authResult?.error || fnErr?.message || "שגיאה"));
    } else {
      setJustCreated(saved);
    }
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
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
    const url = `${supabaseUrl}/functions/v1/manage-auth`;
    if (!supabaseUrl || !anonKey) { setMsg("❌ חסרים פרטי Supabase ב-.env"); return; }
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
      body: JSON.stringify({ action: "migrate_all" }),
    });
    const data = await resp.json();
    if (!resp.ok) { setMsg("❌ " + (data?.error || "שגיאה")); return; }
    setMsg(`✅ הגירה הושלמה — ${data.migrated} לקוחות עודכנו`);
    loadClients();
  };

  const openClient = async (client) => {
    const [{ data: subs }, { data: maps }, { data: freshClient }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id),
      supabase.from("clients").select("required_docs,questionnaire_spouses,is_blocked").eq("id", client.id).maybeSingle(),
    ]);
    setSelected({ ...client, required_docs: freshClient?.required_docs ?? client.required_docs, questionnaire_spouses: freshClient?.questionnaire_spouses ?? client.questionnaire_spouses, is_blocked: freshClient?.is_blocked ?? client.is_blocked, submissions: subs || [], mappings: maps || [] });
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
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", width:38, height:38, background:"var(--green-mid)", borderRadius:10 }}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none"><path d="M6 24 L12 16 L18 20 L26 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 10 H26 V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <div style={{ fontFamily:"'Frank Ruhl Libre', serif", fontWeight:600, fontSize: 20, color:"var(--green-deep)", lineHeight:1 }}>מאזן</div>
            <div style={{ fontSize: 14, color:"var(--text-dim)", marginTop:2 }}>פאנל ניהול — אלון</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "list" && <Btn variant="ghost" size="sm" onClick={() => { setView("list"); setMsg(""); setSelected(null); setJustCreated(null); }}>← חזור</Btn>}
          {view === "list" && <Btn variant="ghost" size="sm" onClick={() => { setView("categories"); setVisitedAdminViews(prev => { const next = new Set(prev); next.add("categories"); return next; }); }}>🏷️ קטגוריות</Btn>}
          <Btn variant="ghost" size="sm" onClick={onLogout}>יציאה</Btn>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>
        {msg && (
          <div style={{ background: msg.startsWith("✅") ? "rgba(46,204,138,0.1)" : "rgba(247,92,92,0.1)", border: `1px solid ${msg.startsWith("✅") ? "rgba(46,204,138,0.3)" : "rgba(247,92,92,0.3)"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 15, color: msg.startsWith("✅") ? "var(--green-soft)" : "var(--red)" }}>
            {msg}
          </div>
        )}

        {/* LIST */}
        {view === "list" && (() => {
          const active    = clients.filter(c => c.portfolio_open && !c.is_blocked);
          const waiting   = clients.filter(c => !c.is_blocked && !c.portfolio_open && (subCounts[c.id] || 0) >= 3);
          const collecting = clients.filter(c => !c.is_blocked && !c.portfolio_open && (subCounts[c.id] || 0) < 3);
          const blocked   = clients.filter(c => c.is_blocked);
          const byFilter = clientFilter === "active" ? active : clientFilter === "waiting" ? waiting : clientFilter === "collecting" ? collecting : clientFilter === "blocked" ? blocked : clients;
          const bySearch = search.trim() ? byFilter.filter(c => `${c.name} ${c.username} ${c.last_name || ""}`.toLowerCase().includes(search.trim().toLowerCase())) : byFilter;
          const filteredClients = [...bySearch].sort((a, b) => {
            let cmp = 0;
            if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "", "he");
            else if (sortBy === "last_active") cmp = (b.last_active || "").localeCompare(a.last_active || "");
            else cmp = (b.created_at || "").localeCompare(a.created_at || "");
            return sortAsc ? -cmp : cmp;
          });


          const kpiItems = [
            { id: "all",        label: "כולם",             count: clients.length,  color: "var(--text)" },
            { id: "active",     label: "תיק פעיל",         count: active.length,   color: "var(--green-mid)" },
            { id: "waiting",    label: "ממתין לפתיחה",     count: waiting.length,  color: "var(--gold)" },
            { id: "collecting", label: "אוסף נתונים",      count: collecting.length, color: "var(--text-mid)" },
            ...(blocked.length > 0 ? [{ id: "blocked", label: "חסום", count: blocked.length, color: "var(--red)" }] : []),
          ];

          return (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 700 }}>
                  לקוחות ({clientFilter === "all" && !search.trim() ? clients.length : `${filteredClients.length} מתוך ${clients.length}`})
                </div>
                <Btn size="sm" onClick={() => { setView("new"); setMsg(""); setJustCreated(null); }}>+ לקוח חדש</Btn>
              </div>

              {/* Search */}
              {!loading && clients.length > 0 && (
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="🔍 חיפוש לפי שם או שם משתמש..."
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 16, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12, direction: "rtl" }}
                />
              )}

              {/* Sort */}
              {!loading && clients.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 14, color: "var(--text-dim)" }}>מיון:</span>
                  {([["created","הצטרפות"],["last_active","פעילות אחרונה"],["name","שם"]] as const).map(([val, label]) => (
                    <button key={val} onClick={() => { if (sortBy === val) setSortAsc(p => !p); else { setSortBy(val); setSortAsc(false); } }} style={{
                      padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                      background: sortBy === val ? "var(--green-mid)" : "var(--surface2)",
                      color: sortBy === val ? "white" : "var(--text-dim)", fontWeight: sortBy === val ? 700 : 400,
                    }}>
                      {label}{sortBy === val ? (sortAsc ? " ↑" : " ↓") : ""}
                    </button>
                  ))}
                </div>
              )}

              {/* KPI Bar */}
              {!loading && clients.length > 0 && (
                <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                  {kpiItems.map(k => (
                    <button key={k.id} onClick={() => setClientFilter(k.id as any)} style={{
                      padding: "10px 18px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                      background: clientFilter === k.id ? "var(--surface2)" : "var(--surface)",
                      border: `1px solid ${clientFilter === k.id ? "var(--green-mid)" : "var(--border)"}`,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 76,
                    }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.count}</span>
                      <span style={{ fontSize: 13, color: clientFilter === k.id ? "var(--green-mid)" : "var(--text-dim)" }}>{k.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>טוען...</div>
              ) : clients.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "48px 24px" }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                  <div style={{ color: "var(--text-dim)" }}>אין לקוחות עדיין</div>
                </Card>
              ) : filteredClients.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "32px 24px", color: "var(--text-dim)" }}>אין לקוחות בקטגוריה זו</Card>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredClients.map(c => (
                    <ClientRow key={c.id} client={c} subCount={subCounts[c.id] ?? 0} onOpen={openClient} onDelete={deleteClient} />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* NEW CLIENT */}
        {view === "new" && !justCreated && (
          <Card style={{ maxWidth: 440 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>➕ לקוח חדש</div>
            <Input label="שם פרטי" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ישראל" />
            <Input label="שם משפחה" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="ישראלי" />
            <Input label="שם משתמש" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, "").toLowerCase() }))} placeholder="israel123" />
            <Input label="סיסמה" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="לפחות 6 תווים" />
            <Input label="מייל (לשליחת הוראות כניסה)" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="israel@gmail.com" />
            <Input label="טלפון" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="050-0000000" />
            {msg && <div style={{ color: "var(--red)", fontSize: 14, marginBottom: 12 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={createClient} disabled={!form.name || !form.username || form.password.length < 4}>צור לקוח</Btn>
              <Btn variant="ghost" onClick={() => setView("list")}>ביטול</Btn>
            </div>
          </Card>
        )}

        {/* NEW CLIENT SUCCESS + WHATSAPP */}
        {view === "new" && justCreated && (
          <div style={{ maxWidth: 480 }}>
            <Card style={{ textAlign: "center", padding: "24px 24px 20px", marginBottom: 16 }}>
              <div style={{ fontSize: 44, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 4 }}>הלקוח נוצר בהצלחה!</div>
              <div style={{ fontSize: 15, color: "var(--text-dim)" }}>{justCreated.name} · @{justCreated.username}</div>
            </Card>
            <WelcomeEmailCard name={justCreated.name} last_name={justCreated.last_name} username={justCreated.username} password={justCreated.password} email={justCreated.email} clientId={justCreated.id} onSent={loadClients} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Btn onClick={() => setJustCreated(null)}>+ לקוח נוסף</Btn>
              <Btn variant="ghost" onClick={() => { setView("list"); setJustCreated(null); }}>חזור לרשימה</Btn>
            </div>
          </div>
        )}

        {/* CLIENT DETAIL */}
        {view === "detail" && selected && (
          <ClientDetail client={selected} onRefresh={async () => { await loadClients(); const fresh = clients.find(c => c.id === selected.id) || selected; await openClient(fresh); }} />
        )}

        {/* CATEGORY MANAGER (lazy mount) */}
        {visitedAdminViews.has("categories") && (
          <div style={{ display: view === "categories" ? "block" : "none" }}>
            <CategoryManager />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Client row in list ────────────────────────────────────────────────────────
function ClientRow({ client, subCount, onOpen, onDelete }) {
  const REQUIRED = 3;
  const done = subCount >= REQUIRED;
  const isBlocked = client.is_blocked || false;

  // 5-day inactivity warning
  const daysSinceWelcome = client.welcome_sent_at ? Math.floor((Date.now() - new Date(client.welcome_sent_at).getTime()) / 86400000) : null;
  const lastActivity = client.last_active ? new Date(client.last_active) : null;
  const daysSinceActivity = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000) : 999;
  const showInactiveWarning = !isBlocked && client.welcome_sent_at && daysSinceWelcome >= INACTIVITY_DAYS && daysSinceActivity >= INACTIVITY_DAYS;

  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", flexWrap: "wrap", borderRight: showInactiveWarning ? "3px solid var(--red)" : undefined }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, display:"flex", alignItems:"center", gap:8 }}>
          {client.name}
          {showInactiveWarning && <span style={{ fontSize: 13, color:"var(--red)", background:"rgba(192,57,43,0.1)", borderRadius:20, padding:"2px 8px", fontWeight:600 }}>⚠️ לא פעיל {daysSinceActivity >= 999 ? `${daysSinceWelcome}+` : daysSinceActivity} ימים</span>}
        </div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", display:"flex", flexWrap:"wrap", gap:"0 12px" }}>
          {client.last_active && <span style={{ color: "var(--text-mid)" }}>פעיל {formatRelativeTime(client.last_active)}</span>}
          {client.welcome_sent_at
            ? <span style={{ color: "var(--green-soft)" }}>✉️ מייל נשלח {new Date(client.welcome_sent_at).toLocaleDateString("he-IL")}</span>
            : client.email ? <span style={{ color: "var(--text-dim)" }}>✉️ טרם נשלח</span> : null}
          {!isBlocked && !client.portfolio_open && (
            <span style={{ color: done ? "var(--green-soft)" : "var(--gold)" }}>
              {done ? "✅ 3/3 חודשים" : `⏳ ${subCount}/3 חודשים`}
            </span>
          )}
          {!isBlocked && client.portfolio_open && <span style={{ color: "var(--green-mid)" }}>📁 תיק פעיל</span>}
          {!isBlocked && !client.portfolio_open && done && <span style={{ color: "var(--gold)" }}>ממתין לפתיחת תיק</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{
          padding: "5px 14px", borderRadius: 20, fontSize: 14, fontWeight: 700,
          background: isBlocked ? "rgba(192,57,43,0.12)" : "rgba(46,125,82,0.12)",
          color: isBlocked ? "var(--red)" : "var(--green-mid)",
        }}>
          {isBlocked ? "🔒 חסום" : "✅ פעיל"}
        </span>
        <Btn variant="ghost" size="sm" onClick={() => onOpen(client)}>👁 פרטים</Btn>
        {!client.portfolio_open && <ReminderEmailBtn client={client} />}
        {done && !client.portfolio_open && !isBlocked && (
          <Btn variant="success" size="sm" onClick={async () => {
            await supabase.from("clients").update({ portfolio_open: true }).eq("id", client.id);
            onOpen(client);
          }}>📁 פתח תיק כלכלי</Btn>
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
  if (!items.length) return <div style={{ fontSize: 15, color:"var(--text-dim)", marginBottom:16 }}>אין קבצים שהועלו עדיין</div>;

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
          <button onClick={toggleAll} style={{ background:"none", border:"1px solid var(--border)", borderRadius:7, padding:"5px 12px", fontSize: 14, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}>
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
            <div style={{ fontSize: 15, fontWeight:600 }}>{item.label}</div>
            <div style={{ fontSize: 13, color:"var(--text-dim)" }}>{item.sub}</div>
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
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15, color:"var(--text-mid)" }}>💼 תלושים ישנים (ללא קובץ)</div>
      {payslips.map(p => (
        <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px", background:"var(--surface2)", borderRadius:8, marginBottom:4, fontSize: 14 }}>
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
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                {idx === 1 ? "👤 בן/בת זוג ראשון/ה" : "👥 בן/בת זוג שני/ה"}
                {done && <span style={{ background: "rgba(46,204,138,0.15)", color: "#22c55e", borderRadius: 20, padding: "2px 10px", fontSize: 14, fontWeight: 700 }}>✓ הושלם</span>}
              </div>
            )}
            {!row ? (
              <div style={{ color: "var(--text-dim)", fontSize: 15, marginBottom: 8 }}>טרם מולאו תשובות</div>
            ) : (
              QUESTIONNAIRE_QUESTIONS.map((q, i) => (
                <Card key={i} style={{ marginBottom: 10, padding: "14px 18px" }}>
                  <div style={{ fontSize: 14, color: "var(--text-mid)", fontWeight: 600, marginBottom: 6 }}>{i + 1}. {q}</div>
                  <div style={{ fontSize: 15, color: answers[i] ? "var(--text)" : "var(--text-dim)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
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
  const [visitedAdminTabs, setVisitedAdminTabs] = useState<Set<string>>(() => new Set([client.startTab || "intake"]));
  const switchAdminTab = (id) => {
    setActiveTab(id);
    setVisitedAdminTabs(prev => { const next = new Set(prev); next.add(id); return next; });
  };
  const [portfolioTab, setPortfolioTab] = useState("control");
  const [newCatCount, setNewCatCount] = useState(0);
  const [logSeenAt, setLogSeenAt] = useState<string | null>(null);

  // טען מספר קטגוריות שנוצרו על ידי הלקוח מאז הפעם האחרונה שנצפה הלוג
  useEffect(() => {
    const seenKey = `log_seen_${client.id}`;
    const seen = localStorage.getItem(seenKey);
    setLogSeenAt(seen);
    // אם לא נצפה מעולם — הצג רק 30 יום אחורה (לא כל ההיסטוריה)
    const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    supabase.from("client_change_log")
      .select("id", { count: "exact" })
      .eq("client_id", client.id)
      .eq("event_type", "category_created")
      .gte("created_at", seen || defaultSince)
      .then(({ count }) => setNewCatCount(count || 0));
  }, [client.id]);

  const markLogSeen = () => {
    const now = new Date().toISOString();
    localStorage.setItem(`log_seen_${client.id}`, now);
    setLogSeenAt(now);
    setNewCatCount(0);
  };

  const tabs = [
    { id: "intake", label: "📋 פגישה ראשונה" },
    { id: "required_docs", label: "📌 מסמכים נדרשים" },
    { id: "data", label: "תיק מסמכים" },
    { id: "questionnaire", label: "📝 שאלון" },
    ...(client.portfolio_open ? [{ id: "portfolio", label: "📁 תיק כלכלי" }] : []),
    ...(client.portfolio_open ? [{ id: "scenario", label: "📊 תסריט תקציבי" }] : []),
    { id: "log", label: "📋 לוג שינויים", badge: newCatCount },
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
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>👤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{client.name}</div>
            <div style={{ fontSize: 14, color: "var(--text-dim)" }}>@{client.username} · {client.submissions.length} הגשות · {client.mappings.length} מיפויים</div>
          </div>
          {done && !client.portfolio_open && (
            <Btn onClick={async () => {
              await supabase.from("clients").update({ portfolio_open: true }).eq("id", client.id);
              onRefresh();
            }}>📁 פתח תיק כלכלי</Btn>
          )}
        </div>
      </Card>

      {/* Banner — new client-created categories */}
      {newCatCount > 0 && activeTab !== "log" && (
        <div style={{ marginBottom: 16, background: "rgba(251,191,36,0.12)", border: "2px solid rgba(251,191,36,0.5)", borderRadius: 12, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 700, color: "var(--gold)" }}>⚠️ הלקוח יצר {newCatCount} קטגוריות חדשות</span>
            <span style={{ fontSize: 15, color: "var(--text-dim)", marginRight: 8 }}>— ראה בלוג שינויים</span>
          </div>
          <Btn size="sm" onClick={() => { switchAdminTab("log"); markLogSeen(); }}>עבור ללוג</Btn>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { switchAdminTab(t.id); if (t.id === "log") markLogSeen(); }} style={{ padding: "10px 18px", fontSize: 15, fontFamily: "inherit", fontWeight: activeTab === t.id ? 700 : 400, color: activeTab === t.id ? "var(--green-mid)" : "var(--text-dim)", background: "none", border: "none", borderBottom: `2px solid ${activeTab === t.id ? "var(--green-mid)" : "transparent"}`, cursor: "pointer", marginBottom: -1, display: "flex", alignItems: "center", gap: 6 }}>
            {t.label}
            {(t as any).badge > 0 && (
              <span style={{ background: "var(--red)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 13, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                {(t as any).badge}
              </span>
            )}
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
                    <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{new Date(s.created_at).toLocaleDateString("he-IL")} · {txs.length} עסקאות</div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ fontWeight: 700, color: "var(--red)", fontSize: 18 }}>₪{Math.round(total).toLocaleString()}</div>
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
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
              <button key={t.id} onClick={() => setPortfolioTab(t.id)} style={{ padding: "8px 16px", fontSize: 14, fontFamily: "inherit", fontWeight: portfolioTab === t.id ? 700 : 400, color: portfolioTab === t.id ? "var(--text)" : "var(--text-dim)", background: portfolioTab === t.id ? "var(--surface2)" : "transparent", border: `1px solid ${portfolioTab === t.id ? "var(--border)" : "transparent"}`, borderRadius: 8, cursor: "pointer" }}>
                {t.label}
              </button>
            ))}
          </div>
          <ComingSoon label={portfolioTabs.find(t => t.id === portfolioTab)?.label} />
        </div>
      )}

      {/* SCENARIO TAB (lazy mount) */}
      {visitedAdminTabs.has("scenario") && (
        <div style={{ display: activeTab === "scenario" ? "block" : "none" }}>
          <ScenarioTab client={client} />
        </div>
      )}

      {/* LOG TAB (lazy mount) */}
      {visitedAdminTabs.has("log") && (
        <div style={{ display: activeTab === "log" ? "block" : "none" }}>
          <ChangeLogTab clientId={client.id} clientName={client.name} clientLastName={client.last_name} />
        </div>
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
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 16, marginBottom: 6 }}>הסעיף הזה נמצא בפיתוח ובבנייה</div>
      <div style={{ color: "var(--text-dim)", fontSize: 14 }}>בקרוב תוכל לנהל כאן את כל הנתונים הפיננסיים של הלקוח</div>
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
  const isBlocked = client.is_blocked || false;

  const toggleBlock = async () => {
    const action = isBlocked ? "שחרר" : "חסום";
    if (!window.confirm(`${action} את ${client.name}?`)) return;
    setLoading(true);
    const { error } = await supabase.from("clients").update({ is_blocked: !isBlocked }).eq("id", client.id);
    if (error) showMsg("❌ שגיאה");
    else { showMsg(isBlocked ? "✅ הלקוח שוחרר" : "✅ הלקוח נחסם"); onRefresh(); }
    setLoading(false);
  };

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
    // Update via Supabase Auth only (no plaintext stored)
    const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
      body: { action: "update_password", clientId: client.id, password: newPass },
    });
    if (fnErr || !authResult?.ok) {
      showMsg("❌ שגיאה בעדכון סיסמה: " + (authResult?.error || fnErr?.message));
    } else {
      showMsg("✅ הסיסמה עודכנה"); setNewPass(""); setConfirmPass("");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {/* Details card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>👤 פרטי לקוח</div>
        <Input label="שם מלא" value={editName} onChange={e => setEditName(e.target.value)} />
        <Input label="מייל" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@gmail.com" />
        <Input label="טלפון" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="050-0000000" />
        <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "var(--text-dim)", marginBottom: 14 }}>
          <div style={{ marginBottom: 4 }}>שם משתמש לכניסה</div>
          <div style={{ color: "var(--text)", fontWeight: 600 }}>@{client.username}</div>
        </div>
        {msg && <div style={{ fontSize: 14, color: msg.startsWith("✅") ? "var(--green-soft)" : "var(--red)", marginBottom: 12 }}>{msg}</div>}
        <Btn onClick={saveDetails} disabled={loading}>שמור שינויים</Btn>
      </Card>

      {/* Password card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>🔐 שינוי סיסמה</div>
        <Input label="סיסמה חדשה" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="לפחות 4 תווים" />
        <Input label="אימות סיסמה" type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="הכנס שוב את הסיסמה" />
        {msg && <div style={{ fontSize: 14, color: msg.startsWith("✅") ? "var(--green-soft)" : "var(--red)", marginBottom: 12 }}>{msg}</div>}
        <Btn onClick={changePassword} disabled={loading || !newPass || !confirmPass}>עדכן סיסמה</Btn>
      </Card>

      {/* Block card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>🔒 ניהול גישה</div>
        <div style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 14 }}>
          {isBlocked ? "הלקוח חסום — לא יכול להתחבר לאפליקציה." : "הלקוח פעיל — יכול להתחבר לאפליקציה."}
        </div>
        <Btn variant={isBlocked ? "secondary" : "danger"} onClick={toggleBlock} disabled={loading}>
          {isBlocked ? "🔓 שחרר לקוח" : "🔒 חסום לקוח"}
        </Btn>
      </Card>

      {/* Welcome email card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📧 שלח הוראות כניסה</div>
        <WelcomeEmailCard name={client.name} last_name={client.last_name || ""} username={client.username} email={client.email || ""} clientId={client.id} onSent={onRefresh} />
      </Card>

      {/* Info card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>📋 מידע נוסף</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "תאריך הצטרפות", value: new Date(client.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" }) },
            { label: "הגשות", value: `${client.submissions.length} / 3` },
            { label: "מיפויים שנזכרו", value: client.mappings.length },
            { label: "סטטוס תיק", value: client.portfolio_open ? "פעיל 📁" : "טרם נפתח" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${"var(--border)"}22`, fontSize: 15 }}>
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
        <div style={{ fontWeight: 700, fontSize: 16 }}>⬇️ ייצוא לאקסל</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={toggleAll} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 12px", fontSize: 14, color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit" }}>
            {allSelected ? "בטל הכל" : "בחר הכל"}
          </button>
          <Btn size="sm" onClick={doExport} disabled={selected.length === 0}>
            ייצוא {selected.length > 0 ? `(${selected.length})` : ""}
          </Btn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {submissions.map(s => (
          <div key={s.id} onClick={() => toggle(s.id)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 14, cursor: "pointer", border: `1px solid ${selected.includes(s.id) ? "var(--green-mid)" : "var(--border)"}`, background: selected.includes(s.id) ? "rgba(79,142,247,0.12)" : "var(--surface2)", color: selected.includes(s.id) ? "var(--green-mid)" : "var(--text-dim)", fontWeight: selected.includes(s.id) ? 600 : 400 }}>
            {selected.includes(s.id) ? "✓ " : ""}{s.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── לוג שינויים ──────────────────────────────────────────────────────────────
function ChangeLogTab({ clientId, clientName, clientLastName }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    setLoading(true);
    supabase.from("client_change_log")
      .select("*").eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) console.error("change_log load error:", error);
        setLogs(data || []);
        setLoading(false);
      });
  }, [clientId]);

  const EVENT_LABELS = {
    remap_business:    "שינוי שיוך",
    add_category:      "הוספת סעיף",
    edit_budget:       "שינוי יעד",
    reset_balance:     "איפוס יתרה",
    manual_entry:      "הזנה ידנית",
    category_created:  "קטגוריה חדשה (לקוח)",
  };

  const EVENT_COLORS = {
    remap_business:    "var(--green-mint)",
    add_category:      "var(--gold-light)",
    edit_budget:       "rgba(79,142,247,0.1)",
    reset_balance:     "var(--red-light)",
    manual_entry:      "var(--surface2)",
    category_created:  "rgba(251,191,36,0.15)",
  };

  const filtered = logs.filter(l => {
    if (filter !== "all" && l.event_type !== filter) return false;
    if (!l.created_at) return true;
    if (dateFrom && new Date(l.created_at) < new Date(dateFrom)) return false;
    if (dateTo && new Date(l.created_at) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });

  const detailsToText = (log) => {
    const d = log.details || {};
    switch (log.event_type) {
      case "remap_business": return `בית עסק: ${d.business_name} | ${d.from_cat || "?"} → ${d.to_cat}`;
      case "add_category":   return `סעיף חדש: ${d.category_name} | יעד: ₪${d.amount}`;
      case "edit_budget":    return `סעיף: ${d.category_name} | ₪${d.old_amount} → ₪${d.new_amount}`;
      case "reset_balance":  return `סעיף: ${d.category_name || "כלל"} | יתרה שאופסה: ₪${d.balance} | ${d.note || ""}`;
      case "manual_entry":      return `סעיף: ${d.category_name} | ₪${d.amount} | ${d.description}`;
      case "category_created":  return `קטגוריה: ${d.category_name} | סוג: ${d.budget_type || "משתנה"}`;
      default:               return JSON.stringify(d);
    }
  };

  const renderDetails = (log) => {
    const d = log.details || {};
    switch (log.event_type) {
      case "remap_business":
        return (
          <span>
            בית עסק: <strong>{d.business_name}</strong>
            {" | סיווג אוטומטי: "}
            <span style={{ color: "var(--text-dim)" }}>{d.from_cat || "לא ידוע"}</span>
            {" → סיווג חדש: "}
            <strong style={{ color: "var(--green-deep)" }}>{d.to_cat}</strong>
          </span>
        );
      case "add_category":
        return <span>סעיף חדש: <strong>{d.category_name}</strong> | יעד: ₪{d.amount}</span>;
      case "edit_budget":
        return <span>סעיף: <strong>{d.category_name}</strong> | ₪{d.old_amount} → <strong>₪{d.new_amount}</strong></span>;
      case "reset_balance":
        return <span>סעיף: <strong>{d.category_name || "כלל"}</strong> | יתרה שאופסה: ₪{d.balance} | {d.note}</span>;
      case "manual_entry":
        return <span>סעיף: <strong>{d.category_name}</strong> | ₪{d.amount} | {d.description}</span>;
      case "category_created":
        return <span>קטגוריה חדשה: <strong>{d.category_name}</strong> | סוג: {d.budget_type || "משתנה"}</span>;
      default:
        return <span>{JSON.stringify(d)}</span>;
    }
  };

  const exportToExcel = () => {
    const XLSX = (window as any).XLSX;
    if (!XLSX) { alert("ספריית Excel לא נטענה"); return; }
    const rows = filtered.map(l => {
      const d = l.details || {};
      return {
        "תאריך": new Date(l.created_at).toLocaleString("he-IL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        "שם פרטי": clientName || "",
        "שם משפחה": clientLastName || "",
        "סיווג אוטומטי": l.event_type === "remap_business" ? (d.from_cat || "") : "",
        "סיווג חדש": l.event_type === "remap_business" ? (d.to_cat || "") : "",
        "סוג פעולה": EVENT_LABELS[l.event_type] || l.event_type,
        "פרטים נוספים": l.event_type !== "remap_business" ? detailsToText(l) : (d.business_name || ""),
      };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "לוג שינויים");
    XLSX.writeFile(wb, `לוג_שינויים_${clientName || clientId}.xlsx`);
  };

  if (loading) return <div style={{ color: "var(--text-dim)", padding: 32 }}>טוען...</div>;

  return (
    <div>
      {/* שורת כלים */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[["all", "הכל"], ...Object.entries(EVENT_LABELS)].map(([k, v]) => (
          <button key={k} onClick={() => setFilter(k)}
            style={{ padding: "5px 14px", borderRadius: 20, fontSize: 15, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${filter === k ? "var(--green-mid)" : "var(--border)"}`,
              background: filter === k ? "var(--green-mint)" : "transparent",
              color: filter === k ? "var(--green-deep)" : "var(--text-mid)", fontWeight: filter === k ? 600 : 400 }}>
            {v}
          </button>
        ))}
      </div>

      {/* סינון תאריך + ייצוא */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 14, color: "var(--text-dim)" }}>מתאריך</label>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          style={{ fontSize: 15, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit" }} />
        <label style={{ fontSize: 14, color: "var(--text-dim)" }}>עד תאריך</label>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          style={{ fontSize: 15, padding: "4px 8px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit" }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { setDateFrom(""); setDateTo(""); }}
            style={{ fontSize: 14, padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer", fontFamily: "inherit" }}>
            נקה
          </button>
        )}
        <div style={{ marginRight: "auto" }}>
          <button onClick={exportToExcel} disabled={filtered.length === 0}
            style={{ fontSize: 15, padding: "5px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", cursor: filtered.length === 0 ? "default" : "pointer", fontFamily: "inherit", opacity: filtered.length === 0 ? 0.5 : 1 }}>
            📥 ייצוא Excel ({filtered.length})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}>אין שינויים</div>
      ) : filtered.map(log => (
        <div key={log.id} style={{ marginBottom: 8, padding: "12px 16px", borderRadius: 12, background: EVENT_COLORS[log.event_type] || "var(--surface2)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--green-deep)", marginLeft: 8 }}>
                {EVENT_LABELS[log.event_type] || log.event_type}
              </span>
              <span style={{ fontSize: 15, color: "var(--text)" }}>{renderDetails(log)}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
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
  const [docNotes, setDocNotes]         = useState<Record<string,string>>(client.doc_notes || {});
  const [customDocs, setCustomDocs]     = useState<{id:string;label:string}[]>(client.custom_docs || []);
  const [newCustom, setNewCustom]       = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [docProgress, setDocProgress]   = useState<{done: string[]; partial: string[]}>({ done: [], partial: [] });

  useEffect(() => {
    supabase.from("client_documents").select("category, marked_done, files")
      .eq("client_id", client.id)
      .then(({ data }) => {
        if (!data) return;
        const done = data.filter(d => d.marked_done).map(d => d.category);
        const partial = data.filter(d => !d.marked_done && d.files?.length > 0).map(d => d.category);
        setDocProgress({ done, partial });
      });
  }, [client.id]);

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
    const { error } = await supabase.from("clients").update({ required_docs: selected, questionnaire_spouses: spouses, doc_notes: docNotes, custom_docs: customDocs }).eq("id", client.id);
    setSaving(false);
    if (error) { setSaveError("שגיאה בשמירה: " + error.message); return; }
    setSaved(true);
    onRefresh();
    setTimeout(() => setSaved(false), 3000);
  };

  const cur = selected || [];
  const isNull = selected === null;
  const allOptions = [
    ...ALL_REQUIRED_DOC_OPTIONS,
    ...customDocs,
    { id: "questionnaire", label: "שאלון אישי", icon: "📝" },
  ];

  // progress
  const DOC_ID_MAP: Record<string,string> = { loans:"loans_section", provident:"provident_fund", pl:"profit_loss", savings:"savings_pension", retirement:"retirement_forecast", checks:"deferred_checks", debts_other:"debts_other" };
  const totalSelected = cur.filter(id => id !== "questionnaire").length;
  const doneCount = cur.filter(id => {
    const cat = DOC_ID_MAP[id] || id;
    return docProgress.done.includes(cat);
  }).length;
  const partialCount = cur.filter(id => {
    const cat = DOC_ID_MAP[id] || id;
    return docProgress.partial.includes(cat);
  }).length;

  const addCustomDoc = () => {
    const label = newCustom.trim();
    if (!label) return;
    const id = "custom_" + Date.now();
    setCustomDocs(p => [...p, { id, label, icon: "📄" } as any]);
    setSelected(p => [...(p||[]), id]);
    setNewCustom("");
    setShowCustomInput(false);
    setSaved(false);
  };

  return (
    <div>
      {/* Spouse count modal */}
      {showSpouseModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:16, padding:32, maxWidth:360, width:"90%", textAlign:"center" }}>
            <div style={{ fontWeight:700, fontSize: 19, marginBottom:8 }}>📝 שאלון אישי</div>
            <div style={{ fontSize: 16, color:"var(--text-dim)", marginBottom:24 }}>כמה בני זוג ממלאים שאלון?</div>
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={() => selectSpouses(1)} style={{ padding:"14px 28px", borderRadius:12, border:"2px solid var(--green-mid)", background:"transparent", color:"var(--green-mid)", fontWeight:700, fontSize: 17, cursor:"pointer", fontFamily:"inherit" }}>
                👤 בן/בת זוג אחד/ת
              </button>
              <button onClick={() => selectSpouses(2)} style={{ padding:"14px 28px", borderRadius:12, border:"2px solid var(--green-mid)", background:"var(--green-mid)", color:"white", fontWeight:700, fontSize: 17, cursor:"pointer", fontFamily:"inherit" }}>
                👥 שני בני זוג
              </button>
            </div>
            <button onClick={() => setShowSpouseModal(false)} style={{ marginTop:16, fontSize: 15, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer" }}>ביטול</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontWeight:700, fontSize: 17 }}>📌 מסמכים נדרשים — {client.name}</div>
          <div style={{ fontSize: 14, color:"var(--text-dim)", marginTop:4 }}>
            {isNull ? "לא הוגדר — הלקוח לא רואה כלום" : cur.length === 0 ? "לא נבחרו — הלקוח לא רואה אף סעיף" : `נבחרו ${cur.length} סעיפים`}
            {spouses && <span style={{ marginRight:8, color:"var(--green-mid)" }}>· שאלון: {spouses === 1 ? "בן/בת זוג אחד/ת" : "שני בני זוג"}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {saved && <span style={{ fontSize: 15, color:"var(--green-soft)" }}>✅ נשמר</span>}
          {saveError && <span style={{ fontSize: 15, color:"var(--red)" }}>⚠️ {saveError}</span>}
          <Btn variant="secondary" size="sm" onClick={selectAll}>בחר הכל</Btn>
          <Btn variant="secondary" size="sm" onClick={clearAll}>נקה הכל</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? "שומר..." : "💾 שמור"}</Btn>
        </div>
      </div>

      {/* Progress bar */}
      {totalSelected > 0 && (
        <div style={{ marginBottom:16, background:"var(--surface2)", borderRadius:10, padding:"12px 16px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize: 14, marginBottom:6 }}>
            <span style={{ color:"var(--text-dim)" }}>התקדמות הגשת מסמכים</span>
            <span style={{ fontWeight:700, color: doneCount===totalSelected ? "var(--green-mid)" : "var(--text-mid)" }}>{doneCount}/{totalSelected}</span>
          </div>
          <div style={{ height:8, background:"var(--border)", borderRadius:4, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${totalSelected>0?(doneCount/totalSelected)*100:0}%`, background:"var(--green-mid)", borderRadius:4, transition:"width 0.3s" }} />
          </div>
          {partialCount > 0 && <div style={{ fontSize: 13, color:"var(--gold)", marginTop:4 }}>⏳ {partialCount} מסמכים בתהליך</div>}
        </div>
      )}

      <Card>
        {allOptions.map((opt, i) => {
          const cat = DOC_ID_MAP[opt.id] || opt.id;
          const isDone = docProgress.done.includes(cat);
          const isPartial = docProgress.partial.includes(cat);
          return (
            <div key={opt.id}>
              <div onClick={() => toggle(opt.id)} style={{
                display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
                borderBottom: "none",
                cursor:"pointer",
                background: cur.includes(opt.id) ? "rgba(46,204,138,0.04)" : "transparent",
              }}>
                <div style={{
                  width:22, height:22, borderRadius:6, border:`2px solid ${cur.includes(opt.id) ? "var(--green-mid)" : "var(--border)"}`,
                  background: cur.includes(opt.id) ? "var(--green-mid)" : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>
                  {cur.includes(opt.id) && <span style={{ color:"white", fontSize: 15, fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 20 }}>{(opt as any).icon}</span>
                <div style={{ flex:1 }}>
                  <span style={{ fontSize: 16, fontWeight: cur.includes(opt.id) ? 600 : 400 }}>{opt.label}</span>
                  {opt.id === "questionnaire" && cur.includes("questionnaire") && spouses && (
                    <span style={{ fontSize: 14, color:"var(--green-mid)", marginRight:8 }}>({spouses === 1 ? "בן/בת זוג אחד/ת" : "שני בני זוג"}) <button onClick={e=>{e.stopPropagation();setShowSpouseModal(true);}} style={{ fontSize: 13, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer", textDecoration:"underline" }}>שנה</button></span>
                  )}
                </div>
                {cur.includes(opt.id) && opt.id !== "questionnaire" && (
                  <span style={{ fontSize: 13, fontWeight:600, padding:"2px 8px", borderRadius:20,
                    background: isDone ? "rgba(46,204,138,0.12)" : isPartial ? "rgba(255,193,7,0.15)" : "var(--surface2)",
                    color: isDone ? "var(--green-mid)" : isPartial ? "var(--gold)" : "var(--text-dim)" }}>
                    {isDone ? "✅ הוגש" : isPartial ? "⏳ חלקי" : "⬜ טרם הוגש"}
                  </span>
                )}
              </div>
              {/* Note field — shown when selected */}
              {cur.includes(opt.id) && opt.id !== "questionnaire" && (
                <div onClick={e=>e.stopPropagation()} style={{ padding:"0 16px 12px 16px", marginRight:50 }}>
                  <input
                    value={docNotes[opt.id] || ""}
                    onChange={e => { setDocNotes(p => ({...p,[opt.id]:e.target.value})); setSaved(false); }}
                    placeholder="הוסף הנחיה ללקוח (אופציונלי) — למשל: 3 חודשים אחרונים מבנק מזרחי"
                    style={{ width:"100%", boxSizing:"border-box", fontSize: 14, padding:"6px 10px", borderRadius:6, border:"1px dashed var(--border)", background:"var(--surface2)", color:"var(--text)", fontFamily:"inherit", outline:"none" }}
                  />
                </div>
              )}
              {i < allOptions.length-1 && <div style={{ height:1, background:"rgba(0,0,0,0.05)", marginRight:16, marginLeft:16 }} />}
            </div>
          );
        })}

        {/* מסמך מותאם אישית */}
        <div style={{ padding:"12px 16px", borderTop:"1px dashed var(--border)" }}>
          {!showCustomInput ? (
            <button onClick={()=>setShowCustomInput(true)} style={{ background:"none", border:"none", color:"var(--green-mid)", fontSize: 15, cursor:"pointer", fontFamily:"inherit", fontWeight:600 }}>
              + הוסף מסמך מותאם אישית
            </button>
          ) : (
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input
                value={newCustom}
                onChange={e=>setNewCustom(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addCustomDoc()}
                placeholder="שם המסמך..."
                autoFocus
                style={{ flex:1, padding:"7px 10px", borderRadius:6, border:"1px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontSize: 15, fontFamily:"inherit", outline:"none" }}
              />
              <Btn size="sm" onClick={addCustomDoc} disabled={!newCustom.trim()}>הוסף</Btn>
              <Btn size="sm" variant="ghost" onClick={()=>{setShowCustomInput(false);setNewCustom("");}}>ביטול</Btn>
            </div>
          )}
        </div>
      </Card>

      <div style={{ marginTop:12, fontSize: 14, color:"var(--text-dim)" }}>
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
      { key: "why_came", label: "למה הגיעו אליך?", type: "textarea", placeholder: "מה הניע אותם לפנות דווקא עכשיו?" },
      { key: "why_situation", label: "למה לדעתם הגיעו למצב הנוכחי?", type: "textarea", placeholder: "חוסר ידע, הרגלים, אירוע מסוים..." },
      { key: "emotional_state", label: "מצב רגשי ורמת מוטיבציה", type: "textarea", placeholder: "מתוחים / נינוחים, נחושים / מהססים..." },
    ],
  },
  {
    id: "family",
    title: "👨‍👩‍👧 פרטי המשפחה",
    fields: [
      { key: "_spouse1_header", label: "", type: "header", text: "בן/בת זוג ראשון" },
      { key: "spouse1_name",        label: "שם",                                type: "text" },
      { key: "spouse1_age",         label: "גיל",                               type: "text" },
      { key: "spouse1_job",         label: "עיסוק",                             type: "text" },
      { key: "spouse1_salary",      label: "שכר חודשי ברוטו (₪)",              type: "number" },
      { key: "spouse1_salary_net",  label: "שכר חודשי נטו (₪)",               type: "number" },
      { key: "spouse1_notes",       label: "הערות (תואר, תנאים מיוחדים...)",  type: "textarea" },
      { key: "_spouse2_header", label: "", type: "header", text: "בן/בת זוג שני" },
      { key: "spouse2_name",        label: "שם",                                type: "text" },
      { key: "spouse2_age",         label: "גיל",                               type: "text" },
      { key: "spouse2_job",         label: "עיסוק",                             type: "text" },
      { key: "spouse2_salary",      label: "שכר חודשי ברוטו (₪)",              type: "number" },
      { key: "spouse2_salary_net",  label: "שכר חודשי נטו (₪)",               type: "number" },
      { key: "spouse2_notes",       label: "הערות",                             type: "textarea" },
      { key: "_children_header", label: "", type: "header", text: "ילדים, תלויים וחיות" },
      { key: "children",       label: "ילדים — כמה, גילים, חוגים / טיפול מיוחד / פנימיות", type: "textarea" },
      { key: "dependents",     label: "תלויים נוספים (הורים, אחים וכו')", type: "textarea", placeholder: "האם מישהו תלוי בהם פיננסית?" },
      { key: "pets",           label: "חיות מחמד — סוג, גיל, עלויות שוטפות (וטרינר, מזון)", type: "textarea" },
    ],
  },
  {
    id: "housing",
    title: "🏠 מגורים ונכסים",
    fields: [
      { key: "_housing_header", label: "", type: "header", text: "מגורים" },
      { key: "housing_type", label: "סוג מגורים", type: "text", placeholder: "בעלות / שכירות" },
      { key: "housing_rent", label: "שכר דירה חודשי (₪) — אם בשכירות", type: "number" },
      { key: "_apt1_header", label: "", type: "header", text: "דירה ראשונה (אם בבעלות)" },
      { key: "apt1_details", label: "חדרים, מיקום, שווי משוער", type: "textarea" },
      { key: "apt1_mortgage", label: "משכנתה חודשית (₪)", type: "number" },
      { key: "apt1_rented", label: "האם מושכרת?", type: "text", placeholder: "כן / לא — ואם כן, כמה גובים?" },
      { key: "_apt2_header", label: "", type: "header", text: "דירה נוספת (אם יש)" },
      { key: "apt2_details", label: "חדרים, מיקום, שווי משוער", type: "textarea" },
      { key: "apt2_mortgage", label: "משכנתה חודשית (₪)", type: "number" },
      { key: "apt2_rented", label: "האם מושכרת?", type: "text", placeholder: "כן / לא — ואם כן, כמה גובים?" },
      { key: "_assets_header", label: "", type: "header", text: "נכסים נוספים" },
      { key: "car", label: "רכב — שנה, מצב. האם דורש תיקונים תכופים?", type: "textarea" },
      { key: "investments", label: "השקעות", type: "textarea" },
      { key: "pension_fund", label: "קרנות השתלמות / קופות גמל", type: "textarea" },
      { key: "pension_pct", label: "% הפרשה לפנסיה (מעסיק)", type: "text" },
      { key: "other_assets", label: "נכסים נוספים", type: "textarea" },
    ],
  },
  {
    id: "debts",
    title: "💳 חובות ואשראי",
    fields: [
      { key: "overdraft", label: "אוברדראפט — כמה ומאיפה (₪)", type: "number" },
      { key: "monthly_deficit", label: "גרעון חודשי משוער לפי תחושתם (₪)", type: "number" },
      { key: "credit_cards_count", label: "כמה כרטיסי אשראי יש?", type: "text" },
      { key: "credit_cards_debt", label: "חוב כולל בכרטיסי אשראי (₪)", type: "number" },
      { key: "garnishment", label: "האם יש עיקולים או הגבלות בנקאיות?", type: "text", placeholder: "כן / לא — פרט אם כן" },
      { key: "loan_cycle", label: "האם נוטים לקחת הלוואה לכיסוי הלוואה קיימת?", type: "text", placeholder: "כן / לא / לפעמים" },
    ],
  },
  {
    id: "loans",
    title: "🏦 הלוואות",
    fields: [
      { key: "_loans_table", label: "", type: "loans_table" },
    ],
  },
  {
    id: "goals",
    title: "🎯 יעדים ותכנונים",
    fields: [
      { key: "success_definition", label: "מה ההגדרה שלהם להצלחה?", type: "textarea", placeholder: "בעוד שנה, מה ישמח אותם?" },
      { key: "goals_short", label: "יעדים לטווח קצר (עד שנה)", type: "textarea" },
      { key: "goals_long", label: "יעדים לטווח ארוך (3-10 שנים)", type: "textarea" },
      { key: "planned_expenses", label: "הוצאות עתידיות צפויות (רכב, חתונה, שיפוץ...)", type: "textarea" },
      { key: "expected_changes", label: "שינויים צפויים בהכנסה/הוצאות", type: "textarea" },
      { key: "earning_potential", label: "פוטנציאל השתכרות נוסף", type: "textarea", placeholder: "קידום צפוי, עסק צד, בן/בת זוג חוזר לעבוד..." },
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
      { key: "client_quote", label: "ציטוט — מה הם אמרו שהם רוצים להשיג", type: "textarea", placeholder: "משפט מדויק בלשונם" },
      { key: "first_impression", label: "רושם ראשוני", type: "textarea" },
      { key: "key_challenges", label: "אתגרים מרכזיים שזוהו", type: "textarea" },
      { key: "action_items", label: "צעדי פעולה מיידיים", type: "textarea" },
      { key: "misc", label: "הערות נוספות", type: "textarea" },
    ],
  },
];

function LoansTable({ loans, onChange }: { loans: {desc:string;amount:string;monthly:string}[]; onChange: (v: any[]) => void }) {
  const rows = loans?.length ? loans : [];
  const total_amount = rows.reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
  const total_monthly = rows.reduce((s,r) => s + (parseFloat(r.monthly)||0), 0);
  const addRow = () => onChange([...rows, { desc:"", amount:"", monthly:"" }]);
  const updateRow = (i, key, val) => { const next = rows.map((r,idx) => idx===i ? {...r,[key]:val} : r); onChange(next); };
  const removeRow = (i) => onChange(rows.filter((_,idx) => idx!==i));
  const cellStyle: React.CSSProperties = { padding: "6px 8px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--text)", fontSize: 15, fontFamily: "inherit", width: "100%" };
  return (
    <div>
      <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:"0 6px" }}>
        <thead>
          <tr style={{ fontSize: 14, color:"var(--text-dim)" }}>
            <th style={{ textAlign:"right", paddingBottom:4, fontWeight:600 }}>סוג הלוואה</th>
            <th style={{ textAlign:"right", paddingBottom:4, fontWeight:600 }}>סכום כולל (₪)</th>
            <th style={{ textAlign:"right", paddingBottom:4, fontWeight:600 }}>תשלום חודשי (₪)</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td><input value={row.desc} onChange={e=>updateRow(i,"desc",e.target.value)} style={cellStyle} placeholder="בנק, גמ״ח, רכב..." /></td>
              <td><input type="number" value={row.amount} onChange={e=>updateRow(i,"amount",e.target.value)} style={cellStyle} placeholder="0" /></td>
              <td><input type="number" value={row.monthly} onChange={e=>updateRow(i,"monthly",e.target.value)} style={cellStyle} placeholder="0" /></td>
              <td><button onClick={()=>removeRow(i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize: 18, padding:"0 4px" }}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && (
        <div style={{ display:"flex", gap:24, marginTop:8, fontSize: 15, color:"var(--text-mid)", fontWeight:600 }}>
          <span>סה"כ חוב: <strong style={{color:"var(--text)"}}>{total_amount.toLocaleString("he-IL")} ₪</strong></span>
          <span>סה"כ חודשי: <strong style={{color:"var(--text)"}}>{total_monthly.toLocaleString("he-IL")} ₪</strong></span>
        </div>
      )}
      <button onClick={addRow} style={{ marginTop:10, background:"none", border:"1px dashed var(--border)", borderRadius:8, padding:"6px 14px", fontSize: 14, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}>+ הוסף הלוואה</button>
    </div>
  );
}

function IntakeForm({ client }) {
  const [data, setData]       = useState<Record<string,any>>({});
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [openSection, setOpenSection] = useState("why");
  const autoSaveRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  useEffect(() => {
    supabase.from("client_intake").select("data,meeting_date").eq("client_id", client.id).maybeSingle()
      .then(({ data: row }) => {
        if (row?.data) setData(row.data);
        else setData({ meeting_date: new Date(client.created_at || Date.now()).toISOString().slice(0,10) });
        setLoaded(true);
      });
  }, [client.id]);

  const saveData = async (newData: Record<string,any>) => {
    setSaving(true);
    const { error } = await supabase.from("client_intake").upsert(
      [{ client_id: client.id, data: newData, updated_at: new Date().toISOString() }],
      { onConflict: "client_id" }
    );
    setSaving(false);
    if (error) { alert("שגיאה בשמירה — " + error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key, val) => {
    const newData = { ...data, [key]: val };
    setData(newData);
    setSaved(false);
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => saveData(newData), 2000);
  };

  const save = () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    saveData(data);
  };

  const filledCount = (section) => section.fields.filter(f =>
    f.type !== "header" && f.type !== "loans_table" &&
    data[f.key] !== undefined && data[f.key] !== null && String(data[f.key]).trim()
  ).length;
  const realFieldCount = (section) => section.fields.filter(f => f.type !== "header" && f.type !== "loans_table").length;

  // Summary numbers
  const s1net = parseFloat(data.spouse1_salary_net)||0;
  const s2net = parseFloat(data.spouse2_salary_net)||0;
  const totalIncome = s1net + s2net;
  const overdraft = parseFloat(data.overdraft)||0;
  const creditDebt = parseFloat(data.credit_cards_debt)||0;
  const loansTotal = (data.loans||[]).reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const totalDebt = overdraft + creditDebt + loansTotal;
  const monthlyDeficit = parseFloat(data.monthly_deficit)||0;

  if (!loaded) return <div style={{ color: "var(--text-dim)", padding: 32, textAlign: "center" }}>טוען...</div>;

  const fieldStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontSize: 15, fontFamily: "inherit", outline: "none" };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>📋 טופס פגישה ראשונה — {client.name}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saving && <span style={{ fontSize: 14, color: "var(--text-dim)" }}>שומר...</span>}
          {saved && !saving && <span style={{ fontSize: 14, color: "var(--green-soft)" }}>✅ נשמר</span>}
          <Btn onClick={save} disabled={saving}>💾 שמור</Btn>
        </div>
      </div>

      {/* תאריך פגישה */}
      <div style={{ marginBottom: 16, display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize: 15, color:"var(--text-dim)", fontWeight:600 }}>📅 תאריך פגישה:</span>
        <input type="date" value={data.meeting_date||""} onChange={e=>update("meeting_date",e.target.value)}
          style={{ ...fieldStyle, width:"auto", padding:"6px 10px" }} />
      </div>

      {/* Summary bar */}
      {(totalIncome > 0 || overdraft > 0 || totalDebt > 0 || monthlyDeficit > 0) && (
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16, background:"var(--surface2)", borderRadius:10, padding:"12px 16px" }}>
          {totalIncome > 0 && <div style={{ fontSize: 15 }}>💰 הכנסה נטו: <strong style={{color:"var(--green-mid)"}}>{totalIncome.toLocaleString("he-IL")} ₪</strong></div>}
          {overdraft > 0 && <div style={{ fontSize: 15 }}>🔴 אוברדראפט: <strong style={{color:"var(--red)"}}>{overdraft.toLocaleString("he-IL")} ₪</strong></div>}
          {totalDebt > 0 && <div style={{ fontSize: 15 }}>💳 חוב כולל: <strong style={{color:"var(--red)"}}>{totalDebt.toLocaleString("he-IL")} ₪</strong></div>}
          {monthlyDeficit > 0 && <div style={{ fontSize: 15 }}>📉 גרעון חודשי: <strong style={{color:"var(--gold)"}}>{monthlyDeficit.toLocaleString("he-IL")} ₪</strong></div>}
        </div>
      )}

      {INTAKE_SECTIONS.map(section => {
        const filled = filledCount(section);
        const total = realFieldCount(section);
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
              <span style={{ fontSize: 19 }}>{section.title.split(" ")[0]}</span>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{section.title.slice(section.title.indexOf(" ") + 1)}</div>
              {filled > 0 && <span style={{ fontSize: 13, color: "var(--green-mid)", background: "rgba(46,204,138,0.12)", borderRadius: 20, padding: "2px 10px" }}>{filled}/{total}</span>}
              <span style={{ color: "var(--text-dim)", fontSize: 15 }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            {isOpen && (
              <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", background: "var(--surface)" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {section.fields.map((field, fi) => {
                    if (field.type === "header") return (
                      <div key={field.key} style={{ fontWeight:700, fontSize: 15, color:"var(--green-mid)", borderBottom:"2px solid var(--green-mid)", paddingBottom:6, marginTop: fi === 0 ? 0 : 18, marginBottom:10 }}>
                        {field.text}
                      </div>
                    );
                    if (field.type === "loans_table") return (
                      <LoansTable key="loans" loans={data.loans||[]} onChange={v => update("loans", v)} />
                    );
                    if (field.type === "textarea") return (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500 }}>{field.label}</div>
                        <textarea value={data[field.key] || ""} onChange={e => update(field.key, e.target.value)} rows={3} style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }} placeholder={(field as any).placeholder || "..."} />
                      </div>
                    );
                    if (field.type === "number") return (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500 }}>{field.label}</div>
                        <input type="number" value={data[field.key] || ""} onChange={e => update(field.key, e.target.value)} style={fieldStyle} placeholder="0" />
                      </div>
                    );
                    return (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500 }}>{field.label}</div>
                        <input type="text" value={data[field.key] || ""} onChange={e => update(field.key, e.target.value)} style={fieldStyle} placeholder={(field as any).placeholder || "..."} />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}
