// ==UserScript==
// @name         מאזן MAX Sync
// @namespace    https://github.com/alonb4040/budget-app
// @version      1.5.3
// @description  סנכרן תנועות MAX ישירות למאזן — ללא הורדת קבצים
// @author       Mazan
// @match        https://www.max.co.il/*
// @match        https://max.co.il/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      fygffuihotnkjmxmveyt.supabase.co
// @updateURL    https://raw.githubusercontent.com/alonb4040/budget-app/main/public/mazan-max.user.js
// @downloadURL  https://raw.githubusercontent.com/alonb4040/budget-app/main/public/mazan-max.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // diagnostic — remove after confirming script runs
  try { document.title = '✅ MAZAN | ' + document.title; } catch(e) {}

  const SUPA_URL = 'https://fygffuihotnkjmxmveyt.supabase.co';
  const SUPA_KEY = 'sb_publishable_vNW_Tq3wUr5iUeRAw_qjBA_k3qUsQV-';

  // ── state ─────────────────────────────────────────────────────────────────
  let currentUser = null; // { id, username, name, accessToken }
  let panelOpen = false;
  let uiState = 'init'; // init | login | idle | billing | extracting | preview | saving | done | error
  let pendingTxs = null; // { transactions, billingMonthKey, maxBillingTotal, count }
  let lastResult = null; // { added, duplicates, billingMonthKey }
  let lastError = '';
  let currentUrl = location.href;

  // ── gmFetch — wraps GM_xmlhttpRequest in a Promise ───────────────────────
  function gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url,
        headers: options.headers || {},
        data: options.body || null,
        timeout: options.timeout || 20000,
        onload: (res) => {
          const ok = res.status >= 200 && res.status < 300;
          resolve({
            ok,
            status: res.status,
            text: () => Promise.resolve(res.responseText),
            json: () => Promise.resolve(JSON.parse(res.responseText)),
          });
        },
        onerror: () => reject(new Error('שגיאת רשת — בדוק את החיבור שלך ונסה שוב')),
        ontimeout: () => reject(new Error('הבקשה לשרת נתקעה — בדוק את החיבור שלך ונסה שוב')),
      });
    });
  }

  // ── formatBillingMonth ────────────────────────────────────────────────────
  function formatBillingMonth(key) {
    if (!key) return '';
    const [y, m] = key.split('-').map(Number);
    const names = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    return (names[m] || '') + ' ' + y;
  }

  // ── extractTransactions — API ישיר של מקס (לא DOM scraping) ────────────────
  // אותו endpoint שהאתר עצמו קורא לו: https://www.max.co.il/api/registered/transactionDetails/
  // getTransactionsAndGraphs — same-origin, אין CORS (אומת בבדיקה חיה). מחזיר JSON מובנה כולל
  // dealData.arn / uid האמיתיים ממקס, במקום parsing שברירי של טקסט מטבלה.
  function currentFilterData() {
    // אם המשתמש ניווט לחודש מסוים בבורר החודשים, ה-URL מכיל את התאריך שנבחר
    // (?filter=-1_-1_1_YYYY-MM-DD_...) — נשתמש בו כדי לשלוף בדיוק את החודש שמוצג.
    const m = location.href.match(/filter=-?\d+_-?\d+_-?\d+_(\d{4}-\d{2}-\d{2})_/);
    if (!m) return ''; // אין פרמטר חודש — מחזור החיוב הנוכחי
    return JSON.stringify({
      userIndex: -1, cardIndex: -1, monthView: true, date: m[1],
      dates: { startDate: '0', endDate: '0' },
      bankAccount: { bankAccountIndex: -1, cards: null },
    });
  }

  function parseInstallments(comments) {
    const m = comments && String(comments).match(/תשלום (\d+) מתוך (\d+)/);
    return m ? { number: parseInt(m[1], 10), total: parseInt(m[2], 10) } : { number: null, total: null };
  }

  async function extractTransactions() {
    const url = 'https://www.max.co.il/api/registered/transactionDetails/getTransactionsAndGraphs'
      + '?filterData=' + encodeURIComponent(currentFilterData()) + '&firstCallCardIndex=-1null&v=V4.217-RC.9.59';
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('שגיאת שרת ממקס (' + res.status + ') — נסה להתחבר מחדש למקס');

    const data = await res.json();
    const result = data && data.result;
    if (!result || !Array.isArray(result.transactions)) throw new Error('תגובה לא צפויה מהשרת של מקס');

    const transactions = result.transactions
      .map(t => {
        const inst = parseInstallments(t.comments);
        const amount = (t.actualPaymentAmount != null) ? t.actualPaymentAmount : t.originalAmount;
        return {
          bank_reference: t.arn || (t.dealData && t.dealData.arn) || null,
          bank_uid: t.uid || null,
          card_last4: t.shortCardNumber || null,
          date: (t.purchaseDate || '').slice(0, 10),
          billing_month: ((t.dealData && t.dealData.processingDate) || t.paymentDate || t.purchaseDate || '').slice(0, 7) || null,
          merchant_name: (t.merchantName || '').trim(),
          amount,
          original_amount: (t.originalAmount != null) ? t.originalAmount : null,
          original_currency: t.originalCurrency || null,
          status: (t.tableType === 10) ? 'pending' : 'completed',
          installment_number: inst.number,
          installment_total: inst.total,
          category_raw: (t.categoryId != null) ? String(t.categoryId) : null,
          raw_payload: t,
        };
      })
      .filter(tx => tx.merchant_name && tx.amount != null && !isNaN(tx.amount) && tx.date);

    let maxBillingTotal = null;
    if (Array.isArray(result.totalCycle)) {
      const ils = result.totalCycle.find(c => c.currency === 376);
      if (ils) maxBillingTotal = ils.futureDebit;
    }
    const billingMonthKey = (result.info && result.info.date) ? String(result.info.date).slice(0, 7) : null;

    return { transactions, billingMonthKey, maxBillingTotal };
  }

  // ── בדיקת חפיפה ברמת חודש מול תנועות ישנות (Excel/PDF) ─────────────────────
  // אין מפתח ראשי אמיתי להשוואה בין bank_transactions (המסלול הזה) לבין
  // imported_transactions/manual_transactions הישנות — קובץ מיובא אף פעם לא הכיל
  // את ה-ARN/UID הפנימיים של מקס. לכן ההתאמה כאן היא ברמת "תאריך+סכום זהים" בלבד,
  // ורק כאזהרה למשתמש — אף פעם לא מוחקת/מסננת אוטומטית. ר' דיון בצ'אט.
  async function checkMonthOverlap(billingMonthKey, newTransactions) {
    if (!billingMonthKey || !newTransactions || !newTransactions.length) return { overlapCount: 0, samples: [] };
    const auth = { apikey: SUPA_KEY, Authorization: 'Bearer ' + currentUser.accessToken };
    const [r1, r2] = await Promise.all([
      gmFetch(SUPA_URL + '/rest/v1/imported_transactions?client_id=eq.' + currentUser.id +
        '&billing_month=eq.' + billingMonthKey + '&select=date,name,amount', { headers: auth }),
      gmFetch(SUPA_URL + '/rest/v1/manual_transactions?client_id=eq.' + currentUser.id +
        '&billing_month=eq.' + billingMonthKey + '&select=date,name,amount', { headers: auth }),
    ]);
    const [old1, old2] = await Promise.all([r1.json(), r2.json()]);
    const oldRows = [...(Array.isArray(old1) ? old1 : []), ...(Array.isArray(old2) ? old2 : [])];
    if (!oldRows.length) return { overlapCount: 0, samples: [] };

    const key = (date, amount) => date + '|' + Number(amount).toFixed(2);
    const oldByKey = {};
    oldRows.forEach(r => { oldByKey[key(r.date, r.amount)] = r.name; });

    const samples = [];
    newTransactions.forEach(t => {
      const k = key(t.date, t.amount);
      if (oldByKey[k] !== undefined && samples.length < 5) {
        samples.push({ date: t.date, amount: t.amount, name: t.merchant_name, oldName: oldByKey[k] });
      } else if (oldByKey[k] !== undefined) {
        samples.push(null); // נספר, לא מוצג
      }
    });
    return { overlapCount: samples.length, samples: samples.filter(Boolean) };
  }

  // ── saveTransactions — נקודת קליטה מאוחדת (כל הדדופ קורה בשרת, לא כאן) ─────
  async function saveTransactions({ transactions, billingMonthKey }) {
    const r = await gmFetch(SUPA_URL + '/functions/v1/ingest-transactions', {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: 'Bearer ' + currentUser.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ provider: 'max', source_channel: 'userscript', billingMonthKey, transactions }),
    });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || ('שגיאת שרת (' + r.status + ')'));

    return { added: d.added, duplicates: d.duplicates, billingMonthKey };
  }

  // ── login ─────────────────────────────────────────────────────────────────
  async function login(username, password) {
    const email = username + '@mazan.local';
    let accessToken = null;

    const r1 = await gmFetch(SUPA_URL+'/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d1 = await r1.json();
    if (d1.access_token) {
      accessToken = d1.access_token;
    } else {
      const r2 = await gmFetch(SUPA_URL+'/functions/v1/manage-auth', {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json', 'Authorization': 'Bearer '+SUPA_KEY },
        body: JSON.stringify({ action: 'migrate_login', username, password }),
      });
      const d2 = await r2.json();
      if (!d2.ok) throw new Error('שם משתמש או סיסמה שגויים');
      const r3 = await gmFetch(SUPA_URL+'/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d3 = await r3.json();
      if (!d3.access_token) throw new Error('שגיאת התחברות');
      accessToken = d3.access_token;
    }

    const rc = await gmFetch(SUPA_URL+'/rest/v1/clients?username=eq.'+encodeURIComponent(username)+'&select=id,username,name', {
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer '+accessToken },
    });
    const clients = await rc.json();
    if (!clients || !clients.length) throw new Error('משתמש לא נמצא');
    return { ...clients[0], accessToken };
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  const PANEL_ID = 'mazan-panel';

  function injectStyles() {
    if (document.getElementById('mazan-styles')) return;
    const s = document.createElement('style');
    s.id = 'mazan-styles';
    s.textContent = `
      #mazan-fab { position:fixed; bottom:24px; left:24px; z-index:2147483647; font-family:'Segoe UI',Arial,sans-serif; direction:rtl; }
      #mazan-toggle { background:#2d6a4f; color:#fff; border:none; border-radius:28px; padding:10px 18px; font-size:14px; font-weight:700; cursor:pointer; box-shadow:0 4px 16px rgba(45,106,79,.4); display:flex; align-items:center; gap:8px; transition:background .15s; font-family:inherit; }
      #mazan-toggle:hover { background:#1e4d38; }
      #mazan-panel { background:#fafaf8; border:1.5px solid #d4e8da; border-radius:14px; box-shadow:0 8px 32px rgba(0,0,0,.15); width:300px; margin-bottom:10px; overflow:hidden; display:none; }
      #mazan-panel.open { display:block; }
      .mz-header { background:#2d6a4f; color:#fff; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; }
      .mz-logo { font-size:16px; font-weight:700; }
      .mz-ver { font-size:10px; opacity:.7; }
      .mz-body { padding:14px; }
      .mz-status { font-size:12px; color:#5a7a62; margin-bottom:10px; min-height:18px; }
      .mz-status.err { color:#c0392b; }
      .mz-status.ok { color:#2d6a4f; font-weight:600; }
      .mz-btn { width:100%; background:#2d6a4f; color:#fff; border:none; border-radius:8px; padding:9px; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; margin-top:6px; transition:background .15s; }
      .mz-btn:hover { background:#1e4d38; }
      .mz-btn:disabled { opacity:.5; cursor:not-allowed; }
      .mz-btn.sec { background:#d8f3dc; color:#2d6a4f; }
      .mz-btn.sec:hover { background:#c0eac8; }
      .mz-input { width:100%; border:1.5px solid #d4e8da; border-radius:8px; padding:8px 10px; font-size:13px; direction:rtl; outline:none; font-family:inherit; margin-bottom:6px; background:#fff; }
      .mz-input:focus { border-color:#2d6a4f; }
      .mz-preview { background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:10px 12px; margin-top:8px; font-size:12px; }
      .mz-preview .num { font-size:20px; font-weight:700; color:#e65100; }
      .mz-result { background:#f0faf2; border:1px solid #d8f3dc; border-radius:8px; padding:10px 12px; margin-top:8px; font-size:12px; }
      .mz-result .num { font-size:20px; font-weight:700; color:#2d6a4f; }
      .mz-footer { padding:8px 14px; font-size:10px; color:#a0b8a8; border-top:1px solid #e8f0ea; display:flex; justify-content:space-between; }
      .mz-logout { background:none; border:none; color:#c0392b; font-size:10px; cursor:pointer; font-family:inherit; padding:0; }
      .mz-spinner { display:inline-block; width:11px; height:11px; border:2px solid #d8f3dc; border-top-color:#2d6a4f; border-radius:50%; animation:mz-spin .7s linear infinite; vertical-align:middle; margin-right:4px; }
      @keyframes mz-spin { to { transform:rotate(360deg); } }
      .mz-row { display:flex; gap:6px; margin-top:6px; }
      .mz-row .mz-btn { margin-top:0; }
    `;
    document.head.appendChild(s);
  }

  function injectFAB() {
    if (document.getElementById('mazan-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'mazan-fab';
    fab.innerHTML = `
      <div id="${PANEL_ID}" class="mz-panel">
        <div class="mz-header">
          <span class="mz-logo">⚡ מאזן</span>
          <span class="mz-ver">v1.5.3</span>
        </div>
        <div class="mz-body" id="mz-body"></div>
        <div class="mz-footer" id="mz-footer"></div>
      </div>
      <button id="mazan-toggle">⚡ מאזן MAX</button>
    `;
    document.body.appendChild(fab);
    document.getElementById('mazan-toggle').addEventListener('click', () => {
      panelOpen = !panelOpen;
      const p = document.getElementById(PANEL_ID);
      p.classList.toggle('open', panelOpen);
      if (panelOpen) render();
    });
  }

  function render() {
    const body = document.getElementById('mz-body');
    const footer = document.getElementById('mz-footer');
    if (!body) return;

    if (uiState === 'login') {
      body.innerHTML = `
        <div style="font-size:12px;color:#4a6352;margin-bottom:10px;">התחבר לחשבון מאזן שלך</div>
        <input class="mz-input" id="mz-user" placeholder="שם משתמש" type="text"/>
        <input class="mz-input" id="mz-pass" placeholder="סיסמה" type="password"/>
        <div class="mz-status err" id="mz-err"></div>
        <button class="mz-btn" id="mz-login-btn">כניסה</button>
      `;
      footer.innerHTML = '';
      document.getElementById('mz-login-btn').addEventListener('click', async () => {
        const u = document.getElementById('mz-user').value.trim();
        const p = document.getElementById('mz-pass').value.trim();
        const err = document.getElementById('mz-err');
        if (!u || !p) { err.textContent = 'נא למלא שם משתמש וסיסמה'; return; }
        document.getElementById('mz-login-btn').disabled = true;
        document.getElementById('mz-login-btn').textContent = 'מתחבר...';
        try {
          currentUser = await login(u, p);
          GM_setValue('mazan_user', JSON.stringify(currentUser));
          uiState = isOnBillingPage() ? 'billing' : 'idle';
          render();
        } catch(e) {
          err.textContent = e.message || 'שגיאת התחברות';
          document.getElementById('mz-login-btn').disabled = false;
          document.getElementById('mz-login-btn').textContent = 'כניסה';
        }
      });
      return;
    }

    if (uiState === 'idle') {
      body.innerHTML = `
        <div class="mz-status">לא נמצא עמוד פירוט חיובים</div>
        <div style="font-size:11px;color:#7a9a82;line-height:1.6;">נווט באתר MAX:<br><b>כרטיסים ← פירוט חיובים ← בחר חודש</b><br>ואז לחץ "חלץ תנועות"</div>
        <button class="mz-btn" id="mz-goto" style="margin-top:10px;">עבור לפירוט חיובים ←</button>
      `;
      document.getElementById('mz-goto').addEventListener('click', () => { location.href = 'https://www.max.co.il/charges/charges'; });
    }

    if (uiState === 'billing') {
      body.innerHTML = `
        <div class="mz-status ok">✓ עמוד פירוט חיובים זוהה</div>
        <button class="mz-btn" id="mz-extract">חלץ תנועות</button>
      `;
      document.getElementById('mz-extract').addEventListener('click', doExtract);
    }

    if (uiState === 'extracting') {
      body.innerHTML = `<div class="mz-status"><span class="mz-spinner"></span> מחלץ תנועות...</div>`;
    }

    if (uiState === 'preview' && pendingTxs) {
      const monthLabel = formatBillingMonth(pendingTxs.billingMonthKey);
      const ov = pendingTxs.overlap || { overlapCount: 0, samples: [] };
      const overlapHtml = ov.overlapCount > 0 ? `
        <div class="mz-overlap-warn" style="background:#fff3e0;border:1px solid #ffcc80;border-radius:8px;padding:8px 10px;margin-top:8px;font-size:11px;color:#7a4a00;">
          ⚠️ נמצאו ${ov.overlapCount} תנועות בתאריך+סכום זהים לתנועות שכבר קיימות מחודש זה (כנראה מהעלאת קובץ ישנה). ייתכן שאלה כפילויות.
          ${ov.samples.length ? `<div style="margin-top:4px;opacity:.85;">${ov.samples.map(s => `${s.date} · ₪${s.amount} · ${s.name}`).join('<br>')}</div>` : ''}
        </div>
      ` : '';
      body.innerHTML = `
        <div class="mz-preview">
          <div>נמצאו <span class="num">${pendingTxs.count}</span> תנועות</div>
          ${monthLabel ? `<div style="color:#5d4037;font-size:11px;margin-top:3px;">חודש חיוב: ${monthLabel}</div>` : ''}
          ${overlapHtml}
          <div class="mz-row">
            <button class="mz-btn" id="mz-confirm">שמור ${ov.overlapCount > 0 ? 'בכל זאת' : '✓'}</button>
            <button class="mz-btn sec" id="mz-cancel">ביטול</button>
          </div>
        </div>
      `;
      document.getElementById('mz-confirm').addEventListener('click', doSave);
      document.getElementById('mz-cancel').addEventListener('click', () => {
        pendingTxs = null; uiState = 'billing'; render();
      });
    }

    if (uiState === 'saving') {
      body.innerHTML = `<div class="mz-status"><span class="mz-spinner"></span> שומר תנועות...</div>`;
    }

    if (uiState === 'done' && lastResult) {
      const monthLabel = formatBillingMonth(lastResult.billingMonthKey);
      body.innerHTML = `
        <div class="mz-result">
          <div><span class="num">${lastResult.added}</span> תנועות נוספו ✓</div>
          ${lastResult.duplicates > 0 ? `<div style="color:#8aa492;font-size:11px;margin-top:2px;">${lastResult.duplicates} כפילויות דולגו</div>` : ''}
          ${monthLabel ? `<div style="color:#4a8c6a;font-size:11px;margin-top:2px;">חודש חיוב: ${monthLabel}</div>` : ''}
        </div>
        <button class="mz-btn sec" id="mz-again" style="margin-top:8px;">חלץ חודש נוסף</button>
      `;
      document.getElementById('mz-again').addEventListener('click', () => { uiState = 'billing'; render(); });
    }

    if (uiState === 'error') {
      body.innerHTML = `
        <div class="mz-status err">${lastError}</div>
        <button class="mz-btn sec" id="mz-retry">נסה שוב</button>
      `;
      document.getElementById('mz-retry').addEventListener('click', () => { uiState = isOnBillingPage() ? 'billing' : 'idle'; render(); });
    }

    // footer
    if (currentUser) {
      footer.innerHTML = `
        <span>מחובר: ${currentUser.name || currentUser.username}</span>
        <button class="mz-logout" id="mz-logout">התנתק</button>
      `;
      document.getElementById('mz-logout').addEventListener('click', () => {
        GM_setValue('mazan_user', '');
        currentUser = null; uiState = 'login'; render();
      });
    } else {
      footer.innerHTML = '';
    }
  }

  // ── actions ───────────────────────────────────────────────────────────────
  // ה-API עובד מכל עמוד בדומיין (לא תלוי DOM) — לא צריך יותר לבדוק .deal-table.
  function isOnBillingPage() {
    return true;
  }

  async function doExtract() {
    uiState = 'extracting'; render();
    try {
      const result = await extractTransactions();
      if (!result.transactions || result.transactions.length === 0) {
        lastError = 'לא נמצאו תנועות — ודא שאתה מחובר למקס';
        uiState = 'error'; render(); return;
      }
      let overlap = { overlapCount: 0, samples: [] };
      try { overlap = await checkMonthOverlap(result.billingMonthKey, result.transactions); }
      catch(e) { /* בדיקת חפיפה היא עזר בלבד — כשלון בה לא אמור לחסום חילוץ */ }
      pendingTxs = { ...result, count: result.transactions.length, overlap };
      uiState = 'preview'; render();
    } catch(e) {
      lastError = 'שגיאה: ' + e.message;
      uiState = 'error'; render();
    }
  }

  async function doSave() {
    if (!pendingTxs) return;
    uiState = 'saving'; render();
    try {
      lastResult = await saveTransactions(pendingTxs);
      pendingTxs = null;
      uiState = 'done'; render();
    } catch(e) {
      lastError = 'שגיאה בשמירה: ' + e.message;
      uiState = 'error'; render();
    }
  }

  // ── SPA navigation detection ──────────────────────────────────────────────
  function checkUrlChange() {
    // re-inject FAB if SPA replaced the body
    if (!document.getElementById('mazan-fab') && document.body) {
      injectStyles();
      injectFAB();
      if (panelOpen) render();
    }

    if (location.href !== currentUrl) {
      currentUrl = location.href;
      panelOpen = false;
      if (currentUser) {
        uiState = isOnBillingPage() ? 'billing' : 'idle';
      }
    }
    if (currentUser && (uiState === 'idle' || uiState === 'billing')) {
      const onBilling = isOnBillingPage();
      if (onBilling && uiState === 'idle') { uiState = 'billing'; if (panelOpen) render(); }
      if (!onBilling && uiState === 'billing') { uiState = 'idle'; if (panelOpen) render(); }
    }
  }

  // ── keep-alive loop (starts immediately, independent of init) ────────────
  setInterval(() => {
    try {
      if (!document.getElementById('mazan-fab') && document.body) {
        injectStyles();
        injectFAB();
        if (panelOpen) render();
      }
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        panelOpen = false;
        if (currentUser) uiState = isOnBillingPage() ? 'billing' : 'idle';
      }
      if (currentUser && (uiState === 'idle' || uiState === 'billing')) {
        const onBilling = isOnBillingPage();
        if (onBilling && uiState === 'idle') { uiState = 'billing'; if (panelOpen) render(); }
        if (!onBilling && uiState === 'billing') { uiState = 'idle'; if (panelOpen) render(); }
      }
    } catch(e) { /* keep running regardless */ }
  }, 300);

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    try { injectStyles(); } catch(e) {}
    try { injectFAB(); } catch(e) {}

    try {
      const stored = GM_getValue('mazan_user', '');
      if (stored) {
        try { currentUser = JSON.parse(stored); } catch(e) { currentUser = null; }
      }
    } catch(e) { currentUser = null; }

    uiState = currentUser ? (isOnBillingPage() ? 'billing' : 'idle') : 'login';
  }

  init();
})();
