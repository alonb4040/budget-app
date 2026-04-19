import React, { useState, useEffect } from "react";
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
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", paddingLeft: 40,
    borderRadius: 10, border: `1.5px solid ${errMsg ? "var(--red)" : "var(--border)"}`,
    background: "var(--surface2)", color: "var(--text)", fontSize: 17,
    boxSizing: "border-box", fontFamily: "'Heebo', sans-serif",
    direction: "rtl", outline: "none",
  };

  const eyeBtn: React.CSSProperties = {
    position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-dim)", display: "flex", alignItems: "center", padding: 4,
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Heebo', sans-serif", padding: 16 }}>
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "36px 32px", maxWidth: 400, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>

        {/* Icon */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14, color: "var(--green-mid)" }}>
          <svg width={38} height={38} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>

        <div style={{ fontWeight: 700, fontSize: 22, textAlign: "center", marginBottom: 8, color: "var(--text)" }}>הגדר סיסמה אישית</div>
        <div style={{ fontSize: 15, color: "var(--text-dim)", textAlign: "center", marginBottom: 28, lineHeight: 1.6 }}>
          זו הכניסה הראשונה שלך — הגדר סיסמה חדשה כדי להמשיך
        </div>

        {/* Password field */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 6, fontWeight: 600 }}>סיסמה חדשה</div>
          <div style={{ position: "relative" }}>
            <input
              type={showPass ? "text" : "password"}
              value={password}
              onChange={e => { setPassword(e.target.value); if (errMsg) setErrMsg(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="לפחות 6 תווים"
              style={inputStyle}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)} style={eyeBtn}>
              {showPass
                ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Confirm field */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 6, fontWeight: 600 }}>אימות סיסמה</div>
          <div style={{ position: "relative" }}>
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={e => { setConfirm(e.target.value); if (errMsg) setErrMsg(""); }}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="הזן שוב"
              style={inputStyle}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowConfirm(p => !p)} style={eyeBtn}>
              {showConfirm
                ? <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                : <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              }
            </button>
          </div>
        </div>

        {/* Error message */}
        {errMsg && (
          <div style={{ fontSize: 14, color: "var(--red)", marginBottom: 14, textAlign: "center", background: "rgba(192,57,43,0.07)", borderRadius: 8, padding: "8px 12px" }}>
            {errMsg}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={status === "saving"}
          style={{ width: "100%", padding: "12px", borderRadius: 10, background: "var(--green-mid)", color: "white", border: "none", fontSize: 17, fontWeight: 700, cursor: status === "saving" ? "not-allowed" : "pointer", fontFamily: "'Heebo', sans-serif", opacity: status === "saving" ? 0.7 : 1 }}>
          {status === "saving" ? "שומר..." : "הגדר סיסמה והמשך"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "var(--text-dim)", fontSize: 15, cursor: "pointer", textDecoration: "underline", fontFamily: "'Heebo', sans-serif" }}>
            התנתק
          </button>
        </div>
      </div>
    </div>
  );
}

// קורא את הסשן מהcache סינכרונית לפני הרנדר הראשון.
// מאפשר לאפליקציה להתחיל ישירות עם המצב הנכון — ללא "טוען..." וללא פלאש של מסך ההתחברות.
//
// שלושה מקרים:
// 1. אין auth token בכלל → session=null, ready=true → מסך התחברות מיידי
// 2. יש auth token + app cache → session=cached, ready=true → האפליקציה עולה מיידית
// 3. יש auth token אבל אין cache (כניסה ראשונה) → session=null, ready=false → "טוען..." עד ש-buildSession יסיים
function getInitialState(): { session: Session | null; ready: boolean } {
  try {
    const AUTH_KEY = 'sb-fygffuihotnkjmxmveyt-auth-token';
    const rawAuth = sessionStorage.getItem(AUTH_KEY);
    if (!rawAuth || rawAuth === 'null') return { session: null, ready: true };

    const authData = JSON.parse(rawAuth);
    const userId: string | undefined = authData?.user?.id;
    if (!userId) return { session: null, ready: false };

    const rawCache = sessionStorage.getItem('mazan-session-cache');
    if (!rawCache) return { session: null, ready: false };
    const cached = JSON.parse(rawCache);
    if (cached.userId !== userId) return { session: null, ready: false };

    return { session: cached.session as Session, ready: true };
  } catch {
    return { session: null, ready: false };
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(() => getInitialState().session);
  const [ready, setReady] = useState(() => getInitialState().ready);
  // מונע פלאש של מסך ההתחברות בזמן login פעיל:
  // כש-LoginScreen מתחיל login הוא מעלה את הדגל — ה-SIGNED_OUT האמצעי של Supabase לא יאפס את הסשן
  const loginInProgress = React.useRef(false);

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
        console.log('[Auth] SIGNED_OUT loginInProgress:', loginInProgress.current);
        // דלג על setSession(null) אם login פעיל, או אם הסשן הנוכחי מצריך איפוס סיסמה
        // (stray SIGNED_OUTs מגיעים מSupabase בזמן מעבר בין sessions)
        if (!loginInProgress.current) {
          setSession(prev => {
            // אל תמחק סשן של must_reset_password — המשתמש צריך לאפס סיסמה, לא להתנתק
            if (prev?.must_reset_password) {
              console.log('[Auth] SIGNED_OUT — protecting must_reset_password session');
              return prev;
            }
            return null;
          });
        }
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
        console.log(`[Auth] ${event} — calling buildSession loginInProgress=${loginInProgress.current}`);
        try {
          const appSession = await Promise.race([
            buildSession(authSession),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error("buildSession timeout")), 10000)),
          ]);
          console.log('[Auth] buildSession:', appSession ? appSession.role : 'null');
          if (cancelled) return;
          if (appSession) {
            setSession(appSession);
            // הגן 3 שניות על SIGNED_OUT אחרי כל SIGNED_IN מוצלח —
            // Supabase לפעמים מעיף SIGNED_OUT cleanup מיד אחרי SIGNED_IN (גם ב-restore, לא רק login)
            if (!loginInProgress.current) {
              loginInProgress.current = true;
              setTimeout(() => { loginInProgress.current = false; }, 3000);
            }
          } else if (!loginInProgress.current) {
            // buildSession returned null — auth_id not linked. Sign out only when NOT in active login flow
            // (if login is in progress, the session was already set by onLogin() — don't destroy the auth session)
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

  const handleLoginStart = (): void => { loginInProgress.current = true; };
  const handleLoginFail  = (): void => { loginInProgress.current = false; };
  const handleLogin = (sess: Session): void => {
    setSession(sess);
    // Keep loginInProgress=true for 2.5s to absorb Supabase's post-login cleanup
    // SIGNED_OUT events (e.g. old-session teardown) that fire after the SIGNED_IN.
    // Without this delay, those stray SIGNED_OUTs clear the session immediately.
    setTimeout(() => { loginInProgress.current = false; }, 2500);
  };

  const handleLogout = async (): Promise<void> => {
    loginInProgress.current = false;
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
        {!session && <LoginScreen onLogin={handleLogin} onLoginStart={handleLoginStart} onLoginFail={handleLoginFail} />}
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
    // אם השדה must_reset_password לא קיים ב-cache (cache ישן מלפני הוספת השדה), מחק ושאל DB מחדש
    if (cached.role === 'client' && cached.must_reset_password === undefined) {
      console.log('[buildSession] cache missing must_reset_password — clearing and re-fetching');
      clearSessionCache();
    } else {
      console.log('[buildSession] cache hit → instant restore');
      return cached;
    }
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
