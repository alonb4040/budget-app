import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LoginScreen from "./LoginScreen";
import AdminPanel from "./AdminPanel";
import ClientApp from "./ClientApp";
import ErrorBoundary from "./ErrorBoundary";
import { supabase } from "./supabase";
import type { Session } from "./types";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Load XLSX library dynamically
function loadXLSX(): Promise<void> {
  return new Promise((resolve) => {
    if (window.XLSX) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve();
    document.head.appendChild(s);
  });
}

function ForcePasswordReset({ session, onDone, onLogout }: { session: Session; onDone: () => void; onLogout: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle"|"saving"|"error">("idle");
  const [errMsg, setErrMsg] = useState("");

  const handleSubmit = async () => {
    if (password.length < 6) { setErrMsg("סיסמה חייבת להכיל לפחות 6 תווים"); return; }
    if (password !== confirm) { setErrMsg("הסיסמאות לא תואמות"); return; }
    setStatus("saving");
    setErrMsg("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setErrMsg(error.message); setStatus("error"); return; }
    await supabase.from("clients").update({ must_reset_password: false }).eq("id", Number(session.id));
    onDone();
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "36px 32px", maxWidth: 400, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>🔐</div>
        <div style={{ fontWeight: 700, fontSize: 22, textAlign: "center", marginBottom: 8, color: "var(--text)" }}>הגדר סיסמה אישית</div>
        <div style={{ fontSize: 16, color: "var(--text-dim)", textAlign: "center", marginBottom: 28, lineHeight: 1.6 }}>
          זו הכניסה הראשונה שלך — אנא הגדר סיסמה חדשה כדי להמשיך
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 6 }}>סיסמה חדשה</div>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="לפחות 6 תווים"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 17, boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 6 }}>אימות סיסמה</div>
          <input
            type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="הזן שוב"
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 17, boxSizing: "border-box", fontFamily: "inherit" }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
          />
        </div>
        {errMsg && <div style={{ fontSize: 15, color: "var(--red)", marginBottom: 12, textAlign: "center" }}>{errMsg}</div>}
        <button
          onClick={handleSubmit} disabled={status === "saving"}
          style={{ width: "100%", padding: "12px", borderRadius: 10, background: "var(--green-mid)", color: "white", border: "none", fontSize: 17, fontWeight: 700, cursor: status === "saving" ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
          {status === "saving" ? "שומר..." : "אפס סיסמה והמשך"}
        </button>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 15, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadXLSX().catch(() => {});

    // ── Restore app session from Supabase Auth ──────────────────
    // Strategy:
    // - INITIAL_SESSION with session  → buildSession → setSession → markReady
    // - INITIAL_SESSION null          → do NOT markReady yet. Wait for TOKEN_REFRESHED/SIGNED_IN
    //   (Supabase may be refreshing an expired access token in the background).
    //   A 5s fallback shows the login screen if nothing resolves.
    // - TOKEN_REFRESHED / SIGNED_IN   → buildSession → setSession → markReady
    // - SIGNED_OUT                    → setSession(null) → markReady
    //
    // `cancelled` prevents React StrictMode's double-invoke race condition:
    // StrictMode mounts/unmounts/remounts, so the first run's async callbacks can still
    // fire after cleanup. Without this flag they could call signOut or setSession and
    // corrupt the state owned by the second (real) run.
    let cancelled = false;
    let readySet = false;
    const markReady = () => { if (!readySet) { readySet = true; setReady(true); } };
    let fallback = setTimeout(markReady, 5000);
    let awaitingRefresh = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      console.log(`[Auth] event=${event} cancelled=${cancelled} hasSession=${!!authSession} awaitingRefresh=${awaitingRefresh}`);
      if (cancelled) return;

      if (event === "INITIAL_SESSION") {
        if (authSession) {
          clearTimeout(fallback);
          try {
            const appSession = await Promise.race([
              buildSession(authSession),
              new Promise<null>((_, reject) => setTimeout(() => reject(new Error("buildSession timeout")), 8000)),
            ]);
            console.log('[Auth] INITIAL_SESSION buildSession:', appSession ? appSession.role : 'null');
            if (cancelled) return;
            if (appSession) setSession(appSession);
            else await supabase.auth.signOut({ scope: 'local' });
          } catch (e: any) {
            console.error('[Auth] INITIAL_SESSION error:', e.message);
            if (!cancelled) await supabase.auth.signOut({ scope: 'local' });
          }
          if (!cancelled) markReady();
        } else {
          const storedSession = sessionStorage.getItem('sb-fygffuihotnkjmxmveyt-auth-token');
          if (storedSession) {
            console.log('[Auth] INITIAL_SESSION null — stored token found, awaiting refresh cycle');
            awaitingRefresh = true;
            clearTimeout(fallback);
            fallback = setTimeout(markReady, 20000);
          } else {
            console.log('[Auth] INITIAL_SESSION null — no stored session, show login');
            clearTimeout(fallback);
            markReady();
          }
        }
        return;
      }

      if (event === "SIGNED_OUT" || !authSession) {
        setSession(null);
        if (!awaitingRefresh) {
          console.log('[Auth] SIGNED_OUT — show login');
          clearTimeout(fallback);
          markReady();
        } else {
          console.log('[Auth] SIGNED_OUT during refresh cycle — waiting for SIGNED_IN');
        }
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        awaitingRefresh = false;
        // Reset fallback as a safety net — even if everything below hangs, the app won't
        // stay on the loading screen forever.
        clearTimeout(fallback);
        fallback = setTimeout(markReady, 15000);
        console.log(`[Auth] ${event} — calling buildSession`);
        try {
          const appSession = await Promise.race([
            buildSession(authSession),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error("buildSession timeout")), 10000)),
          ]);
          console.log('[Auth] buildSession:', appSession ? appSession.role : 'null');
          if (cancelled) return;
          if (appSession) {
            setSession(appSession);
          } else {
            // buildSession returned null — auth_id not linked. Sign out to clear stale session.
            await supabase.auth.signOut({ scope: 'local' });
          }
        } catch (e: any) {
          console.error('[Auth] SIGNED_IN error:', e.message);
          // Do NOT await signOut here — the background buildSession query may still be running
          // and could be holding the Supabase auth lock, causing signOut to hang indefinitely.
          // Just fall through to markReady and show the login screen.
        }
        if (!cancelled) { markReady(); clearTimeout(fallback); }
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = (sess: Session): void => {
    setSession(sess);
  };

  const handleLogout = async (): Promise<void> => {
    clearSessionCache();
    try { localStorage.removeItem("mazan_client_id"); } catch {}
    await supabase.auth.signOut();
    setSession(null);
  };

  if (!ready) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      טוען...
    </div>
  );

  const handlePasswordReset = () => {
    if (!session) return;
    clearSessionCache(); // force fresh DB fetch on next reload
    setSession({ ...session, must_reset_password: false });
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {!session && <LoginScreen onLogin={handleLogin} />}
        {session?.role === "admin" && <AdminPanel onLogout={handleLogout} />}
        {session?.role === "client" && session.must_reset_password && (
          <ForcePasswordReset session={session} onDone={handlePasswordReset} onLogout={handleLogout} />
        )}
        {session?.role === "client" && !session.must_reset_password && (
          <ClientApp session={session} onLogout={handleLogout} />
        )}
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

// ── Session cache ─────────────────────────────────────────────────────────────
// Stores the resolved app Session in localStorage so page reloads are instant.
// The cache is keyed by Supabase user ID — a different user always bypasses it.
const SESSION_CACHE_KEY = "mazan-session-cache";

function readSessionCache(userId: string): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.userId !== userId) return null;
    return cached.session as Session;
  } catch { return null; }
}

function writeSessionCache(userId: string, session: Session) {
  try { sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ userId, session })); } catch {}
}

function clearSessionCache() {
  try { sessionStorage.removeItem(SESSION_CACHE_KEY); } catch {}
}

// ── Build app Session from a Supabase Auth session ───────────────────────────
// Called both on login and on page reload (token restore).
async function buildSession(authSession: { user: { id: string; app_metadata?: Record<string, unknown>; email?: string } }): Promise<Session | null> {
  const meta = authSession.user.app_metadata ?? {};
  const userId = authSession.user.id;

  if (meta.is_admin) {
    return { role: "admin", username: "admin" };
  }

  // Return cached session immediately — avoids a slow DB round-trip on every reload.
  const cached = readSessionCache(userId);
  if (cached) {
    console.log('[buildSession] cache hit → instant restore');
    return cached;
  }

  // No cache — look up the client row that has this auth user linked
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("id, username, name, is_blocked, must_reset_password")
    .eq("auth_id", userId)
    .maybeSingle();

  if (clientErr) console.error("[buildSession] query error:", clientErr.message, "| user:", userId);
  if (!client) return null;
  if (client.is_blocked) { clearSessionCache(); await supabase.auth.signOut(); return null; }

  const session: Session = { role: "client", username: client.username, name: client.name, id: String(client.id), must_reset_password: client.must_reset_password ?? false };
  writeSessionCache(userId, session);
  // כתוב client_id ל-localStorage — נדרש לבוקמרקלט מקס שרץ מדומיין אחר
  try { localStorage.setItem("mazan_client_id", String(client.id)); } catch {}
  // fire-and-forget — don't block login
  supabase.from("clients").update({ last_active: new Date().toISOString() }).eq("id", client.id).then(() => {});
  return session;
}
