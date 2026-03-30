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

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadXLSX().catch(() => {});

    // ── Restore app session from Supabase Auth ──────────────────
    const restoreSession = async () => {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession) {
        const appSession = await buildSession(authSession);
        if (appSession) setSession(appSession);
      }
      setReady(true);
    };
    restoreSession();

    // Listen for auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, authSession) => {
      if (event === "SIGNED_OUT" || !authSession) {
        setSession(null);
        return;
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const appSession = await buildSession(authSession);
        if (appSession) setSession(appSession);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = (sess: Session): void => {
    setSession(sess);
  };

  const handleLogout = async (): Promise<void> => {
    await supabase.auth.signOut();
    setSession(null);
  };

  if (!ready) return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      טוען...
    </div>
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        {!session && <LoginScreen onLogin={handleLogin} />}
        {session?.role === "admin" && <AdminPanel onLogout={handleLogout} />}
        {session?.role === "client" && <ClientApp session={session} onLogout={handleLogout} />}
      </ErrorBoundary>
    </QueryClientProvider>
  );
}

// ── Build app Session from a Supabase Auth session ───────────────────────────
// Called both on login and on page reload (token restore).
async function buildSession(authSession: { user: { app_metadata?: Record<string, unknown>; email?: string } }): Promise<Session | null> {
  const meta = authSession.user.app_metadata ?? {};

  if (meta.is_admin) {
    return { role: "admin", username: "admin" };
  }

  // Look up the client row that has this auth user linked
  const { data: client } = await supabase
    .from("clients")
    .select("id, username, name")
    .maybeSingle();

  if (!client) return null;
  return { role: "client", username: client.username, name: client.name, id: String(client.id) };
}
