import type { AssetRecord, BrandKit, Project, Settings, SourceRef } from './contracts';
import { SCHEMA_VERSION } from './contracts';
import { LIMITS, utf8Length, assertBudget } from './limits';
import { canonicalZipPath } from './zip';
import { IMAGE_BUDGET, pixelsOf } from './assets';

function requireField(condition: unknown, path: string): asserts condition {
  if (!condition) throw new TypeError('Invalid project field: ' + path);
}
const object = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
const string = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
// Unpaired UTF-16 units cannot be losslessly written to UTF-8 source.md or raw input files.
const wellFormed = (v: string) => !/[\uD800-\uDFFF]/u.test(v);
const optional = (v: unknown, max: number) => v === undefined || string(v, max);
const member = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v);
const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
const digest = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const range = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && range(v, min, max);
const date = (v: unknown) => typeof v === 'string' && v.length <= 64 && Number.isFinite(Date.parse(v));
const unique = (keys: readonly string[]) => keys.length === new Set(keys).size;
const canonicalPath = (path: string) => {
  const x = canonicalZipPath(path, LIMITS.zipMaxDepth);
  return x.ok && x.path === path;
};

export function validateSettings(s: Settings): void {
  requireField(object(s), 'settings');
  requireField(member(s.template, ['EDU-01','BUS-01','EDT-01','CON-01']) && member(s.paper, ['A4','A5','Letter','Legal']) && member(s.orientation, ['portrait','landscape']), 'settings.layout');
  requireField(object(s.margins) && ['top','bottom','left','right'].every(k => range(s.margins[k as keyof Settings['margins']], 5, 60)), 'settings.margins');
  requireField(member(s.bodyFont, ['inter','source-serif-4']) && range(s.baseSizePt, 8, 14) && range(s.lineHeight, 1.2, 2), 'settings.typography');
  requireField(integer(s.pageNumberStart, 1, 999) && integer(s.tocDepth, 1, 3), 'settings.pagination');
  for (const k of ['followTemplateDefaults','cover','toc','chapterBreak','pageNumbers','inkSaver','allowExternalImages'] as const) requireField(typeof s[k] === 'boolean', 'settings.' + k);
  requireField(typeof s.contentLang === 'string' && /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(s.contentLang) && s.contentLang.length <= 63, 'settings.contentLang');
  requireField(string(s.header, 120) && string(s.footer, 120) && string(s.title, 200) && optional(s.subtitle, 200) && optional(s.author, 160) && optional(s.dateText, 80), 'settings.text');
  requireField(s.brandKitId === undefined || id(s.brandKitId), 'settings.brandKitId');
}

export function validateKit(b: BrandKit, assets: AssetRecord[]): void {
  requireField(object(b) && id(b.id) && string(b.name, 80) && b.name.trim() && date(b.updatedAt), 'brandKit');
  requireField(typeof b.accent === 'string' && /^#[a-f0-9]{6}$/i.test(b.accent) && member(b.headingFont, ['inter','source-serif-4']), 'brandKit.style');
  requireField(optional(b.orgName,120) && optional(b.footerText,200) && (b.logoAssetId === undefined || assets.some(a => a.id === b.logoAssetId)), 'brandKit.metadata');
}

export function validateProject(p: Project): void {
  requireField(object(p) && p.schemaVersion === SCHEMA_VERSION && id(p.projectId) && integer(p.revision) && date(p.createdAt) && date(p.updatedAt) && string(p.name, 1024), 'identity');
  requireField(string(p.source, LIMITS.markdownBytes) && wellFormed(p.source), 'source');
  requireField(Object.keys(p).every(k => ['schemaVersion','projectId','name','createdAt','updatedAt','revision','inputs','source','sourcePath','assets','settings','brandKit','conversation','history'].includes(k)), 'project.fields');
  assertBudget('markdown', utf8Length(p.source));
  if ('sourcePath' in p && p.sourcePath !== undefined) requireField(typeof p.sourcePath === 'string' && canonicalPath(p.sourcePath), 'sourcePath');
  validateSettings(p.settings);
  requireField(Array.isArray(p.assets) && Array.isArray(p.inputs) && Array.isArray(p.history), 'collections');
  const paths: string[] = [];
  for (const a of p.assets) {
    requireField(object(a) && digest(a.id) && string(a.path, 8192) && member(a.origin, ['upload','zip','clipboard','remote-copy','brand']), 'asset.identity');
    const path = a.path.normalize('NFC');
    const safePath = a.origin === 'remote-copy' ? /^https:\/\//i.test(path) : canonicalPath(path);
    requireField(safePath && member(a.mime, ['image/png','image/jpeg','image/gif','image/webp','image/svg+xml']), 'asset.path/mime');
    requireField(a.bytes && ArrayBuffer.isView(a.bytes) && Object.prototype.toString.call(a.bytes) === '[object Uint8Array]', 'asset.bytes');
    for (const n of [a.width,a.height]) requireField(n === undefined || range(n, 0, 2 ** 32 - 1), 'asset.dimension');
    assertBudget('asset', a.bytes.byteLength);
    paths.push(path);
  }
  requireField(unique(paths), 'asset.paths');
  // PF-AUD-A05: all admission paths (ZIP, bundle, replacement, storage and undo) share this gate.
  requireField(p.assets.reduce((total, a) => total + pixelsOf(a), 0) <= IMAGE_BUDGET.maxTotalPixels, 'asset.totalPixels');
  if (p.brandKit !== undefined) validateKit(p.brandKit, p.assets);
  requireField(p.settings.brandKitId === undefined || p.brandKit?.id === p.settings.brandKitId, 'settings.brandKitId reference');
  const inputs = new Map(p.inputs.map(i => [i.id, i]));
  requireField(inputs.size === p.inputs.length, 'input.ids');
  for (const i of p.inputs) {
    requireField(id(i.id) && member(i.kind, ['markdown-file','html-file','paste-plain','paste-html','zip','project']) && date(i.importedAt) && digest(i.rawSourceHash) && optional(i.name, 8192), 'input.identity');
    requireField(string(i.rawPlain,LIMITS.pasteBytes) && optional(i.rawHtml,LIMITS.pasteHtmlBytes) && wellFormed(i.rawPlain) && wellFormed(i.rawHtml ?? ''), 'input.raw');
    const plain = utf8Length(i.rawPlain), html = utf8Length(i.rawHtml ?? '');
    assertBudget('paste', plain); assertBudget('pasteHtml', html);
    requireField(i.byteLength === plain + html, 'input.byteLength');
  }
  requireField(p.history.length <= 100, 'history.count');
  let revision = p.revision + 1, length = p.source.length;
  for (let n = p.history.length - 1; n >= 0; n--) {
    const h = p.history[n]!;
    requireField(object(h) && integer(h.revision, 0, revision - 1) && date(h.at) && string(h.label, 1024) && string(h.source,LIMITS.markdownBytes), 'history');
    requireField(h.stateJson === undefined || string(h.stateJson, LIMITS.totalProjectBytes), 'history.state');
    revision = h.revision;
    if (h.delta !== undefined) {
      const d = h.delta;
      requireField(object(d) && integer(d.start, 0, length) && integer(d.remove, 0, length - d.start) && h.source === '' && string(d.insert, LIMITS.markdownBytes), 'history.delta');
      length += d.insert.length - d.remove;
    } else length = h.source.length;
    requireField(length <= LIMITS.markdownBytes, 'history.length');
  }
  const c = p.conversation;
  if (c === undefined) return;
  const input = inputs.get(c.inputId);
  requireField(input && object(c) && Array.isArray(c.messages) && member(c.outputMode, ['answer','selected-messages','transcript','curated','source-appendix']) && typeof c.showRoles === 'boolean', 'conversation');
  const ids = new Set(c.messages.map(m => m.id));
  requireField(ids.size === c.messages.length && Array.isArray(c.selectedOrder) && unique(c.selectedOrder) && c.selectedOrder.every(k => ids.has(k)), 'conversation.order');
  function ref(r: SourceRef, limit: number): void {
    requireField(object(r) && r.unit === 'utf16' && r.inputId === c!.inputId && (r.messageId === undefined || ids.has(r.messageId)) && integer(r.start, 0, limit) && integer(r.end, r.start, limit), 'conversation.sourceRef');
  }
  for (const m of c.messages) {
    requireField(id(m.id) && member(m.role, ['user','assistant','system','other','unknown']) && member(m.roleConfidence,['confirmed','high','low','unknown']), 'message.identity');
    requireField(typeof m.selected === 'boolean' && string(m.markdown, LIMITS.markdownBytes) && Array.isArray(m.flags) && m.flags.every(s => string(s, 256)) && optional(m.speakerLabel,1024) && optional(m.timestamp,512), 'message.content');
    ref(m.sourceRef, m.flags.includes('offsets-in-raw-html') ? input.rawHtml?.length ?? 0 : input.rawPlain.length);
  }
  requireField(c.editable === undefined || c.editable === true, 'conversation.editable');
  if (c.curatedBlockIds !== undefined) {
    requireField(Array.isArray(c.curatedBlockIds) && unique(c.curatedBlockIds) &&
      c.curatedBlockIds.every(v => typeof v === 'string' && v.length <= 512 && /^.+:\d+:\d+:[0-9a-f]{64}$/.test(v)), 'conversation.curatedBlockIds');
  }
  const publication = c.publication;
  if (publication !== undefined) {
    requireField(object(publication) && member(publication.mode, ['answer','selected-messages','transcript','curated','source-appendix']) && digest(publication.sourceHash) && integer(publication.sourceLength, 0, LIMITS.markdownBytes) && Array.isArray(publication.spans), 'publication');
    let end = 0;
    for (const span of publication.spans) {
      requireField(object(span) && span.outStart === end && integer(span.outEnd, end, publication.sourceLength) && member(span.kind,['message','block','label','separator','main','appendix-title']), 'publication.span');
      requireField((span.role === undefined || member(span.role, ['user','assistant','system','other','unknown'])) && (span.roleConfidence === undefined || member(span.roleConfidence, ['confirmed','high','low','unknown'])) && (span.messageId === undefined || id(span.messageId)) && optional(span.blockId, 512), 'publication.metadata');
      if (span.sourceRef) {
        const r = span.sourceRef;
        requireField(object(r) && r.inputId === c.inputId && (r.messageId === undefined || id(r.messageId)) && r.unit === 'utf16' && integer(r.start) && integer(r.end, r.start, Math.max(input.rawPlain.length,input.rawHtml?.length ?? 0)), 'publication.rawRef');
      }
      end = span.outEnd;
    }
    requireField(end === publication.sourceLength, 'publication.spanLength');
  }
  if (c.provider !== undefined) requireField(object(c.provider) && string(c.provider.name, 1024) && string(c.provider.basis, 4096) && member(c.provider.confidence,['low','high']), 'conversation.provider');
  requireField(Array.isArray(c.unresolved), 'conversation.unresolved');
  for (const i of c.unresolved) {
    requireField(object(i) && string(i.id, 512) && string(i.code, 256) && string(i.message, 65536) && member(i.severity, ['error','warning','info']) && member(i.scope, ['input','math','table','asset','structure','integrity','layout','security','font','pdf']), 'issue');
    requireField((i.blocking === undefined || typeof i.blocking === 'boolean') && (i.line === undefined || integer(i.line)) && optional(i.blockId, 256), 'issue.location');
    if (i.sourceRef) ref(i.sourceRef, Math.max(input.rawPlain.length, input.rawHtml?.length ?? 0));
  }
}
