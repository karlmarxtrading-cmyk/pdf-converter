// Run from the candidate root: PF_CHROME=/path/to/chrome node tests/bench/performance-browser.mjs ../rc6 1
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cp,copyFile,writeFile,readFile,mkdtemp,mkdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { startServer } from '../../scripts/serve-dist.mjs';
import { findChromium } from '../../scripts/browser-path.mjs';
import { generateStress } from '../../scripts/generate-stress.mjs';
import { protocol,outputDir,bindings,environment,load,summarize,atomic } from '../../tests/bench/performance-binding.mjs';
const baseline=resolve(process.argv[2]),cohort=Number(process.argv[3]);
if(![1,2].includes(cohort))throw Error('Expected cohort 1 or 2');
const dir=await mkdtemp(join(tmpdir(),'paperforma-recovery-'));
const dest=join(outputDir,'recovery-cohort-'+cohort+'.json');
await mkdir(outputDir,{recursive:true});
const self=fileURLToPath(import.meta.url),thisHash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const procedure=fileURLToPath(new URL('./browser-recovery-protocol.json',import.meta.url)),recovery=JSON.parse(readFileSync(procedure));
const out={schema:1,runId:crypto.randomUUID(),pid:process.pid,revision:'fixed-block-lifecycle/1',cohort,before:bindings(baseline,process.cwd()),driverSha256:thisHash(self),procedureSha256:thisHash(procedure),environment:environment(),protocol,recovery,runs:[],incidents:[],status:'RUNNING'};
const urls={},servers=[];let browser,pages={};
function save(){atomic(dest,out);}
async function open(){
  browser=await puppeteer.launch({executablePath:findChromium(),headless:true,pipe:true,protocolTimeout:recovery.cdpTimeoutMs,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--lang=id-ID']});
  out.environment.browser=await browser.version();
  for(const label of ['rc6','candidate']){
    const context=await browser.createBrowserContext(),page=await context.newPage();
    page.on('error',e=>{out.incidents.push({event:'targetError',label,message:e.message,at:new Date().toISOString()});save();});
    page.on('pageerror',e=>{out.incidents.push({event:'pageError',label,message:e.message,at:new Date().toISOString()});save();});
    await page.setViewport({width:protocol.settings.viewport[0],height:protocol.settings.viewport[1]});await page.goto(urls[label],{timeout:recovery.cdpTimeoutMs});
    pages[label]=page;
  }
}
async function close(){if(browser){const proc=browser.process();let timer;try{await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(()=>{proc?.kill('SIGKILL');r();},4000);})]);}catch{proc?.kill('SIGKILL');}finally{clearTimeout(timer);browser=null;pages={};}}}
async function take(task,round,block,warmup){
  const order=(round+(cohort===2?1:0))%2?['candidate','rc6']:['rc6','candidate'];
  let failed=false;
  for(const label of order){
    const at=load();let row,stage='activate';
    try{const page=pages[label];if(!page)throw Error('Browser session unavailable');await page.bringToFront();stage='sample';
      row=await page.evaluate(async args=>(await import('./benchmark.js')).sample(...args),[label,task,round]);
    }catch(e){row={label,task,round,times:{},oracle:{pass:false},error:String(e.message),stage};failed=true;}
    out.runs.push({...row,timestamp:at.at,load:at.loadavg,block,warmup});save();
  }return !failed;
}
try{
  for(const label of ['rc6','candidate']){
    const source=label==='rc6'?baseline:process.cwd(), staged=join(dir,label), folder=join(staged,'perf');
    await cp(join(source,'dist'),staged,{recursive:true,dereference:true});await mkdir(folder);
    await copyFile(join(staged,'index.html'),join(folder,label+'.html'));
    await writeFile(join(folder,'manifest.json'),JSON.stringify({[label]:{version:out.before[label].version}}));
    await copyFile('tests/bench/performance-page.js',join(folder,'benchmark.js'));
    await copyFile('tests/bench/performance-oracle.mjs',join(folder,'oracle.js'));
    await copyFile('examples/reference-rc6/RUMUS TRIGONOMETRI 1.html',join(folder,'accepted.html'));
    await copyFile('fixtures/rc6/user-trigonometry.expected.json',join(folder,'expected.json'));
    await copyFile('fixtures/rc6/user-trigonometry.md',join(folder,'trig.txt'));
    await writeFile(join(folder,'long.txt'),generateStress(24));
    await writeFile(join(folder,'index.html'),'<!doctype html><meta charset="utf-8"><title>Performance controller</title><div id="frame"></div><script type="module" src="./benchmark.js"></script>');
    await writeFile(join(staged,'_headers'),await readFile(join(staged,'_headers'),'utf8')+"\n/perf/index.html\n  Content-Security-Policy: default-src 'self'; script-src 'self'; frame-src 'self'; connect-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'\n");
    const server=await startServer(staged,0);servers.push(server);
    urls[label]='http://127.0.0.1:'+server.address().port+'/perf/index.html';
  }
  for(const task of Object.keys(protocol.browserFlows)){
    for(let block=0;block<protocol.pairs/recovery.pairsPerBlock;block++){
      await close();
      let warm=-(1+block*100);
      try{await open();}catch(e){out.incidents.push({event:'launch',task,block,message:String(e),at:new Date().toISOString()});}
      let usable=await take(task,warm,block,true);
      for(let offset=0;offset<recovery.pairsPerBlock;offset++){
        const round=block*recovery.pairsPerBlock+offset;
        if(!usable){
          await close();
          try{await open();}catch(e){out.incidents.push({event:'reopen',task,round,message:String(e),at:new Date().toISOString()});}
          await take(task,--warm,block,true);
        }
        usable=await take(task,round,block,false);
      }
      console.log(task,'block',block+1,'of',protocol.pairs/recovery.pairsPerBlock);
    }
  }
  out.after=bindings(baseline,process.cwd());if(JSON.stringify(out.before)!==JSON.stringify(out.after)||out.driverSha256!==thisHash(self)||out.procedureSha256!==thisHash(procedure))throw Error('Measurement program, evidence binding, source or distribution changed');
  Object.assign(out,summarize(out,protocol.browserFlows));
}catch(e){out.status='FAIL';out.error=String(e.stack);console.error(out.error);}
finally{await close();for(const server of servers)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});save();}
if(out.status!=='PASS')process.exitCode=1;
