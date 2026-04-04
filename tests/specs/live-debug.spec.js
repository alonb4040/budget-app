// מתחבר ל-Chrome האמיתי של המשתמש דרך remote debugging
// מבצע: login → זיוף token פג → reload → תיעוד מה קורה

const { chromium } = require('@playwright/test');

const APP_URL = 'http://localhost:3000';
const LS_KEY = 'sb-fygffuihotnkjmxmveyt-auth-token';

(async () => {
  console.log('🔌 מתחבר ל-Chrome שלך...');
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const contexts = browser.contexts();
  const context = contexts[0];
  const pages = context.pages();

  // פתח tab חדש
  const page = await context.newPage();

  // אסוף console logs
  const logs = [];
  page.on('console', m => {
    const txt = m.text();
    logs.push(`[${m.type()}] ${txt}`);
    console.log(`  console: ${txt}`);
  });

  // ── שלב 1: כנס לאפליקציה ונקה localStorage ──
  console.log('\n📋 שלב 1: כניסה לאפליקציה...');
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('input', { timeout: 10000 });
  console.log('  ✅ מסך התחברות נטען');

  // ── שלב 2: התחבר ──
  console.log('\n📋 שלב 2: מתחבר כ-test5050...');
  await page.locator('input').nth(0).fill('test5050');
  await page.locator('input').nth(1).fill('test5050');
  await page.locator('button').filter({ hasText: /כניסה/i }).first().click();
  await page.waitForTimeout(6000);

  const inputsAfterLogin = await page.locator('input[placeholder]').count();
  if (inputsAfterLogin > 0) {
    console.log('  ❌ ההתחברות נכשלה');
    await page.screenshot({ path: 'tests/screenshots/live-01-login-failed.png' });
    await browser.close();
    return;
  }
  console.log('  ✅ מחובר בהצלחה');
  await page.screenshot({ path: 'tests/screenshots/live-01-logged-in.png' });

  // ── שלב 3: זייף token פג תוקף ──
  console.log('\n📋 שלב 3: מזייף token פג...');
  const tokenInfo = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return { error: 'no token in localStorage' };
    const data = JSON.parse(raw);
    const original = data.expires_at;
    data.expires_at = Math.floor(Date.now() / 1000) - 3600; // שעה אחורה
    data.expires_in = 0;
    localStorage.setItem(key, JSON.stringify(data));
    return {
      original_expires_at: new Date(original * 1000).toISOString(),
      new_expires_at: new Date(data.expires_at * 1000).toISOString(),
      has_refresh_token: !!data.refresh_token,
      user_email: data.user?.email,
    };
  }, LS_KEY);
  console.log('  token info:', JSON.stringify(tokenInfo, null, 2));

  if (tokenInfo.error) {
    console.log('  ❌ לא נמצא token ב-localStorage');
    await browser.close();
    return;
  }

  // ── שלב 4: רענן דף ──
  console.log('\n📋 שלב 4: מרענן דף (מדמה חזרה אחרי שעה)...');
  logs.length = 0; // נקה logs קודמות
  await page.reload({ waitUntil: 'load' });

  // חכה עד 12 שניות לתוצאה
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('input')).some(i => i.placeholder),
    { timeout: 12000 }
  ).catch(() => {});
  await page.waitForTimeout(1000);

  const inputsAfterReload = await page.locator('input[placeholder]').count();
  await page.screenshot({ path: 'tests/screenshots/live-02-after-reload.png' });

  console.log('\n📊 תוצאה:');
  if (inputsAfterReload === 0) {
    console.log('  ✅ הסשן שוחזר — נשאר מחובר אחרי reload עם token פג');
  } else {
    console.log('  ❌ הועבר למסך התחברות — הבאג קיים');

    // ── שלב 5: נסה להתחבר שוב ──
    console.log('\n📋 שלב 5: מנסה להתחבר שוב (בודק lock bug)...');
    logs.length = 0;
    await page.locator('input').nth(0).fill('test5050');
    await page.locator('input').nth(1).fill('test5050');
    const t0 = Date.now();
    await page.locator('button').filter({ hasText: /כניסה/i }).first().click();
    await page.waitForTimeout(10000);
    const elapsed = Date.now() - t0;
    const inputsAfterRetry = await page.locator('input[placeholder]').count();
    await page.screenshot({ path: 'tests/screenshots/live-03-after-retry.png' });
    console.log(`  זמן המתנה: ${(elapsed/1000).toFixed(1)}s`);
    console.log(`  אחרי retry — על מסך התחברות: ${inputsAfterRetry > 0}`);
  }

  console.log('\n📋 Console logs שנאספו אחרי reload:');
  if (logs.length === 0) console.log('  (אין logs)');
  logs.forEach(l => console.log(' ', l));

  console.log('\n✅ סיום. Screenshots נשמרו ב-tests/screenshots/');
  await browser.close();
})();
