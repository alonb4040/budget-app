// v3 — קליטה דרך ה-API הישיר של מקס (לא DOM scraping) + נקודת קליטה מאוחדת ingest-transactions.
// הוחלף לגמרי: extractNow היה בעבר Content Script שקרא טקסט מהטבלה הגלויה; עכשיו קורא ישירות
// ל-https://www.max.co.il/api/registered/transactionDetails/getTransactionsAndGraphs (same-origin,
// אין CORS — אומת בבדיקה חיה) ומקבל JSON מובנה כולל dealData.arn / uid האמיתיים ממקס.
// saveTransactions כבר לא מחשב hash ולא בודק כפילויות בעצמו — כל הדדופ עבר לפונקציית השרת
// ingest_bank_transactions, נקרא דרך Edge Function ingest-transactions.

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

  // בדוק אם יש לשונית מקס פתוחה — מוכן לחילוץ מכל עמוד באתר (ה-API לא תלוי בעמוד ספציפי,
  // בניגוד ל-DOM scraping הישן שדרש עמוד "פירוט חיובים" עם .deal-table)
  if (msg.action === 'checkMaxPage') {
    chrome.tabs.query({}, (allTabs) => {
      const maxTab = allTabs.find(t => t.active && t.url && t.url.includes('max.co.il'))
                  || allTabs.find(t => t.url && t.url.includes('max.co.il'));
      if (!maxTab) {
        sendResponse({ onMaxPage: false, onBillingPage: false, isActiveTab: false, tabId: null, url: null });
        return;
      }
      sendResponse({
        onMaxPage: true,
        onBillingPage: true, // ה-API עובד מכל עמוד בדומיין — לא צריך DOM check יותר
        isActiveTab: maxTab.active === true,
        billingMonth: null, // נודע רק אחרי extractNow (מגיע מה-JSON, לא מ-DOM מוקדם)
        tabId: maxTab.id,
        url: maxTab.url,
      });
    });
    return true;
  }

  // חלץ תנועות דרך ה-API הישיר — ללא שמירה (תצוגה מקדימה בלבד)
  if (msg.action === 'extractNow') {
    chrome.tabs.query({}, async (allTabs) => {
      const maxTab = allTabs.find(t => t.active && t.url && t.url.includes('max.co.il'))
                  || allTabs.find(t => t.url && t.url.includes('max.co.il'));
      if (!maxTab) {
        sendResponse({ success: false, error: 'לא נמצא עמוד מקס פתוח' });
        return;
      }

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: maxTab.id },
          func: fetchAndMapMaxTransactions,
        });
        const pageResult = results[0]?.result || {};

        if (pageResult.error) {
          sendResponse({ success: false, error: pageResult.error });
          return;
        }
        if (!pageResult.transactions || pageResult.transactions.length === 0) {
          sendResponse({ success: false, error: 'לא נמצאו תנועות. ודא שאתה מחובר למקס ונסה שוב.' });
          return;
        }

        sendResponse({
          success: true, preview: true,
          transactions: pageResult.transactions,
          billingMonthKey: pageResult.billingMonthKey,
          maxBillingTotal: pageResult.maxBillingTotal,
          count: pageResult.count,
        });
      } catch (e) {
        sendResponse({ success: false, error: 'שגיאה: ' + e.message });
      }
    });
    return true;
  }

  // שמור תנועות שכבר חולצו (אחרי אישור המשתמש) — דרך נקודת הקליטה המאוחדת
  if (msg.action === 'confirmSave') {
    const { transactions, billingMonthKey, userId, accessToken } = msg;
    (async () => {
      try {
        const saveResult = await saveTransactions(transactions, userId, accessToken, billingMonthKey);
        sendResponse(saveResult);
      } catch (e) {
        sendResponse({ success: false, error: 'שגיאה: ' + e.message });
      }
    })();
    return true;
  }
});

// ── מוזרק לתוך לשונית מקס (chrome.scripting.executeScript) — רץ בקונטקסט הדף, עם עוגיות הסשן ──
// קורא ישירות ל-API הפנימי של מקס (אותו endpoint שהאתר עצמו קורא לו) ומייצר תנועות בצורה קנונית.
async function fetchAndMapMaxTransactions() {
  try {
    // אם המשתמש ניווט לחודש מסוים בדף (בורר החודשים), ה-URL מכיל את התאריך שנבחר
    // (?filter=-1_-1_1_YYYY-MM-DD_...) — נשתמש בו כדי לשלוף בדיוק את החודש שמוצג, לא תמיד
    // את המחזור הנוכחי. בלי זה, "בחר חודש אחר ← חלץ שוב" היה מתעלם מהבחירה ותמיד מביא נוכחי.
    function currentFilterData() {
      const m = location.href.match(/filter=-?\d+_-?\d+_-?\d+_(\d{4}-\d{2}-\d{2})_/);
      if (!m) return ''; // אין פרמטר חודש בדף — מחזור החיוב הנוכחי
      return JSON.stringify({
        userIndex: -1, cardIndex: -1, monthView: true, date: m[1],
        dates: { startDate: '0', endDate: '0' },
        bankAccount: { bankAccountIndex: -1, cards: null },
      });
    }

    const url = 'https://www.max.co.il/api/registered/transactionDetails/getTransactionsAndGraphs'
      + '?filterData=' + encodeURIComponent(currentFilterData()) + '&firstCallCardIndex=-1null&v=V4.217-RC.9.59';
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { error: 'שגיאת שרת ממקס (' + res.status + ') — נסה להתחבר מחדש' };

    const data = await res.json();
    const result = data && data.result;
    if (!result || !Array.isArray(result.transactions)) return { error: 'תגובה לא צפויה מהשרת של מקס' };

    function toBillingMonth(t) {
      const raw = (t.dealData && t.dealData.processingDate) || t.paymentDate || t.purchaseDate;
      return raw ? String(raw).slice(0, 7) : null;
    }
    function parseInstallments(comments) {
      const m = comments && String(comments).match(/תשלום (\d+) מתוך (\d+)/);
      return m ? { number: parseInt(m[1], 10), total: parseInt(m[2], 10) } : { number: null, total: null };
    }

    const transactions = result.transactions
      .map((t) => {
        const inst = parseInstallments(t.comments);
        const amount = (t.actualPaymentAmount != null) ? t.actualPaymentAmount : t.originalAmount;
        return {
          bank_reference: t.arn || (t.dealData && t.dealData.arn) || null,
          bank_uid: t.uid || null,
          card_last4: t.shortCardNumber || null,
          date: (t.purchaseDate || '').slice(0, 10),
          billing_month: toBillingMonth(t),
          merchant_name: (t.merchantName || '').trim(),
          amount: amount,
          original_amount: (t.originalAmount != null) ? t.originalAmount : null,
          original_currency: t.originalCurrency || null,
          status: (t.tableType === 10) ? 'pending' : 'completed',
          installment_number: inst.number,
          installment_total: inst.total,
          category_raw: (t.categoryId != null) ? String(t.categoryId) : null,
          raw_payload: t,
        };
      })
      .filter((tx) => tx.merchant_name && tx.amount != null && !isNaN(tx.amount) && tx.date);

    let maxBillingTotal = null;
    if (Array.isArray(result.totalCycle)) {
      const ils = result.totalCycle.find((c) => c.currency === 376);
      if (ils) maxBillingTotal = ils.futureDebit;
    }

    const billingMonthKey = (result.info && result.info.date) ? String(result.info.date).slice(0, 7) : null;

    return { transactions, billingMonthKey, maxBillingTotal, count: transactions.length };
  } catch (e) {
    return { error: 'שגיאת רשת: ' + e.message };
  }
}

// ── שמירה — נקודת קליטה מאוחדת (כל הדדופ קורה בשרת, לא כאן) ──────────────────
async function saveTransactions(transactions, userId, accessToken, billingMonthKey) {
  if (!transactions || transactions.length === 0) {
    return { success: true, added: 0, duplicates: 0 };
  }

  const res = await fetch(SUPABASE_URL + '/functions/v1/ingest-transactions', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider: 'max', source_channel: 'extension', billingMonthKey, transactions }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    return { success: false, error: data.error || ('שגיאת שרת (' + res.status + ')') };
  }

  return {
    success: true,
    added: data.added,
    duplicates: data.duplicates,
    billingMonthKey,
  };
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
