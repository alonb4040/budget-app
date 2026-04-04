const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1512, height: 835 });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.reload({ waitUntil: 'networkidle2' });

  const info = await page.evaluate(() => {
    const card = document.querySelector('[style*="maxWidth: 400"], [style*="max-width: 400"]') ||
      Array.from(document.querySelectorAll('div')).find(d => {
        const s = d.style;
        return s.maxWidth === '400px' || window.getComputedStyle(d).maxWidth === '400px';
      });

    const body = document.body;
    return {
      windowWidth: window.innerWidth,
      documentWidth: document.documentElement.clientWidth,
      scrollbarWidth: window.innerWidth - document.documentElement.clientWidth,
      bodyWidth: body.getBoundingClientRect().width,
      cardLeft: card ? Math.round(card.getBoundingClientRect().left) : null,
      cardRight: card ? Math.round(card.getBoundingClientRect().right) : null,
      cardWidth: card ? Math.round(card.getBoundingClientRect().width) : null,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  const leftMargin = info.cardLeft;
  const rightMargin = info.windowWidth - info.cardRight;
  console.log(`Left margin: ${leftMargin}px, Right margin: ${rightMargin}px, Diff: ${rightMargin - leftMargin}px`);

  await page.screenshot({ path: 'tests/ss_measure.png' });
  await browser.close();
})().catch(e => console.error(e.message));
