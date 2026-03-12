import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { Card, Btn, Input, C } from "./ui";

export default function AdminPanel({ onLogout }) {
  const [clients, setClients] = useState([]);
  const [view, setView] = useState("list"); // list | new | detail
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  useEffect(() => { loadClients(); }, []);

  const createClient = async () => {
    if (!form.name || !form.username || !form.password) return;
    const { error } = await supabase.from("clients").insert([{ ...form, created_at: new Date().toISOString() }]);
    if (error) { setMsg("❌ " + (error.message.includes("unique") ? "שם משתמש תפוס" : error.message)); return; }
    setMsg("✅ לקוח נוצר בהצלחה");
    setForm({ name: "", username: "", password: "" });
    loadClients();
    setView("list");
  };

  const deleteClient = async (id, name) => {
    if (!window.confirm(`למחוק את ${name}?`)) return;
    await supabase.from("submissions").delete().eq("client_id", id);
    await supabase.from("remembered_mappings").delete().eq("client_id", id);
    await supabase.from("clients").delete().eq("id", id);
    loadClients();
  };

  const openClient = async (client) => {
    const [{ data: subs }, { data: maps }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id)
    ]);
    setSelected({ ...client, submissions: subs || [], mappings: maps || [] });
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
    <div style={{ background: C.bg, minHeight: "100vh", color: "#e8eaf6" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg,${C.accent},${C.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📊</div>
          <div>
            <div style={{ fontWeight: 700 }}>מאזן חכם — ניהול</div>
            <div style={{ fontSize: 11, color: C.dim }}>פאנל אלון</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "list" && <Btn variant="ghost" size="sm" onClick={() => { setView("list"); setMsg(""); setSelected(null); }}>← חזור</Btn>}
          <Btn variant="ghost" size="sm" onClick={onLogout}>יציאה</Btn>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>
        {msg && (
          <div style={{ background: msg.startsWith("✅") ? "rgba(46,204,138,0.1)" : "rgba(247,92,92,0.1)", border: `1px solid ${msg.startsWith("✅") ? "rgba(46,204,138,0.3)" : "rgba(247,92,92,0.3)"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: msg.startsWith("✅") ? C.green : C.red }}>
            {msg}
          </div>
        )}

        {/* LIST */}
        {view === "list" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>לקוחות ({clients.length})</div>
              <Btn size="sm" onClick={() => { setView("new"); setMsg(""); }}>+ לקוח חדש</Btn>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 40, color: C.dim }}>טוען...</div>
            ) : clients.length === 0 ? (
              <Card style={{ textAlign: "center", padding: "48px 24px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ color: C.dim }}>אין לקוחות עדיין</div>
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
            {msg && <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{msg}</div>}
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
      <div style={{ width: 42, height: 42, borderRadius: 10, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700 }}>{client.name}</div>
        <div style={{ fontSize: 12, color: C.dim }}>
          @{client.username} · נוצר {new Date(client.created_at).toLocaleDateString("he-IL")}
          {subCount !== null && (
            <span style={{ marginRight: 8, color: done ? C.green : C.yellow }}>
              · {subCount}/3 חודשים {done ? "✅" : "⏳"}
            </span>
          )}
          {client.portfolio_open && <span style={{ marginRight: 8, color: C.accent }}>· 📁 תיק פעיל</span>}
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

// ── Client detail with tabs ───────────────────────────────────────────────────
function ClientDetail({ client, onRefresh }) {
  const REQUIRED = 3;
  const done = client.submissions.length >= REQUIRED;
  const [activeTab, setActiveTab] = useState(client.startTab || "data");
  const [portfolioTab, setPortfolioTab] = useState("control");

  const tabs = [
    { id: "data", label: "נתונים לתהליך בניה" },
    ...(client.portfolio_open ? [{ id: "portfolio", label: "📁 תיק כלכלי" }] : []),
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
          <div style={{ width: 48, height: 48, borderRadius: 12, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{client.name}</div>
            <div style={{ fontSize: 12, color: C.dim }}>@{client.username} · {client.submissions.length} הגשות · {client.mappings.length} מיפויים</div>
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
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "10px 18px", fontSize: 13, fontFamily: "inherit", fontWeight: activeTab === t.id ? 700 : 400, color: activeTab === t.id ? C.accent : C.dim, background: "none", border: "none", borderBottom: `2px solid ${activeTab === t.id ? C.accent : "transparent"}`, cursor: "pointer", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DATA TAB */}
      {activeTab === "data" && (
        <div>
          <ExportSection submissions={client.submissions} clientName={client.name} />
          <div style={{ fontWeight: 700, marginBottom: 12, marginTop: 24 }}>היסטוריית הגשות</div>
          {client.submissions.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32, color: C.dim }}>טרם הוגשו קבצים</Card>
          ) : client.submissions.map(s => {
            const txs = s.transactions || [];
            const total = txs.reduce((sum, t) => sum + t.amount, 0);
            return (
              <Card key={s.id} style={{ marginBottom: 10, padding: "14px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>{new Date(s.created_at).toLocaleDateString("he-IL")} · {txs.length} עסקאות</div>
                  </div>
                  <div style={{ fontWeight: 700, color: C.red, fontSize: 16 }}>₪{Math.round(total).toLocaleString()}</div>
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
                    <tr style={{ background: C.surface2 }}>
                      <th style={{ padding: "8px 14px", textAlign: "right", color: C.dim }}>בית עסק</th>
                      <th style={{ padding: "8px 14px", textAlign: "right", color: C.dim }}>סעיף</th>
                    </tr>
                  </thead>
                  <tbody>
                    {client.mappings.map(m => (
                      <tr key={m.id}>
                        <td style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}22` }}>{m.business_name}</td>
                        <td style={{ padding: "8px 14px", borderTop: `1px solid ${C.border}22`, color: C.accent }}>{m.category}</td>
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
              <button key={t.id} onClick={() => setPortfolioTab(t.id)} style={{ padding: "8px 16px", fontSize: 12, fontFamily: "inherit", fontWeight: portfolioTab === t.id ? 700 : 400, color: portfolioTab === t.id ? "#e8eaf6" : C.dim, background: portfolioTab === t.id ? C.surface2 : "transparent", border: `1px solid ${portfolioTab === t.id ? C.border : "transparent"}`, borderRadius: 8, cursor: "pointer" }}>
                {t.label}
              </button>
            ))}
          </div>
          <ComingSoon label={portfolioTabs.find(t => t.id === portfolioTab)?.label} />
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
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>{label}</div>
      <div style={{ color: C.dim, fontSize: 14, marginBottom: 6 }}>הסעיף הזה נמצא בפיתוח ובבנייה</div>
      <div style={{ color: C.dim, fontSize: 12 }}>בקרוב תוכל לנהל כאן את כל הנתונים הפיננסיים של הלקוח</div>
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
    const { error } = await supabase.from("clients").update({ password: newPass }).eq("id", client.id);
    if (error) showMsg("❌ שגיאה בעדכון סיסמה");
    else { showMsg("✅ הסיסמה עודכנה"); setNewPass(""); setConfirmPass(""); }
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
        <div style={{ background: C.surface2, borderRadius: 8, padding: "10px 12px", fontSize: 12, color: C.dim, marginBottom: 14 }}>
          <div style={{ marginBottom: 4 }}>שם משתמש לכניסה</div>
          <div style={{ color: "#e8eaf6", fontWeight: 600 }}>@{client.username}</div>
        </div>
        {msg && <div style={{ fontSize: 12, color: msg.startsWith("✅") ? C.green : C.red, marginBottom: 12 }}>{msg}</div>}
        <Btn onClick={saveDetails} disabled={loading}>שמור שינויים</Btn>
      </Card>

      {/* Password card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>🔐 שינוי סיסמה</div>
        <Input label="סיסמה חדשה" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="לפחות 4 תווים" />
        <Input label="אימות סיסמה" type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="הכנס שוב את הסיסמה" />
        {msg && <div style={{ fontSize: 12, color: msg.startsWith("✅") ? C.green : C.red, marginBottom: 12 }}>{msg}</div>}
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
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.border}22`, fontSize: 13 }}>
              <span style={{ color: C.dim }}>{item.label}</span>
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
      const catMap = {};
      allTx.forEach(t => { catMap[t.cat] = (catMap[t.cat] || 0) + t.amount; });
      const summaryRows = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => ({
        "סעיף": cat,
        "סכום כולל": Math.round(amt),
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
          <button onClick={toggleAll} style={{ background: "none", border: , borderRadius: 7, padding: "5px 12px", fontSize: 12, color: C.dim, cursor: "pointer", fontFamily: "inherit" }}>
            {allSelected ? "בטל הכל" : "בחר הכל"}
          </button>
          <Btn size="sm" onClick={doExport} disabled={selected.length === 0}>
            ייצוא {selected.length > 0 ?  : ""}
          </Btn>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {submissions.map(s => (
          <div key={s.id} onClick={() => toggle(s.id)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: , background: selected.includes(s.id) ? "rgba(79,142,247,0.12)" : C.surface2, color: selected.includes(s.id) ? C.accent : C.dim, fontWeight: selected.includes(s.id) ? 600 : 400 }}>
            {selected.includes(s.id) ? "✓ " : ""}{s.label}
          </div>
        ))}
      </div>
    </Card>
  );
}
