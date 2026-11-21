// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyze } from '../../../src/engine/analyze';
import { assetPreflight } from '../../../src/core/preflight';
import { integrityExpectation } from '../../../src/core/integrity';
import type { AssetRecord } from '../../../src/core/contracts';
import { parsePlainConversation } from '../../../src/core/conversation';

const options = { template: 'BUS-01' as const, assets: [] as AssetRecord[], allowExternalImages: false, idPrefix: 'job-', sourcePath: 'work/main.md' };
const source = '# Chapter\n\nPrivate \uE001 and $x^2$.\n\n![first][ref] and ![missing](lost.png).\n\n[ref]: ../img/resolved.png\n\n<img src="https://example.invalid/ref.png" alt="external">\n';

describe('RC5 independent analysis tree', () => {
  it('matches the fresh integrity and asset oracles across edits and asset replacement', async () => {
    const asset = { id: 'a'.repeat(64), path: 'img/resolved.png', mime: 'image/png', bytes: new Uint8Array(), origin: 'upload' as const };
    for (const [version, assets] of [[source, [asset]], [source.replace('lost.png', 'replaced.png'), []]] as const) {
      const input = { ...options, assets: [...assets] };
      const result = await analyze({ source: version, options: input });
      expect(result.expected).toEqual(integrityExpectation(version, { idPrefix: input.idPrefix }));
      expect(result.assets).toEqual(assetPreflight({ source: version, sourcePath: input.sourcePath, assets: input.assets }));
      expect(result.assets.total).toBe(3);
      expect(result.assets.resolved.length).toBe(assets.length);
      expect(result.expected.pua).toEqual([['\uE001', 1]]);
    }
  });
  it('retains selection and per-message order for a structured source appendix', async () => {
    const raw = 'User: A\n\nAssistant: Response with ![selected](included.png)\n\nUser: ![excluded](skipped.png)';
    const conversation = parsePlainConversation(raw, 'input-1').conversation;
    conversation.outputMode = 'source-appendix';
    expect(conversation.messages.length).toBe(3);
    conversation.messages.forEach((m, i) => { m.selected = i === 1; });
    const result = await analyze({ source: '# Introduction', options: { ...options, conversation } });
    expect(result.expected).toEqual(integrityExpectation('# Introduction', { idPrefix: options.idPrefix, conversation }));
    expect(result.assets).toEqual(assetPreflight({ source: '# Introduction', assets: [], conversation }));
    expect(result.assets.missing.map(r => r.path)).toEqual(['included.png']);
  });
});
