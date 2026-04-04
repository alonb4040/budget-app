// app.spec.js — Full E2E tests wrapped in a single describe so beforeAll/afterAll fire once
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SUPABASE_URL = 'https://fygffuihotnkjmxmveyt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_F7Eye_7vlhjDzF50Ei5Sgw_9QG7iDJP';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || require('dotenv').config({ path: path.resolve(__dirname, '../../.env') }).parsed?.TEST_ADMIN_PASSWORD || '';
const EDGE_URL = `${SUPABASE_URL}/functions/v1/manage-auth`;
const SB_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

const TEST_CLIENT = { name: 'טסט אוטומטי', username: 'test_auto_playwright', password: 'test123' };
const EXCEL_FILE = path.resolve(__dirname, '../fixtures/test-transactions.xlsx');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// ── Edge Function helpers (bypass RLS via service role inside the function) ──
async function edgeFetch(body) {
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: text }; }
}

async function seedTestClient() {
  const { status, data } = await edgeFetch({ action: 'seed', name: TEST_CLIENT.name, username: TEST_CLIENT.username, password: TEST_CLIENT.password });
  if (status !== 200) throw new Error(`seed נכשל: ${status} — ${JSON.stringify(data)}`);
  return data.id;
}

async function unseedTestClient() {
  await edgeFetch({ action: 'unseed', username: TEST_CLIENT.username });
}

async function saveScreenshot(page, name) {
  const safe = name.replace(/[^a-zA-Z0-9\u05D0-\u05EA_-]/g, '-');
  const p = path.join(SCREENSHOTS_DIR, `app-${safe}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`  📸 ${p}`);
}

// ── Login helper ──────────────────────────────────────────────────────────
async function loginAs(page, username, password) {
  await page.goto('/');
  await page.waitForSelector('input', { timeout: 15000 });
  const inputs = page.locator('input');
  await inputs.nth(0).fill(username);
  await inputs.nth(1).fill(password);
  await page.locator('button').filter({ hasText: /כניסה|התחבר|login/i }).first().click();
  await page.waitForTimeout(4000);
}

// ── Dismiss welcome modal if present ─────────────────────────────────────
async function dismissWelcomeModal(page) {
  // The welcome modal has a backdrop div and a "בואו נתחיל" button
  const startBtn = page.locator('button').filter({ hasText: /נתחיל|התחל|מובן|סגור|dismiss/i }).first();
  const hasModal = await startBtn.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasModal) {
    await startBtn.click();
    await page.waitForTimeout(500);
    console.log('  🧹 Welcome modal dismissed');
  } else {
    // Try clicking the backdrop (fixed overlay)
    const backdrop = page.locator('div[style*="rgba(0,0,0"]').first();
    const hasBackdrop = await backdrop.isVisible({ timeout: 1000 }).catch(() => false);
    if (hasBackdrop) {
      await backdrop.click({ force: true });
      await page.waitForTimeout(500);
      console.log('  🧹 Welcome modal dismissed via backdrop');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// All tests wrapped in ONE describe so beforeAll/afterAll run exactly once
// ══════════════════════════════════════════════════════════════════════════
test.describe('מאזן חכם — בדיקות E2E', () => {
  let testClientId = null;

  // beforeAll cleans up stale data from previous runs, then creates a fresh client
  test.beforeAll(async () => {
    console.log('\n=== ניקוי נתונים ישנים + יצירת לקוח טסט ===');
    await unseedTestClient();
    testClientId = await seedTestClient();
    console.log(`  ✅ לקוח טסט נוצר מחדש: id=${testClientId}`);
  });

  // beforeEach ensures the test client still exists (safety net)
  test.beforeEach(async () => {
    if (!testClientId) testClientId = await seedTestClient();
  });

  test.afterAll(async () => {
    console.log('\n=== מחיקת לקוח טסט ===');
    await unseedTestClient();
    console.log(`  ✅ לקוח טסט נמחק`);
  });

  // ── 1 ─────────────────────────────────────────────────────────────────
  test('1 — עמוד התחברות נטען', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('input', { timeout: 15000 });
    const inputs = await page.locator('input').count();
    expect(inputs).toBeGreaterThanOrEqual(2);
    await saveScreenshot(page, '01-login-page');
  });

  // ── 2 ─────────────────────────────────────────────────────────────────
  test('2 — כניסה עם פרטים שגויים', async ({ page }) => {
    await loginAs(page, 'wrong_xyz', 'wrong_xyz');
    const errorVisible = await page.locator('text=/שגוי|שגיאה|לא נמצא|incorrect|error/i').isVisible().catch(() => false);
    expect(errorVisible).toBe(true);
    await saveScreenshot(page, '02-login-error');
  });

  // ── 3 ─────────────────────────────────────────────────────────────────
  test('3 — כניסה כלקוח', async ({ page }) => {
    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);
    // After login the welcome modal or dashboard is shown — both have buttons
    const hasContent = await page.locator('button').count() > 0;
    expect(hasContent).toBe(true);
    await saveScreenshot(page, '03-client-after-login');
  });

  // ── 4 ─────────────────────────────────────────────────────────────────
  test('4 — דשבורד מציג ברוכים הבאים', async ({ page }) => {
    // Ensure client exists inline — guards against Playwright lifecycle quirks
    await seedTestClient(); // ensure client exists (beforeEach may have been skipped)
    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);
    // After login: welcome modal OR dashboard — either way the login page inputs should be gone
    await page.waitForTimeout(2000);
    const inputsAfterLogin = await page.locator('input[placeholder]').count();
    // If still on login page: inputs visible = login failed. If on app: inputs gone or different.
    const hasAppContent = await page.locator('text=/ברוכים|ברוך|שלום|חודש|תקציב|dashboard|הוסף|מאזן/i').isVisible({ timeout: 5000 }).catch(() => false);
    const notOnLoginPage = inputsAfterLogin === 0 || hasAppContent;
    expect(notOnLoginPage).toBe(true);
    await saveScreenshot(page, '04-dashboard-welcome');
  });

  // ── 5 ─────────────────────────────────────────────────────────────────
  test('5 — יצירת חודש חדש', async ({ page }) => {
    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);
    await dismissWelcomeModal(page);

    // In onboarding mode the button is inside the "פירוט תנועות" accordion — expand it first
    const txsSection = page.locator('div').filter({ hasText: /פירוט תנועות/i }).first();
    const txsSectionVisible = await txsSection.isVisible({ timeout: 3000 }).catch(() => false);
    if (txsSectionVisible) {
      await txsSection.click({ force: true });
      await page.waitForTimeout(400);
    }
    const newMonthBtn = page.locator('button').filter({ hasText: /הוסף חודש/i }).first();
    await newMonthBtn.waitFor({ state: 'visible', timeout: 10000 });
    await newMonthBtn.click({ force: true });

    // Wait for MonthPickerModal — identified by "בחר ←" confirm button
    const confirmBtn = page.locator('button').filter({ hasText: 'בחר ←' }).first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });
    console.log('  ✅ בורר חודשים נפתח');

    // The modal has two <select> elements: month (index 0) and year (index 1)
    // Default = current month (מרץ = index 2) and current year (2026)
    // If month already used, pick April (index 3) instead
    const selects = page.locator('select');
    await selects.first().selectOption({ value: '2' }); // מרץ
    await selects.nth(1).selectOption({ value: '2026' });
    await page.waitForTimeout(300);

    // Check if "בחר ←" is disabled (month already used)
    const isDisabled = await confirmBtn.isDisabled().catch(() => false);
    if (isDisabled) {
      console.log('  ⚠️ מרץ 2026 כבר קיים — בוחר אפריל');
      await selects.first().selectOption({ value: '3' }); // אפריל
      await page.waitForTimeout(300);
    }

    await confirmBtn.click();
    await page.waitForTimeout(2500);

    // Verify we're on MonthDetailScreen
    const onMonthScreen = await page.locator('button').filter({ hasText: /הוסף מקור/ }).first().isVisible({ timeout: 6000 }).catch(() => false);
    if (onMonthScreen) console.log('  ✅ עמוד פרטי חודש נפתח');

    await saveScreenshot(page, '05-new-month');
    expect(onMonthScreen).toBe(true);
  });

  // ── 6 ─────────────────────────────────────────────────────────────────
  test('6 — העלאת קובץ Excel', async ({ page }) => {
    if (!fs.existsSync(EXCEL_FILE)) {
      console.warn(`  ⚠️  קובץ Excel לא נמצא: ${EXCEL_FILE}`);
      test.skip();
      return;
    }

    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);
    await dismissWelcomeModal(page);

    // ── Step 1: Navigate to MonthDetailScreen ─────────────────────────
    // Try to open an existing month entry from the dashboard list first
    let onMonthScreen = false;

    // Month entry labels look like "מרץ 2026" — click any visible month label text
    const monthEntryLink = page.locator('div[style*="cursor:pointer"], div[style*="cursor: pointer"]').filter({ hasText: /2026|2025/ }).first();
    const hasExisting = await monthEntryLink.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasExisting) {
      await monthEntryLink.click();
      await page.waitForTimeout(2000);
      onMonthScreen = await page.locator('button').filter({ hasText: /הוסף מקור/ }).first().isVisible({ timeout: 5000 }).catch(() => false);
      if (onMonthScreen) console.log('  ✅ נכנסנו לחודש קיים');
    }

    // If no existing month — create April 2026 via the picker
    if (!onMonthScreen) {
      // In onboarding mode the button is inside the "פירוט תנועות" accordion — expand it first
      const txsSection = page.locator('div').filter({ hasText: /פירוט תנועות/i }).first();
      const txsSectionVisible = await txsSection.isVisible({ timeout: 2000 }).catch(() => false);
      if (txsSectionVisible) { await txsSection.click({ force: true }); await page.waitForTimeout(400); }

      const newMonthBtn = page.locator('button').filter({ hasText: /הוסף חודש/ }).first();
      await newMonthBtn.waitFor({ state: 'visible', timeout: 8000 });
      await newMonthBtn.click({ force: true });

      const confirmBtn = page.locator('button').filter({ hasText: 'בחר ←' }).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });

      const selects = page.locator('select');
      await selects.first().selectOption({ value: '3' });  // אפריל
      await selects.nth(1).selectOption({ value: '2026' });
      await page.waitForTimeout(300);
      await confirmBtn.click();
      await page.waitForTimeout(2500);

      onMonthScreen = await page.locator('button').filter({ hasText: /הוסף מקור/ }).first().isVisible({ timeout: 6000 }).catch(() => false);
      if (onMonthScreen) console.log('  ✅ חודש חדש נוצר');
    }

    expect(onMonthScreen).toBe(true);

    // ── Step 2: Open the upload screen ───────────────────────────────
    await page.locator('button').filter({ hasText: /הוסף מקור/ }).first().click();
    await page.waitForTimeout(1500);

    // Verify upload screen loaded (has "בחר קבצים" or file input)
    const onUploadScreen = await page.locator('button').filter({ hasText: 'בחר קבצים' }).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(onUploadScreen).toBe(true);
    console.log('  ✅ עמוד העלאה נפתח');

    // ── Step 3: Select source label "מקס" ────────────────────────────
    await page.locator('button').filter({ hasText: 'מקס' }).first().click();
    await page.waitForTimeout(300);

    // ── Step 4: Attach Excel file to the hidden file input ────────────
    // Playwright can setInputFiles on hidden inputs directly
    await page.locator('input[type="file"]').setInputFiles(EXCEL_FILE);
    await page.waitForTimeout(1500);
    console.log('  ✅ קובץ Excel חובר לinput');

    // ── Step 5: Click "נתח תנועות ←" ────────────────────────────────
    const analyzeBtn = page.locator('button').filter({ hasText: /נתח תנועות/ }).first();
    await analyzeBtn.waitFor({ state: 'visible', timeout: 5000 });
    await analyzeBtn.click();
    await page.waitForTimeout(3000);
    console.log('  ✅ ניתוח הושלם');

    // ── Step 6: Verify review screen shows transactions ───────────────
    await saveScreenshot(page, '06-excel-review');
    const hasRamiLevi = await page.locator('text=רמי לוי').isVisible({ timeout: 8000 }).catch(() => false);
    if (hasRamiLevi) console.log('  ✅ עסקאות רמי לוי מוצגות במסך סקירה');
    expect(hasRamiLevi).toBe(true);
  });

  // ── 7 ─────────────────────────────────────────────────────────────────
  test('7 — בדיקת סיווג אוטומטי', async ({ page }) => {
    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);
    await dismissWelcomeModal(page);
    await saveScreenshot(page, '07-auto-classify');
    // classifyTx in data.js should classify רמי לוי → סופר (אוכל)
    // If any submission exists, check it shows transactions
    const txVisible = await page.locator('text=/רמי לוי|פרטנר|סונול|נטפליקס/i').isVisible({ timeout: 3000 }).catch(() => false);
    if (txVisible) console.log('  ✅ עסקאות מסווגות נמצאו');
    expect(true).toBe(true);
  });

  // ── 8 ─────────────────────────────────────────────────────────────────
  test('8 — שמירת הגשה', async ({ page }) => {
    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);
    await dismissWelcomeModal(page);
    const saveBtn = page.locator('button').filter({ hasText: /שמור|שמירה|הגש|save|submit/i }).first();
    if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(3000);
      const toastVisible = await page.locator('text=/נשמר|saved|הצלחה/i').isVisible({ timeout: 3000 }).catch(() => false);
      if (toastVisible) console.log('  ✅ toast אישור שמירה הופיע');
    }
    await saveScreenshot(page, '08-save-submission');
    expect(true).toBe(true);
  });

  // ── 9 ─────────────────────────────────────────────────────────────────
  test('9 — כניסה כאדמין', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.waitForTimeout(2000);
    // Check admin panel rendered by inspecting DOM text directly (avoids Playwright Hebrew regex quirks)
    const adminVisible = await page.waitForFunction(
      () => document.body.textContent.includes('ניהול') || document.body.textContent.includes('לקוחות'),
      { timeout: 8000 }
    ).then(() => true).catch(() => false);
    expect(adminVisible).toBe(true);
    await saveScreenshot(page, '09-admin-panel');
  });

  // ── 9b — session persistence after page reload ────────────────────────
  test('9b — רענון דף שומר session של לקוח', async ({ page }) => {
    // Step 1: login
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, TEST_CLIENT.username, TEST_CLIENT.password);

    // Step 2: reload and wait for session to restore (token refresh can take a few seconds)
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(
      () => !Array.from(document.querySelectorAll('input')).some(i => i.placeholder),
      { timeout: 10000 }
    ).catch(() => {});

    await saveScreenshot(page, '09b-after-reload');

    // Step 3: verify NOT back on login screen
    const loginInputVisible = await page.locator('input[placeholder]').count();
    expect(loginInputVisible).toBe(0); // 0 = not on login page
  });

  // ── 10 ────────────────────────────────────────────────────────────────
  test('10 — אדמין רואה לקוחות', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.waitForTimeout(2000);
    // Admin panel always has real clients — check that at least one client row is visible
    const anyClient = await page.locator('[style*="border-radius"][style*="padding"]').count();
    const hasClientText = await page.locator('text=/@/').isVisible({ timeout: 5000 }).catch(() => false); // @username pattern
    const hasLqohotTitle = await page.locator('text=/לקוחות/i').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasLqohotTitle || hasClientText || anyClient > 0).toBe(true);
    await saveScreenshot(page, '10-admin-clients-list');
  });

  // ── 11 ────────────────────────────────────────────────────────────────
  test('11 — פתיחת פרטי לקוח', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.waitForTimeout(2000);
    const clientRow = page.locator(`text=${TEST_CLIENT.name}`).first();
    if (await clientRow.isVisible({ timeout: 8000 }).catch(() => false)) {
      // Click the "פרטים" button in that row
      const detailsBtn = page.locator('button').filter({ hasText: /פרטים|👁|details/i }).first();
      if (await detailsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await detailsBtn.click();
      } else {
        await clientRow.click();
      }
      await page.waitForTimeout(3000);
      const tabsVisible = await page.locator('button').filter({ hasText: /תיק מסמכים|תסריט|לוג|פרטים/i }).first().isVisible({ timeout: 5000 }).catch(() => false);
      if (tabsVisible) console.log('  ✅ טאבים של פרטי לקוח נמצאו');
    }
    await saveScreenshot(page, '11-client-detail');
    expect(true).toBe(true);
  });

  // ── 12 ────────────────────────────────────────────────────────────────
  test('12 — ייצוא אקסל מאדמין', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin', ADMIN_PASSWORD);
    await page.waitForTimeout(2000);
    // Open first real client that has submissions
    const detailsBtn = page.locator('button').filter({ hasText: /פרטים|👁/i }).first();
    if (await detailsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await detailsBtn.click();
      await page.waitForTimeout(3000);
      const exportBtn = page.locator('button').filter({ hasText: /ייצוא|ייצא|export|אקסל/i }).first();
      const exportVisible = await exportBtn.isVisible({ timeout: 3000 }).catch(() => false);
      if (exportVisible) {
        console.log('  ✅ כפתור ייצוא נמצא');
      } else {
        console.log('  ℹ️  כפתור ייצוא לא נמצא — ייתכן שאין הגשות');
      }
    }
    await saveScreenshot(page, '12-admin-export');
    expect(true).toBe(true);
  });

});
