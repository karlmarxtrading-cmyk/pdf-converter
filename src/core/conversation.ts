/**
 * Impor percakapan (PF-019/020, IMP-06…12). Isi = DATA; tidak ada yang dijalankan atau dibuang diam-diam.
 *  - label pembicara (ID/EN) hanya kandidat; diabaikan di dalam code fence, blockquote, dan tabel;
 *  - potongan tanpa label DIPERTAHANKAN sebagai peran 'unknown' dengan flag;
 *  - teks mirip UI chrome hanya ditandai, tidak dihapus;
 *  - timestamp hanya bila tertulis literal; nama model tidak dikarang;
 *  - deteksi duplikat/revisi = SARAN (default: simpan keduanya);
 *  - composeConversation() menghasilkan Markdown + peta asal (blok → pesan → rentang sumber).
 * Offset = indeks UTF-16 pada rawPlain (atau rawHtml untuk jalur HTML).
 */
import { unified } from 'unified';
import rehypeStringify from 'rehype-stringify';
import type { Element, Root as HRoot } from 'hast';
import type { Nodes as MdNode } from 'mdast';
import type { Conversation, Message, OutputMode, Role, SourceRef } from './contracts';
import { sha256HexSync } from './hash';
import { parseMarkdown, orderedTokens } from './markdown';
import { compareTokens } from './integrity';
import { htmlToMarkdown } from './clipboard';
import { mkIssue, numberIssues, lineOf, type CoreIssue } from './util';
import type { DocumentPart } from './render';
import { speakerDisplay } from './render';
import { checkTextBudget } from './limits';
import { parseHtmlWithinBudget } from './html';

const LABEL_ROLES: [RegExp, Role][] = [
  [/^(user|pengguna|anda|you|kamu|saya|me|human|penanya|siswa|murid)$/i, 'user'],
  [/^(assistant|asisten|chatgpt|claude|gemini|copilot|bard|ai|bot|model|perplexity|mistral|llama|deepseek|grok|qwen)$/i, 'assistant'],
  [/^(system|sistem)$/i, 'system'],
];
const PROVIDER_LABELS = /^(chatgpt|claude|gemini|copilot|bard|perplexity|mistral|llama|deepseek|grok|qwen)$/i;
const LABEL_LINE = /^ {0,3}(?:\*\*|__)?([\p{L}][\p{L}\p{N}]*(?: [\p{L}][\p{L}\p{N}]*)?)(?:\*\*|__)?(?:\s*[([]([^)\]]*\d[^)\]]*)[)\]])?(?:\s+(said|bilang|berkata|menulis|wrote|says))?\s*(?:\*\*|__)?:(?:\*\*|__)?[ \t]*(.*)$/u;
const UI_CHROME = /^\s*(copy|copy code|salin|salin kode|edit|regenerate|share|bagikan|like|dislike|retry|coba lagi|read aloud|baca keras|\d+\s*\/\s*\d+|thumbs up|thumbs down)\s*$/i;

export function roleOfLabel(label: string): Role | null {
  for (const [re, r] of LABEL_ROLES) if (re.test(label.trim())) return r;
  return null;
}

export interface BoundarySuggestion { line: number; label: string; reason: string }
export interface ParseConversationResult { conversation: Conversation; issues: CoreIssue[]; suggestions: BoundarySuggestion[] }

interface LineInfo { text: string; start: number; end: number }
function lines(text: string): LineInfo[] {
  const out: LineInfo[] = []; let s = 0;
  for (;;) {
    const nl = text.indexOf('\n', s);
    if (nl < 0) { out.push({ text: text.slice(s), start: s, end: text.length }); break; }
    out.push({ text: text.slice(s, nl).replace(/\r$/, ''), start: s, end: nl }); s = nl + 1;
  }
  return out;
}

function newConversation(inputId: string, messages: Message[]): Conversation {
  const many = messages.length > 1;
  return { inputId, messages, outputMode: many ? 'selected-messages' : 'answer', selectedOrder: messages.filter((m) => m.selected).map((m) => m.id), showRoles: many, unresolved: [] };
}

/** Membagi teks polos menjadi pesan berdasarkan label baris yang dikenal (di luar fence/kutipan/tabel). */
export function parsePlainConversation(text: string, inputId: string): ParseConversationResult {
  const ls = lines(text);
  const issues: CoreIssue[] = [];
  const suggestions: BoundarySuggestion[] = [];
  const heads: { li: number; role: Role; label: string; ts?: string; restStart: number }[] = [];
  let fence: { ch: string; len: number } | null = null;
  let prevBlank = true;
  for (let i = 0; i < ls.length; i++) {
    const t = ls[i]!.text;
    const fm = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(t);
    if (fence) { if (fm && fm[1]![0] === fence.ch && fm[1]!.length >= fence.len && fm[2]!.trim() === '') fence = null; prevBlank = false; continue; }
    if (fm && !(fm[1]![0] === '`' && fm[2]!.includes('`'))) { fence = { ch: fm[1]![0]!, len: fm[1]!.length }; prevBlank = false; continue; }
    if (/^ {0,3}>/.test(t) || /^\s*\|/.test(t)) { prevBlank = false; continue; }
    const m = LABEL_LINE.exec(t);
    if (m) {
      const label = m[1]!.replace(/\s+(said|bilang|berkata|menulis|wrote|says)$/i, ''); const role = roleOfLabel(label);
      if (role) {
        const restIdx = m[4] ? ls[i]!.start + t.length - m[4].length : ls[i]!.end;
        heads.push({ li: i, role, label, ...(m[2] ? { ts: m[2].trim() } : {}), restStart: m[4] ? restIdx : Math.min(ls[i]!.end + 1, text.length) });
      } else if (prevBlank && (m[4] ?? '') === '' && label.length <= 24) {
        suggestions.push({ line: i + 1, label, reason: 'Baris "Nama:" yang tidak dikenal; mungkin nama pembicara. Tidak dipisah otomatis.' });
      }
    }
    prevBlank = t.trim() === '';
  }
  const messages: Message[] = [];
  let n = 0;
  const mk = (start: number, bodyStart: number, end: number, role: Role, conf: Message['roleConfidence'], flags: string[], label?: string, ts?: string): void => {
    // pangkas baris kosong di tepi (hanya whitespace) — isi tidak diubah
    let bs = bodyStart; while (bs < end && /\s/.test(text[bs]!) ) { const nl = text.indexOf('\n', bs); if (nl < 0 || nl >= end || text.slice(bs, nl).trim() !== '') break; bs = nl + 1; }
    let be = end; while (be > bs && /\s/.test(text[be - 1]!)) be--;
    const markdown = text.slice(bs, be);
    const sourceRef: SourceRef = { inputId, start, end: be, unit: 'utf16' };
    const id = `msg-${++n}`;
    sourceRef.messageId = id;
    const f = [...flags];
    const chrome = lines(markdown).filter((l) => UI_CHROME.test(l.text)).map((l) => l.text.trim());
    if (chrome.length) {
      f.push('possible-ui-chrome');
      issues.push(mkIssue('UI_CHROME_SUSPECT', 'info', 'input', { id: `Pesan ${n} memuat baris yang mirip tombol antarmuka (${chrome.slice(0, 4).join(', ')}). Baris tetap disimpan; hapus sendiri bila memang bukan isi.`, en: `Message ${n} contains lines that look like UI buttons (${chrome.slice(0, 4).join(', ')}). They were kept; remove them yourself if they are not content.` }, { line: lineOf(text, bs), sourceRef }));
    }
    if (!markdown.trim()) f.push('empty');
    const msg: Message = { id, role, roleConfidence: conf, markdown, selected: !f.includes('empty'), sourceRef, flags: f };
    if (label) msg.speakerLabel = label;
    if (ts) msg.timestamp = ts;
    messages.push(msg);
  };
  const firstStart = heads.length ? ls[heads[0]!.li]!.start : text.length;
  if (text.slice(0, firstStart).trim()) {
    mk(0, 0, firstStart, 'unknown', 'unknown', heads.length ? ['unlabeled-prefix'] : ['no-speaker-labels']);
    if (heads.length) issues.push(mkIssue('CONVERSATION_UNLABELED', 'warning', 'input', { id: 'Ada teks sebelum label pembicara pertama; disimpan sebagai pesan dengan peran "tidak diketahui".', en: 'There is text before the first speaker label; kept as a message with "unknown" role.' }, { line: 1 }));
  }
  heads.forEach((h, k) => {
    const end = k + 1 < heads.length ? ls[heads[k + 1]!.li]!.start : text.length;
    mk(ls[h.li]!.start, h.restStart, end, h.role, 'high', [], h.label, h.ts);
  });
  for (let k = 1; k < messages.length; k++) {
    if (messages[k]!.role === messages[k - 1]!.role && messages[k]!.role !== 'unknown') messages[k]!.flags.push('consecutive-same-role');
  }
  const conv = newConversation(inputId, messages);
  const prov = heads.find((h) => PROVIDER_LABELS.test(h.label));
  if (prov) conv.provider = { name: prov.label, confidence: 'low', basis: `label "${prov.label}" tertulis di teks yang ditempel` };
  if (!heads.length && text.trim()) issues.push(mkIssue('CONVERSATION_NO_LABELS', 'info', 'input', { id: 'Tidak ada label pembicara yang dikenali; seluruh teks diperlakukan sebagai satu jawaban (peran tidak diketahui).', en: 'No speaker labels recognised; the whole text is treated as one answer (unknown role).' }));
  for (const s of suggestions) issues.push(mkIssue('CONVERSATION_BOUNDARY_SUGGESTION', 'info', 'input', { id: `Baris ${s.line} ("${s.label}:") mungkin batas pesan. Pisahkan manual bila benar.`, en: `Line ${s.line} ("${s.label}:") may be a message boundary. Split manually if so.` }, { line: s.line }));
  conv.unresolved = issues.filter((i) => i.severity !== 'info');
  return { conversation: conv, issues: numberIssues(issues, 'conv'), suggestions };
}

/**
 * Clipboard HTML percakapan (EN-011, statis 3.0).
 * Jalur struktural dipilih HANYA bila pohon HTML benar-benar memuat elemen dengan ATRIBUT
 * `data-message-author-role` (bukan sekadar teks yang menyebut nama atribut itu). Satu pesan per elemen
 * wrapper terluar; wrapper bersarang tetap menjadi isi. Teks di luar wrapper TIDAK dibuang: setiap
 * rentang di antara wrapper menjadi pesan berperan "unknown" (flag `outside-wrapper`, tidak dipilih
 * otomatis) dengan issue peringatan. Bila tidak ada wrapper struktural, jalur teks polos dipakai
 * (issue info), dan input nonkosong tidak pernah menghasilkan nol pesan tanpa penjelasan.
 */
export function parseClipboardConversation(clip: { plain: string; html?: string }, inputId: string): ParseConversationResult & { usedHtml: boolean } {
  const plainFallback = (extra: CoreIssue[] = []) => {
    const r = parsePlainConversation(clip.plain, inputId);
    const issues = numberIssues([...extra, ...r.issues], 'conv');
    if (!r.conversation.messages.length && (clip.plain.trim() || clip.html?.trim())) {
      issues.push(mkIssue('CONVERSATION_EMPTY_RESULT', 'error', 'input', {
        id: 'Tidak ada isi percakapan yang dapat dikenali dari teks yang ditempel. Tidak ada yang diterapkan; tempel ulang sebagai teks biasa.',
        en: 'No conversation content could be recognised from the pasted text. Nothing was applied; paste it again as plain text.',
      }, { blocking: true }));
    }
    return { ...r, issues, usedHtml: false };
  };
  if (!clip.html || !/data-message-author-role/i.test(clip.html)) return plainFallback();
  const size = checkTextBudget('pasteHtml', clip.html);
  if (!size.ok) return plainFallback([mkIssue('BUDGET_EXCEEDED', 'error', 'input', { id: size.message, en: size.messageEn }, { blocking: true })]);
  const parsed = parseHtmlWithinBudget(clip.html);
  if (!parsed.ok) return plainFallback([mkIssue('BUDGET_EXCEEDED', 'error', 'input', { id: parsed.budget.message, en: parsed.budget.messageEn }, { blocking: true })]);
  const tree = parsed.tree;
  type Seg = { kind: 'wrapper'; el: Element } | { kind: 'gap'; nodes: HRoot['children'] };
  const segs: Seg[] = [];
  let gap: HRoot['children'] = [];
  const isWrapper = (c: HRoot['children'][number]): boolean => c.type === 'element' && c.properties?.dataMessageAuthorRole !== undefined;
  const containsWrapper = (n: Element): boolean => n.children.some((c) => isWrapper(c) || (c.type === 'element' && containsWrapper(c)));
  const walk = (n: HRoot | Element) => {
    for (const c of n.children) {
      if (isWrapper(c)) { if (gap.length) { segs.push({ kind: 'gap', nodes: gap }); gap = []; } segs.push({ kind: 'wrapper', el: c as Element }); }
      else if (c.type === 'element' && containsWrapper(c)) walk(c);
      else gap.push(c);
    }
  };
  walk(tree);
  if (gap.length) segs.push({ kind: 'gap', nodes: gap });
  if (!segs.some((x) => x.kind === 'wrapper')) {
    // Penyebutan literal nama atribut (paragraf, kode, komentar, HTML ter-escape) bukan struktur percakapan.
    return plainFallback([mkIssue('CONVERSATION_HTML_NOT_STRUCTURED', 'info', 'input', {
      id: 'HTML clipboard tidak memuat penanda pesan struktural; teks biasa dipakai sebagai sumber percakapan.',
      en: 'The clipboard HTML has no structural message markers; the plain text is used as the conversation source.',
    })]);
  }
  const issues: CoreIssue[] = [];
  const messages: Message[] = [];
  for (const seg of segs) {
    const n = messages.length + 1;
    const id = `msg-${n}`;
    if (seg.kind === 'gap') {
      const html = unified().use(rehypeStringify).stringify({ type: 'root', children: seg.nodes });
      if (!htmlText(seg.nodes).trim() && !hasMedia(seg.nodes)) continue;
      const conv = htmlToMarkdown(html);
      const first = seg.nodes.find((c) => c.position)?.position?.start.offset ?? 0;
      const last = [...seg.nodes].reverse().find((c) => c.position)?.position?.end.offset ?? first;
      const sourceRef: SourceRef = { inputId, messageId: id, start: first, end: last, unit: 'utf16' };
      if (conv.ok) issues.push(...conv.issues);
      issues.push(mkIssue('CONVERSATION_OUTSIDE_WRAPPER', 'warning', 'input', {
        id: `Ada teks di luar penanda pesan (pesan #${n}). Teks itu dipertahankan sebagai pesan berperan "tidak diketahui" dan belum dipilih; periksa lalu pilih bila perlu.`,
        en: `There is text outside the message markers (message #${n}). It is kept as an "unknown" role message and is not selected yet; review and select it if needed.`,
      }, { sourceRef }));
      messages.push({ id, role: 'unknown', roleConfidence: 'unknown', markdown: conv.ok ? conv.markdown.replace(/\n+$/, '') : htmlText(seg.nodes), selected: false, sourceRef,
        flags: ['from-html', 'offsets-in-raw-html', 'outside-wrapper', ...(conv.ok ? [] : ['conversion-failed'])] });
      continue;
    }
    const el = seg.el;
    const r = String(el.properties?.dataMessageAuthorRole ?? '').toLowerCase();
    const role: Role = r === 'user' ? 'user' : r === 'assistant' ? 'assistant' : r === 'system' ? 'system' : r === '' ? 'unknown' : 'other';
    const inner = unified().use(rehypeStringify).stringify({ type: 'root', children: el.children });
    const conv = htmlToMarkdown(inner);
    const sourceRef: SourceRef = { inputId, messageId: id, start: el.position?.start.offset ?? 0, end: el.position?.end.offset ?? 0, unit: 'utf16' };
    if (conv.ok) issues.push(...conv.issues);
    else issues.push(mkIssue('CONVERSATION_HTML_CONVERSION', 'error', 'input', { id: conv.message, en: conv.messageEn }, { blocking: true, sourceRef }));
    const markdown = conv.ok ? conv.markdown.replace(/\n+$/, '') : htmlText(el.children);
    messages.push({ id, role, roleConfidence: role === 'unknown' || role === 'other' ? 'low' : 'high', markdown, selected: !!markdown.trim(), sourceRef,
      flags: ['from-html', 'offsets-in-raw-html', ...(conv.ok ? [] : ['conversion-failed']), ...(markdown.trim() ? [] : ['empty'])] });
  }
  if (!messages.some((m) => m.markdown.trim())) {
    return plainFallback([mkIssue('CONVERSATION_HTML_EMPTY_MARKERS', 'warning', 'input', {
      id: 'Penanda pesan pada HTML clipboard kosong; teks biasa dipakai sebagai sumber percakapan.',
      en: 'The message markers in the clipboard HTML are empty; the plain text is used as the conversation source.',
    })]);
  }
  const conv = newConversation(inputId, messages);
  conv.unresolved = issues.filter((i) => i.severity !== 'info');
  return { conversation: conv, issues: numberIssues(issues, 'conv'), suggestions: [], usedHtml: true };
}

function hasMedia(nodes: HRoot['children'] | Element['children']): boolean {
  return nodes.some((n) => n.type === 'element' && (['img', 'svg', 'math', 'table', 'video', 'picture'].includes(n.tagName) || hasMedia(n.children)));
}

function htmlText(nodes: HRoot['children'] | Element['children']): string {
  let out = '';
  const visit = (n: HRoot['children'][number]) => {
    if (n.type === 'text') out += n.value;
    else if (n.type === 'element') { if (n.tagName === 'script' || n.tagName === 'style') return; n.children.forEach(visit); if (/^(p|div|li|h[1-6]|br|tr|pre|blockquote)$/.test(n.tagName)) out += '\n'; }
  };
  nodes.forEach((n) => visit(n as HRoot['children'][number]));
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/* ---------------- duplikat / revisi (saran) ---------------- */
export interface DuplicateSuggestion { a: string; b: string; kind: 'exact-duplicate' | 'revision-candidate'; differences: { index: number; a?: string; b?: string }[]; action: 'keep-both' }

export function suggestDuplicates(messages: Message[]): DuplicateSuggestion[] {
  const out: DuplicateSuggestion[] = [];
  for (let i = 0; i < messages.length; i++) for (let j = i + 1; j < messages.length; j++) {
    const A = messages[i]!, B = messages[j]!;
    if (A.role !== B.role || !A.markdown.trim()) continue;
    if (A.markdown === B.markdown) { out.push({ a: A.id, b: B.id, kind: 'exact-duplicate', differences: [], action: 'keep-both' }); continue; }
    const ta = orderedTokens(A.markdown), tb = orderedTokens(B.markdown);
    if (Math.abs(ta.length - tb.length) > 3 || ta.length < 3) continue;
    const diffs: DuplicateSuggestion['differences'] = [];
    // perbedaan per posisi setelah penyelarasan awalan/akhiran
    let p = 0; while (p < ta.length && p < tb.length && ta[p] === tb[p]) p++;
    let s = 0; while (s < ta.length - p && s < tb.length - p && ta[ta.length - 1 - s] === tb[tb.length - 1 - s]) s++;
    const midA = ta.slice(p, ta.length - s), midB = tb.slice(p, tb.length - s);
    if (midA.length + midB.length > 6) continue;
    for (let k = 0; k < Math.max(midA.length, midB.length); k++) {
      const d: { index: number; a?: string; b?: string } = { index: p + k };
      if (midA[k] !== undefined) d.a = midA[k]!;
      if (midB[k] !== undefined) d.b = midB[k]!;
      diffs.push(d);
    }
    out.push({ a: A.id, b: B.id, kind: 'revision-candidate', differences: diffs, action: 'keep-both' });
  }
  return out;
}

/* ---------------- edit manual (setiap edit = revisi) ---------------- */
export interface ConversationOp { op: 'set-role' | 'select' | 'reorder' | 'split' | 'merge' | 'set-mode' | 'show-roles'; detail: Record<string, unknown> }
const cloneConv = (c: Conversation): Conversation => ({ ...c, messages: c.messages.map((m) => ({ ...m, flags: [...m.flags], sourceRef: { ...m.sourceRef } })), selectedOrder: [...c.selectedOrder], unresolved: [...c.unresolved] });

export function setRole(c: Conversation, id: string, role: Role): { conversation: Conversation; op: ConversationOp } {
  const n = cloneConv(c);
  const m = n.messages.find((x) => x.id === id);
  if (m) { m.role = role; m.roleConfidence = 'confirmed'; m.flags = m.flags.filter((f) => f !== 'consecutive-same-role'); }
  return { conversation: n, op: { op: 'set-role', detail: { id, role } } };
}

export function setSelected(c: Conversation, id: string, selected: boolean): { conversation: Conversation; op: ConversationOp } {
  const n = cloneConv(c);
  const m = n.messages.find((x) => x.id === id);
  if (m) m.selected = selected;
  n.selectedOrder = selected ? (n.selectedOrder.includes(id) ? n.selectedOrder : [...n.selectedOrder, id]) : n.selectedOrder.filter((x) => x !== id);
  return { conversation: n, op: { op: 'select', detail: { id, selected } } };
}

/** Pilih tepat himpunan pesan ini dengan urutan yang diberikan. */
export function selectMessages(c: Conversation, ids: string[]): { conversation: Conversation; op: ConversationOp } {
  const n = cloneConv(c);
  const set = new Set(ids);
  for (const m of n.messages) m.selected = set.has(m.id);
  n.selectedOrder = ids.filter((id) => n.messages.some((m) => m.id === id));
  return { conversation: n, op: { op: 'select', detail: { ids } } };
}

export function reorderSelected(c: Conversation, order: string[]): { conversation: Conversation; op: ConversationOp } {
  const n = cloneConv(c);
  const valid = order.filter((id) => n.selectedOrder.includes(id));
  if (valid.length !== n.selectedOrder.length || new Set(valid).size !== valid.length) throw new Error('REORDER_MUST_BE_PERMUTATION');
  n.selectedOrder = valid;
  return { conversation: n, op: { op: 'reorder', detail: { order: valid } } };
}

export function setOutputMode(c: Conversation, mode: OutputMode): { conversation: Conversation; op: ConversationOp } {
  const n = cloneConv(c); n.outputMode = mode;
  return { conversation: n, op: { op: 'set-mode', detail: { mode } } };
}

/** Memecah pesan pada offset (indeks UTF-16 dalam markdown pesan). Tidak ada teks yang hilang. */
export function splitMessage(c: Conversation, id: string, offset: number, newRole: Role = 'unknown'): { conversation: Conversation; op: ConversationOp; newId: string } {
  const n = cloneConv(c);
  const i = n.messages.findIndex((x) => x.id === id);
  const m = n.messages[i];
  if (!m || offset <= 0 || offset >= m.markdown.length) throw new Error('SPLIT_OUT_OF_RANGE');
  const bodyStart = m.sourceRef.end - m.markdown.length;
  let k = 1; while (n.messages.some((x) => x.id === `${id}-s${k}`)) k++;
  const newId = `${id}-s${k}`;
  const second: Message = { id: newId, role: newRole, roleConfidence: newRole === 'unknown' ? 'unknown' : 'confirmed', markdown: m.markdown.slice(offset), selected: m.selected, sourceRef: { ...m.sourceRef, messageId: newId, start: bodyStart + offset }, flags: ['manual-split'] };
  if (m.flags.includes('offsets-in-raw-html') || m.flags.includes('source-span-approximate')) {
    second.sourceRef = { ...m.sourceRef, messageId: newId };
    second.flags = [...m.flags, 'manual-split', 'source-span-approximate'];
    m.flags = [...m.flags, 'source-span-approximate'];
  } else m.sourceRef = { ...m.sourceRef, end: bodyStart + offset };
  m.markdown = m.markdown.slice(0, offset);
  m.flags = [...m.flags, 'manual-split'];
  n.messages.splice(i + 1, 0, second);
  if (m.selected) { const si = n.selectedOrder.indexOf(id); n.selectedOrder.splice(si + 1, 0, newId); }
  return { conversation: n, op: { op: 'split', detail: { id, offset, newId } }, newId };
}

/** Menggabungkan dua pesan BERURUTAN (b tepat setelah a). Isi digabung dengan baris kosong. */
export function mergeMessages(c: Conversation, a: string, b: string): { conversation: Conversation; op: ConversationOp } {
  const n = cloneConv(c);
  const i = n.messages.findIndex((x) => x.id === a);
  if (i < 0 || n.messages[i + 1]?.id !== b) throw new Error('MERGE_REQUIRES_ADJACENT');
  const A = n.messages[i]!, B = n.messages[i + 1]!;
  A.markdown = `${A.markdown}\n\n${B.markdown}`;
  A.sourceRef = { ...A.sourceRef, end: B.sourceRef.end };
  A.flags = [...new Set([...A.flags, 'manual-merge', 'source-span-approximate'])];
  n.messages.splice(i + 1, 1);
  n.selectedOrder = n.selectedOrder.filter((x) => x !== b);
  return { conversation: n, op: { op: 'merge', detail: { a, b } } };
}

/* ---------------- komposisi ---------------- */
export interface ProvenanceEntry {
  kind: 'message' | 'block' | 'label' | 'separator' | 'main' | 'appendix-title';
  outStart: number; outEnd: number; startLine: number; endLine: number;
  messageId?: string; sourceRef?: SourceRef; blockId?: string; messageStart?: number; messageEnd?: number;
  /** penggantian label catatan kaki yang diterapkan pada entri ini (IMP-12) */
  footnoteRenames?: { from: string; to: string }[];
}
export interface ComposeOptions { mode?: OutputMode; mainSource?: string; lang?: 'id' | 'en'; showRoles?: boolean; curated?: { messageId: string; blockIndex: number }[]; appendixTitle?: string }
export interface ComposeResult { markdown: string; provenance: ProvenanceEntry[]; issues: CoreIssue[]; mode: OutputMode }

/** Mengganti label catatan kaki [^x] → [^prefix-x] (rujukan & definisi; di luar kode). */
export function namespaceFootnotes(md: string, prefix: string, range = { start: 0, end: md.length }): { markdown: string; renames: { from: string; to: string }[] } {
  const p = parseMarkdown(md);
  const spots: { start: number; end: number; label: string }[] = [];
  const visit = (n: { type: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: unknown[]; label?: string | null; identifier?: string }) => {
    if ((n.type === 'footnoteReference' || n.type === 'footnoteDefinition') && n.position) {
      const s = n.position.start.offset ?? 0;
      const label = n.label ?? n.identifier ?? '';
      const tag = `[^${label}]`;
      if (s >= range.start && s + tag.length <= range.end && md.startsWith(tag, s)) spots.push({ start: s - range.start, end: s + tag.length - range.start, label });
    }
    for (const c of (n.children ?? []) as typeof n[]) visit(c);
  };
  visit(p.tree as never);
  spots.sort((x, y) => y.start - x.start);
  let out = md.slice(range.start, range.end); const renames = new Map<string, string>();
  for (const s of spots) { const to = `${prefix}-${s.label}`; renames.set(s.label, to); out = out.slice(0, s.start) + `[^${to}]` + out.slice(s.end); }
  return { markdown: out, renames: [...renames].map(([from, to]) => ({ from, to })) };
}

/** Blok tingkat atas sebuah Markdown sebagai irisan sumber mentah (untuk mode terkurasi). */
export function topLevelBlocks(md: string): { index: number; start: number; end: number; text: string; type: string }[] {
  const p = parseMarkdown(md);
  return p.tree.children.map((n, index) => ({ index, start: n.position?.start.offset ?? 0, end: n.position?.end.offset ?? 0, type: n.type, text: md.slice(n.position?.start.offset ?? 0, n.position?.end.offset ?? 0) }));
}

/** Offsets address the original HTML element for conversions, not fictional text offsets inside its markup. */
export function curatedBlocks(message: Message) {
  const md = message.markdown;
  const parsed = parseMarkdown(md);
  function references(n: MdNode): string[] {
    if (n.type === 'footnoteReference') return ['footnote:' + n.identifier];
    if (n.type === 'linkReference' || n.type === 'imageReference') return ['link:' + n.identifier];
    return 'children' in n ? n.children.flatMap(references) : [];
  }
  const blocks = parsed.tree.children.map((n, index) => {
    const start = n.position?.start.offset ?? 0, end = n.position?.end.offset ?? 0;
    const defines = n.type === 'footnoteDefinition' ? 'footnote:' + n.identifier : n.type === 'definition' ? 'link:' + n.identifier : undefined;
    return { index, start, end, type: String(n.type), text: md.slice(start, end), requires: references(n), defines, unsupported: false };
  });
  if (parsed.frontmatter) blocks.push({ index: blocks.length, start: 0, end: parsed.frontmatter.raw.length, type: 'frontmatter', text: parsed.frontmatter.raw, requires: [], defines: undefined, unsupported: true });
  const canMapText = !message.flags.some(f => ['offsets-in-raw-html', 'source-span-approximate'].includes(f));
  const base = message.sourceRef.end - message.markdown.length;
  return blocks.map(block => ({
    ...block,
    id: `${message.id}:${block.start}:${block.end}:${sha256HexSync(block.text)}`,
    sourceRef: canMapText ? { ...message.sourceRef, start: base + block.start, end: base + block.end } : { ...message.sourceRef },
  }));
}

/** Old structured API accepts a conversation alone or its complete import. Different editor text wins. */
export function structuredConversation(source: string, c?: Conversation): Conversation | undefined {
  if (!c || c.editable || c.outputMode === 'answer' || c.outputMode === 'curated') return undefined;
  if (!source || c.outputMode === 'source-appendix') return c;
  const raw = parsePlainConversation(source, c.inputId).conversation.messages;
  return raw.length === c.messages.length && raw.every((m, i) => m.markdown === c.messages[i]!.markdown) ? c : undefined;
}

function selected(c: Conversation): Message[] {
  const byId = new Map(c.messages.map((m) => [m.id, m]));
  return c.selectedOrder.length ? c.selectedOrder.map((id) => byId.get(id)).filter((m): m is Message => !!m && m.selected) : c.messages.filter((m) => m.selected);
}

/**
 * Menyusun Markdown dari percakapan untuk mode answer / selected-messages / transcript / curated / source-appendix.
 * Tidak ada kalimat baru selain label pembicara/judul lampiran (dicatat sebagai provenance 'label').
 * Label catatan kaki tiap pesan diberi namespace m{n}- agar tidak bertabrakan (IMP-12).
 */
export function composeConversation(c: Conversation, opts: ComposeOptions = {}): ComposeResult {
  const mode = opts.mode ?? c.outputMode;
  const lang = opts.lang ?? 'id';
  const issues: CoreIssue[] = [];
  const prov: ProvenanceEntry[] = [];
  let out = '';
  let endLine = 1;
  const push = (kind: ProvenanceEntry['kind'], s: string, extra: Partial<ProvenanceEntry> = {}) => {
    const startLine = endLine;
    endLine += s.split('\n').length - 1;
    const outStart = out.length; out += s;
    prov.push({ kind, outStart, outEnd: out.length, startLine, endLine, ...extra });
  };
  const msgs = selected(c);
  if (!msgs.length) issues.push(mkIssue('CONVERSATION_NOTHING_SELECTED', 'error', 'input', { id: 'Tidak ada pesan yang dipilih.', en: 'No messages are selected.' }, { blocking: true }));
  const showRoles = opts.showRoles ?? (mode === 'transcript' ? true : c.showRoles);
  const bodyOf = (m: Message, idx: number) => namespaceFootnotes(m.markdown, `m${idx + 1}`);
  if (mode === 'answer') {
    const m = msgs.find((x) => x.role === 'assistant') ?? msgs[0];
    if (m) { const b = bodyOf(m, 0); push('message', b.markdown, { messageId: m.id, sourceRef: m.sourceRef, footnoteRenames: b.renames }); }
  } else if (mode === 'curated') {
    const blocksByMessage = new Map(msgs.map(m => [m.id, curatedBlocks(m)]));
    const byId = new Map(msgs.flatMap(m => blocksByMessage.get(m.id)!.map(b => [b.id, { messageId: m.id, blockIndex: b.index }] as const)));
    const picks = opts.curated ?? (c.curatedBlockIds ?? []).map(id => byId.get(id));
    const seen = new Set<string>();
    const definitions = new Set<string>();
    const links = new Map<string, string>();
    const requested: string[] = [];
    if (!picks.length) issues.push(mkIssue('CURATED_EMPTY', 'error', 'input', { id: 'Mode terkurasi memerlukan pilihan blok eksplisit.', en: 'Curated mode requires an explicit block selection.' }, { blocking: true }));
    picks.forEach((pk, k) => {
      const m = pk && msgs.find((x) => x.id === pk.messageId);
      const idx = m ? msgs.indexOf(m) : -1;
      const blk = pk && m ? blocksByMessage.get(m.id)?.[pk.blockIndex] : undefined;
      if (!m || !blk || seen.has(blk.id)) { issues.push(mkIssue('CURATED_BLOCK_MISSING', 'error', 'input', { id: `Pilihan blok kosong, berulang, atau sudah berubah. Pilih ulang blok.`, en: `A selected block is missing, duplicated or changed. Select the blocks again.` }, { blocking: true })); return; }
      if (blk.unsupported) {
        issues.push(mkIssue('CURATED_METADATA', 'error', 'input', { id: 'Frontmatter adalah metadata dokumen. Gunakan editor untuk menempatkannya pada awal dokumen.', en: 'Frontmatter is document metadata. Use the editor to place it at the beginning of the document.' }, { blocking: true }));
        return;
      }
      if (blk.defines) {
        definitions.add(m.id + ':' + blk.defines);
        if (blk.defines.startsWith('link:')) {
          const previous = links.get(blk.defines);
          if (previous && previous !== m.id) issues.push(mkIssue('CURATED_LINK_COLLISION', 'error', 'input', { id: 'Dua definisi tautan memakai nama yang sama. Pilih satu atau bedakan namanya di editor.', en: 'Two link definitions share an identifier. Select one or give them distinct names in the editor.' }, { blocking: true }));
          links.set(blk.defines, m.id);
        }
      }
      requested.push(...blk.requires.map(id => m.id + ':' + id));
      if (k > 0) push('separator', '\n\n');
      const ns = namespaceFootnotes(m.markdown, `m${idx + 1}`, blk);
      seen.add(blk.id);
      push('block', ns.markdown, { messageId: m.id, blockId: blk.id, messageStart: blk.start, messageEnd: blk.end, sourceRef: blk.sourceRef, footnoteRenames: ns.renames });
    });
    if (requested.some(id => !definitions.has(id))) issues.push(mkIssue('CURATED_DEFINITION_REQUIRED', 'error', 'input', { id: 'Pilih juga blok definisi tautan atau catatan kaki yang dirujuk.', en: 'Also select the definition blocks for the referenced links or footnotes.' }, { blocking: true }));
  } else {
    if (mode === 'source-appendix') {
      push('main', opts.mainSource ?? '');
      push('separator', '\n\n');
      push('appendix-title', `## ${opts.appendixTitle ?? (lang === 'id' ? 'Lampiran: percakapan sumber' : 'Appendix: source conversation')}`);
      push('separator', '\n\n');
    }
    msgs.forEach((m, i) => {
      if (i > 0) push('separator', mode === 'transcript' || showRoles ? '\n\n---\n\n' : '\n\n');
      if (showRoles || mode === 'transcript' || mode === 'source-appendix') {
        const label = speakerDisplay(m, lang);
        push('label', `**${label}:**${m.timestamp ? ` ${m.timestamp}` : ''}`, { messageId: m.id });
        push('separator', '\n\n');
      }
      const b = bodyOf(m, i);
      push('message', b.markdown, { messageId: m.id, sourceRef: m.sourceRef, footnoteRenames: b.renames });
    });
  }
  if (!out.trim() && !issues.some(i => i.blocking)) issues.push(mkIssue('COMPOSE_EMPTY', 'error', 'input', { id: 'Pilihan ini menghasilkan dokumen kosong.', en: 'This selection produces an empty document.' }, { blocking: true }));
  return { markdown: out, provenance: prov, issues: numberIssues(issues, 'compose'), mode };
}

/** The map refers to the original assembly even after the editor changes it. */
export function publicationFor(c: Conversation, res: ComposeResult): NonNullable<Conversation['publication']> {
  const byId = new Map(c.messages.map(m => [m.id, m]));
  const spans = res.provenance.map(({ kind, outStart, outEnd, sourceRef, messageId, blockId }) => {
    const message = messageId ? byId.get(messageId) : undefined;
    return { kind, outStart, outEnd, ...(messageId ? { messageId } : {}), ...(sourceRef ? { sourceRef } : {}),
      ...(blockId ? { blockId } : {}), ...(message ? { role: message.role, roleConfidence: message.roleConfidence } : {}) };
  });
  return { mode: res.mode, sourceHash: sha256HexSync(res.markdown), sourceLength: res.markdown.length, spans };
}

/**
 * IMP-10: memastikan hasil komposisi hanya berisi irisan pesan sumber (setelah membalik penggantian label
 * catatan kaki), label, pemisah, dan judul lampiran — tidak ada kalimat baru, tidak ada isi hilang.
 */
export function verifyComposition(res: ComposeResult, c: Conversation): { ok: boolean; issues: CoreIssue[] } {
  const issues: CoreIssue[] = res.issues.filter(i => i.severity === 'error' || i.blocking);
  let cursor = 0;
  for (const p of res.provenance) {
    if (p.outStart !== cursor) issues.push(mkIssue('COMPOSE_GAP', 'error', 'integrity', { id: `Rentang keluaran ${cursor}–${p.outStart} tidak memiliki asal.`, en: `Output range ${cursor}–${p.outStart} has no provenance.` }));
    cursor = p.outEnd;
    if (p.kind !== 'message' && p.kind !== 'block') continue;
    const m = c.messages.find((x) => x.id === p.messageId);
    if (!m) { issues.push(mkIssue('COMPOSE_UNKNOWN_MESSAGE', 'error', 'integrity', { id: `Pesan ${p.messageId} tidak ditemukan.`, en: `Message ${p.messageId} not found.` })); continue; }
    let seg = res.markdown.slice(p.outStart, p.outEnd);
    for (const r of p.footnoteRenames ?? []) seg = seg.split(`[^${r.to}]`).join(`[^${r.from}]`);
    const expected = p.kind === 'message' ? m.markdown : m.markdown.slice(p.messageStart, p.messageEnd);
    if (seg !== expected) {
      const d = compareTokens(orderedTokens(expected), orderedTokens(seg));
      issues.push(mkIssue('COMPOSE_CONTENT_CHANGED', 'error', 'integrity', { id: `Isi pesan ${m.id} berubah dalam komposisi (token ${d.index + 1}: "${d.expected ?? '∅'}" → "${d.actual ?? '∅'}").`, en: `Message ${m.id} content changed in composition (token ${d.index + 1}: "${d.expected ?? '∅'}" → "${d.actual ?? '∅'}").` }));
    }
  }
  if (cursor !== res.markdown.length) issues.push(mkIssue('COMPOSE_GAP', 'error', 'integrity', { id: 'Akhir keluaran tidak memiliki asal.', en: 'End of output has no provenance.' }));
  return { ok: !issues.length, issues: numberIssues(issues, 'verify') };
}

/** IMP-12: menggabungkan beberapa dokumen; label catatan kaki diberi namespace id dokumen; bagian untuk namespace heading. */
export function mergeDocuments(docs: { id: string; markdown: string }[]): { markdown: string; parts: DocumentPart[]; footnoteMap: { docId: string; from: string; to: string }[] } {
  let out = ''; const parts: DocumentPart[] = []; const fmap: { docId: string; from: string; to: string }[] = [];
  docs.forEach((d, i) => {
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(d.id)) throw new Error('DOC_ID_INVALID');
    if (i > 0) out += '\n\n';
    const startLine = lineOf(out + ' ', out.length);
    const ns = namespaceFootnotes(d.markdown, d.id);
    out += ns.markdown.replace(/\s+$/, '');
    parts.push({ id: d.id, startLine, endLine: lineOf(out, out.length) });
    for (const r of ns.renames) fmap.push({ docId: d.id, ...r });
  });
  return { markdown: out + '\n', parts, footnoteMap: fmap };
}

/** Pesan sebagai ringkasan impor (UX-07): jumlah pesan, terpilih, tabel, rumus, gambar. Tanpa merangkum isi. */
export function importSummary(c: Conversation): { messages: number; selected: number; byRole: Record<Role, number>; unknownRoles: number; flagged: number } {
  const byRole: Record<Role, number> = { user: 0, assistant: 0, system: 0, other: 0, unknown: 0 };
  for (const m of c.messages) byRole[m.role]++;
  return { messages: c.messages.length, selected: selected(c).length, byRole, unknownRoles: byRole.unknown, flagged: c.messages.filter((m) => m.flags.length).length };
}
