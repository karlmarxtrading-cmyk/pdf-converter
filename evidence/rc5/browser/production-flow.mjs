// From repository root: node evidence/rc5/browser/production-flow.mjs
// Uses the production UI, a disposable browser profile, and the actual standalone
// bytes downloaded by it. Offline network emulation runs before loading those bytes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { unzipSync } from 'fflate';
import { dirname } from 'node:path';
import { startServer } from '../../../scripts/serve-dist.mjs';
import { launch, page, sleep } from '../../../tests/e2e/lib.mjs';
import { distTreeSha256 } from '../../../scripts/fingerprint.mjs';

const outDir = 'evidence/rc5/browser';
mkdirSync(outDir, { recursive: true });
const env = await launch({ dir: 'dist', port: 4377 });
const result = { distTreeSha256: distTreeSha256(), browser: await env.browser.version(), checks: {} };
const checked = async (name, fn) => {
  try { result.checks[name] = { status: 'PASS', details: await fn() }; }
  catch (error) { result.checks[name] = { status: 'FAIL', reason: String(error.message || error) }; }
};
try {
  const stage = await page(env, { lang: 'id' });
  await stage.goto(env.base + '/#/workspace', { waitUntil: 'load' });
  await stage.waitForFunction(() => /rev\s*0/i.test(document.querySelector('#src-hash')?.textContent || ''));
  await checked('formatRadiogroupAndUndo', async () => {
    const checkedTpl = () => stage.$eval('#goal-grid [aria-checked=true]', el => el.dataset.tpl);
    const original = await checkedTpl();
    await stage.focus('#goal-grid [aria-checked=true]');
    await stage.keyboard.press('ArrowRight');
    const updated = await checkedTpl();
    assert.notEqual(updated, original);
    assert.equal(await stage.evaluate(() => document.activeElement?.dataset.tpl), updated);
    await stage.click('#btn-undo');
    await stage.click('[data-action=apply-full]');
    assert.equal(await checkedTpl(), original);
    return { original, updated, focusPreserved: true };
  });
  await checked('trustedRichClipboardAndStaleChoice', async () => {
    await env.browser.defaultBrowserContext().overridePermissions(env.base, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    const paste = async () => {
      await stage.click('#empty-state [data-action=paste]');
      await stage.focus('#paste-area');
      await stage.evaluate(async () => {
        const plain = 'Sudut 35 derajat';
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain': new Blob([plain], { type: 'text/plain' }),
          'text/html': new Blob(['<p><strong>Sudut</strong> 35 derajat</p>'], { type: 'text/html' }),
        })]);
        document.querySelector('#paste-area').addEventListener('paste', event => { window.pfTestTrustedPaste = event.isTrusted; }, { once: true });
      });
      await stage.focus('#paste-area');
      await stage.keyboard.down('Control');
      try { await stage.keyboard.press('v'); } finally { await stage.keyboard.up('Control'); }
      await stage.waitForFunction(() => document.querySelector('#paste-area').value === 'Sudut 35 derajat');
    };
    await paste();
    await stage.keyboard.type(' tambahan');
    assert.equal(await stage.$eval('input[name=paste-repr][value=markdown]', el => el.disabled), true);
    await stage.keyboard.press('Escape');
    await paste();
    const radio = await stage.$eval('input[name=paste-repr][value=markdown]', el => ({ enabled: !el.disabled, checked: el.checked }));
    assert.deepEqual(radio, { enabled: true, checked: true });
    assert.equal(await stage.evaluate(() => window.pfTestTrustedPaste), true);
    return { newDialog: radio, isTrusted: true, clipboard: 'Chromium headless clipboard API + keyboard Control+v' };
  });
  await checked('standaloneMathOffline', async () => {
    const p = await page(env, { lang: 'id' });
    const downloadDir = mkdtempSync(join(tmpdir(), 'pf-offline-export-'));
    const cdp = await p.createCDPSession();
    await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await p.goto(env.base + '/#/workspace', { waitUntil: 'load' });
    await p.waitForFunction(() => /rev\s*0/i.test(document.querySelector('#src-hash')?.textContent || ''));
    await (await p.$('#file-open')).uploadFile(resolve('fixtures/trigonometry/trigonometry.md'));
    await p.waitForFunction(() => document.querySelector('#live-frame')?.contentDocument?.querySelectorAll('.pf-math[data-tex]').length === 21);
    const signature = doc => ({
      text: doc.querySelector('#pf-content').textContent.replace(/\s+/g, ' ').trim(),
      tex: [...doc.querySelectorAll('.pf-math[data-tex]')].map(el => [el.dataset.tex, !!el.querySelector('.katex-display')]),
      rows: [...doc.querySelectorAll('#pf-content tr')].map(row => row.querySelectorAll('td,th').length),
    });
    const live = p.frames().find(frame => frame.parentFrame() && frame.name() === 'live-frame')
      ?? await (await p.$('#live-frame')).contentFrame();
    const expected = await live.evaluate(signature, await live.evaluateHandle(() => document));
    await p.click('.ws-actions [data-action=publish]');
    await p.click('[name=pub-kind][value=html-standalone]');
    await p.click('#pub-go');
    await p.waitForSelector('#publish-result.banner-ok', { visible: true, timeout: 60000 });
    let file;
    for (let i = 0; i < 100 && !file; i++) {
      file = readdirSync(downloadDir).find(name => name.endsWith('.html'));
      if (!file) await sleep(100);
    }
    assert.ok(file);
    const bytes = readFileSync(join(downloadDir, file));
    writeFileSync(join(outDir, 'trigonometry-standalone.html'), bytes);
    const offline = await env.browser.newPage();
    const external = [];
    offline.on('request', r => { if (/^https?:/.test(r.url())) external.push(r.url()); });
    await offline.setOfflineMode(true);
    const views = [];
    for (const width of [320, 390, 768, 1440]) {
      await offline.setViewport({ width, height: 850 });
      await offline.setContent(bytes.toString('utf8'), { waitUntil: 'load' });
      await offline.evaluate(() => document.fonts.ready);
      const actual = await offline.evaluate(signature, await offline.evaluateHandle(() => document));
      assert.deepEqual(actual, expected);
      const view = await offline.evaluate(() => ({
        width: innerWidth, scripts: document.scripts.length, overflow: document.documentElement.scrollWidth - innerWidth,
        fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family),
        fontErrors: [...document.fonts].filter(f => f.status === 'error').length,
      }));
      assert.equal(view.scripts, 0);
      assert.equal(view.fontErrors, 0);
      assert.ok(view.overflow <= 1);
      assert.ok(view.fonts.some(f => f.includes('KaTeX')));
      views.push(view);
    }
    assert.deepEqual(external, []);
    await offline.close();
    for (const kind of ['html-zip', 'html-publication']) {
      await checked(kind, async () => {
        await p.keyboard.press('Escape');
        await p.click('.ws-actions [data-action=publish]');
        await p.click('[name=pub-kind][value=' + kind + ']');
        if (kind === 'html-publication') {
          for (const selector of ['#pub-online', '#pub-enhance']) {
            if (await p.$eval(selector, el => el.checked)) await p.click(selector);
          }
        }
        const seen = new Set(readdirSync(downloadDir));
        await p.click('#pub-go');
        await p.waitForSelector('#publish-result.banner-ok', { visible: true, timeout: 60000 });
        let name;
        for (let i = 0; i < 100 && !name; i++) {
          name = readdirSync(downloadDir).find(item => item.endsWith('.zip') && !seen.has(item));
          if (!name) await sleep(100);
        }
        assert.ok(name);
        const extracted = mkdtempSync(join(tmpdir(), 'pf-local-export-'));
        const entries = unzipSync(readFileSync(join(downloadDir, name)));
        for (const [entry, data] of Object.entries(entries)) {
          assert.ok(!entry.startsWith('/') && !entry.includes('\\') && !entry.split('/').includes('..'));
          if (entry.endsWith('/')) continue;
          const path = join(extracted, entry);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, data);
        }
        const server = await startServer(extracted, 0);
        const local = 'http://127.0.0.1:' + server.address().port;
        const tab = await env.browser.newPage();
        const outside = [];
        await tab.setViewport({ width: 390, height: 850 });
        try {
          await tab.setRequestInterception(true);
          tab.on('request', request => {
            const url = request.url();
            if (url.startsWith(local + '/') || /^(data|blob):/.test(url)) request.continue();
            else { outside.push(url); request.abort(); }
          });
          await tab.goto(local + '/index.html', { waitUntil: 'load' });
          await tab.evaluate(() => document.fonts.ready);
          const actual = await tab.evaluate(signature, await tab.evaluateHandle(() => document));
          assert.deepEqual(actual, expected);
          const detail = await tab.evaluate(() => ({
            fontsLoaded: [...document.fonts].filter(f => f.status === 'loaded').length,
            fontErrors: [...document.fonts].filter(f => f.status === 'error').length,
            scripts: document.scripts.length, overflow: document.documentElement.scrollWidth - innerWidth,
          }));
          assert.equal(detail.scripts, 0);
          assert.equal(detail.fontErrors, 0);
          assert.ok(detail.fontsLoaded > 0 && detail.overflow <= 1);
          assert.deepEqual(outside, []);
          return { entries: Object.keys(entries).length, texAndReadingOrderMatch: true, external: outside, ...detail,
            method: 'ordinary local static HTTP origin, requests to any other origin disallowed' };
        } finally { await tab.close(); await new Promise(resolve => server.close(resolve)); }
      });
    }
    await p.close();
    return { origin: 'in-memory document in an offline tab (no file URL)', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
      sourceRoute: 'normal file input', formulaSequence: expected.tex, tableRowsAndColumns: expected.rows, external, views };
  });
} finally {
  await env.close();
  result.pass = Object.keys(result.checks).length === 5 && Object.values(result.checks).every(check => check.status === 'PASS');
  writeFileSync(join(outDir, 'production-flow.json'), JSON.stringify(result, null, 2) + '\n');
}
console.log(JSON.stringify(result.checks));
process.exitCode = result.pass ? 0 : 1;
