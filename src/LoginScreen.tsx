import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { supabase } from "./supabase";
import type { Session } from "./types";

interface LoginScreenProps {
  onLogin: (session: Session) => void;
  onLoginStart?: () => void;
  onLoginFail?: () => void;
}

/* ── Icons ──────────────────────────────────────────────────────────── */
const EyeOpen = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EyeClosed = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);

const BtnSpinner = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.75s linear infinite", flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
    <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

const LockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const SlidersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  </svg>
);

const TrendingUpSmallIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 17 7 11 11 14 16 8"/>
    <polyline points="16 8 19 5" strokeDasharray="2 2"/>
    <line x1="2" y1="20" x2="22" y2="20" strokeWidth="1" strokeOpacity="0.35"/>
  </svg>
);

const ActivityIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="13" y2="17"/>
  </svg>
);

const ZapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="14" width="4" height="7" rx="1"/>
    <rect x="10" y="9" width="4" height="12" rx="1"/>
    <rect x="17" y="4" width="4" height="17" rx="1"/>
  </svg>
);

const CreditCardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="7" rx="8" ry="2.5"/>
    <path d="M4 7v4c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5V7"/>
    <path d="M4 11v4c0 1.38 3.58 2.5 8 2.5s8-1.12 8-2.5v-4"/>
  </svg>
);

const SparkleIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2 C12 2 12.6 8.4 14.5 10 C16 11.2 22 12 22 12 C22 12 16 12.8 14.5 14 C12.6 15.6 12 22 12 22 C12 22 11.4 15.6 9.5 14 C8 12.8 2 12 2 12 C2 12 8 11.2 9.5 10 C11.4 8.4 12 2 12 2 Z"
      fill="rgba(212,168,85,0.92)"
      style={{ filter: "drop-shadow(0 0 4px rgba(212,168,85,0.7))" }}
    />
  </svg>
);

const GitBranchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.88)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2"/>
    <path d="M12 6l-5 13"/>
    <path d="M12 6l5 13"/>
    <circle cx="7" cy="21" r="2"/>
    <circle cx="17" cy="21" r="2"/>
  </svg>
);

/* ── Animation guard ─────────────────────────────────────────────────
   React.StrictMode בפיתוח מרים → מפרק → מרים מחדש כל קומפוננטה.
   הפירוק + הרמה מחדש גורמים לכל אנימציות ה-CSS להתחיל מחדש —
   כאילו הדף "התרענן". הדגל הזה מסמן שהאנימציות כבר שוחקו פעם אחת.
   הדגל נשאר true לכל אורך חיי העמוד (לא מתאפס בפירוק) כך שה-mount
   השני של StrictMode לא ישחק את האנימציות שוב.
   מתאפס בטעינה מלאה של הדף (reload) — שאז ראוי שהאנימציות ישוחקו. */
let _loginAnimated = false;

/* ── Component ──────────────────────────────────────────────────────── */
export default function LoginScreen({ onLogin, onLoginStart, onLoginFail }: LoginScreenProps) {
  const [username, setUsername]         = useState("");
  const [password, setPassword]         = useState("");
  const [error, setError]               = useState("");
  const [fieldErrors, setFieldErrors]   = useState<{ username?: string; password?: string }>({});
  const [loading, setLoading]           = useState(false);
  const [focused, setFocused]           = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const usernameRef  = useRef<HTMLInputElement>(null);
  const passwordRef  = useRef<HTMLInputElement>(null);
  const loginPageRef = useRef<HTMLDivElement>(null);

  // useLayoutEffect רץ סינכרונית לפני ה-paint.
  // StrictMode שומר את ה-state אבל מסיר ומחזיר את ה-DOM — כך שה-animation מתחיל מחדש.
  // פה אנחנו מוסיפים no-animate לפני שהדפדפן מצייר, כך שה-animation השני לא נראה.
  useLayoutEffect(() => {
    if (_loginAnimated) {
      loginPageRef.current?.classList.add('no-animate');
    } else {
      _loginAnimated = true;
    }
  }, []);

  useEffect(() => { usernameRef.current?.focus(); }, []);

  const handleLogin = async () => {
    const errs: { username?: string; password?: string } = {};
    if (!username) errs.username = "נדרש שם משתמש";
    if (!password) errs.password = "נדרשת סיסמה";
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setLoading(true); setError(""); setFieldErrors({});
    onLoginStart?.(); // מעלה דגל — מונע פלאש של LoginScreen בזמן מעבר הסשן הפנימי

    function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
      return Promise.race([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`timeout:${label}`)), 10000)
        ),
      ]);
    }

    let authSessionOk = false; // הצלחה ב-signInWithPassword — כבר מחוברים, לא לקרוא signOut בcatch
    try {
      const email = `${username}@mazan.local`;

      const { data: authData, error: authErr } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }), "signIn"
      );

      if (!authErr && authData.session) {
        authSessionOk = true; // auth הצליח — אל תנסה signOut בcatch
        const meta = authData.user?.app_metadata ?? {};
        if (meta.is_admin) {
          onLogin({ role: "admin", username: "admin" });
        } else {
          const { data: client } = await supabase
            .from("clients")
            .select("id, username, name, is_blocked, must_reset_password")
            .eq("auth_id", authData.user.id)
            .maybeSingle();
          if (!client) throw new Error("שם משתמש או סיסמה שגויים");
          if ((client as any).is_blocked) throw new Error("שם משתמש או סיסמה שגויים");
          onLogin({
            role: "client",
            username: (client as any).username,
            name: (client as any).name,
            id: String((client as any).id),
            must_reset_password: (client as any).must_reset_password ?? false,
          });
        }
        return;
      }

      const { data: migrateData, error: migrateErr } = await withTimeout(
        supabase.functions.invoke("manage-auth", {
          body: { action: "migrate_login", username, password },
        }), "edgeFunction"
      );

      if (migrateErr || !migrateData?.ok) throw new Error("שם משתמש או סיסמה שגויים");

      const { data: authData2, error: authErr2 } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }), "signIn2"
      );
      if (authErr2 || !authData2.session) throw new Error("שם משתמש או סיסמה שגויים");
      authSessionOk = true; // auth migration הצליח

      if (migrateData.role === "admin") {
        onLogin({ role: "admin", username: "admin" });
      } else {
        onLogin({ role: "client", username: migrateData.username, name: migrateData.name, id: String(migrateData.id) });
      }
    } catch {
      // אם auth לא הצליח בכלל — מוריד דגל ומנקה session
      // אם auth הצליח אבל שאילתת הלקוח כישלה — לא נוגע ב-loginInProgress (הוא עדיין true)
      // כי SIGNED_IN עדיין יגיע ו-buildSession יבנה את הסשן
      if (!authSessionOk) {
        onLoginFail?.();
        supabase.auth.signOut({ scope: "local" }).catch(() => {});
      }
      setError("שם משתמש או סיסמה שגויים");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeRight {
          from { opacity: 0; transform: translateX(18px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes floatRobot {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
@keyframes ba-spin { to { --ba: 360deg; } }
        @property --ba { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

        /* ── Page ──────────────────────────────────────────────── */
        .login-page {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          display: flex;
          flex-direction: row;
          direction: rtl;
          position: relative;
          background:
            radial-gradient(ellipse 55% 55% at 70% 50%, rgba(45,106,79,0.25) 0%, transparent 70%),
            linear-gradient(135deg, #0d2218 0%, #122e1e 40%, #1a4230 70%, #1e4d35 100%);
          background-color: #0a1f14;
          font-family: 'Rubik', sans-serif;
        }

        .login-page::after {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0.035;
          pointer-events: none;
          z-index: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          background-repeat: repeat;
        }

        /* ── Right col: brand + features ──────────────────────── */
        .lp-right-col {
          flex: 1;
          height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 20px;
          padding: 44px 52px 110px 40px;
          position: relative;
          z-index: 1;
          direction: rtl;
          overflow: visible;
        }

        .lp-top-brand {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .lp-h1 {
          font-family: 'Rubik', sans-serif;
          font-weight: 900;
          font-size: clamp(4rem, 6vw, 5.5rem);
          letter-spacing: 0.02em;
          line-height: 1;
          margin: 0 0 10px 0;
          color: white;
          animation: fadeRight 0.55s ease 0.15s both;
          text-shadow: 0 0 40px rgba(82,183,136,0.25);
        }

        .lp-tagline {
          font-family: 'Rubik', sans-serif;
          font-weight: 400;
          font-size: 1.2rem;
          color: rgba(255,255,255,0.88);
          margin: 0;
          letter-spacing: 0.01em;
          animation: fadeRight 0.5s ease 0.25s both;
        }

        /* Grid 2×3 horizontal cards */
        .lp-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin: 0;
          margin-top: 32px;
        }

        .lp-feat-card {
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-end;
          gap: 14px;
          transition: box-shadow 0.35s ease;
          animation: fadeRight 0.5s ease both, ba-spin 7s linear infinite;
          background-image:
            linear-gradient(rgba(30,60,38,0.55), rgba(30,60,38,0.55)),
            conic-gradient(
              from var(--ba),
              rgba(82,183,136,0.04) 0deg,
              rgba(82,183,136,0.55) 55deg,
              rgba(163,247,212,0.75) 90deg,
              rgba(82,183,136,0.55) 125deg,
              rgba(82,183,136,0.04) 180deg,
              rgba(82,183,136,0.04) 360deg
            );
          background-origin: border-box;
          background-clip: padding-box, border-box;
        }

        .lp-feat-card:hover {
          box-shadow:
            0 0 26px rgba(82,183,136,0.22),
            0 0 8px  rgba(82,183,136,0.10),
            inset 0 0 18px rgba(82,183,136,0.06);
          background-image:
            linear-gradient(rgba(35,70,44,0.58), rgba(35,70,44,0.58)),
            conic-gradient(
              from var(--ba),
              rgba(82,183,136,0.06) 0deg,
              rgba(82,183,136,0.80) 55deg,
              rgba(163,247,212,0.95) 90deg,
              rgba(82,183,136,0.80) 125deg,
              rgba(82,183,136,0.06) 180deg,
              rgba(82,183,136,0.06) 360deg
            );
        }

        .lp-feat-card:nth-child(1) { animation-delay: 0.30s,    0s; }
        .lp-feat-card:nth-child(2) { animation-delay: 0.38s, -1.2s; }
        .lp-feat-card:nth-child(3) { animation-delay: 0.46s, -2.4s; }
        .lp-feat-card:nth-child(4) { animation-delay: 0.54s, -3.5s; }
        .lp-feat-card:nth-child(5) { animation-delay: 0.62s, -4.7s; }
        .lp-feat-card:nth-child(6) { animation-delay: 0.70s, -5.9s; }

        .lp-feat-icon {
          width: 42px;
          height: 42px;
          border-radius: 11px;
          background: linear-gradient(145deg, rgba(82,183,136,0.35) 0%, rgba(30,77,53,0.50) 100%);
          border: 1px solid rgba(82,183,136,0.55);
          box-shadow: 0 2px 10px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .lp-feat-text {
          font-family: 'Rubik', sans-serif;
          font-weight: 600;
          font-size: 1.2rem;
          color: rgba(255,255,255,0.92);
          line-height: 1.4;
          text-align: right;
          flex: 1;
        }

        .lp-bottom-brand {
          display: flex;
          flex-direction: row;
          align-items: flex-end;
          justify-content: flex-start;
          gap: 0;
          width: 100%;
          direction: ltr;
          margin-top: 50px;
          padding-left: 130px;
        }

        /* badge + copyright wrapper */
        .lp-badge-copy-wrap {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          width: calc(50% - 5px);
          flex-shrink: 0;
          order: 1;
        }

        /* AI Badge */
        .lp-ai-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 16px 18px;
          min-height: 72px;
          width: 100%;
          box-sizing: border-box;
          cursor: default;
          animation: fadeRight 0.5s ease 0.3s both, ba-spin 9s linear infinite;
          animation-delay: 0.3s, -3.5s;
          box-shadow: 0 0 22px rgba(183,146,76,0.14);
          background-image:
            linear-gradient(rgba(12,18,10,0.55), rgba(12,18,10,0.55)),
            conic-gradient(
              from var(--ba),
              rgba(183,146,76,0.04) 0deg,
              rgba(183,146,76,0.50) 55deg,
              rgba(212,168,85,0.78)  90deg,
              rgba(183,146,76,0.50) 125deg,
              rgba(183,146,76,0.04) 180deg,
              rgba(183,146,76,0.04) 360deg
            );
          background-origin: border-box;
          background-clip: padding-box, border-box;
        }

        .lp-ai-badge-label {
          font-size: 1.3rem;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
          font-family: 'Rubik', sans-serif;
          flex: 1;
          text-align: right;
        }

        .lp-copyright {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.35);
          font-family: 'Rubik', sans-serif;
          text-align: center;
          width: 100%;
        }

        .lp-copyright-wrap {
          position: absolute;
          bottom: 20px;
          left: 0;
          right: 0;
          text-align: center;
          z-index: 2;
        }

        /* ── Left col: card + robot ────────────────────────────── */
        .lp-left-col {
          width: 40%;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          z-index: 1;
          flex-shrink: 0;
        }

        .lp-robot {
          width: 130px;
          filter: drop-shadow(0 12px 32px rgba(0,0,0,0.5));
          animation: floatRobot 4s ease-in-out infinite;
          pointer-events: none;
          flex-shrink: 0;
          margin-bottom: -8px;
          align-self: flex-end;
          margin-top: -30px;
          order: 1;
        }

        .lp-card-wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .lp-card-wrapper::before {
          content: '';
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 460px; height: 460px;
          background: radial-gradient(circle, rgba(82,183,136,0.13) 0%, transparent 65%);
          pointer-events: none;
          z-index: 0;
        }

        .login-card {
          width: 370px;
          position: relative;
          z-index: 1;
          background: #ffffff;
          border-radius: 20px;
          padding: 40px 36px 32px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.07),
            0 32px 80px rgba(0,0,0,0.45),
            0 8px 24px rgba(0,0,0,0.25);
          animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
        }

        .login-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(82,183,136,0.6) 30%,
            rgba(82,183,136,0.9) 50%,
            rgba(82,183,136,0.6) 70%,
            transparent 100%
          );
        }

        /* ── Card internals ─────────────────────────────────────── */
        .lp-card-h2 {
          font-family: 'Rubik', sans-serif;
          font-weight: 700;
          font-size: 1.55rem;
          color: var(--text);
          letter-spacing: -0.025em;
          margin: 0 0 4px 0;
          text-align: right;
        }

        .lp-card-sub {
          font-family: 'Rubik', sans-serif;
          font-weight: 400;
          font-size: 0.875rem;
          color: var(--text-dim);
          margin: 0 0 30px 0;
          text-align: right;
        }

        .lp-fields {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-bottom: 22px;
        }

        .lp-label {
          display: block;
          font-size: 0.78rem;
          font-weight: 600;
          color: var(--text-mid);
          margin-bottom: 7px;
          text-align: right;
          letter-spacing: 0.02em;
          font-family: 'Rubik', sans-serif;
        }

        .login-input {
          background: var(--surface);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 0.95rem;
          font-family: 'Rubik', sans-serif;
          color: var(--text);
          width: 100%;
          box-sizing: border-box;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
          outline: none;
          direction: rtl;
        }

.login-input:hover { border-color: var(--green-soft); }

        .login-input:focus {
          border-color: var(--green-mid);
          box-shadow: 0 0 0 3px rgba(45,106,79,0.11);
        }

        .lp-pw-wrap { position: relative; }

        .lp-eye-btn {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-dim);
          display: flex;
          align-items: center;
          padding: 4px;
          outline: none;
          transition: color 0.18s;
        }

        .lp-eye-btn:hover { color: var(--green-mid); }

        .login-btn {
          background: linear-gradient(160deg, #2d7a5c 0%, var(--green-deep) 100%);
          border: none;
          border-radius: 10px;
          padding: 13px;
          width: 100%;
          font-size: 0.95rem;
          font-weight: 600;
          font-family: 'Rubik', sans-serif;
          letter-spacing: 0.03em;
          color: white;
          cursor: pointer;
          margin-bottom: 16px;
          box-shadow: 0 4px 24px rgba(18,46,30,0.5), inset 0 1px 0 rgba(255,255,255,0.08);
          transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .login-btn:hover:not([disabled]) {
          transform: translateY(-1.5px);
          box-shadow: 0 8px 32px rgba(18,46,30,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .login-btn:active:not([disabled]) {
          transform: translateY(0.5px);
          box-shadow: 0 2px 12px rgba(18,46,30,0.4), inset 0 1px 0 rgba(255,255,255,0.08);
        }

        .lp-field-error {
          font-size: 0.8rem;
          color: var(--red);
          margin-top: 5px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-family: 'Rubik', sans-serif;
        }

        .lp-error-banner {
          background: var(--red-light);
          border: 1px solid rgba(192,57,43,0.18);
          border-radius: 9px;
          padding: 10px 14px;
          font-size: 0.875rem;
          color: var(--red);
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 7px;
          font-family: 'Rubik', sans-serif;
        }

        .lp-security {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          font-size: 0.77rem;
          color: var(--text-dim);
          font-family: 'Rubik', sans-serif;
        }

        /* ── Responsive ─────────────────────────────────────────── */
        @media (max-width: 1100px) {
          .lp-right-col { display: none; }
          .lp-left-col {
            width: 100%;
            align-items: center;
            justify-content: center;
          }
          .login-card { width: 370px; }
        }

        @media (max-width: 768px) {
          .login-page {
            flex-direction: column;
            height: auto;
            min-height: 100vh;
            overflow: auto;
            align-items: center;
            padding: 32px 20px;
          }
          .lp-left-col {
            width: 100%;
            height: auto;
            padding: 0;
            order: 1;
          }
          .login-card { width: 100%; max-width: 370px; padding: 32px 24px; }
          .lp-robot { display: none; }
          .lp-right-col {
            width: 100%;
            height: auto;
            padding: 28px 0 0 0;
            align-items: center;
            order: 2;
          }
          .lp-top-brand { align-items: center; }
          .lp-h1 { font-size: 3rem; }
          .lp-grid { display: none; }
          .lp-bottom-brand { align-items: center; }
        }

        /* mount חוזר (StrictMode / HMR) — חוסם רק אנימציות כניסה, משאיר אינסופיות */
        .no-animate .lp-h1,
        .no-animate .lp-tagline,
        .no-animate .login-card { animation: none !important; opacity: 1 !important; transform: none !important; }

        /* כרטיסי feature: מסיר fadeRight, שומר ba-spin */
        .no-animate .lp-feat-card { animation: ba-spin 7s linear infinite !important; opacity: 1 !important; transform: none !important; }
        .no-animate .lp-feat-card:nth-child(1) { animation-delay:    0s !important; }
        .no-animate .lp-feat-card:nth-child(2) { animation-delay: -1.2s !important; }
        .no-animate .lp-feat-card:nth-child(3) { animation-delay: -2.4s !important; }
        .no-animate .lp-feat-card:nth-child(4) { animation-delay: -3.5s !important; }
        .no-animate .lp-feat-card:nth-child(5) { animation-delay: -4.7s !important; }
        .no-animate .lp-feat-card:nth-child(6) { animation-delay: -5.9s !important; }

        /* AI badge: מסיר fadeRight, שומר ba-spin */
        .no-animate .lp-ai-badge { animation: ba-spin 9s linear infinite !important; animation-delay: -3.5s !important; opacity: 1 !important; transform: none !important; }

        /* robot: floatRobot נשאר — לא מגעים */
      `}</style>

      <div className="login-page" ref={loginPageRef}>

        {/* Blobs */}
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
          <div style={{
            position: "absolute", top: -200, left: -150,
            width: 700, height: 700, borderRadius: "50%",
            background: "rgba(82,183,136,0.07)", filter: "blur(120px)",
          }} />
          <div style={{
            position: "absolute", bottom: -100, right: 0,
            width: 400, height: 400, borderRadius: "50%",
            background: "rgba(30,77,53,0.5)", filter: "blur(100px)",
          }} />
        </div>

        {/* ── Right col: brand + features (RTL = visually RIGHT) ── */}
        <div className="lp-right-col">

          <div className="lp-top-brand">
            <h1 className="lp-h1">מאזן</h1>
            <p className="lp-tagline">הניהול הפיננסי שמבין אותך</p>
          </div>

          <div className="lp-grid">
            <div className="lp-feat-card">
              <span className="lp-feat-text">שליטה מלאה על התקציב החודשי</span>
              <div className="lp-feat-icon"><SlidersIcon /></div>
            </div>
            <div className="lp-feat-card">
              <span className="lp-feat-text">ניתוח אוטומטי של כל העסקאות</span>
              <div className="lp-feat-icon"><ActivityIcon /></div>
            </div>
            <div className="lp-feat-card">
              <span className="lp-feat-text">ניהול חובות והלוואות</span>
              <div className="lp-feat-icon"><CreditCardIcon /></div>
            </div>
            <div className="lp-feat-card">
              <span className="lp-feat-text">תחזיות חכמות לחודשים הבאים</span>
              <div className="lp-feat-icon"><TrendingUpSmallIcon /></div>
            </div>
            <div className="lp-feat-card">
              <span className="lp-feat-text">תכנון תרחישים עתידיים</span>
              <div className="lp-feat-icon"><GitBranchIcon /></div>
            </div>
            <div className="lp-feat-card">
              <span className="lp-feat-text">כלים חכמים לצמיחה פיננסית</span>
              <div className="lp-feat-icon"><ZapIcon /></div>
            </div>
          </div>

          <div className="lp-bottom-brand">
            <img src="/robot.png" alt="" className="lp-robot" aria-hidden="true" />
            <div className="lp-badge-copy-wrap">
              <div className="lp-ai-badge">
                <SparkleIcon />
                <span className="lp-ai-badge-label">תובנות חכמות מבוססות בינה מלאכותית</span>
              </div>
            </div>
          </div>

        </div>

        {/* ── Left col: card + robot (RTL = visually LEFT) ─────── */}
        <div className="lp-left-col">
          <div className="lp-card-wrapper">
            <div className="login-card">

              <h2 className="lp-card-h2">כניסה לחשבון</h2>
              <p className="lp-card-sub">הכנס את הפרטים שלך להמשך</p>

              <div className="lp-fields">

                <div>
                  <label className="lp-label">שם משתמש</label>
                  <input
                    ref={usernameRef}
                    className="login-input"
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      if (fieldErrors.username) setFieldErrors(p => ({ ...p, username: undefined }));
                    }}
                    placeholder="הזן שם משתמש"
                    onFocus={() => setFocused("username")}
                    onBlur={() => setFocused(null)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); passwordRef.current?.focus(); }
                    }}
                    style={fieldErrors.username ? { borderColor: "var(--red)" } : focused === "username" ? {} : {}}
                  />
                  {fieldErrors.username && (
                    <div className="lp-field-error"><span>⚠</span>{fieldErrors.username}</div>
                  )}
                </div>

                <div>
                  <label className="lp-label">סיסמה</label>
                  <div className="lp-pw-wrap">
                    <input
                      ref={passwordRef}
                      className="login-input"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value);
                        if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: undefined }));
                      }}
                      placeholder="הזן סיסמה"
                      onFocus={() => setFocused("password")}
                      onBlur={() => setFocused(null)}
                      onKeyDown={e => e.key === "Enter" && !loading && handleLogin()}
                      style={{
                        paddingLeft: 40,
                        ...(fieldErrors.password ? { borderColor: "var(--red)" } : {}),
                      }}
                    />
                    <button
                      type="button"
                      className="lp-eye-btn"
                      onClick={() => setShowPassword(p => !p)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOpen /> : <EyeClosed />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <div className="lp-field-error"><span>⚠</span>{fieldErrors.password}</div>
                  )}
                </div>
              </div>

              {error && (
                <div className="lp-error-banner">
                  <span>⚠</span> {error}
                </div>
              )}

              <button
                className="login-btn"
                onClick={handleLogin}
                disabled={loading}
                style={{ opacity: loading ? 0.82 : 1, cursor: loading ? "default" : "pointer" }}
              >
                {loading ? (
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <BtnSpinner /> מתחבר...
                  </span>
                ) : "כניסה →"}
              </button>

              <div className="lp-security">
                <LockIcon />
                חיבור מאובטח · הנתונים שלך פרטיים
              </div>

            </div>
          </div>
        </div>

        {/* copyright — מחוץ לשתי העמודות */}
        <div className="lp-copyright-wrap">
          <div className="lp-copyright">© 2025 מאזן · כל הזכויות שמורות</div>
        </div>

      </div>
    </>
  );
}
