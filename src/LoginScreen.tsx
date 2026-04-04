import { useState } from "react";
import { supabase } from "./supabase";
import { Btn, C } from "./ui";
import type { Session } from "./types";

interface LoginScreenProps {
  onLogin: (session: Session) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [focused, setFocused]   = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true); setError("");
    // Clear any stale/orphaned Supabase session before attempting sign-in.
    // Without this, a lingering session can cause signInWithPassword to hang
    // while Supabase tries (and fails) to auto-refresh the stale token.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

    // Timeout wrapper — if any network call hangs, we bail after 10s
    function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
      return Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout:${label}`)), 10000)
        ),
      ]);
    }

    try {
      const email = `${username}@mazan.local`;

      // ── Step 1: try Supabase Auth directly ──────────────────────
      const { data: authData, error: authErr } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        "signIn"
      );

      if (!authErr && authData.session) {
        const meta = authData.user?.app_metadata ?? {};
        if (meta.is_admin) {
          onLogin({ role: "admin", username: "admin" });
        } else {
          const { data: client } = await supabase.from("clients").select("id, username, name, is_blocked, must_reset_password").eq("username", username).maybeSingle();
          if (!client) throw new Error("שם משתמש או סיסמה שגויים");
          if ((client as any).is_blocked) throw new Error("שם משתמש או סיסמה שגויים");
          onLogin({ role: "client", username: (client as any).username, name: (client as any).name, id: String((client as any).id), must_reset_password: (client as any).must_reset_password ?? false });
        }
        return;
      }

      // ── Step 2: Auth failed — try legacy migration via Edge Function ──
      const { data: migrateData, error: migrateErr } = await withTimeout(
        supabase.functions.invoke("manage-auth", {
          body: { action: "migrate_login", username, password },
        }),
        "edgeFunction"
      );

      if (migrateErr || !migrateData?.ok) {
        throw new Error("שם משתמש או סיסמה שגויים");
      }

      // Migration succeeded — now sign in with Supabase Auth
      const { data: authData2, error: authErr2 } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        "signIn2"
      );
      if (authErr2 || !authData2.session) throw new Error("שם משתמש או סיסמה שגויים");

      if (migrateData.role === "admin") {
        onLogin({ role: "admin", username: "admin" });
      } else {
        onLogin({ role: "client", username: migrateData.username, name: migrateData.name, id: String(migrateData.id) });
      }
    } catch (err: any) {
      setError("שם משתמש או סיסמה שגויים");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = (name: string): React.CSSProperties => ({
    width: "100%",
    background: focused === name ? "#fff" : "var(--surface2)",
    border: `1.5px solid ${focused === name ? "var(--green-mid)" : "var(--border)"}`,
    borderRadius: 12,
    padding: "13px 16px",
    color: "var(--text)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontSize: 15,
    direction: "rtl",
    boxSizing: "border-box",
    outline: "none",
    transition: "all 0.2s",
    boxShadow: focused === name ? "0 0 0 3px rgba(45,106,79,0.1)" : "none",
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Background decoration */}
      <div style={{
        position: "absolute", top: -120, left: -120,
        width: 400, height: 400, borderRadius: "50%",
        background: "radial-gradient(circle, var(--green-mint) 0%, transparent 70%)",
        opacity: 0.5, pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: -80, right: -80,
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, var(--gold-light) 0%, transparent 70%)",
        opacity: 0.6, pointerEvents: "none",
      }} />

      <div style={{ width: "100%", maxWidth: 400, position: "relative", animation: "fadeUp 0.5s ease forwards" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 64, height: 64,
            background: "var(--green-mid)",
            borderRadius: 18,
            marginBottom: 20,
            boxShadow: "0 8px 24px rgba(45,106,79,0.25)",
          }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 24 L12 16 L18 20 L26 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M22 10 H26 V14" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 32,
            fontWeight: 600,
            color: "var(--green-deep)",
            marginBottom: 8,
            letterSpacing: "-0.5px",
          }}>מאזן</h1>
          <p style={{ fontSize: 15, color: "var(--text-dim)", fontWeight: 400 }}>
            ניהול פיננסי אישי חכם
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: "32px 28px",
          boxShadow: "0 4px 24px rgba(30,77,53,0.08)",
        }}>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--text-mid)", fontWeight: 600, marginBottom: 6 }}>
              שם משתמש
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="הזן שם משתמש"
              style={inputStyle("username")}
              onFocus={() => setFocused("username")}
              onBlur={() => setFocused(null)}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 13, color: "var(--text-mid)", fontWeight: 600, marginBottom: 6 }}>
              סיסמה
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="הזן סיסמה"
              style={inputStyle("password")}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              onKeyDown={e => e.key === "Enter" && !loading && handleLogin()}
            />
          </div>

          {error && (
            <div style={{
              background: "var(--red-light)",
              border: "1px solid rgba(192,57,43,0.2)",
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--red)",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}>
              <span>⚠</span> {error}
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !username || !password}
            style={{
              width: "100%",
              background: loading || !username || !password ? "var(--surface2)" : "var(--green-mid)",
              color: loading || !username || !password ? "var(--text-dim)" : "#fff",
              border: "none",
              borderRadius: 12,
              padding: "14px",
              fontSize: 16,
              fontWeight: 700,
              cursor: loading || !username || !password ? "not-allowed" : "pointer",
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: "all 0.2s",
              boxShadow: loading || !username || !password ? "none" : "0 4px 16px rgba(45,106,79,0.25)",
            }}
          >
            {loading ? "מתחבר..." : "כניסה"}
          </button>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--text-dim)" }}>
          הנתונים מאובטחים ופרטיים לכל לקוח
        </p>
      </div>
    </div>
  );
}
