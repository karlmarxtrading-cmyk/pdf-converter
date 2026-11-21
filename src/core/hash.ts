/**
 * Hash & identitas (PF-015, 03 §5): sha256Hex, serialisasi JSON kanonik, empat hash berbeda,
 * makeSnapshot, RevisionGuard (OPS-03, HTM-07).
 *
 * Serialisasi kanonik (canonicalJson):
 *  - objek: kunci diurutkan menurut unit kode UTF-16 (Array.prototype.sort bawaan), properti bernilai
 *    `undefined` dihilangkan; tanpa spasi;
 *  - array: urutan dipertahankan; `undefined` di array → null;
 *  - string: JSON.stringify (escape standar ECMAScript); TIDAK ada normalisasi Unicode;
 *  - angka: harus finite (NaN/Infinity ditolak), ditulis dengan JSON.stringify;
 *  - Uint8Array/ArrayBuffer/fungsi/Map/Set ditolak (bytes harus di-hash dulu).
 */
import { APP_VERSION, RENDERER_VERSION, type AssetRecord, type Conversation, type InputRecord, type Project, type Settings, type Snapshot, type TemplateId } from './contracts';
import { TEMPLATE_VERSION, templateDefaultSettings } from '../render/templates';

export { APP_VERSION, RENDERER_VERSION, TEMPLATE_VERSION };

const enc = new TextEncoder();

/* ---------------- SHA-256 ---------------- */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 sinkron murni-JS (dipakai bila crypto.subtle tidak tersedia, mis. konteks non-HTTPS). */
export function sha256HexSync(data: Uint8Array | string): string {
  const msg = typeof data === 'string' ? enc.encode(data) : data;
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg); buf[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000)); dv.setUint32(total - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15]!, b = W[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }
    let a = H[0]!, b = H[1]!, c = H[2]!, d = H[3]!, e = H[4]!, f = H[5]!, g = H[6]!, h = H[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i]! + W[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0]! + a) >>> 0; H[1] = (H[1]! + b) >>> 0; H[2] = (H[2]! + c) >>> 0; H[3] = (H[3]! + d) >>> 0;
    H[4] = (H[4]! + e) >>> 0; H[5] = (H[5]! + f) >>> 0; H[6] = (H[6]! + g) >>> 0; H[7] = (H[7]! + h) >>> 0;
  }
  return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
}

/** SHA-256 hex dari bytes atau string (string di-encode UTF-8). Memakai WebCrypto bila ada. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (subtle) {
    try {
      const d = await subtle.digest('SHA-256', bytes as unknown as ArrayBuffer);
      return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
    } catch { /* jatuh ke implementasi JS */ }
  }
  return sha256HexSync(bytes);
}

/* ---------------- JSON kanonik ---------------- */
export function canonicalJson(value: unknown): string {
  const seen = new Set<unknown>();
  const ser = (v: unknown, inArray: boolean): string | undefined => {
    if (v === null) return 'null';
    if (v === undefined) return inArray ? 'null' : undefined;
    switch (typeof v) {
      case 'string': return JSON.stringify(v);
      case 'boolean': return v ? 'true' : 'false';
      case 'number':
        if (!Number.isFinite(v)) throw new Error('CANONICAL_JSON_NONFINITE');
        return JSON.stringify(v);
      case 'object': {
        if (v instanceof Uint8Array || v instanceof ArrayBuffer || v instanceof Map || v instanceof Set) throw new Error('CANONICAL_JSON_UNSUPPORTED_TYPE');
        if (seen.has(v)) throw new Error('CANONICAL_JSON_CYCLE');
        seen.add(v);
        let out: string;
        if (Array.isArray(v)) out = `[${v.map((x) => ser(x, true)).join(',')}]`;
        else {
          const o = v as Record<string, unknown>;
          const parts: string[] = [];
          for (const k of Object.keys(o).sort()) {
            const s = ser(o[k], false);
            if (s !== undefined) parts.push(`${JSON.stringify(k)}:${s}`);
          }
          out = `{${parts.join(',')}}`;
        }
        seen.delete(v);
        return out;
      }
      default: throw new Error('CANONICAL_JSON_UNSUPPORTED_TYPE');
    }
  };
  return ser(value, false) ?? 'null';
}

/* ---------------- Hash identitas ---------------- */
/** Hash sumber mentah satu input: sha256(UTF-8 rawPlain) bila tanpa HTML; bila ada HTML: sha256(canonical{html,plain}) dari hash masing-masing. */
export async function inputRawHash(rawPlain: string, rawHtml?: string): Promise<string> {
  if (rawHtml === undefined) return sha256Hex(rawPlain);
  return sha256Hex(canonicalJson({ html: await sha256Hex(rawHtml), plain: await sha256Hex(rawPlain) }));
}

/** rawSourceHash proyek: tanpa input → sha256(UTF-8 source); selain itu sha256(canonical[{id,rawSourceHash}]) dengan hash DIHITUNG ULANG dari bytes. */
export async function computeRawSourceHash(inputs: InputRecord[], source: string): Promise<string> {
  if (!inputs.length) return sha256Hex(source);
  const list = [];
  for (const i of inputs) list.push({ id: i.id, rawSourceHash: await inputRawHash(i.rawPlain, i.rawHtml) });
  return sha256Hex(canonicalJson(list));
}

function conversationModel(c?: Conversation): unknown {
  if (!c) return null;
  return {
    editable: c.editable, publication: c.publication, curatedBlockIds: c.curatedBlockIds,
    inputId: c.inputId, outputMode: c.outputMode, selectedOrder: c.selectedOrder, showRoles: c.showRoles,
    messages: c.messages.map((m) => ({ id: m.id, role: m.role, speakerLabel: m.speakerLabel, timestamp: m.timestamp, markdown: m.markdown, selected: m.selected })),
  };
}

/** contentSnapshotHash: model terstruktur (source + percakapan: pesan, pilihan, urutan). */
export async function computeContentSnapshotHash(source: string, conversation?: Conversation): Promise<string> {
  return sha256Hex(canonicalJson({ source, conversation: conversationModel(conversation) }));
}

/** Daftar aset dengan hash isi AKTUAL (dihitung ulang dari bytes, bukan dipercaya dari asset.id). */
export async function actualAssetHashes(assets: AssetRecord[]): Promise<{ id: string; path: string; mime: string; sha256: string; bytes: number }[]> {
  const out = [];
  for (const a of assets) out.push({ id: a.id, path: a.path, mime: a.mime, sha256: await sha256Hex(a.bytes), bytes: a.bytes.byteLength });
  out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : x.sha256 < y.sha256 ? -1 : 1));
  return out;
}

export interface RenderInputParts {
  contentSnapshotHash: string; sourcePath?: string; assets: AssetRecord[]; settings: Settings; brandKit?: unknown;
  templateId: TemplateId; templateVersion: string; rendererVersion: string;
}
/** renderInputHash: model + hash aset aktual + setting + brand kit + versi templat + versi renderer. */
export async function computeRenderInputHash(p: RenderInputParts): Promise<string> {
  const assets = (await actualAssetHashes(p.assets)).map(({ path, mime, sha256 }) => ({ path, mime, sha256 }));
  return sha256Hex(canonicalJson({
    content: p.contentSnapshotHash, sourcePath: p.sourcePath, assets, settings: p.settings, brandKit: p.brandKit ?? null,
    templateId: p.templateId, templateVersion: p.templateVersion, rendererVersion: p.rendererVersion,
  }));
}

/** Salinan dalam (bytes aset ikut disalin) agar snapshot tidak terpengaruh edit berikutnya. */
function cloneDeep<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

export interface SnapshotOptions { templateVersion?: string; rendererVersion?: string; now?: () => string }

/**
 * Membekukan proyek menjadi Snapshot untuk satu ekspor (04 §2). Hash dihitung dari salinan.
 * asset.id di snapshot = sha256 bytes aktual (id yang salah diperbaiki di salinan, tidak di proyek).
 */
export async function makeSnapshot(project: Project, opts: SnapshotOptions = {}): Promise<Snapshot> {
  const p = cloneDeep(project);
  for (const a of p.assets) a.id = await sha256Hex(a.bytes);
  const templateVersion = opts.templateVersion ?? TEMPLATE_VERSION;
  const rendererVersion = opts.rendererVersion ?? RENDERER_VERSION;
  const rawSourceHash = await computeRawSourceHash(p.inputs, p.source);
  const contentSnapshotHash = await computeContentSnapshotHash(p.source, p.conversation);
  // Older ZIP projects recorded the selected member on the raw input only.
  const lastInput = p.inputs.at(-1);
  const sourcePath = p.sourcePath ?? (lastInput?.kind === 'zip' && lastInput.rawPlain === p.source ? lastInput.name : undefined);
  const renderInputHash = await computeRenderInputHash({
    sourcePath, contentSnapshotHash, assets: p.assets, settings: p.settings, brandKit: p.brandKit,
    templateId: p.settings.template, templateVersion, rendererVersion,
  });
  const snap: Snapshot = {
    projectId: p.projectId, revision: p.revision, createdAt: (opts.now ?? (() => new Date().toISOString()))(),
    rawSourceHash, contentSnapshotHash, renderInputHash,
    templateId: p.settings.template, templateVersion, rendererVersion,
    source: p.source, ...(sourcePath ? { sourcePath } : {}), settings: p.settings, assets: p.assets,
  };
  if (p.brandKit) snap.brandKit = p.brandKit;
  if (p.conversation) snap.conversation = p.conversation;
  return Object.freeze(snap);
}

/** Pengaturan bawaan templat (delegasi ke registri templat render agar satu sumber kebenaran). */
export function defaultSettings(template: TemplateId): Settings { return templateDefaultSettings(template); }

/* ---------------- RevisionGuard ---------------- */
export interface RevisionToken { readonly rev: number; readonly key?: string; readonly signal: AbortSignal }

/**
 * Mendeteksi & membuang pekerjaan async usang (OPS-03, HTM-07). Setiap `begin()` membatalkan
 * token sebelumnya (AbortSignal) — hasil token lama tidak boleh dipublikasikan.
 */
export class RevisionGuard {
  private current = 0;
  private ctrl: AbortController | null = null;
  private currentKey: string | undefined;
  begin(key?: string): RevisionToken {
    this.ctrl?.abort();
    this.ctrl = new AbortController();
    this.current++;
    this.currentKey = key;
    return Object.freeze({ rev: this.current, key, signal: this.ctrl.signal });
  }
  isCurrent(t: RevisionToken): boolean { return t.rev === this.current && !t.signal.aborted && t.key === this.currentKey; }
  get revision(): number { return this.current; }
  /** Menjalankan fn; mengembalikan {stale:true} bila revisi lebih baru dimulai sebelum fn selesai. */
  async run<T>(fn: (t: RevisionToken) => Promise<T>, key?: string): Promise<{ stale: false; value: T; rev: number } | { stale: true; rev: number }> {
    const t = this.begin(key);
    const value = await fn(t);
    if (!this.isCurrent(t)) return { stale: true, rev: t.rev };
    return { stale: false, value, rev: t.rev };
  }
  invalidate(): void { this.ctrl?.abort(); this.current++; this.currentKey = undefined; }
}
