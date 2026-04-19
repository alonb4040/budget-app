/**
 * BankTutorial — fullscreen GSAP experience
 * מסביר ללקוח את בעיית כפל הספירה בפירוט עו"ש
 *
 * 4 שלבים:
 *   0  intro     — hook + כותרת
 *   1  credits   — עסקאות אשראי + count-up
 *   2  problem   — שורת עו"ש + ₪12,400 shake
 *   3  solution  — לחיצה על להתעלם + confetti
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import confetti from "canvas-confetti";

// ─── prefers-reduced-motion ───────────────────────────────────────────────────
const prefersReduced = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const dur = (n: number) => prefersReduced ? 0 : n;

// ─── נתונים ───────────────────────────────────────────────────────────────────
const ITEMS = [
  { label: "שופרסל",   amount: 1200 },
  { label: "YES פלנט", amount:  800 },
  { label: "כלבו שוק", amount:  600 },
  { label: "אמזון",    amount:  900 },
  { label: "רמי לוי",  amount: 1700 },
];
const TOTAL = 6200;
const fmt = (n: number) => n.toLocaleString("he-IL");

// ─── Counter hook ─────────────────────────────────────────────────────────────
function useCounter(target: number, run: boolean, duration = 1.2) {
  const [val, setVal] = useState(0);
  const obj = useRef({ v: 0 });
  useEffect(() => {
    if (!run) { setVal(0); obj.current.v = 0; return; }
    obj.current.v = 0;
    const t = gsap.to(obj.current, {
      v: target, duration: dur(duration), ease: "power2.out",
      onUpdate: () => setVal(Math.round(obj.current.v)),
    });
    return () => { t.kill(); };
  }, [run, target, duration]);
  return val;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const BankIcon = () => (
  <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
    <rect width="72" height="72" rx="20" fill="#F0FDF4"/>
    <path d="M14 30h44M36 16L14 30v2h44v-2L36 16z" stroke="#2d6a4f" strokeWidth="2.5" strokeLinejoin="round"/>
    <rect x="20" y="34" width="5" height="16" rx="1" fill="#2d6a4f"/>
    <rect x="33.5" y="34" width="5" height="16" rx="1" fill="#2d6a4f"/>
    <rect x="47" y="34" width="5" height="16" rx="1" fill="#2d6a4f"/>
    <rect x="12" y="50" width="48" height="3" rx="1.5" fill="#2d6a4f"/>
  </svg>
);

const CardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="1" y="3.5" width="16" height="11" rx="2" stroke="#6366F1" strokeWidth="1.5"/>
    <rect x="1" y="7" width="16" height="2.5" fill="#6366F1"/>
    <rect x="3" y="11" width="4" height="1.5" rx="0.75" fill="#6366F1"/>
  </svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
    <path d="M11 2L21 20H1L11 2z" stroke="#F59E0B" strokeWidth="1.8" strokeLinejoin="round"/>
    <line x1="11" y1="9" x2="11" y2="14" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="11" cy="17" r="1" fill="#F59E0B"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="14" fill="#DCFCE7"/>
    <path d="M9 16.5l4.5 4.5 9.5-9.5" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const BigCheckIcon = () => (
  <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="46" fill="#DCFCE7" stroke="#16A34A" strokeWidth="3"/>
    <path d="M28 50l14 16 30-28" stroke="#16A34A" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

// ─── Big Amount — ₪ כ-superscript ──────────────────────────────────────────
const BigAmount = ({ value, color }: { value: number; color: string }) => (
  <div style={{ display: "flex", alignItems: "flex-start", lineHeight: 1, color }}>
    <span style={{ fontSize: "clamp(28px,5vw,42px)", fontWeight: 800, marginTop: "0.15em" }}>₪</span>
    <span style={{ fontSize: "clamp(56px,12vw,96px)", fontWeight: 800, letterSpacing: "-2px" }}>
      {value.toLocaleString("he-IL")}
    </span>
  </div>
);

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  overlay: {
    position: "fixed" as const, inset: 0, zIndex: 1200,
    background: "#f8fafb",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center",
    direction: "rtl" as const,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  topBar: {
    position: "absolute" as const, top: 0, right: 0, left: 0,
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "20px 28px",
  },
  dots: { display: "flex", gap: 8 },
  dot: (active: boolean) => ({
    width: 8, height: 8, borderRadius: "50%",
    background: active ? "#2d6a4f" : "#D1D5DB",
    transition: "background 0.3s",
  }),
  closeBtn: {
    background: "none", border: "none", cursor: "pointer",
    color: "#9CA3AF", lineHeight: 1,
    padding: "8px", borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  stage: {
    width: "min(96vw, 600px)",
    display: "flex", flexDirection: "column" as const,
    alignItems: "center",
    padding: "0 8px",
    animation: prefersReduced ? "none" : "tutPhaseIn 0.25s ease-out",
  },
  title: {
    fontSize: "clamp(22px,5vw,30px)", fontWeight: 700,
    color: "#111827", textAlign: "center" as const,
    margin: "0 0 10px",
    lineHeight: 1.3,
  },
  sub: {
    fontSize: 16, color: "#6B7280",
    textAlign: "center" as const, lineHeight: 1.6,
    margin: "0 0 32px",
  },
  primaryBtn: {
    display: "block", width: "100%", maxWidth: 340,
    padding: "16px 32px",
    background: "#2d6a4f", color: "#fff",
    border: "none", borderRadius: 14, cursor: "pointer",
    fontSize: 17, fontWeight: 700, letterSpacing: 0.2,
    boxShadow: "0 4px 20px rgba(45,106,79,0.35)",
    transition: "transform 0.15s, box-shadow 0.15s",
    marginTop: 28,
  },
  greenBtn: {
    display: "block", width: "100%", maxWidth: 340,
    padding: "16px 32px",
    background: "#16A34A", color: "#fff",
    border: "none", borderRadius: 14, cursor: "pointer",
    fontSize: 17, fontWeight: 700, letterSpacing: 0.2,
    boxShadow: "0 4px 20px rgba(22,163,74,0.35)",
    transition: "transform 0.15s, box-shadow 0.15s",
    marginTop: 28,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
    padding: "16px 20px",
    width: "100%",
  },
  itemRow: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 0",
    borderBottom: "1px solid #F3F4F6",
  },
};

// ─── Global CSS ───────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
@keyframes tutPhaseIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pulse-border {
  0%, 100% { box-shadow: 0 0 0 4px rgba(245,158,11,0.15); }
  50%       { box-shadow: 0 0 0 8px rgba(245,158,11,0.30); }
}
.tut-btn:focus-visible {
  outline: 2px solid #2d6a4f;
  outline-offset: 3px;
}
.tut-btn-green:focus-visible {
  outline: 2px solid #16A34A;
  outline-offset: 3px;
}
`;

type Phase = 0 | 1 | 2 | 3;

// ─── Component ────────────────────────────────────────────────────────────────
export default function BankTutorial({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>(0);
  const [ignored, setIgnored] = useState(false);

  // Hide WhatsApp sidebar button while tutorial is open
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "tut-wa-hide";
    style.textContent = ".wa-sidebar-btn { display: none !important; }";
    document.head.appendChild(style);
    return () => { document.getElementById("tut-wa-hide")?.remove(); };
  }, []);

  const next = (n: Phase) => setPhase(n);

  const creditCount = useCounter(TOTAL,      phase >= 1);
  const doubleCount = useCounter(TOTAL * 2,  phase === 2);

  const itemsRef   = useRef<HTMLDivElement>(null);
  const totalRef   = useRef<HTMLDivElement>(null);
  const bankRowRef = useRef<HTMLDivElement>(null);
  const bigNumRef  = useRef<HTMLDivElement>(null);
  const doneRef    = useRef<HTMLDivElement>(null);

  // ── Phase 1: stagger items + total card ──
  useLayoutEffect(() => {
    if (phase !== 1 || !itemsRef.current) return;
    const rows = itemsRef.current.querySelectorAll<HTMLElement>(".item-row");
    gsap.fromTo(rows,
      { opacity: 0, x: 36 },
      { opacity: 1, x: 0, stagger: dur(0.09), duration: dur(0.32), ease: "power2.out",
        onComplete: () => {
          if (totalRef.current) {
            gsap.fromTo(totalRef.current,
              { opacity: 0, y: 14, scale: 0.85 },
              { opacity: 1, y: 0, scale: 1, duration: dur(0.45), ease: "back.out(1.6)" }
            );
          }
        }
      }
    );
  }, [phase]); // eslint-disable-line

  // ── Phase 2: bank row + shake ──
  useLayoutEffect(() => {
    if (phase !== 2) return;
    if (bankRowRef.current) {
      gsap.fromTo(bankRowRef.current,
        { opacity: 0, y: 24, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: dur(0.5), ease: "back.out(1.5)", delay: dur(0.2) }
      );
    }
    if (bigNumRef.current) {
      gsap.fromTo(bigNumRef.current,
        { opacity: 0, scale: 0.5 },
        {
          opacity: 1, scale: 1, duration: dur(0.4), ease: "back.out(1.7)", delay: dur(0.8),
          onComplete: () => {
            if (prefersReduced) return;
            gsap.to(bigNumRef.current, {
              x: 10, repeat: 9, yoyo: true, duration: 0.06, ease: "none",
              onComplete: () => gsap.set(bigNumRef.current, { x: 0 }),
            });
          },
        }
      );
    }
  }, [phase]); // eslint-disable-line

  // ── Phase 3 success: confetti + fade-in ──
  useEffect(() => {
    if (phase !== 3 || !ignored) return;
    if (!prefersReduced) {
      const fire = (opts: confetti.Options) => confetti({ ...opts, disableForReducedMotion: true });
      fire({ particleCount: 100, spread: 70, origin: { y: 0.55 } });
      setTimeout(() => fire({ particleCount: 50, spread: 120, origin: { y: 0.6, x: 0.2 } }), 220);
      setTimeout(() => fire({ particleCount: 50, spread: 120, origin: { y: 0.6, x: 0.8 } }), 420);
    }
    if (doneRef.current) {
      gsap.fromTo(doneRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: dur(0.55), ease: "power2.out", delay: dur(0.3) }
      );
    }
  }, [phase, ignored]);

  const hoverOn  = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; };
  const hoverOff = (e: React.MouseEvent) => { (e.currentTarget as HTMLElement).style.transform = ""; };

  // ─── PHASE 0 — Intro ─────────────────────────────────────────────────────
  if (phase === 0) return (
    <div style={S.overlay}>
      <style>{GLOBAL_CSS}</style>
      <TopBar phase={0} onClose={onDone} />
      <div style={S.stage}>
        <div style={{ marginBottom: 12 }}><BankIcon /></div>
        <h1 style={S.title}>לפני שמעלים את פירוט העו"ש</h1>
        <p style={{ ...S.sub, marginBottom: 24 }}>
          יש דבר אחד חשוב שצריך להבין<br/>
          כדי שהתמונה הפיננסית שלך תהיה מדויקת
        </p>
        <button className="tut-btn" style={S.primaryBtn} onClick={() => next(1)} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          מה זה? ←
        </button>
      </div>
    </div>
  );

  // ─── PHASE 1 — Credits ───────────────────────────────────────────────────
  if (phase === 1) return (
    <div style={S.overlay}>
      <style>{GLOBAL_CSS}</style>
      <TopBar phase={1} onClose={onDone} />
      <div style={S.stage}>
        <h1 style={{ ...S.title, fontSize: "clamp(19px,4vw,24px)", marginBottom: 6 }}>
          הוצאות האשראי שלך כבר מסווגות במערכת
        </h1>
        <p style={{ ...S.sub, marginBottom: 16, fontSize: 14 }}>
          כל רכישה שעשית בכרטיס אשראי — נמצאת כאן
        </p>

        <div style={{ ...S.card, marginBottom: 16 }} ref={itemsRef}>
          {ITEMS.map((it) => (
            <div key={it.label} className="item-row" style={{ ...S.itemRow, opacity: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CardIcon />
                <span style={{ fontSize: 15, color: "#374151", fontWeight: 500 }}>{it.label}</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>₪{fmt(it.amount)}</span>
            </div>
          ))}
        </div>

        <div ref={totalRef} style={{ ...S.card, opacity: 0, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#F0FDF4", border: "1.5px solid #BBF7D0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CheckIcon />
            <span style={{ fontSize: 16, fontWeight: 600, color: "#166534" }}>סה"כ אשראי מסווג</span>
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, color: "#166534" }}>₪{fmt(creditCount)}</span>
        </div>

        <button className="tut-btn" style={S.primaryBtn} onClick={() => next(2)} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          הבנתי, המשך ←
        </button>
      </div>
    </div>
  );

  // ─── PHASE 2 — Problem ───────────────────────────────────────────────────
  if (phase === 2) return (
    <div style={S.overlay}>
      <style>{GLOBAL_CSS}</style>
      <TopBar phase={2} onClose={onDone} />
      <div style={S.stage}>
        <h1 style={{ ...S.title, fontSize: "clamp(19px,4vw,24px)", marginBottom: 6 }}>
          הבנק גם מציג את תשלום האשראי
        </h1>
        <p style={{ ...S.sub, marginBottom: 20, fontSize: 14 }}>
          כך נוצרת בעיה — אותו כסף נספר פעמיים
        </p>

        {/* Two-column equation */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", marginBottom: 20 }}>
          {/* Credit box */}
          <div style={{ flex: 1, ...S.card, textAlign: "right" as const, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 4, fontWeight: 600 }}>אשראי</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#111827" }}>₪6,200</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>5 עסקאות</div>
          </div>

          {/* Plus */}
          <div style={{ fontSize: 32, fontWeight: 400, color: "#9CA3AF", flexShrink: 0 }}>+</div>

          {/* Bank row box */}
          <div ref={bankRowRef} style={{ flex: 1, ...S.card, textAlign: "right" as const, padding: "14px 16px", opacity: 0, background: "#FFFBEB", border: "1.5px solid #FDE68A" }}>
            <div style={{ fontSize: 12, color: "#92400E", marginBottom: 4, fontWeight: 600 }}>פירוט עו"ש</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#92400E" }}>₪6,200</div>
            <div style={{ fontSize: 12, color: "#B45309", marginTop: 4 }}>ישראכרט</div>
          </div>
        </div>

        {/* Big number */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: "#9CA3AF", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <WarningIcon />
            <span style={{ color: "#B45309", fontWeight: 600 }}>המערכת תחשב:</span>
          </div>
          <div ref={bigNumRef} style={{ opacity: 0 }}>
            <BigAmount value={doubleCount} color="#DC2626" />
          </div>
          <div style={{ fontSize: 14, color: "#DC2626", fontWeight: 700, marginTop: 8 }}>
            ⚠️ כפל ספירה! הסכום מוכפל לשווא
          </div>
        </div>

        <button className="tut-btn" style={S.primaryBtn} onClick={() => next(3)} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          איך פותרים? ←
        </button>
      </div>
    </div>
  );

  // ─── PHASE 3 — Solution ──────────────────────────────────────────────────
  return (
    <div style={S.overlay}>
      <style>{GLOBAL_CSS}</style>
      <TopBar phase={3} onClose={onDone} />
      <div style={S.stage}>

        {!ignored ? (
          <>
            <h1 style={{ ...S.title, fontSize: "clamp(19px,4vw,24px)", marginBottom: 6 }}>
              מסמנים את שורת ישראכרט כ"להתעלם"
            </h1>
            <p style={{ ...S.sub, marginBottom: 24, fontSize: 14 }}>
              כך המערכת לא תספור אותה — ותראה את הסכום האמיתי
            </p>

            <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, border: "2px dashed #FDE68A", background: "#FFFBEB" }}>
              <button
                onClick={() => setIgnored(true)}
                style={{
                  padding: "10px 20px",
                  background: "#fff",
                  border: "2px solid #F59E0B",
                  borderRadius: 10,
                  cursor: "pointer",
                  fontSize: 15, fontWeight: 700, color: "#B45309",
                  animation: prefersReduced ? "none" : "pulse-border 1.5s ease-in-out infinite",
                  boxShadow: "0 0 0 4px rgba(245,158,11,0.2)",
                  flexShrink: 0,
                }}
              >
                להתעלם
              </button>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 13, color: "#B45309", fontWeight: 600, marginBottom: 2 }}>ישראכרט</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#92400E" }}>₪6,200</div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center" as const, lineHeight: 1.5 }}>
              לחץ על הכפתור כדי לראות איך זה עובד
            </div>
          </>
        ) : (
          <div ref={doneRef} style={{ opacity: 0, display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
            {/* Strikethrough bank row */}
            <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, opacity: 0.4, background: "#F9FAFB", border: "1.5px solid #E5E7EB" }}>
              <div style={{ padding: "8px 18px", background: "#DCFCE7", borderRadius: 10, fontSize: 14, fontWeight: 700, color: "#166534", flexShrink: 0 }}>
                ✓ להתעלם
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 600, marginBottom: 2, textDecoration: "line-through" }}>ישראכרט</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#9CA3AF", textDecoration: "line-through" }}>₪6,200</div>
              </div>
            </div>

            <BigCheckIcon />

            <h1 style={{ ...S.title, marginTop: 20, marginBottom: 6 }}>מצוין!</h1>
            <p style={{ ...S.sub, marginBottom: 28, fontSize: 15 }}>
              עכשיו המערכת תספור רק ₪6,200 — בדיוק כמו שצריך.<br/>
              כשתעלה את פירוט העו"ש, תמצא שם שורת ישראכרט — <strong>סמן אותה כ"להתעלם"</strong>.
            </p>

            <button
              className="tut-btn-green"
              style={S.greenBtn}
              onClick={onDone}
              onMouseEnter={hoverOn}
              onMouseLeave={hoverOff}
            >
              הבנתי — בואו נתחיל
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  return (
    <div style={S.topBar}>
      <div style={S.dots}>
        {([0, 1, 2, 3] as Phase[]).map((p) => (
          <div key={p} style={S.dot(p <= phase)} />
        ))}
      </div>
      <span style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 500 }}>
        {phase + 1} / 4
      </span>
      <button
        className="tut-btn"
        style={S.closeBtn}
        onClick={onClose}
        title="דלג"
        aria-label="סגור"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
