import { useState, useEffect, useRef } from "react";
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

// ── כל הסעיפים הקיימים באפליקציה ──────────────────────────────────────────
const KNOWN_CATEGORIES: string[] = [
  // הכנסות
  "הכנסה בן/ת זוג נטו","קצבת ילדים","שכירות","הכנסה מההורים","תן ביס/סיבוס","אחר-הכנסה",
  // דיור
  "שכר דירה","משכנתה","חשמל","ארנונה","גז","מים וביוב","ועד בית","מיסי יישוב","מוקד אבטחה","עוזרת בית","גינון",
  // תקשורת
  "טלפון נייד","טלפון קווי","תשתית אינטרנט","ספק אינטרנט","כבלים","עיתונים",
  // חינוך
  "מעון","צהרון","בי\"ס - תשלומים קבועים","חוגים","שיעורי עזר","פסיכולוג/הוראה מתקנת","אוניברסיטה","ספרים וצעצועים","דמי כיס","שמרטף",
  // ביטוחים
  "קופ\"ח ביטוח משלים","ביטוח רפואי פרטי","ביטוח חיים","ביטוח דירה","ביטוח משכנתה","ביטוח רכב מקיף וחובה",
  // רכב
  "דלק","טיפולים ורישוי","חניה (כולל כביש 6)","תחבורה ציבורית",
  // הלוואות
  "החזרי הלוואות תלוש","החזרי הלוואות עו\"ש","חובות נוספים","ריבית חובה בבנק","עמלות בנק וכרטיסי אשראי",
  // בריאות
  "תרופות כרוניות","טיפולי שיניים",
  // קניות
  "סופר (אוכל)","פארם","אוכל בחוץ (כולל משלוחים)","ארוחות צהריים (עבודה)","חיות מחמד","טיטולים ומוצרים לתינוק","סיגריות","מוצרים לבית",
  // טיפוח
  "קוסמטיקה טיפולים","קוסמטיקה מוצרים","מספרה","ביגוד והנעלה",
  // פנאי
  "בילויים","מכון כושר","נסיעות וחופשות","הוצאות חג","מנויים (subscriptions)","מתנות לאירועים","ימי הולדת שלנו",
  // חיסכון
  "הפקדות עצמאי","חסכונות",
  // שונות
  "תרומות ומעשרות","מנוי מפעל הפיס","תמי4/נספרסו","מזונות","מזומן ללא מעקב","הוצאות לא מתוכננות","אחר-קבוע","אחר-משתנה",
  // להתעלם
  "להתעלם",
];

// ── הגדרת סוג סעיף לפי שם ─────────────────────────────────────────────────
function guessItemType(name: string): ItemType {
  const income = ["הכנסה","קצבת","שכירות","תן ביס","שכר","ליווי","SQL","תיכון","אמא","מירי","מתנות והכנסות"];
  const fixed  = ["טלפון","אינטרנט","כבלים","חשמל","ארנונה","גז","מים","שכר דירה","משכנתה","ועד","מיסי","ביטוח","הלוואות","החזרי","חסכונות","הפקדות","מעון","צהרון","בי\"ס","חוגים"];
  if (income.some(k => name.includes(k))) return "income";
  if (fixed.some(k  => name.includes(k))) return "expense_fixed";
  return "expense_variable";
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
      'תשתית אנטרנט': 'תשתית אינטרנט',
      'בי"ס- תשלומים קבועים': 'בי"ס - תשלומים קבועים',
      'subscriptions - מנוי': 'מנויים (subscriptions)',
      'הוצאות חג ': 'הוצאות חג',
      'ארוחות צהריים ( עבודה)': 'ארוחות צהריים (עבודה)',
      'ביטוח לאומי': 'אחר-קבוע',
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

// ── רכיב ראשי ────────────────────────────────────────────────────────────────
export default function ScenarioTab({ client }: ScenarioTabProps) {
  const [scenarios, setScenarios]         = useState<ScenarioRow[]>([]);
  const [activeScenario, setActiveScenario] = useState<ActiveScenario | null>(null);
  const [loading, setLoading]             = useState(true);
  const [view, setView]                   = useState<"list" | "upload" | "activate">("list");
  const [uploadResult, setUploadResult]   = useState<UploadResult | null>(null);
  const [unmapped, setUnmapped]           = useState<UnmappedItem[]>([]);
  const [checked, setChecked]             = useState<Record<string | number, boolean>>({});
  const [msg, setMsg]                     = useState("");
  const [selectedScenario, setSelectedScenario] = useState<ScenarioRow | null>(null);
  const [activeFrom, setActiveFrom]       = useState("");
  const [activeTo, setActiveTo]           = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };

  useEffect(() => { loadData(); }, [client.id]);

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

  // ── העלאת קובץ ─────────────────────────────────────────────────────────────
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const { scenarioNames, results } = parseScenarioExcel(buf);
      setUploadResult({ scenarioNames, results, fileName: file.name });
      setUnmapped([]);
      setView("upload");
    } catch (err: any) {
      showMsg("❌ שגיאה בקריאת הקובץ: " + err.message);
    }
    e.target.value = "";
  };

  // ── שמירת תסריטים לאחר מיפוי ──────────────────────────────────────────────
  const saveScenarios = async (unmappedOverride?: UnmappedItem[]) => {
    if (!uploadResult) return;
    const { scenarioNames, results } = uploadResult;
    const finalUnmapped = unmappedOverride || unmapped;

    const mapping: Record<string, string | null> = {};
    for (const u of finalUnmapped) {
      if (u.mappedTo === "__new__") {
        await supabase.from("client_categories").upsert(
          [{ client_id: client.id, name: u.name, item_type: u.type || "expense_variable" }],
          { onConflict: "client_id,name" }
        );
        mapping[u.name] = u.name;
      } else {
        mapping[u.name] = u.mappedTo || null;
      }
    }

    for (const sName of scenarioNames) {
      const { data: sc, error } = await supabase
        .from("scenarios")
        .insert([{ client_id: client.id, name: sName }])
        .select().single();
      if (error) { showMsg("❌ שגיאה: " + error.message); return; }

      const items: any[] = [];
      let order = 0;
      Object.entries(results[sName]).forEach(([key, { amount, type, displayName }]) => {
        const name = displayName || key;
        if (!name) return;
        items.push({
          scenario_id: (sc as any).id,
          client_id: client.id,
          category_name: name,
          amount,
          item_type: type,
          sort_order: order++,
        });
      });

      if (items.length > 0) {
        await supabase.from("scenario_items").insert(items);
      }
    }

    showMsg("✅ " + scenarioNames.length + " תסריטים יובאו בהצלחה");
    setView("list");
    setUploadResult(null);
    setUnmapped([]);
    setChecked({});
    await loadData();
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

  if (view === "list") return (
    <div>
      {msg && <MsgBar msg={msg} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {activeScenario && (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
              פעיל: <strong style={{ color: "var(--green-deep)" }}>{activeScenario.scenarios?.name}</strong>
              <span style={{ marginRight: 6 }}>מ-{activeScenario.active_from}</span>
            </div>
          )}
          <Btn size="sm" variant="secondary" onClick={() => setView("activate")}>שנה תסריט פעיל</Btn>
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

  if (view === "upload") {
    const allChecked = unmapped.length > 0 && unmapped.every((_, i) => checked[i]);
    const toggleAll = () => {
      if (allChecked) {
        setChecked({});
      } else {
        const all: Record<number, boolean> = {};
        unmapped.forEach((_, i) => { all[i] = true; });
        setChecked(all);
      }
    };

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <Btn variant="ghost" size="sm" onClick={() => { setView("list"); setUploadResult(null); setUnmapped([]); setChecked({}); }}>← חזור</Btn>
          <div style={{ fontWeight: 700, fontSize: 16 }}>ייבוא תסריטים</div>
        </div>

        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>תסריטים שנמצאו בקובץ</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {uploadResult?.scenarioNames.map(n => (
              <span key={n} style={{ background: "var(--green-mint)", color: "var(--green-deep)", borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 600 }}>{n}</span>
            ))}
          </div>
        </Card>

        {unmapped.length > 0 ? (
          <Card style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>סעיפים שלא זוהו אוטומטית</div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>שייך לסעיף קיים, הוסף כחדש, או דלג</div>
              </div>
              <button
                onClick={toggleAll}
                style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: allChecked ? "var(--green-mid)" : "var(--surface2)", color: allChecked ? "#fff" : "var(--text-mid)", border: `1px solid ${allChecked ? "var(--green-mid)" : "var(--border)"}` }}
              >
                {allChecked ? "✓ בטל הכל" : "☐ אשר הכל כחדש"}
              </button>
            </div>

            {unmapped.map((u, i) => (
              <div key={u.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "10px 14px", background: checked[i] ? "var(--green-pale)" : "var(--surface2)", borderRadius: 10, border: `1px solid ${checked[i] ? "var(--green-mint)" : "transparent"}`, transition: "all 0.15s" }}>
                <div
                  onClick={() => setChecked(p => ({ ...p, [i]: !p[i] }))}
                  style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${checked[i] ? "var(--green-mid)" : "var(--border)"}`, background: checked[i] ? "var(--green-mid)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}
                >
                  {checked[i] && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: checked[i] ? "var(--green-mid)" : "var(--text-dim)" }}>
                    {checked[i] ? "יוסף כסעיף חדש" : "לא נמצא בסעיפי המערכת"}
                  </div>
                </div>
                {!checked[i] && (
                  <select
                    value={u.mappedTo || ""}
                    onChange={e => {
                      const val = e.target.value;
                      setUnmapped(prev => prev.map((x, j) => j === i ? { ...x, mappedTo: val || null } : x));
                    }}
                    style={{ background: "var(--surface)", border: "1.5px solid var(--border)", borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "var(--text)", fontFamily: "inherit", minWidth: 200 }}
                  >
                    <option value="">— דלג על סעיף זה —</option>
                    {KNOWN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <Card style={{ marginBottom: 16, background: "var(--green-pale)", border: "1px solid var(--green-mint)" }}>
            <div style={{ color: "var(--green-deep)", fontSize: 14 }}>✅ כל הסעיפים זוהו אוטומטית</div>
          </Card>
        )}

        <Btn onClick={() => {
          const updated = unmapped.map((u, i) => checked[i] ? { ...u, mappedTo: "__new__" } : u);
          setUnmapped(updated);
          saveScenarios(updated);
        }}>💾 שמור תסריטים</Btn>
      </div>
    );
  }

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
}

function ScenarioTableView({ scenarios, activeScenarioId, clientId, onDelete, onDeleteMultiple }: ScenarioTableViewProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(activeScenarioId || scenarios[0]?.id);
  const [items, setItems] = useState<ScenarioItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

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

  return (
    <div>
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
            {scenarios.map(sc => (
              <button key={sc.id} onClick={() => setSelectedId(sc.id)} style={{ padding: "7px 18px", borderRadius: 20, fontSize: 14, fontWeight: selectedId === sc.id ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", position: "relative", border: `2px solid ${selectedId === sc.id ? "var(--green-mid)" : "var(--border)"}`, background: selectedId === sc.id ? "var(--green-mid)" : "var(--surface2)", color: selectedId === sc.id ? "#fff" : "var(--text-mid)" }}>
                {sc.name}
                {activeScenarioId === sc.id && (
                  <span style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", background: "var(--green-soft)", border: "2px solid var(--surface)" }} />
                )}
              </button>
            ))}
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
