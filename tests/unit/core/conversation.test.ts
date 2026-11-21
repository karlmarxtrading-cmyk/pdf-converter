// @vitest-environment jsdom
// Impor percakapan — PF-019/020, IMP-06…12
import { describe, expect, it } from 'vitest';
import { parsePlainConversation, parseClipboardConversation, suggestDuplicates, selectMessages, setOutputMode, setRole, splitMessage, mergeMessages, reorderSelected, composeConversation, verifyComposition, mergeDocuments, topLevelBlocks, importSummary } from '../../../src/core/conversation';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { utf16ToUtf8Offset } from '../../../src/core/offsets';
import { fx, dom } from './fx';

describe('Parser percakapan', () => {
  it('IMP-06 label di code fence & blockquote bukan batas pesan; empat pesan; isi contoh utuh [fx:06_percakapan_empat_pesan.txt]', () => {
    const raw = fx('06_percakapan_empat_pesan.txt');
    const { conversation: c } = parsePlainConversation(raw, 'in-6');
    expect(c.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(c.messages.map((m) => m.speakerLabel)).toEqual(['Pengguna', 'Asisten', 'Pengguna', 'Asisten']);
    const m4 = c.messages[3]!;
    expect(m4.markdown).toContain('Assistant: ini hanya isi kode.\nUser: ini juga isi kode.');
    expect(m4.markdown).toContain('> Assistant: contoh label di dalam kutipan.');
    expect(m4.markdown.endsWith('SENTINEL_PESAN_4')).toBe(true);
    for (const m of c.messages) {
      expect(raw.slice(m.sourceRef.end - m.markdown.length, m.sourceRef.end)).toBe(m.markdown);
      expect(m.sourceRef.unit).toBe('utf16'); expect(m.timestamp).toBeUndefined();
    }
    expect(c.messages[1]!.markdown).toBe('# Persamaan\n\nJika x + 2 = 5, maka x = 3.');
    expect(c.outputMode).toBe('selected-messages');
  });
  it('IMP-07 peran ID/EN, timestamp hanya bila literal, tanpa nama model rekaan', () => {
    const raw = 'You said:\nHalo\n\nChatGPT said:\nHai!\n\nUser (10:42):\nPertanyaan dua\n\n**Assistant:** Jawaban dua\n\nAnda: terima kasih\nSistem: catatan sistem';
    const { conversation: c } = parsePlainConversation(raw, 'in');
    expect(c.messages.map((m) => [m.role, m.speakerLabel, m.timestamp ?? null])).toEqual([
      ['user', 'You', null], ['assistant', 'ChatGPT', null], ['user', 'User', '10:42'], ['assistant', 'Assistant', null], ['user', 'Anda', null], ['system', 'Sistem', null],
    ]);
    expect(c.messages[3]!.markdown).toBe('Jawaban dua');
    expect(c.provider).toEqual({ name: 'ChatGPT', confidence: 'low', basis: 'label "ChatGPT" tertulis di teks yang ditempel' });
    expect(JSON.stringify(c)).not.toMatch(/gpt-4|gpt-5|claude-3|sonnet|opus/i);
  });
  it('IMP-08 ambigu: teks tanpa label, nama tak standar, UI chrome — semua dipertahankan & ditandai; peran/batas dapat diperbaiki', () => {
    const raw = 'Copy\nPotongan awal tanpa label.\n\nBudi:\nIni mungkin pembicara.\n\nUser: tanya\nAssistant: jawab\nRegenerate\nShare\n';
    const r = parsePlainConversation(raw, 'in');
    const c = r.conversation;
    expect(c.messages[0]).toMatchObject({ role: 'unknown', roleConfidence: 'unknown' });
    expect(c.messages[0]!.flags).toContain('unlabeled-prefix');
    expect(c.messages[0]!.markdown).toContain('Budi:\nIni mungkin pembicara.');
    expect(c.messages[0]!.flags).toContain('possible-ui-chrome');
    expect(c.messages[2]!.markdown).toBe('jawab\nRegenerate\nShare');
    expect(r.suggestions.map((s) => s.label)).toEqual(['Budi']);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['CONVERSATION_UNLABELED', 'UI_CHROME_SUSPECT', 'CONVERSATION_BOUNDARY_SUGGESTION']));
    // seluruh teks non-kosong tercakup
    const covered = c.messages.map((m) => m.markdown).join('\n');
    for (const w of raw.split(/\s+/).filter((x) => x && !/^(User:|Assistant:)$/.test(x))) expect(covered).toContain(w);
    // perbaikan manual: pisah di "Budi:" lalu set peran
    const off = c.messages[0]!.markdown.indexOf('Budi:');
    const sp = splitMessage(c, c.messages[0]!.id, off, 'other');
    const second = sp.conversation.messages[1]!;
    expect(second.markdown.startsWith('Budi:')).toBe(true);
    expect(raw.slice(second.sourceRef.start, second.sourceRef.end)).toBe(second.markdown);
    const sr = setRole(sp.conversation, second.id, 'user');
    expect(sr.conversation.messages[1]).toMatchObject({ role: 'user', roleConfidence: 'confirmed' });
    const mg = mergeMessages(sr.conversation, sr.conversation.messages[0]!.id, second.id);
    expect(mg.conversation.messages.length).toBe(c.messages.length);
    expect(mg.conversation.messages[0]!.flags).toContain('manual-merge');
    // tanpa label sama sekali → satu jawaban
    const one = parsePlainConversation('Hanya jawaban.\n\nParagraf dua.', 'in').conversation;
    expect(one.messages.length).toBe(1); expect(one.outputMode).toBe('answer'); expect(one.messages[0]!.role).toBe('unknown');
  });
  it('IMP-11 revisi & duplikasi: enam pesan; duplikat hanya SARAN; -5 dan 5 tidak tertukar; keep-both [fx:09_revisi_dan_duplikasi.txt]', async () => {
    const raw = fx('09_revisi_dan_duplikasi.txt');
    const { conversation: c } = parsePlainConversation(raw, 'in-9');
    expect(c.messages.length).toBe(6);
    const s = suggestDuplicates(c.messages);
    expect(s.find((x) => x.kind === 'exact-duplicate')).toMatchObject({ a: 'msg-2', b: 'msg-6', action: 'keep-both' });
    const rev = s.find((x) => x.kind === 'revision-candidate' && x.a === 'msg-2' && x.b === 'msg-4')!;
    expect(rev.differences).toEqual(expect.arrayContaining([expect.objectContaining({ a: 'pertama', b: 'kedua' })]));
    expect(rev.differences.some((d) => d.a === '-' && d.b === undefined) || rev.differences.some((d) => d.a === '-')).toBe(true);
    expect(c.messages.length).toBe(6);
    const comp = composeConversation(c, { mode: 'transcript' });
    expect(comp.markdown.match(/Nilai revisi pertama adalah -5\./g)!.length).toBe(2);
    expect(comp.markdown).toContain('Nilai revisi kedua adalah 5.');
    expect(verifyComposition(comp, c).ok).toBe(true);
    const r = await renderBody('', { assets: [], allowExternalImages: false, template: 'CON-01', conversation: setOutputMode(c, 'transcript').conversation });
    const t = dom(r.html).textContent!;
    expect(t.match(/-5\./g)!.length).toBe(2); expect(t).toContain('adalah 5.');
  });
  it('IMP-09 pilih pesan 2, 4, 6 → transkrip: hanya itu, urutan ditetapkan, label tertulis, provenance tersimpan [fx:09_revisi_dan_duplikasi.txt]', async () => {
    const { conversation: c0 } = parsePlainConversation(fx('09_revisi_dan_duplikasi.txt'), 'in-9');
    let c = selectMessages(c0, ['msg-2', 'msg-4', 'msg-6']).conversation;
    c = reorderSelected(c, ['msg-6', 'msg-2', 'msg-4']).conversation;
    c = setOutputMode(c, 'transcript').conversation;
    const r = await renderBody('', { assets: [], allowExternalImages: false, template: 'CON-01', conversation: c });
    const secs = Array.from(dom(r.html).querySelectorAll('section.pf-msg'));
    expect(secs.map((s) => s.getAttribute('data-message-id'))).toEqual(['msg-6', 'msg-2', 'msg-4']);
    expect(secs.map((s) => s.getAttribute('data-role'))).toEqual(['assistant', 'assistant', 'assistant']);
    expect(secs.map((s) => s.querySelector('.pf-msg-role')!.textContent)).toEqual(['Asisten', 'Asisten', 'Asisten']);
    expect(dom(r.html).textContent).not.toContain('Beri nilai contoh');
    expect(r.blocks.map((b) => b.messageId)).toEqual(['msg-6', 'msg-2', 'msg-4']);
    expect(r.blocks.every((b) => b.sourceRef!.inputId === 'in-9')).toBe(true);
    expect(checkRenderIntegrity('', r, { conversation: c }).ok).toBe(true);
    const comp = composeConversation(c);
    expect(comp.provenance.filter((p) => p.kind === 'message').map((p) => p.messageId)).toEqual(['msg-6', 'msg-2', 'msg-4']);
    const en = await renderBody('', { assets: [], allowExternalImages: false, template: 'CON-01', conversation: c, lang: 'en' } as never);
    expect(dom(en.html).querySelector('.pf-msg-role')!.textContent).toBe('Assistant');
  });
  it('IMP-10 dokumen terkurasi dari beberapa jawaban + atur ulang dua bagian: tanpa kalimat baru, peta blok → sumber dapat ditelusuri [fx:06_percakapan_empat_pesan.txt]', () => {
    const raw = fx('06_percakapan_empat_pesan.txt');
    const { conversation: c } = parsePlainConversation(raw, 'in-6');
    const b2 = topLevelBlocks(c.messages[1]!.markdown); const b4 = topLevelBlocks(c.messages[3]!.markdown);
    const res = composeConversation(c, { mode: 'curated', curated: [{ messageId: 'msg-4', blockIndex: 0 }, { messageId: 'msg-2', blockIndex: 1 }, { messageId: 'msg-2', blockIndex: 0 }] });
    expect(res.markdown).toBe(`${b4[0]!.text}\n\n${b2[1]!.text}\n\n${b2[0]!.text}`);
    const v = verifyComposition(res, c); expect(v.ok).toBe(true);
    for (const p of res.provenance.filter((x) => x.kind === 'block')) expect(raw.slice(p.sourceRef!.start, p.sourceRef!.end)).toBe(res.markdown.slice(p.outStart, p.outEnd));
    // perubahan diam-diam (kalimat baru / angka) terdeteksi
    const tampered = { ...res, markdown: res.markdown.replace('x = 3', 'x = -3') };
    expect(verifyComposition(tampered, c).ok).toBe(false);
    const added = { ...res, markdown: res.markdown + '\n\nKalimat penghubung baru.' };
    expect(verifyComposition(added, c).issues.map((i) => i.code)).toContain('COMPOSE_GAP');
  });
  it('IMP-12 gabung dokumen dengan heading & footnote id sama → namespace stabil; tautan menuju blok benar', async () => {
    const d = '# Bagian sama\n\nTeks[^1].\n\n[^1]: Catatan.\n';
    const m = mergeDocuments([{ id: 'doc1', markdown: d }, { id: 'doc2', markdown: d.replace('Catatan', 'Catatan lain') }]);
    expect(m.footnoteMap).toEqual([{ docId: 'doc1', from: '1', to: 'doc1-1' }, { docId: 'doc2', from: '1', to: 'doc2-1' }]);
    const r = await renderBody(m.markdown, { assets: [], allowExternalImages: false, template: 'EDU-01', parts: m.parts } as never);
    const b = dom(r.html);
    expect(r.toc.map((t) => t.id)).toEqual(['doc1-h-bagian-sama', 'doc2-h-bagian-sama']);
    const refs = Array.from(b.querySelectorAll('a[data-footnote-ref]'));
    expect(refs.map((a) => a.getAttribute('href'))).toEqual(['#fn-doc1-1', '#fn-doc2-1']);
    expect(b.querySelector('#fn-doc1-1')!.textContent).toContain('Catatan.');
    expect(b.querySelector('#fn-doc2-1')!.textContent).toContain('Catatan lain.');
    // percakapan: id per pesan ber-namespace
    const { conversation: c } = parsePlainConversation('User:\n# Sama\n\nA[^x]\n\n[^x]: satu\n\nAssistant:\n# Sama\n\nB[^x]\n\n[^x]: dua\n', 'in');
    const rc = await renderBody('', { assets: [], allowExternalImages: false, template: 'CON-01', conversation: setOutputMode(c, 'transcript').conversation });
    expect(rc.toc.map((t) => t.id)).toEqual(['m1-h-sama', 'm2-h-sama']);
    const fns = Array.from(dom(rc.html).querySelectorAll('li[data-fn-def]')).map((li) => [li.id, li.textContent!.trim().slice(0, 4)]);
    expect(fns).toEqual([['m1-fn-x', 'satu'], ['m2-fn-x', 'dua ']]);
    const comp = composeConversation(setOutputMode(c, 'transcript').conversation);
    expect(comp.markdown).toContain('[^m1-x]: satu'); expect(comp.markdown).toContain('[^m2-x]: dua');
    expect(verifyComposition(comp, c).ok).toBe(true);
  });
  it('mode source-appendix dan answer; ringkasan impor; jalur HTML data-message-author-role', async () => {
    const { conversation: c } = parsePlainConversation(fx('06_percakapan_empat_pesan.txt'), 'in-6');
    const app = composeConversation(c, { mode: 'source-appendix', mainSource: '# Naskah utama\n\nIsi.' });
    expect(app.markdown.startsWith('# Naskah utama\n\nIsi.\n\n## Lampiran: percakapan sumber')).toBe(true);
    expect(verifyComposition(app, c).ok).toBe(true);
    const ans = composeConversation(c, { mode: 'answer' });
    expect(ans.markdown).toBe(c.messages[1]!.markdown);
    const ra = await renderBody('# Naskah', { assets: [], allowExternalImages: false, template: 'CON-01', conversation: setOutputMode(c, 'source-appendix').conversation });
    expect(dom(ra.html).querySelectorAll('.pf-appendix section.pf-msg').length).toBe(4);
    expect(importSummary(c)).toMatchObject({ messages: 4, selected: 4, byRole: { user: 2, assistant: 2 } });
    const html = '<div data-message-author-role="user"><p>Tanya <b>ini</b></p></div><div data-message-author-role="assistant"><h2>Jawab</h2><p>x = -5</p></div>';
    const h = parseClipboardConversation({ plain: 'Tanya ini\nJawab\nx = -5', html }, 'in-h');
    expect(h.usedHtml).toBe(true);
    expect(h.conversation.messages.map((m) => [m.role, m.markdown])).toEqual([['user', 'Tanya **ini**'], ['assistant', '## Jawab\n\nx = -5']]);
    expect(html.slice(h.conversation.messages[0]!.sourceRef.start, h.conversation.messages[0]!.sourceRef.end)).toContain('Tanya <b>ini</b>');
  });
  it('offset UTF-16 sourceRef ↔ byte UTF-8 dengan emoji dan combining', () => {
    const raw = 'User: café 🙂 é\nAssistant: jawab 😀';
    const { conversation: c } = parsePlainConversation(raw, 'in');
    const m2 = c.messages[1]!;
    expect(raw.slice(m2.sourceRef.start, m2.sourceRef.end)).toBe('Assistant: jawab 😀');
    const enc = new TextEncoder().encode(raw);
    const b0 = utf16ToUtf8Offset(raw, m2.sourceRef.start), b1 = utf16ToUtf8Offset(raw, m2.sourceRef.end);
    expect(new TextDecoder().decode(enc.slice(b0, b1))).toBe('Assistant: jawab 😀');
    expect(m2.sourceRef.start).not.toBe(b0);
  });
});
