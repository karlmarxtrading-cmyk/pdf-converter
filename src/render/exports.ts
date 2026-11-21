/**
 * Ekspor HTML (PF-030, HTM-01…07) dengan tiga profil berlabel jujur, manifest berhash, dan pengikatan snapshot.
 *  - standalone : satu berkas; font + gambar tersemat; TANPA skrip; tanpa jaringan (CSP default-src 'none').
 *  - zip        : index.html + assets/ + manifest.json (SHA-256 per berkas); path relatif untuk file:// dan server statis.
 *  - publication: responsif + metadata SEO; skrip peningkatan opsional (berlabel); varian "online" boleh memuat gambar https.
 */
import { zipSync, strToU8 } from 'fflate';
import fontNotices from '../../public/licenses/FONT_NOTICES.txt?raw';
import type { ExportManifest, Issue, RenderedBody, Snapshot } from '../core/contracts';
import { APP_VERSION } from '../core/contracts';
import { LIMITS } from '../core/limits';
import { checkRenderIntegrity } from '../core/integrity';
import { verdictOf, dedupeIssues, type Verdict } from '../core/verdict';
import { composeDocument, prepareBody, type PreparedBody } from './document';
import { fontFaceCss, fontManifest, loadFonts, planFonts, type FontManifestEntry, type FontSource, type LoadedFont } from './fonts';
import { dataUrlToBytes, escapeHtml, extOf, nowIso, sha256Hex, utf8 } from './util';

export type HtmlProfile = 'standalone' | 'zip' | 'publication';

/* ------------------------------ penjaga revisi (HTM-07, OPS-03) ------------------------------ */
export class StaleExportError extends Error {
  readonly code = 'STALE_EXPORT';
  constructor(readonly ticketRevision: number, readonly latestRevision: number) { super(`Hasil ekspor revisi ${ticketRevision} usang; revisi terbaru ${latestRevision}.`); }
}
type ExportIdentity = Pick<Snapshot, 'projectId' | 'revision' | 'renderInputHash'>;
export interface ExportTicket { id: number; kind: string; projectId: string; revision: number; renderInputHash: string; signal: AbortSignal }
/**
 * Hanya hasil dari snapshot TERBARU yang boleh dikirim. UI memanggil `observe(snapshot)` setiap kali proyek berubah;
 * tiket lama dibatalkan (AbortSignal) dan `deliver` menolak hasilnya dengan StaleExportError.
 */
export class ExportGuard {
  private seq = 0;
  private projectId?: string;
  private latest: ExportIdentity | null = null;
  private inflight = new Map<number, { t: ExportTicket; c: AbortController }>();
  activate(projectId: string): void {
    for (const { t, c } of this.inflight.values()) c.abort(new StaleExportError(t.revision, t.revision));
    this.inflight.clear();
    this.projectId = projectId;
    this.latest = null;
  }
  observe(s: ExportIdentity): void {
    if (this.projectId !== s.projectId) this.activate(s.projectId);
    const changed = !this.latest || this.latest.revision !== s.revision || this.latest.renderInputHash !== s.renderInputHash;
    if (this.latest && s.revision < this.latest.revision) return; // revisi lebih tua tidak pernah menjadi "terbaru"
    this.latest = { projectId: s.projectId, revision: s.revision, renderInputHash: s.renderInputHash };
    if (changed) for (const [id, v] of this.inflight) if (!this.matches(v.t)) { v.c.abort(new StaleExportError(v.t.revision, s.revision)); this.inflight.delete(id); }
  }
  begin(s: ExportIdentity, kind = 'export', parent?: AbortSignal): ExportTicket {
    if (this.projectId !== undefined && this.projectId !== s.projectId) throw new StaleExportError(s.revision, this.latest?.revision ?? 0);
    if (this.latest && s.revision < this.latest.revision) throw new StaleExportError(s.revision, this.latest.revision);
    this.observe(s);
    // satu ekspor aktif per jenis: yang lama dibatalkan
    for (const [id, v] of this.inflight) if (v.t.kind === kind) { v.c.abort(new StaleExportError(v.t.revision, s.revision)); this.inflight.delete(id); }
    const c = new AbortController();
    if (parent) { if (parent.aborted) c.abort(parent.reason); else parent.addEventListener('abort', () => c.abort(parent.reason), { once: true }); }
    const t: ExportTicket = { id: ++this.seq, kind, projectId: s.projectId, revision: s.revision, renderInputHash: s.renderInputHash, signal: c.signal };
    this.inflight.set(t.id, { t, c });
    return t;
  }
  private matches(t: ExportTicket): boolean { return !!this.latest && t.projectId === this.latest.projectId && t.revision === this.latest.revision && t.renderInputHash === this.latest.renderInputHash; }
  isCurrent(t: ExportTicket): boolean { return !t.signal.aborted && this.matches(t); }
  deliver<T>(t: ExportTicket, result: T): T {
    this.inflight.delete(t.id);
    if (!this.isCurrent(t)) throw new StaleExportError(t.revision, this.latest?.revision ?? t.revision);
    return result;
  }
  release(t: ExportTicket): void { this.inflight.delete(t.id); }
  get latestRevision(): number | undefined { return this.latest?.revision; }
}

/* ------------------------------ manifest ------------------------------ */
export interface RenderManifest extends ExportManifest {
  profile: HtmlProfile | 'pdf'; variant?: 'offline' | 'online';
  scripts: 'none' | 'enhancement'; network: 'none' | 'external-images';
  fonts: FontManifestEntry[]; files?: { path: string; bytes: number; sha256: string }[];
  issueCount: number; settings: { template: string; paper: string; orientation: string; contentLang: string; inkSaver: boolean };
}
const snapPick = (s: Snapshot): ExportManifest['snapshot'] => ({
  projectId: s.projectId, revision: s.revision, rawSourceHash: s.rawSourceHash, contentSnapshotHash: s.contentSnapshotHash,
  renderInputHash: s.renderInputHash, templateId: s.templateId, templateVersion: s.templateVersion, rendererVersion: s.rendererVersion,
});

/**
 * Validator hasil akhir (QA-01): keluaran HTML/ZIP hanya diserahkan bila semua pemeriksaan WAJIB lulus dan tidak ada
 * issue `block`. Pemeriksaan "tinjau" (tautan internal, cakupan glyph) dan issue `confirm` membuat status `confirm`:
 * byte tersedia, tetapi UI wajib meminta keputusan eksplisit atas daftar spesifik itu sebelum mengunduh.
 */
export const REQUIRED_CHECKS: Record<HtmlProfile, string[]> = {
  standalone: ['no-scripts', 'no-network-resources', 'fonts-embedded', 'size-budget', 'integrity'],
  zip: ['no-scripts', 'no-network-resources', 'relative-files', 'fonts-packaged', 'integrity'],
  publication: ['no-scripts', 'no-network-resources', 'relative-files', 'fonts-packaged', 'integrity'],
};
export const REVIEW_CHECKS = ['internal-anchors', 'glyph-coverage'];

export class ExportBlockedError extends Error {
  readonly code = 'EXPORT_BLOCKED';
  constructor(readonly issues: Issue[], readonly failedChecks: RenderManifest['checks'], readonly verdict: Verdict) {
    super(`Ekspor diblokir: ${[...failedChecks.map((c) => c.name), ...verdict.block.map((i) => i.code)].join(', ')}`);
  }
}

export interface HtmlExportResult {
  bytes: Uint8Array; filename: string; mime: string; manifest: RenderManifest; issues: Issue[];
  /** 'pass' = boleh diunduh; 'confirm' = perlu keputusan eksplisit atas `reviewChecks` + `verdict.confirm` */
  status: 'pass' | 'confirm'; verdict: Verdict; reviewChecks: RenderManifest['checks'];
  /** untuk QA/pratinjau: dokumen utama (index.html) */ html: string;
}
export interface HtmlExportRequest {
  snapshot: Snapshot; body: RenderedBody; profile: HtmlProfile;
  /** publication saja: 'online' mengizinkan gambar https eksternal (berlabel) */ variant?: 'offline' | 'online';
  /** publication saja: sertakan skrip peningkatan kecil (tombol salin kode). Default false. */ enhancements?: boolean;
  guard?: ExportGuard; signal?: AbortSignal; fontTimeoutMs?: number;
  /** default: sumber font peramban (Vite ?url, dimuat sesuai permintaan) */ fontSource?: FontSource;
  /** default true di peramban; false = Mermaid ditampilkan sebagai sumber berlabel */ renderMermaid?: boolean;
  /** batas yang berlaku (default LIMITS); dapat disuntik untuk uji batas tanpa membuat dokumen 25 MiB */ limits?: Pick<typeof LIMITS, 'standaloneHtmlBytes'>;
}

const STANDALONE_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
const zipCsp = (online: boolean, script: boolean) => `default-src 'none'; img-src 'self' data:${online ? ' https:' : ''}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; ${script ? "script-src 'self'; " : ''}base-uri 'none'; form-action 'none'`;

export const ENHANCEMENT_JS = `/* PaperForma — skrip peningkatan opsional (profil publikasi). Hanya menambah tombol salin kode; dokumen tetap lengkap tanpa skrip. */
(function(){var L=document.documentElement.lang.indexOf('en')===0?['Copy code','Copied']:['Salin kode','Tersalin'];
document.querySelectorAll('.pf-doc pre:not(.pf-mermaid-source)').forEach(function(pre){var b=document.createElement('button');b.type='button';b.className='pf-copy';b.textContent=L[0];
b.addEventListener('click',function(){var c=pre.querySelector('code');var t=(c||pre).textContent||'';(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent=L[1];setTimeout(function(){b.textContent=L[0]},1500)},function(){var r=document.createRange();r.selectNodeContents(c||pre);var s=getSelection();s.removeAllRanges();s.addRange(r);});});
var w=document.createElement('div');w.className='pf-code-tools';w.appendChild(b);pre.parentNode.insertBefore(w,pre);});})();
`;
const ENHANCEMENT_CSS = `.pf-code-tools{display:flex;justify-content:flex-end;margin:0 0 -.2em}.pf-copy{font:600 .78rem/1 var(--pf-sans);min-height:28px;padding:.35em .7em;border:1px solid var(--pf-rule);background:var(--pf-paper);color:var(--pf-ink);border-radius:4px;cursor:pointer}.pf-copy:focus-visible{outline:2px solid var(--pf-accent);outline-offset:2px}@media print{.pf-code-tools{display:none}}`;

async function defaultFontSource(): Promise<FontSource> { return (await import('./font-assets')).browserFontSource; }

/** Pemeriksaan statis keluaran: skrip, rujukan jaringan, anchor internal. */
export function staticChecks(html: string, opts: { scriptsAllowed: boolean; networkAllowed: boolean; otherFiles?: Set<string>; cssFiles?: string[] }): RenderManifest['checks'] {
  // Template contents have an inert owner document, including when an invalid
  // resource reference is inspected. Inspect attributes after HTML decoding.
  const template = document.createElement('template');
  template.innerHTML = html;
  const elements = [...template.content.querySelectorAll('*')];
  const ids = new Set<string>(), targets: string[] = [], missing: string[] = [];
  let duplicateIds = 0, forbiddenScript = 0, forbiddenResource = 0, enhancements = 0;
  const cssLoads = (css: string) => {
    // Styles consist of renderer-generated declarations, including packaged local fonts.
    for (const m of css.matchAll(/(?:url\(\s*['"]?|@import\s+['"])((?:https?:)?\/\/[^)"'\s]+)/gi)) if (m) forbiddenResource++;
  };
  for (const node of elements) {
    const tag = node.localName;
    if (node.id) { if (ids.has(node.id)) duplicateIds++; ids.add(node.id); }
    if (tag === 'script') {
      const valid = opts.scriptsAllowed && node.getAttribute('src') === 'assets/enhance.js' && !node.textContent?.trim() &&
        node.getAttribute('data-pf-enhancement') === 'copy-code' && !enhancements && opts.otherFiles?.has('assets/enhance.js');
      if (valid) enhancements++; else forbiddenScript++;
    }
    if (['iframe','object','embed','base'].includes(tag) || (tag === 'meta' && node.getAttribute('http-equiv')?.toLowerCase() === 'refresh')) forbiddenResource++;
    if (tag === 'style') cssLoads(node.textContent ?? '');
    for (const attr of node.attributes) {
      const key = attr.name.toLowerCase(), value = attr.value.trim();
      if (key.startsWith('on')) forbiddenScript++;
      if (key === 'style') cssLoads(value);
      if (key === 'srcset') { forbiddenResource++; continue; } // The renderer emits only single-source images.
      if (!['src','href','xlink:href','poster','data','action','formaction','background','ping'].includes(key)) continue;
      if (tag === 'a' && key === 'href' && !node.closest('svg')) {
        if (value.startsWith('#')) {
          try { targets.push(decodeURIComponent(value.slice(1))); } catch { targets.push(value.slice(1)); }
        } else if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^(https?:|mailto:|tel:)/i.test(value)) forbiddenResource++;
        continue;
      }
      if (value.startsWith('#') || (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(value) && tag === 'img')) continue;
      if (opts.otherFiles?.has(value)) continue;
      if (opts.networkAllowed && tag === 'img' && key === 'src' && /^https:\/\//i.test(value)) continue;
      forbiddenResource++;
      if (value.startsWith('assets/')) missing.push(value);
    }
  }
  for (const text of opts.cssFiles ?? []) cssLoads(text);
  const broken = targets.filter(id => id && !ids.has(id));
  const checks: RenderManifest['checks'] = [
    { name: 'no-scripts', status: forbiddenScript ? 'fail' : 'pass', detail: String(forbiddenScript) },
    { name: 'no-network-resources', status: forbiddenResource ? 'fail' : 'pass', detail: String(forbiddenResource) },
    { name: 'internal-anchors', status: broken.length || duplicateIds ? 'fail' : 'pass', detail: `${targets.length} links, ${broken.length} broken, ${duplicateIds} duplicate` },
  ];
  if (opts.otherFiles) checks.push({ name: 'relative-files', status: missing.length ? 'fail' : 'pass', detail: String(missing.length) });
  return checks;
}

interface Prepared { prepared: PreparedBody; fonts: LoadedFont[]; issues: Issue[]; integrityOk: boolean }
async function prepareAll(req: HtmlExportRequest, allowExternal: boolean, signal?: AbortSignal): Promise<Prepared> {
  const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined' && !(globalThis as { process?: unknown }).process;
  const prepared = await prepareBody(req.snapshot, req.body, { mode: 'screen', renderMermaid: req.renderMermaid ?? hasDom, allowExternalImages: allowExternal });
  const plan = planFonts({ html: prepared.html, settings: req.snapshot.settings, mode: 'screen', headingFont: req.snapshot.brandKit?.headingFont, brandKit: req.snapshot.brandKit });
  const { fonts, issues: fIssues } = await loadFonts(plan, req.fontSource ?? (await defaultFontSource()), { signal, timeoutMs: req.fontTimeoutMs });
  // EN-012/QA-01: SEMUA issue mesin diteruskan (termasuk lingkup input yang memblokir), lalu integritas diperiksa ulang.
  const integrity = checkRenderIntegrity(req.snapshot.source, req.body, { conversation: req.snapshot.conversation });
  return { prepared, fonts, issues: dedupeIssues([...req.body.issues, ...integrity.issues, ...prepared.issues, ...plan.issues, ...fIssues]), integrityOk: integrity.ok };
}

const baseName = (s: Snapshot) => (s.settings.title || 'dokumen').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60).toLowerCase() || 'dokumen';

async function manifestFor(req: HtmlExportRequest, kind: ExportManifest['kind'], bytes: Uint8Array, extra: Partial<RenderManifest> & Pick<RenderManifest, 'checks' | 'fonts' | 'scripts' | 'network' | 'profile'>, issues: Issue[]): Promise<RenderManifest> {
  const s = req.snapshot.settings;
  return {
    kind, snapshot: snapPick(req.snapshot), outputHash: await sha256Hex(bytes), bytes: bytes.length, createdAt: nowIso(),
    issueCount: issues.length, settings: { template: s.template, paper: s.paper, orientation: s.orientation, contentLang: s.contentLang, inkSaver: s.inkSaver },
    ...extra,
  };
}

/** Ekspor HTML. Hasil terikat ke snapshot; dengan `guard`, hasil revisi lama tidak pernah dikirim (StaleExportError). */
export async function exportHtml(req: HtmlExportRequest): Promise<HtmlExportResult> {
  const ticket = req.guard?.begin(req.snapshot, `html-${req.profile}`, req.signal);
  const signal = ticket?.signal ?? req.signal;
  const check = () => { if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Dibatalkan', 'AbortError'); };
  try {
    const online = req.profile === 'publication' && req.variant === 'online';
    check();
    const p = await prepareAll(req, online, signal); check();
    const built = req.profile === 'standalone' ? await buildStandalone(req, p) : await buildFolder(req, p, online);
    check();
    built.manifest.checks.push({ name: 'integrity', status: p.integrityOk ? 'pass' : 'fail', detail: p.integrityOk ? 'sumber → keluaran utuh' : 'isi berubah' });
    const required = REQUIRED_CHECKS[req.profile];
    const failed = built.manifest.checks.filter((c) => required.includes(c.name) && c.status !== 'pass');
    const verdict = verdictOf(built.issues);
    if (failed.length || verdict.status === 'blocked') throw new ExportBlockedError(built.issues, failed, verdict);
    const reviewChecks = built.manifest.checks.filter((c) => REVIEW_CHECKS.includes(c.name) && c.status !== 'pass');
    const out: HtmlExportResult = { ...built, verdict, reviewChecks, status: reviewChecks.length || verdict.status === 'confirm' ? 'confirm' : 'pass' };
    return ticket && req.guard ? req.guard.deliver(ticket, out) : out;
  } catch (e) { if (ticket) req.guard?.release(ticket); throw e; }
}

type Built = Omit<HtmlExportResult, 'status' | 'verdict' | 'reviewChecks'>;
async function buildStandalone(req: HtmlExportRequest, p: Prepared): Promise<Built> {
  const doc = await composeDocument(req.snapshot, { mode: 'screen', prepared: p.prepared, fontCss: fontFaceCss(p.fonts, 'data'), adaptive: true, csp: STANDALONE_CSP,
    extraHead: `<meta name="paperforma-font-notices" content="${escapeHtml(fontNotices)}">` });
  const bytes = utf8(doc.html);
  const checks = staticChecks(doc.html, { scriptsAllowed: false, networkAllowed: false });
  checks.push({ name: 'fonts-embedded', status: p.fonts.length && !p.issues.some((i) => i.code === 'FONT_LOAD_FAILED') ? 'pass' : 'fail', detail: `${p.fonts.length} subset tersemat` });
  checks.push({ name: 'glyph-coverage', status: p.issues.some((i) => i.code === 'FONT_GLYPH_NOT_BUNDLED') ? 'warn' : 'pass' });
  const budget = (req.limits ?? LIMITS).standaloneHtmlBytes;
  checks.push({ name: 'size-budget', status: bytes.length <= budget ? 'pass' : 'fail', detail: `${bytes.length} / ${budget} B` });
  const issues = [...p.issues];
  if (bytes.length > budget) issues.push({ id: 'standalone-too-large', code: 'STANDALONE_TOO_LARGE', severity: 'error', scope: 'integrity', blocking: true, message: `HTML mandiri ${bytes.length} byte melebihi batas ${budget} byte; gunakan profil ZIP. Isi tidak dipotong.` });
  const manifest = await manifestFor(req, 'html-standalone', bytes, { profile: 'standalone', scripts: 'none', network: 'none', fonts: fontManifest(p.fonts), checks }, issues);
  return { bytes, filename: `${baseName(req.snapshot)}.html`, mime: 'text/html;charset=utf-8', manifest, issues, html: doc.html };
}

/** Pindahkan data: URL gambar ke assets/img/<sha>.<ext> (berbasis hash isi). */
async function externalizeImages(html: string, files: Map<string, Uint8Array>): Promise<string> {
  const urls = [...new Set([...html.matchAll(/\bsrc="(data:image\/[^"]+)"/g)].map((m) => m[1]!))];
  let out = html;
  for (const u of urls) {
    const d = dataUrlToBytes(u.replace(/&amp;/g, '&'));
    if (!d) continue;
    const path = `assets/img/${(await sha256Hex(d.bytes)).slice(0, 32)}.${extOf(d.mime)}`;
    files.set(path, d.bytes);
    out = out.split(`src="${u}"`).join(`src="${path}"`);
  }
  return out;
}

async function buildFolder(req: HtmlExportRequest, p: Prepared, online: boolean): Promise<Built> {
  const files = new Map<string, Uint8Array>();
  files.set('licenses/FONT_NOTICES.txt', utf8(fontNotices));
  const pub = req.profile === 'publication';
  const script = pub && !!req.enhancements;
  for (const f of p.fonts) files.set(`assets/fonts/${f.spec.file}`, f.bytes);
  const s = req.snapshot.settings;
  const seo = pub ? [
    s.subtitle ? `<meta name="description" content="${s.subtitle.replace(/"/g, '&quot;').replace(/</g, '&lt;')}">` : '',
    `<meta property="og:type" content="article">`, s.title ? `<meta property="og:title" content="${s.title.replace(/"/g, '&quot;').replace(/</g, '&lt;')}">` : '',
    `<meta name="pf-profile" content="publication-${online ? 'online' : 'offline'}${script ? '+enhancement-script' : ''}">`,
    script ? `<script src="assets/enhance.js" defer data-pf-enhancement="copy-code"></script>` : '',
  ].filter(Boolean).join('\n') : `<meta name="pf-profile" content="zip-offline">`;
  const doc = await composeDocument(req.snapshot, { mode: 'screen', prepared: p.prepared, fontCss: '', adaptive: true, csp: zipCsp(online, script), extraHead: seo + '\n<link rel="license" href="licenses/FONT_NOTICES.txt">', stylesheetHref: 'assets/document.css', fontStylesheetHref: 'assets/fonts.css' });
  files.set('assets/fonts.css', utf8(fontFaceCss(p.fonts, 'relative', 'fonts/')));
  files.set('assets/document.css', utf8(doc.styles.join('\n') + (script ? `\n${ENHANCEMENT_CSS}` : '')));
  if (script) files.set('assets/enhance.js', utf8(ENHANCEMENT_JS));
  const index = await externalizeImages(doc.html, files);
  files.set('index.html', utf8(index));
  const fileList = await Promise.all([...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(async ([path, b]) => ({ path, bytes: b.length, sha256: await sha256Hex(b) })));
  const checks = staticChecks(index, { scriptsAllowed: script, networkAllowed: online, otherFiles: new Set(files.keys()), cssFiles: doc.styles });
  checks.push({ name: 'fonts-packaged', status: p.fonts.length && !p.issues.some((i) => i.code === 'FONT_LOAD_FAILED') ? 'pass' : 'fail', detail: `${p.fonts.length} subset` });
  checks.push({ name: 'glyph-coverage', status: p.issues.some((i) => i.code === 'FONT_GLYPH_NOT_BUNDLED') ? 'warn' : 'pass' });
  const fileManifest = {
    schema: 'paperforma-html-export/1', generator: `PaperForma ${APP_VERSION}`, profile: req.profile, variant: pub ? (online ? 'online' : 'offline') : 'offline',
    scripts: script ? 'enhancement (assets/enhance.js, optional)' : 'none', network: online ? 'external https images allowed' : 'none',
    snapshot: snapPick(req.snapshot), files: fileList, fonts: fontManifest(p.fonts),
    note: 'Buka index.html langsung (file://) atau melalui server statis. SHA-256 per berkas di atas; manifest.json sendiri tidak termasuk.',
  };
  const entries: Record<string, Uint8Array> = {};
  for (const [k, v] of files) entries[k] = v;
  entries['manifest.json'] = strToU8(JSON.stringify(fileManifest, null, 2));
  const bytes = zipSync(entries, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') });
  const issues = [...p.issues];
  if (online) issues.push({ id: 'publication-online', code: 'ONLINE_VARIANT', severity: 'info', scope: 'asset', message: 'Varian publikasi "online": gambar eksternal dimuat dari internet saat dibuka dan tidak tersedia luring.' });
  const manifest = await manifestFor(req, pub ? 'html-publication' : 'html-zip', bytes, { profile: req.profile, variant: pub ? (online ? 'online' : 'offline') : undefined, scripts: script ? 'enhancement' : 'none', network: online ? 'external-images' : 'none', fonts: fontManifest(p.fonts), files: fileList, checks }, issues);
  return { bytes, filename: `${baseName(req.snapshot)}${pub ? '-publikasi' : ''}.zip`, mime: 'application/zip', manifest, issues, html: index };
}
