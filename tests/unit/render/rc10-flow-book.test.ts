// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {buildPrintPayload} from '../../../src/render/print-payload';
import {composeBook} from '../../../src/render/flow-book';
import {nodeFontSource, realDoc} from './helpers';

describe('RC9-F01 native long-document print', () => {
  it('preserves heading case, source, table, semantic links, cover and list resets including textless items', async () => {
    const raw = '# First heading\n\n### mIxEd Title MiXeD\n\n<ol reversed start="2048"><li></li><li>beta</li><li value="17"></li><li></li></ol>\n\n| CELL1 | CELL2 |\n|---|---|\n| VALUE1 | VALUE2 |\n\nFinal tAiL';
    const {snapshot,body} = await realDoc(raw,'BUS-01',{cover:true,toc:true,tocDepth:3,pageNumberStart:7});
    const payload = await buildPrintPayload(snapshot,body,{fontSource:nodeFontSource,renderMermaid:false});
    const document = new DOMParser().parseFromString(await composeBook(payload),'text/html');
    expect(snapshot.source).toBe(raw);
    expect(document.querySelectorAll('script,link[rel=stylesheet],img[src^=http]')).toHaveLength(0);
    expect(document.querySelector('meta[name=pf-project-source-sha256]')?.getAttribute('content')).toBe(snapshot.rawSourceHash);
    expect(document.querySelector('.pf-cover')).toBeTruthy();
    const links = Array.from(document.querySelectorAll('nav a'));
    expect(links.map(a=>a.textContent)).toEqual(['First heading','mIxEd Title MiXeD']);
    expect(links.every(a=>document.getElementById(a.getAttribute('href')!.slice(1))?.textContent === a.textContent)).toBe(true);
    expect(document.querySelector('nav [data-pf-book-marker]')).toBeNull();
    expect(Array.from(document.querySelectorAll('ol[reversed] > li'), li => [li.getAttribute('data-pf-book-marker'),li.textContent])).toEqual([['2048.',''],[null,'beta'],['17.',''],['16.','']]);
    expect(Array.from(document.querySelectorAll('td'),td=>td.textContent)).toEqual(['VALUE1','VALUE2']);
    expect(document.querySelector('article')?.textContent?.trim().endsWith('Final tAiL')).toBe(true);
    expect(document.head.textContent).toContain('counter-increment: page 6');
    expect(document.head.textContent).toContain('text-transform: none !important');
  });

  it('refuses an unsupported private glyph with the same blocking issue as paginated print', async () => {
    const {snapshot,body} = await realDoc('Missing glyph \ue001','EDU-01');
    const payload = await buildPrintPayload(snapshot,body,{fontSource:nodeFontSource,renderMermaid:false});
    await expect(composeBook(payload)).rejects.toMatchObject({code:'PRINT_BLOCKED',verdict:{block:[expect.objectContaining({code:'PDF_PRIVATE_GLYPH'})]}});
  });
});
