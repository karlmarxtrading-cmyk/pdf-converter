// @vitest-environment jsdom
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { htmlToMarkdown } from '../../../src/core/clipboard';
import { renderBody } from '../../../src/core/render';
import { parsePlainConversation, parseClipboardConversation } from '../../../src/core/conversation';
const result: {id:string;description:string}[] = [];
const options = {assets:[],template:'BUS-01' as const,allowExternalImages:false};
const markdown = (id:string) => readFileSync('fixtures/rc8/compat/'+id+'.md','utf8');
const body = async (source:string) => new DOMParser().parseFromString((await renderBody(source,options)).html,'text/html').body;
const tex = (root:Element) => [...root.querySelectorAll('.pf-math')].map(f=>({tex:f.querySelector('annotation')?.textContent?.trim(),display:f.classList.contains('pf-math-display')}));
afterAll(()=>{if(process.env.PF_COMPAT_RESULT) writeFileSync(process.env.PF_COMPAT_RESULT, JSON.stringify({date:new Date().toISOString(),method:'synthetic source and clipboard MIME pairs in jsdom; no provider session or native clipboard used',cases:result},null,2)+'\n');});

describe('RC8 synthetic compatibility corpus with literal expected structure and content',()=>{
  it('A/D Markdown, restored cells and footnote',async()=>{
    const dom=await body(markdown('authoring'));
    for(const [selector,value] of [['h1','Catatan pengajaran'],['h3','Kalkulus'],['strong','tebal'],['em','miring'],['del','coret'],['blockquote','Kutipan pertama.'],['ol > li > ul','Turunan'],['a[href="#catatan"]','catatan']]){
      expect(dom.querySelector(selector)?.textContent?.trim()).toBe(value);
    }
    expect(dom.querySelectorAll('input[type=checkbox]')).toHaveLength(2);
    expect(dom.querySelectorAll('hr')).toHaveLength(1);
    expect([...dom.querySelectorAll('tbody td')].map(c=>c.querySelector('.pf-math')?'[x_1]':c.textContent)).toEqual(['p|q','[x_1]','']);
    expect(tex(dom).map(f=>f.tex)).toEqual(['x^2','x_1','y^3']);
    result.push({id:'A/D',description:'GFM, footnote formula, hierarchy, lists, task items and empty/escaped table cells'});
  });
  it('B preserves inline/display modes and normalized equation source',async()=>{
    const dom=await body(markdown('formulas'));
    expect(tex(dom).map(f=>f.tex)).toEqual([String.raw`f(x)`,String.raw`\lim_{x\to0}x`,String.raw`\sum_{i=1}^n i`,String.raw`\int_0^1 x^2\,dx`,String.raw`\begin{aligned}a&=b+c\\ d&=e-f\end{aligned}`,String.raw`\begin{cases}1&x>0\\0&x\le0\end{cases}`,String.raw`\begin{pmatrix}a&b\\c&d\end{pmatrix}`,String.raw`\vec{v}`,String.raw`\sqrt{2}`,String.raw`\frac{a_1}{b^2}`,String.raw`\sin(\theta)`,String.raw`\text{hasil uji}`]);
    expect(tex(dom).map(f=>f.display)).toEqual([false,false,false,true,true,true,true,false,false,false,false,false]);
    result.push({id:'B',description:'12 equations checked with TeX annotation and mode, including aligned, matrix, cases, limit and integral'});
  });
  it('C keeps currency, URLs, paths, regular expressions and illustrative TeX code',async()=>{
    const dom=await body(markdown('literals'));
    expect(tex(dom)).toHaveLength(0);
    expect(dom.textContent).toContain('Harga $5 dan $10. Tagihan Rp100.000.');
    expect(dom.querySelector('a')?.getAttribute('href')).toBe('https://example.org/x?a=1');
    const code=[...dom.querySelectorAll('code')].map(n=>n.textContent);
    expect(code).toEqual([String.raw`C:\Materi\Aljabar`, String.raw`/^\d+\s?$/`, '  \\frac{a}{b}\n\n$contoh$', '\\begin{align}\na &= -5\n\\end{align}']);
    result.push({id:'C',description:'Currency, URLs, Windows path, regex, tex/latex fences, code indentation and blank line'});
  });
  it('D preserves safe HTML table cells, spans, exact code and caption',async()=>{
    const input='<table><caption>Contoh</caption><tbody><tr><th rowspan="2">A</th><td colspan="2"><pre><code>  x\n\n y</code></pre></td></tr><tr><td></td><td><span data-tex="x+1">x+1</span></td></tr></tbody></table>';
    const con=htmlToMarkdown(input);if(!con.ok) throw Error(con.message);
    const dom=await body(con.markdown);
    expect(dom.querySelector('caption')?.textContent).toBe('Contoh');
    expect(dom.querySelector('td[colspan="2"] pre code')?.textContent).toBe('  x\n\n y');
    expect(dom.querySelector('th[rowspan="2"]')?.textContent).toBe('A');
    expect(dom.querySelectorAll('td:empty')).toHaveLength(1);
    expect(tex(dom)).toEqual([{tex:'x+1',display:false}]);
    result.push({id:'D',description:'Clipboard safe table preserves rowspan, colspan, empty cell, exact pre/code spacing, caption, KaTeX source'});
  });
  it('E/F copy keeps unavailable assets, diagram source and original Unicode characters explicit',async()=>{
    const dom=await body(markdown('characters'));
    expect(dom.querySelector('p')?.textContent).toBe('Indonesia, café, é, αβγ, −17, 漢字, שלום, العربية, 🙂, , .');
    const source='![diagram hilang](missing.png)\n\n```mermaid\nflowchart TD\n  A-->B\n```\n\n```mermaid\nNOT VALID <>\n```';
    const r=await body(source);
    expect(r.querySelector('.pf-img-placeholder')?.getAttribute('data-alt')).toBe('diagram hilang');
    expect([...r.querySelectorAll('.pf-mermaid')].map(n=>n.textContent)).toEqual(['flowchart TD\n  A-->B','NOT VALID <>']);
    result.push({id:'E/F',description:'Unicode codepoints preserved in HTML text; unavailable asset retains alt and diagram source survives before export'});
  });
  it.each(['ChatGPT','Claude','Gemini','Copilot','DeepSeek','Grok','Perplexity','Qwen'])('A/G explicitly labeled transcript %s keeps speaker, order and selections',label=>{
    const source='User: Tentukan x.\n'+label+': x = −7.\nUser: Mengapa?';
    const {conversation:c}=parsePlainConversation(source,'corpus');
    expect(c.messages.map(m=>[m.role,m.speakerLabel,m.markdown,m.selected])).toEqual([['user','User','Tentukan x.',true],['assistant',label,'x = −7.',true],['user','User','Mengapa?',true]]);
    expect(c.messages.every(m=>source.slice(m.sourceRef.start,m.sourceRef.end).includes(m.markdown))).toBe(true);
    result.push({id:'A/G-'+label,description:'Synthetic transcript; literal label, exact text, selected order, source range'});
  });
  it('A/G structured clipboard MIME pair retains raw input ranges for all roles',()=>{
    const html='<div data-message-author-role="user"><p>Soal 1?</p></div><div data-message-author-role="assistant"><p>Jawab −7.</p></div>';
    const parsed=parseClipboardConversation({html,plain:'Soal 1?\nJawab −7.'},'fixture');
    expect(parsed.usedHtml).toBe(true);
    expect(parsed.conversation.messages.map(m=>[m.role,m.markdown])).toEqual([['user','Soal 1?'],['assistant','Jawab −7.']]);
    expect(parsed.conversation.messages.every(m=>html.slice(m.sourceRef.start,m.sourceRef.end).includes(m.markdown))).toBe(true);
    result.push({id:'A/G-MIME',description:'Synthetic paired plain and structured HTML, roles in source order and source offsets'});
  });
});
