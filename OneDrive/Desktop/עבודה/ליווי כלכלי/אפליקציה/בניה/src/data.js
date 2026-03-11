export const CATEGORIES = {
  "הכנסות": ["הכנסה בן/ת זוג נטו","קצבת ילדים","שכירות","הכנסה מההורים","תן ביס/סיבוס","אחר-הכנסה"],
  "תקשורת": ["טלפון קווי","טלפון נייד","תשתית אינטרנט","ספק אינטרנט","כבלים","עיתונים"],
  "דיור": ["חשמל","ארנונה","גז","מים וביוב","שכר דירה","משכנתה","ועד בית","מיסי יישוב","מוקד אבטחה","עוזרת בית","גינון"],
  "חינוך וילדים": ["מעון","צהרון","בי\"ס - תשלומים קבועים","חוגים","שיעורי עזר","פסיכולוג/הוראה מתקנת","אוניברסיטה"],
  "ביטוחים": ["קופ\"ח ביטוח משלים","ביטוח רפואי פרטי","ביטוח חיים","ביטוח דירה","ביטוח משכנתה","ביטוח רכב מקיף וחובה"],
  "תחבורה קבועה": ["טיפולים ורישוי"],
  "החזרי הלוואות": ["החזרי הלוואות תלוש","החזרי הלוואות עו\"ש","חובות נוספים"],
  "חיסכון": ["הפקדות עצמאי","חסכונות"],
  "הוצאות קבועות שונות": ["תרומות ומעשרות","מנוי מפעל הפיס","מכון כושר","תמי4/נספרסו","מזונות","נסיעות וחופשות","הוצאות חג","קיץ גדול וחומרי לימוד","מוצרים לבית","הוצאות לא מתוכננות","מנויים (subscriptions)","אחר-קבוע"],
  "אוכל וקניות": ["סופר (אוכל)","פארם","חיות מחמד","טיטולים ומוצרים לתינוק","סיגריות"],
  "טיפוח ויופי": ["קוסמטיקה טיפולים","קוסמטיקה מוצרים","מספרה"],
  "הוצאות רפואיות": ["תרופות כרוניות","טיפולי שיניים"],
  "רכב ותחבורה": ["דלק","חניה (כולל כביש 6)","תחבורה ציבורית"],
  "עלויות מימון ובנק": ["ריבית חובה בבנק","עמלות בנק וכרטיסי אשראי"],
  "תרבות ופנאי": ["אוכל בחוץ (כולל משלוחים)","בילויים","מתנות לאירועים","ימי הולדת שלנו","ספרים וצעצועים","שמרטף","דמי כיס"],
  "שונות": ["ביגוד והנעלה","ארוחות צהריים (עבודה)","מזומן ללא מעקב","אחר-משתנה"]
};

const KEYWORD_MAP = [
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
];

const MAX_CAT_HINTS = {
  "מזון וצריכה": { cat: "סופר (אוכל)", conf: "med" },
  "מסעדות, קפה וברים": { cat: "אוכל בחוץ (כולל משלוחים)", conf: "high" },
  "פנאי, בידור וספורט": { cat: "בילויים", conf: "med" },
  "ביטוח": { cat: "ביטוח חיים", conf: "med" },
  "שירותי תקשורת": { cat: "טלפון נייד", conf: "med" },
  "אופנה": { cat: "ביגוד והנעלה", conf: "high" },
  "עירייה וממשלה": { cat: "ארנונה", conf: "med" },
  "משיכת מזומן": { cat: "מזומן ללא מעקב", conf: "high" },
};

export function classifyTx(name, maxCat, rememberedMappings = {}) {
  if (rememberedMappings[name]) return { cat: rememberedMappings[name], conf: "high" };
  const nl = (name || "").toLowerCase();
  for (const rule of KEYWORD_MAP) {
    if (rule.kw.some(kw => nl.includes(kw.toLowerCase()))) return { cat: rule.cat, conf: rule.conf };
  }
  if (maxCat && MAX_CAT_HINTS[maxCat]) return MAX_CAT_HINTS[maxCat];
  return { cat: "אחר-משתנה", conf: "low" };
}

export function parseExcelData(arrayBuffer, fileName, rememberedMappings = {}) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("ספריית XLSX לא נטענה");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const results = [];
  const VALID_SHEETS = ["עסקאות במועד החיוב","עסקאות שאושרו וטרם נקלטו","עסקאות חו\"ל ומט\"ח","עסקאות בחיוב מיידי"];
  wb.SheetNames.forEach(sheetName => {
    if (!VALID_SHEETS.includes(sheetName)) return;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const hRow = rows.findIndex(r => r.includes("תאריך עסקה") || String(r[0]).includes("תאריך עסקה"));
    if (hRow < 0) return;
    const headers = rows[hRow].map(h => String(h).trim());
    const dateIdx = headers.indexOf("תאריך עסקה");
    const nameIdx = headers.indexOf("שם בית העסק");
    const catIdx = headers.indexOf("קטגוריה");
    const amtIdx = headers.findIndex(h => h === "סכום חיוב");
    const origIdx = headers.findIndex(h => h === "סכום עסקה מקורי");
    for (let i = hRow + 1; i < rows.length; i++) {
      const row = rows[i];
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
