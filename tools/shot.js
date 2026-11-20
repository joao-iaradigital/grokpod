// Screenshot the dashboard.  usage: node shot.js [url] [out.png] [waitMs]
// CHROME_PATH env var points at your Chrome/Chromium binary.
const puppeteer = require('puppeteer-core');
(async () => {
  const [url = process.env.GP_URL || 'http://127.0.0.1:8766/', out = 'shot.png', wait = '6000'] = process.argv.slice(2);
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) errors.push('http ' + r.status() + ' ' + r.url()); });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, +wait));
  const info = await page.evaluate(() => ({ needs: document.getElementById('needs')?.textContent, updated: document.getElementById('updated')?.textContent, title: document.title,
    canvas: (() => { const c = document.getElementById('c'); return c ? [c.width, c.height] : null })() }));
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ info, errors }, null, 1));
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
