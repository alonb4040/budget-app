// v2
const SUPABASE_URL = 'https://fygffuihotnkjmxmveyt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_vNW_Tq3wUr5iUeRAw_qjBA_k3qUsQV-';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.action === 'openMax') {
    chrome.tabs.create({ url: 'https://www.max.co.il' });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.action === 'navigateMaxToBilling') {
    chrome.tabs.query({}, (allTabs) => {
      const maxTab = allTabs.find(t => t.active && t.url && t.url.includes('max.co.il'))
                  || allTabs.find(t => t.url && t.url.includes('max.co.il'));
      if (maxTab) {
        chrome.tabs.update(maxTab.id, { url: 'https://www.max.co.il/charges/charges', active: true });
        sendResponse({ ok: true });
      } else {
        chrome.tabs.create({ url: 'https://www.max.co.il/charges/charges' });
        sendResponse({ ok: true });
      }
    });
    return true;
  }

  if (msg.action === 'checkMaxPage') {
    chrome.tabs.query({}, async (allTabs) => {
      // קודם חפש לשונית מקס פעילה, ואם לא — כל לשונית מקס
      const maxTab = allTabs.find(t => t.active && t.url && t.url.includes('max.co.il'))
                  || allTabs.find(t => t.url && t.url.includes('max.co.il'));
      if (!maxTab) {
        sendResponse({ onMaxPage: false, onBillingPage: false, isActiveTab: false, tabId: null, url: null });
        return;
      }

      // בדוק אם deal-table קיים בדף — זה הסימן היחיד האמין שזה עמוד פירוט חיובים
      let onBillingPage = false;
      let billingMonth = null;
      try {
        const check = await chrome.scripting.executeScript({
          target: { tabId: maxTab.id },
          func: () => {
            if (!document.querySelector('.deal-table')) return { hasDealTable: false, billingMonth: null };
            // זיהוי חודש חיוב לתצוגה מקדימה
            var HEBREW_TO_NUM = {'ינואר':1,'פברואר':2,'מרץ':3,'אפריל':4,'מאי':5,'יוני':6,'יולי':7,'אוגוסט':8,'ספטמבר':9,'אוקטובר':10,'נובמבר':11,'דצמבר':12};
            var hebrewMonths = Object.keys(HEBREW_TO_NUM);
            var billingMonthKey = null;
            // אסטרטגיה 1: native select
            var nativeSelects = document.querySelectorAll('select');
            for (var si = 0; si < nativeSelects.length && !billingMonthKey; si++) {
              var sel = nativeSelects[si];
              var selectedOpt = sel.options && sel.options[sel.selectedIndex];
              var optText = selectedOpt ? (selectedOpt.textContent || '') : '';
              for (var hi = 0; hi < hebrewMonths.length; hi++) {
                var hm = hebrewMonths[hi];
                var idx = optText.indexOf(hm);
                if (idx === -1) continue;
                var rest = optText.substring(idx + hm.length).trim();
                var yearMatch = rest.match(/^\d{4}/);
                if (yearMatch) { billingMonthKey = yearMatch[0] + '-' + String(HEBREW_TO_NUM[hm]).padStart(2,'0'); break; }
              }
            }
            // אסטרטגיה 2: טקסט הדף
            if (!billingMonthKey) {
              var lines = document.body.innerText.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
              for (var li = 0; li < lines.length && !billingMonthKey; li++) {
                for (var hi2 = 0; hi2 < hebrewMonths.length; hi2++) {
                  var hm2 = hebrewMonths[hi2];
                  var midx = lines[li].indexOf(hm2);
                  if (midx === -1) continue;
                  var rest2 = lines[li].substring(midx + hm2.length).trim();
                  var ym = rest2.match(/^(\d{4})/);
                  if (ym) { billingMonthKey = ym[1] + '-' + String(HEBREW_TO_NUM[hm2]).padStart(2,'0'); break; }
                }
              }
            }
            return { hasDealTable: true, billingMonth: billingMonthKey };
          },
        });
        const result = check[0]?.result || {};
        onBillingPage = result.hasDealTable === true;
        billingMonth = result.billingMonth || null;
      } catch(e) {
        onBillingPage = false;
      }

      sendResponse({
        onMaxPage: true,
        onBillingPage: onBillingPage,
        isActiveTab: maxTab.active === true,  // האם לשונית מקס היא הפעילה כרגע
        billingMonth: billingMonth,
        tabId: maxTab.id,
        url: maxTab.url
      });
    });
    return true;
  }

  if (msg.action === 'extractNow') {
    chrome.tabs.query({}, async (allTabs) => {
      const maxTab = allTabs.find(t => t.active && t.url && t.url.includes('max.co.il'))
                  || allTabs.find(t => t.url && t.url.includes('max.co.il'));
      if (!maxTab) {
        sendResponse({ success: false, error: 'לא נמצא עמוד מקס פתוח' });
        return;
      }

      try {
        // בדוק תחילה אם deal-table קיים — אחרת זה לא עמוד פירוט חיובים לפי חודש
        const dealTableCheck = await chrome.scripting.executeScript({
          target: { tabId: maxTab.id },
          func: () => {
            var dt = document.querySelector('.deal-table');
            return { hasDealTable: !!dt, url: window.location.href };
          }
        });
        const dtResult = dealTableCheck[0]?.result || {};
        if (!dtResult.hasDealTable) {
          sendResponse({
            success: false,
            error: 'נא לנווט לעמוד "פירוט חיובים" ולבחור חודש ספציפי.\nכרטיסים ← פירוט חיובים ← בחר חודש'
          });
          return;
        }

        // הפרסר מוגדר inline — self-contained, לא תלוי ב-scope של ה-service worker
        const results = await chrome.scripting.executeScript({
          target: { tabId: maxTab.id },
          func: () => {
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
          },
        });

        const pageResult = results[0]?.result || {};
        // תמיכה בשני פורמטים: object חדש עם { transactions, billingMonthKey } או array ישן
        const txs = Array.isArray(pageResult) ? pageResult : (pageResult.transactions || []);
        const billingMonthKey = pageResult.billingMonthKey || null;
        const maxBillingTotal = pageResult.maxBillingTotal || null;

        if (!txs || txs.length === 0) {
          sendResponse({ success: false, error: 'לא הצלחתי לחלץ תנועות — ודא שאתה בעמוד פירוט תנועות' });
          return;
        }

        const saveResult = await saveTransactions(txs, msg.userId, msg.accessToken, 'max', null, billingMonthKey, maxBillingTotal);
        sendResponse(saveResult);

      } catch(e) {
        sendResponse({ success: false, error: 'שגיאה: ' + e.message });
      }
    });
    return true;
  }
});

// ── שמירה ל-Supabase ──────────────────────────────────────────────────────────
async function saveTransactions(transactions, userId, accessToken, provider, cardLast4, billingMonthKey, maxBillingTotal) {
  if (!transactions || transactions.length === 0) {
    return { success: true, added: 0, duplicates: 0 };
  }

  const authHeader = 'Bearer ' + (accessToken || SUPABASE_KEY);

  let batchId = null;
  try {
    const batchRes = await fetch(SUPABASE_URL + '/rest/v1/import_batches', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': authHeader,
        'Content-Type': 'application/json', 'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        client_id: userId, source_type: 'extension', provider,
        card_last4: cardLast4 || null, total_received: transactions.length,
        billing_month: billingMonthKey || null,
        max_billing_total: maxBillingTotal || null,
        status: 'processing', created_at: new Date().toISOString(),
      }),
    });
    const batchData = await batchRes.json();
    batchId = Array.isArray(batchData) ? batchData[0]?.id : null;
  } catch(e) { /* batch creation is optional — continue without it */ }
  let added = 0, duplicates = 0;

  for (const tx of transactions) {
    const hash = await computeHash((cardLast4 || '') + '|' + tx.date + '|' + tx.amount + '|' + tx.name + '|' + (tx.billing_month || ''));

    const checkRes = await fetch(
      SUPABASE_URL + '/rest/v1/imported_transactions?tx_hash=eq.' + hash + '&client_id=eq.' + userId + '&select=id',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': authHeader } }
    );
    const existing = await checkRes.json();
    if (existing && existing.length > 0) { duplicates++; continue; }

    const insertRes = await fetch(SUPABASE_URL + '/rest/v1/imported_transactions', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        client_id: userId, import_batch_id: batchId, source_type: 'extension',
        provider, card_last4: cardLast4 || null, date: tx.date, name: tx.name,
        amount: tx.amount, max_category: tx.maxCategory || null, tx_hash: hash,
        billing_month: tx.billing_month || billingMonthKey || null,
        created_at: new Date().toISOString(),
      }),
    });
    if (insertRes.ok) {
      added++;
    } else {
      const errText = await insertRes.text();
      console.error('[mazan] INSERT failed:', insertRes.status, errText);
    }
  }

  if (batchId) {
    await fetch(SUPABASE_URL + '/rest/v1/import_batches?id=eq.' + batchId, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY, 'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ added, duplicates, status: 'done' }),
    });
  }

  return { success: true, added, duplicates, billingMonthKey };
}

async function computeHash(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// ── Dev hot-reload — מתרענן אוטומטית כשקבצים משתנים ──────────────────────
// פועל רק כשמריצים: node extension/dev-watch.js
// בproduction: ה-fetch נכשל בשקט ואין השפעה
(function devHotReload() {
  let lastVersion = null;
  async function poll() {
    try {
      const res = await fetch('http://localhost:9877/version', { cache: 'no-store' });
      const v = await res.text();
      if (lastVersion === null) { lastVersion = v; }
      else if (v !== lastVersion) { chrome.runtime.reload(); return; }
    } catch(e) { /* dev server not running — production mode */ }
    setTimeout(poll, 1500);
  }
  poll();
}());
