/**
 * Penyimpanan lokal opt-in (OPS-06/07, CODE-10). Antarmuka + implementasi IndexedDB (idb) + memori (uji).
 *  - status simpan mencerminkan hasil NYATA: saved / pending / failed / blocked / unavailable / quota-exceeded / rejected-deleted;
 *  - hapus hanya "sukses" bila benar-benar sukses; blocked/error dilaporkan;
 *  - proyek yang dihapus tidak dapat dihidupkan lagi oleh autosave terlambat (tombstone + generasi).
 */
import { openDB, type IDBPDatabase } from 'idb';
import { validateProject, validateKit } from './schema';
import { canonicalJson, inputRawHash, sha256Hex, sha256HexSync } from './hash';
import { createAssetRecord } from './assets';
import { assertPortable, commitRevision, HISTORY_BYTES } from './projects';
import { markSaved, savedToken } from './save-base';
import type { AssetRecord, BrandKit, Project } from './contracts';

export type SaveStatus = 'saved' | 'pending' | 'failed' | 'blocked' | 'unavailable' | 'quota-exceeded' | 'conflict' | 'rejected-deleted' | 'idle';
export interface SaveResult { status: Exclude<SaveStatus, 'pending' | 'idle'>; revision?: number; recoveryId?: string; error?: string; at: string }
export interface DeleteResult { status: 'deleted' | 'not-found' | 'blocked' | 'failed' | 'unavailable'; error?: string }
export interface ProjectSummary { projectId: string; name: string; revision: number; updatedAt: string }

type StoredBrandKit = BrandKit & { storedLogo?: AssetRecord };
export interface ProjectStorage {
  readonly kind: 'indexeddb' | 'memory';
  available(): Promise<boolean>;
  save(p: Project): Promise<SaveResult>;
  load(id: string): Promise<Project | null>;
  list(): Promise<ProjectSummary[]>;
  delete(id: string): Promise<DeleteResult>;
  /** menghapus SEMUA data lokal aplikasi; hasil jujur */
  deleteAll(): Promise<DeleteResult>;
  saveBrandKit(k: BrandKit, logo?: AssetRecord): Promise<SaveResult>;
  listBrandKits(): Promise<StoredBrandKit[]>;
  deleteBrandKit(id: string): Promise<DeleteResult>;
}

const now = () => new Date().toISOString();
function classifyError(e: unknown): SaveResult['status'] {
  const name = (e as { name?: string })?.name ?? '';
  if (name === 'QuotaExceededError' || /quota/i.test(String((e as Error)?.message))) return 'quota-exceeded';
  if (name === 'InvalidStateError' || name === 'SecurityError') return 'unavailable';
  return 'failed';
}

type Stored = Project & { _saveToken?: string };
function tokenSource(p: Stored): string {
  const { _saveToken, ...data } = p;
  // Asset hashes are recomputed at the storage boundary before using this representation.
  return canonicalJson({ ...data, history: data.history.map(entry => sha256HexSync(canonicalJson(entry))), assets: data.assets.map(({ bytes: _bytes, ...asset }) => asset) });
}
async function verifyAsset(a: AssetRecord): Promise<void> {
  const r = await createAssetRecord(a.bytes, a.path, a.origin);
  if (!r.ok || a.id !== r.asset.id || a.mime !== r.asset.mime ||
      a.width !== r.asset.width || a.height !== r.asset.height) throw new Error('Invalid stored asset');
}
async function verify(p: Project): Promise<string> {
  validateProject(p);
  assertPortable(p);
  for (const raw of p.inputs) if (await inputRawHash(raw.rawPlain, raw.rawHtml) !== raw.rawSourceHash) throw new Error('Invalid stored input');
  for (const a of p.assets) await verifyAsset(a);
  return sha256Hex(tokenSource(p));
}
function decide(p: Project, token: string, prev?: Stored) {
  const expected = savedToken(p);
  if (!prev) return expected ? 'rejected-deleted' : 'write';
  const current = prev._saveToken ?? sha256HexSync(tokenSource(prev));
  if (current === token) return 'identical';
  return expected === current && p.revision > prev.revision ? 'write' : 'conflict';
}
function recovery(p: Project, token: string): Project {
  return { ...p, projectId: 'recovery-' + token, name: p.name.slice(0, 960) + ' (salinan konflik / conflict copy)' };
}
async function readStored(value?: Stored): Promise<Project | null> {
  if (!value) return null;
  const { _saveToken, ...p } = value;
  // RC2 IndexedDB may contain many full-source snapshots beyond the portable budget.
  // Convert them under the normal documented retention rule before rendering;
  // their original contents are the CAS base until the recovered revision is persisted.
  if (_saveToken === undefined && p.history?.reduce((sum,h) => sum + (typeof h.source === 'string' ? h.source.length : 0), 0) > HISTORY_BYTES) {
    validateProject(p);
    const original = await sha256Hex(tokenSource(p));
    markSaved(p, original);
    const recovered = commitRevision(p, {}, 'History retention / pemadatan riwayat');
    await verify(recovered);
    return recovered;
  }
  const token = await verify(p);
  if (_saveToken !== undefined && _saveToken !== token) throw new Error('Stored state token mismatch');
  markSaved(p, token);
  return p;
}
function summary(p: Project): ProjectSummary {
  return { projectId: p.projectId, name: p.name, revision: p.revision, updatedAt: p.updatedAt };
}

/* ---------------- memori (uji & fallback) ---------------- */
export interface MemoryFaults { quota?: boolean; unavailable?: boolean; blockDelete?: boolean; failDelete?: boolean; failSave?: boolean; saveDelayMs?: number }

export class MemoryProjectStorage implements ProjectStorage {
  readonly kind = 'memory' as const;
  private projects = new Map<string, Stored>();
  private kits = new Map<string, StoredBrandKit>();
  private tombstones = new Set<string>();
  faults: MemoryFaults = {};
  async available() { return !this.faults.unavailable; }
  async save(p: Project): Promise<SaveResult> {
    if (this.faults.saveDelayMs) await new Promise((r) => setTimeout(r, this.faults.saveDelayMs));
    if (this.faults.unavailable) return { status: 'unavailable', at: now() };
    if (this.tombstones.has(p.projectId)) return { status: 'rejected-deleted', at: now() };
    if (this.faults.quota) return { status: 'quota-exceeded', error: 'QuotaExceededError', at: now() };
    if (this.faults.failSave) return { status: 'failed', error: 'injected', at: now() };
    try {
      const token = await verify(p);
      const action = decide(p, token, this.projects.get(p.projectId));
      if (action === 'rejected-deleted') return { status: action, at: now() };
      if (action === 'conflict') {
        const copy = recovery(p, token);
        if (this.tombstones.has(copy.projectId)) return { status: 'rejected-deleted', at: now() };
        if (!this.projects.has(copy.projectId)) this.projects.set(copy.projectId, structuredClone(copy));
        return { status: 'conflict', recoveryId: copy.projectId, at: now() };
      }
      if (action === 'write') this.projects.set(p.projectId, structuredClone({ ...p, _saveToken: token }));
      markSaved(p, token);
      return { status: 'saved', revision: p.revision, at: now() };
    } catch (e) { return { status: classifyError(e), at: now() }; }
  }
  async load(id: string) { return readStored(structuredClone(this.projects.get(id))); }
  async list() { return [...this.projects.values()].map(summary); }
  async delete(id: string): Promise<DeleteResult> {
    if (this.faults.unavailable) return { status: 'unavailable' };
    if (this.faults.blockDelete) return { status: 'blocked', error: 'Database dipakai tab lain.' };
    if (this.faults.failDelete) return { status: 'failed', error: 'injected' };
    this.tombstones.add(id);
    return this.projects.delete(id) ? { status: 'deleted' } : { status: 'not-found' };
  }
  async deleteAll(): Promise<DeleteResult> {
    if (this.faults.blockDelete) return { status: 'blocked', error: 'Database dipakai tab lain.' };
    if (this.faults.failDelete) return { status: 'failed', error: 'injected' };
    for (const id of this.projects.keys()) this.tombstones.add(id);
    this.projects.clear(); this.kits.clear();
    return { status: 'deleted' };
  }
  async saveBrandKit(k: BrandKit, logo?: AssetRecord): Promise<SaveResult> {
    if (this.faults.unavailable) return { status: 'unavailable', at: now() };
    if (this.faults.quota) return { status: 'quota-exceeded', at: now() };
    this.kits.set(k.id, { ...k, storedLogo: logo }); return { status: 'saved', at: now() };
  }
  async listBrandKits() { return [...this.kits.values()].map((k) => ({ ...k })); }
  async deleteBrandKit(id: string): Promise<DeleteResult> { return this.kits.delete(id) ? { status: 'deleted' } : { status: 'not-found' }; }
}

/* ---------------- IndexedDB ---------------- */
export const DB_NAME = 'paperforma2';
export const DB_VERSION = 1;
/** Basis data baseline 1.0.0 (untuk deteksi & migrasi draf lama). */
export const LEGACY_DB = { name: 'paperforma', store: 'drafts', key: 'current' } as const;

export class IdbProjectStorage implements ProjectStorage {
  readonly kind = 'indexeddb' as const;
  private dbp: Promise<IDBPDatabase> | null = null;
  private idb: IDBFactory | undefined;
  /** idb: factory IndexedDB; null = tidak tersedia (mode privat/terblokir). */
  constructor(idb: IDBFactory | null | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB, private name = DB_NAME) { this.idb = idb ?? undefined; }
  private db(): Promise<IDBPDatabase> {
    if (!this.idb) return Promise.reject(Object.assign(new Error('IndexedDB tidak tersedia'), { name: 'InvalidStateError' }));
    if (!this.dbp) {
      const factory = this.idb;
      const g = globalThis as { indexedDB?: IDBFactory };
      const prevIdb = g.indexedDB;
      // idb memakai globalThis.indexedDB. Di browser window.indexedDB hanya punya getter (penugasan melempar TypeError
      // pada modul strict) — tukar factory HANYA bila berbeda dari bawaan (mis. fake-indexeddb di uji Node).
      const swap = factory !== prevIdb;
      if (swap) g.indexedDB = factory;
      this.dbp = openDB(this.name, DB_VERSION, {
        upgrade(db) {
          db.createObjectStore('projects', { keyPath: 'projectId' });
          db.createObjectStore('tombstones');
          db.createObjectStore('brandkits', { keyPath: 'id' });
        },
        blocking: () => { void this.close(); },
      }).finally(() => { if (swap) g.indexedDB = prevIdb; });
      this.dbp.catch(() => { this.dbp = null; });
    }
    return this.dbp;
  }
  async close(): Promise<void> { if (this.dbp) { try { (await this.dbp).close(); } catch { /* */ } this.dbp = null; } }
  async available() { try { await this.db(); return true; } catch { return false; } }
  async save(p: Project): Promise<SaveResult> {
    try {
      // Complete async content verification before the readwrite transaction starts.
      const token = await verify(p);
      const db = await this.db();
      const tx = db.transaction(['projects', 'tombstones'], 'readwrite');
      const projects = tx.objectStore('projects'), tombstones = tx.objectStore('tombstones');
      const deleted = await tombstones.get(p.projectId);
      const action = deleted ? 'rejected-deleted' : decide(p, token, await projects.get(p.projectId));
      if (action === 'rejected-deleted') { await tx.done; return { status: action, at: now() }; }
      if (action === 'conflict') {
        const copy = recovery(p, token);
        if (await tombstones.get(copy.projectId)) { await tx.done; return { status: 'rejected-deleted', at: now() }; }
        if (!await projects.getKey(copy.projectId)) await projects.add(copy);
        await tx.done;
        return { status: 'conflict', recoveryId: copy.projectId, at: now() };
      }
      if (action === 'write') await projects.put({ ...p, _saveToken: token });
      await tx.done;
      markSaved(p, token);
      return { status: 'saved', revision: p.revision, at: now() };
    } catch (e) { return { status: classifyError(e), error: String((e as Error)?.name ?? e), at: now() }; }
  }
  async load(id: string) { try { return await readStored(await (await this.db()).get('projects', id)); } catch { return null; } }
  async list() {
    try { return ((await (await this.db()).getAll('projects')) as Project[]).filter(p => typeof p?.name === 'string' && typeof p.projectId === 'string').map(summary); } catch { return []; }
  }
  async delete(id: string): Promise<DeleteResult> {
    try {
      const db = await this.db();
      const tx = db.transaction(['projects', 'tombstones'], 'readwrite');
      const existed = (await tx.objectStore('projects').getKey(id)) !== undefined;
      await tx.objectStore('tombstones').put(now(), id);
      await tx.objectStore('projects').delete(id);
      await tx.done;
      return existed ? { status: 'deleted' } : { status: 'not-found' };
    } catch (e) { const s = classifyError(e); return { status: s === 'unavailable' ? 'unavailable' : 'failed', error: String((e as Error)?.name ?? e) }; }
  }
  /** deleteDatabase dengan hasil jujur: onblocked → 'blocked' (bukan sukses). */
  async deleteAll(): Promise<DeleteResult> {
    if (!this.idb) return { status: 'unavailable' };
    await this.close();
    const del = (name: string) => new Promise<DeleteResult>((resolve) => {
      let req: IDBOpenDBRequest;
      try { req = this.idb!.deleteDatabase(name); } catch (e) { resolve({ status: 'failed', error: String(e) }); return; }
      req.onsuccess = () => resolve({ status: 'deleted' });
      req.onerror = () => resolve({ status: 'failed', error: String(req.error?.name ?? 'error') });
      req.onblocked = () => resolve({ status: 'blocked', error: 'Database masih dibuka tab lain; tutup tab lain lalu coba lagi.' });
    });
    const a = await del(this.name);
    if (a.status !== 'deleted') return a;
    const b = await del(LEGACY_DB.name);
    return b.status === 'deleted' ? a : b;
  }
  async saveBrandKit(k: BrandKit, logo?: AssetRecord): Promise<SaveResult> {
    try { validateKit(k, logo ? [logo] : []); if (logo) await verifyAsset(logo); await (await this.db()).put('brandkits', { ...k, storedLogo: logo }); return { status: 'saved', at: now() }; } catch (e) { return { status: classifyError(e), at: now() }; }
  }
  async listBrandKits() { try {
    const out: StoredBrandKit[] = [];
    for (const k of await (await this.db()).getAll('brandkits') as StoredBrandKit[]) {
      try { validateKit(k, k.storedLogo ? [k.storedLogo] : []); if (k.storedLogo) await verifyAsset(k.storedLogo); out.push(k); } catch { /* preserve unreadable data on disk */ }
    }
    return out;
  } catch { return []; } }
  async deleteBrandKit(id: string): Promise<DeleteResult> {
    try { await (await this.db()).delete('brandkits', id); return { status: 'deleted' }; } catch { return { status: 'failed' }; }
  }
}

/** Membaca draf baseline 1.0.0 (tidak mengubahnya). */
export async function readLegacyDraft(idb: IDBFactory | undefined = (globalThis as { indexedDB?: IDBFactory }).indexedDB): Promise<unknown | null> {
  if (!idb) return null;
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try { req = idb.open(LEGACY_DB.name); } catch { resolve(null); return; }
    req.onupgradeneeded = () => { req.transaction?.abort(); };
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LEGACY_DB.store)) { db.close(); resolve(null); return; }
      const g = db.transaction(LEGACY_DB.store, 'readonly').objectStore(LEGACY_DB.store).get(LEGACY_DB.key);
      g.onsuccess = () => { db.close(); resolve(g.result ?? null); };
      g.onerror = () => { db.close(); resolve(null); };
    };
  });
}

/* ---------------- autosave dengan status jujur & pelindung generasi ---------------- */
export class AutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingProject: Project | null = null;
  private generation = 0;
  private activeProject: Project | null = null;
  private writes: Promise<SaveResult | null> = Promise.resolve(null);
  private deleted = new Set<string>();
  status: SaveStatus = 'idle';
  last: SaveResult | null = null;
  constructor(private storage: ProjectStorage, private delayMs = 1000, private onStatus?: (s: SaveStatus, r: SaveResult | null) => void) {}
  private set(s: SaveStatus, r: SaveResult | null = this.last) { this.status = s; this.last = r; this.onStatus?.(s, r); }
  /** Jadwalkan simpan; status menjadi 'pending' (BUKAN 'saved') sampai hasil nyata diterima. */
  schedule(p: Project): void {
    if (this.pendingProject && this.pendingProject.projectId !== p.projectId) void this.flush();
    this.activeProject = p;
    if (this.deleted.has(p.projectId)) { this.set('rejected-deleted', { status: 'rejected-deleted', at: now() }); return; }
    this.pendingProject = p;
    this.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, this.delayMs);
  }
  async flush(): Promise<SaveResult | null> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const p = this.pendingProject; if (!p) return this.writes;
    this.pendingProject = null;
    const gen = this.generation;
    this.writes = this.writes.then(async (): Promise<SaveResult> => {
      if (this.deleted.has(p.projectId) || gen !== this.generation) return { status: 'rejected-deleted', at: now() };
      const r = await this.storage.save(p);
      if (gen === this.generation && this.activeProject === p && !this.pendingProject) {
        this.set(r.status === 'saved' && r.revision !== p.revision ? 'failed' : r.status, r);
      }
      return r;
    });
    return this.writes;
  }
  cancel(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; this.pendingProject = null; this.activeProject = null; this.generation++; this.set('idle', null); }
  /** Serialize deletion with saves. A failed deletion must leave pending edits recoverable. */
  async deleteProject(id: string): Promise<DeleteResult> {
    if (this.pendingProject?.projectId === id) void this.flush();
    const deletion = this.writes.then(async (): Promise<DeleteResult> => {
      let result: DeleteResult;
      try { result = await this.storage.delete(id); }
      catch (error) { return { status: 'failed', error: String(error) }; }
      if (result.status === 'deleted' || result.status === 'not-found') {
        this.deleted.add(id);
        if (this.activeProject?.projectId === id) {
          if (this.timer) clearTimeout(this.timer);
          this.timer = null; this.pendingProject = null;
          this.set('rejected-deleted', { status: 'rejected-deleted', at: now() });
        }
      }
      return result;
    });
    this.writes = deletion.then(() => null);
    return deletion;
  }
}
