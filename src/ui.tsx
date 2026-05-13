import React from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, ReactNode, MouseEventHandler } from 'react';
import type { Conf } from './types';

export const C: Record<string, string> = {
  // Greens
  greenDeep:  "var(--green-deep)",
  greenMid:   "var(--green-mid)",
  greenSoft:  "var(--green-soft)",
  greenMint:  "var(--green-mint)",
  greenPale:  "var(--green-pale)",
  // Gold
  gold:       "var(--gold)",
  goldLight:  "var(--gold-light)",
  // Surfaces
  bg:         "var(--bg)",
  surface:    "var(--surface)",
  surface2:   "var(--surface2)",
  border:     "var(--border)",
  // Text
  text:       "var(--text)",
  textMid:    "var(--text-mid)",
  dim:        "var(--text-dim)",
  // Status
  green:      "var(--green-soft)",
  red:        "var(--red)",
  yellow:     "var(--gold)",
  // Legacy aliases for existing code
  accent:     "var(--green-mid)",
  accent2:    "var(--green-soft)",
};

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export const Card = ({ children, style, onClick }: CardProps) => (
  <div onClick={onClick} style={{
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 24,
    boxShadow: "0 1px 4px rgba(30,77,53,0.06)",
    cursor: onClick ? "pointer" : undefined,
    ...style
  }}>
    {children}
  </div>
);

type BtnVariant = "primary" | "ghost" | "secondary" | "success" | "danger";
type BtnSize = "sm" | "md" | "lg";

interface BtnProps {
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  variant?: BtnVariant;
  size?: BtnSize;
  style?: CSSProperties;
  title?: string;
}

export const Btn = ({ children, onClick, disabled, variant = "primary", size = "md", style, title }: BtnProps) => {
  const sizes: Record<BtnSize, CSSProperties> = {
    sm: { padding: "9px 16px", fontSize: 15 },
    md: { padding: "11px 24px", fontSize: 17 },
    lg: { padding: "14px 32px", fontSize: 18 },
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary: {
      background: "var(--green-mid)",
      color: "#fff",
      border: "none",
      boxShadow: "0 4px 16px rgba(45,106,79,0.25)",
    },
    ghost: {
      background: "transparent",
      color: "var(--text-mid)",
      border: "1px solid var(--border)",
    },
    secondary: {
      background: "var(--green-pale)",
      color: "var(--green-deep)",
      border: "1px solid var(--green-mint)",
    },
    success: {
      background: "var(--green-pale)",
      color: "var(--green-deep)",
      border: "1px solid var(--green-soft)",
    },
    danger: {
      background: "var(--red-light)",
      color: "var(--red)",
      border: "1px solid rgba(192,57,43,0.2)",
    },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        fontFamily: "'Heebo', sans-serif",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontWeight: 600,
        transition: "all 0.2s",
        opacity: disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
        ...sizes[size],
        ...variants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = ({ label, error, ...props }: InputProps) => (
  <div style={{ marginBottom: 16 }}>
    {label && (
      <div style={{
        fontSize: 15,
        color: "var(--text-mid)",
        marginBottom: 6,
        fontWeight: 600,
        letterSpacing: "0.01em",
      }}>{label}</div>
    )}
    <input
      style={{
        width: "100%",
        background: "var(--surface2)",
        border: `1.5px solid ${error ? "var(--red)" : "var(--border)"}`,
        borderRadius: 10,
        padding: "11px 14px",
        color: "var(--text)",
        fontFamily: "'Heebo', sans-serif",
        fontSize: 17,
        direction: "rtl",
        boxSizing: "border-box",
        outline: "none",
        transition: "border-color 0.2s",
      }}
      onFocus={e => (e.target as HTMLInputElement).style.borderColor = "var(--green-mid)"}
      onBlur={e => (e.target as HTMLInputElement).style.borderColor = error ? "var(--red)" : "var(--border)"}
      {...props}
    />
    {error && (
      <div style={{ fontSize: 14, color: "var(--red)", marginTop: 4 }}>{error}</div>
    )}
  </div>
);

interface BadgeProps {
  conf: Conf;
}

export const Badge = ({ conf }: BadgeProps) => {
  const map: Record<Conf, { label: string; bg: string; color: string; dot: string }> = {
    high: { label: "בטוח",    bg: "var(--green-pale)", color: "var(--green-deep)", dot: "var(--green-soft)" },
    med:  { label: "בינוני",  bg: "var(--gold-light)", color: "#7a5c1e",           dot: "var(--gold)" },
    low:  { label: "לבדיקה", bg: "var(--red-light)",   color: "var(--red)",        dot: "var(--red)" },
  };
  const s = map[conf] || map.low;
  return (
    <span style={{
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.dot}44`,
      borderRadius: 20,
      padding: "3px 10px",
      fontSize: 14,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  );
};

interface SpinnerProps {
  size?: number;
}

export const Spinner = ({ size = 36 }: SpinnerProps) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: "50%",
    border: "3px solid var(--green-mint)",
    borderTopColor: "var(--green-mid)",
    animation: "spin 0.75s linear infinite",
  }} />
);

interface KpiCardProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  color?: string;
}

export const KpiCard = ({ icon, label, value, color }: KpiCardProps) => (
  <div style={{
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "20px 22px",
    boxShadow: "0 1px 4px rgba(30,77,53,0.06)",
    borderTop: `3px solid var(--green-mint)`,
  }}>
    <div style={{ marginBottom: 10, display:"flex", alignItems:"center" }}>{icon}</div>
    <div style={{
      fontFamily: "'Frank Ruhl Libre', serif",
      fontSize: 30,
      fontWeight: 600,
      color: color || "var(--green-deep)",
      lineHeight: 1,
      marginBottom: 6,
    }}>{value}</div>
    <div style={{ fontSize: 15, color: "var(--text-dim)", fontWeight: 500 }}>{label}</div>
  </div>
);

export interface CustomSelectOption { value: string | number; label: string; }
export interface CustomSelectGroup  { label: string; options: CustomSelectOption[]; }

interface CustomSelectProps {
  value: string | number;
  onChange: (val: any) => void;
  options?: CustomSelectOption[];
  groups?: CustomSelectGroup[];
  placeholder?: string;
  style?: CSSProperties;
  dropdownZIndex?: number;
  size?: "sm" | "md";
  disabled?: boolean;
}

export const CustomSelect = ({
  value, onChange, options = [], groups, placeholder = "בחר...",
  style, dropdownZIndex = 1000, size = "md", disabled = false,
}: CustomSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const [pos,  setPos]  = React.useState({ top: 0, left: 0, width: 0 });
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const dropRef    = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(v => !v);
  };

  const allOpts = groups ? groups.flatMap(g => g.options) : options;
  const selectedLabel = allOpts.find(o => String(o.value) === String(value))?.label;

  const itemS = (sel: boolean): CSSProperties => ({
    display: "block", width: "100%", padding: "9px 14px",
    background: sel ? "var(--green-pale)" : "transparent",
    color: sel ? "var(--green-deep)" : "var(--text)",
    fontFamily: "'Heebo', sans-serif", fontSize: 14,
    direction: "rtl", textAlign: "right",
    cursor: "pointer", border: "none",
    fontWeight: sel ? 700 : 400,
  });

  return (
    <div style={{ position: "relative", ...style }}>
      <button
        ref={triggerRef} type="button"
        onClick={handleOpen} disabled={disabled}
        style={{
          width: "100%",
          background: "var(--surface2)",
          border: `1px solid ${open ? "var(--green-mid)" : "var(--border)"}`,
          borderRadius: 8,
          padding: size === "sm" ? "7px 10px" : "9px 12px",
          color: selectedLabel ? "var(--text)" : "var(--text-dim)",
          fontFamily: "'Heebo', sans-serif",
          fontSize: size === "sm" ? 14 : 15,
          direction: "rtl", cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 8, textAlign: "right", boxSizing: "border-box", outline: "none",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedLabel ?? placeholder}
        </span>
        <span style={{ flexShrink: 0, opacity: 0.4, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{
          position: "fixed", top: pos.top, left: pos.left, width: pos.width,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(30,77,53,0.15)",
          zIndex: "var(--z-drop)", maxHeight: 240, overflowY: "auto",
        }}>
          {groups ? groups.map(g => (
            <div key={g.label}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", padding: "7px 12px 3px", letterSpacing: "0.05em", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>{g.label}</div>
              {g.options.map(o => (
                <button key={String(o.value)} type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  style={itemS(String(o.value) === String(value))}>
                  {o.label}
                </button>
              ))}
            </div>
          )) : options.map(o => (
            <button key={String(o.value)} type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={itemS(String(o.value) === String(value))}>
              {o.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
