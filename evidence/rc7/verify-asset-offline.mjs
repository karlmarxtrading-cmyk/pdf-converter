// Run from the project root: PF_CHROME=/path/to/chromium node evidence/rc7/verify-asset-offline.mjs.
// The input is the unmodified standalone HTML download. The test does not navigate to any URL.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const inputPath = process.argv[2] || 'examples/rc7/ASSET-MANDIRI.html';
const bytes = await readFile(inputPath);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const expected = JSON.parse(await readFile('evidence/rc7/standalone-assets-browser.json', 'utf8')).candidateDownload;
assert.equal(sha256, expected.sha256);
const browser = await puppeteer.launch({
  executablePath: process.env.PF_CHROME, headless: 'shell', pipe: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setCacheEnabled(false);
  await page.setBypassServiceWorker(true);
  await page.setOfflineMode(true);
  const requests = [];
  page.on('request', request => {
    if (/^(https?|wss?|ftp|file):/i.test(request.url())) requests.push(new URL(request.url()).protocol);
  });
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  await page.setContent(bytes.toString('utf8'), { waitUntil: 'load' });
  const result = await page.evaluate(async () => {
    const images = await Promise.all(Array.from(document.images, async image => {
      await image.decode();
      return { alt: image.alt, title: image.title, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, complete: image.complete };
    }));
    const fontFaces = await Promise.all(Array.from(document.fonts, async face => {
      await face.load();
      return { family: face.family.replace(/['"]/g, ''), weight: face.weight, status: face.status };
    }));
    await document.fonts.ready;
    const style = selector => getComputedStyle(document.querySelector(selector));
    const href = document.querySelector('article a[href^="https"]');
    const fraction = document.querySelector('.pf-math .frac-line');
    return {
      online: navigator.onLine,
      generator: document.querySelector('meta[name="generator"]').content,
      title: document.title, images, fontFaces,
      vlistDisplay: style('.pf-math .vlist-t').display, mathmlPosition: style('.pf-math .katex-mathml').position,
      fractionLineStyle: style('.pf-math .frac-line').borderBottomStyle,
      fractionLineWidthPx: fraction.getBoundingClientRect().width,
      href: href.getAttribute('href'), linkTitle: href.title, linkText: href.textContent,
    };
  });
  assert.equal(result.online, false);
  assert.equal(result.generator, expected.generator);
  assert.deepEqual(result.images.map(image => [image.alt,image.title,image.naturalWidth,image.naturalHeight,image.complete]),
    expected.pngImages.map(image => [image.alt,image.title,...image.dimensions,true]));
  assert.equal(result.fontFaces.length, expected.embeddedFonts.length);
  assert.ok(result.fontFaces.every(face => face.status === 'loaded'));
  assert.deepEqual(result.fontFaces.map(face => face.family).sort(), expected.embeddedFonts.map(face => face.family).sort());
  assert.equal(result.fractionLineStyle, 'solid');
  assert.ok(result.fractionLineWidthPx > 0);
  assert.equal(result.mathmlPosition, 'absolute');
  assert.equal(result.vlistDisplay, 'inline-table');
  assert.equal(result.href, expected.externalNavigationLink.href);
  assert.equal(result.linkTitle, expected.externalNavigationLink.title);
  assert.equal(result.linkText, 'Lihat penjelasan');
  assert.deepEqual(requests, []);
  console.log(JSON.stringify({
    status:'PASS', method:'Fresh Chromium browser context. No cache or service worker. Network offline before unmodified exported HTML bytes are parsed with page.setContent(). No file URL navigation, external server or document rewriting.',
    browser: await browser.version(), input:inputPath, bytes:bytes.length, sha256, externalOrFileRequestCount:requests.length, ...result,
  }, null, 2));
  await context.close();
} finally {
  await browser.close();
}
