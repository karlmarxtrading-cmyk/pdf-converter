// Anggaran input, hash, snapshot, RevisionGuard, offset — PF-008, PF-015, IMP-13, CODE-05, OPS-03, HTM-07
import { describe, expect, it, vi } from 'vitest';
import { LIMITS, checkBudget, checkTextBudget, readFileWithinBudget, utf8Length, decodeUtf8Strict } from '../../../src/core/limits';
import { sha256Hex, sha256HexSync, canonicalJson, makeSnapshot, RevisionGuard, computeRenderInputHash, computeContentSnapshotHash } from '../../../src/core/hash';
import { utf16ToUtf8Offset, utf8ToUtf16Offset, utf16ToCodePointOffset } from '../../../src/core/offsets';
import { createProject, makeInputRecord } from '../../../src/core/projects';
import { createAssetRecord } from '../../../src/core/assets';
import { PasteLedger } from '../../../src/core/paste';
import { fx, fxBytes } from './fx';

const small = { ...LIMITS, pasteBytes: 12, markdownBytes: 12, pasteHtmlBytes: 40 };

describe('InputBudget', () => {
  it('IMP-13 multibyte UTF-8 tepat di bawah / sama / satu byte di atas batas; ditolak utuh; sumber aktif tidak berubah', () => {
    // "é" = 2 byte, "😀" = 4 byte
    const under = 'éééé😀'; // 8+... = 12? hitung
    expect(utf8Length('é')).toBe(2); expect(utf8Length('😀')).toBe(4); expect(utf8Length('ab')).toBe(2);
    const exact = 'éééé😀'; expect(utf8Length(exact)).toBe(12);
    const below = 'ééé😀'; expect(utf8Length(below)).toBe(10);
    const over = 'éééé😀a'; expect(utf8Length(over)).toBe(13);
    expect(checkTextBudget('paste', below, small).ok).toBe(true);
    expect(checkTextBudget('paste', exact, small).ok).toBe(true);
    const r = checkTextBudget('paste', over, small);
    expect(r.ok).toBe(false); expect(r.actual).toBe(13); expect(r.limit).toBe(12);
    expect(r.message).toMatch(/ditolak utuh/); expect(r.messageEn).toMatch(/rejected whole/);
    // panjang karakter (6) < batas, tetapi byte (13) > batas → ditolak (bukan berdasar karakter)
    expect(over.length).toBeLessThan(12);
    const led = new PasteLedger('', small);
    const res = led.pasteAtCursor({ start: 0, end: 0 }, { plain: over });
    expect(res.ok).toBe(false); expect(led.text).toBe('');
    expect(led.pasteAtCursor({ start: 0, end: 0 }, { plain: exact }).ok).toBe(true);
    expect(led.text).toBe(exact);
    void under;
  });
  it('CODE-05 file.size diperiksa SEBELUM arrayBuffer(); berkas besar tidak dibaca', async () => {
    const big = { size: LIMITS.markdownBytes + 1, arrayBuffer: vi.fn(async () => new ArrayBuffer(8)) };
    const r = await readFileWithinBudget(big, 'markdown');
    expect(r.ok).toBe(false); expect(big.arrayBuffer).not.toHaveBeenCalled();
    const okf = { size: 3, arrayBuffer: vi.fn(async () => new Uint8Array([97, 98, 99]).buffer) };
    const r2 = await readFileWithinBudget(okf, 'markdown');
    expect(r2.ok).toBe(true); expect(okf.arrayBuffer).toHaveBeenCalledOnce();
    // ukuran berbohong: size kecil tetapi bytes besar → tetap ditolak setelah dibaca
    const liar = { size: 1, arrayBuffer: async () => new ArrayBuffer(LIMITS.markdownBytes + 1) };
    expect((await readFileWithinBudget(liar, 'markdown')).ok).toBe(false);
  });
  it('checkBudget satu konfigurasi untuk semua jalur (asset, zip, totalProject, ekspor)', () => {
    for (const k of ['asset', 'zip', 'totalProject', 'standaloneHtml', 'pdfPayload'] as const) {
      const lim = checkBudget(k, 0).limit;
      expect(checkBudget(k, lim).ok).toBe(true); expect(checkBudget(k, lim + 1).ok).toBe(false);
    }
  });
  it('IMP-01 BOM dipertahankan, CRLF dan karakter Indonesia tidak diubah [fx:01_dokumen_pendek.md]', () => {
    const src = fx('01_dokumen_pendek.md');
    const withBom = new TextEncoder().encode('﻿' + src.replace(/\n/g, '\r\n') + '  \n');
    const d = decodeUtf8Strict(withBom);
    expect(d.ok).toBe(true);
    if (d.ok) { expect(d.hadBom).toBe(true); expect(new TextEncoder().encode(d.text)).toEqual(withBom); }
    expect(decodeUtf8Strict(new Uint8Array([0xff, 0xfe, 0x00])).ok).toBe(false);
    expect(fxBytes('01_dokumen_pendek.md').length).toBe(505);
  });
});

describe('Hash & snapshot (PF-015)', () => {
  it('sha256Hex: vektor standar; fallback murni-JS identik dengan WebCrypto', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256HexSync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const big = new Uint8Array(200_003).map((_, i) => (i * 31) & 255);
    expect(sha256HexSync(big)).toBe(await sha256Hex(big));
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('canonicalJson: urutan kunci stabil, undefined dihilangkan, NaN/bytes ditolak', () => {
    expect(canonicalJson({ b: 1, a: [3, { d: undefined, c: 'é' }] })).toBe('{"a":[3,{"c":"é"}],"b":1}');
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(() => canonicalJson({ x: NaN })).toThrow(); expect(() => canonicalJson({ x: new Uint8Array(1) })).toThrow();
  });
  it('empat hash berbeda; renderInputHash berubah bila bytes aset berganti dengan path/ukuran sama (AST-02)', async () => {
    const p = createProject({ projectId: 'p1', source: '# A\n\n![g](chart.png)\n', now: '2026-01-01T00:00:00Z' });
    p.inputs = [await makeInputRecord('paste-plain', 'raw input', { now: '2026-01-01T00:00:00Z' })];
    const a = await createAssetRecord(fxBytes('pengganti_A/chart.png'), 'chart.png', 'upload');
    const b = await createAssetRecord(fxBytes('pengganti_B/chart.png'), 'chart.png', 'upload');
    if (!a.ok || !b.ok) throw new Error('aset');
    p.assets = [a.asset];
    const s1 = await makeSnapshot(p);
    expect(new Set([s1.rawSourceHash, s1.contentSnapshotHash, s1.renderInputHash]).size).toBe(3);
    const s2 = await makeSnapshot({ ...p, assets: [b.asset] });
    expect(s2.contentSnapshotHash).toBe(s1.contentSnapshotHash);
    expect(s2.renderInputHash).not.toBe(s1.renderInputHash);
    // id aset palsu tidak menipu renderInputHash: dihitung dari bytes aktual
    const s3 = await makeSnapshot({ ...p, assets: [{ ...b.asset, id: a.asset.id }] });
    expect(s3.renderInputHash).toBe(s2.renderInputHash);
    expect(s3.assets[0]!.id).toBe(b.asset.id);
    // settings / template version ikut
    const s4 = await makeSnapshot({ ...p, settings: { ...p.settings, title: 'Judul baru' } });
    expect(s4.renderInputHash).not.toBe(s1.renderInputHash);
    expect(await computeRenderInputHash({ contentSnapshotHash: s1.contentSnapshotHash, assets: p.assets, settings: p.settings, templateId: 'EDU-01', templateVersion: 'x', rendererVersion: s1.rendererVersion })).not.toBe(s1.renderInputHash);
    expect(await computeContentSnapshotHash('a')).not.toBe(await computeContentSnapshotHash('a', { inputId: 'i', messages: [], outputMode: 'answer', selectedOrder: [], showRoles: false, unresolved: [] }));
  });
  it('HTM-07 snapshot beku & independen dari edit berikutnya', async () => {
    const p = createProject({ source: 'awal' });
    const s = await makeSnapshot(p);
    p.source = 'diubah'; p.settings.title = 'x';
    expect(s.source).toBe('awal'); expect(s.settings.title).toBe(''); expect(Object.isFrozen(s)).toBe(true);
  });
  it('OPS-03 RevisionGuard: hanya revisi terbaru dipublikasikan; render lama dibatalkan/diabaikan', async () => {
    const g = new RevisionGuard();
    const published: string[] = [];
    const slow = (label: string, ms: number) => g.run(async (t) => { await new Promise((r) => setTimeout(r, ms)); return { label, aborted: t.signal.aborted }; });
    const p1 = slow('rev1', 40); const p2 = slow('rev2', 20); const p3 = slow('rev3', 5);
    for (const r of await Promise.all([p1, p2, p3])) if (!r.stale) published.push(r.value.label);
    expect(published).toEqual(['rev3']);
    const t = g.begin('export'); const t2 = g.begin('export');
    expect(t.signal.aborted).toBe(true); expect(g.isCurrent(t)).toBe(false); expect(g.isCurrent(t2)).toBe(true);
    g.invalidate(); expect(g.isCurrent(t2)).toBe(false);
  });
});

describe('Offset UTF-16 ↔ UTF-8 (05 §6)', () => {
  it('emoji, combining, dan Indonesia: tiga satuan berbeda dan konversi bolak-balik [fx:12_unicode_dan_font.md]', () => {
    const s = fx('12_unicode_dan_font.md');
    const iEmoji = s.indexOf('🙂'); const after = iEmoji + 2;
    expect(utf8ToUtf16Offset(s, utf16ToUtf8Offset(s, after))).toBe(after);
    expect(() => utf16ToUtf8Offset(s, iEmoji + 1)).toThrow(RangeError);
    const t = 'é😀x';
    expect(t.length).toBe(5); expect(utf16ToUtf8Offset(t, 5)).toBe(1 + 2 + 4 + 1); expect(utf16ToCodePointOffset(t, 5)).toBe(4);
    expect(utf16ToUtf8Offset(t, 2)).toBe(3); expect(utf8ToUtf16Offset(t, 7)).toBe(4);
    expect(() => utf8ToUtf16Offset(t, 4)).toThrow(RangeError);
    for (let i = 0; i <= s.length; i++) {
      let ok = true; let b = 0; try { b = utf16ToUtf8Offset(s, i); } catch { ok = false; }
      if (ok) expect(utf8ToUtf16Offset(s, b)).toBe(i);
    }
  });
});
