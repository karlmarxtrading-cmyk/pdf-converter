// Utilitas E2E: server statis ala Pages + Chrome headless (puppeteer-core). Tidak ada jaringan eksternal.
import puppeteer from 'puppeteer-core';
import { startServer } from '../../scripts/serve-dist.mjs';
import { findChromium } from '../../scripts/browser-path.mjs';

export const CHROME = findChromium();

export async function launch({ dir = 'dist-qa', port = 4310 } = {}) {
  const server = await startServer(dir, port);
  let browser;
  try { browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--lang=id-ID'] }); }
  catch (error) { await new Promise(resolve => server.close(resolve)); throw error; }
  const base = `http://127.0.0.1:${port}`;
  return { browser, server, base, async close() { await browser.close(); await new Promise((r) => server.close(r)); } };
}

/** Halaman baru dengan pencatat error konsol/halaman dan permintaan jaringan non-lokal. */
export async function page(env, { width = 1366, height = 900, lang } = {}) {
  const p = await env.browser.newPage();
  await p.setViewport({ width, height });
  const log = { errors: [], external: [], requests: [] };
  p.on('pageerror', (e) => log.errors.push(String(e.message || e)));
  p.on('console', (m) => { if (m.type() === 'error') log.errors.push(m.text()); });
  p.on('request', (r) => { const u = r.url(); log.requests.push(u); if (/^https?:/.test(u) && !u.startsWith(env.base)) log.external.push(u); });
  if (lang) await p.evaluateOnNewDocument((l) => { try { localStorage.setItem('pf.ui.lang', l); } catch {} }, lang);
  p.log = log;
  return p;
}

export const state = (p) => p.evaluate(() => window.__pf.state());
export async function waitFor(p, fn, arg, timeout = 60000) {
  await p.waitForFunction(fn, { timeout, polling: 100 }, arg);
}
export async function waitReady(p, timeout = 60000) {
  await p.waitForFunction(() => { const s = window.__pf?.state(); return s && s.view.status === 'ready' && s.view.revision === s.revision; }, { timeout, polling: 100 });
}
export async function openStudio(p, base) {
  await p.goto(base + '/#/workspace', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__pf &&
    !document.querySelector('#view-workspace')?.hidden &&
    /rev \d+/.test(document.querySelector('#src-hash')?.textContent || ''), { timeout: 90000 });
}
/** Ganti isi editor seperti mengetik (event input). */
export async function setSource(p, text) {
  await p.evaluate((t) => { const ed = document.querySelector('#editor'); ed.focus(); ed.value = t; ed.dispatchEvent(new Event('input', { bubbles: true })); }, text);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
