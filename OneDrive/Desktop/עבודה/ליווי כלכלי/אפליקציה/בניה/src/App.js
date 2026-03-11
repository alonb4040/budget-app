import { useState, useEffect } from "react";
import LoginScreen from "./LoginScreen";
import AdminPanel from "./AdminPanel";
import ClientApp from "./ClientApp";

// Load XLSX library dynamically
function loadXLSX() {
  return new Promise((resolve) => {
    if (window.XLSX) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadXLSX().then(() => setReady(true));
    // Restore session from sessionStorage
    const saved = sessionStorage.getItem("budget_session");
    if (saved) { try { setSession(JSON.parse(saved)); } catch {} }
  }, []);

  const handleLogin = (sess) => {
    sessionStorage.setItem("budget_session", JSON.stringify(sess));
    setSession(sess);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("budget_session");
    setSession(null);
  };

  if (!ready) return (
    <div style={{ background: "#0f1117", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#8b90b0", fontFamily: "'Heebo', sans-serif" }}>
      טוען...
    </div>
  );

  if (!session) return <LoginScreen onLogin={handleLogin} />;
  if (session.role === "admin") return <AdminPanel onLogout={handleLogout} />;
  return <ClientApp session={session} onLogout={handleLogout} />;
}
