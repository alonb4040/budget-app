import { useState } from "react";
import { supabase } from "./supabase";
import { Card, Btn, Input, C } from "./ui";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true); setError("");
    try {
      if (username === "admin") {
        const { data, error: e } = await supabase
          .from("admin_settings").select("password").eq("id", 1).single();
        if (e) throw new Error("שגיאת התחברות לשרת");
        if (!data || data.password !== password) throw new Error("סיסמה שגויה");
        onLogin({ role: "admin", username: "admin" });
        return;
      }
      const { data, error: e } = await supabase
        .from("clients")
        .select("*")
        .eq("username", username)
        .maybeSingle();
      if (e) throw new Error("שגיאת התחברות לשרת");
      if (!data) throw new Error("משתמש לא נמצא");
      if (data.password !== password) throw new Error("סיסמה שגויה");
      onLogin({ role: "client", username: data.username, name: data.name, id: data.id });
    } catch (err) {
      setError(err.message || "שם משתמש או סיסמה שגויים");
    }
    setLoading(false);
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>📊</div>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>מאזן חכם</div>
          <div style={{ fontSize: 13, color: C.dim }}>כלי ניהול תקציב משפחתי</div>
        </div>

        <Card>
          <Input label="שם משתמש" value={username} onChange={e => setUsername(e.target.value)} placeholder="הזן שם משתמש" />
          <Input label="סיסמה" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="הזן סיסמה" onKeyDown={e => e.key === "Enter" && !loading && handleLogin()} />
          {error && (
            <div style={{ background: "rgba(247,92,92,0.1)", border: "1px solid rgba(247,92,92,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.red, marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}
          <Btn onClick={handleLogin} disabled={loading || !username || !password} style={{ width: "100%", justifyContent: "center" }}>
            {loading ? "מתחבר..." : "כניסה →"}
          </Btn>
        </Card>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.dim }}>
          הנתונים מאובטחים ופרטיים לכל לקוח
        </div>
      </div>
    </div>
  );
}
