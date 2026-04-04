const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-features=OverlayScrollbar,OverlayScrollbarFlashAfterAnyScrollUpdate,OverlayScrollbarFlashWhenMouseEnter']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Force real scrollbar via injected CSS
  await page.addStyleTag({ content: `
    ::-webkit-scrollbar { width: 17px !important; }
    ::-webkit-scrollbar-track { background: red !important; }
    ::-webkit-scrollbar-thumb { background: blue !important; }
    html { overflow-y: scroll !important; }
  `});

  await new Promise(r => setTimeout(r, 500));

  const info = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const appDiv = document.getElementById('root')?.firstElementChild;
    return {
      windowWidth: window.innerWidth,
      htmlClientWidth: html.clientWidth,
      scrollbarWidth: window.innerWidth - html.clientWidth,
      htmlDir: html.getAttribute('dir'),
      htmlCSSDirection: window.getComputedStyle(html).direction,
      bodyCSSDirection: window.getComputedStyle(body).direction,
      bodyWidth: body.offsetWidth,
      bodyOffsetLeft: body.offsetLeft,
      bodyBoundingLeft: body.getBoundingClientRect().left,
      bodyBoundingRight: body.getBoundingClientRect().right,
    };
  });

  console.log('--- Diagnosis ---');
  console.log(JSON.stringify(info, null, 2));
  console.log('Scrollbar position:', info.bodyOffsetLeft > 0 ? `LEFT (${info.bodyOffsetLeft}px shift)` : 'RIGHT or none');
  console.log('Body covers viewport?', info.bodyBoundingRight >= info.windowWidth ? 'YES' : `NO - gap of ${info.windowWidth - info.bodyBoundingRight}px on right`);

  await page.screenshot({ path: 'tests/ss_diagnose.png' });
  await browser.close();
})().catch(e => console.error(e.message));
