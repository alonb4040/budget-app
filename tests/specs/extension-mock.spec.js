// extension-mock.spec.js
// Tests the Max extension extraction logic against a local mock HTML page.
// The extraction function is copied verbatim from extension/src/background.js
// (the inline func inside the `extractNow` chrome.scripting.executeScript call, lines ~71-204)

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const MOCK_PAGE = path.resolve(__dirname, '../mock-max/index.html');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// The extraction function — copied VERBATIM from extension/src/background.js
// lines 71-204 (the func argument to chrome.scripting.executeScript for extractNow)
// ---------------------------------------------------------------------------
function extractionFunction() {
  var HEBREW_TO_NUM = {'ינואר':1,'פברואר':2,'מרץ':3,'אפריל':4,'מאי':5,'יוני':6,'יולי':7,'אוגוסט':8,'ספטמבר':9,'אוקטובר':10,'נובמבר':11,'דצמבר':12};
  var billingMonthKey = null;
  var maxBillingTotal = null;

  // ── חלץ חודש חיוב ─────────────────────────────────────────
  // אסטרטגיה 1: native <select> — קרא רק את ה-option הנבחר
  var hebrewMonths = Object.keys(HEBREW_TO_NUM);
  var nativeSelects = document.querySelectorAll('select');
  for (var si = 0; si < nativeSelects.length && !billingMonthKey; si++) {
    var sel = nativeSelects[si];
    var selectedOpt = sel.options && sel.options[sel.selectedIndex];
    var optText = selectedOpt ? (selectedOpt.textContent || selectedOpt.text || '') : '';
    for (var hi = 0; hi < hebrewMonths.length; hi++) {
      var hm = hebrewMonths[hi];
      var idx = optText.indexOf(hm);
      if (idx === -1) continue;
      var rest = optText.substring(idx + hm.length).trim();
      var yearMatch = rest.match(/^\d{4}/);
      if (yearMatch) {
        billingMonthKey = yearMatch[0] + '-' + String(HEBREW_TO_NUM[hm]).padStart(2,'0');
        break;
      }
    }
  }
  // אסטרטגיה 1b: custom dropdowns — חפש רק ב-element שמסומן כ-selected/active
  if (!billingMonthKey) {
    var activeEls = document.querySelectorAll('[class*="selected"], [class*="active"], [aria-selected="true"]');
    for (var ai = 0; ai < activeEls.length && !billingMonthKey; ai++) {
      var aText = activeEls[ai].textContent || '';
      for (var hi = 0; hi < hebrewMonths.length; hi++) {
        var hm = hebrewMonths[hi];
        var idx = aText.indexOf(hm);
        if (idx === -1) continue;
        var rest = aText.substring(idx + hm.length).trim();
        var yearMatch = rest.match(/^\d{4}/);
        if (yearMatch) {
          billingMonthKey = yearMatch[0] + '-' + String(HEBREW_TO_NUM[hm]).padStart(2,'0');
          break;
        }
      }
    }
  }

  // אסטרטגיה 2: חפש "חודש שנה" בכל הדף (כולל header)
  if (!billingMonthKey) {
    var allLines = document.body.innerText.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
    var hebrewMonths2 = Object.keys(HEBREW_TO_NUM);
    for (var li = 0; li < allLines.length && !billingMonthKey; li++) {
      var line = allLines[li];
      for (var hi2 = 0; hi2 < hebrewMonths2.length; hi2++) {
        var hm2 = hebrewMonths2[hi2];
        var midx = line.indexOf(hm2);
        if (midx === -1) continue;
        var rest2 = line.substring(midx + hm2.length).trim();
        var ym = rest2.match(/^(\d{4})/);
        if (ym) {
          billingMonthKey = ym[1] + '-' + String(HEBREW_TO_NUM[hm2]).padStart(2,'0');
          break;
        }
      }
    }
  }

  // אסטרטגיה 3: חלץ מה-URL (גיבוי)
  if (!billingMonthKey) {
    var urlMatch = window.location.href.match(/[?&].*?(\d{4})[-_](\d{2})/);
    if (urlMatch) billingMonthKey = urlMatch[1] + '-' + urlMatch[2];
  }

  // חלץ יתרת תשלום מה-deal-table
  var dealTable = document.querySelector('.deal-table');
  if (dealTable) {
    var dtLines = dealTable.innerText.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
    for (var di2 = 0; di2 < dtLines.length; di2++) {
      var ln = dtLines[di2];
      if (ln.indexOf('יתרת') !== -1) {
        var nums = ln.replace(/[^\d.]/g, ' ').trim().split(/\s+/).filter(function(s){return s.length>0;});
        if (nums.length > 0) { maxBillingTotal = parseFloat(nums[nums.length - 1]); break; }
      }
    }
  }

  // ── חלץ תנועות מ-row-stripes ─────────────────────────────────
  var transactions = [];
  var wrappers = document.querySelectorAll('.table-wrapper');

  // פונקציה לניקוי סכום: מסירה ₪, $, RLM, LRM, פסיקים, רווחים
  function cleanAmount(str) {
    var out = '';
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      // דלג על: ₪ (20AA), $ (24), RLM (200F), LRM (200E), פסיק, רווח
      if (c === 0x20AA || c === 0x24 || c === 0x200F || c === 0x200E || str[i] === ',' || str[i] === ' ') continue;
      out += str[i];
    }
    return out.trim();
  }

  // פונקציה לזיהוי שורת סכום — מחפש שורה עם מספר אחרי ₪ או $
  function findAmountLine(lines) {
    for (var i = lines.length - 1; i >= 0; i--) {
      var l = lines[i];
      var code0 = l.charCodeAt(0);
      // מתחיל ב-₪ (20AA) או $ (24) או תו RLM/LRM ואחריו ₪/$
      if (code0 === 0x20AA || code0 === 0x24) return l;
      if ((code0 === 0x200F || code0 === 0x200E) && l.length > 1) {
        var code1 = l.charCodeAt(1);
        if (code1 === 0x20AA || code1 === 0x24) return l;
      }
    }
    return null;
  }

  // בדוק תאריך בפורמט DD.MM.YY
  function isDate(str) {
    return /^\d{2}\.\d{2}\.\d{2}$/.test(str);
  }

  wrappers.forEach(function(wrapper) {
    wrapper.querySelectorAll('.row-stripes').forEach(function(row) {
      var lines = row.innerText.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
      if (lines.length < 3) return;

      // חפש תאריך — תמיד שורה ראשונה
      if (!isDate(lines[0])) return;
      var txDate = lines[0];
      var name   = lines[1];
      var maxCategory = lines[2];

      // חפש סכום דינמית — שורה אחרונה שמתחילה ב-₪ או $
      var amountLine = findAmountLine(lines);
      if (!amountLine) return;

      var cleaned = cleanAmount(amountLine);
      var amount = parseFloat(cleaned);
      if (!name || isNaN(amount) || amount <= 0) return;

      var parts = txDate.split('.');
      if (parts.length !== 3) return;
      var isoDate = '20' + parts[2] + '-' + parts[1] + '-' + parts[0];

      transactions.push({
        date: isoDate,
        name: name.trim(),
        amount: amount,
        maxCategory: maxCategory || null,
        billing_month: billingMonthKey || null,
      });
    });
  });

  return { transactions: transactions, billingMonthKey: billingMonthKey, maxBillingTotal: maxBillingTotal };
}
// ---------------------------------------------------------------------------
// End of copied extraction function
// ---------------------------------------------------------------------------

test.describe('בדיקות חילוץ תנועות מעמוד מוק של מקס', () => {

  let extractionResult;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to local mock HTML file
    const fileUrl = 'file:///' + MOCK_PAGE.replace(/\\/g, '/');
    await page.goto(fileUrl);

    // Wait for the mock page to be fully rendered
    await page.waitForSelector('.deal-table');
    await page.waitForSelector('.row-stripes');

    // Save screenshot of mock page
    const screenshotPath = path.join(SCREENSHOTS_DIR, 'mock-max-page.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved: ${screenshotPath}`);

    // Run the extraction function in browser context
    extractionResult = await page.evaluate(extractionFunction);
    console.log('Extraction result:', JSON.stringify(extractionResult, null, 2));

    await context.close();
  });

  test('חולץ 5 תנועות מעמוד מוק', () => {
    expect(extractionResult).toBeDefined();
    expect(extractionResult.transactions).toBeDefined();
    expect(extractionResult.transactions.length).toBe(5);
  });

  test('תאריכים בפורמט ISO', () => {
    const transactions = extractionResult.transactions;
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;

    for (const tx of transactions) {
      expect(tx.date).toMatch(isoPattern);
    }

    // Check first transaction date specifically
    expect(transactions[0].date).toBe('2026-03-01');
  });

  test('סכומים מנוקים נכון', () => {
    const transactions = extractionResult.transactions;
    const amounts = transactions.map(tx => tx.amount);

    expect(amounts).toContain(450.90);
    expect(amounts).toContain(89);
    expect(amounts).toContain(230);
    expect(amounts).toContain(53);
    expect(amounts).toContain(500);

    // All amounts should be positive numbers
    for (const amount of amounts) {
      expect(typeof amount).toBe('number');
      expect(isNaN(amount)).toBe(false);
      expect(amount).toBeGreaterThan(0);
    }
  });

  test('billing_month מזוהה נכון', () => {
    expect(extractionResult.billingMonthKey).toBe('2026-03');
  });

  test('שמות בתי עסק נכונים', () => {
    const names = extractionResult.transactions.map(tx => tx.name);

    expect(names).toContain('רמי לוי שיווק');
    expect(names).toContain('פרטנר תקשורת');
    expect(names).toContain('סונול דלק');
    expect(names).toContain('נטפליקס');
    expect(names).toContain('ATM כספומט');
  });

  test('אין תנועות ריקות', () => {
    const transactions = extractionResult.transactions;

    for (const tx of transactions) {
      expect(tx).not.toBeNull();
      expect(tx.name).toBeTruthy();
      expect(tx.amount).toBeTruthy();
      expect(tx.date).toBeTruthy();
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

});
