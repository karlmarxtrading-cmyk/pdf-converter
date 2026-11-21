import { docLabels } from './labels';
/**
 * Paginasi dengan Paged.js 0.4.3 (dipatok) — PF-028, PDF-01…12.
 * Hanya berjalan di halaman cetak (print.html / harness QA). Alur:
 *  font (batas waktu) → gambar (batas waktu) → perbaikan pra-layout (tabel lebar, rumus lebar) → paginasi
 *  → peta halaman → TOC diisi dari peta AKTUAL → paginasi ulang sampai peta stabil (≤ maxPasses) → diagnostik → HTML datar.
 */
import type { Issue } from '../core/contracts';
import type { PaginationFailure, PaginationResult, PageDiagnostic, PrintPayload } from './print-types';
import { READABILITY } from './templates';
import { PaginationError } from './paginate-error';

type Hookable = { register(fn: (...a: never[]) => unknown): void };
interface PagedHandlerCtor { new (chunker: unknown, polisher: unknown, caller: unknown): object }
interface PagedModule {
  Previewer: new (opts?: object) => { preview(content: string, styles: object[], renderTo: HTMLElement): Promise<{ total: number }>; hooks: Record<string, Hookable> };
  Handler: PagedHandlerCtor; registerHandlers(...h: PagedHandlerCtor[]): void;
}

let pagedPromise: Promise<PagedModule> | null = null;
let handlersRegistered = false;
async function loadPaged(): Promise<PagedModule> {
  pagedPromise ??= import('pagedjs') as unknown as Promise<PagedModule>;
  const m = await pagedPromise;
  if (!handlersRegistered) { m.registerHandlers(makeRepeatHeaders(m.Handler)); handlersRegistered = true; }
  return m;
}

/** Handler Paged.js PaperForma: header tabel diulang (PDF-06, SEM-06) + koreksi offset pemecahan teks. */
function makeRepeatHeaders(Base: PagedHandlerCtor): PagedHandlerCtor {
  return class RepeatTableHeaders extends (Base as new (...a: unknown[]) => object) {
    splitRefs: string[] = []; chunker: { source: ParentNode } | null = null;
    pageStart: { node?: Node; offset?: number } | undefined;
    onPageLayout(_w: Element, breakToken: { node?: Node; offset?: number } | undefined) { this.pageStart = breakToken; }
    /**
     * Perbaikan offset pemecahan teks (Paged.js 0.4.3 menghitung offset dengan indexOf atas teks tersisa, sehingga pada teks
     * berulang offset jatuh ke kemunculan PERTAMA → kalimat terduplikasi/terlewat; teramati di korpus 14, A5).
     * Offset benar = awal potongan yang dirender di halaman ini + startOffset overflow.
     */
    onBreakToken(breakToken: { node?: Node; offset?: number } | undefined, overflow: Range | undefined) {
      if (!breakToken?.node || breakToken.node.nodeType !== 3 || !overflow || overflow.startContainer.nodeType !== 3) return undefined;
      const base = this.pageStart?.node === breakToken.node ? this.pageStart.offset ?? 0 : 0;
      const rendered = overflow.startContainer.textContent ?? ''; const src = breakToken.node.textContent ?? '';
      if (src.slice(base, base + rendered.length) !== rendered) return undefined; // bukan potongan yang dikenali: biarkan
      const fixed = base + overflow.startOffset;
      if (fixed !== breakToken.offset) breakToken.offset = fixed;
      return breakToken;
    }
    afterPageLayout(_page: Element, _p: unknown, breakToken: { node?: Node } | undefined, chunker: { source: ParentNode }) {
      this.chunker = chunker; this.splitRefs = [];
      const node = breakToken?.node;
      if (!node) return;
      const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
      const tables: Element[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) if (e.tagName === 'TABLE') tables.push(e);
      this.splitRefs = tables.map((t) => t.getAttribute('data-ref') ?? '').filter(Boolean);
    }
    layout(rendered: Element) {
      for (const ref of this.splitRefs) {
        const t = rendered.querySelector(`table[data-ref='${ref}']`);
        if (!t || t.hasAttribute('data-pf-repeated') || t.querySelector(':scope > thead')) continue;
        const src = this.chunker?.source.querySelector(`table[data-ref='${ref}']`);
        const thead = src?.querySelector(':scope > thead');
        if (!thead) continue;
        const copy = thead.cloneNode(true) as Element;
        copy.setAttribute('data-pf-repeat', ''); copy.setAttribute('aria-hidden', 'true');
        copy.querySelectorAll('[data-ref]').forEach((n) => n.setAttribute('data-ref', `${n.getAttribute('data-ref')}-r`));
        copy.setAttribute('data-ref', `${thead.getAttribute('data-ref')}-r`);
        const colgroup = src?.querySelector(':scope > colgroup');
        if (colgroup && !t.querySelector(':scope > colgroup')) t.insertBefore(colgroup.cloneNode(true), t.firstChild);
        t.insertBefore(copy, t.querySelector(':scope > tbody, :scope > tr') ?? null);
        t.setAttribute('data-pf-repeated', '');
      }
    }
  } as unknown as PagedHandlerCtor;
}

const sleep = (ms: number) => new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms));
const mm = (doc: Document) => { const d = doc.createElement('div'); d.style.cssText = 'position:absolute;width:100mm;visibility:hidden'; doc.body.appendChild(d); const v = d.getBoundingClientRect().width / 100; d.remove(); return v; };

export { PaginationError };

/** PDF-10: tunggu font tersemat siap; gagal/terlambat → klasifikasi jelas, tidak lanjut dengan font pengganti. */
async function awaitFonts(doc: Document, payload: PrintPayload): Promise<Issue[]> {
  const fams = new Set(payload.fonts.map((f) => f.family));
  const faces = [...doc.fonts].filter((f) => fams.has(f.family.replace(/^["']|["']$/g, '')));
  const t0 = performance.now();
  const r = await Promise.race([Promise.allSettled(faces.map((f) => f.load())).then(() => 'ok' as const), sleep(payload.options.fontTimeoutMs)]);
  const issues: Issue[] = [];
  if (r === 'timeout') issues.push({ id: 'pdf-font-timeout', code: 'FONT_TIMEOUT', severity: 'error', scope: 'font', blocking: true, message: `Font belum siap dalam ${payload.options.fontTimeoutMs} ms (${faces.filter((f) => f.status !== 'loaded').length} belum termuat). Paginasi dihentikan; tidak ada PDF dengan font pengganti.` });
  for (const f of faces) if (f.status === 'error') issues.push({ id: `pdf-font-error-${f.family}-${f.weight}-${f.style}`, code: 'FONT_LOAD_FAILED', severity: 'error', scope: 'font', blocking: true, message: `Font ${f.family} ${f.weight} ${f.style} gagal dimuat/didekode.` });
  if (faces.length < payload.fonts.length) issues.push({ id: 'pdf-font-missing-face', code: 'FONT_LOAD_FAILED', severity: 'error', scope: 'font', blocking: true, message: `Hanya ${faces.length} dari ${payload.fonts.length} font terdaftar di dokumen cetak.` });
  void t0;
  return issues;
}

/** PDF-10: gambar wajib harus dapat didekode dalam batas waktu. */
async function awaitImages(root: ParentNode, timeoutMs: number): Promise<Issue[]> {
  const imgs = [...root.querySelectorAll('img')];
  const results = await Promise.race([
    Promise.all(imgs.map((img) => (img.complete && img.naturalWidth ? Promise.resolve(true) : img.decode().then(() => true, () => false)))),
    sleep(timeoutMs),
  ]);
  if (results === 'timeout') return [{ id: 'pdf-image-timeout', code: 'IMAGE_TIMEOUT', severity: 'error', scope: 'asset', blocking: true, message: `Gambar belum siap dalam ${timeoutMs} ms; PDF tidak dibuat agar tidak ada gambar yang hilang diam-diam.` }];
  const bad = imgs.filter((_, i) => !results[i]);
  return bad.length ? [{ id: 'pdf-image-failed', code: 'IMAGE_LOAD_FAILED', severity: 'error', scope: 'asset', blocking: true, message: `${bad.length} gambar tidak dapat didekode (${bad.slice(0, 3).map((b) => b.getAttribute('alt') || 'tanpa alt').join(', ')}).` }] : [];
}

/** Apakah sel tabel hanya muat dengan mematahkan kata/angka di tengah (mis. "-5,25%" → "-5,25" / "%")? */
function breaksTokens(t: HTMLTableElement): boolean {
  t.classList.add('pf-measure-nobreak');
  try { return [...t.querySelectorAll<HTMLElement>('th, td')].some((c) => c.scrollWidth > c.clientWidth + 1); }
  finally { t.classList.remove('pf-measure-nobreak'); }
}

/** Tabel bertumpuk (blok per baris, sel diberi label kolom) — dipakai juga untuk baris yang lebih tinggi dari halaman. */
function stackTable(doc: Document, t: HTMLTableElement): void {
  const box = doc.createElement('div');
  box.className = 'pf-table-stacked'; box.setAttribute('role', 'table');
  for (const key of ['data-block-id', 'data-line', 'id', 'lang', 'dir', 'aria-label']) {
    const value = t.getAttribute(key); if (value) box.setAttribute(key, value);
  }
  if (t.caption) {
    const caption = doc.createElement('div'); caption.className = 'pf-stack-caption';
    caption.append(...t.caption.childNodes); box.append(caption);
  }
  const headerColumns = new Map<number, string[]>();
  for (const section of [t.tHead, ...t.tBodies, t.tFoot]) {
    if (!section) continue;
    const group = doc.createElement('div');
    group.setAttribute('role', 'rowgroup'); group.dataset.section = section.tagName.toLowerCase();
    const occupiedThrough = new Map<number, number>();
    for (const [r, tr] of [...section.rows].entries()) {
      const row = doc.createElement('div');
      row.className = 'pf-stack-row'; row.setAttribute('role', 'row');
      let column = 0;
      for (const c of tr.cells) {
        while ((occupiedThrough.get(column) ?? -1) >= r) column++;
        const cell = doc.createElement('div');
        cell.className = 'pf-stack-cell';
        const isHeader = section === t.tHead;
        const role = c.tagName === 'TH' ? (isHeader || c.scope.startsWith('col') ? 'columnheader' : 'rowheader') : 'cell';
        cell.setAttribute('role', role);
        cell.setAttribute('aria-colindex', String(column + 1));
        const rowspan = c.rowSpan || section.rows.length - r;
        if (rowspan > 1) cell.setAttribute('aria-rowspan', String(rowspan));
        if (c.colSpan > 1) cell.setAttribute('aria-colspan', String(c.colSpan));
        const labels = new Set<string>();
        for (let i = column; i < column + c.colSpan; i++) {
          if (rowspan > 1) occupiedThrough.set(i, r + rowspan - 1);
          const existing = headerColumns.get(i) ?? [];
          if (isHeader) headerColumns.set(i, [...existing, (c.textContent ?? '').trim()]);
          else existing.forEach(label => { if (label) labels.add(label); });
        }
        if (labels.size) cell.dataset.label = [...labels].join(' / ');
        for (const key of ['data-pf-cell', 'data-pf-repeat', 'id', 'lang', 'dir']) {
          if (c.hasAttribute(key)) cell.setAttribute(key, c.getAttribute(key)!);
        }
        cell.append(...c.childNodes); row.append(cell);
        column += c.colSpan;
      }
      group.append(row);
    }
    box.append(group);
  }
  t.replaceWith(box);
}

function markTableCells(table: HTMLTableElement, expected: Map<string, string>): void {
  const mark = (node: HTMLElement) => {
    if (node.dataset.pfCell || node.closest('[data-pf-repeat]')) return;
    const key = String(expected.size + 1);
    node.dataset.pfCell = key;
    expected.set(key, (node.textContent ?? '').replace(/\s/g, ''));
  };
  for (const row of table.rows) for (const cell of row.cells) mark(cell);
  if (table.caption && !table.caption.querySelector('[data-pf-cell], .pf-split-note')) {
    const original = table.ownerDocument.createElement('span');
    original.append(...table.caption.childNodes); table.caption.append(original); mark(original);
  }
}

function tableContentIntact(pages: HTMLElement[], expected: Map<string, string>): boolean {
  if (!expected.size) return true;
  const fragments = new Map<string, string[]>();
  for (const page of pages) {
    for (const node of page.querySelectorAll<HTMLElement>('.pagedjs_page_content [data-pf-cell]')) {
      if (node.closest('[data-pf-repeat]')) continue;
      const id = node.dataset.pfCell!;
      const parts = fragments.get(id) ?? [];
      parts.push((node.textContent ?? '').replace(/\s/g, ''));
      fragments.set(id, parts);
    }
  }
  return [...expected].every(([id, text]) => fragments.get(id)?.join('') === text);
}

/**
 * SEM-06: pecah tabel lebar menjadi beberapa tabel kelompok kolom. Kolom pertama (kunci baris) diulang dan ditandai
 * data-pf-repeat agar pemeriksa keutuhan tidak menghitungnya sebagai duplikasi isi. Mengembalikan jumlah bagian,
 * atau null bila tidak aman (sel gabungan, kurang dari 3 kolom) — pemanggil memakai tata letak bertumpuk.
 */
function splitWideTable(doc: Document, t: HTMLTableElement, availPx: number, lang: string): number | null {
  const rows = [...t.rows];
  const n = rows[0]?.cells.length ?? 0;
  if (n < 3 || rows.some((r) => r.cells.length !== n || [...r.cells].some((c) => c.colSpan > 1 || c.rowSpan !== 1))) return null;
  const wrap = t.parentElement as HTMLElement;
  const level = [...t.classList].filter((c) => /^pf-fit-\d$/.test(c));
  const build = (cols: number[], part: number, total: number, first: number, last: number) => {
    const nt = doc.createElement('table');
    nt.className = t.className;
    for (const a of ['data-line']) { const v = t.getAttribute(a); if (v) nt.setAttribute(a, v); }
    if (part === 0) { const id = t.getAttribute('id'); if (id) nt.id = id; const bid = t.getAttribute('data-block-id'); if (bid) nt.setAttribute('data-block-id', bid); }
    else { const bid = t.getAttribute('data-block-id'); if (bid) nt.setAttribute('data-block-part-of', bid); }
    const cap = doc.createElement('caption'); cap.className = 'pf-split-caption';
    if (t.caption && part === 0) cap.append(...[...t.caption.childNodes].map((x) => x.cloneNode(true)));
    const note = doc.createElement('span'); note.className = 'pf-split-note';
    note.textContent = `${part === 0 && t.caption ? ' — ' : ''}${docLabels(lang).tablePart(part + 1, total, first, last, n)}`;
    cap.append(note); nt.append(cap);
    for (const sec of [t.tHead, ...t.tBodies, t.tFoot]) {
      if (!sec) continue;
      const ns = doc.createElement(sec.tagName.toLowerCase()) as HTMLTableSectionElement;
      for (const r of [...sec.rows]) {
        const nr = doc.createElement('tr');
        for (const k of cols) {
          const c = r.cells[k]!.cloneNode(true) as HTMLTableCellElement;
          if (part > 0 && k === 0) { c.setAttribute('data-pf-repeat', '1'); c.classList.add('pf-repeat-key'); }
          nr.append(c);
        }
        ns.append(nr);
      }
      nt.append(ns);
    }
    level.forEach((c) => nt.classList.add(c));
    return nt;
  };
  // Lebar minimum tiap kolom = token terpanjang yang tidak boleh dipatah (min-content tanpa pemutusan kata).
  const probe = t.cloneNode(true) as HTMLTableElement;
  probe.classList.add('pf-measure-nobreak');
  probe.style.cssText = 'table-layout:auto;width:min-content;max-width:none';
  wrap.appendChild(probe);
  const colW = Array.from({ length: n }, (_, k) => Math.max(...[...probe.rows].map((r) => r.cells[k]!.getBoundingClientRect().width)));
  probe.remove();
  // Cadangan 12 %: wadah ukur tidak identik dengan halaman cetak (padding/huruf); lebih baik satu bagian ekstra daripada token terpatah.
  const budget = availPx * 0.88;
  const groups: number[][] = []; let cur: number[] = []; let used = colW[0]!;
  for (let k = 1; k < n; k++) {
    if (cur.length && used + colW[k]! > budget) { groups.push(cur); cur = []; used = colW[0]!; }
    cur.push(k); used += colW[k]!;
  }
  if (cur.length) groups.push(cur);
  if (colW[0]! + Math.max(...colW.slice(1)) > budget) return null; // satu kolom pun tidak muat → tata bertumpuk
  if (groups.length < 2) return null;
  const tables = groups.map((g, gi) => build([0, ...g], gi, groups.length, gi === 0 ? 1 : g[0]! + 1, g.at(-1)! + 1));
  const frag = doc.createElement('div'); frag.className = 'pf-table-split';
  for (const tb of tables) { const w = wrap.cloneNode(false) as HTMLElement; w.classList.add('pf-table-part'); w.append(tb); frag.append(w); }
  wrap.replaceWith(frag);
  return groups.length;
}

/**
 * Perbaikan pra-layout pada lebar area teks nyata:
 *  - tabel lebar: padding rapat → 8.5 pt (batas keterbacaan) → kolom tetap + bungkus; masih sempit → issue tawarkan lanskap/pecah.
 *  - rumus display lebar: skala lokal hingga batas 70 %; masih lebih lebar → issue error (tidak pernah dipotong diam-diam).
 */
/**
 * Paged.js menambahkan U+2011 saat memutus simpul teks di tengah kata (.pagedjs_hyphen). Di dalam KODE tanda itu
 * mengubah isi yang dapat disalin → dihapus (kata terputus tanpa tanda hubung). Di prosa, tanda itu adalah tanda
 * pemenggalan presentasional dan dinormalisasi oleh contentInventory (lihat ENGINE_HYPHEN).
 */
export function stripEngineHyphensInCode(root: ParentNode): number {
  let n = 0;
  for (const el of root.querySelectorAll<HTMLElement>('pre .pagedjs_hyphen, code .pagedjs_hyphen, pre.pagedjs_hyphen')) {
    const last = [...el.childNodes].reverse().find((c) => c.nodeType === 3);
    if (last && last.nodeValue?.endsWith(ENGINE_HYPHEN)) { last.nodeValue = last.nodeValue.slice(0, -1); el.classList.remove('pagedjs_hyphen'); n++; }
  }
  return n;
}
export const ENGINE_HYPHEN = '\u2011';

/** Pecah isi <pre> menjadi span.pf-line per baris dengan mempertahankan elemen penyorot sintaks (dikloning per baris). */
export function splitCodeLines(doc: Document, pre: HTMLElement): number {
  const host = pre.querySelector<HTMLElement>(':scope > code') ?? pre;
  const src = [...host.childNodes];
  const stack: Element[] = [];
  const lines: HTMLElement[] = [];
  let tip: Element;
  const open = () => { const l = doc.createElement('span'); l.className = 'pf-line'; l.dataset.pfCodeLine = String(lines.length); lines.push(l); tip = l; for (const s of stack) { const c = s.cloneNode(false) as Element; tip.appendChild(c); tip = c; } };
  open();
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      const parts = (n.nodeValue ?? '').split('\n');
      parts.forEach((part, i) => { if (i) open(); if (part) tip.appendChild(doc.createTextNode(part)); });
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const c = el.cloneNode(false) as Element;
    tip.appendChild(c); stack.push(el); tip = c;
    for (const ch of [...el.childNodes]) walk(ch);
    stack.pop(); tip = tip.parentElement!;
  };
  for (const n of src) walk(n);
  // baris terakhir kosong (naskah berakhir \n) tidak ditampilkan sebagai baris tambahan
  if (lines.length > 1 && !(lines[lines.length - 1]!.textContent ?? '')) lines.pop()!.remove();
  host.replaceChildren(...lines);
  pre.classList.add('pf-lines');
  return lines.length;
}

function preLayoutFixes(doc: Document, payload: PrintPayload): { html: string; issues: Issue[]; tableFits: number; mathScaled: number; trackedCells: Map<string, string> } {
  const issues: Issue[] = [];
  const trackedCells = new Map<string, string>();
  const holder = doc.createElement('div');
  holder.style.cssText = `position:absolute;left:-20000px;top:0;width:${payload.page.contentWidthMm}mm;visibility:hidden`;
  holder.className = payload.bodyClass;
  holder.innerHTML = payload.bodyInner;
  const st = doc.createElement('style'); st.setAttribute('data-pf-measure', ''); st.textContent = payload.styles.filter((s) => !/@page/.test(s)).join('\n');
  doc.head.appendChild(st); doc.body.appendChild(holder);
  let tableFits = 0, mathScaled = 0;
  try {
    holder.querySelectorAll<HTMLElement>('.pf-cover').forEach((c) => (c.style.display = 'none'));
    const avail = (el: Element) => (el.closest('.pf-msg-body:not(.pf-wide)') && !el.closest('.pf-wide') ? (el.parentElement as HTMLElement).clientWidth : (el.closest('.pf-doc') as HTMLElement).clientWidth);
    holder.querySelectorAll<HTMLTableElement>('.pf-table-wrap > table').forEach((t, i) => {
      const w = avail(t.parentElement!);
      let level = 0;
      while (t.scrollWidth > w + 1 && level < 3) { level++; t.classList.add(`pf-fit-${level}`); }
      if (level) tableFits++;
      const cols = Number(t.parentElement!.getAttribute('data-cols')) || t.rows[0]?.cells.length || 1;
      const colMm = (w / mm(doc)) / cols;
      if (t.scrollWidth > w + 1 || (level === 3 && breaksTokens(t))) {
        // SEM-06: tabel masih lebih lebar dari area teks pada huruf minimum → kolom akan terpotong di PDF.
        // Tidak pernah dibiarkan terpotong: pecah per kelompok kolom (kolom kunci diulang) atau, bila ada sel gabungan,
        // tata bertumpuk. Semua sel tetap ada dan berurutan; perubahan dilaporkan.
        markTableCells(t, trackedCells);
        const parts = splitWideTable(doc, t, w, payload.lang);
        if (parts) {
          issues.push({ id: `layout-split-table-${i + 1}`, code: 'TABLE_TOO_WIDE', severity: 'warning', scope: 'layout', message: `Tabel ${i + 1} (${cols} kolom) tidak muat di area teks ${payload.page.contentWidthMm} mm walau sudah ${READABILITY.minSmallPt} pt; pada PDF dipecah menjadi ${parts} bagian kolom dengan kolom pertama diulang di setiap bagian. Semua sel dipertahankan. Orientasi lanskap menampilkan tabel utuh.`, detail: { action: 'split-columns', parts } } as Issue);
        } else {
          stackTable(doc, t);
          issues.push({ id: `layout-wide-table-${i + 1}`, code: 'TABLE_TOO_WIDE', severity: 'warning', scope: 'layout', message: `Tabel ${i + 1} (${cols} kolom, berisi sel gabungan) tidak muat di area teks ${payload.page.contentWidthMm} mm; pada PDF ditata bertumpuk (setiap sel dengan label kolomnya) agar tidak ada kolom yang terpotong. Orientasi lanskap menampilkan tabel utuh.`, detail: { action: 'stacked' } } as Issue);
        }
      } else if (level === 3 && colMm < 14) {
        issues.push({ id: `layout-narrow-table-${i + 1}`, code: 'TABLE_FITTED', severity: 'info', scope: 'layout', message: `Tabel ${i + 1} (${cols} kolom) dipaskan pada ${READABILITY.minSmallPt} pt dengan kolom sempit (≈${colMm.toFixed(1)} mm). Lanskap memberi kolom lebih lega.` });
      } else if (level >= 1) {
        issues.push({ id: `layout-fit-table-${i + 1}`, code: 'TABLE_FITTED', severity: 'info', scope: 'layout', message: `Tabel ${i + 1} dipaskan dengan sel dibungkus pada ${READABILITY.minSmallPt} pt. Lanskap memberi kolom lebih lega.` });
      }
    });
    // Tabel dengan baris lebih tinggi dari ~80% halaman: Paged.js 0.4.3 dapat kehilangan isi saat memecah sel tabel
    // (teramati pada korpus 14 di A5). Tabel tersebut ditata bertumpuk (blok per sel + label kolom) agar isi mengalir aman.
    const pagePx = payload.page.contentHeightMm * mm(doc);
    holder.querySelectorAll<HTMLTableElement>('.pf-doc table').forEach((t, i) => {
      const tall = [...t.rows].some((tr) => tr.getBoundingClientRect().height > pagePx * 0.8);
      if (!tall) return;
      // Paged.js 0.4.3 mengulang/menghilangkan teks saat sel tabel dipecah >2 halaman (teramati di A5) → ubah ke blok div
      markTableCells(t, trackedCells);
      stackTable(doc, t);
      issues.push({ id: `layout-stacked-table-${i + 1}`, code: 'TABLE_STACKED', severity: 'warning', scope: 'layout', message: `Tabel ${i + 1} memiliki baris yang lebih tinggi dari satu halaman; pada PDF ditata bertumpuk (setiap sel dengan label kolomnya) agar isi tidak terpotong. Pertimbangkan memecah isi sel.` });
    });
    // Blok kode pendek (< 40 % tinggi area): jangan dipecah, agar label bahasa (::before) tidak tertinggal sendirian di
    // dasar halaman. Blok panjang tetap boleh dipecah (dengan label lanjutan) agar tidak terdorong keluar halaman.
    // nomor baris isi tabel → perbaikan paginasi dapat memutus tepat sebelum baris yang meluap
    holder.querySelectorAll<HTMLTableElement>('.pf-doc table[data-block-id]').forEach((t) => { let n = 0; for (const tr of t.querySelectorAll(':scope > tbody > tr')) tr.setAttribute('data-pf-row', String(n++)); });
    // PF-R4-05: stable code identities survive page splitting and preserve significant whitespace.
    holder.querySelectorAll<HTMLElement>('pre, code, kbd, samp').forEach((code, i) => {
      if (!code.parentElement?.closest('pre, code, kbd, samp')) code.dataset.pfCodeId = `c${i}`;
    });
    // Blok panjang dipecah menjadi kotak per baris (span.pf-line, display:block) sehingga mesin paginasi memutus ANTAR baris,
    // tidak di tengah kata (WebKit/Paged.js menyisipkan tanda hubung U+2011 bila memutus teks kode → isi berubah).
    holder.querySelectorAll<HTMLElement>('.pf-doc pre').forEach((pre) => {
      if (pre.getBoundingClientRect().height < pagePx * 0.4) pre.classList.add('pf-keep');
      else if (!pre.classList.contains('pf-mermaid')) splitCodeLines(doc, pre);
    });
    // Heading + blok berikutnya yang tidak muat satu halaman: jangan paksa "keep with next" (mesin akan mendorong keluar halaman)
    holder.querySelectorAll<HTMLElement>('.pf-doc :is(h1,h2,h3,h4,h5,h6)').forEach((h) => {
      const n = h.nextElementSibling as HTMLElement | null;
      if (!n) return;
      const unsplittable = n.matches('figure, .pf-math-block, .pf-mermaid') || (n.matches('p') && !!n.querySelector('img, svg') && !(n.textContent ?? '').trim());
      if (unsplittable && h.getBoundingClientRect().height + n.getBoundingClientRect().height > pagePx * 0.92) h.classList.add('pf-keep-off');
    });
    holder.querySelectorAll<HTMLElement>('.pf-math-block').forEach((box, i) => {
      const k = box.querySelector<HTMLElement>('.katex-display > .katex');
      if (!k) return;
      const w = box.clientWidth; const need = k.scrollWidth;
      if (need <= w + 1) return;
      const scale = Math.max(READABILITY.minMathScale, Math.floor((w / need) * 100) / 100);
      box.style.setProperty('zoom', String(scale)); box.setAttribute('data-pf-scale', String(scale)); mathScaled++;
      const still = need * scale > w + 1;
      issues.push(still
        ? { id: `layout-wide-math-${i + 1}`, code: 'MATH_TOO_WIDE', severity: 'error', scope: 'layout', message: `Rumus display ${i + 1} tetap lebih lebar dari area teks pada skala minimum ${Math.round(READABILITY.minMathScale * 100)}%. Rumus akan melewati margin kanan; pecah rumus (mis. aligned) atau pilih lanskap.` }
        : { id: `layout-scaled-math-${i + 1}`, code: 'MATH_SCALED', severity: 'info', scope: 'layout', message: `Rumus display ${i + 1} diperkecil lokal ke ${Math.round(scale * 100)}% agar muat (batas ${Math.round(READABILITY.minMathScale * 100)}%).` });
    });
    holder.querySelectorAll<HTMLElement>('.pf-cover').forEach((c) => c.style.removeProperty('display'));
    return { html: holder.innerHTML, issues, tableFits, mathScaled, trackedCells };
  } finally { holder.remove(); st.remove(); }
}

function pageLabelMap(pages: HTMLElement[], start: number): string[] {
  let n = start - 1;
  return pages.map((p) => (p.classList.contains('pagedjs_pf-cover_page') ? '' : String(++n)));
}

function applyPageNumbers(pages: HTMLElement[], labels: string[]) {
  pages.forEach((p, i) => {
    p.style.setProperty('--pf-pnum', labels[i] ? JSON.stringify(labels[i]) : '""');
    if (p.querySelector('.pagedjs_page_content .pf-toc')) p.classList.add('pf-page-toc');
    // Paged.js 0.4.3 menulis string-set sebagai string CSS tanpa kutip penutup ("Judul) — valid di CSSOM hidup tetapi
    // rusak saat atribut style diserialisasi ke HTML datar (header berjalan hilang di PDF). Tulis ulang dengan kutip lengkap.
    for (const prop of [...p.style].filter((k) => k.startsWith('--pagedjs-string-'))) {
      const raw = p.style.getPropertyValue(prop).trim();
      const text = raw.replace(/^["']/, '').replace(/["']$/, '');
      p.style.setProperty(prop, JSON.stringify(text));
    }
    const first = p.querySelector('.pagedjs_page_content [data-ref]:not(article):not(main)');
    if (first?.matches('h1.pf-chapter-opener')) p.classList.add('pf-page-opener');
  });
}

function computeMap(container: HTMLElement, ids: string[], start: number) {
  const pages = [...container.querySelectorAll<HTMLElement>('.pagedjs_page')];
  const labels = pageLabelMap(pages, start);
  const map: Record<string, { page: number; label: string }> = {};
  for (const id of ids) {
    const el = container.querySelector(`[id="${CSS.escape(id)}"]`);
    const page = el?.closest<HTMLElement>('.pagedjs_page');
    if (page) { const idx = pages.indexOf(page); map[id] = { page: idx + 1, label: labels[idx] ?? '' }; }
  }
  return { pages, labels, map };
}

function diagnostics(pages: HTMLElement[], doc: Document): { diag: PageDiagnostic[]; issues: Issue[] } {
  const diag: PageDiagnostic[] = []; const issues: Issue[] = [];
  const px = mm(doc);
  pages.forEach((p, i) => {
    const area = p.querySelector<HTMLElement>('.pagedjs_page_content');
    if (!area) return;
    const box = area.getBoundingClientRect();
    const over: PageDiagnostic['overflow'] = [];
    area.querySelectorAll<HTMLElement>('p, li, pre, table, img, svg, figure, .katex-display, h1, h2, h3, h4, blockquote, .pf-msg-speaker').forEach((el) => {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      const dx = r.right - box.right, dy = r.bottom - box.bottom;
      if (dx > 1.5 || dy > 1.5) over.push({ tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/)[0] : ''), dxMm: +(Math.max(0, dx) / px).toFixed(1), dyMm: +(Math.max(0, dy) / px).toFixed(1) });
    });
    const text = (area.textContent ?? '').replace(/\s+/g, '');
    const media = area.querySelector('img, svg, hr');
    const cover = p.classList.contains('pagedjs_pf-cover_page');
    const blank = !cover && !text && !media;
    diag.push({ page: i + 1, overflow: over.slice(0, 10), blank, chars: text.length });
    if (over.length) issues.push({ id: `layout-overflow-p${i + 1}`, code: 'PAGE_OVERFLOW', severity: 'warning', scope: 'layout', message: `Halaman ${i + 1}: ${over.length} elemen melewati area teks (mis. ${over[0]!.tag} +${Math.max(over[0]!.dxMm, over[0]!.dyMm)} mm).` });
    if (blank) issues.push({ id: `layout-blank-p${i + 1}`, code: 'BLANK_PAGE', severity: 'warning', scope: 'layout', message: `Halaman ${i + 1} kosong tanpa disengaja (bukan sampul). Pemicu kemungkinan: pemutus halaman/bab berurutan.` });
  });
  // Baris yatim/janda: Paged.js 0.4.3 tidak menegakkan orphans/widows CSS. Diukur pada fragmen paragraf terbelah
  // (data-split-to = bagian di dasar halaman, data-split-from = lanjutan di halaman berikutnya) dan dilaporkan.
  const single: number[] = [];
  pages.forEach((p, i) => {
    for (const el of p.querySelectorAll<HTMLElement>('.pagedjs_page_content p[data-split-to], .pagedjs_page_content p[data-split-from], .pagedjs_page_content li[data-split-to], .pagedjs_page_content li[data-split-from]')) {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 0;
      const h = el.getBoundingClientRect().height;
      if (lh > 0 && h > 0 && Math.round(h / lh) <= 1 && !single.includes(i + 1)) single.push(i + 1);
    }
  });
  if (single.length) issues.push({ id: 'layout-widow-orphan', code: 'LAYOUT_WIDOW_ORPHAN', severity: 'info', scope: 'layout', message: `${single.length} halaman memiliki paragraf terbelah dengan satu baris saja di dasar atau puncak halaman (halaman ${single.slice(0, 12).join(', ')}${single.length > 12 ? ', …' : ''}). Isi tetap lengkap; ini catatan tipografi.` });
  // Tebal/miring sintetis (tidak ada berkas font yang cocok) → Chrome menulis glyph Type 3; laporkan eksplisit.
  const loaded = new Map<string, { w: number; s: string }[]>();
  for (const f of doc.fonts) if (f.status === 'loaded') { const k = f.family.replace(/^["']|["']$/g, ''); const a = loaded.get(k) ?? []; a.push({ w: Number(f.weight) || 400, s: f.style }); loaded.set(k, a); }
  const synth = new Set<string>();
  for (const p of pages) {
    const tw = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement || n.parentElement.closest('.katex, svg')) continue;
      const cs = getComputedStyle(n.parentElement);
      const fam = cs.fontFamily.split(',')[0]!.trim().replace(/^["']|["']$/g, '');
      const faces = loaded.get(fam); if (!faces) continue;
      const w = Number(cs.fontWeight) || 400; const it = cs.fontStyle !== 'normal';
      const cand = faces.filter((f) => (it ? f.s !== 'normal' : true));
      if (it && !cand.length) synth.add(`${fam} ${w} italic (miring sintetis)`);
      else if (w >= 600 && !(cand.length ? cand : faces).some((f) => f.w >= 600)) synth.add(`${fam} ${w}${it ? ' italic' : ''} (tebal sintetis)`);
    }
  }
  if (synth.size) issues.push({ id: 'font-synthesized', code: 'FONT_SYNTHESIZED', severity: 'warning', scope: 'font', message: `Gaya huruf tanpa berkas font yang cocok (disintesis peramban): ${[...synth].join('; ')}.` });
  return { diag, issues };
}

/** HTML datar: sudah dipaginasi, font tersemat, TANPA skrip — payload untuk API PDF server dan Chrome lokal. */
function flatten(doc: Document, container: HTMLElement, payload: PrintPayload, expectedPages: number): string {
  // cssRules (bukan textContent): Paged.js menambah aturan lewat insertRule (string-set, selektor "following", dll.)
  const inserted = [...doc.querySelectorAll<HTMLStyleElement>('style[data-pagedjs-inserted-styles]')].map((s) => { try { return [...(s.sheet?.cssRules ?? [])].map((r) => r.cssText).join('\n'); } catch { return s.textContent ?? ''; } }).join('\n');
  const rootStyle = doc.documentElement.getAttribute('style') ?? '';
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, template').forEach((n) => n.remove());
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  return `<!doctype html>\n<html lang="${esc(payload.lang)}"${rootStyle ? ` style="${esc(rootStyle)}"` : ''}>\n<head>\n<meta charset="utf-8">\n<title>${esc(payload.title)}</title>\n`
    + (payload.author ? `<meta name="author" content="${esc(payload.author)}">\n` : '')
    + `<meta name="generator" content="${esc(payload.generator)}">\n<meta name="pf-expected-pages" content="${expectedPages}">\n<meta name="pf-render-input-hash" content="${esc(payload.snapshot.renderInputHash)}">\n`
    + `<style data-pf="fonts">${payload.fontCss}</style>\n<style data-pf="paged">${inserted}</style>\n`
    + `<style data-pf="flat">@media print{html,body{margin:0;padding:0;background:#fff}.pagedjs_pages{display:block}.pagedjs_page{box-shadow:none!important;margin:0!important}}@media screen{body{background:#e9ecef;margin:0}.pagedjs_pages{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px 0}.pagedjs_page{background:#fff}}</style>\n`
    + `</head>\n<body class="${esc(payload.bodyClass)}">\n${clone.outerHTML}\n</body>\n</html>\n`;
}

/* ---------------- inventaris isi (EN-006) ---------------- */
/** Elemen yang tidak dihitung sebagai isi: MathML tersembunyi KaTeX, salinan header/kunci tabel berulang, nomor halaman TOC. */
const NON_CONTENT = '.katex-mathml, annotation, script, style, template, [data-pf-repeat], .pf-toc-page';
export interface ContentInventory {
  text: string; numbers: string[]; images: string[]; formulas: string[]; links: string[]; blocks: string[]; code: number; cells: number; footnotes: number;
  /** urutan blok (id) dalam urutan dokumen; fragmen berurutan dari blok yang terbelah antarhalaman digabung */
  blockSeq: string[];
  /** teks per blok (tanpa spasi), fragmen digabung sesuai urutan — melokalkan kehilangan/duplikasi ke blok tertentu */
  blockText: Record<string, string>;
  /** heading berurutan: "h2|teks" */
  headings: string[];
  /** jumlah baris isi per tabel (baris header yang diulang di halaman lanjutan TIDAK dihitung) */
  tableRows: Record<string, number>;
  /** PF-R4-05: exact code fragments, including spaces/tabs/newlines (no prose whitespace normalization). */
  codeText: Record<string, string>;
}
const BLOCK_SEL = '[data-block-id]';
/**
 * Inventaris isi dari sebuah akar DOM. Teks dibandingkan TANPA spasi sehingga pemecahan baris/halaman di tengah kata
 * (pemecahan yang sah) tidak dianggap kehilangan; penghapusan, duplikasi, pertukaran isi, perubahan heading,
 * pemotongan baris tabel, dan pengulangan/penyusunan ulang blok tetap terdeteksi — tidak memakai hitungan karakter semata.
 */
export function contentInventory(roots: Element[]): ContentInventory {
  const inv: ContentInventory = { text: '', numbers: [], images: [], formulas: [], links: [], blocks: [], code: 0, cells: 0, footnotes: 0, blockSeq: [], blockText: {}, headings: [], tableRows: {}, codeText: {} };
  const blocks = new Set<string>();
  let prevLink = '';
  let prevHeading: { key: string; el: Element | null } = { key: '', el: null };
  const rowIds = new Map<string, Set<string>>(); const untracked: Record<string, number> = {};
  for (const root of roots) {
    const clone = root.cloneNode(true) as Element;
    clone.querySelectorAll(NON_CONTENT).forEach((n) => n.remove());
    // normalisasi terdokumentasi: tanda pemenggalan yang ditambahkan mesin paginasi di titik putus (bukan isi sumber)
    for (const h of clone.querySelectorAll('.pagedjs_hyphen')) {
      const last = [...h.childNodes].reverse().find((c) => c.nodeType === 3);
      if (last?.nodeValue?.endsWith(ENGINE_HYPHEN)) last.nodeValue = last.nodeValue.slice(0, -1);
    }
    inv.text += (clone.textContent ?? '').replace(/\s+/g, '');
    for (const [i, code] of [...clone.querySelectorAll<HTMLElement>('pre, code, kbd, samp')].entries()) {
      if (code.parentElement?.closest('pre, code, kbd, samp')) continue;
      const id = code.dataset.pfCodeId ?? `${code.closest('[data-block-id]')?.getAttribute('data-block-id') ?? 'unkeyed'}:${i}`;
      const lines = [...code.querySelectorAll<HTMLElement>('.pf-line[data-pf-code-line]')];
      if (lines.length) {
        for (const line of lines) {
          const key = `${id}:line:${line.dataset.pfCodeLine}`;
          inv.codeText[key] = (inv.codeText[key] ?? '') + (line.textContent ?? '');
        }
      } else inv.codeText[id] = (inv.codeText[id] ?? '') + (code.textContent ?? '');
    }
    for (const el of clone.querySelectorAll('img')) inv.images.push(el.getAttribute('src') ?? '');
    for (const el of clone.querySelectorAll('.pf-math[data-tex]')) inv.formulas.push(el.getAttribute('data-tex') ?? '');
    for (const el of clone.querySelectorAll('a[href]')) {
      const h = el.getAttribute('href') ?? '';
      // satu tautan yang terbelah antarhalaman menjadi dua fragmen <a> berurutan
      if (h !== prevLink) inv.links.push(h);
      prevLink = h;
    }
    for (const el of clone.querySelectorAll(BLOCK_SEL)) {
      if (el.parentElement?.closest(BLOCK_SEL)) continue; // hanya blok terluar
      const id = el.getAttribute('data-block-id')!;
      blocks.add(id);
      if (inv.blockSeq[inv.blockSeq.length - 1] !== id) inv.blockSeq.push(id);
      inv.blockText[id] = (inv.blockText[id] ?? '') + (el.textContent ?? '').replace(/\s+/g, '');
      if (el.tagName === 'TABLE') {
        // baris dihitung menurut identitas data-pf-row: fragmen satu baris yang terbelah antarhalaman = satu baris;
        // duplikasi isi baris tetap terdeteksi lewat blockText. Salinan header berulang ([data-pf-repeat]) sudah dibuang.
        const set = rowIds.get(id) ?? new Set<string>(); rowIds.set(id, set);
        for (const tr of el.querySelectorAll('tr')) { const k = tr.getAttribute('data-pf-row'); if (k !== null) set.add(k); else untracked[id] = (untracked[id] ?? 0) + 1; }
      }
    }
    for (const h of clone.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      if (h.closest('.pf-toc')) continue;
      const key = `${h.tagName.toLowerCase()}|${(h.textContent ?? '').replace(/\s+/g, ' ').trim()}`;
      // heading terbelah (jarang) → fragmen lanjutan bertanda data-split-from digabung
      if (h.hasAttribute('data-split-from') && prevHeading.key) { inv.headings[inv.headings.length - 1] = prevHeading.key + key.slice(key.indexOf('|') + 1); continue; }
      inv.headings.push(key); prevHeading = { key, el: h };
    }
  }
  for (const [id, set] of rowIds) inv.tableRows[id] = set.size + (untracked[id] ?? 0);
  inv.numbers = inv.text.match(/\p{N}+/gu) ?? [];
  inv.blocks = [...blocks].sort();
  return inv;
}
export interface InventoryDiff { field: keyof ContentInventory; expected: string; actual: string; at?: number; blockId?: string; kind?: 'missing' | 'added' | 'changed' | 'duplicated' | 'reordered' | 'truncated' }
export function compareInventory(e: ContentInventory, a: ContentInventory): InventoryDiff[] {
  const out: InventoryDiff[] = [];
  if (e.text !== a.text) {
    let i = 0; while (i < e.text.length && e.text[i] === a.text[i]) i++;
    out.push({ field: 'text', at: i, expected: e.text.slice(Math.max(0, i - 20), i + 40), actual: a.text.slice(Math.max(0, i - 20), i + 40), kind: a.text.length < e.text.length ? 'missing' : a.text.length > e.text.length ? 'added' : 'changed' });
  }
  for (const f of ['numbers', 'images', 'formulas', 'links', 'blocks'] as const) {
    const x = (e[f] as string[]).join('\u0001'), y = (a[f] as string[]).join('\u0001');
    if (x !== y) out.push({ field: f, expected: `${(e[f] as string[]).length}`, actual: `${(a[f] as string[]).length}` });
  }
  // urutan blok: blok muncul lagi setelah blok lain = duplikasi/penyusunan ulang (mis. halaman tercetak dua kali)
  if (e.blockSeq.join('\u0001') !== a.blockSeq.join('\u0001')) {
    let i = 0; while (i < e.blockSeq.length && e.blockSeq[i] === a.blockSeq[i]) i++;
    const got = a.blockSeq[i];
    const dup = got !== undefined && a.blockSeq.indexOf(got) < i;
    out.push({ field: 'blockSeq', at: i, expected: e.blockSeq[i] ?? '∅', actual: got ?? '∅', ...(got ? { blockId: got } : e.blockSeq[i] ? { blockId: e.blockSeq[i] } : {}), kind: dup ? 'duplicated' : got === undefined ? 'missing' : !e.blockSeq.includes(got) ? 'added' : 'reordered' });
  }
  for (const id of new Set([...Object.keys(e.blockText), ...Object.keys(a.blockText)])) {
    const x = e.blockText[id], y = a.blockText[id];
    if (x === y) continue;
    let i = 0; if (x && y) while (i < x.length && x[i] === y[i]) i++;
    out.push({ field: 'blockText', blockId: id, at: i, expected: (x ?? '∅').slice(Math.max(0, i - 15), i + 30), actual: (y ?? '∅').slice(Math.max(0, i - 15), i + 30), kind: y === undefined ? 'missing' : x === undefined ? 'added' : y.length > x.length && y.includes(x) ? 'duplicated' : y.length < x.length ? 'truncated' : 'changed' });
    if (out.length > 40) break;
  }
  for (const id of new Set([...Object.keys(e.codeText), ...Object.keys(a.codeText)])) {
    const x = e.codeText[id], y = a.codeText[id];
    if (x !== y) out.push({ field: 'codeText', blockId: id, expected: JSON.stringify(x ?? null), actual: JSON.stringify(y ?? null), kind: y === undefined ? 'missing' : x === undefined ? 'added' : 'changed' });
  }
  if (e.headings.join('\u0001') !== a.headings.join('\u0001')) {
    let i = 0; while (i < e.headings.length && e.headings[i] === a.headings[i]) i++;
    out.push({ field: 'headings', at: i, expected: e.headings[i] ?? '∅', actual: a.headings[i] ?? '∅', kind: a.headings.length < e.headings.length ? 'missing' : a.headings.length > e.headings.length ? 'added' : 'changed' });
  }
  for (const id of new Set([...Object.keys(e.tableRows), ...Object.keys(a.tableRows)])) {
    if (e.tableRows[id] !== a.tableRows[id]) out.push({ field: 'tableRows', blockId: id, expected: String(e.tableRows[id] ?? 0), actual: String(a.tableRows[id] ?? 0), kind: (a.tableRows[id] ?? 0) < (e.tableRows[id] ?? 0) ? 'truncated' : 'added' });
  }
  return out;
}

/** Ringkasan manusiawi untuk satu selisih inventaris (dipakai di pesan temuan). */
export function describeInventoryDiff(d: InventoryDiff, en = false): string {
  const kindId: Record<string, string> = { missing: 'hilang', added: 'bertambah', changed: 'berubah', duplicated: 'berulang', reordered: 'urutannya berubah', truncated: 'terpotong' };
  const k = d.kind ? (en ? d.kind : kindId[d.kind]) : (en ? 'changed' : 'berubah');
  switch (d.field) {
    case 'codeText': return en ? `Code ${d.blockId} changed (including whitespace): ${d.expected} → ${d.actual}.` : `Kode ${d.blockId} berubah (termasuk spasi): ${d.expected} → ${d.actual}.`;
    case 'blockText': return en ? `Block ${d.blockId} ${k}: “${d.expected}” → “${d.actual}”.` : `Blok ${d.blockId} ${k}: “${d.expected}” → “${d.actual}”.`;
    case 'blockSeq': return en ? `Block order ${k} at position ${(d.at ?? 0) + 1}: expected ${d.expected}, found ${d.actual}.` : `Urutan blok ${k} pada posisi ${(d.at ?? 0) + 1}: seharusnya ${d.expected}, ditemukan ${d.actual}.`;
    case 'headings': return en ? `Heading ${k}: “${d.expected}” → “${d.actual}”.` : `Judul bagian ${k}: “${d.expected}” → “${d.actual}”.`;
    case 'tableRows': return en ? `Table ${d.blockId} rows ${k}: ${d.expected} → ${d.actual}.` : `Baris tabel ${d.blockId} ${k}: ${d.expected} → ${d.actual}.`;
    case 'text': return en ? `Text ${k} near “${d.expected}” → “${d.actual}”.` : `Teks ${k} sekitar “${d.expected}” → “${d.actual}”.`;
    default: return en ? `${d.field} count ${d.expected} → ${d.actual}.` : `Jumlah ${d.field}: ${d.expected} → ${d.actual}.`;
  }
}

/* ---------------- struktur halaman: nomor halaman, daftar isi, tautan internal ---------------- */
export interface StructureDiff { code: 'PAGE_NUMBER_MISMATCH' | 'TOC_PAGE_MISMATCH' | 'TOC_TARGET_MISSING' | 'INTERNAL_LINK_BROKEN'; page?: number; expected: string; actual: string; target?: string }
/** Label nomor halaman pada sebuah elemen halaman (variabel --pf-pnum yang dipakai @page margin box). */
export function pageNumberLabel(p: HTMLElement): string {
  const raw = p.style.getPropertyValue('--pf-pnum').trim();
  try { return raw ? String(JSON.parse(raw)) : ''; } catch { return raw.replace(/^["']|["']$/g, ''); }
}
/**
 * Verifikasi struktur pada hasil DATAR (yang benar-benar dicetak): (1) label nomor halaman sama dengan peta paginasi,
 * (2) setiap entri daftar isi menunjuk halaman tempat heading tujuannya berada, (3) tautan internal punya tujuan.
 */
export function verifyPageStructure(pages: HTMLElement[], expectedLabels: string[]): StructureDiff[] {
  const out: StructureDiff[] = [];
  pages.forEach((p, i) => {
    const got = pageNumberLabel(p);
    if (got !== (expectedLabels[i] ?? '')) out.push({ code: 'PAGE_NUMBER_MISMATCH', page: i + 1, expected: expectedLabels[i] ?? '', actual: got });
  });
  const root = pages[0]?.ownerDocument;
  if (!root) return out;
  const pageOf = (el: Element | null) => { const pg = el?.closest<HTMLElement>('.pagedjs_page'); return pg ? pages.indexOf(pg) : -1; };
  const byId = (id: string) => root.getElementById(id) ?? root.querySelector(`[data-id="${CSS.escape(id)}"]`);
  for (const sp of root.querySelectorAll<HTMLElement>('.pf-toc .pf-toc-page[data-target]')) {
    const id = sp.getAttribute('data-target') ?? '';
    const target = byId(id);
    const idx = pageOf(target);
    if (idx < 0) { out.push({ code: 'TOC_TARGET_MISSING', expected: id, actual: '∅', target: id }); continue; }
    const want = pageNumberLabel(pages[idx]!) || expectedLabels[idx] || '';
    const got = (sp.textContent ?? '').trim();
    if (got !== want) out.push({ code: 'TOC_PAGE_MISMATCH', page: pageOf(sp) + 1, expected: want, actual: got, target: id });
  }
  const seen = new Set<string>();
  for (const a of root.querySelectorAll<HTMLAnchorElement>('.pagedjs_page_content a[href^="#"]')) {
    const fragment = (a.getAttribute('href') ?? '').slice(1);
    // PF-R4-01: malformed external input is a broken anchor, never a URIError for the whole print job.
    let id = fragment;
    try { id = decodeURIComponent(fragment); } catch { /* retain literal fragment for warning */ }
    if (!id || seen.has(id)) continue; seen.add(id);
    if (!byId(id)) out.push({ code: 'INTERNAL_LINK_BROKEN', page: pageOf(a) + 1, expected: id, actual: '∅', target: id });
  }
  return out;
}

export interface FlattenVerification {
  status: 'pass' | 'fail' | 'timeout';
  pages: number;
  lost: { page: number; key: string | null; text: string }[];
  inventory: InventoryDiff[];
  structure: StructureDiff[];
  reason?: string;
}

/**
 * Verifikasi pasca-perataan (EN-006, fail-closed): payload final dimuat ulang di frame terpisah selebar halaman — kondisi
 * yang sama dengan pencetakan — lalu (1) jumlah halaman harus > 0 dan sama dengan hasil paginasi, (2) inventaris isi
 * halaman harus sama dengan inventaris isi sebelum paginasi, (3) setiap elemen berteks harus berada di area isi halamannya.
 * Timeout pemuatan/font menghasilkan 'timeout', BUKAN lulus.
 */
async function verifyFlattened(doc: Document, html: string, widthMm: number, expectedPages: number, expected: ContentInventory, expectedLabels: string[], timeoutMs = 20000): Promise<FlattenVerification> {
  const fr = doc.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
  fr.style.cssText = `position:absolute;left:-30000px;top:0;width:${Math.ceil(widthMm * 96 / 25.4) + 40}px;height:1200px;border:0;visibility:hidden`;
  const loaded = new Promise<void>((res) => { fr.onload = () => res(); });
  fr.srcdoc = html; doc.body.appendChild(fr);
  const raced = <T,>(p: Promise<T>) => Promise.race([p.then(() => true), sleep(timeoutMs).then(() => false)]);
  try {
    if (!(await raced(loaded))) return { status: 'timeout', pages: 0, lost: [], inventory: [], structure: [], reason: 'load' };
    const d = fr.contentDocument; if (!d) return { status: 'fail', pages: 0, lost: [], inventory: [], structure: [], reason: 'no-document' };
    if (!(await raced(d.fonts.ready))) return { status: 'timeout', pages: 0, lost: [], inventory: [], structure: [], reason: 'fonts' };
    const pageEls = [...d.querySelectorAll<HTMLElement>('.pagedjs_page')];
    if (!pageEls.length) return { status: 'fail', pages: 0, lost: [], inventory: [], structure: [], reason: 'zero-pages' };
    if (pageEls.length !== expectedPages) return { status: 'fail', pages: pageEls.length, lost: [], inventory: [], structure: [], reason: `page-count ${pageEls.length} != ${expectedPages}` };
    const areas = pageEls.map((pg) => pg.querySelector<HTMLElement>('.pagedjs_page_content')).filter((x): x is HTMLElement => !!x);
    const inventory = compareInventory(expected, contentInventory(areas));
    const structure = verifyPageStructure(pageEls, expectedLabels);
    const lost: { page: number; key: string | null; text: string }[] = [];
    pageEls.forEach((pg, i) => {
      const area = pg.querySelector<HTMLElement>('.pagedjs_page_content'); if (!area) return;
      const a = area.getBoundingClientRect();
      for (const el of area.querySelectorAll<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6, td, th, pre, figure, .katex-display, .pf-msg-speaker, .pf-stack-cell, dt, dd, caption')) {
        if (el.closest('svg, .katex-mathml')) continue;
        if (!(el.textContent ?? '').trim() && !el.querySelector('img, svg')) continue;
        const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
        const outside = r.left >= a.right - 1 || r.top >= a.bottom - 1 || r.right > a.right + 2 || r.bottom > a.bottom + 2;
        if (!outside) continue;
        const keyed = el.closest<HTMLElement>('[data-block-id], li[id], [id^="fn-"]');
        let key = keyed ? (keyed.id ? `#${keyed.id}` : `[data-block-id="${keyed.getAttribute('data-block-id')}"]`) : null;
        // baris tabel yang meluap: perbaikan menyasar baris itu (bukan seluruh tabel panjang)
        const row = el.closest<HTMLElement>('tr[data-pf-row]');
        if (row && keyed?.tagName === 'TABLE' && row.getAttribute('data-pf-row') !== '0') key = `${key} tr[data-pf-row="${row.getAttribute('data-pf-row')}"]`;
        lost.push({ page: i + 1, key, text: (el.textContent ?? '').trim().slice(0, 80) });
      }
    });
    return { status: lost.length || inventory.length || structure.length ? 'fail' : 'pass', pages: pageEls.length, lost, inventory, structure };
  } finally { fr.remove(); }
}

/**
 * Heading yatim: heading (h1–h4) yang menjadi blok terlihat terakhir sebuah halaman (bukan halaman terakhir), sementara
 * isinya mulai di halaman berikutnya. Paged.js 0.4.3 tidak selalu menegakkan break-after: avoid ketika blok berikutnya
 * (mis. tabel dengan baris pertama tinggi) tidak muat. Mengembalikan selektor heading yang perlu dipindah.
 */
function strandedHeadings(pages: HTMLElement[]): { page: number; key: string; text: string }[] {
  const out: { page: number; key: string; text: string }[] = [];
  pages.forEach((p, i) => {
    if (i >= pages.length - 1) return;
    const content = p.querySelector<HTMLElement>('.pagedjs_page_content'); if (!content) return;
    const blocks = [...content.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, li, pre, table, figure, blockquote, .pf-math-block, .katex-display')]
      .filter((e) => !e.closest('.pf-toc') && e.getBoundingClientRect().height > 0);
    const last = blocks.sort((a, b) => a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom).pop();
    if (!last || !/^H[1-4]$/.test(last.tagName)) return;
    const keyed = last.closest<HTMLElement>('[data-block-id]') ?? (last.id ? last : null);
    if (!keyed) return;
    const key = keyed.getAttribute('data-block-id') ? `[data-block-id="${keyed.getAttribute('data-block-id')}"]` : `#${CSS.escape(keyed.id)}`;
    out.push({ page: i + 1, key, text: (last.textContent ?? '').trim().slice(0, 80) });
  });
  return out;
}

export interface PaginateOptions { renderTo: HTMLElement; signal?: AbortSignal; onProgress?: (msg: { phase: string; pass?: number; pages?: number }) => void }

export async function paginate(payload: PrintPayload, o: PaginateOptions): Promise<PaginationResult> {
  const doc = o.renderTo.ownerDocument;
  const t0 = performance.now(); const timings: Record<string, number> = {};
  const mark = (k: string, s: number) => { timings[k] = Math.round(performance.now() - s); };
  const fail = (code: PaginationFailure['code'], message: string, issues: Issue[]): never => { throw new PaginationError({ code, message }, issues); };
  const aborted = () => { if (o.signal?.aborted) fail('ABORTED', 'Paginasi dibatalkan.', []); };
  const issues: Issue[] = [...payload.issues];
  doc.documentElement.lang = payload.lang;
  doc.body.className = payload.bodyClass;
  doc.title = payload.title;

  let s = performance.now();
  o.onProgress?.({ phase: 'fonts' });
  let fontStyle = doc.querySelector<HTMLStyleElement>('style[data-pf-fonts]');
  if (!fontStyle) { fontStyle = doc.createElement('style'); fontStyle.setAttribute('data-pf-fonts', ''); fontStyle.setAttribute('data-pagedjs-ignore', ''); doc.head.appendChild(fontStyle); }
  fontStyle.textContent = payload.fontCss;
  const fIssues = await awaitFonts(doc, payload); mark('fonts', s);
  if (fIssues.some((i) => i.blocking)) fail(fIssues.some((i) => i.code === 'FONT_TIMEOUT') ? 'FONT_TIMEOUT' : 'FONT_LOAD_FAILED', fIssues[0]!.message, [...issues, ...fIssues]);
  aborted();

  s = performance.now();
  o.onProgress?.({ phase: 'images' });
  const probe = doc.createElement('div'); probe.innerHTML = payload.bodyInner;
  const iIssues = await awaitImages(probe, payload.options.imageTimeoutMs); mark('images', s);
  if (iIssues.length) fail(iIssues[0]!.code === 'IMAGE_TIMEOUT' ? 'IMAGE_TIMEOUT' : 'IMAGE_LOAD_FAILED', iIssues[0]!.message, [...issues, ...iIssues]);
  aborted();

  s = performance.now();
  const fixed = preLayoutFixes(doc, payload); mark('prelayout', s);
  issues.push(...fixed.issues);

  const { Previewer } = await loadPaged();
  const css = payload.styles.join('\n');
  const tocIds = payload.tocIds;
  let content = fixed.html;
  let forcedBreaks = 0; const maxForced = 6;
  repair: for (;;) {
  const issuesAtAttempt = issues.length; // temuan dari percobaan yang dibuang tidak ikut ke hasil
  let written: Record<string, string> = {};
  let passes = 0; let stable = tocIds.length === 0;
  let res = computeMap(o.renderTo, [], payload.page.numberStart);
  const passTimes: number[] = [];
  const maxPasses = Math.max(1, payload.options.maxPasses);
  while (passes < maxPasses) {
    aborted();
    passes++;
    s = performance.now();
    o.onProgress?.({ phase: 'paginate', pass: passes });
    doc.querySelectorAll('style[data-pagedjs-inserted-styles]').forEach((n) => n.remove());
    o.renderTo.innerHTML = '';
    try {
      await new Previewer().preview(content, [{ [`${location.href.split('#')[0]}#pf-doc.css`]: css }], o.renderTo);
    } catch (e) { fail('PAGINATION_FAILED', `Paged.js gagal: ${(e as Error).message}`, issues); }
    passTimes.push(Math.round(performance.now() - s));
    stripEngineHyphensInCode(o.renderTo);
    res = computeMap(o.renderTo, [...new Set([...tocIds, ...payload.headingIds])], payload.page.numberStart);
    o.onProgress?.({ phase: 'paginate', pass: passes, pages: res.pages.length });
    if (!tocIds.length) { stable = true; break; }
    const now: Record<string, string> = Object.fromEntries(tocIds.map((id) => [id, res.map[id]?.label ?? '?']));
    if (passes > 1 && JSON.stringify(now) === JSON.stringify(written)) { stable = true; break; }
    written = now;
    // tulis nomor halaman AKTUAL ke TOC sumber lalu paginasi ulang untuk memverifikasi (TOC tidak pernah ditambal setelah layout)
    const tmp = doc.createElement('div'); tmp.innerHTML = content;
    tmp.querySelectorAll<HTMLElement>('.pf-toc-page[data-target]').forEach((sp) => { sp.textContent = now[sp.getAttribute('data-target') ?? ''] ?? '?'; });
    content = tmp.innerHTML;
  }
  timings.paginatePasses = passTimes.reduce((a, b) => a + b, 0);
  if (!stable) fail('TOC_UNSTABLE', `Nomor halaman daftar isi belum stabil setelah ${passes} putaran paginasi. Kurangi kedalaman daftar isi atau nonaktifkan daftar isi, lalu coba lagi.`, issues);
  const missingTargets = tocIds.filter((id) => !res.map[id]);
  if (missingTargets.length) issues.push({ id: 'toc-missing-targets', code: 'TOC_TARGET_MISSING', severity: 'error', scope: 'layout', blocking: true, message: `${missingTargets.length} entri daftar isi tidak menemukan heading tujuan di hasil paginasi.` });

  applyPageNumbers(res.pages, res.labels);
  const stranded = strandedHeadings(res.pages);
  if (stranded.length && forcedBreaks < maxForced) {
    const tmp = doc.createElement('div'); tmp.innerHTML = content;
    const target = tmp.querySelector<HTMLElement>(stranded[0]!.key);
    if (target && !target.classList.contains('pf-force-break')) {
      target.classList.add('pf-force-break'); content = tmp.innerHTML; forcedBreaks++;
      issues.splice(issuesAtAttempt);
      issues.push({ id: `layout-forced-break-${forcedBreaks}`, code: 'LAYOUT_FORCED_BREAK', severity: 'info', scope: 'layout', message: `Paginasi diulang: judul “${stranded[0]!.text.slice(0, 60)}” tertinggal di dasar halaman ${stranded[0]!.page} dan dipindah ke halaman berikutnya bersama isinya.` });
      continue repair;
    }
  }
  const d = diagnostics(res.pages, doc);
  if (!tableContentIntact(res.pages, fixed.trackedCells)) {
    issues.push({ id: 'table-content-changed', code: 'TABLE_CONTENT_CHANGED', severity: 'error', blocking: true, scope: 'integrity',
      message: payload.lang.startsWith('en') ? 'Table text changed during pagination. Choose landscape or divide the table and try again.' : 'Isi tabel berubah saat paginasi. Pilih orientasi lanskap atau bagi tabel, kemudian coba lagi.' });
  }
  issues.push(...d.issues);
  // header tabel berulang & label lanjutan: hitung untuk bukti
  const repeated = o.renderTo.querySelectorAll('thead[data-pf-repeat]').length;
  const continuedMsgs = o.renderTo.querySelectorAll('.pf-msg[data-split-from]').length;
  s = performance.now();
  const flattenedHtml = flatten(doc, o.renderTo, payload, res.pages.length); mark('flatten', s);
  s = performance.now();
  if (!res.pages.length) fail('PAGINATION_FAILED', 'Paginasi menghasilkan nol halaman; hasil tidak boleh dicetak.', issues);
  const expectedInv = (() => { const tmp = doc.createElement('div'); tmp.innerHTML = content; return contentInventory([tmp]); })();
  const verification = await verifyFlattened(doc, flattenedHtml, payload.page.widthMm, res.pages.length, expectedInv, res.labels); mark('verify', s);
  const lost = verification.lost;
  if (lost.length) {
    const first = lost.find((l) => l.key);
    if (first && forcedBreaks < maxForced) {
      // perbaikan: mulai blok yang meluap di halaman baru, lalu paginasi ulang dari awal (TOC ikut distabilkan ulang)
      const tmp = doc.createElement('div'); tmp.innerHTML = content;
      const target = tmp.querySelector<HTMLElement>(first.key!);
      if (target && !target.classList.contains('pf-force-break')) {
        target.classList.add('pf-force-break'); content = tmp.innerHTML; forcedBreaks++;
        issues.splice(issuesAtAttempt);
        issues.push({ id: `layout-forced-break-${forcedBreaks}`, code: 'LAYOUT_FORCED_BREAK', severity: 'info', scope: 'layout', message: `Paginasi diulang: “${first.text.slice(0, 60)}” tidak muat di halaman ${first.page} dan dipindah ke halaman berikutnya agar tidak terpotong.` });
        continue repair;
      }
    }
    issues.push({ id: 'layout-content-lost', code: 'PAGE_CONTENT_CLIPPED', severity: 'error', scope: 'layout', blocking: true, message: `${lost.length} blok akan terpotong saat dicetak (mis. halaman ${lost[0]!.page}: “${lost[0]!.text.slice(0, 60)}”). Cetak tidak disiapkan agar tidak ada isi yang hilang diam-diam. Coba orientasi lanskap atau matikan daftar isi.` });
  }
  if (verification.status === 'timeout') {
    issues.push({ id: 'layout-verify-timeout', code: 'LAYOUT_VERIFY_TIMEOUT', severity: 'error', scope: 'layout', blocking: true, message: `Verifikasi hasil halaman tidak selesai (${verification.reason}). Hasil tidak dianggap bersih; coba lagi.` });
  } else if (verification.reason) {
    issues.push({ id: 'layout-verify-fail', code: 'LAYOUT_VERIFY_FAILED', severity: 'error', scope: 'layout', blocking: true, message: `Verifikasi hasil halaman gagal: ${verification.reason}.` });
  }
  if (verification.inventory.length) {
    const en = payload.lang.startsWith('en');
    const specific = verification.inventory.find((x) => x.field === 'blockText' || x.field === 'tableRows' || x.field === 'headings' || x.field === 'blockSeq') ?? verification.inventory[0]!;
    issues.push({ id: 'layout-content-inventory', code: 'PAGE_CONTENT_CHANGED', severity: 'error', scope: 'integrity', blocking: true,
      ...(specific.blockId ? { blockId: specific.blockId } : {}),
      message: en ? `Content changed during pagination (${[...new Set(verification.inventory.map((x) => x.field))].join(', ')}). ${describeInventoryDiff(specific, true)} Printing was not prepared.`
        : `Isi berubah selama paginasi (${[...new Set(verification.inventory.map((x) => x.field))].join(', ')}). ${describeInventoryDiff(specific)} Cetak tidak disiapkan.` });
  }
  for (const sd of verification.structure.slice(0, 20)) {
    const msg: Record<StructureDiff['code'], string> = {
      PAGE_NUMBER_MISMATCH: `Nomor halaman ${sd.page} pada hasil cetak tertulis “${sd.actual}”, seharusnya “${sd.expected}”.`,
      TOC_PAGE_MISMATCH: `Daftar isi menunjuk halaman “${sd.actual}” untuk bagian #${sd.target}, padahal bagian itu berada di halaman “${sd.expected}”.`,
      TOC_TARGET_MISSING: `Entri daftar isi #${sd.target} tidak menemukan bagian tujuan pada hasil cetak.`,
      INTERNAL_LINK_BROKEN: `Tautan internal #${sd.target} (halaman ${sd.page}) tidak memiliki tujuan pada hasil cetak.`,
    };
    const blocking = sd.code !== 'INTERNAL_LINK_BROKEN';
    issues.push({ id: `layout-structure-${sd.code}-${sd.page ?? 0}-${sd.target ?? ''}`, code: sd.code, severity: blocking ? 'error' : 'warning', scope: 'layout', ...(blocking ? { blocking: true } : {}), message: msg[sd.code] });
  }
  timings.forcedBreaks = forcedBreaks;
  timings.total = Math.round(performance.now() - t0);
  const hasBlocking = issues.some((i) => i.blocking);
  return {
    status: hasBlocking ? 'error' : 'ok', jobId: payload.jobId, snapshot: payload.snapshot,
    pageCount: res.pages.length, expectedPages: res.pages.length, passes, stable,
    pageMap: res.map, pageLabels: res.labels, toc: tocIds.map((id) => ({ id, label: res.map[id]?.label ?? '' })),
    diagnostics: d.diag, repeatedTableHeaders: repeated, continuedMessages: continuedMsgs,
    layoutFixes: { tablesFitted: fixed.tableFits, mathScaled: fixed.mathScaled },
    issues, timings, flattenedHtml, flattenedBytes: new TextEncoder().encode(flattenedHtml).length, fonts: payload.fonts,
    verification: { status: verification.status, pages: verification.pages, inventory: verification.inventory, structure: verification.structure, lostBlocks: lost.length },
    failure: hasBlocking ? { code: 'BLOCKING_ISSUES', message: issues.find((i) => i.blocking)!.message } : undefined,
  };
  }
}