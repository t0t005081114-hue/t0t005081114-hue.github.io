// Open the showreel page in Playwright Chromium and verify the typeface before any capture.
const { chromium } = require('playwright');
const path = require('path');
async function openShowreel(htmlPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) errors.push('NETWORK REQUEST: ' + r.url()); });
  await page.goto('file://' + path.resolve(htmlPath) + '?render=1');
  await page.evaluate(() => document.fonts.ready);
  const fontOK = await page.evaluate(async () => {
    await window.__fontsReady;
    const loaded = [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Inter Showreel' && f.status === 'loaded');
    const c = document.createElement('canvas').getContext('2d');
    c.font = '700 80px "Inter Showreel", monospace'; const a = c.measureText('SHOWREEL 2026 MOTION').width;
    c.font = '700 80px monospace'; const b = c.measureText('SHOWREEL 2026 MOTION').width;
    return { loaded, check: document.fonts.check('700 34px "Inter Showreel"'), differsFromFallback: Math.abs(a - b) > 1, a, b };
  });
  if (!fontOK.loaded || !fontOK.check || !fontOK.differsFromFallback) {
    await browser.close();
    throw new Error('FONT NOT LOADED: Inter Showreel ' + JSON.stringify(fontOK));
  }
  return { browser, page, errors, fontOK };
}
module.exports = { openShowreel };
