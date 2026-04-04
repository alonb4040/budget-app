const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Fill login form - clear first then type
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const type = await input.evaluate(el => el.type);
    await input.click({ clickCount: 3 });
    if (type === 'text' || type === 'email') await input.type('admin');
    if (type === 'password') await input.type('mp625x4egtz27');
  }

  // Click login button
  const btns = await page.$$('button');
  for (const btn of btns) {
    const txt = await btn.evaluate(el => el.textContent.trim());
    if (txt.includes('כניסה') || txt.includes('התחבר')) { await btn.click(); break; }
  }

  // Wait for admin panel to load
  await new Promise(r => setTimeout(r, 6000));
  await page.screenshot({ path: 'tests/ss_admin.png', fullPage: false });
  console.log('Admin top captured');

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'tests/ss_admin_bottom.png', fullPage: false });
  console.log('Admin bottom captured');

  // Full page screenshot
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tests/ss_admin_full.png', fullPage: true });
  console.log('Full page captured');

  // Layout measurements
  const info = await page.evaluate(() => {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const allMaxWidth = Array.from(document.querySelectorAll('*')).filter(el => {
      const s = el.style.maxWidth || window.getComputedStyle(el).maxWidth;
      return s && s.includes('960');
    });
    const el = allMaxWidth[0];
    return {
      windowWidth: window.innerWidth,
      scrollbarWidth: scrollbar,
      scrollbarGutter: window.getComputedStyle(document.documentElement).scrollbarGutter,
      contentWidth: el ? el.getBoundingClientRect().width : null,
      contentLeft: el ? Math.round(el.getBoundingClientRect().left) : null,
      contentRight: el ? Math.round(el.getBoundingClientRect().right) : null,
      url: location.href,
    };
  });
  console.log('Layout:', JSON.stringify(info, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
