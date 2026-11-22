import { checkTrig,checkPlain,checkPrinted,referenceProjection } from './oracle.js';
// Isolated QA page outside the production dist. Measurements use the production UI.
const el = selector => document.querySelector(selector);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const clock = () => performance.now();
const hash = async source => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))].map(x => x.toString(16).padStart(2,'0')).join('');
async function until(fn, stage, limit = 90000) {
  const start = clock();
  while (clock() - start < limit) {
    const value = fn(); if (value) return value;
    await wait(12);
  }
  throw Error('Timeout: '+stage);
}
const manifest=await (await fetch('./manifest.json')).json();
const trig = await (await fetch('./trig.txt')).text(), long=await (await fetch('./long.txt')).text();
const small = '# Aljabar\n\nNilai $x+1$ bila $x=2$.\n\n| Rumus | Nilai |\n|---|---|\n| $x+1$ | 3 |';
const reference=await referenceProjection(await (await fetch('./accepted.html')).text(),(await (await fetch('./expected.json')).json()).formulas);
async function refresh(doc, text, math) {
  const editor = doc.querySelector('#editor');
  const key = (await hash(text)).slice(0,10);
  const start = clock();
  editor.value = text; editor.dispatchEvent(new Event('input', { bubbles:true }));
  await until(() => doc.querySelector('#src-hash')?.textContent.includes(key), 'source revision '+key);
  await until(() => {
    const preview = doc.querySelector('#live-frame')?.contentDocument;
    return preview?.querySelector('.pf-doc') && preview.querySelectorAll('.pf-math[data-tex]').length === math &&
      (text.includes('Revisi uji') ? preview.body.textContent.includes(text.split('\n').at(-1)) : true) &&
      (text === long ? preview.body.textContent.includes('END_SECTION_0024') : true);
  }, 'rendered preview');
  const preview = doc.querySelector('#live-frame').contentDocument;
  await preview.fonts.ready;
  return clock()-start;
}
async function exported(doc, expectedMath) {
  const click = selector => { const n = doc.querySelector(selector); if (!n || n.disabled) throw Error('Unavailable control '+selector); n.click(); };
  click('.ws-actions [data-action=publish]'); click('input[value=html-standalone]');
  if (doc.querySelector('#pub-ack')) click('#pub-ack');
  let blob;
  function seeDownload(event) {
    const a = event.target.closest?.('a[download]');
    if (a?.href?.startsWith('blob:')) { event.preventDefault(); blob = fetch(a.href).then(res => res.blob()); }
  }
  doc.addEventListener('click', seeDownload, true);
  const start = clock();
  try {
    click('#pub-go');
    await until(() => {
      const result = doc.querySelector('#publish-result');
      if (result.hidden) return false;
      const ack = result.querySelector('#pub-review-ack');
      if (ack && !ack.checked) { ack.click(); result.querySelector('button.btn-primary').click(); }
      if (/banner-error|banner-err/.test(result.className)) throw Error('Export failed: '+result.textContent.slice(0,180));
      return blob && /SHA-256/.test(result.textContent);
    }, 'HTML export verdict');
    const ms = clock()-start;
    const file = await blob;
    const html = await file.text();
    const output = new DOMParser().parseFromString(html,'text/html');
    const css = output.querySelector('style[data-pf="s0"]')?.textContent ?? '';
    if (output.querySelectorAll('.pf-math[data-tex]').length !== expectedMath || !css.includes('.katex .vlist') ||
        !output.querySelector('style[data-pf="fonts"]')?.textContent.includes('data:font/woff2;base64,')) throw Error('Export CSS/font/math incomplete');
    return { ms, bytes:file.size, projection:await checkTrig(output,reference,true) };
  } finally {
    doc.removeEventListener('click', seeDownload, true);
    doc.querySelector('#dlg-publish')?.close();
  }
}
async function sample(label, task, round) {
  const frame = document.createElement('iframe');
  frame.width='1366'; frame.height='900';
  frame.title='PaperForma '+label;
  const start = clock();
  frame.src = './'+label+'.html#/workspace';
  el('#frame').replaceChildren(frame);
  const item = { label, task, round, times: {}, observations: {} };
  let projection;
  try {
    await until(() => frame.contentDocument?.querySelector('#src-hash')?.textContent.match(/rev\s*0/i), 'empty editor');
    let doc = frame.contentDocument;
    if (doc.querySelector('meta[name=pf-version]')?.content !== manifest[label].version) throw Error('Version mismatch');
    if (doc.querySelector('#editor').value || !doc.querySelector('[data-tpl="BUS-01"][aria-checked="true"]')) throw Error('Fresh default BUS-01 project required');
    await until(() => doc.querySelector('#live-frame')?.contentDocument?.querySelector('.pf-doc'), 'blank preview frame');
    await doc.querySelector('#live-frame').contentDocument.fonts.ready;
    item.times.emptyReadyMs = clock()-start;
    if (task === 'small') {
      item.times.smallPreviewMs = await refresh(doc, small, 3);
      const first=await checkPlain(doc.querySelector('#live-frame').contentDocument,small,true);
      item.times.editPreviewMs = await refresh(doc, small+'\n\nRevisi uji A.', 3);
      projection=[first,await checkPlain(doc.querySelector('#live-frame').contentDocument,small+'\n\nRevisi uji A.',true)];
    } else {
      const input = task === 'trig' ? trig : long;
      item.times.previewMs = await refresh(doc,input,task === 'trig' ? 231 : 0);
      projection=task==='trig' ? await checkTrig(doc.querySelector('#live-frame').contentDocument,reference,false) : await checkPlain(doc.querySelector('#live-frame').contentDocument,long,false);
      if (task === 'trig') {
        const html = await exported(doc,231); item.times.htmlExportMs = html.ms; item.observations.htmlBytes=html.bytes; projection={preview:projection,html:html.projection};
      }
      if (task === 'trig') {
        let printed; frame.contentWindow.addEventListener('message',e=>{if(e.origin===location.origin && e.data?.type==='pf-print-result')printed=e.data.result;});
        const begin = clock(); doc.querySelector('#t-pages').click();
        try {
          const result = await until(() => {
            const text=doc.querySelector('#render-state').textContent;
            if (/gagal|failed/i.test(text)) throw Error(text);
            return /[0-9]+ (halaman|pages).+[0-9]+ (lintasan|passes)/i.test(text) && text;
          },'pagination',60000);
          item.times.pageReadyMs = clock()-begin; item.observations.pagination=result;
          if (printed?.verification?.status!=='pass') throw Error('Missing verified print response');
          projection.print=await checkPrinted(printed.flattenedHtml,reference);item.observations.pages=printed.pageCount;
        } catch(e) { throw Error('Pagination: '+e.message); }
      }
    }
    item.inputSha256=await hash(task==='trig'?trig:task==='long'?long:small);
    if(task==='small')item.editedInputSha256=await hash(small+'\n\nRevisi uji A.');
    item.oracle={pass:true,digest:await hash(JSON.stringify(projection)),projection};
  } finally { frame.remove(); }
  return item;
}
export { sample };
