const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'], defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.reload({ waitUntil: 'networkidle2' });

  // Take login page screenshot first
  await page.screenshot({ path: 'tests/ss_final_login.png' });

  // Login as admin
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const type = await input.evaluate(el => el.type);
    await input.click({ clickCount: 3 });
    if (type === 'text' || type === 'email') await input.type('admin');
    if (type === 'password') await input.type('mp625x4egtz27');
  }
  const btns = await page.$$('button');
  for (const btn of btns) {
    const txt = await btn.evaluate(el => el.textContent.trim());
    if (txt.includes('כניסה') || txt.includes('התחבר')) { await btn.click(); break; }
  }

  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: 'tests/ss_final_admin.png' });

  const info = await page.evaluate(() => ({
    overflowY: window.getComputedStyle(document.documentElement).overflowY,
    scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
    scrollbarTrack: window.getComputedStyle(document.documentElement, '::-webkit-scrollbar-track').background,
    windowWidth: window.innerWidth,
  }));
  console.log('Layout:', JSON.stringify(info, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
