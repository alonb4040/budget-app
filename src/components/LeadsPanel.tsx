import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { CSSProperties } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LeadStatus = "pending" | "not_fit" | "not_interested" | "converted";
type LeadSource = "referral" | "facebook" | "instagram" | "google" | "other";

interface Lead {
  id: string; name: string; phone: string; date: string;
  source: LeadSource; status: LeadStatus; notes: string;
  client_id: number | null; created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<LeadSource, { label: string; color: string; bg: string }> = {
  referral:  { label: "המלצה",    color: "#065f46", bg: "#d1fae5" },
  facebook:  { label: "פייסבוק",  color: "#1e40af", bg: "#dbeafe" },
  instagram: { label: "אינסטגרם", color: "#6b21a8", bg: "#f3e8ff" },
  google:    { label: "גוגל",     color: "#92400e", bg: "#fef3c7" },
  other:     { label: "אחר",      color: "#4b5563", bg: "#f3f4f6" },
};

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string; borderColor: string; dot: string }> = {
  pending:        { label: "מתלבטים",    color: "#6b7280", bg: "#f3f4f6", borderColor: "#d1d5db", dot: "#9ca3af" },
  not_fit:        { label: "לא מתאים",   color: "#6b7280", bg: "#f3f4f6", borderColor: "#d1d5db", dot: "#9ca3af" },
  not_interested: { label: "לא מעוניין", color: "#6b7280", bg: "#f3f4f6", borderColor: "#d1d5db", dot: "#9ca3af" },
  converted:      { label: "לקוחות",     color: "#065f46", bg: "#d1fae5", borderColor: "#34d39944", dot: "#34d399" },
};

const EMPTY_FORM = {
  name: "", phone: "",
  date: new Date().toISOString().split("T")[0],
  source: "referral" as LeadSource,
  notes: "", status: "pending" as LeadStatus,
};

const inputSt: CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid var(--border)", background: "var(--surface2)",
  color: "var(--text)", fontFamily: "inherit", fontSize: 15,
  outline: "none", boxSizing: "border-box", direction: "rtl",
  transition: "border-color 0.18s",
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  );
}

function EmptyLeadsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      <line x1="19" y1="3" x2="19" y2="9"/><line x1="16" y1="6" x2="22" y2="6"/>
    </svg>
  );
}

// ── Source picker ─────────────────────────────────────────────────────────────

function SourcePicker({ source, onChange }: { source: LeadSource; onChange: (s: LeadSource) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = SOURCE_CONFIG[source];

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const handleClick = () => setOpen(false);
    document.addEventListener("keydown", handleKey);
    setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleClick);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} className="source-picker-btn" style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderRadius: 10,
        border: "1.5px solid var(--border)", background: "var(--surface2)",
        color: "var(--text)", fontFamily: "inherit", fontSize: 15,
        cursor: "pointer", outline: "none", transition: "border-color 0.18s",
      }}>
        <span>{cfg.label}</span>
        <ChevronDown />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", right: 0, left: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          zIndex: 1100, overflow: "hidden",
          animation: "fadeUp 0.15s ease",
        }}>
          {(Object.entries(SOURCE_CONFIG) as [LeadSource, typeof cfg][]).map(([val, c]) => (
            <button key={val} onClick={() => { onChange(val); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 14px", border: "none",
                background: val === source ? "var(--surface2)" : "transparent",
                color: "var(--text)", fontFamily: "inherit", fontSize: 14,
                cursor: "pointer", textAlign: "right",
              }}
              onMouseEnter={e => { if (val !== source) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
              onMouseLeave={e => { if (val !== source) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              {val === source
                ? <span style={{ fontSize: 11, color: "var(--green-mid)" }}>✓</span>
                : <span />}
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status picker ─────────────────────────────────────────────────────────────

function StatusPicker({ status, onChange }: { status: LeadStatus; onChange: (s: LeadStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status];

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const handleClick = () => setOpen(false);
    document.addEventListener("keydown", handleKey);
    setTimeout(() => document.addEventListener("click", handleClick), 0);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("click", handleClick);
    };
  }, [open]);

  return (
    <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 8px 4px 6px", borderRadius: 6,
        border: `1px solid ${cfg.borderColor}`,
        background: cfg.bg, color: cfg.color,
        fontFamily: "inherit", fontSize: 12, fontWeight: 600,
        cursor: "pointer", outline: "none", whiteSpace: "nowrap",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
        {cfg.label}
        <ChevronDown />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 5px)", right: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          zIndex: 1100, minWidth: 148, overflow: "hidden",
          animation: "fadeUp 0.15s ease",
        }}>
          {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof cfg][]).map(([val, c]) => (
            <button key={val} onClick={() => { onChange(val); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px", border: "none",
                background: val === status ? "var(--surface2)" : "transparent",
                color: c.color, fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                cursor: "pointer", textAlign: "right",
              }}
              onMouseEnter={e => { if (val !== status) (e.currentTarget as HTMLElement).style.background = "var(--surface2)"; }}
              onMouseLeave={e => { if (val !== status) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, flexShrink: 0 }} />
              {c.label}
              {val === status && <span style={{ marginRight: "auto", opacity: 0.5, fontSize: 11 }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Kanban card ───────────────────────────────────────────────────────────────

function KanbanCard({ lead, index, onEdit, onDelete, onStatusChange, onCreateClient }: {
  lead: Lead; index: number;
  onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: LeadStatus) => void; onCreateClient: () => void;
}) {
  const src = SOURCE_CONFIG[lead.source as LeadSource] ?? SOURCE_CONFIG.other;
  const dateStr = lead.date ? new Date(lead.date + "T12:00:00").toLocaleDateString("he-IL") : "";

  return (
    <div className="lead-card" style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "14px 16px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      animation: "fadeUp 0.3s ease both",
      animationDelay: `${index * 40}ms`,
      position: "relative",
    }}>
      {/* Name */}
      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 8 }}>
        {lead.name}
      </div>

      {/* Meta */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: lead.notes ? 8 : 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: src.color, background: src.bg, padding: "2px 7px", borderRadius: 4 }}>
          {src.label}
        </span>
        {lead.phone && (
          <a href={`tel:${lead.phone}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 3, color: "var(--text-dim)", fontSize: 12, textDecoration: "none", direction: "ltr" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--green-mid)"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-dim)"}
          >
            <PhoneIcon />{lead.phone}
          </a>
        )}
        {dateStr && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{dateStr}</span>}
      </div>

      {/* Notes */}
      {lead.notes && (
        <div style={{ fontSize: 12, color: "var(--text-dim)", fontStyle: "italic", borderTop: "1px solid var(--border)", paddingTop: 8, marginBottom: 8, lineHeight: 1.4 }}>
          "{lead.notes}"
        </div>
      )}

      {/* Footer: status + actions */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div className="lead-actions" style={{ display: "flex", gap: 3 }}>
          <button onClick={onEdit} className="action-btn"
            style={{ padding: 5, borderRadius: 6, border: "1px solid var(--border)", background: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
            <EditIcon />
          </button>
          <button onClick={onDelete} className="action-btn-danger"
            style={{ padding: 5, borderRadius: 6, border: "none", background: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", alignItems: "center" }}>
            <TrashIcon />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {lead.status === "pending" && (
            <button onClick={onCreateClient} style={{
              padding: "3px 9px", borderRadius: 6, border: "none",
              background: "var(--green-mid)", color: "#fff",
              fontFamily: "inherit", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}>
              המר ללקוח
            </button>
          )}
          <StatusPicker status={lead.status} onChange={onStatusChange} />
        </div>
      </div>
    </div>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────────

function KanbanColumn({ status, leads, onEdit, onDelete, onStatusChange, onCreateClient }: {
  status: LeadStatus; leads: Lead[];
  onEdit: (lead: Lead) => void; onDelete: (id: string, name: string) => void;
  onStatusChange: (id: string, s: LeadStatus) => void; onCreateClient: (lead: Lead) => void;
}) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: status === "converted" ? "#f0faf2" : "#f5f5f4",
      borderRadius: 14, padding: "16px 14px",
    }}>
      {/* Column header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-mid)" }}>{cfg.label}</span>
        </div>
        <span style={{
          fontSize: 12, fontWeight: 700, minWidth: 22, textAlign: "center",
          background: cfg.bg, color: cfg.color,
          padding: "2px 8px", borderRadius: 10,
        }}>
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {leads.map((lead, i) => (
          <KanbanCard
            key={lead.id} lead={lead} index={i}
            onEdit={() => onEdit(lead)}
            onDelete={() => onDelete(lead.id, lead.name)}
            onStatusChange={s => onStatusChange(lead.id, s)}
            onCreateClient={() => onCreateClient(lead)}
          />
        ))}

        {/* Empty column */}
        {leads.length === 0 && (
          <div style={{ padding: "28px 0 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <EmptyLeadsIcon />
            <span style={{ color: "var(--text-dim)", fontSize: 12 }}>אין לידים בעמודה זו</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div style={{
      position: "fixed", bottom: 28, left: 28, zIndex: 2000,
      background: "var(--green-deep)", color: "#fff",
      padding: "12px 20px", borderRadius: 10,
      fontSize: 14, fontWeight: 600, fontFamily: "inherit",
      boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      animation: "toastIn 0.25s cubic-bezier(0.16,1,0.3,1)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>✓</span>
      {message}
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({ name, onConfirm, onCancel }: {
  name: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200, backdropFilter: "blur(6px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 360,
        background: "var(--surface)", borderRadius: 16,
        boxShadow: "0 24px 60px rgba(0,0,0,0.2)",
        zIndex: 1201, padding: "28px 28px 22px",
        animation: "modalIn 200ms cubic-bezier(0.16,1,0.3,1)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🗑️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          מחיקת ליד
        </div>
        <div style={{ fontSize: 14, color: "var(--text-mid)", marginBottom: 24, lineHeight: 1.5 }}>
          האם למחוק את <strong>{name}</strong>?<br />
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>פעולה זו בלתי הפיכה</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onCancel} style={{
            padding: "9px 20px", borderRadius: 9,
            border: "1px solid var(--border)", background: "none",
            fontFamily: "inherit", fontSize: 14, cursor: "pointer", color: "var(--text-mid)",
          }}>
            ביטול
          </button>
          <button onClick={onConfirm} style={{
            padding: "9px 20px", borderRadius: 9, border: "none",
            background: "var(--red)", color: "#fff",
            fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}
          >
            מחק
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface LeadsPanelProps {
  onCreateClient: (lead: { name: string; phone: string; leadId: string }) => void;
}

export default function LeadsPanel({ onCreateClient }: LeadsPanelProps) {
  const [leads, setLeads]             = useState<Lead[]>([]);
  const [loading, setLoading]         = useState(true);
  const [panelOpen, setPanelOpen]     = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [nameError, setNameError]     = useState(false);
  const [showExtra, setShowExtra]     = useState(false);
  const [toast, setToast]             = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  const load = async () => {
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    setLeads(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Escape key: close modal or delete confirm
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteConfirm) { setDeleteConfirm(null); return; }
      if (panelOpen) { closePanel(); return; }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [panelOpen, deleteConfirm]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd  = () => { setEditingLead(null); setForm(EMPTY_FORM); setPanelOpen(true); setNameError(false); setShowExtra(false); };
  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setForm({ name: lead.name, phone: lead.phone || "", date: lead.date || EMPTY_FORM.date, source: (lead.source as LeadSource) || "referral", notes: lead.notes || "", status: lead.status });
    setPanelOpen(true); setNameError(false); setShowExtra(true);
  };
  const closePanel = () => { setPanelOpen(false); setEditingLead(null); };

  const save = async () => {
    if (!form.name.trim()) { setNameError(true); return; }
    setSaving(true);
    const wasEditing = !!editingLead;
    if (editingLead) {
      await supabase.from("leads").update({ name: form.name, phone: form.phone, date: form.date, source: form.source, notes: form.notes, status: form.status }).eq("id", editingLead.id);
    } else {
      await supabase.from("leads").insert([{ name: form.name, phone: form.phone, date: form.date, source: form.source, notes: form.notes, status: form.status }]);
    }
    setSaving(false);
    closePanel();
    await load();
    showToast(wasEditing ? "שינויים נשמרו" : "ליד נוסף בהצלחה");
  };

  const deleteLead = (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await supabase.from("leads").delete().eq("id", deleteConfirm.id);
    setDeleteConfirm(null);
    await load();
    showToast("ליד נמחק");
  };

  const updateStatus = async (id: string, status: LeadStatus) => {
    await supabase.from("leads").update({ status }).eq("id", id);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  };

  const byStatus = (s: LeadStatus) => leads.filter(l => l.status === s);
  const converted = byStatus("converted").length;
  const decided = byStatus("converted").length + byStatus("not_interested").length;
  const conversionRate = decided > 0 ? Math.round((converted / decided) * 100) : null;

  // RTL: first in array = rightmost on screen. converted is most important → first.
  const visibleColumns: LeadStatus[] = ["converted", "pending", "not_interested", "not_fit"];

  return (
    <div>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{
          fontFamily: "'Frank Ruhl Libre', serif",
          fontSize: 22, fontWeight: 600,
          color: "var(--text)", margin: 0,
          letterSpacing: "-0.01em",
        }}>
          לידים
        </h1>
        <button
          onClick={openAdd}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--green-mid)", color: "#fff",
            fontFamily: "inherit", fontSize: 15, fontWeight: 600,
            cursor: "pointer", transition: "background 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#255c3d"}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "var(--green-mid)"}
        >
          <PlusIcon />
          הוסף ליד
        </button>
      </div>

      {/* ── Stats row ── */}
      <div style={{
        display: "flex", alignItems: "stretch",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
        marginBottom: 32,
      }}>
        {[
          { label: "סה״כ לידים",  value: `${leads.length}`, color: "var(--green-deep)" },
          { label: "סה״כ לקוחות", value: `${converted}`,    color: "var(--green-soft)" },
          { label: "אחוז המרה",   value: conversionRate !== null ? `${conversionRate}%` : "—", color: conversionRate !== null && conversionRate >= 50 ? "var(--green-soft)" : "var(--gold)" },
        ].map((stat, i, arr) => (
          <div key={stat.label} style={{ flex: 1, display: "flex" }}>
            <div style={{ flex: 1, padding: "20px 24px", textAlign: "center" }}>
              <div style={{
                fontFamily: "'Rubik', sans-serif",
                fontSize: 32, fontWeight: 700,
                color: stat.color, lineHeight: 1,
                letterSpacing: "-0.02em",
                fontFeatureSettings: '"tnum"',
              }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6, fontWeight: 500 }}>
                {stat.label}
              </div>
            </div>
            {i < arr.length - 1 && (
              <div style={{ width: 1, background: "var(--border)", margin: "16px 0" }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Kanban ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-dim)" }}>טוען...</div>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {visibleColumns.map(status => (
            <KanbanColumn
              key={status}
              status={status}
              leads={byStatus(status)}
              onEdit={openEdit}
              onDelete={deleteLead}
              onStatusChange={updateStatus}
              onCreateClient={lead => onCreateClient({ name: lead.name, phone: lead.phone || "", leadId: lead.id })}
            />
          ))}
        </div>
      )}

      {/* ── Modal (centered) ── */}
      {panelOpen && (
        <>
          <div onClick={closePanel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, backdropFilter: "blur(10px)" }} />
          <div style={{
            position: "fixed",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: 440, maxHeight: "90vh",
            background: "var(--surface)",
            borderRadius: 18,
            boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
            zIndex: 1001, display: "flex", flexDirection: "column",
            animation: "modalIn 240ms cubic-bezier(0.16,1,0.3,1)",
          }}>
            {/* Header */}
            <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", position: "relative" }}>
              <button onClick={closePanel} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 16, padding: 4, lineHeight: 1, borderRadius: 6, display: "flex", alignItems: "center" }}>
                ✕
              </button>
              <div style={{
                position: "absolute", left: "50%", transform: "translateX(-50%)",
                fontFamily: "'Rubik', sans-serif", fontSize: 17, fontWeight: 700,
                color: "var(--text)", whiteSpace: "nowrap", letterSpacing: "-0.01em",
              }}>
                {editingLead ? "עריכת ליד" : "ליד חדש"}
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: "auto", padding: "22px 28px", display: "flex", flexDirection: "column", gap: 14 }}>

              {/* שם מלא */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-mid)", marginBottom: 6 }}>שם מלא</div>
                <input
                  value={form.name}
                  onChange={e => { setForm(p => ({ ...p, name: e.target.value })); setNameError(false); }}
                  placeholder="ישראל ישראלי"
                  style={{ ...inputSt, borderColor: nameError ? "var(--red)" : undefined }}
                  autoFocus
                />
                {nameError && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 5 }}>שדה חובה</div>}
              </div>

              {/* טלפון */}
              <Field label="טלפון">
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="050-0000000" type="tel" style={{ ...inputSt, direction: "ltr", textAlign: "right" }} />
              </Field>

              {/* Progressive disclosure */}
              {!showExtra && !editingLead && (
                <button onClick={() => setShowExtra(true)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-dim)", fontFamily: "inherit", fontSize: 13,
                  padding: "2px 0", textAlign: "right", display: "flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> פרטים נוספים
                </button>
              )}

              {(showExtra || editingLead) && (
                <>
                  <Field label="מקור הפנייה">
                    <SourcePicker source={form.source} onChange={s => setForm(p => ({ ...p, source: s }))} />
                  </Field>
                  <Field label="תאריך שיחה">
                    <input value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} type="date" style={{ ...inputSt, direction: "ltr", textAlign: "right" }} />
                  </Field>
                  {editingLead && (
                    <Field label="סטטוס">
                      <StatusPicker status={form.status} onChange={s => setForm(p => ({ ...p, status: s }))} />
                    </Field>
                  )}
                  <Field label="הערה">
                    <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder='למשל: "מתעניינת, תתקשר בשבוע הבא"' rows={3} style={{ ...inputSt, resize: "none" }} />
                  </Field>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "16px 28px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-start", gap: 10 }}>
              <button onClick={closePanel} style={{
                padding: "10px 18px", borderRadius: 10,
                border: "1px solid var(--border)", background: "none",
                fontFamily: "inherit", fontSize: 14, cursor: "pointer", color: "var(--text-mid)",
              }}>
                ביטול
              </button>
              <button onClick={save} disabled={saving} style={{
                padding: "10px 22px", borderRadius: 10, border: "none",
                background: "var(--green-deep)", color: "#fff",
                fontFamily: "inherit", fontSize: 14, fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? "שומר..." : editingLead ? "שמור שינויים" : "הוסף ליד"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirmation modal ── */}
      {deleteConfirm && (
        <DeleteConfirmModal
          name={deleteConfirm.name}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast && <Toast message={toast} />}

      <style>{`
        @keyframes modalIn {
          from { transform: translate(-50%, -48%) scale(0.96); opacity: 0; }
          to   { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
        }
        @keyframes fadeUp {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes toastIn {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .lead-card { transition: box-shadow 0.2s, transform 0.2s, border-color 0.2s; }
        .lead-card:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important; transform: translateY(-2px); border-color: rgba(45,106,79,0.2) !important; }
        .lead-actions { opacity: 0; transition: opacity 0.18s; }
        .lead-card:hover .lead-actions { opacity: 1; }
        .action-btn:hover { background: var(--surface2) !important; color: var(--text) !important; }
        .action-btn-danger:hover { background: var(--red-light) !important; color: var(--red) !important; }
        input:focus, textarea:focus { border-color: var(--green-mid) !important; outline: none; box-shadow: 0 0 0 3px rgba(45,106,79,0.1); }
        .source-picker-btn:focus, .source-picker-btn:hover { border-color: var(--green-mid) !important; }
      `}</style>
    </div>
  );
}
