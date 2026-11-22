// Paired real Chromium / same production origin layout. From candidate root:
// CHROME_PATH=/path/to/chromium node tests/bench/rc7-browser-paired.mjs /path/to/RC6 calibrate|compare|repeat [small,trig,long,memory]
import puppeteer from 'puppeteer-core';
import { mkdtemp, mkdir, writeFile, cp, copyFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from '../../scripts/serve-dist.mjs';
import { findChromium } from '../../scripts/browser-path.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
const baseline = resolve(process.argv[2]);
const mode = process.argv[3];
if (!['calibrate','compare','repeat'].includes(mode)) throw Error('Invalid mode');
const tasks = process.argv[4]?.split(',') ?? ['small','trig','long','memory'];
const labels = mode === 'calibrate' ? ['rc6'] : ['rc6','rc7'];
const caps = { small: 20, trig: 5, long: 5, memory: 3 };
const temp = await mkdtemp(join(tmpdir(),'paperforma-perf-'));
const output = resolve('evidence/rc7-perf/headless-'+mode+'.json');
const out = { mode, at: new Date().toISOString(), status:'RUNNING', runs:[], node:process.version, versions:{},
  method:'Actual production files on an independent loopback origin per revision, production response headers for the app and print. Only the /perf QA page adds permission to read the Blob delivered by the app. Separate persistent contexts, one warmup and fresh studio iframe per turn. AB/BA order alternates. 12ms DOM polling. GC measurements outside timed sections for the memory cohort, including the harness and current live editor in that target; excludes native/other worker processes. Input events are synthetic. No QA hook is injected into the app, no cold network or native file write is timed.' };
const save = () => writeFile(output, JSON.stringify(out,null,2)+'\n');
let browser;
const pages = {}, servers = [];
try {
  await mkdir(resolve('evidence/rc7-perf'),{recursive:true});
  browser = await puppeteer.launch({ executablePath:findChromium(), headless:true, pipe:true, args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--lang=id-ID'] });
  out.browser = await browser.version();
  for (const label of labels) {
    const source = label==='rc6' ? baseline : process.cwd();
    const original = join(source,'dist'), root = join(temp, label), folder = join(root,'perf');
    // The input may be a symlink in a separate benchmark checkout. Copy its contents
    // into the temporary directory before adding the private QA page and headers.
    await cp(original,root,{recursive:true,dereference:true}); await mkdir(folder);
    const manifest=JSON.parse(await readFile(join(source,'dist.build-manifest.json')));
    out.versions[label]=manifest;
    await copyFile(join(original,'index.html'),join(folder,label+'.html'));
    // Keep the real application's effective headers when loading its index at an alternate path.
    // The QA controller reads the final Blob without opening a native save dialog.
    const qaHeader='/perf/index.html\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; frame-src \'self\'; connect-src \'self\' blob:; style-src \'self\' \'unsafe-inline\'; object-src \'none\'\n';
    await writeFile(join(root,'_headers'),(await readFile(join(root,'_headers'),'utf8'))+'\n'+qaHeader);
    await writeFile(join(folder,'manifest.json'),JSON.stringify({[label]:{version:manifest.version,printTreeMatches:true}}));
    await writeFile(join(folder,'long.txt'),generateStress(24)); await copyFile(resolve('fixtures/rc6/user-trigonometry.md'),join(folder,'trig.txt'));
    await copyFile(resolve('tests/bench/rc7-browser-page.js'),join(folder,'benchmark.js'));
    await writeFile(join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><title>PaperForma QA timing</title><button id="run">Run</button><button id="save">Save</button><div id="progress"></div><div id="frame"></div><script type="module" src="./benchmark.js"></script>');
    const server=await startServer(root,0); servers.push(server);
    const context=await browser.createBrowserContext(), page=await context.newPage();
    await page.setViewport({width:1440,height:1000});
    const session=await page.createCDPSession();
    await page.exposeFunction('observeBenchmarkHeap',async()=>{
      const pre=(await session.send('Runtime.getHeapUsage')).usedSize;
      await session.send('HeapProfiler.collectGarbage');
      return {preGcBytes:pre,afterGcBytes:(await session.send('Runtime.getHeapUsage')).usedSize};
    });
    await page.goto('http://127.0.0.1:'+server.address().port+'/perf/index.html',{waitUntil:'load'});
    pages[label]=page;
  }
  for(const task of tasks){
    if (!(task in caps)) throw Error('Unknown task '+task);
    const n=mode==='calibrate' ? (task==='small'?6:2) : caps[task];
    for(let round=-1;round<n;round++){
      for(const label of (round%2 ? labels.toReversed() : labels)){
        const page=pages[label];
        await page.bringToFront();
        const record=await page.evaluate(async ({label,task,round})=>(await import('./benchmark.js')).sample(label,task,round),{label,task,round});
        out.runs.push(record); await save();
      }
    }
    console.log(mode,task,'completed',n);
  }
  out.status=out.runs.some(row=>row.observations.paginationError)?'FAIL':'COMPLETE';
} catch(e) {out.status=browser?'FAIL':'BLOCKED';out.error=String(e.stack);console.error(out.error);}
finally {
  await browser?.close();
  for(const server of servers) await new Promise(resolve=>server.close(resolve));
  await rm(temp,{recursive:true,force:true}); await save();
}
if(out.status!=='COMPLETE')process.exitCode=1;
