export const C = {
  bg: "#0f1117", surface: "#1a1d27", surface2: "#22263a", border: "#2e3350",
  accent: "#4f8ef7", accent2: "#7c5cfc", green: "#2ecc8a",
  red: "#f75c5c", yellow: "#f7c948", dim: "#8b90b0",
};

export const Card = ({ children, style }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, ...style }}>
    {children}
  </div>
);

export const Btn = ({ children, onClick, disabled, variant = "primary", size = "md", style }) => {
  const sizes = { sm: { padding: "6px 14px", fontSize: 12 }, md: { padding: "11px 24px", fontSize: 14 }, lg: { padding: "14px 32px", fontSize: 16 } };
  const variants = {
    primary: { background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, color: "#fff", boxShadow: "0 4px 14px rgba(79,142,247,0.3)" },
    ghost: { background: C.surface2, color: C.dim, border: `1px solid ${C.border}` },
    danger: { background: "rgba(247,92,92,0.12)", color: C.red, border: `1px solid rgba(247,92,92,0.3)` },
  };
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{ fontFamily: "'Heebo', sans-serif", border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, transition: "all .2s", opacity: disabled ? 0.5 : 1, ...sizes[size], ...variants[variant], ...style }}
    >
      {children}
    </button>
  );
};

export const Input = ({ label, error, ...props }) => (
  <div style={{ marginBottom: 16 }}>
    {label && <div style={{ fontSize: 12, color: C.dim, marginBottom: 5, fontWeight: 600 }}>{label}</div>}
    <input
      style={{ width: "100%", background: C.surface2, border: `1px solid ${error ? C.red : C.border}`, borderRadius: 8, padding: "10px 12px", color: "#e8eaf6", fontFamily: "'Heebo', sans-serif", fontSize: 13, direction: "rtl", boxSizing: "border-box", outline: "none" }}
      {...props}
    />
    {error && <div style={{ fontSize: 11, color: C.red, marginTop: 4 }}>{error}</div>}
  </div>
);

export const Badge = ({ conf }) => {
  const map = {
    high: ["● בטוח", C.green, "rgba(46,204,138,0.12)"],
    med:  ["◐ בינוני", C.yellow, "rgba(247,201,72,0.12)"],
    low:  ["○ לבדיקה", C.red, "rgba(247,92,92,0.12)"],
  };
  const [label, color, bg] = map[conf] || map.low;
  return <span style={{ background: bg, color, border: `1px solid ${color}33`, borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>;
};

export const Spinner = ({ size = 40 }) => (
  <>
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{ width: size, height: size, borderRadius: "50%", border: `3px solid #2e3350`, borderTopColor: "#4f8ef7", animation: "spin 0.8s linear infinite" }} />
  </>
);

export const KpiCard = ({ icon, label, value, color }) => (
  <Card style={{ padding: "18px 20px" }}>
    <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: color || "#e8eaf6" }}>{value}</div>
    <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{label}</div>
  </Card>
);
