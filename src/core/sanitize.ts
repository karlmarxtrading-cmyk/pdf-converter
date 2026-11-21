/**
 * Kebijakan sanitasi (HTM-05, SEC-01). Dua lapis:
 *  1) sanitasi hast untuk elemen yang berasal dari HTML mentah pengguna — setiap penghapusan DILAPORKAN dengan baris;
 *  2) DOMPurify dengan allow-list ketat atas seluruh keluaran (pertahanan berlapis) — sisa penghapusan juga dilaporkan.
 */
import DOMPurify from 'dompurify';
import { requireDom } from './util';

export const ALLOWED_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt',
  'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'ins', 'kbd', 'li', 'mark',
  'ol', 'p', 'pre', 'q', 's', 'samp', 'section', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'u', 'ul', 'var',
] as const;

/** Elemen yang dibuang beserta isinya (isi aktif/tersembunyi). */
export const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'template', 'textarea', 'select', 'option', 'button', 'base', 'link', 'meta', 'title', 'head', 'svg', 'math', 'canvas', 'audio', 'video', 'source', 'track', 'param', 'portal', 'dialog', 'slot']);
/** Elemen yang dibuka (anak dipertahankan, pembungkus dibuang). */
export const UNWRAP = new Set(['form', 'fieldset', 'legend', 'label', 'font', 'center', 'marquee', 'blink', 'html', 'body', 'main', 'article', 'aside', 'nav', 'footer', 'address', 'picture', 'map', 'area', 'big', 'tt', 'strike', 'nobr', 'output', 'meter', 'progress', 'datalist', 'optgroup', 'custom']);

/** Atribut yang boleh dibawa HTML mentah pengguna. */
export const USER_ATTRS = new Set(['id', 'class', 'title', 'lang', 'dir', 'alt', 'src', 'href', 'aria-labelledby', 'aria-describedby', 'colspan', 'rowspan', 'align', 'start', 'reversed', 'type', 'width', 'height', 'datetime', 'cite', 'open', 'abbr', 'scope']);

export const ALLOWED_ATTR = [
  'id', 'class', 'title', 'lang', 'dir', 'alt', 'src', 'href', 'colspan', 'rowspan', 'align', 'start', 'reversed', 'type', 'width', 'height',
  'datetime', 'cite', 'open', 'abbr', 'scope', 'checked', 'disabled', 'role', 'aria-label', 'aria-describedby', 'aria-hidden', 'aria-labelledby',
  'referrerpolicy', 'loading', 'decoding', 'rel',
];

export type UrlVerdict = { ok: true; kind: 'relative' | 'fragment' | 'http' | 'https' | 'mailto' | 'tel' | 'data-image' } | { ok: false; scheme: string };

/** Klasifikasi URL; skema diuji setelah membuang whitespace/kontrol (menangkap `java\nscript:`). */
export function classifyUrl(raw: string, forImage = false): UrlVerdict {
  const s = raw.replace(/[\u0000- \u007f-\u009f]/g, '');
  if (s.startsWith('#')) return { ok: true, kind: 'fragment' };
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!m) return { ok: true, kind: 'relative' };
  const scheme = m[1]!.toLowerCase();
  if (scheme === 'https') return { ok: true, kind: 'https' };
  if (scheme === 'http') return { ok: true, kind: 'http' };
  if (!forImage && scheme === 'mailto') return { ok: true, kind: 'mailto' };
  if (!forImage && scheme === 'tel') return { ok: true, kind: 'tel' };
  if (forImage && scheme === 'data' && /^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(s)) return { ok: true, kind: 'data-image' };
  return { ok: false, scheme };
}

export interface PurifyReport { removed: { kind: 'element' | 'attribute'; name: string }[] }

/**
 * Lapis akhir DOMPurify (mengembalikan elemen body agar slot rumus dapat diisi oleh pemanggil).
 * id dari pengguna sudah diberi prefix di lapis hast; SANITIZE_DOM tetap aktif (anti DOM clobbering).
 */
export function purifyToBody(html: string): { body: HTMLElement; report: PurifyReport } {
  const w = requireDom();
  const purify = DOMPurify(w);
  const body = purify.sanitize(html, {
    ALLOWED_TAGS: [...ALLOWED_TAGS], ALLOWED_ATTR, ALLOW_DATA_ATTR: true, ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|#|[^a-z]|[a-z0-9+.-]+(?:[^a-z0-9+.\-:]|$))/i,
    // aria-label hanya teks: tandai URI-safe agar label berisi "kata:" tidak dianggap skema URL lalu dibuang
    ADD_URI_SAFE_ATTR: ['aria-label'],
    SANITIZE_DOM: true, KEEP_CONTENT: true, RETURN_DOM: true, WHOLE_DOCUMENT: false,
    FORBID_TAGS: ['style', 'script', 'svg', 'math', 'form', 'iframe'], FORBID_ATTR: ['style', 'name', 'formaction', 'srcset', 'xlink:href'],
  }) as unknown as HTMLElement;
  const removed: PurifyReport['removed'] = [];
  for (const r of purify.removed as { element?: Node; attribute?: Attr | null }[]) {
    if (r.element) removed.push({ kind: 'element', name: (r.element.nodeName || '#').toLowerCase() });
    else if (r.attribute) removed.push({ kind: 'attribute', name: r.attribute.name });
  }
  return { body, report: { removed } };
}
