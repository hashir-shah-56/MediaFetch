/* Optional developer QA harness. Uses an externally installed Playwright via
   MEDIAFETCH_PLAYWRIGHT_PATH; adds no application or npm dependencies. */
const { chromium } = require(process.env.MEDIAFETCH_PLAYWRIGHT_PATH || 'playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
(async () => {
  const { app } = await import('../server/app.js');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: process.env.MEDIAFETCH_BROWSER || 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [], badResponses = [], externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) badResponses.push(response.url()); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  page.on('request', request => { if (!request.url().startsWith(origin)) externalRequests.push(request.url()); });
  const checks = [];
  const pass = name => { checks.push(name); console.log('PASS ' + name); };
  try {
    await page.goto(origin);
    await page.waitForFunction(() => !document.querySelector('#analyze-button').disabled);
    const input = page.locator('#media-url');
    const submit = page.locator('#analyze-button');
    await submit.click();
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator('#url-feedback').textContent(), /Paste an Instagram or YouTube link/);
    pass('Empty submission and input focus');
    assert.equal(await input.evaluate(el => el === document.activeElement), true);
    for (const value of ['hello', 'https://', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/a b']) {
      await input.fill(value); await submit.click();
      assert.equal(await input.getAttribute('aria-invalid'), 'true');
    }
    pass('Malformed, unsafe schemes, credentials, and spaces rejected');
    for (const value of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.instagram.com/p/ABC123/', 'youtube.com/shorts/dQw4w9WgXcQ']) {
      await input.fill(value); await input.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#result').hidden);
      assert.equal(await input.getAttribute('aria-invalid'), 'false');
      assert.equal(await page.locator('#result').isVisible(), true);
      assert.match(await page.locator('#result').textContent(), /No media has been retrieved/);
    }
    pass('Supported URLs show detected type and honest local-only result');
    await input.fill('https://example.org');
    assert.equal(await page.locator('#result').isHidden(), true);
    pass('Editing clears stale result');
    await input.fill('youtube.com/shorts/dQw4w9WgXcQ');
    assert.equal(await page.locator('#analyzer').getAttribute('data-state'), 'typing');
    await page.waitForFunction(() => document.querySelector('#analyzer').dataset.state === 'valid');
    assert.match(await page.locator('#detected-platform').textContent(), /YouTube Short detected/);
    await input.fill('https://youtube.com.fake-site.com/watch?v=dQw4w9WgXcQ');
    await page.waitForFunction(() => document.querySelector('#analyzer').dataset.state === 'unsupported');
    assert.equal(await page.locator('#detected-platform').isHidden(), true);
    await input.fill('');
    assert.equal(await page.locator('#analyzer').getAttribute('data-state'), 'empty');
    pass('Debounced live detection, typing, unsupported and empty states; no stale badge');
    await input.dispatchEvent('compositionstart');
    await input.fill('instagram.com/reel/ABC123');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#analyzer').getAttribute('data-state'), 'typing');
    await input.dispatchEvent('compositionend');
    await page.waitForFunction(() => document.querySelector('#analyzer').dataset.state === 'valid');
    await input.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#result').hidden);
    await page.locator('.toast button').click();
    assert.equal(await page.locator('#result').isVisible(), true);
    pass('Composition defers validation; unchanged blur/dismiss preserves result');
    const { cases } = await import('./parser.mjs');
    const results = await page.evaluate(async inputs => { const { analyzeUrl } = await import('/js/url-parser.js'); return inputs.map(analyzeUrl); }, cases.map(test => test.input));
    cases.forEach((test, i) => {
      assert.equal(results[i].valid, test.valid);
      if (test.valid) for (const key of ['platform', 'contentType', 'mediaId']) assert.equal(results[i][key], test[key]);
      else assert.equal(results[i].error.code, test.code);
    });
    pass('Complete parser matrix also passes in browser runtime');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    await page.locator('#paste-button').click();
    await page.waitForFunction(() => document.querySelector('#media-url').value.includes('dQw4w9WgXcQ'));
    assert.equal(await page.locator('.toast').getAttribute('data-type'), 'success');
    pass('Real Clipboard API paste and success toast');
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } } }); });
    await page.locator('#paste-button').click();
    await page.waitForFunction(() => document.querySelector('.toast').textContent.includes('denied'));
    assert.equal(await page.locator('#paste-button').isEnabled(), true);
    pass('Denied clipboard handled; controls recover');
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); });
    await page.locator('#paste-button').click();
    assert.match(await page.locator('.toast').textContent(), /unavailable/);
    pass('Unavailable clipboard fallback');
    await input.fill('instagram.com/p/ABC123');
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => new Promise(resolve => { window.resolveClipboardTest = resolve; }) } }); });
    await page.locator('#paste-button').click();
    await input.fill('instagram.com/reel/NEW123');
    await input.fill('instagram.com/p/ABC123');
    await page.evaluate(() => window.resolveClipboardTest('https://youtu.be/dQw4w9WgXcQ'));
    await page.waitForFunction(() => !document.querySelector('#paste-button').disabled);
    assert.equal(await input.inputValue(), 'instagram.com/p/ABC123');
    assert.match(await page.locator('.toast').textContent(), /changed while clipboard/);
    pass('Pending clipboard cannot overwrite edits, including change-and-revert');
    for (const text of ['', 'x'.repeat(2049), 'not a url']) {
      await page.evaluate(text => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => text } }); }, text);
      await page.locator('#paste-button').click();
      await page.waitForFunction(() => !document.querySelector('#paste-button').disabled);
      assert.equal(await page.locator('#result').isHidden(), true);
    }
    pass('Empty, oversized, and malformed clipboard content');
    await page.locator('.toast button').click();
    assert.equal(await page.locator('.toast').count(), 0);
    pass('Notification dismissal');
    const faqs = page.locator('.faq-item button');
    for (let i = 0; i < 6; i++) {
      await faqs.nth(i).focus(); await page.keyboard.press('Enter');
      assert.equal(await faqs.nth(i).getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('Space');
      assert.equal(await faqs.nth(i).getAttribute('aria-expanded'), 'false');
    }
    await faqs.first().focus(); await page.keyboard.press('End');
    assert.equal(await faqs.last().evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown');
    assert.equal(await faqs.nth(1).evaluate(el => el === document.activeElement), true);
    pass('All FAQ toggles via Enter/Space; Home/End/arrow focus');
    await page.evaluate(async () => { const ui = await import('/js/ui.js'); ui.setProcessing(true); });
    assert.equal(await input.isDisabled(), true);
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await page.locator('.spinner').isVisible(), true);
    assert.equal(await page.locator('#url-form').getAttribute('aria-busy'), 'true');
    await page.evaluate(async () => { (await import('/js/ui.js')).setProcessing(false); });
    pass('Loading-ready and disabled architecture (test invocation only)');
    fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
    for (const width of [1440, 1024, 768, 430, 393, 360, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      if (width < 768) {
        assert.equal(await page.locator('#primary-nav').isHidden(), true);
        await page.locator('#menu-toggle').click();
        assert.equal(await page.locator('#primary-nav').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#primary-nav').isHidden(), true);
        await page.locator('#menu-toggle').click();
      }
      for (const href of ['#home', '#how-it-works', '#platforms', '#faq']) {
        if (width < 768 && await page.locator('#primary-nav').isHidden()) await page.locator('#menu-toggle').click();
        await page.locator(`#primary-nav a[href="${href}"]`).click();
        assert.equal(new URL(page.url()).hash, href);
      }
      await input.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=30s&custom=' + 'x'.repeat(120));
      await input.press('Enter');
      await page.waitForFunction(() => !document.querySelector('#result').hidden);
      assert.equal(await page.locator('#result').isVisible(), true);
      const overlap = await page.evaluate(() => {
        const a = document.querySelector('#paste-button').getBoundingClientRect();
        const b = document.querySelector('#analyze-button').getBoundingClientRect();
        return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      });
      assert.equal(overlap, false);
      const overflow = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, bad: [...document.querySelectorAll('main *, header *, footer *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1); }).map(el => el.tagName + '.' + el.className) }));
      assert.ok(overflow.document <= width, JSON.stringify(overflow));
      assert.deepEqual(overflow.bad, []);
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.locator('.toast button').click();
      assert.equal(await page.locator('#result').isVisible(), true);
      await page.screenshot({ path: path.join(root, `.qa/${width}.png`), fullPage: true });
      for (const invalid of ['https://example.com', 'https://instagram.com/stories/user/123', 'https://youtube.com/channel/abc', 'not a url']) {
        await input.fill(invalid); await input.press('Enter');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.locator('#result').isHidden(), true);
      }
      await page.locator('.toast button').click();
      pass(`${width}px: navigation, mobile menu where applicable, no element or page overflow`);
    }
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    pass('320px at 200% text size: no horizontal page overflow');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    pass('Reduced-motion scroll behavior');
    await page.goto(origin);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#main').evaluate(el => el === document.activeElement), true);
    await input.focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#paste-button').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await submit.evaluate(el => el === document.activeElement), true);
    await input.focus();
    assert.notEqual(await input.evaluate(el => getComputedStyle(el).outlineStyle), 'none');
    pass('Keyboard skip link and visible input focus outline');
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await noJS.newPage(); await staticPage.goto(origin);
    assert.equal(await staticPage.locator('#analyze-button').isDisabled(), true);
    assert.equal(await staticPage.locator('.faq-answer').first().isVisible(), true);
    assert.equal(await staticPage.locator('#primary-nav').isVisible(), true);
    await noJS.close();
    pass('No-JavaScript: navigation and FAQ readable; processing disabled');
    assert.deepEqual(errors, []); assert.deepEqual(badResponses, []); assert.deepEqual(externalRequests, []);
    pass('No console errors, broken responses/assets, or external requests');
    fs.writeFileSync(path.join(root, '.qa/results.json'), JSON.stringify({ date: new Date().toISOString(), browser: await browser.version(), checks, errors, badResponses, externalRequests }, null, 2));
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
