const { chromium } = require(process.env.MEDIAFETCH_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  process.env.NODE_ENV = 'test'; process.env.YOUTUBE_PROVIDER = 'mock'; process.env.INSTAGRAM_PROVIDER = 'mock';
  process.env.FRONTEND_ORIGIN = '*'; // Ephemeral local browser-test origin only.
  const { app } = await import('../server/app.js');
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // Provider/image fixtures only; no platform request or live download is made here.
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"/>' }));
  let calls = 0, mode = 'error', captured, releaseHeld;
  await page.route('**/api/v1/download', async route => {
    calls++; captured = route.request().postDataJSON();
    if (mode === 'hold') { await new Promise(resolve => { releaseHeld = resolve; }); }
    if (mode === 'success') return route.fulfill({ status: 200, contentType: 'video/mp4', headers: { 'Content-Disposition': 'attachment; filename="youtube-dQw4w9WgXcQ.mp4"' }, body: fs.readFileSync(path.resolve('.qa/synthetic.mp4')) });
    try { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'DOWNLOAD_BUSY', message: 'The download service is at capacity. Please try again shortly.' } }) }); } catch {}
  });
  try {
    for (const file of ['/temp/download-jobs/anything/media.mp4', '/downloads/test.mp4', '/server/config/env.js', '/.env', '/package.json', '/tests/download.test.mjs']) {
      const response = await fetch(origin + file); assert.equal(response.status, 404, file);
    }
    console.log('PASS static routes do not expose temp, server code, configuration or tests');
    await page.goto(origin);
    await page.locator('#media-url').fill('https://youtu.be/dQw4w9WgXcQ'); await page.locator('#media-url').press('Enter');
    await page.locator('#download-btn').waitFor();
    assert.equal(await page.locator('#download-btn').isDisabled(), true);
    await page.locator('#download-authorized').focus(); await page.keyboard.press('Space');
    assert.equal(await page.locator('#download-btn').isEnabled(), true);
    await page.locator('#download-quality').selectOption('720p');
    await page.locator('#download-btn').click();
    await page.locator('#download-error').waitFor({ state: 'visible' });
    assert.equal(captured.authorized, true); assert.equal(captured.format, 'video'); assert.equal(captured.quality, '720p');
    assert.equal(await page.locator('#download-error').getAttribute('role'), 'alert');
    console.log('PASS acknowledgement, keyboard operation, request contract and announced error');
    mode = 'hold'; const before = calls; await page.locator('#download-btn').click();
    assert.equal(await page.locator('#download-btn').getAttribute('aria-busy'), 'true');
    assert.equal(await page.locator('#download-authorized').isDisabled(), true);
    assert.equal(await page.locator('#download-quality').isDisabled(), true);
    await page.getByRole('button', { name: 'Cancel download' }).click();
    releaseHeld?.();
    await page.waitForFunction(() => !document.querySelector('#download-btn').disabled);
    assert.match(await page.locator('#download-error').textContent(), /cancelled/);
    assert.equal(calls, before + 1);
    console.log('PASS indeterminate busy state, duplicate prevention and cancellation');
    mode = 'success'; const downloadEvent = page.waitForEvent('download'); await page.locator('#download-btn').click();
    const download = await downloadEvent; assert.equal(download.suggestedFilename(), 'youtube-dQw4w9WgXcQ.mp4');
    await download.saveAs(path.resolve('.qa/browser-fixture.mp4'));
    assert.equal(await page.locator('#download-status').getAttribute('data-busy'), 'false');
    assert.match(await page.locator('#download-status').textContent(), /Download ready/);
    console.log('PASS generated local fixture saved by browser (not a live YouTube test)');
    for (const width of [1440, 1024, 768, 430, 393, 360, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('.download-section').scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const clipped = await page.locator('.download-section').evaluate(el => [...el.querySelectorAll('*')].filter(item => {
        const r = item.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > innerWidth + 1);
      }).length);
      assert.equal(clipped, 0);
      await page.screenshot({ path: `.qa/download-${width}.png`, fullPage: true });
      console.log(`PASS ${width}px download UI: no horizontal overflow or clipped controls`);
    }
    mode = 'hold'; await page.locator('#download-btn').click();
    await page.locator('#media-url').fill('https://instagram.com/p/ABC123/');
    releaseHeld?.();
    await page.waitForTimeout(800);
    assert.equal(await page.locator('#result').isHidden(), true);
    assert.equal(await page.locator('a[download]').count(), 0);
    console.log('PASS changing URL cancels obsolete download and clears result');
    assert.deepEqual(errors, []); console.log('PASS no browser runtime errors');
  } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
