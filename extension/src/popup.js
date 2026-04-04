const SUPABASE_URL = 'https://fygffuihotnkjmxmveyt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5Z2ZmdWlob3Rua2pteG12ZXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMjg1MjgsImV4cCI6MjA4ODgwNDUyOH0.ugyv1h4WQOzKFJMARLEbBLHq7k3i9LXSuQZuMjwfwmk';

let currentUser = null;

const HEBREW_MONTHS_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
function formatBillingMonth(key) {
  if (!key) return null;
  const [y, m] = key.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  return HEBREW_MONTHS_NAMES[m - 1] + ' ' + y;
}

document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['user']);
  if (stored.user) {
    currentUser = stored.user;
    showMain();
    await checkMaxPageStatus();
  } else {
    showLogin();
  }
});

function showLogin() {
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('main-section').style.display = 'none';
}

function showMain() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'block';
  document.getElementById('user-info').textContent = 'מחובר: ' + (currentUser.name || currentUser.username);
}

// בדוק אם המשתמש נמצא בעמוד פירוט מקס
async function checkMaxPageStatus() {
  const response = await chrome.runtime.sendMessage({ action: 'checkMaxPage' });
  const btn = document.getElementById('btn-max');
  const status = document.getElementById('status-max');
  const instructions = document.getElementById('instructions-max');

  if (response.onBillingPage && response.isActiveTab) {
    // ✅ נמצא בעמוד פירוט חיובים וזו הלשונית הפעילה — מוכן לחילוץ
    btn.textContent = 'חלץ תנועות';
    btn.style.background = '#2d6a4f';
    btn.disabled = false;
    status.className = 'provider-status done';
    const monthLabel = formatBillingMonth(response.billingMonth);
    status.textContent = (monthLabel ? monthLabel + ' ' : '') + 'מוכן לחילוץ ✓';
    instructions.style.display = 'block';
    instructions.className = 'instructions-box hint';
    instructions.innerHTML = '💡 רוצה לחלץ חודש אחר? <a href="#" id="link-open-max" style="color:#2d6a4f;font-weight:700;">פתח מקס בלשונית חדשה ←</a>';
    setTimeout(() => {
      const link = document.getElementById('link-open-max');
      if (link) link.addEventListener('click', async (e) => {
        e.preventDefault();
        await chrome.runtime.sendMessage({ action: 'openMax' });
      });
    }, 0);
  } else if (response.onBillingPage && !response.isActiveTab) {
    // מקס פירוט פתוח ברקע — המשתמש בלשונית אחרת
    btn.textContent = 'פתח מקס';
    btn.style.background = '#2d6a4f';
    btn.disabled = false;
    status.className = 'provider-status';
    status.textContent = 'פירוט מקס פתוח ברקע';
    instructions.style.display = 'block';
    instructions.className = 'instructions-box hint';
    instructions.innerHTML = '💡 עבור ללשונית מקס ופתח את התוסף שוב לחילוץ,<br>או לחץ "פתח מקס" לפתיחת חודש חדש.';
  } else if (response.onMaxPage) {
    // באתר מקס אבל לא בעמוד הנכון
    btn.textContent = 'פתח מקס';
    btn.style.background = '#2d6a4f';
    btn.disabled = false;
    status.className = 'provider-status';
    status.textContent = 'מקס פתוח — נווט לפירוט חיובים';
    instructions.style.display = 'block';
    instructions.className = 'instructions-box';
    instructions.innerHTML = '👆 נווט בלשונית מקס:<br><b>כרטיסים → פירוט חיובים → בחר חודש</b><br>ואז פתח שוב את התוסף ולחץ "חלץ תנועות"';
  } else {
    // לא באתר מקס בכלל
    btn.textContent = 'פתח מקס';
    btn.style.background = '#2d6a4f';
    btn.disabled = false;
    status.className = 'provider-status';
    status.textContent = 'לא נמצא עמוד מקס פתוח';
    instructions.style.display = 'block';
    instructions.className = 'instructions-box';
    instructions.innerHTML = '1. לחץ "פתח מקס" ועבור לחשבונך<br>2. נווט: <b>כרטיסים → פירוט חיובים → בחר חודש</b><br>3. פתח שוב את התוסף ולחץ "חלץ תנועות"';
  }
}

// Login
document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errorEl  = document.getElementById('login-error');
  errorEl.textContent = '';
  if (!username || !password) { errorEl.textContent = 'נא למלא שם משתמש וסיסמה'; return; }

  try {
    const res = await fetch(
      SUPABASE_URL + '/rest/v1/clients?username=eq.' + encodeURIComponent(username) + '&select=*',
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }
    );
    const data = await res.json();
    if (!data || data.length === 0) { errorEl.textContent = 'משתמש לא נמצא'; return; }
    const user = data[0];
    if (user.password !== password) { errorEl.textContent = 'סיסמה שגויה'; return; }
    currentUser = user;
    await chrome.storage.local.set({ user });
    showMain();
    await checkMaxPageStatus();
  } catch(e) {
    errorEl.textContent = 'שגיאת התחברות';
  }
});

// כפתור מקס
document.getElementById('btn-max').addEventListener('click', async () => {
  const btn    = document.getElementById('btn-max');
  const status = document.getElementById('status-max');
  const instructions = document.getElementById('instructions-max');

  const pageCheck = await chrome.runtime.sendMessage({ action: 'checkMaxPage' });

  if (!pageCheck.onMaxPage) {
    // אין tab של מקס — פתח tab חדש
    await chrome.runtime.sendMessage({ action: 'openMax' });
    instructions.style.display = 'block';
    instructions.innerHTML = '✅ מקס נפתחה בכרטיסייה חדשה.<br>1. היכנס לחשבון שלך<br>2. נווט: <b>כרטיסים → פירוט חיובים → בחר חודש</b><br>3. חזור לכאן ולחץ "חלץ תנועות"';
    btn.textContent = 'חלץ תנועות';
    status.className = 'provider-status syncing';
    status.textContent = 'ממתין לניווט לעמוד פירוט...';
    return;
  }

  if (!pageCheck.onBillingPage) {
    // באתר מקס אבל לא בעמוד הנכון — פתח עמוד פירוט חיובים בטאב חדש
    chrome.tabs.create({ url: 'https://www.max.co.il/charges/charges' });
    status.className = 'provider-status syncing';
    status.textContent = 'נפתח עמוד פירוט חיובים...';
    instructions.style.display = 'block';
    instructions.innerHTML = '⏳ בחר את החודש הרצוי ופתח שוב את התוסף ולחץ "חלץ תנועות"';
    return;
  }

  // נמצאים בעמוד הנכון — חלץ
  btn.disabled = true;
  instructions.style.display = 'none';
  status.className = 'provider-status syncing';
  status.innerHTML = 'מחלץ תנועות... <span class="spinner"></span>';

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'extractNow',
      userId: currentUser.id,
    });

    if (result && result.success) {
      status.className = 'provider-status done';
      status.textContent = result.added + ' תנועות נוספו ✓';
      if (result.duplicates > 0) {
        status.textContent += ' · ' + result.duplicates + ' כפילויות דולגו';
      }

      const box = document.getElementById('result-box');
      box.style.display = 'block';
      document.getElementById('result-added').textContent = result.added;
      if (result.duplicates > 0) {
        document.getElementById('result-dups').textContent = result.duplicates + ' כפילויות דולגו';
      }
      if (result.billingMonthKey) {
        document.getElementById('result-month').textContent = 'חודש חיוב: ' + result.billingMonthKey;
      }
    } else {
      status.className = 'provider-status error';
      status.textContent = (result && result.error) ? result.error : 'שגיאה — נסה שוב';
    }
  } catch(e) {
    status.className = 'provider-status error';
    status.textContent = 'שגיאה: ' + e.message;
  }

  btn.disabled = false;
});

// כפתור התנתקות
document.getElementById('btn-logout').addEventListener('click', async () => {
  await chrome.storage.local.remove(['user']);
  currentUser = null;
  showLogin();
});
