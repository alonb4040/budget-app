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

  const viewClient = async (client) => {
    const [{ data: subs }, { data: maps }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id)
    ]);
    setSelected({ ...client, submissions: subs || [], mappings: maps || [] });
    setView("detail");
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: "#e8eaf6" }}>
      {/* Header */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: `linear-gradient(135deg,${C.accent},${C.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📊</div>
          <div>
            <div style={{ fontWeight: 700 }}>מאזן חכם — ניהול</div>
            <div style={{ fontSize: 11, color: C.dim }}>פאנל מנהל</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {view !== "list" && <Btn variant="ghost" size="sm" onClick={() => { setView("list"); setMsg(""); }}>← חזור</Btn>}
          <Btn variant="ghost" size="sm" onClick={onLogout}>יציאה</Btn>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
        {msg && <div style={{ background: msg.startsWith("✅") ? "rgba(46,204,138,0.1)" : "rgba(247,92,92,0.1)", border: `1px solid ${msg.startsWith("✅") ? "rgba(46,204,138,0.3)" : "rgba(247,92,92,0.3)"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 13, color: msg.startsWith("✅") ? C.green : C.red }}>{msg}</div>}

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
                  <Card key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px" }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: C.dim }}>@{c.username} · נוצר {new Date(c.created_at).toLocaleDateString("he-IL")}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Btn variant="ghost" size="sm" onClick={() => viewClient(c)}>👁 פרטים</Btn>
                      <Btn variant="danger" size="sm" onClick={() => deleteClient(c.id, c.name)}>מחק</Btn>
                    </div>
                  </Card>
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
            <Input label="שם משתמש (לכניסה)" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, "").toLowerCase() }))} placeholder="israel123" />
            <Input label="סיסמה" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="לפחות 6 תווים" />
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <Btn onClick={createClient} disabled={!form.name || !form.username || form.password.length < 4}>צור לקוח</Btn>
              <Btn variant="ghost" onClick={() => setView("list")}>ביטול</Btn>
            </div>
          </Card>
        )}

        {/* CLIENT DETAIL */}
        {view === "detail" && selected && (
          <div>
            <Card style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: C.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>👤</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: C.dim }}>@{selected.username} · {selected.submissions.length} הגשות · {selected.mappings.length} מיפויים</div>
                </div>
              </div>
            </Card>

            <div style={{ fontWeight: 700, marginBottom: 12 }}>היסטוריית הגשות</div>
            {selected.submissions.length === 0 ? (
              <Card style={{ textAlign: "center", padding: 32, color: C.dim }}>טרם הוגשו קבצים</Card>
            ) : selected.submissions.map(s => {
              const txs = s.transactions || [];
              const total = txs.reduce((sum, t) => sum + t.amount, 0);
              return (
                <Card key={s.id} style={{ marginBottom: 10, padding: "14px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: C.dim }}>{new Date(s.created_at).toLocaleDateString("he-IL")} · {txs.length} עסקאות</div>
                    </div>
                    <div style={{ fontWeight: 700, color: C.red, fontSize: 16 }}>₪{Math.round(total).toLocaleString()}</div>
                  </div>
                </Card>
              );
            })}

            {selected.mappings.length > 0 && (
              <>
                <div style={{ fontWeight: 700, margin: "20px 0 12px" }}>🧠 מיפויים שנזכרו</div>
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: C.surface2 }}>
                        <th style={{ padding: "8px 14px", textAlign: "right", color: C.dim, fontWeight: 600 }}>בית עסק</th>
                        <th style={{ padding: "8px 14px", textAlign: "right", color: C.dim, fontWeight: 600 }}>סעיף</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.mappings.map(m => (
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
      </div>
    </div>
  );
}
