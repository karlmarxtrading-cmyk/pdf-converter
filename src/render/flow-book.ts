import { assertBudget, utf8Length } from '../core/limits';
import { assertPrintPayload, preflightPrintDom } from './print-budget';
import { verdictOf } from '../core/verdict';
import { PrintBlockedError } from './print-payload';
import type { PrintPayload } from './print-types';
import { escapeHtml, sha256Hex } from './util';

function ordinal(value: number, type: string): string {
  if (value <= 0 || !/^[aAiI]$/.test(type)) return String(value);
  let result = '';
  if (type.toLowerCase() === 'a') {
    while (value > 0) {
      value--;
      result = String.fromCharCode(97 + value % 26) + result;
      value = Math.floor(value / 26);
    }
  } else {
    if (value > 3999) return String(value);
    const numerals: [number, string][] = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],[50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
    for (const [number, letter] of numerals) {
      while (value >= number) { result += letter; value -= number; }
    }
  }
  return type === type.toUpperCase() ? result.toUpperCase() : result;
}

const bulletMarkers = new Map([['disc','•'],['circle','◦'],['square','▪'],['none','']]);

/** Chromium can omit the outside marker on an empty line. Keep the source nodes
 * intact and supply an in-flow, printable label on just the affected items. */
function markEmptyItems(list: HTMLOListElement | HTMLUListElement): void {
  const ordered = list.tagName === 'OL';
  const items = Array.from(list.children).filter((child): child is HTMLLIElement => child.tagName === 'LI');
  const listType = list.getAttribute('type') ?? '';
  const outer = list.parentElement?.closest('ol,ul');
  const defaultBullet = outer?.parentElement?.closest('ol,ul') ? 'square' : outer ? 'circle' : 'disc';
  const inherited = ordered ? (/^[1aAiI]$/.test(listType) ? listType : '1')
    : bulletMarkers.has(listType.toLowerCase()) ? listType : defaultBullet;
  const reversed = list.hasAttribute('reversed');
  let number = list.hasAttribute('start') ? (list as HTMLOListElement).start : reversed ? items.length : 1;
  for (const item of items) {
    if (item.hasAttribute('value')) number = item.value;
    if (!item.childElementCount && !item.textContent?.trim()) {
      const itemType = item.getAttribute('type') ?? '';
      const type = /^[1aAiI]$/.test(itemType) || bulletMarkers.has(itemType.toLowerCase()) ? itemType : inherited;
      const marker = bulletMarkers.get(type.toLowerCase()) ?? ordinal(number,type) + '.';
      item.setAttribute('data-pf-book-marker', marker);
    }
    number += reversed ? -1 : 1;
  }
}

export async function composeBook(payload: PrintPayload, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const issues = [...payload.issues, ...(payload.pdfRestrictions ?? [])];
  const verdict = verdictOf(issues);
  if (verdict.block.length) throw new PrintBlockedError(issues, verdict);
  assertPrintPayload(payload);
  const { page, settings } = payload;
  let body = payload.bodyInner;
  if (/<li\b/i.test(body)) {
    const template = document.createElement('template');
    template.innerHTML = body;
    const lists = template.content.querySelectorAll<HTMLOListElement | HTMLUListElement>('article ol,article ul');
    let yielded = performance.now();
    for (const list of lists) {
      if (!list.closest('nav.pf-toc')) markEmptyItems(list);
      if (performance.now() - yielded > 24) {
        await new Promise(resolve => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        yielded = performance.now();
      }
    }
    if (template.content.querySelector('[data-pf-book-marker]')) {
      // HTML consumes an initial LF in PRE when parsing serialized markup.
      for (const pre of template.content.querySelectorAll('pre')) {
        if (pre.firstChild?.nodeType === Node.TEXT_NODE && pre.firstChild.textContent?.startsWith('\n')) {
          pre.prepend(document.createTextNode('\n'));
        }
      }
      if (body.length >= 1_000_000) await preflightPrintDom(template.content, signal);
      body = template.innerHTML;
    }
  }
  const cover = /<header class="pf-cover"\s/.test(body);
  const numberBox = settings.template === 'EDT-01' ? 'bottom-center' : 'bottom-right';
  const css = `
@page { @${numberBox} { content: ${settings.pageNumbers ? 'counter(page)' : 'none'}; font: 9pt sans-serif; color: #444; } }
@page:first { counter-increment: page ${page.numberStart - (cover ? 1 : 0)}; }
@page pf-cover { @${numberBox} { content: none; } }
html, body, main.pf-main, article.pf-doc { margin: 0; padding: 0; height: auto; max-width: none; overflow: visible; }
article.pf-doc :is(h1,h2,h3,h4,h5,h6) { text-transform: none !important; font-variant: normal !important; font-variant-caps: normal !important; }
.pf-toc-dots, .pf-toc-page { display: none; }
article.pf-doc tbody > tr { break-inside: auto; page-break-inside: auto; }
article.pf-doc ol > li { list-style-position: inside; }
li[data-pf-book-marker] { list-style: none !important; }
li[data-pf-book-marker]::before { content: attr(data-pf-book-marker); }
`;
  // Charge every serialized fragment before joining. Escaping user-controlled
  // title/CSS in bounded chunks prevents an over-budget expansion in memory.
  const parts: string[] = [];
  let size = 0;
  const add = (part: string) => {
    size += utf8Length(part);
    assertBudget('pdfPayload', size);
    parts.push(part);
  };
  let lastYield = performance.now();
  const escaped = async (value: string, transform: (chunk: string) => string) => {
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + 32_768, value.length);
      if (end < value.length && /[\uD800-\uDBFF]/.test(value.charAt(end - 1))) end--;
      add(transform(value.slice(start, end)));
      start = end;
      if (performance.now() - lastYield > 24) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        lastYield = performance.now();
      }
    }
  };
  add('<!doctype html>\n<html lang="');
  await escaped(payload.lang, escapeHtml);
  add('"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; font-src data:; img-src data:; base-uri \'none\'; form-action \'none\'"><title>');
  await escaped(payload.title, escapeHtml);
  add('</title><meta name="generator" content="');
  await escaped(payload.generator, escapeHtml);
  add('"><meta name="pf-project-source-sha256" content="');
  await escaped(payload.snapshot.rawSourceHash, escapeHtml);
  add('"><meta name="pf-render-input-sha256" content="');
  await escaped(payload.snapshot.renderInputHash, escapeHtml);
  add('">');
  let first = true;
  for (const style of [payload.fontCss, ...payload.styles, css]) {
    add(first ? '<style>' : '\n<style>');
    first = false;
    await escaped(style, part => part.replace(/</g, '\\3c '));
    add('</style>');
  }
  add('</head><body class="');
  await escaped(payload.bodyClass, escapeHtml);
  add('">');
  add(body);
  add('</body></html>\n');
  signal?.throwIfAborted();
  return parts.join('');
}

export async function prepareBook(payload: PrintPayload, signal: AbortSignal) {
  const html = await composeBook(payload, signal);
  if (html.length >= 1_000_000) await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
  const bytes = new TextEncoder().encode(html);
  assertBudget('pdfPayload', bytes.byteLength);
  const hash = await sha256Hex(bytes);
  signal.throwIfAborted();
  // A real document URL keeps fragment links local to the printed book.
  const url = URL.createObjectURL(new Blob([bytes], {type: 'text/html;charset=utf-8'}));
  const frame = document.createElement('iframe');
  frame.id = 'pf-book-print';
  frame.title = payload.title;
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;left:-100000px;top:0;width:' + payload.page.contentWidthMm + 'mm;height:800px;border:0';
  const dispose = () => { frame.remove(); URL.revokeObjectURL(url); };
  // Keep cancellation active through loading, decoding images and loading fonts.
  let removeListeners = () => {};
  try {
    const ready = new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      const timeout = setTimeout(() => reject(new Error('BOOK_ASSETS_TIMEOUT')), Math.max(120_000, payload.options.imageTimeoutMs + payload.options.fontTimeoutMs));
      const resources = async () => {
        const doc = frame.contentDocument;
        if (!doc || doc.URL !== url || !doc.querySelector('main.pf-main > article#pf-content')) throw new Error('BOOK_FRAME_LOAD_FAILED');
        const faces = [...doc.fonts];
        if (faces.length !== payload.fonts.length) throw new Error('BOOK_FONT_MISSING');
        await Promise.all(faces.map(font => font.load()));
        await Promise.all([...doc.images].map(image => image.decode()));
        await doc.fonts.ready;
      };
      frame.onload = () => { void resources().then(resolve, reject); };
      frame.onerror = () => reject(new Error('BOOK_FRAME_LOAD_FAILED'));
      signal.addEventListener('abort', abort, {once: true});
      removeListeners = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); frame.onload = null; frame.onerror = null; };
    });
    frame.src = url;
    document.body.appendChild(frame);
    await ready;
    signal.throwIfAborted();
    return { bytes, hash, frame, dispose };
  } catch (error) { dispose(); throw error; }
  finally { removeListeners(); }
}
