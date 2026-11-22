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
const mode = new URL(location.href).searchParams.get('mode') ?? 'calibrate';
const manifest = await (await fetch('./manifest.json', { cache:'no-store' })).json();
const trig = await (await fetch('./trig.txt')).text(), long = await (await fetch('./long.txt')).text();
const small = '# Aljabar\n\nNilai $x+1$ bila $x=2$.\n\n| Rumus | Nilai |\n|---|---|\n| $x+1$ | 3 |';
const out = { mode, started: new Date().toISOString(), version: manifest, browser: navigator.userAgent,
  method: 'Production UI in fixed 1366×900 attached same-origin iframe; warm browser HTTP cache after a warm-up, fresh app frame per arm, BUS-01 defaults. Synthetic editor input; time through rendered revision and loaded preview fonts. Export to UI completion with output Blob captured from the real download link; browser file save and disk I/O excluded. Heap reading is coarse shared renderer heap without forced GC. Trigonometry and 24-section long source are unchanged.', runs: [], status: 'RUNNING' };
const sourceHash = { small: await hash(small), trig: await hash(trig), long: await hash(long) };
function report() { el('#progress').textContent = out.status+' '+out.runs.length+' measurements'+(out.error ? ' / '+out.error : ''); }
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
    return { ms, bytes: file.size };
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
  try {
    await until(() => frame.contentDocument?.querySelector('#src-hash')?.textContent.match(/rev\s*0/i), 'empty editor');
    let doc = frame.contentDocument;
    if (doc.querySelector('meta[name=pf-version]')?.content !== manifest[label].version) throw Error('Version mismatch');
    if (doc.querySelector('#editor').value || !doc.querySelector('[data-tpl="BUS-01"][aria-checked="true"]')) throw Error('Fresh default BUS-01 project required');
    await until(() => doc.querySelector('#live-frame')?.contentDocument?.querySelector('.pf-doc'), 'blank preview frame');
    await doc.querySelector('#live-frame').contentDocument.fonts.ready;
    item.times.emptyReadyMs = clock()-start;
    if (task === 'memory') {
      const samples = [];
      for (let revision = 1; revision <= 8; revision++) {
        await refresh(doc, small+'\n\nRevisi uji '+revision+'.', 3);
        if ([1,4,8].includes(revision) && window.observeBenchmarkHeap) {
          samples.push({ revision, ...await window.observeBenchmarkHeap() });
        }
      }
      item.observations.repeatedEditHeap = samples;
    } else if (task === 'small') {
      item.times.smallPreviewMs = await refresh(doc, small, 3);
      item.times.editPreviewMs = await refresh(doc, small+'\n\nRevisi uji A.', 3);
    } else {
      const input = task === 'trig' ? trig : long;
      item.times.previewMs = await refresh(doc,input,task === 'trig' ? 231 : 0);
      if (task === 'trig') {
        const html = await exported(doc,231); item.times.htmlExportMs = html.ms; item.observations.htmlBytes=html.bytes;
      }
      if (task === 'trig' && manifest[label].printTreeMatches) {
        const begin = clock(); doc.querySelector('#t-pages').click();
        try {
          const result = await until(() => {
            const text=doc.querySelector('#render-state').textContent;
            if (/gagal|failed/i.test(text)) throw Error(text);
            return /[0-9]+ (halaman|pages).+[0-9]+ (lintasan|passes)/i.test(text) && text;
          },'pagination',60000);
          item.times.pageReadyMs = clock()-begin; item.observations.pagination=result;
        } catch(e) { item.observations.paginationError = String(e.message); }
      }
    }
    item.observations.heapUsedBytes = frame.contentWindow.performance.memory?.usedJSHeapSize ?? null;
  } finally { frame.remove(); }
  return item;
}
async function run() {
  el('#run').disabled=true; 
  try {
    const calibration=mode==='calibrate';
    const tasks = ['small','trig','long'];
    for (const task of tasks) {
      const n = mode==='pilot' ? 1 : calibration ? (task==='small' ? 5 : 2) : (task==='small' ? 20 : 5);
      for(let round=-1;round<n;round++){
        const order=calibration || mode==='pilot' ? ['rc6'] : round%2?['rc7','rc6']:['rc6','rc7'];
        for (const label of order) {
          el('#progress').textContent='Running '+task+' '+label+' '+round;
          out.runs.push(await sample(label,task,round)); report();
        }
      }
    }
    out.status='COMPLETE';
  } catch(e) { out.status='FAIL'; out.error=String(e.message); }
  out.sourceHash=sourceHash;
  out.ended=new Date().toISOString(); report();
  const exportBtn=el('#save'); exportBtn.disabled=false;
}
el('#run').addEventListener('click',run);
el('#save').addEventListener('click',() => {
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const link=document.createElement('a');link.download='rc7-browser-'+mode+'.json';link.href=URL.createObjectURL(blob);link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
});
report();

// Exposed only in this QA resource, outside either production tree.
export { sample };
