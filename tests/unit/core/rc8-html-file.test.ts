import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { makeInputRecord, createProject, commitRevision, exportBundle, importBundle } from '../../../src/core/projects';
import { readFileSync } from 'node:fs';

describe('whole HTML file import', () => {
  const raw = readFileSync('fixtures/rc8/document-import/pelajaran.htm','utf8');
  it('keeps the original bytes and filename through a work bundle round trip', async () => {
    const input = await makeInputRecord('html-file',raw,{name:'pelajaran.htm'});
    const converted = htmlToMarkdown(raw,{wholeDocument:true});
    if (!converted.ok) throw Error(converted.message);
    const project=commitRevision(createProject(),{source:converted.markdown, inputs:[input]},'open-file');
    const bundle=await exportBundle(project);
    const restored=await importBundle(bundle.bytes);
    if (!restored.ok) throw Error(restored.message);
    expect(restored.project.inputs[0]).toEqual(input);
    expect(restored.project.inputs[0]?.rawPlain).toEqual(raw);
    expect(restored.project.source).toContain('Nilai awal tetap –7.');
    expect(restored.project.source).not.toContain('Metadata arsip');
  });
});
