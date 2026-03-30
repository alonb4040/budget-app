import type { Transaction, Conf } from './types';

export const CATEGORIES: Record<string, string[]> = {
  "💰 הכנסות": [
    "הכנסה בן/ת זוג נטו",
    "קצבת ילדים",
    "שכירות",
    "הכנסה מההורים",
    "תן ביס/סיבוס",
    "הכנסות מזדמנות",
    "אחר-הכנסה",
  ],
  "🏠 דיור": [
    "שכר דירה",
    "משכנתה",
    "חשמל",
    "ארנונה",
    "גז",
    "מים וביוב",
    "ועד בית",
    "מיסי יישוב",
    "מוקד אבטחה",
    "עוזרת בית",
    "גינון",
  ],
  "📱 תקשורת": [
    "טלפון נייד",
    "טלפון קווי",
    "תשתית אינטרנט",
    "ספק אינטרנט",
    "כבלים",
    "עיתונים",
  ],
  "🎓 חינוך וילדים": [
    "מעון",
    "צהרון",
    "בי\"ס - תשלומים קבועים",
    "חוגים",
    "שיעורי עזר",
    "קיץ גדול וחומרי לימוד",
    "פסיכולוג/הוראה מתקנת",
    "אוניברסיטה",
    "ספרים וצעצועים",
    "דמי כיס",
    "שמרטף",
  ],
  "🛡️ ביטוחים": [
    "קופ\"ח ביטוח משלים",
    "ביטוח רפואי פרטי",
    "ביטוח חיים",
    "ביטוח דירה",
    "ביטוח משכנתה",
    "ביטוח רכב מקיף וחובה",
  ],
  "🚗 רכב ותחבורה": [
    "דלק",
    "טיפולים ורישוי",
    "חניה (כולל כביש 6)",
    "תחבורה ציבורית",
  ],
  "🏦 הלוואות ומימון": [
    "החזרי הלוואות תלוש",
    "החזרי הלוואות עו\"ש",
    "חובות נוספים",
    "ריבית חובה בבנק",
    "עמלות בנק וכרטיסי אשראי",
  ],
  "💊 בריאות ורפואה": [
    "תרופות כרוניות",
    "טיפולי שיניים",
  ],
  "🛒 קניות ואוכל": [
    "סופר (אוכל)",
    "פארם",
    "אוכל בחוץ (כולל משלוחים)",
    "ארוחות צהריים (עבודה)",
    "חיות מחמד",
    "טיטולים ומוצרים לתינוק",
    "סיגריות",
    "מוצרים לבית",
  ],
  "💅 טיפוח ויופי": [
    "קוסמטיקה טיפולים",
    "קוסמטיקה מוצרים",
    "מספרה",
    "ביגוד והנעלה",
  ],
  "🎭 תרבות ופנאי": [
    "בילויים",
    "מכון כושר",
    "נסיעות וחופשות",
    "הוצאות חג",
    "מנויים (subscriptions)",
    "מתנות לאירועים",
    "ימי הולדת שלנו",
  ],
  "💎 חיסכון": [
    "הפקדות עצמאי",
    "חסכונות",
  ],
  "🔄 הוצאות שונות": [
    "תרומות ומעשרות",
    "מנוי מפעל הפיס",
    "תמי4/נספרסו",
    "מזונות",
    "מזומן ללא מעקב",
    "הוצאות לא מתוכננות",
    "אחר-קבוע",
    "אחר-משתנה",
  ],
  "🚫 להתעלם": [
    "להתעלם",
  ],
};

// Categories that should NOT be summed in totals
export const IGNORED_CATEGORIES: Set<string> = new Set(["להתעלם"]);

// Detect bank account (עו"ש) files by filename
export function isBankFile(fileName: string): boolean {
  const name = (fileName || "").toLowerCase();
  return name.includes("עוש") || name.includes("עו_ש") || name.includes("bank") ||
    name.includes("account") || name.includes("חשבון") || name.includes("leumi") ||
    name.includes("hapoalim") || name.includes("mizrahi") || name.includes("discount");
}

interface KeywordRule {
  kw: string[];
  cat: string;
  conf: Conf;
}

const KEYWORD_MAP: KeywordRule[] = [
  { kw: ["פרטנר","סלקום","הוט","bezeq","בזק","013","012","HOT MOBILE","partner","cellcom"], cat: "טלפון נייד", conf: "high" },
  { kw: ["נטוויז'ן","013 netvision","012 smile","bezeq international"], cat: "תשתית אינטרנט", conf: "high" },
  { kw: ["HOT TV","סלקום TV","yes "], cat: "כבלים", conf: "high" },
  { kw: ["חברת חשמל","iec","israel electric"], cat: "חשמל", conf: "high" },
  { kw: ["ארנונה","עיריית","עירייה"], cat: "ארנונה", conf: "high" },
  { kw: ["גז","אמישרגז","supergas"], cat: "גז", conf: "high" },
  { kw: ["מי אביבים","מי שרון","גיחון","מים"], cat: "מים וביוב", conf: "high" },
  { kw: ["מוקד","פרוטקטור","מגן","ADT"], cat: "מוקד אבטחה", conf: "high" },
  { kw: ["מגדל","הפניקס","הראל","כלל","מנורה","AIG","ביטוח","insurance"], cat: "ביטוח חיים", conf: "med" },
  { kw: ["ליברה"], cat: "ביטוח חיים", conf: "med" },
  { kw: ["קופת חולים","כללית","מכבי","מאוחדת"], cat: "קופ\"ח ביטוח משלים", conf: "high" },
  { kw: ["ביטוח רכב","ישיר","איילון","שלמה"], cat: "ביטוח רכב מקיף וחובה", conf: "high" },
  { kw: ["בית ספר","school","תיכון","בי\"ס"], cat: "בי\"ס - תשלומים קבועים", conf: "high" },
  { kw: ["מעון","צהרון"], cat: "צהרון", conf: "med" },
  { kw: ["אוניברסיטה","מכללה","technion","university"], cat: "אוניברסיטה", conf: "med" },
  { kw: ["רמי לוי","שופרסל","ויקטורי","מגה","אושר עד","יינות ביתן","AM:PM"], cat: "סופר (אוכל)", conf: "high" },
  { kw: ["סופר-פארם","super-pharm","פארמה"], cat: "פארם", conf: "high" },
  { kw: ["קפה","cafe","coffee","פיצה","מסעדה","restaurant","סושי","בורגר","burger","מקדונלד","KFC","ארומה","wolt","10bis","שיפודים","unicorner","פיס קפה","איזי קפה"], cat: "אוכל בחוץ (כולל משלוחים)", conf: "high" },
  { kw: ["דלק","סונול","פז","דור אלון","TEN "], cat: "דלק", conf: "high" },
  { kw: ["רב-פס","מטרופולין","egged","אגד","metro"], cat: "תחבורה ציבורית", conf: "high" },
  { kw: ["חניה","parking","city park"], cat: "חניה (כולל כביש 6)", conf: "high" },
  { kw: ["netflix","spotify","youtube","apple music","amazon prime","disney","נטפליקס"], cat: "מנויים (subscriptions)", conf: "high" },
  { kw: ["קולנוע","cinema","yes planet","רב חן","תאטרון"], cat: "בילויים", conf: "high" },
  { kw: ["כושר","gym","fitness","holmes place"], cat: "מכון כושר", conf: "high" },
  { kw: ["סטימצקי","צומת ספרים"], cat: "ספרים וצעצועים", conf: "high" },
  { kw: ["nike","adidas","zara","h&m","טקסטיל","fox","castro","נייקי"], cat: "ביגוד והנעלה", conf: "high" },
  { kw: ["עמלה","עמלות"], cat: "עמלות בנק וכרטיסי אשראי", conf: "med" },
  { kw: ["הלוואה","loan"], cat: "החזרי הלוואות עו\"ש", conf: "med" },
  { kw: ["כספומט","atm","מזומן"], cat: "מזומן ללא מעקב", conf: "high" },
  // עו"ש: חיובי כרטיס אשראי — להתעלם כדי לא לספור פעמיים
  { kw: ["חיוב כרטיס","חיוב ישראכרט","חיוב מקס","חיוב max","חיוב visa","חיוב כאל","חיוב לאומי קארד","העברה לאשראי","תשלום כרטיס"], cat: "להתעלם", conf: "high" },
  // הכנסות נפוצות
  { kw: ["משכורת","שכר","salary","זיכוי שכר","העברה נכנסת","זיכוי"], cat: "הכנסה בן/ת זוג נטו", conf: "med" },
  { kw: ["ביטוח לאומי","קצבת ילדים","דמי לידה","דמי אבטלה"], cat: "קצבת ילדים", conf: "high" },
  // צ'קים והעברות — ביטחון נמוך לסיווג ידני
  { kw: ["שיק","צ'ק","cheque","check"], cat: "אחר-משתנה", conf: "low" },
  { kw: ["העברה בנקאית","הוראת קבע"], cat: "אחר-קבוע", conf: "low" },
];

const MAX_CAT_HINTS: Record<string, { cat: string; conf: Conf }> = {
  "מזון וצריכה": { cat: "סופר (אוכל)", conf: "med" },
  "מסעדות, קפה וברים": { cat: "אוכל בחוץ (כולל משלוחים)", conf: "high" },
  "פנאי, בידור וספורט": { cat: "בילויים", conf: "med" },
  "ביטוח": { cat: "ביטוח חיים", conf: "med" },
  "שירותי תקשורת": { cat: "טלפון נייד", conf: "med" },
  "אופנה": { cat: "ביגוד והנעלה", conf: "high" },
  "עירייה וממשלה": { cat: "ארנונה", conf: "med" },
  "משיכת מזומן": { cat: "מזומן ללא מעקב", conf: "high" },
};

export function classifyTx(
  name: string,
  maxCat: string,
  rememberedMappings: Record<string, string> = {}
): { cat: string; conf: Conf } {
  if (rememberedMappings[name]) return { cat: rememberedMappings[name], conf: "high" };
  const nl = (name || "").toLowerCase();
  for (const rule of KEYWORD_MAP) {
    if (rule.kw.some(kw => nl.includes(kw.toLowerCase()))) return { cat: rule.cat, conf: rule.conf };
  }
  if (maxCat && MAX_CAT_HINTS[maxCat]) return MAX_CAT_HINTS[maxCat];
  return { cat: "אחר-משתנה", conf: "low" };
}

export function parseExcelData(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  rememberedMappings: Record<string, string> = {}
): Transaction[] {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("ספריית XLSX לא נטענה");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const results: Transaction[] = [];
  const VALID_SHEETS = ["עסקאות במועד החיוב","עסקאות שאושרו וטרם נקלטו","עסקאות חו\"ל ומט\"ח","עסקאות בחיוב מיידי"];
  wb.SheetNames.forEach(sheetName => {
    if (!VALID_SHEETS.includes(sheetName)) return;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as (unknown[])[];
    const hRow = rows.findIndex(r => (r as unknown[]).includes("תאריך עסקה") || String((r as unknown[])[0]).includes("תאריך עסקה"));
    if (hRow < 0) return;
    const headers = (rows[hRow] as unknown[]).map(h => String(h).trim());
    const dateIdx = headers.indexOf("תאריך עסקה");
    const nameIdx = headers.indexOf("שם בית העסק");
    const catIdx = headers.indexOf("קטגוריה");
    const amtIdx = headers.findIndex(h => h === "סכום חיוב");
    const origIdx = headers.findIndex(h => h === "סכום עסקה מקורי");
    for (let i = hRow + 1; i < rows.length; i++) {
      const row = rows[i] as unknown[];
      const name = String(row[nameIdx] || "").trim();
      if (!name || name === "סך הכל") continue;
      const amount = parseFloat(String(row[amtIdx] || row[origIdx] || "0").replace(/[^\d.-]/g, "")) || 0;
      if (amount === 0) continue;
      const maxCat = String(row[catIdx] || "").trim();
      const classified = classifyTx(name, maxCat, rememberedMappings);
      results.push({
        id: results.length, date: String(row[dateIdx] || "").trim(),
        name, maxCat, amount, cat: classified.cat,
        conf: classified.conf, originalCat: classified.cat,
        edited: false, source: fileName
      });
    }
  });
  return results;
}

// ── Shared constants & utilities used across multiple components ───────────────

export const HEBREW_MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

export function assignBillingMonth(dateStr: string | null | undefined, cycleStartDay: number): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  let day: number, month: number, year: number;
  if (s.includes('/')) {
    const p = s.split('/');
    day = +p[0]; month = +p[1]; year = +p[2];
  } else {
    const p = s.split('-');
    year = +p[0]; month = +p[1]; day = +p[2];
  }
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (day >= cycleStartDay) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}
