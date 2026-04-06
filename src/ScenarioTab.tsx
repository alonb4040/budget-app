import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { Card, Btn, Input, C } from "./ui";
import type { Client } from "./types";

interface ScenarioTabProps {
  client: Client;
}

interface ScenarioRow {
  id: string;
  client_id: string;
  name: string;
  uploaded_at: string;
}

interface ActiveScenario {
  id: string;
  client_id: string;
  scenario_id: string;
  active_from: string;
  active_until: string | null;
  activated_at: string;
  scenarios?: { name: string };
}

type ItemType = "income" | "expense_fixed" | "expense_variable";

interface ScenarioItemRow {
  id: string;
  scenario_id: string;
  client_id: string;
  category_name: string;
  amount: number;
  item_type: ItemType;
  sort_order: number;
}

interface ParsedItem {
  amount: number;
  type: ItemType;
  displayName: string;
}

interface ParseResult {
  scenarioNames: string[];
  results: Record<string, Record<string, ParsedItem>>;
}

interface UploadResult extends ParseResult {
  fileName: string;
}

interface UnmappedItem {
  name: string;
  type: ItemType;
  mappedTo: string | null;
}

// ── פיענוח Excel תסריט ─────────────────────────────────────────────────────
function parseScenarioExcel(arrayBuffer: ArrayBuffer): ParseResult {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("XLSX לא נטען");
  const wb  = XLSX.read(arrayBuffer, { type: "array" });
  const ws  = wb.Sheets["מאזן מבוסס תסריטים"];
  if (!ws) throw new Error("לא נמצא גליון 'מאזן מבוסס תסריטים'");

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as (unknown[])[];

  // מצא שורת הכותרת (תסריט)
  let headerRow = -1;
  let scenarioNames: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (r && r.some(c => c === "תסריט")) {
      headerRow = i;
      scenarioNames = r.slice(2).filter(Boolean).map(s => String(s).trim());
      break;
    }
  }
  if (headerRow === -1) throw new Error("לא נמצאה שורת תסריטים");

  let currentSection: ItemType = "expense_fixed";

  const results: Record<string, Record<string, ParsedItem>> = {};
  scenarioNames.forEach(n => { results[n] = {}; });

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r || !r[1]) continue;
    let name = String(r[1]).trim();
    if (!name || name.startsWith('סה"כ') || name.startsWith('שורה תחתונה') || name.startsWith('כל הזכויות')) continue;
    const NORMALIZE: Record<string, string> = {
      'וועד בית': 'ועד בית',
      'תשתית אינטרנט': 'ספק אינטרנט',
      'תשתית אנטרנט': 'ספק אינטרנט',
      'בי"ס- תשלומים קבועים': 'בי"ס - תשלומים קבועים',
      'subscriptions - מנוי': 'מנויים',
      'מנויים (subscriptions)': 'מנויים',
      'הוצאות חג ': 'הוצאות חג',
      'ארוחות צהריים ( עבודה)': 'ארוחות צהריים (עבודה)',
      'ביטוח לאומי': 'הוצאות לא מתוכננות',
      'שכירות': 'הכנסה משכירות',
      'אחר-הכנסה': 'הכנסות מזדמנות',
      'אחר-קבוע': 'הוצאות לא מתוכננות',
      'אחר-משתנה': 'הוצאות לא מתוכננות',
      'הפקדות עצמאי': 'חסכונות',
      'מנוי מפעל הפיס': 'מנויים',
      'תמי4/נספרסו': 'מנויים',
      'קוסמטיקה טיפולים': 'קוסמטיקה',
      'קוסמטיקה מוצרים': 'קוסמטיקה',
    };
    if (NORMALIZE[name]) name = NORMALIZE[name];

    if (name === "הכנסות") { currentSection = "income"; continue; }
    if (name === "הוצאות קבועות") { currentSection = "expense_fixed"; continue; }
    if (name === "הוצאות משתנות") { currentSection = "expense_variable"; continue; }

    scenarioNames.forEach((sName, idx) => {
      const val = r[2 + idx];
      const amount = val !== null && val !== undefined ? parseFloat(String(val)) : 0;
      if (!isNaN(amount)) {
        const key = currentSection + '::' + name;
        results[sName][key] = { amount, type: currentSection, displayName: name };
      }
    });
  }

  return { scenarioNames, results };
}

// ── budget_type → item_type mapping ──────────────────────────────────────────
function budgetTypeToItemType(budget_type: string): ItemType {
  if (budget_type === "הכנסה") return "income";
  if (budget_type === "קבוע")  return "expense_fixed";
  return "expense_variable";
}

// ── רכיב ראשי ────────────────────────────────────────────────────────────────
export default function ScenarioTab({ client }: ScenarioTabProps) {
  const [scenarios, setScenarios]         = useState<ScenarioRow[]>([]);
  const [activeScenario, setActiveScenario] = useState<ActiveScenario | null>(null);
  const [loading, setLoading]             = useState(true);
  const [view, setView]                   = useState<"list" | "upload" | "activate">("list");
  const [msg, setMsg]                     = useState("");
  const [selectedScenario, setSelectedScenario] = useState<ScenarioRow | null>(null);
  const [activeFrom, setActiveFrom]       = useState("");
  const [activeTo, setActiveTo]           = useState("");
  // Dynamic category list — global + personal for this client
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const [showActivateReminder, setShowActivateReminder] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from("categories")
      .select("name")
      .eq("is_active", true)
      .or(`client_id.is.null,client_id.eq.${client.id}`)
      .order("sort_order", { ascending: true });
    setKnownCategories((data || []).map((r: any) => r.name));
  }, [client.id]);

  useEffect(() => { loadData(); loadCategories(); }, [client.id]); // eslint-disable-line

  const loadData = async () => {
    setLoading(true);
    const [{ data: sc }, { data: ac }] = await Promise.all([
      supabase.from("scenarios").select("*").eq("client_id", client.id).order("uploaded_at", { ascending: false }),
      supabase.from("active_scenario").select("*, scenarios(name)").eq("client_id", client.id).maybeSingle(),
    ]);
    setScenarios((sc || []) as ScenarioRow[]);
    setActiveScenario((ac as ActiveScenario | null) || null);
    setLoading(false);
  };

  // ── העלאת קובץ — ייבוא ישיר ללא שלב מיפוי ────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const { scenarioNames, results } = parseScenarioExcel(buf);
      showMsg("שומר...");

      // get max sort_order once
      const { data: maxOrdRow } = await supabase
        .from("categories").select("sort_order").is("client_id", null)
        .order("sort_order", { ascending: false }).limit(1).maybeSingle();
      let nextOrder: number = ((maxOrdRow as any)?.sort_order || 1000) + 10;

      // ensure every category in the Excel exists in DB (global or personal)
      const knownSet = new Set(knownCategories);
      const seenNames = new Map<string, ItemType>();
      Object.values(results).forEach(scenarioItems => {
        Object.values(scenarioItems).forEach(({ displayName, type }) => {
          if (displayName && !seenNames.has(displayName)) seenNames.set(displayName, type);
        });
      });
      for (const [name, type] of seenNames.entries()) {
        if (!knownSet.has(name)) {
          const budgetType = type === "income" ? "הכנסה" : type === "expense_fixed" ? "קבוע" : "משתנה";
          await supabase.from("categories").insert([{
            name,
            section: "⭐ הקטגוריות שלי",
            budget_type: budgetType,
            client_id: Number(client.id),
            is_active: true,
            is_ignored: false,
            sort_order: nextOrder,
            keywords: [],
            max_hints: [],
          }]);
          nextOrder += 10;
          knownSet.add(name); // avoid duplicate inserts within same upload
        }
      }

      // insert all scenarios + items
      for (const sName of scenarioNames) {
        const { data: sc, error } = await supabase
          .from("scenarios").insert([{ client_id: client.id, name: sName }])
          .select().single();
        if (error) { showMsg("❌ שגיאה: " + error.message); return; }

        const items: any[] = [];
        let order = 0;
        Object.entries(results[sName]).forEach(([, { amount, type, displayName }]) => {
          if (!displayName) return;
          items.push({
            scenario_id: (sc as any).id,
            client_id: client.id,
            category_name: displayName,
            amount,
            item_type: type,
            sort_order: order++,
          });
        });
        if (items.length > 0) await supabase.from("scenario_items").insert(items);
      }

      await loadCategories();
      await loadData();
      setShowActivateReminder(true);
    } catch (err: any) {
      showMsg("❌ שגיאה בקריאת הקובץ: " + err.message);
    }
    e.target.value = "";
  };

  // ── הפעלת תסריט ────────────────────────────────────────────────────────────
  const activateScenario = async () => {
    if (!selectedScenario || !activeFrom) return;
    await supabase.from("active_scenario").insert([{
      client_id: client.id,
      scenario_id: selectedScenario.id,
      active_from: activeFrom,
      active_until: activeTo || null,
      activated_at: new Date().toISOString(),
    }]);
    showMsg("✅ תסריט הופעל" + (activeTo ? ` מ-${activeFrom} עד ${activeTo}` : ` מ-${activeFrom}`));
    setActiveTo("");
    setView("list");
    await loadData();
  };

  // ── מחיקת תסריט ────────────────────────────────────────────────────────────
  const deleteScenario = async (sc: ScenarioRow) => {
    if (!window.confirm(`למחוק את התסריט "${sc.name}"?`)) return;
    await supabase.from("scenario_items").delete().eq("scenario_id", sc.id);
    await supabase.from("scenarios").delete().eq("id", sc.id);
    showMsg("✅ תסריט נמחק");
    await loadData();
  };

  if (loading) return <div style={{ color: "var(--text-dim)", padding: 32 }}>טוען...</div>;

  // תסריט פעיל תקף = קיים ומצביע לתסריט ברשימה
  const activeScenarioValid = activeScenario && scenarios.some(s => s.id === activeScenario.scenario_id);

  if (view === "list") return (
    <div>
      {msg && <MsgBar msg={msg} />}

      {/* באנר תזכורת לאחר העלאה */}
      {showActivateReminder && (
        <div style={{ marginBottom: 16, background: "rgba(251,191,36,0.12)", border: "2px solid rgba(251,191,36,0.5)", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--gold)", marginBottom: 4 }}>⚠️ חשוב — יש לבחור תסריט פעיל</div>
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>התסריטים יובאו בהצלחה. כדי שהנתונים יופיעו בבקרת התיק הכלכלי יש לבחור תסריט פעיל.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Btn size="sm" onClick={() => { setShowActivateReminder(false); setView("activate"); }}>בחר תסריט עכשיו</Btn>
            <button onClick={() => setShowActivateReminder(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-dim)" }}>✕</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {activeScenarioValid && (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              פעיל: <strong style={{ color: "var(--green-deep)" }}>{activeScenario!.scenarios?.name}</strong>
              <span style={{ marginRight: 6 }}>מ-{activeScenario!.active_from}</span>
            </div>
          )}
          {scenarios.length > 0 && (
            <Btn size="sm"
              variant={activeScenarioValid ? "secondary" : "primary"}
              style={!activeScenarioValid ? { background: "var(--red)", boxShadow: "0 4px 16px rgba(229,57,53,0.3)", animation: "pulse 2s infinite" } : undefined}
              onClick={() => setView("activate")}>
              {activeScenarioValid ? "שנה תסריט פעיל" : "⚠️ יש לבחור תסריט פעיל!"}
            </Btn>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm" onClick={() => fileRef.current?.click()}>⬆️ ייבא מ-Excel</Btn>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleFile} />
        </div>
      </div>

      {scenarios.length === 0 ? (
        <Card style={{ textAlign: "center", padding: 48, color: "var(--text-dim)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div>עוד לא יובאו תסריטים ללקוח זה</div>
        </Card>
      ) : (
        <ScenarioTableView
          scenarios={scenarios}
          activeScenarioId={activeScenario?.scenario_id}
          clientId={client.id}
          onDelete={deleteScenario}
          onActivated={loadData}
          onDeleteMultiple={async (ids: string[]) => {
            if (!window.confirm(`למחוק ${ids.length} תסריטים?`)) return;
            for (const id of ids) {
              await supabase.from("scenario_items").delete().eq("scenario_id", id);
              await supabase.from("scenarios").delete().eq("id", id);
            }
            showMsg(`✅ ${ids.length} תסריטים נמחקו`);
            await loadData();
          }}
        />
      )}
    </div>
  );


  if (view === "activate") return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Btn variant="ghost" size="sm" onClick={() => setView("list")}>← חזור</Btn>
        <div style={{ fontWeight: 700, fontSize: 16 }}>בחר תסריט פעיל</div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 16 }}>בחר תסריט</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {scenarios.map(sc => (
            <div
              key={sc.id}
              onClick={() => setSelectedScenario(sc)}
              style={{ padding: "12px 16px", borderRadius: 10, border: `2px solid ${selectedScenario?.id === sc.id ? "var(--green-mid)" : "var(--border)"}`, background: selectedScenario?.id === sc.id ? "var(--green-mint)" : "var(--surface2)", cursor: "pointer" }}
            >
              <div style={{ fontWeight: 600 }}>{sc.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{new Date(sc.uploaded_at).toLocaleDateString("he-IL")}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>מתאריך *</div>
            <input type="date" value={activeFrom} onChange={e => setActiveFrom(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>עד תאריך <span style={{ fontWeight: 400 }}>(אופציונלי)</span></div>
            <input type="date" value={activeTo} min={activeFrom || undefined} onChange={e => setActiveTo(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 20 }}>
          החודשים הקודמים ישמרו לפי התסריט הישן. אם לא תוגדר תאריך סיום התסריט יהיה פעיל ללא הגבלה.
        </div>

        <Btn onClick={activateScenario} disabled={!selectedScenario || !activeFrom}>✅ הפעל תסריט</Btn>
      </Card>
    </div>
  );

  return null;
}

// ════════════════════════════════════════════════════════════════
// ScenarioTableView
// ════════════════════════════════════════════════════════════════
interface ScenarioTableViewProps {
  scenarios: ScenarioRow[];
  activeScenarioId?: string;
  clientId: string;
  onDelete: (sc: ScenarioRow) => Promise<void>;
  onDeleteMultiple: (ids: string[]) => Promise<void>;
  onActivated: () => Promise<void>;
}

function ScenarioTableView({ scenarios, activeScenarioId, clientId, onDelete, onDeleteMultiple, onActivated }: ScenarioTableViewProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(activeScenarioId || scenarios[0]?.id);
  const [items, setItems] = useState<ScenarioItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [activateModal, setActivateModal] = useState<ScenarioRow | null>(null);
  const [activeFrom, setActiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    supabase.from("scenario_items")
      .select("*").eq("scenario_id", selectedId).order("sort_order")
      .then(({ data }) => { setItems((data || []) as ScenarioItemRow[]); setLoading(false); });
  }, [selectedId]);

  const toggleCheck = (id: string) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const checkedIds  = Object.entries(checked).filter(([,v]) => v).map(([k]) => k);
  const allChecked  = scenarios.length > 0 && scenarios.every(sc => checked[sc.id]);

  const income   = items.filter(i => i.item_type === "income");
  const fixed    = items.filter(i => i.item_type === "expense_fixed");
  const variable = items.filter(i => i.item_type === "expense_variable");
  const totalIn  = income.reduce((s, i) => s + Number(i.amount || 0), 0);
  const totalOut = [...fixed, ...variable].reduce((s, i) => s + Number(i.amount || 0), 0);
  const balance  = totalIn - totalOut;

  const handleActivate = async () => {
    if (!activateModal) return;
    setActivating(true);
    await supabase.from("active_scenario").insert([{
      client_id: clientId,
      scenario_id: activateModal.id,
      active_from: activeFrom,
      active_until: null,
      activated_at: new Date().toISOString(),
    }]);
    setActivating(false);
    setActivateModal(null);
    await onActivated();
  };

  return (
    <div>
      {/* מודל הפעלת תסריט */}
      {activateModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setActivateModal(null)}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 32, minWidth: 340, maxWidth: 420, boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>הפעל תסריט</div>
            <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>
              האם להפוך את <strong style={{ color: "var(--text)" }}>{activateModal.name}</strong> לתסריט הפעיל?
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6, fontWeight: 600 }}>מתאריך</div>
              <input type="date" value={activeFrom} onChange={e => setActiveFrom(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={handleActivate} disabled={activating || !activeFrom}>
                {activating ? "מפעיל..." : "✅ הפעל"}
              </Btn>
              <Btn variant="ghost" onClick={() => setActivateModal(null)}>ביטול</Btn>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {deleteMode ? (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", cursor: "pointer", userSelect: "none" }}>
              <input type="checkbox" checked={allChecked}
                onChange={() => {
                  if (allChecked) setChecked({});
                  else setChecked(Object.fromEntries(scenarios.map(sc => [sc.id, true])));
                }} />
              בחר הכל
            </label>
            {scenarios.map(sc => (
              <label key={sc.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", userSelect: "none", fontFamily: "inherit", border: `2px solid ${checked[sc.id] ? "var(--red)" : "var(--border)"}`, background: checked[sc.id] ? "rgba(192,57,43,0.08)" : "var(--surface2)", color: checked[sc.id] ? "var(--red)" : "var(--text-mid)" }}>
                <input type="checkbox" style={{ accentColor: "var(--red)" }} checked={!!checked[sc.id]} onChange={() => toggleCheck(sc.id)} />
                {sc.name}
              </label>
            ))}
            <button
              disabled={checkedIds.length === 0}
              onClick={() => onDeleteMultiple(checkedIds).then(() => { setDeleteMode(false); setChecked({}); })}
              style={{ padding: "7px 16px", borderRadius: 20, fontSize: 12, cursor: checkedIds.length ? "pointer" : "default", fontFamily: "inherit", fontWeight: 700, border: "none", background: checkedIds.length ? "var(--red)" : "var(--surface2)", color: checkedIds.length ? "#fff" : "var(--text-dim)", opacity: checkedIds.length ? 1 : 0.5 }}>
              🗑 מחק נבחרים ({checkedIds.length})
            </button>
            <button onClick={() => { setDeleteMode(false); setChecked({}); }}
              style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--border)", background: "transparent", color: "var(--text-dim)" }}>
              ביטול
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginLeft: 4, whiteSpace: "nowrap" }}>תסריט:</div>
            {scenarios.map(sc => {
              const isSelected = selectedId === sc.id;
              const isActive   = activeScenarioId === sc.id;
              return (
                <button key={sc.id} onClick={() => { setSelectedId(sc.id); setActivateModal(sc); }} style={{
                  padding: "7px 18px", borderRadius: 20, fontSize: 14,
                  fontWeight: isSelected ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
                  transition: "all 0.15s", position: "relative",
                  border: `2px solid ${isActive ? "var(--green-mid)" : isSelected && activeScenarioId ? "#6b7280" : "var(--border)"}`,
                  background: isActive ? "var(--green-mid)" : isSelected && activeScenarioId ? "#6b7280" : "var(--surface2)",
                  color: (isActive || (isSelected && activeScenarioId)) ? "#fff" : "var(--text-mid)",
                }}>
                  {sc.name}
                  {isActive && (
                    <span style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", background: "var(--green-soft)", border: "2px solid var(--surface)" }} />
                  )}
                </button>
              );
            })}
            <button onClick={() => setDeleteMode(true)}
              style={{ marginRight: "auto", padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: "1px solid rgba(192,57,43,0.3)", background: "var(--red-light)", color: "var(--red)" }}>
              🗑 מחק תסריטים
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-dim)" }}>טוען...</div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "2px solid var(--border)" }}>
            {[
              { label: 'סה"כ הכנסות', val: totalIn, bg: "#f0faf2", color: "var(--green-deep)" },
              { label: 'סה"כ הוצאות', val: totalOut, bg: "#fff5f5", color: "var(--red)" },
              { label: "יתרה חודשית", val: balance, bg: balance >= 0 ? "#f0faf2" : "#fff5f5", color: balance >= 0 ? "var(--green-deep)" : "var(--red)" },
            ].map(k => (
              <div key={k.label} style={{ padding: "14px 20px", background: k.bg, textAlign: "center", borderLeft: "1px solid var(--border)" }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: k.color }}>₪{Math.round(k.val).toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 3 }}>{k.label}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowY: "auto", maxHeight: 520 }}>
            {[
              { title: "הכנסות", items: income, bg: "#f6fff8", titleBg: "#e8f5ec", titleColor: "var(--green-deep)" },
              { title: "הוצאות קבועות", items: fixed, bg: "var(--surface)", titleBg: "#eef2ff", titleColor: "#3730a3" },
              { title: "הוצאות משתנות", items: variable, bg: "var(--surface)", titleBg: "#fdf4ff", titleColor: "#7e22ce" },
            ].map(section => (
              <div key={section.title}>
                <div style={{ padding: "8px 20px", background: section.titleBg, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: section.titleColor }}>{section.title}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: section.titleColor }}>
                    ₪{Math.round(section.items.reduce((s, i) => s + Number(i.amount || 0), 0)).toLocaleString()}
                  </div>
                </div>
                {section.items.filter(i => Number(i.amount) > 0).map((item, idx) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 20px", background: idx % 2 === 0 ? section.bg : "var(--surface)", borderBottom: "1px solid var(--border)44" }}>
                    <span style={{ fontSize: 14, color: "var(--text-mid)" }}>{item.category_name}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", fontFamily: "'Fraunces', serif" }}>₪{Math.round(item.amount).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function MsgBar({ msg }: { msg: string }) {
  return (
    <div style={{ marginBottom: 16, background: msg.startsWith("✅") ? "var(--green-pale)" : "var(--red-light)", border: `1px solid ${msg.startsWith("✅") ? "var(--green-mint)" : "rgba(192,57,43,0.2)"}`, borderRadius: 10, padding: "10px 16px", fontSize: 14, color: msg.startsWith("✅") ? "var(--green-deep)" : "var(--red)" }}>
      {msg}
    </div>
  );
}
