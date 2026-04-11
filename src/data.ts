import type { Transaction, Conf } from './types';

// ── Fallback בזמן טעינת DB ────────────────────────────────────────────────────
// משמש רק ב-useCategories כ-fallback לפני שהנתונים נטענים
export const CATEGORIES: Record<string, string[]> = {
  "💰 הכנסות": ["הכנסה בן/ת זוג נטו","קצבת ילדים","הכנסה משכירות","הכנסה מההורים","תן ביס/סיבוס","הכנסות מזדמנות"],
  "🏠 דיור": ["שכר דירה","משכנתה","חשמל","ארנונה","גז","מים וביוב","וועד בית","מיסי יישוב","מוקד אבטחה","עוזרת בית","גינון"],
  "📱 תקשורת": ["טלפון נייד","טלפון קווי","ספק אינטרנט","תשתית אינטרנט","כבלים","עיתונים"],
  "🎓 חינוך וילדים": ["מעון","צהרון","בי\"ס - תשלומים קבועים","חוגים","שיעורי עזר","קיץ גדול וחומרי לימוד","אוניברסיטה","דמי כיס"],
  "🛡️ ביטוחים": ["קופ\"ח ביטוח משלים","ביטוח רפואי פרטי","ביטוח חיים","ביטוח דירה","ביטוח משכנתה","ביטוח רכב מקיף וחובה"],
  "🏦 הלוואות ומימון": ["החזרי הלוואות תלוש","החזרי הלוואות עו\"ש","חובות נוספים"],
  "💊 בריאות": ["תרופות כרוניות","טיפולי שיניים","פסיכולוג/הוראה מתקנת"],
  "🔧 רכב": ["טיפולים ורישוי"],
  "🎯 פנאי קבוע": ["מכון כושר"],
  "📲 מנויים": ["מנויים"],
  "💎 חיסכון": ["חסכונות"],
  "📌 שונות קבועות": ["מזונות"],
  "🛒 קניות ואוכל": ["סופר (אוכל)","פארם","אוכל בחוץ (כולל משלוחים)","ארוחות צהריים (עבודה)","מוצרים לבית","טיטולים ומוצרים לתינוק","חיות מחמד","סיגריות"],
  "💅 טיפוח ויופי": ["קוסמטיקה","מספרה","ביגוד והנעלה"],
  "🎭 תרבות ופנאי": ["בילויים","נסיעות וחופשות","הוצאות חג","מתנות לאירועים","ימי הולדת שלנו"],
  "👶 ילדים - הוצאות משתנות": ["ספרים וצעצועים","שמרטף"],
  "🚗 רכב ותחבורה": ["דלק","חניה (כולל כביש 6)","תחבורה ציבורית"],
  "🏧 בנק": ["ריבית חובה בבנק","עמלות בנק וכרטיסי אשראי"],
  "🔄 שונות": ["תרומות ומעשרות","מזומן ללא מעקב","הוצאות לא מתוכננות"],
  "🚫 להתעלם": ["להתעלם"],
};

// Categories that should NOT be summed in totals — fallback בלבד, DB מחזיר ignoredCats
export const IGNORED_CATEGORIES: Set<string> = new Set(["להתעלם"]);

// Detect bank account (עו"ש) files by filename
export function isBankFile(fileName: string): boolean {
  const name = (fileName || "").toLowerCase();
  return name.includes("עוש") || name.includes("עו_ש") || name.includes("bank") ||
    name.includes("account") || name.includes("חשבון") || name.includes("leumi") ||
    name.includes("hapoalim") || name.includes("mizrahi") || name.includes("discount");
}

// Rule shape — נטען מה-DB ומועבר לפונקציות הסיווג
export interface CategoryRule {
  name: string;
  keywords: string[];
  max_hints: string[];
}

// סיווג תנועה לפי rules מה-DB
// rules = מערך ה-CategoryRule שנטען ב-useCategories
// fallback: "הוצאות לא מתוכננות" כשאין התאמה
export function classifyTx(
  name: string,
  maxCat: string,
  rememberedMappings: Record<string, string> = {},
  rules: CategoryRule[] = [],
): { cat: string; conf: Conf } {
  if (rememberedMappings[name]) return { cat: rememberedMappings[name], conf: "high" };
  const nl = (name || "").toLowerCase();
  // חפש לפי keywords (conf: high)
  for (const rule of rules) {
    if (rule.keywords.some(kw => nl.includes(kw.toLowerCase()))) {
      return { cat: rule.name, conf: "high" };
    }
  }
  // חפש לפי max_hints (conf: med)
  if (maxCat) {
    for (const rule of rules) {
      if (rule.max_hints.some(h => h === maxCat)) {
        return { cat: rule.name, conf: "med" };
      }
    }
  }
  return { cat: "הוצאות לא מתוכננות", conf: "low" };
}

export function parseExcelData(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  rememberedMappings: Record<string, string> = {},
  rules: CategoryRule[] = [],
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
      const classified = classifyTx(name, maxCat, rememberedMappings, rules);
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

// ── PDF Bank Statement Parser ──────────────────────────────────────────────────
// Supports all major Israeli banks: Mizrahi, Hapoalim, Leumi, Discount, Beinleumi
// Uses pdfjs-dist loaded via CDN as window.pdfjsLib

// Column aliases ordered: more specific first (to prevent partial matches)
const PDF_COL_FIELDS = ['dateValue','date','name','amount','credit','debit','balance','reference'] as const;
type PdfColField = typeof PDF_COL_FIELDS[number];

const PDF_COL_ALIASES: Record<PdfColField, string[]> = {
  dateValue: ['תאריך ערך', 'ת. ערך', 'ת.ערך'],
  date:      ['תאריך ביצוע', 'תאריך פעולה', 'ת. ביצוע', 'תאריך'],
  name:      ['סוג תנועה', 'פירוט', 'תיאור פעולה', 'תיאור העסקה', 'תאור הפעולה', 'תיאור', 'פרטים', 'פרטי הפעולה'],
  amount:    ['זכות/חובה', 'סכום בש"ח', 'סכום פעולה', 'סכום'],
  credit:    ['זכות', 'זיכוי'],
  debit:     ['חובה', 'חיוב'],
  balance:   ['יתרה לאחר פעולה', 'יתרה נוכחית', 'יתרה בש"ח', 'יתרה'],
  reference: ['אסמכתה', 'אסמכתא', 'מספר מסמך', "מס' מסמך", 'מסמך'],
};

// Rows to skip (headers, summaries, footnotes)
const PDF_SKIP_RE = [
  /יתרה קודמת/,
  /יתרה פתיחה/,
  /סך הכל/,
  /ימים אחרונים/,
  /תנועות בחשבון/,
  /חשבון מספר/,
  /בוצעה בתאריך/,
  /^\*?\(י\)/,
  /^\*?\(פ\)/,
];

const PDF_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

// Detects credit-card payment rows in a bank statement — these are transfers, not real expenses
export const CREDIT_TRANSFER_RE = new RegExp(
  [
    'ישראכרט',
    'ויזה\\s+כ[\\. ]*א[\\. ]*ל',
    'ויזה\\s+כ[\\. ]*ל[\\. ]*ב',
    'כ[\\. ]*א[\\. ]*ל\\b',
    'לאומי[\\s\\-]*קארד',
    'לאומיקארד',
    'מסטרקארד',
    'mastercard',
    'max\\s+it',
    'מקס\\s+איט',
    'מקס\\s+כרטיסי',
    'אמריקן\\s+אקספרס',
    'american\\s+express',
    'דיינרס',
    'diners',
    'חיוב\\s+כרטיס',
  ].join('|'),
  'i'
);

interface PdfItem { text: string; x: number; y: number; page: number }
type ColMap = Partial<Record<PdfColField, number>>;

function _pdfParseAmount(s: string): number {
  if (!s) return NaN;
  const clean = s.replace(/[₪$€\s\u00a0]/g, '').replace(/,/g, '');
  const trailingMinus = clean.endsWith('-');
  const val = parseFloat(trailingMinus ? clean.slice(0, -1) : clean);
  return trailingMinus ? -val : val;
}

function _pdfGroupRows(items: PdfItem[], tol = 5): PdfItem[][] {
  const sorted = [...items].sort((a, b) =>
    a.page !== b.page ? a.page - b.page :
    b.y !== a.y ? b.y - a.y : b.x - a.x
  );
  const rows: PdfItem[][] = [];
  let cur: PdfItem[] = [], curY = Infinity, curPage = -1;
  for (const it of sorted) {
    if (it.page !== curPage || Math.abs(it.y - curY) > tol) {
      if (cur.length) rows.push(cur);
      cur = [it]; curY = it.y; curPage = it.page;
    } else {
      cur.push(it);
      curY = (curY * (cur.length - 1) + it.y) / cur.length;
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function _pdfDetectHeader(rows: PdfItem[][]): { rowIdx: number; colMap: ColMap } | null {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const rowText = rows[i].map(it => it.text).join(' ');
    const hasDate = PDF_COL_ALIASES.date.some(a => rowText.includes(a)) ||
                    PDF_COL_ALIASES.dateValue.some(a => rowText.includes(a));
    const hasName = PDF_COL_ALIASES.name.some(a => rowText.includes(a));
    if (!hasDate || !hasName) continue;

    const colMap: ColMap = {};
    for (const it of rows[i]) {
      // Check fields in priority order — stops at first match to avoid "תאריך ערך" matching "תאריך"
      for (const field of PDF_COL_FIELDS) {
        if (colMap[field] !== undefined) continue; // already found
        if (PDF_COL_ALIASES[field].some(a => it.text.includes(a))) {
          colMap[field] = it.x;
          break;
        }
      }
    }
    if (Object.keys(colMap).length >= 2) return { rowIdx: i, colMap };
  }
  return null;
}

function _pdfAssignField(x: number, colMap: ColMap): PdfColField | null {
  let best: PdfColField | null = null, bestDist = 80; // max 80pt tolerance
  for (const field of PDF_COL_FIELDS) {
    if (colMap[field] === undefined) continue;
    const d = Math.abs(x - colMap[field]!);
    if (d < bestDist) { best = field; bestDist = d; }
  }
  return best;
}

export async function parseBankPDF(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  rememberedMappings: Record<string, string> = {},
  rules: CategoryRule[] = [],
): Promise<Transaction[]> {
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib) throw new Error('ספריית PDF לא נטענה — נסה לרענן את הדף');

  // Extract text items from all pages
  let doc: any;
  try {
    doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  } catch (e: any) {
    throw new Error('לא ניתן לפתוח את ה-PDF — ייתכן שהוא מוגן בסיסמה');
  }

  const rawItems: PdfItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    for (const it of tc.items as any[]) {
      const text = ((it.str as string) || '').replace(/\(י\)|\(פ\)/g, '').trim();
      if (!text) continue;
      rawItems.push({ text, x: Math.round(it.transform[4]), y: Math.round(it.transform[5]), page: p });
    }
  }

  const rows = _pdfGroupRows(rawItems, 5);
  const header = _pdfDetectHeader(rows);
  if (!header) throw new Error('לא זוהתה טבלת תנועות — ייתכן שפורמט הבנק אינו נתמך עדיין');

  const { rowIdx, colMap } = header;
  const hasSeparate = colMap.credit !== undefined && colMap.debit !== undefined;
  const results: Transaction[] = [];

  for (let i = rowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const rowJoined = row.map(r => r.text).join(' ');
    if (rowJoined.trim().length < 2) continue;
    if (PDF_SKIP_RE.some(re => re.test(rowJoined))) continue;

    // Assign items to columns
    const fields: Partial<Record<PdfColField, string>> = {};
    for (const it of row) {
      const f = _pdfAssignField(it.x, colMap);
      if (f) fields[f] = fields[f] ? fields[f] + ' ' + it.text : it.text;
    }

    // Date (required)
    const dateStr = (fields.date || '').trim();
    if (!dateStr || !PDF_DATE_RE.test(dateStr)) continue;

    // Name (required)
    const name = (fields.name || '').trim();
    if (!name) continue;

    // Amount
    let amount = 0, isCredit = false;
    if (!hasSeparate) {
      const raw = _pdfParseAmount(fields.amount || '');
      if (isNaN(raw) || raw === 0) continue;
      isCredit = raw > 0;
      amount = Math.abs(raw);
    } else {
      const cr = _pdfParseAmount(fields.credit || '');
      const dr = _pdfParseAmount(fields.debit  || '');
      if (!isNaN(cr) && cr > 0)      { isCredit = true;  amount = cr; }
      else if (!isNaN(dr) && dr > 0) { isCredit = false; amount = dr; }
      else continue;
    }

    // Classify
    const hint = isCredit ? 'הכנסות' : '';
    const cl = classifyTx(name, hint, rememberedMappings, rules);
    // Income with no matching rule → "הכנסות מזדמנות" (not "הוצאות לא מתוכננות")
    const cat = (isCredit && cl.cat === 'הוצאות לא מתוכננות') ? 'הכנסות מזדמנות' : cl.cat;
    const conf = (isCredit && cl.cat === 'הוצאות לא מתוכננות') ? 'med' as const : cl.conf;

    const flow_type = (!isCredit && CREDIT_TRANSFER_RE.test(name))
      ? "credit_transfer" as const
      : "expense" as const;

    results.push({
      id: results.length, date: dateStr, name,
      maxCat: hint, amount,
      cat, conf, originalCat: cat,
      edited: false, source: fileName,
      flow_type,
    });
  }

  if (results.length === 0)
    throw new Error('לא נמצאו תנועות ב-PDF — בדוק שהקובץ הוא דף חשבון בנק');
  return results;
}

export function assignBillingMonth(dateStr: string | null | undefined, cycleStartDay: number): string | null {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  let day: number, month: number, year: number;
  if (s.includes('/')) {
    const p = s.split('/');
    day = +p[0]; month = +p[1]; year = +p[2];
    if (year < 100) year += 2000; // תמוך בשנה דו-ספרתית (24 → 2024)
  } else {
    const p = s.split('-');
    year = +p[0]; month = +p[1]; day = +p[2];
  }
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const sd = (!cycleStartDay || cycleStartDay < 1 || cycleStartDay > 31) ? 1 : cycleStartDay;
  if (day >= sd) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}
