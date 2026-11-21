// Transaksi tempel — PF-009, UX-03, IMP-05
import { describe, expect, it } from 'vitest';
import { PasteLedger } from '../../../src/core/paste';
import { fxJson } from './fx';

const F = fxJson<{ before: string; clipboard_plain: string; clipboard_html: string; typed_after: string }>('07_transaksi_multi_paste.json');

describe('PasteLedger', () => {
  it('IMP-05 A → B (rich) → C diketik; konversi B hanya mengganti rentang B; A dan C utuh; undo/redo satu unit [fx:07_transaksi_multi_paste.json]', () => {
    const L = new PasteLedger();
    // A: tempel teks biasa
    const a = L.pasteAtCursor({ start: 0, end: 0 }, { plain: F.before }); expect(a.ok).toBe(true);
    // B: rich fragment sebagai pesan baru (plain disisipkan, html disimpan)
    const b = L.appendAsMessage({ plain: F.clipboard_plain, html: F.clipboard_html }); if (!b.ok) throw new Error();
    // C: pengguna mengetik setelahnya
    L.edit(L.text.length, L.text.length, '\n\n' + F.typed_after);
    const s3 = L.text;
    expect(s3).toBe(`${F.before}\n\n${F.clipboard_plain}\n\n${F.typed_after}`);
    const fragB = L.fragment(b.fragment.id)!;
    expect(L.text.slice(fragB.start, fragB.end)).toBe(F.clipboard_plain);
    expect(fragB.status).toBe('live');
    const c = L.convertFragment(fragB.id); if (!c.ok) throw new Error(c.message);
    expect(L.text.startsWith(F.before + '\n\n')).toBe(true);
    expect(L.text.endsWith('\n\n' + F.typed_after)).toBe(true);
    expect(L.text).toBe(`${F.before}\n\n## Bagian B\n\nNilai: **-5**\n\n${F.typed_after}`);
    expect(c.before).toBe(F.clipboard_plain); expect(c.after).toBe('## Bagian B\n\nNilai: **-5**');
    // undo → tepat sebelum konversi; redo → setelah konversi
    const u = L.undo(); expect(u.ok && u.kind).toBe('convert-fragment'); expect(L.text).toBe(s3);
    expect(L.fragment(fragB.id)!.converted).toBe(false);
    const rd = L.redo(); expect(rd.ok).toBe(true); expect(L.text).toContain('## Bagian B');
    // undo bertahap: konversi, ketikan C, B, A
    L.undo(); L.undo(); expect(L.text).toBe(`${F.before}\n\n${F.clipboard_plain}`);
    L.undo(); expect(L.text).toBe(F.before); L.undo(); expect(L.text).toBe('');
    expect(L.undo().ok).toBe(false);
  });
  it('IMP-05 rebase saat mengetik di tempat lain; fragmen yang diedit menjadi usang dan konversi ditolak', () => {
    const L = new PasteLedger('awal ');
    const p = L.pasteAtCursor({ start: 5, end: 5 }, { plain: 'B plain', html: '<b>B</b>' }); if (!p.ok) throw new Error();
    L.edit(0, 0, 'XYZ '); // sebelum fragmen → geser
    let f = L.fragment(p.fragment.id)!; expect(L.text.slice(f.start, f.end)).toBe('B plain'); expect(f.status).toBe('live');
    L.edit(L.text.length, L.text.length, ' akhir'); // tepat di akhir fragmen → tidak mengubah fragmen
    f = L.fragment(p.fragment.id)!; expect(f.status).toBe('live');
    L.edit(f.start + 1, f.start + 2, '!'); // di dalam fragmen → usang
    expect(L.fragment(p.fragment.id)!.status).toBe('stale');
    const c = L.convertFragment(p.fragment.id); expect(c.ok).toBe(false); if (!c.ok) expect(c.code).toBe('FRAGMENT_STALE');
    L.undo(); expect(L.fragment(p.fragment.id)!.status).toBe('live');
  });
  it('UX-03 tiga operasi berbeda: sisip di kursor (ganti seleksi), tambah sebagai pesan, ganti seluruh sumber hanya dengan konfirmasi', () => {
    const L = new PasteLedger('Halo dunia');
    const ins = L.pasteAtCursor({ start: 5, end: 10 }, { plain: 'semua' }); if (!ins.ok) throw new Error();
    expect(L.text).toBe('Halo semua'); expect(ins.fragment).toMatchObject({ selectionStart: 5, selectionEnd: 10, mode: 'insert' });
    L.appendAsMessage({ plain: 'Pesan 2' }); expect(L.text).toBe('Halo semua\n\nPesan 2');
    const no = L.replaceAll({ plain: 'baru' }, { confirmed: false }); expect(no.ok).toBe(false); expect(L.text).toBe('Halo semua\n\nPesan 2');
    const yes = L.replaceAll({ plain: 'baru' }, { confirmed: true }); expect(yes.ok).toBe(true); expect(L.text).toBe('baru');
    expect(L.fragments.filter((f) => f.status === 'removed').length).toBe(2);
    L.undo(); expect(L.text).toBe('Halo semua\n\nPesan 2');
    expect(L.pasteAtCursor({ start: 3, end: 1 }, { plain: 'x' }).ok).toBe(false);
  });
  it('syncFromText dari textarea = satu transaksi edit; paste di tengah blok kode tidak mengubah sekitarnya', () => {
    const src = '```\ncode A\n```\n';
    const L = new PasteLedger(src);
    const at = src.indexOf('A');
    L.pasteAtCursor({ start: at, end: at }, { plain: 'B ', html: '<i>B</i>' });
    expect(L.text).toBe('```\ncode B A\n```\n');
    L.syncFromText(L.text.replace('code', 'kode'));
    expect(L.history().map((h) => h.kind)).toEqual(['paste-insert', 'edit']);
    L.undo(); expect(L.text).toBe('```\ncode B A\n```\n');
  });
});

describe('IMP-03', () => {
  it('IMP-03 teks biasa (spasi, paragraf, kutipan, emoji, rupiah, URL) dipertahankan byte-demi-byte', () => {
    const plain = '  Indentasi   ganda\n\n> kutipan "tanda" — \'x\'\n\nEmoji 🙂👍🏽 é; Rp1.250.000,50; https://example.invalid/a?b=1&c=%20#x\t\ttab  \n';
    const L = new PasteLedger('awal\n');
    L.pasteAtCursor({ start: 5, end: 5 }, { plain });
    expect(L.text).toBe('awal\n' + plain);
    expect(new TextEncoder().encode(L.text.slice(5))).toEqual(new TextEncoder().encode(plain));
  });
});
