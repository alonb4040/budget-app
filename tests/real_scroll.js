const puppeteer = require('puppeteer');

(async () => {
  // Force real (non-overlay) scrollbar
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-features=OverlayScrollbar',
      '--disable-overlay-scrollbar'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.reload({ waitUntil: 'networkidle2' });

  const info = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    return {
      windowWidth: window.innerWidth,
      docClientWidth: html.clientWidth,
      scrollbarWidth: window.innerWidth - html.clientWidth,
      htmlDirection: window.getComputedStyle(html).direction,
      bodyDirection: window.getComputedStyle(body).direction,
      bodyBCR: body.getBoundingClientRect(),
      bodyOffsetLeft: body.offsetLeft,
    };
  });
  console.log('Info:', JSON.stringify(info, null, 2));
  console.log('Scrollbar is on:', info.bodyOffsetLeft > 0 ? 'LEFT (shifts content right)' : 'RIGHT (normal)');

  await page.screenshot({ path: 'tests/ss_scrollbar_test.png' });
  await browser.close();
})().catch(e => console.error(e.message));
