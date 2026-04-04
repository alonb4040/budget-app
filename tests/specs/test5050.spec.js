const { test, expect } = require('@playwright/test');

test('test5050 — login + reload stays logged in', async ({ page }) => {
  // 1. login
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.waitForSelector('input', { timeout: 10000 });
  await page.locator('input').nth(0).fill('test5050');
  await page.locator('input').nth(1).fill('test5050');
  await page.locator('button').filter({ hasText: /כניסה/i }).first().click();
  await page.waitForTimeout(5000);

  const inputsAfterLogin = await page.locator('input[placeholder]').count();
  console.log('  after login — on login page:', inputsAfterLogin > 0);
  if (inputsAfterLogin > 0) { console.log('  ❌ LOGIN FAILED'); return; }

  // 2. reload and capture post-reload events
  const reloadEvents = [];
  page.on('console', m => { if (m.text().includes('[App]')) reloadEvents.push(m.text()); });
  await page.reload({ waitUntil: 'load' });

  await page.waitForFunction(
    () => !Array.from(document.querySelectorAll('input')).some(i => i.placeholder),
    { timeout: 12000 }
  ).catch(() => {});
  await page.waitForTimeout(500);

  const inputsAfterReload = await page.locator('input[placeholder]').count();
  console.log('  after reload — on login page:', inputsAfterReload > 0);
  console.log('  reload events:', reloadEvents.join(' | ') || '(none)');
  await page.screenshot({ path: 'tests/screenshots/test5050-after-reload.png' });

  if (inputsAfterReload > 0) {
    // 3. try login again — this was Bug 2
    console.log('  ⚠️ reload failed, testing second login...');
    await page.locator('input').nth(0).fill('test5050');
    await page.locator('input').nth(1).fill('test5050');
    await page.locator('button').filter({ hasText: /כניסה/i }).first().click();
    await page.waitForTimeout(8000);
    const inputsAfterRetry = await page.locator('input[placeholder]').count();
    console.log('  after retry — on login page:', inputsAfterRetry > 0);
    await page.screenshot({ path: 'tests/screenshots/test5050-after-retry.png' });
  }

  expect(inputsAfterReload).toBe(0);
});
