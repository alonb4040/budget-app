const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Login as test1010
  const inputs = await page.$$('input');
  for (const input of inputs) {
    const type = await input.evaluate(el => el.type);
    await input.click({ clickCount: 3 });
    if (type === 'text' || type === 'email') await input.type('test1010');
    if (type === 'password') await input.type('test1010');
  }
  const btns = await page.$$('button');
  for (const btn of btns) {
    const txt = await btn.evaluate(el => el.textContent.trim());
    if (txt.includes('כניסה') || txt.includes('התחבר')) { await btn.click(); break; }
  }

  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: 'tests/ss_client_top.png' });
  console.log('Client top captured');

  // Scroll down to verify sticky header
  await page.evaluate(() => window.scrollTo(0, 600));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'tests/ss_client_scrolled.png' });
  console.log('Client scrolled captured');

  // Check right margin symmetry
  const info = await page.evaluate(() => {
    const el = document.querySelector('[style*="960"]') ||
               Array.from(document.querySelectorAll('div')).find(d =>
                 d.style.maxWidth === '960px' || window.getComputedStyle(d).maxWidth === '960px'
               );
    const header = document.querySelector('[style*="sticky"]');
    return {
      windowWidth: window.innerWidth,
      scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
      contentLeft: el ? Math.round(el.getBoundingClientRect().left) : null,
      contentRight: el ? Math.round(el.getBoundingClientRect().right) : null,
      headerPosition: header ? window.getComputedStyle(header).position : null,
      scrollY: window.scrollY,
    };
  });
  console.log('Layout:', JSON.stringify(info, null, 2));

  await browser.close();
})().catch(e => console.error('Error:', e.message));
