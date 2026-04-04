const puppeteer = require('puppeteer');

(async () => {
  // Use non-headless to show real scrollbar behavior
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--start-maximized'],
    defaultViewport: null
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Hard reload to pick up index.html changes
  await page.reload({ waitUntil: 'networkidle2' });

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

  // Check overflow-y and scrollbar
  const info = await page.evaluate(() => ({
    overflowY: window.getComputedStyle(document.documentElement).overflowY,
    scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
    windowWidth: window.innerWidth,
    docClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  console.log('CSS info:', JSON.stringify(info, null, 2));

  await page.screenshot({ path: 'tests/ss_real_admin.png', fullPage: false });
  console.log('Screenshot saved');

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'tests/ss_real_admin_bottom.png', fullPage: false });
  console.log('Bottom screenshot saved');

  await browser.close();
})().catch(e => console.error('Error:', e.message));
