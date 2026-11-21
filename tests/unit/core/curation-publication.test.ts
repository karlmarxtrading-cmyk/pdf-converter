// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parsePlainConversation, parseClipboardConversation, curatedBlocks, composeConversation, publicationFor, verifyComposition } from '../../../src/core/conversation';
import { commitRevision, createProject, makeInputRecord, makePasteInputRecord, exportBundle, importBundle } from '../../../src/core/projects';
import { makeSnapshot } from '../../../src/core/hash';
import { renderBody } from '../../../src/core/render';
import { checkRenderIntegrity } from '../../../src/core/integrity';
import { prepareBody } from '../../../src/render/document';

const options = { template: 'CON-01' as const, assets: [], allowExternalImages: false };
const view = { mode: 'screen' as const, allowExternalImages: false, renderMermaid: false };

describe('F-02/F-03/F-10 canonical conversation publication', () => {
  it('honours editor content even for conflicting legacy messages', async () => {
    const c = parsePlainConversation('User: q\nAssistant: original -8', 'in').conversation;
    for (const source of ['# correction 5.08', '']) {
      const conversation = source ? c : { ...c, editable: true as const };
      const r = await renderBody(source, { ...options, conversation });
      expect(r.html).not.toContain('original');
      expect(r.html.includes('5.08')).toBe(Boolean(source));
      expect(checkRenderIntegrity(source, r, { conversation }).ok).toBe(true);
    }
  });
  it('rejects empty, duplicate, stale and unsupported references before composing', () => {
    const c = parsePlainConversation('Assistant: A[^x]\n\n[^x]: Note.\n\nB', 'in').conversation;
    c.outputMode = 'curated';
    const blocks = curatedBlocks(c.messages[0]!);
    const build = (ids: string[]) => composeConversation({ ...c, curatedBlockIds: ids });
    for (const ids of [[], ['stale'], [blocks[2]!.id, blocks[2]!.id], [blocks[0]!.id]]) {
      const res = build(ids); expect(verifyComposition(res, c).ok).toBe(false);
      expect(res.issues.some(i => i.blocking)).toBe(true);
    }
    const res = build([blocks[2]!.id, blocks[0]!.id, blocks[1]!.id]);
    expect(res.markdown).toBe('B\n\nA[^m1-x]\n\n[^m1-x]: Note.');
    expect(verifyComposition(res, c).ok).toBe(true);
    const ref = res.provenance.filter(p => p.kind === 'block').map(p => p.blockId);
    expect(ref).toEqual([blocks[2]!.id, blocks[0]!.id, blocks[1]!.id]);
  });
  it('commits and restores an edited composition with its original source-map offsets and block order', async () => {
    const raw = 'Assistant: Alpha -7.13\n\nBeta';
    const input = await makeInputRecord('paste-plain', raw);
    const parsed = parsePlainConversation(raw, input.id).conversation;
    const ids = curatedBlocks(parsed.messages[0]!).map(b => b.id).reverse();
    const conversation = { ...parsed, outputMode: 'curated' as const, editable: true as const, curatedBlockIds: ids };
    const p = commitRevision(createProject(), { inputs: [input], conversation }, 'import');
    const result = composeConversation(conversation);
    const pub = publicationFor(conversation, result);
    const composed = commitRevision(p, { source: result.markdown, conversation: { ...conversation, publication: pub } }, 'compose');
    const edited = commitRevision(composed, { source: result.markdown.replace('-7.13', '-7.31') }, 'edit');
    const loaded = await importBundle((await exportBundle(edited)).bytes);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw Error(loaded.code);
    expect(loaded.project.source).toBe('Beta\n\nAlpha -7.31');
    expect(loaded.project.inputs[0]!.rawPlain).toBe(raw);
    expect(loaded.project.conversation?.curatedBlockIds).toEqual(ids);
    expect(loaded.project.conversation?.publication).toEqual(pub);
  });
  it('scopes duplicate fragment names to the message that supplied each edited-document link', async () => {
    const c = parsePlainConversation('User:\n# Same\n\n[Jump](#same)\nAssistant:\n# Same\n\n[Jump](#same)', 'raw').conversation;
    const result = composeConversation(c);
    const conversation = { ...c, editable: true as const, publication: publicationFor(c, result) };
    const body = await renderBody(result.markdown, { ...options, conversation });
    const doc = document.createElement('div'); doc.innerHTML = body.html;
    const links = [...doc.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(links).toEqual(['#m1-h-same', '#m2-h-same']);
    expect(links.every(ref => doc.querySelector(ref!)?.textContent === 'Same')).toBe(true);
    expect(checkRenderIntegrity(result.markdown, body, { conversation }).ok).toBe(true);
  });
  it('serialises the original rich direct paste after later edits and backup/restore', async () => {
    const rawHtml = '<p>Capital <strong>-3.07</strong></p>';
    const input = makePasteInputRecord('Capital -3.07', rawHtml);
    const initial = commitRevision(createProject(), { source: input.rawPlain, inputs: [input] }, 'paste-at-cursor');
    const edited = commitRevision(initial, { source: 'Capital **-3.70**' }, 'edit');
    const restored = await importBundle((await exportBundle(edited)).bytes);
    if (!restored.ok) throw Error(restored.code);
    expect(restored.project.inputs[0]).toEqual(input); expect(restored.project.source).toBe('Capital **-3.70**');
  });
  it('retains a valid raw HTML origin for a converted block', () => {
    const html = '<div data-message-author-role="assistant"><p>A</p><p>B</p></div>';
    const c = parseClipboardConversation({ html, plain: 'A\nB' }, 'orig').conversation;
    const block = curatedBlocks(c.messages[0]!)[1]!;
    const res = composeConversation({ ...c, outputMode: 'curated', curatedBlockIds: [block.id] });
    expect(res.markdown).toBe('B'); expect(verifyComposition(res, c).ok).toBe(true);
    expect(html.slice(block.sourceRef.start, block.sourceRef.end)).toBe(html);
  });
  it('visible labels appear once and hidden roles remain semantic in both presentation layers', async () => {
    const c = parsePlainConversation('User: question\nAssistant: answer', 'in').conversation;
    for (const showRoles of [false, true]) {
      const cfg = { ...c, showRoles };
      const built = composeConversation(cfg);
      const doc = createProject({ source: built.markdown, template: 'CON-01' });
      doc.conversation = { ...cfg, editable: true, publication: publicationFor(cfg, built) };
      const snapshot = await makeSnapshot(doc);
      for (const legacy of [false, true]) {
        const conversation = legacy ? cfg : doc.conversation;
        const raw = await renderBody(legacy ? '' : snapshot.source, { ...options, conversation });
        const prepared = await prepareBody({ ...snapshot, conversation }, raw, view);
        const div = document.createElement('div'); div.innerHTML = prepared.html;
        expect(Array.from(div.querySelectorAll('.pf-msg')).map(s => s.getAttribute('data-role'))).toEqual(['user', 'assistant']);
        expect(div.querySelectorAll('.pf-msg-speaker')).toHaveLength(showRoles ? 2 : 0);
        expect(div.querySelectorAll('[data-speaker]')).toHaveLength(showRoles ? 2 : 0);
      }
    }
  });
});
