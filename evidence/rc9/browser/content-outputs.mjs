// Export representative project, transcript and diagram fixtures through the end-user production controls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,writeFile,mkdir,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {launch} from '../../../tests/e2e/lib.mjs';
import {candidateSha256,distTreeSha256} from '../../../scripts/fingerprint.mjs';
const out=process.env.PF_EVIDENCE_DIR||'evidence/rc9/browser/results';
const examples=process.env.PF_CONTENT_DIR||'examples/rc9/content';
const digest=x=>createHash('sha256').update(x).digest('hex');
await mkdir(examples,{recursive:true});await mkdir(out,{recursive:true});
const cases=[
  {name:'wrapper-rumus',file:'evidence/rc9/browser/mixed-formula.html',tpl:'EDU-01',sentinel:'ARGUMEN-SESUDAH-017'},
  {name:'aset-lokal',file:'examples/rc7/ASSET-MANDIRI.pfproj',tpl:'BUS-01',sentinel:'Lihat penjelasan'},
  {name:'percakapan',file:'fixtures/korpus/06_percakapan_empat_pesan.txt',tpl:'CON-01',sentinel:'SENTINEL_PESAN_4'},
  {name:'diagram',file:'evidence/rc9/browser/diagram.md',tpl:'EDU-01',sentinel:'Penanda akhir diagram 017.'},
];
const identity=()=>({source:candidateSha256(),dist:distTreeSha256()});
const report={before:identity(),cases:[],dateUTC:new Date().toISOString(),method:'Production UI · published download · isolated file opened with Chromium offline · source fixture and artifact independently hashed.'};
const env=await launch({dir:'dist',port:4388});report.engine=await env.browser.version();
for(const c of cases){
  const dir=await mkdtemp(join(tmpdir(),'pf-content-'));const ctx=await env.browser.createBrowserContext({downloadBehavior:{policy:'allow',downloadPath:dir}});
  const rec={id:c.name,fixture:c.file,fixtureSha256:digest(await readFile(c.file)),template:c.tpl};report.cases.push(rec);
  let p,stage='launch';
  try {
    p=await ctx.newPage();p.setDefaultTimeout(90000);await p.setViewport({width:1450,height:960});await p.goto(env.base+'/#/workspace');await p.waitForFunction(()=>!document.querySelector('#view-workspace')?.hidden && /rev \d+/.test(document.querySelector('#src-hash')?.textContent||''),{timeout:90000});stage='import';
    if (c.name==='percakapan'){
      await ctx.overridePermissions(env.base,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
      await p.evaluate(s=>navigator.clipboard.writeText(s),await readFile(c.file,'utf8'));
      await p.click('#empty-state [data-action=paste-conv]');await p.waitForSelector('#dlg-paste[open]');await p.click('#paste-area');
      await p.keyboard.down('Control');await p.keyboard.press('v');await p.keyboard.up('Control');await p.click('#paste-ok');
      await p.waitForFunction(()=>document.querySelectorAll('#conv-panel .msg').length===4);
      assert.equal(await p.$$eval('#conv-panel .msg input[type=checkbox]',els=>els.filter(e=>e.checked).length),4);
      await p.select('#conv-mode','transcript');
      const build=await p.evaluateHandle(()=>[...document.querySelectorAll('#conv-panel button')].find(b=>/Build document|Buat dokumen/i.test(b.textContent)));
      await build.asElement().click();if(await p.$('#dlg-confirm[open]'))await p.click('#dlg-confirm button[value=ok]');
    }else {
      await (await p.$('#file-open')).uploadFile(resolve(c.file));
      if(c.name==='wrapper-rumus'){
        await p.waitForSelector('#dlg-diff[open]');await p.click('#dlg-diff button[value=apply]');
        await p.waitForFunction(()=>document.querySelector('#editor').value.includes('ARGUMEN-SESUDAH-017'));
        await p.click('#src-menu-btn');await p.click('[data-action=view-raw]');
        await p.waitForSelector('#dlg-raw[open]');const raw=await p.$eval('#raw-view',el=>el.textContent);
        rec.rawOriginalSha256=digest(raw);assert.equal(rec.rawOriginalSha256,rec.fixtureSha256);await p.keyboard.press('Escape');
      }
    }
    stage='source-preview';await p.waitForFunction(s=>document.querySelector('#live-frame')?.contentDocument?.body?.textContent.includes(s),{timeout:60000},c.sentinel);
    stage='template';await p.click('[data-tpl="'+c.tpl+'"]');await p.waitForFunction(t=>document.querySelector('#live-frame')?.contentDocument?.querySelector('[data-template]')?.dataset.template===t,{},c.tpl);
    stage='publish';await p.click('[data-action=publish]');await p.waitForSelector('#dlg-publish[open]');await p.click('input[value="html-standalone"]');
    if(await p.$('#pub-ack'))await p.click('#pub-ack');await p.click('#pub-go');await p.waitForSelector('#publish-result:not([hidden])');
    if(await p.$('#pub-review-ack')){
      rec.requiresReview=true;
      rec.review=await p.$eval('#publish-result h3',n=>n.textContent);
      await p.click('#pub-review-ack');await p.click('#publish-result .btn-primary');
    }
    await p.waitForSelector('#publish-result.banner-ok',{timeout:25000});const receipt=await p.$eval('#publish-result',e=>e.innerText);
    let filename;
    for(let i=0;i<80;i++){filename=(await readdir(dir)).find(f=>f.endsWith('.html'));if(filename)break;await delay(150);}
    assert.ok(filename);const bytes=await readFile(join(dir,filename));rec.sha256=digest(bytes);rec.bytes=bytes.length;assert.ok(receipt.includes(rec.sha256));
    rec.file=join(examples,c.name+'.html');await writeFile(rec.file,bytes);
    stage='offline';const offline=await env.browser.createBrowserContext();
    try{
      const q=await offline.newPage();await q.setOfflineMode(true);const external=[];q.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});
      await q.goto(pathToFileURL(resolve(rec.file)).href);const r=await q.evaluate(async kind=>{
        const article=document.querySelector('article');
        await Promise.all([...document.fonts].map(f=>f.load()));
        const base={externalScripts:document.scripts.length,online:navigator.onLine};
        if(kind==='wrapper-rumus'){
          const clone=article.cloneNode(true);clone.querySelectorAll('nav,[data-pf-generated],.pf-math').forEach(e=>e.remove());
          return {...base,independentCount:clone.textContent.split('KEEP-INDEPENDENT-CONTENT').length-1,
            trailingCount:clone.textContent.split('ARGUMEN-SESUDAH-017').length-1,
            formula:[...article.querySelectorAll('.pf-math')].map(n=>({canonical:n.dataset.tex,annotation:n.querySelector('annotation')?.textContent,visual:!!n.querySelector('.katex-html')}))};
        }
        if(kind==='aset-lokal'){
          const images=[];
          for(const i of document.images){await i.decode();images.push({alt:i.alt,title:i.title,size:[i.naturalWidth,i.naturalHeight],type:i.src.slice(0,22)});}
          return {...base,images,tex:article.querySelector('.pf-math')?.dataset.tex,link:[...article.querySelectorAll('a')].filter(a=>a.textContent==='Lihat penjelasan').map(a=>({href:a.getAttribute('href'),title:a.title}))};
        }
        if(kind==='diagram'){
          const fig=[...article.querySelectorAll('figure[data-pf-mermaid]')];
          return {...base,count:fig.length,successful:fig.filter(f=>f.querySelector('svg')).length,
            labels:fig[0]?.textContent.replace(/\s+/g,' '),fallback:fig[1]?.querySelector('pre')?.textContent,diagramCssVisible:fig[0]?.querySelector('svg')?.getBoundingClientRect().height>0,
            dangerous:[...article.querySelectorAll('svg *')].filter(el=>el.tagName.toLowerCase()==='script'||[...el.attributes].some(a=>/^on/i.test(a.name))).length};
        }
        return {...base,roles:[...article.querySelectorAll('section[data-role]')].map(el=>el.dataset.role),
          messages:[...article.querySelectorAll('section[data-role]')].map(el=>el.textContent),code:article.querySelector('pre code')?.textContent, full:article.textContent};
      },c.name);
      assert.deepEqual(external,[]);assert.equal(r.online,false);assert.equal(r.externalScripts,0);rec.offline=r;
      if(c.name==='wrapper-rumus'){
        assert.equal(r.independentCount,1);assert.equal(r.trailingCount,1);
        assert.deepEqual(r.formula,[{canonical:'x+1',annotation:'x+1',visual:true}]);
      }else if(c.name==='aset-lokal'){
        assert.deepEqual(r.images.map(i=>i.size),[[3,2],[32,32]]);
        assert.deepEqual(r.images.map(i=>i.alt),['Kotak warna tiga kali dua','Grafik proyek']);
        assert.ok(r.images.every(i=>i.type==='data:image/png;base64,'));assert.equal(r.link.length,1);assert.ok(r.tex?.includes('frac'));
      }else if(c.name==='diagram'){
        assert.equal(r.count,2);assert.equal(r.successful,1);assert.ok(r.diagramCssVisible);
        assert.ok(['Mulai','Periksa','Selesai'].every(s=>r.labels.includes(s)));assert.equal(r.fallback.trim(),'flowchart?\n    TIDAK-VALID-017');assert.equal(r.dangerous,0);
      }else{
        assert.deepEqual(r.roles,['user','assistant','user','assistant']);
        const expected=['Jelaskan contoh persamaan sederhana.','Jika x + 2 = 5, maka x = 3.','Sertakan contoh teks program','SENTINEL_PESAN_4'];
        assert.ok(expected.every((s,i)=>r.messages[i].includes(s)));assert.ok(r.code?.includes('Assistant: ini hanya isi kode.\nUser: ini juga isi kode.'));
        delete r.full;
      }
      rec.status='PASS';await q.close();
    }finally{await offline.close();}
  }catch(e){rec.status='FAIL';rec.stage=stage;rec.message=e.message;rec.ui=p?await p.$$eval('#publish-result,#render-state,#notices',els=>els.map(el=>el.innerText.slice(0,1600))).catch(()=>[]):[];}
  finally{await ctx.close();await rm(dir,{recursive:true,force:true});}
}
await env.close();report.after=identity();report.sameBytes=JSON.stringify(report.before)===JSON.stringify(report.after);
report.status=report.sameBytes && report.cases.every(x=>x.status==='PASS')?'PASS':'FAIL';
await writeFile(join(out,'content-outputs.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.cases.map(c=>[c.id,c.status,c.message])));if(report.status==='FAIL')process.exitCode=1;
