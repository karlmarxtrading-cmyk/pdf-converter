// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {fragmentPrintText} from '../../../src/render/paginate';
import {paginateInFrame} from '../../../src/render/print-client';
import type {PrintPayload} from '../../../src/render/print-types';

it.each([
  ['CJK', '漢字かなカナ中文'.repeat(12500)],
  ['identifier', 'a'.repeat(100000)],
  ['combining marks', 'e\u0301\u0327'.repeat(20000)],
  ['extended emoji', '👩🏽‍💻🇮🇩🤾‍♀️'.repeat(4500)],
  ['white-space grapheme', ('a'.repeat(2047)+' \u0301').repeat(9)],
])('splits %s at genuine grapheme boundaries in the same inline owner', (_case, text) => {
  const root = document.createElement('article');
  root.innerHTML='<p><em><a href="#target"></a></em><code></code><span class="pf-math"><math></math></span></p><pre></pre>';
  const owner = root.querySelector('a')!;
  owner.textContent=text;
  const literals=[...root.querySelectorAll('code,math,pre')];
  for (const el of literals) el.textContent=text;
  fragmentPrintText(root);
  const offsets=new Set(Array.from(new Intl.Segmenter().segment(text),s=>s.index));
  let offset=0;
  for(const span of owner.children){
    expect(span.getAttribute('data-pf-text-offset')).toBe(String(offset));
    expect(offsets.has(offset)).toBe(true);
    const value=span.textContent!;
    expect(value.length).toBeLessThan(2580);
    expect(text.slice(offset,offset+value.length)).toBe(value);
    offset+=value.length;
  }
  expect(owner.children.length).toBeGreaterThan(1);
  expect(owner.getAttribute('href')).toBe('#target');
  expect(owner.parentElement!.tagName).toBe('EM');
  expect(offset).toBe(text.length);
  for(const el of literals){expect(el.children).toHaveLength(0);expect(el.textContent).toBe(text);}
});

it('stops the job in its live child realm before releasing the frame',async()=>{
  const abort=new AbortController();
  const task=paginateInFrame({jobId:'job',page:{widthMm:210}} as PrintPayload,{signal:abort.signal});
  const frame=document.querySelector('iframe')!;
  const stop=vi.fn((event:Event)=>{
    expect(frame.isConnected).toBe(true);
    const detail=(event as CustomEvent).detail;
    expect(detail.jobId).toBe('job');
    const entry={phase:'abort'};
    detail.receive([entry]);
    entry.phase='changed by detached child';
  });
  frame.contentWindow!.addEventListener('pf-print-stop',stop);
  abort.abort();
  await expect(task).rejects.toMatchObject({failure:{code:'ABORTED'},events:[{phase:'abort'}]});
  expect(stop).toHaveBeenCalledOnce();expect(frame.isConnected).toBe(false);
});
