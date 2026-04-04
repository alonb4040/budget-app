// בדיקה: האם רענון דף עובד כשה-access token פג תוקף?
// מדמה token פג בלי לחכות שעה — מזייפים את expires_at ב-localStorage

const { test, expect } = require('@playwright/test');

const LS_KEY = 'sb-fygffuihotnkjmxmveyt-auth-token';

test('expired token — reload restores session via TOKEN_REFRESHED', async ({ page }) => {
  // 1. login
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.waitForSelector('input', { timeout: 10000 });
  await page.locator('input').nth(0).fill('test5050');
  await page.locator('input').nth(1).fill('test5050');
  await page.locator('button').filter({ hasText: /כניסה/i }).first().click();
  await page.waitForTimeout(5000);

  const inputsAfterLogin = await page.locator('input[placeholder]').count();
  if (inputsAfterLogin > 0) {
    console.log('  ❌ LOGIN FAILED — cannot continue test');
    return;
  }
  console.log('  ✅ login OK');

  // 2. expire the access token in localStorage (keep refresh token intact)
  const expired = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Set expires_at to 1 hour ago (in unix seconds)
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    data.expires_at = oneHourAgo;
    data.expires_in = 0;
    localStorage.setItem(key, JSON.stringify(data));
    return { expires_at: data.expires_at, has_refresh_token: !!data.refresh_token };
  }, LS_KEY);

  console.log('  token manipulated:', expired);

  // 3. reload — this simulates coming back after an hour
  await page.reload({ waitUntil: 'load' });

  // Wait up to 10s for the app to resolve (token refresh + buildSession)
  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('input')).some(i => i.placeholder),
    { timeout: 10000 }
  ).catch(() => {});
  await page.waitForTimeout(500);

  const inputsAfterReload = await page.locator('input[placeholder]').count();
  console.log('  after reload with expired token — on login page:', inputsAfterReload > 0);
  await page.screenshot({ path: 'tests/screenshots/expired-token-after-reload.png' });

  if (inputsAfterReload > 0) {
    console.log('  ❌ BUG CONFIRMED — expired token causes redirect to login');

    // Also test: can the user log in after this? (the lock bug)
    console.log('  testing login after failed reload...');
    await page.locator('input').nth(0).fill('test5050');
    await page.locator('input').nth(1).fill('test5050');
    await page.locator('button').filter({ hasText: /כניסה/i }).first().click();
    await page.waitForTimeout(8000);
    const inputsAfterRetry = await page.locator('input[placeholder]').count();
    console.log('  after login retry — on login page:', inputsAfterRetry > 0);
    await page.screenshot({ path: 'tests/screenshots/expired-token-after-retry.png' });
  } else {
    console.log('  ✅ session restored correctly after expired token reload');
  }

  expect(inputsAfterReload).toBe(0);
});
