import { useState, useEffect, useMemo, useRef } from "react";
import ScenarioTab from "./ScenarioTab";

// ── URL routing helpers ───────────────────────────────────────────────────────
function parseAdminUrl() {
  const m = window.location.pathname.match(/^\/client\/(\d+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  return m ? { clientId: parseInt(m[1]), tab: m[2] || "intake", subTab: m[3] || null } : null;
}
function pushClientUrl(clientId: number, tab: string, subTab?: string | null) {
  const path = subTab ? `/client/${clientId}/${tab}/${subTab}` : `/client/${clientId}/${tab}`;
  window.history.pushState(null, "", path);
}
function goListUrl() {
  window.history.pushState(null, "", "/");
}
import { supabase } from "./supabase";
import { Card, Btn, Input, C, CustomSelect } from "./ui";
import CategoryManager from "./components/CategoryManager";
import LeadsPanel from "./components/LeadsPanel";
import TransactionSummaryTab from "./components/TransactionSummaryTab";
import ScenarioPlanTab from "./components/ScenarioPlanTab";
import MachsanotTab from "./components/MachsanotTab";

// ── SVG Icons ─────────────────────────────────────────────────────────────────
function IcoUser({ size = 16 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcoEye({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
}
function IcoEyeOff({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}
function IcoTrash({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function IcoMail({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>;
}
function IcoClock({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IcoFolder({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
}
function IcoLock({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
function IcoUnlock({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>;
}
function IcoBell({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function IcoDownload({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}
function IcoKey({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>;
}
function IcoWarn({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function IcoCheck({ size = 13 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
}
function IcoUsers({ size = 32 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}

// ── Delete Confirm Modal ───────────────────────────────────────────────────────
function ClientActionModal({ name, onArchive, onDelete, onCancel }: {
  name: string;
  onArchive: () => void;
  onDelete: (reason: string) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<"action" | "delete_confirm">("action");
  const [reason, setReason] = useState("");

  const inputSt = { width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" as const, direction: "rtl" as const, resize: "none" as const };

  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: "var(--z-top-back)", backdropFilter: "blur(6px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 420, background: "var(--surface)", borderRadius: 18,
        boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
        zIndex: "var(--z-top)", overflow: "hidden",
        animation: "adminModalIn 200ms cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Header */}
        <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", position: "relative" }}>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 16, padding: 4, lineHeight: 1, borderRadius: 6 }}>×</button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontFamily: "'Rubik', sans-serif", fontSize: 17, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap" }}>
            {step === "action" ? "הסרת לקוח" : "מחיקה לצמיתות"}
          </div>
        </div>

        {/* Step 1 — action choice */}
        {step === "action" && (
          <div style={{ padding: "24px 28px 22px" }}>
            <div style={{ background: "rgba(192,57,43,0.07)", border: "1px solid rgba(192,57,43,0.2)", borderRadius: 10, padding: "14px 16px", marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--red)", marginBottom: 4 }}>שים לב</div>
              <div style={{ fontSize: 13, color: "var(--text-mid)", lineHeight: 1.6 }}>
                מחיקה לצמיתות תמחק את <strong>כל הנתונים</strong> של <strong>{name}</strong> ולא ניתן לשחזר אותם.<br />
                מומלץ להעביר לארכיון — הנתונים נשמרים וניתן לשחזר בכל עת.
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={onArchive} style={{ width: "100%", padding: "12px 20px", borderRadius: 10, border: "1.5px solid var(--green-mid)", background: "rgba(45,106,79,0.06)", color: "var(--green-mid)", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "right" }}>
                העבר לארכיון — שמור נתונים לשחזור עתידי
              </button>
              <button onClick={() => setStep("delete_confirm")} style={{ width: "100%", padding: "12px 20px", borderRadius: 10, border: "1.5px solid var(--red)", background: "rgba(192,57,43,0.06)", color: "var(--red)", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "right" }}>
                מחק לצמיתות — אי הפיך
              </button>
              <button onClick={onCancel} style={{ width: "100%", padding: "11px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "none", color: "var(--text-mid)", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — delete confirm + reason */}
        {step === "delete_confirm" && (
          <div style={{ padding: "24px 28px 22px" }}>
            <div style={{ fontSize: 14, color: "var(--text-mid)", marginBottom: 16, lineHeight: 1.6 }}>
              מחיקה לצמיתות של <strong>{name}</strong>. כל ההגשות, המיפויים והנתונים יימחקו.<br />
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>פרטים בסיסיים יישמרו לעיון בלבד.</span>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6 }}>סיבת המחיקה (לא חובה)</div>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder='למשל: "לקוח ביקש מחיקת חשבון"' style={inputSt} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("action")} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "1px solid var(--border)", background: "none", color: "var(--text-mid)", fontFamily: "inherit", fontSize: 14, cursor: "pointer" }}>
                חזור
              </button>
              <button onClick={() => onDelete(reason)} style={{ flex: 2, padding: "11px 0", borderRadius: 10, border: "none", background: "var(--red)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                מחק לצמיתות
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes adminModalIn { from { transform: translate(-50%,-48%) scale(0.96); opacity:0; } to { transform: translate(-50%,-50%) scale(1); opacity:1; } }`}</style>
    </>
  );
}

// ── Sidebar icons ─────────────────────────────────────────────────────────────
function IconUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconFunnel() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  );
}
function IconTag() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/>
      <line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  );
}

// ── Admin Sidebar ─────────────────────────────────────────────────────────────
const ADMIN_STYLES = `
  .admin-main { overflow-anchor: none; }
  @media (max-width: 900px) {
    .admin-sidebar {
      position: fixed !important;
      top: 0; right: -220px; bottom: 0;
      width: 220px !important;
      z-index: 300;
      transition: right 0.25s ease;
    }
    .admin-sidebar.admin-sidebar-open {
      right: 0 !important;
      box-shadow: -4px 0 24px rgba(0,0,0,0.35) !important;
    }
    .admin-overlay {
      display: none;
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 299;
    }
    .admin-overlay.admin-overlay-open { display: block; }
    .admin-hamburger { display: flex !important; }
    .admin-main { padding: 16px !important; }
    .admin-close-btn { display: flex !important; }
  }
  @media (min-width: 901px) {
    .admin-hamburger { display: none !important; }
    .admin-overlay { display: none !important; }
  }
  @media (prefers-reduced-motion: reduce) {
    .admin-sidebar { transition: none !important; }
  }
`;

function AdminSidebar({ mainView, setMainView, onLogout, isOpen, onClose }: {
  mainView: "clients" | "leads" | "categories";
  setMainView: (v: "clients" | "leads" | "categories") => void;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [adminEmail, setAdminEmail] = useState("");
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email || "");
    });
  }, []);
  const initials = adminEmail ? adminEmail[0].toUpperCase() : "א";
  const displayName = adminEmail ? adminEmail.split("@")[0] : "מנהל";

  const navItems = [
    { id: "clients" as const, label: "לקוחות", icon: <IconUsers /> },
    { id: "leads" as const, label: "לידים", icon: <IconFunnel /> },
    { id: "categories" as const, label: "קטגוריות", icon: <IconTag /> },
  ];

  return (
    <div className={`admin-sidebar${isOpen ? " admin-sidebar-open" : ""}`} style={{
      width: 220, minHeight: "100vh", flexShrink: 0,
      background: "linear-gradient(180deg, #0d2218 0%, #1e4d35 100%)",
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, alignSelf: "flex-start", height: "100vh",
    }}>
      {/* Logo + close button */}
      <div style={{ padding: "28px 24px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Frank Ruhl Libre', serif", fontWeight: 700, fontSize: 26, color: "#fff", letterSpacing: "-0.02em" }}>מאזן</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>פאנל ניהול</div>
        </div>
        <button onClick={onClose} aria-label="סגור תפריט" style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer",
          fontSize: 20, lineHeight: 1, padding: "4px 8px", borderRadius: 6,
          display: "none",
        }} className="admin-close-btn">×</button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 16px 12px" }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: "4px 10px" }}>
        {navItems.map(item => {
          const active = mainView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setMainView(item.id)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                background: active ? "rgba(255,255,255,0.12)" : "transparent",
                color: "#fff",
                fontFamily: "inherit", fontSize: 15, fontWeight: active ? 600 : 400,
                textAlign: "right", marginBottom: 2,
                borderRight: active ? "3px solid var(--green-soft)" : "3px solid transparent",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)"; }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 16px 16px" }} />

      {/* Profile + Logout */}
      <div style={{ padding: "0 10px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Profile card */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 12px", borderRadius: 10,
          background: "rgba(255,255,255,0.06)",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
            background: "linear-gradient(135deg, var(--green-soft), var(--green-mid))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Frank Ruhl Libre', serif", fontSize: 16, fontWeight: 700, color: "#fff",
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 1 }}>מנהל</div>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={onLogout}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer",
            background: "transparent", color: "rgba(255,255,255,0.42)",
            fontFamily: "inherit", fontSize: 13, fontWeight: 400, textAlign: "right",
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = "rgba(255,255,255,0.07)"; el.style.color = "rgba(255,255,255,0.75)"; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.background = "transparent"; el.style.color = "rgba(255,255,255,0.42)"; }}
        >
          <IconLogout />
          יציאה
        </button>
      </div>
    </div>
  );
}

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
      {status === "sending" ? "שולח..." : status === "sent" ? "נשלח" : status === "error" ? "שגיאה" : <span style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoBell /> שלח תזכורת</span>}
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
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, display:"flex", alignItems:"center", gap:7 }}><IcoMail size={15} /> שלח הוראות כניסה במייל</div>
      {!email ? (
        <div style={{ fontSize: 15, color: "var(--text-dim)" }}>לא הוזנה כתובת מייל — הוסף בפרטי הלקוח ושלח משם</div>
      ) : notConfigured ? (
        <div style={{ fontSize: 14, color: "var(--gold)", display:"flex", alignItems:"center", gap:6 }}><IcoWarn size={13} /> חסר <code>REACT_APP_EMAILJS_WELCOME_TEMPLATE_ID</code> ב-.env</div>
      ) : (
        <>
          <div style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 14 }}>
            ישלח אל: <strong style={{ color: "var(--text)" }}>{email}</strong>
          </div>
          <Btn onClick={sendEmail} disabled={status === "sending" || status === "sent"}>
            {status === "idle" ? <><IcoMail size={14} /> שלח מייל</> : status === "sending" ? "שולח..." : status === "sent" ? <><IcoCheck size={13} /> נשלח!</> : "שגיאה — נסה שוב"}
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
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  const [clientFilter, setClientFilter] = useState<"all"|"active"|"waiting"|"collecting"|"blocked"|"archived"|"deleted">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"created"|"last_active"|"name">("created");
  const [sortAsc, setSortAsc] = useState(false);
  const [mainView, setMainView] = useState<"clients" | "leads" | "categories">("clients");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState("list"); // list | new | detail | categories
  const [urlTarget, setUrlTarget] = useState(parseAdminUrl);
  const [visitedAdminViews, setVisitedAdminViews] = useState<Set<string>>(() => new Set(["list", "leads"]));
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "", last_name: "", username: "", password: "", email: "", phone: "" });
  const [showPass, setShowPass] = useState(false);
  const [justCreated, setJustCreated] = useState<{id:number;name:string;last_name:string;username:string;password:string;email:string}|null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const loadClients = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const [{ data, error }, { data: allSubs }, { data: allDocs }, { data: allQuestionnaire }] = await Promise.all([
        supabase.from("clients").select("*").order("created_at", { ascending: false }).abortSignal(controller.signal),
        supabase.from("submissions").select("client_id"),
        supabase.from("client_documents").select("client_id, category, marked_done"),
        supabase.from("client_questionnaire").select("client_id, spouse_index, done"),
      ]);
      clearTimeout(timer);
      if (error) console.error("loadClients error:", error.message);
      const clientList = data || [];
      setClients(clientList);

      const counts: Record<string, number> = {};
      (allSubs || []).forEach((s: any) => { counts[s.client_id] = (counts[s.client_id] || 0) + 1; });
      setSubCounts(counts);

      // Compute readyForPortfolio per client:
      // all required_docs must be marked_done, and questionnaire (if required) must be done
      const ready: Record<string, boolean> = {};
      for (const client of clientList) {
        const reqDocs: string[] = client.required_docs || [];
        if (reqDocs.length === 0) { ready[client.id] = false; continue; }
        const clientDocs = (allDocs || []).filter((d: any) => d.client_id === client.id);
        const clientQ = (allQuestionnaire || []).filter((q: any) => q.client_id === client.id);
        let allComplete = true;
        for (const docId of reqDocs) {
          if (docId === "questionnaire") {
            const spousesRequired = client.questionnaire_spouses || 1;
            for (let i = 1; i <= spousesRequired; i++) {
              if (!clientQ.find((q: any) => q.spouse_index === i && q.done)) { allComplete = false; break; }
            }
          } else {
            const category = DOC_ID_MAP[docId] || docId;
            if (!clientDocs.find((d: any) => d.category === category && d.marked_done)) { allComplete = false; }
          }
          if (!allComplete) break;
        }
        ready[client.id] = allComplete;
      }
      setReadyMap(ready);
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
    if (error) { setMsg("err: " + (error.message.includes("unique") ? "שם משתמש תפוס" : error.message)); return; }

    // 2. Create Supabase Auth user and link auth_id via Edge Function
    const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
      body: { action: "create", username: form.username, password: form.password, clientId: (newClient as any).id },
    });
    const saved = { id: (newClient as any).id, name: form.name, last_name: form.last_name, username: form.username, password: form.password, email: form.email };
    setForm({ name: "", last_name: "", username: "", password: "", email: "", phone: "" });
    loadClients();
    if (fnErr || !authResult?.ok) {
      setMsg("warn: לקוח נוצר אך חשבון Auth נכשל: " + (authResult?.error || fnErr?.message || "שגיאה"));
    } else {
      setJustCreated(saved);
      // If this client was created from a lead, mark the lead as converted
      if (pendingLeadId) {
        await supabase.from("leads").update({ status: "converted", client_id: (newClient as any).id }).eq("id", pendingLeadId);
        setPendingLeadId(null);
      }
    }
  };

  const deleteClient = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const archiveClient = async (id: number | string) => {
    setDeleteConfirm(null);
    await supabase.from("clients").update({ archived_at: new Date().toISOString() }).eq("id", id);
    loadClients();
  };

  const restoreClient = async (id: number | string) => {
    await supabase.from("clients").update({ archived_at: null }).eq("id", id);
    loadClients();
  };

  const deleteClientDirect = async (id: number) => {
    // Hard-delete used only by revert-to-lead (intentional, lead is being recreated)
    await supabase.functions.invoke("manage-auth", { body: { action: "delete", clientId: id } });
    await supabase.from("submissions").delete().eq("client_id", id);
    await supabase.from("remembered_mappings").delete().eq("client_id", id);
    await supabase.from("clients").delete().eq("id", id);
    setSelected(null);
    setView("list");
    goListUrl();
    loadClients();
  };

  const confirmDeleteClient = async (reason: string) => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    // Soft-delete: keep tombstone with basic info, remove related data
    await supabase.from("clients").update({ deleted_at: new Date().toISOString(), deletion_reason: reason || null }).eq("id", id);
    await supabase.functions.invoke("manage-auth", { body: { action: "delete", clientId: id } });
    await supabase.from("submissions").delete().eq("client_id", id);
    await supabase.from("remembered_mappings").delete().eq("client_id", id);
    await supabase.from("client_documents").delete().eq("client_id", id);
    // Delete the lead entirely (not restored to pending — client is permanently gone)
    await supabase.from("leads").delete().eq("client_id", id);
    if (selected && (selected as any).id === id) { setSelected(null); setView("list"); goListUrl(); }
    loadClients();
  };

  const migrateAllClients = async () => {
    setMsg("מגיר לקוחות...");
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || "";
    const anonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || "";
    const url = `${supabaseUrl}/functions/v1/manage-auth`;
    if (!supabaseUrl || !anonKey) { setMsg("err: חסרים פרטי Supabase ב-.env"); return; }
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
      body: JSON.stringify({ action: "migrate_all" }),
    });
    const data = await resp.json();
    if (!resp.ok) { setMsg("err: " + (data?.error || "שגיאה")); return; }
    setMsg(`ok: הגירה הושלמה — ${data.migrated} לקוחות עודכנו`);
    loadClients();
  };

  const openClient = async (client, opts: { pushUrl?: boolean; startTab?: string } = {}) => {
    const { pushUrl = true, startTab } = opts;
    const [{ data: subs }, { data: maps }, { data: freshClient }, { data: estimates }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id),
      supabase.from("clients").select("name,last_name,email,phone,username,last_active,required_docs,questionnaire_spouses,is_blocked,submission_notes,no_payslip_reason_s1,no_payslip_reason_s2").eq("id", client.id).maybeSingle(),
      supabase.from("category_estimates").select("*").eq("client_id", client.id).order("created_at", { ascending: true }),
    ]);
    const resolvedTab = startTab || sessionStorage.getItem(`admin_tab_${client.id}`) || "intake";
    setSelected({ ...client, ...(freshClient || {}), submissions: subs || [], mappings: maps || [], estimates: estimates || [], startTab: resolvedTab });
    setView("detail");
    if (pushUrl) pushClientUrl(client.id, resolvedTab);
  };

  const openPortfolio = async (client) => {
    const [{ data: subs }, { data: maps }, { data: estimates }] = await Promise.all([
      supabase.from("submissions").select("*").eq("client_id", client.id).order("created_at", { ascending: false }),
      supabase.from("remembered_mappings").select("*").eq("client_id", client.id),
      supabase.from("category_estimates").select("*").eq("client_id", client.id).order("created_at", { ascending: true }),
    ]);
    setSelected({ ...client, submissions: subs || [], mappings: maps || [], estimates: estimates || [], startTab: "portfolio" });
    setView("detail");
    pushClientUrl(client.id, "portfolio");
  };

  // URL-driven navigation: open client from URL on page load
  useEffect(() => {
    if (!urlTarget || clients.length === 0) return;
    const target = (clients as any[]).find(c => c.id === urlTarget.clientId);
    setUrlTarget(null);
    if (!target) { window.history.replaceState(null, "", "/"); return; }
    // Restore sub-tab from URL into sessionStorage so ClientDetail picks it up
    if (urlTarget.subTab) {
      const subTabKey = urlTarget.tab === "intake" ? `intake_tab_${urlTarget.clientId}`
        : urlTarget.tab === "workflow" ? `workflow_tab_${urlTarget.clientId}`
        : urlTarget.tab === "portfolio" ? `portfolio_tab_${urlTarget.clientId}`
        : null;
      if (subTabKey) sessionStorage.setItem(subTabKey, urlTarget.subTab);
    }
    openClient(target, { pushUrl: false, startTab: urlTarget.tab });
  }, [urlTarget, clients]); // eslint-disable-line

  // Popstate: handle browser back/forward
  useEffect(() => {
    const handler = () => {
      const parsed = parseAdminUrl();
      if (!parsed) { setSelected(null); setView("list"); }
      // forward navigation: re-open client from URL
      else {
        const target = (clients as any[]).find(c => c.id === parsed.clientId);
        if (target) openClient(target, { pushUrl: false, startTab: parsed.tab });
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }); // intentionally no deps — always uses fresh clients/openClient

  const completedClients = clients.filter(c => {
    // We'll check submission count in the detail view
    return true;
  });

  const handleCreateClientFromLead = (lead: { name: string; firstName: string; lastName: string; phone: string; leadId: string }) => {
    setPendingLeadId(lead.leadId);
    setForm(prev => ({ ...prev, name: lead.firstName, last_name: lead.lastName, phone: lead.phone }));
    setMainView("clients");
    setView("new");
    setMsg("");
    setJustCreated(null);
  };

  return (
    <>
    <style>{ADMIN_STYLES}</style>
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Sidebar */}
      <AdminSidebar
        mainView={mainView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        setMainView={(v) => {
          setMainView(v);
          setSidebarOpen(false);
          if (v === "clients") { setView("list"); setMsg(""); setSelected(null); setJustCreated(null); setSearch(""); setClientFilter("all"); goListUrl(); }
          setVisitedAdminViews(prev => { const next = new Set(prev); next.add(v); return next; });
        }}
        onLogout={onLogout}
      />

      {/* Overlay (mobile) */}
      <div
        className={`admin-overlay${sidebarOpen ? " admin-overlay-open" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Main content */}
      <div className="admin-main" style={{ flex: 1, minWidth: 0, padding: "32px 32px" }}>
        {/* Hamburger (mobile only) */}
        <button
          className="admin-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="פתח תפריט"
          style={{
            display: "none", alignItems: "center", gap: 8,
            marginBottom: 16, padding: "8px 12px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--surface2)",
            cursor: "pointer", fontFamily: "inherit", fontSize: 14, color: "var(--text)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          תפריט
        </button>
        {msg && (
          <div style={{ background: msg.startsWith("ok:") ? "var(--green-pale)" : "var(--red-light)", border: `1px solid ${msg.startsWith("ok:") ? "var(--green-mint)" : "var(--red)"}`, borderRadius: 10, padding: "10px 16px", marginBottom: 16, fontSize: 15, color: msg.startsWith("ok:") ? "var(--green-soft)" : "var(--red)" }}>
            {msg.replace(/^(ok:|err:|warn:)\s*/, "")}
          </div>
        )}

        {/* LEADS */}
        {visitedAdminViews.has("leads") && (
          <div style={{ display: mainView === "leads" ? "block" : "none" }}>
            <LeadsPanel onCreateClient={handleCreateClientFromLead} />
          </div>
        )}

        {/* CATEGORIES (lazy mount) */}
        {visitedAdminViews.has("categories") && (
          <div style={{ display: mainView === "categories" ? "block" : "none" }}>
            <CategoryManager />
          </div>
        )}

        {/* CLIENTS section */}
        {mainView === "clients" && (<>

        {/* Back button — only for new-client form; detail view has breadcrumb in its own header */}
        {view === "new" && (
          <div style={{ marginBottom: 20 }}>
            <Btn variant="ghost" size="sm" onClick={() => { goListUrl(); setView("list"); setMsg(""); setSelected(null); setJustCreated(null); setPendingLeadId(null); }}>← חזור ללקוחות</Btn>
          </div>
        )}

        {/* LIST */}
        {view === "list" && (() => {
          const liveClients = clients.filter(c => !c.archived_at && !c.deleted_at);
          const archivedClients = clients.filter(c => c.archived_at && !c.deleted_at);
          const deletedClients  = clients.filter(c => c.deleted_at);

          const active     = liveClients.filter(c => c.portfolio_open && !c.is_blocked);
          const waiting    = liveClients.filter(c => !c.is_blocked && !c.portfolio_open && c.submitted_at);
          const collecting = liveClients.filter(c => !c.is_blocked && !c.portfolio_open && !c.submitted_at);
          const blocked    = liveClients.filter(c => c.is_blocked);

          const allForFilter = clientFilter === "archived" ? archivedClients
            : clientFilter === "deleted" ? deletedClients
            : clientFilter === "active" ? active
            : clientFilter === "waiting" ? waiting
            : clientFilter === "collecting" ? collecting
            : clientFilter === "blocked" ? blocked
            : liveClients;

          const bySearch = search.trim()
            ? allForFilter.filter(c => `${c.name} ${c.username || ""} ${c.last_name || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
            : allForFilter;

          const filteredClients = clientFilter === "deleted" ? bySearch : [...bySearch].sort((a, b) => {
            let cmp = 0;
            if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "", "he");
            else if (sortBy === "last_active") cmp = (b.last_active || "").localeCompare(a.last_active || "");
            else cmp = (b.created_at || "").localeCompare(a.created_at || "");
            return sortAsc ? -cmp : cmp;
          });

          const totalLabel = clientFilter === "all" && !search.trim() ? liveClients.length : `${filteredClients.length} מתוך ${allForFilter.length}`;

          const kpiItems = [
            { id: "all",        label: "כולם",          count: liveClients.length,     color: "var(--text)" },
            { id: "active",     label: "תיק פעיל",      count: active.length,          color: "var(--green-mid)" },
            { id: "waiting",    label: "ממתין לפתיחה",  count: waiting.length,         color: "var(--gold)" },
            { id: "collecting", label: "אוסף נתונים",   count: collecting.length,      color: "var(--text-mid)" },
            ...(blocked.length > 0       ? [{ id: "blocked",  label: "חסום",    count: blocked.length,         color: "var(--red)" }] : []),
            ...(archivedClients.length > 0 ? [{ id: "archived", label: "ארכיון",  count: archivedClients.length, color: "#92400e" }] : []),
            ...(deletedClients.length > 0  ? [{ id: "deleted",  label: "מחוקים", count: deletedClients.length,  color: "var(--text-dim)" }] : []),
          ];

          return (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h1 style={{ fontFamily: "'Frank Ruhl Libre', serif", fontSize: 22, fontWeight: 600, color: "var(--text)", margin: 0, letterSpacing: "-0.01em" }}>
                  לקוחות ({totalLabel})
                </h1>
                <Btn size="sm" onClick={() => { setView("new"); setMsg(""); setJustCreated(null); }}>+ לקוח חדש</Btn>
              </div>

              {/* Search */}
              {!loading && clients.length > 0 && (
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם או שם משתמש..."
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12, direction: "rtl" }}
                />
              )}

              {/* Sort — hidden for archived/deleted */}
              {!loading && clients.length > 0 && clientFilter !== "deleted" && (
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
                    <button key={k.id} onClick={() => k.count > 0 && setClientFilter(k.id as any)} style={{
                      padding: "10px 18px", borderRadius: 12, cursor: k.count > 0 ? "pointer" : "default", fontFamily: "inherit",
                      background: clientFilter === k.id ? "var(--surface2)" : "var(--surface)",
                      border: `1px solid ${clientFilter === k.id ? "var(--green-mid)" : "var(--border)"}`,
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 76,
                      opacity: k.id !== "all" && k.count === 0 ? 0.4 : 1,
                    }}>
                      <span style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.count}</span>
                      <span style={{ fontSize: 13, color: clientFilter === k.id ? "var(--green-mid)" : "var(--text-dim)" }}>{k.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {loading ? (
                <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>טוען...</div>
              ) : liveClients.length === 0 && archivedClients.length === 0 && deletedClients.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "48px 24px" }}>
                  <IcoUsers size={40} />
                  <div style={{ color: "var(--text-dim)", marginTop: 8 }}>אין לקוחות עדיין</div>
                </Card>
              ) : filteredClients.length === 0 ? (
                <Card style={{ textAlign: "center", padding: "32px 24px", color: "var(--text-dim)" }}>אין לקוחות בקטגוריה זו</Card>
              ) : clientFilter === "deleted" ? (
                /* ── Deleted clients section ── */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredClients.map(c => (
                    <Card key={c.id} style={{ opacity: 0.8 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-mid)", display: "flex", alignItems: "center", gap: 8 }}>
                            {c.name}
                            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", background: "var(--surface2)", padding: "2px 7px", borderRadius: 4 }}>מחוק</span>
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3, display: "flex", gap: 12, flexWrap: "wrap" }}>
                            {c.username && <span>@{c.username}</span>}
                            {c.email && <span>{c.email}</span>}
                            {c.phone && <span>{c.phone}</span>}
                            <span>נמחק: {new Date(c.deleted_at).toLocaleDateString("he-IL")}</span>
                          </div>
                          {c.deletion_reason && (
                            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4, fontStyle: "italic" }}>
                              סיבה: {c.deletion_reason}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                /* ── Regular + Archive clients ── */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filteredClients.map(c => (
                    <ClientRow key={c.id} client={c} subCount={subCounts[c.id] ?? 0} readyForPortfolio={readyMap[c.id] ?? false} onOpen={openClient} onDelete={deleteClient} onRestore={restoreClient} />
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* NEW CLIENT */}
        {view === "new" && !justCreated && (
          <Card style={{ maxWidth: 440 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>לקוח חדש</div>
            <Input label="שם פרטי" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ישראל" />
            <Input label="שם משפחה" value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} placeholder="ישראלי" />
            <Input label="שם משתמש" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/\s/g, "").toLowerCase() }))} placeholder="israel123" />
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 15, color: "var(--text-mid)", marginBottom: 6, fontWeight: 600 }}>סיסמה</div>
              <div style={{ position: "relative" }}>
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="לפחות 6 תווים"
                  style={{ width: "100%", background: "var(--surface2)", border: "1.5px solid var(--border)", borderRadius: 10, padding: "11px 14px", paddingLeft: 40, color: "var(--text)", fontFamily: "'Heebo', sans-serif", fontSize: 17, direction: "rtl", boxSizing: "border-box", outline: "none" }}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPass(p => !p)} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center", padding: 4 }}>
                  {showPass ? <IcoEyeOff size={18} /> : <IcoEye size={18} />}
                </button>
              </div>
            </div>
            <Input label="מייל (לשליחת הוראות כניסה)" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="israel@gmail.com" />
            <Input label="טלפון" type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="050-0000000" />
            {msg && <div style={{ color: "var(--red)", fontSize: 14, marginBottom: 12 }}>{msg}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={createClient} disabled={!form.name || !form.username || form.password.length < 4}>צור לקוח</Btn>
              <Btn variant="ghost" onClick={() => { goListUrl(); setView("list"); }}>ביטול</Btn>
            </div>
          </Card>
        )}

        {/* NEW CLIENT SUCCESS + WHATSAPP */}
        {view === "new" && justCreated && (
          <div style={{ maxWidth: 480 }}>
            <Card style={{ textAlign: "center", padding: "24px 24px 20px", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, color: "var(--green-mid)" }}><IcoCheck size={40} /></div>
              <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 4 }}>הלקוח נוצר בהצלחה!</div>
              <div style={{ fontSize: 15, color: "var(--text-dim)" }}>{justCreated.name} · @{justCreated.username}</div>
            </Card>
            <WelcomeEmailCard name={justCreated.name} last_name={justCreated.last_name} username={justCreated.username} password={justCreated.password} email={justCreated.email} clientId={justCreated.id} onSent={loadClients} />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Btn onClick={() => setJustCreated(null)}>+ לקוח נוסף</Btn>
              <Btn variant="ghost" onClick={() => { goListUrl(); setView("list"); setJustCreated(null); loadClients(); }}>חזור לרשימה</Btn>
            </div>
          </div>
        )}

        {/* CLIENT DETAIL */}
        {view === "detail" && selected && (
          <ClientDetail client={selected} readyForPortfolio={readyMap[selected.id] ?? false} onDelete={deleteClient} onDirectDelete={deleteClientDirect} onArchive={archiveClient} onRestore={restoreClient} onBack={() => { goListUrl(); setView("list"); setMsg(""); setSelected(null); setJustCreated(null); setPendingLeadId(null); }} onRefresh={async () => { await loadClients(); const fresh = clients.find(c => c.id === selected.id) || selected; await openClient(fresh); }} />
        )}
        </>)}
      </div>
    </div>

    {deleteConfirm && (
      <ClientActionModal
        name={deleteConfirm.name}
        onArchive={() => archiveClient(deleteConfirm.id)}
        onDelete={reason => confirmDeleteClient(reason)}
        onCancel={() => setDeleteConfirm(null)}
      />
    )}
    <style>{`
      .client-row { transition: box-shadow 0.18s, transform 0.18s; cursor: pointer; }
      .client-row:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important; transform: translateY(-1px); }
      .client-row-delete { opacity: 0.25; transition: opacity 0.18s; }
      .client-row:hover .client-row-delete { opacity: 1; }
    `}</style>
    </>
  );
}

// ── Client row in list ────────────────────────────────────────────────────────
function ClientRow({ client, subCount, readyForPortfolio, onOpen, onDelete, onRestore }) {
  const isBlocked = client.is_blocked || false;

  const daysSinceWelcome = client.welcome_sent_at ? Math.floor((Date.now() - new Date(client.welcome_sent_at).getTime()) / 86400000) : null;
  const lastActivity = client.last_active ? new Date(client.last_active) : null;
  const daysSinceActivity = lastActivity ? Math.floor((Date.now() - lastActivity.getTime()) / 86400000) : 999;
  const showInactiveWarning = !isBlocked && client.welcome_sent_at && daysSinceWelcome >= INACTIVITY_DAYS && daysSinceActivity >= INACTIVITY_DAYS;

  const isArchived = !!client.archived_at;

  return (
    <div className="client-row" onClick={() => !isArchived && onOpen(client)} style={{ marginBottom: 2, opacity: isArchived ? 0.85 : 1 }}>
    <Card style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", flexWrap: "wrap", borderRight: isArchived ? "3px solid #92400e" : showInactiveWarning ? "3px solid var(--red)" : undefined }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          {client.name}
          {isArchived && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#92400e", background: "#fef3c7", padding: "2px 8px", borderRadius: 4 }}>ארכיון</span>
          )}
          {!isArchived && showInactiveWarning && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--red)", background: "rgba(192,57,43,0.1)", borderRadius: 20, padding: "2px 8px", fontWeight: 600 }}>
              <IcoWarn size={11} /> לא פעיל {daysSinceActivity >= 999 ? `${daysSinceWelcome}+` : daysSinceActivity} ימים
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", display: "flex", flexWrap: "wrap", gap: "0 14px", marginTop: 3 }}>
          {client.username && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>@{client.username}</span>}
          {!isArchived && client.last_active && <span style={{ color: "var(--text-mid)", display: "flex", alignItems: "center", gap: 4 }}><IcoClock /> פעיל {formatRelativeTime(client.last_active)}</span>}
          {isArchived && <span style={{ color: "#92400e" }}>הועבר לארכיון: {new Date(client.archived_at).toLocaleDateString("he-IL")}</span>}
          {!isArchived && (client.welcome_sent_at
            ? <span style={{ color: "var(--green-soft)", display: "flex", alignItems: "center", gap: 4 }}><IcoMail /> מייל נשלח {new Date(client.welcome_sent_at).toLocaleDateString("he-IL")}</span>
            : client.email ? <span style={{ display: "flex", alignItems: "center", gap: 4 }}><IcoMail /> טרם נשלח</span> : null)}
          {!isBlocked && !isArchived && !client.portfolio_open && (
            <span style={{ color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 4 }}>
              <IcoClock size={12} /> {subCount} הגשות
            </span>
          )}
        </div>
      </div>
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {isArchived ? (
          <>
            <Btn size="sm" onClick={() => onRestore(client.id)} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              שחזר לקוח
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => onOpen(client)} style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoEye /> פרטים</Btn>
          </>
        ) : (
          <>
            {client.portfolio_open && (
              <span style={{ padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600, background: "rgba(46,125,82,0.12)", color: "var(--green-mid)", display: "flex", alignItems: "center", gap: 4 }}>
                <IcoFolder size={13} /> תיק פעיל
              </span>
            )}
            <span style={{
              padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600,
              background: isBlocked ? "rgba(192,57,43,0.12)" : "rgba(46,125,82,0.12)",
              color: isBlocked ? "var(--red)" : "var(--green-mid)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              {isBlocked ? <><IcoLock size={12} /> חסום</> : <><IcoCheck size={12} /> פעיל</>}
            </span>
            <Btn variant="ghost" size="sm" onClick={() => onOpen(client)} style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoEye /> פרטים</Btn>
            {!client.portfolio_open && <ReminderEmailBtn client={client} />}
            {client.submitted_at && !client.portfolio_open && !isBlocked && (
              <Btn variant="success" size="sm" onClick={async () => {
                await supabase.from("clients").update({ portfolio_open: true }).eq("id", client.id);
                onOpen(client);
              }} style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoFolder /> פתח תיק כלכלי</Btn>
            )}
            <span className="client-row-delete">
              <Btn variant="danger" size="sm" onClick={() => onDelete(client.id, client.name)} style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoTrash /> מחק</Btn>
            </span>
          </>
        )}
      </div>
    </Card>
    </div>
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
      key: `p_${p.id}`, label: `${monthKeyToLabel(p.month_key) || p.label || "תלוש"}`,
      sub: p.filename, path: p.path, filename: p.filename,
    })),
    ...docs.flatMap(doc =>
      (doc.files || []).filter(f => f.path).map((f, i) => ({
        key: `d_${doc.id}_${i}`, label: `${doc.label}`,
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
        <div style={{ fontWeight: 700, display:"flex", alignItems:"center", gap:7 }}><IcoFolder size={15} /> קבצים שהועלו</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={toggleAll} style={{ background:"none", border:"1px solid var(--border)", borderRadius:7, padding:"5px 12px", fontSize: 14, color:"var(--text-dim)", cursor:"pointer", fontFamily:"inherit" }}>
            {selected.size === items.length ? "בטל הכל" : "בחר הכל"}
          </button>
          {selected.size > 0 && (
            <Btn size="sm" onClick={downloadSelected} disabled={bulkLoading}>
              {bulkLoading ? "מוריד..." : <><IcoDownload size={14} /> הורד נבחרים ({selected.size})</>}
            </Btn>
          )}
        </div>
      </div>
      {items.map(item => (
        <div key={item.key} onClick={() => toggleItem(item.key)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", marginBottom:6, background: selected.has(item.key) ? "rgba(46,183,124,0.06)" : "var(--surface2)", border:`1px solid ${selected.has(item.key) ? "rgba(46,183,124,0.3)" : "var(--border)"}`, borderRadius:10, cursor:"pointer" }}>
          <input type="checkbox" checked={selected.has(item.key)} onChange={() => {}} style={{ accentColor:"var(--green-mid)", width:16, height:16, flexShrink:0 }} />
          <div style={{ flex:1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight:600 }}>{item.label}</div>
            <div style={{ fontSize: 13, color:"var(--text-dim)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={item.sub}>{item.sub}</div>
          </div>
          <Btn size="sm" variant="secondary" onClick={e => { e.stopPropagation(); downloadStorageFile(item.path, item.filename); }}><IcoDownload size={13} /> הורד</Btn>
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
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 15, color:"var(--text-mid)" }}>תלושים ישנים (ללא קובץ)</div>
      {payslips.map(p => (
        <div key={p.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 14px", background:"var(--surface2)", borderRadius:8, marginBottom:4, fontSize: 14 }}>
          <span>{monthKeyToLabel(p.month_key) || p.label}</span>
          <span style={{ color:"var(--text-dim)" }}>{p.filename} (אין קובץ)</span>
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
  if (!data.length) return <Card style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}><div style={{ marginBottom: 8, opacity: 0.4 }}><IcoUser size={32} /></div>הלקוח טרם מילא שאלון<br /><span style={{ fontSize: 13 }}>יופיע כאן לאחר שהלקוח יגיש את השאלון מהאפליקציה שלו</span></Card>;

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
                {idx === 1 ? <><IcoUser size={15} /> בן/בת זוג ראשון/ה</> : <><IcoUsers size={15} /> בן/בת זוג שני/ה</>}
                {done && <span style={{ background: "rgba(46,204,138,0.15)", color: "var(--green-soft)", borderRadius: 20, padding: "2px 10px", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> הושלם</span>}
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

// ── Sub-tab bar (pill style) ──────────────────────────────────────────────────
function SubTabBar({ tabs, active, onSelect }: { tabs: { id: string; label: string }[]; active: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 2, marginBottom: 20 }}>
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(216,243,220,0.5)"; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            style={{
              padding: "5px 16px", fontSize: 14, fontFamily: "inherit",
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "var(--green-deep)" : "var(--text-dim)",
              background: isActive ? "var(--green-mint)" : "transparent",
              border: "none", borderRadius: 20,
              cursor: "pointer", transition: "all 0.15s",
              whiteSpace: "nowrap", letterSpacing: "0.01em",
            }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Client detail with tabs ───────────────────────────────────────────────────
function ClientDetail({ client, readyForPortfolio, onDelete, onDirectDelete, onArchive, onRestore, onBack, onRefresh }) {
  const initialTab = client.startTab || sessionStorage.getItem(`admin_tab_${client.id}`) || "intake";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [visitedAdminTabs, setVisitedAdminTabs] = useState<Set<string>>(() => new Set([initialTab]));
  const switchAdminTab = (id) => {
    sessionStorage.setItem(`admin_tab_${client.id}`, id);
    setActiveTab(id);
    setVisitedAdminTabs(prev => { const next = new Set(prev); next.add(id); return next; });
    if (id === "intake")    setIntakeTabRaw("initial");
    if (id === "workflow")  setWorkflowTabRaw("data");
    if (id === "portfolio") setPortfolioTabRaw("scenario_plan");
    pushClientUrl(client.id, id);
  };
  const [intakeTab,    setIntakeTabRaw]    = useState("initial");
  const [workflowTab,  setWorkflowTabRaw]  = useState("data");
  const [portfolioTab, setPortfolioTabRaw] = useState("scenario_plan");
  const setIntakeTab    = (id: string) => { sessionStorage.setItem(`intake_tab_${client.id}`,    id); setIntakeTabRaw(id); pushClientUrl(client.id, "intake", id); };
  const setWorkflowTab  = (id: string) => { sessionStorage.setItem(`workflow_tab_${client.id}`,  id); setWorkflowTabRaw(id); pushClientUrl(client.id, "workflow", id); };
  const setPortfolioTab = (id: string) => { sessionStorage.setItem(`portfolio_tab_${client.id}`, id); setPortfolioTabRaw(id); pushClientUrl(client.id, "portfolio", id); };
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
    { id: "intake", label: "פגישה ראשונה" },
    ...(client.portfolio_open ? [{ id: "workflow", label: "תהליך עבודה" }] : []),
    ...(client.portfolio_open ? [{ id: "portfolio", label: "תיק כלכלי" }] : []),
    { id: "log", label: "לוג שינויים", badge: newCatCount },
    { id: "personal", label: "פרטים אישיים" },
  ];

  const intakeTabs = [
    { id: "initial", label: "שאלון ראשוני" },
    { id: "required_docs", label: "מסמכים נדרשים" },
    { id: "questionnaire", label: "שאלון אישי" },
  ];

  const workflowTabs = [
    { id: "data", label: "תיק מסמכים" },
    { id: "balance", label: "מאזן" },
    { id: "questionnaire", label: "שאלון אישי" },
  ];

  const portfolioTabs = [
    { id: "scenario_plan", label: "מאזן מבוסס תסריטים" },
    { id: "machsanot", label: "ניהול מחסניות" },
    { id: "savings", label: "פירוט חסכונות" },
  ];

  return (
    <div>
      {/* Identity Strip */}
      <div style={{ marginBottom: 16, background: "var(--surface2)", borderRadius: 16, overflow: "hidden" }}>
        {/* Main row */}
        <div style={{ padding: "16px 20px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {/* Back button */}
          <button
            onClick={onBack}
            title="חזור ללקוחות"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 6, borderRadius: 8, display: "flex", alignItems: "center", transition: "color 0.12s, background 0.12s", flexShrink: 0 }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--green-mid)"; el.style.background = "rgba(0,0,0,0.06)"; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = "var(--text-dim)"; el.style.background = "none"; }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          {/* Initials avatar */}
          {(() => {
            const initials = [client.name?.[0], client.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";
            return (
              <div style={{
                width: 48, height: 48, borderRadius: "50%",
                background: "linear-gradient(135deg, var(--green-soft), var(--green-mid))",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: initials.length > 1 ? 17 : 20,
                flexShrink: 0, letterSpacing: "0.02em",
              }}>
                {initials}
              </div>
            );
          })()}

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--text)" }}>
              {client.name}{client.last_name ? ` ${client.last_name}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
              {client.last_active && <>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}><IcoClock size={11} /> התחבר לאחרונה: {formatRelativeTime(client.last_active)}</span>
              </>}
              {(() => {
                let label = "", bg = "", color = "";
                if      (client.deleted_at)        { label = "מחוק";          bg = "rgba(239,68,68,0.12)";   color = "var(--red)"; }
                else if (client.archived_at)       { label = "ארכיון";        bg = "rgba(180,120,60,0.14)";  color = "#92400e"; }
                else if (client.is_blocked)        { label = "חסום";          bg = "rgba(239,68,68,0.12)";   color = "var(--red)"; }
                else if (client.portfolio_open)    { label = "תיק פעיל";     bg = "rgba(34,197,94,0.13)";   color = "var(--green-mid)"; }
                else if (client.submitted_at)      { label = "ממתין לפתיחה"; bg = "rgba(234,179,8,0.13)";   color = "var(--gold)"; }
                else                               { label = "אוסף נתונים";  bg = "rgba(100,116,139,0.12)"; color = "var(--text-mid)"; }
                return (
                  <span style={{ padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: bg, color }}>
                    {label}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Open portfolio action */}
          {client.submitted_at && !client.portfolio_open && !client.deleted_at && !client.archived_at && (
            <Btn onClick={async () => {
              await supabase.from("clients").update({ portfolio_open: true }).eq("id", client.id);
              onRefresh();
            }} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IcoFolder size={15} /> פתח תיק כלכלי
            </Btn>
          )}
        </div>
      </div>

      {/* Banner — new client-created categories */}
      {newCatCount > 0 && activeTab !== "log" && (
        <div style={{ marginBottom: 16, background: "rgba(251,191,36,0.12)", border: "2px solid rgba(251,191,36,0.5)", borderRadius: 12, padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontWeight: 700, color: "var(--gold)", display: "flex", alignItems: "center", gap: 6 }}><IcoWarn size={15} /> הלקוח יצר {newCatCount} קטגוריות חדשות</span>
            <span style={{ fontSize: 15, color: "var(--text-dim)", marginRight: 8 }}>— ראה בלוג שינויים</span>
          </div>
          <Btn size="sm" onClick={() => { switchAdminTab("log"); markLogSeen(); }}>עבור ללוג</Btn>
        </div>
      )}

      {/* Banner — הערת הגשה מהלקוח */}
      {client.submission_notes && (
        <div style={{ marginBottom: 16, background: "rgba(251,191,36,0.08)", border: "2px solid rgba(251,191,36,0.4)", borderRadius: 12, padding: "14px 20px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          <div>
            <div style={{ fontWeight: 700, color: "var(--gold)", marginBottom: 4, fontSize: 15 }}>הערה מהלקוח בהגשה</div>
            <div style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.65 }}>{client.submission_notes}</div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 0, overflowX: "auto", whiteSpace: "nowrap" }}>
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { switchAdminTab(t.id); if (t.id === "log") markLogSeen(); }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text)"; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"; }}
              style={{
                padding: "10px 16px", fontSize: 14, fontFamily: "inherit",
                fontWeight: isActive ? 700 : 400,
                color: isActive ? "var(--green-mid)" : "var(--text-dim)",
                background: "none", border: "none",
                borderBottom: `3px solid ${isActive ? "var(--green-mid)" : "transparent"}`,
                cursor: "pointer", marginBottom: -1,
                display: "flex", alignItems: "center", gap: 6,
                transition: "color 0.12s",
              }}>
              {t.label}
              {(t as any).badge > 0 && (
                <span style={{ background: "var(--red)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                  {(t as any).badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* INTAKE TAB — with sub-tabs */}
      {visitedAdminTabs.has("intake") && (
        <div style={{ display: activeTab === "intake" ? "block" : "none" }}>
          <SubTabBar tabs={intakeTabs} active={intakeTab} onSelect={setIntakeTab} />
          <div style={{ display: intakeTab === "initial" ? "block" : "none" }}><IntakeForm client={client} /></div>
          <div style={{ display: intakeTab === "required_docs" ? "block" : "none" }}><RequiredDocsTab client={client} onRefresh={onRefresh} /></div>
          <div style={{ display: intakeTab === "questionnaire" ? "block" : "none" }}><QuestionnaireViewer clientId={client.id} spousesCount={client.questionnaire_spouses || 1} /></div>
        </div>
      )}

      {/* WORKFLOW TAB — with sub-tabs */}
      {visitedAdminTabs.has("workflow") && (
        <div style={{ display: activeTab === "workflow" ? "block" : "none" }}>
          <SubTabBar tabs={workflowTabs} active={workflowTab} onSelect={setWorkflowTab} />
          <div style={{ display: workflowTab === "data" ? "block" : "none" }}>
            <div>
              {(client.no_payslip_reason_s1 || client.no_payslip_reason_s2) && (
                <div style={{ marginBottom:16, padding:"12px 16px", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.25)", borderRadius:10 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:8, color:"var(--text)", display:"flex", alignItems:"center", gap:7 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> הצהרות "אין תלושים"</div>
                  {client.no_payslip_reason_s1 && <div style={{ fontSize:14, color:"var(--text-mid)", marginBottom:4 }}>בן/בת זוג 1: <span style={{ color:"var(--text)" }}>{client.no_payslip_reason_s1}</span></div>}
                  {client.no_payslip_reason_s2 && <div style={{ fontSize:14, color:"var(--text-mid)" }}>בן/בת זוג 2: <span style={{ color:"var(--text)" }}>{client.no_payslip_reason_s2}</span></div>}
                </div>
              )}
              <AllFilesSection clientId={client.id} />
              <PayslipsSection clientId={client.id} />
              <div style={{ fontWeight: 700, marginBottom: 12, marginTop: 8 }}>היסטוריית הגשות (תנועות)</div>
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
                        <Btn size="sm" variant="secondary" onClick={exportOne}><IcoDownload size={13} /> Excel</Btn>
                      </div>
                    </div>
                  </Card>
                );
              })}
              {client.estimates?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <div style={{ fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
                    הערכות חודשיות
                    <span style={{ background: "rgba(251,191,36,0.15)", color: "var(--gold)", fontSize: 12, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>הוסף ידנית ע"י הלקוח</span>
                  </div>
                  <Card style={{ padding: 0, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                          <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600, fontSize: 13, color: "var(--text-dim)" }}>קטגוריה</th>
                          <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600, fontSize: 13, color: "var(--text-dim)" }}>הערכה חודשית</th>
                        </tr>
                      </thead>
                      <tbody>
                        {client.estimates.map((e, i) => (
                          <tr key={e.id} style={{ borderBottom: i < client.estimates.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <td style={{ padding: "12px 16px", fontSize: 15 }}>{e.category_name}</td>
                            <td style={{ padding: "12px 16px", fontSize: 15, fontWeight: 700, color: "var(--red)", textAlign: "left" }}>
                              ₪{Number(e.monthly_amount).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                </div>
              )}
              {client.mappings.length > 0 && (
                <>
                  <div style={{ fontWeight: 700, margin: "20px 0 12px" }}>מיפויים שנזכרו</div>
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
          </div>
          <div style={{ display: workflowTab === "balance" ? "block" : "none" }}><TransactionSummaryTab client={client} /></div>
          <div style={{ display: workflowTab === "questionnaire" ? "block" : "none" }}><QuestionnaireViewer clientId={client.id} spousesCount={client.questionnaire_spouses || 1} /></div>
        </div>
      )}

      {/* PORTFOLIO TAB — with sub-tabs */}
      {visitedAdminTabs.has("portfolio") && (
        <div style={{ display: activeTab === "portfolio" ? "block" : "none" }}>
          <SubTabBar tabs={portfolioTabs} active={portfolioTab} onSelect={setPortfolioTab} />
          <div style={{ display: portfolioTab === "scenario_plan" ? "block" : "none" }}><ScenarioPlanTab client={client} /></div>
          <div style={{ display: portfolioTab === "machsanot" ? "block" : "none" }}><MachsanotTab client={client} /></div>
          <div style={{ display: portfolioTab === "savings" ? "block" : "none" }}><ComingSoon label="פירוט חסכונות" /></div>
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
        <PersonalTab client={client} onDelete={onDelete} onDirectDelete={onDirectDelete} onArchive={onArchive} onRestore={onRestore} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ── Coming soon placeholder ───────────────────────────────────────────────────
function ComingSoon({ label }) {
  return (
    <Card style={{ textAlign: "center", padding: "64px 32px" }}>
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>—</div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>{label}</div>
      <div style={{ color: "var(--text-dim)", fontSize: 16, marginBottom: 6 }}>הסעיף הזה נמצא בפיתוח ובבנייה</div>
      <div style={{ color: "var(--text-dim)", fontSize: 14 }}>בקרוב תוכל לנהל כאן את כל הנתונים הפיננסיים של הלקוח</div>
    </Card>
  );
}

// ── Personal tab ─────────────────────────────────────────────────────────────
function PersonalTab({ client, onDelete, onDirectDelete, onRefresh, onArchive, onRestore }) {
  const [editName, setEditName] = useState(client.name);
  const [editLastName, setEditLastName] = useState(client.last_name || "");
  const [editEmail, setEditEmail] = useState(client.email || "");
  const [editPhone, setEditPhone] = useState(client.phone || "");
  const [editUsername, setEditUsername] = useState(client.username || "");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockConfirm, setBlockConfirm] = useState(false);
  const isBlocked = client.is_blocked || false;
  const isArchived = !!client.archived_at;

  // ── Revert to lead ────────────────────────────────────────────────
  const REVERT_STATUSES = [
    { value: "not_fit",        label: "לא מתאים" },
    { value: "not_interested", label: "לא מעוניין" },
    { value: "pending",        label: "מתלבטים" },
  ] as const;
  type RevertStatus = "not_fit" | "not_interested" | "pending";

  const [revertModal, setRevertModal]               = useState(false);
  const [revertCheckLoading, setRevertCheckLoading] = useState(false);
  const [revertExistingLead, setRevertExistingLead] = useState<any>(null);
  const [revertChecked, setRevertChecked]           = useState(false);
  const [revertStatus, setRevertStatus]             = useState<RevertStatus>("not_fit");
  const [revertReason, setRevertReason]             = useState("");
  const [revertSaving, setRevertSaving]             = useState(false);
  const [revertForm, setRevertForm]                 = useState({ name: "", phone: "", source: "referral", date: "", notes: "" });
  const [revertFormStatus, setRevertFormStatus]     = useState<RevertStatus>("not_fit");

  const openRevertModal = async () => {
    setRevertModal(true);
    setRevertChecked(false);
    setRevertCheckLoading(true);
    setRevertReason("");
    setRevertStatus("not_fit");
    const { data: lead } = await supabase.from("leads").select("*").eq("client_id", client.id).maybeSingle();
    setRevertExistingLead(lead || null);
    if (!lead) {
      setRevertForm({
        name: [client.name, client.last_name].filter(Boolean).join(" "),
        phone: client.phone || "",
        source: "referral",
        date: new Date().toISOString().split("T")[0],
        notes: "",
      });
      setRevertFormStatus("not_fit");
    }
    setRevertCheckLoading(false);
    setRevertChecked(true);
  };

  const confirmRevert = async () => {
    setRevertSaving(true);
    if (revertExistingLead) {
      const updatedNotes = revertReason
        ? (revertExistingLead.notes ? revertExistingLead.notes + "\n" + revertReason : revertReason)
        : revertExistingLead.notes;
      // Critical update (status + client_id) separate from optional was_client tag
      await supabase.from("leads").update({ status: revertStatus, client_id: null, notes: updatedNotes }).eq("id", revertExistingLead.id);
      supabase.from("leads").update({ was_client: true }).eq("id", revertExistingLead.id).then(() => {});
    } else {
      const notes = revertReason || revertForm.notes;
      const { data: newLead } = await supabase.from("leads").insert([{
        name: revertForm.name, phone: revertForm.phone, source: revertForm.source,
        date: revertForm.date, notes, status: revertFormStatus,
      }]).select("id").single();
      if (newLead) {
        supabase.from("leads").update({ was_client: true }).eq("id", newLead.id).then(() => {});
      }
    }
    await onDirectDelete(client.id);
  };

  const toggleBlock = () => { setBlockConfirm(true); };

  const confirmToggleBlock = async () => {
    setBlockConfirm(false);
    setLoading(true);
    const { error } = await supabase.from("clients").update({ is_blocked: !isBlocked }).eq("id", client.id);
    if (error) showMsg("err: שגיאה");
    else { showMsg(isBlocked ? "ok: הלקוח שוחרר" : "ok: הלקוח נחסם"); onRefresh(); }
    setLoading(false);
  };

  const showMsg = (m) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  const saveDetails = async () => {
    setLoading(true);
    const newUsername = editUsername.trim().toLowerCase();
    const usernameChanged = newUsername !== client.username;
    if (usernameChanged) {
      if (!newUsername) { showMsg("err: שם משתמש לא יכול להיות ריק"); setLoading(false); return; }
      const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
        body: { action: "update_username", clientId: client.id, newUsername },
      });
      if (fnErr || !authResult?.ok) {
        showMsg("err: " + (authResult?.error || "שגיאה בעדכון שם משתמש"));
        setLoading(false);
        return;
      }
    }
    const { error } = await supabase.from("clients").update({ name: editName, last_name: editLastName || null, email: editEmail, phone: editPhone }).eq("id", client.id);
    if (error) showMsg("err: שגיאה בשמירה");
    else { showMsg("ok: הפרטים עודכנו בהצלחה"); onRefresh(); }
    setLoading(false);
  };

  const changePassword = async () => {
    if (newPass.length < 4) { showMsg("err: סיסמה חייבת להיות לפחות 4 תווים"); return; }
    if (newPass !== confirmPass) { showMsg("err: הסיסמאות לא תואמות"); return; }
    setLoading(true);
    // Update via Supabase Auth only (no plaintext stored)
    const { data: authResult, error: fnErr } = await supabase.functions.invoke("manage-auth", {
      body: { action: "update_password", clientId: client.id, password: newPass },
    });
    if (fnErr || !authResult?.ok) {
      showMsg("err: שגיאה בעדכון סיסמה: " + (authResult?.error || fnErr?.message));
    } else {
      showMsg("ok: הסיסמה עודכנה"); setNewPass(""); setConfirmPass("");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {/* Details card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}><IcoUser size={16} /> פרטי לקוח</div>
        <Input label="שם פרטי" value={editName} onChange={e => setEditName(e.target.value)} />
        <Input label="שם משפחה" value={editLastName} onChange={e => setEditLastName(e.target.value)} />
        <Input label="מייל" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="example@gmail.com" />
        <Input label="טלפון" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="050-0000000" />
        <Input label="שם משתמש לכניסה" value={editUsername} onChange={e => setEditUsername(e.target.value.replace(/\s/g, "").toLowerCase())} placeholder="israel123" />
        {msg && <div style={{ fontSize: 14, color: msg.startsWith("ok:") ? "var(--green-soft)" : "var(--red)", marginBottom: 12 }}>{msg.replace(/^(ok:|err:)\s*/, "")}</div>}
        <Btn onClick={saveDetails} disabled={loading}>שמור שינויים</Btn>
      </Card>

      {/* Password card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}><IcoKey size={16} /> שינוי סיסמה</div>
        <Input label="סיסמה חדשה" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="לפחות 4 תווים" />
        <Input label="אימות סיסמה" type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="הכנס שוב את הסיסמה" />
        {msg && <div style={{ fontSize: 14, color: msg.startsWith("ok:") ? "var(--green-soft)" : "var(--red)", marginBottom: 12 }}>{msg.replace(/^(ok:|err:)\s*/, "")}</div>}
        <Btn onClick={changePassword} disabled={loading || !newPass || !confirmPass}>עדכן סיסמה</Btn>
      </Card>

      {/* Block card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}><IcoLock size={16} /> ניהול גישה</div>
        <div style={{ fontSize: 15, color: "var(--text-dim)", marginBottom: 14 }}>
          {isBlocked ? "הלקוח חסום — לא יכול להתחבר לאפליקציה." : "הלקוח פעיל — יכול להתחבר לאפליקציה."}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn variant={isBlocked ? "secondary" : "danger"} onClick={toggleBlock} disabled={loading}>
            {isBlocked ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoUnlock size={14} /> שחרר לקוח</span> : <span style={{ display: "flex", alignItems: "center", gap: 5 }}><IcoLock size={14} /> חסום לקוח</span>}
          </Btn>
          <Btn variant="danger" onClick={() => onDelete(client.id, client.name)} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <IcoTrash size={14} /> מחק לקוח
          </Btn>
        </div>
      </Card>

      {/* Archive card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
          ניהול סטטוס לקוח
        </div>
        {isArchived ? (
          <>
            <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#92400e", lineHeight: 1.6 }}>
              לקוח זה נמצא בארכיון — הגישה לאפליקציה חסומה. ניתן לשחזר בכל עת.
            </div>
            <Btn onClick={() => { onRestore(client.id); onRefresh(); }} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              שחזר מארכיון
            </Btn>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.6 }}>
              העברה לארכיון שומרת את כל הנתונים וחוסמת גישה לאפליקציה. ניתן לשחזר בכל עת.
            </div>
            <Btn variant="secondary" onClick={() => { onArchive(client.id); }} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              העבר לארכיון
            </Btn>
          </>
        )}
      </Card>

      {/* Revert to lead card — only for non-archived clients */}
      {!isArchived && <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
          <IcoUser size={16} /> החזרה לליד
        </div>
        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.6 }}>
          הסרת הלקוח מהמערכת והחזרתו לרשימת הלידים. הגישה לאפליקציה תבוטל.
        </div>
        <Btn variant="danger" onClick={openRevertModal} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          החזר לליד
        </Btn>
      </Card>}

      {/* Welcome email card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 7 }}><IcoMail size={15} /> שלח הוראות כניסה</div>
        <WelcomeEmailCard name={client.name} last_name={client.last_name || ""} username={client.username} email={client.email || ""} clientId={client.id} onSent={onRefresh} />
      </Card>

      {/* Info card */}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>מידע נוסף</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "תאריך הצטרפות", value: new Date(client.created_at).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }) },
            { label: "סנכרון MAX אחרון", value: (client as any).max_last_sync ? new Date((client as any).max_last_sync).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "לא סונכרן" },
            { label: "סטטוס תיק", value: client.portfolio_open ? "פעיל" : "טרם נפתח" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${"var(--border)"}22`, fontSize: 15 }}>
              <span style={{ color: "var(--text-dim)" }}>{item.label}</span>
              <span style={{ fontWeight: 600 }}>{item.value}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Block confirm modal */}
      {blockConfirm && (
        <>
          <div onClick={() => setBlockConfirm(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:"var(--z-top-back)" }} />
          <div style={{ position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:340, background:"var(--surface)", borderRadius:16, boxShadow:"0 24px 60px rgba(0,0,0,0.2)", zIndex:"var(--z-top)", padding:"28px 28px 22px", textAlign:"center" }}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:12, color: isBlocked ? "var(--green-mid)" : "var(--red)" }}>
              {isBlocked ? <IcoUnlock size={28} /> : <IcoLock size={28} />}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:8 }}>{isBlocked ? "שחרור לקוח" : "חסימת לקוח"}</div>
            <div style={{ fontSize:14, color:"var(--text-mid)", marginBottom:24, lineHeight:1.5 }}>
              {isBlocked ? <>שחרר את <strong>{client.name}</strong> לגישה לאפליקציה?</> : <>חסום את <strong>{client.name}</strong> ומנע גישה לאפליקציה?</>}
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
              <button onClick={() => setBlockConfirm(false)} style={{ padding:"9px 20px", borderRadius:9, border:"1px solid var(--border)", background:"none", fontFamily:"inherit", fontSize:14, cursor:"pointer", color:"var(--text-mid)" }}>ביטול</button>
              <button onClick={confirmToggleBlock} style={{ padding:"9px 20px", borderRadius:9, border:"none", background: isBlocked ? "var(--green-mid)" : "var(--red)", color:"#fff", fontFamily:"inherit", fontSize:14, fontWeight:600, cursor:"pointer" }}>{isBlocked ? "שחרר" : "חסום"}</button>
            </div>
          </div>
        </>
      )}

      {/* Revert to lead modal */}
      {revertModal && (
        <>
          <div onClick={() => !revertSaving && setRevertModal(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:"var(--z-top-back)", backdropFilter:"blur(8px)" }} />
          <div style={{
            position:"fixed", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            width:460, maxHeight:"90vh", overflowY:"auto",
            background:"var(--surface)", borderRadius:18,
            boxShadow:"0 32px 80px rgba(0,0,0,0.22)",
            zIndex:"var(--z-top)", display:"flex", flexDirection:"column",
          }}>
            {/* Header */}
            <div style={{ padding:"22px 28px 18px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", position:"relative" }}>
              <button onClick={() => !revertSaving && setRevertModal(false)} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-dim)", fontSize:16, padding:4, lineHeight:1, borderRadius:6 }}>×</button>
              <div style={{ position:"absolute", left:"50%", transform:"translateX(-50%)", fontFamily:"'Rubik', sans-serif", fontSize:17, fontWeight:700, color:"var(--text)", whiteSpace:"nowrap" }}>
                {revertCheckLoading ? "טוען..." : revertExistingLead ? "החזרה לליד" : "יצירת ליד"}
              </div>
            </div>

            {/* Body */}
            {revertCheckLoading ? (
              <div style={{ padding:"48px 0", textAlign:"center", color:"var(--text-dim)", fontSize:14 }}>בודק נתונים...</div>
            ) : revertChecked && (
              <div style={{ padding:"22px 28px", display:"flex", flexDirection:"column", gap:16 }}>

                {/* Path A — existing lead */}
                {revertExistingLead && (
                  <>
                    <div style={{ fontSize:14, color:"var(--text-mid)", lineHeight:1.6 }}>
                      ליד מקורי קיים במערכת. בחר את הסטטוס שאליו יעבור:
                    </div>
                    <div style={{ display:"flex", gap:8 }}>
                      {REVERT_STATUSES.map(s => (
                        <button key={s.value} onClick={() => setRevertStatus(s.value)}
                          style={{
                            flex:1, padding:"9px 0", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer",
                            border: revertStatus === s.value ? "2px solid var(--green-mid)" : "1.5px solid var(--border)",
                            background: revertStatus === s.value ? "rgba(45,106,79,0.07)" : "var(--surface2)",
                            color: revertStatus === s.value ? "var(--green-mid)" : "var(--text-mid)",
                            transition:"all 0.15s",
                          }}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Path B — no lead, create new */}
                {!revertExistingLead && (
                  <>
                    <div style={{ background:"var(--surface2)", borderRadius:10, padding:"12px 16px", fontSize:13, color:"var(--text-mid)", lineHeight:1.6, borderRight:"3px solid var(--border)" }}>
                      לקוח זה נוצר ישירות ללא פתיחת ליד. הפרטים ממולאים אוטומטית וניתן לעריכה.
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:6 }}>שם מלא</div>
                      <input value={revertForm.name} onChange={e => setRevertForm(p => ({...p, name:e.target.value}))}
                        style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontFamily:"inherit", fontSize:15, outline:"none", boxSizing:"border-box", direction:"rtl" }} />
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:6 }}>טלפון</div>
                      <input value={revertForm.phone} onChange={e => setRevertForm(p => ({...p, phone:e.target.value}))} type="tel"
                        style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontFamily:"inherit", fontSize:15, outline:"none", boxSizing:"border-box", direction:"ltr", textAlign:"right" }} />
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:6 }}>מקור פנייה</div>
                      <CustomSelect
                        value={revertForm.source}
                        onChange={v => setRevertForm(p => ({...p, source: v as string}))}
                        options={[
                          { value: "referral",  label: "המלצה" },
                          { value: "facebook",  label: "פייסבוק" },
                          { value: "instagram", label: "אינסטגרם" },
                          { value: "google",    label: "גוגל" },
                          { value: "other",     label: "אחר" },
                        ]}
                        dropdownZIndex={9010}
                        style={{ width: "100%" }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:6 }}>תאריך שיחה</div>
                      <input value={revertForm.date} onChange={e => setRevertForm(p => ({...p, date:e.target.value}))} type="date"
                        style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontFamily:"inherit", fontSize:15, outline:"none", boxSizing:"border-box", direction:"ltr", textAlign:"right" }} />
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:6 }}>בחר סטטוס</div>
                      <div style={{ display:"flex", gap:8 }}>
                        {REVERT_STATUSES.map(s => (
                          <button key={s.value} onClick={() => setRevertFormStatus(s.value)}
                            style={{
                              flex:1, padding:"9px 0", borderRadius:8, fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer",
                              border: revertFormStatus === s.value ? "2px solid var(--green-mid)" : "1.5px solid var(--border)",
                              background: revertFormStatus === s.value ? "rgba(45,106,79,0.07)" : "var(--surface2)",
                              color: revertFormStatus === s.value ? "var(--green-mid)" : "var(--text-mid)",
                              transition:"all 0.15s",
                            }}>
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Reason — both paths */}
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:"var(--text-mid)", marginBottom:6 }}>סיבת השינוי</div>
                  <textarea value={revertReason} onChange={e => setRevertReason(e.target.value)} rows={3}
                    placeholder='למשל: "לא עמד בקריטריונים, נסגרה שיחה"'
                    style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid var(--border)", background:"var(--surface2)", color:"var(--text)", fontFamily:"inherit", fontSize:15, outline:"none", boxSizing:"border-box", direction:"rtl", resize:"none" }} />
                </div>
              </div>
            )}

            {/* Footer */}
            {revertChecked && (
              <div style={{ padding:"16px 28px", borderTop:"1px solid var(--border)", display:"flex", justifyContent:"flex-start", gap:10 }}>
                <button onClick={() => !revertSaving && setRevertModal(false)}
                  style={{ padding:"10px 18px", borderRadius:10, border:"1px solid var(--border)", background:"none", fontFamily:"inherit", fontSize:14, cursor:"pointer", color:"var(--text-mid)" }}>
                  ביטול
                </button>
                <button onClick={confirmRevert} disabled={revertSaving}
                  style={{ padding:"10px 22px", borderRadius:10, border:"none", background:"var(--red)", color:"#fff", fontFamily:"inherit", fontSize:14, fontWeight:600, cursor:revertSaving ? "not-allowed" : "pointer", opacity:revertSaving ? 0.7 : 1 }}>
                  {revertSaving ? "מעבד..." : revertExistingLead ? "החזר לליד" : "פתח ליד והסר לקוח"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
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
        <div style={{ fontWeight: 700, fontSize: 16, display:"flex", alignItems:"center", gap:7 }}><IcoDownload size={15} /> ייצוא לאקסל</div>
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
            ייצוא Excel ({filtered.length})
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
// maps required_doc id → client_documents.category value
const DOC_ID_MAP: Record<string, string> = {
  loans: "loans_section", provident: "provident_fund", pl: "profit_loss",
  savings: "savings_pension", retirement: "retirement_forecast",
  checks: "deferred_checks", debts_other: "debts_other",
  bank_stmt: "bank_stmt_meta",
};

const ALL_REQUIRED_DOC_OPTIONS = [
  { id: "bank_stmt",    label: 'פירוט עו"ש' },
  { id: "loans",        label: "מסמכי הלוואות" },
  { id: "provident",    label: "יתרת קרן השתלמות" },
  { id: "pl",           label: "דוח רווח והפסד (לעצמאיים)" },
  { id: "savings",      label: "פירוט חסכונות ופנסיה" },
  { id: "retirement",   label: "דוח תחזית פרישה (מעל גיל 55)" },
  { id: "checks",       label: "שיקים דחויים" },
  { id: "debts_other",  label: "פיגורי תשלומים וחובות אחרים" },
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
  const [intakeEmpTypes, setIntakeEmpTypes] = useState<{s1:string|null,s2:string|null}>({s1:null,s2:null});

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

  useEffect(() => {
    supabase.from("client_intake").select("data").eq("client_id", client.id).maybeSingle()
      .then(({ data: row }) => {
        if (row?.data) {
          setIntakeEmpTypes({
            s1: row.data.spouse1_employment_type || null,
            s2: row.data.spouse2_employment_type || null,
          });
        }
      });
  }, [client.id]);

  const _needsPL = (t: string|null) => t === "עצמאי" || t === "גם וגם";
  const plBlocked =
    intakeEmpTypes.s1 !== null &&
    !_needsPL(intakeEmpTypes.s1) &&
    (client.questionnaire_spouses !== 2 ||
      (intakeEmpTypes.s2 !== null && !_needsPL(intakeEmpTypes.s2)));

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
    { id: "questionnaire", label: "שאלון אישי" },
  ];

  // progress
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
    setCustomDocs(p => [...p, { id, label } as any]);
    setSelected(p => [...(p||[]), id]);
    setNewCustom("");
    setShowCustomInput(false);
    setSaved(false);
  };

  return (
    <div>
      {/* Spouse count modal */}
      {showSpouseModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", zIndex:"var(--z-back)", display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:16, padding:32, maxWidth:360, width:"90%", textAlign:"center" }}>
            <div style={{ fontWeight:700, fontSize: 19, marginBottom:8 }}>שאלון אישי</div>
            <div style={{ fontSize: 16, color:"var(--text-dim)", marginBottom:24 }}>כמה בני זוג ממלאים שאלון?</div>
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={() => selectSpouses(1)} style={{ padding:"14px 28px", borderRadius:12, border:"2px solid var(--green-mid)", background:"transparent", color:"var(--green-mid)", fontWeight:700, fontSize: 17, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:8 }}>
                <IcoUser size={18} /> בן/בת זוג אחד/ת
              </button>
              <button onClick={() => selectSpouses(2)} style={{ padding:"14px 28px", borderRadius:12, border:"2px solid var(--green-mid)", background:"var(--green-mid)", color:"white", fontWeight:700, fontSize: 17, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:8 }}>
                <IcoUsers size={18} /> שני בני זוג
              </button>
            </div>
            <button onClick={() => setShowSpouseModal(false)} style={{ marginTop:16, fontSize: 15, color:"var(--text-dim)", background:"none", border:"none", cursor:"pointer" }}>ביטול</button>
          </div>
        </div>
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div>
          <div style={{ fontWeight:700, fontSize: 17 }}>מסמכים נדרשים — {client.name}</div>
          <div style={{ fontSize: 14, color:"var(--text-dim)", marginTop:4 }}>
            {isNull ? "לא הוגדר — הלקוח לא רואה כלום" : cur.length === 0 ? "לא נבחרו — הלקוח לא רואה אף סעיף" : `נבחרו ${cur.length} סעיפים`}
            {spouses && <span style={{ marginRight:8, color:"var(--green-mid)" }}>· שאלון: {spouses === 1 ? "בן/בת זוג אחד/ת" : "שני בני זוג"}</span>}
          </div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {saved && <span style={{ fontSize: 15, color:"var(--green-soft)", display:"flex", alignItems:"center", gap:4 }}><IcoCheck size={14} /> נשמר</span>}
          {saveError && <span style={{ fontSize: 15, color:"var(--red)", display:"flex", alignItems:"center", gap:4 }}><IcoWarn size={13} /> {saveError}</span>}
          <Btn variant="secondary" size="sm" onClick={selectAll}>בחר הכל</Btn>
          <Btn variant="secondary" size="sm" onClick={clearAll}>נקה הכל</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? "שומר..." : "שמור"}</Btn>
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
          {partialCount > 0 && <div style={{ fontSize: 13, color:"var(--gold)", marginTop:4 }}>{partialCount} מסמכים בתהליך</div>}
        </div>
      )}

      <Card>
        {allOptions.map((opt, i) => {
          const cat = DOC_ID_MAP[opt.id] || opt.id;
          const isDone = docProgress.done.includes(cat);
          const isPartial = docProgress.partial.includes(cat);
          const isPlBlocked = opt.id === "pl" && plBlocked;
          return (
            <div key={opt.id} style={isPlBlocked ? { opacity: 0.45, pointerEvents: "none" } : {}}>
              <div onClick={() => !isPlBlocked && toggle(opt.id)} style={{
                display:"flex", alignItems:"center", gap:14, padding:"14px 16px",
                borderBottom: "none",
                cursor: isPlBlocked ? "not-allowed" : "pointer",
                background: cur.includes(opt.id) ? "rgba(46,204,138,0.04)" : "transparent",
              }}>
                <div style={{
                  width:22, height:22, borderRadius:6, border:`2px solid ${cur.includes(opt.id) ? "var(--green-mid)" : "var(--border)"}`,
                  background: cur.includes(opt.id) ? "var(--green-mid)" : "transparent",
                  display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
                }}>
                  {cur.includes(opt.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
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
                    {isDone ? "הוגש" : isPartial ? "חלקי" : "טרם הוגש"}
                  </span>
                )}
              </div>
              {/* Note field + optional data entry — shown when selected */}
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
              {isPlBlocked && (
                <div style={{ padding:"0 16px 10px 16px", marginRight:50, fontSize:13, color:"var(--text-dim)" }}>
                  לא רלוונטי — כל בני הזוג שכירים
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
        הלקוח יראה <strong>רק</strong> את הסעיפים שסומנו. פירוט תנועות, תלושי שכר וחשבון חשמל תמיד מוצגים אוטומטית.
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
    title: "רקע ומניע",
    fields: [
      { key: "why_came", label: "למה הגיעו אליך?", type: "textarea", placeholder: "מה הניע אותם לפנות דווקא עכשיו?" },
      { key: "why_situation", label: "למה לדעתם הגיעו למצב הנוכחי?", type: "textarea", placeholder: "חוסר ידע, הרגלים, אירוע מסוים..." },
      { key: "emotional_state", label: "מצב רגשי ורמת מוטיבציה", type: "textarea", placeholder: "מתוחים / נינוחים, נחושים / מהססים..." },
    ],
  },
  {
    id: "family",
    title: "פרטי המשפחה",
    fields: [
      { key: "_spouse1_header", label: "", type: "header", text: "בן/בת זוג ראשון" },
      { key: "spouse1_first_name",  label: "שם פרטי",                          type: "text" },
      { key: "spouse1_last_name",   label: "שם משפחה",                         type: "text" },
      { key: "spouse1_age",         label: "גיל",                               type: "text" },
      { key: "spouse1_job",              label: "עיסוק",                             type: "text" },
      { key: "spouse1_employment_type", label: "סוג עיסוק",                         type: "select", options: ["שכיר", "עצמאי", "גם וגם"] },
      { key: "spouse1_salary",          label: "שכר חודשי ברוטו (₪)",              type: "number" },
      { key: "spouse1_salary_net",  label: "שכר חודשי נטו (₪)",               type: "number" },
      { key: "spouse1_notes",       label: "הערות (תואר, תנאים מיוחדים...)",  type: "textarea" },
      { key: "_spouse2_header", label: "", type: "header", text: "בן/בת זוג שני" },
      { key: "spouse2_name",        label: "שם",                                type: "text" },
      { key: "spouse2_age",         label: "גיל",                               type: "text" },
      { key: "spouse2_job",              label: "עיסוק",                             type: "text" },
      { key: "spouse2_employment_type", label: "סוג עיסוק",                         type: "select", options: ["שכיר", "עצמאי", "גם וגם"] },
      { key: "spouse2_salary",          label: "שכר חודשי ברוטו (₪)",              type: "number" },
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
    title: "מגורים ונכסים",
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
    title: "חובות ואשראי",
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
    title: "הלוואות",
    fields: [
      { key: "_loans_table", label: "", type: "loans_table" },
    ],
  },
  {
    id: "goals",
    title: "יעדים ותכנונים",
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
    title: "ביטוחים ופנסיה",
    fields: [
      { key: "last_pension_agent", label: "מתי היו לאחרונה אצל סוכן פנסיוני?", type: "text" },
      { key: "insurance_notes", label: "ביטוחים קיימים והערות", type: "textarea" },
    ],
  },
  {
    id: "coach_notes",
    title: "הערות המאמן",
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
              <td><button onClick={()=>removeRow(i)} style={{ background:"none", border:"none", color:"var(--red)", cursor:"pointer", fontSize: 18, padding:"0 4px" }}>×</button></td>
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

function IntakeSelectField({ value, options, onChange }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const triggerStyle: React.CSSProperties = {
    width: "100%", padding: "9px 12px", borderRadius: 8,
    border: "1px solid var(--border)", background: "var(--surface2)",
    color: "var(--text)", fontSize: 14, fontFamily: "inherit",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    cursor: "pointer", userSelect: "none",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(o => !o)} style={triggerStyle}>
        <span style={{ color: value ? "var(--text)" : "var(--text-dim)" }}>
          {value || "בחר..."}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-dim)", marginRight: 4 }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, left: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", zIndex: "var(--z-drop)", overflow: "hidden" }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, background: opt === value ? "rgba(46,204,138,0.1)" : "transparent", color: opt === value ? "var(--green-mid)" : "var(--text)", fontWeight: opt === value ? 600 : 400, transition: "background 0.1s" }}
              onMouseEnter={e => { if (opt !== value) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
              onMouseLeave={e => { if (opt !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
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
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleSectionToggle = (sectionId: string) => {
    // If switching to a different section while one is already open,
    // the old section's content will collapse and push the new header up.
    // Compensate instantly before the animation starts.
    if (sectionId !== openSection && openSection) {
      const oldEl = sectionRefs.current[openSection];
      const newEl = sectionRefs.current[sectionId];
      if (oldEl && newEl) {
        const oldRect = oldEl.getBoundingClientRect();
        const newRect = newEl.getBoundingClientRect();
        if (oldRect.top < newRect.top) {
          const collapsingHeight = (oldEl.children[1] as HTMLElement)?.getBoundingClientRect().height ?? 0;
          const predictedTop = newRect.top - collapsingHeight;
          if (predictedTop < 0) {
            window.scrollBy({ top: predictedTop, behavior: 'instant' as ScrollBehavior });
          }
        }
      }
    }
    setOpenSection(openSection === sectionId ? null : sectionId);
  };

  useEffect(() => {
    supabase.from("client_intake").select("data").eq("client_id", client.id).maybeSingle()
      .then(({ data: row }) => {
        if (row?.data) setData(row.data);
        else setData({
          meeting_date: new Date(client.created_at || Date.now()).toISOString().slice(0,10),
          spouse1_first_name: client.name || "",
          spouse1_last_name: client.last_name || "",
        });
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

    // Sync personalized income categories for spouses
    await syncIncomeCategories(client.id, newData.spouse1_name, newData.spouse2_name);
  };

  const syncIncomeCategories = async (clientId: number, name1?: string, name2?: string) => {
    const spouses = [
      { marker: "__spouse1__", name: name1?.trim() },
      { marker: "__spouse2__", name: name2?.trim() },
    ];

    for (const { marker, name } of spouses) {
      // Find existing client-specific income category with this marker
      const { data: existing } = await supabase
        .from("categories")
        .select("id, name")
        .eq("client_id", clientId)
        .eq("budget_type", "הכנסה")
        .contains("keywords", [marker])
        .maybeSingle();

      if (!name) {
        // Name cleared — delete the category if it exists
        if (existing) {
          await supabase.from("categories").delete().eq("id", existing.id);
        }
        continue;
      }

      const catName = `הכנסה ${name}`;

      if (existing) {
        // Update name if changed
        if (existing.name !== catName) {
          await supabase.from("categories").update({ name: catName }).eq("id", existing.id);
        }
      } else {
        // Create new personalized income category
        await supabase.from("categories").insert({
          client_id: clientId,
          name: catName,
          section: "הכנסות",
          budget_type: "הכנסה",
          keywords: [marker],
          max_hints: [],
          is_active: true,
          is_ignored: false,
          sort_order: 0,
        });
      }
    }
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
        <div style={{ fontWeight: 700, fontSize: 18 }}>טופס פגישה ראשונה — {client.name}</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saving && <span style={{ fontSize: 14, color: "var(--text-dim)" }}>שומר...</span>}
          {saved && !saving && <span style={{ fontSize: 14, color: "var(--green-soft)", display:"flex", alignItems:"center", gap:4 }}><IcoCheck size={13} /> נשמר</span>}
          <Btn onClick={save} disabled={saving}>שמור</Btn>
        </div>
      </div>

      {/* תאריך פגישה */}
      <div style={{ marginBottom: 16, display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize: 15, color:"var(--text-dim)", fontWeight:600 }}>תאריך פגישה:</span>
        <input type="date" value={data.meeting_date||""} onChange={e=>update("meeting_date",e.target.value)}
          style={{ ...fieldStyle, width:"auto", padding:"6px 10px" }} />
      </div>

      {/* Summary bar */}
      {(totalIncome > 0 || overdraft > 0 || totalDebt > 0 || monthlyDeficit > 0) && (
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:16, background:"var(--surface2)", borderRadius:10, padding:"12px 16px" }}>
          {totalIncome > 0 && <div style={{ fontSize: 15 }}>הכנסה נטו: <strong style={{color:"var(--green-mid)"}}>{totalIncome.toLocaleString("he-IL")} ₪</strong></div>}
          {overdraft > 0 && <div style={{ fontSize: 15 }}>אוברדראפט: <strong style={{color:"var(--red)"}}>{overdraft.toLocaleString("he-IL")} ₪</strong></div>}
          {totalDebt > 0 && <div style={{ fontSize: 15 }}>חוב כולל: <strong style={{color:"var(--red)"}}>{totalDebt.toLocaleString("he-IL")} ₪</strong></div>}
          {monthlyDeficit > 0 && <div style={{ fontSize: 15 }}>גרעון חודשי: <strong style={{color:"var(--gold)"}}>{monthlyDeficit.toLocaleString("he-IL")} ₪</strong></div>}
        </div>
      )}

      <div style={{ overflowAnchor: "none" } as any}>
      {INTAKE_SECTIONS.map(section => {
        const filled = filledCount(section);
        const total = realFieldCount(section);
        const isOpen = openSection === section.id;
        return (
          <div key={section.id} ref={el => { sectionRefs.current[section.id] = el; }} style={{ marginBottom: 8 }}>
            <div onClick={() => handleSectionToggle(section.id)} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "13px 18px",
              background: filled > 0 ? "rgba(46,204,138,0.06)" : "var(--surface2)",
              borderRadius: isOpen ? "10px 10px 0 0" : 10,
              border: `1px solid ${filled > 0 ? "rgba(46,204,138,0.25)" : "var(--border)"}`,
              cursor: "pointer", userSelect: "none",
              transition: "border-radius 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
            }}>
              <span style={{ fontSize: 19 }}>{section.title.split(" ")[0]}</span>
              <div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{section.title.slice(section.title.indexOf(" ") + 1)}</div>
              {filled > 0 && <span style={{ fontSize: 13, color: "var(--green-mid)", background: "rgba(46,204,138,0.12)", borderRadius: 20, padding: "2px 10px" }}>{filled}/{total}</span>}
              <span style={{ color: "var(--text-dim)", fontSize: 15, transition: "transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)", display: "inline-block", transform: isOpen ? "rotate(0deg)" : "rotate(0deg)" }}>{isOpen ? "▲" : "▼"}</span>
            </div>
            <div style={{
              display: "grid",
              gridTemplateRows: isOpen ? "1fr" : "0fr",
              transition: "grid-template-rows 0.28s cubic-bezier(0.16, 1, 0.3, 1)",
              overflow: "hidden",
              borderRadius: "0 0 10px 10px",
            }}>
              <div style={{ minHeight: 0 }}>
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
                    if (field.type === "select") return (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 5, fontWeight: 500 }}>{field.label}</div>
                        <IntakeSelectField
                          value={data[field.key] || ""}
                          options={(field as any).options}
                          onChange={val => update(field.key, val)}
                        />
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
              </div>
            </div>
          </div>
        );
      })}
      </div>

    </div>
  );
}
