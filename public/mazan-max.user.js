// ==UserScript==
// @name         מאזן MAX Sync
// @namespace    https://github.com/alonb4040/budget-app
// @version      1.4.1
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
  const HEBREW_MONTHS = { ינואר:1,פברואר:2,'מרץ':3,אפריל:4,מאי:5,יוני:6,יולי:7,אוגוסט:8,ספטמבר:9,אוקטובר:10,נובמבר:11,דצמבר:12 };

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
        onload: (res) => {
          const ok = res.status >= 200 && res.status < 300;
          resolve({
            ok,
            status: res.status,
            text: () => Promise.resolve(res.responseText),
            json: () => Promise.resolve(JSON.parse(res.responseText)),
          });
        },
        onerror: reject,
        ontimeout: reject,
      });
    });
  }

  // ── computeHash ───────────────────────────────────────────────────────────
  async function computeHash(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('').substring(0,32);
  }

  // ── formatBillingMonth ────────────────────────────────────────────────────
  function formatBillingMonth(key) {
    if (!key) return '';
    const [y, m] = key.split('-').map(Number);
    const names = ['','ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
    return (names[m] || '') + ' ' + y;
  }

  // ── extractTransactions — DOM scraping (ported from background.js) ────────
  function extractTransactions() {
    const hebrewMonths = Object.keys(HEBREW_MONTHS);
    let billingMonthKey = null;
    let maxBillingTotal = null;

    // זיהוי חודש חיוב — אסטרטגיה 1: native select
    for (const sel of document.querySelectorAll('select')) {
      const opt = sel.options[sel.selectedIndex];
      const text = opt ? (opt.textContent || '') : '';
      for (const hm of hebrewMonths) {
        const idx = text.indexOf(hm);
        if (idx === -1) continue;
        const rest = text.substring(idx + hm.length).trim();
        const m = rest.match(/^\d{4}/);
        if (m) { billingMonthKey = m[0] + '-' + String(HEBREW_MONTHS[hm]).padStart(2,'0'); break; }
      }
      if (billingMonthKey) break;
    }

    // אסטרטגיה 2: active/selected elements
    if (!billingMonthKey) {
      for (const el of document.querySelectorAll('[class*="selected"],[class*="active"],[aria-selected="true"]')) {
        const text = el.textContent || '';
        for (const hm of hebrewMonths) {
          const idx = text.indexOf(hm);
          if (idx === -1) continue;
          const rest = text.substring(idx + hm.length).trim();
          const m = rest.match(/^\d{4}/);
          if (m) { billingMonthKey = m[0] + '-' + String(HEBREW_MONTHS[hm]).padStart(2,'0'); break; }
        }
        if (billingMonthKey) break;
      }
    }

    // אסטרטגיה 3: scan page text
    if (!billingMonthKey) {
      for (const line of document.body.innerText.split('\n').map(l => l.trim()).filter(Boolean)) {
        for (const hm of hebrewMonths) {
          const idx = line.indexOf(hm);
          if (idx === -1) continue;
          const rest = line.substring(idx + hm.length).trim();
          const m = rest.match(/^(\d{4})/);
          if (m) { billingMonthKey = m[1] + '-' + String(HEBREW_MONTHS[hm]).padStart(2,'0'); break; }
        }
        if (billingMonthKey) break;
      }
    }

    // יתרת תשלום מ-deal-table
    const dealTable = document.querySelector('.deal-table');
    if (dealTable) {
      for (const ln of dealTable.innerText.split('\n').map(l => l.trim()).filter(Boolean)) {
        if (ln.includes('יתרת')) {
          const nums = ln.replace(/[^\d.]/g,' ').trim().split(/\s+/).filter(Boolean);
          if (nums.length) { maxBillingTotal = parseFloat(nums[nums.length-1]); break; }
        }
      }
    }

    // חלץ תנועות מ-row-stripes
    function cleanAmount(str) {
      let out = '';
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        if (c===0x20AA||c===0x24||c===0x200F||c===0x200E||str[i]===','||str[i]===' ') continue;
        out += str[i];
      }
      return out.trim();
    }
    function findAmountLine(lines) {
      for (let i = lines.length-1; i >= 0; i--) {
        const l = lines[i]; const c0 = l.charCodeAt(0);
        if (c0===0x20AA||c0===0x24) return l;
        if ((c0===0x200F||c0===0x200E)&&l.length>1) {
          const c1 = l.charCodeAt(1);
          if (c1===0x20AA||c1===0x24) return l;
        }
      }
      return null;
    }

    const transactions = [];
    for (const wrapper of document.querySelectorAll('.table-wrapper')) {
      for (const row of wrapper.querySelectorAll('.row-stripes')) {
        const lines = row.innerText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 3) continue;
        if (!/^\d{2}\.\d{2}\.\d{2}$/.test(lines[0])) continue;
        const amountLine = findAmountLine(lines);
        if (!amountLine) continue;
        const amount = parseFloat(cleanAmount(amountLine));
        if (!lines[1] || isNaN(amount) || amount <= 0) continue;
        const parts = lines[0].split('.');
        if (parts.length !== 3) continue;
        transactions.push({
          date: '20'+parts[2]+'-'+parts[1]+'-'+parts[0],
          name: lines[1].trim(),
          amount,
          maxCategory: lines[2] || null,
          billing_month: billingMonthKey || null,
        });
      }
    }

    return { transactions, billingMonthKey, maxBillingTotal };
  }

  // ── saveTransactions ──────────────────────────────────────────────────────
  async function saveTransactions({ transactions, billingMonthKey, maxBillingTotal }) {
    const auth = { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + currentUser.accessToken, 'Content-Type': 'application/json' };
    const userId = currentUser.id;

    // יצור import_batch
    let batchId = null;
    try {
      const r = await gmFetch(SUPA_URL+'/rest/v1/import_batches', {
        method: 'POST',
        headers: { ...auth, 'Prefer': 'return=representation' },
        body: JSON.stringify({ client_id: userId, source_type: 'userscript', provider: 'max', total_received: transactions.length, billing_month: billingMonthKey||null, max_billing_total: maxBillingTotal||null, status: 'processing', created_at: new Date().toISOString() }),
      });
      const d = await r.json();
      batchId = Array.isArray(d) ? d[0]?.id : null;
    } catch(e) { /* optional */ }

    let added = 0, duplicates = 0;
    for (const tx of transactions) {
      const hash = await computeHash('|'+tx.date+'|'+tx.amount+'|'+tx.name+'|'+(tx.billing_month||''));
      const check = await gmFetch(SUPA_URL+'/rest/v1/imported_transactions?tx_hash=eq.'+hash+'&client_id=eq.'+userId+'&select=id', { headers: auth });
      const existing = await check.json();
      if (existing && existing.length > 0) { duplicates++; continue; }
      const ins = await gmFetch(SUPA_URL+'/rest/v1/imported_transactions', {
        method: 'POST',
        headers: { ...auth, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ client_id: userId, import_batch_id: batchId, source_type: 'userscript', provider: 'max', date: tx.date, name: tx.name, amount: tx.amount, max_category: tx.maxCategory||null, tx_hash: hash, billing_month: tx.billing_month||billingMonthKey||null, created_at: new Date().toISOString() }),
      });
      if (ins.ok) added++;
    }

    if (batchId) {
      await gmFetch(SUPA_URL+'/rest/v1/import_batches?id=eq.'+batchId, { method:'PATCH', headers:auth, body: JSON.stringify({ added, duplicates, status:'done' }) }).catch(()=>{});
    }

    const now = new Date().toISOString();
    await gmFetch(SUPA_URL+'/rest/v1/clients?id=eq.'+userId, { method:'PATCH', headers:auth, body: JSON.stringify({ max_last_sync: now }) }).catch(()=>{});
    await gmFetch(SUPA_URL+'/rest/v1/sync_log', { method:'POST', headers:{ ...auth,'Prefer':'return=minimal' }, body: JSON.stringify({ client_id: userId, synced_at: now, transactions_count: added, status:'success', source:'userscript' }) }).catch(()=>{});

    return { added, duplicates, billingMonthKey };
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
          <span class="mz-ver">v1.4.1</span>
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
      body.innerHTML = `
        <div class="mz-preview">
          <div>נמצאו <span class="num">${pendingTxs.count}</span> תנועות</div>
          ${monthLabel ? `<div style="color:#5d4037;font-size:11px;margin-top:3px;">חודש חיוב: ${monthLabel}</div>` : ''}
          <div class="mz-row">
            <button class="mz-btn" id="mz-confirm">שמור ✓</button>
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
  function isOnBillingPage() {
    return !!document.querySelector('.deal-table');
  }

  function doExtract() {
    uiState = 'extracting'; render();
    try {
      const result = extractTransactions();
      if (!result.transactions || result.transactions.length === 0) {
        lastError = 'לא נמצאו תנועות — ודא שבחרת חודש ספציפי';
        uiState = 'error'; render(); return;
      }
      pendingTxs = { ...result, count: result.transactions.length };
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
